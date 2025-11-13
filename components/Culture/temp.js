import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
// --- ИЗМЕНЕНО: Правильный импорт ---
import database from '@react-native-firebase/database';

// --- УДАЛЕНЫ неверные импорты ---
// import { database } from '../../firebaseConfig';
// import { ref, remove } from 'firebase/database';

// import { callAssistant } from '../../assistantApi'; // Оставил закомментированным, т.к. не используется
import VikingMap from './Map/Viking.svg';

const CulturalPlanner = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const start = route.params?.start;

  const { width: screenWidth } = Dimensions.get('window');
  const ratio = 1.2; // Отношение ширины к высоте оригинальной карты
  const scale = 1 / 0.75; // Масштаб, чтобы видимой была примерно 75%
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

  // Пока не загрузился settlementName, показываем лоадер
  if (!settlementName) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // --- ИЗМЕНЕНО: Функция переписана на нативный синтаксис ---
  const clearAndBack = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');

      if (!userId || !guildId) {
        Alert.alert("Ошибка", "Не удалось найти ID пользователя или гильдии.");
        return;
      }

      const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`;

      await database().ref(path).remove();
      
      navigation.replace('CulturalSettlements');
    } catch (error) {
      console.error("Ошибка при удалении поселения:", error);
      Alert.alert("Ошибка", "Не удалось удалить поселение. Попробуйте снова.");
    }
  };

  // Обработчик закрытия экрана
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

  // Настраиваем заголовок и кнопки в шапке
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
          <VikingMap width={mapWidth} height={mapHeight} />
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