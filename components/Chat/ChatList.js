import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, PanResponder, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import database from '@react-native-firebase/database';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight, faUserGroup, faCommentDots } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const CHAT_COLORS = {
  background: '#0f1115',
  surface: '#152330',
  surfaceMuted: '#1b2b3b',
  border: '#36516a',
  primary: '#4ea1ff',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  success: '#4edb78',
};

const stripMessageMarkup = (value = '') =>
  String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\*\*|__|~~|\|\||_/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getLatestMessage = (chat) => {
  const messages = Object.values(chat.messages || {});
  return messages.reduce((latest, message) => {
    const timestamp = Number(message?.timestamp || message?.authoredAt || 0);
    const latestTimestamp = Number(latest?.timestamp || latest?.authoredAt || 0);
    return timestamp > latestTimestamp ? message : latest;
  }, null);
};

const getMessagePreview = (message, fallback) => {
  if (!message) return fallback;
  const text = stripMessageMarkup(message.text || message.html || '');
  if (text) return text;
  if (message.images?.length || message.imageUrl) return 'Зображення';
  if (message.audioUrl) return 'Голосове повідомлення';
  return fallback;
};

const formatChatTime = (message) => {
  const timestamp = Number(message?.timestamp || message?.authoredAt || 0);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
};

const SWIPE_DELETE_THRESHOLD = 60;
const DELETE_ACTION_WIDTH = 84;

const ChatListItem = ({ chat, index, userId, usersMap, onDeleteChat, onSelectChat }) => {
  const translateY = useMemo(() => new Animated.Value(50), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const swipeX = useRef(new Animated.Value(0)).current;
  const isSwipeOpen = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { t } = useTranslation();
  const latestMessage = useMemo(() => getLatestMessage(chat), [chat]);
  const latestTime = useMemo(() => formatChatTime(latestMessage), [latestMessage]);

  const unreadCount = useMemo(() => {
    if (Number.isFinite(chat.unreadCount)) {
      return chat.unreadCount;
    }

    const messages = chat.messages ? Object.values(chat.messages) : [];
    return messages.filter(
      message => message?.senderId !== userId && (!message?.readBy || !message.readBy[userId])
    ).length;
  }, [chat.messages, chat.unreadCount, userId]);

  useEffect(() => {
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
  }, [index, opacity, translateY]);

  const resetSwipe = useCallback(() => {
    isSwipeOpen.current = false;
    Animated.spring(swipeX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [swipeX]);

  const openSwipe = useCallback(() => {
    isSwipeOpen.current = true;
    Animated.spring(swipeX, {
      toValue: -DELETE_ACTION_WIDTH,
      useNativeDriver: true,
    }).start();
  }, [swipeX]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteChat(chat);
    } catch (error) {
      console.error('Помилка видалення чату:', error);
      setIsDeleting(false);
      resetSwipe();
      Alert.alert(
        t('chatList.deleteErrorTitle'),
        t('chatList.deleteErrorMessage')
      );
    }
  }, [chat, isDeleting, onDeleteChat, resetSwipe, t]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          (gestureState.dx < 0 || isSwipeOpen.current),
        onPanResponderMove: (_, gestureState) => {
          const startPosition = isSwipeOpen.current ? -DELETE_ACTION_WIDTH : 0;
          const nextPosition = Math.max(
            -DELETE_ACTION_WIDTH,
            Math.min(0, startPosition + gestureState.dx)
          );
          swipeX.setValue(nextPosition);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isSwipeOpen.current) {
            if (gestureState.dx > 10) resetSwipe();
            else openSwipe();
          } else if (gestureState.dx <= -SWIPE_DELETE_THRESHOLD) {
            openSwipe();
          } else {
            resetSwipe();
          }
        },
        onPanResponderTerminate: () => {
          if (isSwipeOpen.current) openSwipe();
          else resetSwipe();
        },
      }),
    [openSwipe, resetSwipe, swipeX]
  );

  const handleChatSelect = () => {
    if (isSwipeOpen.current) {
      resetSwipe();
      return;
    }
    onSelectChat(chat);
  };

  const renderUnreadBadge = () => {
    if (!unreadCount) return null;

    // ✅ Якщо повідомлень дуже багато — показуємо 99+
    const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

    return (
      <View style={styles.unreadBadge}>
        <Text style={styles.unreadBadgeText}>{displayCount}</Text>
      </View>
    );
  };

  const renderRightSide = () => {
    return (
      <View style={styles.rightSide}>
        {!!latestTime && <Text style={styles.chatTime}>{latestTime}</Text>}
        {renderUnreadBadge()}
        <FontAwesomeIcon icon={faChevronRight} size={14} color="rgba(255,255,255,0.3)" />
      </View>
    );
  };

  const renderContent = () => {
    if (chat.type === 'private') {
      const otherMemberId = Object.keys(chat.members || {}).find(memberId => memberId !== userId);
      const otherUser = usersMap[otherMemberId];
      const isOnline = otherUser?.presence?.state === 'online';

      if (!otherUser) return null;

      return (
        <>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: otherUser.imageUrl }} style={styles.avatar} />
            {isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.chatInfo}>
            <Text style={styles.chatName} numberOfLines={1}>{otherUser.userName}</Text>
            <Text style={styles.subText} numberOfLines={1}>
              {getMessagePreview(latestMessage, t('chatList.privateLabel'))}
            </Text>
          </View>
          {renderRightSide()}
        </>
      );
    }

    const words = chat.name.trim().split(' ');
    let initials = words[0].substring(0, 1);
    if (words.length > 1) {
      initials += words[1].substring(0, 1);
    }
    initials = initials.toUpperCase();

    return (
      <>
        {chat.groupAvatar ? (
          <View style={styles.avatarContainer}>
            <Image source={{ uri: chat.groupAvatar }} style={styles.avatar} />
          </View>
        ) : (
          <View style={[styles.groupAvatar, { backgroundColor: chat.groupColor || '#0f1115' }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <View style={styles.chatInfo}>
          <Text style={styles.chatName} numberOfLines={1}>{chat.name}</Text>
          <View style={styles.row}>
            <FontAwesomeIcon icon={faUserGroup} size={10} color="rgba(255,255,255,0.5)" style={{ marginRight: 6 }} />
            <Text style={styles.subText} numberOfLines={1}>
              {getMessagePreview(latestMessage, t('chatList.groupLabel'))}
            </Text>
          </View>
        </View>
        {renderRightSide()}
      </>
    );
  };

  return (
    <Animated.View
      style={[styles.swipeContainer, { opacity, transform: [{ translateY }] }]}
    >
      <TouchableOpacity
        accessibilityLabel={t('chatList.delete')}
        accessibilityRole="button"
        activeOpacity={0.75}
        disabled={isDeleting}
        onPress={handleDelete}
        style={styles.deleteBackground}
      >
        <MaterialIcons name="delete-outline" size={27} color="#fff" />
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          numberOfLines={1}
          style={styles.deleteText}
        >
          {t('chatList.delete')}
        </Text>
      </TouchableOpacity>
      <Animated.View
        style={[styles.chatItem, { transform: [{ translateX: swipeX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity style={styles.chatItemPressable} onPress={handleChatSelect} activeOpacity={0.7}>
          {renderContent()}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

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
  }, [listOpacity]);

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

  const handleDeleteChat = useCallback(async (chat) => {
    if (!guildId || !userId || !chat?.id) throw new Error('chat-not-found');
    await database()
      .ref(`guilds/${guildId}/chats/${chat.id}/deletedFor/${userId}`)
      .set(database.ServerValue.TIMESTAMP);
  }, [guildId, userId]);

  const renderItem = ({ item, index }) => (
    <ChatListItem
      chat={item}
      index={index}
      userId={userId}
      usersMap={usersMap}
      onDeleteChat={handleDeleteChat}
      onSelectChat={handleChatSelect}
    />
  );

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />
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
    backgroundColor: CHAT_COLORS.background,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 40,
  },
  chatItem: {
    borderRadius: 24,
    backgroundColor: CHAT_COLORS.surface,
    borderWidth: 1,
    borderColor: CHAT_COLORS.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  swipeContainer: {
    borderRadius: 24,
    marginBottom: 12,
    overflow: 'hidden',
  },
  deleteBackground: {
    alignItems: 'center',
    backgroundColor: '#d9363e',
    bottom: 1,
    justifyContent: 'center',
    paddingLeft: 20,
    position: 'absolute',
    right: 1,
    top: 1,
    width: DELETE_ACTION_WIDTH + 20,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    width: DELETE_ACTION_WIDTH - 6,
  },
  chatItemPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 92,
    padding: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: CHAT_COLORS.primary,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: CHAT_COLORS.success,
    borderWidth: 2,
    borderColor: CHAT_COLORS.surface,
  },
  groupAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    borderWidth: 1,
    borderColor: CHAT_COLORS.primary,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarText: {
    color: CHAT_COLORS.text,
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
    color: CHAT_COLORS.text,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subText: {
    fontSize: 13,
    color: CHAT_COLORS.muted,
    paddingRight: 8,
  },

  // ✅ Права частина: бейдж + стрілка
  rightSide: {
    minWidth: 62,
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  chatTime: { color: CHAT_COLORS.muted, fontSize: 11, marginBottom: 7 },

  // ✅ Бейдж непрочитаних
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: CHAT_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    color: '#f4f7fb',
    marginBottom: 8,
  },
  emptySubMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
});

export default ChatList;
