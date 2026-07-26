import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebase } from '@react-native-firebase/app';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as Localization from "expo-localization";
import { useContext, useEffect, useState } from "react";
import { ActivityIndicator, AppState, PermissionsAndroid, Platform, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkThemeColors } from "./constants/theme";
import { GuildContext, GuildProvider } from "./GuildContext";
import i18n from "./i18n";
import { parsePlayerBlock } from "./parsePlayerBlock";

import AdminSettingsScreen from "./components/AdminSettingsScreen";
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
  const [selectedOption, setSelectedOption] = useState(i18n.t("server"));
  const [userData, setUserData] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);

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

        // ✅ Отримати і зберегти FCM токен
        const fcmToken = await messaging().getToken();
        if (fcmToken) {
          console.log("✅ FCM Token:", fcmToken);

          const currentUserId = await AsyncStorage.getItem('userId');
          if (currentUserId) {
            await database().ref(`/users/${currentUserId}/fcmToken`).set(fcmToken);
            console.log('✅ FCM токен збережено в БД');
          }
        }
      } catch (error) {
        console.error("❌ Помилка налаштування push:", error);
      }
    };

    setupPushNotifications();

    // ✅ Оновлення токена (важливо)
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      try {
        const currentUserId = await AsyncStorage.getItem('userId');
        if (currentUserId && newToken) {
          await database().ref(`/users/${currentUserId}/fcmToken`).set(newToken);
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
    let presenceRef;
    let connectedRef;
    let appStateSubscription;

    const updatePresence = async (state) => {
      if (!presenceRef) return;
      await presenceRef.set({
        state,
        lastChanged: database.ServerValue.TIMESTAMP,
      });
    };

    const setupPresence = async () => {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId || !guildId) return;

      presenceRef = database().ref(`guilds/${guildId}/guildUsers/${userId}/presence`);
      connectedRef = database().ref(".info/connected");

      connectedRef.on("value", async (snapshot) => {
        if (snapshot.val() === true) {
          presenceRef.onDisconnect().set({
            state: "offline",
            lastChanged: database.ServerValue.TIMESTAMP,
          });

          if (AppState.currentState === "active") {
            await updatePresence("online");
          } else {
            await updatePresence("offline");
          }
        } else {
          await updatePresence("offline");
        }
      });

      appStateSubscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active") {
          updatePresence("online");
        } else {
          updatePresence("offline");
        }
      });
    };

    setupPresence();

    return () => {
      if (presenceRef) {
        presenceRef.set({
          state: "offline",
          lastChanged: database.ServerValue.TIMESTAMP,
        });
      }
      if (connectedRef) {
        connectedRef.off();
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
    };
  }, [guildId]);

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

  const fetchUserData = async () => {
    if (!checked) setLoading(true);
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (guildId && userId) {
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
        <StatusBar barStyle="light-content" backgroundColor={DarkThemeColors.background} />
        <AppContent />
      </SafeAreaProvider>
    </GuildProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DarkThemeColors.background,
  }
});
