// App.js
import React, { useState, useEffect, useContext } from "react";
import { StyleSheet, View, ActivityIndicator, Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, onValue } from "firebase/database";
import { database } from "./firebaseConfig";
import i18n from "./i18n";
import * as Localization from "expo-localization";
import { parsePlayerBlock } from "./parsePlayerBlock";

// 🔔 Push Notifications
import * as Notifications from "expo-notifications";
import { cacheExpoToken } from "./src/notifications/registerToken";

// контекст гільдії
import { GuildProvider, GuildContext } from "./GuildContext";

// навігація
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import RoleSelectionScreen from "./components/RoleSelectionScreen";
import AdminSettingsScreen from "./components/AdminSettingsScreen";
import UserSettingsScreen from "./components/UserSettingsScreen";
import MainContent from "./components/MainContent";

const Stack = createStackNavigator();

// 🔔 Обробка сповіщень у foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const AppContent = () => {
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const { guildId } = useContext(GuildContext);

  const [selectedOption, setSelectedOption] = useState(i18n.t("server"));
  const [userData, setUserData] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔔 Створення кастомного каналу для Android (із звуком)
  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("custom-alerts-v2", {
        name: "Custom Alerts",
        importance: Notifications.AndroidImportance.MAX,
        sound: "alert", // важливо: БЕЗ розширення .mp3
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  }, []);

  // 🌐 Ініціалізація мови
  useEffect(() => {
    const initLanguage = async () => {
      const supported = ["uk", "ru", "be", "de"];
      let lang = await AsyncStorage.getItem("userLanguage");
      if (!lang || !supported.includes(lang)) {
        lang = (Localization.locales[0] || "uk").substring(0, 2);
        if (!supported.includes(lang)) lang = "uk";
        await AsyncStorage.setItem("userLanguage", lang);
      }
      i18n.changeLanguage(lang);
      setLanguageLoaded(true);
    };
    initLanguage();
  }, []);

  // 🔐 Реєстрація push-токена
  useEffect(() => {
    cacheExpoToken()
      .then(token => {
        if (token) console.log("Expo Push Token:", token);
      })
      .catch(e => console.log("Помилка отримання push-token:", e));
  }, []);

  // 🔍 AsyncStorage лог
  useEffect(() => {
    const showStorage = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const entries = await AsyncStorage.multiGet(keys);
        const obj = Object.fromEntries(entries);
        console.log("🔍 AsyncStorage:", obj);
      } catch (e) {
        console.log("Помилка читання AsyncStorage:", e);
      }
    };
    showStorage();
  }, []);

  // 🔔 Отримання сповіщень
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log("📲 Notification received:", notification);
    });
    return () => subscription.remove();
  }, []);

  // 📡 Завантаження даних гравця
  useEffect(() => {
    const checkAndLogWorldData = async () => {
      try {
        const userId = await AsyncStorage.getItem("userId");
        const guildStr = await AsyncStorage.getItem("guildId");
        if (userId && guildStr) {
          const worldId = guildStr.split("_")[0];
          const url = `https://foe.scoredb.io/${worldId}/Player/${userId}`;
          const html = await (await fetch(url)).text();
          const data = parsePlayerBlock(html);
          if (data) {
            console.log("Імʼя гравця:", data.userName);
            console.log("Аватар:", data.avatarUrl);
            console.log("ID гільдії:", data.guildId);
            console.log("Назва гільдії:", data.guildName);
          }
        }
      } catch (e) {
        console.log("Помилка парсингу:", e);
      }

      if (guildId) fetchUserData();
      else {
        setLoading(false);
        setChecked(true);
      }
    };

    checkAndLogWorldData();
  }, [guildId]);

  const fetchUserData = async () => {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (guildId && userId) {
        onValue(ref(database, `users/${userId}`), snap => {
          setUserData(snap.exists());
          setLoading(false);
        });
      } else {
        setUserData(false);
        setLoading(false);
      }
    } catch (_) {
      setLoading(false);
    } finally {
      setChecked(true);
    }
  };

  // 💡 Екран завантаження
  if (!languageLoaded || loading)
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );

  if (!checked) return null;
  if (userData) return <MainContent key={guildId} />;

  return (
    <NavigationContainer>
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
      <AppContent />
    </GuildProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
