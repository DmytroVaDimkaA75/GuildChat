import { MaterialIcons } from '@expo/vector-icons';
import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerToggleButton
} from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MenuProvider } from 'react-native-popup-menu';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GuildContext, GuildProvider } from '../GuildContext';
import i18n from "../i18n";
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
import Chat from "./ico/Chat.svg";
import GB from "./ico/GB.svg";
import GVG from "./ico/GVG.svg";
import Admin from "./ico/admin.svg";
import Azbook from "./ico/azbook.svg";
import Culture from "./ico/boat.svg";
import Profile from "./ico/profile.svg";
import Quant from "./ico/quant.svg";
import Servise from "./ico/servise.svg";

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
      <Stack.Screen name="ChatScreen" component={ChatScreen} options={({ navigation }) => ({ title: t("chatStack.chatScreenTitle"), headerLeft: () => <DrawerToggleButton tintColor="#fff" />, headerRight: () => (<TouchableOpacity onPress={() => navigation.navigate('GuildMembersList')} style={{ marginRight: 15 }}><Ionicons name="add" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="GuildMembersList" component={GuildMembersList} options={{ title: t("chatStack.guildMembersListTitle") }} />
      <Stack.Screen name="CreateGroupScreen" component={CreateGroupScreen} options={({ navigation, route }) => ({ title: "Нова група", headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => { if (route.params?.handleCreateGroup) { route.params.handleCreateGroup(); } }} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="NewGroupChat" component={NewGroupChat} options={{ title: t("chatStack.newGroupChatTitle") }} />
      <Stack.Screen name="ChatWindow" component={ChatWindow} options={({ navigation }) => ({ title: t("chatStack.chatWindowTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.navigate('ChatScreen')}><Ionicons name="arrow-back" size={24} color="#fff" style={{ marginLeft: 10 }} /></TouchableOpacity>), })} />
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
        const userRoleRef = database().ref(`users/${userId}/${guildId}/role`);
        const snap = await userRoleRef.once('value');
        if (snap.exists() && snap.val() === 'guildLeader') { setShowAddButton(true); } else { setShowAddButton(false); }
      } catch (e) { setShowAddButton(false); }
    };
    fetchRole();
  }, []);
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen name="GBScreen" component={GBScreen} options={({ navigation }) => { const opts = { title: t("gbStack.gbScreenTitle"), headerLeft: () => <DrawerToggleButton tintColor="#fff" />, }; if (showAddButton) { opts.headerRight = () => (<TouchableOpacity onPress={() => navigation.navigate('NewGBChat')} style={{ marginRight: 15 }}><Ionicons name="add" size={24} color="white" /></TouchableOpacity>); } return opts; }} />
      <Stack.Screen name="NewGBChat" component={NewGBChat} options={{ title: t("gbStack.newGBChatTitle") }} />
      <Stack.Screen name="GBChatWindow" component={GBChatWindow} options={{ title: t("gbStack.gbChatWindowTitle") }} />
      <Stack.Screen name="GBExpress" component={GBExpress} options={{ title: t("gbStack.gbExpressTitle") }} />
      <Stack.Screen name="GBNewExpress" component={GBNewExpress} options={{ title: t("gbStack.gbNewExpressTitle") }} />
    </Stack.Navigator>
  );
}
function QuantStack() {
  const { t } = useTranslation();
  return (<Stack.Navigator screenOptions={defaultHeaderOptions}><Stack.Screen name="QuantScreen" component={MapComponent} options={{ title: t("quantStack.quantScreenTitle"), headerLeft: () => <DrawerToggleButton tintColor="#fff" />, }} /></Stack.Navigator>);
}
function GBGStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen name="GBGScreen" component={GBGScreen} options={({ navigation, route }) => ({ title: t("gbgStack.gbgScreenTitle"), headerLeft: () => <DrawerToggleButton tintColor="#fff" />, headerRight: () => (<TouchableOpacity onPress={() => { if (route.params?.onOpenOpponents) { route.params.onOpenOpponents(); } else { console.log('onOpenOpponents callback is not set yet'); } }} style={{ marginRight: 15 }}><Ionicons name="information" size={24} color="white" /></TouchableOpacity>), })} />
    </Stack.Navigator>
  );
}
function AdmintStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen name="AdminScreen" component={AdminMain} options={({ navigation }) => ({ title: t("adminStack.adminScreenTitle"), headerLeft: () => (<TouchableOpacity onPress={() => { if (navigation.canGoBack()) { navigation.goBack(); } }} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerStyle: { backgroundColor: '#517da2', elevation: 0, shadowOpacity: 0, borderBottomWidth: 0, }, headerShadowVisible: false, })} />
    </Stack.Navigator>
  );
}
function CultureStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen name="CulturalSettlements" component={CulturalSettlements} options={({ navigation }) => ({ title: 'Вибір поселення', headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>), })} />
      <Stack.Screen name="CulturalPlanner" component={CulturalPlanner} options={({ navigation, route }) => { const { start } = route.params; const removeAndBack = async () => { const userId = await AsyncStorage.getItem('userId'); const guildId = await AsyncStorage.getItem('guildId'); await database().ref(`guilds/${guildId}/guildUsers/${userId}/culturalSettlements`).remove(); navigation.navigate('CulturalSettlements'); }; return { title: 'План поселення', headerLeft: () => (<TouchableOpacity onPress={() => { if (start) removeAndBack(); else navigation.goBack(); }} style={{ marginLeft: 10 }}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => { if (start) removeAndBack(); else { Alert.alert('Підтвердження', 'Ви дійсно хочете закінчити планування культурного поселення і видалити весь прогрес?', [{ text: 'Ні' }, { text: 'Так', onPress: () => removeAndBack() }]); } }} style={{ marginRight: 10 }}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>), }; }} />
      <Stack.Screen name="Planning" component={Planning} options={({ navigation }) => ({ title: 'Планування', headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>), })} />
    </Stack.Navigator>
  );
}
function ProfileStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={defaultHeaderOptions}>
      <Stack.Screen name="ProfileMain" component={ProfileMain} options={({ navigation }) => ({ title: t("profileStack.profileMainTitle"), headerLeft: () => (<TouchableOpacity onPress={() => { if (navigation.canGoBack()) { navigation.goBack(); } }} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerStyle: { backgroundColor: '#517da2', elevation: 0, shadowOpacity: 0, borderBottomWidth: 0, }, headerShadowVisible: false, })} />
      <Stack.Screen name="ProfileData" component={ProfileData} options={({ navigation }) => ({ title: t("profileStack.profileDataTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="MyGB" component={MyGB} options={({ navigation }) => ({ title: t("profileStack.myGBTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => navigation.navigate('AddGBComponent')} style={{ marginRight: 15 }}><Ionicons name="add" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="AddGBComponent" component={AddGBComponent} options={{ title: t("profileStack.addGBComponentTitle"), }} />
      <Stack.Screen name="GBNewExpress" component={GBNewExpress} options={({ navigation }) => ({ title: t("profileStack.gbNewExpressTitle"), headerTintColor: 'white', headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="GBGuarant" component={GBGuarant} options={({ navigation }) => ({ headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="AddSchedule" component={AddSchedule} options={({ navigation }) => ({ title: t("profileStack.addScheduleTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => console.log('Підтверджено')} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="SleepSchedule" component={SleepSchedule} options={({ navigation, route }) => ({ title: t("profileStack.sleepScheduleTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => (<TouchableOpacity onPress={() => { if (route.params?.handleSave) { route.params.handleSave(); } }} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>), })} />
      <Stack.Screen name="LanguageSelector" component={LanguageSelector} options={({ navigation, route }) => ({ title: t("profileStack.languageSelectorTitle"), headerLeft: () => (<TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 15 }}><Ionicons name="arrow-back" size={24} color="white" /></TouchableOpacity>), headerRight: () => { const selectedLanguage = route.params?.selectedLanguage ?? i18n.language; return (<TouchableOpacity onPress={async () => { if (route.params?.saveLanguage) { await route.params.saveLanguage(selectedLanguage); } }} style={{ marginRight: 15 }}><Ionicons name="checkmark" size={24} color="white" /></TouchableOpacity>); }, })} />
    </Stack.Navigator>
  );
}

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
      <View style={styles.header}>
        {guildImageUrl ? (<Image source={{ uri: guildImageUrl }} style={styles.profileImage} />) : null}
        <Text style={styles.userName}>{userName}</Text>
        <View style={styles.profileContainer}>
          <Text style={styles.guildName}>{guildName}</Text>
          <TouchableOpacity style={styles.chevronIcon} onPress={handleChevronPress}>
            <Animated.View style={{ transform: [{ rotate: rotationInterpolate }] }}>
              <MaterialIcons name="keyboard-arrow-down" size={30} color="#9ecbea" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[styles.worldselect, { height: animatedHeight, overflow: 'hidden' }]}>
        <View style={styles.guildContainer}>
          <MaterialIcons name="add" size={24} color="white" style={styles.guildImage} />
          <Text style={styles.guildText}>{t("customDrawer.addWorld")}</Text>
        </View>
        {Object.keys(tempData).map(key => (
          <TouchableOpacity key={key} style={styles.guildContainer} onPress={() => handleGuildPress(key)}>
            <Image source={{ uri: tempData[key].imageUrl }} style={styles.guildImage} />
            <Text style={styles.guildText}>{tempData[key].guildName}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
      {isWorldSelectVisible && <View style={styles.separator} />}
      
      {props.state.routes.map((route, index) => {
        const focused = props.state.index === index;
        const { drawerLabel, drawerIconSource, drawerActiveTintColor, drawerInactiveTintColor } = props.descriptors[route.key].options;
        const isServiceItem = route.name === 'servise';

        const color = focused ? drawerActiveTintColor : drawerInactiveTintColor;

        if (!drawerLabel) {
            return null;
        }

        return (
          <React.Fragment key={route.key}>
            <TouchableOpacity
              onPress={() => props.navigation.navigate(route.name)}
              style={styles.customDrawerItem}
            >
              {drawerIconSource && (
                <View style={styles.drawerIconContainer}>
                  <Image
                    source={drawerIconSource}
                    style={[styles.drawerIcon, { tintColor: color }]}
                  />
                </View>
              )}
              <Text style={[styles.drawerLabel, { color }]}>
                {drawerLabel}
              </Text>
            </TouchableOpacity>
            {isServiceItem && <View style={styles.separator} />}
          </React.Fragment>
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
    paddingHorizontal: 15,
  },
  guildContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
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
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
    marginHorizontal: 15,
  },
  customDrawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  drawerIconContainer: {
    width: 24, 
    height: 24,
    marginRight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  drawerLabel: {
    fontSize: 14,
    fontWeight: '500',
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

        const userRoleRef = database().ref(`users/${userId}/${guildId}/role`);
        const snap = await userRoleRef.once('value');

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
        screenOptions={{
            drawerActiveTintColor: '#517da2',
            drawerInactiveTintColor: 'gray',
        }}
      >
        <Drawer.Screen name="GB" component={GBStack} options={{ headerShown: false, drawerLabel: t("drawer.gbLabel"), drawerIconSource: GB }} />
        <Drawer.Screen name="ChatList" component={ChatStack} options={{ headerShown: false, drawerLabel: t("drawer.chatLabel"), drawerIconSource: Chat }} />
        <Drawer.Screen name="Quanty" component={QuantStack} options={{ headerShown: false, drawerLabel: t("drawer.quantLabel"), drawerIconSource: Quant }} />
        <Drawer.Screen name="GBG" component={GBGStack} options={{ headerShown: false, drawerLabel: t("drawer.pbgLabel"), drawerIconSource: GVG }} />
        <Drawer.Screen name="Culture" component={CultureStack} options={{ headerShown: false, drawerLabel: t("drawer.culture"), drawerIconSource: Culture }} />
        <Drawer.Screen name="azbook" component={QuantStack} options={{ headerShown: false, drawerLabel: t("drawer.azbookLabel"), drawerIconSource: Azbook }} />
        <Drawer.Screen name="servise" component={QuantStack} options={{ headerShown: false, drawerLabel: t("drawer.serviseLabel"), drawerIconSource: Servise }} />
        <Drawer.Screen name="profile" component={ProfileStack} options={{ headerShown: false, drawerLabel: t("drawer.profileLabel"), drawerIconSource: Profile }} />
        {showAdmin && (<Drawer.Screen name="admin" component={AdmintStack} options={{ headerShown: false, drawerLabel: t("drawer.adminLabel"), drawerIconSource: Admin }} />)}
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function MainContent() {

  useEffect(() => {
    const setupPushNotifications = async () => {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Authorization status:', authStatus);
        
        const channelId = await notifee.createChannel({
          id: 'default',
          name: 'Default Channel',
          importance: AndroidImportance.HIGH,
        });
        console.log('Notification channel created:', channelId);

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
        
        await notifee.displayNotification({
          title: remoteMessage.notification.title,
          body: remoteMessage.notification.body,
          android: {
            channelId: 'default',
            importance: AndroidImportance.HIGH,
            pressAction: {
              id: 'default',
            },
          },
        });
      });
      
      messaging().onNotificationOpenedApp(remoteMessage => {
        console.log('Notification caused app to open from background state:', remoteMessage.notification);
      });

       messaging()
        .getInitialNotification()
        .then(remoteMessage => {
          if (remoteMessage) {
            console.log('Notification caused app to open from quit state:', remoteMessage.notification);
          }
        });

      return unsubscribeOnMessage;
    };

    setupPushNotifications();
  }, []);

  return (
    <GuildProvider>
      <MenuProvider>
        <AppNavigator />
      </MenuProvider>
    </GuildProvider>
  );
}