try {
  importScripts('./libs/firebase-app-compat.js', './libs/firebase-database-compat.js');
} catch (e) {
  console.error('Критична помилка: Не вдалося завантажити скрипти Firebase:', e);
}

let latestState = null;
let lastKnownGuildPath = null;
let lastSourceTabId = null;
let lastSyncTime = 0;
let firebaseSyncInFlight = false;
let pendingFirebaseSync = null;
const MY_GUILD_SECTOR_COLOR = '#CDCDCD';
const SYNC_DEBOUNCE_MS = 5000;
const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;
// Firebase writes are owned exclusively by game-api/worker.js. The legacy
// extension writer only has a partial state and would race with the worker.
const FIREBASE_WRITES_ENABLED = false;
// let userRegisteredThisSession = false; 

if (self.firebase) {
  console.log('Firebase SDK успішно завантажено. Ініціалізація...');
  
  const firebaseConfig = {
    apiKey: "AIzaSyBOHftw_wcko7LJBvLRdnTO6Euc3JACdKE",
    authDomain: "foechat-b903e.firebaseapp.com",
    databaseURL: "https://foechat-b903e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "foechat-b903e",
    storageBucket: "foechat-b903e.firebasestorage.app",
    messagingSenderId: "12707765363",
    appId: "1:12707765363:web:f43ae1f066ca6b0a745e06",
    measurementId: "G-HGR93H87MR"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.database();
  const serverTimestamp = firebase.database.ServerValue.TIMESTAMP;
  let firebaseUnsubscribeCallback = null;
  let firebaseInitialValuePromise = Promise.resolve();
  let resolveFirebaseInitialValue = null;
  let firebaseInitialValueReceived = false;
  let lastKnownGainAttritionChanceBySector = Object.create(null);
  let lastKnownPlayerLeaderboard = { mapId: null, players: Object.create(null) };
  let lastKnownFirebaseGuildData = null;
  let lastSeenWriteTime = 0;

  function sameFirebaseValue(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((value, index) => sameFirebaseValue(value, right[index]));
    }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const leftKeys = Object.keys(left).filter(key => left[key] !== undefined).sort();
    const rightKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && sameFirebaseValue(left[key], right[key]));
  }

  function setCachedFirebaseValue(target, relativePath, value) {
    const segments = relativePath.split('/').filter(Boolean);
    let cursor = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
      cursor = cursor[segment];
    }
    const lastSegment = segments[segments.length - 1];
    if (value === null) delete cursor[lastSegment];
    else cursor[lastSegment] = value;
  }

  function normalizePlayerLeaderboard(value, nestedPlayers = false) {
    const sourcePlayers = nestedPlayers ? value?.players : value;
    const players = Object.create(null);
    if (sourcePlayers && typeof sourcePlayers === 'object' && !Array.isArray(sourcePlayers)) {
      Object.entries(sourcePlayers).forEach(([playerId, entry]) => {
        if (!/^\d+$/.test(playerId) || !entry || typeof entry !== 'object') return;
        const negotiationsWon = Number(entry.negotiationsWon ?? 0);
        const battlesWon = Number(entry.battlesWon);
        const rank = Number(entry.rank);
        const attrition = Number(entry.attrition);
        if (!Number.isInteger(negotiationsWon) || !Number.isInteger(battlesWon) || !Number.isInteger(rank) || !Number.isInteger(attrition)) return;
        players[playerId] = { negotiationsWon, battlesWon, rank, attrition };
      });
    }
    return {
      mapId: value?.mapId ?? null,
      players,
    };
  }


  function firebaseDataToState(data, guildPath) {
    if (!data || !data.GBG) return null;
    const guildId = guildPath.split('/')[1].split('_')[1];
    const fbGbg = data.GBG;
    const opponentsByClanId = {};
    (fbGbg.opponents || []).forEach(op => { if (op && op.id != null) opponentsByClanId[op.id] = op; });
    const provinces = Object.entries(fbGbg.sectors || {}).map(([short, sector]) => {
      const ownerOpponent = opponentsByClanId[sector.owner];
      const isHq = (fbGbg.opponents || []).some(op => op.staff === short);
      return {
        short: short, title: short, isAttackBattleType: sector.army === 'attack',
        gainAttritionChance: sector.gainAttritionChance ?? null,
        lockedUntil: sector.openTime || null, ownerClanId: sector.owner,
        ownerId: ownerOpponent?.participantId || sector.owner || null,
        ownerName: ownerOpponent?.name || (sector.owner ? `Guild ${sector.owner}` : 'немає'),
        ownerColor: ownerOpponent?.sectorColor || null, buildings: sector.buildings || [],
        totalBuildingSlots: isHq ? 1 : (sector.buildings?.length > 0 ? sector.buildings.length : null)
      };
    });
    return {
      myGuild: { id: guildId, name: data.guildName || `Guild ${guildId}` }, mapId: data.worldName || 'unknown_map',
      lastUpdate: data.lastUpdate || Date.now(), provinces: provinces, participantsById: {}, _rawParticipants: [],
    };
  }

function listenToFirebase(guildPath) {
    if (guildPath === lastKnownGuildPath && firebaseUnsubscribeCallback) {
        return firebaseInitialValuePromise;
    }
    if (firebaseUnsubscribeCallback && lastKnownGuildPath) {
        db.ref(`${lastKnownGuildPath}/GBG`).off('value', firebaseUnsubscribeCallback);
        console.log(`[Firebase Listen] Зупинено прослуховування ${lastKnownGuildPath}/GBG`);
    }
    lastKnownGuildPath = guildPath;
    firebaseInitialValueReceived = false;
    lastKnownGainAttritionChanceBySector = Object.create(null);
    lastKnownPlayerLeaderboard = { mapId: null, players: Object.create(null) };
    lastKnownFirebaseGuildData = null;
    lastSeenWriteTime = 0;
    const initialValuePromise = new Promise(resolve => {
        resolveFirebaseInitialValue = resolve;
    });
    const lastSeenStorageKey = `firebaseLastSeen:${guildPath}`;
    const restoreLastSeenPromise = chrome.storage.session.get(lastSeenStorageKey).then(stored => {
        if (lastKnownGuildPath !== guildPath) return;
        const storedLastSeen = Number(stored?.[lastSeenStorageKey]);
        if (Number.isFinite(storedLastSeen)) lastSeenWriteTime = storedLastSeen;
    }).catch(error => {
        console.warn('[Firebase Sync] Не вдалося відновити локальний час lastSeen:', error);
    });
    firebaseInitialValuePromise = Promise.all([initialValuePromise, restoreLastSeenPromise]).then(() => undefined);
    chrome.storage.session.set({ lastKnownGuildPath });
    const guildRef = db.ref(`${guildPath}/GBG`);
    console.log(`[Firebase Listen] Початок прослуховування шляху: ${guildPath}/GBG`);
    
    firebaseUnsubscribeCallback = guildRef.on('value', (snapshot) => {
        const gbgData = snapshot.val();
        const data = { GBG: gbgData && typeof gbgData === 'object' ? gbgData : null };
        lastKnownFirebaseGuildData = data;
        const firebaseSectors = data.GBG?.sectors || {};
        const knownValues = Object.create(null);
        Object.entries(firebaseSectors).forEach(([short, sector]) => {
            if (sector && Object.prototype.hasOwnProperty.call(sector, 'gainAttritionChance')) {
                knownValues[short] = sector.gainAttritionChance;
            }
        });
        lastKnownGainAttritionChanceBySector = knownValues;
        lastKnownPlayerLeaderboard = normalizePlayerLeaderboard(data.GBG?.PlayerLeaderboard);

        if (!firebaseInitialValueReceived) {
            firebaseInitialValueReceived = true;
            resolveFirebaseInitialValue?.();
            resolveFirebaseInitialValue = null;
        }
        if (data) {
            console.log('%c[Firebase Listen] Отримано оновлення з Firebase!', 'color: cyan');
            const stateForPopup = firebaseDataToState(data, guildPath);
            
            if (stateForPopup) {
                chrome.runtime.sendMessage({ type: 'GBG_PUSH', payload: stateForPopup, source: 'firebase' }).catch(() => {});

            }

        }
    }, (error) => {
        resolveFirebaseInitialValue?.();
        resolveFirebaseInitialValue = null;
        console.error('[Firebase Listen] Помилка підписки на оновлення:', error);
        lastKnownGuildPath = null;
        firebaseUnsubscribeCallback = null;
    });
    return firebaseInitialValuePromise;
}

// async function registerUserInFirebase(state) {
//     if (!state?.myPlayer?.id || !state?.myGuild?.id) {
//         console.warn('[User Register] Не вдалося зареєструвати користувача: відсутній ID гравця або гільдії.');
//         return;
//     }

//     const userId = state.myPlayer.id;
//     const userName = state.myPlayer.name || 'Unknown Player';
//     const clanId = state.myGuild.id;

//     const userPath = `users/${userId}`;
//     const userData = {
//         username: userName,
//         clan: clanId
//     };

//     try {
//         await db.ref(userPath).update(userData);
//         console.log(`%c[User Register] Успішно оновлено дані для користувача ${userName} (ID: ${userId})`, 'color: skyblue;');
//     } catch (error) {
//         console.error(`[User Register] Помилка при реєстрації користувача ${userId}:`, error);
//     }
// }

async function syncAllGuildsToFirebase(state, tabUrl) {
    if (!FIREBASE_WRITES_ENABLED) return;
    console.log('%c[Firebase Sync] ВХІД у функцію синхронізації.', 'color: orange');

    if (!state?.myGuild?.id) {
        console.error('[Firebase Sync] ПРЕРВАНО: Неможливо визначити ID вашої гільдії. Синхронізація неможлива.');
        return;
    }

    if (!state || !Array.isArray(state._rawParticipants) || !tabUrl) {
        console.error('[Firebase Sync] ПРЕРВАНО: відсутні повні дані стану (state) або URL вкладки.');
        return;
    }

    let worldName;
    try {
        worldName = new URL(tabUrl).hostname.split('.')[0];
    } catch (e) {
        console.error('[Firebase Sync] ПРЕРВАНО: не вдалося отримати worldName з URL:', tabUrl);
        return;
    }

    const myGuildId = state.myGuild.id;
    const guildPath = `guilds/${worldName}_${myGuildId}`;
    
    console.log(`%c[Firebase Sync] Цільовий шлях для оновлення: ${guildPath}`, 'color: yellow; font-weight: bold;');
    
    await listenToFirebase(guildPath);

    const opponents = (state._rawParticipants || []).map(p => {
        if (!p || !p.clan) return null;
        const hq = state.provinces.find(prov => prov.ownerId === p.participantId && prov.totalBuildingSlots === 1);
        const color = state.provinces.find(prov => prov.ownerId === p.participantId && prov.ownerColor)?.ownerColor;
        const sectorColor = String(p.clan.id) === String(myGuildId)
          ? MY_GUILD_SECTOR_COLOR
          : (color || '#cccccc');
        return { id: p.clan.id, participantId: p.participantId, name: p.clan.name, sectorColor, staff: hq?.short || null };
    }).filter(Boolean);

    const firebaseData = lastKnownFirebaseGuildData || {};
    const firebaseGbg = firebaseData.GBG || {};
    const updates = {};
    const nextMap = state.mapId || 'unknown_map';
    if (!sameFirebaseValue(firebaseGbg.map, nextMap)) {
        updates[`${guildPath}/GBG/map`] = nextMap;
    }
    if (!sameFirebaseValue(firebaseGbg.opponents || [], opponents)) {
        updates[`${guildPath}/GBG/opponents`] = opponents;
    }
    let nextPlayerLeaderboard = null;
    let changedPlayerLeaderboardEntries = 0;
    if (state.playerLeaderboard?.players && Object.keys(state.playerLeaderboard.players).length) {
        nextPlayerLeaderboard = normalizePlayerLeaderboard({
            mapId: state.playerLeaderboard.mapId ?? state.mapId ?? 'unknown_map',
            players: state.playerLeaderboard.players,
        }, true);
        const leaderboardPath = `${guildPath}/GBG/PlayerLeaderboard`;

        if (!Object.is(lastKnownPlayerLeaderboard.mapId, nextPlayerLeaderboard.mapId)) {
            updates[`${leaderboardPath}/mapId`] = nextPlayerLeaderboard.mapId;
        }

        Object.entries(nextPlayerLeaderboard.players).forEach(([playerId, entry]) => {
            const previous = lastKnownPlayerLeaderboard.players[playerId];
            if (
                !previous ||
                previous.negotiationsWon !== entry.negotiationsWon ||
                previous.battlesWon !== entry.battlesWon ||
                previous.rank !== entry.rank ||
                previous.attrition !== entry.attrition
            ) {
                updates[`${leaderboardPath}/${playerId}`] = entry;
                changedPlayerLeaderboardEntries += 1;
            }
        });

        Object.keys(lastKnownPlayerLeaderboard.players).forEach(playerId => {
            if (!Object.prototype.hasOwnProperty.call(nextPlayerLeaderboard.players, playerId)) {
                updates[`${leaderboardPath}/${playerId}`] = null;
                changedPlayerLeaderboardEntries += 1;
            }
        });
    }
    const changedGainAttritionValues = Object.create(null);

    state.provinces.forEach(p => {
        if (!p.short) return;
        const sectorPath = `${guildPath}/GBG/sectors/${p.short}`;
        const storedSector = firebaseGbg.sectors?.[p.short] || {};
        const nextSectorValues = {
            army: p.isAttackBattleType ? 'attack' : 'defense',
            openTime: p.lockedUntil || 0,
            owner: p.ownerClanId || 0,
            buildings: p.buildings || [],
        };
        for (const [field, value] of Object.entries(nextSectorValues)) {
            const storedValue = field === 'buildings' ? (storedSector[field] || []) : storedSector[field];
            if (!sameFirebaseValue(storedValue, value)) {
                updates[`${sectorPath}/${field}`] = value;
            }
        }

        const gainAttritionChance = p.gainAttritionChance;
        const hasStoredValue = Object.prototype.hasOwnProperty.call(
            lastKnownGainAttritionChanceBySector,
            p.short
        );
        if (
            gainAttritionChance != null &&
            (!hasStoredValue || !Object.is(lastKnownGainAttritionChanceBySector[p.short], gainAttritionChance))
        ) {
            updates[`${sectorPath}/gainAttritionChance`] = gainAttritionChance;
            changedGainAttritionValues[p.short] = gainAttritionChance;
        }
    });

    const changedDataPaths = Object.keys(updates);
    const now = Date.now();
    const isHeartbeatDue = changedDataPaths.length === 0 &&
        now - lastSeenWriteTime >= LAST_SEEN_INTERVAL_MS;

    if (changedDataPaths.length > 0) {
        updates[`${guildPath}/lastUpdate`] = serverTimestamp;
    } else if (isHeartbeatDue) {
        updates[`${guildPath}/lastSeen`] = serverTimestamp;
    } else {
        console.log('[Firebase Sync] Дані не змінилися; запис у Firebase пропущено.');
        return;
    }

    try {
        await db.ref().update(updates);
        const nextCachedData = lastKnownFirebaseGuildData && typeof lastKnownFirebaseGuildData === 'object'
            ? structuredClone(lastKnownFirebaseGuildData)
            : {};
        for (const [absolutePath, value] of Object.entries(updates)) {
            if (value === serverTimestamp) continue;
            setCachedFirebaseValue(nextCachedData, absolutePath.slice(guildPath.length + 1), value);
        }
        lastKnownFirebaseGuildData = nextCachedData;
        if (isHeartbeatDue) {
            lastSeenWriteTime = now;
            const lastSeenStorageKey = `firebaseLastSeen:${guildPath}`;
            chrome.storage.session.set({ [lastSeenStorageKey]: now }).catch(error => {
                console.warn('[Firebase Sync] Не вдалося зберегти локальний час lastSeen:', error);
            });
        }
        Object.assign(lastKnownGainAttritionChanceBySector, changedGainAttritionValues);
        if (nextPlayerLeaderboard) {
            lastKnownPlayerLeaderboard = nextPlayerLeaderboard;
            console.log(`[Firebase Sync] PlayerLeaderboard: змінено записів ${changedPlayerLeaderboardEntries}.`);
        }
        console.log(`%c[Firebase Sync] УСПІХ! Дані для гільдії ${state.myGuild.name} оновлено.`, 'color: lime; font-weight: bold;');
    } catch (error) {
        console.error(`[Firebase Sync] ПОМИЛКА під час оновлення даних для гільдії ${state.myGuild.name}:`, error);
    }
    
    console.log('%c[Firebase Sync] Завершено сеанс синхронізації.', 'color: orange;');
}

  function queueFirebaseSync(state, tabUrl) {
    pendingFirebaseSync = { state, tabUrl };
    if (firebaseSyncInFlight) return;

    firebaseSyncInFlight = true;
    void (async () => {
      while (pendingFirebaseSync) {
        const nextSync = pendingFirebaseSync;
        pendingFirebaseSync = null;
        await syncAllGuildsToFirebase(nextSync.state, nextSync.tabUrl);
      }
    })().catch(error => {
      console.error('[Firebase Sync] Помилка черги синхронізації:', error);
    }).finally(() => {
      firebaseSyncInFlight = false;
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[Background Script] ОТРИМАВ ПОВІДОМЛЕННЯ! Тип:', msg.type, 'Від:', sender.url);
    if (!msg || !msg.type) return true;
    
    if (msg.type === 'GBG_PUSH' && msg.source !== 'firebase') {
      console.log('[Background Script] Повідомлення GBG_PUSH отримано. Починаю обробку...');
      latestState = msg.payload || null;
      if (sender?.tab?.id) lastSourceTabId = sender.tab.id;
      
      chrome.storage.session.set({ latestState });
      chrome.runtime.sendMessage({ type: 'GBG_PUSH', payload: latestState }).catch(()=>{});
      
      // if (!userRegisteredThisSession && latestState?.myPlayer?.id) {
      //   registerUserInFirebase(latestState);
      //   userRegisteredThisSession = true;
      // }

      const now = Date.now();
      if (now - lastSyncTime > SYNC_DEBOUNCE_MS) {
        lastSyncTime = now;
        if (sender.tab?.url) queueFirebaseSync(latestState, sender.tab.url);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'GET_STATE') {
      if (latestState) { sendResponse({ ok: true, state: latestState });
      } else {
        chrome.storage.session.get(['latestState', 'lastKnownGuildPath']).then(obj => {
          latestState = obj.latestState || null;
          lastKnownGuildPath = obj.lastKnownGuildPath || null;
          sendResponse({ ok: !!latestState, state: latestState });
        });
      }
      return true;
    }

    if (msg.type === 'GET_GUILD_PATH') {
      if (lastKnownGuildPath) { sendResponse({ ok: true, path: lastKnownGuildPath });
      } else {
        chrome.storage.session.get('lastKnownGuildPath').then(obj => {
          lastKnownGuildPath = obj?.lastKnownGuildPath || null;
          sendResponse({ ok: !!lastKnownGuildPath, path: lastKnownGuildPath });
        });
      }
      return true;
    }
    if (msg.type === 'GET_STATE_FROM_FIREBASE') {
      const { guildPath } = msg;
      if (!guildPath) { sendResponse({ ok: false }); return true; }
      listenToFirebase(guildPath).then(() => {
        const data = lastKnownFirebaseGuildData;
        const state = data?.GBG ? firebaseDataToState(data, guildPath) : null;
        sendResponse({ ok: !!state, state });
      }).catch(() => sendResponse({ ok: false }));
      return true;
    }
  });

  chrome.storage.session.get('lastKnownGuildPath').then(obj => {
    if (obj.lastKnownGuildPath) {
      listenToFirebase(obj.lastKnownGuildPath);
    }
  });

  console.log('Firebase ініціалізовано, слухачі повідомлень активовані.');

} else {
  console.error('Критична помилка: Об\'єкт Firebase не було знайдено після завантаження скриптів.');
}
