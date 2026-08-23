import { Ionicons } from '@expo/vector-icons';
import { faClock, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database'; // ЕДИНСТВЕННЫЙ ПРАВИЛЬНЫЙ ИМПОРТ
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// import { database } from '../../firebaseConfig'; // УДАЛЕНО
import { getUkrainianRoleLabel } from '../../constants/roles';

const ProfileMain = () => {
  const [userName, setUserName] = useState('');
  const [activeWorld, setActiveWorld] = useState('');
  const [guilds, setGuilds] = useState([]);

  const navigation = useNavigation();

  const convertRole = getUkrainianRoleLabel;

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
        const userGuilds = data.userGuilds || {};
        const keys = Object.keys(userGuilds);
        const arr = await Promise.all(
          keys.map(async id => {
            const role = userGuilds[id].role;
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
                  color="#4ea1ff"
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
    </ScrollView>
  );
};

export default ProfileMain;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115' },
  content: { paddingBottom: 24 },
  header: {
    padding: 20,
    backgroundColor: '#152330',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userName: { fontSize: 24, color: '#f4f7fb', fontWeight: '700' },
  divider: {
    height: 1,
    backgroundColor: '#152330',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 1,
  },
  section: {
    backgroundColor: '#152330',
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
    color: '#82c6ff',
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
  mainText: { fontSize: 14, marginLeft: 8, color: '#f4f7fb' },
  iconSpacing: { marginRight: 10 },
});
