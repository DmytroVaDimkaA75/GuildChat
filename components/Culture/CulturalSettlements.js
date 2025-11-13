// components/CulturalSettlements.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ПРАВИЛЬНЫЙ ИМПОРТ
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CulturalSettlements = () => {
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) {
          setLoading(false);
          // Можно добавить обработку ошибки, если ID не найдены
          return;
        }
        const path = `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`;

        // --- ИЗМЕНЕНО: Синтаксис `once` для @react-native-firebase ---
        const snapshot = await database().ref(path).once('value');

        if (snapshot.exists()) {
          const { settlementName } = snapshot.val();
          navigation.replace('CulturalPlanner', { settlementName, start: false });
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("Ошибка при проверке поселения:", e);
        setLoading(false);
      }
    })();
  }, [navigation]);

  const options = [
    { label: 'Вікінги', value: 'Vikings' },
    { label: 'Феодільна Японія', value: 'Japan' },
    { label: 'Древній Єгипет', value: 'Egypt' },
    { label: 'Ацтеки', value: 'Aztecs' },
    { label: 'Імперія Моголів', value: 'Mughal' },
    { label: 'Полінезія', value: 'Polynesia' },
  ];

  const images = {
    Vikings: require('./Vikings.png'),
    Japan:   require('./Japan.png'),
    Egypt:   require('./Egypt.png'),
    Aztecs:  require('./Aztecs.png'),
    Mughal:  require('./Mughal.png'),
    Polynesia: require('./Polynesia.png'),
  };

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

      // --- ИЗМЕНЕНО: Синтаксис `set` для @react-native-firebase ---
      await database().ref(path).set({ settlementName: value });
      
      navigation.replace('CulturalPlanner', { settlementName: value, start: true });
    } catch (e) {
      console.error("Ошибка при выборе поселения:", e);
      setLoading(false); // Убедимся, что лоадер отключается при ошибке
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} onPress={() => handleSelect(opt.value)}>
          <View style={styles.settlementsItem}>
            <Image source={images[opt.value]} style={styles.buildingImage} />
            <Text style={styles.optionText}>{opt.label}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  settlementsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    marginBottom: 15,
    padding: 10,
  },
  imageNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buildingImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    marginRight: 8,
  },
  optionText: {
    fontSize: 16,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CulturalSettlements;