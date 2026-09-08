'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222';
const DEFAULT_GAME_ORIGIN = 'https://ru11.forgeofempires.com';
const ENDPOINT_WAIT_MS = 15000;
const REQUEST_SIGNATURE_SALT =
  'o3g4aIc7+iBcWkUg9yMx6BZJtnBemBZ/2ZC/J05wlEw82AmTxbO4vxrCABSBlSZ9kMRkcrND/ywk/tNQcj/gKw==';
let activeSignatureSalt = REQUEST_SIGNATURE_SALT;
const SECTOR_CODES = {
  volcano_archipelago:
    'A1M,B1O,C1N,D1B,A2S,A2T,B2S,B2T,C2S,C2T,D2S,D2T,A3V,A3X,A3Y,A3Z,B3V,B3X,B3Y,B3Z,C3V,C3X,C3Y,C3Z,D3V,D3X,D3Y,D3Z,A4A,A4B,A4C,A4D,A4E,A4F,A4G,A4H,B4A,B4B,B4C,B4D,B4E,B4F,B4G,B4H,C4A,C4B,C4C,C4D,C4E,C4F,C4G,C4H,D4A,D4B,D4C,D4D,D4E,D4F,D4G,D4H'.split(','),
  waterfall_archipelago:
    'X1X,A2A,B2A,C2A,D2A,E2A,F2A,A3A,A3B,B3A,B3B,C3A,C3B,D3A,D3B,E3A,E3B,F3A,F3B,A4A,A4B,A4C,B4A,B4B,B4C,C4A,C4B,C4C,D4A,D4B,D4C,E4A,E4B,E4C,F4A,F4B,F4C,A5A,A5B,A5C,A5D,B5A,B5B,B5C,B5D,C5A,C5B,C5C,C5D,D5A,D5B,D5C,D5D,E5A,E5B,E5C,E5D,F5A,F5B,F5C,F5D'.split(','),
};

function parseCli(argv) {
  const [command = 'help', rawPlayerId] = argv;
  if (![
    'help',
    'probe',
    'capture-reload',
    'timers',
    'overview',
    'contributors',
    'guild-contributors',
    'inventory',
  ]
    .includes(command)) {
    throw new Error(`Невідома команда: ${command}`);
  }
  if (command === 'inventory' && rawPlayerId != null) {
    throw new Error(
      'InventoryService.getItems не приймає playerId: можна отримати лише інвентар поточної авторизованої сесії',
    );
  }
  if (!['overview', 'contributors'].includes(command)) {
    return { command, playerId: null };
  }
  if (!/^\d+$/.test(rawPlayerId || '')) {
    throw new Error('Для overview потрібен числовий playerId');
  }
  return { command, playerId: rawPlayerId };
}

function redactEndpoint(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}${url.search ? '?<session-params>' : ''}`;
}

function isGameJsonUrl(value, expectedOrigin) {
  try {
    const url = new URL(value);
    return url.origin === expectedOrigin && url.pathname === '/game/json';
  } catch (_error) {
    return false;
  }
}

function makeRequest(requestClass, requestMethod, requestData, requestId) {
  return [{
    __class__: 'ServerRequest',
    requestData,
    requestClass,
    requestMethod,
    requestId,
  }];
}

function contributorsFromConstruction(construction) {
  const rankings = Array.isArray(construction?.rankings)
    ? construction.rankings
    : [];
  return rankings
    .filter(row => row?.player)
    .map((row, index) => ({
      rank: row.rank ?? index + 1,
      playerId: row.player.player_id ?? null,
      playerName: row.player.name || null,
      avatar: row.player.avatar || null,
      forgePoints: Number(row.forge_points || 0),
    }));
}

function normalizeBattleground(
  responseData,
  nowSeconds = Math.floor(Date.now() / 1000),
  colorData = [],
) {
  const data = Array.isArray(responseData) ? responseData[0] : responseData;
  if (!data?.map || !Array.isArray(data.map.provinces)) return null;
  const mapId = data.map.id || null;
  const participants = Array.isArray(data.battlegroundParticipants)
    ? data.battlegroundParticipants
    : [];
  const colors = new Map(
    (Array.isArray(colorData) ? colorData : [])
      .filter(color => color?.id)
      .map(color => [String(color.id), color]),
  );
  const participantById = new Map(
    participants.map(participant => [String(participant.participantId), participant]),
  );
  const normalizedParticipants = participants.map(participant => {
    const colorId = participant.colour ?? participant.color ??
      participant.colourId ?? participant.colorId ?? null;
    return {
      participantId: participant.participantId ?? null,
      clanId: participant.clan?.id ?? null,
      clanName: participant.clan?.name || null,
      colorId,
      sectorColor: colorId == null
        ? null
        : colors.get(String(colorId))?.mainColour || null,
    };
  });
  const sectors = data.map.provinces.map((province, index) => {
    const id = province.id ?? index;
    const owner = participantById.get(String(province.ownerId));
    const ownerColorId = owner?.colour ?? owner?.color ??
      owner?.colourId ?? owner?.colorId ?? null;
    const lockedUntil = Number(province.lockedUntil || 0);
    const conquestProgress = Array.isArray(province.conquestProgress)
      ? province.conquestProgress.map(progress => {
          const attacker = participantById.get(String(progress.participantId));
          return {
            participantId: progress.participantId ?? null,
            clanId: attacker?.clan?.id ?? null,
            clanName: attacker?.clan?.name || null,
            progress: Number(progress.progress || 0),
            maxProgress: Number(progress.maxProgress || 0),
          };
        })
      : [];
    return {
      id,
      code: SECTOR_CODES[mapId]?.[id] || `ID:${id}`,
      ownerParticipantId: province.ownerId ?? null,
      ownerClanId: owner?.clan?.id ?? null,
      ownerClanName: owner?.clan?.name || null,
      ownerColorId,
      ownerColor: ownerColorId == null
        ? null
        : colors.get(String(ownerColorId))?.mainColour || null,
      lockedUntil,
      isLocked: lockedUntil > nowSeconds,
      battleType: province.isAttackBattleType ? 'attack' : 'defense',
      conquestProgress,
      victoryPoints: Number(province.victoryPoints || 0),
      victoryPointsBonus: Number(province.victoryPointsBonus || 0),
      gainAttritionChance: province.gainAttritionChance ?? null,
      totalBuildingSlots: province.totalBuildingSlots ?? null,
      usedBuildingSlots: province.usedBuildingSlots ?? null,
      buildings: province.buildings || province.gbgBuildings || [],
      availableBuildings: [],
      freeBuildingSlots: null,
      buildingsError: null,
    };
  });
  return {
    mapId,
    endsAt: data.endsAt ?? null,
    currentParticipantId: data.currentParticipantId ?? null,
    currentPlayerParticipant: data.currentPlayerParticipant || null,
    pendingUpdate: data.map.pendingUpdate || null,
    participantCount: normalizedParticipants.length,
    sectorCount: sectors.length,
    participants: normalizedParticipants,
    sectors,
  };
}

function normalizeSectorBuildings(responseData) {
  const data = Array.isArray(responseData) ? responseData[0] : responseData;
  if (!data || typeof data !== 'object') return null;
  const placedBuildings = Array.isArray(data.placedBuildings)
    ? data.placedBuildings
    : [];
  return {
    provinceId: data.provinceId ?? null,
    freeBuildingSlots: Number(data.freeSlots || 0),
    buildings: placedBuildings.map((building, index) => ({
      id: building.id ?? building.buildingId ?? null,
      slotId: building.slotId ?? index,
      readyAt: building.readyAt ?? building.finishedAt ?? building.finishAt ?? null,
      raw: building,
    })),
    availableBuildings: Array.isArray(data.availableBuildings)
      ? data.availableBuildings
      : [],
  };
}

function makePayloadSignature(endpoint, bodyText) {
  return makePayloadSignatureWithSalt(endpoint, bodyText, activeSignatureSalt);
}

function makePayloadSignatureWithSalt(endpoint, bodyText, signatureSalt) {
  const signatureHash = new URL(endpoint).searchParams.get('h');
  if (!signatureHash) {
    throw new Error('Endpoint /game/json не містить параметр h для підпису');
  }
  return crypto
    .createHash('md5')
    .update(`${signatureHash}${signatureSalt}${bodyText}`, 'utf8')
    .digest('hex')
    .substring(1, 11);
}

const SIGNATURE_SALT_PATTERN =
  /_signatureHash\s*\+\s*(["'])([A-Za-z0-9+/=]{40,})\1\s*\+/;

function extractSignatureSalt(sourceText) {
  if (typeof sourceText !== 'string') return null;
  return sourceText.match(SIGNATURE_SALT_PATTERN)?.[2] || null;
}

async function discoverSignatureSalt(page) {
  return page.evaluate(async patternSource => {
    const pattern = new RegExp(patternSource);
    const scriptUrls = [...new Set(
      performance
        .getEntriesByType('resource')
        .filter(entry => entry.initiatorType === 'script' || /\.js(?:[?#]|$)/i.test(entry.name))
        .map(entry => entry.name),
    )];
    for (const scriptUrl of scriptUrls) {
      try {
        const response = await fetch(scriptUrl, { credentials: 'omit' });
        if (!response.ok) continue;
        const match = (await response.text()).match(pattern);
        if (match?.[2]) return { salt: match[2], scriptUrl };
      } catch (_error) {
        // Some third-party scripts disallow CORS; continue with game scripts.
      }
    }
    return null;
  }, SIGNATURE_SALT_PATTERN.source);
}

function nextExperimentalRequestId() {
  // Captured game requests use small positive IDs. Stay below 65535 because
  // the server may deserialize this field as a 16-bit value.
  return 10000 + Math.floor(Math.random() * 50000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findGamePage(browser, gameOrigin) {
  const pages = await browser.pages();
  const candidates = pages.filter(candidate => {
    try {
      return new URL(candidate.url()).origin === gameOrigin;
    } catch (_error) {
      return false;
    }
  });
  if (!candidates.length) {
    const opened = pages.map(candidate => candidate.url()).join('\n  - ');
    throw new Error(
      `Не знайдено вкладку ${gameOrigin}. Відкриті сторінки:\n  - ${opened}`,
    );
  }
  return candidates[candidates.length - 1];
}

async function endpointFromPerformance(page, gameOrigin) {
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

async function endpointFromNextRequest(page, gameOrigin, timeoutMs) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          `За ${timeoutMs} мс не з'явився запит /game/json. ` +
          'Перезавантажте вкладку гри та повторіть probe.',
        ));
      }, timeoutMs);
      client.on('Network.requestWillBeSent', event => {
        const value = event?.request?.url;
        if (!isGameJsonUrl(value, gameOrigin)) return;
        clearTimeout(timer);
        resolve(value);
      });
    });
  } finally {
    await client.detach().catch(() => {});
  }
}

async function discoverEndpoint(page, gameOrigin) {
  const cached = await endpointFromPerformance(page, gameOrigin);
  if (cached) return { endpoint: cached, source: 'performance-history' };
  const endpoint = await endpointFromNextRequest(page, gameOrigin, ENDPOINT_WAIT_MS);
  return { endpoint, source: 'network-event' };
}

async function captureRequestDuringReload(page, gameOrigin, timeoutMs = 60000) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  try {
    const capturedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`За ${timeoutMs} мс гра не надіслала POST /game/json`));
      }, timeoutMs);
      client.on('Network.requestWillBeSent', event => {
        const request = event?.request;
        if (
          request?.method !== 'POST' ||
          !isGameJsonUrl(request?.url, gameOrigin) ||
          !request?.postData
        ) return;
        clearTimeout(timer);
        const headers = request.headers || {};
        const safeHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
          if (['cookie', 'authorization', 'proxy-authorization']
            .includes(key.toLowerCase())) continue;
          safeHeaders[key] = value;
        }
        let body = request.postData;
        try {
          body = JSON.parse(body);
        } catch (_error) {
          // Keep the raw body so its encoding can be diagnosed.
        }
        resolve({
          endpoint: request.url,
          method: request.method,
          headers: safeHeaders,
          body,
        });
      });
    });
    const reloadPromise = page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const captured = await capturedPromise;
    await reloadPromise.catch(() => {});
    return captured;
  } finally {
    await client.detach().catch(() => {});
  }
}

async function discoverFreshSequence(page, gameOrigin, timeoutMs = 60000) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  let endpoint = null;
  let maxRequestId = 0;
  let lastGameRequestAt = 0;
  let startupSeen = false;
  let startupSeenAt = 0;
  let protocolHeaders = {};
  let lastPayloadText = null;
  let lastObservedSignature = null;

  client.on('Network.requestWillBeSent', event => {
    const request = event?.request;
    if (
      request?.method !== 'POST' ||
      !isGameJsonUrl(request?.url, gameOrigin) ||
      !request?.postData
    ) return;
    let messages;
    try {
      const parsed = JSON.parse(request.postData);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch (_error) {
      return;
    }
    endpoint = request.url;
    lastGameRequestAt = Date.now();
    lastPayloadText = request.postData;
    protocolHeaders = {};
    for (const [key, value] of Object.entries(request.headers || {})) {
      if (key.toLowerCase() === 'signature') {
        lastObservedSignature = String(value);
      }
      if (key.toLowerCase() === 'client-identification') {
        protocolHeaders[key] = value;
      }
    }
    for (const message of messages) {
      const requestId = Number(message?.requestId);
      if (Number.isSafeInteger(requestId) && requestId > maxRequestId) {
        maxRequestId = requestId;
      }
      if (
        message?.requestClass === 'StartupService' &&
        message?.requestMethod === 'getData'
      ) {
        startupSeen = true;
        startupSeenAt ||= Date.now();
      }
    }
  });

  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const quietForMs = Date.now() - lastGameRequestAt;
      const startupSettledForMs = Date.now() - startupSeenAt;
      if (
        endpoint &&
        startupSeen &&
        maxRequestId > 0 &&
        startupSettledForMs >= 8000 &&
        quietForMs >= 1000
      ) {
        const discoveredSignature = await discoverSignatureSalt(page);
        const signatureSalt = discoveredSignature?.salt || REQUEST_SIGNATURE_SALT;
        const calculatedSignature = makePayloadSignatureWithSalt(
          endpoint,
          lastPayloadText,
          signatureSalt,
        );
        if (
          lastObservedSignature &&
          calculatedSignature !== lastObservedSignature
        ) {
          throw new Error(
            'Локальний генератор Signature не збігається з підписом клієнта гри',
          );
        }
        activeSignatureSalt = signatureSalt;
        return {
          endpoint,
          lastRequestId: maxRequestId,
          nextRequestId: maxRequestId + 1,
          protocolHeaders,
          signatureSalt,
        };
      }
      await sleep(100);
    }
    throw new Error(
      `Не вдалося визначити актуальну послідовність requestId за ${timeoutMs} мс`,
    );
  } finally {
    await client.detach().catch(() => {});
  }
}

async function inspectSession(page, endpoint) {
  return page.evaluate(value => {
    const endpointUrl = new URL(value);
    return {
      pageOrigin: location.origin,
      endpointOrigin: endpointUrl.origin,
      hasSessionParameters: endpointUrl.search.length > 1,
      documentReadyState: document.readyState,
    };
  }, endpoint);
}

async function sendGameRequest(
  page,
  endpoint,
  message,
  protocolHeaders = {},
  signatureSalt = activeSignatureSalt,
) {
  const bodyText = JSON.stringify(message);
  const signature = makePayloadSignatureWithSalt(endpoint, bodyText, signatureSalt);
  return page.evaluate(async ({ url, body, extraHeaders, payloadSignature }) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
        Signature: payloadSignature,
      },
      body,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      throw new Error(
        `Сервер повернув HTTP ${response.status}, але відповідь не є JSON: ` +
        text.slice(0, 200),
      );
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }
    return { status: response.status, data };
  }, {
    url: endpoint,
    body: bodyText,
    extraHeaders: protocolHeaders,
    payloadSignature: signature,
  });
}

function findGameResponse(messages, request, requestMethod = request.requestMethod) {
  return messages.find(item =>
    String(item?.requestId) === String(request.requestId) &&
    item?.requestClass === request.requestClass &&
    item?.requestMethod === requestMethod,
  ) || null;
}

async function sendRequestBatches(
  page,
  endpoint,
  requests,
  protocolHeaders,
  batchSize = 40,
  label = 'пакети',
) {
  const messages = [];
  const batchCount = Math.ceil(requests.length / batchSize);
  for (let offset = 0; offset < requests.length; offset += batchSize) {
    const batch = requests.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    console.log(`${label}: пакет ${batchNumber}/${batchCount}, запитів ${batch.length}`);
    const result = await sendGameRequest(
      page,
      endpoint,
      batch,
      protocolHeaders,
    );
    const batchMessages = Array.isArray(result.data) ? result.data : [result.data];
    messages.push(...batchMessages);
  }
  return messages;
}

function formatElapsed(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} с`;
  return `${Math.floor(seconds / 60)} хв ${(seconds % 60).toFixed(2)} с`;
}

async function runGuildContributors({
  page,
  endpoint,
  protocolHeaders,
  firstRequestId,
}) {
  let nextRequestId = firstRequestId;
  const clanRequest = makeRequest(
    'ClanService',
    'getOwnClanData',
    [],
    nextRequestId++,
  )[0];
  console.log('Отримую список співгільдійців…');
  const clanResult = await sendGameRequest(
    page,
    endpoint,
    [clanRequest],
    protocolHeaders,
  );
  const clanMessages = Array.isArray(clanResult.data)
    ? clanResult.data
    : [clanResult.data];
  const clanResponse = findGameResponse(clanMessages, clanRequest);
  const clan = clanResponse?.responseData;
  const members = Array.isArray(clan?.members)
    ? clan.members.filter(member => member?.player_id != null)
    : null;
  if (!members) {
    throw new Error(
      `Не отримано список співгільдійців: ${JSON.stringify(clanResult.data).slice(0, 1000)}`,
    );
  }
  console.log(`Гільдія «${clan.name || clan.id}»: співгільдійців ${members.length}`);

  const battlegroundStateRequest = makeRequest(
    'GuildBattlegroundStateService',
    'getState',
    [],
    nextRequestId++,
  )[0];
  await sendGameRequest(
    page,
    endpoint,
    [battlegroundStateRequest],
    protocolHeaders,
  );
  const colorRequest = makeRequest(
    'StaticDataService',
    'getDataDirectly',
    ['battleground_colour'],
    nextRequestId++,
  )[0];
  const colorResult = await sendGameRequest(
    page,
    endpoint,
    [colorRequest],
    protocolHeaders,
  );
  const colorMessages = Array.isArray(colorResult.data)
    ? colorResult.data
    : [colorResult.data];
  const colorResponse = findGameResponse(colorMessages, colorRequest);
  const colorData = Array.isArray(colorResponse?.responseData)
    ? colorResponse.responseData
    : [];
  const battlegroundRequest = makeRequest(
    'GuildBattlegroundService',
    'getBattleground',
    [],
    nextRequestId++,
  )[0];
  console.log('Отримую стан секторів ПБГ…');
  const battlegroundResult = await sendGameRequest(
    page,
    endpoint,
    [battlegroundRequest],
    protocolHeaders,
  );
  const battlegroundMessages = Array.isArray(battlegroundResult.data)
    ? battlegroundResult.data
    : [battlegroundResult.data];
  const battlegroundResponse = findGameResponse(
    battlegroundMessages,
    battlegroundRequest,
  );
  const battleground = normalizeBattleground(
    battlegroundResponse?.responseData,
    Math.floor(Date.now() / 1000),
    colorData,
  );
  if (battleground) {
    console.log(
      `ПБГ: карта ${battleground.mapId}; секторів ${battleground.sectorCount}; ` +
      `учасників ${battleground.participantCount}; кольорів ${colorData.length}`,
    );
  } else {
    console.warn('ПБГ: актуальний стан секторів не отримано');
  }

  if (battleground) {
    const sectorBuildingTasks = battleground.sectors.map(sector => ({
      sector,
      request: makeRequest(
        'GuildBattlegroundBuildingService',
        'getBuildings',
        [Number(sector.id)],
        nextRequestId++,
      )[0],
    }));
    const sectorBuildingMessages = await sendRequestBatches(
      page,
      endpoint,
      sectorBuildingTasks.map(task => task.request),
      protocolHeaders,
      40,
      'Споруди секторів',
    );
    for (const { sector, request } of sectorBuildingTasks) {
      const response = findGameResponse(sectorBuildingMessages, request);
      const normalized = normalizeSectorBuildings(response?.responseData);
      if (!normalized) {
        sector.buildingsError = 'Відповідь getBuildings не знайдена';
        continue;
      }
      sector.buildings = normalized.buildings;
      sector.availableBuildings = normalized.availableBuildings;
      sector.freeBuildingSlots = normalized.freeBuildingSlots;
      sector.usedBuildingSlots = normalized.buildings.length;
    }
    console.log(
      `Споруди секторів отримано: ` +
      `${battleground.sectors.filter(sector => !sector.buildingsError).length}/` +
      `${battleground.sectorCount}`,
    );
  }

  const overviewTasks = members.map(member => ({
    member,
    request: makeRequest(
      'GreatBuildingsService',
      'getOtherPlayerOverview',
      [Number(member.player_id)],
      nextRequestId++,
    )[0],
  }));
  const overviewMessages = await sendRequestBatches(
    page,
    endpoint,
    overviewTasks.map(task => task.request),
    protocolHeaders,
    40,
    'Огляди споруд',
  );

  const players = overviewTasks.map(({ member, request }) => {
    const response = findGameResponse(overviewMessages, request);
    const rows = Array.isArray(response?.responseData) ? response.responseData : [];
    return {
      playerId: Number(member.player_id),
      playerName: member.name || null,
      avatar: member.avatar || null,
      rank: member.rank ?? null,
      score: member.score ?? null,
      era: member.era || null,
      buildings: rows.map(row => ({
        entityId: row.entity_id ?? null,
        cityEntityId: row.city_entity_id ?? null,
        name: row.name || null,
        level: row.level ?? null,
        currentProgress: row.current_progress ?? null,
        maxProgress: row.max_progress ?? null,
        contributors: [],
        error: null,
      })),
      error: response ? null : 'Відповідь getOtherPlayerOverview не знайдена',
    };
  });

  const constructionTasks = [];
  for (const player of players) {
    for (const building of player.buildings) {
      constructionTasks.push({
        building,
        request: makeRequest(
          'GreatBuildingsService',
          'getConstruction',
          [Number(building.entityId), Number(player.playerId)],
          nextRequestId++,
        )[0],
      });
    }
  }
  console.log(`Знайдено споруд: ${constructionTasks.length}`);
  const constructionMessages = await sendRequestBatches(
    page,
    endpoint,
    constructionTasks.map(task => task.request),
    protocolHeaders,
    40,
    'Вкладники споруд',
  );
  for (const { building, request } of constructionTasks) {
    const response = findGameResponse(constructionMessages, request);
    building.contributors = contributorsFromConstruction(response?.responseData);
    if (!response) building.error = 'Відповідь getConstruction не знайдена';
  }

  const report = {
    capturedAt: new Date().toISOString(),
    guildId: clan.id ?? null,
    guildName: clan.name || null,
    memberCount: players.length,
    buildingCount: constructionTasks.length,
    contributorCount: constructionTasks.reduce(
      (total, task) => total + task.building.contributors.length,
      0,
    ),
    overviewErrorCount: players.filter(player => player.error).length,
    constructionErrorCount: constructionTasks.filter(task => task.building.error).length,
    sectorBuildingErrorCount: battleground
      ? battleground.sectors.filter(sector => sector.buildingsError).length
      : 0,
    battleground,
    players,
  };
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(
    resultsDir,
    `guild-contributors-${clan.id || 'unknown'}-${stamp}.json`,
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { report, outputPath };
}

function printHelp() {
  console.log(`FoE game/json read-only experiment

Usage:
  npm run probe
  npm start -- capture-reload
  npm start -- timers
  npm start -- overview <playerId>
  npm start -- contributors <playerId>
  npm start -- guild-contributors
  npm start -- inventory

Environment variables:
  FOE_BROWSER_URL  CDP endpoint (default: ${DEFAULT_BROWSER_URL})
  FOE_GAME_ORIGIN  game origin (default: ${DEFAULT_GAME_ORIGIN})`);
}

async function main() {
  const commandStartedAtMs = Date.now();
  const options = parseCli(process.argv.slice(2));
  if (options.command === 'help') {
    printHelp();
    return;
  }

  // Loaded lazily so pure helpers can be tested before npm install.
  const puppeteer = require('puppeteer');
  const browserURL = process.env.FOE_BROWSER_URL || DEFAULT_BROWSER_URL;
  const gameOrigin = process.env.FOE_GAME_ORIGIN || DEFAULT_GAME_ORIGIN;
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL, defaultViewport: null });
  } catch (error) {
    throw new Error(
      `Не вдалося підключитися до Chrome за адресою ${browserURL}. ` +
      `Переконайтеся, що Chrome запущений з --remote-debugging-port=${new URL(browserURL).port}. ` +
      `Деталі: ${error.message}`,
    );
  }
  try {
    const page = await findGamePage(browser, gameOrigin);
    if (options.command === 'capture-reload') {
      console.log('Перезавантажую вкладку та очікую перший справжній POST /game/json…');
      const captured = await captureRequestDuringReload(page, gameOrigin);
      console.log(`Endpoint: ${redactEndpoint(captured.endpoint)}`);
      console.log(`Метод: ${captured.method}`);
      console.log(`Заголовки: ${JSON.stringify(captured.headers, null, 2)}`);
      console.log('Payload першого запиту гри:');
      console.log(JSON.stringify(captured.body, null, 2));
      return;
    }
    const synchronizedCommand = [
      'timers',
      'overview',
      'contributors',
      'guild-contributors',
      'inventory',
    ]
      .includes(options.command);
    const sequence = synchronizedCommand
      ? await discoverFreshSequence(page, gameOrigin)
      : null;
    const discovered = sequence
      ? { endpoint: sequence.endpoint, source: 'fresh-reload-sequence' }
      : await discoverEndpoint(page, gameOrigin);
    const session = await inspectSession(page, discovered.endpoint);

    console.log(`Вкладка: ${page.url()}`);
    console.log(`Endpoint: ${redactEndpoint(discovered.endpoint)}`);
    console.log(`Джерело endpoint: ${discovered.source}`);
    console.log(`Сесійні параметри: ${session.hasSessionParameters ? 'так' : 'ні'}`);

    if (session.pageOrigin !== session.endpointOrigin) {
      throw new Error(
        `Endpoint має інший origin: ${session.endpointOrigin} замість ${session.pageOrigin}`,
      );
    }
    if (options.command === 'probe') {
      console.log('Probe завершено: запити до гри не надсилалися.');
      return;
    }

    if (options.command === 'guild-contributors') {
      let guildResult;
      try {
        guildResult = await runGuildContributors({
          page,
          endpoint: discovered.endpoint,
          protocolHeaders: sequence?.protocolHeaders || {},
          firstRequestId: sequence.nextRequestId,
        });
        const { report, outputPath } = guildResult;
        console.log(
          `Готово: гравців ${report.memberCount}; споруд ${report.buildingCount}; ` +
          `записів вкладників ${report.contributorCount}; ` +
          `помилок overview ${report.overviewErrorCount}; ` +
          `помилок споруд ${report.constructionErrorCount}; ` +
          `секторів ПБГ ${report.battleground?.sectorCount ?? 0}; ` +
          `помилок споруд секторів ${report.sectorBuildingErrorCount}`,
        );
        console.log(`Результат: ${outputPath}`);
      } finally {
        console.log('Відновлюю штатну послідовність гри перезавантаженням вкладки…');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
          .catch(error => console.warn(`Не вдалося перезавантажити вкладку: ${error.message}`));
        console.log(`Загальний час виконання: ${formatElapsed(Date.now() - commandStartedAtMs)}`);
      }
      return;
    }

    const requestId = sequence?.nextRequestId || nextExperimentalRequestId();
    const isTimersProbe = options.command === 'timers';
    const isInventory = options.command === 'inventory';
    const wantsContributors = options.command === 'contributors';
    const requestClass = isTimersProbe
      ? 'TimerService'
      : isInventory
        ? 'InventoryService'
        : 'GreatBuildingsService';
    const requestMethod = isTimersProbe
      ? 'getTimers'
      : isInventory
        ? 'getItems'
        : 'getOtherPlayerOverview';
    const requestData = (isTimersProbe || isInventory) ? [] : [Number(options.playerId)];
    const message = makeRequest(
      requestClass,
      requestMethod,
      requestData,
      requestId,
    );
    console.log(
      `Надсилаю read-only ${requestClass}.${requestMethod}` +
      `${(isTimersProbe || isInventory) ? '' : ` для playerId=${options.playerId}`}, ` +
      `requestId=${requestId}`,
    );
    let result;
    try {
      result = await sendGameRequest(
        page,
        discovered.endpoint,
        message,
        sequence?.protocolHeaders || {},
      );
      const messages = Array.isArray(result.data) ? result.data : [result.data];
      const matching = messages.find(item =>
        String(item?.requestId) === String(requestId) &&
        item?.requestClass === requestClass &&
        item?.requestMethod === requestMethod,
      ) || messages.find(item =>
        item?.requestClass === requestClass &&
        item?.requestMethod === requestMethod,
      );
      console.log(`HTTP: ${result.status}`);
      if (isInventory) {
        const responseData = matching?.responseData;
        const items = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.items)
            ? responseData.items
            : [];
        if (!matching || (!Array.isArray(responseData) && !Array.isArray(responseData?.items))) {
          throw new Error(
            `Не отримано список інвентарю: ${JSON.stringify(result.data).slice(0, 1000)}`,
          );
        }
        const report = {
          capturedAt: new Date().toISOString(),
          scope: 'authenticated-session',
          itemCount: items.length,
          items,
        };
        const resultsDir = path.join(__dirname, 'results');
        fs.mkdirSync(resultsDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(resultsDir, `inventory-${stamp}.json`);
        fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        console.log(`Отримано позицій інвентарю: ${report.itemCount}`);
        console.log(`Результат: ${outputPath}`);
      } else if (!wantsContributors) {
        console.log(JSON.stringify(matching || result.data, null, 2));
      } else {
        const overviewRows = Array.isArray(matching?.responseData)
          ? matching.responseData
          : null;
        if (!overviewRows) {
          throw new Error(
            `Не отримано overview гравця: ${JSON.stringify(result.data).slice(0, 1000)}`,
          );
        }
        const constructionRequests = overviewRows.map((building, index) =>
          makeRequest(
            'GreatBuildingsService',
            'getConstruction',
            [Number(building.entity_id), Number(options.playerId)],
            requestId + index + 1,
          )[0],
        );
        console.log(
          `Запитую вкладників для ${constructionRequests.length} споруд одним пакетом…`,
        );
        const constructionResult = await sendGameRequest(
          page,
          discovered.endpoint,
          constructionRequests,
          sequence?.protocolHeaders || {},
        );
        const constructionMessages = Array.isArray(constructionResult.data)
          ? constructionResult.data
          : [constructionResult.data];
        const buildings = overviewRows.map((building, index) => {
          const constructionRequestId = requestId + index + 1;
          const response = constructionMessages.find(item =>
            String(item?.requestId) === String(constructionRequestId) &&
            item?.requestClass === 'GreatBuildingsService' &&
            item?.requestMethod === 'getConstruction',
          );
          return {
            entityId: building.entity_id ?? null,
            cityEntityId: building.city_entity_id ?? null,
            name: building.name || null,
            level: building.level ?? null,
            currentProgress: building.current_progress ?? null,
            maxProgress: building.max_progress ?? null,
            contributors: contributorsFromConstruction(response?.responseData),
            error: response
              ? null
              : 'Відповідь getConstruction не знайдена',
          };
        });
        const report = {
          capturedAt: new Date().toISOString(),
          ownerPlayerId: Number(options.playerId),
          ownerPlayerName: overviewRows.find(row => row?.player?.name)?.player?.name || null,
          buildingCount: buildings.length,
          contributorCount: buildings.reduce(
            (total, building) => total + building.contributors.length,
            0,
          ),
          buildings,
        };
        const resultsDir = path.join(__dirname, 'results');
        fs.mkdirSync(resultsDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(
          resultsDir,
          `contributors-${options.playerId}-${stamp}.json`,
        );
        fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        const missing = buildings.filter(building => building.error).length;
        console.log(
          `Отримано споруд: ${report.buildingCount}; записів вкладників: ` +
          `${report.contributorCount}; без відповіді: ${missing}`,
        );
        console.log(`Результат: ${outputPath}`);
      }
    } finally {
      if (sequence) {
        console.log('Відновлюю штатну послідовність гри перезавантаженням вкладки…');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
          .catch(error => console.warn(`Не вдалося перезавантажити вкладку: ${error.message}`));
      }
    }
  } finally {
    await browser.disconnect();
    if (options.command === 'inventory') {
      console.log(`Загальний час виконання: ${formatElapsed(Date.now() - commandStartedAtMs)}`);
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Помилка: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BROWSER_URL,
  DEFAULT_GAME_ORIGIN,
  isGameJsonUrl,
  makePayloadSignature,
  makePayloadSignatureWithSalt,
  extractSignatureSalt,
  makeRequest,
  parseCli,
  redactEndpoint,
  contributorsFromConstruction,
  normalizeBattleground,
  normalizeSectorBuildings,
  findGamePage,
  discoverFreshSequence,
  inspectSession,
  sendGameRequest,
  findGameResponse,
  sendRequestBatches,
  formatElapsed,
};
