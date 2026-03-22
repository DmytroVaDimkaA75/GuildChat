import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

import MapSvg from './map.svg';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  textPrimary: '#FFFFFF',
  borderStrong: '#111111',
  sectorGrid: '#303030',
};

const MAP_VIEWBOX = { width: 279.99976, height: 280 };
const TILE_SIZE = 10;

const lettersToIndex = (letters) => {
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx;
};

const parseSectorRange = (range) => {
  if (!range) return null;
  const match = String(range).toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;

  const startCol = lettersToIndex(match[1]);
  const startRow = Number(match[2]);
  const endCol = lettersToIndex(match[3]);
  const endRow = Number(match[4]);

  return {
    x: (startCol - 1) * TILE_SIZE,
    y: (startRow - 1) * TILE_SIZE,
    width: (endCol - startCol + 1) * TILE_SIZE,
    height: (endRow - startRow + 1) * TILE_SIZE,
  };
};

const getRectsBounds = (rects) => {
  if (!rects.length) return { x: 0, y: 0, width: MAP_VIEWBOX.width, height: MAP_VIEWBOX.height };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const SettlementGamePlanner = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');
  const [openedSectorsFromDb, setOpenedSectorsFromDb] = useState([]);
  const [obstacleRectsFromDb, setObstacleRectsFromDb] = useState([]);
  const [buildingRectsFromDb, setBuildingRectsFromDb] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) {
          if (isMounted) {
            setOpenedSectorsFromDb([]);
            setIsLoading(false);
          }
          return;
        }

        const settlementSnap = await database().ref(`/users/${userId}/${guildId}/settlement`).once('value');
        const settlementData = settlementSnap.exists() ? settlementSnap.val() : {};

        const openedRaw = settlementData?.openedSectors || [];
        const obstaclesRaw = settlementData?.sectorObstaclesStatic || {};
        const buildingsRaw = settlementData?.placedBuildings || [];

        const openedArr = Array.isArray(openedRaw) ? openedRaw : Object.values(openedRaw || {});
        const buildingsArr = Array.isArray(buildingsRaw) ? buildingsRaw : Object.values(buildingsRaw || {});

        const nextObstacleRects = [];
        Object.entries(obstaclesRaw || {}).forEach(([sector, obstacles]) => {
          const sectorRect = parseSectorRange(sector);
          if (!sectorRect || !Array.isArray(obstacles)) return;

          obstacles.forEach((obstacle) => {
            const x = Number(obstacle?.x);
            const y = Number(obstacle?.y);
            const w = Number(obstacle?.w);
            const h = Number(obstacle?.h);
            if (![x, y, w, h].every((value) => Number.isFinite(value))) return;

            nextObstacleRects.push({
              x: sectorRect.x + x * TILE_SIZE,
              y: sectorRect.y + y * TILE_SIZE,
              width: w * TILE_SIZE,
              height: h * TILE_SIZE,
            });
          });
        });

        const nextBuildingRects = buildingsArr
          .map((building) => ({
            rect: parseSectorRange(building?.footprint),
            buildingId: building?.buildingId || '',
            instanceId: building?.instanceId || '',
          }))
          .filter((item) => item.rect);

        if (isMounted) {
          setOpenedSectorsFromDb(openedArr.filter(Boolean));
          setObstacleRectsFromDb(nextObstacleRects);
          setBuildingRectsFromDb(nextBuildingRects);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Не вдалося завантажити дані settlement:', error);
        if (isMounted) {
          setOpenedSectorsFromDb([]);
          setObstacleRectsFromDb([]);
          setBuildingRectsFromDb([]);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const { allRects, openedRects } = useMemo(() => {
    const pack = RULE_PACKS[settlementName] || Object.values(RULE_PACKS).find((item) => item?.settlementType === settlementName);
    const allSectors = pack?.map?.allSectors || [];
    return {
      allRects: allSectors.map(parseSectorRange).filter(Boolean),
      openedRects: openedSectorsFromDb.map(parseSectorRange).filter(Boolean),
    };
  }, [openedSectorsFromDb, settlementName]);

  const bounds = useMemo(() => getRectsBounds(allRects), [allRects]);
  const mapHeight = screenWidth * (bounds.height / bounds.width);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Планувальник: {settlementName || '—'}</Text>
      <Svg
        width={screenWidth}
        height={mapHeight}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      >
        <Defs>
          <ClipPath id="gameAllowedClip">
            {allRects.map((rect, idx) => (
              <Rect key={`g-clip-${idx}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
          </ClipPath>
        </Defs>

        <G clipPath="url(#gameAllowedClip)">
          <MapSvg width={MAP_VIEWBOX.width} height={MAP_VIEWBOX.height} />
          {openedRects.map((rect, idx) => (
            <G key={`g-open-${idx}`}>
              <Rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#FFFFFF" />
              <Rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill="none"
                stroke={COLORS.borderStrong}
                strokeWidth={1.8}
              />
              {[1, 2, 3].map((i) => (
                <Line
                  key={`g-v-${idx}-${i}`}
                  x1={rect.x + i * TILE_SIZE}
                  y1={rect.y}
                  x2={rect.x + i * TILE_SIZE}
                  y2={rect.y + rect.height}
                  stroke={COLORS.sectorGrid}
                  strokeWidth={0.7}
                />
              ))}
              {[1, 2, 3].map((i) => (
                <Line
                  key={`g-h-${idx}-${i}`}
                  x1={rect.x}
                  y1={rect.y + i * TILE_SIZE}
                  x2={rect.x + rect.width}
                  y2={rect.y + i * TILE_SIZE}
                  stroke={COLORS.sectorGrid}
                  strokeWidth={0.7}
                />
              ))}
            </G>
          ))}

          {obstacleRectsFromDb.map((rect, idx) => (
            <Rect
              key={`g-obstacle-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="#4A4A4A"
            />
          ))}

          {buildingRectsFromDb.map((building, idx) => (
            <Rect
              key={`g-building-${building.instanceId || idx}`}
              x={building.rect.x}
              y={building.rect.y}
              width={building.rect.width}
              height={building.rect.height}
              fill={building.buildingId === 'town_hall' ? '#E3F2FD' : '#81D4FA'}
              stroke="#0D47A1"
              strokeWidth={1}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    paddingTop: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    marginBottom: 16,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});

export default SettlementGamePlanner;
