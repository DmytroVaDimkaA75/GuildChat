import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

// Розмір однієї клітинки карти
const TILE_SIZE = 50;
const ROWS = 6;
const COLS = 6;

// Відкриті сектори (можна налаштувати за потреби)
const openSectors = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 3, col: 1 },
  { row: 3, col: 2 },
  { row: 4, col: 2 }
];

// Побудовані будівлі та їх розташування
const builtBuildings = [
  { row: 0, col: 0, img: require('./Vikings.png') },
  { row: 1, col: 1, img: require('./Japan.png') },
  { row: 2, col: 2, img: require('./Egypt.png') }
];

const Planning = () => {
  return (
    <View style={styles.container}>
      <View style={{ width: COLS * TILE_SIZE, height: ROWS * TILE_SIZE }}>
        <Svg width={COLS * TILE_SIZE} height={ROWS * TILE_SIZE}>
          {openSectors.map((s, idx) => (
            <Rect
              key={idx}
              x={s.col * TILE_SIZE}
              y={s.row * TILE_SIZE}
              width={TILE_SIZE}
              height={TILE_SIZE}
              fill="#e0e0e0"
              stroke="#000"
            />
          ))}
        </Svg>
        {builtBuildings.map((b, idx) => (
          <Image
            key={idx}
            source={b.img}
            style={[
              styles.building,
              {
                left: b.col * TILE_SIZE,
                top: b.row * TILE_SIZE,
                width: TILE_SIZE,
                height: TILE_SIZE
              }
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  building: { position: 'absolute', resizeMode: 'contain' }
});

export default Planning;
