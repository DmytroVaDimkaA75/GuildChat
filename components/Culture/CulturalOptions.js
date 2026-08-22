import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  textPrimary: '#f4f7fb',
  accent: '#4ea1ff',
};

const CulturalOptions = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;

  const [hasTech, setHasTech] = useState(Boolean(route.params?.hasTech));
  const [hasObstacles, setHasObstacles] = useState(Boolean(route.params?.hasObstacles));

  const handleOpenTechnologyCosts = () => {
    navigation.navigate('TechnologyCosts', { settlementName });
  };

  const handleOpenObstacles = () => {
    navigation.navigate('ObstaclesMap', {
      settlementName,
    });
  };

  const refreshEditFlags = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (!userId || !guildId) return;

      const basePath = `/users/${userId}/userGuilds/${guildId}/settlement`;
      const [techSnap, obstacleSnap] = await Promise.all([
        database().ref(`${basePath}/tech`).once('value'),
        database().ref(`${basePath}/sectorObstaclesStatic`).once('value'),
      ]);

      setHasTech(techSnap.exists());
      setHasObstacles(obstacleSnap.exists());
    } catch (e) {
      console.error('Не вдалося оновити прапорці правки:', e);
    }
  }, []);

  const handleConfirmGameMode = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (!userId || !guildId) {
        Alert.alert('Помилка', 'Не знайдено userId або guildId.');
        return false;
      }

      const basePath = `/users/${userId}/userGuilds/${guildId}/settlement`;
      const [techSnap, obstacleSnap] = await Promise.all([
        database().ref(`${basePath}/tech`).once('value'),
        database().ref(`${basePath}/sectorObstaclesStatic`).once('value'),
      ]);

      if (!techSnap.exists() || !obstacleSnap.exists()) {
        Alert.alert('Увага', 'Для переходу в режим game потрібно зберегти і технології, і перешкоди.');
        return false;
      }

      const pack = RULE_PACKS[settlementName] || Object.values(RULE_PACKS).find((item) => item?.settlementType === settlementName);
      const openedSectors = pack?.map?.startOpenSectors || [];
      const townHallConfig = pack?.coreBuildings?.townHall;
      const townHallFootprint = townHallConfig?.startPlacement?.footprint || null;

      const placedBuildingsSnap = await database().ref(`${basePath}/placedBuildings`).once('value');
      const placedBuildingsRaw = placedBuildingsSnap.exists() ? placedBuildingsSnap.val() : [];
      const placedBuildings = Array.isArray(placedBuildingsRaw)
        ? placedBuildingsRaw
        : Object.values(placedBuildingsRaw || {});

      const nextPlacedBuildings = [
        ...placedBuildings.filter((item) => item?.buildingId !== 'town_hall'),
      ];

      if (townHallFootprint) {
        nextPlacedBuildings.push({
          instanceId: 'town_hall_1',
          buildingId: 'town_hall',
          footprint: townHallFootprint,
          rotation: 0,
          placedAt: 0,
          passive: null,
          job: null,
        });
      }

      await database().ref(basePath).update({
        settlementName: settlementName || null,
        status: 'game',
        openedSectors,
        placedBuildings: nextPlacedBuildings,
      });

      return true;
    } catch (error) {
      console.error('Не вдалося змінити статус на game:', error);
      Alert.alert('Помилка', 'Не вдалося змінити статус на game.');
      return false;
    }
  }, [settlementName]);

  useEffect(() => {
    refreshEditFlags();
  }, [refreshEditFlags]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshEditFlags);
    return unsubscribe;
  }, [navigation, refreshEditFlags]);

  useEffect(() => {
    navigation.setParams({
      onSaveCulturalOptions: handleConfirmGameMode,
    });
  }, [handleConfirmGameMode, navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Обране поселення: {settlementName || '—'}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleOpenTechnologyCosts}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {hasTech ? 'Вартість технологій (правка)' : 'Вартість технологій'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={handleOpenObstacles}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {hasObstacles ? 'Перешкоди (правка)' : 'Перешкоди'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    width: '90%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CulturalOptions;
