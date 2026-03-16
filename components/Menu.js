import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  StatusBar,
  SafeAreaView
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import database from '@react-native-firebase/database';

import GB from "./ico/menu/GB.svg";
import Admin from "./ico/menu/setting.svg";
import Chat from "./ico/menu/chat.svg";
import GVG from "./ico/menu/map.svg";
import Azbook from "./ico/menu/task.svg";
import Profile from "./ico/menu/user.svg";
import Quant from "./ico/menu/quant.svg";
import Servise from "./ico/menu/servise.svg";
import Boat2 from "./ico/boat2.svg";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MENU_WIDTH = 320; 

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

const menuOptions = [
    {
      text: "Прокачка ВС",
      fullText: "Прокачка Величних Споруд",
      icon: <GB width="24" height="24" fill={COLORS.textSecondary} />,
    },
    {
      text: "Поле битви",
      fullText: "Поле битви гільдій",
      icon: <GVG width="24" height="24" fill={COLORS.textSecondary} />,
      keyDate: new Date(2024, 2, 14),
    },
    {
      text: "Квантові вторгнення",
      fullText: "Квантові вторгнення",
      icon: <Quant width="24" height="24" fill={COLORS.textSecondary} />,
      keyDate: new Date(2024, 2, 21),
    },
    { text: "Сервіси", fullText: "Сервіси", icon: <Servise width="24" height="24" fill={COLORS.textSecondary} /> },
    { text: "Культурні поселення", fullText: "Культурні поселення", icon: <Boat2 width="24" height="24" fill={COLORS.textSecondary} /> },
    { text: "Альтанка", fullText: "Альтанка", icon: <Chat width="24" height="24" fill={COLORS.danger} /> }, 
    { text: "Абетка", fullText: "Абетка", icon: <Azbook width="24" height="24" fill={COLORS.textSecondary} /> },
    {
      text: "Налаштування",
      fullText: "Налаштування",
      icon: <Profile width="24" height="24" fill={COLORS.textSecondary} />,
    },
    {
      text: "Адмін. панель",
      fullText: "Адміністративна панель",
      icon: <Admin width="24" height="24" fill={COLORS.textSecondary} />,
    },
];

const Menu = ({ menuOpen, toggleMenu, setSelectedTitle, setSelectedComponent }) => {
  const [menuTranslateX] = useState(new Animated.Value(-MENU_WIDTH));
  const [overlayOpacity] = useState(new Animated.Value(0));
  const [panResponderInstance, setPanResponderInstance] = useState(null);
  
  const [selectedOption, setSelectedOption] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState("");
  const [userImageUrl, setUserImageUrl] = useState("");
  const [userRole, setUserRole] = useState("");
  const [wordName, setWordName] = useState("");
  const [additionalMenuOptions, setAdditionalMenuOptions] = useState([]);
  const [tempData, setTempData] = useState({});
  const [isAdditionalMenuVisible, setIsAdditionalMenuVisible] = useState(false);
  const [additionalMenuHeight] = useState(new Animated.Value(0));
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const panResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
             return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0 && menuOpen) {
            const newValue = Math.max(gestureState.dx, -MENU_WIDTH);
            menuTranslateX.setValue(newValue);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -50 || gestureState.vx < -0.5) {
            toggleMenu();
          } else {
            Animated.spring(menuTranslateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4
            }).start();
          }
        },
      });
      setPanResponderInstance(panResponder);
  
      const handleBackPress = () => {
        if (menuOpen) {
          toggleMenu();
          return true;
        }
        return false;
      };
  
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress);

    const toValue = menuOpen ? 0 : -MENU_WIDTH;
    const opacityValue = menuOpen ? 0.7 : 0;

    Animated.parallel([
      Animated.timing(menuTranslateX, {
        toValue,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: opacityValue,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    return () => backHandler.remove();
  }, [menuOpen, toggleMenu]);

  useEffect(() => {
    let userRef;
    let guildsRef;
    let currentGuildRef;

    const fetchData = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const guildId = await AsyncStorage.getItem("guildId");
        
        if (!storedUserId || !guildId) return;

        setUserId(storedUserId);

        userRef = database().ref(`users/${storedUserId}`);
        guildsRef = database().ref('guilds');
        currentGuildRef = database().ref(`guilds/${guildId}`);

        const onUserChange = guildsSnapshot => {
            const guildsData = guildsSnapshot.val();
            if (!guildsData) return;

            userRef.on('value', userSnapshot => {
                const userData = userSnapshot.val();
                if (!userData) return;

                setUserName(userData.userName || "Гравець");
                setUserImageUrl(userData[guildId]?.imageUrl || null);
                setUserRole(userData[guildId]?.role);

                const newAdditionalMenuOptions = [];
                const tempWorldsData = {};

                Object.keys(userData).forEach(key => {
                    if (guildsData[key]) {
                        tempWorldsData[key] = {
                            worldName: guildsData[key].worldName,
                            imageUrl: userData[key].imageUrl,
                        };
                        newAdditionalMenuOptions.push({
                            text: guildsData[key].worldName,
                            icon: userData[key].imageUrl ? <Image source={{ uri: userData[key].imageUrl }} style={styles.roundIcon} /> : <View style={[styles.roundIcon, {backgroundColor: '#444'}]} />,
                        });
                    }
                });

                setTempData(tempWorldsData);
                setAdditionalMenuOptions(newAdditionalMenuOptions);
            });
        };

        const onCurrentGuildChange = snapshot => {
            const guildData = snapshot.val();
            setWordName(guildData?.worldName || "");
        };

        guildsRef.on('value', onUserChange);
        currentGuildRef.on('value', onCurrentGuildChange);

      } catch (error) {
        console.error(error);
      }
    };

    fetchData();

    return () => {
      if (userRef) userRef.off();
      if (guildsRef) guildsRef.off();
      if (currentGuildRef) currentGuildRef.off();
    };
  }, []);

  const handleChevronPress = () => {
    setIsAdditionalMenuVisible(!isAdditionalMenuVisible);
    const itemHeight = 64; 
    const targetHeight = isAdditionalMenuVisible 
        ? 0 
        : (additionalMenuOptions.length + 1) * itemHeight;

    Animated.parallel([
        Animated.timing(additionalMenuHeight, {
            toValue: targetHeight,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
        }),
        Animated.timing(rotateAnim, {
            toValue: isAdditionalMenuVisible ? 0 : 1,
            duration: 300,
            useNativeDriver: true,
        })
    ]).start();
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const animatedChevronStyle = {
    transform: [{ rotate: rotateInterpolate }],
  };

  const handleOptionPress = async (index) => {
    if (index < additionalMenuOptions.length) {
      const selectedWorldName = additionalMenuOptions[index].text;
      const foundKey = Object.keys(tempData).find(key => tempData[key]?.worldName === selectedWorldName);
      if (foundKey) {
        try {
          await AsyncStorage.setItem("guildId", foundKey);
        } catch (error) { console.error(error); }
      }
      return;
    }

    const menuIndex = index - additionalMenuOptions.length - 1;
    const selectedMenuOption = menuOptions[menuIndex];
    
    if (selectedMenuOption) {
        setSelectedOption(menuIndex);
        setSelectedTitle(selectedMenuOption.fullText || selectedMenuOption.text);
        setSelectedComponent(selectedMenuOption.fullText || selectedMenuOption.text);
        toggleMenu();
    }
  };

  const hasLeaderAccess = (role) => role === "guildLeader" || role === "tester";
  const isTester = (role) => role === "tester";
  
  function isOptionVisible(option, currentDate) {
    if (!option.keyDate) return true;
    const keyDateWeek = getWeekNumber(option.keyDate, option.keyDate);
    const currentWeek = getWeekNumber(currentDate, option.keyDate);
    const weekDifference = currentWeek - keyDateWeek;

    if (0 <= weekDifference <= 1) {
      const currentDay = currentDate.getDay();
      const currentHour = currentDate.getHours();
      if (keyDateWeek % 2 === 1) return true;
      else return (
          (currentDay === 1 && currentHour < 8) ||
          (currentDay === 4 && currentHour >= 8) ||
          currentDay === 5 || currentDay === 6 || currentDay === 0
        );
    }
    return false;
  }

  function getWeekNumber(date, keyDate = null) {
    const firstDayOfYear = keyDate ? new Date(keyDate.getFullYear(), 0, 1) : new Date(date.getFullYear(), 0, 1);
    const daysSinceFirstDay = Math.floor((date - firstDayOfYear) / 86400000);
    const firstMonday = new Date(firstDayOfYear);
    while (firstMonday.getDay() != 0) firstMonday.setDate(firstMonday.getDate() + 1);
    const daysSinceFirstMonday = Math.floor((date - firstMonday) / 86400000);
    const weekNumber = Math.ceil((daysSinceFirstMonday + 1) / 7);
    return firstDayOfYear.getDay() != 1 ? weekNumber : weekNumber + 1;
  }

  const handleOverlayPress = () => { if (menuOpen) toggleMenu(); };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      {menuOpen && (
        <TouchableWithoutFeedback onPress={handleOverlayPress}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </TouchableWithoutFeedback>
      )}
      
      <Animated.View
        {...panResponderInstance?.panHandlers}
        style={[
          styles.container,
          { transform: [{ translateX: menuTranslateX }] },
        ]}
      >
        <SafeAreaView style={{flex: 1}}>
            <View style={styles.header}>
                <View style={styles.profileRow}>
                    <View style={styles.avatarContainer}>
                        {userImageUrl ? (
                            <Image source={{ uri: userImageUrl }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Profile width="28" height="28" fill={COLORS.textSecondary} />
                            </View>
                        )}
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
                        <TouchableOpacity style={styles.worldBadge} onPress={handleChevronPress} activeOpacity={0.7}>
                            <Text style={styles.worldText} numberOfLines={1}>{wordName}</Text>
                            <Animated.View style={animatedChevronStyle}>
                                <MaterialIcons name="keyboard-arrow-down" size={20} color={COLORS.primary} />
                            </Animated.View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView 
                style={styles.scrollView} 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={{ height: additionalMenuHeight, overflow: 'hidden' }}>
                    <View style={styles.worldsContainer}>
                        {additionalMenuOptions.map((option, index) => (
                            <TouchableOpacity
                                key={`world-${index}`}
                                onPress={() => handleOptionPress(index)}
                                style={styles.worldItem}
                            >
                                {option.icon}
                                <Text style={styles.worldItemText}>{option.text}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            onPress={() => handleOptionPress(additionalMenuOptions.length)}
                            style={styles.worldItem}
                        >
                            <View style={styles.addWorldIcon}>
                                <MaterialIcons name="add" size={20} color="#FFF" />
                            </View>
                            <Text style={[styles.worldItemText, {color: COLORS.primary}]}>Додати світ</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Основне</Text>
                    {menuOptions.map((option, index) => {
                        if (!isOptionVisible(option, new Date())) return null;
                        if (option.fullText === "Адміністративна панель" && !hasLeaderAccess(userRole)) return null;
                        if (option.fullText === "Культурні поселення" && !isTester(userRole)) return null;

                        const isSelected = selectedOption === index;

                        return (
                            <TouchableOpacity
                                key={index}
                                onPress={() => handleOptionPress(additionalMenuOptions.length + index + 1)}
                                activeOpacity={0.8}
                                style={[styles.menuItem, isSelected && styles.menuItemSelected]}
                            >
                                <View style={styles.iconWrapper}>
                                    {React.cloneElement(option.icon, { 
                                        fill: isSelected ? COLORS.primary : (option.text === "Альтанка" ? COLORS.danger : COLORS.textSecondary) 
                                    })}
                                </View>
                                <Text style={[
                                    styles.menuItemText, 
                                    isSelected && styles.menuItemTextSelected
                                ]}>
                                    {option.text}
                                </Text>
                                {isSelected && <View style={styles.activeIndicator} />}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
            
            <View style={styles.footer}>
                <Text style={styles.footerText}>Ver 2.1.0 • СУРМА UA</Text>
            </View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: MENU_WIDTH,
      backgroundColor: COLORS.background,
      zIndex: 100,
      elevation: 20,
      shadowColor: "#000",
      shadowOffset: { width: 10, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 15,
      borderRightWidth: 1,
      borderRightColor: '#1A1A1A',
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.85)",
      zIndex: 90,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 30,
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
        paddingVertical: 4,
        paddingHorizontal: 10,
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    worldsContainer: {
        backgroundColor: '#161616',
        marginTop: -10,
        marginBottom: 10,
        marginHorizontal: 16,
        borderRadius: 16,
        paddingVertical: 10,
    },
    worldItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    worldItemText: {
        color: COLORS.textSecondary,
        fontSize: 15,
        marginLeft: 12,
        fontWeight: '500',
    },
    roundIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
    },
    addWorldIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuSection: {
        marginTop: 10,
    },
    sectionTitle: {
        color: '#555',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginLeft: 24,
        marginBottom: 10,
        letterSpacing: 1,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        position: 'relative',
    },
    menuItemSelected: {
        backgroundColor: COLORS.surface,
    },
    iconWrapper: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuItemText: {
        fontSize: 16,
        color: COLORS.textSecondary,
        marginLeft: 20,
        fontWeight: '500',
    },
    menuItemTextSelected: {
        color: COLORS.textPrimary,
        fontWeight: '600',
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
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceHighlight,
        alignItems: 'center',
    },
    footerText: {
        color: '#444',
        fontSize: 12,
        fontWeight: '500',
    }
});

export default Menu;
