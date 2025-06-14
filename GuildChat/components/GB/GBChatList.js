import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Dimensions, Image } from 'react-native';
import { ref, onValue, remove } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { database } from '../../firebaseConfig';
import { useTranslation } from 'react-i18next';

const { width: screenWidth } = Dimensions.get('window');

const GBChatList = () => {
  const { t } = useTranslation();
  const [chats, setChats] = useState([]); // Чати, які відображатимуться після фільтрації
  const [rawChats, setRawChats] = useState(null); // Сирі дані чатів з Firebase
  const [userArcLevel, setUserArcLevel] = useState(null); // Рівень арки користувача
  const [userMayInvest, setUserMayInvest] = useState(null); // Значення mayInvest користувача (якщо є)
  const [userId, setUserId] = useState(null); // Ідентифікатор користувача
  const [guildId, setGuildId] = useState(null); // Ідентифікатор гільдії
  const [expressAvailable, setExpressAvailable] = useState(false); // Чи є доступний чат "Експрес"
  const [myInvests, setMyInvests] = useState([]);
  const [gbNames, setGbNames] = useState({});
  const [ownerNames, setOwnerNames] = useState({}); // { [userId]: userName }

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

  // Перевірка наявності myInvest та завантаження даних
  useEffect(() => {
    const fetchMyInvest = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        if (storedGuildId && storedUserId) {
          const investRef = ref(database, `users/${storedUserId}/${storedGuildId}/myInvest`);
          onValue(investRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
              // Перетворюємо об'єкт у масив з id
              const investArr = Object.entries(data).map(([id, obj]) => ({
                id,
                ...obj
              }));
              setMyInvests(investArr);
            } else {
              setMyInvests([]);
            }
          });
        }
      } catch (e) {
        setMyInvests([]);
      }
    };
    fetchMyInvest();
  }, []);

  // Додаємо завантаження іконок ВС для кожної інвестиції
  useEffect(() => {
    if (!myInvests.length) return;
    let isMounted = true;
    const fetchIcons = async () => {
      const updated = await Promise.all(myInvests.map(async invest => {
        if (invest.greatBuild && !invest.iconUrl) {
          return new Promise(resolve => {
            const gbRef = ref(database, `greatBuildings/${invest.greatBuild}/buildingImage`);
            onValue(gbRef, snap => {
              resolve({ ...invest, iconUrl: snap.exists() ? snap.val() : null });
            }, { onlyOnce: true });
          });
        }
        return invest;
      }));
      if (isMounted && JSON.stringify(updated) !== JSON.stringify(myInvests)) {
        setMyInvests(updated);
      }
    };
    fetchIcons();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myInvests.map(i => i.greatBuild).join(',')]);

  // Завантаження назв ВС для всіх інвестицій
  useEffect(() => {
    if (!myInvests.length) return;
    let isMounted = true;
    const fetchNames = async () => {
      const names = {};
      let lang = "uk";
      try {
        const storedLang = await AsyncStorage.getItem('userLanguage');
        if (storedLang) lang = storedLang;
      } catch (e) {}
      await Promise.all(myInvests.map(async invest => {
        if (invest.greatBuild) {
          return new Promise(resolve => {
            const gbRef = ref(database, `greatBuildings/${invest.greatBuild}/buildingName/${lang}`);
            onValue(gbRef, snap => {
              names[invest.greatBuild] = snap.exists() ? snap.val() : null;
              resolve();
            }, { onlyOnce: true });
          });
        }
      }));
      if (isMounted) setGbNames(names);
    };
    fetchNames();
    return () => { isMounted = false; };
  }, [myInvests.map(i => i.greatBuild).join(',')]);

  // Завантаження імен власників ВС для всіх інвестицій
  useEffect(() => {
    if (!myInvests.length) return;
    let isMounted = true;
    const fetchOwners = async () => {
      const names = {};
      await Promise.all(myInvests.map(async invest => {
        if (invest.owner) {
          return new Promise(resolve => {
            const userRef = ref(database, `users/${invest.owner}/userName`);
            onValue(userRef, snap => {
              names[invest.owner] = snap.exists() ? snap.val() : invest.owner;
              resolve();
            }, { onlyOnce: true });
          });
        }
      }));
      if (isMounted) setOwnerNames(names);
    };
    fetchOwners();
    return () => { isMounted = false; };
  }, [myInvests.map(i => i.owner).join(',')]);

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

  // Функція для видалення інвестиції з БД
  const handleRemoveInvest = async (investId) => {
    try {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      if (storedGuildId && storedUserId && investId) {
        const investRef = ref(database, `users/${storedUserId}/${storedGuildId}/myInvest/${investId}`);
        await remove(investRef);
      }
    } catch (e) {
      console.error('Помилка видалення інвестиції:', e);
    }
  };

  // Вивід усіх значень з AsyncStorage у консоль
  useEffect(() => {
    (async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const allItems = await AsyncStorage.multiGet(allKeys);
        console.log('=== AsyncStorage values ===');
        allItems.forEach(([key, value]) => {
          console.log(`${key}:`, value);
        });
        console.log('===========================');
      } catch (e) {
        console.log('Помилка при читанні всіх значень AsyncStorage:', e);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      {/* Додаємо підпис над блоком інвестицій */}
      {myInvests.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center' }}
            style={{ width: screenWidth }}
          >
            {myInvests.map((invest) => (
              <View key={invest.id} style={styles.myInvestBlockScroll}>
                {/* Відображаємо іконку тільки якщо iconUrl є і не порожній рядок */}
                {invest.iconUrl && typeof invest.iconUrl === 'string' && invest.iconUrl.trim() !== '' ? (
                  <Image
                    source={{ uri: invest.iconUrl }}
                    style={styles.gbIconTall}
                    resizeMode="contain"
                  />
                ) : (
                  null
                )}
                <View style={styles.myInvestTextCol}>
                  <Text style={styles.myInvestTitle}>Мої інвестиції</Text>
                  <Text style={styles.pinnedInvestText} numberOfLines={1}>
                    {gbNames[invest.greatBuild] || invest.greatBuild}
                    {invest.owner ? ` (${ownerNames[invest.owner] || invest.owner})` : ''}
                    {invest.investmentAmount
                      ? ` — ${invest.investmentAmount}${invest.place ? ` (${invest.place})` : ''}`
                      : ''}
                  </Text>
                </View>
                {/* Кнопка-хрестик для видалення */}
                <TouchableOpacity
                  style={styles.removeInvestBtn}
                  onPress={() => handleRemoveInvest(invest.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.removeInvestBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
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
    //padding: 20,
    //paddingTop: 10, // Щоб блок був максимально зверху
    backgroundColor: 'white',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f2f2f2',
    marginBottom: 10,
    marginTop: 10,
    marginLeft:20,
    marginRight:20,
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
    //borderRadius: 12,
    //paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 16,
    //marginLeft: 20,
   borderWidth: 1,
    
    borderColor: '#2296f3',
    shadowColor: '#2296f3',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 48,
  },
  myInvestBlockScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    width: screenWidth-16, // Додаємо невеликий відступ, щоб уникнути обрізання
    height: 40,
    marginLeft: 8,
    marginRight: 8,
    //paddingRight: 32, // Додаємо простір для хрестика
    paddingLeft: 8,
    position: 'relative',
    backgroundColor: '#fff',
    //borderRadius: 8,
   
    //borderColor: '#e0e0e0',
  },
  gbIconTall: {
    height: 40,
    width: 40,
    marginRight: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
    marginLeft: 0,
  },
  myInvestTextCol: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  myInvestText: {
    color: '#2296f3',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  pinnedMessageWrapper: {
    flexDirection: 'row',
    width: screenWidth,
    height: 50,
    marginTop: 0,
    marginBottom: 8,
    
    marginLeft: 0,
    alignSelf: 'flex-start',
    paddingLeft: 0,
  },
  pinnedMessagesContainer: {
    
    width: screenWidth,
   // marginLeft: -20,
    alignSelf: 'flex-start',
    paddingLeft: 0,
  },
  pinnedMessageBlock: {
    width: screenWidth,
    height: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    borderColor: '#2296f3',
    marginLeft: 0,
    alignSelf: 'flex-start',
    paddingLeft: 0,
  },
  myInvestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    //marginLeft: 4,
    marginBottom: 2,
    marginTop: 0,
  },
  gbIconHeader: {
    width: 32,
    height: 32,
    marginRight: 8,
    borderRadius: 4,
    backgroundColor: '#eee',
  },
  pinnedContentRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    //paddingHorizontal: 8,
  },
  gbIconFull: {
    height: '100%',
    aspectRatio: 1,
    ///marginRight: 8,
    borderRadius: 4,
    backgroundColor: '#eee',
  },
  myInvestTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0088cc',
    marginBottom: 2,
  },
  pinnedInvestText: {
    fontSize: 12,
    color: "#333",
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  removeInvestBtn: {
    position: 'absolute',
    right: 8, // Відступаємо від правого краю блоку, щоб не було впритул
    top: 8,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: '#fff',
    borderRadius: 12,
    //borderWidth: 1,
    borderColor: '#ccc',
    padding: 0,
  },
  removeInvestBtnText: {
    color: '#d00',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
    textAlign: 'center',
    padding: 0,
  },
});

export default GBChatList;
