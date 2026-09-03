import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
// import { onValue, ref, remove } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// import { database } from '../../firebaseConfig'; // <- УДАЛЕНО

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';

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
    let chatRef;
    let onChatChange;

    const fetchChats = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        setGuildId(storedGuildId);
        setUserId(storedUserId);
        if (storedGuildId) {
          // НОВИЙ СИНТАКСИС
          chatRef = database().ref(`guilds/${storedGuildId}/GBChat`);
          onChatChange = (snapshot) => {
            if (snapshot.exists()) {
              setRawChats(snapshot.val());
            } else {
              setRawChats({});
            }
          };
          chatRef.on('value', onChatChange);
        }
      } catch (error) {
        console.error(t("gbChatList.fetchError"), error);
      }
    };

    fetchChats();

    return () => {
      if (chatRef && onChatChange) {
        chatRef.off('value', onChatChange);
      }
    };
  }, [t]);

  // 2. Отримання даних про арку користувача
  useEffect(() => {
    let arcRef;
    let onArcChange;

    const fetchUserArc = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        setUserId(storedUserId);
        if (storedGuildId && storedUserId) {
          // НОВИЙ СИНТАКСИС
          // Ключ ВС «Арка» в даних — X_FutureEra_Landmark1.
          arcRef = database().ref(`guilds/${storedGuildId}/guildUsers/${storedUserId}/greatBuild/X_FutureEra_Landmark1`);
          onArcChange = (snapshot) => {
            if (snapshot.exists()) {
              const arcData = snapshot.val();
              setUserArcLevel(arcData.level);
              setUserMayInvest(arcData.mayInvest);
            } else {
              setUserArcLevel(0);
              setUserMayInvest(0);
            }
          };
          arcRef.on('value', onArcChange);
        }
      } catch (error) {
        console.error(t("gbChatList.arcFetchError"), error);
      }
    };

    fetchUserArc();
    
    return () => {
        if (arcRef && onArcChange) {
            arcRef.off('value', onArcChange);
        }
    }
  }, [t]);

  // 3. Перевірка на наявність гілки express
  useEffect(() => {
    if (!guildId) return;
    
    // НОВИЙ СИНТАКСИС
    const expressRef = database().ref(`guilds/${guildId}/express`);
    const onExpressChange = (snapshot) => {
      if (snapshot.exists()) {
        const expressData = snapshot.val();
        const now = Date.now();
        const hasFutureChat = Object.values(expressData).some(chat => {
            const checkTime = chat.scheduleTime || chat.timestamp;
            return checkTime && checkTime > now;
        });
        setExpressAvailable(hasFutureChat);
      } else {
        setExpressAvailable(false);
      }
    };

    expressRef.on('value', onExpressChange);

    return () => {
      expressRef.off('value', onExpressChange);
    };
  }, [guildId]);

  // Перевірка наявності myInvest та завантаження даних
  useEffect(() => {
    let investRef;
    let onInvestChange;

    const fetchMyInvest = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        if (storedGuildId && storedUserId) {
          // НОВИЙ СИНТАКСИС
          investRef = database().ref(`users/${storedUserId}/userGuilds/${storedGuildId}/myInvest`);
          onInvestChange = (snapshot) => {
            const data = snapshot.val();
            if (data) {
              const investArr = Object.entries(data).map(([id, obj]) => ({ id, ...obj }));
              setMyInvests(investArr);
            } else {
              setMyInvests([]);
            }
          };
          investRef.on('value', onInvestChange);
        }
      } catch (e) {
        setMyInvests([]);
      }
    };
    fetchMyInvest();

    return () => {
        if (investRef && onInvestChange) {
            investRef.off('value', onInvestChange);
        }
    }
  }, []);

  // Додаємо завантаження іконок ВС для кожної інвестиції
  useEffect(() => {
    if (!myInvests.length) return;
    const fetchIcons = async () => {
      const updatedInvests = await Promise.all(myInvests.map(async invest => {
        if (invest.greatBuild && !invest.iconUrl) {
          // НОВИЙ СИНТАКСИС
          const gbRef = database().ref(`greatBuildings/${invest.greatBuild}/buildingImage`);
          const snap = await gbRef.once('value');
          return { ...invest, iconUrl: snap.exists() ? snap.val() : null };
        }
        return invest;
      }));
      if (JSON.stringify(updatedInvests) !== JSON.stringify(myInvests)) {
        setMyInvests(updatedInvests);
      }
    };
    fetchIcons();
  }, [myInvests]);

  // Завантаження назв ВС для всіх інвестицій
  useEffect(() => {
    if (!myInvests.length) return;
    const fetchNames = async () => {
      const names = { ...gbNames };
      let lang = "uk";
      try {
        const storedLang = await AsyncStorage.getItem('userLanguage');
        if (storedLang) lang = storedLang;
      } catch (e) {}

      await Promise.all(myInvests.map(async invest => {
        if (invest.greatBuild && !names[invest.greatBuild]) {
          // НОВИЙ СИНТАКСИС
          const gbRef = database().ref(`greatBuildings/${invest.greatBuild}/buildingName/${lang}`);
          const snap = await gbRef.once('value');
          names[invest.greatBuild] = snap.exists() ? snap.val() : null;
        }
      }));
      setGbNames(names);
    };
    fetchNames();
  }, [myInvests]);

  // Завантаження імен власників ВС для всіх інвестицій
  useEffect(() => {
    if (!myInvests.length) return;
    const fetchOwners = async () => {
      const names = { ...ownerNames };
      await Promise.all(myInvests.map(async invest => {
        if (invest.owner && !names[invest.owner]) {
          // НОВИЙ СИНТАКСИС
          const userRef = database().ref(`users/${invest.owner}/userName`);
          const snap = await userRef.once('value');
          names[invest.owner] = snap.exists() ? snap.val() : invest.owner;
        }
      }));
      setOwnerNames(names);
    };
    fetchOwners();
  }, [myInvests]);

  // 4. Фільтрація чатів для відображення
  useEffect(() => {
    if (rawChats && userArcLevel !== null && userId) {
      const groups = {};
      Object.entries(rawChats).forEach(([chatID, chat]) => {
        if (!chat.messages || Object.keys(chat.messages).length === 0) {
          return;
        }
        const chatRules = chat.rules;
        const allowedArc = chatRules.ArcLevel;
        const multiplier = chatRules.contributionMultiplier;
        let eligible = false;

        if (userArcLevel >= allowedArc || (userMayInvest !== null && userMayInvest >= allowedArc)) {
          eligible = Object.values(chat.messages).some(msg => {
            if (msg.senderId === userId) return true;
            if (!msg.excludedUser || !msg.excludedUser[userId]) return true;
            return false;
          });
        } else {
          eligible = Object.values(chat.messages).some(msg => msg.senderId === userId);
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


  const handleChatSelect = (chat) => {
    if (chat.id === 'express') {
      navigation.navigate('GBExpress');
    } else {
      navigation.navigate('GBChatWindow', { chatId: chat.id, chatIds: chat.chatIds || [] });
    }
  };

  const handleRemoveInvest = async (investId) => {
    try {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      if (storedGuildId && storedUserId && investId) {
        // НОВИЙ СИНТАКСИС
        const investRef = database().ref(`users/${storedUserId}/userGuilds/${storedGuildId}/myInvest/${investId}`);
        await investRef.remove();
      }
    } catch (e) {
      console.error('Помилка видалення інвестиції:', e);
    }
  };

  return (
    <View style={styles.container}>
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
                {invest.iconUrl && (
                  <Image
                    source={{ uri: invest.iconUrl }}
                    style={styles.gbIconTall}
                    resizeMode="contain"
                  />
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
              item.id === 'express' && styles.expressChatItem
            ]}
            onPress={() => handleChatSelect(item)}
          >
            <Text style={[styles.chatName, item.id === 'express' && styles.expressChatName]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyMessage}>{t('gbChatList.noChats')}</Text>}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
    container: {
      flex: 1,
      //padding: 20,
      //paddingTop: 10, // Щоб блок був максимально зверху
      backgroundColor: '#0f1115',
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      backgroundColor: '#152330',
      marginBottom: 10,
      marginTop: 10,
      marginLeft:20,
      marginRight:20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#1b2b3b',
    },
    chatName: {
      fontSize: 18,
      color: '#e6e9ef',
    },
    expressChatItem: {
      backgroundColor: '#1e3f54',
      borderColor: '#2a536d',
    },
    expressChatName: {
      color: '#e6f4fd',
    },
    emptyMessage: {
      padding: 15,
      textAlign: 'center',
      color: '#9aa3b2',
      fontSize: 16,
    },
    myInvestBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#182033',
      //borderRadius: 12,
      //paddingVertical: 12,
      paddingHorizontal: 18,
      marginBottom: 16,
      //marginLeft: 20,
     borderWidth: 1,
      
      borderColor: '#4ea1ff',
      shadowColor: '#4ea1ff',
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
      backgroundColor: '#0f1115',
      //borderRadius: 8,
     
      //borderColor: '#f4f7fb',
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
      color: '#4ea1ff',
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
      backgroundColor: '#152330',
      justifyContent: 'center',
      borderColor: '#4ea1ff',
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
      backgroundColor: '#1b2b3b',
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
      backgroundColor: '#1b2b3b',
    },
    myInvestTitle: {
      fontSize: 12,
      fontWeight: 'bold',
      color: '#4ea1ff',
      marginBottom: 2,
    },
    pinnedInvestText: {
      fontSize: 12,
      color: "#e6e9ef",
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
      backgroundColor: '#152330',
      borderRadius: 12,
      //borderWidth: 1,
      borderColor: '#1b2b3b',
      padding: 0,
    },
    removeInvestBtnText: {
      color: '#ff6b6b',
      fontSize: 18,
      fontWeight: 'bold',
      lineHeight: 20,
      textAlign: 'center',
      padding: 0,
    },
  });

export default GBChatList;
