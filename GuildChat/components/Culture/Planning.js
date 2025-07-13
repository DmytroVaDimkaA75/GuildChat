import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polygon, Image as SvgImage } from 'react-native-svg';

const hexPoints = (cx, cy, size) => {
  const angles = [0, 60, 120, 180, 240, 300];
  return angles
    .map(a => {
      const rad = (Math.PI / 180) * a;
      const x = cx + size * Math.cos(rad);
      const y = cy + size * Math.sin(rad);
      return `${x},${y}`;
    })
    .join(' ');
};

// Приклад відкритих секторів
const openSectors = [
  { id: 'A1', cx: 50, cy: 60 },
  { id: 'A2', cx: 100, cy: 60 },
  { id: 'B1', cx: 75, cy: 90 },
];

// Тимчасові іконки будівель
const buildings = [
  { sector: 'A1', x: 40, y: 50, icon: require('./Vikings.png') },
  { sector: 'B1', x: 65, y: 80, icon: require('./Japan.png') },
];

const Planning = () => (
  <View style={styles.container}>
    <Svg width="100%" height="100%" viewBox="0 0 150 130">
      {openSectors.map(sec => (
        <Polygon
          key={sec.id}
          points={hexPoints(sec.cx, sec.cy, 20)}
          fill="#e0e0e0"
          stroke="#000"
        />
      ))}
      {buildings.map(b => (
        <SvgImage
          key={b.sector}
          href={b.icon}
          x={b.x}
          y={b.y}
          width={20}
          height={20}
        />
      ))}
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Planning;
