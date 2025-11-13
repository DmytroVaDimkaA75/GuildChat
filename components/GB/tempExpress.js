import AsyncStorage from '@react-native-async-storage/async-storage';
// import { get, ref } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import WheelPickerExpo from 'react-native-wheel-picker-expo';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

const GBNewExpress = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  // Отримуємо buildingId з параметрів навігації
  const { buildingId } = route.params;
  console.log("buildingId отриманий від попереднього компоненту (MyGB):", buildingId);

  // Стан для даних ВС та поточного рівня
  const [buildingInfo, setBuildingInfo] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);

  // Стан для степера та модального вікна вибору дати/часу
  const [levelThreshold, setLevelThreshold] = useState(0);
  const [stepperWidth, setStepperWidth] = useState(200);
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedMinute, setSelectedMinute] = useState(null);
  const [tempDayIndex, setTempDayIndex] = useState(0);
  const [tempHourIndex, setTempHourIndex] = useState(0);
  const [tempMinuteIndex, setTempMinuteIndex] = useState(0);

  // Функція для отримання локалізованого значення (якщо buildingName є об’єктом)
  const getLocalizedValue = (value) => {
    if (value && typeof value === 'object') {
      return value[i18n.language] || value['uk'] || '';
    }
    return value;
  };

  // Генерація 7 варіантів днів із використанням даних із i18n
  const generate7DayOptions = () => {
    const currentLang = i18n.language.split('-')[0];
    const days = i18n.t('datesShort.days', { lng: currentLang, returnObjects: true });
    const months = i18n.t('datesShort.months', { lng: currentLang, returnObjects: true });
    const result = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (i === 0) {
        result.push({ label: t('gbNewExpress.today'), date: d });
      } else if (i === 1) {
        result.push({ label: t('gbNewExpress.tomorrow'), date: d });
      } else {
        const w = days[d.getDay()];
        const dayNum = d.getDate();
        const monthLabel = months[d.getMonth()];
        const label = `${w}, ${dayNum} ${monthLabel}`;
        result.push({ label, date: d });
      }
    }
    return result;
  };

  const dayOptions = generate7DayOptions();

  // Завантаження даних про ВС та поточного рівня з Firebase
  useEffect(() => {
    const fetchBuildingDetails = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedGuildId || !storedUserId) {
          console.log(t('gbNewExpress.authError'));
          return;
        }
        
        // 1. Отримання даних про ВС (НОВИЙ СИНТАКСИС)
        const snapshotBuilding = await database()
          .ref(`greatBuildings/${buildingId}`)
          .once('value');

        if (snapshotBuilding.exists()) {
          const data = snapshotBuilding.val();
          setBuildingInfo(data);
          console.log("Шлях до апі, значення levelBase:", data.levelBase);
        } else {
          console.log("Дані для даної ВС не знайдено");
        }

        // 2. Отримання поточного рівня (НОВИЙ СИНТАКСИС)
        const snapshotLevel = await database()
          .ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildingId}`)
          .once('value');
          
        if (snapshotLevel.exists()) {
          const level = snapshotLevel.val().level;
          setCurrentLevel(level);
          console.log("Поточний рівень:", level);
        } else {
          console.log("Поточний рівень не знайдено");
        }
      } catch (error) {
        console.error("Помилка при завантаженні даних:", error);
      }
    };

    fetchBuildingDetails();
  }, [buildingId, t]);

  // Компонент Stepper (завжди активний)
  const Stepper = ({ value, onValueChange, buttonSize = 40, minValue = 0, maxValue = 200 }) => {
    const inputWidth = stepperWidth - buttonSize * 2;
    const [inputValue, setInputValue] = useState(String(value));

    const handleIncrement = () => {
      const newValue = Math.min(value + 1, maxValue);
      onValueChange(newValue);
      setInputValue(String(newValue));
    };

    const handleDecrement = () => {
      const newValue = Math.max(value - 1, minValue);
      onValueChange(newValue);
      setInputValue(String(newValue));
    };

    const handleInputChange = (text) => {
      if (/^\d*$/.test(text)) {
        setInputValue(text);
      }
    };

    const handleEndEditing = () => {
      let newValue = parseInt(inputValue, 10);
      if (isNaN(newValue)) {
        newValue = minValue;
      } else if (newValue > maxValue) {
        newValue = maxValue;
      } else if (newValue < minValue) {
        newValue = minValue;
      }
      onValueChange(newValue);
      setInputValue(String(newValue));
    };

    return (
      <View
        style={styles.stepperContainer}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setStepperWidth(width);
        }}
      >
        <TouchableOpacity
          onPress={handleDecrement}
          style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}
        >
          <Text style={styles.stepButtonText}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.valueInput, { width: inputWidth, height: buttonSize }]}
          keyboardType="numeric"
          value={inputValue}
          onChangeText={handleInputChange}
          onEndEditing={handleEndEditing}
          maxLength={String(maxValue).length}
          editable={true}
        />
        <TouchableOpacity
          onPress={handleIncrement}
          style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Функція для перетворення вибраних значень у Date
  const getFullDate = (dayIndex, hour, minute) => {
    const base = dayOptions[dayIndex].date;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
  };

  // Відкриття модального вікна вибору дати/часу (значення = поточний час + 2 години)
  const openDateTimeModal = () => {
    const minTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    let foundIndex = dayOptions.findIndex(opt =>
      opt.date.getFullYear() === minTime.getFullYear() &&
      opt.date.getMonth() === minTime.getMonth() &&
      opt.date.getDate() === minTime.getDate()
    );
    if (foundIndex === -1) {
      foundIndex = dayOptions.length - 1;
    }
    setTempDayIndex(foundIndex);
    setTempHourIndex(minTime.getHours());
    setTempMinuteIndex(minTime.getMinutes());
    setShowDateTimeModal(true);
  };

  // Форматування вибраної дати/часу для відображення
  const formatDayHourMinute = () => {
    if (selectedHour === null || selectedMinute === null) {
      return t('gbNewExpress.setTime');
    }
    if (!dayOptions[selectedDayIndex]) return t('gbNewExpress.specify');
    const labelDay = dayOptions[selectedDayIndex].label;
    const hh = String(selectedHour).padStart(2, '0');
    const mm = String(selectedMinute).padStart(2, '0');
    return `${labelDay}, ${hh}:${mm}`;
  };

  // Збереження вибраної дати/часу з модального вікна
  const handleSaveDateTime = () => {
    let newDt = getFullDate(tempDayIndex, tempHourIndex, tempMinuteIndex);
    const minDt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (newDt < minDt) {
      newDt = minDt;
    }
    let foundIndex = dayOptions.findIndex(opt =>
      opt.date.getFullYear() === newDt.getFullYear() &&
      opt.date.getMonth() === newDt.getMonth() &&
      opt.date.getDate() === newDt.getDate()
    );
    if (foundIndex === -1) {
      foundIndex = dayOptions.length - 1;
    }
    setSelectedDayIndex(foundIndex);
    setSelectedHour(newDt.getHours());
    setSelectedMinute(newDt.getMinutes());
    setShowDateTimeModal(false);
  };

  return (
    <ScrollView style={{ backgroundColor: '#FFF' }}>
      <View style={styles.container}>
        {/* Відображення інформації про ВС (зображення та назва) */}
        <View style={styles.block}>
          
          {buildingInfo ? (
            <View style={styles.buildingInfoContainer}>
              <Image
                source={{ uri: buildingInfo.buildingImage }}
                style={styles.buildingImage}
                resizeMode="contain"
              />
              <Text style={styles.itemText}>
                {getLocalizedValue(buildingInfo.buildingName)}
              </Text>
            </View>
          ) : (
            <Text>{t('gbNewExpress.loadingBuildingInfo') || "Завантаження даних..."}</Text>
          )}
        </View>

        {/* Stepper для мінімального рівня ВС (завжди активний) */}
        <View style={styles.block}>
          <Text style={{ marginBottom: 10 }}>
            {t('gbNewExpress.levelThresholdLabel') || "Мінімальний рівень ВС"}
          </Text>
          <Stepper
            value={parseInt(levelThreshold, 10) || 0}
            onValueChange={(val) => setLevelThreshold(val)}
            buttonSize={40}
            minValue={0}
            maxValue={200}
          />
        </View>

        {/* Кнопка для відкриття модального вікна вибору дати/часу */}
        <View style={styles.block}>
          <Text style={{ marginBottom: 10 }}>
            {t('gbNewExpress.scheduleTime') || "Запланувати час"}
          </Text>
          <TouchableOpacity style={styles.dateButton} onPress={openDateTimeModal}>
            <Text style={styles.dateButtonText}>
              {formatDayHourMinute()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Модальне вікно для вибору дати та часу */}
        {showDateTimeModal && (
          <Modal
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowDateTimeModal(false)}
          >
            <TouchableWithoutFeedback onPress={() => setShowDateTimeModal(false)}>
              <View style={styles.modalBackground}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalContainer}>
                    <Text style={styles.modalTitle}>
                      {t('gbNewExpress.modalTitle') || "Виберіть дату та час"}
                    </Text>
                    <View style={styles.wheelWrapper}>
                      <View style={styles.wheelContainer}>
                        <WheelPickerExpo
                          height={180}
                          width={140}
                          initialSelectedIndex={tempDayIndex}
                          items={dayOptions.map((item, idx) => ({
                            label: item.label,
                            value: idx,
                          }))}
                          onChange={({ item }) => setTempDayIndex(item.value)}
                        />
                        <WheelPickerExpo
                          height={180}
                          width={60}
                          initialSelectedIndex={tempHourIndex}
                          items={Array.from({ length: 24 }, (_, i) => ({
                            label: String(i).padStart(2, '0'),
                            value: i,
                          }))}
                          onChange={({ item }) => setTempHourIndex(item.value)}
                        />
                        <WheelPickerExpo
                          height={180}
                          width={60}
                          initialSelectedIndex={tempMinuteIndex}
                          items={Array.from({ length: 60 }, (_, i) => ({
                            label: String(i).padStart(2, '0'),
                            value: i,
                          }))}
                          onChange={({ item }) => setTempMinuteIndex(item.value)}
                        />
                      </View>
                      <View style={styles.selectionOverlay} pointerEvents="none" />
                    </View>
                    <TouchableOpacity style={styles.modalButtonSave} onPress={handleSaveDateTime}>
                      <Text style={styles.modalButtonText}>
                        {t('gbNewExpress.saveButton') || "Зберегти"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}
      </View>
    </ScrollView>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FFF',
      alignItems: 'center',
      paddingTop: 20,
    },
    block: {
      backgroundColor: '#f2f2f2',
      padding: 10,
      marginBottom: 20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#cccccc',
      width: '90%',
    },
    buildingInfoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    buildingImage: {
      width: 70,
      height: 70,
      marginRight: 10,
    },
    itemText: {
      fontSize: 20,
      color: '#000',
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#007AFF',
      borderRadius: 4,
      overflow: 'hidden',
    },
    stepButton: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#007AFF',
    },
    stepButtonText: {
      color: '#fff',
      fontSize: 12,
    },
    valueInput: {
      textAlign: 'center',
      backgroundColor: '#fff',
      borderColor: '#007AFF',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      fontSize: 16,
      color: '#000',
    },
    dateButton: {
      backgroundColor: '#007AFF',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 6,
      alignItems: 'center',
    },
    dateButtonText: {
      color: '#fff',
      fontSize: 16,
    },
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
    selectionOverlay: {
      position: 'absolute',
      top: 70,
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

export default GBNewExpress;