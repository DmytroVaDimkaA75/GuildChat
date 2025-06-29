import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Animated
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '../../firebaseConfig';
import { ref, remove } from 'firebase/database';
import { Ionicons } from '@expo/vector-icons';
import { callAssistant } from '../../assistantApi'; // Ваш файл з axios-логікою
import VikingMap from './Map/Viking.svg';
import Svg, { Rect } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

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
      onPanResponderRelease: (_, gesture) => {
        const newX = clamp(offset.current.x + gesture.dx, containerWidth - mapWidth, 0);
        const newY = clamp(offset.current.y + gesture.dy, containerHeight - mapHeight, 0);
        offset.current = { x: newX, y: newY };
        pan.setValue(offset.current);
      }
    })
  ).current;

  const rectRef = useRef(null);

  const [m5TopLeft, setM5TopLeft] = useState(null);
  const [p7BottomRight, setP7BottomRight] = useState(null);

  useEffect(() => {
    const loadSvgData = async () => {
      const asset = Asset.fromModule(require('./Map/Viking.svg'));
      await asset.downloadAsync();
      const svgText = await FileSystem.readAsStringAsync(asset.localUri || asset.uri);

      const groupMatch = svgText.match(
        /<g[^>]*id="M5:P8"[^>]*transform="translate\(([^,]+),([^\)]+)\)"/
      );
      if (!groupMatch) {
        console.warn('Не знайдено групу M5:P8 у SVG.');
        return;
      }
      const groupX = parseFloat(groupMatch[1]);
      const groupY = parseFloat(groupMatch[2]);

      const pathM5 = svgText.match(/<path[^>]*id="M5"[^>]*d="([^"]+)"/);
      const pathP7 = svgText.match(/<path[^>]*id="P7"[^>]*d="([^"]+)"/);
      if (!pathM5 || !pathP7) {
        console.warn('Не знайдено шляхи M5 або P7 у SVG.');
        return;
      }

      const parseStart = (d) => {
        const m = d.match(/m\s*([\d.-]+),([\d.-]+)/);
        if (!m) {
          console.warn('Не вдалося розібрати стартові координати');
          return { x: 0, y: 0 };
        }
        return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      };
      const parseSize = (d) => {
        const m = d.match(/c\s*[\d.-]+,0\s*[\d.-]+,0\s*([\d.-]+),0/);
        if (!m) {
          console.warn('Не вдалося розібрати розмір клітинки');
          return 0;
        }
        return parseFloat(m[1]);
      };

      const m5Start = parseStart(pathM5[1]);
      const cellSize = parseSize(pathM5[1]);
      const p7Start = parseStart(pathP7[1]);
      const p7Size = parseSize(pathP7[1]);

      const topLeft = { x: groupX + m5Start.x, y: groupY + m5Start.y };
      const bottomRight = {
        x: groupX + p7Start.x + p7Size,
        y: groupY + p7Start.y + p7Size
      };

      setM5TopLeft(topLeft);
      setP7BottomRight(bottomRight);

      console.log(
        `Координати M5 (верхній лівий): x=${topLeft.x}, y=${topLeft.y}`
      );
      console.log(
        `Координати P7 (правий нижній): x=${bottomRight.x}, y=${bottomRight.y}`
      );
    };

    loadSvgData();
  }, []);

  const rectWidth =
    p7BottomRight && m5TopLeft ? p7BottomRight.x - m5TopLeft.x : 0;
  const rectHeight =
    p7BottomRight && m5TopLeft ? p7BottomRight.y - m5TopLeft.y : 0;

  useEffect(() => {
    if (!m5TopLeft || !p7BottomRight) return;
    setTimeout(() => {
        if (rectRef.current && rectRef.current.getBBox) {
          const box = rectRef.current.getBBox();
          console.log(
            `Прямокутник топ-лівий: x=${box.x}, y=${box.y}`
          );
          console.log(
            `Прямокутник низ-правий: x=${box.x + box.width}, y=${
              box.y + box.height
            }`
          );
        }
    }, 0);
  }, [m5TopLeft, p7BottomRight]);

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
    await remove(
      ref(
        database,
        `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`
      )
    );
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Тут логіка планувальника для {settlementName}
      </Text>
      <View style={[styles.mapContainer, { width: containerWidth, height: containerHeight }]}>
        <Animated.View
          style={{
            width: mapWidth,
            height: mapHeight,
            transform: [{ translateX: pan.x }, { translateY: pan.y }]
          }}
          {...panResponder.panHandlers}
        >
          <View>
            <VikingMap width={mapWidth} height={mapHeight} />
            <Svg
              width={mapWidth}
              height={mapHeight}
              style={StyleSheet.absoluteFill}
            >
              {/* Прямокутник між верхнім лівим кутом M5 та нижнім правим P7 */}
              {m5TopLeft && p7BottomRight && (
                <Rect
                  ref={rectRef}
                  x={m5TopLeft.x}
                  y={m5TopLeft.y}
                  width={rectWidth}
                  height={rectHeight}
                  stroke="red"
                  strokeWidth={0.5}
                  fill="rgba(255,0,0,0.2)"
                />
              )}
            </Svg>
          </View>
        </Animated.View>
      </View>
      {/* Ваша подальша реалізація UI планувальника */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: {
    alignSelf: 'center',
    marginBottom: 16,
    overflow: 'hidden'
  }
});

export default CulturalPlanner;
