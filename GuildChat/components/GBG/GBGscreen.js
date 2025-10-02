import React, { useState, useEffect, useContext } from "react";
import { View, StyleSheet, Dimensions, TouchableOpacity, Text, ScrollView } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";
import { getDatabase, ref, get, onValue } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuildContext } from "../../GuildContext";
import { WATERFALL_ARCHIPELAGO_DATA } from "./waterfallData";
import { VOLCANIC_ARCHIPELAGO_DATA } from "./volcanicData";
// Компонент інтерактивної карти режиму GBG

const { height } = Dimensions.get('window');
const HALF_HEIGHT = height * 0.5;

const VOLCANIC_SVG_WIDTH = 138.53601;
const VOLCANIC_SVG_HEIGHT = 164.52901;
const WATERFALL_SVG_WIDTH = 248.83203;
const WATERFALL_SVG_HEIGHT = 248.83203;

// Константна конфігурація карти вулканічного архіпелагу
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

const getAdjacentIds = (mapKey, id) => {
  const neighbors = MAP_NEIGHBORS[mapKey] || {};
  return neighbors[id] || [];
};

const formatRemaining = seconds => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
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
  const [currentMap, setCurrentMap] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isSectorDataLoaded, setIsSectorDataLoaded] = useState(false);
  const [opponentList, setOpponentList] = useState([]);
  const [opponentMapById, setOpponentMapById] = useState({});
  const [areOpponentsLoaded, setAreOpponentsLoaded] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);

  useEffect(() => {
    let unsubscribe;
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
      const db = getDatabase();
      const mapRef = ref(db, `guilds/${id}/GBG/map`);
      unsubscribe = onValue(mapRef, snap => {
        let nextMap = DEFAULT_MAP_KEY;
        if (snap.exists()) {
          const value = snap.val();
          if (typeof value === 'string' && MAP_DIMENSIONS[value]) {
            nextMap = value;
          }
        }
        setCurrentMap(nextMap);
        setIsMapLoaded(true);
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [guildId]);

  useEffect(() => {
    let unsubscribe;
    setAreOpponentsLoaded(false);
    setOpponentList([]);
    setOpponentMapById({});
    (async () => {
      const id = guildId || await AsyncStorage.getItem('guildId');
      if (!id) {
        setAreOpponentsLoaded(true);
        return;
      }
      const db = getDatabase();
      const opponentsRef = ref(db, `guilds/${id}/GBG/opponets`);
      unsubscribe = onValue(opponentsRef, snap => {
        if (snap.exists()) {
          const raw = snap.val() || {};
          const byId = {};
          const list = [];
          Object.entries(raw).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
              const normalizedId = value.id != null ? String(value.id) : String(key);
              const sectorColor = value.sectorColor ? String(value.sectorColor) : '#FFFFFF';
              const entry = {
                key,
                id: normalizedId,
                name: value.name || normalizedId,
                sectorColor,
              };
              byId[normalizedId] = entry;
              list.push(entry);
            }
          });
          list.sort((a, b) => a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }));
          setOpponentMapById(byId);
          setOpponentList(list);
        } else {
          setOpponentMapById({});
          setOpponentList([]);
        }
        setAreOpponentsLoaded(true);
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
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
        fillStyle.stroke = isWhite ? '#000000' : 'none';
        fillStyle.strokeWidth = isWhite ? 1 : 0;
        fillStyle.strokeOpacity = isWhite ? 0.7 : 0;
      }

      const textStyle = { ...(text?.style || {}) };
      textStyle.display = sectorStaff[sectorId]
        ? 'none'
        : textStyle.display ?? 'inline';

      const iconStyle = { ...(icon?.style || {}) };
      iconStyle.display = sectorStaff[sectorId] ? 'inline' : 'none';

      return (
        <G key={sectorId} onPress={() => handleShapePress(sectorId)}>
          {fill && (
            <Path
              {...(fill.props || {})}
              d={fill.d}
              onPressIn={handleShapePress.bind(null, sectorId)}
              style={fillStyle}
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
  }, [currentMap, isMapLoaded]);

  useEffect(() => {
    if (!isMapLoaded) return;
    let unsubscribe;
    (async () => {
      const id = guildId || await AsyncStorage.getItem('guildId');
      if (!id) {
        setSectorSnapshot(null);
        setIsSectorDataLoaded(true);
        return;
      }
      const db = getDatabase();
      const sectorsRef = ref(db, `guilds/${id}/GBG/sectors`);
      unsubscribe = onValue(sectorsRef, snap => {
        if (snap.exists()) {
          setSectorSnapshot(snap.val());
        } else {
          setSectorSnapshot(null);
        }
        setIsSectorDataLoaded(true);
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
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
    const owners = {};
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
      owners[gid] = ownerValue !== null ? String(ownerValue) : null;
    });

    const whiteSectors = sectorIds.filter(id => {
      const owner = owners[id];
      const color = colors[id];
      const lower = (color || '').toLowerCase();
      if (owner === null) {
        return !color || lower === '#ffffff' || lower === '#dcdcdc' || lower === 'white';
      }
      if (owner === '0') {
        return true;
      }
      return lower === '#ffffff' || lower === '#dcdcdc' || lower === 'white';
    });

    if (whiteSectors.length === 0) {
      setSectorSchedule([]);
    } else {
      const namesSet = new Set();
      whiteSectors.forEach(sec => {
        getAdjacentIds(mapKey, sec).forEach(adj => {
          if (!availableSectors.has(adj)) {
            return;
          }
          if (!adj) return;
          const colorLower = (colors[adj] || '').toLowerCase();
          const owner = owners[adj];
          if (owner !== null && owner !== '0') {
            namesSet.add(adj);
          } else if (colorLower && colorLower !== '#ffffff' && colorLower !== '#dcdcdc' && colorLower !== 'white') {
            namesSet.add(adj);
          }
        });
      });

      const now = Math.floor(Date.now() / 1000);
      const result = Array.from(namesSet)
        .map(name => {
          const entry = data[name];
          if (entry && typeof entry === 'object') {
            return {
              name,
              attack: entry.attack,
              openTime: entry.openTime,
              staff: entry.staff,
            };
          }
          return { name };
        })
        .filter(item => item.openTime && !item.staff)
        .map(it => ({
          ...it,
          timeRemaining: it.openTime - now,
          openLocal: new Date(it.openTime * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
        .filter(it => it.timeRemaining > 0)
        .sort((a, b) => a.timeRemaining - b.timeRemaining);
      setSectorSchedule(result);
    }

    setSectorColors(colors);
    setSectorStaff(staffFlags);
  }, [areOpponentsLoaded, isMapLoaded, mapKey, opponentMapById, sectorSnapshot]);

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

  const handleHelpPress = async (id) => {
    try {
      const db = getDatabase();

      const gid = guildId || await AsyncStorage.getItem('guildId');
      if (!gid) {
        console.warn('⚠️ guildId not found');
        return;
      }

      const text = `${id} необхідна допомога`;

      const snapshot = await get(ref(db, `/guilds/${gid}/guildUsers`));
      const members = snapshot.val() || {};
      const recipientUids = Object.keys(members);

      const tokens = [];
      for (const uid of recipientUids) {
        const userSnap = await get(ref(db, `/users/${uid}/fcmToken`));
        const fcmToken = userSnap.val();
        console.log(`FCM token for ${uid}:`, fcmToken);
        if (fcmToken) tokens.push(fcmToken);
      }

      if (tokens.length > 0) {
        const payloads = tokens.map(token => ({
          token,
          title: "Поле битви",
          body: text,
        }));

        const results = await Promise.all(
          payloads.map(async payload => {
            try {
              const response = await fetch('https://europe-west1-guildchat-5d8c1.cloudfunctions.net/sendPushNow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              const rawBody = await response.text();
              let parsedBody = null;
              try {
                parsedBody = rawBody ? JSON.parse(rawBody) : null;
              } catch (parseErr) {
                console.warn('⚠️ Не вдалося розпарсити відповідь як JSON:', parseErr);
              }

              if (response.ok) {
                console.log('✅ Повідомлення прийняте FCM для токена:', payload.token, parsedBody ?? rawBody);
                return { token: payload.token, ok: true, body: parsedBody ?? rawBody };
              }

              console.error('❌ FCM повернув помилку для токена:', payload.token, response.status, parsedBody ?? rawBody);
              return { token: payload.token, ok: false, status: response.status, body: parsedBody ?? rawBody };
            } catch (sendErr) {
              console.error('❌ Помилка під час надсилання пушу для токена:', payload.token, sendErr);
              return { token: payload.token, ok: false, error: sendErr };
            }
          })
        );

        console.log('📨 Результати надсилання пушів:', JSON.stringify(results, null, 2));
      } else {
        console.log('No FCM tokens found.');
      }
    } catch (err) {
      console.error('❌ Error in handleHelpPress:', err);
    } finally {
      setPopupVisible(false);
      setSelectedId(null);
      setPopupStyle({});
    }
  };

  

  useEffect(() => {
    const timer = setInterval(() => {
      setSectorSchedule(prev =>
        prev
          .map(item => ({
            ...item,
            timeRemaining: item.openTime - Math.floor(Date.now() / 1000),
          }))
          .filter(item => item.timeRemaining > 0)
          .sort((a, b) => a.timeRemaining - b.timeRemaining)
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{mapTitle}</Text>
        <TouchableOpacity style={styles.infoButton} onPress={() => setInfoVisible(true)}>
          <Text style={styles.infoButtonText}>і</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.mapContainer}>
        <Svg
          width="100%"
          height="100%"
          viewBox={viewBox}
        >
          {renderMapPaths()}
        </Svg>
      </View>
      <View style={styles.sectorList}>
        {sectorSchedule.map(item => (
          <View key={item.name} style={styles.sectorRow}>
            <Text style={[styles.sectorName, { flex: 1, textAlign: 'left' }]}>
              {item.name}
            </Text>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={[styles.attackBox, { backgroundColor: item.attack }]} />
            </View>
            <Text style={[styles.sectorTime, { flex: 1, textAlign: 'right' }]}>
              {formatRemaining(item.timeRemaining)}
            </Text>
          </View>
        ))}
      </View>
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
  header: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 10,
    marginTop: 10,
    maxHeight: HALF_HEIGHT,
  },
  sectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectorName: {
    fontSize: 14,
    color: '#000',
  },
  attackBox: {
    width: 12,
    height: 12,
  },
  sectorTime: {
    fontSize: 14,
    color: '#000',
  },
});

export default GVG;
