import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebase } from '@react-native-firebase/app';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as Localization from "expo-localization";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DarkThemeColors } from "./constants/theme";
import { GuildContext, GuildProvider } from "./GuildContext";
import i18n from "./i18n";
import { parsePlayerBlock } from "./parsePlayerBlock";

import AdminSettingsScreen from "./components/AdminSettingsScreen";
import AppUpdateChecker from "./components/AppUpdate/AppUpdateChecker";
import MainContent from "./components/MainContent";
import RoleSelectionScreen from "./components/RoleSelectionScreen";
import UserSettingsScreen from "./components/UserSettingsScreen";

const firebaseConfig = {
  apiKey: "AIzaSyA8Qqv9S22rdYGfHiONlZ6Ss2El4EC95hw",
  authDomain: "guildchat-5d8c1.firebaseapp.com",
  databaseURL: "https://guildchat-5d8c1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "guildchat-5d8c1",
  storageBucket: "guildchat-5d8c1.appspot.com",
  messagingSenderId: "220187331504",
  appId: "1:220187331504:web:d7929f971088bf2d946475"
};

const WIDGET_INSTALLATION_ID_KEY = "widgetInstallationId";
const WIDGET_SUBSCRIPTION_GUILD_KEY = "widgetSubscriptionGuildId";
const WIDGET_SUBSCRIPTION_USER_KEY = "widgetSubscriptionUserId";
let widgetInstallationIdPromise = null;
let pushDeviceRegistrationQueue = Promise.resolve();

const getOrCreateWidgetInstallationId = () => {
  if (!widgetInstallationIdPromise) {
    widgetInstallationIdPromise = (async () => {
      const storedId = await AsyncStorage.getItem(WIDGET_INSTALLATION_ID_KEY);
      if (storedId) return storedId;

      const generatedId = [
        "installation",
        Platform.OS,
        Date.now().toString(36),
        Math.random().toString(36).slice(2, 12),
      ].join("_");
      await AsyncStorage.setItem(WIDGET_INSTALLATION_ID_KEY, generatedId);
      return generatedId;
    })().catch((error) => {
      widgetInstallationIdPromise = null;
      throw error;
    });
  }
  return widgetInstallationIdPromise;
};

const registerPushDeviceOnce = async ({
  token,
  guildId: explicitGuildId = null,
}) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;

  const [
    userId,
    storedGuildId,
    storedInstallationId,
    previousGuildId,
    previousUserId,
  ] = await Promise.all([
    AsyncStorage.getItem("userId"),
    AsyncStorage.getItem("guildId"),
    AsyncStorage.getItem(WIDGET_INSTALLATION_ID_KEY),
    AsyncStorage.getItem(WIDGET_SUBSCRIPTION_GUILD_KEY),
    AsyncStorage.getItem(WIDGET_SUBSCRIPTION_USER_KEY),
  ]);

  if (!userId) {
    if (storedInstallationId && (previousGuildId || previousUserId)) {
      const cleanupUpdates = {};
      if (previousGuildId) {
        cleanupUpdates[
          `widgetSubscriptions/${previousGuildId}/${storedInstallationId}`
        ] = null;
      }
      if (previousUserId) {
        cleanupUpdates[
          `users/${previousUserId}/devices/${storedInstallationId}`
        ] = null;
      }
      await database().ref().update(cleanupUpdates);

      if (previousUserId) {
        await database()
          .ref(`users/${previousUserId}/fcmToken`)
          .transaction((currentToken) =>
            String(currentToken || "").trim() === normalizedToken
              ? null
              : currentToken
          );
      }
    }
    await AsyncStorage.multiRemove([
      WIDGET_SUBSCRIPTION_GUILD_KEY,
      WIDGET_SUBSCRIPTION_USER_KEY,
    ]);
    return;
  }

  const hasExplicitGuildId =
    explicitGuildId !== null && explicitGuildId !== undefined;
  const guildId = String(
    hasExplicitGuildId ? explicitGuildId || "" : storedGuildId || ""
  ).trim();
  const widgetGuildId = Platform.OS === "android" ? guildId : "";
  const installationId =
    storedInstallationId || await getOrCreateWidgetInstallationId();

  const now = database.ServerValue.TIMESTAMP;
  const updates = {
    [`users/${userId}/fcmToken`]: normalizedToken,
    [`users/${userId}/devices/${installationId}/fcmToken`]: normalizedToken,
    [`users/${userId}/devices/${installationId}/platform`]: Platform.OS,
    [`users/${userId}/devices/${installationId}/updatedAt`]: now,
  };

  if (previousUserId && previousUserId !== userId) {
    updates[`users/${previousUserId}/devices/${installationId}`] = null;
  }
  if (
    previousGuildId &&
    (previousGuildId !== widgetGuildId ||
      (previousUserId && previousUserId !== userId))
  ) {
    updates[`widgetSubscriptions/${previousGuildId}/${installationId}`] = null;
  }

  if (widgetGuildId) {
    updates[`users/${userId}/devices/${installationId}/widgetGuildId`] =
      widgetGuildId;
    updates[`widgetSubscriptions/${widgetGuildId}/${installationId}`] = {
      userId,
      fcmToken: normalizedToken,
      platform: Platform.OS,
      updatedAt: now,
    };
  } else {
    updates[`users/${userId}/devices/${installationId}/widgetGuildId`] = null;
  }

  await database().ref().update(updates);
  if (previousUserId && previousUserId !== userId) {
    await database()
      .ref(`users/${previousUserId}/fcmToken`)
      .transaction((currentToken) =>
        String(currentToken || "").trim() === normalizedToken
          ? null
          : currentToken
      );
  }
  await AsyncStorage.setItem(WIDGET_SUBSCRIPTION_USER_KEY, userId);
  if (widgetGuildId) {
    await AsyncStorage.setItem(
      WIDGET_SUBSCRIPTION_GUILD_KEY,
      widgetGuildId
    );
  } else {
    await AsyncStorage.removeItem(WIDGET_SUBSCRIPTION_GUILD_KEY);
  }
};

const registerPushDevice = (registration) => {
  const queuedRegistration = pushDeviceRegistrationQueue.then(
    () => registerPushDeviceOnce(registration),
    () => registerPushDeviceOnce(registration)
  );
  pushDeviceRegistrationQueue = queuedRegistration.catch(() => {});
  return queuedRegistration;
};

const getDeviceTimeZone = () => {
  const calendarTimeZone =
    Localization.getCalendars?.()?.[0]?.timeZone || "";
  const intlTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const timeZone = String(calendarTimeZone || intlTimeZone).trim();
  if (!timeZone) return "";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch (_error) {
    return "";
  }
};

// ✅ Ініціалізація Firebase (як у тебе було)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase іниціалізовано успішно!');
}

const Stack = createStackNavigator();
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: DarkThemeColors.primary,
    background: DarkThemeColors.background,
    card: DarkThemeColors.surface,
    text: DarkThemeColors.text,
    border: DarkThemeColors.border,
    notification: DarkThemeColors.danger,
  },
};

const AppContent = () => {
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const { guildId } = useContext(GuildContext);
  const [activeUserId, setActiveUserId] = useState(null);
  const [selectedOption, setSelectedOption] = useState(i18n.t("server"));
  const [userData, setUserData] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem("userId")
      .then((storedUserId) => {
        if (!cancelled) {
          setActiveUserId(storedUserId || null);
        }
      })
      .catch((error) => {
        console.error("Помилка при зчитуванні userId:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const initLanguage = async () => {
      try {
        const supported = ["uk", "ru", "be", "de"];
        let lang = await AsyncStorage.getItem("userLanguage");
        if (!lang || !supported.includes(lang)) {
          const deviceLocales = Localization.getLocales();
          let deviceLang = 'uk';
          if (deviceLocales && deviceLocales.length > 0) {
            deviceLang = deviceLocales[0].languageCode;
          }
          lang = supported.includes(deviceLang) ? deviceLang : 'uk';
          await AsyncStorage.setItem("userLanguage", lang);
        }
        i18n.changeLanguage(lang);
      } catch (error) {
        console.error("Помилка ініціалізації мови:", error);
        i18n.changeLanguage('uk');
      } finally {
        setLanguageLoaded(true);
      }
    };
    initLanguage();
  }, []);

  useEffect(() => {
    const ensureNotificationTimeZone = async () => {
      try {
        const userId = await AsyncStorage.getItem("userId");
        const timeZone = getDeviceTimeZone();
        if (!userId || !timeZone) return;

        await database()
          .ref(`users/${userId}/setting/timeZone`)
          .transaction((currentTimeZone) => {
            if (
              typeof currentTimeZone === "string" &&
              currentTimeZone.trim()
            ) {
              return undefined;
            }
            return timeZone;
          });
      } catch (error) {
        console.log(
          "❌ Не вдалося автоматично зберегти часовий пояс:",
          error?.message || String(error)
        );
      }
    };

    ensureNotificationTimeZone();
  }, [guildId]);

  useEffect(() => {
    const setupPushNotifications = async () => {
      try {
        // ✅ Дозволи
        if (Platform.OS === 'ios') {
          const authStatus = await messaging().requestPermission();
          const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

          if (enabled) {
            console.log('✅ Дозвіл iOS отримано:', authStatus);
          } else {
            console.log('⚠️ Дозвіл iOS не надано:', authStatus);
          }
        } else if (Platform.OS === 'android') {
          if (Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: "Дозвіл на сповіщення",
                message: "Додаток хоче надсилати вам сповіщення",
                buttonPositive: "Дозволити",
                buttonNegative: "Відхилити",
              }
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              console.log('⚠️ Користувач відхилив дозвіл на сповіщення');
              // Все одно можемо працювати з data-only для віджета, але видимих пушів не буде
            }
          }
        }

        // Реєструємо токен і для звичайних push, і для віджета цього пристрою.
        const fcmToken = await messaging().getToken();
        if (fcmToken) {
          await registerPushDevice({ token: fcmToken });
          console.log("✅ FCM токен пристрою зареєстровано");
        }
      } catch (error) {
        console.error("❌ Помилка налаштування push:", error);
      }
    };

    setupPushNotifications();

    // ✅ Оновлення токена (важливо)
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      try {
        if (newToken) {
          await registerPushDevice({ token: newToken });
          console.log('✅ FCM токен оновлено в БД');
        }
      } catch (e) {
        console.log('❌ Помилка onTokenRefresh:', e?.message || String(e));
      }
    });

    return () => {
      unsubscribeTokenRefresh();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bindWidgetToActiveGuild = async () => {
      try {
        const bridge = NativeModules?.GbgWidgetBridge;
        if (bridge && typeof bridge.setGuildId === "function") {
          await bridge.setGuildId(String(guildId || ""));
        }

        const token = await messaging().getToken();
        if (!cancelled && token) {
          await registerPushDevice({
            token,
            guildId: String(guildId || ""),
          });
          console.log(
            guildId
              ? "✅ Віджет підписано на активну гільдію"
              : "✅ Підписку віджета очищено"
          );
        }
      } catch (error) {
        console.error(
          "❌ Не вдалося оновити підписку віджета:",
          error?.message || String(error)
        );
      }
    };

    bindWidgetToActiveGuild();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  useEffect(() => {
    if (!activeUserId || !guildId) return undefined;

    let disposed = false;
    const presenceRef = database().ref(
      `guilds/${guildId}/guildUsers/${activeUserId}/presence`
    );
    const connectedRef = database().ref(".info/connected");

    const updatePresence = (state) => {
      const timestamp = database.ServerValue.TIMESTAMP;
      return presenceRef.update({
        state,
        lastChanged: timestamp,
        lastActivityAt: timestamp,
      });
    };

    const handleConnectionChange = async (snapshot) => {
      if (snapshot.val() !== true) return;

      try {
        const timestamp = database.ServerValue.TIMESTAMP;
        await presenceRef.onDisconnect().update({
          state: "offline",
          lastChanged: timestamp,
          lastActivityAt: timestamp,
        });
        if (!disposed) {
          await updatePresence(
            AppState.currentState === "active" ? "online" : "offline"
          );
        }
      } catch (error) {
        if (!disposed) {
          console.log(
            "❌ Не вдалося оновити presence:",
            error?.message || String(error)
          );
        }
      }
    };

    connectedRef.on("value", handleConnectionChange);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        updatePresence(nextState === "active" ? "online" : "offline").catch(
          (error) => {
            if (!disposed) {
              console.log(
                "❌ Не вдалося змінити presence:",
                error?.message || String(error)
              );
            }
          }
        );
      }
    );

    return () => {
      disposed = true;
      connectedRef.off("value", handleConnectionChange);
      appStateSubscription.remove();
      presenceRef
        .onDisconnect()
        .cancel()
        .catch(() => {})
        .then(() =>
          presenceRef.update({
            state: "offline",
            lastChanged: database.ServerValue.TIMESTAMP,
            lastActivityAt: database.ServerValue.TIMESTAMP,
          })
        )
        .catch(() => {});
    };
  }, [activeUserId, guildId]);

  useEffect(() => {
    const checkAndLogWorldData = async () => {
      if (guildId) {
        fetchUserData();
      } else {
        setLoading(false);
        setChecked(true);
      }

      // Не блокуємо старт додатка допоміжним запитом до зовнішнього сервісу.
      // Іноді цей endpoint відповідає повільно, через що з'являється відчуття
      // "довгого завантаження" навіть при стабільному інтернеті.
      (async () => {
        try {
          const userId = await AsyncStorage.getItem("userId");
          const guildStr = await AsyncStorage.getItem("guildId");
          if (userId && guildStr) {
            const worldId = guildStr.split("_")[0];
            const url = `https://foe.scoredb.io/${worldId}/Player/${userId}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
              const response = await fetch(url, { signal: controller.signal });
              const html = await response.text();
              const data = parsePlayerBlock(html);
              if (data) {
                console.log("Ім'я гравця:", data.userName);
                console.log("ID гільдії:", data.guildId);
              }
            } finally {
              clearTimeout(timeoutId);
            }
          }
        } catch (e) {
          console.log("Помилка парсингу:", e);
        }
      })();
    };

    checkAndLogWorldData();
  }, [guildId]);

  const fetchUserData = async (guildIdOverride = null) => {
    const activeGuildId =
      typeof guildIdOverride === "string" && guildIdOverride.trim()
        ? guildIdOverride.trim()
        : guildId;
    if (!checked) setLoading(true);
    try {
      const userId = await AsyncStorage.getItem("userId");
      setActiveUserId(userId || null);
      if (activeGuildId && userId) {
        const snapshot = await database().ref(`users/${userId}`).once('value');
        setUserData(snapshot.exists());
      } else {
        setUserData(false);
      }
    } catch (error) {
      console.error("Помилка завантаження даних користувача:", error);
      if (!checked) setUserData(false);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  if (!languageLoaded || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!checked) return null;

  if (userData) {
    return <MainContent />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator initialRouteName="RoleSelectionScreen">
        <Stack.Screen name="RoleSelectionScreen" options={{ headerShown: false }}>
          {props => (
            <RoleSelectionScreen
              {...props}
              selectedOption={selectedOption}
              onCountryPress={c => setSelectedOption(c.name)}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="AdminSettingsScreen" options={{ headerShown: false }}>
          {props => (
            <AdminSettingsScreen
              {...props}
              selectedOption={selectedOption}
              onCountryPress={c => setSelectedOption(c.name)}
              onConfirm={() => setUserData(true)}
              fetch={fetchUserData}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="UserSettingsScreen" options={{ headerShown: false }}>
          {props => (
            <UserSettingsScreen
              {...props}
              selectedOption={selectedOption}
              onCountryPress={c => setSelectedOption(c.name)}
              fetch={fetchUserData}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <GuildProvider>
      <SafeAreaProvider>
        <AppUpdateChecker />
        <StatusBar barStyle="light-content" backgroundColor={DarkThemeColors.background} />
        <SafeAreaView style={styles.appSafeArea} edges={['bottom']}>
          <AppContent />
        </SafeAreaView>
      </SafeAreaProvider>
    </GuildProvider>
  );
}

const styles = StyleSheet.create({
  appSafeArea: {
    flex: 1,
    backgroundColor: DarkThemeColors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DarkThemeColors.background,
  }
});
