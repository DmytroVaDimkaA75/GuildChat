import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { database } from '../../firebaseConfig';
import { ref, remove } from 'firebase/database';
import { Ionicons } from '@expo/vector-icons';
import { callAssistant } from '../../assistantApi'; // Ваш файл з axios-логікою

const CulturalPlanner = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const start = route.params?.start;

  // Поки не завантажився settlementName, показуємо лоадер
  if (!settlementName) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // При першому mount, якщо start=true, формуємо prompt і відправляємо асистенту
  useEffect(() => {
    if (start) {
      (async () => {
        try {
          const language =
            (await AsyncStorage.getItem('language')) || 'ukrainian';
          const data = { settlement_name: settlementName, language };
          const prompt = `Будь ласка, згенеруй детальний план розвитку культурного поселення на основі цих даних:\n${JSON.stringify(
            data,
            null,
            2
          )}`;

          console.log('DEBUG: prompt для асистента:', prompt);
          const reply = await callAssistant(prompt);
          console.log('DEBUG: відповідь від асистента:', reply);

          if (reply && reply.length) {
            Alert.alert('Результат планування', reply);
          } else {
            Alert.alert('Помилка', 'Асистент не надав відповіді.');
          }
        } catch (e) {
          console.error('ERROR при callAssistant:', e);
          Alert.alert('Помилка', e.message);
        }
      })();
    }
  }, [start, settlementName]);

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
          onPress={start ? onClose : () => navigation.getParent()?.goBack()}
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
      {/* Ваша подальша реалізація UI планувальника */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default CulturalPlanner;
