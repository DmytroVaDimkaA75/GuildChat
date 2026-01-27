import { MaterialIcons } from '@expo/vector-icons';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerToggleButton
} from '@react-navigation/drawer';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, AppState, Easing, Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MenuProvider } from 'react-native-popup-menu';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GuildContext, GuildProvider } from '../GuildContext';
import i18n from "../i18n";
import { syncGuildMembers } from '../src/utils/guildSync';

// Импорт компонентов
import AdminMain from './Admin/AdminMain';
import ChatScreen from "./Chat/ChatScreen";
import ChatWindow from './Chat/ChatWindow';
import CreateGroupScreen from './Chat/CreateGroupScreen';
import GuildMembersList from "./Chat/GuildMemberList";
import NewGroupChat from "./Chat/NewGroupChat";
import CulturalPlanner from './Culture/CulturalPlanner';
import CulturalSettlements from './Culture/CulturalSettlements';
import Planning from './Culture/Planning';
import AddGBComponent from './GB/AddGBComponent';
import GBChatWindow from './GB/GBChatWindow';
import GBExpress from './GB/GBExpress';
import GBGuarant from './GB/GBGuarant';
import GBNewExpress from './GB/GBNewExpress';
import GBScreen from "./GB/GBScreen";
import MyGB from './GB/MyGB';
import NewGBChat from './GB/NewGBChat';
import GBGScreen from './GBG/GBGscreen';
import AddSchedule from './Profile/AddSchedule';
import LanguageSelector from './Profile/LanguageSelector';
import ProfileData from './Profile/ProfileData';
import ProfileMain from './Profile/ProfileMain';
import SleepSchedule from './Profile/SleepSchedule';
import MapComponent from './Quant/MapComponent';

// НОВЫЕ ИКОНКИ
import Admin from "./ico/menu/setting.svg";
import Chat from "./ico/menu/chat.svg";
import GVG from "./ico/GVG.svg";
import Profile from "./ico/menu/user.svg";

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();
const navigationRef = createNavigationContainerRef();

// --- ДИЗАЙН СИСТЕМА ---
const COLORS = {
  background: "#0F0F0F",
  surface: "#1C1C1E",
  surfaceHighlight: "#2C2C2E",
  primary: "#3498db",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A0A0",
  danger: "#FF453A",
  separator: "#2A2A2A"
};

const defaultHeaderOptions = {
  headerStyle: {
    backgroundColor: COLORS.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHighlight,
  },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontWeight: '600' },
  headerTitleAlign: 'center',
};

function ChatStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={({ navigation }) => ({
          title: t("chatStack.chatScreenTitle"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('GuildMembersList')} style={{ marginRight: 15 }}>
              <Ionicons name="add" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="GuildMembersList" component={GuildMembersList} options={{ title: t("chatStack.guildMembersListTitle") }} />
      <Stack.Screen
        name="CreateGroupScreen"
        component={CreateGroupScreen}
        options={({ navigation, route }) => ({
          title: "Нова група",
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (route.params?.handleCreateGroup) {
                  route.params.handleCreateGroup();
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="NewGroupChat" component={NewGroupChat} options={{ title: t("chatStack.newGroupChatTitle") }} />
      <Stack.Screen
        name="ChatWindow"
        component={ChatWindow}
        options={({ navigation }) => ({
          title: t("chatStack.chatWindowTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.navigate('ChatScreen')}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} style={{ marginLeft: 10 }} />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

function GBGStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="GBGScreen"
        component={GBGScreen}
        options={({ navigation, route }) => ({
          title: t("gbgStack.gbgScreenTitle"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (route.params?.onOpenOpponents) {
                  route.params.onOpenOpponents();
                } else {
                  console.log('onOpenOpponents callback is not set yet');
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="information" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

function AdmintStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="AdminScreen"
        component={AdminMain}
        options={() => ({
          title: t("adminStack.adminScreenTitle"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerStyle: { backgroundColor: COLORS.surfaceHighlight, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
          headerShadowVisible: false,
        })}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="ProfileMain"
        component={ProfileMain}
        options={() => ({
          title: t("profileStack.profileMainTitle"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerStyle: { backgroundColor: COLORS.surfaceHighlight, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
          headerShadowVisible: false,
        })}
      />
      <Stack.Screen
        name="ProfileData"
        component={ProfileData}
        options={({ navigation }) => ({
          title: t("profileStack.profileDataTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="MyGB"
        component={MyGB}
        options={({ navigation }) => ({
          title: t("profileStack.myGBTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('AddGBComponent')} style={{ marginRight: 15 }}>
              <Ionicons name="add" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="AddGBComponent" component={AddGBComponent} options={{ title: t("profileStack.addGBComponentTitle") }} />
      <Stack.Screen
        name="GBNewExpress"
        component={GBNewExpress}
        options={({ navigation }) => ({
          title: t("profileStack.gbNewExpressTitle"),
          headerTintColor: COLORS.textPrimary,
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="GBGuarant"
        component={GBGuarant}
        options={({ navigation }) => ({
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="AddSchedule"
        component={AddSchedule}
        options={({ navigation }) => ({
          title: t("profileStack.addScheduleTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.navigate('ProfileMain')} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="SleepSchedule"
        component={SleepSchedule}
        options={({ navigation, route }) => ({
          title: t("profileStack.sleepScheduleTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (route.params?.handleSave) {
                  route.params.handleSave();
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="LanguageSelector"
        component={LanguageSelector}
        options={({ navigation, route }) => ({
          title: t("profileStack.languageSelectorTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => {
            const selectedLanguage = route.params?.selectedLanguage ?? i18n.language;
            return (
              <TouchableOpacity
                onPress={async () => {
                  if (route.params?.saveLanguage) {
                    await route.params.saveLanguage(selectedLanguage);
                  }
                }}
                style={{ marginRight: 15 }}
              >
                <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            );
          },
        })}
      />
    </Stack.Navigator>
  );
}

// --- DRAWER CONTENT ---
function CustomDrawerContent(props) {
  const { t } = useTranslation();
  const { guildId, setGuildId } = useContext(GuildContext);
  const [guildName, setGuildName] = useState('');
  const [userName, setUserName] = useState('');
  const [guildImageUrl, setGuildImageUrl] = useState('');
  const [tempData, setTempData] = useState({});
  const [isWorldSelectVisible, setIsWorldSelectVisible] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState('');

  const animatedHeight = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fetchGuildAndUserData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!guildId || !userId) return;

        const userBranchRef = database().ref(`users/${userId}`);
        const userBranchSnapshot = await userBranchRef.once('value');

        if (userBranchSnapshot.exists()) {
          const usersData = userBranchSnapshot.val();
          setUserName(usersData.userName || '');

          const guildRef = database().ref(`guilds/${guildId}`);
          const guildSnapshot = await guildRef.once('value');

          if (guildSnapshot.exists()) {
            const guildData = guildSnapshot.val();
            setGuildName(guildData.guildName || t("customDrawer.noName"));

            const guildUserRef = database().ref(`guilds/${guildId}/guildUsers/${userId}`);
            const guildUserSnapshot = await guildUserRef.once('value');
            if (guildUserSnapshot.exists()) {
              const guildUserData = guildUserSnapshot.val();
              setGuildImageUrl(guildUserData.imageUrl || '');
            }
          }

          const otherGuilds = {};
          for (let key in usersData) {
            if (key.includes('_') && key !== guildId) {
              const otherGuildRef = database().ref(`guilds/${key}`);
              const otherGuildSnapshot = await otherGuildRef.once('value');
              const guildUserRef = database().ref(`guilds/${key}/guildUsers/${userId}`);
              const guildUserSnapshot = await guildUserRef.once('value');
              if (otherGuildSnapshot.exists() && guildUserSnapshot.exists()) {
                otherGuilds[key] = {
                  guildName: otherGuildSnapshot.val().guildName || t("customDrawer.noName"),
                  imageUrl: guildUserSnapshot.val().imageUrl || ''
                };
              }
            }
          }
          setTempData(otherGuilds);
        }
      } catch (error) {
        console.error('Помилка при отриманні даних: ', error);
      }
    };
    fetchGuildAndUserData();
  }, [selectedGuildId, guildId, t]);

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: isWorldSelectVisible ? (Object.keys(tempData).length * 56 + 56) : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isWorldSelectVisible, tempData]);

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: isWorldSelectVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isWorldSelectVisible]);

  const handleChevronPress = () => {
    setIsWorldSelectVisible(!isWorldSelectVisible);
  };

  const handleGuildPress = async (newGuildId) => {
    try {
      await AsyncStorage.setItem('guildId', newGuildId);
      setGuildId(newGuildId);
      setSelectedGuildId(newGuildId);
      setIsWorldSelectVisible(false);
    } catch (error) {
      console.error('Помилка при збереженні guildId в AsyncStorage: ', error);
    }
  };

  const rotationInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <DrawerContentScrollView {...props} style={styles.drawerContent} contentContainerStyle={{ paddingTop: 0 }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            {guildImageUrl ? (
              <Image source={{ uri: guildImageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Profile width="24" height="24" fill={COLORS.textSecondary} />
              </View>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
            <TouchableOpacity style={styles.worldBadge} onPress={handleChevronPress} activeOpacity={0.7}>
              <Text style={styles.worldText} numberOfLines={1}>{guildName}</Text>
              <Animated.View style={{ transform: [{ rotate: rotationInterpolate }] }}>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={COLORS.primary} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Animated.View style={[styles.worldSelectContainer, { height: animatedHeight }]}>
        <View style={styles.worldsInner}>
          {Object.keys(tempData).map(key => (
            <TouchableOpacity key={key} style={styles.worldItem} onPress={() => handleGuildPress(key)}>
              {tempData[key].imageUrl ?
                <Image source={{ uri: tempData[key].imageUrl }} style={styles.smallAvatar} /> :
                <View style={styles.smallAvatarPlaceholder} />
              }
              <Text style={styles.worldItemText}>{tempData[key].guildName}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.worldItem}>
            <View style={styles.addWorldIcon}>
              <MaterialIcons name="add" size={20} color="#FFF" />
            </View>
            <Text style={[styles.worldItemText, { color: COLORS.primary }]}>{t("customDrawer.addWorld")}</Text>
          </View>
        </View>
      </Animated.View>

      <Text style={styles.sectionTitle}>{"ОСНОВНЕ"}</Text>

      <View style={styles.menuContainer}>
        {props.state.routes.map((route, index) => {
          const focused = props.state.index === index;
          const { drawerLabel, drawerIconComponent } = props.descriptors[route.key].options;
          const isServiceItem = route.name === 'servise';

          const iconColor = focused ? COLORS.primary : COLORS.textSecondary;
          const textColor = focused ? COLORS.textPrimary : COLORS.textSecondary;
          const bgColor = focused ? COLORS.surface : 'transparent';

          if (!drawerLabel) return null;

          return (
            <React.Fragment key={route.key}>
              <TouchableOpacity
                onPress={() => props.navigation.navigate(route.name)}
                style={[styles.menuItem, { backgroundColor: bgColor }]}
                activeOpacity={0.8}
              >
                <View style={styles.iconWrapper}>
                  {drawerIconComponent && drawerIconComponent({ color: iconColor })}
                </View>
                <Text style={[styles.menuItemText, { color: textColor, fontWeight: focused ? '600' : '500' }]}>
                  {drawerLabel}
                </Text>
                {focused && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
              {isServiceItem && <View style={styles.separator} />}
            </React.Fragment>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>СУРМА UA</Text>
      </View>
    </DrawerContentScrollView>
  );
}

function AppNavigator({ onReady }) {
  const { guildId } = useContext(GuildContext);
  const { t } = useTranslation();
  const [showAdmin, setShowAdmin] = React.useState(false);

  const confirmDeletion = (members) =>
    new Promise((resolve) => {
      const names = members.map((member) => member.userName).join(', ');
      Alert.alert(
        'Підтвердження видалення',
        `У гільдії знайдено користувачів, яких немає на сайті: ${names}. Видалити?`,
        [
          { text: 'Скасувати', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Видалити', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });

  const confirmAddition = (members) =>
    new Promise((resolve) => {
      const names = members.map((member) => member.userName).join(', ');
      Alert.alert(
        'Підтвердження додавання',
        `На сайті знайдено нових користувачів: ${names}. Додати в базу?`,
        [
          { text: 'Скасувати', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Додати', onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });

  React.useEffect(() => {
    const fetchRole = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) return;
        const userRoleRef = database().ref(`users/${userId}/${guildId}/role`);
        const snap = await userRoleRef.once('value');
        if (snap.exists() && snap.val() === 'guildLeader') {
          setShowAdmin(true);
          await syncGuildMembers({
            guildId,
            confirmDeletion,
            confirmAddition,
          });
        } else {
          setShowAdmin(false);
        }
      } catch (e) {
        setShowAdmin(false);
      }
    };
    fetchRole();
  }, [guildId]);

  const renderIcon = (IconComponent) => ({ color }) => (
    <IconComponent width={24} height={24} fill={color} color={color} style={{ color: color }} />
  );

  return (
    <NavigationContainer key={guildId} ref={navigationRef} onReady={onReady}>
      <Drawer.Navigator
        drawerContent={props => <CustomDrawerContent {...props} />}
        initialRouteName="GBG"
        screenOptions={{
          drawerActiveTintColor: COLORS.primary,
          drawerInactiveTintColor: COLORS.textSecondary,
          drawerType: 'front',
          overlayColor: 'rgba(0,0,0,0.85)',
          headerShown: false,
          drawerStyle: { backgroundColor: COLORS.background, width: 320 }
        }}
      >
        <Drawer.Screen
          name="ChatList"
          component={ChatStack}
          options={{
            drawerLabel: t("drawer.chatLabel"),
            drawerIconComponent: renderIcon(Chat)
          }}
        />
        <Drawer.Screen
          name="GBG"
          component={GBGStack}
          options={{
            drawerLabel: t("drawer.pbgLabel"),
            drawerIconComponent: renderIcon(GVG)
          }}
        />
        <Drawer.Screen
          name="profile"
          component={ProfileStack}
          options={{
            drawerLabel: t("drawer.profileLabel"),
            drawerIconComponent: renderIcon(Profile)
          }}
        />
        {showAdmin && (
          <Drawer.Screen
            name="admin"
            component={AdmintStack}
            options={{
              drawerLabel: t("drawer.adminLabel"),
              drawerIconComponent: renderIcon(Admin)
            }}
          />
        )}
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function MainContent() {
  const pendingNavigationRef = useRef(null);
  const [navigationReady, setNavigationReady] = useState(false);

  const runWhenNavigationReady = (action) => {
    if (navigationRef.isReady()) {
      action();
      return;
    }
    pendingNavigationRef.current = action;
  };

  useEffect(() => {
    if (navigationReady && pendingNavigationRef.current) {
      const action = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      action();
    }
  }, [navigationReady]);

  const clearSectorNotifications = async () => {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const sectorNotifications = displayed.filter(({ notification }) => {
        const channelId = notification?.android?.channelId;
        const type = notification?.data?.type;
        return (
          type === 'gbg_sector_open' ||
          channelId === 'gbg_sector' ||
          channelId === 'gbg_sector_silent'
        );
      });

      await Promise.all(
        sectorNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
      );
    } catch (error) {
      console.log('❌ Помилка очищення секторних пушів:', error?.message || String(error));
    }
  };

  const clearChatNotifications = async (chatId) => {
    if (!chatId) return;
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const chatNotifications = displayed.filter(({ notification }) => {
        const type = notification?.data?.type;
        const notificationChatId = notification?.data?.chatId;
        return type === 'chat_message' && String(notificationChatId) === String(chatId);
      });

      await Promise.all(
        chatNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
      );
    } catch (error) {
      console.log('❌ Помилка очищення чат-пушів:', error?.message || String(error));
    }
  };

  const handleNotificationTap = async (remoteMessage) => {
    const data = remoteMessage?.data || {};
    const messageType = data.type;

    if (messageType === 'gbg_sector_open') {
      await clearSectorNotifications();
      runWhenNavigationReady(() => {
        navigationRef.navigate('GBG', { screen: 'GBGScreen' });
      });
      return;
    }

    if (messageType === 'chat_message') {
      const chatId = data.chatId;
      if (chatId) {
        await clearChatNotifications(chatId);
        runWhenNavigationReady(() => {
          navigationRef.navigate('ChatList', {
            screen: 'ChatWindow',
            params: { chatId },
          });
        });
      }
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearSectorNotifications();
      }
    });

    clearSectorNotifications();

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const resolveNotificationContent = (remoteMessage) => {
      const notificationTitle = remoteMessage?.notification?.title;
      const notificationBody = remoteMessage?.notification?.body;

      const dataTitle = remoteMessage?.data?.title;
      const dataBody = remoteMessage?.data?.body;

      const title = notificationTitle || dataTitle || "";
      const body = notificationBody || dataBody || "";

      return { title, body };
    };

    const setupPushNotifications = async () => {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Authorization status:', authStatus);

        await notifee.createChannel({
          id: 'default',
          name: 'Default Channel',
          importance: AndroidImportance.HIGH,
        });

        // ✅ Канал ПБГ зі звуком
        await notifee.createChannel({
          id: 'gbg_sector',
          name: 'GBG Sector Channel',
          importance: AndroidImportance.HIGH,
          sound: 'alert',
        });

        // ✅ Канал ПБГ без звуку
        await notifee.createChannel({
          id: 'gbg_sector_silent',
          name: 'GBG Sector Silent',
          importance: AndroidImportance.HIGH,
        });

        // ✅ Канал чату зі звуком
        await notifee.createChannel({
          id: 'chat_messages',
          name: 'Chat Messages Channel',
          importance: AndroidImportance.HIGH,
          sound: 'smeh_minonovhasms',
        });

        // ✅ Канал чату без звуку
        await notifee.createChannel({
          id: 'chat_messages_silent',
          name: 'Chat Messages Silent',
          importance: AndroidImportance.HIGH,
        });

        const fcmToken = await messaging().getToken();
        if (fcmToken) {
          console.log("Your FCM Token is:", fcmToken);
        } else {
          console.log("Failed to get FCM token");
        }
      } else {
        console.log('User has declined push notification permissions.');
      }

      const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
        console.log('FCM Message arrived in foreground!', JSON.stringify(remoteMessage));

        const { title, body } = resolveNotificationContent(remoteMessage);

        // ✅ data-only widget refresh не показуємо
        if (remoteMessage?.data?.type === 'gbg_widget_refresh') return;

        if (!title && !body) return;

        const messageType = remoteMessage?.data?.type;

        // ✅ sound flag приходить з сервера: "1" або "0"
        const soundFlag = remoteMessage?.data?.sound === '1';

        const displayChannelId =
          messageType === 'gbg_sector_open'
            ? (soundFlag ? 'gbg_sector' : 'gbg_sector_silent')
            : messageType === 'chat_message'
              ? (soundFlag ? 'chat_messages' : 'chat_messages_silent')
              : 'default';

        await notifee.displayNotification({
          title,
          body,
          data: remoteMessage?.data || {},
          android: {
            channelId: displayChannelId,
            importance: AndroidImportance.HIGH,
            pressAction: { id: 'default' },
          },
        });
      });

      const unsubscribeOpenedApp = messaging().onNotificationOpenedApp(remoteMessage => {
        console.log('Notification caused app to open from background state:', remoteMessage.notification);
        handleNotificationTap(remoteMessage);
      });

      messaging()
        .getInitialNotification()
        .then(remoteMessage => {
          if (remoteMessage) {
            console.log('Notification caused app to open from quit state:', remoteMessage.notification);
            handleNotificationTap(remoteMessage);
          }
        });

      const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS) {
          handleNotificationTap({ data: detail?.notification?.data || {} });
        }
      });

      return () => {
        unsubscribeOnMessage();
        unsubscribeOpenedApp();
        unsubscribeNotifee();
      };
    };

    const cleanupPromise = setupPushNotifications();
    return () => {
      cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, []);

  return (
    <GuildProvider>
      <MenuProvider>
        <AppNavigator onReady={() => setNavigationReady(true)} />
      </MenuProvider>
    </GuildProvider>
  );
}

const styles = StyleSheet.create({
  drawerContent: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: COLORS.background,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surfaceHighlight,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#222',
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  worldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.surfaceHighlight,
  },
  worldText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
    maxWidth: 130,
  },
  worldSelectContainer: {
    overflow: 'hidden',
    marginBottom: 10,
  },
  worldsInner: {
    backgroundColor: '#161616',
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 5,
  },
  worldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
  },
  smallAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceHighlight
  },
  addWorldIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  worldItemText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    marginLeft: 12,
    fontWeight: '500',
  },
  sectionTitle: {
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: 24,
    marginBottom: 10,
    marginTop: 10,
    letterSpacing: 1,
  },
  menuContainer: {
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    position: 'relative',
  },
  iconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  menuItemText: {
    fontSize: 16,
  },
  activeIndicator: {
    position: 'absolute',
    right: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    backgroundColor: COLORS.primary,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.surfaceHighlight,
    marginVertical: 10,
    marginHorizontal: 24,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceHighlight,
    marginBottom: 20
  },
  footerText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '500',
  }
});
