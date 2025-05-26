import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, onValue, get, set } from 'firebase/database';
import { database } from '../../firebaseConfig';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faClock, faGlobe } from '@fortawesome/free-solid-svg-icons';
import GBIcon from '../ico/GB.svg';
import BoatIcon from '../ico/boat.svg';
import CustomCheckBox from '../CustomElements/CustomCheckBox3';

const ProfileMain = () => {
  const [userName, setUserName] = useState('');
  const [activeWorld, setActiveWorld] = useState('');
  const [guilds, setGuilds] = useState([]);

  const [isCultureSettingsOpen, setCultureSettingsOpen] = useState(false);
  const [isProductionOpen, setProductionOpen] = useState(false);

  // Збережені налаштування
  const [selectedProductionTime, setSelectedProductionTime] = useState(null); // null = жоден
  const [notifyNextActions, setNotifyNextActions] = useState(false);

  const productionTimeOptions = ['5 хв.', '15 хв.', '1 год.', '5 год.', '10 год.', '20 год.'];
  const navigation = useNavigation();

  const convertRole = (role) => {
    switch (role) {
      case 'guildLeader': return 'Адміністратор';
      case 'member': return 'Користувач';
      default: return role;
    }
  };

  // toggles
  const toggleCultureSettings = () => setCultureSettingsOpen(prev => !prev);
  const toggleProductionOpen = () => setProductionOpen(prev => !prev);

  // Обробники взаємодії
  const selectProductionTime = async (time) => {
    const idx = productionTimeOptions.indexOf(time);
    setSelectedProductionTime(time);
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (userId && guildId) {
        await set(ref(database, `/users/${userId}/${guildId}/culture/productionPreference`), idx);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCultureAlarm = async () => {
    const newVal = !notifyNextActions;
    setNotifyNextActions(newVal);
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (userId && guildId) {
        await set(ref(database, `/users/${userId}/${guildId}/culture/cultureAlarm`), newVal);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (userId) {
          onValue(ref(database, `/users/${userId}/userName`), snap => snap.val() && setUserName(snap.val()));
        }
        if (guildId) {
          onValue(ref(database, `/guilds/${guildId}/worldName`), snap => snap.val() && setActiveWorld(snap.val()));
        }
        // Завантаження culture налаштувань
        if (userId && guildId) {
          const cultureSnap = await get(ref(database, `/users/${userId}/${guildId}/culture`));
          if (cultureSnap.exists()) {
            const data = cultureSnap.val();
            // Заповнюємо productionPreference
            if (typeof data.productionPreference === 'number' && data.productionPreference < productionTimeOptions.length) {
              setSelectedProductionTime(productionTimeOptions[data.productionPreference]);
            }
            // Заповнюємо cultureAlarm
            if (typeof data.cultureAlarm === 'boolean') {
              setNotifyNextActions(data.cultureAlarm);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    const fetchGuilds = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!userId) return;
        const snap = await get(ref(database, `/users/${userId}`));
        if (!snap.exists()) return;
        const data = snap.val();
        const keys = Object.keys(data).filter(k => k.includes('_'));
        const arr = await Promise.all(
          keys.map(async id => {
            const role = data[id].role;
            const worldSnap = await get(ref(database, `/guilds/${id}/worldName`));
            return { guildId: id, role, worldName: worldSnap.val() || 'Не знайдено' };
          })
        );
        setGuilds(arr);
      } catch (e) {
        console.error(e);
      }
    };

    fetchInitialData();
    fetchGuilds();
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.userName}>{userName}</Text>
      </View>

      {/* Ігрові світи */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ігрові світи</Text>
        {guilds.length ? (
          guilds.map(g => (
            <View key={g.guildId} style={styles.itemRowNoBorder}>
              <View style={styles.rowContent}>
                <Text style={styles.mainText}>{g.worldName}</Text>
                {g.worldName === activeWorld && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#0088cc"
                    style={styles.iconSpacing}
                  />
                )}
              </View>
              <Text style={styles.mainText}>{convertRole(g.role)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.mainText}>Дані не знайдено</Text>
        )}
      </View>

      <View style={styles.divider} />

      {/* Про себе */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Про себе</Text>
        <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('ProfileData')}>
          <Text style={styles.mainText}>Я користувач</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Налаштування додатку */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Налаштування додатку</Text>
        <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('AddSchedule')}>
          <FontAwesomeIcon icon={faClock} size={20} style={{ color: '#BDBDBD', marginRight: 8 }} />
          <Text style={styles.mainText}>Розклад</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('LanguageSelector')}>
          <FontAwesomeIcon icon={faGlobe} size={20} style={{ color: '#BDBDBD', marginRight: 8 }} />
          <Text style={styles.mainText}>Мова</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Налаштування світу */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Налаштування світу</Text>
        <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('MyGB')}>
          <GBIcon width={20} height={20} style={styles.iconSpacing} />
          <Text style={styles.mainText}>Налаштування ВС</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.itemRow} onPress={toggleCultureSettings}>
          <BoatIcon width={20} height={20} style={styles.iconSpacing} />
          <Text style={styles.mainText}>Налаштування культурних поселень</Text>
          <Ionicons
            name={isCultureSettingsOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#BDBDBD"
            style={styles.marginAutoLeft}
          />
        </TouchableOpacity>
        {isCultureSettingsOpen && (
          <>
            {/* Переважний час виробництв */}
            <View style={styles.subHeaderRow}>
              <Text style={styles.mainText}>Переважний час виробництв</Text>
              <TouchableOpacity onPress={toggleProductionOpen} style={styles.marginAutoLeft}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#BDBDBD" />
              </TouchableOpacity>
            </View>
            {isProductionOpen && productionTimeOptions.map(time => (
              <TouchableOpacity
                key={time}
                style={styles.subItemRow}
                onPress={() => selectProductionTime(time)}
              >
                {selectedProductionTime === time ? (
                  <Ionicons name="checkmark-circle" size={20} color="#0088cc" style={{ marginRight: 8 }} />
                ) : (
                  <View style={styles.radioUnselected} />
                )}
                <Text style={styles.mainText}>{time}</Text>
              </TouchableOpacity>
            ))}
            {/* Сигналізувати про наступні дії */}
            <View style={styles.subItemRowDisabled}>
              <Text style={styles.mainText}>Сигналізувати про наступні дії</Text>
              <CustomCheckBox
                checked={notifyNextActions}
                onPress={toggleCultureAlarm}
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};

export default ProfileMain;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    backgroundColor: '#517da2',
  },
  userName: {
    fontSize: 24,
    color: '#fff',
  },
  divider: {
    height: 8,
    backgroundColor: '#e0e0e0',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0088cc',
    marginVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  itemRowNoBorder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainText: {
    fontSize: 14,
    marginLeft: 8,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 56,
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 56,
    paddingVertical: 8,
  },
  subItemRowDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 56,
    paddingVertical: 8,
    marginBottom: 16,
  },
  radioUnselected: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0088cc',
    marginRight: 8,
  },
  iconSpacing: {
    marginRight: 8,
  },
  marginAutoLeft: {
    marginLeft: 'auto',
  },
});
