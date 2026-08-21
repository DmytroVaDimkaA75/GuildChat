import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { get, push, ref, set } from 'firebase/database'; // <- УДАЛЕНО
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО
import SimpleWheelPicker from '../CustomElements/SimpleWheelPicker';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

const FALLBACK_CONTRIBUTION_MULTIPLIER = 1.9;

const LevelStepper = ({ value, onDecrease, onIncrease, minValue = 0, maxValue = 200 }) => {
  const canDecrease = value > minValue;
  const canIncrease = value < maxValue;

  return (
    <View style={styles.stepperContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Зменшити кількість рівнів"
        disabled={!canDecrease}
        hitSlop={8}
        onPress={onDecrease}
        style={({ pressed }) => [
          styles.stepButton,
          !canDecrease && styles.stepButtonDisabled,
          pressed && canDecrease && styles.stepButtonPressed,
        ]}
      >
        <Text maxFontSizeMultiplier={1} style={styles.stepButtonText}>−</Text>
      </Pressable>
      <View style={styles.valueInput}>
        <Text maxFontSizeMultiplier={1} style={styles.valueText}>{value}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Збільшити кількість рівнів"
        disabled={!canIncrease}
        hitSlop={8}
        onPress={onIncrease}
        style={({ pressed }) => [
          styles.stepButton,
          !canIncrease && styles.stepButtonDisabled,
          pressed && canIncrease && styles.stepButtonPressed,
        ]}
      >
        <Text maxFontSizeMultiplier={1} style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
};

const normalizeRuleList = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);
  return [value];
};

const ruleAllows = (value, expected) => {
  const values = normalizeRuleList(value);
  return values.length === 0 || values.map(String).includes(String(expected));
};

const getMaximumAllowedMultiplier = ({ branches, ownerUserId, buildingId, currentLevel, placeNumber }) => {
  const multipliers = Object.values(branches || {}).flatMap((branch) => {
    const rules = branch?.rules || {};
    const multiplier = Number(rules.contributionMultiplier);
    const levelThreshold = Number(rules.levelThreshold) || 0;
    const matches = Number.isFinite(multiplier)
      && currentLevel >= levelThreshold
      && ruleAllows(rules.allowedGBs, buildingId)
      && ruleAllows(rules.placeLimit, placeNumber)
      && ruleAllows(rules.selectedMembers, ownerUserId);
    return matches ? [multiplier] : [];
  });
  return multipliers.length ? Math.max(...multipliers) : FALLBACK_CONTRIBUTION_MULTIPLIER;
};


const GBNewExpress = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  // Отримання buildingId та scheduleTime з route.params
  const { buildingId, scheduleTime, chatId, postpone = false, originalChatId, originalScheduleTime, selectedGbs = [] } = route.params || {};

  const getLocalizedValue = (value) => {
    if (value && typeof value === 'object') {
      return value[i18n.language] || value['uk'] || '';
    }
    return value;
  };

  const [buildings, setBuildings] = useState([]);
  const [allowedGB, setAllowedGB] = useState(null);
  const [buildingInfo, setBuildingInfo] = useState(null);
  const [levelThreshold, setLevelThreshold] = useState(5);
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
  const [currentBuildingLevel, setCurrentBuildingLevel] = useState(0);

  useEffect(() => {
    if (!postpone || !originalScheduleTime || selectedHour !== null) return;
    const suggested = new Date(Number(originalScheduleTime) + 30 * 60 * 1000);
    const index = dayOptions.findIndex((option) => option.date.toDateString() === suggested.toDateString());
    setSelectedDayIndex(index < 0 ? 0 : index);
    setSelectedHour(suggested.getHours());
    setSelectedMinute(suggested.getMinutes());
  }, [postpone, originalScheduleTime, selectedHour]);

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
    let cancelled = false;

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

          const branchesSnapshot = await database().ref(`guilds/${storedGuildId}/GBChat`).once('value');
          const branches = branchesSnapshot.val() || {};

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
                  const placeCosts = json.response.patron_bonus.map((item, index) => {
                    const placeNumber = Number(item?.rank) || index + 1;
                    const multiplier = getMaximumAllowedMultiplier({
                      branches,
                      ownerUserId: storedUserId,
                      buildingId: buildId,
                      currentLevel: K - 1,
                      placeNumber,
                    });
                    return Math.max(1, Math.round((Number(item?.forgepoints) || 0) * multiplier));
                  });
                  const sumRounded = placeCosts.reduce((sum, value) => sum + value, 0);
                  const computedCost = total_fp - sumRounded;
                  return computedCost;
                })
                .catch(error => 0)
            );
          }
          const costs = await Promise.all(levelPromises);
          S = costs.reduce((a, b) => a + b, 0);
          console.log("Загальна вартість прокачки:", S);
          if (!cancelled) setTotalCost(S);
        } catch (error) {
          // Не виводимо помилки
        }
      }
    };
    const calculationTimer = setTimeout(fetchApiAndLevelAndCalculate, 300);

    return () => {
      cancelled = true;
      clearTimeout(calculationTimer);
    };
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
          const expressSnapshot = await database().ref(`guilds/${storedGuildId}/express`).once('value');
          const activeIds = new Set();
          Object.values(expressSnapshot.val() || {}).forEach((record) => {
            if (record?.gbs) Object.values(record.gbs).forEach((gb) => activeIds.add(String(gb.allowedGB)));
            else if (record?.allowedGB) activeIds.add(String(record.allowedGB));
          });
          const postponedIds = new Set(selectedGbs.map((gb) => String(gb.allowedGB)));
          const buildingIds = Object.keys(data).filter((id) => !activeIds.has(String(id)) || postponedIds.has(String(id)));
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
          const storedGuildId = await AsyncStorage.getItem('guildId');
          const storedUserId = await AsyncStorage.getItem('userId');
          const levelSnapshot = await database()
            .ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/${buildingId}/level`)
            .once('value');
          setCurrentBuildingLevel(Number(levelSnapshot.val()) || 0);
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
      const levelSnapshot = await currentLevelRef.once('value');
      setCurrentBuildingLevel(Number(levelSnapshot.val()?.level) || 0);
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

  const getFullDate = useCallback((dayIndex, hour, minute) => {
    const base = dayOptions[dayIndex].date;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
  }, [dayOptions]);

  const handleSaveDateTime = () => {
    let newDt = getFullDate(tempDayIndex, tempHourIndex, tempMinuteIndex);
    const minDt = new Date(postpone ? Number(originalScheduleTime) + 30 * 60 * 1000 : Date.now() + 2 * 60 * 60 * 1000);
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
    const minTime = new Date(postpone ? Number(originalScheduleTime) + 30 * 60 * 1000 : Date.now() + 2 * 60 * 60 * 1000);
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

  const selectedDateLabel = selectedHour === null || !dayOptions[selectedDayIndex]
    ? t('gbNewExpress.specify')
    : dayOptions[selectedDayIndex].label;
  const selectedTimeLabel = selectedHour === null || selectedMinute === null
    ? t('gbNewExpress.setTime')
    : `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
  const selectedBuilding = buildings.find((building) => building.value === allowedGB);
  const displayedBuilding = buildingId
    ? {
        image: typeof buildingInfo?.buildingImage === 'string'
          ? buildingInfo.buildingImage
          : buildingInfo?.buildingImage?.uri,
        label: getLocalizedValue(buildingInfo?.buildingName),
      }
    : selectedBuilding;

  const formValid = (() => {
    if (postpone) {
      return selectedGbs.length > 0 && selectedHour !== null && selectedMinute !== null;
    } else if (!buildingId && scheduleTime) {
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
      const expressRootRef = database().ref(`guilds/${storedGuildId}/express`);
      if (postpone) {
        const newScheduleTime = getFullDate(selectedDayIndex, selectedHour, selectedMinute).getTime();
        const minimum = Number(originalScheduleTime) + 30 * 60 * 1000;
        if (newScheduleTime < minimum) throw new Error('Оберіть час не раніше ніж через 30 хвилин від початкового часу.');
        const originalRef = database().ref(`guilds/${storedGuildId}/express/${originalChatId}`);
        const originalSnapshot = await originalRef.once('value');
        const original = originalSnapshot.val();
        if (!original) throw new Error('Початковий експрес уже змінено.');
        const selectedIds = new Set(selectedGbs.map((gb) => String(gb.id)));
        const packageGbs = Object.fromEntries(Object.entries(original.gbs || {}).filter(([id, gb]) => selectedIds.has(String(id)) && String(gb.user) === String(userId)));
        if (!Object.keys(packageGbs).length) throw new Error('Вибрані ВС уже недоступні.');
        const newRef = expressRootRef.push();
        const updates = { [`${newRef.key}`]: { scheduleTime: newScheduleTime, gbs: packageGbs, workflow: { stage: 'open', createdAt: database.ServerValue.TIMESTAMP } } };
        Object.keys(packageGbs).forEach((id) => { updates[`${originalChatId}/gbs/${id}`] = null; });
        if (!original.workflow?.postponementNotifiedAt) {
          updates[`${originalChatId}/postponementAudience`] = original.interested || {};
          updates[`${originalChatId}/interested`] = null;
          updates[`${originalChatId}/workflow/postponementNotifiedAt`] = database.ServerValue.TIMESTAMP;
        }
        await expressRootRef.update(updates);
        navigation.goBack();
        return;
      } else if (!buildingId && scheduleTime) {
        dataToSave.allowedGB = allowedGB;
        dataToSave.scheduleTime = scheduleTime;
      } else if (buildingId && !scheduleTime) {
        dataToSave.allowedGB = buildingId;
        dataToSave.scheduleTime = getFullDate(selectedDayIndex, selectedHour, selectedMinute).getTime();
      } else {
        return;
      }
      
      // НОВИЙ СИНТАКСИС
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
      const targetKey = chatId || expressRootRef.push().key;
      const gbKey = expressRootRef.child(targetKey).child('gbs').push().key;
      let duplicate = false;
      await expressRootRef.transaction((current) => {
        current = current || {};
        duplicate = Object.values(current).some((record) => record?.gbs
          ? Object.values(record.gbs).some((gb) => String(gb.allowedGB) === String(dataToSave.allowedGB) && String(gb.user) === String(userId))
          : String(record?.allowedGB) === String(dataToSave.allowedGB) && String(record?.user) === String(userId));
        if (duplicate) return;
        current[targetKey] = current[targetKey] || { scheduleTime: dataToSave.scheduleTime, gbs: {}, workflow: { stage: 'open' } };
        current[targetKey].gbs = current[targetKey].gbs || {};
        current[targetKey].gbs[gbKey] = dataToSave;
        return current;
      });
      if (duplicate) throw new Error('Ця ВС вже має активну експрес-прокачку.');
      
      navigation.goBack();
    } catch (error) {
      Alert.alert('Помилка', error?.message || 'Не вдалося зберегти експрес.');
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
    chatId,
    postpone,
    originalChatId,
    originalScheduleTime,
    selectedGbs,
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
        {postpone && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>ВС для відтермінування</Text>
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
              {selectedGbs.map((gb, index) => (
                <View key={gb.id} style={[styles.dropdownItemContainer, index > 0 && { borderTopWidth: 1, borderTopColor: '#2d3a48' }]}>
                  {gb.image ? <Image source={{ uri: gb.image }} style={styles.dropdownImage} resizeMode="contain" /> : null}
                  <Text style={styles.dropdownItemText}>{gb.name} · {gb.levelThreshold || 0} рівнів</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.scheduleHint}>Нові дата й час будуть застосовані до всіх вибраних ВС</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ color: '#4ea1ff', marginTop: 10 }}>Змінити вибір</Text></TouchableOpacity>
          </View>
        )}
        {postpone || (buildingId && !scheduleTime) ? null : (
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

        <View style={styles.buildingCard}>
          {displayedBuilding?.image ? (
            <Image source={{ uri: displayedBuilding.image }} style={styles.buildingImage} resizeMode="contain" />
          ) : (
            <View style={styles.buildingPlaceholder}>
              <Ionicons name="business-outline" size={44} color="#4ea1ff" />
            </View>
          )}
          <View style={styles.buildingCopy}>
            <Text maxFontSizeMultiplier={1.15} style={styles.buildingItemText}>
              {displayedBuilding?.label || t('gbNewExpress.loadingBuildingInfo') || 'Виберіть ВС'}
            </Text>
            <Text maxFontSizeMultiplier={1.15} style={styles.buildingLevelText}>
              Рівень {currentBuildingLevel}
              {levelThreshold > 0 && <Text style={styles.nextLevelText}>  →  {currentBuildingLevel + levelThreshold}</Text>}
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockTitleRow}>
            <Text maxFontSizeMultiplier={1.15} style={styles.blockLabel}>Кількість рівнів</Text>
            <Ionicons name="information-circle-outline" size={20} color="#9aa3b2" />
          </View>
          <LevelStepper
            value={parseInt(levelThreshold, 10) || 0}
            onDecrease={() => setLevelThreshold((current) => Math.max(0, (Number(current) || 0) - 1))}
            onIncrease={() => setLevelThreshold((current) => Math.min(200, (Number(current) || 0) + 1))}
            minValue={0}
            maxValue={200}
          />
          <View style={styles.quickSteps}>
            {[1, 5, 10, 20].map((step) => (
              <TouchableOpacity
                key={step}
                onPress={() => setLevelThreshold((current) => Math.min(200, (Number(current) || 0) + step))}
                style={[styles.quickStep, step === 5 && styles.quickStepActive]}
              >
                <Text style={styles.quickStepText}>+{step}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.costRow}>
            <Ionicons name="wallet-outline" size={20} color="#4ea1ff" />
            <Text maxFontSizeMultiplier={1.15} style={styles.upgradeCostText}>
              Орієнтовно: <Text style={styles.costStrong}>{Number(totalCost).toLocaleString('uk-UA')} СО</Text>
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockTitleRow}>
            <Text maxFontSizeMultiplier={1.15} style={styles.blockLabel}>Місця для малюків</Text>
            <Ionicons name="information-circle-outline" size={20} color="#9aa3b2" />
          </View>
          <View style={styles.checkboxContainer}>
            {[1, 2, 3, 4, 5].map((value, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleCheckBoxChange(index)}
                style={[styles.placeButton, placeLimit[index] && styles.placeButtonActive]}
              >
                <Text style={styles.placeButtonText}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {!( !buildingId && scheduleTime ) && (
          <View style={styles.block}>
            <View style={styles.blockTitleRow}>
              <Text maxFontSizeMultiplier={1.15} style={styles.blockLabel}>Дата і час запуску</Text>
              <Ionicons name="information-circle-outline" size={20} color="#9aa3b2" />
            </View>
            <TouchableOpacity style={styles.datePanel} onPress={openDateTimeModal}>
              {selectedHour === null || selectedMinute === null ? (
                <Text maxFontSizeMultiplier={1.15} style={styles.assignTimeText}>Призначте час</Text>
              ) : (
                <View style={styles.selectedDateTime}>
                  <Ionicons name="calendar-outline" size={22} color="#b8c7dc" />
                  <Text maxFontSizeMultiplier={1.15} style={styles.selectedDateTimeText}>{selectedDateLabel}</Text>
                  <Ionicons name="time-outline" size={23} color="#b8c7dc" />
                  <Text maxFontSizeMultiplier={1.15} style={styles.selectedDateTimeText}>{selectedTimeLabel}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={21} color="#b8c7dc" />
            </TouchableOpacity>
            <Text style={styles.scheduleHint}>Експрес запускається лише за розкладом</Text>
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

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Ionicons name="stats-chart-outline" size={20} color="#4ea1ff" />
            <Text maxFontSizeMultiplier={1.15} style={styles.summaryText}>
              {levelThreshold || 0} рівнів
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="wallet-outline" size={20} color="#4ea1ff" />
            <Text maxFontSizeMultiplier={1.15} style={styles.summaryText}>≈ {Number(totalCost).toLocaleString('uk-UA')} СО</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!formValid}
          onPress={handleSave}
          style={[styles.createButton, !formValid && styles.createButtonDisabled]}
        >
          <Text maxFontSizeMultiplier={1.1} style={styles.createButtonText}>Створити експрес</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#07111b',
      alignItems: 'center',
      paddingTop: 14,
      paddingBottom: 28,
    },
    block: {
      backgroundColor: '#0d1925',
      padding: 15,
      marginBottom: 12,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: '#2d3a48',
      width: '94%',
    },
    dropdown: {
      borderWidth: 1,
      backgroundColor: '#0f1115',
      padding: 10,
      borderRadius: 10,
      borderColor: '#4ea1ff',
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dropdownContainer: {
      borderWidth: 1,
      borderColor: '#4ea1ff',
      borderRadius: 8,
      backgroundColor: '#152330',
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
      backgroundColor: '#152330',
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
      width: 120,
      height: 110,
      marginRight: 14,
    },
    buildingItemText: {
      fontSize: 18,
      fontWeight: '600',
      color: '#e6e9ef',
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      borderWidth: 1,
      borderColor: '#2d3a48',
      borderRadius: 11,
      overflow: 'hidden',
      height: 44,
    },
    stepButton: {
      width: 52,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#4ea1ff',
    },
    stepButtonPressed: { backgroundColor: '#247ae7' },
    stepButtonDisabled: { opacity: 0.45 },
    stepButtonText: {
      color: '#fff',
      fontSize: 18,
      lineHeight: 21,
    },
    valueInput: {
      flex: 1,
      height: 44,
      backgroundColor: '#091522',
      borderColor: '#2d3a48',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    valueText: { color: '#e6e9ef', fontSize: 17, lineHeight: 20, fontWeight: '700' },
    upgradeCostText: {
      fontSize: 15,
      color: '#9aa3b2'
    },
    modalBackground: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    modalContainer: {
      backgroundColor: '#152330',
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
      backgroundColor: '#4ea1ff',
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
      justifyContent: 'space-between',
      gap: 9,
    },
    blockLabel: {
      color: '#e6e9ef',
      fontSize: 17,
      fontWeight: '700',
    },
    buildingCard: {
      width: '94%',
      minHeight: 132,
      backgroundColor: '#0d1925',
      borderColor: '#2d3a48',
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      marginBottom: 12,
    },
    buildingPlaceholder: { width: 120, height: 100, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    buildingCopy: { flex: 1 },
    buildingLevelText: { color: '#93a0b3', fontSize: 15, marginTop: 8 },
    nextLevelText: { color: '#4ea1ff' },
    blockTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    quickSteps: { flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 10 },
    quickStep: { flex: 1, minHeight: 32, borderWidth: 1, borderColor: '#4ea1ff', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    quickStepActive: { backgroundColor: '#247ae7' },
    quickStepText: { color: '#e6e9ef', fontSize: 13 },
    costRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    costStrong: { color: '#2f87ff', fontWeight: '700' },
    placeButton: { flex: 1, aspectRatio: 1.25, borderRadius: 12, borderWidth: 1, borderColor: '#4ea1ff', alignItems: 'center', justifyContent: 'center' },
    placeButtonActive: { backgroundColor: '#247ae7' },
    placeButtonText: { color: '#f4f7fb', fontSize: 18, fontWeight: '600' },
    datePanel: { minHeight: 54, borderWidth: 1, borderColor: '#2d3a48', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
    assignTimeText: { flex: 1, color: '#c5cfdd', fontSize: 15 },
    selectedDateTime: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    selectedDateTimeText: { color: '#c5cfdd', fontSize: 14, marginRight: 5 },
    scheduleHint: { color: '#748298', fontSize: 12, marginTop: 9 },
    summaryCard: { width: '94%', backgroundColor: '#0d1925', borderColor: '#2d3a48', borderRadius: 14, borderWidth: 1, padding: 13, gap: 8, marginBottom: 12 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    summaryText: { color: '#aeb9ca', fontSize: 15 },
    createButton: { width: '94%', minHeight: 54, borderRadius: 11, backgroundColor: '#2783f5', alignItems: 'center', justifyContent: 'center' },
    createButtonDisabled: { opacity: 0.45 },
    createButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
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
