import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import CustomCheckBox from '../CustomElements/CustomCheckBox3';

const AdminMain = () => {
  const [userName, setUserName] = useState('');
  const [guildName, setGuildName] = useState('');
  const [activeWorld, setActiveWorld] = useState('');
  const [guilds, setGuilds] = useState([]);
  const [guildMembersList, setGuildMembersList] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showGBGGoal, setShowGBGGoal] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;
  const membersHeightAnim = useRef(new Animated.Value(0)).current;
  const [isCultureSettingsOpen, setCultureSettingsOpen] = useState(false);
  const [isProductionOpen, setProductionOpen] = useState(false);
  const [selectedProductionTime, setSelectedProductionTime] = useState(null);
  const [notifyNextActions, setNotifyNextActions] = useState(false);
  const [upgradeBranches, setUpgradeBranches] = useState([]);
  const [gbgGoalMaxPoints, setGbgGoalMaxPoints] = useState(true);
  const productionTimeOptions = ['5 хв.', '15 хв.', '1 год.', '5 год.', '10 год.', '20 год.'];
  const navigation = useNavigation();

  const convertRole = (role) => {
    switch (role) {
      case 'guildLeader': return 'Адміністратор';
      case 'tester': return 'Тестер';
      case 'member': return 'Користувач';
      default: return role;
    }
  };

  const toggleCultureSettings = () => setCultureSettingsOpen(prev => !prev);
  const toggleProductionOpen = () => setProductionOpen(prev => !prev);

  const selectProductionTime = async (time) => {
    const idx = productionTimeOptions.indexOf(time);
    setSelectedProductionTime(time);
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (userId && guildId) {
        await database().ref(`/users/${userId}/${guildId}/culture/productionPreference`).set(idx);
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
        await database().ref(`/users/${userId}/${guildId}/culture/cultureAlarm`).set(newVal);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      let userNameRef, worldNameRef, guildNameRef, gbgGoalRef;
      
      const fetchInitialData = async () => {
        try {
          const userId = await AsyncStorage.getItem('userId');
          const guildId = await AsyncStorage.getItem('guildId');

          if (userId) {
            userNameRef = database().ref(`/users/${userId}/userName`);
            userNameRef.on('value', snap => snap.exists() && setUserName(snap.val()));
          }
          if (guildId) {
            worldNameRef = database().ref(`/guilds/${guildId}/worldName`);
            worldNameRef.on('value', snap => snap.exists() && setActiveWorld(snap.val()));
            
            guildNameRef = database().ref(`/guilds/${guildId}/guildName`);
            guildNameRef.on('value', snap => snap.exists() && setGuildName(snap.val()));

            gbgGoalRef = database().ref(`/guilds/${guildId}/setting/GBGGoal`);
            gbgGoalRef.on('value', snap => {
              if (snap.exists()) {
                setGbgGoalMaxPoints(!!snap.val());
              } else {
                setGbgGoalMaxPoints(true);
              }
            });
          }
          if (userId && guildId) {
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
          const snap = await database().ref(`/users/${userId}`).once('value');
          if (!snap.exists()) return;
          
          const data = snap.val();
          const keys = Object.keys(data).filter(k => k.includes('_'));
          const arr = await Promise.all(
            keys.map(async id => {
              const role = data[id].role;
              const worldSnap = await database().ref(`/guilds/${id}/worldName`).once('value');
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
          const snap = await database().ref(`/guilds/${guildId}/GBChat`).once('value');
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

      return () => {
        if (userNameRef) userNameRef.off('value');
        if (worldNameRef) worldNameRef.off('value');
        if (guildNameRef) guildNameRef.off('value');
        if (gbgGoalRef) gbgGoalRef.off('value');
        setShowMembers(false);
      };
    }, [])
  );
  
  const fetchMembers = async (guildId) => {
    try {
      const currentUserId = await AsyncStorage.getItem('userId');
      const membersSnap = await database().ref(`/guilds/${guildId}/guildUsers`).once('value');
      
      if (membersSnap.exists()) {
        const membersData = membersSnap.val();
        const membersArr = Object.keys(membersData).map(userId => ({
            id: userId,
            userName: membersData[userId].userName || '',
            imageUrl: membersData[userId].imageUrl || null,
            isSelf: userId === currentUserId,
        }));

        const membersWithRoles = await Promise.all(
          membersArr.map(async member => {
            let role = '';
            let password = '';
            try {
              const roleSnap = await database().ref(`/users/${member.id}/${guildId}/role`).once('value');
              if (roleSnap.exists()) role = roleSnap.val();

              const passSnap = await database().ref(`/users/${member.id}/password`).once('value');
              if (passSnap.exists()) password = passSnap.val();
            } catch (e) {
              console.error('Ошибка получения role/password для', member.id, e);
            }
            return { ...member, role, password };
          })
        );
        setGuildMembersList(membersWithRoles);
      } else {
        setGuildMembersList([]);
      }
    } catch (e) {
      console.error('Ошибка при поиске членов гильдии:', e);
    }
  };

  useEffect(() => {
    if (showMembers) {
      (async () => {
        const guildId = await AsyncStorage.getItem('guildId');
        if (guildId) {
          fetchMembers(guildId);
        }
      })();
    }
  }, [showMembers]);
  
  const handleRoleChange = async (userId, checked) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      const newRole = checked ? 'guildLeader' : 'member';
      await database().ref(`/users/${userId}/${guildId}/role`).set(newRole);
      setGuildMembersList(prev =>
        prev.map(m => (m.id === userId ? { ...m, role: newRole } : m))
      );
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось обновить роль');
    }
  };
  
  const handleCopyPassword = async (password) => {
    try {
      await Clipboard.setStringAsync(password);
      Alert.alert('Пароль скопирован');
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось скопировать пароль');
    }
  };

  const handleGBGGoalChange = async (value) => {
    setGbgGoalMaxPoints(value);
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      await database().ref(`/guilds/${guildId}/setting/GBGGoal`).set(value);
    } catch (e) {
      console.error(e);
      Alert.alert('Ошибка', 'Не вдалося оновити мету гільдії');
    }
  };

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

  const handleDeleteBranch = async (branchId) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      await database().ref(`/guilds/${guildId}/GBChat/${branchId}`).remove();
      setUpgradeBranches(prev => prev.filter(b => b.id !== branchId));
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось удалить ветку');
    }
  };
  
  const handleEditBranch = (branchId) => {
    const branch = upgradeBranches.find(b => b.id === branchId);
    if (!branch) return;
    const parentNavigation = navigation.getParent();
    if (parentNavigation) {
      parentNavigation.navigate('GB', {
        screen: 'NewGBChat',
        params: { editBranch: branch, from: 'AdminMain' },
      });
      return;
    }
    navigation.navigate('NewGBChat', { editBranch: branch, from: 'AdminMain' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.userName}>{guildName}</Text>
      </View>

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
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="chevron-down" size={22} color="#3498db" />
            </Animated.View>
          </TouchableOpacity>
        </View>
        {showMembers && (
          <>
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
                  outputRange: [ 0, guildMembersList.length * 44 ],
                }),
                opacity: membersHeightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                paddingBottom: 0,
                marginBottom: 0,
              }}
            >
              {guildMembersList.length === 0 ? (
                <Text style={styles.mainText}>немає членів гільдії</Text>
              ) : (
                guildMembersList.map((member) => (
                  <View
                    key={member.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 44,
                    }}
                  >
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
                        <FontAwesomeIcon icon={faCopy} size={18} color="#3498db" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </Animated.View>
          </>
        )}
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.sectionTitle}>Мета гільдії на ПБГ</Text>
          <TouchableOpacity onPress={() => setShowGBGGoal(v => !v)}>
            <Ionicons name={showGBGGoal ? 'chevron-up' : 'chevron-down'} size={22} color="#3498db" />
          </TouchableOpacity>
        </View>
        {showGBGGoal && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={[styles.mainText, { marginLeft: 0, maxWidth: '35%' }]}>Виснаження суперника</Text>
            <Switch
              value={gbgGoalMaxPoints}
              onValueChange={handleGBGGoalChange}
              trackColor={{ false: 'rgba(255,255,255,0.18)', true: 'rgba(52,152,219,0.35)' }}
              thumbColor={gbgGoalMaxPoints ? '#3498db' : '#d0d0d0'}
            />
            <Text style={[styles.mainText, { marginLeft: 0, textAlign: 'right', maxWidth: '35%' }]}>Максимальна кількість очок</Text>
          </View>
        )}
      </View>
      
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
                  <FontAwesome name="pencil" size={18} color="#3498db" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteBranch(branch.id)}
                >
                  <FontAwesome name="trash" size={18} color="#3498db" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: { paddingBottom: 24 },
  header: {
    padding: 20,
    backgroundColor: '#1c1c1e',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userName: {
    fontSize: 24,
    color: '#E0E0E0',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#1f1f1f',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
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
    color: '#E0E0E0',
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
    borderWidth: 2,
    borderColor: '#3498db',
    marginRight: 8,
  },
  iconSpacing: {
    marginRight: 8,
  },
  marginAutoLeft: {
    marginLeft: 'auto',
  },
});

export default AdminMain;
