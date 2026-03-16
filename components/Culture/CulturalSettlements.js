// components/CulturalSettlements.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const COLORS = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2F2F2F',
  textPrimary: '#FFFFFF',
  accent: '#2196f3',
};

const SETTLEMENTS = [
  {
    label: 'Вікінги',
    value: 'vikings',
    image: require('./Vikings.png'),
  },
  {
    label: 'Феодальна Японія',
    value: 'japanese',
    image: require('./Japan.png'),
  },
  {
    label: 'Стародавній Єгипет',
    value: 'egyptians',
    image: require('./Egypt.png'),
  },
  {
    label: 'Ацтеки',
    value: 'aztecs',
    image: require('./Aztecs.png'),
  },
  {
    label: 'Імперія Моголів',
    value: 'mughals',
    image: require('./Mughal.png'),
  },
  {
    label: 'Полінезія',
    value: 'polynesia',
    image: require('./Polynesia.png'),
  },
  {
    label: 'Піратське поселення',
    value: 'pirates',
    image: require('./Pirates.png'),
  },
];

const CulturalSettlements = () => {
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    let isMounted = true;

    const checkSelectedSettlement = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');

        if (!userId || !guildId) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`;
        const snapshot = await database().ref(path).once('value');

        if (!isMounted) {
          return;
        }

        if (snapshot.exists()) {
          const data = snapshot.val() || {};
          const settlementName = data.settlementName;

          if (settlementName) {
            navigation.replace('CulturalPlanner', {
              settlementName,
              start: false,
            });
            return;
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Помилка під час перевірки поселення:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkSelectedSettlement();

    return () => {
      isMounted = false;
    };
  }, [navigation]);

  const handleSelect = async (value) => {
    setLoading(true);

    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');

      if (!userId || !guildId) {
        setLoading(false);
        return;
      }

      const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`;

      await database().ref(path).set({
        settlementName: value,
      });

      navigation.replace('CulturalPlanner', {
        settlementName: value,
        start: true,
      });
    } catch (error) {
      console.error('Помилка під час вибору поселення:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {SETTLEMENTS.map((item) => (
        <TouchableOpacity
          key={item.value}
          style={styles.settlementsItem}
          onPress={() => handleSelect(item.value)}
          activeOpacity={0.8}
        >
          <Image source={item.image} style={styles.buildingImage} />
          <Text style={styles.optionText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  settlementsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    marginBottom: 15,
    padding: 10,
  },
  buildingImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    marginRight: 8,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});

export default CulturalSettlements;