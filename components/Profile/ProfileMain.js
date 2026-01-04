import { Ionicons } from '@expo/vector-icons';
import { faClock, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ЕДИНСТВЕННЫЙ ПРАВИЛЬНЫЙ ИМПОРТ
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// import { database } from '../../firebaseConfig'; // УДАЛЕНО
import CustomCheckBox from '../CustomElements/CustomCheckBox3';
import GBIcon from '../ico/GB.svg';
import BoatIcon from '../ico/boat.svg';

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
        // ИЗМЕНЕНО
        await database()
          .ref(`/users/${userId}/${guildId}/culture/productionPreference`)
          .set(idx);
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
        // ИЗМЕНЕНО
        await database()
          .ref(`/users/${userId}/${guildId}/culture/cultureAlarm`)
          .set(newVal);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const listeners = [];

    const fetchInitialData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');

        if (userId) {
          const userNameRef = database().ref(`/users/${userId}/userName`);
          const onUserNameUpdate = snap => snap.exists() && setUserName(snap.val());
          userNameRef.on('value', onUserNameUpdate);
          listeners.push({ ref: userNameRef, callback: onUserNameUpdate });
        }

        if (guildId) {
          const worldNameRef = database().ref(`/guilds/${guildId}/worldName`);
          const onWorldNameUpdate = snap => snap.exists() && setActiveWorld(snap.val());
          worldNameRef.on('value', onWorldNameUpdate);
          listeners.push({ ref: worldNameRef, callback: onWorldNameUpdate });
        }
        
        if (userId && guildId) {
          // ИЗМЕНЕНО
          const cultureSnap = await database().ref(`/users/${userId}/${guildId}/culture`).once('value');
          if (cultureSnap.exists()) {
            const data = cultureSnap.val();
            if (typeof data.productionPreference === 'number' && data.productionPreference < productionTimeOptions.length) {
              setSelectedProductionTime(productionTimeOptions[data.productionPreference]);
            }
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
        // ИЗМЕНЕНО
        const snap = await database().ref(`/users/${userId}`).once('value');
        if (!snap.exists()) return;
        const data = snap.val();
        const keys = Object.keys(data).filter(k => k.includes('_'));
        const arr = await Promise.all(
          keys.map(async id => {
            const role = data[id].role;
            // ИЗМЕНЕНО
            const worldSnap = await database().ref(`/guilds/${id}/worldName`).once('value');
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

    // Функция отписки от слушателей
    return () => {
      listeners.forEach(({ ref, callback }) => ref.off('value', callback));
    };
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                  color="#3498db"
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
          <FontAwesomeIcon icon={faClock} size={20} style={{ color: '#A0A6AD', marginRight: 10 }} />
          <Text style={styles.mainText}>Розклад</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.itemRow} onPress={() => navigation.navigate('LanguageSelector')}>
          <FontAwesomeIcon icon={faGlobe} size={20} style={{ color: '#A0A6AD', marginRight: 10 }} />
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
            color="#A0A6AD"
            style={styles.marginAutoLeft}
          />
        </TouchableOpacity>
        {isCultureSettingsOpen && (
          <>
            {/* Переважний час виробництв */}
            <View style={styles.subHeaderRow}>
              <Text style={styles.mainText}>Переважний час виробництв</Text>
              <TouchableOpacity onPress={toggleProductionOpen} style={styles.marginAutoLeft}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#A0A6AD" />
              </TouchableOpacity>
            </View>
            {isProductionOpen && productionTimeOptions.map(time => (
              <TouchableOpacity
                key={time}
                style={styles.subItemRow}
                onPress={() => selectProductionTime(time)}
              >
                {selectedProductionTime === time ? (
                  <Ionicons name="checkmark-circle" size={20} color="#3498db" style={{ marginRight: 8 }} />
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
  container: { flex: 1, backgroundColor: '#121212' },
  content: { paddingBottom: 24 },
  header: {
    padding: 20,
    backgroundColor: '#1c1c1e',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userName: { fontSize: 24, color: '#E0E0E0', fontWeight: '700' },
  divider: {
    height: 1,
    backgroundColor: '#1f1f1f',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 1,
  },
  section: {
    backgroundColor: '#1e1e1e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#A0D8FF',
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  itemRowNoBorder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  mainText: { fontSize: 14, marginLeft: 8, color: '#E0E0E0' },
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  subItemRowDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 56,
    paddingVertical: 10,
    marginBottom: 12,
  },
  radioUnselected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#3498db',
    marginRight: 8,
  },
  iconSpacing: { marginRight: 10 },
  marginAutoLeft: { marginLeft: 'auto' },
});
