// App.js
import React, { useState, useEffect, useContext } from "react";
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, onValue } from "firebase/database";
import { database } from "./firebaseConfig";
import i18n from "./i18n";
import * as Localization from "expo-localization";
import { parsePlayerBlock } from "./parsePlayerBlock";

// 🔔 Push Notifications
import * as Notifications from "expo-notifications";
import { requestFcmToken } from "./src/notifications/registerToken";

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

  // 🔔 Створення НОВОГО кастомного каналу для Android (із звуком з res/raw/alert.*)
  // ВАЖЛИВО: ім'я звуку БЕЗ розширення. Канали незмінні після створення — тому 'custom-alerts-v4'.
  useEffect(() => {
    async function setupChannel() {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("custom-alerts-v4", {
          name: "Custom Alerts v4",
          importance: Notifications.AndroidImportance.MAX,
          sound: "alert", // ← БЕЗ .wav/.mp3; має відповідати файлу res/raw/alert.*
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        // Легкий дебаг: подивитися всі канали і який у них sound
        const channels = await Notifications.getNotificationChannelsAsync();
        console.log(
          "📢 Android channels:",
          channels?.map(c => ({ id: c.id, sound: c.sound, importance: c.importance }))
        );
      }
    }
    setupChannel();
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
    requestFcmToken()
      .then(token => {
        if (token) console.log("FCM Token:", token);
        else
          Alert.alert(
            i18n.t("notifications.permissionTitle"),
            i18n.t("notifications.permissionMessage"),
            [{ text: i18n.t("notifications.permissionButton") }]
          );
      })
      .catch(e => console.log("Помилка отримання FCM-token:", e));
  }, []);

  // 🔍 AsyncStorage лог (для діагностики)
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

  // 🔔 Отримання сповіщень у рантаймі
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
