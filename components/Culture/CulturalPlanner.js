// CulturalPlanner full code with obstacle selection feature
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation, useRoute } from '@react-navigation/native';
// import {
//    get,
//    push,
//    ref,
//    remove,
//    set,
//    update
// } from 'firebase/database';
import React, {
   useEffect,
   useLayoutEffect,
   useMemo,
   useRef,
   useState
} from 'react';
import {
   ActivityIndicator,
   Alert,
   Animated,
   Dimensions,
   Modal,
   PanResponder,
   Pressable,
   StyleSheet,
   Text,
   TouchableOpacity,
   View
} from 'react-native';
import { Rect, Svg, SvgXml } from 'react-native-svg';

const apiData = {
  actions: [
    {
      action: 'move',
      building: 'Ратуша',
      from: 'M5:P7',
      to: 'K7:N9',
      description: 'Змістити Ратушу в центр поселення.',
      reason:
        'Центральне розміщення мінімізує витрати на дороги для підключення інших будівель.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'I5:J6',
      count: 1,
      description: 'Побудувати халупу.',
      reason: 'Для виконання завдання 1 і створення базового населення.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'L5:M6',
      count: 1,
      description: 'Побудувати халупу.',
      reason: 'Для виконання завдання 1 і створення базового населення.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'O5:P6',
      count: 1,
      description: 'Побудувати халупу.',
      reason: 'Для виконання завдання 1 і створення базового населення.'
    },
    {
      action: 'build',
      building: 'Дорога',
      location: 'J7',
      count: 1,
      description: 'Прокласти дорогу для підключення халуп.',
      reason: 'Будівлі не функціонують без підключення до Ратуші.'
    },
    {
      action: 'build',
      building: 'Дорога',
      location: 'N6',
      count: 1,
      description: 'Прокласти дорогу для підключення халуп.',
      reason: 'Будівлі не функціонують без підключення до Ратуші.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'I7',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Для виконання завдання 2.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'K5',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Для виконання завдання 2.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'K6',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Для виконання завдання 2.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'N5',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Для виконання завдання 2.'
    },
    {
      action: 'build',
      building: 'Кузня сокир',
      location: 'I10:K12',
      description: 'Побудувати Кузню сокир.',
      reason: 'Для виконання завдання 3.'
    },
    {
      action: 'build',
      building: 'Дорога',
      location: 'L10',
      count: 1,
      description: 'Прокласти дорогу до Кузні сокир.',
      reason: 'Кузня потребує підключення до Ратуші.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'O7',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'P7',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'O8',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'P8',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'O9',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'build',
      building: 'Рунний камінь',
      location: 'P9',
      count: 1,
      description: 'Побудувати рунний камінь.',
      reason: 'Отримати 60 дипломатії для виконання завдання 4.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'O7',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'P7',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'O8',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'P8',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'O9',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'destroy',
      building: 'Рунний камінь',
      location: 'P9',
      count: 1,
      description: 'Знести рунний камінь.',
      reason: 'Дипломатія зарахована, а будівлі більше не потрібні.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'I8:J9',
      count: 1,
      description: 'Побудувати халупу.',
      reason:
        'Збільшення населення для будівництва ще однієї Кузні сокир.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'O7:P8',
      count: 1,
      description: 'Побудувати халупу.',
      reason:
        'Збільшення населення для будівництва ще однієї Кузні сокир.'
    },
    {
      action: 'build',
      building: 'Халупа',
      location: 'L11:M12',
      count: 1,
      description: 'Побудувати халупу.',
      reason:
        'Збільшення населення для будівництва ще однієї Кузні сокир.'
    },
    {
      action: 'build',
      building: 'Дорога',
      location: 'O9',
      count: 1,
      description: 'Прокласти дорогу до халупи L11:M12.',
      reason: 'Підключення нової житлової будівлі до Ратуші.'
    },
    {
      action: 'build',
      building: 'Кузня сокир',
      location: 'N10:P12',
      description: 'Побудувати другу Кузню сокир.',
      reason: 'Збільшення темпу виробництва сокир.',
      completion_time: 1751186100
    }
  ]
};

const initialQuestline = {
  0: 'Побудувати 3 халупи.',
  1: 'Побудувати 4 рунних каменя.',
  2: 'Побудувати кузню сокир.',
  3: 'Мати 55 очок дипломатії або зібрати 20 сокир.',
  4: 'Побудувати 2 святині.',
  5: 'Побудувати медоварню',
  6: 'Отримати 195 очок дипломатії або зібрати 30 бутлів меду.',
  7: 'Отримати 2 хатини.',
  8: 'Отримати 280 очок дипломатії або зібрати 40 сокир.',
  9: 'Отримати мисливця на звірів.',
  10: 'Отримати 375 очок дипломатії або зібрати 50 рогів',
  11: 'Отримати 4 тотеми клану або зібрати 50 бутлів меду.',
  12: 'Побудувати 4 тотеми клану або зібрати 50  меду.',
  13: 'Мати 595 очок дипломатії або зібрати 60 рогів.',
  14: 'Отримати вовняну ферму.',
  15: 'Отримати 855 очок дипломатії або зібрати 60 тюків вовни.',
  16: 'Мати 720 очок дипломатії або зібрати 60 вовни.',
  17: 'Побудувати стару вербу',
  18: 'Побудувати медову залу.',
  19: 'Зібрати 2500 монет і по 10 кожного товару'
};

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const buildingTypes = {
  'Халупа': 'residential',
  'Рунний камінь': 'diplomatic',
  'Кузня сокир': 'production',
  'Дорога': 'road'
};

const buildingColors = {
  residential: '#a200ec',
  diplomatic: '#0080ec',
  production: '#2bff2e',
  road: '#a8a8a8'
};


const vikingMapXml = `<svg
   
</svg>
`;
const CulturalPlanner = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const start = route.params?.start;

  const { width: screenWidth } = Dimensions.get('window');
  const ratio = 1.2; // Відношення ширини до висоти оригінальної карти
  const scale = 1 / 0.75; // Масштаб, щоб видимою була приблизно 75%
  const containerWidth = screenWidth;
  const containerHeight = containerWidth / ratio;
const mapWidth = containerWidth * scale;
const mapHeight = mapWidth / ratio;
const initialX = -((mapWidth - containerWidth) / 2);
const initialY = -((mapHeight - containerHeight) / 2);

const factor = mapWidth / 239.99976;

  const containerRef = useRef(null);
  const containerOffset = useRef({ x: 0, y: 0 });
  const handleContainerLayout = () => {
    containerRef.current?.measure((x, y, width, height, pageX, pageY) => {
      containerOffset.current = { x: pageX, y: pageY };
    });
  };

  const cellSize = 9.638672;

const cellPositions = useMemo(() => {
    const positions = {};
    const groupRegex = /<g[^>]*id="([^"]+)"[^>]*transform="translate\(([^,]+),([^)]+)\)"[^>]*>/g;
    let match;
    while ((match = groupRegex.exec(vikingMapXml)) !== null) {
      const groupId = match[1];
      const gX = parseFloat(match[2]);
      const gY = parseFloat(match[3]);
      const start = match.index + match[0].length;
      const end = vikingMapXml.indexOf('</g>', start);
      const block = vikingMapXml.slice(start, end);
      const pathRegex = /<path[^>]*id="([A-Z]\d+)"[^>]*d="m ([0-9.]+),([0-9.]+)/g;
      let p;
      while ((p = pathRegex.exec(block)) !== null) {
        const id = p[1];
        const x = parseFloat(p[2]);
        const y = parseFloat(p[3]);
        positions[id] = { x: gX + x, y: gY + y, group: groupId };
      }
      groupRegex.lastIndex = end + 4;
    }
    return positions;
}, []);

const cellGroupMap = useMemo(() => {
  const map = {};
  Object.entries(cellPositions).forEach(([id, data]) => {
    map[id] = data.group;
  });
  return map;
}, [cellPositions]);

const GROUP_BOUNDS_RAW = {
  'E1:H4': { x: 40.18060125, y: 0.18060078000000068, width: 39.63867174999999, height: 39.6386719 },
  'I1:L4': { x: 80.18060125, y: 0.18060078000000068, width: 39.63867175, height: 39.6386719 },
  'M1:P4': { x: 120.18059625, y: 0.18060078000000068, width: 39.63867174999997, height: 39.6386719 },
  'Q1:T4': { x: 160.18059625, y: 0.18060078000000068, width: 39.638671750000015, height: 39.6386719 },
  'A5:D8': { x: 0.18060093, y: 40.180601100000004, width: 39.63867175, height: 39.638671900000006 },
  'E5:H8': { x: 40.18060125, y: 40.180601100000004, width: 39.63867174999999, height: 39.638671900000006 },
  'I5:L8': { x: 80.18060125, y: 40.180601100000004, width: 39.63867175, height: 39.638671900000006 },
  'M5:P8': { x: 120.18059625, y: 40.180601100000004, width: 39.63867174999997, height: 39.638671900000006 },
  'Q5:T8': { x: 160.18059625, y: 40.180601100000004, width: 39.638671750000015, height: 39.638671900000006 },
  'A9:D12': { x: 0.18060093, y: 80.18060109999999, width: 39.63867175, height: 39.638671900000006 },
  'E9:H12': { x: 40.18060125, y: 80.18060109999999, width: 39.63867174999999, height: 39.638671900000006 },
  'I9:L12': { x: 80.18060125, y: 80.18060109999999, width: 39.63867175, height: 39.638671900000006 },
  'M9:P12': { x: 120.18059625, y: 80.18060109999999, width: 39.63867174999997, height: 39.638671900000006 },
  'Q9:T12': { x: 160.18059625, y: 80.18060109999999, width: 39.638671750000015, height: 39.638671900000006 },
  'U9:X12': { x: 200.18059625, y: 80.18060109999999, width: 39.638671750000015, height: 39.638671900000006 },
  'A13:D16': { x: 0.18060093, y: 120.18059609999999, width: 39.63867175, height: 39.638671900000006 },
  'E13:H16': { x: 40.18060125, y: 120.18059609999999, width: 39.63867174999999, height: 39.638671900000006 },
  'I13:L16': { x: 80.18060125, y: 120.18059609999999, width: 39.63867175, height: 39.638671900000006 },
  'M13:P16': { x: 120.18059625, y: 120.18059609999999, width: 39.63867174999997, height: 39.638671900000006 },
  'Q13:T16': { x: 160.18059625, y: 120.18059609999999, width: 39.638671750000015, height: 39.638671900000006 },
  'U13:X16': { x: 200.18059625, y: 120.18059609999999, width: 39.638671750000015, height: 39.638671900000006 },
  'E17:H20': { x: 40.18060125, y: 160.1805961, width: 39.63867174999999, height: 39.63867190000002 },
  'I17:L20': { x: 80.18060125, y: 160.1805961, width: 39.63867175, height: 39.63867190000002 },
  'M17:P20': { x: 120.18059625, y: 160.1805961, width: 39.63867174999997, height: 39.63867190000002 },
  'Q17:T20': { x: 160.18059625, y: 160.1805961, width: 39.638671750000015, height: 39.63867190000002 }
};

const groupBounds = useMemo(() => {
  const bounds = {};
  Object.entries(GROUP_BOUNDS_RAW).forEach(([range, rect]) => {
    bounds[range] = {
      left: rect.x * factor,
      top: rect.y * factor,
      right: (rect.x + rect.width) * factor,
      bottom: (rect.y + rect.height) * factor
    };
  });
  return bounds;
}, [factor]);

// const getGroupByCoords = (x, y) => {
//   for (const [group, b] of Object.entries(groupBounds)) {
//     if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
//       return group;
//     }
//   }
//   return null;
// };

const COLUMN_META = [
  { label: 'A:D', start: 0.18060093 },
  { label: 'E:H', start: 40.18060125 },
  { label: 'I:L', start: 80.18060125 },
  { label: 'M:P', start: 120.18059625 },
  { label: 'Q:T', start: 160.18059625 },
  { label: 'U:X', start: 200.18059625 }
];

const ROW_META = [
  { label: '1:4', start: 0.18060078000000068 },
  { label: '5:8', start: 40.180601100000004 },
  { label: '9:12', start: 80.18060109999999 },
  { label: '13:16', start: 120.18059609999999 },
  { label: '17:20', start: 160.1805961 }
];

// const SECTOR_WIDTH = 39.6386717;
// const SECTOR_HEIGHT = 39.6386719;

const IGNORED_SECTORS = new Set([
  'A1:D4',
  'U1:X4',
  'U5:X8',
  'A17:D20',
  'U17:X20',
  'I5:L8',
  'M5:P8',
  'I9:L12',
  'M9:P12'
]);

const sectors = {
  open_sectors: ['I5:L8', 'M5:P8', 'I9:L12', 'M9:P12'],
  potential_sectors: ['E1:H4', 'I1:L4', 'M1:P4', 'Q1:T4', 'A5:D8', 'E5:H8', 'Q5:T8', 'A9:D12', 'E9:H12', 'Q9:T12', 'U9:X12', 'A13:D16', 'E13:H16', 'I13:L16', 'M13:P16', 'Q13:T16', 'U13:X16', 'E17:H20', 'I17:L20', 'M17:P20', 'Q17:T20'],
};

const getColumnRowFromCoords = (x, y) => {
  const originalX = x / factor;
  const originalY = y / factor;

  const column = Math.floor(originalX / 40);
  const row = Math.floor(originalY / 40);

  return { column, row };
};

const getExcelRange = (columnIndex, rowIndex) => {
  const columnLabel = COLUMN_META[columnIndex]?.label;
  const rowLabel = ROW_META[rowIndex]?.label;
  if (!columnLabel || !rowLabel) return null;
  const [colStart, colEnd] = columnLabel.split(':');
  const [rowStart, rowEnd] = rowLabel.split(':');
  return `${colStart}${rowStart}:${colEnd}${rowEnd}`;
};

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

const getGroupSvgXml = groupId => {
  if (!groupId) return null;
  const regex = new RegExp(`<g[^>]*id="${groupId}"[^>]*>[\\s\\S]*?<\\/g>`);
  const match = vikingMapXml.match(regex);
  if (!match) return null;
  let group = match[0];
  const transRegex = /transform="translate\(([^,]+),([^)]+)\)"/;
  group = group.replace(transRegex, '');

  const rect = group.match(/<rect[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*>/);
  if (rect) {
    const width = parseFloat(rect[1]) + parseFloat(rect[3]);
    const height = parseFloat(rect[2]) + parseFloat(rect[4]);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${group}</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg">${group}</svg>`;
};

const convertRectToSector = (rect, sectorId, size) => {
  if (!rect || !sectorId || !size?.width || !size?.height) return null;
  const bounds = groupBounds[sectorId];
  if (!bounds) return null;
  const sectorW = bounds.right - bounds.left;
  const sectorH = bounds.bottom - bounds.top;
  return {
    x: ((rect.x - bounds.left) / sectorW) * size.width,
    y: ((rect.y - bounds.top) / sectorH) * size.height,
    width: (rect.width / sectorW) * size.width,
    height: (rect.height / sectorH) * size.height
  };
};

const [actions, setActions] = useState([]);
const [currentActionIndex, setCurrentActionIndex] = useState(0);
const currentActionIndexRef = useRef(0);

const { minX, minY, cellIndex } = useMemo(() => {
  let minX = Infinity;
  let minY = Infinity;
  Object.values(cellPositions).forEach((pos) => {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
  });
  // Побудова індексу для швидкого пошуку клітин за координатами
  const index = {};
  Object.entries(cellPositions).forEach(([id, pos]) => {
    const col = Math.floor((pos.x - minX) / cellSize);
    const row = Math.floor((pos.y - minY) / cellSize);
    index[`${col},${row}`] = id;
  });
  return { minX, minY, cellIndex: index };
}, [cellPositions]);

// const getCellByCoords = (x, y) => {
//   const col = Math.floor((x - minX * factor) / (cellSize * factor));
//   const row = Math.floor((y - minY * factor) / (cellSize * factor));
//   return cellIndex[`${col},${row}`] ?? null;
// };

const [obstacleMode, setObstacleMode] = useState(null);
const obstacleModeRef = useRef(null);
const [obstacleModalVisible, setObstacleModalVisible] = useState(false);
const [selectedSector, setSelectedSector] = useState(null);
const [modalSvgSize, setModalSvgSize] = useState({ width: 0, height: 0 });

const handleModalPress = e => {
  if (!selectedSector) return;
  const { locationX, locationY } = e.nativeEvent;
  if (!modalSvgSize.width || !modalSvgSize.height) return;
  const match = selectedSector.match(/^([A-Z])(\d+):/);
  if (!match) return;
  const startCol = match[1].charCodeAt(0);
  const startRow = parseInt(match[2], 10);
  const colOffset = Math.min(
    3,
    Math.floor((locationX / modalSvgSize.width) * 4)
  );
  const rowOffset = Math.min(
    3,
    Math.floor((locationY / modalSvgSize.height) * 4)
  );
  const mode = obstacleModeRef.current;
  if (!mode) return;
  if (
    (rowOffset === 3 && colOffset === 3) ||
    (rowOffset === 3 && colOffset < 3 && mode === 'vertical') ||
    (colOffset === 3 && rowOffset < 3 && mode === 'horizontal')
  )
    return;
  const cellId = `${String.fromCharCode(startCol + colOffset)}${startRow + rowOffset}`;
  let targetCellId = null;
  if (mode === 'vertical') {
    const nextRow = startRow + rowOffset + 1;
    if (nextRow > startRow + 3) return;
    targetCellId = `${String.fromCharCode(startCol + colOffset)}${nextRow}`;
  } else if (mode === 'horizontal') {
    const nextCol = startCol + colOffset + 1;
    if (nextCol > startCol + 3) return;
    targetCellId = `${String.fromCharCode(nextCol)}${startRow + rowOffset}`;
  }
  if (!targetCellId) return;
  const range = `${cellId}:${targetCellId}`;
  const rect = parseRange(range);
  if (rect) {
    setObstacleRects(prev => {
      const filtered = prev.filter(o => o.sector !== selectedSector);
      return [...filtered, { sector: selectedSector, rect, range }];
    });
  }
};
useEffect(() => {
  obstacleModeRef.current = obstacleMode;
}, [obstacleMode]);
useEffect(() => {
  currentActionIndexRef.current = currentActionIndex;
}, [currentActionIndex]);


  useEffect(() => {
    if (!start) return;
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const basePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`;
        // ИЗМЕНЕНО
        await database().ref(basePath).set({
          settlementName,
          questline: initialQuestline,
          actions: apiData.actions,
          sectors,
          availableBuildings: [
            // ... (данные зданий)
          ]
        });
        // ИЗМЕНЕНО
        await database().ref(`${basePath}/constructedBuildings`).push({
          name: 'Ратуша',
          type: 'Town Hall',
          cellRange: 'M5:P7'
        });
      } catch (e) {
        console.error(e);
      }
    })();
  }, [start, settlementName]);

  useEffect(() => {
    if (!settlementName) return;
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/obstacles`;
        // ИЗМЕНЕНО
        const snap = await database().ref(path).once('value');
        if (snap.exists()) {
          const data = snap.val();
          const arr = Object.entries(data).map(([sector, range]) => {
            const rect = parseRange(range);
            return rect ? { sector, rect, range } : null;
          }).filter(Boolean);
          setObstacleRects(arr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [settlementName]);

  useEffect(() => {
    if (!settlementName) return;
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/actions`;
        // ИЗМЕНЕНО
        const snap = await database().ref(path).once('value');
        if (snap.exists()) {
          const data = snap.val();
          const arr = Array.isArray(data) ? data.filter(Boolean) : Object.values(data);
          setActions(arr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [settlementName]);

  const [moveRect, setMoveRect] = useState(null);
  const [staticRect, setStaticRect] = useState(null);
  const [buildRects, setBuildRects] = useState([]);
  const [finalizedRects, setFinalizedRects] = useState([]);
  const [obstacleRects, setObstacleRects] = useState([]);
  const buildOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!settlementName) return;
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/constructedBuildings`;
        // ИЗМЕНЕНО
        const snap = await database().ref(path).once('value');
        if (snap.exists()) {
          const data = snap.val();
          const rects = [];
          Object.values(data).forEach(b => {
            const ranges = b.cellRange ? b.cellRange.split(',') : [];
            const type = b.type || buildingTypes[b.name] || 'residential';
            const color = buildingColors[type] || '#4b0082';
            ranges
              .map(r => parseRange(r))
              .filter(Boolean)
              .forEach(r => rects.push({ ...r, color }));
          });
          setFinalizedRects(rects);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [settlementName]);

  useEffect(() => {
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/obstacles`;
        const data = {};
        obstacleRects.forEach(o => {
          if (o.range) data[o.sector] = o.range;
        });
        // ИЗМЕНЕНО
        await database().ref(path).set(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [obstacleRects]);

  const animatedPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const animationRef = useRef(null);

  const pan = React.useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const offset = React.useRef({ x: initialX, y: initialY });
  const clamp = (val, min, max) => Math.max(min, Math.min(val, max));

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const newX = clamp(offset.current.x + gesture.dx, containerWidth - mapWidth, 0);
        const newY = clamp(offset.current.y + gesture.dy, containerHeight - mapHeight, 0);
        pan.setValue({ x: newX, y: newY });
      },
      onPanResponderRelease: (evt, gesture) => {
        const newX = clamp(offset.current.x + gesture.dx, containerWidth - mapWidth, 0);
        const newY = clamp(offset.current.y + gesture.dy, containerHeight - mapHeight, 0);
        offset.current = { x: newX, y: newY };
        pan.setValue(offset.current);

        if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) {
          const { pageX, pageY } = evt.nativeEvent;
          const adjustedX =
            pageX - containerOffset.current.x - offset.current.x;
          const adjustedY =
            pageY - containerOffset.current.y - offset.current.y;
          const { column, row } = getColumnRowFromCoords(adjustedX, adjustedY);
          const excelRange = getExcelRange(column, row);
          if (excelRange && !IGNORED_SECTORS.has(excelRange)) {
            console.log(`тап відбувся в секторі '${excelRange}'`);
            setSelectedSector(excelRange);
            if (currentActionIndexRef.current >= actions.length) {
              setObstacleModalVisible(true);
            }
          } else {
            console.log('тап у стовпчику', column, 'рядку', row);
          }
        }
      }
    })
  ).current;

  // Поки не завантажився settlementName, показуємо лоадер
  if (!settlementName) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }



  // Видалити запис у Firebase і повернутися до вибору поселення
  const clearAndBack = async () => {
    const userId = await AsyncStorage.getItem('userId');
    const guildId = await AsyncStorage.getItem('guildId');
    // ИЗМЕНЕНО
    await database()
      .ref(`guilds/${guildId}/guildUsers/${userId}/culturalSettlements`)
      .remove();
    navigation.replace('CulturalSettlements');
  };

  // Обробник закриття екрана
  const onClose = () => {
    if (start) {
      clearAndBack();
    } else {
      Alert.alert(
        'Підтвердження',
        'Ви дійсно хочете закінчити планування культурного поселення і видалити весь прогрес?',
        [
          { text: 'Ні' },
          { text: 'Так', onPress: clearAndBack }
        ]
      );
    }
  };

  // Налаштовуємо заголовок і кнопки у шапці
   React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: `План поселення: ${settlementName}`,
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.getParent()?.goBack()}
          style={{ marginLeft: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={onClose} style={{ marginRight: 10 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      )
    });
  }, [navigation, settlementName, start]);


  const handleDone = async () => {
    const action = actions[currentActionIndex];
    if (action?.action === 'move' && moveRect) {
      if (animationRef.current) animationRef.current.stop();
      const toRect = parseRange(action.to);
      if (toRect) {
        animatedPos.setValue({ x: toRect.x, y: toRect.y });
        setStaticRect({ x: toRect.x, y: toRect.y, width: toRect.width, height: toRect.height });
        setMoveRect(null);
        try {
          const userId = await AsyncStorage.getItem('userId');
          const guildId = await AsyncStorage.getItem('guildId');
          const basePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/constructedBuildings`;
          const snap = await database().ref(basePath).once('value');
          if (snap.exists()) {
            const constructedBuildings = snap.val();
            const updates = {};
            const collectUpdates = (node, path) => {
              if (node && typeof node === 'object') {
                if (node.cellRange === action.from) {
                  updates[`${path}/cellRange`] = action.to;
                }
                Object.keys(node).forEach(key => {
                  const childPath = path ? `${path}/${key}` : key;
                  collectUpdates(node[key], childPath);
                });
              }
            };
            collectUpdates(constructedBuildings, '');
            if (Object.keys(updates).length > 0) {
              await database().ref(basePath).update(updates);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (action?.action === 'build' && buildRects.length > 0) {
      if (animationRef.current) animationRef.current.stop();
      const type = buildingTypes[action.building] || 'residential';
      const color = buildingColors[type] || '#4b0082';
      const finalized = buildRects.map(r => ({ ...r, color }));
      setFinalizedRects(prev => [...prev, ...finalized]);
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const basePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/constructedBuildings`;
        const cellRange = action.location || (action.locations ? action.locations.join(',') : '');
         await database().ref(basePath).push({
          name: action.building,
          type,
          cellRange
        });

        const questlinePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/questline`;
        if (action.building === 'Халупа' && cellRange === 'O5:P6') {
          await database().ref(`${questlinePath}/0`).remove();
        } else if (action.building === 'Рунний камінь' && cellRange === 'N5') {
          await database().ref(`${questlinePath}/1`).remove();
        } else if (action.building === 'Кузня сокир' && cellRange === 'I10:K12') {
          await database().ref(`${questlinePath}/2`).remove();
        } else if (action.building === 'Рунний камінь' && cellRange === 'P9') {
          await database().ref(`${questlinePath}/3`).remove();
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (action?.action === 'destroy' && buildRects.length > 0) {
      if (animationRef.current) animationRef.current.stop();
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        const basePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/constructedBuildings`;
        const cellRange = action.location || (action.locations ? action.locations.join(',') : '');
        const snap = await database().ref(basePath).once('value');
        if (snap.exists()) {
          const constructedBuildings = snap.val();
          const updates = {};
          Object.keys(constructedBuildings).forEach(key => {
            const rec = constructedBuildings[key];
            if (rec && rec.cellRange === cellRange) {
              updates[key] = null;
            }
          });
          if (Object.keys(updates).length > 0) {
            await database().ref(basePath).update(updates);
          }
        }
      } catch (e) {
        console.error(e);
      }
      setFinalizedRects(prev =>
        prev.filter(r => !buildRects.some(br => br.x === r.x && br.y === r.y && br.width === r.width && br.height === r.height))
      );
    }
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    setBuildRects([]);
    buildOpacity.setValue(0);

    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      const basePath = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements/actions`;
      const remaining = actions.slice(1);
      await database().ref(basePath).set(remaining);
      setActions(remaining);
    } catch (e) {
      console.error(e);
    }
    setCurrentActionIndex(0);
  };

  useLayoutEffect(() => {
    const action = actions[currentActionIndex];
    if (!action) return;
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    setBuildRects([]);
    buildOpacity.setValue(0);

    if (action.action === 'move') {
      const fromRect = parseRange(action.from);
      const toRect = parseRange(action.to);
      if (fromRect && toRect) {
        setMoveRect({ width: fromRect.width, height: fromRect.height });
        animatedPos.setValue({ x: fromRect.x, y: fromRect.y });
        const anim = Animated.loop(
          Animated.sequence([
            Animated.timing(animatedPos, {
              toValue: { x: toRect.x, y: toRect.y },
              duration: 1000,
              useNativeDriver: false
            }),
            Animated.delay(1000),
            Animated.timing(animatedPos, {
              toValue: { x: fromRect.x, y: fromRect.y },
              duration: 0,
              useNativeDriver: false
            }),
            Animated.delay(1000)
          ])
        );
        animationRef.current = anim;
        anim.start();
      }
    } else if (action.action === 'build') {
      const locs = action.locations || (action.location ? [action.location] : []);
      const rects = locs.map(parseRange).filter(Boolean);
      setMoveRect(null);
      setBuildRects(rects);
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(buildOpacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false
          }),
          Animated.delay(1000),
          Animated.timing(buildOpacity, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false
          }),
        Animated.delay(1000)
      ])
      );
      animationRef.current = anim;
      anim.start();
    } else if (action.action === 'destroy') {
      const locs = action.locations || (action.location ? [action.location] : []);
      const rects = locs.map(parseRange).filter(Boolean);
      setMoveRect(null);
      setBuildRects(rects);
      buildOpacity.setValue(1);
      const anim = Animated.loop(
        Animated.sequence([
          Animated.delay(1000),
          Animated.timing(buildOpacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false
          }),
          Animated.delay(1000),
          Animated.timing(buildOpacity, {
            toValue: 1,
            duration: 0,
            useNativeDriver: false
          })
        ])
      );
      animationRef.current = anim;
      anim.start();
    } else {
      setMoveRect(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActionIndex, actions]);

  const hasObstacle = selectedSector
    ? obstacleRects.some(o => o.sector === selectedSector)
    : false;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Тут логіка планувальника для {settlementName}
      </Text>
      <View
        style={[styles.mapContainer, { width: containerWidth, height: containerHeight }]}
        ref={containerRef}
        onLayout={handleContainerLayout}
      >
        <Animated.View
          style={{
            width: mapWidth,
            height: mapHeight,
            transform: [{ translateX: pan.x }, { translateY: pan.y }]
          }}
          {...panResponder.panHandlers}
        >
          <SvgXml xml={vikingMapXml} width={mapWidth} height={mapHeight} />
          {(moveRect || staticRect || buildRects.length > 0 || finalizedRects.length > 0 || obstacleRects.length > 0) && (
            <Svg
              width={mapWidth}
              height={mapHeight}
              style={StyleSheet.absoluteFill}
            >
              {moveRect && (
                <AnimatedRect
                  x={animatedPos.x}
                  y={animatedPos.y}
                  width={moveRect.width}
                  height={moveRect.height}
                  fill="#8b0000"
                />
              )}
              {staticRect && (
                <Rect
                  x={staticRect.x}
                  y={staticRect.y}
                  width={staticRect.width}
                  height={staticRect.height}
                  fill="#8b0000"
                />
              )}
              {finalizedRects.map((r, idx) => {
                const action = actions[currentActionIndex];
                const hide =
                  action?.action === 'destroy' &&
                  buildRects.some(
                    br =>
                      br.x === r.x &&
                      br.y === r.y &&
                      br.width === r.width &&
                      br.height === r.height
                  );
                if (hide) return null;
                return (
                  <Rect
                    key={`f-${idx}`}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    fill={r.color}
                  />
                );
              })}
              {obstacleRects.map((o, idx) => (
                <Rect
                  key={`o-${idx}`}
                  x={o.rect.x}
                  y={o.rect.y}
                  width={o.rect.width}
                  height={o.rect.height}
                  fill="#4a4a4a"
                />
              ))}
              {buildRects.map((r, idx) => {
                const action = actions[currentActionIndex];
                const type = buildingTypes[action?.building] || 'residential';
                const color = buildingColors[type] || '#4b0082';
                return (
                  <AnimatedRect
                    key={idx}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    fill={color}
                    style={{ opacity: buildOpacity }}
                  />
                );
              })}
            </Svg>
          )}
        </Animated.View>
      </View>
      {currentActionIndex < actions.length && (
        <View style={styles.inputRow}>
          <Text style={styles.actionText}>
            {actions[currentActionIndex].description}
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleDone}>
            <Text style={{ color: '#fff' }}>Зроблено</Text>
          </TouchableOpacity>
        </View>
      )}
      {currentActionIndex >= actions.length && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Вартість технологій', '')}
          >
            <Text style={styles.buttonText}>Вартість технологій</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Planning')}
          >
            <Text style={styles.buttonText}>Планування</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onClose}>
            <Text style={styles.buttonText}>Закінчити</Text>
          </TouchableOpacity>
        </View>
      )}
      <Modal
        animationType="slide"
        transparent={true}
        visible={obstacleModalVisible}
        onRequestClose={() => setObstacleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {selectedSector && (
              <>
                <Text style={styles.modalTitle}>{`Сектор ${selectedSector}`}</Text>
                <View
                  style={styles.modalSvgWrapper}
                  onLayout={e =>
                    setModalSvgSize({
                      width: e.nativeEvent.layout.width,
                      height: e.nativeEvent.layout.height
                    })
                  }
                >
                  <SvgXml
                    xml={getGroupSvgXml(selectedSector) || ''}
                    width="100%"
                    height="100%"
                  />
                  {(moveRect || staticRect || buildRects.length > 0 || finalizedRects.length > 0 || obstacleRects.length > 0) && (
                    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                      {moveRect && (() => {
                        const pos = animatedPos.__getValue();
                        const r = convertRectToSector({ x: pos.x, y: pos.y, width: moveRect.width, height: moveRect.height }, selectedSector, modalSvgSize);
                        return r ? <Rect x={r.x} y={r.y} width={r.width} height={r.height} fill="#8b0000" /> : null;
                      })()}
                      {staticRect && (() => {
                        const r = convertRectToSector(staticRect, selectedSector, modalSvgSize);
                        return r ? <Rect x={r.x} y={r.y} width={r.width} height={r.height} fill="#8b0000" /> : null;
                      })()}
                      {finalizedRects.map((r, idx) => {
                        const conv = convertRectToSector(r, selectedSector, modalSvgSize);
                        if (!conv) return null;
                        return <Rect key={`f-m-${idx}`} x={conv.x} y={conv.y} width={conv.width} height={conv.height} fill={r.color} />;
                      })}
                      {obstacleRects
                        .filter(o => o.sector === selectedSector)
                        .map((o, idx) => {
                          const conv = convertRectToSector(
                            o.rect,
                            selectedSector,
                            modalSvgSize
                          );
                          if (!conv) return null;
                          return (
                            <Rect
                              key={`o-m-${idx}`}
                              x={conv.x}
                              y={conv.y}
                              width={conv.width}
                              height={conv.height}
                              fill="#4a4a4a"
                            />
                          );
                        })}
                      {buildRects.map((r, idx) => {
                        const action = actions[currentActionIndex];
                        const type = buildingTypes[action?.building] || 'residential';
                        const color = buildingColors[type] || '#4b0082';
                        const conv = convertRectToSector(r, selectedSector, modalSvgSize);
                        if (!conv) return null;
                        return <Rect key={`b-m-${idx}`} x={conv.x} y={conv.y} width={conv.width} height={conv.height} fill={color} />;
                      })}
                    </Svg>
                  )}
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={handleModalPress}
                  />
                </View>
              </>
            )}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, obstacleMode === 'horizontal' && styles.toggleActive]}
                onPress={() =>
                  setObstacleMode(prev => (prev === 'horizontal' ? null : 'horizontal'))
                }
              >
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, obstacleMode === 'vertical' && styles.toggleActive]}
                onPress={() =>
                  setObstacleMode(prev => (prev === 'vertical' ? null : 'vertical'))
                }
              >
                <Ionicons name="arrow-down" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.button, !hasObstacle && styles.disabledButton, { flex: 1, marginRight: 8 }]}
                disabled={!hasObstacle}
                onPress={() => {
                  setObstacleRects(prev => prev.filter(o => o.sector !== selectedSector));
                  setObstacleMode(null);
                }}
              >
                <Text style={[styles.buttonText, !hasObstacle && styles.disabledButtonText]}>Очистити</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, !hasObstacle && styles.disabledButton, { flex: 1 }]}
                disabled={!hasObstacle}
                onPress={() => setObstacleModalVisible(false)}
              >
                <Text style={[styles.buttonText, !hasObstacle && styles.disabledButtonText]}>Застосувати</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, marginLeft: 8 }]}
                onPress={() => setObstacleModalVisible(false)}
              >
                <Text style={styles.buttonText}>Закрити</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#f4f7fb' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1115' },
  mapContainer: {
    alignSelf: 'center',
    marginBottom: 16,
    overflow: 'hidden'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionText: { flex: 1, marginRight: 8 },
  button: {
    backgroundColor: '#4ea1ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4
  },
  disabledButton: {
    backgroundColor: '#b0b0b0'
  },
  actionsContainer: { marginTop: 20, alignItems: 'center' },
  actionButton: {
    backgroundColor: '#4ea1ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginBottom: 10,
    width: '60%',
    alignItems: 'center'
  },
  buttonText: { color: '#fff' },
  disabledButtonText: { color: '#eeeeee' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#152330',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    padding: 16,
    height: '50%'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  obstacleContainer: { marginTop: 12 },
  obstacleText: { marginBottom: 8 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8
  },
  toggleButton: {
    backgroundColor: '#9e9e9e',
    padding: 8,
    marginRight: 8,
    borderRadius: 4
  },
  modalSvgWrapper: {
    width: '50%',
    aspectRatio: 1,
    alignSelf: 'center',
    marginBottom: 12
  },
  toggleActive: { backgroundColor: '#4ea1ff' }
});

export default CulturalPlanner;
