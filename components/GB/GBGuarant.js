import AsyncStorage from '@react-native-async-storage/async-storage';
// import { get, ref, set, update } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { v4 as uuidv4 } from 'uuid';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО
import GBPatrons from './GBPatrons';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';


const Stepper = ({ value, onValueChange, buttonSize = 14, minValue = 0, maxValue }) => {
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

  const handleInputChange = text => {
    if (/^\d*$/.test(text)) {
      setInputValue(text);
    }
  };

  const handleEndEditing = () => {
    let newValue = parseInt(inputValue, 10);
    if (isNaN(newValue)) newValue = minValue;
    else if (newValue > maxValue) newValue = maxValue;
    else if (newValue < minValue) newValue = minValue;
    onValueChange(newValue);
    setInputValue(String(newValue));
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
        style={[styles.valueInput, { width: 75, height: 28 }]}
        keyboardType="numeric"
        value={inputValue}
        onChangeText={handleInputChange}
        onEndEditing={handleEndEditing}
        maxLength={String(maxValue).length}
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

const GBGuarant = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { buildingName, buildingId, buildingImage } = route.params;

  const [buildingLevel, setBuildingLevel] = useState(null);
  const [levelBase, setLevelBase] = useState(null);
  const [stepValue, setStepValue] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [contributionAmount, setContributionAmount] = useState('');
  const [selectedValue, setSelectedValue] = useState(null);

  // нові стани
  const [guildMembers, setGuildMembers] = useState([]);
  const [patronsKey, setPatronsKey] = useState(0);
  const [buildAPI, setBuildAPI] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -10 }}>
          <Text style={styles.headerText}>{buildingName}</Text>
        </View>
      ),
    });
  }, [navigation, buildingName]);

  useEffect(() => {
    const fetchBuildingData = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId = await AsyncStorage.getItem('userId');
        if (!guildId || !userId) return;

        // НОВИЙ СИНТАКСИС
        const lvlRef = database().ref(
          `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/level`
        );
        const baseRef = database().ref(`greatBuildings/${buildingId}/levelBase`);
        const investRef = database().ref(
          `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/investment`
        );

        const [lvlSnap, baseSnap, invSnap] = await Promise.all([
          lvlRef.once('value'),
          baseRef.once('value'),
          investRef.once('value'),
        ]);

        if (lvlSnap.exists()) setBuildingLevel(lvlSnap.val());
        else setBuildingLevel(t('gbScreen.levelNotFound') || 'Рівень не знайдено');

        if (baseSnap.exists()) setLevelBase(baseSnap.val());
        else setLevelBase(t('gbScreen.levelBaseNotFound') || 'levelBase не знайдено');

        if (lvlSnap.exists() && baseSnap.exists()) {
          const lvl = lvlSnap.val();
          const base = baseSnap.val();
          setBuildAPI(`${base}${lvl + 1}`);
        }

        const personal = invSnap.exists() && invSnap.val().personal
          ? parseInt(invSnap.val().personal, 10)
          : 0;
        setStepValue(personal);
      } catch (err) {
        console.error(t('gbScreen.loadUserDataError'), err);
      }
    };
    fetchBuildingData();
  }, [buildingId, t]);

  const fetchGuildMembers = async () => {
    try {
        const guildId = await AsyncStorage.getItem('guildId');
        const currentUserId = await AsyncStorage.getItem('userId');
        if (!guildId || !currentUserId) return;

        // НОВИЙ СИНТАКСИС
        const patronsSnap = await database()
            .ref(`guilds/${guildId}/guildUsers/${currentUserId}/greatBuild/${buildingId}/investment/patrons`)
            .once('value');

        const investedIds = patronsSnap.exists()
            ? Object.values(patronsSnap.val()).map(p => p.patron)
            : [];
        
        // НОВИЙ СИНТАКСИС
        const usersSnap = await database().ref(`guilds/${guildId}/guildUsers`).once('value');
        const members = [];
        if (usersSnap.exists()) {
            usersSnap.forEach(u => {
                const id = u.key;
                const { userName, imageUrl } = u.val();
                if (id === currentUserId || investedIds.includes(id)) return;
                members.push({ label: userName, value: id, imageUrl: imageUrl || null });
            });
        }
        setGuildMembers(members);
    } catch (err) {
        console.error('Помилка завантаження співгільдійців:', err);
    }
  };

  useEffect(() => {
    if (modalVisible) {
      setSelectedValue(null);
      setContributionAmount('');
      fetchGuildMembers();
    }
  }, [modalVisible]);

  const handleSaveContributor = async () => {
    if (!selectedValue || !contributionAmount) {
      alert(t('gbGuarant.fillAllFields'));
      return;
    }
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) return;

      const patronId = uuidv4();
      // НОВИЙ СИНТАКСИС
      const patronRef = database().ref(
        `guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/investment/patrons/${patronId}`
      );
      const data = {
        patron: selectedValue,
        invest: contributionAmount,
        timestamp: Date.now(),
      };
      await patronRef.set(data);
      console.log('Вкладник збережений:', data);
      setPatronsKey(k => k + 1);
      setModalVisible(false);
    } catch (err) {
      console.error('Помилка при збереженні вкладника:', err);
    }
  };

  const updateInvestmentInFirebase = async newValue => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');
      if (!guildId || !userId) return;

      // НОВИЙ СИНТАКСИС
      await database()
        .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${buildingId}/investment`)
        .update({ personal: newValue });

      console.log('Інвестиція оновлена:', newValue);
    } catch (err) {
      console.error('Помилка оновлення інвестиції:', err);
    }
  };

  const handleValueChange = val => {
    setStepValue(val);
    updateInvestmentInFirebase(val);
  };

  const nextLevel =
    typeof buildingLevel === 'number' ? buildingLevel + 1 : null;
  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={styles.container}>
      <View style={styles.imageLevelContainer}>
        <View style={styles.imageContainer}>
          {buildingImage && (
            <Image source={{ uri: buildingImage }} style={styles.buildingImage} />
          )}
        </View>
        <View style={styles.levelContainer}>
          <View style={styles.levelLabel}>
            <Text style={styles.levelText}>{t('gbGuarant.levelLabel')}</Text>
          </View>
          <View style={styles.levelValue}>
            <Text style={styles.levelText}>
              {buildingLevel !== null
                ? `${buildingLevel} → ${nextLevel}`
                : '...'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.additionalTextContainer}>
        <View style={styles.contributionContainer}>
          <Text style={styles.contributionText}>
            {t('gbGuarant.myContribution')}
          </Text>
        </View>
        <Stepper
          value={stepValue}
          onValueChange={handleValueChange}
          buttonSize={28}
          minValue={0}
          maxValue={200000}
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.addButton, { width: screenWidth * 0.8 }]}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>
            {t('gbGuarant.addContributorButton')}
          </Text>
        </TouchableOpacity>
      </View>

      <GBPatrons
        key={patronsKey}
        buildId={buildingId}
        level={buildingLevel}
        buildAPI={buildAPI}
        personalContribution={stepValue}
      />

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('gbGuarant.contributorModalTitle')}
            </Text>

            <Dropdown
              style={styles.dropdown}
              containerStyle={styles.dropdownContainer}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              data={[
                { label: t('gbGuarant.optionStranger'), value: 'stranger' },
                { label: t('gbGuarant.optionFriend'), value: 'friend' },
                { label: '---', value: null, separator: true },
                ...guildMembers,
              ]}
              labelField="label"
              valueField="value"
              value={selectedValue}
              onChange={item => setSelectedValue(item.value)}
              renderRightIcon={() => (
                <FontAwesome name="chevron-down" size={14} color="#4ea1ff" />
              )}
              placeholder={t('gbGuarant.selectContributorPlaceholder')}
              renderItem={item =>
                item.separator ? (
                  <View style={styles.separator}>
                    <Text style={styles.separatorText}>---</Text>
                  </View>
                ) : (
                  <View style={styles.item}>
                    {item.imageUrl && (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.memberAvatar}
                      />
                    )}
                    <Text style={styles.itemText}>{item.label}</Text>
                  </View>
                )
              }
            />

            <Text style={styles.modalTitle}>
              {t('gbGuarant.contributionAmountTitle')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('gbGuarant.contributionAmountPlaceholder')}
              placeholderTextColor="#9aa3b2"
              value={contributionAmount}
              onChangeText={setContributionAmount}
              keyboardType="numeric"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveContributor}
              >
                <Text style={styles.saveButtonText}>
                  {t('gbGuarant.saveButton')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>
                  {t('gbGuarant.cancelButton')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f1115',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e6e9ef',
  },
    imageLevelContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  imageContainer: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: '#0f1115',
    borderWidth: 1,
    borderColor: '#2a2f3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
    buildingImage: {
      width: 100,
      height: 100,
      borderRadius: 15,
      resizeMode: 'contain',
    },
    levelContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  levelLabel: {
    marginBottom: 5,
    color: '#9aa3b2',
  },
    levelValue: {
      padding: 5,
      borderRadius: 5,
    },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e6e9ef',
  },
    additionalTextContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    contributionContainer: {
      flex: 1,
      justifyContent: 'center',
    },
  contributionText: {
    fontSize: 16,
    color: '#9aa3b2',
  },
    buttonContainer: {
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
  addButton: {
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: '#2f7de1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
    addButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
    },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#1b1f2a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#e6e9ef',
  },
  input: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderColor: '#4ea1ff',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#0f1115',
    color: '#e6e9ef',
  },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
    },
  saveButton: {
    backgroundColor: '#2f7de1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
    saveButtonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
  cancelButton: {
    backgroundColor: '#3a3f4a',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
    cancelButtonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
  dropdown: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderColor: '#4ea1ff',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#0f1115',
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#4ea1ff',
    borderRadius: 8,
    backgroundColor: '#1b1f2a',
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
    backgroundColor: '#2f7de1',
    justifyContent: 'center',
    alignItems: 'center',
  },
    stepButtonText: {
      fontSize: 16,
      color: '#fff',
    },
  valueInput: {
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 5,
    backgroundColor: '#0f1115',
    color: '#e6e9ef',
  },
  separator: {
    height: 10,
    backgroundColor: '#2a2f3a',
    alignItems: 'center',
  },
  separatorText: {
    color: '#9aa3b2',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#1b1f2a',
  },
  itemText: {
    color: '#e6e9ef',
  },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  placeholderStyle: {
    color: '#9aa3b2',
  },
  selectedTextStyle: {
    color: '#e6e9ef',
  },
});
  
export default GBGuarant;
