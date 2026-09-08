'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const {
  DEFAULT_BROWSER_URL,
  DEFAULT_GAME_ORIGIN,
  discoverFreshSequence,
  findGamePage,
  findGameResponse,
  inspectSession,
  makeRequest,
  sendGameRequest,
} = require('./index');

const playerId = Number(process.argv[2]);
if (!Number.isInteger(playerId) || playerId <= 0) {
  throw new Error('Вкажіть числовий playerId');
}

const candidates = [
  ['OtherPlayerService', 'visitPlayer', [playerId]],
  ['CityMapService', 'getCityMap', [playerId]],
];

function entityCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['entities', 'city_map', 'cityMap', 'buildings']) {
    const count = entityCount(value[key]);
    if (count > 0) return count;
  }
  return 0;
}

async function main() {
  const browser = await puppeteer.connect({
    browserURL: process.env.FOE_BROWSER_URL || DEFAULT_BROWSER_URL,
    defaultViewport: null,
  });
  try {
    const gameOrigin = process.env.FOE_GAME_ORIGIN || DEFAULT_GAME_ORIGIN;
    const page = await findGamePage(browser, gameOrigin);
    const sequence = await discoverFreshSequence(page, gameOrigin);
    await inspectSession(page, sequence.endpoint);

    const attempts = [];
    let requestId = sequence.nextRequestId;
    for (const [requestClass, requestMethod, requestData] of candidates) {
      const request = makeRequest(requestClass, requestMethod, requestData, requestId++);
      const result = await sendGameRequest(
        page,
        sequence.endpoint,
        request,
        sequence.protocolHeaders || {},
      );
      const response = findGameResponse(
        Array.isArray(result.data) ? result.data : [result.data],
        request[0],
      );
      const count = entityCount(response?.responseData);
      attempts.push({ requestClass, requestMethod, count, response });
      if (response && count > 0) {
        const outputPath = path.join(__dirname, 'results', `player-city-${playerId}.json`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${JSON.stringify({
          capturedAt: new Date().toISOString(),
          playerId,
          requestClass,
          requestMethod,
          entityCount: count,
          responseData: response.responseData,
        }, null, 2)}\n`, 'utf8');
        console.log(`Отримано об'єктів міста: ${count}`);
        console.log(`Результат: ${outputPath}`);
        return;
      }
    }

    const diagnosticPath = path.join(
      __dirname,
      'results',
      `player-city-${playerId}-diagnostic.json`,
    );
    fs.mkdirSync(path.dirname(diagnosticPath), { recursive: true });
    fs.writeFileSync(diagnosticPath, `${JSON.stringify(attempts, null, 2)}\n`, 'utf8');
    throw new Error(`Повну карту міста не отримано. Діагностика: ${diagnosticPath}`);
  } finally {
    await browser.disconnect();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
