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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import CameraIcon from "../ico/camera.svg";
import { DarkThemeColors as C } from '../../constants/theme';
import { getGbgBotIds } from '../../src/utils/guildBots';

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

      const guildUsersSnapshot = await database().ref(`guilds/${guildId}/guildUsers`).once('value');
      const botIds = await getGbgBotIds(
        guildId,
        Object.keys(guildUsersSnapshot.val() || {})
      );
      const hiddenMembers = {};
      botIds.forEach((botId) => {
        members[botId] = true;
        hiddenMembers[botId] = true;
      });

      const chatData = {
        type: 'group',
        name: groupName || 'Новая группа',
        members,
      };

      if (Object.keys(hiddenMembers).length > 0) {
        chatData.hiddenMembers = hiddenMembers;
      }

      if (chatImage) {
        const avatarRef = storage().ref(`guilds/${guildId}/chats/${newChatRef.key}/groupAvatar.jpg`);
        await avatarRef.putFile(chatImage);
        const downloadURL = await avatarRef.getDownloadURL();
        chatData.groupAvatar = downloadURL;
      } else {
        const colorPool = [
          '#F44336', '#E91E63', '#9C27B0', '#3F51B5', '#4ea1ff',
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
          style={[styles.headerAction, !groupName.trim() && styles.headerActionDisabled]}
          disabled={!groupName.trim()}
        >
          <Ionicons name="checkmark" size={21} color="#fff" />
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
            <CameraIcon width={30} height={30} fill={C.primarySoft} style={styles.placeholderIcon} />
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.nameField}>
          <Text style={styles.inputLabel}>Назва групи</Text>
          <TextInput
            autoCapitalize="sentences"
            placeholder={guildName || 'Введіть назву'}
            placeholderTextColor={C.textSecondary}
            selectionColor={C.primary}
            style={styles.groupNameInput}
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>
      </View>

      <Text style={styles.membersTitle}>
        Учасники · {membersInfo.length}
      </Text>

      <FlatList
        data={membersInfo}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        style={styles.membersList}
        contentContainerStyle={styles.membersListContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 14,
    padding: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
  },
  chatImageContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  chatImage: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  placeholderIcon: {
    backgroundColor: 'transparent',
  },
  cameraBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderWidth: 2,
    borderColor: C.surface,
  },
  nameField: { flex: 1 },
  inputLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  groupNameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 11,
  },
  membersTitle: {
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '800',
    color: C.primarySoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  membersList: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 70,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  avatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  memberAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  noAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: C.primarySoft,
    fontWeight: '800',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  membersListContent: {
    paddingBottom: 20,
  },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
  },
  headerActionDisabled: { opacity: 0.35 },
});

export default CreateGroupScreen;
