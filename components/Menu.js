import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
// ИСПРАВЛЕНО: Правильный импорт
import { MaterialIcons } from '@expo/vector-icons';
import database from '@react-native-firebase/database';

// Import SVG icons
import GB from "./ico/GB.svg";
import Admin from "./ico/admin.svg";
// ... (остальные ваши импорты и константы остаются без изменений)
import Chat from "./ico/Chat.svg";
import GVG from "./ico/GVG.svg";
import Azbook from "./ico/azbook.svg";
import Profile from "./ico/profile.svg";
import Quant from "./ico/quant.svg";
import Servise from "./ico/servise.svg";

const Separator = () => <View style={styles.separator} />;

const menuOptions = [
    {
      text: "Прокачка Величних Споруд",
      icon: <GB width="18" height="18" fill="#8C9093" />,
    },
    {
      text: "Поле битви гільдій",
      icon: <GVG width="18" height="18" fill="#8C9093" />,
      keyDate: new Date(2024, 2, 14),
    },
    {
      text: "Квантові вторгнення",
      icon: <Quant width="18" height="18" fill="#8C9093" />,
      keyDate: new Date(2024, 2, 21),
    },
    { text: "Сервіси", icon: <Servise width="18" height="18" fill="#000" /> },
    { text: "Альтанка", icon: <Chat width="18" height="18" fill="red" /> },
    { text: "Абетка", icon: <Azbook width="18" height="18" fill="#8C9093" /> },
    {
      text: "Налаштування",
      icon: <Profile width="18" height="18" fill="#8C9093" />,
    },
    {
      text: "Адміністративна панель",
      icon: <Admin width="18" height="18" fill="#8C9093" />,
    },
  ];

// Menu component
const Menu = ({ menuOpen, toggleMenu, setSelectedTitle, setSelectedComponent }) => {
  // ... (все ваши useState остаются без изменений)
  const [menuTranslateX] = useState(new Animated.Value(-300));
  const [contentOpacity] = useState(new Animated.Value(1));
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


  // Этот useEffect будет управлять анимацией меню и жестами
  useEffect(() => {
    // ... (код PanResponder и BackHandler остается без изменений)
    const newPanResponderInstance = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 5,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0 && !menuOpen) {
            menuTranslateX.setValue(Math.min(gestureState.dx, 0));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -150) {
            toggleMenu();
          } else {
            Animated.spring(menuTranslateX, {
              toValue: menuOpen ? 0 : -300,
              useNativeDriver: true,
            }).start();
          }
        },
      });
      setPanResponderInstance(newPanResponderInstance);
  
      const handleBackPress = () => {
        if (menuOpen) {
          toggleMenu();
          return true;
        }
        return false;
      };
  
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress
      );

    Animated.parallel([
      Animated.spring(menuTranslateX, { toValue: menuOpen ? 0 : -300, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: menuOpen ? 0.95 : 1, useNativeDriver: true, duration: 200 }),
      Animated.timing(overlayOpacity, { toValue: menuOpen ? 0.5 : 0, useNativeDriver: true, duration: 200 }),
    ]).start();

    return () => backHandler.remove();
  }, [menuOpen, toggleMenu]);

  // Этот useEffect будет загружать все данные из Firebase
  useEffect(() => {
    let userRef;
    let guildsRef;
    let currentGuildRef;

    const fetchData = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const guildId = await AsyncStorage.getItem("guildId");
        
        if (!storedUserId || !guildId) {
            console.log("UserID или GuildID не найдены в AsyncStorage");
            return;
        }

        setUserId(storedUserId);

        // ИСПРАВЛЕНО: Правильный синтаксис
        userRef = database().ref(`users/${storedUserId}`);
        guildsRef = database().ref('guilds');
        currentGuildRef = database().ref(`guilds/${guildId}`);

        // Слушатель для данных пользователя
        const onUserChange = guildsSnapshot => {
            const guildsData = guildsSnapshot.val();
            if (!guildsData) return;

            // Вложенный слушатель для данных всех гильдий
            userRef.on('value', userSnapshot => {
                const userData = userSnapshot.val();
                if (!userData) return;

                setUserName(userData.userName || "ВаДімкаА");
                setUserImageUrl(userData[guildId]?.imageUrl || "https://...default_avatar.jpg");
                setUserRole(userData[guildId]?.role);

                const newAdditionalMenuOptions = [];
                const tempWorldsData = {};

                Object.keys(userData).forEach(key => {
                    // Проверяем, что это ключ гильдии, а не 'password' или 'userName'
                    if (guildsData[key]) {
                        tempWorldsData[key] = {
                            worldName: guildsData[key].worldName,
                            imageUrl: userData[key].imageUrl,
                        };
                        newAdditionalMenuOptions.push({
                            text: guildsData[key].worldName,
                            icon: <Image source={{ uri: userData[key].imageUrl }} style={styles.roundIcon} />,
                        });
                    }
                });

                setTempData(tempWorldsData);
                setAdditionalMenuOptions(newAdditionalMenuOptions);
            });
        };

        // Слушатель для данных текущей гильдии
        const onCurrentGuildChange = snapshot => {
            const guildData = snapshot.val();
            setWordName(guildData?.worldName || "");
        };

        guildsRef.on('value', onUserChange);
        currentGuildRef.on('value', onCurrentGuildChange);

      } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
      }
    };

    fetchData();

    // ИСПРАВЛЕНО: Правильная отписка от всех слушателей
    return () => {
      if (userRef) userRef.off();
      if (guildsRef) guildsRef.off();
      if (currentGuildRef) currentGuildRef.off();
    };
  }, []); // Пустой массив, чтобы загрузка данных произошла один раз


  // ... (остальные ваши функции, такие как handleChevronPress, handleOptionPress, и т.д., остаются без изменений)
  const handleChevronPress = () => {
    setIsAdditionalMenuVisible(!isAdditionalMenuVisible); // Перемикаємо стан видимості
    let targetHeight;
    if (additionalMenuOptions.length === 1) {
      targetHeight = isAdditionalMenuVisible ? 0 : additionalMenuOptions.length * 100;
    } else if (additionalMenuOptions.length === 2) {
      targetHeight = isAdditionalMenuVisible ? 0 : additionalMenuOptions.length * 80;
    } else {
      targetHeight = isAdditionalMenuVisible ? 0 : additionalMenuOptions.length * 55;
    }
    Animated.timing(additionalMenuHeight, {
      toValue: targetHeight, // Встановлюємо нову висоту
      duration: 300,
      useNativeDriver: false,
    }).start();
    Animated.timing(rotateAnim, {
      toValue: rotateAnim._value === 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-180deg'],
  });

  const animatedStyle = {
    transform: [{ rotate: rotateInterpolate }],
  };

  const handleOptionPress = async (index) => {
    // Эта функция остается без изменений, но теперь она работает с tempData, который загружается в главном useEffect
    if (index < additionalMenuOptions.length) {
      const selectedWorldName = additionalMenuOptions[index].text;
      const foundKey = Object.keys(tempData).find(key => tempData[key]?.worldName === selectedWorldName);
      if (foundKey) {
        try {
          await AsyncStorage.setItem("guildId", foundKey);
          // Здесь можно добавить логику для перезагрузки основного контента приложения, если это необходимо
          // например, через callback-функцию
          // reloadData(); // reloadData теперь не нужна, так как данные обновятся автоматически при смене guildId в контексте
        } catch (error) {
          console.error("Error saving guildId to AsyncStorage:", error);
        }
      }
      return;
    }

    const menuIndex = index - additionalMenuOptions.length - 1;
    const selectedMenuOption = menuOptions[menuIndex];
    setSelectedOption(menuIndex);
    setSelectedTitle(selectedMenuOption.text);

    if (selectedMenuOption.text) {
      setSelectedComponent(selectedMenuOption.text);
    } else {
      console.error(`Component for menu option ${selectedMenuOption.text} is null or undefined`);
    }

    toggleMenu();
  };

  // ... (остальная часть вашего компонента и JSX остаются без изменений)
  const isGuildLeader = (role) => {
    return role === "guildLeader";
  };
  function isOptionVisible(option, currentDate) {
    if (!option.keyDate) return true;

    const keyDateWeek = getWeekNumber(option.keyDate, option.keyDate);
    const currentWeek = getWeekNumber(currentDate, option.keyDate);

    const weekDifference = currentWeek - keyDateWeek;

    if (0 <= weekDifference <= 1) {
      const currentDay = currentDate.getDay();
      const currentHour = currentDate.getHours();

      if (keyDateWeek % 2 === 1) {
        return true;
      } else {
        return (
          (currentDay === 1 && currentHour < 8) ||
          (currentDay === 4 && currentHour >= 8) ||
          currentDay === 5 ||
          currentDay === 6 ||
          currentDay === 0
        );
      }
    }

    return false;
  }

  function getWeekNumber(date, keyDate = null) {
    const firstDayOfYear = keyDate
      ? new Date(keyDate.getFullYear(), 0, 1)
      : new Date(date.getFullYear(), 0, 1);
    const daysSinceFirstDay = Math.floor((date - firstDayOfYear) / 86400000);

    const firstMonday = new Date(firstDayOfYear);
    while (firstMonday.getDay() != 0) {
      firstMonday.setDate(firstMonday.getDate() + 1);
    }

    const daysSinceFirstMonday = Math.floor((date - firstMonday) / 86400000);
    const weekNumber = Math.ceil((daysSinceFirstMonday + 1) / 7);

    if (firstDayOfYear.getDay() != 1) {
      return weekNumber;
    } else {
      return weekNumber + 1;
    }
  }
  const handleOverlayPress = () => {
    if (menuOpen) {
      toggleMenu();
    }
  };
  return (
    <>
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
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.profileIcon}>
              <Image
                source={{ uri: userImageUrl }}
                style={styles.profileIcon}
              />
            </View>
            <View style={styles.profileDetails}>
              
              <Text style={styles.profileName}>{userName}</Text>
              <View style={styles.profileContainer}>

                <Text style={styles.profilePhone}>{wordName}</Text>
                <TouchableOpacity style={styles.chevronIcon} onPress={handleChevronPress}>
                  <Animated.View style={animatedStyle}>
                    <MaterialIcons name="keyboard-arrow-down" size={30} color="#9ecbea" />
                  </Animated.View>
                </TouchableOpacity>

              </View>
            </View>
          </View>

          <ScrollView style={styles.optionsContainer}>
            <Animated.View style={{ height: additionalMenuHeight, overflow: 'hidden' }}>
              {additionalMenuOptions.map((option, index) => (
                <React.Fragment key={`additional-${index}`}>
                  <TouchableOpacity
                    onPress={() => handleOptionPress(index)}
                    style={[
                      styles.option,
                      selectedOption === index && styles.selectedOption,
                    ]}
                  >
                    <View style={styles.optionContentRow}>
                      {option.icon && option.icon}
                      <Text style={styles.optionText}>{option.text}</Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
              <TouchableOpacity
                onPress={() => handleOptionPress(additionalMenuOptions.length)}
                style={[
                  styles.option,
                  selectedOption === additionalMenuOptions.length && styles.selectedOption,
                ]}
              >
                <View style={styles.optionContentRow}>
                  <View style={styles.addWorldIcon}>
                    <Text style={styles.addWorldIconText}>+</Text>
                  </View>
                  <Text style={styles.optionText}>Додати світ</Text>
                </View>
              </TouchableOpacity>
              <Separator />
            </Animated.View>
            {menuOptions.map(
              (option, index) =>
                isOptionVisible(option, new Date()) && (
                  <React.Fragment key={index}>
                    {!(option.text === "Адміністративна панель" && !isGuildLeader(userRole)) && (
                      <TouchableOpacity
                        onPress={() => handleOptionPress(additionalMenuOptions.length + index + 1)}
                        style={[
                          styles.option,
                          selectedOption === additionalMenuOptions.length + index + 1 && styles.selectedOption,
                        ]}
                      >
                        <View style={styles.optionContentRow}>
                          {option.icon && option.icon}
                          <Text style={styles.optionText}>{option.text}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    {index === 5 && <Separator />}
                  </React.Fragment>
                )
            )}
          </ScrollView>

        </View>
      </Animated.View>
    </>
  );
};

// ... (стили остаются без изменений)
const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#517da2",
      paddingTop: 20,
      width: 280,
      zIndex: 100,
    },
    roundIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    addWorldIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'gray',
      justifyContent: 'center',
      alignItems: 'center',
    },
    oundIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    addWorldIconText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
    },
    header: {
      flexDirection: "column",
      alignItems: "flex-start",
      paddingLeft: 20,
      marginVertical: 20,
    },
    profileIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      marginRight: 20,
      overflow: "hidden",
    },
    profileDetails: {},
    profileName: {
      fontSize: 22,
      fontWeight: "bold",
      color: "white",
    },
    profilePhone: {
      marginTop: 10,
      color: "#9ecbea",
      fontSize: 20,
      marginRight: 40, // додатковий відступ для шеврона
    },
    optionsContainer: {
      marginTop: 20,
      backgroundColor: "#FFFFFF",
      maxHeight: Dimensions.get("window").height * 0.9,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      marginLeft: 0,
      width: "100%",
    },
    optionText: {
      fontSize: 16,
    },
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "black",
      opacity: 0.5,
      zIndex: 9,
    },
    separator: {
      height: 1,
      backgroundColor: "#ccc",
      marginVertical: 10,
    },
    selectedOption: {
      backgroundColor: "lightgray",
    },
    optionContentRow: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 20,
      gap: 10,
    },
    profileContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%', // щоб контейнер займав всю ширину меню
      paddingRight: 20, // відступ для правого краю
    },
  
    profilePhoneContainer: {
      flexDirection: 'row',
      alignItems: 'center', // це вирівняє шеврон по центру з текстом
    },
  
    chevronIcon: {
      marginTop: 5,
      //marginRight: 20,
    },
  });
export default Menu;