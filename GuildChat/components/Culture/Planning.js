import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

// Тимчасові дані: відкриті сектори та побудовані будівлі
const openSectors = ['A1', 'A2', 'B1', 'C2', 'D3'];
const buildings = [
  { sector: 'A1', name: 'Хатина' },
  { sector: 'C2', name: 'Ферма' }
];

const SECTOR_SIZE = 50;
const COLS = 5;
const ROWS = 5;

export default function Planning() {
  const renderSector = (row, col) => {
    const id = `${String.fromCharCode(65 + row)}${col + 1}`;
    if (!openSectors.includes(id)) return null;
    const building = buildings.find(b => b.sector === id);

    return (
      <React.Fragment key={id}>
        <Rect
          x={col * SECTOR_SIZE}
          y={row * SECTOR_SIZE}
          width={SECTOR_SIZE}
          height={SECTOR_SIZE}
          fill="#aee"
          stroke="#000"
        />
        {building && (
          <SvgText
            x={col * SECTOR_SIZE + SECTOR_SIZE / 2}
            y={row * SECTOR_SIZE + SECTOR_SIZE / 2}
            fontSize="10"
            fill="#000"
            alignmentBaseline="middle"
            textAnchor="middle"
          >
            {building.name}
          </SvgText>
        )}
      </React.Fragment>
    );
  };

  const sectors = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      sectors.push(renderSector(r, c));
    }
  }

  return (
    <View style={styles.container}>
      <Svg width={COLS * SECTOR_SIZE} height={ROWS * SECTOR_SIZE}>
        {sectors}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
