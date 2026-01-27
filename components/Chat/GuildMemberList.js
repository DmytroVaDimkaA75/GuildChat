import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPresenceStatusLabel } from './presenceUtils';

const GuildMembersList = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    let guildRef;
    let listener;

    const fetchGuildMembers = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId = await AsyncStorage.getItem('userId');

        if (!guildId || !userId) {
          throw new Error('guildId или userId не найдены');
        }

        guildRef = database().ref(`guilds/${guildId}/guildUsers`);
        listener = guildRef.on('value', (snapshot) => {
          if (snapshot.exists()) {
            const guildMembers = [];
            snapshot.forEach((childSnapshot) => {
              if (childSnapshot.key !== userId) {
                const memberData = childSnapshot.val();
                guildMembers.push({
                  id: childSnapshot.key,
                  name: memberData.userName,
                  avatarUrl: memberData.imageUrl,
                  presence: memberData.presence || null,
                });
              }
            });
            setMembers(guildMembers);
          } else {
            console.error('Данные не найдены');
          }
          setLoading(false);
        });
      } catch (error) {
        console.error('Ошибка при получении членов гильдии: ', error);
        setLoading(false);
      } finally {
        if (!guildRef) {
          setLoading(false);
        }
      }
    };

    fetchGuildMembers();
    return () => {
      if (guildRef && listener) {
        guildRef.off('value', listener);
      }
    };
  }, []);

  const handlePress = async (member) => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
  
      const chatsRef = database().ref(`guilds/${guildId}/chats`);
      const snapshot = await chatsRef.once('value');
      let chatId = null;
      let chatExists = false;
  
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const chatData = childSnapshot.val();
          if (
            chatData.type === 'private' &&
            chatData.members &&
            Object.prototype.hasOwnProperty.call(chatData.members, userId) &&
            Object.prototype.hasOwnProperty.call(chatData.members, member.id)
          ) {
            chatId = childSnapshot.key;
            chatExists = true;
            return true; // Останавливаем forEach
          }
        });
      }
  
      if (!chatExists) {
        const newChatRef = database().ref(`guilds/${guildId}/chats`).push();
        chatId = newChatRef.key;
        await newChatRef.set({
          members: {
            [userId]: true,
            [member.id]: true
          },
          name: `Private Chat with ${member.name}`,
          type: 'private'
        });
      }
  
      navigation.navigate('ChatWindow', { chatId });
    } catch (error) {
      console.error('Ошибка создания или открытия чата: ', error);
    }
  };

  const handleCreateGroupChat = () => {
    navigation.navigate('NewGroupChat');
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handlePress(item)}>
      <View style={styles.memberContainer}>
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        <View style={styles.textContainer}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberStatus}>{getPresenceStatusLabel(item.presence)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#4cd137" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleCreateGroupChat}>
        <Text style={styles.createGroupChatText}>Создать групповой чат</Text>
      </TouchableOpacity>
      <FlatList
        data={members}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  memberContainer: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  memberStatus: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  createGroupChatText: {
    fontSize: 16,
    color: '#4cd137',
    textAlign: 'center',
    padding: 15,
  },
});

export default GuildMembersList;
