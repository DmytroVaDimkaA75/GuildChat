import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useContext, useEffect, useState } from 'react';
import { GuildContext } from '../../../GuildContext';
import {
    calculateSectorBonus,
    DEFAULT_MAP_KEY,
    getMapDimensions,
    getNeighborIdsForSectors,
    MAP_DATA,
    parseStaffSectors,
} from './gbgWidgetUtils';

const useGbgWidgetData = () => {
    const { guildId } = useContext(GuildContext);
    const [currentMap, setCurrentMap] = useState(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [sectorSnapshot, setSectorSnapshot] = useState(null);
    const [isSectorDataLoaded, setIsSectorDataLoaded] = useState(false);
    const [opponentMapById, setOpponentMapById] = useState({});
    const [opponentStaffSectors, setOpponentStaffSectors] = useState({});
    const [areOpponentsLoaded, setAreOpponentsLoaded] = useState(false);
    const [sectorColors, setSectorColors] = useState({});
    const [sectorStaff, setSectorStaff] = useState({});
    const [sectorSchedule, setSectorSchedule] = useState([]);
    const [shortGuildId, setShortGuildId] = useState(null);
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

    useEffect(() => {
        let isActive = true;
        (async () => {
            try {
                const storedId = await AsyncStorage.getItem('guildId');
                const effectiveId = guildId || storedId;
                if (!isActive || !effectiveId) { setShortGuildId(null); return; }
                const parts = String(effectiveId).split('_');
                const shortId = parts.length > 1 ? parts[parts.length - 1] : parts[0];
                setShortGuildId(shortId);
            } catch (error) {
                if (isActive) setShortGuildId(null);
            }
        })();
        return () => { isActive = false; };
    }, [guildId]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let mapRef;
        let onMapUpdate;
        setIsMapLoaded(false);
        setCurrentMap(null);
        setIsSectorDataLoaded(false);
        (async () => {
            const id = guildId || await AsyncStorage.getItem('guildId');
            if (!id) { setCurrentMap(DEFAULT_MAP_KEY); setIsMapLoaded(true); return; }
            mapRef = database().ref(`guilds/${id}/GBG/map`);
            onMapUpdate = snap => {
                let nextMap = DEFAULT_MAP_KEY;
                if (snap.exists()) {
                    const value = snap.val();
                    if (typeof value === 'string' && MAP_DATA[value]) nextMap = value;
                }
                setCurrentMap(nextMap);
                setIsMapLoaded(true);
            };
            mapRef.on('value', onMapUpdate);
        })();
        return () => { if (mapRef && onMapUpdate) mapRef.off('value', onMapUpdate); };
    }, [guildId]);

    useEffect(() => {
        let opponentsRef;
        let onOpponentsUpdate;
        setAreOpponentsLoaded(false);
        setOpponentMapById({});
        setOpponentStaffSectors({});
        (async () => {
            const id = guildId || await AsyncStorage.getItem('guildId');
            if (!id) { setOpponentStaffSectors({}); setAreOpponentsLoaded(true); return; }
            opponentsRef = database().ref(`guilds/${id}/GBG/opponents`);
            onOpponentsUpdate = snap => {
                if (snap.exists()) {
                    const raw = snap.val() || {};
                    const byId = {};
                    const staffFlags = {};
                    Object.entries(raw).forEach(([key, value]) => {
                        if (value && typeof value === 'object') {
                            const normalizedId = value.id != null ? String(value.id) : String(key);
                            const sectorColor = value.sectorColor ? String(value.sectorColor) : '#FFFFFF';
                            const staffSectors = parseStaffSectors(value.staff);
                            byId[normalizedId] = {
                                key,
                                id: normalizedId,
                                name: value.name || normalizedId,
                                sectorColor,
                            };
                            staffSectors.forEach(sectorId => { if (sectorId) staffFlags[sectorId] = true; });
                        }
                    });
                    setOpponentMapById(byId);
                    setOpponentStaffSectors(staffFlags);
                } else {
                    setOpponentMapById({});
                    setOpponentStaffSectors({});
                }
                setAreOpponentsLoaded(true);
            };
            opponentsRef.on('value', onOpponentsUpdate);
        })();
        return () => { if (opponentsRef && onOpponentsUpdate) opponentsRef.off('value', onOpponentsUpdate); };
    }, [guildId]);

    useEffect(() => {
        if (!isMapLoaded) return;
        let sectorsRef;
        let onSectorsUpdate;
        (async () => {
            const id = guildId || await AsyncStorage.getItem('guildId');
            if (!id) { setSectorSnapshot(null); setIsSectorDataLoaded(true); return; }
            sectorsRef = database().ref(`guilds/${id}/GBG/sectors`);
            onSectorsUpdate = snap => {
                setSectorSnapshot(snap.exists() ? snap.val() : null);
                setIsSectorDataLoaded(true);
            };
            sectorsRef.on('value', onSectorsUpdate);
        })();
        return () => { if (sectorsRef && onSectorsUpdate) sectorsRef.off('value', onSectorsUpdate); };
    }, [guildId, isMapLoaded]);

    const mapKey = currentMap ?? DEFAULT_MAP_KEY;
    const mapDimensions = getMapDimensions(mapKey);

    useEffect(() => {
        if (!isMapLoaded || !areOpponentsLoaded) return;
        const data = sectorSnapshot && typeof sectorSnapshot === 'object' ? sectorSnapshot : {};
        const mapData = MAP_DATA[mapKey] || {};
        const sectorIds = Object.keys(mapData);
        if (sectorIds.length === 0) { setSectorColors({}); setSectorStaff({}); setSectorSchedule([]); return; }

        const colors = {};
        const staffFlags = {};
        const availableSectors = new Set(sectorIds);
        sectorIds.forEach(gid => {
            const entry = data[gid];
            let color = '#FFFFFF';
            let staff = false;
            let ownerValue = null;
            if (entry && typeof entry === 'object') {
                if (typeof entry.color === 'string') color = entry.color;
                ownerValue = entry.owner ?? entry.ownerId;
                if (ownerValue !== null) {
                    const ownerKey = String(ownerValue);
                    if (ownerKey === '0') {
                        color = '#FFFFFF';
                    } else {
                        const opponent = opponentMapById[ownerKey];
                        color = opponent?.sectorColor ? String(opponent.sectorColor) : (typeof entry.color === 'string' ? entry.color : '#FFFFFF');
                    }
                }
                staff = !!entry.staff;
            } else if (typeof entry === 'string') {
                color = entry;
            }
            colors[gid] = color || '#FFFFFF';
            staffFlags[gid] = staff;
        });
        Object.keys(opponentStaffSectors).forEach(sectorId => {
            if (opponentStaffSectors[sectorId] && availableSectors.has(sectorId)) staffFlags[sectorId] = true;
        });
        setSectorColors(colors);
        setSectorStaff(staffFlags);
    }, [areOpponentsLoaded, isMapLoaded, mapKey, opponentMapById, opponentStaffSectors, sectorSnapshot]);

    useEffect(() => {
        if (!isMapLoaded || !shortGuildId) { setSectorSchedule([]); return; }
        const data = sectorSnapshot && typeof sectorSnapshot === 'object' ? sectorSnapshot : {};
        const mapData = MAP_DATA[mapKey] || {};
        const sectorIds = Object.keys(mapData);
        if (sectorIds.length === 0) { setSectorSchedule([]); return; }

        const ownSectors = sectorIds.filter(id => String(data[id]?.owner ?? data[id]?.ownerId) === String(shortGuildId));
        if (ownSectors.length === 0) { setSectorSchedule([]); return; }
        const neighborIds = getNeighborIdsForSectors(mapKey, ownSectors);
        if (neighborIds.length === 0) { setSectorSchedule([]); return; }

        const schedule = neighborIds.map(sectorId => {
            const entry = data[sectorId];
            if (!entry || typeof entry !== 'object') return null;
            const openTime = Number(entry.openTime);
            if (!Number.isFinite(openTime) || openTime <= 0) return null;
            const armyRaw = String(entry.army || '').trim().toLowerCase();
            const bonusInfo = calculateSectorBonus({ mapKey, sectorId, sectors: data, shortGuildId });
            return { name: sectorId, openTime, army: armyRaw === 'attack' || armyRaw === 'defense' ? armyRaw : '', bonusValue: bonusInfo.value, bonusReadyAt: bonusInfo.readyAt };
        }).filter(Boolean).sort((a, b) => a.openTime - b.openTime);
        setSectorSchedule(schedule);
    }, [isMapLoaded, mapKey, sectorSnapshot, shortGuildId]);

    return {
        currentTime,
        isReady: isMapLoaded && isSectorDataLoaded && areOpponentsLoaded,
        mapDimensions,
        mapKey,
        sectorColors,
        sectorSchedule,
        sectorStaff,
    };
};

export default useGbgWidgetData;
