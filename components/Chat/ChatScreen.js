import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatList from './ChatList';
import MessageInput from './ChatMessageInput';
import MessageList from './ChatMessageList';

const ChatScreen = () => {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [userId, setUserId] = useState(null);
  const bottomInset = Math.max(insets.bottom, 12);

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
          if (chat.members && chat.members[userId]) {
            userChats.push({ id: chatId, ...chat });
          }
        });
      }

      setChats(userChats);
    }, (error) => {
      console.error("Ошибка при прослушивании чатов:", error);
    });

    return () => chatsRef.off('value', onChatsChange);

  }, [guildId, userId]); 

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
  };
  
  const handleSendMessage = (message, chatId) => {
  };

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {selectedChat ? (
          <KeyboardAvoidingView
            style={styles.chatArea}
            behavior={Platform.select({ ios: 'padding', android: 'height' })}
            keyboardVerticalOffset={bottomInset}
          >
            <MessageList messages={selectedChat.messages || []} />
            <MessageInput
              onSendMessage={(message) => handleSendMessage(message, selectedChat.id)}
              bottomInset={bottomInset}
            />
          </KeyboardAvoidingView>
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
  chatArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});

export default ChatScreen;