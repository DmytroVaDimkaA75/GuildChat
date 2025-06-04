import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Alert } from 'react-native';
import { ref, onValue, set } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../../firebaseConfig';
import { format } from 'date-fns';
import { uk, ru, de, be } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

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
    let unsubscribes = [];
    const fetchMessages = async () => {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      setGuildId(storedGuildId);
      setUserId(storedUserId);

      // Завантаження налаштувань мови користувача
      const languageRef = ref(database, `users/${storedUserId}/setting/language`);
      const unsubscribeLang = onValue(languageRef, (snapshot) => {
        const language = snapshot.val();
        if (language) {
          setUserLanguage(language);
        }
      });
      unsubscribes.push(unsubscribeLang);

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

      // Вивід шляхів до всіх гілок повідомлень
      if (chatIds && Array.isArray(chatIds) && chatIds.length > 0) {
        chatIds.forEach((branchId) => {
          const path = `guilds/${storedGuildId}/GBChat/${branchId}/messages`;
          console.log('Before logging path');
          console.log('Messages branch path:', path);
          console.log('After logging path');
          const messagesRef = ref(database, path);
          const unsubscribe = onValue(
            messagesRef,
            (snapshot) => {
              processSnapshot(snapshot, branchId);
            },
            (error) => {
              console.error(t('gbChatWindow.messagesError'), error);
            }
          );
          unsubscribes.push(unsubscribe);
        });
      } else {
        const path = `guilds/${storedGuildId}/GBChat/${chatId}/messages`;
        console.log('Messages branch path:', path);
        const messagesRef = ref(database, path);
        const unsubscribe = onValue(
          messagesRef,
          async (snapshot) => {
            const data = snapshot.val();
            if (data) {
              let messageList = await Promise.all(
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
                    branchId: chatId, // Додаємо branchId для одиночного чату
                  };

                  // Не показувати повідомлення, якщо користувач у excludedUser зі значенням true
                  if (message.excludedUser && message.excludedUser[storedUserId] === true) {
                    return null;
                  }
                  return message;
                })
              );
              messageList = messageList.filter((msg) => msg !== null);
              setMessages(messageList);
            } else {
              setMessages([]);
            }
          },
          (error) => {
            console.error(t('gbChatWindow.messagesError'), error);
          }
        );
        unsubscribes.push(unsubscribe);
      }
    };

    fetchMessages();

    return () => {
      unsubscribes.forEach((unsub) => unsub && unsub());
    };
  }, [chatId, chatIds, t]);

  const fetchUserData = async (guildId, senderId) => {
    const userRef = ref(database, `guilds/${guildId}/guildUsers/${senderId}`);
    return new Promise((resolve, reject) => {
      onValue(
        userRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data) {
            resolve({
              userName: data.userName || t('gbChatWindow.unknownUser'),
              imageUrl: data.imageUrl || '',
            });
          } else {
            resolve({ userName: t('gbChatWindow.unknownUser'), imageUrl: '' });
          }
        },
        (error) => {
          console.error(t('gbChatWindow.userDataError'), error);
          reject(error);
        }
      );
    });
  };

  const fetchBuildingData = async (buildingId) => {
    const buildingRef = ref(database, `greatBuildings/${buildingId}`);
    return new Promise((resolve, reject) => {
      onValue(
        buildingRef,
        (snapshot) => {
          const buildingData = snapshot.val();
          if (buildingData) {
            resolve({
              buildingName: buildingData.buildingName || t('gbChatWindow.unknownBuild'),
              level: buildingData.level || t('gbChatWindow.unknownLevel'),
              buildingImage: buildingData.buildingImage || '',
            });
          } else {
            resolve({ buildingName: t('gbChatWindow.unknownBuild'), level: t('gbChatWindow.unknownLevel'), buildingImage: '' });
          }
        },
        (error) => {
          console.error(t('gbChatWindow.buildingDataError'), error);
          reject(error);
        }
      );
    });
  };

  const fetchBuildingLevel = async (guildId, senderId, buildId) => {
    const buildingRef = ref(
      database,
      `guilds/${guildId}/guildUsers/${senderId}/greatBuild/${buildId}/level`
    );
    return new Promise((resolve, reject) => {
      onValue(
        buildingRef,
        (snapshot) => {
          const lvl = snapshot.val();
          resolve(lvl || t('gbChatWindow.unknownLevel'));
        },
        (error) => {
          console.error(t('gbChatWindow.buildingLevelError'), error);
          reject(error);
        }
      );
    });
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
  
    // Нормалізація мови: "de-DE" -> "de"
    const normalizedLang = i18n.language.split('-')[0];
    const localeMap = { uk, ru, de, be };
    const locale = localeMap[normalizedLang] || localeMap['uk'];
  
    if (date.toDateString() === now.toDateString()) {
      return `${t('gbChatWindow.todayAt')} ${format(date, 'HH:mm', { locale })}`;
    }
  
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `${t('gbChatWindow.yesterdayAt')} ${format(date, 'HH:mm', { locale })}`;
    }
  
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    if (date >= startOfWeek) {
      // Для німецької – використовується "um"
      const timeConnector = normalizedLang === 'de' ? "um" : t('gbChatWindow.at');
      return `${format(date, 'EEEE', { locale })} ${timeConnector} ${format(date, 'HH:mm', { locale })}`;
    }
  
    // Для повної дати: якщо мова німецька, використати "d. MMMM 'um' HH:mm", інакше – "d MMMM о HH:mm"
    const fullFormat = normalizedLang === 'de' ? "d. MMMM 'um' HH:mm" : "d MMMM о HH:mm";
    return format(date, fullFormat, { locale });
  };
  

  const handlePlacePress = async (branchId, messageId, placeKey) => {
    if (!guildId || !userId) return;
    try {
      const messagePath = `guilds/${guildId}/GBChat/${branchId}/messages/${messageId}`;
      console.log('Message path:', messagePath);

      // Отримуємо дані повідомлення
      const messageRef = ref(database, messagePath);
      let messageSnapshot;
      let messageData;
      try {
        messageSnapshot = await new Promise((resolve, reject) => {
          onValue(messageRef, resolve, reject, { onlyOnce: true });
        });
        messageData = messageSnapshot.val();
      } catch (err) {
        console.error('Не вдалося отримати дані повідомлення:', err);
        return;
      }
      if (!messageData || !messageData.places || !messageData.places[placeKey]) {
        Alert.alert(t('gbChatWindow.placeUpdateError'), t('gbChatWindow.noPlaceValue'));
        return;
      }

      // Отримуємо розмір вкладу, senderId, buildId
      const investValue = messageData.places[placeKey];
      const ownerId = messageData.senderId;
      const buildId = messageData.build;

      // Видаляємо запис про місце
      const placeRef = ref(database, `${messagePath}/places/${placeKey}`);
      await set(placeRef, null);

      // Оновлюємо excludedUser: встановлюємо true (користувач більше не може брати участь у цьому місці)
      const excludedUserRef = ref(database, `${messagePath}/excludedUser/${userId}`);
      await set(excludedUserRef, true);

      // Додаємо запис про вклад у patrons власника ВС через uuid
      if (ownerId && buildId && investValue) {
        const patronsPath = `guilds/${guildId}/guildUsers/${ownerId}/greatBuild/${buildId}/investment/patrons`;
        const patronId = uuidv4();
        const newPatronRef = ref(database, `${patronsPath}/${patronId}`);
        await set(newPatronRef, {
          invest: investValue,
          patron: userId,
          timestamp: Date.now(),
        });
        console.log('Створено запис у patrons:', patronId);

        // Додаємо запис у users/${userId}/${guildId}/myInvest з UUID
        const myInvestId = uuidv4();
        const myInvestRef = ref(database, `users/${userId}/${guildId}/myInvest/${myInvestId}`);
        await set(myInvestRef, {
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
      <Text style={styles.testText}>тест</Text>
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        ListEmptyComponent={<Text style={styles.emptyMessage}>{t('gbChatWindow.noMessages')}</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: 'white',
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
    backgroundColor: '#DCF8C6',
    alignSelf: 'flex-end',
  },
  otherMessage: {
    marginLeft: 10,
    marginRight: 20,
    backgroundColor: '#f0f0f0',
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
    backgroundColor: '#0088cc',
    color: 'white',
    paddingVertical: 6,
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    width: 30,
  },
  testText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 10,
  },
  emptyMessage: {
    textAlign: 'center',
    marginTop: 20,
    color: 'gray',
  },
});

export default GBChatWindow;
