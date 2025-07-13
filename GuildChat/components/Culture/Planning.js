import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { SvgXml, Svg, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../../firebaseConfig';
import { ref, get } from 'firebase/database';
import openMapXml from './Map/OpenMap';

const Planning = () => {
  const { width: screenWidth } = Dimensions.get('window');
  const ratio = 1.2;
  const scale = 1 / 0.75;
  const containerWidth = screenWidth;
  const containerHeight = containerWidth / ratio;
  const mapWidth = containerWidth * scale;
  const mapHeight = mapWidth / ratio;
  const factor = mapWidth / 239.99976;

  const cellSize = 9.638672;

  const cellPositions = useMemo(() => {
    const positions = {};
    const groupRegex = /<g[^>]*id="([^"]+)"[^>]*transform="translate\(([^,]+),([^)]+)\)"[^>]*>/g;
    let match;
    while ((match = groupRegex.exec(openMapXml)) !== null) {
      const gX = parseFloat(match[2]);
      const gY = parseFloat(match[3]);
      const start = match.index + match[0].length;
      const end = openMapXml.indexOf('</g>', start);
      const block = openMapXml.slice(start, end);
      const pathRegex = /<path[^>]*id="([A-Z]\d+)"[^>]*d="m ([0-9.]+),([0-9.]+)/g;
      let p;
      while ((p = pathRegex.exec(block)) !== null) {
        const id = p[1];
        const x = parseFloat(p[2]);
        const y = parseFloat(p[3]);
        positions[id] = { x: gX + x, y: gY + y };
      }
      groupRegex.lastIndex = end + 4;
    }
    return positions;
  }, []);

  function parseRange(range) {
    const clean = range.trim().toUpperCase();
    if (/^[A-Z]\d+$/.test(clean)) {
      const pos = cellPositions[clean];
      if (!pos) return null;
      const topLeft = { x: pos.x, y: pos.y - cellSize };
      const bottomRight = { x: pos.x + cellSize, y: pos.y };
      return {
        x: topLeft.x * factor,
        y: topLeft.y * factor,
        width: (bottomRight.x - topLeft.x) * factor,
        height: (bottomRight.y - topLeft.y) * factor
      };
    }
    const match = clean.match(/^([A-Z]\d+):([A-Z]\d+)$/);
    if (!match) return null;
    const startPos = cellPositions[match[1]];
    const endPos = cellPositions[match[2]];
    if (!startPos || !endPos) return null;
    const startTop = { x: startPos.x, y: startPos.y - cellSize };
    const endBottom = { x: endPos.x + cellSize, y: endPos.y };
    return {
      x: startTop.x * factor,
      y: startTop.y * factor,
      width: (endBottom.x - startTop.x) * factor,
      height: (endBottom.y - startTop.y) * factor
    };
  }

  const [rects, setRects] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/constructedBuildings`;
        const snap = await get(ref(database, path));
        if (snap.exists()) {
          const data = snap.val();
          const res = [];
          Object.values(data).forEach(b => {
            const ranges = b.cellRange ? b.cellRange.split(',') : [];
            ranges
              .map(r => parseRange(r))
              .filter(Boolean)
              .forEach(r => res.push(r));
          });
          setRects(res);
        } else {
          setRects([]);
        }
      } catch (e) {
        console.error(e);
        setRects([]);
      }
    })();
  }, []);

  if (!rects) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }]}>
      <SvgXml xml={openMapXml} width={mapWidth} height={mapHeight} />
      {rects.length > 0 && (
        <Svg width={mapWidth} height={mapHeight} style={StyleSheet.absoluteFill}>
          {rects.map((r, idx) => (
            <Rect key={idx} x={r.x} y={r.y} width={r.width} height={r.height} fill="#8b0000" />
          ))}
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignSelf: 'center', backgroundColor: '#fff' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default Planning;
