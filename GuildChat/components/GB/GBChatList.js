import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { ref, onValue } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { database } from '../../firebaseConfig';
import { useTranslation } from 'react-i18next';

const GBChatList = () => {
  const { t } = useTranslation();
  const [chats, setChats] = useState([]); // Чати, які відображатимуться після фільтрації
  const [rawChats, setRawChats] = useState(null); // Сирі дані чатів з Firebase
  const [userArcLevel, setUserArcLevel] = useState(null); // Рівень арки користувача
  const [userMayInvest, setUserMayInvest] = useState(null); // Значення mayInvest користувача (якщо є)
  const [userId, setUserId] = useState(null); // Ідентифікатор користувача
  const [guildId, setGuildId] = useState(null); // Ідентифікатор гільдії
  const [expressAvailable, setExpressAvailable] = useState(false); // Чи є доступний чат "Експрес"

  const navigation = useNavigation();

  // 1. Отримання сирих даних чатів з Firebase для GBChat
  useEffect(() => {
    let unsubscribe;
    const fetchChats = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        setGuildId(storedGuildId);
        setUserId(storedUserId);
        if (storedGuildId) {
          const chatRef = ref(database, `guilds/${storedGuildId}/GBChat`);
          unsubscribe = onValue(chatRef, (snapshot) => {
            if (snapshot.exists()) {
              const chatData = snapshot.val();

              // Вивід дозволеного рівня арки для ВСІХ чатів (навіть якщо повідомлень немає)
              Object.keys(chatData).forEach((chatID) => {
                const chatRules = chatData[chatID].rules;
                console.log(`Чат ${chatID} має дозволений рівень арки: ${chatRules.ArcLevel}`);
                // Додаємо логування повідомлень
                if (chatData[chatID].messages) {
                  console.log(`Чат ${chatID} має повідомлення:`, Object.keys(chatData[chatID].messages));
                  Object.entries(chatData[chatID].messages).forEach(([msgId, msg]) => {
                    console.log(`  Повідомлення ${msgId}:`, msg);
                    console.log(`    Правила гілки:`, chatRules);
                    // Додаємо логування для власника
                    if (msg.senderId === storedUserId) {
                      console.log(`    Ви є власником цього повідомлення (userId: ${storedUserId})`);
                    }
                  });
                } else {
                  console.log(`Чат ${chatID} не має повідомлень`);
                }
              });

              setRawChats(chatData);
            } else {
              setRawChats({});
            }
          });
        }
        // Додаємо логування userId
        if (storedUserId) {
          console.log('userId:', storedUserId);
        }
      } catch (error) {
        console.error(t("gbChatList.fetchError"), error);
      }
    };

    fetchChats();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [t]);

  // 2. Отримання даних про арку користувача
  useEffect(() => {
    const fetchUserArc = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        setUserId(storedUserId);
        if (storedGuildId && storedUserId) {
          const arcRef = ref(database, `guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/The Arc`);
          onValue(arcRef, (snapshot) => {
            if (snapshot.exists()) {
              const arcData = snapshot.val();
              console.log('Рівень арки користувача:', arcData.level);
              setUserArcLevel(arcData.level);
              setUserMayInvest(arcData.mayInvest);
            } else {
              console.log(t("gbChatList.arcNotFound"));
            }
          });
        }
      } catch (error) {
        console.error(t("gbChatList.arcFetchError"), error);
      }
    };

    fetchUserArc();
  }, [t]);

  // 3. Перевірка на наявність гілки express з чатами, де час ще не настав
useEffect(() => {
  if (guildId) {
    const expressRef = ref(database, `guilds/${guildId}/express`);
    const unsubscribeExpress = onValue(expressRef, (snapshot) => {
      if (snapshot.exists()) {
        const expressData = snapshot.val();
        const now = Date.now();
        let hasFutureChat = false;
        Object.keys(expressData).forEach((chatID) => {
          const chat = expressData[chatID];
          // Використовуємо scheduleTime, якщо воно є, інакше timestamp
          const checkTime = chat.scheduleTime || chat.timestamp;
          if (checkTime && checkTime > now) {
            hasFutureChat = true;
          }
        });
        setExpressAvailable(hasFutureChat);
      } else {
        setExpressAvailable(false);
      }
    });
    return () => {
      if (unsubscribeExpress) unsubscribeExpress();
    };
  }
}, [guildId]);


  // 4. Фільтрація чатів для відображення згідно умов та додавання "Експрес" якщо є
  useEffect(() => {
    if (rawChats && userArcLevel !== null && userId) {
      const groups = {};
      Object.keys(rawChats).forEach((chatID) => {
        const chat = rawChats[chatID];
        if (!chat.messages || Object.keys(chat.messages).length === 0) {
          return;
        }
        const chatRules = chat.rules;
        const allowedArc = chatRules.ArcLevel;
        const multiplier = chatRules.contributionMultiplier;
        let eligible = false;

        // Головна логіка фільтрації:
        if (userArcLevel >= allowedArc || (userMayInvest !== null && userMayInvest >= allowedArc)) {
          eligible = Object.keys(chat.messages).some((messageId) => {
            const msg = chat.messages[messageId];
            // Якщо ви власник повідомлення — завжди показувати чат
            if (msg.senderId === userId) return true;
            // Якщо excludedUser відсутній — показувати чат
            if (!msg.excludedUser) return true;
            // Якщо userId відсутній у excludedUser — показувати чат
            if (!(userId in msg.excludedUser)) return true;
            // Якщо userId є у excludedUser і true — НЕ показувати чат
            if (msg.excludedUser[userId] === true) return false;
            // Якщо userId є у excludedUser і false — показувати чат
            if (msg.excludedUser[userId] === false) return true;
            // За замовчуванням не показувати
            return false;
          });
        } else {
          eligible = Object.keys(chat.messages).some((messageId) => {
            const msg = chat.messages[messageId];
            return msg.senderId === userId;
          });
        }
        if (eligible) {
          if (!groups[multiplier]) {
            groups[multiplier] = {
              id: `group_${multiplier}`,
              name: t('gbChatList.chatGroup', { multiplier }),
              chatIds: [chatID],
            };
          } else {
            groups[multiplier].chatIds.push(chatID);
          }
        }
      });

      let finalGroups = Object.values(groups);
      if (expressAvailable) {
        finalGroups.unshift({
          id: 'express',
          name: t('gbChatList.express'),
          chatIds: []
        });
      }
      setChats(finalGroups);
    }
  }, [rawChats, userArcLevel, userMayInvest, userId, t, expressAvailable]);

  // Обробка натискання на FloatingActionButton
  // const handleFabPress = () => {
  //   navigation.navigate('NewGBChat', { from: 'GBChatList' });
  // };

  // Обробка вибору конкретного чату/групи
  const handleChatSelect = (chat) => {
    if (chat.id === 'express') {
      navigation.navigate('GBExpress');
    } else {
      navigation.navigate('GBChatWindow', { chatId: chat.id, chatIds: chat.chatIds || [] });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.chatItem,
              item.id === 'express' && { backgroundColor: '#DCF8C6' }
            ]}
            onPress={() => handleChatSelect(item)}
          >
            <Text style={styles.chatName}>{item.name}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyMessage}>{t('gbChatList.noChats')}</Text>}
        contentContainerStyle={{ flexGrow: 1 }}
      />
      {/* <FloatingActionButton onPress={handleFabPress} iconName="pencil" /> */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: 'white',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f2f2f2',
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  chatName: {
    fontSize: 18,
  },
  emptyMessage: {
    padding: 15,
    textAlign: 'center',
    color: '#888',
    fontSize: 16,
  },
  myInvestBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf4ff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2296f3',
    shadowColor: '#2296f3',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 48,
  },
  myInvestText: {
    color: '#2296f3',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
});

export default GBChatList;
