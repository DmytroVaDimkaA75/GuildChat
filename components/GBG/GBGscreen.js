import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import database from "@react-native-firebase/database";
import functions from "@react-native-firebase/functions";

import { useNavigation } from "@react-navigation/native";
import { BlurView } from "@react-native-community/blur";

import Svg, { G, Path, SvgXml } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system/legacy";

import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faFire, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

import { GuildContext } from "../../GuildContext";
import { VOLCANIC_ARCHIPELAGO_DATA } from "./volcanicData";
import { WATERFALL_ARCHIPELAGO_DATA } from "./waterfallData";

const { height, width } = Dimensions.get("window");
const HALF_HEIGHT = height * 0.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ====== Widget cache keys (AsyncStorage) ======
const WIDGET_GBG_MAP_PNG_URI_KEY = "widget_gbg_map_png_uri";
const WIDGET_GBG_MAP_META_KEY = "widget_gbg_map_meta";
const WIDGET_GBG_NEXT5_KEY = "widget_gbg_next5";
const WIDGET_GBG_NEXT5_META_KEY = "widget_gbg_next5_meta";

// ====== Map dimensions ======
const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const DEFAULT_MAP_KEY = "volcanic_archipelago";

const MAP_DIMENSIONS = {
  [DEFAULT_MAP_KEY]: { width: VOLCANIC_SVG_WIDTH, height: VOLCANIC_SVG_HEIGHT },
  waterfall_archipelago: { width: WATERFALL_SVG_WIDTH, height: WATERFALL_SVG_HEIGHT },
};

const MAP_DATA = {
  [DEFAULT_MAP_KEY]: VOLCANIC_ARCHIPELAGO_DATA,
  waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};

const MAP_TITLE_TRANSLATIONS = {
  volcanic_archipelago: "Вулканічний архіпелаг",
  waterfall_archipelago: "Водоспадний архіпелаг",
};

// ====== Fallback neighbors (тільки якщо у data нема neighbors) ======
const SECTOR_NEIGHBORS = {
  A2A: ["A3A", "A3B", "B2A", "X1X", "F2A", "F3B"],
  A3A: ["A4A", "A4B", "A3B", "A2A", "F3B", "F4C"],
  A3B: ["A4B", "A4C", "B3A", "B2A", "A2A", "A3A"],
  A4A: ["A5A", "A5B", "A4B", "A3A", "F4C", "F5D"],
  A4B: ["A5B", "A5C", "A4C", "A3B", "A3A", "A4A"],
  A4C: ["A5C", "A5D", "B4A", "B3A", "A3B", "A4B"],
  A5A: ["A5B", "A4A", "F5D"],
  A5B: ["A5C", "A4B", "A4A", "A5A"],
  A5C: ["A5D", "A4C", "A4B", "A5B"],
  A5D: ["B5A", "B4A", "A4C", "A5C"],
  B2A: ["A3B", "B3A", "B3B", "C2A", "X1X", "A2A"],
  B3A: ["A4C", "B4A", "B4B", "B3B", "B2A", "A3B"],
  B3B: ["B3A", "B4B", "B4C", "C3A", "C2A", "B2A"],
  B4A: ["A5D", "B5A", "B5B", "B4B", "B3A", "A4C"],
  B4B: ["B4A", "B5B", "B5C", "B4C", "B3B", "B3A"],
  B4C: ["B4B", "B5C", "B5D", "C4A", "C3A", "B3B"],
  B5A: ["B5B", "B4A", "A5D"],
  B5B: ["B5A", "B5C", "B4B", "B4A"],
  B5C: ["B5B", "B5D", "B4C", "B4B"],
  B5D: ["B5C", "C5A", "C4A", "B4C"],
  C2A: ["B2A", "B3B", "C3A", "C3B", "D2A", "X1X"],
  C3A: ["B3B", "B4C", "C4A", "C4B", "C3B", "C2A"],
  C3B: ["C2A", "C3A", "C4B", "C4C", "D3A", "D2A"],
  C4A: ["B4C", "B5D", "C5A", "C5B", "C4B", "C3A"],
  C4B: ["C3A", "C4A", "C5B", "C5C", "C4C", "C3B"],
  C4C: ["C3B", "C4B", "C5C", "C5D", "D4A", "D3A"],
  C5A: ["B5D", "C5B", "C4A"],
  C5B: ["C4A", "C5A", "C5C", "C4B"],
  C5C: ["C4B", "C5B", "C5D", "C4C"],
  C5D: ["C4C", "C5C", "D5A", "D4A"],
  D2A: ["X1X", "C2A", "C3B", "D3A", "D3B", "E2A"],
  D3A: ["D2A", "C3B", "C4C", "D4A", "D4B", "D3B"],
  D3B: ["E2A", "D2A", "D3A", "D4B", "D4C", "E3A"],
  D4A: ["D3A", "C4C", "C5D", "D5A", "D5B", "D4B"],
  D4B: ["D3B", "D3A", "D4A", "D5B", "D5C", "D4C"],
  D4C: ["E3A", "D3B", "D4B", "D5C", "D5D", "E4A"],
  D5A: ["D4A", "C5D", "D5B"],
  D5B: ["D4B", "D4A", "D5A", "D5C"],
  D5C: ["D4C", "D4B", "D5B", "D5D"],
  D5D: ["E4A", "D4C", "D5C", "E5A"],
  E2A: ["F2A", "X1X", "D2A", "D3B", "E3A", "E3B"],
  E3A: ["E3B", "E2A", "D3B", "D4C", "E4A", "E4B"],
  E3B: ["F3A", "F2A", "E2A", "E3A", "E4B", "E4C"],
  E4A: ["E4B", "E3A", "D4C", "D5D", "E5A", "E5B"],
  E4B: ["E4C", "E3B", "E3A", "E4A", "E5B", "E5C"],
  E4C: ["F4A", "F3A", "E3B", "E4B", "E5C", "E5D"],
  E5A: ["E5B", "E4A", "D5D"],
  E5B: ["E5C", "E4B", "E4A", "E5A"],
  E5C: ["E5D", "E4C", "E4B", "E5B"],
  E5D: ["F5A", "F4A", "E4C", "E5C"],
  F2A: ["F3B", "A2A", "X1X", "E2A", "E3B", "F3A"],
  F3A: ["F4B", "F3B", "F2A", "E3B", "E4C", "F4A"],
  F3B: ["F4C", "A3A", "A2A", "F2A", "F3A", "F4B"],
  F4A: ["F5B", "F4B", "F3A", "E4C", "E5D", "F5A"],
  F4B: ["F5C", "F4C", "F3B", "F3A", "F4A", "F5B"],
  F4C: ["F5D", "A4A", "A3A", "F3B", "F4B", "F5C"],
  F5A: ["F5B", "F4A", "E5D"],
  F5B: ["F5C", "F4B", "F4A", "F5A"],
  F5C: ["F5D", "F4C", "F4B", "F5B"],
  F5D: ["A5A", "A4A", "F4C", "F5C"],
  X1X: ["A2A", "B2A", "C2A", "D2A", "E2A", "F2A"],
};

const WATERFALL_NEIGHBORS = {};

const MAP_NEIGHBORS = {
  [DEFAULT_MAP_KEY]: SECTOR_NEIGHBORS,
  waterfall_archipelago: WATERFALL_NEIGHBORS,
};

// ====== Staff parsing ======
const STAFF_SECTOR_SPLIT_REGEX = /[\,\s;|\/\\]+/;

const parseStaffSectors = (rawValue) => {
  const sectors = new Set();
  const register = (value) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim().toUpperCase();
    if (normalized) sectors.add(normalized);
  };

  if (Array.isArray(rawValue)) {
    rawValue.forEach((item) => {
      if (typeof item === "string") {
        item.split(STAFF_SECTOR_SPLIT_REGEX).map((p) => p.trim()).filter(Boolean).forEach(register);
      } else {
        register(item);
      }
    });
  } else if (typeof rawValue === "string") {
    rawValue.split(STAFF_SECTOR_SPLIT_REGEX).map((p) => p.trim()).filter(Boolean).forEach(register);
  } else {
    register(rawValue);
  }

  return Array.from(sectors);
};

// ====== Bonus buildings ======
const BUILDING_BONUS_MAP = {
  guild_command_post_improvised: 20,
  guild_command_post_forward: 40,
  guild_command_post_fortified: 60,
  barracks_improvised: 20,
  barracks: 40,
  barracks_reinforced: 60,
  basic_field_outpost_diamond: 20,
  regular_field_outpost_diamond: 40,
  advanced_field_outpost_diamond: 60,
};

const getSectorOwnerId = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const ownerValue = entry.owner ?? entry.ownerId;
  if (ownerValue === undefined || ownerValue === null) return null;
  return String(ownerValue);
};

const getBuildingsWithBonuses = (entry) => {
  if (!entry || typeof entry !== "object") return [];
  const buildings = Array.isArray(entry.buildings) ? entry.buildings : [];
  if (buildings.length === 0) return [];

  return buildings.reduce((list, building) => {
    if (!building || typeof building !== "object") return list;

    const state = String(building.state || "").toLowerCase();
    if (state !== "active" && state !== "building") return list;

    const name = building.name ? String(building.name) : "";
    if (!name) return list;

    const bonus = BUILDING_BONUS_MAP[name];
    if (!Number.isFinite(bonus)) return list;

    if (state === "active") {
      list.push({ bonus, readyAt: 0 });
      return list;
    }

    const readyAt = Number(building.readyAt);
    if (!Number.isFinite(readyAt) || readyAt <= 0) return list;

    list.push({ bonus, readyAt });
    return list;
  }, []);
};

const getNeighborIdsForSector = (mapKey, sectorId) => {
  if (!sectorId) return [];
  const data = MAP_DATA[mapKey] || {};
  const fallbackNeighbors = MAP_NEIGHBORS[mapKey] || {};

  const config = data[sectorId];
  const neighborList = Array.isArray(config?.neighbors)
    ? config.neighbors
    : Array.isArray(fallbackNeighbors[sectorId])
      ? fallbackNeighbors[sectorId]
      : [];

  return neighborList.filter((neighborId) => neighborId && data[neighborId]);
};

const getNeighborIdsForSectors = (mapKey, sectorIds) => {
  if (!Array.isArray(sectorIds) || sectorIds.length === 0) return [];

  const data = MAP_DATA[mapKey] || {};
  const fallbackNeighbors = MAP_NEIGHBORS[mapKey] || {};

  const ownSet = new Set(sectorIds);
  const neighbors = new Set();

  sectorIds.forEach((sectorId) => {
    const config = data[sectorId];
    const neighborList = Array.isArray(config?.neighbors)
      ? config.neighbors
      : Array.isArray(fallbackNeighbors[sectorId])
        ? fallbackNeighbors[sectorId]
        : [];

    neighborList.forEach((neighborId) => {
      if (!neighborId || !data[neighborId] || ownSet.has(neighborId)) return;
      neighbors.add(neighborId);
    });
  });

  return Array.from(neighbors);
};

const calculateSectorBonus = ({ mapKey, sectorId, sectors, shortGuildId }) => {
  if (!mapKey || !sectorId || !sectors || !shortGuildId) return { value: 100, readyAt: null };

  const neighborIds = getNeighborIdsForSector(mapKey, sectorId);
  if (neighborIds.length === 0) return { value: 100, readyAt: null };

  const shortId = String(shortGuildId);
  const bonuses = [];

  neighborIds.forEach((neighborId) => {
    const entry = sectors[neighborId];
    if (!entry || typeof entry !== "object") return;

    const ownerId = getSectorOwnerId(entry);
    if (!ownerId || ownerId !== shortId) return;

    bonuses.push(...getBuildingsWithBonuses(entry));
  });

  if (bonuses.length === 0) return { value: 100, readyAt: null };

  const totalPossible = bonuses.reduce((sum, item) => sum + item.bonus, 0);
  if (totalPossible <= 0) return { value: 100, readyAt: null };

  // якщо сумарно <= 80 — бонус = 100 - сума
  if (totalPossible <= 80) {
    const latestReadyAt = bonuses.reduce((max, item) => Math.max(max, item.readyAt), 0);
    return { value: 100 - totalPossible, readyAt: latestReadyAt > 0 ? latestReadyAt : null };
  }

  // якщо > 80 — шукаємо момент коли набирається 80, але бонус ніколи < 20
  const sorted = [...bonuses].sort((a, b) => a.readyAt - b.readyAt);
  let running = 0;
  let targetReadyAt = 0;

  for (const item of sorted) {
    running += item.bonus;
    targetReadyAt = item.readyAt;
    if (running >= 80) break;
  }

  return { value: 20, readyAt: targetReadyAt > 0 ? targetReadyAt : null };
};

const formatRemaining = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.max(seconds % 60, 0);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const getArmyColor = (army) => {
  if (!army) return "#6c757d";
  const normalized = String(army).trim().toLowerCase();
  if (normalized === "attack") return "#e74c3c";
  if (normalized === "defense") return "#3498db";
  return "#6c757d";
};

// ===== SVG builder (для PNG кешу) =====
const escapeXmlAttr = (value) => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const camelToKebab = (str) => str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const styleObjToSvgStyle = (styleObj) => {
  if (!styleObj || typeof styleObj !== "object") return "";
  const parts = [];

  Object.entries(styleObj).forEach(([key, val]) => {
    if (val === undefined || val === null) return;
    if (key === "InkscapeFontSpecification") return;

    const cssKey = camelToKebab(key);
    const cssVal = typeof val === "number" ? String(val) : String(val);
    parts.push(`${cssKey}:${cssVal}`);
  });

  return parts.join(";");
};

const propsToAttrs = (props) => {
  if (!props || typeof props !== "object") return "";
  const allowed = ["id"];
  return allowed
    .filter((k) => props[k] !== undefined && props[k] !== null)
    .map((k) => `${k}="${escapeXmlAttr(props[k])}"`)
    .join(" ");
};

const buildGbgMapSvgString = ({ mapKey, mapDimensions, mapData, sectorColors, sectorStaff }) => {
  const w = Number(mapDimensions?.width || 0);
  const h = Number(mapDimensions?.height || 0);
  const viewBox = `0 0 ${w} ${h}`;
  const strokeWidth = mapKey === "volcanic_archipelago" ? 0.7 : 1.5;

  const body = Object.entries(mapData || {})
    .map(([sectorId, config]) => {
      if (!config || typeof config !== "object") return "";

      const { fill, text, icon } = config;

      const fillStyle = { ...(fill?.style || {}) };
      const color = sectorColors?.[sectorId];
      if (color) fillStyle.fill = color;

      fillStyle.stroke = "#121212";
      fillStyle.strokeWidth = strokeWidth;
      fillStyle.strokeOpacity = 1;

      const textStyle = {
        ...(text?.style || {}),
        display: sectorStaff?.[sectorId] ? "none" : (text?.style?.display ?? "inline"),
      };

      const iconStyle = {
        ...(icon?.style || {}),
        display: sectorStaff?.[sectorId] ? "inline" : "none",
        fill: "#FFFFFF",
      };
      if (typeof iconStyle.stroke === "string" && iconStyle.stroke.toLowerCase() !== "none") {
        iconStyle.stroke = "#FFFFFF";
      }

      const parts = [];

      if (fill?.d) {
        const attrs = propsToAttrs(fill?.props);
        const style = styleObjToSvgStyle(fillStyle);
        parts.push(`<path ${attrs} d="${escapeXmlAttr(fill.d)}" style="${escapeXmlAttr(style)}" />`);
      }

      if (text?.d) {
        const attrs = propsToAttrs(text?.props);
        const style = styleObjToSvgStyle(textStyle);
        parts.push(`<path ${attrs} d="${escapeXmlAttr(text.d)}" style="${escapeXmlAttr(style)}" />`);
      }

      if (icon?.d) {
        const attrs = propsToAttrs(icon?.props);
        const style = styleObjToSvgStyle(iconStyle);
        parts.push(`<path ${attrs} d="${escapeXmlAttr(icon.d)}" style="${escapeXmlAttr(style)}" />`);
      }

      return `<g id="${escapeXmlAttr(sectorId)}">\n${parts.join("\n")}\n</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">
${body}
</svg>`;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const safeJsonParse = (raw, fallback) => {
  try {
    if (typeof raw !== "string") return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
};

const pretty = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return String(value);
  }
};

// ======= Screen =======
const GBGscreen = () => {
  const navigation = useNavigation();
  const { guildId } = useContext(GuildContext);

  const [selectedId, setSelectedId] = useState(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});

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

  // Кнопка i -> debug
  const [widgetDebugVisible, setWidgetDebugVisible] = useState(false);

  // Рендер: interactive SVG або Xml
  const [useXmlRender, setUseXmlRender] = useState(false);

  const blinkingAnim = useRef(new Animated.Value(0)).current;
  const blinkingLoopRef = useRef(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listFadeAnim = useRef(new Animated.Value(0)).current;

  // Ref для hidden capture view (PNG)
  const captureBoxRef = useRef(null);

  // ===== Short guild id =====
  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        const storedId = await AsyncStorage.getItem("guildId");
        const effectiveId = guildId || storedId;

        if (!isActive || !effectiveId) {
          setShortGuildId(null);
          return;
        }

        const parts = String(effectiveId).split("_");
        const shortId = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        setShortGuildId(shortId);
      } catch (e) {
        if (isActive) setShortGuildId(null);
      }
    })();

    return () => { isActive = false; };
  }, [guildId]);

  // ===== Clock =====
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // ===== Map key from Firebase =====
  useEffect(() => {
    let mapRef;
    let onMapUpdate;

    setIsMapLoaded(false);
    setCurrentMap(null);
    setIsSectorDataLoaded(false);

    (async () => {
      const id = guildId || (await AsyncStorage.getItem("guildId"));
      if (!id) {
        setCurrentMap(DEFAULT_MAP_KEY);
        setIsMapLoaded(true);
        return;
      }

      mapRef = database().ref(`guilds/${id}/GBG/map`);
      onMapUpdate = (snap) => {
        let nextMap = DEFAULT_MAP_KEY;
        if (snap.exists()) {
          const value = snap.val();
          if (typeof value === "string" && MAP_DIMENSIONS[value]) nextMap = value;
        }
        setCurrentMap(nextMap);
        setIsMapLoaded(true);
      };

      mapRef.on("value", onMapUpdate);
    })();

    return () => {
      if (mapRef && onMapUpdate) mapRef.off("value", onMapUpdate);
    };
  }, [guildId]);

  // ===== Opponents =====
  useEffect(() => {
    let opponentsRef;
    let onOpponentsUpdate;

    setAreOpponentsLoaded(false);
    setOpponentList([]);
    setOpponentMapById({});
    setOpponentStaffSectors({});

    (async () => {
      const id = guildId || (await AsyncStorage.getItem("guildId"));
      if (!id) {
        setOpponentStaffSectors({});
        setAreOpponentsLoaded(true);
        return;
      }

      opponentsRef = database().ref(`guilds/${id}/GBG/opponents`);
      onOpponentsUpdate = (snap) => {
        if (snap.exists()) {
          const raw = snap.val() || {};
          const byId = {};
          const list = [];
          const staffFlags = {};

          Object.entries(raw).forEach(([key, value]) => {
            if (value && typeof value === "object") {
              const normalizedId = value.id != null ? String(value.id) : String(key);
              const sectorColor = value.sectorColor ? String(value.sectorColor) : "#FFFFFF";
              const staffSectors = parseStaffSectors(value.staff);

              const entry = { key, id: normalizedId, name: value.name || normalizedId, sectorColor };
              byId[normalizedId] = entry;
              list.push(entry);

              staffSectors.forEach((sectorId) => { if (sectorId) staffFlags[sectorId] = true; });
            }
          });

          list.sort((a, b) => a.name.localeCompare(b.name, "uk", { sensitivity: "base" }));

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

      opponentsRef.on("value", onOpponentsUpdate);
    })();

    return () => {
      if (opponentsRef && onOpponentsUpdate) opponentsRef.off("value", onOpponentsUpdate);
    };
  }, [guildId]);

  const mapKey = currentMap ?? DEFAULT_MAP_KEY;
  const mapDimensions = MAP_DIMENSIONS[mapKey] || MAP_DIMENSIONS[DEFAULT_MAP_KEY];
  const viewBox = `0 0 ${mapDimensions.width} ${mapDimensions.height}`;

  const mapTitle =
    MAP_TITLE_TRANSLATIONS[mapKey] ||
    mapKey.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // ===== Header =====
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: mapTitle,
      headerStyle: {
        backgroundColor: "#1c1c1e",
        shadowColor: "transparent",
        elevation: 0,
      },
      headerTintColor: "#E0E0E0",
      headerTitleStyle: { fontWeight: "bold" },
      headerRight: () => (
        <TouchableOpacity style={styles.infoButton} onPress={() => setWidgetDebugVisible(true)}>
          <FontAwesomeIcon icon={faInfoCircle} size={22} color="#E0E0E0" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, mapTitle]);

  // ===== Reset on map switch =====
  useEffect(() => {
    if (!isMapLoaded) return;
    setSectorStaff({});
    setSectorSchedule([]);
    setSectorColors({});
    setSectorSnapshot(null);
    setIsSectorDataLoaded(false);
    setBlinkingSector(null);
  }, [currentMap, isMapLoaded]);

  // ===== Sectors snapshot =====
  useEffect(() => {
    if (!isMapLoaded) return;

    let sectorsRef;
    let onSectorsUpdate;

    (async () => {
      const id = guildId || (await AsyncStorage.getItem("guildId"));
      if (!id) {
        setSectorSnapshot(null);
        setIsSectorDataLoaded(true);
        return;
      }

      sectorsRef = database().ref(`guilds/${id}/GBG/sectors`);
      onSectorsUpdate = (snap) => {
        setSectorSnapshot(snap.exists() ? snap.val() : null);
        setIsSectorDataLoaded(true);
      };

      sectorsRef.on("value", onSectorsUpdate);
    })();

    return () => {
      if (sectorsRef && onSectorsUpdate) sectorsRef.off("value", onSectorsUpdate);
    };
  }, [guildId, isMapLoaded]);

  // ===== Colors & staff flags =====
  useEffect(() => {
    if (!isMapLoaded || !areOpponentsLoaded) return;

    const data = sectorSnapshot && typeof sectorSnapshot === "object" ? sectorSnapshot : {};
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

    sectorIds.forEach((gid) => {
      const entry = data[gid];
      let color = "#FFFFFF";
      let staff = false;
      let ownerValue = null;

      if (entry && typeof entry === "object") {
        if (typeof entry.color === "string") color = entry.color;

        ownerValue = entry.owner ?? entry.ownerId;
        if (ownerValue !== null && ownerValue !== undefined) {
          const ownerKey = String(ownerValue);
          if (ownerKey === "0") {
            color = "#FFFFFF";
          } else {
            const opponent = opponentMapById[ownerKey];
            color = opponent?.sectorColor
              ? String(opponent.sectorColor)
              : (typeof entry.color === "string" ? entry.color : "#FFFFFF");
          }
        }

        staff = !!entry.staff;
      } else if (typeof entry === "string") {
        color = entry;
      }

      colors[gid] = color || "#FFFFFF";
      staffFlags[gid] = staff;
    });

    Object.keys(opponentStaffSectors).forEach((sectorId) => {
      if (opponentStaffSectors[sectorId] && availableSectors.has(sectorId)) staffFlags[sectorId] = true;
    });

    setSectorColors(colors);
    setSectorStaff(staffFlags);
  }, [areOpponentsLoaded, isMapLoaded, mapKey, opponentMapById, opponentStaffSectors, sectorSnapshot]);

  // ===== Schedule (neighbor sectors of own sectors) =====
  useEffect(() => {
    if (!isMapLoaded || !shortGuildId) {
      setSectorSchedule([]);
      return;
    }

    const data = sectorSnapshot && typeof sectorSnapshot === "object" ? sectorSnapshot : {};
    const mapData = MAP_DATA[mapKey] || {};
    const sectorIds = Object.keys(mapData);

    if (sectorIds.length === 0) {
      setSectorSchedule([]);
      return;
    }

    const ownSectors = sectorIds.filter((id) => String(data[id]?.owner ?? data[id]?.ownerId) === String(shortGuildId));
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
      .map((sectorId) => {
        const entry = data[sectorId];
        if (!entry || typeof entry !== "object") return null;

        const openTime = Number(entry.openTime);
        if (!Number.isFinite(openTime) || openTime <= 0) return null;

        const armyRaw = String(entry.army || "").trim().toLowerCase();
        const army = armyRaw === "attack" || armyRaw === "defense" ? armyRaw : "";

        const bonusInfo = calculateSectorBonus({ mapKey, sectorId, sectors: data, shortGuildId });
        return {
          name: sectorId,
          openTime,
          army,
          bonusValue: bonusInfo.value,
          bonusReadyAt: bonusInfo.readyAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.openTime - b.openTime);

    setSectorSchedule(schedule);
  }, [isMapLoaded, mapKey, sectorSnapshot, shortGuildId]);

  // ===== Blink animation =====
  useEffect(() => {
    if (blinkingLoopRef.current) blinkingLoopRef.current.stop();

    if (blinkingSector) {
      blinkingLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkingAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(blinkingAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        ]),
        { resetBeforeIteration: true }
      );
      blinkingLoopRef.current.start();
    } else {
      blinkingAnim.setValue(0);
    }

    return () => {
      if (blinkingLoopRef.current) blinkingLoopRef.current.stop();
    };
  }, [blinkingAnim, blinkingSector]);

  // ===== Fade-in =====
  useEffect(() => {
    if (isMapLoaded && isSectorDataLoaded && areOpponentsLoaded) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  }, [isMapLoaded, isSectorDataLoaded, areOpponentsLoaded, fadeAnim]);

  useEffect(() => {
    if (sectorSchedule.length > 0) {
      Animated.timing(listFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } else {
      listFadeAnim.setValue(0);
    }
  }, [sectorSchedule, listFadeAnim]);

  const handleSchedulePress = (sectorId) => setBlinkingSector((prev) => (prev === sectorId ? null : sectorId));

  const handleShapePress = async (id, event) => {
    try {
      const gid = guildId || (await AsyncStorage.getItem("guildId"));
      if (!gid) return;

      const { pageX = width / 2, pageY = HALF_HEIGHT } = event?.nativeEvent || {};
      const position =
        pageX > width / 2
          ? { right: Math.max(width - pageX, 20), top: Math.max(pageY - 20, 20) }
          : { left: Math.max(pageX - 20, 20), top: Math.max(pageY - 20, 20) };

      setPopupStyle(position);
      setSelectedId(id);
      setPopupVisible(true);
    } catch (e) {}
  };

  const handleHelpPress = async () => {
    if (!selectedId) return;

    try {
      const gid = guildId || (await AsyncStorage.getItem("guildId"));
      if (!gid) {
        Alert.alert("Помилка", "Не вдалося визначити гільдію.");
        return;
      }

      setPopupVisible(false);
      Alert.alert("Відправка...", "Надсилаємо сповіщення всім членам гільдії.");

      const sendNotification = functions().httpsCallable("sendGbgHelpNotification");
      await sendNotification({ guildId: gid, sectorId: selectedId });

      Alert.alert("Успіх!", "Сповіщення надіслано.");
    } catch (error) {
      Alert.alert("Помилка", "Не вдалося надіслати сповіщення. Спробуйте пізніше.");
    }
  };

  // ===== SVG XML (для PNG кешу + опційного рендера) =====
  const svgXml = useMemo(() => {
    const data = MAP_DATA[mapKey] || {};
    return buildGbgMapSvgString({
      mapKey,
      mapDimensions,
      mapData: data,
      sectorColors,
      sectorStaff,
    });
  }, [mapKey, mapDimensions, sectorColors, sectorStaff]);

  // ===== Manual widget cache refresh (PNG + next5) =====
  const buildNext5Payload = () => {
    const next5 = (sectorSchedule || []).slice(0, 5).map((item) => ({
      sectorId: item.name,
      openTime: item.openTime || 0,
      army: item.army || "",
      bonusValue: Number.isFinite(item.bonusValue) ? item.bonusValue : 100,
      bonusReadyAt: item.bonusReadyAt ? Number(item.bonusReadyAt) : 0,
    }));

    return next5;
  };

  const writeNext5ToCache = async (next5) => {
    const now = Date.now();
    const meta = { updatedAt: now, mapKey, count: Array.isArray(next5) ? next5.length : 0 };

    await AsyncStorage.multiSet([
      [WIDGET_GBG_NEXT5_KEY, JSON.stringify(next5 || [])],
      [WIDGET_GBG_NEXT5_META_KEY, JSON.stringify(meta)],
    ]);
  };

  const captureMapPngToCache = async () => {
    const now = Date.now();
    const metaBase = { updatedAt: now, mapKey, width: mapDimensions.width, height: mapDimensions.height, pngError: null };

    try {
      if (!captureBoxRef.current) throw new Error("captureBoxRef is null");

      // Даємо 1 кадр щоб SvgXml точно промалювався
      await wait(60);

      const tmpUri = await captureRef(captureBoxRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const fileName = `gbg_map_widget_${mapKey}.png`;
      const finalUri = `${FileSystem.cacheDirectory}${fileName}`;

      // copyAsync з legacy щоб не ловити deprecated warning
      await FileSystem.copyAsync({ from: tmpUri, to: finalUri });

      await AsyncStorage.multiSet([
        [WIDGET_GBG_MAP_PNG_URI_KEY, finalUri],
        [WIDGET_GBG_MAP_META_KEY, JSON.stringify(metaBase)],
      ]);

      return { ok: true, uri: finalUri, error: null };
    } catch (e) {
      const errText = e?.message ? String(e.message) : "PNG capture error";

      const meta = { ...metaBase, pngError: errText };
      await AsyncStorage.multiSet([
        [WIDGET_GBG_MAP_PNG_URI_KEY, "null"],
        [WIDGET_GBG_MAP_META_KEY, JSON.stringify(meta)],
      ]);

      return { ok: false, uri: null, error: errText };
    }
  };

  const refreshWidgetCacheManually = async () => {
    // 1) next5
    const next5 = buildNext5Payload();
    await writeNext5ToCache(next5);

    // 2) png
    await captureMapPngToCache();
  };

  // ===== Debug modal state (reads AsyncStorage) =====
  const [widgetCacheDump, setWidgetCacheDump] = useState({
    mapPngUri: null,
    mapMeta: null,
    next5: null,
    next5Meta: null,
  });

  const readWidgetCacheDump = async () => {
    const pairs = await AsyncStorage.multiGet([
      WIDGET_GBG_MAP_PNG_URI_KEY,
      WIDGET_GBG_MAP_META_KEY,
      WIDGET_GBG_NEXT5_KEY,
      WIDGET_GBG_NEXT5_META_KEY,
    ]);

    const dict = {};
    pairs.forEach(([k, v]) => (dict[k] = v));

    setWidgetCacheDump({
      mapPngUri: dict[WIDGET_GBG_MAP_PNG_URI_KEY] ?? null,
      mapMeta: safeJsonParse(dict[WIDGET_GBG_MAP_META_KEY], null),
      next5: safeJsonParse(dict[WIDGET_GBG_NEXT5_KEY], null),
      next5Meta: safeJsonParse(dict[WIDGET_GBG_NEXT5_META_KEY], null),
    });
  };

  useEffect(() => {
    if (!widgetDebugVisible) return;
    readWidgetCacheDump().catch(() => {});
  }, [widgetDebugVisible]);

  // ===== Simulate data-only push (щоб “перевірити зараз”) =====
  const simulateDataOnlyPush = async () => {
    const fakeNext5 = [
      { sectorId: "B4G", openTime: Math.floor(Date.now() / 1000) + 900, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "D3Z", openTime: Math.floor(Date.now() / 1000) + 1200, army: "attack", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "D4D", openTime: Math.floor(Date.now() / 1000) + 1500, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "A2S", openTime: Math.floor(Date.now() / 1000) + 1800, army: "attack", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "C4C", openTime: Math.floor(Date.now() / 1000) + 2100, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
    ];

    // Симуляція: наче прийшло з Firebase (data-only)
    await writeNext5ToCache(fakeNext5);
    await readWidgetCacheDump();
  };

  // ===== Render interactive SVG paths =====
  const renderMapPaths = () => {
    const data = MAP_DATA[mapKey] || {};

    return Object.entries(data).map(([sectorId, config]) => {
      const { fill, text, icon } = config;

      const fillStyle = { ...(fill?.style || {}) };
      const color = sectorColors[sectorId];
      if (color) fillStyle.fill = color;

      fillStyle.stroke = "#121212";
      fillStyle.strokeWidth = mapKey === "volcanic_archipelago" ? 0.7 : 1.5;
      fillStyle.strokeOpacity = 1;

      const textStyle = {
        ...(text?.style || {}),
        display: sectorStaff[sectorId] ? "none" : (text?.style?.display ?? "inline"),
      };

      const iconStyle = {
        ...(icon?.style || {}),
        display: sectorStaff[sectorId] ? "inline" : "none",
        fill: "#FFFFFF",
      };
      if (typeof iconStyle.stroke === "string" && iconStyle.stroke.toLowerCase() !== "none") {
        iconStyle.stroke = "#FFFFFF";
      }

      const isBlinking = blinkingSector === sectorId;
      const animatedFillOpacity = isBlinking
        ? blinkingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] })
        : fillStyle.fillOpacity;

      return (
        <G key={sectorId} onPress={() => handleShapePress(sectorId)}>
          {fill && (
            <AnimatedPath
              {...fill.props}
              d={fill.d}
              onPressIn={(e) => handleShapePress(sectorId, e)}
              style={fillStyle}
              fillOpacity={animatedFillOpacity}
            />
          )}
          {text && <Path {...text.props} d={text.d} onPressIn={(e) => handleShapePress(sectorId, e)} style={textStyle} />}
          {icon && <Path {...icon.props} d={icon.d} onPressIn={(e) => handleShapePress(sectorId, e)} style={iconStyle} />}
        </G>
      );
    });
  };

  // ===== Loading =====
  if (!isMapLoaded || !isSectorDataLoaded || !areOpponentsLoaded) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loaderText}>Завантаження карти...</Text>
      </View>
    );
  }

  return (
    <View style={styles.win}>
      <StatusBar barStyle="light-content" />

      {/* ===== Hidden capture box for PNG widget cache ===== */}
      <View
        ref={captureBoxRef}
        collapsable={false}
        pointerEvents="none"
        style={styles.captureBox}
      >
        <SvgXml xml={svgXml} width="100%" height="100%" />
      </View>

      {/* ===== Map ===== */}
      <Animated.View style={[styles.mapContainer, { opacity: fadeAnim }]}>
        {useXmlRender ? (
          <SvgXml xml={svgXml} width="100%" height="100%" />
        ) : (
          <Svg width="100%" height="100%" viewBox={viewBox}>
            {renderMapPaths()}
          </Svg>
        )}
      </Animated.View>

      {/* ===== Schedule list ===== */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Відкриття секторів</Text>

        {sectorSchedule.length > 0 ? (
          <Animated.ScrollView
            style={[styles.sectorList, { opacity: listFadeAnim }]}
            contentContainerStyle={styles.sectorListContent}
          >
            {sectorSchedule.map((item) => {
              const timeRemainingSeconds = item.openTime ? Math.max(item.openTime - currentTime, 0) : 0;
              const bonusRemainingSeconds = item.bonusReadyAt ? Math.max(item.bonusReadyAt - currentTime, 0) : 0;
              const bonusTimeLabel = bonusRemainingSeconds > 0 ? ` (${formatRemaining(bonusRemainingSeconds)})` : "";

              return (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.sectorRow, blinkingSector === item.name && styles.activeSectorRow]}
                  onPress={() => handleSchedulePress(item.name)}
                  activeOpacity={0.8}
                >
                  <View style={styles.sectorNameContainer}>
                    <View style={[styles.armyBox, { backgroundColor: getArmyColor(item.army) }]} />
                    <Text style={styles.sectorName}>{item.name}</Text>
                  </View>

                  <View style={styles.sectorMeta}>
                    <Text style={styles.sectorTime}>{item.openTime ? formatRemaining(timeRemainingSeconds) : "--:--:--"}</Text>
                    <Text style={styles.sectorBonus}>Бонус: {item.bonusValue}{bonusTimeLabel}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>
        ) : (
          <View style={styles.emptyListContainer}>
            <Text style={styles.emptyListText}>Найближчим часом секторів немає</Text>
          </View>
        )}
      </View>

      {/* ===== Popup menu ===== */}
      {popupVisible && (
        <TouchableOpacity style={styles.popupOverlay} activeOpacity={1} onPress={() => setPopupVisible(false)}>
          <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={3} />

          <Animated.View style={[styles.popupMenu, popupStyle]} onStartShouldSetResponder={() => true}>
            <TouchableOpacity
              style={styles.menuItem}
              disabled={!selectedId || sectorStaff[selectedId]}
              onPress={handleHelpPress}
            >
              <FontAwesomeIcon
                icon={faFire}
                size={20}
                color={!selectedId || sectorStaff[selectedId] ? "#6a737c" : "#e74c3c"}
                style={styles.menuIcon}
              />
              <Text style={[styles.menuText, (!selectedId || sectorStaff[selectedId]) && styles.disabledText]}>
                Допомагайте
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* ===== Debug modal opened by "i" ===== */}
      {widgetDebugVisible && (
        <View style={styles.infoOverlay}>
          <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={6} />

          <View style={styles.debugModal}>
            <Text style={styles.debugTitle}>Widget cache (AsyncStorage)</Text>

            <ScrollView style={styles.debugScroll} contentContainerStyle={styles.debugScrollContent}>
              <Text style={styles.debugKey}>widget_gbg_map_png_uri:</Text>
              <Text style={styles.debugValue}>{pretty(widgetCacheDump.mapPngUri)}</Text>

              <Text style={styles.debugKey}>widget_gbg_map_meta:</Text>
              <Text style={styles.debugValue}>{pretty(widgetCacheDump.mapMeta)}</Text>

              <Text style={styles.debugKey}>widget_gbg_next5:</Text>
              <Text style={styles.debugValue}>{pretty(widgetCacheDump.next5)}</Text>

              <Text style={styles.debugKey}>widget_gbg_next5_meta:</Text>
              <Text style={styles.debugValue}>{pretty(widgetCacheDump.next5Meta)}</Text>
            </ScrollView>

            <View style={styles.debugButtonsRow}>
              <TouchableOpacity
                style={styles.debugBtnPrimary}
                onPress={async () => {
                  await refreshWidgetCacheManually();
                  await readWidgetCacheDump();
                }}
              >
                <Text style={styles.debugBtnText}>Оновити</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugBtnSecondary}
                onPress={simulateDataOnlyPush}
              >
                <Text style={styles.debugBtnText}>Тест data-only</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugBtnPrimary}
                onPress={() => setWidgetDebugVisible(false)}
              >
                <Text style={styles.debugBtnText}>Закрити</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  win: { flex: 1, backgroundColor: "#121212" },

  loaderContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#121212" },
  loaderText: { marginTop: 15, fontSize: 16, color: "#E0E0E0", fontWeight: "500" },

  infoButton: { marginRight: 15, padding: 5 },

  mapContainer: { height: HALF_HEIGHT, width: "100%", backgroundColor: "#1c1c1e", overflow: "hidden" },

  listContainer: { flex: 1, width: "100%", paddingTop: 20 },
  listTitle: { fontSize: 22, fontWeight: "bold", color: "#E0E0E0", marginLeft: 20, marginBottom: 15 },

  sectorList: { width: "100%" },
  sectorListContent: { paddingHorizontal: 20, paddingBottom: 20 },

  sectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: "#282828",
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },

  sectorNameContainer: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  armyBox: { width: 14, height: 14, borderRadius: 4, marginRight: 12 },
  sectorName: { fontSize: 16, color: "#EAEAEA", fontWeight: "600" },

  sectorMeta: { alignItems: "flex-end" },
  sectorTime: { fontSize: 16, color: "#EAEAEA", fontWeight: "700", fontFamily: "monospace" },
  sectorBonus: { marginTop: 4, fontSize: 13, color: "#A0D8FF", fontWeight: "600" },

  activeSectorRow: { backgroundColor: "rgba(52, 152, 219, 0.2)", borderWidth: 1, borderColor: "#3498db" },

  emptyListContainer: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -50 },
  emptyListText: { fontSize: 16, color: "#888", fontStyle: "italic" },

  popupOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 },
  popupMenu: {
    position: "absolute",
    backgroundColor: "rgba(40, 40, 40, 0.9)",
    borderRadius: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10 },
  menuIcon: { marginRight: 10 },
  menuText: { fontSize: 18, color: "#E0E0E0", fontWeight: "600" },
  disabledText: { color: "#6a737c" },

  // Debug modal
  infoOverlay: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },

  debugModal: {
    width: "88%",
    maxHeight: "72%",
    backgroundColor: "rgba(20, 20, 20, 0.92)",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  debugTitle: { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 12 },

  debugScroll: { flexGrow: 0 },
  debugScrollContent: { paddingBottom: 8 },

  debugKey: { marginTop: 14, color: "#64b5f6", fontSize: 16, fontWeight: "700" },
  debugValue: { marginTop: 6, color: "#eaeaea", fontSize: 14, fontFamily: "monospace" },

  debugButtonsRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },

  debugBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#2e86de",
    borderRadius: 18,
    flexGrow: 1,
    alignItems: "center",
  },

  debugBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#3a3a3a",
    borderRadius: 18,
    flexGrow: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  debugBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  // Hidden capture box (PNG)
  captureBox: {
    position: "absolute",
    left: -9999,
    top: -9999,
    width: 520,
    height: 520,
    opacity: 0,
  },
});

export default GBGscreen;
