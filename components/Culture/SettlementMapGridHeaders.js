import { G, Rect, Text as SvgText } from 'react-native-svg';

const HEADER_FILL = '#202830';
const HEADER_BORDER = '#66717D';
const HEADER_TEXT = '#FFFFFF';

const indexToLetters = (index) => {
  let value = Number(index);
  if (!Number.isFinite(value) || value <= 0) return '';

  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
};

export const getBoundsWithGridHeaders = (bounds, headerSize) => ({
  x: bounds.x - headerSize,
  y: bounds.y - headerSize,
  width: bounds.width + headerSize,
  height: bounds.height + headerSize,
});

const SettlementMapGridHeaders = ({ bounds, tileSize }) => {
  const firstColumn = Math.floor(bounds.x / tileSize) + 1;
  const lastColumn = Math.ceil((bounds.x + bounds.width) / tileSize);
  const firstRow = Math.floor(bounds.y / tileSize) + 1;
  const lastRow = Math.ceil((bounds.y + bounds.height) / tileSize);
  const columns = Array.from(
    { length: lastColumn - firstColumn + 1 },
    (_, index) => firstColumn + index,
  );
  const rows = Array.from(
    { length: lastRow - firstRow + 1 },
    (_, index) => firstRow + index,
  );
  const fontSize = tileSize * 0.56;

  return (
    <G pointerEvents="none">
      <Rect
        x={bounds.x - tileSize}
        y={bounds.y - tileSize}
        width={tileSize}
        height={tileSize}
        fill={HEADER_FILL}
        stroke={HEADER_BORDER}
        strokeWidth={0.5}
      />

      {columns.map((column) => {
        const x = (column - 1) * tileSize;
        return (
          <G key={`grid-column-${column}`}>
            <Rect
              x={x}
              y={bounds.y - tileSize}
              width={tileSize}
              height={tileSize}
              fill={HEADER_FILL}
              stroke={HEADER_BORDER}
              strokeWidth={0.5}
            />
            <SvgText
              x={x + tileSize / 2}
              y={bounds.y - tileSize / 2}
              fill={HEADER_TEXT}
              fontSize={fontSize}
              fontWeight="700"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {indexToLetters(column)}
            </SvgText>
          </G>
        );
      })}

      {rows.map((row) => {
        const y = (row - 1) * tileSize;
        return (
          <G key={`grid-row-${row}`}>
            <Rect
              x={bounds.x - tileSize}
              y={y}
              width={tileSize}
              height={tileSize}
              fill={HEADER_FILL}
              stroke={HEADER_BORDER}
              strokeWidth={0.5}
            />
            <SvgText
              x={bounds.x - tileSize / 2}
              y={y + tileSize / 2}
              fill={HEADER_TEXT}
              fontSize={fontSize}
              fontWeight="700"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {row}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
};

export default SettlementMapGridHeaders;
