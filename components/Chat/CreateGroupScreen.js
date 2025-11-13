import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import CameraIcon from "../ico/camera.svg";

const CreateGroupScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { selectedMembers } = route.params || { selectedMembers: [] };

  const [groupName, setGroupName] = useState('');
  const [chatImage, setChatImage] = useState(null);
  const [membersInfo, setMembersInfo] = useState([]);
  const [guildName, setGuildName] = useState('');

  useEffect(() => {
    const fetchMembersInfo = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        if (!guildId) throw new Error('guildId не найден');

        const promises = selectedMembers.map(async (memberId) => {
          const userRef = database().ref(`guilds/${guildId}/guildUsers/${memberId}`);
          const snapshot = await userRef.once('value');
          if (snapshot.exists()) {
            const userData = snapshot.val();
            return {
              id: memberId,
              userName: userData.userName,
              imageUrl: userData.imageUrl,
            };
          } else {
            return { id: memberId, userName: 'Неизвестный', imageUrl: null };
          }
        });

        const data = await Promise.all(promises);
        setMembersInfo(data);
      } catch (error) {
        console.error('Ошибка при получении данных пользователей: ', error);
      }
    };

    fetchMembersInfo();
  }, [selectedMembers]);

  useEffect(() => {
    const fetchGuildName = async () => {
      try {
        const guildId = await AsyncStorage.getItem('guildId');
        if (!guildId) throw new Error('guildId не найден');

        const guildRef = database().ref(`guilds/${guildId}`);
        const snapshot = await guildRef.once('value');
        if (snapshot.exists()) {
          const guildData = snapshot.val();
          setGuildName(guildData.guildName || '');
        }
      } catch (error) {
        console.error('Ошибка при получении данных гильдии: ', error);
      }
    };

    fetchGuildName();
  }, []);

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Нам нужен доступ к фото, чтобы выбрать изображение.');
        return;
      }
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.cancelled && result.assets && result.assets.length > 0) {
      setChatImage(result.assets[0].uri);
    }
  };

  const handleCreateGroup = useCallback(async () => {
    try {
      const guildId = await AsyncStorage.getItem('guildId');
      const userId = await AsyncStorage.getItem('userId');

      if (!guildId || !userId) {
        throw new Error('guildId или userId не найдены');
      }

      const newChatRef = database().ref(`guilds/${guildId}/chats`).push();

      const members = { [userId]: true };
      selectedMembers.forEach((memberId) => {
        members[memberId] = true;
      });

      const chatData = {
        type: 'group',
        name: groupName || 'Новая группа',
        members,
      };

      if (chatImage) {
        const avatarRef = storage().ref(`guilds/${guildId}/chats/${newChatRef.key}/groupAvatar.jpg`);
        await avatarRef.putFile(chatImage);
        const downloadURL = await avatarRef.getDownloadURL();
        chatData.groupAvatar = downloadURL;
      } else {
        const colorPool = [
          '#F44336', '#E91E63', '#9C27B0', '#3F51B5', '#2196F3',
          '#03A9F4', '#00BCD4', '#4CAF50', '#8BC34A', '#FFEB3B',
          '#FF9800', '#FF5722', '#9E9E9E', '#795548', '#607D8B'
        ];
        
        const chatsSnapshot = await database().ref(`guilds/${guildId}/chats`).once('value');
        let usedColors = [];
        if (chatsSnapshot.exists()) {
          chatsSnapshot.forEach(childSnapshot => {
            const chat = childSnapshot.val();
            if (chat.groupColor) {
              usedColors.push(chat.groupColor);
            }
          });
        }
        
        const availableColors = colorPool.filter(color => !usedColors.includes(color));
        let selectedColor;
        if (availableColors.length > 0) {
          selectedColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        } else {
          selectedColor = colorPool[Math.floor(Math.random() * colorPool.length)];
        }
        chatData.groupColor = selectedColor;
      }

      await newChatRef.set(chatData);
      navigation.navigate('ChatWindow', { chatId: newChatRef.key });
    } catch (error) {
      console.error('Ошибка при создании группового чата: ', error);
    }
  }, [groupName, chatImage, selectedMembers, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleCreateGroup}
          style={{ marginRight: 15, opacity: groupName ? 1 : 0.5 }}
          disabled={!groupName}
        >
          <Ionicons name="checkmark" size={24} color="white" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleCreateGroup, groupName]);

  const renderMember = ({ item }) => (
    <View style={styles.memberItem}>
      <View style={styles.avatarContainer}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.memberAvatar} />
        ) : (
          <View style={styles.noAvatar}>
            <Text style={styles.avatarInitials}>
              {item.userName ? item.userName.slice(0, 2).toUpperCase() : '??'}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.memberName}>{item.userName}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.chatImageContainer} onPress={pickImage}>
          {chatImage ? (
            <Image source={{ uri: chatImage }} style={styles.chatImage} />
          ) : (
            <CameraIcon width={40} height={40} fill="#fff" style={styles.placeholderIcon} />
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.groupNameInput}
          placeholder={guildName}
          value={groupName}
          onChangeText={setGroupName}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.membersTitle}>
        {membersInfo.length} участников
      </Text>

      <FlatList
        data={membersInfo}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        style={styles.membersList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  chatImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0088cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  chatImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  placeholderIcon: {
    backgroundColor: 'transparent',
  },
  groupNameInput: {
    flex: 1,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0088cc',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginHorizontal: 16,
  },
  membersTitle: {
    marginHorizontal: 16,
    marginVertical: 8,
    fontSize: 16,
    color: '#666',
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0088cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  noAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 16,
    color: '#000',
  },
});

export default CreateGroupScreen;