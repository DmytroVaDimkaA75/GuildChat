'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer');
const {
  DEFAULT_BROWSER_URL,
  DEFAULT_GAME_ORIGIN,
  findGamePage,
  inspectSession,
  makeRequest,
  sendGameRequest,
  findGameResponse,
} = require('./index');

async function findCurrentEndpoint(page, gameOrigin) {
  return page.evaluate(origin => {
    const matches = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(value => {
        try {
          const url = new URL(value);
          return url.origin === origin && url.pathname === '/game/json';
        } catch (_error) {
          return false;
        }
      });
    return matches.at(-1) || null;
  }, gameOrigin);
}

async function main() {
  const outputPath = path.resolve(
    process.argv[2] || path.join(__dirname, 'results', 'quantum-map-current.json'),
  );
  const browserURL = process.env.FOE_BROWSER_URL || DEFAULT_BROWSER_URL;
  const gameOrigin = process.env.FOE_GAME_ORIGIN || DEFAULT_GAME_ORIGIN;
  const browser = await puppeteer.connect({ browserURL, defaultViewport: null });

  try {
    const page = await findGamePage(browser, gameOrigin);
    const endpoint = await findCurrentEndpoint(page, gameOrigin);
    if (!endpoint) {
      throw new Error('No active /game/json endpoint was found in the game tab');
    }
    const session = await inspectSession(page, endpoint);
    if (!session.hasSessionParameters || session.pageOrigin !== session.endpointOrigin) {
      throw new Error('The game tab does not have an active /game/json session');
    }

    const requestId = 10000 + (Date.now() % 50000);
    const request = makeRequest(
      'GuildRaidsMapService',
      'getOverview',
      [],
      requestId,
    )[0];
    const stateRequest = makeRequest(
      'GuildRaidsService',
      'getState',
      [],
      requestId + 1,
    )[0];
    const result = await sendGameRequest(page, endpoint, [request, stateRequest]);
    const messages = Array.isArray(result.data) ? result.data : [result.data];
    const response = findGameResponse(messages, request);
    if (!response) {
      throw new Error(`No GuildRaidsMapService.getOverview response: ${JSON.stringify(messages).slice(0, 1000)}`);
    }
    if (response.requestMethod === 'Error' || response.responseData?.__class__ === 'Error') {
      throw new Error(`Game API error: ${JSON.stringify(response.responseData)}`);
    }
    const stateResponse = findGameResponse(messages, stateRequest);

    const state = stateResponse?.responseData || null;
    const instance = state?.raidInstance || null;
    const document = {
      capturedAt: new Date().toISOString(),
      requestClass: request.requestClass,
      requestMethod: request.requestMethod,
      raid: state ? {
        stateClass: state.__class__ || null,
        guildRaidsType: state.guildRaidsType || null,
        endsAt: state.endsAt || null,
        difficultyLevel: instance?.difficultyLevel || null,
        raidName: instance?.raidName || null,
        assetContext: instance?.assetContext || null,
        eraContext: instance?.eraContext || null,
        expiresAt: instance?.expiresAt || null,
      } : null,
      responseData: response.responseData,
    };
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const nodes = Array.isArray(document.responseData?.nodes)
      ? document.responseData.nodes.length
      : 0;
    console.log(JSON.stringify({ outputPath, nodes, currentNode: document.responseData?.currentNode || null }));
  } finally {
    await browser.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { findCurrentEndpoint };
