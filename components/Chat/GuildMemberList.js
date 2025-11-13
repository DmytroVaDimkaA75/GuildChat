import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GuildMembersList = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchGuildMembers = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        const userId = await AsyncStorage.getItem('userId');

        if (!guildId || !userId) {
          throw new Error('guildId или userId не найдены');
        }

        const guildRef = database().ref(`guilds/${guildId}/guildUsers`);
        const snapshot = await guildRef.once('value');

        if (snapshot.exists()) {
          const guildMembers = [];
          snapshot.forEach((childSnapshot) => {
            if (childSnapshot.key !== userId) {
              const memberData = childSnapshot.val();
              guildMembers.push({
                id: childSnapshot.key,
                name: memberData.userName,
                avatarUrl: memberData.imageUrl,
              });
            }
          });
          setMembers(guildMembers);
        } else {
          console.error('Данные не найдены');
        }
      } catch (error) {
        console.error('Ошибка при получении членов гильдии: ', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGuildMembers();
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
            chatData.members[userId] &&
            chatData.members[member.id]
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
          <Text style={styles.memberStatus}>активность — недавно</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#0000ff" />;
  }

  return (
    <View style={{ flex: 1 }}>
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
  memberContainer: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
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
  },
  memberStatus: {
    fontSize: 14,
    color: 'gray',
  },
  createGroupChatText: {
    fontSize: 16,
    color: '#007BFF',
    textAlign: 'center',
    padding: 15,
  },
});

export default GuildMembersList;