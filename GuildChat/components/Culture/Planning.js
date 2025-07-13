import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

// Відкриті сектори на мапі (A1, B2, ...)
const openSectors = [
  'A1', 'A2', 'A3',
  'B2', 'B3',
  'C3', 'C4',
  'D4',
  'E5'
];

// Побудовані будівлі та їх розташування
const buildings = [
  { sector: 'A1', name: 'Хатина' },
  { sector: 'C3', name: 'Казарма' },
  { sector: 'D4', name: 'Ферма' }
];

const GRID_SIZE = 5;      // кількість рядів і колонок
const CELL_SIZE = 48;     // розмір сектора у пікселях

const Planning = () => {
  const cells = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const id = `${String.fromCharCode(65 + row)}${col + 1}`;
      if (!openSectors.includes(id)) continue;

      const building = buildings.find(b => b.sector === id);

      cells.push(
        <React.Fragment key={id}>
          <Rect
            x={col * CELL_SIZE}
            y={row * CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="#b7e3ff"
            stroke="#000"
          />
          {building && (
            <SvgText
              x={col * CELL_SIZE + CELL_SIZE / 2}
              y={row * CELL_SIZE + CELL_SIZE / 2}
              fontSize="10"
              fill="#000"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {building.name}
            </SvgText>
          )}
        </React.Fragment>
      );
    }
  }

  return (
    <View style={styles.container}>
      <Svg width={GRID_SIZE * CELL_SIZE} height={GRID_SIZE * CELL_SIZE}>
        {cells}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

export default Planning;
