(function () {
    let MY_GUILD_ID = null;
    const MY_GUILD_SECTOR_COLOR = '#CDCDCD';

    const SHORT_LUT = {
        volcano_archipelago: 'A1M,B1O,C1N,D1B,A2S,A2T,B2S,B2T,C2S,C2T,D2S,D2T,A3V,A3X,A3Y,A3Z,B3V,B3X,B3Y,B3Z,C3V,C3X,C3Y,C3Z,D3V,D3X,D3Y,D3Z,A4A,A4B,A4C,A4D,A4E,A4F,A4G,A4H,B4A,B4B,B4C,B4D,B4E,B4F,B4G,B4H,C4A,C4B,C4C,C4D,C4E,C4F,C4G,C4H,D4A,D4B,D4C,D4D,D4E,D4F,D4G,D4H'.split(','),
        waterfall_archipelago: 'X1X,A2A,B2A,C2A,D2A,E2A,F2A,A3A,A3B,B3A,B3B,C3A,C3B,D3A,D3B,E3A,E3B,F3A,F3B,A4A,A4B,A4C,B4A,B4B,B4C,C4A,C4B,C4C,D4A,D4B,D4C,E4A,E4B,E4C,F4A,F4B,F4C,A5A,A5B,A5C,A5D,B5A,B5B,B5C,B5D,C5A,C5B,C5C,C5D,D5A,D5B,D5C,D5D,E5A,E5B,E5C,E5D,F5A,F5B,F5C,F5D'.split(',')
    };
    const codeById = (mapId, id) => (SHORT_LUT[mapId] && SHORT_LUT[mapId][id]) || null;
    const st = {
        mapId: null, lastUpdate: 0, participantsById: {}, _rawParticipants: [], clanIdByParticipantId: {},
        colorsByKey: {}, colorByParticipant: {}, provinces: Object.create(null), validIds: new Set(),
        playerLeaderboard: null,
        myGuild: {},
        myPlayer: { id: null, name: null }
    };
    let authenticatedSocket = null;

    const labelBuildings = arr => arr.map(b => (b?.name || b?.type || b?.buildingType || b?.id || 'невідомо')).filter(Boolean);
    function extractBuildingsAndSlots(src) { let sawField = false; const list = []; let slots = null; if ('buildingSlots' in src) { sawField = true; if (Array.isArray(src.buildingSlots)) { slots = src.totalBuildingSlots ?? src.buildingSlots.length ?? null; src.buildingSlots.forEach(s => { if (s?.building) list.push(s.building); }); } } ['buildings', 'gbgBuildings'].forEach(k => { if (k in src && Array.isArray(src[k])) { sawField = true; list.push(...src[k]); } }); if ('placedBuildings' in src) { sawField = true; if (Array.isArray(src.placedBuildings)) { list.push(...src.placedBuildings); } } return { sawField, names: labelBuildings(list), slots }; }
    function hslFallbackForParticipant(pid){ const s = String(pid); let h = 0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) % 360; return `hsl(${h} 65% 55%)`; }

    function learnColors(data) {
        if (!Array.isArray(data) || !data.length || Object.keys(st.colorsByKey).length > 0) return false;
        const firstEl = data[0] || {};
        if (typeof firstEl.id !== 'string' || typeof firstEl.mainColour !== 'string') return false;

        console.log('%c[GBG Scan] ЗНАЙДЕНО І ЗАВАНТАЖЕНО ПАЛІТРУ КОЛЬОРІВ!', 'color: lime; font-weight: bold; font-size: 14px;');
        const byKey = {};
        data.forEach(c => { if (c?.id) byKey[c.id] = c; });
        st.colorsByKey = byKey;
        rebuildParticipantColors();
        recomputeOwnerColors();
        touch();
        return true;
    }

    function rebuildParticipantColors(){
        if (Object.keys(st.colorsByKey).length === 0) return;
        const map = {};
        const palette = st.colorsByKey;
        st._rawParticipants.forEach(p => {
            const pid = p?.participantId; if (!pid) return;
            const key = p?.colourId || p?.colorId || p?.colour || p?.color || null;
            map[pid] = (key && palette[key]?.mainColour) ? palette[key].mainColour : hslFallbackForParticipant(pid);
        });
        st.colorByParticipant = map;
    }

    const isMyGuild = ownerClanId => MY_GUILD_ID != null && ownerClanId != null && String(ownerClanId) === String(MY_GUILD_ID);
    const colorForOwner = (ownerId, ownerClanId, previousColor = null) => {
        if (isMyGuild(ownerClanId)) return MY_GUILD_SECTOR_COLOR;
        if (ownerId == null) return previousColor;
        return st.colorByParticipant[ownerId] || hslFallbackForParticipant(ownerId);
    };
    function recomputeOwnerColors(){
        for (const k of Object.keys(st.provinces)) {
            const p = st.provinces[k];
            p.ownerColor = colorForOwner(p.ownerId, p.ownerClanId, p.ownerColor) || null;
        }
    }
    
    const emitEvent = (eventType, data) => {
        window.dispatchEvent(new CustomEvent('foe:gbg-event', { detail: { eventType, ...data } }));
    };

function upsertProv(src, { allowUnknown = false } = {}) {
    if (!src) return;
    let id = src.id ?? src.provinceId ?? src.provId;
    if (id == null) id = 0;
    
    const cur = st.provinces[id] || {};
    const now = Math.floor(Date.now() / 1000);

    const newOwnerId = src.ownerId ?? src.owner?.id ?? null;

    if (newOwnerId !== null && cur.ownerId !== undefined && newOwnerId !== cur.ownerId) {
        emitEvent('owner_changed', { provinceId: id, provinceShort: codeById(st.mapId, id) || `ID:${id}`, newOwnerId: newOwnerId, newOwnerName: src.owner?.name || (st.participantsById[newOwnerId] || `Guild ${newOwnerId}`), oldOwnerId: cur.ownerId });
    }
    const newLockedUntil = src.lockedUntil ?? null;
    if (newLockedUntil !== (cur.lockedUntil ?? null)) {
        const isNowLocked = newLockedUntil && newLockedUntil > now;
        const wasLocked = cur.lockedUntil && cur.lockedUntil > now;
        if (isNowLocked && !wasLocked) emitEvent('status_changed', { provinceId: id, provinceShort: codeById(st.mapId, id) || `ID:${id}`, status: 'locked', lockedUntil: newLockedUntil });
        else if (!isNowLocked && wasLocked) emitEvent('status_changed', { provinceId: id, provinceShort: codeById(st.mapId, id) || `ID:${id}`, status: 'unlocked' });
    }
    
    const ownerId = newOwnerId ?? cur.ownerId ?? null;
    const ownerChanged = (cur.ownerId !== undefined && ownerId !== cur.ownerId);
    
    const ownerClanId = ownerId ? (st.clanIdByParticipantId[ownerId] || cur.ownerClanId || null) : null;
    
    
    const { sawField, names } = extractBuildingsAndSlots(src);
    if (isMyGuild(ownerClanId) && sawField) {
        const oldBuildings = new Set(cur.buildings || []); const newBuildings = new Set(names || []);
        if (newBuildings.size > oldBuildings.size && oldBuildings.size > 0) emitEvent('construction_finished', { provinceId: id, provinceShort: codeById(st.mapId, id) || `ID:${id}`, ownerClanId: ownerClanId, buildings: names });
    }

    const title = src.name ?? src.title ?? cur.title ?? `Province ${id}`;
    let short = cur.short || null;
    if (!short && title) { const t = String(title); const i = t.indexOf(':'); if (i > 0) short = t.slice(0, i).trim(); }
    if (!short) short = codeById(st.mapId, id);
    
    const ownerName = ownerId != null ? (st.participantsById[ownerId] || src.owner?.name || cur.ownerName || '') : (src.owner?.name || cur.ownerName || '');
    const ownerColor = colorForOwner(ownerId, ownerClanId, cur.ownerColor) || null;
    const { slots } = extractBuildingsAndSlots(src);
    let buildings;
    if (ownerChanged) { buildings = []; } else if (sawField) { buildings = names; } else { buildings = cur.buildings || []; }
    const totalSlots = (slots != null) ? slots : (src.totalBuildingSlots ?? cur.totalBuildingSlots ?? null);
    
    st.provinces[id] = { id, short, title, ownerId, ownerClanId, ownerName, ownerColor, lockedUntil: src.lockedUntil ?? cur.lockedUntil ?? null, totalBuildingSlots: totalSlots, isAttackBattleType: (src.isAttackBattleType ?? (src.battleType === 'red') ?? cur.isAttackBattleType) ? true : false, gainAttritionChance: src.gainAttritionChance ?? cur.gainAttritionChance ?? null, buildings };
}

    function serialize(){ 
        const now = Math.floor(Date.now()/1000); 
        const arr = Object.values(st.provinces).sort((a,b)=>{ const aL = Number.isFinite(a.lockedUntil) && a.lockedUntil > now; const bL = Number.isFinite(b.lockedUntil) && b.lockedUntil > now; if (aL && bL) return a.lockedUntil - b.lockedUntil; if (aL && !bL) return -1; if (!aL && bL) return 1; return (a.short || a.title || '').localeCompare((b.short || b.title || ''), 'uk'); }); 
        return { mapId: st.mapId, lastUpdate: st.lastUpdate, participantsById: st.participantsById, provinces: arr, playerLeaderboard: st.playerLeaderboard, myGuild: st.myGuild, myPlayer: st.myPlayer, _rawParticipants: st._rawParticipants }; 
    }
    const emit  = () => window.dispatchEvent(new CustomEvent('foe:gbg-update', { detail: serialize() }));
    const touch = () => { st.lastUpdate = Date.now(); emit(); };
    window.addEventListener('message', e => { if (e?.data?.type === 'foe:get-state') window.postMessage({ type:'foe:state', state: serialize() }, '*'); });

    function onGetBattleground(rd, sourceSocket){
        const data = Array.isArray(rd) ? rd[0] : rd; if (!data) return;

        if (!authenticatedSocket) { authenticatedSocket = sourceSocket; console.log('%c[GBG Scan] Головний ігровий сокет визначено. Скрипт готовий!', 'color: lime; font-weight: bold;'); }
        st.mapId = data?.map?.id ?? st.mapId;
        st.participantsById = {}; 
        
        st._rawParticipants = (data?.battlegroundParticipants || []).filter(p => p && p.clan && p.clan.id && p.participantId).slice();
        
        st.clanIdByParticipantId = {}; 
        st._rawParticipants.forEach(p=>{ 
            st.participantsById[p.participantId] = p.clan.name || `Guild ${p.participantId}`; 
            st.clanIdByParticipantId[p.participantId] = p.clan.id; 
        });
        
        rebuildParticipantColors(); 
        st.validIds.clear(); 
        (data?.map?.provinces || []).forEach(pr => { 
            const pid = pr.id ?? pr.provinceId ?? pr.provId; 
            if (Number.isInteger(pid)) st.validIds.add(pid); 
            upsertProv(pr, { allowUnknown:true }); 
        });
        recomputeOwnerColors();
        touch(); 
        console.log('[GBG Scan] Карта Полів Битв завантажена/оновлена.'); 
    }
    
    function onAllLike(rd){ 
        (Array.isArray(rd) ? rd : [rd]).forEach(pr => upsertProv(pr, { allowUnknown: false })); 
        recomputeOwnerColors();
        touch(); 
    }

    function onPlayerLeaderboard(rd) {
        const rows = Array.isArray(rd)
            ? rd
            : (Array.isArray(rd?.players) ? rd.players : (Array.isArray(rd?.participants) ? rd.participants : []));
        const players = Object.create(null);

        rows.forEach(row => {
            const playerId = row?.player?.player_id ?? row?.playerId ?? row?.player_id;
            const negotiationsWon = Number(row?.negotiationsWon ?? 0);
            const battlesWon = Number(row?.battlesWon);
            const rank = Number(row?.rank);
            const attrition = Number(row?.attrition);
            if (playerId == null || !Number.isInteger(negotiationsWon) || !Number.isInteger(battlesWon) || !Number.isInteger(rank) || !Number.isInteger(attrition)) return;
            players[String(playerId)] = { negotiationsWon, battlesWon, rank, attrition };
        });

        if (!Object.keys(players).length) return false;
        st.playerLeaderboard = { mapId: st.mapId ?? null, players };
        touch();
        console.log(`[GBG Scan] PlayerLeaderboard отримано: ${Object.keys(players).length} гравців.`);
        return true;
    }
    
function onAny(msg, sourceSocket){
    const rd = msg.responseData;
    const cls = msg.requestClass || '';
    const m = msg.requestMethod;

    if (MY_GUILD_ID === null && cls === 'StartupService' && m === 'getData') {
        const userData = rd.user_data;

        if (userData && userData.clan_id) {
            MY_GUILD_ID = userData.clan_id;
            st.myGuild = { id: MY_GUILD_ID, name: userData.clan_name || 'Моя гільдія' };
            st.myPlayer = { id: userData.player_id, name: userData.user_name };
            
            console.log(`%c[GBG Scan] ID ГІЛЬДІЇ УСПІШНО ВИЗНАЧЕНО: ${MY_GUILD_ID} (${st.myGuild.name})`, 'color: #00FF00; font-weight: bold; font-size: 16px; text-shadow: 1px 1px 0 #000;');
            console.log(`%c[GBG Scan] ID ГРАВЦЯ ВИЗНАЧЕНО: ${st.myPlayer.id} (${st.myPlayer.name})`, 'color: #FFFF00; font-weight: bold; font-size: 16px; text-shadow: 1px 1px 0 #000;');

            recomputeOwnerColors();
            touch(); 

        } else {
            console.error("[GBG Scan] Помилка: Отримано пакет StartupService.getData, але в ньому немає `user_data` або `user_data.clan_id`.", rd);
        }
    }
    
    if (!/^GuildBattleground/i.test(cls)) return;
    if (m === 'getBattleground' || m === 'getState') {
        return onGetBattleground(rd, sourceSocket);
    }
    const leaderboardRows = Array.isArray(rd)
        ? rd
        : (Array.isArray(rd?.players) ? rd.players : (Array.isArray(rd?.participants) ? rd.participants : []));
    if (
        /leaderboard/i.test(String(m || '')) ||
        leaderboardRows.some(row => row?.__class__ === 'GuildBattlegroundPlayerParticipantLeaderboard')
    ) {
        if (onPlayerLeaderboard(rd)) return;
    }
    if (rd != null) return onAllLike(rd);
}

    function processGenericResponse(text, sourceSocket) {
        try {
            const json = JSON.parse(text);
            const messages = Array.isArray(json) ? json : [json];
            for (const msg of messages) {
                if (msg && 'responseData' in msg && 'requestClass' in msg) {
                    onAny(msg, sourceSocket);
                }
            }
        } catch (e) {}
    }

    function processHttpRequest(url, text) {
        if (!text || (text[0] !== '{' && text[0] !== '[')) return;
        if (url && url.includes('battleground_colour')) {
            try { learnColors(JSON.parse(text)); } catch (e) {}
        } else {
            processGenericResponse(text, null);
        }
    }

    const NativeWS = window.WebSocket; 
    window.WebSocket = function(url, protocols){
        const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
        ws.addEventListener('message', (evt) => { if (typeof evt.data === 'string') { processGenericResponse(evt.data, ws); } });
        return ws;
    }; 
    window.WebSocket.prototype = NativeWS.prototype;
    
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send; 
    XMLHttpRequest.prototype.open = function(...args){ this.__reqUrl = args[1]; return XO.apply(this, args); }; 
    XMLHttpRequest.prototype.send = function(...args){ 
        this.addEventListener('load', function(){ 
            if (this.responseType === '' || this.responseType === 'text') {
                processHttpRequest(this.__reqUrl, this.responseText);
            }
        }); 
        return XS.apply(this, args); 
    };

    console.log("%c[GBG Scan] Скрипт запущено. Очікування даних...", "color: cyan; font-weight: bold;");
})();
