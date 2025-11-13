import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

// --- ИЗМЕНЕНО: Правильный импорт ---
import database from '@react-native-firebase/database';

// --- УДАЛЕНЫ неверные импорты ---
// import { getDatabase, onValue, push, ref, set } from 'firebase/database';

const ChatWindow = ({ route }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const { chatId, initialMessage } = route.params || {};
  const [userId, setUserId] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchUserIdAndGuildId = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        const storedGuildId = await AsyncStorage.getItem('guildId');
        setUserId(storedUserId);
        setGuildId(storedGuildId);
      } catch (error) {
        console.error('Error fetching user or guild ID: ', error);
      }
    };

    fetchUserIdAndGuildId();
  }, []);

  useEffect(() => {
    if (!chatId || !guildId) return;

    // --- ИЗМЕНЕНО: Синтаксис `ref` для @react-native-firebase ---
    const messagesRef = database().ref(`guilds/${guildId}/chats/${chatId}/messages`);

    // --- ИЗМЕНЕНО: Синтаксис `on` для создания слушателя ---
    const onMessage = messagesRef.on('value', (snapshot) => {
      const messagesData = snapshot.val() || {};
      const messagesList = Object.keys(messagesData)
        .map((key) => ({
          id: key,
          ...messagesData[key],
        }))
        .sort((a, b) => a.timestamp - b.timestamp); // Сортируем сообщения по времени
      setMessages(messagesList);
    }, (error) => {
      console.error("Ошибка при прослушивании сообщений:", error);
    });

    // --- ДОБАВЛЕНО: Функция для отписки от слушателя при закрытии компонента ---
    return () => messagesRef.off('value', onMessage);

  }, [chatId, guildId]);

  // Этот useEffect не нужен, так как логика отправки initialMessage
  // должна быть в handleSendMessage
  // useEffect(() => {
  //   if (initialMessage) {
  //     handleSendMessage(); 
  //   }
  // }, [initialMessage]);

  const handleSendMessage = async () => {
    const messageText = (initialMessage || newMessage).trim();
    if (messageText === '') return;

    try {
      if (!chatId || !userId || !guildId) throw new Error('Missing IDs');

      const messagesPath = `guilds/${guildId}/chats/${chatId}/messages`;

      // --- ИЗМЕНЕНО: Синтаксис `push` для @react-native-firebase ---
      await database().ref(messagesPath).push({
        senderId: userId,
        text: messageText,
        timestamp: Date.now(),
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message: ', error);
    }
  };

  const renderItem = ({ item }) => (
    <View
      style={[
        styles.messageContainer,
        item.senderId === userId ? styles.sentMessage : styles.receivedMessage,
      ]}
    >
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        inverted // Показывает сообщения снизу вверх, как в мессенджерах
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Write a message..."
        />
        <Button title="Send" onPress={handleSendMessage} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    justifyContent: 'space-between',
  },
  messagesList: {
    flex: 1,
    padding: 10,
  },
  messageContainer: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    maxWidth: '80%',
  },
  sentMessage: {
    backgroundColor: '#dcf8c6',
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    borderColor: '#e5e5e5',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginRight: 10,
  },
});

export default ChatWindow;