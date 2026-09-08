'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { GameSession } = require('./game-session');
const { gamePageOrigin, captureStartupIdentity } = require('./setup');
const {
  normalizeState,
  normalizeNodes,
  normalizeMembers,
  normalizeNodeDetail,
} = require('./quantum-monitor');

function responseData(session, messages, request) {
  const response = session.response(messages, request);
  if (!response) {
    throw new Error(`Missing response for ${request.requestClass}.${request.requestMethod}`);
  }
  if (response.requestMethod === 'Error' || response.responseData?.__class__ === 'Error') {
    throw new Error(
      `${request.requestClass}.${request.requestMethod}: ${JSON.stringify(response.responseData)}`,
    );
  }
  return response.responseData;
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function parseArguments(argv) {
  const options = { worldName: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--world') {
      const value = String(argv[index + 1] || '').trim().toLowerCase();
      if (!value) throw new Error('Invalid world name: empty value');
      options.worldName = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--world=')) {
      const value = argument.slice('--world='.length).trim().toLowerCase();
      if (!value) throw new Error('Invalid world name: empty value');
      options.worldName = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.worldName && !/^[a-z]{2,4}\d{1,4}$/.test(options.worldName)) {
    throw new Error(`Invalid world name: ${options.worldName}`);
  }
  return options;
}

function validateWorldLoginUrl(loginUrl, worldName) {
  let parsed;
  try {
    parsed = new URL(String(loginUrl || ''));
  } catch {
    throw new Error(`WorldService did not return a valid login URL for ${worldName}`);
  }
  const expectedOrigin = `https://${worldName}.forgeofempires.com`;
  if (parsed.origin !== expectedOrigin || !parsed.pathname.startsWith('/game/login')) {
    throw new Error(`WorldService returned an unexpected login URL for ${worldName}`);
  }
  return parsed.toString();
}

async function requestWorldLoginUrl(config, worldName) {
  const session = await GameSession.connect(config);
  try {
    const worldsRequest = session.allocateRequest('WorldService', 'getWorlds', []);
    const worldsMessages = await session.send(worldsRequest);
    const worlds = responseData(session, worldsMessages, worldsRequest);
    const targetWorld = Array.isArray(worlds)
      ? worlds.find(world => String(world?.id || '').toLowerCase() === worldName)
      : null;
    if (!targetWorld || targetWorld.status === 'inactive') {
      throw new Error(`World ${worldName} is not active for the current game account`);
    }

    const switchRequest = session.allocateRequest(
      'WorldService',
      'switchWorld',
      [worldName],
    );
    const switchMessages = await session.send(switchRequest);
    const loginUrl = responseData(session, switchMessages, switchRequest);
    return validateWorldLoginUrl(loginUrl, worldName);
  } finally {
    await session.close({ reload: false });
  }
}

async function openWorldPage(browser, worldName, config = {}) {
  const gameOrigin = `https://${worldName}.forgeofempires.com`;
  const pages = await browser.pages();
  const existingPage = pages.find(page => gamePageOrigin(page.url()) === gameOrigin);
  if (existingPage) {
    return { page: existingPage, gameOrigin, created: false };
  }

  const page = await browser.newPage();
  try {
    const sourcePage = pages.find(candidate => gamePageOrigin(candidate.url()));
    if (!sourcePage) {
      throw new Error('No authenticated Forge of Empires world is open');
    }
    const sourceConfig = {
      ...config,
      gameOrigin: gamePageOrigin(sourcePage.url()),
    };
    const loginUrl = await requestWorldLoginUrl(sourceConfig, worldName);
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    if (gamePageOrigin(page.url()) !== gameOrigin) {
      throw new Error(
        `World ${worldName} did not open an authenticated game page (current URL: ${page.url()})`,
      );
    }
    return { page, gameOrigin, created: true };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

async function resolveCaptureConfig(config, options = {}) {
  const browser = await puppeteer.connect({
    browserURL: config.browserURL,
    defaultViewport: null,
  });
  try {
    if (options.worldName) {
      const target = await openWorldPage(browser, options.worldName, config);
      try {
        const identity = await captureStartupIdentity(target.page, target.gameOrigin, 120000);
        return {
          config: {
            ...config,
            gameOrigin: target.gameOrigin,
            firebase: {
              ...config.firebase,
              playerId: identity.playerId,
              worldName: identity.worldName,
              guildId: identity.guildId,
            },
          },
          createdPage: target.created,
        };
      } catch (error) {
        if (target.created) await target.page.close().catch(() => {});
        throw error;
      }
    }

    const pages = await browser.pages();
    const configuredOrigin = String(config.gameOrigin || '');
    const configuredPage = pages.find(page => gamePageOrigin(page.url()) === configuredOrigin);
    if (configuredPage) return { config, createdPage: false };

    const activePage = pages.filter(page => gamePageOrigin(page.url())).at(-1);
    if (!activePage) throw new Error('Не знайдено відкритої вкладки Forge of Empires');
    const activeOrigin = gamePageOrigin(activePage.url());
    const identity = await captureStartupIdentity(activePage, activeOrigin);
    console.log(
      `Активний світ відрізняється від config.json: використовую ${identity.worldName}, ` +
      `гільдія ${identity.guildId}, без зміни основного конфігу.`,
    );
    return {
      config: {
        ...config,
        gameOrigin: activeOrigin,
        firebase: {
          ...config.firebase,
          playerId: identity.playerId,
          worldName: identity.worldName,
          guildId: identity.guildId,
        },
      },
      createdPage: false,
    };
  } finally {
    await browser.disconnect().catch(() => {});
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configPath = path.join(__dirname, 'config.json');
  const storedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const resolved = await resolveCaptureConfig(storedConfig, options);
  const config = resolved.config;
  const resultsDir = path.join(__dirname, 'results');
  let session;

  try {
    session = await GameSession.connect(config);
    const stateRequest = session.allocateRequest('GuildRaidsService', 'getState', []);
    const overviewRequest = session.allocateRequest('GuildRaidsMapService', 'getOverview', []);
    const membersRequest = session.allocateRequest(
      'GuildRaidsService',
      'getMemberActivityOverview',
      [],
    );
    const initialMessages = await session.send([
      stateRequest,
      overviewRequest,
      membersRequest,
    ]);
    const state = responseData(session, initialMessages, stateRequest);
    const overview = responseData(session, initialMessages, overviewRequest);
    const memberActivity = responseData(session, initialMessages, membersRequest);

    const openNodeIds = (overview.nodes || [])
      .filter(node => node.state?.state === 'open')
      .map(node => node.id);
    const detailRequests = openNodeIds.map(nodeId => session.allocateRequest(
      'GuildRaidsMapService',
      'getNodeExtendedInfo',
      [nodeId],
    ));
    const detailMessages = detailRequests.length
      ? await session.send(detailRequests)
      : [];
    const nodeDetails = {};
    for (let index = 0; index < detailRequests.length; index += 1) {
      nodeDetails[openNodeIds[index]] = responseData(
        session,
        detailMessages,
        detailRequests[index],
      );
    }

    const now = new Date();
    const snapshot = {
      capturedAt: now.toISOString(),
      guildId: String(config.firebase?.guildId || ''),
      worldName: String(config.firebase?.worldName || ''),
      state,
      overview,
      nodeDetails,
      memberActivity,
    };
    await fs.mkdir(resultsDir, { recursive: true });
    const datedPath = path.join(
      resultsDir,
      `quantum-snapshot-${safeTimestamp(now)}.json`,
    );
    const currentPath = path.join(
      resultsDir,
      options.worldName
        ? `quantum-snapshot-${snapshot.worldName}-current.json`
        : 'quantum-snapshot-current.json',
    );
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    await fs.writeFile(datedPath, json, 'utf8');
    await fs.writeFile(currentPath, json, 'utf8');

    const guildKey = `${snapshot.worldName}_${snapshot.guildId}`;
    const cacheDir = path.join(__dirname, 'local-scan-cache');
    const localPath = path.join(cacheDir, `${guildKey}-quantum-current.json`);
    const normalizedDetails = Object.fromEntries(
      Object.entries(nodeDetails).map(([nodeId, detail]) => [
        nodeId,
        normalizeNodeDetail(detail, now.toISOString()),
      ]),
    );
    const normalizedSnapshot = {
      ...normalizeState(state, now.toISOString()),
      currentNode: String(overview.currentNode || ''),
      capturedAt: now.toISOString(),
      lastSuccessfulPollAt: now.toISOString(),
      nodes: normalizeNodes(overview),
      nodeDetails: normalizedDetails,
      members: normalizeMembers(memberActivity),
      membersCheckedAt: now.toISOString(),
      nextPollAt: now.getTime() + 10_000,
    };
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(localPath, `${JSON.stringify(normalizedSnapshot, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      datedPath,
      currentPath,
      localPath,
      currentNode: overview.currentNode || null,
      openNodeIds,
      members: Object.keys(normalizedSnapshot.members).length,
    }));
  } finally {
    if (session && resolved.createdPage) {
      await session.page.close().catch(() => {});
    }
    if (session) await session.close({ reload: false });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  validateWorldLoginUrl,
  requestWorldLoginUrl,
  openWorldPage,
  resolveCaptureConfig,
};
