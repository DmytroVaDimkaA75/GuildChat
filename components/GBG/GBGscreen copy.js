import { faFire } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ИЗМЕНЕНО
import functions from '@react-native-firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { GuildContext } from "../../GuildContext";
import { VOLCANIC_ARCHIPELAGO_DATA } from "./volcanicData";
import { WATERFALL_ARCHIPELAGO_DATA } from "./waterfallData";

const { height } = Dimensions.get('window');
const HALF_HEIGHT = height * 0.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const SECTOR_NEIGHBORS = {
  A2A: ['A3A', 'A3B', 'B2A', 'X1X', 'F2A', 'F3B'],
  A3A: ['A4A', 'A4B', 'A3B', 'A2A', 'F3B', 'F4C'],
  A3B: ['A4B', 'A4C', 'B3A', 'B2A', 'A2A', 'A3A'],
  A4A: ['A5A', 'A5B', 'A4B', 'A3A', 'F4C', 'F5D'],
  A4B: ['A5B', 'A5C', 'A4C', 'A3B', 'A3A', 'A4A'],
  A4C: ['A5C', 'A5D', 'B4A', 'B3A', 'A3B', 'A4B'],
  A5A: ['A5B', 'A4A', 'F5D'],
  A5B: ['A5C', 'A4B', 'A4A', 'A5A'],
  A5C: ['A5D', 'A4C', 'A4B', 'A5B'],
  A5D: ['B5A', 'B4A', 'A4C', 'A5C'],
  B2A: ['A3B', 'B3A', 'B3B', 'C2A', 'X1X', 'A2A'],
  B3A: ['A4C', 'B4A', 'B4B', 'B3B', 'B2A', 'A3B'],
  B3B: ['B3A', 'B4B', 'B4C', 'C3A', 'C2A', 'B2A'],
  B4A: ['A5D', 'B5A', 'B5B', 'B4B', 'B3A', 'A4C'],
  B4B: ['B4A', 'B5B', 'B5C', 'B4C', 'B3B', 'B3A'],
  B4C: ['B4B', 'B5C', 'B5D', 'C4A', 'C3A', 'B3B'],
  B5A: ['B5B', 'B4A', 'A5D'],
  B5B: ['B5A', 'B5C', 'B4B', 'B4A'],
  B5C: ['B5B', 'B5D', 'B4C', 'B4B'],
  B5D: ['B5C', 'C5A', 'C4A', 'B4C'],
  C2A: ['B2A', 'B3B', 'C3A', 'C3B', 'D2A', 'X1X'],
  C3A: ['B3B', 'B4C', 'C4A', 'C4B', 'C3B', 'C2A'],
  C3B: ['C2A', 'C3A', 'C4B', 'C4C', 'D3A', 'D2A'],
  C4A: ['B4C', 'B5D', 'C5A', 'C5B', 'C4B', 'C3A'],
  C4B: ['C3A', 'C4A', 'C5B', 'C5C', 'C4C', 'C3B'],
  C4C: ['C3B', 'C4B', 'C5C', 'C5D', 'D4A', 'D3A'],
  C5A: ['B5D', 'C5B', 'C4A'],
  C5B: ['C4A', 'C5A', 'C5C', 'C4B'],
  C5C: ['C4B', 'C5B', 'C5D', 'C4C'],
  C5D: ['C4C', 'C5C', 'D5A', 'D4A'],
  D2A: ['X1X', 'C2A', 'C3B', 'D3A', 'D3B', 'E2A'],
  D3A: ['D2A', 'C3B', 'C4C', 'D4A', 'D4B', 'D3B'],
  D3B: ['E2A', 'D2A', 'D3A', 'D4B', 'D4C', 'E3A'],
  D4A: ['D3A', 'C4C', 'C5D', 'D5A', 'D5B', 'D4B'],
  D4B: ['D3B', 'D3A', 'D4A', 'D5B', 'D5C', 'D4C'],
  D4C: ['E3A', 'D3B', 'D4B', 'D5C', 'D5D', 'E4A'],
  D5A: ['D4A', 'C5D', 'D5B'],
  D5B: ['D4B', 'D4A', 'D5A', 'D5C'],
  D5C: ['D4C', 'D4B', 'D5B', 'D5D'],
  D5D: ['E4A', 'D4C', 'D5C', 'E5A'],
  E2A: ['F2A', 'X1X', 'D2A', 'D3B', 'E3A', 'E3B'],
  E3A: ['E3B', 'E2A', 'D3B', 'D4C', 'E4A', 'E4B'],
  E3B: ['F3A', 'F2A', 'E2A', 'E3A', 'E4B', 'E4C'],
  E4A: ['E4B', 'E3A', 'D4C', 'D5D', 'E5A', 'E5B'],
  E4B: ['E4C', 'E3B', 'E3A', 'E4A', 'E5B', 'E5C'],
  E4C: ['F4A', 'F3A', 'E3B', 'E4B', 'E5C', 'E5D'],
  E5A: ['E5B', 'E4A', 'D5D'],
  E5B: ['E5C', 'E4B', 'E4A', 'E5A'],
  E5C: ['E5D', 'E4C', 'E4B', 'E5B'],
  E5D: ['F5A', 'F4A', 'E4C', 'E5C'],
  F2A: ['F3B', 'A2A', 'X1X', 'E2A', 'E3B', 'F3A'],
  F3A: ['F4B', 'F3B', 'F2A', 'E3B', 'E4C', 'F4A'],
  F3B: ['F4C', 'A3A', 'A2A', 'F2A', 'F3A', 'F4B'],
  F4A: ['F5B', 'F4B', 'F3A', 'E4C', 'E5D', 'F5A'],
  F4B: ['F5C', 'F4C', 'F3B', 'F3A', 'F4A', 'F5B'],
  F4C: ['F5D', 'A4A', 'A3A', 'F3B', 'F4B', 'F5C'],
  F5A: ['F5B', 'F4A', 'E5D'],
  F5B: ['F5C', 'F4B', 'F4A', 'F5A'],
  F5C: ['F5D', 'F4C', 'F4B', 'F5B'],
  F5D: ['A5A', 'A4A', 'F4C', 'F5C'],
  X1X: ['A2A', 'B2A', 'C2A', 'D2A', 'E2A', 'F2A'],
};

const WATERFALL_NEIGHBORS = {};

const DEFAULT_MAP_KEY = 'volcanic_archipelago';

const MAP_DIMENSIONS = {
  [DEFAULT_MAP_KEY]: {
    width: VOLCANIC_SVG_WIDTH,
    height: VOLCANIC_SVG_HEIGHT,
  },
  waterfall_archipelago: {
    width: WATERFALL_SVG_WIDTH,
    height: WATERFALL_SVG_HEIGHT,
  },
};

const MAP_NEIGHBORS = {
  [DEFAULT_MAP_KEY]: SECTOR_NEIGHBORS,
  waterfall_archipelago: WATERFALL_NEIGHBORS,
};

const MAP_DATA = {
  [DEFAULT_MAP_KEY]: VOLCANIC_ARCHIPELAGO_DATA,
  waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};

const MAP_TITLE_TRANSLATIONS = {
  volcanic_archipelago: 'Вулканічний архіпелаг',
  waterfall_archipelago: 'Водоспадний архіпелаг',
};

const STAFF_SECTOR_SPLIT_REGEX = /[,\s;|\/\\]+/;

const parseStaffSectors = (rawValue) => {
  const sectors = new Set();

  const register = (value) => {
    if (value === undefined || value === null) {
      return;
    }
    const normalized = String(value).trim().toUpperCase();
    if (normalized) {
      sectors.add(normalized);
    }
  };

  if (Array.isArray(rawValue)) {
    rawValue.forEach(item => {
      if (typeof item === 'string') {
        item
          .split(STAFF_SECTOR_SPLIT_REGEX)
          .map(part => part.trim())
          .filter(Boolean)
          .forEach(register);
      } else {
        register(item);
      }
    });
  } else if (typeof rawValue === 'string') {
    rawValue
      .split(STAFF_SECTOR_SPLIT_REGEX)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(register);
  } else {
    register(rawValue);
  }

  return Array.from(sectors);
};

const getNeighborIdsForSectors = (mapKey, sectorIds) => {
  if (!Array.isArray(sectorIds) || sectorIds.length === 0) {
    return [];
  }

  const data = MAP_DATA[mapKey] || {};
  const fallbackNeighbors = MAP_NEIGHBORS[mapKey] || {};
  const ownSet = new Set(sectorIds);
  const neighbors = new Set();

  sectorIds.forEach(sectorId => {
    const config = data[sectorId];
    const neighborList = Array.isArray(config?.neighbors)
      ? config.neighbors
      : Array.isArray(fallbackNeighbors[sectorId])
        ? fallbackNeighbors[sectorId]
        : [];

    neighborList.forEach(neighborId => {
      if (!neighborId) {
        return;
      }
      if (!data[neighborId]) {
        return;
      }
      if (ownSet.has(neighborId)) {
        return;
      }
      neighbors.add(neighborId);
    });
  });

  return Array.from(neighbors);
};

const formatRemaining = seconds => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.max(seconds % 60, 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getArmyColor = (army) => {
  if (!army) {
    return '#9e9e9e';
  }

  const normalized = String(army).trim().toLowerCase();
  if (normalized === 'attack') {
    return '#d32f2f';
  }
  if (normalized === 'defense') {
    return '#1976d2';
  }
  return '#9e9e9e';
};



const GVG = () => {
  const [selectedId, setSelectedId] = useState(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const { guildId } = useContext(GuildContext);
  const [sectorStaff, setSectorStaff] = useState({});
  const [sectorSchedule, setSectorSchedule] = useState([]);
  const [sectorColors, setSectorColors] = useState({});
  const [sectorSnapshot, setSectorSnapshot] = useState(null);
  const [shortGuildId, setShortGuildId] = useState(null);
  const [blinkingSector, setBlinkingSector] = useState(null);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [currentMap, setCurrentMap] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isSectorDataLoaded, setIsSectorDataLoaded] = useState(false);
  const [opponentList, setOpponentList] = useState([]);
  const [opponentMapById, setOpponentMapById] = useState({});
  const [opponentStaffSectors, setOpponentStaffSectors] = useState({});
  const [areOpponentsLoaded, setAreOpponentsLoaded] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const blinkingAnim = useRef(new Animated.Value(0)).current;
  const blinkingLoopRef = useRef(null);
  const navigation = useNavigation();

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const storedId = await AsyncStorage.getItem('guildId');
        const effectiveId = guildId || storedId;
        if (!isActive) {
          return;
        }
        if (!effectiveId) {
          setShortGuildId(null);
          return;
        }
        const parts = String(effectiveId).split('_');
        const shortId = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        setShortGuildId(shortId);
      } catch (error) {
        console.error('Не вдалося отримати короткий guildId:', error);
        if (isActive) {
          setShortGuildId(null);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [guildId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);

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
      if (!id) {
        setCurrentMap(DEFAULT_MAP_KEY);
        setIsMapLoaded(true);
        return;
      }
      // ИЗМЕНЕНО
      mapRef = database().ref(`guilds/${id}/GBG/map`);
      onMapUpdate = snap => {
        let nextMap = DEFAULT_MAP_KEY;
        if (snap.exists()) {
          const value = snap.val();
          if (typeof value === 'string' && MAP_DIMENSIONS[value]) {
            nextMap = value;
          }
        }
        setCurrentMap(nextMap);
        setIsMapLoaded(true);
      };
      mapRef.on('value', onMapUpdate);
    })();
    return () => {
      // ИЗМЕНЕНО
      if (mapRef && onMapUpdate) {
        mapRef.off('value', onMapUpdate);
      }
    };
  }, [guildId]);

  useEffect(() => {
    let opponentsRef;
    let onOpponentsUpdate;
    setAreOpponentsLoaded(false);
    setOpponentList([]);
    setOpponentMapById({});
    setOpponentStaffSectors({});
    (async () => {
      const id = guildId || await AsyncStorage.getItem('guildId');
      if (!id) {
        setOpponentStaffSectors({});
        setAreOpponentsLoaded(true);
        return;
      }
      opponentsRef = database().ref(`guilds/${id}/GBG/opponents`);
      onOpponentsUpdate = snap => {
        if (snap.exists()) {
          const raw = snap.val() || {};
          const byId = {};
          const list = [];
          const staffFlags = {};
          Object.entries(raw).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
              const normalizedId = value.id != null ? String(value.id) : String(key);
              const sectorColor = value.sectorColor ? String(value.sectorColor) : '#FFFFFF';
              const staffSectors = parseStaffSectors(value.staff);
              const entry = {
                key,
                id: normalizedId,
                name: value.name || normalizedId,
                sectorColor,
              };
              byId[normalizedId] = entry;
              list.push(entry);
              staffSectors.forEach(sectorId => {
                if (sectorId) {
                  staffFlags[sectorId] = true;
                }
              });
            }
          });
          list.sort((a, b) => a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }));
          setOpponentMapById(byId);
          setOpponentList(list);
          setOpponentStaffSectors(staffFlags);
        } else {
          setOpponentMapById({});
          setOpponentList([]);
          setOpponentStaffSectors({});
        }
        setAreOpponentsLoaded(true);
      };
      opponentsRef.on('value', onOpponentsUpdate);
    })();
    return () => {
      if (opponentsRef && onOpponentsUpdate) {
        opponentsRef.off('value', onOpponentsUpdate);
      }
    };
  }, [guildId]);

  useEffect(() => {
    let opponentsRef;
    let onOpponentsUpdate;
    setAreOpponentsLoaded(false);
    setOpponentList([]);
    setOpponentMapById({});
    setOpponentStaffSectors({});
    (async () => {
      const id = guildId || await AsyncStorage.getItem('guildId');
      if (!id) {
        setOpponentStaffSectors({});
        setAreOpponentsLoaded(true);
        return;
      }
      opponentsRef = database().ref(`guilds/${id}/GBG/opponents`);
      onOpponentsUpdate = snap => {
        if (snap.exists()) {
          const raw = snap.val() || {};
          const byId = {};
          const list = [];
          const staffFlags = {};
          Object.entries(raw).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
              const normalizedId = value.id != null ? String(value.id) : String(key);
              const sectorColor = value.sectorColor ? String(value.sectorColor) : '#FFFFFF';
              const staffSectors = parseStaffSectors(value.staff);
              const entry = {
                key,
                id: normalizedId,
                name: value.name || normalizedId,
                sectorColor,
              };
              byId[normalizedId] = entry;
              list.push(entry);
              staffSectors.forEach(sectorId => {
                if (sectorId) {
                  staffFlags[sectorId] = true;
                }
              });
            }
          });
          list.sort((a, b) => a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }));
          setOpponentMapById(byId);
          setOpponentList(list);
          setOpponentStaffSectors(staffFlags);
        } else {
          setOpponentMapById({});
          setOpponentList([]);
          setOpponentStaffSectors({});
        }
        setAreOpponentsLoaded(true);
      };
      opponentsRef.on('value', onOpponentsUpdate);
    })();
    return () => {
      if (opponentsRef && onOpponentsUpdate) {
        opponentsRef.off('value', onOpponentsUpdate);
      }
    };
  }, [guildId]);

  const mapKey = currentMap ?? DEFAULT_MAP_KEY;
  const mapDimensions = MAP_DIMENSIONS[mapKey] || MAP_DIMENSIONS[DEFAULT_MAP_KEY];
  const viewBox = `0 0 ${mapDimensions.width} ${mapDimensions.height}`;

  const formatMapTitle = key => {
    const normalizedKey = key || DEFAULT_MAP_KEY;
    if (MAP_TITLE_TRANSLATIONS[normalizedKey]) {
      return MAP_TITLE_TRANSLATIONS[normalizedKey];
    }
    return normalizedKey
      .split('_')
      .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ');
  };

  const mapTitle = formatMapTitle(mapKey);

  useLayoutEffect(() => {
    if (!navigation) return;
    const isDataReady = isMapLoaded && isSectorDataLoaded && areOpponentsLoaded;
    navigation.setOptions({
      headerTitle: mapTitle,
    });
  }, [navigation, mapTitle, isMapLoaded, isSectorDataLoaded, areOpponentsLoaded]);

  useEffect(() => {
    if (!navigation) return;
    const isDataReady = isMapLoaded && isSectorDataLoaded && areOpponentsLoaded;
    if (isDataReady) {
      navigation.setParams({
        onOpenOpponents: () => setInfoVisible(true),
      });
    }
  }, [navigation, isMapLoaded, isSectorDataLoaded, areOpponentsLoaded]);

  const renderMapPaths = () => {
    const data = MAP_DATA[mapKey] || {};
    return Object.entries(data).map(([sectorId, config]) => {
      const fill = config.fill;
      const text = config.text;
      const icon = config.icon;

      const fillStyle = { ...(fill?.style || {}) };
      const color = sectorColors[sectorId];
      if (color) {
        const lower = color.toLowerCase();
        const isWhite = lower === '#ffffff' || lower === 'white';
        fillStyle.fill = color;
        if (isWhite) {
          fillStyle.stroke = '#000000';
          fillStyle.strokeWidth = 1;
          fillStyle.strokeOpacity = 0.7;
        } else {
          const existingStroke = typeof fillStyle.stroke === 'string' ? fillStyle.stroke : null;
          const normalizedStroke = existingStroke && existingStroke.toLowerCase() !== 'none'
            ? existingStroke
            : '#000000';
          fillStyle.stroke = normalizedStroke;
          fillStyle.strokeWidth = fillStyle.strokeWidth || 1;
          if (fillStyle.strokeOpacity === undefined || fillStyle.strokeOpacity === null) {
            fillStyle.strokeOpacity = 0;
          }
        }
      }

      const textStyle = { ...(text?.style || {}) };
      textStyle.display = sectorStaff[sectorId]
        ? 'none'
        : textStyle.display ?? 'inline';

      const iconStyle = { ...(icon?.style || {}) };
      iconStyle.display = sectorStaff[sectorId] ? 'inline' : 'none';
      iconStyle.fill = '#000000';
      if (
        typeof iconStyle.stroke === 'string' &&
        iconStyle.stroke.toLowerCase() !== 'none'
      ) {
        iconStyle.stroke = '#000000';
      }

      const isBlinking = blinkingSector === sectorId;
      const baseFillOpacity = typeof fillStyle.fillOpacity === 'number' ? fillStyle.fillOpacity : undefined;
      const baseStrokeOpacity = typeof fillStyle.strokeOpacity === 'number' ? fillStyle.strokeOpacity : undefined;
      const animatedFillOpacity = isBlinking
        ? blinkingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
        : baseFillOpacity;
      const animatedStrokeOpacity = isBlinking
        ? blinkingAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
        : baseStrokeOpacity;

      return (
        <G key={sectorId} onPress={() => handleShapePress(sectorId)}>
          {fill && (
            <AnimatedPath
              {...(fill.props || {})}
              d={fill.d}
              onPressIn={handleShapePress.bind(null, sectorId)}
              style={fillStyle}
              fillOpacity={animatedFillOpacity}
              strokeOpacity={animatedStrokeOpacity}
            />
          )}
          {text && (
            <Path
              {...(text.props || {})}
              d={text.d}
              onPressIn={handleShapePress.bind(null, sectorId)}
              style={textStyle}
            />
          )}
          {icon && (
            <Path
              {...(icon.props || {})}
              d={icon.d}
              onPressIn={handleShapePress.bind(null, sectorId)}
              style={iconStyle}
            />
          )}
        </G>
      );
    });
  };

  useEffect(() => {
    if (!isMapLoaded) return;
    setSectorStaff({});
    setSectorSchedule([]);
    setSectorColors({});
    setSectorSnapshot(null);
    setIsSectorDataLoaded(false);
    setBlinkingSector(null);
  }, [currentMap, isMapLoaded]);

  useEffect(() => {
    if (!isMapLoaded) return;
    let sectorsRef;
    let onSectorsUpdate;
    (async () => {
      const id = guildId || await AsyncStorage.getItem('guildId');
      if (!id) {
        setSectorSnapshot(null);
        setIsSectorDataLoaded(true);
        return;
      }
      sectorsRef = database().ref(`guilds/${id}/GBG/sectors`);
      onSectorsUpdate = snap => {
        if (snap.exists()) {
          setSectorSnapshot(snap.val());
        } else {
          setSectorSnapshot(null);
        }
        setIsSectorDataLoaded(true);
      };
      sectorsRef.on('value', onSectorsUpdate);
    })();
    return () => {
      if (sectorsRef && onSectorsUpdate) {
        sectorsRef.off('value', onSectorsUpdate);
      }
    };
  }, [guildId, isMapLoaded]);

  useEffect(() => {
    if (!isMapLoaded || !areOpponentsLoaded) {
      return;
    }
    const data = sectorSnapshot && typeof sectorSnapshot === 'object' ? sectorSnapshot : {};
    const mapData = MAP_DATA[mapKey] || {};
    const sectorIds = Object.keys(mapData);
    if (sectorIds.length === 0) {
      setSectorColors({});
      setSectorStaff({});
      setSectorSchedule([]);
      return;
    }

    const colors = {};
    const staffFlags = {};
    const availableSectors = new Set(sectorIds);

    sectorIds.forEach(gid => {
      const entry = data[gid];
      let color = '#FFFFFF';
      let staff = false;
      let ownerValue = null;

      if (entry && typeof entry === 'object') {
        if (typeof entry.color === 'string') {
          color = entry.color;
        }
        if (entry.owner !== undefined && entry.owner !== null) {
          ownerValue = entry.owner;
        } else if (entry.ownerId !== undefined && entry.ownerId !== null) {
          ownerValue = entry.ownerId;
        }
        if (ownerValue !== null) {
          const ownerKey = String(ownerValue);
          if (ownerKey === '0') {
            color = '#FFFFFF';
          } else {
            const opponent = opponentMapById[ownerKey];
            if (opponent?.sectorColor) {
              color = String(opponent.sectorColor);
            } else if (typeof entry.color === 'string') {
              color = entry.color;
            } else {
              color = '#FFFFFF';
            }
          }
        }
        staff = !!entry.staff;
      } else if (typeof entry === 'string') {
        color = entry;
      }

      if (!color) {
        color = '#FFFFFF';
      }

      colors[gid] = color;
      staffFlags[gid] = staff;
    });

    Object.keys(opponentStaffSectors).forEach(sectorId => {
      if (opponentStaffSectors[sectorId] && availableSectors.has(sectorId)) {
        staffFlags[sectorId] = true;
      }
    });

    setSectorColors(colors);
    setSectorStaff(staffFlags);
  }, [areOpponentsLoaded, isMapLoaded, mapKey, opponentMapById, opponentStaffSectors, sectorSnapshot]);

  useEffect(() => {
    if (!isMapLoaded) {
      setSectorSchedule([]);
      return;
    }

    const data = sectorSnapshot && typeof sectorSnapshot === 'object' ? sectorSnapshot : {};
    const mapData = MAP_DATA[mapKey] || {};
    const sectorIds = Object.keys(mapData);
    if (sectorIds.length === 0) {
      setSectorSchedule([]);
      return;
    }

    if (!shortGuildId) {
      setSectorSchedule([]);
      return;
    }

    const shortId = String(shortGuildId);
    const ownSectors = sectorIds.filter(sectorId => {
      const entry = data[sectorId];
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      let ownerValue = null;
      if (entry.owner !== undefined && entry.owner !== null) {
        ownerValue = entry.owner;
      } else if (entry.ownerId !== undefined && entry.ownerId !== null) {
        ownerValue = entry.ownerId;
      }
      if (ownerValue === null || ownerValue === undefined) {
        return false;
      }
      return String(ownerValue) === shortId;
    });

    if (ownSectors.length === 0) {
      setSectorSchedule([]);
      return;
    }

    const neighborIds = getNeighborIdsForSectors(mapKey, ownSectors);
    if (neighborIds.length === 0) {
      setSectorSchedule([]);
      return;
    }

    const schedule = neighborIds
      .map(sectorId => {
        const entry = data[sectorId];
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const openTime = Number(entry.openTime);
        if (!Number.isFinite(openTime) || openTime <= 0) {
          return null;
        }
        const armyRaw = entry.army != null ? String(entry.army).trim().toLowerCase() : '';
        const normalizedArmy = armyRaw === 'attack'
          ? 'attack'
          : armyRaw === 'defense'
            ? 'defense'
            : armyRaw;

        return {
          name: sectorId,
          openTime,
          army: normalizedArmy,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.openTime - b.openTime);

    setSectorSchedule(schedule);
  }, [isMapLoaded, mapKey, sectorSnapshot, shortGuildId]);

  useEffect(() => {
    if (blinkingLoopRef.current) {
      blinkingLoopRef.current.stop();
      blinkingLoopRef.current = null;
    }

    if (blinkingSector) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkingAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
          }),
          Animated.timing(blinkingAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: false,
          }),
        ]),
        { resetBeforeIteration: true },
      );
      blinkingLoopRef.current = loop;
      loop.start();
    } else {
      blinkingAnim.setValue(0);
    }

    return () => {
      if (blinkingLoopRef.current) {
        blinkingLoopRef.current.stop();
        blinkingLoopRef.current = null;
      }
    };
  }, [blinkingAnim, blinkingSector]);

  useEffect(() => {
    if (!blinkingSector) {
      return;
    }
    if (!sectorSchedule.some(item => item.name === blinkingSector)) {
      setBlinkingSector(null);
    }
  }, [blinkingSector, sectorSchedule]);

  const handleSchedulePress = (sectorId) => {
    setBlinkingSector(prev => (prev === sectorId ? null : sectorId));
  };

  const handleShapePress = async (id, event) => {
    try {
      const gid = guildId || await AsyncStorage.getItem('guildId');
      if (!gid) {
        console.warn('⚠️ guildId not found');
        return;
      }

      const screenWidth = Dimensions.get('window').width;
      const { pageX = screenWidth / 2, pageY = HALF_HEIGHT } =
        event?.nativeEvent || {};
      const position =
        pageX > screenWidth / 2
          ? { right: Math.max(screenWidth - pageX, 0), top: Math.max(pageY, 0) }
          : { left: Math.max(pageX, 0), top: Math.max(pageY, 0) };
      setPopupStyle(position);
      setSelectedId(id);
      setPopupVisible(true);
    } catch (err) {
      console.error('Error preparing popup:', err);
    }
  };

  const handleHelpPress = async (id, event) => {
    try {
      const gid = guildId || await AsyncStorage.getItem('guildId');
      if (!gid) {
        console.warn('⚠️ guildId not found');
        Alert.alert("Помилка", "Не вдалося визначити гільдію.");
        return;
      }
      
      setPopupVisible(false);

      Alert.alert("Відправка...", "Надсилаємо сповіщення всім членам гільдії.");

      const sendNotification = functions().httpsCallable('sendGbgHelpNotification');
      const result = await sendNotification({ guildId: gid });
      
      console.log('✅ Cloud function executed successfully:', result.data);
      Alert.alert("Успіх!", "Сповіщення надіслано.");

    } catch (error) {
      console.error('❌ Error calling cloud function:', error);
      Alert.alert("Помилка", "Не вдалося надіслати сповіщення. Спробуйте пізніше.");
    }
  };
  
  useEffect(() => {
    if (!isMapLoaded || !isSectorDataLoaded || !areOpponentsLoaded) {
      setInfoVisible(false);
    }
  }, [areOpponentsLoaded, isMapLoaded, isSectorDataLoaded]);

  if (!isMapLoaded || !isSectorDataLoaded || !areOpponentsLoaded) {
    return (
      <View style={styles.win}>
        <Text>Завантаження карти...</Text>
      </View>
    );
  }

  return (
    <View style={styles.win}>
      <View style={styles.mapContainer}>
        <Svg
          width="100%"
          height="100%"
          viewBox={viewBox}
        >
          {renderMapPaths()}
        </Svg>
      </View>
      <ScrollView style={styles.sectorList} contentContainerStyle={styles.sectorListContent}>
        {sectorSchedule.map(item => {
          const armyColor = getArmyColor(item.army);
          const timeRemainingSeconds = item.openTime
            ? Math.max(item.openTime - currentTime, 0)
            : 0;
          const timeLabel = item.openTime ? formatRemaining(timeRemainingSeconds) : '--:--:--';
          const isActive = blinkingSector === item.name;

          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.sectorRow,
                isActive && styles.activeSectorRow,
              ]}
              onPress={() => handleSchedulePress(item.name)}
              activeOpacity={0.7}
            >
              <View style={styles.sectorNameContainer}>
                <View style={[styles.armyBox, { backgroundColor: armyColor }]} />
                <Text style={styles.sectorName}>
                  {item.name}
                </Text>
              </View>
              <Text style={styles.sectorTime}>
                {timeLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {infoVisible && (
        <View style={styles.infoOverlay}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>Суперники на мапі</Text>
            <ScrollView style={styles.infoList}>
              {opponentList.length === 0 ? (
                <Text style={styles.infoEmpty}>Інформація відсутня</Text>
              ) : (
                opponentList.map(opponent => (
                  <View key={opponent.key ?? opponent.id} style={styles.infoRow}>
                    <View
                      style={[
                        styles.infoColor,
                        { backgroundColor: opponent.sectorColor || '#FFFFFF' },
                      ]}
                    />
                    <Text style={styles.infoName}>{opponent.name || opponent.id}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.infoClose} onPress={() => setInfoVisible(false)}>
              <Text style={styles.infoCloseText}>Закрити</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {popupVisible && (
        <View style={styles.popupOverlay} pointerEvents="box-none">
          <View style={[styles.popupMenu, popupStyle]}>
            <TouchableOpacity
              style={styles.menuItem}
              disabled={!selectedId || sectorStaff[selectedId]}
              onPress={() => selectedId && handleHelpPress(selectedId)}
            >
              <FontAwesomeIcon
                icon={faFire}
                size={20}
                color="#8C9093"
                style={styles.menuIcon}
              />
              <Text
                style={[
                  styles.menuText,
                  (!selectedId || sectorStaff[selectedId]) && styles.disabledText,
                ]}
              >
                Допомагайте
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  win: {
    flex: 1,
    width: "100%",
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: "white",
  },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  mapContainer: {
    height: HALF_HEIGHT,
    width: "100%",
    backgroundColor: "#f0f0f0",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  infoOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 10,
  },
  infoModal: {
    width: '85%',
    maxHeight: HALF_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 6,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  infoList: {
    maxHeight: HALF_HEIGHT * 0.6,
  },
  infoEmpty: {
    textAlign: 'center',
    color: '#444',
    paddingVertical: 12,
    fontSize: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoColor: {
    width: 18,
    height: 18,
    borderRadius: 4,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  infoName: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  infoClose: {
    marginTop: 16,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#1976d2',
    borderRadius: 20,
  },
  infoCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  popupOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  popupMenu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    elevation: 5,
    flexDirection: "column",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  menuIcon: {
    marginRight: 6,
  },
  menuText: {
    fontSize: 16,
    color: "#333",
  },
  disabledText: {
    color: '#999',
  },
  sectorList: {
    width: '100%',
    marginTop: 10,
    maxHeight: HALF_HEIGHT,
  },
  sectorListContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  sectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    justifyContent: 'space-between',
  },
  sectorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  armyBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  sectorName: {
    fontSize: 14,
    color: '#000',
    marginLeft: 8,
    flexShrink: 1,
  },
  sectorTime: {
    fontSize: 14,
    color: '#000',
    textAlign: 'right',
    marginLeft: 12,
    minWidth: 72,
  },
  activeSectorRow: {
    backgroundColor: 'rgba(25, 118, 210, 0.12)',
  },
});

export default GVG;