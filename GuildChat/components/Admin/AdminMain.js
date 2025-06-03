import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, Animated, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, onValue, get, set, update } from 'firebase/database';
import { database } from '../../firebaseConfig';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faClock, faGlobe, faCopy } from '@fortawesome/free-solid-svg-icons';
import GBIcon from '../ico/GB.svg';
import BoatIcon from '../ico/boat.svg';
import CustomCheckBox from '../CustomElements/CustomCheckBox3';
import * as Clipboard from 'expo-clipboard';
import { FontAwesome } from '@expo/vector-icons';

const AdminMain = () => {
  const [userName, setUserName] = useState('');
  const [guildName, setGuildName] = useState(''); // Додаємо стан для назви гільдії
  const [activeWorld, setActiveWorld] = useState('');
  const [guilds, setGuilds] = useState([]);
  const [guildMembersList, setGuildMembersList] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current; // 0 - згорнуто, 1 - розгорнуто
  const membersHeightAnim = useRef(new Animated.Value(0)).current;

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

  // Переносимо fetchInitialData та fetchGuilds всередину useFocusEffect для оновлення при кожному фокусі
  useFocusEffect(
    React.useCallback(() => {
      const fetchInitialData = async () => {
        try {
          const userId = await AsyncStorage.getItem('userId');
          const guildId = await AsyncStorage.getItem('guildId');
          if (userId) {
            onValue(ref(database, `/users/${userId}/userName`), snap => snap.val() && setUserName(snap.val()));
          }
          if (guildId) {
            onValue(ref(database, `/guilds/${guildId}/worldName`), snap => snap.val() && setActiveWorld(snap.val()));
            onValue(ref(database, `/guilds/${guildId}/guildName`), snap => snap.val() && setGuildName(snap.val()));
          }
          if (userId && guildId) {
            const cultureSnap = await get(ref(database, `/users/${userId}/${guildId}/culture`));
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

      const fetchUpgradeBranches = async () => {
        try {
          const guildId = await AsyncStorage.getItem('guildId');
          if (!guildId) return;
          const snap = await get(ref(database, `/guilds/${guildId}/GBChat`));
          if (snap.exists()) {
            const data = snap.val();
            const branches = Object.entries(data)
              .map(([id, branch]) => branch?.name ? { id, name: branch.name } : null)
              .filter(Boolean);
            setUpgradeBranches(branches);
          } else {
            setUpgradeBranches([]);
          }
        } catch (e) {
          setUpgradeBranches([]);
        }
      };

      fetchInitialData();
      fetchGuilds();
      fetchUpgradeBranches();

      // Не має залежності від AsyncStorage.getItem('guildId'), лише showMembers
      return () => {
        // on blur — згортати список членів гільдії
        setShowMembers(false);
      };
    }, [])
  );

  // Обробник зміни ролі (чекбокс)
  const handleRoleChange = async (userId, checked) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      const newRole = checked ? 'guildLeader' : 'member';
      await set(ref(database, `/users/${userId}/${guildId}/role`), newRole);
      // Оновити локальний стан для миттєвого UI
      setGuildMembersList(prev =>
        prev.map(m =>
          m.id === userId ? { ...m, role: newRole } : m
        )
      );
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося оновити роль');
    }
  };

  // Обробник копіювання пароля
  const handleCopyPassword = async (password) => {
    try {
      await Clipboard.setStringAsync(password);
      Alert.alert('Пароль скопійовано');
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося скопіювати пароль');
    }
  };

  // Анімація повороту шеврона та розгортання блоку
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: showMembers ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    Animated.timing(membersHeightAnim, {
      toValue: showMembers ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [showMembers]);

  // Додаємо стан для гілок прокачки з id та name
  const [upgradeBranches, setUpgradeBranches] = useState([]);

  // Завантаження гілок прокачки з БД
  useEffect(() => {
    const fetchUpgradeBranches = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        if (!guildId) return;
        const snap = await get(ref(database, `/guilds/${guildId}/GBChat`));
        if (snap.exists()) {
          const data = snap.val();
          // Масив об'єктів {id, name}
          const branches = Object.entries(data)
            .map(([id, branch]) => branch?.name ? { id, name: branch.name } : null)
            .filter(Boolean);
          setUpgradeBranches(branches);
        } else {
          setUpgradeBranches([]);
        }
      } catch (e) {
        setUpgradeBranches([]);
      }
    };
    fetchUpgradeBranches();
  }, []);

  // Обробник видалення гілки
  const handleDeleteBranch = async (branchId) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      await set(ref(database, `/guilds/${guildId}/GBChat/${branchId}`), null);
      setUpgradeBranches(prev => prev.filter(b => b.id !== branchId));
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити гілку');
    }
  };

  // Обробник редагування гілки
  const handleEditBranch = (branchId) => {
    const branch = upgradeBranches.find(b => b.id === branchId);
    if (!branch) return;
    navigation.navigate('NewGBChat', { editBranch: branch, from: 'AdminMain' }); // Додаємо from
  };

  return (
    <ScrollView style={styles.container}>
      {/* Шапка */}
      <View style={styles.header}>
        <Text style={styles.userName}>{guildName}</Text>
      </View>

      {/* Ігрові світи */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.sectionTitle}>Члени гільдії</Text>
          <TouchableOpacity onPress={() => setShowMembers(v => !v)}>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: chevronAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'], // 0 - згорнуто, 180 - розгорнуто
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="chevron-down" size={22} color="#0088cc" />
            </Animated.View>
          </TouchableOpacity>
        </View>
        {showMembers && (
          <>
            {/* Додайте перед Animated.View з guildMembersList (після шапки секції) підписи для стовпчиків */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 28,
                paddingHorizontal: 2,
                marginTop: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.mainText, { fontWeight: 'bold' }]}>Логін</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.mainText, { fontWeight: 'bold', marginRight: 24 }]}>Адмін</Text>
                <Text style={[styles.mainText, { fontWeight: 'bold' }]}>Код</Text>
              </View>
            </View>
            <Animated.View
              style={{
                overflow: 'hidden',
                height: membersHeightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    0,
                    guildMembersList.length * 44 // 44 - це приблизна висота одного рядка
                  ],
                }),
                opacity: membersHeightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                paddingBottom: 0,
                marginBottom: 0,
              }}
            >
              {console.log('guildMembersList.length:', guildMembersList.length)}
              {guildMembersList.length === 0 ? (
                <Text style={styles.mainText}>немає членів гільдії</Text>
              ) : (
                guildMembersList.map((member, idx) => (
                  <View
                    key={member.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 44,
                      // backgroundColor: '#fffae5', // прибрано жовтий фон
                    }}
                  >
                    {console.log('member', idx, member)}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {member.imageUrl && (
                        <Image
                          source={{ uri: member.imageUrl }}
                          style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                        />
                      )}
                      <Text style={styles.mainText}>{member.userName}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <CustomCheckBox
                        checked={member.role === 'guildLeader'}
                        onPress={() => {
                          if (member.isSelf) return;
                          handleRoleChange(member.id, !(member.role === 'guildLeader'));
                        }}
                        style={{ marginLeft: 10 }}
                        disabled={member.isSelf}
                      />
                      <TouchableOpacity
                        onPress={() => handleCopyPassword(member.password)}
                        style={{ marginLeft: 10 }}
                      >
                        <FontAwesomeIcon icon={faCopy} size={18} color="#0088cc" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </Animated.View>
          </>
        )}
      </View>


     
      {/* Налаштування світу */}
      
      <View style={styles.divider} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Гілки прокачки</Text>
        {upgradeBranches.length === 0 ? (
          <Text style={styles.mainText}>Немає гілок прокачки</Text>
        ) : (
          upgradeBranches.map(branch => (
            <View
              key={branch.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}
            >
              <Text style={styles.mainText}>{branch.name}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  onPress={() => handleEditBranch(branch.id)}
                  style={{ marginRight: 16 }}
                >
                  <FontAwesome name="pencil" size={18} color="#0088cc" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteBranch(branch.id)}
                >
                  <FontAwesome name="trash" size={18} color="#0088cc" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

export default AdminMain;

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
