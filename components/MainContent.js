import { MaterialIcons } from '@expo/vector-icons';
import { faYoutube } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import notifee, {
  AndroidDefaults,
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import {
  createDrawerNavigator,
  DrawerToggleButton
} from '@react-navigation/drawer';
import { createNavigationContainerRef, DarkTheme, NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Image, NativeModules, Platform, ScrollView, StatusBar, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { MenuProvider } from 'react-native-popup-menu';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GuildContext } from '../GuildContext';
import {
  canAccessGuildTasks,
  hasLeaderFeatures,
  hasTesterFeatures,
} from '../constants/roles';
import i18n from "../i18n";
import {
  clearPendingNotificationRoute,
  normalizeNotificationRoute,
  readPendingNotificationRoute,
  savePendingNotificationRoute,
} from '../src/notifications/notificationRouting';

// Импорт компонентов
import AdminMain from './Admin/AdminMain';
import AdminSettingsScreen from './AdminSettingsScreen';
import GuildTasksScreen from './Admin/GuildTasksScreen';
import ChatScreen from "./Chat/ChatScreen";
import ChatWindow from './Chat/ChatWindow';
import CreateGroupScreen from './Chat/CreateGroupScreen';
import GuildMembersList from "./Chat/GuildMemberList";
import NewGroupChat from "./Chat/NewGroupChat";
import CommunityChannelsScreen from './Community/CommunityChannelsScreen';
import CommunityScreen from './Community/CommunityScreen';
import CulturalPlanner from './Culture/CulturalPlanner';
import CulturalSettlements from './Culture/CulturalSettlements';
import CulturalOptions from './Culture/CulturalOptions';
import TechnologyCosts from './Culture/TechnologyCosts';
import Planning from './Culture/Planning';
import ObstaclesMap from './Culture/ObstaclesMap';
import SettlementGamePlanner from './Culture/SettlementGamePlanner';
import AddGBComponent from './GB/AddGBComponent';
import GBChatWindow from './GB/GBChatWindow';
import GBCenterScreen from './GB/GBCenterScreen';
import GBExpress from './GB/GBExpress';
import GBGuarant from './GB/GBGuarant';
import GBGuaranteeDebugScreen from './GB/GBGuaranteeDebugScreen';
import GBGuaranteesScreen from './GB/GBGuaranteesScreen';
import GBNewExpress from './GB/GBNewExpress';
import GBScreen from "./GB/GBScreen";
import MyGB from './GB/MyGB';
import MyGBCenterScreen from './GB/MyGBCenterScreen';
import NewGBChat from './GB/NewGBChat';
import GBGScreen from './GBG/GBGscreen';
import AddSchedule from './Profile/AddSchedule';
import LanguageSelector from './Profile/LanguageSelector';
import ProfileData from './Profile/ProfileData';
import ProfileMain from './Profile/ProfileMain';
import SleepSchedule from './Profile/SleepSchedule';
import QuantScreen from './Quant';
import FoeSyncScreen from './FoeSync/FoeSyncScreen';
import { FoeSyncProvider } from './FoeSync/FoeSyncProvider';
import BonusesModal from './FoeSync/BonusesModal';
import { refreshGbgWidgetCacheFromFirebase } from './GBG/gbgWidgetRefresh';
import { recordWidgetFcmReceipt } from './GBG/widgetCache';
import YouTubeVideosScreen from './YouTube/YouTubeVideosScreen';
import { YOUTUBE_CHANNEL_NAME } from './YouTube/youtubeChannel';

// НОВЫЕ ИКОНКИ
import Admin from "./ico/menu/setting.svg";
import Boat from "./ico/boat.svg";
import Chat from "./ico/menu/chat.svg";
import GVG from "./ico/menu/GVG.svg";
import GB from "./ico/menu/GB.svg";
import Community from "./ico/menu/people.svg";
import Profile from "./ico/menu/user.svg";
import QuantIcon from "./ico/quant.svg";

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();
const navigationRef = createNavigationContainerRef();
const NOTIFICATION_ROUTE_VALIDATION_TIMEOUT_MS = 12000;
const GREAT_BUILDINGS_REFRESH_COOLDOWN_MS = 60 * 1000;

const createPermanentNotificationRouteError = (message) => {
  const error = new Error(message);
  error.isPermanentNotificationRouteError = true;
  return error;
};

const isPermanentNotificationRouteFailure = (error) => {
  if (error?.isPermanentNotificationRouteError) return true;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    message.includes('permission denied')
  );
};

const withNotificationRouteTimeout = async (promise) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        'Не вдалося перевірити доступ. Перевірте інтернет і натисніть сповіщення ще раз.'
      );
      error.code = 'notification-route/timeout';
      reject(error);
    }, NOTIFICATION_ROUTE_VALIDATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

// --- ДИЗАЙН СИСТЕМА ---
const COLORS = {
  background: "#0f1115",
  surface: "#152330",
  surfaceHighlight: "#1b2b3b",
  primary: "#4ea1ff",
  textPrimary: "#f4f7fb",
  textSecondary: "#9aa3b2",
  danger: "#ff5b5b",
  separator: "#36516a"
};

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORS.primary,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.textPrimary,
    border: COLORS.separator,
    notification: COLORS.danger,
  },
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

function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="CommunityHome"
        component={CommunityScreen}
        options={{
          title: 'Спільнота',
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
        }}
      />
      <Stack.Screen
        name="CommunityChannels"
        component={CommunityChannelsScreen}
        options={({ navigation }) => ({
          title: 'Спільнота',
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

function YouTubeStack() {
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="YouTubeVideos"
        component={YouTubeVideosScreen}
        options={{
          title: YOUTUBE_CHANNEL_NAME,
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
        }}
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

function QuantStack() {
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="QuantScreen"
        component={QuantScreen}
        options={{
          title: 'Квантові вторгнення',
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerRight: () => (
            <View
              accessibilityRole="button"
              accessibilityLabel="Немає запланованих секторів"
              accessibilityState={{ disabled: true }}
              style={{ width: 44, height: 44, marginRight: 10, alignItems: 'center', justifyContent: 'center', opacity: 0.65 }}
            >
              <MaterialIcons name="volume-off" size={24} color={COLORS.textPrimary} />
            </View>
          ),
        }}
      />
    </Stack.Navigator>
  );
}

function FoeSyncStack() {
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="FoeSyncScreen"
        component={FoeSyncScreen}
        options={{
          title: 'Місто',
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
        }}
      />
    </Stack.Navigator>
  );
}

function GBStack({ isDeveloper = false }) {
  const { t } = useTranslation();

  // This hook belongs to the GB drawer route, not to GBCenterScreen. The
  // drawer route stays focused while navigating through its child screens,
  // so returning from a child does not request another refresh.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const requestRefresh = async () => {
        try {
          const guildId = String(
            (await AsyncStorage.getItem('guildId')) || ''
          ).trim();
          if (!guildId || cancelled) return;

          const requestedAt = Date.now();
          await database()
            .ref(`guilds/${guildId}/refreshTriggers/greatBuildings`)
            .transaction((current) => {
              const previousRequestedAt = Number(current) || 0;
              return requestedAt - previousRequestedAt < GREAT_BUILDINGS_REFRESH_COOLDOWN_MS
                ? undefined
                : requestedAt;
            }, undefined, false);
        } catch (error) {
          if (!cancelled) {
            console.warn(
              'Не вдалося створити тригер оновлення ВС:',
              error?.message || error
            );
          }
        }
      };

      requestRefresh();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="GBCenter"
        component={GBCenterScreen}
        options={{
          title: 'Центр ВС',
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
        }}
      />
      <Stack.Screen
        name="GBScreen"
        component={GBScreen}
        options={({ navigation }) => ({
          title: 'Прокачка Великих Споруд',
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('NewGBChat', { from: 'GBChatList' })} style={{ marginRight: 15 }}>
              <Ionicons name="add" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="MyGBCenter"
        component={MyGBCenterScreen}
        options={{
          title: 'Мої ВС',
        }}
      />
      <Stack.Screen
        name="GBGuarantees"
        options={{ title: t('gbGuarantees.title') }}
      >
        {(props) => <GBGuaranteesScreen {...props} isDeveloper={isDeveloper} />}
      </Stack.Screen>
      {isDeveloper && (
        <Stack.Screen
          name="GBGuaranteeDebug"
          component={GBGuaranteeDebugScreen}
          options={{ title: 'Розподіл місць' }}
        />
      )}
      <Stack.Screen
        name="GBChatWindow"
        component={GBChatWindow}
        options={({ navigation }) => ({
          title: t("gbScreen.gbTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="GBExpress"
        component={GBExpress}
        options={({ navigation }) => ({
          title: 'Експрес прокачка',
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
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
          title: 'Прокачка Великих Споруд',
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="GBGuarant"
        component={GBGuarant}
        options={({ navigation }) => ({
          title: t("gbScreen.gbTitle"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="NewGBChat" component={NewGBChat} options={{ title: t("gbScreen.gbTitle") }} />
    </Stack.Navigator>
  );
}

function AdmintStack({ canAccessTasks = false }) {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="AdminScreen"
        options={() => ({
          title: t("adminStack.adminScreenTitle"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerStyle: { backgroundColor: COLORS.surfaceHighlight, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
          headerShadowVisible: false,
        })}
      >
        {(props) => (
          <AdminMain {...props} canAccessTasks={canAccessTasks} />
        )}
      </Stack.Screen>
      {canAccessTasks && (
        <Stack.Screen
          name="GuildTasks"
          component={GuildTasksScreen}
          options={({ navigation }) => ({
            title: 'Завдання',
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
                <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
      )}
    </Stack.Navigator>
  );
}

function CultureStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="CulturalSettlements"
        component={CulturalSettlements}
        options={() => ({
          title: t("drawer.culture"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerStyle: { backgroundColor: COLORS.surfaceHighlight, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
          headerShadowVisible: false,
        })}
      />
      <Stack.Screen
        name="CulturalOptions"
        component={CulturalOptions}
        options={({ route, navigation }) => ({
          title: t("drawer.culture"),
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                if (route.params?.onSaveCulturalOptions) {
                  const ok = await route.params.onSaveCulturalOptions();
                  if (ok) {
                    navigation.navigate('SettlementGamePlanner', {
                      settlementName: route.params?.settlementName,
                    });
                  }
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
        name="TechnologyCosts"
        component={TechnologyCosts}
        options={({ route, navigation }) => ({
          title: t("drawer.culture"),
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                if (route.params?.onSaveTechnologyCosts) {
                  const ok = await route.params.onSaveTechnologyCosts();
                  if (ok) {
                    navigation.navigate('CulturalOptions', {
                      settlementName: route.params?.settlementName,
                    });
                  }
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
        name="CulturalPlanner"
        component={CulturalPlanner}
        options={{
          title: t("drawer.culture"),
        }}
      />
      <Stack.Screen
        name="Planning"
        component={Planning}
        options={{
          title: t("drawer.culture"),
        }}
      />
      <Stack.Screen
        name="ObstaclesMap"
        component={ObstaclesMap}
        options={({ route, navigation }) => {
          const canSave = Boolean(route.params?.canSaveObstaclesMap);
          return {
            title: t("drawer.culture"),
            headerRight: () => (
              <TouchableOpacity
                disabled={!canSave}
                onPress={async () => {
                  if (canSave && route.params?.onSaveObstaclesMap) {
                    const ok = await route.params.onSaveObstaclesMap();
                    if (ok) {
                      navigation.navigate('CulturalOptions', {
                        settlementName: route.params?.settlementName,
                      });
                    }
                  }
                }}
                style={{ marginRight: 15, opacity: canSave ? 1 : 0.35 }}
              >
                <Ionicons name="checkmark" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            ),
          };
        }}
      />
      <Stack.Screen
        name="SettlementGamePlanner"
        component={SettlementGamePlanner}
        options={({ route }) => ({
          title: t("drawer.culture"),
          headerLeft: () => <DrawerToggleButton tintColor={COLORS.textPrimary} />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (route.params?.onDeleteSettlement) {
                  route.params.onDeleteSettlement();
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
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
          title: 'Прокачка Великих Споруд',
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
function CustomDrawerContent({ onLogout, onManualGuildSwitch, ...props }) {
  const { t } = useTranslation();
  const { guildId, setGuildId } = useContext(GuildContext);
  const [guildName, setGuildName] = useState('');
  const [userName, setUserName] = useState('');
  const [guildImageUrl, setGuildImageUrl] = useState('');
  const [tempData, setTempData] = useState({});
  const [isWorldSelectVisible, setIsWorldSelectVisible] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [bonusesOpen, setBonusesOpen] = useState(false);

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
          for (let key in (usersData.userGuilds || {})) {
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
    const expandedHeight = Math.min(Object.keys(tempData).length * 56 + 56, 224);
    Animated.timing(animatedHeight, {
      toValue: isWorldSelectVisible ? expandedHeight : 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [animatedHeight, isWorldSelectVisible, tempData]);

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: isWorldSelectVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isWorldSelectVisible, rotation]);

  const handleChevronPress = () => {
    setIsWorldSelectVisible(!isWorldSelectVisible);
  };

  const handleGuildPress = async (newGuildId) => {
    try {
      await onManualGuildSwitch?.();
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

  const handleCultureMenuPress = async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const activeGuildId = await AsyncStorage.getItem('guildId');

      if (!userId || !activeGuildId) {
        props.navigation.navigate('culture', { screen: 'CulturalSettlements' });
        return;
      }

      const settlementPath = `users/${userId}/userGuilds/${activeGuildId}/settlement`;
      const settlementSnap = await database().ref(settlementPath).once('value');

      if (!settlementSnap.exists()) {
        props.navigation.navigate('culture', { screen: 'CulturalSettlements' });
        return;
      }

      const settlementData = settlementSnap.val() || {};
      const status = settlementData.status;
      const selectedSettlement = settlementData.settlementName;

      if (status === 'game') {
        props.navigation.navigate('culture', {
          screen: 'SettlementGamePlanner',
          params: { settlementName: selectedSettlement },
        });
        return;
      }

      if (status === 'edit' && selectedSettlement) {
        const [techSnap, obstacleSnap] = await Promise.all([
          database().ref(`${settlementPath}/tech`).once('value'),
          database().ref(`${settlementPath}/sectorObstaclesStatic`).once('value'),
        ]);

        props.navigation.navigate('culture', {
          screen: 'CulturalOptions',
          params: {
            settlementName: selectedSettlement,
            hasTech: techSnap.exists(),
            hasObstacles: obstacleSnap.exists(),
          },
        });
        return;
      }

      props.navigation.navigate('culture', { screen: 'CulturalSettlements' });
    } catch (error) {
      console.error('Помилка під час відкриття культурного поселення:', error);
      props.navigation.navigate('culture', { screen: 'CulturalSettlements' });
    }
  };

  const performLogout = async () => {
    if (logoutBusy || typeof onLogout !== 'function') return;
    setLogoutBusy(true);

    try {
      try {
        await onManualGuildSwitch?.();
      } catch (error) {
        console.warn(
          'Не вдалося очистити маршрут сповіщення перед виходом:',
          error?.code || error?.message || 'unknown'
        );
      }
      await onLogout();
    } catch (error) {
      console.error(
        'Помилка під час виходу:',
        error?.code || error?.message || 'unknown'
      );
      setLogoutBusy(false);
      Alert.alert(
        t('drawer.logoutErrorTitle'),
        t('drawer.logoutErrorMessage')
      );
    }
  };

  const handleLogoutPress = () => {
    if (logoutBusy) return;
    Alert.alert(
      t('drawer.logoutTitle'),
      t('drawer.logoutMessage'),
      [
        { text: t('drawer.logoutCancel'), style: 'cancel' },
        {
          text: t('drawer.logoutConfirm'),
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  return (
    <View style={styles.drawerContent}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <BonusesModal visible={bonusesOpen} onClose={() => setBonusesOpen(false)} />

      <View style={styles.header}>
        <View style={styles.profileRow}>
          <TouchableOpacity
            style={styles.avatarContainer}
            activeOpacity={0.7}
            onPress={() => setBonusesOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Показати бонуси з гри"
          >
            {guildImageUrl ? (
              <Image source={{ uri: guildImageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Profile width="24" height="24" fill={COLORS.textSecondary} />
              </View>
            )}
          </TouchableOpacity>

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
        <ScrollView
          contentContainerStyle={styles.worldsInner}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {Object.keys(tempData).map(key => (
            <TouchableOpacity key={key} style={styles.worldItem} onPress={() => handleGuildPress(key)}>
              {tempData[key].imageUrl ?
                <Image source={{ uri: tempData[key].imageUrl }} style={styles.smallAvatar} /> :
                <View style={styles.smallAvatarPlaceholder} />
              }
              <Text style={styles.worldItemText}>{tempData[key].guildName}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setIsWorldSelectVisible(false);
              props.navigation.navigate('AddWorld');
            }}
            style={styles.worldItem}
          >
            <View style={styles.addWorldIcon}>
              <MaterialIcons name="add" size={20} color="#FFF" />
            </View>
            <Text style={[styles.worldItemText, { color: COLORS.primary }]}>{t("customDrawer.addWorld")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      <ScrollView
        style={styles.navigationScroll}
        contentContainerStyle={styles.navigationScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>{"ОСНОВНЕ"}</Text>

        <View style={styles.menuContainer}>
          {props.state.routes.map((route, index) => {
          const focused = props.state.index === index;
          const { drawerLabel, drawerIconComponent } = props.descriptors[route.key].options;
          const shouldShowTopSeparator = route.name === 'youtube' || route.name === 'profile';

          // Колір іконки НЕ залежить від вибору (частина іконок — SVG із
          // зашитими кольорами, тож зміна виглядала неоднаково). Активний
          // стан — підкладка за іконкою, яскравіший текст і смужка збоку.
          const iconColor = COLORS.textSecondary;
          const textColor = focused ? COLORS.textPrimary : COLORS.textSecondary;
          const bgColor = focused ? COLORS.surface : 'transparent';

          if (!drawerLabel) return null;

          return (
            <React.Fragment key={route.key}>
              {shouldShowTopSeparator && <View style={styles.separator} />}
              <TouchableOpacity
                onPress={() => (route.name === 'culture' ? handleCultureMenuPress() : props.navigation.navigate(route.name))}
                style={[styles.menuItem, { backgroundColor: bgColor }]}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
                  <View style={{ opacity: focused ? 1 : 0.7 }}>
                    {drawerIconComponent && drawerIconComponent({ color: iconColor })}
                  </View>
                </View>
                <Text style={[styles.menuItemText, { color: textColor, fontWeight: focused ? '600' : '500' }]}>
                  {drawerLabel}
                </Text>
                {focused && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            </React.Fragment>
          );
          })}
          <View style={styles.logoutSeparator} />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('drawer.logoutLabel')}
            accessibilityState={{ disabled: logoutBusy }}
            activeOpacity={0.8}
            disabled={logoutBusy}
            onPress={handleLogoutPress}
            style={[styles.menuItem, logoutBusy && styles.disabledMenuItem]}
          >
            <View style={styles.iconWrapper}>
              {logoutBusy ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <MaterialIcons name="logout" size={24} color={COLORS.danger} />
              )}
            </View>
            <Text style={[styles.menuItemText, styles.logoutMenuItemText]}>
              {t('drawer.logoutLabel')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function AppNavigator({ onReady, onManualGuildSwitch, onLogout }) {
  const { guildId } = useContext(GuildContext);
  const { t } = useTranslation();
  const [hasLeaderAccess, setHasLeaderAccess] = React.useState(false);
  const [hasTesterAccess, setHasTesterAccess] = React.useState(false);
  const [isDeveloper, setIsDeveloper] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let userRoleRef = null;
    let roleListener = null;
    const activeGuildId = String(guildId || "");

    const resetRoleAccess = () => {
      if (cancelled) return;
      setHasLeaderAccess(false);
      setHasTesterAccess(false);
      setIsDeveloper(false);
    };

    const subscribeToRole = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!userId || !activeGuildId) {
          resetRoleAccess();
          return;
        }
        if (cancelled) return;

        userRoleRef = database().ref(
          `users/${userId}/userGuilds/${activeGuildId}/role`
        );
        roleListener = (snapshot) => {
          if (cancelled) return;
          const role = snapshot.exists() ? snapshot.val() : null;
          const canUseLeaderFeatures = hasLeaderFeatures(role);

          setHasLeaderAccess(canUseLeaderFeatures);
          setHasTesterAccess(hasTesterFeatures(role));
          setIsDeveloper(canAccessGuildTasks(role));

        };
        userRoleRef.on('value', roleListener, resetRoleAccess);
      } catch (_error) {
        resetRoleAccess();
      }
    };

    subscribeToRole();
    return () => {
      cancelled = true;
      if (userRoleRef && roleListener) {
        userRoleRef.off('value', roleListener);
      }
    };
  }, [guildId]);

  const renderIcon = (IconComponent) => {
    function DrawerIcon({ color }) {
      return (
        <IconComponent
          width={24}
          height={24}
          fill={color}
          color={color}
          style={{ color }}
        />
      );
    }

    return DrawerIcon;
  };

  return (
    <NavigationContainer
      key={guildId}
      ref={navigationRef}
      theme={navigationTheme}
      onReady={onReady}
    >
      <Drawer.Navigator
        backBehavior="history"
        drawerContent={(props) => (
          <CustomDrawerContent
            {...props}
            onLogout={onLogout}
            onManualGuildSwitch={onManualGuildSwitch}
          />
        )}
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
          name="GB"
          options={{
            drawerLabel: t("drawer.gbLabel"),
            drawerIconComponent: renderIcon(GB)
          }}
        >
          {() => <GBStack isDeveloper={isDeveloper} />}
        </Drawer.Screen>
        <Drawer.Screen
          name="GBG"
          component={GBGStack}
          options={{
            drawerLabel: t("drawer.pbgLabel"),
            drawerIconComponent: renderIcon(GVG)
          }}
        />
        <Drawer.Screen
          name="Quant"
          component={QuantStack}
          options={{
            drawerLabel: 'Квантові вторгнення',
            drawerIconComponent: renderIcon(QuantIcon)
          }}
        />
        <Drawer.Screen
          name="Community"
          component={CommunityStack}
          options={{
            drawerLabel: 'Спільнота',
            drawerIconComponent: renderIcon(Community)
          }}
        />
        <Drawer.Screen
          name="FoeSync"
          component={FoeSyncStack}
          options={{
            // lazy:false — екран монтується одразу з меню, тож вікно гри
            // починає завантажуватись у фоні ще до відкриття пункту.
            lazy: false,
            drawerLabel: 'Місто',
            drawerIconComponent: ({ color }) => (
              <MaterialIcons name="location-city" size={24} color={color} />
            )
          }}
        />
        <Drawer.Screen
          name="culture"
          component={CultureStack}
          options={{
            drawerLabel: hasTesterAccess ? t("drawer.culture") : null,
            drawerIconComponent: renderIcon(Boat)
          }}
        />
        <Drawer.Screen
          name="youtube"
          component={YouTubeStack}
          options={{
            drawerLabel: YOUTUBE_CHANNEL_NAME,
            drawerIconComponent: ({ color }) => (
              <FontAwesomeIcon icon={faYoutube} size={24} color={color} />
            )
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
        {hasLeaderAccess && (
          <Drawer.Screen
            name="admin"
            options={{
              drawerLabel: t("drawer.adminLabel"),
              drawerIconComponent: renderIcon(Admin)
            }}
          >
            {() => <AdmintStack canAccessTasks={isDeveloper} />}
          </Drawer.Screen>
        )}
        <Drawer.Screen
          name="AddWorld"
          options={{ drawerLabel: null }}
        >
          {(screenProps) => (
            <AdminSettingsScreen
              {...screenProps}
              addWorldMode
              onBeforeGuildSwitch={onManualGuildSwitch}
            />
          )}
        </Drawer.Screen>
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function MainContent({ onLogout }) {
  const { guildId, switchGuild } = useContext(GuildContext);
  const [readyGuildId, setReadyGuildId] = useState(null);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState(null);
  const guildIdRef = useRef(guildId);
  const processingRouteKeysRef = useRef(new Set());
  const handledRouteKeysRef = useRef(new Set());
  const routeGenerationRef = useRef(0);
  const activeNotificationRouteRef = useRef(null);
  const guildSwitchChainRef = useRef(Promise.resolve());
  const manualRouteCancellationEpochRef = useRef(0);
  const manualRouteCancellationInProgressRef = useRef(false);

  useEffect(() => {
    guildIdRef.current = guildId;
  }, [guildId]);

  const switchToNotificationGuild = useCallback(
    (targetGuildId, generation) => {
      const normalizedTargetGuildId = String(targetGuildId || "");

      const performSwitch = async () => {
        if (generation !== routeGenerationRef.current) {
          return { completed: false, switched: false };
        }

        const currentGuildId = String(guildIdRef.current || "");
        if (!normalizedTargetGuildId || normalizedTargetGuildId === currentGuildId) {
          return { completed: true, switched: false };
        }

        guildIdRef.current = normalizedTargetGuildId;
        try {
          await switchGuild(normalizedTargetGuildId);
          return { completed: true, switched: true };
        } catch (error) {
          guildIdRef.current = currentGuildId;
          throw error;
        }
      };

      const result = guildSwitchChainRef.current.then(
        performSwitch,
        performSwitch
      );
      guildSwitchChainRef.current = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
    [switchGuild]
  );

  const clearSectorNotifications = useCallback(async (targetGuildId = "") => {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const sectorNotifications = displayed.filter(({ notification }) => {
        const channelId = notification?.android?.channelId;
        const type = notification?.data?.type;
        const notificationGuildId = String(notification?.data?.guildId || "");
        if (targetGuildId && notificationGuildId !== String(targetGuildId)) {
          return false;
        }
        return (
          type === 'gbg_sector_open' ||
          type === 'gbg_build_plan' ||
          type === 'gbg_help' ||
          channelId === 'gbg_sector' ||
          channelId === 'gbg_sector_silent' ||
          channelId === 'gbg_build'
        );
      });

      await Promise.all(
        sectorNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
      );
    } catch (error) {
      console.log('❌ Помилка очищення секторних пушів:', error?.message || String(error));
    }
  }, []);

  const clearChatNotifications = useCallback(async (chatId, targetGuildId = "") => {
    if (!chatId) return;
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const chatNotifications = displayed.filter(({ notification }) => {
        const type = notification?.data?.type;
        const notificationChatId = notification?.data?.chatId;
        const notificationGuildId = String(notification?.data?.guildId || "");
        return (
          type === 'chat_message' &&
          String(notificationChatId) === String(chatId) &&
          (!targetGuildId || notificationGuildId === String(targetGuildId))
        );
      });

      await Promise.all(
        chatNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
      );
    } catch (error) {
      console.log('❌ Помилка очищення чат-пушів:', error?.message || String(error));
    }
  }, []);

  const clearCultureNotifications = useCallback(async (settlementName = "", targetGuildId = "") => {
    try {
      const displayed = await notifee.getDisplayedNotifications();
      const cultureNotifications = displayed.filter(({ notification }) => {
        const type = notification?.data?.type;
        const notificationSettlementName = notification?.data?.settlementName;
        const notificationGuildId = String(notification?.data?.guildId || "");
        if (type !== 'culture_build_ready') return false;
        if (targetGuildId && notificationGuildId !== String(targetGuildId)) {
          return false;
        }
        if (!settlementName) return true;
        return String(notificationSettlementName) === String(settlementName);
      });

      await Promise.all(
        cultureNotifications.map((item) => notifee.cancelDisplayedNotification(item.id))
      );
    } catch (error) {
      console.log('❌ Помилка очищення culture-пушів:', error?.message || String(error));
    }
  }, []);

  const clearStoredNotificationRoute = useCallback(async (expectedRouteOrKey) => {
    try {
      return await clearPendingNotificationRoute(expectedRouteOrKey);
    } catch (error) {
      console.log(
        '❌ Помилка очищення збереженого переходу зі сповіщення:',
        error?.message || String(error)
      );
      return false;
    }
  }, []);

  const validateNotificationRoute = useCallback(async (route) => {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      throw createPermanentNotificationRouteError(
        'Користувача не знайдено. Увійдіть у застосунок ще раз.'
      );
    }

    if (!route.guildId) {
      return { worldName: "" };
    }

    const membershipRef = database().ref(
      `guilds/${route.guildId}/guildUsers/${userId}`
    );
    const worldNameRef = database().ref(`guilds/${route.guildId}/worldName`);
    const requests = [
      membershipRef.once('value'),
      worldNameRef.once('value'),
    ];

    if (route.type === 'chat_message') {
      requests.push(
        database()
          .ref(
            `guilds/${route.guildId}/chats/${route.chatId}/members/${userId}`
          )
          .once('value')
      );
    } else if (route.type === 'culture_build_ready') {
      requests.push(
        database()
          .ref(`users/${userId}/userGuilds/${route.guildId}/role`)
          .once('value')
      );
    }

    const [membershipSnap, worldNameSnap, routeAccessSnap] =
      await withNotificationRouteTimeout(Promise.all(requests));

    if (!membershipSnap.exists()) {
      throw createPermanentNotificationRouteError(
        'Ви більше не є учасником гільдії з цього сповіщення.'
      );
    }

    if (route.type === 'chat_message') {
      if (!routeAccessSnap?.exists()) {
        throw createPermanentNotificationRouteError(
          'Цей чат не існує або у вас більше немає до нього доступу.'
        );
      }
    } else if (
      route.type === 'culture_build_ready' &&
      !hasTesterFeatures(routeAccessSnap?.val())
    ) {
      throw createPermanentNotificationRouteError(
        'У вас немає доступу до культурних поселень у цьому світі.'
      );
    }

    return {
      worldName: worldNameSnap.exists() ? String(worldNameSnap.val() || "") : "",
    };
  }, []);

  const queueNotificationRoute = useCallback(async (source, expectedEpoch = null) => {
    if (
      expectedEpoch !== null &&
      (
        expectedEpoch !== manualRouteCancellationEpochRef.current ||
        manualRouteCancellationInProgressRef.current
      )
    ) {
      return;
    }

    const initialRoute = normalizeNotificationRoute(source);
    if (!initialRoute) return;

    const targetGuildId = initialRoute.guildId || String(guildIdRef.current || "");
    const route = normalizeNotificationRoute({
      ...initialRoute,
      guildId: targetGuildId,
    });
    if (!route) return;

    if (handledRouteKeysRef.current.has(route.key)) {
      await clearStoredNotificationRoute(route.key);
      return;
    }

    if (processingRouteKeysRef.current.has(route.key)) {
      return;
    }

    const generation = routeGenerationRef.current + 1;
    routeGenerationRef.current = generation;
    processingRouteKeysRef.current.clear();
    processingRouteKeysRef.current.add(route.key);
    activeNotificationRouteRef.current = { ...route, generation };
    setPendingNotificationRoute(null);

    try {
      await savePendingNotificationRoute(route);
      if (generation !== routeGenerationRef.current) {
        processingRouteKeysRef.current.delete(route.key);
        if (activeNotificationRouteRef.current?.generation === generation) {
          activeNotificationRouteRef.current = null;
        }
        return;
      }

      const { worldName } = await validateNotificationRoute(route);
      if (generation !== routeGenerationRef.current) {
        processingRouteKeysRef.current.delete(route.key);
        if (activeNotificationRouteRef.current?.generation === generation) {
          activeNotificationRouteRef.current = null;
        }
        return;
      }

      const switchResult = await switchToNotificationGuild(
        route.guildId,
        generation
      );
      if (
        !switchResult.completed ||
        generation !== routeGenerationRef.current
      ) {
        processingRouteKeysRef.current.delete(route.key);
        if (activeNotificationRouteRef.current?.generation === generation) {
          activeNotificationRouteRef.current = null;
        }
        return;
      }

      setPendingNotificationRoute({ ...route, generation });

      if (switchResult.switched && Platform.OS === 'android') {
        ToastAndroid.show(
          worldName
            ? `Перемкнуто на ${worldName}`
            : 'Перемкнуто на світ зі сповіщення',
          ToastAndroid.SHORT
        );
      }
    } catch (error) {
      processingRouteKeysRef.current.delete(route.key);
      if (generation !== routeGenerationRef.current) return;

      setPendingNotificationRoute((current) =>
        current?.generation === generation ? null : current
      );
      if (isPermanentNotificationRouteFailure(error)) {
        if (activeNotificationRouteRef.current?.generation === generation) {
          activeNotificationRouteRef.current = null;
        }
        await clearStoredNotificationRoute(route);
      }
      Alert.alert(
        'Не вдалося відкрити сповіщення',
        error?.message || 'Перевірте доступ до світу та чату.'
      );
    }
  }, [
    clearStoredNotificationRoute,
    switchToNotificationGuild,
    validateNotificationRoute,
  ]);

  useEffect(() => {
    const route = pendingNotificationRoute;
    if (!route || !guildId || !readyGuildId) return;
    if (route.generation !== routeGenerationRef.current) return;
    if (String(route.guildId || guildId) !== String(guildId)) return;
    if (String(readyGuildId) !== String(guildId)) return;
    if (!navigationRef.isReady()) return;

    let cancelled = false;
    const processingRouteKeys = processingRouteKeysRef.current;

    const openRoute = async () => {
      try {
        if (route.type === 'chat_message') {
          navigationRef.navigate('ChatList', {
            screen: 'ChatWindow',
            params: {
              chatId: route.chatId,
              guildId: route.guildId,
              messageId: route.messageId,
            },
          });
          await clearChatNotifications(route.chatId, route.guildId);
        } else if (
          route.type === 'gbg_sector_open' ||
          route.type === 'gbg_build_plan' ||
          route.type === 'gbg_help'
        ) {
          navigationRef.navigate('GBG', { screen: 'GBGScreen' });
          await clearSectorNotifications(route.guildId);
        } else if (route.type === 'culture_build_ready') {
          if (route.settlementName) {
            navigationRef.navigate('culture', {
              screen: 'SettlementGamePlanner',
              params: { settlementName: route.settlementName },
            });
          } else {
            navigationRef.navigate('culture', {
              screen: 'CulturalSettlements',
            });
          }
          await clearCultureNotifications(
            route.settlementName,
            route.guildId
          );
        } else if (route.type === 'express_upgrade') {
          navigationRef.navigate('GB', { screen: 'GBExpress' });
        } else if (route.type === 'quantum_sector_open') {
          navigationRef.navigate('Quant', { screen: 'QuantScreen' });
        }

        if (
          cancelled ||
          route.generation !== routeGenerationRef.current
        ) {
          processingRouteKeys.delete(route.key);
          if (activeNotificationRouteRef.current?.generation === route.generation) {
            activeNotificationRouteRef.current = null;
          }
          return;
        }

        handledRouteKeysRef.current.add(route.key);
        processingRouteKeys.delete(route.key);
        if (activeNotificationRouteRef.current?.generation === route.generation) {
          activeNotificationRouteRef.current = null;
        }
        setPendingNotificationRoute((current) =>
          current?.generation === route.generation ? null : current
        );
        await clearStoredNotificationRoute(route);
      } catch (error) {
        processingRouteKeys.delete(route.key);
        if (activeNotificationRouteRef.current?.generation === route.generation) {
          activeNotificationRouteRef.current = null;
        }
        if (
          cancelled ||
          route.generation !== routeGenerationRef.current
        ) {
          return;
        }

        setPendingNotificationRoute((current) =>
          current?.generation === route.generation ? null : current
        );
        await clearStoredNotificationRoute(route);
        Alert.alert(
          'Не вдалося відкрити сповіщення',
          error?.message || 'Спробуйте ще раз.'
        );
      }
    };

    openRoute();
    return () => {
      cancelled = true;
      if (route.generation !== routeGenerationRef.current) {
        processingRouteKeys.delete(route.key);
      }
    };
  }, [
    clearChatNotifications,
    clearCultureNotifications,
    clearSectorNotifications,
    clearStoredNotificationRoute,
    guildId,
    pendingNotificationRoute,
    readyGuildId,
  ]);

  const cancelNotificationRouteForManualSwitch = useCallback(async () => {
    const cancellationCutoff = Date.now();
    const routeToCancel = activeNotificationRouteRef.current;
    manualRouteCancellationInProgressRef.current = true;
    manualRouteCancellationEpochRef.current += 1;
    routeGenerationRef.current += 1;
    processingRouteKeysRef.current.clear();
    activeNotificationRouteRef.current = null;
    setPendingNotificationRoute(null);

    let storedRouteToCancel = null;
    try {
      storedRouteToCancel = await readPendingNotificationRoute();
    } catch (error) {
      console.log(
        '❌ Помилка читання переходу під час ручного перемикання:',
        error?.message || String(error)
      );
    }

    await guildSwitchChainRef.current;

    const routesToCancel = [routeToCancel, storedRouteToCancel].filter(
      (route, index, routes) =>
        route &&
        Number(route.createdAt || 0) <= cancellationCutoff &&
        routes.findIndex(
          (candidate) =>
            candidate?.key === route.key &&
            candidate?.createdAt === route.createdAt
        ) === index
    );

    for (const route of routesToCancel) {
      await clearStoredNotificationRoute(route);
    }
    manualRouteCancellationInProgressRef.current = false;
  }, [clearStoredNotificationRoute]);

  const restorePendingNotificationRoute = useCallback(async () => {
    if (manualRouteCancellationInProgressRef.current) return;
    const expectedEpoch = manualRouteCancellationEpochRef.current;
    try {
      const storedRoute = await readPendingNotificationRoute();
      if (
        storedRoute &&
        expectedEpoch === manualRouteCancellationEpochRef.current
      ) {
        await queueNotificationRoute(storedRoute, expectedEpoch);
      }
    } catch (error) {
      console.log(
        '❌ Помилка відновлення переходу зі сповіщення:',
        error?.message || String(error)
      );
    }
  }, [queueNotificationRoute]);

  useEffect(() => {
    const retryTimers = new Set();
    const restoreWithRetry = () => {
      restorePendingNotificationRoute();
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        restorePendingNotificationRoute();
      }, 750);
      retryTimers.add(timer);
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        restoreWithRetry();
        clearSectorNotifications(String(guildIdRef.current || ""));
        clearCultureNotifications("", String(guildIdRef.current || ""));
      }
    });

    restoreWithRetry();
    clearSectorNotifications(String(guildIdRef.current || ""));
    clearCultureNotifications("", String(guildIdRef.current || ""));

    return () => {
      subscription.remove();
      retryTimers.forEach((timer) => clearTimeout(timer));
      retryTimers.clear();
    };
  }, [
    clearCultureNotifications,
    clearSectorNotifications,
    restorePendingNotificationRoute,
  ]);

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

    const unsubscribeOpenedApp = messaging().onNotificationOpenedApp(
      (remoteMessage) => {
        console.log(
          'Notification caused app to open from background state:',
          remoteMessage.notification
        );
        queueNotificationRoute(remoteMessage);
      }
    );

    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
        const notification = detail?.notification;
        queueNotificationRoute({
          ...(notification?.data || {}),
          notificationEventId:
            notification?.data?.notificationEventId ||
            notification?.id ||
            "",
        });
      }
    });

    const initialNotificationEpoch =
      manualRouteCancellationEpochRef.current;

    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log(
            'Notification caused app to open from quit state:',
            remoteMessage.notification
          );
          queueNotificationRoute(
            remoteMessage,
            initialNotificationEpoch
          );
        }
      })
      .catch((error) => {
        console.log(
          '❌ Помилка читання початкового FCM-сповіщення:',
          error?.message || String(error)
        );
      });

    notifee
      .getInitialNotification()
      .then((initialNotification) => {
        if (initialNotification?.notification) {
          const notification = initialNotification.notification;
          queueNotificationRoute(
            {
              ...(notification.data || {}),
              notificationEventId:
                notification.data?.notificationEventId ||
                notification.id ||
                "",
            },
            initialNotificationEpoch
          );
        }
      })
      .catch((error) => {
        console.log(
          '❌ Помилка читання початкового Notifee-сповіщення:',
          error?.message || String(error)
        );
      });

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
          importance: AndroidImportance.LOW,
          vibration: false,
          lights: false,
        });

        // ✅ Канал рекомендацій забудови ПБГ
        await notifee.createChannel({
          id: 'gbg_build',
          name: 'GBG Build Recommendations',
          importance: AndroidImportance.HIGH,
          sound: 'build',
        });

        // ✅ Канал чату зі звуком
        await notifee.createChannel({
          id: 'chat_messages',
          name: 'Chat Messages Channel',
          importance: AndroidImportance.HIGH,
          sound: 'smeh_minonovhasms',
        });

        // Повідомлення в чаті від користувача з роллю GBGbot
        await notifee.createChannel({
          id: 'chat_messages_gbg_bot_alarm',
          name: 'GBG Bot Chat Messages',
          importance: AndroidImportance.HIGH,
          sound: 'alarm',
        });

        // ✅ Канал чату без звуку
        await notifee.createChannel({
          id: 'chat_messages_silent',
          name: 'Chat Messages Silent',
          importance: AndroidImportance.LOW,
          vibration: false,
          lights: false,
        });

        await notifee.createChannel({
          id: 'culture_settlement_kolokol',
          name: 'Culture Settlement Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'kolokol',
        });

        await notifee.createChannel({
          id: 'culture_settlement_silent',
          name: 'Culture Settlement Silent',
          importance: AndroidImportance.LOW,
          vibration: false,
          lights: false,
        });

        await notifee.createChannel({
          id: 'express_upgrade',
          name: 'Express Upgrade Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'kirpich',
        });

        await notifee.createChannel({
          id: 'quantum_sector',
          name: 'Quantum Sector Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'quant',
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

        // ✅ data-only widget refresh: оновлюємо кеш віджета без нотифікації
        if (remoteMessage?.data?.type === 'gbg_widget_refresh') {
          const notificationGuildId = String(
            remoteMessage?.data?.guildId || ''
          );
          const activeGuildId = String(guildIdRef.current || '');
          if (
            notificationGuildId &&
            activeGuildId &&
            notificationGuildId !== activeGuildId
          ) {
            return;
          }

          await recordWidgetFcmReceipt({
            type: 'gbg_widget_refresh',
            scope: 'foreground',
            data: remoteMessage?.data || {},
          });

          const nativeBridge = NativeModules?.GbgWidgetBridge;
          if (
            Platform.OS === 'android' &&
            nativeBridge &&
            typeof nativeBridge.enqueueRefresh === 'function'
          ) {
            await nativeBridge.enqueueRefresh();
          } else {
            await refreshGbgWidgetCacheFromFirebase({
              guildId: activeGuildId || notificationGuildId || null,
              reason: 'fcm-foreground',
              sectorId: remoteMessage?.data?.sectorId ? String(remoteMessage.data.sectorId) : '',
            });
          }
          return;
        }

        if (!title && !body) return;

        const messageType = remoteMessage?.data?.type;

        // ✅ sound flag приходить з сервера: "1" або "0"
        const soundFlag = remoteMessage?.data?.sound === '1';
        const scheduleAwareMessage = [
          'gbg_sector_open',
          'gbg_build_plan',
          'gbg_help',
          'culture_build_ready',
          'chat_message',
          'express_upgrade',
          'quantum_sector_open',
        ].includes(messageType);
        const displaySilently = scheduleAwareMessage && !soundFlag;

        const displayChannelId =
          messageType === 'gbg_sector_open'
            ? (soundFlag ? 'gbg_sector' : 'gbg_sector_silent')
            : messageType === 'gbg_build_plan'
              ? (soundFlag ? 'gbg_build' : 'gbg_sector_silent')
            : messageType === 'gbg_help'
              ? (soundFlag ? 'gbg_sector' : 'gbg_sector_silent')
            : messageType === 'culture_build_ready'
              ? (soundFlag ? 'culture_settlement_kolokol' : 'culture_settlement_silent')
            : messageType === 'chat_message'
              ? (soundFlag
                ? (remoteMessage?.data?.chatSound === 'gbg_bot_alarm'
                  ? 'chat_messages_gbg_bot_alarm'
                  : 'chat_messages')
                : 'chat_messages_silent')
            : messageType === 'express_upgrade'
              ? 'express_upgrade'
            : messageType === 'quantum_sector_open'
              ? 'quantum_sector'
              : 'default';

        const notificationData = {
          ...(remoteMessage?.data || {}),
          notificationEventId: String(
            remoteMessage?.data?.notificationEventId ||
            remoteMessage?.messageId ||
            Date.now()
          ),
        };

        await notifee.displayNotification({
          title,
          body,
          data: notificationData,
          android: {
            channelId: displayChannelId,
            importance: displaySilently
              ? AndroidImportance.LOW
              : AndroidImportance.HIGH,
            defaults: displaySilently
              ? [AndroidDefaults.LIGHTS]
              : [AndroidDefaults.ALL],
            pressAction: { id: 'default' },
          },
        });
      });

      return unsubscribeOnMessage;
    };

    const cleanupPromise = setupPushNotifications().catch((error) => {
      console.log(
        '❌ Помилка налаштування локальних сповіщень:',
        error?.message || String(error)
      );
      return null;
    });

    return () => {
      unsubscribeOpenedApp();
      unsubscribeNotifee();
      cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, [queueNotificationRoute]);

  return (
    <MenuProvider>
      <FoeSyncProvider>
        <AppNavigator
          onReady={() => setReadyGuildId(String(guildId || ""))}
          onManualGuildSwitch={cancelNotificationRouteForManualSwitch}
          onLogout={onLogout}
        />
      </FoeSyncProvider>
    </MenuProvider>
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
    backgroundColor: '#0f1115',
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
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: 24,
    marginBottom: 10,
    marginTop: 10,
    letterSpacing: 1,
  },
  navigationScroll: {
    flex: 1,
  },
  navigationScrollContent: {
    paddingBottom: 24,
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
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconWrapperActive: {
    backgroundColor: `${COLORS.primary}22`,
  },
  menuItemText: {
    fontSize: 16,
  },
  logoutMenuItemText: {
    color: COLORS.danger,
    fontWeight: '600',
  },
  disabledMenuItem: {
    opacity: 0.4,
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
  logoutSeparator: {
    height: 1,
    backgroundColor: COLORS.separator,
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 24,
  },
});
