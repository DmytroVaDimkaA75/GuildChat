import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Animated, Dimensions, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import database from '@react-native-firebase/database';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight, faUserGroup, faCommentDots } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const ChatList = ({ chats, guildId, userId }) => {
  const navigation = useNavigation();
  const [usersMap, setUsersMap] = useState({});
  const listOpacity = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  useEffect(() => {
    Animated.timing(listOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!guildId) return;

    const usersRef = database().ref(`guilds/${guildId}/guildUsers`);
    const onUserChange = usersRef.on('value', snapshot => {
      const data = snapshot.val();
      setUsersMap(data || {});
    });

    return () => usersRef.off('value', onUserChange);
  }, [guildId]);

  const handleChatSelect = (chat) => {
    navigation.navigate('ChatWindow', { chatId: chat.id });
  };

  const renderItem = ({ item, index }) => {
    const translateY = new Animated.Value(50);
    const opacity = new Animated.Value(0);

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (item.type === 'private') {
      const otherMemberId = Object.keys(item.members || {}).find(memberId => memberId !== userId);
      const otherUser = usersMap[otherMemberId];

      if (!otherUser) return null;

      return (
        <AnimatedTouchable
          style={[styles.chatItem, { opacity, transform: [{ translateY }] }]}
          onPress={() => handleChatSelect(item)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            <Image source={{ uri: otherUser.imageUrl }} style={styles.avatar} />
            <View style={styles.onlineIndicator} />
          </View>
          <View style={styles.chatInfo}>
            <Text style={styles.chatName} numberOfLines={1}>{otherUser.userName}</Text>
            <Text style={styles.subText}>{t('chatList.privateLabel')}</Text>
          </View>
          <FontAwesomeIcon icon={faChevronRight} size={14} color="rgba(255,255,255,0.3)" />
        </AnimatedTouchable>
      );
    } else {
      const words = item.name.trim().split(' ');
      let initials = words[0].substring(0, 1);
      if (words.length > 1) {
        initials += words[1].substring(0, 1);
      }
      initials = initials.toUpperCase();

      return (
        <AnimatedTouchable
          style={[styles.chatItem, { opacity, transform: [{ translateY }] }]}
          onPress={() => handleChatSelect(item)}
          activeOpacity={0.7}
        >
          {item.groupAvatar ? (
            <View style={styles.avatarContainer}>
              <Image source={{ uri: item.groupAvatar }} style={styles.avatar} />
            </View>
          ) : (
            <View style={[styles.groupAvatar, { backgroundColor: item.groupColor || '#121212' }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
            <View style={styles.chatInfo}>
              <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.row}>
                <FontAwesomeIcon icon={faUserGroup} size={10} color="rgba(255,255,255,0.5)" style={{ marginRight: 6 }} />
                <Text style={styles.subText}>{t('chatList.groupLabel')}</Text>
              </View>
            </View>
          <FontAwesomeIcon icon={faChevronRight} size={14} color="rgba(255,255,255,0.3)" />
        </AnimatedTouchable>
      );
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('chatList.title')}</Text>
      </View>
      <Animated.FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        style={{ opacity: listOpacity }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <FontAwesomeIcon icon={faCommentDots} size={40} color="rgba(255,255,255,0.5)" />
            </View>
            <Text style={styles.emptyMessage}>{t('chatList.emptyTitle')}</Text>
            <Text style={styles.emptySubMessage}>{t('chatList.emptySubtitle')}</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4cd137',
    borderWidth: 2,
    borderColor: '#1c1c1e',
  },
  groupAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  emptyMessage: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E0E0E0',
    marginBottom: 8,
  },
  emptySubMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
});

export default ChatList;
