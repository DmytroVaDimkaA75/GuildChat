import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MultiSelect } from 'react-native-element-dropdown';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import database from '@react-native-firebase/database';
import CustomCheckBox from '../CustomElements/CustomCheckBox3';

const NewGBChat = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();

  // Додаємо стейт для режиму редагування
  const [isEditMode, setIsEditMode] = useState(false);
  const [editBranchId, setEditBranchId] = useState(null);

  // Додаємо стейт для назви чату
  const [chatName, setChatName] = useState('');
  const [arcLevel, setArcLevel] = useState(0);
  const [levelThreshold, setLevelThreshold] = useState('');
  const [allowedGBs, setAllowedGBs] = useState([]);
  const [placeLimit, setPlaceLimit] = useState([false, false, false, false, false]);
  const [greatBuildings, setGreatBuildings] = useState([]);
  const [guildMembers, setGuildMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [contributionMultiplier, setContributionMultiplier] = useState(1);
  const [stepperWidth, setStepperWidth] = useState(200);

  // Функція для локалізації значення, якщо воно є об'єктом
  const getLocalizedValue = (value) => {
    if (value && typeof value === 'object') {
      return value[i18n.language] || value['uk'] || '';
    }
    return value;
  };

  useEffect(() => {
    // Отримання Великих Споруд
    const buildingsRef = database().ref('greatBuildings');
    const handleBuildings = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const seenKeys = new Set();
        const buildingsArray = Object.keys(data)
          .map((key) => ({
            label: getLocalizedValue(data[key].buildingName), // локалізуємо назву
            value: key,
            image: data[key].buildingImage,
          }))
          .filter((item) => {
            if (seenKeys.has(item.value)) return false;
            seenKeys.add(item.value);
            return true;
          });
        // Додаємо опцію "Обрати все" на початок списку
        buildingsArray.unshift({ label: t('newGBChat.selectAllOption'), value: 'selectAll', image: null });
        setGreatBuildings(buildingsArray);
      }
    };
    buildingsRef.on('value', handleBuildings);

    // Отримання учасників гільдії
    let membersRef;
    let handleMembers;
    const fetchGuildMembers = async () => {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) {
        console.error(t('newGBChat.guildIdNotFound'));
        return;
      }
      console.log('Guild ID:', guildId);
      membersRef = database().ref(`guilds/${guildId}/guildUsers`);
      handleMembers = (snapshot) => {
        const data = snapshot.val();
        console.log('Дані з guildUsers:', data);
        if (data) {
          const membersArray = Object.keys(data).map((key) => ({
            label: data[key].imageUrl, // URL аватара
            name: data[key].userName,
            userId: key,
          }));
          console.log('membersArray:', membersArray);
          setGuildMembers(membersArray);
        } else {
          console.warn(t('newGBChat.noGuildUsers'));
        }
      };
      membersRef.on('value', handleMembers);
    };

    fetchGuildMembers();

    return () => {
      buildingsRef.off('value', handleBuildings);
      if (membersRef && handleMembers) {
        membersRef.off('value', handleMembers);
      }
    };
  }, [t]);

  useEffect(() => {
    // Якщо передано editBranch через route.params, підвантажуємо дані для редагування
    if (route.params?.editBranch) {
      const { id } = route.params.editBranch;
      setIsEditMode(true);
      setEditBranchId(id);

      // Підвантажуємо дані гілки з БД
      (async () => {
        const guildId = await AsyncStorage.getItem('guildId');
        if (!guildId) return;
        const branchRef = database().ref(`guilds/${guildId}/GBChat/${id}`);
        const snap = await branchRef.once('value');
        if (snap.exists()) {
          const data = snap.val();
          setChatName(data.name || '');
          setArcLevel(Number(data.rules?.ArcLevel) || 0);
          setLevelThreshold(data.rules?.levelThreshold?.toString() || '');
          setAllowedGBs(data.rules?.allowedGBs || []);
          setPlaceLimit([1,2,3,4,5].map(i => (data.rules?.placeLimit || []).includes(i)));
          setSelectedMembers(data.rules?.selectedMembers || []);
          setContributionMultiplier(
            Math.min(2, Math.max(1, Number(data.rules?.contributionMultiplier) || 1))
          );
        }
      })();
    } else {
      setIsEditMode(false);
      setEditBranchId(null);
      setChatName('');
      setArcLevel(0);
      setLevelThreshold('');
      setAllowedGBs([]);
      setPlaceLimit([false, false, false, false, false]);
      setSelectedMembers([]);
      setContributionMultiplier(1);
    }
   
  }, [route.params?.editBranch]);

  const handleSelectAll = (items) => {
    if (items.includes('selectAll')) {
      const allBuildingValues = greatBuildings
        .filter((item) => item.value !== 'selectAll')
        .map((item) => item.value);
      setAllowedGBs(allBuildingValues);
    } else {
      setAllowedGBs(items);
    }
  };

  const handleCheckBoxChange = (index) => {
    const newPlaceLimit = [...placeLimit];
    newPlaceLimit[index] = !newPlaceLimit[index];
    setPlaceLimit(newPlaceLimit);
  };

  const handleCreateChat = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');

      const selectedPlaceLimits = placeLimit
        .map((selected, index) => (selected ? index + 1 : null))
        .filter((value) => value !== null);

      const newChat = {
        name: chatName,
        rules: {
          ArcLevel: arcLevel,
          levelThreshold: parseInt(levelThreshold, 10) || 0,
          allowedGBs,
          placeLimit: selectedPlaceLimits,
          contributionMultiplier: Number(Number(contributionMultiplier).toFixed(2)),
          selectedMembers,
        },
        createdBy: userId || null,
      };

      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) {
        console.error(t('newGBChat.guildIdNotFound'));
        return;
      }

      if (isEditMode && editBranchId) {
        // Оновлення існуючої гілки
        await database().ref(`guilds/${guildId}/GBChat/${editBranchId}`).update(newChat);
      } else {
        // Створення нового чату
        await database().ref(`guilds/${guildId}/GBChat`).push(newChat);
      }

      if (route.params?.from === 'AdminMain') {
        const parentNavigation = navigation.getParent();
        if (parentNavigation) {
          parentNavigation.navigate('admin', { screen: 'AdminScreen' });
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        }
      } else if (route.params?.from === 'GBChatList') {
        navigation.navigate('GBScreen');
      } else if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('GBScreen');
      }
    } catch (error) {
      console.error(isEditMode ? t('newGBChat.updateChatError') : t('newGBChat.createChatError'), error);
    }
  };

  // Компонент Stepper для зміни числових значень
  const Stepper = ({
    value,
    onValueChange,
    buttonSize = 20,
    minValue = 0,
    maxValue = 200,
    step = 1,
    precision = 0,
  }) => {
    const inputWidth = stepperWidth - buttonSize * 2;
    const formatValue = (nextValue) => Number(nextValue).toFixed(precision);
    const [inputValue, setInputValue] = useState(formatValue(value));

    const handleIncrement = () => {
      const newValue = Number(Math.min(Number(value) + step, maxValue).toFixed(precision));
      onValueChange(newValue);
      setInputValue(formatValue(newValue));
    };

    const handleDecrement = () => {
      const newValue = Number(Math.max(Number(value) - step, minValue).toFixed(precision));
      onValueChange(newValue);
      setInputValue(formatValue(newValue));
    };

    const handleInputChange = (text) => {
      const pattern = precision > 0 ? /^\d*(?:[.,]\d{0,2})?$/ : /^\d*$/;
      if (pattern.test(text)) {
        setInputValue(text);
      }
    };

    const handleEndEditing = () => {
      let newValue = Number(inputValue.replace(',', '.'));
      if (!Number.isFinite(newValue)) {
        newValue = minValue;
      }
      newValue = Number(Math.min(maxValue, Math.max(minValue, newValue)).toFixed(precision));
      onValueChange(newValue);
      setInputValue(formatValue(newValue));
    };

    return (
      <View
        style={styles.stepperContainer}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setStepperWidth(width);
        }}
      >
        <TouchableOpacity onPress={handleDecrement} style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}>
          <Text style={styles.stepButtonText}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.valueInput, { width: inputWidth, height: buttonSize }]}
          keyboardType={precision > 0 ? 'decimal-pad' : 'numeric'}
          value={inputValue}
          onChangeText={handleInputChange}
          onEndEditing={handleEndEditing}
          maxLength={precision > 0 ? String(maxValue).length + precision + 1 : String(maxValue).length}
        />
        <TouchableOpacity onPress={handleIncrement} style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}>
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Перевірка, чи кнопка має бути активною
  const isCreateDisabled = !chatName.trim();

  return (
    <ScrollView contentContainerStyle={{ padding: 20, backgroundColor: '#0f1115' }}>
      {/* Блок для введення назви чату */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.chatNameLabel') || 'Назва чату'}</Text>
        <TextInput
          style={styles.chatNameInput}
          value={chatName}
          onChangeText={setChatName}
          placeholder={t('newGBChat.chatNamePlaceholder') || 'Введіть назву чату'}
          placeholderTextColor="#9aa3b2"
        />
      </View>

      {/* Блок для коефіцієнта внеску */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.contributionRatioLabel')}</Text>
        <Stepper
          value={contributionMultiplier}
          onValueChange={setContributionMultiplier}
          buttonSize={40}
          minValue={1}
          maxValue={2}
          step={0.01}
          precision={2}
        />
      </View>

      {/* Блок для вибору дозволених ВС */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.allowedGBsLabel')}</Text>
        <MultiSelect
          style={styles.dropdown}
          containerStyle={styles.dropdownContainer}
          placeholderStyle={styles.placeholderStyle}
          selectedTextStyle={styles.selectedTextStyle}
          itemTextStyle={styles.itemText}
          itemContainerStyle={styles.dropdownItemContainer}
          data={greatBuildings}
          activeColor="#152330"
          labelField="label"
          valueField="value"
          placeholder={t('newGBChat.selectGBPlaceholder')}
          value={allowedGBs}
          onChange={handleSelectAll}
          multiple={true}
          renderItem={(item) => (
            <View style={styles.itemContainer}>
              {item?.image && (
                <Image
                  source={{ uri: item.image }}
                  style={styles.buildingImage}
                  resizeMode="contain"
                />
              )}
              <Text style={styles.itemText}>{item?.label}</Text>
              {allowedGBs.includes(item?.value) && (
                <FontAwesome name="check" size={16} color="#4ea1ff" style={{ marginLeft: 'auto' }} />
              )}
            </View>
          )}
          renderRightIcon={() => <FontAwesome name="chevron-down" size={12} color="#4ea1ff" />}
        />
      </View>

      {/* Блок для мінімального рівня ВС */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.levelThresholdLabel')}</Text>
        <Stepper
          value={parseInt(levelThreshold, 10) || 0}
          onValueChange={(value) => setLevelThreshold(value)}
          buttonSize={40}
          minValue={0}
          maxValue={200}
        />
      </View>

      {/* Блок для вибору учасників гільдії */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.guildMembersLabel')}</Text>
        <MultiSelect
          style={styles.dropdown}
          containerStyle={styles.dropdownContainer}
          placeholderStyle={styles.placeholderStyle}
          selectedTextStyle={styles.selectedTextStyle}
          itemTextStyle={styles.itemText}
          itemContainerStyle={styles.dropdownItemContainer}
          data={guildMembers}
          activeColor="#152330"
          labelField="name"
          valueField="userId"
          placeholder={t('newGBChat.selectMembersPlaceholder')}
          value={selectedMembers}
          onChange={(items) => setSelectedMembers(items)}
          multiple={true}
          renderItem={(item) => (
            <View style={styles.itemContainer}>
              <Image
                source={{ uri: item.label }}
                style={styles.memberImage}
                resizeMode="contain"
              />
              <Text style={styles.itemText}>{item.name}</Text>
              {selectedMembers.includes(item.userId) && (
                <FontAwesome name="check" size={16} color="#4ea1ff" style={{ marginLeft: 'auto' }} />
              )}
            </View>
          )}
          renderRightIcon={() => <FontAwesome name="chevron-down" size={12} color="#4ea1ff" />}
        />
      </View>

      {/* Блок для обмеження місць */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.placeLimitLabel')}</Text>
        <View style={styles.checkboxContainer}>
          {[1, 2, 3, 4, 5].map((value, index) => (
            <CustomCheckBox
              key={index}
              title={`${value}`}
              titleStyle={styles.checkboxLabel}
              checked={placeLimit[index]}
              onPress={() => handleCheckBoxChange(index)}
            />
          ))}
        </View>
      </View>

      {/* Кнопка для створення нового чату */}
      <TouchableOpacity
        style={[
          styles.createButton,
          isCreateDisabled && styles.createButtonDisabled
        ]}
        onPress={handleCreateChat}
        disabled={isCreateDisabled}
      >
        <Text style={styles.createButtonText}>
          {isEditMode ? t('newGBChat.updateChatButton') || 'Оновити' : t('newGBChat.createChatButton')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#152330',
    padding: 10,
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1b2b3b',
  },
  dropdown: {
    borderWidth: 1,
    backgroundColor: '#0f1115',
    padding: 10,
    borderRadius: 6,
    borderColor: '#4ea1ff',
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#4ea1ff',
    borderRadius: 8,
    backgroundColor: '#152330',
  },
  checkboxContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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
    backgroundColor: '#4ea1ff',
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
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
  },
  dropdownItemContainer: {
    backgroundColor: '#152330',
  },
  buildingImage: {
    width: 30,
    height: 30,
    marginRight: 10,
  },
  memberImage: {
    width: 30,
    height: 30,
    marginRight: 10,
    borderRadius: 15,
  },
  itemText: {
    fontSize: 14,
    color: '#e6e9ef',
  },
  createButton: {
    backgroundColor: '#4ea1ff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 10,
  },
  createButtonDisabled: {
    backgroundColor: '#36516a',
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  chatNameInput: {
    borderWidth: 1,
    borderColor: '#4ea1ff',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#0f1115',
    fontSize: 16,
    marginBottom: 5,
    color: '#e6e9ef',
  },
  blockLabel: {
    marginBottom: 10,
    color: '#e6e9ef',
  },
  checkboxLabel: { color: '#e6e9ef' },
  placeholderStyle: {
    color: '#9aa3b2',
  },
  selectedTextStyle: {
    color: '#e6e9ef',
  },
});

export default NewGBChat;
