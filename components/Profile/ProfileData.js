import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ИЗМЕНЕНО
import { useNavigation } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import SimpleWheelPicker from '../CustomElements/SimpleWheelPicker'; // додано

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень',
  'Травень', 'Червень', 'Липень', 'Серпень',
  'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

// Функція повертає кількість днів для вибраного місяця (індекс від 0 до 11)
// Для лютого повертаємо 29 днів, адже 29 може бути коректною датою народження
function getDaysArray(monthIndex) {
  if (monthIndex === 1) { // Лютий
    return Array.from({ length: 29 }, (_, i) => i + 1);
  } else if ([3, 5, 8, 10].includes(monthIndex)) { // Квітень, червень, вересень, листопад
    return Array.from({ length: 30 }, (_, i) => i + 1);
  } else {
    return Array.from({ length: 31 }, (_, i) => i + 1);
  }
}

const ProfileData = () => {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');

  // day — число, month — індекс (0..11)
  const [day, setDay] = useState(null);
  const [month, setMonth] = useState(null);

  // Керування відображенням модального вікна
  const [showDOBModal, setShowDOBModal] = useState(false);

  // Тимчасові індекси для вибору (day: 0..N-1, month: 0..11)
  const [tempDayIndex, setTempDayIndex] = useState(0);
  const [tempMonthIndex, setTempMonthIndex] = useState(0);

  const navigation = useNavigation();

  // Завантаження даних користувача з Firebase
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          // ИЗМЕНЕНО
          const snapshot = await database().ref(`/users/${userId}`).once('value');
          if (snapshot.exists()) {
            const userData = snapshot.val();
            setName(userData.name || '');
            setCity(userData.city || '');
            if (userData.day && userData.month !== undefined) {
              setDay(userData.day);
              setMonth(userData.month);
            }
          }
        } else {
          console.log('userId не знайдено в AsyncStorage');
        }
      } catch (error) {
        console.error('Помилка отримання даних користувача:', error);
      }
    };

    fetchUserData();
  }, []);

  // Функція для збереження даних у Firebase (з ім'ям, містом, днем і місяцем)
  const handleSaveProfileData = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) {
        console.log('userId не знайдено в AsyncStorage');
        return;
      }
      // ИЗМЕНЕНО
      await database().ref(`/users/${userId}`).update({ 
        name, 
        city,
        day, 
        month 
      });
      console.log('Дані профілю оновлено');
      navigation.goBack();
    } catch (error) {
      console.error('Помилка оновлення даних користувача:', error);
    }
  };

  // Налаштування кнопки "галочка" в хедері
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleSaveProfileData} style={{ marginRight: 15 }}>
          <Ionicons name="checkmark" size={24} color="white" />
        </TouchableOpacity>
      )
    });
  }, [navigation, name, city, day, month]);

  // Форматування дати народження для відображення (наприклад, "23 Лютий")
  const formatDOB = () => {
    if (day === null || month === null) return 'Вказати';
    return `${day} ${MONTHS[month]}`;
  };

  // Відкриття модального вікна – підставляємо тимчасові значення
  const openDOBModal = () => {
    const currentDay = day || 1;
    const currentMonth = month !== null ? month : 0;
    setTempDayIndex(currentDay - 1);
    setTempMonthIndex(currentMonth);
    setShowDOBModal(true);
  };

  // Отримуємо список днів для обраного місяця (за тимчасовим tempMonthIndex)
  const daysArray = getDaysArray(tempMonthIndex);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Ваше ім’я</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Місто (населений пункт)</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>День народження</Text>
        <TouchableOpacity style={styles.row} onPress={openDOBModal}>
          <Text style={styles.dr}>Дата народження</Text>
          <Text style={styles.link}>{formatDOB()}</Text>
        </TouchableOpacity>
      </View>

      {showDOBModal && (
        <Modal
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDOBModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowDOBModal(false)}>
            <View style={styles.modalBackground}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContainer}>
                  <Text style={styles.modalTitle}>Дата народження</Text>
                  <View style={styles.wheelWrapper}>
                    <View style={styles.wheelContainer}>
                      <SimpleWheelPicker
                        data={daysArray.map(d => String(d))}
                        selectedIndex={tempDayIndex}
                        onValueChange={(_, idx) => setTempDayIndex(idx)}
                      />
                      <SimpleWheelPicker
                        data={MONTHS}
                        selectedIndex={tempMonthIndex}
                        onValueChange={(_, idx) => {
                          setTempMonthIndex(idx);
                          const newDays = getDaysArray(idx);
                          if ((tempDayIndex + 1) > newDays.length) {
                            setTempDayIndex(newDays.length - 1);
                          }
                        }}
                      />
                    </View>
                    {/* Синій оверлей із лініями над і під рядком вибору */}
                    <View style={styles.selectionOverlay} pointerEvents="none" />
                  </View>
                  {/* Залишаємо лише кнопку "Зберегти" */}
                  <TouchableOpacity
                    style={styles.modalButtonSave}
                    onPress={() => {
                      setDay(tempDayIndex + 1);
                      setMonth(tempMonthIndex);
                      setShowDOBModal(false);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    padding: 15,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    fontSize: 16,
    color: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dr: {
    fontSize: 16,
    color: '#000',
  },
  link: {
    fontSize: 16,
    color: '#007AFF',
  },
  // Модальне вікно відкривається знизу екрану
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%',
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    color: '#000',
    textAlign: 'center',
  },
  wheelWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  wheelContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Оверлей із синіми лініями, який займає центральний рядок (наприклад, 40px висоти)
  selectionOverlay: {
    position: 'absolute',
    top: 70, // (180 / 2) - (40 / 2)
    left: 0,
    right: 0,
    height: 40,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#007AFF',
  },
  modalButtonSave: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ProfileData;