import { faUserGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
// import { get, getDatabase, onValue, ref, set } from 'firebase/database'; // <- УДАЛЕНО
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// v-- ДОБАВЛЕНО
import database from '@react-native-firebase/database';


const GBExpress = () => {
  const [groupedChats, setGroupedChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buildingImages, setBuildingImages] = useState({});
  const [buildingNames, setBuildingNames] = useState({});
  const [userNames, setUserNames] = useState({});
  const [userLanguage, setUserLanguage] = useState(null); // Наприклад, "ua" або "en"
  const [guildId, setGuildId] = useState(null);
  // Поточний користувач для інших перевірок (напр., де кнопка "Взяти участь" деактивується)
  const [currentUserId, setCurrentUserId] = useState(null);
  // Стан для збереження рівнів ВС користувача для кожного buildID
  const [userBuildLevels, setUserBuildLevels] = useState({});

  // Стан модального вікна
  const [modalVisible, setModalVisible] = useState(false);
  // Стан групи чатів, для якої відкрили модальне вікно
  const [modalGroup, setModalGroup] = useState(null);

  // Використовуємо useRef для кешування отриманих даних
  const buildingImagesRef = useRef({});
  const buildingNamesRef = useRef({});
  const userNamesRef = useRef({});
  const userBuildLevelsRef = useRef({});

  const navigation = useNavigation();

  // Вивід усіх значень з AsyncStorage у форматі "ключ - значення"
  useEffect(() => {
    const logAsyncStorage = async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const stores = await AsyncStorage.multiGet(keys);
        stores.forEach(([key, value]) => {
          console.log(`${key} - ${value}`);
        });
      } catch (error) {
        // Обробка помилки при потребі
      }
    };
    logAsyncStorage();
  }, []);

  // Отримуємо userLanguage з AsyncStorage за ключем "userLanguage" (fallback "ua")
  useEffect(() => {
    const fetchUserLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem('userLanguage');
        setUserLanguage(storedLanguage || 'ua');
      } catch (error) {
        setUserLanguage('ua');
      }
    };
    fetchUserLanguage();
  }, []);

  // Отримуємо guildId та currentUserId з AsyncStorage (для перевірки кнопки)
  useEffect(() => {
    const fetchGuildAndUser = async () => {
      try {
        const storedGuildId = await AsyncStorage.getItem('guildId');
        const storedUserId = await AsyncStorage.getItem('userId');
        setGuildId(storedGuildId);
        setCurrentUserId(storedUserId);
      } catch (error) {
        // Обробка помилки
      }
    };
    fetchGuildAndUser();
  }, []);

  // Завантаження чатів, даних для ВС, користувачів та рівнів ВС
  useEffect(() => {
    if (!userLanguage || !guildId || !currentUserId) return;

    // НОВИЙ СИНТАКСИС
    const chatsRef = database().ref(`guilds/${guildId}/express`);

    const onChatsValueChange = (snapshot) => {
      if (snapshot.exists()) {
        const chatEntries = Object.entries(snapshot.val()).map(([key, value]) => ({ id: key, ...value }));
        const currentTime = Date.now();

        const filteredChats = chatEntries.filter(
          (chat) => chat.scheduleTime && chat.scheduleTime > currentTime
        );

        const grouped = filteredChats.reduce((acc, chat) => {
          const timeKey = chat.scheduleTime;
          if (!acc[timeKey]) {
            acc[timeKey] = { scheduleTime: timeKey, chats: [] };
          }
          acc[timeKey].chats.push(chat);
          return acc;
        }, {});
        const groupedList = Object.values(grouped).sort((a, b) => a.scheduleTime - b.scheduleTime);
        setGroupedChats(groupedList);

        const buildUserMapping = {};
        filteredChats.forEach((chat) => {
          if (chat.allowedGB && !buildUserMapping[chat.allowedGB]) {
            buildUserMapping[chat.allowedGB] = chat.user;
          }
        });

        const uniqueBuildIDs = new Set();
        filteredChats.forEach((chat) => {
          if (chat.allowedGB) uniqueBuildIDs.add(chat.allowedGB);
        });

        uniqueBuildIDs.forEach((buildID) => {
          if (!buildingImagesRef.current.hasOwnProperty(buildID)) {
            // НОВИЙ СИНТАКСИС
            database().ref(`greatBuildings/${buildID}`).once('value')
              .then((snap) => {
                if (snap.exists()) {
                  const buildingData = snap.val();
                  const { buildingImage, buildingName } = buildingData;

                  if (typeof buildingImage === 'string') {
                    buildingImagesRef.current[buildID] = buildingImage;
                  } else if (buildingImage && typeof buildingImage === 'object' && buildingImage.uri) {
                    buildingImagesRef.current[buildID] = buildingImage.uri;
                  } else {
                    buildingImagesRef.current[buildID] = null;
                  }
                  setBuildingImages({ ...buildingImagesRef.current });

                  if (buildingName && typeof buildingName === 'object') {
                    buildingNamesRef.current[buildID] = buildingName[userLanguage];
                  } else {
                    buildingNamesRef.current[buildID] = buildingName || null;
                  }
                  setBuildingNames({ ...buildingNamesRef.current });
                } else {
                  buildingImagesRef.current[buildID] = null;
                  buildingNamesRef.current[buildID] = null;
                  setBuildingImages({ ...buildingImagesRef.current });
                  setBuildingNames({ ...buildingNamesRef.current });
                }
              })
              .catch((error) => { /* Обробка помилки */ });
          }
        });

        uniqueBuildIDs.forEach((buildID) => {
          if (!userBuildLevelsRef.current.hasOwnProperty(buildID)) {
            const chatUserId = buildUserMapping[buildID];
            // НОВИЙ СИНТАКСИС
            database().ref(`guilds/${guildId}/guildUsers/${chatUserId}/greatBuild/${buildID}`).once('value')
              .then((snap) => {
                if (snap.exists()) {
                  const buildData = snap.val();
                  userBuildLevelsRef.current[buildID] = buildData.level;
                } else {
                  userBuildLevelsRef.current[buildID] = 0;
                }
                setUserBuildLevels({ ...userBuildLevelsRef.current });
              })
              .catch((error) => {
                userBuildLevelsRef.current[buildID] = 0;
                setUserBuildLevels({ ...userBuildLevelsRef.current });
              });
          }
        });

        const uniqueUserIDs = new Set();
        filteredChats.forEach((chat) => {
          if (chat.user) uniqueUserIDs.add(chat.user);
        });
        uniqueUserIDs.forEach((userId) => {
          if (!userNamesRef.current.hasOwnProperty(userId)) {
            // НОВИЙ СИНТАКСИС
            database().ref(`users/${userId}`).once('value')
              .then((snap) => {
                if (snap.exists()) {
                  const userData = snap.val();
                  userNamesRef.current[userId] = userData.userName;
                  setUserNames({ ...userNamesRef.current });
                } else {
                  userNamesRef.current[userId] = null;
                  setUserNames({ ...userNamesRef.current });
                }
              })
              .catch((error) => { /* Обробка помилки */ });
          }
        });
      } else {
        setGroupedChats([]);
      }
      setLoading(false);
    };

    chatsRef.on('value', onChatsValueChange);

    // Функція для відписки від слухача при розмонтуванні компонента
    return () => chatsRef.off('value', onChatsValueChange);
  }, [userLanguage, guildId, currentUserId]);

  const handleJoinPress = (group) => {
    setModalGroup(group);
    setModalVisible(true);
  };

  const handleAccept = async () => {
    if (!guildId || !modalGroup) return;

    for (const chat of modalGroup.chats) {
      // НОВИЙ СИНТАКСИС
      await database()
        .ref(`guilds/${guildId}/express/${chat.id}/allowedUsers/${chat.user}`)
        .set(true);
    }
    setModalVisible(false);
  };

  const handleCancel = () => {
    setModalVisible(false);
  };

  const handleAddExpress = (scheduleTime) => {
    navigation.navigate('GBNewExpress', { scheduleTime });
  };

  return (
    <View style={styles.container}>
      {/* Модальне вікно */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalText}>
              Ваша ставка успішно прийнята! Якщо ваша Арка увійде до п’ятірки, що задовольняють умови експресу, ви отримаєте нагадування за 5 хвилин до його початку.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={handleCancel}>
                <Text style={styles.modalButtonText}>Відміна</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.acceptButton]} onPress={handleAccept}>
                <Text style={styles.modalButtonText}>Прийняти</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator size="large" color="#0088cc" />
      ) : groupedChats.length === 0 ? (
        <Text style={styles.emptyText}>Немає доступних чатів</Text>
      ) : (
        <FlatList
          data={groupedChats}
          keyExtractor={(item) => item.scheduleTime.toString()}
          renderItem={({ item }) => {
            const scheduleDate = new Date(item.scheduleTime);
            const today = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(today.getDate() + 1);

            const timeString = scheduleDate.toLocaleTimeString('uk-UA', {
              hour: 'numeric',
              minute: 'numeric',
            });

            let formattedDate = '';
            if (
              scheduleDate.getFullYear() === today.getFullYear() &&
              scheduleDate.getMonth() === today.getMonth() &&
              scheduleDate.getDate() === today.getDate()
            ) {
              formattedDate = `сьогодні, ${timeString}`;
            } else if (
              scheduleDate.getFullYear() === tomorrow.getFullYear() &&
              scheduleDate.getMonth() === tomorrow.getMonth() &&
              scheduleDate.getDate() === tomorrow.getDate()
            ) {
              formattedDate = `завтра, ${timeString}`;
            } else {
              formattedDate = scheduleDate.toLocaleString('uk-UA', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
              });
            }

            const isOwnGroup = item.chats.every((chat) => chat.user === currentUserId);

            let badgeCount = 0;
            if (
              item.chats &&
              item.chats.length > 0 &&
              item.chats[0].allowedUsers &&
              typeof item.chats[0].allowedUsers === 'object'
            ) {
              badgeCount = Object.keys(item.chats[0].allowedUsers).length;
            }

            return (
              <View style={styles.groupContainer}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTime}>Запланований час: {formattedDate}</Text>
                  <View style={styles.iconContainer}>
                    <FontAwesomeIcon icon={faUserGroup} size={20} style={styles.groupIcon} />
                    {badgeCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{badgeCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {item.chats.map((chat, index) => (
                  <View
                    key={index}
                    style={[
                      styles.chatItem,
                      chat.user === currentUserId && styles.ownChatItem
                    ]}
                  >
                    <View style={styles.chatRow}>
                      {buildingImages[chat.allowedGB] ? (
                        <Image
                          source={{ uri: buildingImages[chat.allowedGB] }}
                          style={styles.chatImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={styles.chatImagePlaceholder} />
                      )}
                      <View style={styles.chatTextContainer}>
                        <Text style={styles.chatTitle}>
                          {userNames[chat.user]} ({buildingNames[chat.allowedGB]})
                        </Text>
                        <Text style={styles.chatDescription}>
                          Орієнтовно <Text style={styles.boldText}>{chat.levelThreshold}</Text> рівнів (
                          <Text style={styles.boldText}>
                            {userBuildLevels[chat.allowedGB] !== undefined ? userBuildLevels[chat.allowedGB] + 1 : 1}
                          </Text>{' '}
                          →{' '}
                          <Text style={styles.boldText}>
                            {userBuildLevels[chat.allowedGB] !== undefined
                              ? userBuildLevels[chat.allowedGB] + chat.levelThreshold
                              : chat.levelThreshold}
                          </Text>
                          )
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, isOwnGroup && styles.disabledButton]}
                    onPress={() => !isOwnGroup && handleJoinPress(item)}
                    disabled={isOwnGroup}
                  >
                    <Text style={styles.buttonText}>Взяти участь</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.button} onPress={() => handleAddExpress(item.scheduleTime)}>
                    <Text style={styles.buttonText}>Додати свій експрес</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

// Стили остаются без изменений
const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0f1115',
      padding: 10,
    },
    groupContainer: {
      marginBottom: 15,
      padding: 10,
      backgroundColor: '#1b1f2a',
      borderRadius: 10,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    groupTime: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#e6e9ef',
    },
    iconContainer: {
      position: 'relative',
    },
    groupIcon: {
      marginLeft: 10,
    },
    badge: {
      position: 'absolute',
      top: -5,
      right: -10,
      backgroundColor: '#2f7de1',
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 3,
    },
    badgeText: {
      color: '#fff',
      fontSize: 8,
      fontWeight: 'bold',
    },
    chatItem: {
      padding: 10,
      marginVertical: 4,
      backgroundColor: '#222733',
      borderRadius: 8,
    },
    ownChatItem: {
      backgroundColor: '#214a33',
    },
    chatRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    chatImage: {
      width: 50,
      height: 50,
      marginRight: 10,
    },
    chatImagePlaceholder: {
      width: 50,
      height: 50,
      marginRight: 10,
      backgroundColor: '#2a2f3a',
    },
    chatTextContainer: {
      flex: 1,
    },
    chatTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#e6e9ef',
    },
    chatDescription: {
      fontSize: 14,
      color: '#9aa3b2',
    },
    boldText: {
      fontWeight: 'bold',
    },
    emptyText: {
      fontSize: 16,
      textAlign: 'center',
      marginTop: 20,
      color: '#9aa3b2',
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    button: {
      flex: 1,
      padding: 10,
      backgroundColor: '#2f7de1',
      borderRadius: 5,
      alignItems: 'center',
      marginHorizontal: 5,
    },
    disabledButton: {
      backgroundColor: '#3a3f4a',
    },
    buttonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: 20,
    },
    modalContainer: {
      backgroundColor: '#1b1f2a',
      borderRadius: 10,
      padding: 20,
    },
    modalText: {
      fontSize: 16,
      marginBottom: 20,
      color: '#e6e9ef',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    modalButton: {
      marginLeft: 10,
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 5,
    },
    cancelButton: {
      backgroundColor: '#3a3f4a',
    },
    acceptButton: {
      backgroundColor: '#2f7de1',
    },
    modalButtonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
  });

export default GBExpress;
