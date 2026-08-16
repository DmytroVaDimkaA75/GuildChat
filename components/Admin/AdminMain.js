import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getUkrainianRoleLabel,
  USER_ROLES,
} from '../../constants/roles';
import CustomCheckBox from '../CustomElements/CustomCheckBox3';
import TelegramSettings from './TelegramSettings';

const AdminMain = ({ canAccessTasks = false }) => {
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
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [gbgBotPickerVisible, setGbgBotPickerVisible] = useState(false);
  const [selectedGbgBotId, setSelectedGbgBotId] = useState(null);
  const [gbObserverId, setGbObserverId] = useState('');
  const [savingBot, setSavingBot] = useState(false);
  const productionTimeOptions = ['5 хв.', '15 хв.', '1 год.', '5 год.', '10 год.', '20 год.'];
  const navigation = useNavigation();

  const convertRole = getUkrainianRoleLabel;

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
      let disposed = false;
      
      const fetchInitialData = async () => {
        try {
          const userId = await AsyncStorage.getItem('userId');
          const guildId = await AsyncStorage.getItem('guildId');
          if (disposed) return;

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
        disposed = true;
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
        setSelectedGbgBotId(
          membersWithRoles.find((member) => member.role === USER_ROLES.GBG_BOT)?.id || null
        );
      } else {
        setGuildMembersList([]);
      }
    } catch (e) {
      console.error('Ошибка при поиске членов гильдии:', e);
    }
  };

  useEffect(() => {
    if (showMembers || showBotSettings) {
      (async () => {
        const guildId = await AsyncStorage.getItem('guildId');
        if (guildId) {
          fetchMembers(guildId);
        }
      })();
    }
  }, [showBotSettings, showMembers]);
  
  const handleRoleChange = async (userId, checked) => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      if (!guildId) return;
      const newRole = checked
        ? USER_ROLES.GUILD_LEADER
        : USER_ROLES.MEMBER;
      await database().ref(`/users/${userId}/${guildId}/role`).set(newRole);
      setGuildMembersList(prev =>
        prev.map(m => (m.id === userId ? { ...m, role: newRole } : m))
      );
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось обновить роль');
    }
  };

  const confirmGbgBot = (member) => {
    Alert.alert(
      'Підтвердити бота ПБГ',
      `Призначити ${member.userName || member.id} ботом полів битви гільдій?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Підтвердити',
          onPress: async () => {
            const guildId = await AsyncStorage.getItem('guildId');
            if (!guildId || savingBot) return;
            setSavingBot(true);
            try {
              const updates = {};
              guildMembersList.forEach((candidate) => {
                if (candidate.role === USER_ROLES.GBG_BOT && candidate.id !== member.id) {
                  updates[`users/${candidate.id}/${guildId}/role`] = USER_ROLES.MEMBER;
                }
              });
              updates[`users/${member.id}/${guildId}/role`] = USER_ROLES.GBG_BOT;
              await database().ref().update(updates);
              setGuildMembersList((current) => current.map((candidate) => ({
                ...candidate,
                role: candidate.id === member.id
                  ? USER_ROLES.GBG_BOT
                  : candidate.role === USER_ROLES.GBG_BOT
                    ? USER_ROLES.MEMBER
                    : candidate.role,
              })));
              setSelectedGbgBotId(member.id);
              setGbgBotPickerVisible(false);
            } catch (_error) {
              Alert.alert('Помилка', 'Не вдалося призначити бота ПБГ.');
            } finally {
              setSavingBot(false);
            }
          },
        },
      ]
    );
  };

  const confirmGbObserver = async () => {
    const botId = gbObserverId.trim();
    const guildId = await AsyncStorage.getItem('guildId');
    if (!/^\d+$/.test(botId) || !guildId || savingBot) {
      Alert.alert('Некоректний ID', 'Введіть числовий ID бота.');
      return;
    }
    const worldId = String(guildId).split('_')[0];
    setSavingBot(true);
    try {
      const response = await fetch(`https://foe.scoredb.io/${worldId}/Player/${botId}`);
      if (!response.ok) throw new Error(`scoredb-${response.status}`);
      await database().ref(`/users/${botId}/${guildId}/role`).set(USER_ROLES.GB_BOT);
      Alert.alert('Готово', `Гравцю ${botId} надано роль GBbot.`);
    } catch (_error) {
      Alert.alert('Гравця не знайдено', `ScoreDB не підтвердив гравця ${botId} у світі ${worldId}.`);
    } finally {
      setSavingBot(false);
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

  const handleCreateBranch = () => {
    const parentNavigation = navigation.getParent();
    const params = { from: 'AdminMain', mode: 'create', editBranch: undefined };
    if (parentNavigation) {
      parentNavigation.navigate('GB', {
        screen: 'NewGBChat',
        params,
      });
      return;
    }
    navigation.navigate('NewGBChat', params);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.userName}>{guildName}</Text>
      </View>

      {canAccessTasks && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('GuildTasks')}
          style={styles.tasksEntry}
        >
          <View style={styles.tasksEntryIcon}>
            <Ionicons name="clipboard-outline" size={25} color="#4ea1ff" />
          </View>
          <View style={styles.tasksEntryText}>
            <Text style={styles.tasksEntryTitle}>Завдання гільдії</Text>
            <Text style={styles.tasksEntrySubtitle}>Створення, виконавці та прогрес</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#9aa3b2" />
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.botSettingsHeader} onPress={() => setShowBotSettings((value) => !value)}>
          <View>
            <Text style={styles.sectionTitle}>Налаштування ботів</Text>
            <Text style={styles.botSettingsSubtitle}>ПБГ та спостерігач за ВС</Text>
          </View>
          <Ionicons name={showBotSettings ? 'chevron-up' : 'chevron-down'} size={22} color="#4ea1ff" />
        </TouchableOpacity>
        {showBotSettings && (
          <View style={styles.botSettingsContent}>
            <Text style={styles.botFieldLabel}>Поля битви гільдій</Text>
            <TouchableOpacity style={styles.botSelect} onPress={() => setGbgBotPickerVisible(true)}>
              <Text style={styles.botSelectText} numberOfLines={1}>
                {guildMembersList.find((member) => member.id === selectedGbgBotId)?.userName || 'Обрати члена гільдії'}
              </Text>
              <Ionicons name="chevron-down" size={19} color="#9aa3b2" />
            </TouchableOpacity>

            <Text style={[styles.botFieldLabel, { marginTop: 16 }]}>Спостерігач за ВС</Text>
            <View style={styles.botObserverRow}>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setGbObserverId}
                placeholder="ID бота"
                placeholderTextColor="#687789"
                style={styles.botInput}
                value={gbObserverId}
              />
              <TouchableOpacity disabled={savingBot} onPress={confirmGbObserver} style={styles.botConfirmButton}>
                {savingBot ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={22} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Modal visible={gbgBotPickerVisible} transparent animationType="fade" onRequestClose={() => setGbgBotPickerVisible(false)}>
        <View style={styles.botModalOverlay}>
          <View style={styles.botModalCard}>
            <View style={styles.botModalHeader}>
              <Text style={styles.botModalTitle}>Оберіть бота ПБГ</Text>
              <TouchableOpacity onPress={() => setGbgBotPickerVisible(false)}>
                <Ionicons name="close" size={24} color="#9aa3b2" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.botCandidateList}>
              {guildMembersList.map((member) => (
                <TouchableOpacity key={member.id} onPress={() => confirmGbgBot(member)} style={styles.botCandidate}>
                  {member.imageUrl ? <Image source={{ uri: member.imageUrl }} style={styles.botCandidateAvatar} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.botCandidateName}>{member.userName || member.id}</Text>
                    <Text style={styles.botCandidateId}>{member.id}</Text>
                  </View>
                  {member.id === selectedGbgBotId && <Ionicons name="checkmark-circle" size={22} color="#4ea1ff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
              <Ionicons name="chevron-down" size={22} color="#4ea1ff" />
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
                  outputRange: [0, guildMembersList.filter((member) => member.role !== USER_ROLES.GBG_BOT).length * 44],
                }),
                opacity: membersHeightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                paddingBottom: 0,
                marginBottom: 0,
              }}
            >
              {guildMembersList.filter((member) => member.role !== USER_ROLES.GBG_BOT).length === 0 ? (
                <Text style={styles.mainText}>немає членів гільдії</Text>
              ) : (
                guildMembersList.filter((member) => member.role !== USER_ROLES.GBG_BOT).map((member) => (
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
                      <View>
                        <Text style={styles.mainText}>{member.userName}</Text>
                        <Text style={styles.memberRole}>
                          {convertRole(member.role)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <CustomCheckBox
                        checked={member.role === USER_ROLES.GUILD_LEADER}
                        onPress={() => {
                          if (member.isSelf) return;
                          handleRoleChange(
                            member.id,
                            member.role !== USER_ROLES.GUILD_LEADER
                          );
                        }}
                        style={{ marginLeft: 10 }}
                        disabled={member.isSelf}
                      />
                      <TouchableOpacity
                        onPress={() => handleCopyPassword(member.password)}
                        style={{ marginLeft: 10 }}
                      >
                        <FontAwesomeIcon icon={faCopy} size={18} color="#4ea1ff" />
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
            <Ionicons name={showGBGGoal ? 'chevron-up' : 'chevron-down'} size={22} color="#4ea1ff" />
          </TouchableOpacity>
        </View>
        {showGBGGoal && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={[styles.mainText, { marginLeft: 0, maxWidth: '35%' }]}>Виснаження суперника</Text>
            <Switch
              value={gbgGoalMaxPoints}
              onValueChange={handleGBGGoalChange}
              trackColor={{ false: 'rgba(255,255,255,0.18)', true: 'rgba(52,152,219,0.35)' }}
              thumbColor={gbgGoalMaxPoints ? '#4ea1ff' : '#d0d0d0'}
            />
            <Text style={[styles.mainText, { marginLeft: 0, textAlign: 'right', maxWidth: '35%' }]}>Максимальна кількість очок</Text>
          </View>
        )}
      </View>

      <TelegramSettings />
      
      <View style={styles.divider} />
      <View style={styles.section}>
        <View style={styles.upgradeBranchesHeader}>
          <Text style={styles.sectionTitle}>Гілки прокачки</Text>
          <TouchableOpacity
            onPress={handleCreateBranch}
            style={styles.addBranchButton}
            accessibilityRole="button"
            accessibilityLabel="Створити гілку прокачки"
          >
            <Ionicons name="add" size={25} color="#4ea1ff" />
          </TouchableOpacity>
        </View>
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
                  <FontAwesome name="pencil" size={18} color="#4ea1ff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteBranch(branch.id)}
                >
                  <FontAwesome name="trash" size={18} color="#4ea1ff" />
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
    backgroundColor: '#0f1115',
  },
  content: { paddingBottom: 24 },
  header: {
    padding: 20,
    backgroundColor: '#152330',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userName: {
    fontSize: 24,
    color: '#f4f7fb',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#152330',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#152330',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tasksEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 15,
    backgroundColor: '#152330',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#36516a',
  },
  tasksEntryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,161,255,0.14)',
  },
  tasksEntryText: {
    flex: 1,
    marginLeft: 12,
  },
  tasksEntryTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '700',
  },
  tasksEntrySubtitle: {
    color: '#9aa3b2',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#82c6ff',
    marginBottom: 6,
  },
  botSettingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  botSettingsSubtitle: { color: '#9aa3b2', fontSize: 12 },
  botSettingsContent: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 12, paddingTop: 12 },
  botFieldLabel: { color: '#dce5ef', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  botSelect: { minHeight: 46, borderWidth: 1, borderColor: '#36516a', borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  botSelectText: { flex: 1, color: '#f4f7fb', fontSize: 14 },
  botObserverRow: { flexDirection: 'row', gap: 9 },
  botInput: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#36516a', borderRadius: 10, paddingHorizontal: 12, color: '#f4f7fb', fontSize: 14 },
  botConfirmButton: { width: 48, minHeight: 46, borderRadius: 10, backgroundColor: '#3188ef', alignItems: 'center', justifyContent: 'center' },
  botModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  botModalCard: { width: '100%', maxWidth: 420, maxHeight: '75%', backgroundColor: '#152330', borderWidth: 1, borderColor: '#36516a', borderRadius: 16, padding: 15 },
  botModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  botModalTitle: { color: '#f4f7fb', fontSize: 18, fontWeight: '800' },
  botCandidateList: { flexGrow: 0 },
  botCandidate: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingVertical: 7 },
  botCandidateAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
  botCandidateName: { color: '#f4f7fb', fontSize: 14, fontWeight: '600' },
  botCandidateId: { color: '#7f8794', fontSize: 11, marginTop: 2 },
  upgradeBranchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBranchButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
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
    color: '#f4f7fb',
  },
  memberRole: {
    color: '#7f8794',
    fontSize: 11,
    marginLeft: 8,
    marginTop: 1,
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
    borderColor: '#4ea1ff',
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
