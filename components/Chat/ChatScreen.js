import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ChatList from './ChatList';
import MessageInput from './ChatMessageInput';
import MessageList from './ChatMessageList';

const ChatScreen = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [userId, setUserId] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchUserData = async () => {
      const storedGuildId = await AsyncStorage.getItem('guildId');
      const storedUserId = await AsyncStorage.getItem('userId');
      setGuildId(storedGuildId);
      setUserId(storedUserId);
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    if (!guildId || !userId) {
      return; 
    }

    const chatsRef = database().ref(`guilds/${guildId}/chats`);
    
    const onChatsChange = chatsRef.on('value', (snapshot) => {
      const chatsData = snapshot.val();
      const userChats = [];

      if (chatsData) {
        Object.keys(chatsData).forEach(chatId => {
          const chat = chatsData[chatId];
          if (chat.members && Object.prototype.hasOwnProperty.call(chat.members, userId)) {
            const messages = chat.messages ? Object.values(chat.messages) : [];
            const lastMessageTimestamp = messages.reduce((latest, message) => {
              const timestamp = Number(message?.timestamp || 0);
              return timestamp > latest ? timestamp : latest;
            }, 0);
            const unreadCount = messages.filter(
              message => message?.senderId !== userId && (!message?.readBy || !message.readBy[userId])
            ).length;
            const hasUnread = unreadCount > 0;
            userChats.push({
              id: chatId,
              ...chat,
              lastMessageTimestamp,
              hasUnread,
              unreadCount,
            });
          }
        });
      }

      userChats.sort((firstChat, secondChat) => {
        if (firstChat.hasUnread !== secondChat.hasUnread) {
          return firstChat.hasUnread ? -1 : 1;
        }
        return (secondChat.lastMessageTimestamp || 0) - (firstChat.lastMessageTimestamp || 0);
      });

      setChats(userChats);
    }, (error) => {
      console.error(t('chatScreen.listenError'), error);
    });

    return () => chatsRef.off('value', onChatsChange);

  }, [guildId, userId, t]); 

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
  };
  
  const handleSendMessage = (message, chatId) => {
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {selectedChat ? (
          <>
            <MessageList messages={selectedChat.messages || []} />
            <MessageInput onSendMessage={(message) => handleSendMessage(message, selectedChat.id)} />
          </>
        ) : (
          <ChatList chats={chats} guildId={guildId} userId={userId} onSelectChat={handleSelectChat} />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  content: {
    flex: 1,
  },
});

export default ChatScreen;
