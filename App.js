import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebase } from '@react-native-firebase/app';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as Localization from "expo-localization";
import { useContext, useEffect, useState } from "react";
import { ActivityIndicator, PermissionsAndroid, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase инициализирован успешно!');
}

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

const Stack = createStackNavigator();

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
        console.error("Ошибка при инициализации языка:", error);
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
      if (Platform.OS === 'ios') {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('Разрешение для iOS получено:', authStatus);
        }
      } else if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: "Разрешение на уведомления",
              message: "Приложение хочет отправлять вам уведомления",
              buttonPositive: "Разрешить",
              buttonNegative: "Отклонить",
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
             console.log('Пользователь отклонил разрешение на уведомления');
             return;
          }
        }
      }

      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: 'default',
          name: 'Default Channel',
          importance: AndroidImportance.HIGH,
        });
        console.log('Канал уведомлений "default" создан/обновлен.');
      }
      
      const fcmToken = await messaging().getToken();
      if (fcmToken) {
        console.log("FCM Token:", fcmToken);

        const currentUserId = await AsyncStorage.getItem('userId'); 
        if (currentUserId) {
          database()
            .ref(`/users/${currentUserId}/fcmToken`)
            .set(fcmToken)
            .then(() => console.log('FCM токен успешно сохранен в базу данных!'));
        }
      }

    } catch (error) {
      console.error("Ошибка при настройке push-уведомлений:", error);
    }
  };

  setupPushNotifications();

  const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
    console.log('Получено уведомление в открытом приложении:', remoteMessage);
    notifee.displayNotification({
      title: remoteMessage.notification.title,
      body: remoteMessage.notification.body,
      android: {
        channelId: 'default',
      },
    });
  });

  return unsubscribeForeground;
}, []);

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
            console.log("Имя игрока:", data.userName);
            console.log("ID гильдии:", data.guildId);
          }
        }
      } catch (e) { console.log("Ошибка парсинга:", e); }

      if (guildId) {
        fetchUserData();
      } else {
        setLoading(false);
        setChecked(true);
      }
    };
    checkAndLogWorldData();
  }, [guildId]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (guildId && userId) {
        const snapshot = await database().ref(`users/${userId}`).once('value');
        setUserData(snapshot.exists());
      } else {
        setUserData(false);
      }
    } catch (error) {
        console.error("Ошибка загрузки данных пользователя:", error);
        setUserData(false);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  if (!languageLoaded || loading) {
    return (<View style={styles.container}><ActivityIndicator size="large" color="#0000ff" /></View>);
  }

  if (!checked) {
      return null;
  }
  
  if (userData) {
      return <MainContent key={guildId} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="RoleSelectionScreen">
        <Stack.Screen name="RoleSelectionScreen" options={{ headerShown: false }}>
          {props => (
            <RoleSelectionScreen {...props}
              selectedOption={selectedOption}
              onCountryPress={c => setSelectedOption(c.name)}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="AdminSettingsScreen" options={{ headerShown: false }}>
          {props => (
            <AdminSettingsScreen {...props}
              selectedOption={selectedOption}
              onCountryPress={c => setSelectedOption(c.name)}
              onConfirm={() => setUserData(true)}
              fetch={fetchUserData}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="UserSettingsScreen" options={{ headerShown: false }}>
          {props => (
            <UserSettingsScreen {...props}
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
        <AppContent />
      </SafeAreaProvider>
    </GuildProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" }
});