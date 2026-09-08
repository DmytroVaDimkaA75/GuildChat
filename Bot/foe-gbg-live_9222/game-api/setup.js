'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222';
const DEFAULT_AUTHORIZE_URL =
  'https://europe-west1-foechat-b903e.cloudfunctions.net/authorizeBot';
const DEFAULT_GUILD_DATA_URL =
  'https://europe-west1-foechat-b903e.cloudfunctions.net/guildData';

function readExistingConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function gamePageOrigin(urlValue) {
  try {
    const url = new URL(urlValue);
    if (!/^([a-z]{2,4}\d{1,4})\.forgeofempires\.com$/i.test(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch (_error) {
    return null;
  }
}

function parseStartupIdentity(gameOrigin, responseData) {
  const worldName = new URL(gameOrigin).hostname.split('.')[0].toLowerCase();
  const userData = responseData?.user_data;
  const playerId = String(userData?.player_id ?? '').trim();
  const guildId = String(userData?.clan_id ?? '').trim();
  if (!/^\d{1,20}$/.test(playerId)) {
    throw new Error('Гра не повернула playerId поточного акаунта');
  }
  if (!/^\d{1,20}$/.test(guildId) || guildId === '0') {
    throw new Error('Поточний акаунт не перебуває в гільдії');
  }
  return {
    playerId,
    worldName,
    guildId,
    guildName: String(userData?.clan_name || '').trim(),
    playerName: String(userData?.user_name || '').trim(),
  };
}

async function captureStartupIdentity(page, gameOrigin, timeoutMs = 60000) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  const gameRequestIds = new Set();
  let settled = false;
  let resolveIdentity;
  let rejectIdentity;
  const identityPromise = new Promise((resolve, reject) => {
    resolveIdentity = resolve;
    rejectIdentity = reject;
  });
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectIdentity(new Error('За 60 секунд не отримано стартові дані FoE'));
  }, timeoutMs);

  client.on('Network.responseReceived', event => {
    try {
      const url = new URL(event.response.url);
      if (url.origin === gameOrigin && url.pathname === '/game/json') {
        gameRequestIds.add(event.requestId);
      }
    } catch (_error) {
      // Ignore non-URL browser resources.
    }
  });
  client.on('Network.loadingFinished', async event => {
    if (settled || !gameRequestIds.has(event.requestId)) return;
    try {
      const { body } = await client.send('Network.getResponseBody', {
        requestId: event.requestId,
      });
      const parsed = JSON.parse(body);
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      const startup = messages.find(message =>
        message?.requestClass === 'StartupService' &&
        message?.requestMethod === 'getData' &&
        message?.responseData?.user_data,
      );
      if (!startup) return;
      settled = true;
      clearTimeout(timer);
      resolveIdentity(parseStartupIdentity(gameOrigin, startup.responseData));
    } catch (_error) {
      // Another /game/json response can still contain StartupService.getData.
    }
  });

  try {
    const reloadPromise = page.reload({
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const identity = await identityPromise;
    await reloadPromise.catch(() => {});
    return identity;
  } finally {
    clearTimeout(timer);
    await client.detach().catch(() => {});
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    // The HTTP status remains useful below.
  }
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || data?.error || `Firebase HTTP ${response.status}`);
  }
  return data;
}

function buildConfig(existing, identity, browserURL) {
  const generatedWorkerId = [
    identity.worldName,
    identity.guildId,
    'gbgbot',
    identity.playerId,
  ].join('-');
  return {
    browserURL,
    gameOrigin: `https://${identity.worldName}.forgeofempires.com`,
    firebase: {
      enabled: true,
      authorizeUrl:
        existing.firebase?.authorizeUrl || DEFAULT_AUTHORIZE_URL,
      guildDataUrl:
        existing.firebase?.guildDataUrl || DEFAULT_GUILD_DATA_URL,
      playerId: identity.playerId,
      botType: 'GBGbot',
      worldName: identity.worldName,
      guildId: identity.guildId,
      guildOverrides: {
        [identity.playerId]: {
          worldName: identity.worldName,
          guildId: identity.guildId,
        },
      },
    },
    worker: {
      id: generatedWorkerId,
      pollIntervalMs: Number(existing.worker?.pollIntervalMs) || 3000,
      heartbeatIntervalMs:
        Number(existing.worker?.heartbeatIntervalMs) || 30000,
      privateMessagePollIntervalMs:
        Number(existing.worker?.privateMessagePollIntervalMs) || 60000,
      guildMemberSyncIntervalMs:
        Number(existing.worker?.guildMemberSyncIntervalMs) || 3600000,
      guildMemberFullReconcileIntervalMs:
        Number(existing.worker?.guildMemberFullReconcileIntervalMs) || 86400000,
      gbgMapPollIntervalMs:
        Number(existing.worker?.gbgMapPollIntervalMs) || 10000,
      gbgPlayerLeaderboardPollIntervalMs:
        Number(existing.worker?.gbgPlayerLeaderboardPollIntervalMs) || 60000,
      gbgBuildingFullAuditIntervalMs:
        Number(existing.worker?.gbgBuildingFullAuditIntervalMs) || 1800000,
      gbgEmptySlotRecheckIntervalMs:
        Number(existing.worker?.gbgEmptySlotRecheckIntervalMs) || 300000,
      gbgGuildPointsMinute:
        Number.isFinite(Number(existing.worker?.gbgGuildPointsMinute))
          ? Number(existing.worker.gbgGuildPointsMinute)
          : 2,
      gbgSeasonDurationSeconds:
        Number(existing.worker?.gbgSeasonDurationSeconds) || 950400,
      quantumMapPollIntervalMs:
        Number(existing.worker?.quantumMapPollIntervalMs) || 10000,
      quantumMemberPollIntervalMs:
        Number(existing.worker?.quantumMemberPollIntervalMs) || 60000,
      quantumDetailRefreshIntervalMs:
        Number(existing.worker?.quantumDetailRefreshIntervalMs) || 60000,
      quantumFirebaseHeartbeatIntervalMs:
        Number(existing.worker?.quantumFirebaseHeartbeatIntervalMs) || 60000,
    },
  };
}

async function main() {
  const existing = readExistingConfig();
  const browserURL = existing.browserURL || DEFAULT_BROWSER_URL;
  console.log('1/4 Підключаюся до Chrome на порту 9222...');
  const browser = await puppeteer.connect({ browserURL, defaultViewport: null });
  try {
    const pages = await browser.pages();
    const page = pages.filter(candidate => gamePageOrigin(candidate.url())).at(-1);
    if (!page) {
      throw new Error('Не знайдено відкриту вкладку Forge of Empires');
    }
    const gameOrigin = gamePageOrigin(page.url());
    console.log('2/4 Читаю акаунт і гільдію з вкладки гри...');
    const identity = await captureStartupIdentity(page, gameOrigin);
    console.log(
      `Знайдено: ${identity.playerName || identity.playerId}; ` +
      `${identity.worldName}; гільдія «${identity.guildName || identity.guildId}»`,
    );

    const nextConfig = buildConfig(existing, identity, browserURL);
    console.log('3/4 Перевіряю роль GBGbot у Firebase...');
    const authorization = await postJson(
      existing.firebase?.authorizeUrl || DEFAULT_AUTHORIZE_URL,
      {
        ...identity,
        botType: 'GBGbot',
      },
    );
    if (authorization.role !== 'GBGbot') {
      throw new Error('Firebase не підтвердив роль GBGbot');
    }

    console.log('4/4 Записую готовий config.json...');
    writeJsonAtomic(CONFIG_PATH, nextConfig);
    console.log('ГОТОВО. Налаштування перевірено. Тепер запустіть START-BOT.cmd.');
  } finally {
    await browser.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`НЕ ВДАЛОСЯ НАЛАШТУВАТИ: ${error.message}`);
    console.error(
      'Перевірте, що Chrome запущений через START-CHROME.cmd, вкладка FoE відкрита, ' +
      'а акаунт має роль GBGbot.',
    );
    process.exitCode = 1;
  });
}

module.exports = {
  gamePageOrigin,
  parseStartupIdentity,
  captureStartupIdentity,
  buildConfig,
};
