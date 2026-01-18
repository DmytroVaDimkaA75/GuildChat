import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, FlatList, Image, PanResponder, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import database from '@react-native-firebase/database';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronRight, faUserGroup, faCommentDots } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const SWIPE_DELETE_THRESHOLD = 120;

const ChatListItem = ({ chat, index, guildId, userId, usersMap, onSelectChat }) => {
  const translateY = useMemo(() => new Animated.Value(50), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const swipeX = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

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

  const resetSwipe = () => {
    Animated.spring(swipeX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  const confirmDelete = () => {
    Alert.alert(
      t('deleteConfirmationTitle'),
      t('deleteConfirmationMessage'),
      [
        {
          text: t('cancel'),
          style: 'cancel',
          onPress: resetSwipe,
        },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            Animated.timing(swipeX, {
              toValue: -width,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              if (!guildId) return;
              database()
                .ref(`guilds/${guildId}/chats/${chat.id}`)
                .remove()
                .catch(error => console.error('Помилка видалення чату:', error));
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0) {
            swipeX.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -SWIPE_DELETE_THRESHOLD) {
            confirmDelete();
          } else {
            resetSwipe();
          }
        },
        onPanResponderTerminate: resetSwipe,
      }),
    [confirmDelete, resetSwipe, swipeX]
  );

  const handleChatSelect = () => {
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
        {renderUnreadBadge()}
        <FontAwesomeIcon icon={faChevronRight} size={14} color="rgba(255,255,255,0.3)" />
      </View>
    );
  };

  const renderContent = () => {
    if (chat.type === 'private') {
      const otherMemberId = Object.keys(chat.members || {}).find(memberId => memberId !== userId);
      const otherUser = usersMap[otherMemberId];

      if (!otherUser) return null;

      return (
        <>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: otherUser.imageUrl }} style={styles.avatar} />
            <View style={styles.onlineIndicator} />
          </View>
          <View style={styles.chatInfo}>
            <Text style={styles.chatName} numberOfLines={1}>{otherUser.userName}</Text>
            <Text style={styles.subText}>{t('chatList.privateLabel')}</Text>
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
          <View style={[styles.groupAvatar, { backgroundColor: chat.groupColor || '#121212' }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <View style={styles.chatInfo}>
          <Text style={styles.chatName} numberOfLines={1}>{chat.name}</Text>
          <View style={styles.row}>
            <FontAwesomeIcon icon={faUserGroup} size={10} color="rgba(255,255,255,0.5)" style={{ marginRight: 6 }} />
            <Text style={styles.subText}>{t('chatList.groupLabel')}</Text>
          </View>
        </View>
        {renderRightSide()}
      </>
    );
  };

  return (
    <Animated.View
      style={[styles.chatItem, { opacity, transform: [{ translateY }, { translateX: swipeX }] }]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity style={styles.chatItemPressable} onPress={handleChatSelect} activeOpacity={0.7}>
        {renderContent()}
      </TouchableOpacity>
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

  const renderItem = ({ item, index }) => (
    <ChatListItem
      chat={item}
      index={index}
      guildId={guildId}
      userId={userId}
      usersMap={usersMap}
      onSelectChat={handleChatSelect}
    />
  );

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
  chatItemPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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

  // ✅ Права частина: бейдж + стрілка
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ✅ Бейдж непрочитаних
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
    color: '#E0E0E0',
    marginBottom: 8,
  },
  emptySubMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
});

export default ChatList;
