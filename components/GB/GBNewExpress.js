import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { get, push, ref, set } from 'firebase/database'; // <- УДАЛЕНО
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import { Dropdown } from 'react-native-element-dropdown';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО
import CustomCheckBox from '../CustomElements/CustomCheckBox3';
import SimpleWheelPicker from '../CustomElements/SimpleWheelPicker';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';


const GBNewExpress = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  // Отримання buildingId та scheduleTime з route.params
  const { buildingId, scheduleTime } = route.params;

  const getLocalizedValue = (value) => {
    if (value && typeof value === 'object') {
      return value[i18n.language] || value['uk'] || '';
    }
    return value;
  };

  const [buildings, setBuildings] = useState([]);
  const [allowedGB, setAllowedGB] = useState(null);
  const [buildingInfo, setBuildingInfo] = useState(null);
  const [levelThreshold, setLevelThreshold] = useState(0);
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [placeLimit, setPlaceLimit] = useState([false, false, false, false, false]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedMinute, setSelectedMinute] = useState(null);
  const [tempDayIndex, setTempDayIndex] = useState(0);
  const [tempHourIndex, setTempHourIndex] = useState(0);
  const [tempMinuteIndex, setTempMinuteIndex] = useState(0);
  // Стан для загальної вартості прокачки
  const [totalCost, setTotalCost] = useState(0);

  const dayOptions = (() => {
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
  })();

  // Паралельне отримання даних для розрахунку вартості прокачки
  useEffect(() => {
    const fetchApiAndLevelAndCalculate = async () => {
      const buildId = buildingId || allowedGB;
      if (buildId && levelThreshold > 1) {
        try {
          const storedGuildId = await AsyncStorage.getItem('guildId');
          const storedUserId = await AsyncStorage.getItem('userId');

          // Отримання базового API посилання (НОВИЙ СИНТАКСИС)
          const levelBaseRef = database().ref(`greatBuildings/${buildId}`);
          let apiBase = "";
          const snapshotApi = await levelBaseRef.once('value');
          if (snapshotApi.exists()) {
            const data = snapshotApi.val();
            if (data.levelBase) {
              apiBase = data.levelBase;
            }
          }

          // Отримання поточного рівня ВС (НОВИЙ СИНТАКСИС)
          const currentLevelRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildId}`);
          let currentLevel = 0;
          const snapshotLevel = await currentLevelRef.once('value');
          if (snapshotLevel.exists()) {
            const levelData = snapshotLevel.val();
            if (levelData.level !== undefined) {
              currentLevel = levelData.level;
            }
          }

          let S = 0;
          // Створюємо масив промісів для кожного рівня
          const levelPromises = [];
          for (let K = currentLevel + 1; K <= currentLevel + levelThreshold; K++) {
            const completeApiLink = apiBase + K;
            console.log("Complete API посилання:", completeApiLink);
            levelPromises.push(
              fetch(completeApiLink)
                .then(response => response.json())
                .then(json => {
                  const total_fp = json.response.total_fp;
                  const forgepointsArray = json.response.patron_bonus.map(item => item.forgepoints);
                  // Для кожного елемента обчислюємо Math.round(forgepoints * 1.9)
                  const sumRounded = forgepointsArray.reduce((acc, cur) => acc + Math.round(cur * 1.9), 0);
                  const computedCost = total_fp - sumRounded;
                  console.log(`Рівень ${K}: обчислена вартість: ${computedCost}, forgepoints (округлені): ${forgepointsArray.map(fp => Math.round(fp * 1.9))}`);
                  return computedCost;
                })
                .catch(error => 0)
            );
          }
          const costs = await Promise.all(levelPromises);
          S = costs.reduce((a, b) => a + b, 0);
          console.log("Загальна вартість прокачки:", S);
          setTotalCost(S);
        } catch (error) {
          // Не виводимо помилки
        }
      }
    };
    fetchApiAndLevelAndCalculate();
  }, [buildingId, allowedGB, levelThreshold]);

  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedGuildId || !storedUserId) return;
        const dbPath = `guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild`;
        
        // НОВИЙ СИНТАКСИС
        const dbRef = database().ref(dbPath);
        const snapshot = await dbRef.once('value');
        if (snapshot.exists()) {
          const data = snapshot.val();
          const buildingIds = Object.keys(data);
          const buildingPromises = buildingIds.map(async (id) => {
            // НОВИЙ СИНТАКСИС
            const buildingRef = database().ref(`greatBuildings/${id}`);
            const buildingSnapshot = await buildingRef.once('value');
            if (buildingSnapshot.exists()) {
              const buildingData = buildingSnapshot.val();
              return {
                value: id,
                label: getLocalizedValue(buildingData.buildingName),
                image: buildingData.buildingImage,
              };
            }
            return null;
          });
          const buildingsResults = await Promise.all(buildingPromises);
          const buildingsArray = buildingsResults.filter(item => item !== null);
          setBuildings(buildingsArray);
        }
      } catch (error) {
        // Не виводимо помилки
      }
    };
    fetchBuildings();
  }, [t, i18n.language, getLocalizedValue]);

  useEffect(() => {
    const fetchBuildingInfo = async () => {
      if (buildingId && !scheduleTime) {
        try {
          // НОВИЙ СИНТАКСИС
          const buildingRef = database().ref(`greatBuildings/${buildingId}`);
          const snapshot = await buildingRef.once('value');
          if (snapshot.exists()) {
            setBuildingInfo(snapshot.val());
          }
        } catch (error) {
          // Не виводимо помилки
        }
      }
    };
    fetchBuildingInfo();
  }, [buildingId, scheduleTime]);

  const handleSelectGB = async (item) => {
    setAllowedGB(item.value);
    try {
      // Логіка тут залишається в основному для сайд-ефектів, але тепер з новим синтаксисом
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      // НОВИЙ СИНТАКСИС
      const currentLevelRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${item.value}`);
      await currentLevelRef.once('value');
      const buildingApiRef = database().ref(`greatBuildings/${item.value}`);
      await buildingApiRef.once('value');
    } catch (error) {
      // Не виводимо помилки
    }
  };

  const handleCheckBoxChange = (index) => {
    const newPlaceLimit = [...placeLimit];
    newPlaceLimit[index] = !newPlaceLimit[index];
    setPlaceLimit(newPlaceLimit);
  };

  const Stepper = ({ value, onValueChange, buttonSize = 40, minValue = 0, maxValue = 200 }) => {
    const [inputValue, setInputValue] = useState(String(value));

    const clampValue = (nextValue) => Math.min(maxValue, Math.max(minValue, nextValue));

    const handleIncrement = () => {
      const newValue = clampValue(value + 1);
      onValueChange(newValue);
      setInputValue(String(newValue));
    };

    const handleDecrement = () => {
      const newValue = clampValue(value - 1);
      onValueChange(newValue);
      setInputValue(String(newValue));
    };

    const handleInputChange = (text) => {
      if (/^\d*$/.test(text)) {
        setInputValue(text);
        if (text !== '') {
          const parsedValue = clampValue(parseInt(text, 10));
          onValueChange(parsedValue);
        }
      }
    };

    const handleEndEditing = () => {
      const parsedValue = clampValue(parseInt(inputValue, 10) || minValue);
      onValueChange(parsedValue);
      setInputValue(String(parsedValue));
    };

    useEffect(() => {
      setInputValue(String(value));
    }, [value]);

    return (
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          onPress={handleDecrement}
          style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}
        >
          <Text style={styles.stepButtonText}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.valueInput, { height: buttonSize, flex: 1 }]}
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

  const getFullDate = useCallback((dayIndex, hour, minute) => {
    const base = dayOptions[dayIndex].date;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
  }, [dayOptions]);

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

  const formValid = (() => {
    if (!buildingId && scheduleTime) {
      return allowedGB !== null && levelThreshold > 1;
    } else if (buildingId && !scheduleTime) {
      return selectedHour !== null && selectedMinute !== null && levelThreshold > 1;
    }
    return false;
  })();

  const handleSave = useCallback(async () => {
    try {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      if (!storedGuildId) return;
      const selectedPlaceLimits = placeLimit
        .map((checked, index) => (checked ? index + 1 : null))
        .filter((value) => value !== null);
      let dataToSave = {
        levelThreshold,
        placeLimit: selectedPlaceLimits,
        timestamp: Date.now(),
        user: userId
      };
      if (!buildingId && scheduleTime) {
        dataToSave.allowedGB = allowedGB;
        dataToSave.scheduleTime = scheduleTime;
      } else if (buildingId && !scheduleTime) {
        dataToSave.allowedGB = buildingId;
        dataToSave.scheduleTime = getFullDate(selectedDayIndex, selectedHour, selectedMinute).getTime();
      } else {
        return;
      }
      
      // НОВИЙ СИНТАКСИС
      const expressRootRef = database().ref(`guilds/${storedGuildId}/express`);
      const snapshotAll = await expressRootRef.once('value');
      
      if (snapshotAll.exists()) {
        const chats = snapshotAll.val();
        for (let key in chats) {
          if (chats.hasOwnProperty(key)) {
            if (chats[key].scheduleTime === dataToSave.scheduleTime && chats[key].allowedUsers) {
              dataToSave.allowedUsers = chats[key].allowedUsers;
              break;
            }
          }
        }
      }

      // НОВИЙ СИНТАКСИС
      const expressRef = database().ref(`guilds/${storedGuildId}/express`).push();
      await expressRef.set(dataToSave);
      
      navigation.goBack();
    } catch (error) {
      // Не виводимо помилки
    }
  }, [
    allowedGB,
    levelThreshold,
    selectedDayIndex,
    selectedHour,
    selectedMinute,
    placeLimit,
    buildingId,
    scheduleTime,
    navigation,
    getFullDate
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={formValid ? handleSave : null}
          style={{ marginRight: 15, opacity: formValid ? 1 : 0.5 }}
        >
          <Ionicons name="checkmark" size={24} color="#e6e9ef" />
        </TouchableOpacity>
      )
    });
  }, [navigation, handleSave, formValid]);

  return (
    <ScrollView style={{ backgroundColor: '#0f1115' }}>
      <View style={styles.container}>
        {buildingId && !scheduleTime ? (
          <View style={styles.block}>
            {buildingInfo ? (
              <View style={styles.buildingInfoContainer}>
                <Image
                  source={{ uri: buildingInfo.buildingImage }}
                  style={styles.buildingImage}
                  resizeMode="contain"
                />
                <Text style={styles.buildingItemText}>
                  {getLocalizedValue(buildingInfo.buildingName)}
                </Text>
              </View>
            ) : (
              <Text style={styles.mutedText}>{t('gbNewExpress.loadingBuildingInfo') || "Завантаження даних..."}</Text>
            )}
          </View>
        ) : (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('gbNewExpress.selectBuilding')}</Text>
            <Dropdown
              style={styles.dropdown}
              containerStyle={styles.dropdownContainer}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              itemTextStyle={styles.dropdownItemText}
              itemContainerStyle={styles.dropdownItemContainer}
              data={buildings}
              labelField="label"
              valueField="value"
              placeholder={t('gbNewExpress.selectBuildingPlaceholder')}
              value={allowedGB}
              onChange={handleSelectGB}
              renderLeftIcon={() => {
                const selBuilding = buildings.find(b => b.value === allowedGB);
                if (selBuilding && selBuilding.image) {
                  return (
                    <Image
                      source={{ uri: selBuilding.image }}
                      style={styles.dropdownImage}
                      resizeMode="contain"
                    />
                  );
                }
                return null;
              }}
              renderRightIcon={() => (
                <FontAwesome name="chevron-down" size={12} color="#4ea1ff" />
              )}
              renderItem={(item) => (
                <View style={styles.dropdownItemContainer}>
                  {item?.image && (
                    <Image
                      source={{ uri: item.image }}
                      style={styles.dropdownImage}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={styles.dropdownItemText}>{item.label}</Text>
                </View>
              )}
            />
          </View>
        )}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t('gbNewExpress.levelThresholdLabel')}</Text>
          <Stepper
            value={parseInt(levelThreshold, 10) || 0}
            onValueChange={(val) => setLevelThreshold(val)}
            buttonSize={40}
            minValue={0}
            maxValue={200}
          />
          <Text style={styles.upgradeCostText}>
            Приблизна вартість прокачки {totalCost} СО
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t('gbNewExpress.placeLimitLabel')}</Text>
          <View style={styles.checkboxContainer}>
            {[1, 2, 3, 4, 5].map((value, index) => (
              <CustomCheckBox
                key={index}
                title={`${value}`}
                checked={placeLimit[index]}
                onPress={() => handleCheckBoxChange(index)}
              />
            ))}
          </View>
        </View>

        {!( !buildingId && scheduleTime ) && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('gbNewExpress.scheduleTime')}</Text>
            <TouchableOpacity style={styles.dateButton} onPress={openDateTimeModal}>
              <Text style={styles.dateButtonText}>
                {formatDayHourMinute()}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                    <Text style={styles.modalTitle}>{t('gbNewExpress.modalTitle')}</Text>
                    <View style={styles.wheelWrapper}>
                      <View style={styles.wheelContainer}>
                        <View style={{ width: 140, height: 180, overflow: 'hidden' }}>
                          <SimpleWheelPicker
                            data={dayOptions.map((item) => item.label)}
                            selectedIndex={tempDayIndex}
                            onValueChange={(_, idx) => setTempDayIndex(idx)}
                          />
                        </View>
                        <View style={{ width: 60, height: 180, overflow: 'hidden' }}>
                          <SimpleWheelPicker
                            data={Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))}
                            selectedIndex={tempHourIndex}
                            onValueChange={(_, idx) => setTempHourIndex(idx)}
                          />
                        </View>
                        <View style={{ width: 60, height: 180, overflow: 'hidden' }}>
                          <SimpleWheelPicker
                            data={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))}
                            selectedIndex={tempMinuteIndex}
                            onValueChange={(_, idx) => setTempMinuteIndex(idx)}
                          />
                        </View>
                      </View>
                      <View style={styles.selectionOverlay} pointerEvents="none" />
                    </View>
                    <TouchableOpacity
                      style={styles.modalButtonSave}
                      onPress={handleSaveDateTime}
                    >
                      <Text style={styles.modalButtonText}>{t('gbNewExpress.saveButton')}</Text>
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
      backgroundColor: '#0f1115',
      alignItems: 'center',
      paddingTop: 20,
    },
    block: {
      backgroundColor: '#1b1f2a',
      padding: 10,
      marginBottom: 20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#2a2f3a',
      width: '90%',
    },
    dropdown: {
      borderWidth: 1,
      backgroundColor: '#0f1115',
      padding: 10,
      borderRadius: 6,
      borderColor: '#4ea1ff',
      height: 50,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dropdownContainer: {
      borderWidth: 1,
      borderColor: '#4ea1ff',
      borderRadius: 8,
      backgroundColor: '#1b1f2a',
    },
    dropdownImage: {
      width: 30,
      height: 30,
      marginRight: 10,
    },
    dropdownItemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 5,
      backgroundColor: '#1b1f2a',
    },
    dropdownItemText: {
      fontSize: 14,
      color: '#e6e9ef',
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
    buildingItemText: {
      fontSize: 20,
      color: '#e6e9ef',
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#4ea1ff',
      borderRadius: 4,
      overflow: 'hidden',
    },
    stepButton: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#2f7de1',
    },
    stepButtonText: {
      color: '#fff',
      fontSize: 12,
    },
    valueInput: {
      textAlign: 'center',
      backgroundColor: '#0f1115',
      borderColor: '#4ea1ff',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      fontSize: 16,
      color: '#e6e9ef',
    },
    dateButton: {
      backgroundColor: '#2f7de1',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 6,
      alignItems: 'center',
    },
    dateButtonText: {
      color: '#fff',
      fontSize: 16,
    },
    upgradeCostText: {
      marginTop: 10,
      fontSize: 12,
      color: '#9aa3b2'
    },
    modalBackground: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    modalContainer: {
      backgroundColor: '#1b1f2a',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      width: '100%',
      padding: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 15,
      color: '#e6e9ef',
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
      borderColor: '#4ea1ff',
    },
    modalButtonSave: {
      backgroundColor: '#2f7de1',
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
    checkboxContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    blockLabel: {
      marginBottom: 10,
      color: '#e6e9ef',
    },
    mutedText: {
      color: '#9aa3b2',
    },
    placeholderStyle: {
      color: '#9aa3b2',
    },
    selectedTextStyle: {
      color: '#e6e9ef',
    },
  });

export default GBNewExpress;
