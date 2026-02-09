import AsyncStorage from '@react-native-async-storage/async-storage';

// import { onValue, ref, set } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

const GBChatWindow = ({ route }) => {
  const { t, i18n } = useTranslation();
  const { chatId, chatIds } = route.params;
  const [messages, setMessages] = useState([]);
  const [userLanguage, setUserLanguage] = useState('uk'); // За замовчуванням українська
  const [guildId, setGuildId] = useState(null);
  const [userId, setUserId] = useState(null);
  console.log(userLanguage)
  // Функція для локалізації назв ВС із даних з БД
  // Якщо buildingName є об'єктом із ключами мов, повертаємо переклад для поточної мови
  const getLocalizedBuildingName = (building) => {
    if (building && typeof building.buildingName === 'object') {
      return building.buildingName[i18n.language] || building.buildingName['uk'] || '';
    }
    return building.buildingName;
  };

  useEffect(() => {
    const subscriptions = [];
    const fetchMessages = async () => {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      setGuildId(storedGuildId);
      setUserId(storedUserId);

      // Завантаження налаштувань мови користувача (НОВИЙ СИНТАКСИС)
      const languageRef = database().ref(`users/${storedUserId}/setting/language`);
      const onLanguageChange = (snapshot) => {
        const language = snapshot.val();
        if (language) {
          setUserLanguage(language);
        }
      };
      languageRef.on('value', onLanguageChange);
      subscriptions.push({ ref: languageRef, callback: onLanguageChange });

      let messageLists = {};

      // Функція обробки повідомлень з окремої гілки
      const processSnapshot = async (snapshot, branchId) => {
        const data = snapshot.val();
        let branchMessages = [];
        if (data) {
          branchMessages = await Promise.all(
            Object.entries(data).map(async ([messageId, item]) => {
              let userName = '';
              let imageUrl = '';
              let buildingName = '';
              let buildingLevel = '';
              let buildingImage = '';

              if (item.senderId !== storedUserId) {
                try {
                  const userData = await fetchUserData(storedGuildId, item.senderId);
                  userName = userData.userName;
                  imageUrl = userData.imageUrl;
                } catch (error) {
                  console.error(t('gbChatWindow.userDataError'), error);
                }
              }

              if (item.build) {
                const buildingData = await fetchBuildingData(item.build);
                buildingName = getLocalizedBuildingName(buildingData) || t('gbChatWindow.unknownBuild');
                buildingLevel = await fetchBuildingLevel(storedGuildId, item.senderId, item.build);
                buildingImage = buildingData.buildingImage || '';
              }

              const message = {
                id: messageId,
                ...item,
                isOwnMessage: String(item.senderId) === String(storedUserId),
                userName: userName || t('gbChatWindow.unknownUser'),
                imageUrl,
                buildingName,
                buildingLevel,
                buildingImage,
                branchId: branchId, // Додаємо branchId до повідомлення
              };

              // Не показувати повідомлення, якщо користувач у excludedUser зі значенням true
              if (message.excludedUser && message.excludedUser[storedUserId] === true) {
                return null;
              }
              return message;
            })
          );
          branchMessages = branchMessages.filter((msg) => msg !== null);
        }
        messageLists[branchId] = branchMessages;
        let combined = [];
        Object.values(messageLists).forEach((msgs) => {
          combined = combined.concat(msgs);
        });
        combined.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(combined);
      };

      const pathsToListen = [];
      if (chatIds && Array.isArray(chatIds) && chatIds.length > 0) {
        chatIds.forEach(branchId => {
            pathsToListen.push({
                path: `guilds/${storedGuildId}/GBChat/${branchId}/messages`,
                branchId: branchId,
            });
        });
      } else {
        pathsToListen.push({
            path: `guilds/${storedGuildId}/GBChat/${chatId}/messages`,
            branchId: chatId,
        });
      }

      pathsToListen.forEach(({ path, branchId }) => {
        console.log('Messages branch path:', path);
        // НОВИЙ СИНТАКСИС
        const messagesRef = database().ref(path);
        const onMessagesChange = (snapshot) => {
            processSnapshot(snapshot, branchId);
        };
        messagesRef.on('value', onMessagesChange, (error) => {
            console.error(t('gbChatWindow.messagesError'), error);
        });
        subscriptions.push({ ref: messagesRef, callback: onMessagesChange });
      });
    };

    fetchMessages();

    return () => {
      subscriptions.forEach(({ ref, callback }) => ref.off('value', callback));
    };
  }, [chatId, chatIds, t, i18n.language]);

  const fetchUserData = async (guildId, senderId) => {
    // НОВИЙ СИНТАКСИС
    const userRef = database().ref(`guilds/${guildId}/guildUsers/${senderId}`);
    try {
        const snapshot = await userRef.once('value');
        const data = snapshot.val();
        if (data) {
            return {
                userName: data.userName || t('gbChatWindow.unknownUser'),
                imageUrl: data.imageUrl || '',
            };
        }
        return { userName: t('gbChatWindow.unknownUser'), imageUrl: '' };
    } catch (error) {
        console.error(t('gbChatWindow.userDataError'), error);
        return { userName: t('gbChatWindow.unknownUser'), imageUrl: '' };
    }
  };
  
  const fetchBuildingData = async (buildingId) => {
    // НОВИЙ СИНТАКСИС
    const buildingRef = database().ref(`greatBuildings/${buildingId}`);
    try {
        const snapshot = await buildingRef.once('value');
        const buildingData = snapshot.val();
        if (buildingData) {
            return {
                buildingName: buildingData.buildingName || t('gbChatWindow.unknownBuild'),
                level: buildingData.level || t('gbChatWindow.unknownLevel'),
                buildingImage: buildingData.buildingImage || '',
            };
        }
        return { buildingName: t('gbChatWindow.unknownBuild'), level: t('gbChatWindow.unknownLevel'), buildingImage: '' };
    } catch (error) {
        console.error(t('gbChatWindow.buildingDataError'), error);
        return { buildingName: t('gbChatWindow.unknownBuild'), level: t('gbChatWindow.unknownLevel'), buildingImage: '' };
    }
  };

  const fetchBuildingLevel = async (guildId, senderId, buildId) => {
    // НОВИЙ СИНТАКСИС
    const buildingRef = database().ref(`guilds/${guildId}/guildUsers/${senderId}/greatBuild/${buildId}/level`);
    try {
        const snapshot = await buildingRef.once('value');
        return snapshot.val() || t('gbChatWindow.unknownLevel');
    } catch (error) {
        console.error(t('gbChatWindow.buildingLevelError'), error);
        return t('gbChatWindow.unknownLevel');
    }
  };

const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Получаем время в формате, зависящем от локали телефона (напр., "14:30")
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Проверяем, если дата сегодня
    if (date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()) {
        return `${t('gbChatWindow.todayAt')} ${timeString}`;
    }

    // Проверяем, если дата вчера
    if (date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate()) {
        return `${t('gbChatWindow.yesterdayAt')} ${timeString}`;
    }

    // Для всех остальных случаев показываем полную дату и время
    // Формат будет зависеть от языка устройства (напр., "24.10.2025, 14:30")
    return date.toLocaleString([], {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};
  

  const handlePlacePress = async (branchId, messageId, placeKey) => {
    if (!guildId || !userId) return;
    try {
      const messagePath = `guilds/${guildId}/GBChat/${branchId}/messages/${messageId}`;
      console.log('Message path:', messagePath);

      // Отримуємо дані повідомлення (НОВИЙ СИНТАКСИС)
      const messageRef = database().ref(messagePath);
      const messageSnapshot = await messageRef.once('value');
      
      if (!messageSnapshot.exists()) {
        console.error('Не вдалося отримати дані повідомлення');
        return;
      }

      const messageData = messageSnapshot.val();
      if (!messageData || !messageData.places || !messageData.places[placeKey]) {
        Alert.alert(t('gbChatWindow.placeUpdateError'), t('gbChatWindow.noPlaceValue'));
        return;
      }

      const investValue = messageData.places[placeKey];
      const ownerId = messageData.senderId;
      const buildId = messageData.build;

      // Видаляємо запис про місце (НОВИЙ СИНТАКСИС)
      const placeRef = database().ref(`${messagePath}/places/${placeKey}`);
      await placeRef.set(null);

      // Оновлюємо excludedUser (НОВИЙ СИНТАКСИС)
      const excludedUserRef = database().ref(`${messagePath}/excludedUser/${userId}`);
      await excludedUserRef.set(true);

      // Додаємо запис про вклад у patrons (НОВИЙ СИНТАКСИС)
      if (ownerId && buildId && investValue) {
        const patronsPath = `guilds/${guildId}/guildUsers/${ownerId}/greatBuild/${buildId}/investment/patrons`;
        const patronId = uuidv4();
        const newPatronRef = database().ref(`${patronsPath}/${patronId}`);
        await newPatronRef.set({
          invest: investValue,
          patron: userId,
          timestamp: Date.now(),
        });
        console.log('Створено запис у patrons:', patronId);

        // Додаємо запис у users/${userId}/${guildId}/myInvest (НОВИЙ СИНТАКСИС)
        const myInvestId = uuidv4();
        const myInvestRef = database().ref(`users/${userId}/${guildId}/myInvest/${myInvestId}`);
        await myInvestRef.set({
          owner: ownerId,
          greatBuild: buildId,
          investmentAmount: investValue,
        });
        console.log('Створено запис у myInvest:', myInvestId);
      }

      Alert.alert(t('gbChatWindow.placeSelectedTitle'), `${t('gbChatWindow.placeSelectedMessage')} ${placeKey}`);
    } catch (error) {
      console.error(t('gbChatWindow.placeUpdateError'), error);
    }
  };

  const renderPlacesButtons = (places, branchId, messageId, isOwnMessage) => {
    if (!places) return null;
    return (
      <View style={styles.placesRow}>
        {Object.keys(places)
          .filter((key) => places[key])
          .map((key) => (
            <View key={key} style={styles.telegramButtonWrapper}>
              <Text
                style={styles.telegramButton}
                onPress={() => {
                  if (!isOwnMessage) {
                    handlePlacePress(branchId, messageId, key);
                  }
                }}
              >
                {key}
              </Text>
            </View>
          ))}
      </View>
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.messageWrapper}>
      {!item.isOwnMessage && item.imageUrl && (
        <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
      )}
      <View style={[styles.messageItem, item.isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
        <View style={styles.headerContainer}>
          <View style={styles.leftTextContainer}>
            <Text style={styles.userName}>
              {!item.isOwnMessage
                ? `${item.userName}: ${formatTimestamp(item.timestamp)}`
                : formatTimestamp(item.timestamp)}
            </Text>
            <Text style={styles.messageText}>
              {item.build 
                ? `${item.buildingName || t('gbChatWindow.unknownBuild')} (${t('gbChatWindow.levelLabel')} ${Number(item.buildingLevel) + 1})`
                : ''}
            </Text>
          </View>
          {item.build && item.buildingImage && (
            <Image
              source={{ uri: item.buildingImage }}
              style={styles.buildingImage}
              resizeMode="contain"
            />
          )}
        </View>
        <View style={styles.placesContainer}>
          {renderPlacesButtons(item.places, item.branchId, item.id, item.isOwnMessage)}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        ListEmptyComponent={<Text style={styles.emptyMessage}>{t('gbChatWindow.noMessages')}</Text>}
      />
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f1115',
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  messageItem: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
  },
  ownMessage: {
    marginLeft: 20,
    backgroundColor: '#1e3f54',
    alignSelf: 'flex-end',
  },
  otherMessage: {
    marginLeft: 10,
    marginRight: 20,
    backgroundColor: '#1b1f2a',
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  userName: {
    fontWeight: 'bold',
    color: '#e6e9ef',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  leftTextContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  messageText: {
    fontSize: 14,
    color: '#9aa3b2',
  },
  buildingImage: {
    width: 50,
    height: 50,
    marginLeft: 10,
  },
  placesContainer: {
    marginTop: 10,
  },
  placesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  telegramButtonWrapper: {
    alignItems: 'center',
  },
  telegramButton: {
    backgroundColor: '#2f7de1',
    color: '#fff',
    paddingVertical: 6,
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    width: 30,
  },
  emptyMessage: {
    textAlign: 'center',
    marginTop: 20,
    color: '#9aa3b2',
  },
});

export default GBChatWindow;
