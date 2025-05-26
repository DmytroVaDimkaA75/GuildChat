import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ref, onValue } from 'firebase/database';
import { database } from '../../firebaseConfig'; // Імпорт Firebase конфігурації

const ChatList = ({ chats, guildId, userId }) => {
  const navigation = useNavigation();
  const [usersMap, setUsersMap] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = ref(database, `guilds/${guildId}/guildUsers`);
        onValue(usersRef, (snapshot) => {
          const data = snapshot.val();
          setUsersMap(data || {});
        });
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, [guildId]);

  const handleChatSelect = (chat) => {
    navigation.navigate('ChatWindow', { chatId: chat.id });
  };

  const renderItem = ({ item }) => {
    if (item.type === 'private') {
      const otherMemberId = Object.keys(item.members).find(memberId => memberId !== userId);
      const otherUser = usersMap[otherMemberId];

      if (!otherUser) {
        return null;
      }

      return (
        <TouchableOpacity style={styles.chatItem} onPress={() => handleChatSelect(item)}>
          <Image source={{ uri: otherUser.imageUrl }} style={styles.avatar} />
          <Text style={styles.chatName}>{otherUser.userName}</Text>
        </TouchableOpacity>
      );
    } else {
      // Логіка для групового чату
      // Обчислюємо ініціали з назви чату
      const words = item.name.trim().split(' ');
      let initials = words[0].substring(0, 1);
      if (words.length > 1) {
        initials += words[1].substring(0, 1);
      }
      initials = initials.toUpperCase();

      return (
        <TouchableOpacity style={styles.chatItem} onPress={() => handleChatSelect(item)}>
          {item.groupAvatar ? (
            <Image source={{ uri: item.groupAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.groupAvatar, { backgroundColor: item.groupColor || '#ccc' }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <Text style={styles.chatName}>{item.name}</Text>
        </TouchableOpacity>
      );
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyMessage}>Немає доступних чатів</Text>}
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#000',
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#000',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyMessage: {
    padding: 15,
    textAlign: 'center',
    color: '#888',
    fontSize: 16,
  },
});

export default ChatList;
