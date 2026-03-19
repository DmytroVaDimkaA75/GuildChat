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
  if (!rects.length) {
    return {
      x: 0,
      y: 0,
      width: MAP_VIEWBOX.width,
      height: MAP_VIEWBOX.height,
    };
  }

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const ObstaclesMap = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');

  const { sectorRects, startOpenRects } = useMemo(() => {
    const pack = RULE_PACKS[settlementName];
    const sectors = pack?.map?.allSectors || [];
    const startOpenSectors = pack?.map?.startOpenSectors || [];

    return {
      sectorRects: sectors.map(parseSectorRange).filter(Boolean),
      startOpenRects: startOpenSectors.map(parseSectorRange).filter(Boolean),
    };
  }, [settlementName]);

  const visibleBounds = useMemo(() => getRectsBounds(sectorRects), [sectorRects]);
  const mapHeight = screenWidth * (visibleBounds.height / visibleBounds.width);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Перешкоди: {settlementName || '—'}</Text>

      <Svg
        width={screenWidth}
        height={mapHeight}
        viewBox={`${visibleBounds.x} ${visibleBounds.y} ${visibleBounds.width} ${visibleBounds.height}`}
      >
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

          {startOpenRects.map((rect, idx) => (
            <Rect
              key={`start-open-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="#FFFFFF"
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
});

export default ObstaclesMap;
