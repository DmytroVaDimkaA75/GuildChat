import AsyncStorage from "@react-native-async-storage/async-storage";

import notifee from '@notifee/react-native';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as Localization from "expo-localization";
import { useContext, useEffect, useRef, useState } from "react";
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
import { clearCachedAndroidUpdates } from "./services/appUpdateService";

import AdminSettingsScreen from "./components/AdminSettingsScreen";
import AppUpdateChecker from "./components/AppUpdate/AppUpdateChecker";
import MainContent from "./components/MainContent";
import RoleSelectionScreen from "./components/RoleSelectionScreen";
import UserSettingsScreen from "./components/UserSettingsScreen";
import { discardAuthenticatedSession } from "./src/auth/googleAuth";
import { clearPendingNotificationRoute } from "./src/notifications/notificationRouting";



const WIDGET_INSTALLATION_ID_KEY = "widgetInstallationId";
const WIDGET_SUBSCRIPTION_GUILD_KEY = "widgetSubscriptionGuildId";
const WIDGET_SUBSCRIPTION_USER_KEY = "widgetSubscriptionUserId";
const LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS = 5000;
let widgetInstallationIdPromise = null;
let pushDeviceRegistrationQueue = Promise.resolve();
let localSessionResetInProgress = false;
let localSessionGeneration = 0;

const isValidDatabaseKey = (value) => (
  typeof value === "string" &&
  value.length > 0 &&
  !/[.#$\[\]\/\u0000-\u001F\u007F]/u.test(value)
);

const withTimeout = (promise, timeoutMs, code) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Operation timed out");
      error.code = code;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise])
    .finally(() => clearTimeout(timeoutId));
};

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
  if (localSessionResetInProgress) return;
  const registrationGeneration = localSessionGeneration;

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
    if (
      localSessionResetInProgress ||
      registrationGeneration !== localSessionGeneration
    ) return;
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
  if (
    localSessionResetInProgress ||
    registrationGeneration !== localSessionGeneration
  ) return;
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

const unregisterPushDevice = async ({
  currentUserId,
  registeredUserId,
  currentGuildId,
  registeredGuildId,
  installationId,
  token,
}) => {
  const hasInstallationId = isValidDatabaseKey(installationId);
  const userIds = [...new Set([currentUserId, registeredUserId])]
    .filter(isValidDatabaseKey);
  const guildIds = [...new Set([currentGuildId, registeredGuildId])]
    .filter(isValidDatabaseKey);
  const updates = {};
  const timestamp = database.ServerValue.TIMESTAMP;

  if (hasInstallationId) {
    userIds.forEach((userId) => {
      updates[`users/${userId}/devices/${installationId}`] = null;
    });
    guildIds.forEach((guildId) => {
      updates[`widgetSubscriptions/${guildId}/${installationId}`] = null;
    });
  }

  if (
    isValidDatabaseKey(currentUserId) &&
    isValidDatabaseKey(currentGuildId)
  ) {
    const presencePath =
      `guilds/${currentGuildId}/guildUsers/${currentUserId}/presence`;
    updates[`${presencePath}/state`] = "offline";
    updates[`${presencePath}/lastChanged`] = timestamp;
    updates[`${presencePath}/lastActivityAt`] = timestamp;
  }

  if (Object.keys(updates).length > 0) {
    await database().ref().update(updates);
  }

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;

  await Promise.all(
    userIds.map((userId) =>
      database()
        .ref(`users/${userId}/fcmToken`)
        .transaction((currentToken) =>
          String(currentToken || "").trim() === normalizedToken
            ? null
            : currentToken
        )
    )
  );
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
  const { guildId, setGuildId } = useContext(GuildContext);
  const [activeUserId, setActiveUserId] = useState(null);
  const [selectedOption, setSelectedOption] = useState(i18n.t("server"));
  const [userData, setUserData] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const logoutInProgressRef = useRef(false);
  const sessionGenerationRef = useRef(0);

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
  }, [activeUserId, guildId]);

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
  }, [activeUserId, guildId]);

  useEffect(() => {
    if (!activeUserId || !guildId) return undefined;

    let disposed = false;
    const presenceRef = database().ref(
      `guilds/${guildId}/guildUsers/${activeUserId}/presence`
    );
    const connectedRef = database().ref(".info/connected");

    const updatePresence = (state) => {
      if (localSessionResetInProgress && state !== "offline") {
        return Promise.resolve();
      }
      const timestamp = database.ServerValue.TIMESTAMP;
      return presenceRef.update({
        state,
        lastChanged: timestamp,
        lastActivityAt: timestamp,
      });
    };

    const handleConnectionChange = async (snapshot) => {
      if (snapshot.val() !== true || localSessionResetInProgress) return;

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
    const sessionGeneration = sessionGenerationRef.current;
    const canCommit = () => (
      sessionGenerationRef.current === sessionGeneration &&
      !logoutInProgressRef.current
    );
    const activeGuildId =
      typeof guildIdOverride === "string" && guildIdOverride.trim()
        ? guildIdOverride.trim()
        : guildId;
    if (!checked && canCommit()) setLoading(true);
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!canCommit()) return;
      setActiveUserId(userId || null);
      if (activeGuildId && userId) {
        const snapshot = await database().ref(`users/${userId}`).once('value');
        if (!canCommit()) return;
        setUserData(snapshot.exists());
      } else {
        setUserData(false);
      }
    } catch (error) {
      if (!canCommit()) return;
      console.error("Помилка завантаження даних користувача:", error);
      if (!checked) setUserData(false);
    } finally {
      if (canCommit()) {
        setLoading(false);
        setChecked(true);
      }
    }
  };

  const clearLocalAppData = async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    sessionGenerationRef.current += 1;
    localSessionGeneration += 1;
    localSessionResetInProgress = true;

    try {
      try {
        await withTimeout(
          pushDeviceRegistrationQueue,
          LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
          "logout/push-queue-timeout"
        );
      } catch (error) {
        console.warn(
          "Черга реєстрації пристрою не завершилася перед виходом:",
          error?.code || error?.message || "unknown"
        );
      }

      const storedEntries = await AsyncStorage.multiGet([
        "userId",
        "guildId",
        WIDGET_INSTALLATION_ID_KEY,
        WIDGET_SUBSCRIPTION_GUILD_KEY,
        WIDGET_SUBSCRIPTION_USER_KEY,
      ]);
      const stored = Object.fromEntries(storedEntries);
      const currentUserId = String(activeUserId || stored.userId || "").trim();
      const currentGuildId = String(guildId || stored.guildId || "").trim();

      let fcmToken = "";
      try {
        fcmToken = String(
          await withTimeout(
            messaging().getToken(),
            LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
            "logout/fcm-token-timeout"
          ) || ""
        ).trim();
      } catch (error) {
        console.warn(
          "Не вдалося отримати FCM токен під час виходу:",
          error?.code || error?.message || "unknown"
        );
      }

      try {
        if (
          isValidDatabaseKey(currentUserId) &&
          isValidDatabaseKey(currentGuildId)
        ) {
          await withTimeout(
            database()
              .ref(
                `guilds/${currentGuildId}/guildUsers/${currentUserId}/presence`
              )
              .onDisconnect()
              .cancel(),
            LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
            "logout/presence-cancel-timeout"
          );
        }
      } catch (error) {
        console.warn(
          "Не вдалося скасувати presence onDisconnect під час виходу:",
          error?.code || error?.message || "unknown"
        );
      }

      try {
        await withTimeout(
          unregisterPushDevice({
            currentUserId,
            registeredUserId: String(
              stored[WIDGET_SUBSCRIPTION_USER_KEY] || ""
            ).trim(),
            currentGuildId,
            registeredGuildId: String(
              stored[WIDGET_SUBSCRIPTION_GUILD_KEY] || ""
            ).trim(),
            installationId: String(
              stored[WIDGET_INSTALLATION_ID_KEY] || ""
            ).trim(),
            token: fcmToken,
          }),
          LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
          "logout/device-cleanup-timeout"
        );
      } catch (error) {
        console.warn(
          "Не вдалося повністю прибрати реєстрацію пристрою під час виходу:",
          error?.code || error?.message || "unknown"
        );
      }

      const authSessionCleared = await withTimeout(
        discardAuthenticatedSession({ clearGoogleSession: true }),
        LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
        "logout/auth-timeout"
      );
      if (!authSessionCleared) {
        const error = new Error("Firebase session cleanup failed");
        error.code = "logout/auth-cleanup-failed";
        throw error;
      }

      try {
        await withTimeout(
          messaging().deleteToken(),
          LOGOUT_REMOTE_CLEANUP_TIMEOUT_MS,
          "logout/fcm-delete-timeout"
        );
      } catch (error) {
        console.warn(
          "Не вдалося видалити локальний FCM токен під час виходу:",
          error?.code || error?.message || "unknown"
        );
      }

      const localCleanupTasks = [
        notifee.cancelAllNotifications(),
        clearPendingNotificationRoute(),
        clearCachedAndroidUpdates(),
      ];
      if (typeof notifee.setBadgeCount === "function") {
        localCleanupTasks.push(notifee.setBadgeCount(0));
      }

      const widgetBridge = NativeModules?.GbgWidgetBridge;
      if (widgetBridge && typeof widgetBridge.setGuildId === "function") {
        localCleanupTasks.push(widgetBridge.setGuildId(""));
      }

      const cleanupResults = await Promise.allSettled(localCleanupTasks);
      cleanupResults.forEach((result) => {
        if (result.status === "rejected") {
          console.warn(
            "Не вдалося очистити частину локального кешу під час виходу:",
            result.reason?.code || result.reason?.message || "unknown"
          );
        }
      });

      await AsyncStorage.clear();
      await clearPendingNotificationRoute();
      widgetInstallationIdPromise = null;
      pushDeviceRegistrationQueue = Promise.resolve();

      setActiveUserId(null);
      setGuildId(null);
      setUserData(false);
      setLoading(false);
      setChecked(true);
    } finally {
      localSessionResetInProgress = false;
      logoutInProgressRef.current = false;
    }
  };

  const completeAppSession = async ({ userId, guildId: nextGuildId }) => {
    const normalizedUserId = String(userId || "").trim();
    const normalizedGuildId = String(nextGuildId || "").trim();
    const invalidFirebaseKey = /[.#$\[\]\/\u0000-\u001F\u007F]/u;

    if (
      !normalizedUserId ||
      !normalizedGuildId ||
      invalidFirebaseKey.test(normalizedUserId) ||
      invalidFirebaseKey.test(normalizedGuildId)
    ) {
      const error = new Error("Invalid application session identity");
      error.code = "app/session-invalid";
      throw error;
    }

    if (String(auth().currentUser?.uid || "") !== normalizedUserId) {
      const error = new Error("Firebase identity does not match the application session");
      error.code = "app/session-auth-mismatch";
      throw error;
    }

    const [userMembershipSnapshot, guildMembershipSnapshot] = await Promise.all([
      database()
        .ref(`users/${normalizedUserId}/userGuilds/${normalizedGuildId}`)
        .once("value"),
      database()
        .ref(`guilds/${normalizedGuildId}/guildUsers/${normalizedUserId}`)
        .once("value"),
    ]);

    if (!userMembershipSnapshot.exists() || !guildMembershipSnapshot.exists()) {
      const error = new Error("Guild membership is unavailable");
      error.code = "app/session-membership-missing";
      throw error;
    }

    await AsyncStorage.multiSet([
      ["userId", normalizedUserId],
      ["guildId", normalizedGuildId],
    ]);
    sessionGenerationRef.current += 1;
    setActiveUserId(normalizedUserId);
    setGuildId(normalizedGuildId);
    setUserData(true);
    setLoading(false);
    setChecked(true);

    return {
      userId: normalizedUserId,
      guildId: normalizedGuildId,
    };
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
    return <MainContent onLogout={clearLocalAppData} />;
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
              onCompleteAppSession={completeAppSession}
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
              onCompleteAppSession={completeAppSession}
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
