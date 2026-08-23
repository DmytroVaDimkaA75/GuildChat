import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPresenceStatusLabel } from './presenceUtils';
import { filterGbgBots } from '../../src/utils/guildBots';
import { DarkThemeColors as C } from '../../constants/theme';

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
        listener = guildRef.on('value', async (snapshot) => {
          if (snapshot.exists()) {
            const guildMembers = [];
            const visibleMembers = await filterGbgBots(guildId, snapshot.val() || {});
            Object.entries(visibleMembers).forEach(([memberId, memberData]) => {
              if (memberId !== userId) {
                guildMembers.push({
                  id: memberId,
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
    <TouchableOpacity activeOpacity={0.75} onPress={() => handlePress(item)} style={styles.memberContainer}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{item.name?.slice(0, 2).toUpperCase() || '??'}</Text>
          </View>
        )}
        <View style={styles.textContainer}>
          <Text numberOfLines={1} style={styles.memberName}>{item.name}</Text>
          <Text numberOfLines={1} style={styles.memberStatus}>{getPresenceStatusLabel(item.presence)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={0.8} onPress={handleCreateGroupChat} style={styles.createGroupButton}>
        <View style={styles.createGroupIcon}>
          <Ionicons name="people-outline" size={23} color={C.primary} />
        </View>
        <View style={styles.createGroupContent}>
          <Text style={styles.createGroupChatText}>Створити груповий чат</Text>
          <Text style={styles.createGroupHint}>Оберіть кількох учасників гільдії</Text>
        </View>
        <Ionicons name="chevron-forward" size={21} color={C.primary} />
      </TouchableOpacity>
      <FlatList
        contentContainerStyle={styles.listContent}
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
    backgroundColor: C.background,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.background,
  },
  memberContainer: {
    flexDirection: 'row',
    minHeight: 70,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceElevated,
  },
  avatarInitials: {
    color: C.primarySoft,
    fontSize: 14,
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  memberStatus: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 3,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  createGroupButton: {
    minHeight: 76,
    margin: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
  },
  createGroupIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceElevated,
  },
  createGroupContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  createGroupChatText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.primarySoft,
  },
  createGroupHint: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
});

export default GuildMembersList;
