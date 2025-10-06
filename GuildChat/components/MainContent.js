import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, Image, Alert } from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  DrawerToggleButton
} from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, getDatabase, get } from "firebase/database";
import { MaterialIcons } from '@expo/vector-icons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { MenuProvider } from 'react-native-popup-menu';
import { useTranslation } from 'react-i18next';
import i18n from "../i18n";
// Імпортуємо ваші екрани
import GBScreen from "./GB/GBScreen";
import MyGB from './GB/MyGB';
import NewGBChat from './GB/NewGBChat';
import AddGBComponent from './GB/AddGBComponent';
import GBGuarant from './GB/GBGuarant';
import GuildMembersList from "./Chat/GuildMemberList";
import CreateGroupScreen from './Chat/CreateGroupScreen';
import GBChatWindow from './GB/GBChatWindow';
import GBExpress from './GB/GBExpress';
import GBNewExpress from './GB/GBNewExpress';
import NewGroupChat from "./Chat/NewGroupChat";
import ChatScreen from "./Chat/ChatScreen";
import ChatWindow from './Chat/ChatWindow';
import MapComponent from './Quant/MapComponent';
import GBGScreen from './GBG/GBGscreen';
import ProfileMain from './Profile/ProfileMain';
import ProfileData from './Profile/ProfileData';
import AddSchedule from './Profile/AddSchedule';
import SleepSchedule from './Profile/SleepSchedule';
import LanguageSelector from './Profile/LanguageSelector';
import CulturalPlanner from './Culture/CulturalPlanner';
import CulturalSettlements from './Culture/CulturalSettlements';
import Planning from './Culture/Planning';
import AdminMain from './Admin/AdminMain';

import GB from "./ico/GB.svg";
import Chat from "./ico/Chat.svg";
import Quant from "./ico/quant.svg";
import GVG from "./ico/GVG.svg";
import Azbook from "./ico/azbook.svg";
import Culture from "./ico/boat.svg";
import Servise from "./ico/servise.svg";
import Profile from "./ico/profile.svg";
import Admin from "./ico/admin.svg";

// Імпортуємо GuildContext
import { GuildProvider, GuildContext } from '../GuildContext';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

const defaultHeaderOptions = {
  headerStyle: {
    backgroundColor: '#517da2',
  },
  headerTintColor: '#fff',
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
          headerLeft: () => <DrawerToggleButton tintColor="#fff" />,
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('GuildMembersList')} style={{ marginRight: 15 }}>
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="GuildMembersList"
        component={GuildMembersList}
        options={{ title: t("chatStack.guildMembersListTitle") }} // переклад для "Нове повідомлення"
      />
      <Stack.Screen 
        name="CreateGroupScreen" 
        component={CreateGroupScreen} 
        options={({ navigation, route }) => ({
          title: "Нова група",
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
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
              <Ionicons name="checkmark" size={24} color="white" />
            </TouchableOpacity>
         ),
        })}
      />
      <Stack.Screen
        name="NewGroupChat"
        component={NewGroupChat}
        options={{ title: t("chatStack.newGroupChatTitle") }} // переклад для "Створити групу"
      />
      <Stack.Screen 
        name="ChatWindow" 
        component={ChatWindow} 
        options={({ navigation }) => ({
          title: t("chatStack.chatWindowTitle"), // переклад для "Чат"
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.navigate('ChatScreen')}>
              <Ionicons
                name="arrow-back"
                size={24}
                color="#fff"
                style={{ marginLeft: 10 }}
              />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

function GBStack() {
  const { t } = useTranslation();
  const [showAddButton, setShowAddButton] = React.useState(false);

  React.useEffect(() => {
    const fetchRole = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) return;
        const db = getDatabase();
        const userRoleRef = ref(db, `users/${userId}/${guildId}/role`);
        const snap = await get(userRoleRef);
        if (snap.exists() && snap.val() === 'guildLeader') {
          setShowAddButton(true);
        } else {
          setShowAddButton(false);
        }
      } catch (e) {
        setShowAddButton(false);
      }
    };
    fetchRole();
  }, []);

  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="GBScreen"
        component={GBScreen}
        options={({ navigation }) => {
          const opts = {
            title: t("gbStack.gbScreenTitle"),
            headerLeft: () => <DrawerToggleButton tintColor="#fff" />,
          };
          if (showAddButton) {
            opts.headerRight = () => (
              <TouchableOpacity onPress={() => navigation.navigate('NewGBChat')} style={{ marginRight: 15 }}>
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            );
          }
          return opts;
        }}
      />
      <Stack.Screen
        name="NewGBChat"
        component={NewGBChat}
        options={{ title: t("gbStack.newGBChatTitle") }}
      />
      <Stack.Screen
        name="GBChatWindow"
        component={GBChatWindow}
        options={{ title: t("gbStack.gbChatWindowTitle") }} // переклад для "GBChatWindow"
      />
      <Stack.Screen
        name="GBExpress"
        component={GBExpress}
        options={{ title: t("gbStack.gbExpressTitle") }} // переклад для "Експрес прокачка"
      />
      <Stack.Screen
        name="GBNewExpress"
        component={GBNewExpress}
        options={{ title: t("gbStack.gbNewExpressTitle") }} // переклад для "Експрес прокачка1"
      />
    </Stack.Navigator>
  );
}

function QuantStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen
        name="QuantScreen"
        component={MapComponent}
        options={{
          title: t("quantStack.quantScreenTitle"), // переклад для "Квантові вторгнення"
          headerLeft: () => <DrawerToggleButton tintColor="#fff" />,
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
          headerLeft: () => <DrawerToggleButton tintColor="#fff" />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                // Викликаємо callback, виставлений у самій сторінці (через navigation.setParams)
                if (route.params?.onOpenOpponents) {
                  route.params.onOpenOpponents();
                } else {
                  // fallback подія (можна додати Alert або console)
                  console.log('onOpenOpponents callback is not set yet');
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="information" size={24} color="white" />
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
        options={({ navigation }) => ({
          title: t("adminStack.adminScreenTitle"),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                }
              }}
              style={{ marginLeft: 15 }}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerStyle: {
            backgroundColor: '#517da2',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerShadowVisible: false,
        })}
      />
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
      options={({ navigation }) => ({
        title: 'Вибір поселення',
        headerLeft: () => (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        ),
      })}
    />
    <Stack.Screen
      name="CulturalPlanner"
      component={CulturalPlanner}
      options={({ navigation, route }) => {
        const { start } = route.params;
        const removeAndBack = async () => {
          const userId = await AsyncStorage.getItem('userId');
          const guildId = await AsyncStorage.getItem('guildId');
          await remove(ref(database, `guilds/${guildId}/guildUsers/${userId}/culturalSettlements`));
          navigation.navigate('CulturalSettlements');
        };
        return {
          title: 'План поселення',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (start) removeAndBack();
                else navigation.goBack();
              }}
              style={{ marginLeft: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (start) removeAndBack();
                else {
                  Alert.alert(
                    'Підтвердження',
                    'Ви дійсно хочете закінчити планування культурного поселення і видалити весь прогрес?',
                    [
                      { text: 'Ні' },
                      { text: 'Так', onPress: () => removeAndBack() }
                    ]
                  );
                }
              }}
              style={{ marginRight: 10 }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        };
      }}
    />
    <Stack.Screen
      name="Planning"
      component={Planning}
      options={({ navigation }) => ({
        title: 'Планування',
        headerLeft: () => (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
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
        options={({ navigation }) => ({
          title: t("profileStack.profileMainTitle"), // переклад для "Налаштування профілю"
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                }
              }}
              style={{ marginLeft: 15 }}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerStyle: {
            backgroundColor: '#517da2',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerShadowVisible: false,
        })}
      />
      <Stack.Screen
        name="ProfileData"
        component={ProfileData}
        options={({ navigation }) => ({
          title: t("profileStack.profileDataTitle"), // переклад для "Дані профілю"
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color="white" />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="MyGB"
        component={MyGB}
        options={({ navigation }) => ({ 
          title: t("profileStack.myGBTitle"), // переклад для "Мої Величні Споруди"
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('AddGBComponent')} style={{ marginRight: 15 }}>
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="AddGBComponent"
        component={AddGBComponent}
        options={{ 
          title: t("profileStack.addGBComponentTitle"), // переклад для "Додайте ВС до свого списку"
        }}
      />
     <Stack.Screen
        name="GBNewExpress"
        component={GBNewExpress}
        options={({ navigation }) => ({
          title: t("profileStack.gbNewExpressTitle"),
          headerTintColor: 'white', // Задаємо білий колір для елементів хедера
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color="white" />
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
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          
        })}
      />



      <Stack.Screen
        name="AddSchedule"
        component={AddSchedule}
        options={({ navigation }) => ({
          title: t("profileStack.addScheduleTitle"), // переклад для "Дані профілю"
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}>
              <Ionicons name="checkmark" size={24} color="white" />
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
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                // Викликаємо handleSave, якщо він переданий з SleepSchedule
                if (route.params?.handleSave) {
                  route.params.handleSave();
                }
              }}
              style={{ marginRight: 15 }}
            >
              <Ionicons name="checkmark" size={24} color="white" />
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
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          ),
          headerRight: () => {
            const selectedLanguage = route.params?.selectedLanguage ?? i18n.language;
            return (
              <TouchableOpacity
                onPress={async () => {
                  // Викликаємо saveLanguage з LanguageSelector через route.params
                  if (route.params?.saveLanguage) {
                    await route.params.saveLanguage(selectedLanguage);
                  }
                }}
                style={{ marginRight: 15 }}
              >
                <Ionicons name="checkmark" size={24} color="white" />
              </TouchableOpacity>
            );
          },
        })}
      />


    </Stack.Navigator>
  );
}

function CustomDrawerContent(props) {
  const { t } = useTranslation();
  const { guildId, setGuildId } = useContext(GuildContext);
  const [guildName, setGuildName] = useState('');
  const [userName, setUserName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [guildImageUrl, setGuildImageUrl] = useState('');
  const [tempData, setTempData] = useState({});
  const [isWorldSelectVisible, setIsWorldSelectVisible] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState('');

  // Animated values for the height and rotation of worldselect
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fetchGuildAndUserData = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!guildId || !userId) {
          throw new Error('guildId або userId не знайдено');
        }
        const db = getDatabase();
        const userBranchRef = ref(db, `users/${userId}`);
        const userBranchSnapshot = await get(userBranchRef);

        if (userBranchSnapshot.exists()) {
          const usersData = userBranchSnapshot.val();
          setUserName(usersData.userName || '');
          setImageUrl(usersData.imageUrl || '');

          const guildRef = ref(db, `guilds/${guildId}`);
          const guildSnapshot = await get(guildRef);

          if (guildSnapshot.exists()) {
            const guildData = guildSnapshot.val();
            setGuildName(guildData.guildName || t("customDrawer.noName"));
            
            const guildUserRef = ref(db, `guilds/${guildId}/guildUsers/${userId}`);
            const guildUserSnapshot = await get(guildUserRef);

            if (guildUserSnapshot.exists()) {
              const guildUserData = guildUserSnapshot.val();
              setGuildImageUrl(guildUserData.imageUrl || '');
            }
          }

          const otherGuilds = {};
          for (let key in usersData) {
            if (key !== guildId) {
              const otherGuildRef = ref(db, `guilds/${key}`);
              const otherGuildSnapshot = await get(otherGuildRef);
              const guildUserRef = ref(db, `guilds/${key}/guildUsers/${userId}`);
              const guildUserSnapshot = await get(guildUserRef);
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
      toValue: isWorldSelectVisible ? (Object.keys(tempData).length * 42 + 42) : 0,
      duration: 300,
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
    } catch (error) {
      console.error('Помилка при збереженні guildId в AsyncStorage: ', error);
    }
  };

  const rotationInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <DrawerContentScrollView {...props} style={styles.drawerContent}>
      {/* Заголовок та аватар */}
      <View style={styles.header}>
        {guildImageUrl ? (
          <Image
            source={{ uri: guildImageUrl }}
            style={styles.profileImage}
          />
        ) : null}
        <Text style={styles.userName}>{userName}</Text>
        <View style={styles.profileContainer}>
          <Text style={styles.guildName}>{guildName}</Text>
          <TouchableOpacity style={styles.chevronIcon} onPress={handleChevronPress}>
            <Animated.View style={{ transform: [{ rotate: rotationInterpolate }] }}>
              <MaterialIcons
                name="keyboard-arrow-down"
                size={30}
                color="#9ecbea"
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Анімований вибір світу */}
      <Animated.View style={[styles.worldselect, { height: animatedHeight, overflow: 'hidden' }]}>
        <View style={styles.guildContainer}>
          <MaterialIcons name="add" size={24} color="white" style={styles.guildImage} />
          <Text style={styles.guildText}>{t("customDrawer.addWorld")}</Text>
        </View>
        {Object.keys(tempData).map(key => (
          <TouchableOpacity key={key} style={styles.guildContainer} onPress={() => handleGuildPress(key)}>
            <Image
              source={{ uri: tempData[key].imageUrl }}
              style={styles.guildImage}
            />
            <Text style={styles.guildText}>{tempData[key].guildName}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.separator} />
      </Animated.View>
      {isWorldSelectVisible && <View style={styles.separator} />}

      {/* Пункти меню */}
      {props.state.routes.map((route) => {
        const isServiceItem = route.name === 'servise';
        const { drawerIcon } = props.descriptors[route.key].options;
        return (
          <View key={route.key}>
            <DrawerItem
              label={props.descriptors[route.key].options.drawerLabel || route.name}
              onPress={() => props.navigation.navigate(route.name)}
              icon={({ color, size }) =>
                drawerIcon ? drawerIcon({ color, size }) : null
              }
              activeBackgroundColor="#000"
            />
            {isServiceItem && <View style={styles.separator} />}
          </View>
        );
      })}
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  drawerContent: {
    flex: 1,
  },
  header: {
    height: 200,
    justifyContent: 'center',
    flexDirection: "column",
    alignItems: "flex-start",
    paddingLeft: 20,
    backgroundColor: '#517da2',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  userName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingRight: 20,
  },
  guildName: {
    marginTop: 10,
    color: "#9ecbea",
    fontSize: 20,
    marginRight: 40,
  },
  chevronIcon: {
    marginTop: 7,
  },
  worldselect: {
    marginVertical: 10,
    paddingHorizontal: 15,
  },
  guildContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  guildImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'gray',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guildText: {
    fontSize: 16,
    marginLeft: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#BDBDBD',
    marginVertical: 10,
  },
});

function AppNavigator() {
  const { guildId } = useContext(GuildContext);
  const { t } = useTranslation();
  const [showAdmin, setShowAdmin] = React.useState(false);

  React.useEffect(() => {
    const fetchRole = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) return;
        const db = getDatabase();
        const userRoleRef = ref(db, `users/${userId}/${guildId}/role`);
        const snap = await get(userRoleRef);
        if (snap.exists() && snap.val() === 'guildLeader') {
          setShowAdmin(true);
        } else {
          setShowAdmin(false);
        }
      } catch (e) {
        setShowAdmin(false);
      }
    };
    fetchRole();
  }, [guildId]);

  return (
    <NavigationContainer key={guildId}>
      <Drawer.Navigator 
        drawerContent={props => <CustomDrawerContent {...props} />} 
        initialRouteName="GB"
      >
        <Drawer.Screen
          name="GB"
          component={GBStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.gbLabel"),
            title: t("drawer.gbLabel"),
            drawerIcon: ({ color, size }) => (
              <GB width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="ChatList"
          component={ChatStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.chatLabel"), // переклад для "Альтанка"
            drawerIcon: ({ color, size }) => (
              <Chat width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="Quanty"
          component={QuantStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.quantLabel"), // переклад для "Квантові вторгнення"
            drawerIcon: ({ color, size }) => (
              <Quant width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="GBG"
          component={GBGStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.pbgLabel"), // переклад для "Поле битви гільдій"
            drawerIcon: ({ color, size }) => (
              <GVG width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="Culture"
          component={CultureStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.culture"), 
            drawerIcon: ({ color, size }) => (
              <Culture width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="azbook"
          component={QuantStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.azbookLabel"), // переклад для "Абетка"
            drawerIcon: ({ color, size }) => (
              <Azbook width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="servise"
          component={QuantStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.serviseLabel"), // переклад для "Сервіси"
            drawerIcon: ({ color, size }) => (
              <Servise width={size} height={size} fill={color} />
            ),
          }}
        />
        <Drawer.Screen
          name="profile"
          component={ProfileStack}
          options={{
            headerShown: false,
            drawerLabel: t("drawer.profileLabel"), // переклад для "Профіль"
            drawerIcon: ({ color, size }) => (
              <Profile width={size} height={size} fill={color} />
            ),
          }}
        />
        {showAdmin && (
          <Drawer.Screen
            name="admin"
            component={AdmintStack}
            options={{
              headerShown: false,
              drawerLabel: t("drawer.adminLabel"), // переклад для "Адміністративна панель"
              drawerIcon: ({ color, size }) => (
                <Admin width={size} height={size} fill={color} />
              ),
            }}
          />
        )}
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GuildProvider>
      <MenuProvider>
        <AppNavigator />
      </MenuProvider>
    </GuildProvider>
  );
}

