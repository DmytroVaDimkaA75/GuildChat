import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';

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
  if (!rects.length) {
    return { x: 0, y: 0, width: MAP_VIEWBOX.width, height: MAP_VIEWBOX.height };
  }

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const ObstaclesMap = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');

  const [obstacleMode, setObstacleMode] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [obstacleRects, setObstacleRects] = useState([]);
  const [modalGridSize, setModalGridSize] = useState({ width: 0, height: 0 });

  const { sectorRects, startOpenRects, nonStartOpenSectors, nonStartOpenRects } = useMemo(() => {
    const pack = RULE_PACKS[settlementName];
    const allSectors = pack?.map?.allSectors || [];
    const startOpenSectors = pack?.map?.startOpenSectors || [];
    const startOpenSet = new Set(startOpenSectors);
    const closed = allSectors.filter((s) => !startOpenSet.has(s));

    return {
      sectorRects: allSectors.map(parseSectorRange).filter(Boolean),
      startOpenRects: startOpenSectors.map(parseSectorRange).filter(Boolean),
      nonStartOpenSectors: closed,
      nonStartOpenRects: closed.map(parseSectorRange).filter(Boolean),
    };
  }, [settlementName]);

  const visibleBounds = useMemo(() => getRectsBounds(sectorRects), [sectorRects]);
  const mapHeight = screenWidth * (visibleBounds.height / visibleBounds.width);

  const openSectorModal = (sector) => {
    setSelectedSector(sector);
    setObstacleMode(null);
    setModalVisible(true);
  };

  const selectedObstacle = selectedSector
    ? obstacleRects.find((o) => o.sector === selectedSector)
    : null;

  const placeObstacleInSelectedSector = (event) => {
    if (!selectedSector || !obstacleMode || !modalGridSize.width || !modalGridSize.height) return;

    const sectorRect = parseSectorRange(selectedSector);
    if (!sectorRect) return;

    const { locationX, locationY } = event.nativeEvent;
    const colOffset = Math.min(3, Math.floor((locationX / modalGridSize.width) * 4));
    const rowOffset = Math.min(3, Math.floor((locationY / modalGridSize.height) * 4));

    if (
      (rowOffset === 3 && colOffset === 3) ||
      (rowOffset === 3 && colOffset < 3 && obstacleMode === 'vertical') ||
      (colOffset === 3 && rowOffset < 3 && obstacleMode === 'horizontal')
    ) {
      return;
    }

    const obstacle = {
      sector: selectedSector,
      rect: {
        x: sectorRect.x + colOffset * TILE_SIZE,
        y: sectorRect.y + rowOffset * TILE_SIZE,
        width: obstacleMode === 'horizontal' ? TILE_SIZE * 2 : TILE_SIZE,
        height: obstacleMode === 'vertical' ? TILE_SIZE * 2 : TILE_SIZE,
      },
    };

    setObstacleRects((prev) => [...prev.filter((o) => o.sector !== selectedSector), obstacle]);
  };


  const buildObstaclePayload = useCallback(() => {
    const grouped = {};

    obstacleRects.forEach((item, index) => {
      const sector = item?.sector;
      if (!sector) return;
      const sectorRect = parseSectorRange(sector);
      if (!sectorRect) return;

      const startMatch = String(sector).match(/^([A-Z]+)(\d+):/);
      const baseId = startMatch
        ? `obs_${startMatch[1].toLowerCase()}${startMatch[2]}`
        : `obs_${String(sector).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const obstacleData = {
        obstacleId: `${baseId}_${index + 1}`,
        x: Math.round((item.rect.x - sectorRect.x) / TILE_SIZE),
        y: Math.round((item.rect.y - sectorRect.y) / TILE_SIZE),
        w: Math.round(item.rect.width / TILE_SIZE),
        h: Math.round(item.rect.height / TILE_SIZE),
      };

      if (!grouped[sector]) grouped[sector] = [];
      grouped[sector].push(obstacleData);
    });

    return grouped;
  }, [obstacleRects]);

  const handleSave = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');

      if (!userId || !guildId) {
        Alert.alert('Помилка', 'Не знайдено userId або guildId для збереження.');
        return;
      }

      const basePath = `/users/${userId}/${guildId}/settlement`;
      await database().ref(`${basePath}/sectorObstaclesStatic`).set(buildObstaclePayload());
      await database().ref(basePath).update({
        settlementName: settlementName || null,
        status: 'edit',
      });

      Alert.alert('Успіх', 'Перешкоди успішно збережено.');
    } catch (error) {
      console.error('Не вдалося зберегти перешкоди:', error);
      Alert.alert('Помилка', 'Не вдалося зберегти перешкоди. Спробуйте ще раз.');
    }
  }, [buildObstaclePayload, settlementName]);

  useEffect(() => {
    navigation.setParams({
      onSaveObstaclesMap: handleSave,
      canSaveObstaclesMap: obstacleRects.length > 0,
    });
  }, [handleSave, navigation, obstacleRects.length]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Перешкоди: {settlementName || '—'}</Text>

      <View style={[styles.mapWrap, { width: screenWidth, height: mapHeight }]}>
        <Svg
          width={screenWidth}
          height={mapHeight}
          viewBox={`${visibleBounds.x} ${visibleBounds.y} ${visibleBounds.width} ${visibleBounds.height}`}
        >
        <Defs>
          <ClipPath id="allowedSectorsClip">
            {sectorRects.map((rect, idx) => (
              <Rect key={`clip-${idx}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
          </ClipPath>
        </Defs>

        <G clipPath="url(#allowedSectorsClip)">
          <MapSvg width={MAP_VIEWBOX.width} height={MAP_VIEWBOX.height} />

          {startOpenRects.map((rect, idx) => (
            <G key={`start-open-${idx}`}>
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
                  key={`v-${idx}-${i}`}
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
                  key={`h-${idx}-${i}`}
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

          {obstacleRects.map((o, idx) => (
            <Rect
              key={`obs-${idx}`}
              x={o.rect.x}
              y={o.rect.y}
              width={o.rect.width}
              height={o.rect.height}
              fill="#4A4A4A"
            />
          ))}

        </G>
        </Svg>

        <View style={StyleSheet.absoluteFill}>
          {nonStartOpenRects.map((rect, idx) => {
            const x = ((rect.x - visibleBounds.x) / visibleBounds.width) * screenWidth;
            const y = ((rect.y - visibleBounds.y) / visibleBounds.height) * mapHeight;
            const width = (rect.width / visibleBounds.width) * screenWidth;
            const height = (rect.height / visibleBounds.height) * mapHeight;
            return (
              <Pressable
                key={`touch-${nonStartOpenSectors[idx]}`}
                style={[styles.sectorTouch, { left: x, top: y, width, height }]}
                hitSlop={4}
                onPress={() => openSectorModal(nonStartOpenSectors[idx])}
              />
            );
          })}
        </View>
      </View>

      <Modal transparent animationType="slide" visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{selectedSector ? `Сектор ${selectedSector}` : 'Сектор'}</Text>

            <View
              style={styles.modalGridWrap}
              onLayout={(e) =>
                setModalGridSize({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }
            >
              <Svg width="100%" height="100%" viewBox="0 0 40 40">
                <Rect x={0} y={0} width={40} height={40} fill="#F5F5F5" stroke="#111" strokeWidth={1.2} />
                {[10, 20, 30].map((x) => (
                  <Line key={`mg-v-${x}`} x1={x} y1={0} x2={x} y2={40} stroke="#666" strokeWidth={0.6} />
                ))}
                {[10, 20, 30].map((y) => (
                  <Line key={`mg-h-${y}`} x1={0} y1={y} x2={40} y2={y} stroke="#666" strokeWidth={0.6} />
                ))}
                {selectedObstacle && selectedSector && (() => {
                  const sectorRect = parseSectorRange(selectedSector);
                  if (!sectorRect) return null;
                  const localX = selectedObstacle.rect.x - sectorRect.x;
                  const localY = selectedObstacle.rect.y - sectorRect.y;
                  return (
                    <Rect
                      x={localX}
                      y={localY}
                      width={selectedObstacle.rect.width}
                      height={selectedObstacle.rect.height}
                      fill="#4A4A4A"
                    />
                  );
                })()}
              </Svg>
              <Pressable style={StyleSheet.absoluteFill} onPress={placeObstacleInSelectedSector} />
            </View>

            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, obstacleMode === 'horizontal' && styles.toggleActive]}
                onPress={() => setObstacleMode((prev) => (prev === 'horizontal' ? null : 'horizontal'))}
              >
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, obstacleMode === 'vertical' && styles.toggleActive]}
                onPress={() => setObstacleMode((prev) => (prev === 'vertical' ? null : 'vertical'))}
              >
                <Ionicons name="arrow-down" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.button, !selectedObstacle && styles.disabledButton]}
                disabled={!selectedObstacle}
                onPress={() => setObstacleRects((prev) => prev.filter((o) => o.sector !== selectedSector))}
              >
                <Text style={styles.buttonText}>Очистити</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button} onPress={() => setModalVisible(false)}>
                <Text style={styles.buttonText}>Закрити</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>Оберіть напрямок і натисніть на клітинки сектора.</Text>
          </View>
        </View>
      </Modal>
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
  mapWrap: {
    position: 'relative',
  },
  sectorTouch: {
    position: 'absolute',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalGridWrap: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  toggleButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#2F2F2F',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  toggleActive: {
    backgroundColor: '#2196F3',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#2F2F2F',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.45,
  },
  modalHint: {
    color: '#BDBDBD',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default ObstaclesMap;
