import { useMemo } from 'react';
import { useRoute } from '@react-navigation/native';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Rect } from 'react-native-svg';

import MapSvg from './map.svg';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  textPrimary: '#FFFFFF',
};

const MAP_VIEWBOX = { width: 239.99976, height: 200 };
const MAP_RATIO = MAP_VIEWBOX.width / MAP_VIEWBOX.height;
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

const ObstaclesMap = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');

  const mapWidth = screenWidth;
  const mapHeight = mapWidth / MAP_RATIO;

  const sectorRects = useMemo(() => {
    const pack = RULE_PACKS[settlementName];
    const sectors = pack?.map?.allSectors || [];
    return sectors.map(parseSectorRange).filter(Boolean);
  }, [settlementName]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Перешкоди: {settlementName || '—'}</Text>

      <Svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}>
        <Defs>
          <ClipPath id="allowedSectorsClip">
            {sectorRects.map((rect, idx) => (
              <Rect
                key={`clip-${idx}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
              />
            ))}
          </ClipPath>
        </Defs>

        <G clipPath="url(#allowedSectorsClip)">
          <MapSvg width={MAP_VIEWBOX.width} height={MAP_VIEWBOX.height} />
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
});

export default ObstaclesMap;
