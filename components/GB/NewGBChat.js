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
  const [nodeRatio, setNodeRatio] = useState('');
  const [levelThreshold, setLevelThreshold] = useState('');
  const [allowedGBs, setAllowedGBs] = useState([]);
  const [placeLimit, setPlaceLimit] = useState([false, false, false, false, false]);
  const [greatBuildings, setGreatBuildings] = useState([]);
  const [guildMembers, setGuildMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [contributionMultiplier, setContributionMultiplier] = useState(0);
  const [stepperWidth, setStepperWidth] = useState(200);
  const [coefficientText, setCoefficientText] = useState(t('newGBChat.contributionRatioLabel'));

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
          setNodeRatio(data.rules?.ArcLevel?.toString() || '');
          setLevelThreshold(data.rules?.levelThreshold?.toString() || '');
          setAllowedGBs(data.rules?.allowedGBs || []);
          setPlaceLimit([1,2,3,4,5].map(i => (data.rules?.placeLimit || []).includes(i)));
          setSelectedMembers(data.rules?.selectedMembers || []);
          setContributionMultiplier(data.rules?.contributionMultiplier || 0);
        }
      })();
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

  const fetchContributionBoost = async (level) => {
    if (level === 0) {
      setCoefficientText(t('newGBChat.contributionRatioLabel'));
      setContributionMultiplier(0);
      return;
    }
    try {
      const response = await fetch(`https://api.foe-helper.com/v1/LegendaryBuilding/get?id=X_FutureEra_Landmark1&level=${level}`);
      const data = await response.json();
      const contributionBoost = data.response.rewards.contribution_boost;
      const coefficient = contributionBoost / 100 + 1;
      setCoefficientText(t('newGBChat.contributionRatioLabelWithCoefficient', { coefficient: coefficient.toFixed(3) }));
      setContributionMultiplier(coefficient);
    } catch (error) {
      console.error(t('newGBChat.fetchContributionError'), error);
    }
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
          ArcLevel: parseFloat(nodeRatio) || 0,
          levelThreshold: parseInt(levelThreshold, 10) || 0,
          allowedGBs,
          placeLimit: selectedPlaceLimits,
          contributionMultiplier: contributionMultiplier || 0,
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

      // Повертаємося до попереднього екрану (звідки відкривали)
      if (route.params?.from === 'AdminMain') {
        navigation.navigate('AdminScreen');
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
  const Stepper = ({ value, onValueChange, buttonSize = 20, minValue = 0, maxValue = 200 }) => {
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
        <TouchableOpacity onPress={handleDecrement} style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}>
          <Text style={styles.stepButtonText}>-</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.valueInput, { width: inputWidth, height: buttonSize }]}
          keyboardType="numeric"
          value={inputValue}
          onChangeText={handleInputChange}
          onEndEditing={handleEndEditing}
          maxLength={String(maxValue).length}
        />
        <TouchableOpacity onPress={handleIncrement} style={[styles.stepButton, { width: buttonSize, height: buttonSize }]}>
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Перевірка, чи кнопка має бути активною
  const isCreateDisabled = !chatName.trim() || !nodeRatio || Number(nodeRatio) === 0;

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

      {/* Блок для коефіцієнта внеску (nodeRatio) */}
      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('newGBChat.contributionRatioLabel')}</Text>
        <Text style={styles.blockSubtle}>{coefficientText}</Text>
        <Stepper
          value={parseInt(nodeRatio, 10) || 0}
          onValueChange={(value) => {
            setNodeRatio(value);
            fetchContributionBoost(value);
          }}
          buttonSize={40}
          minValue={0}
          maxValue={200}
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
    backgroundColor: '#1b1f2a',
    padding: 10,
    marginBottom: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2f3a',
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
    backgroundColor: '#1b1f2a',
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
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
  },
  dropdownItemContainer: {
    backgroundColor: '#1b1f2a',
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
    backgroundColor: '#2f7de1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 10,
  },
  createButtonDisabled: {
    backgroundColor: '#3a3f4a',
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
  blockSubtle: {
    marginBottom: 10,
    color: '#9aa3b2',
  },
  placeholderStyle: {
    color: '#9aa3b2',
  },
  selectedTextStyle: {
    color: '#e6e9ef',
  },
});

export default NewGBChat;
