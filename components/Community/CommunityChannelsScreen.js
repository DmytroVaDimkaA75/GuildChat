import { MaterialIcons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const COLORS = {
  background: '#0f1115',
  surface: '#1b1f2a',
  surfaceHighlight: '#2a2f3a',
  primary: '#4ea1ff',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  border: '#3a3f4a',
};

const formatTime = (timestamp) => {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
};

const getProfileAvatarUrl = (profile) => {
  if (!profile || typeof profile !== 'object') return '';

  const directUrl = profile.avatarUrl || profile.imageUrl;
  if (typeof directUrl === 'string' && directUrl.trim()) return directUrl;

  const guildProfile = Object.values(profile).find(
    (value) =>
      value &&
      typeof value === 'object' &&
      typeof value.imageUrl === 'string' &&
      value.imageUrl.trim()
  );
  return guildProfile?.imageUrl || '';
};

export default function CommunityChannelsScreen({ route, navigation }) {
  const headerHeight = useHeaderHeight();
  const { communityId, communityName } = route.params || {};
  const [community, setCommunity] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [identity, setIdentity] = useState({ userId: '', userName: 'Гравець', worldName: 'Інший світ' });
  const [sending, setSending] = useState(false);
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('Загальне');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [channelMenuExpanded, setChannelMenuExpanded] = useState(false);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberRoleBusyId, setMemberRoleBusyId] = useState('');
  const [membersError, setMembersError] = useState('');
  const messageListRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: communityName || 'Спільнота' });
  }, [communityName, navigation]);

  useEffect(() => {
    const loadIdentity = async () => {
      const [userId, guildId] = await Promise.all([
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
      ]);
      if (!userId) return;

      const [userSnapshot, guildSnapshot] = await Promise.all([
        database().ref(`users/${userId}`).once('value'),
        guildId ? database().ref(`guilds/${guildId}`).once('value') : Promise.resolve(null),
      ]);
      setIdentity({
        userId,
        userName: userSnapshot.val()?.userName || 'Гравець',
        worldName: guildSnapshot?.val()?.worldName || guildSnapshot?.val()?.guildName || 'Інший світ',
      });
    };
    loadIdentity().catch((error) => console.error('Помилка профілю спільноти:', error));
  }, []);

  useEffect(() => {
    if (!communityId) return undefined;
    const communityRef = database().ref(`communities/${communityId}`);
    const listener = communityRef.on('value', (snapshot) => {
      const value = snapshot.val();
      setCommunity(value);
      const channels = Object.entries(value?.channels || {})
        .map(([id, channel]) => ({ id, ...channel }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      setSelectedChannel((current) => current || channels[0] || null);
    });
    return () => communityRef.off('value', listener);
  }, [communityId]);

  useEffect(() => {
    if (!communityId || !selectedChannel?.id) {
      setMessages([]);
      return undefined;
    }
    const messagesRef = database().ref(
      `communityMessages/${communityId}/${selectedChannel.id}`
    );
    const listener = messagesRef
      .limitToLast(100)
      .on('value', (snapshot) => {
        const nextMessages = Object.entries(snapshot.val() || {})
          .map(([id, value]) => ({ id, ...value }))
          .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
        setMessages(nextMessages);
      });
    return () => messagesRef.off('value', listener);
  }, [communityId, selectedChannel?.id]);

  const channels = useMemo(
    () =>
      Object.entries(community?.channels || {})
        .map(([id, channel]) => ({ id, ...channel }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [community]
  );
  const channelGroups = useMemo(() => {
    const configuredCategories = Object.entries(community?.categories || {})
      .map(([id, category]) => ({ id, ...category }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const categoryMap = new Map(
      configuredCategories.map((category) => [
        category.id,
        { ...category, channels: [] },
      ])
    );

    channels.forEach((channel) => {
      const categoryId = channel.categoryId || 'general';
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          id: categoryId,
          name: categoryId === 'general' ? 'Загальне' : categoryId,
          order: categoryId === 'general' ? 0 : 999,
          channels: [],
        });
      }
      categoryMap.get(categoryId).channels.push(channel);
    });

    return Array.from(categoryMap.values()).sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
  }, [channels, community?.categories]);
  const memberRole = community?.members?.[identity.userId]?.role;
  const canManageChannels = memberRole === 'owner' || memberRole === 'moderator';
  const isCommunityAuthor =
    Boolean(identity.userId) &&
    community?.createdBy === identity.userId &&
    memberRole === 'owner';
  const communityMemberIds = useMemo(
    () => Object.keys(community?.members || {}).sort(),
    [community?.members]
  );
  const memberRows = useMemo(
    () =>
      communityMemberIds
        .map((userId) => ({
          id: userId,
          role: community?.members?.[userId]?.role || 'member',
          userName: memberProfiles[userId]?.userName || userId,
          avatarUrl: memberProfiles[userId]?.avatarUrl || '',
        }))
        .sort((a, b) => {
          if (a.role === 'owner' && b.role !== 'owner') return -1;
          if (a.role !== 'owner' && b.role === 'owner') return 1;
          return a.userName.localeCompare(b.userName, 'uk');
        }),
    [community?.members, communityMemberIds, memberProfiles]
  );

  useEffect(() => {
    if (!membersModalVisible) return undefined;

    let active = true;
    const loadMemberProfiles = async () => {
      setMembersLoading(true);
      setMembersError('');
      let hasLoadError = false;

      const profiles = await Promise.all(
        communityMemberIds.map(async (userId) => {
          try {
            const snapshot = await database().ref(`users/${userId}`).once('value');
            const profile = snapshot.val() || {};
            return [
              userId,
              {
                userName: profile.userName || userId,
                avatarUrl: getProfileAvatarUrl(profile),
              },
            ];
          } catch (error) {
            console.error(`Помилка завантаження учасника ${userId}:`, error);
            hasLoadError = true;
            return [userId, { userName: userId, avatarUrl: '' }];
          }
        })
      );

      if (!active) return;
      setMemberProfiles(Object.fromEntries(profiles));
      setMembersLoading(false);
      if (hasLoadError) {
        setMembersError('Деякі профілі не вдалося завантажити. Для них показано ID.');
      }
    };

    loadMemberProfiles().catch((error) => {
      console.error('Помилка завантаження учасників спільноти:', error);
      if (!active) return;
      setMembersLoading(false);
      setMembersError('Не вдалося завантажити профілі учасників.');
    });

    return () => {
      active = false;
    };
  }, [communityMemberIds, membersModalVisible]);

  useEffect(() => {
    if (membersModalVisible && !isCommunityAuthor) {
      setMembersModalVisible(false);
      setMembersError('');
    }
  }, [isCommunityAuthor, membersModalVisible]);

  const openMembersModal = () => {
    if (!isCommunityAuthor) return;
    setMembersError('');
    setChannelMenuExpanded(false);
    setMembersModalVisible(true);
  };

  const toggleMemberRole = async (targetUserId) => {
    if (!targetUserId || memberRoleBusyId) return;

    setMemberRoleBusyId(targetUserId);
    setMembersError('');
    try {
      if (!communityId || !identity.userId) {
        throw new Error('Не вдалося підтвердити ваш профіль.');
      }

      const communityRef = database().ref(`communities/${communityId}`);
      const latestSnapshot = await communityRef.once('value');
      const latestCommunity = latestSnapshot.val();
      const latestAuthorRole = latestCommunity?.members?.[identity.userId]?.role;
      const latestTargetRole = latestCommunity?.members?.[targetUserId]?.role;

      if (
        !latestCommunity ||
        latestCommunity.createdBy !== identity.userId ||
        latestAuthorRole !== 'owner'
      ) {
        throw new Error('Право керувати учасниками більше не підтверджено.');
      }
      if (latestTargetRole === 'owner') {
        throw new Error('Роль автора спільноти змінити не можна.');
      }
      if (latestTargetRole !== 'member' && latestTargetRole !== 'moderator') {
        throw new Error('Учасника більше немає у спільноті або його роль змінилася.');
      }

      const result = await communityRef.transaction((currentCommunity) => {
        const currentAuthorRole = currentCommunity?.members?.[identity.userId]?.role;
        const currentTarget = currentCommunity?.members?.[targetUserId];
        const currentTargetRole = currentTarget?.role;

        if (
          !currentCommunity ||
          currentCommunity.createdBy !== identity.userId ||
          currentAuthorRole !== 'owner' ||
          currentTargetRole === 'owner' ||
          (currentTargetRole !== 'member' && currentTargetRole !== 'moderator')
        ) {
          return undefined;
        }

        return {
          ...currentCommunity,
          members: {
            ...currentCommunity.members,
            [targetUserId]: {
              ...currentTarget,
              role: currentTargetRole === 'moderator' ? 'member' : 'moderator',
            },
          },
        };
      });

      if (!result.committed) {
        throw new Error('Роль змінилася до запису. Оновіть список і спробуйте ще раз.');
      }
    } catch (error) {
      console.error('Помилка зміни ролі учасника:', error);
      setMembersError(error.message || 'Не вдалося змінити роль учасника.');
    } finally {
      setMemberRoleBusyId('');
    }
  };

  const createChannel = async () => {
    const normalizedName = newChannelName
      .trim()
      .toLocaleLowerCase('uk')
      .replace(/\s+/g, '-')
      .replace(/[^a-zа-яіїєґ0-9_-]/gi, '');
    if (!normalizedName || creatingChannel) return;
    const categoryName = newChannelCategory.trim() || 'Загальне';
    const categoryId =
      categoryName.toLocaleLowerCase('uk') === 'загальне'
        ? 'general'
        : categoryName
            .toLocaleLowerCase('uk')
            .replace(/\s+/g, '-')
            .replace(/[^a-zа-яіїєґ0-9_-]/gi, '');

    setCreatingChannel(true);
    try {
      const channelRef = database().ref(`communities/${communityId}/channels`).push();
      const channel = {
        name: normalizedName,
        description: newChannelDescription.trim() || 'Новий тематичний канал',
        categoryId,
        order: channels.length + 1,
        createdBy: identity.userId,
        createdAt: database.ServerValue.TIMESTAMP,
      };
      const updates = {};
      updates[`communities/${communityId}/channels/${channelRef.key}`] = channel;
      if (!community?.categories?.[categoryId]) {
        updates[`communities/${communityId}/categories/${categoryId}`] = {
          name: categoryName,
          order: Object.keys(community?.categories || {}).length + 1,
          createdBy: identity.userId,
          createdAt: database.ServerValue.TIMESTAMP,
        };
      }
      await database().ref().update(updates);
      setSelectedChannel({ id: channelRef.key, ...channel });
      setNewChannelName('');
      setNewChannelDescription('');
      setNewChannelCategory(categoryName);
      setChannelModalVisible(false);
      setChannelMenuExpanded(false);
    } catch (error) {
      console.error('Помилка створення каналу:', error);
      Alert.alert('Не вдалося створити канал', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setCreatingChannel(false);
    }
  };

  const createCategory = async () => {
    const categoryName = newCategoryName.trim();
    if (!categoryName || creatingCategory) return;

    const categoryId = categoryName
      .toLocaleLowerCase('uk')
      .replace(/\s+/g, '-')
      .replace(/[^a-zа-яіїєґ0-9_-]/gi, '');
    if (!categoryId) return;

    if (community?.categories?.[categoryId]) {
      Alert.alert('Така тема вже існує');
      return;
    }

    setCreatingCategory(true);
    try {
      await database().ref(`communities/${communityId}/categories/${categoryId}`).set({
        name: categoryName,
        order: Object.keys(community?.categories || {}).length + 1,
        createdBy: identity.userId,
        createdAt: database.ServerValue.TIMESTAMP,
      });
      setCollapsedCategories((current) => ({ ...current, [categoryId]: false }));
      setNewChannelCategory(categoryName);
      setNewCategoryName('');
      setCategoryModalVisible(false);
      setChannelModalVisible(true);
    } catch (error) {
      console.error('Помилка створення теми:', error);
      Alert.alert('Не вдалося створити тему', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setCreatingCategory(false);
    }
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending || !selectedChannel?.id) return;
    if (!identity.userId) {
      Alert.alert('Потрібен профіль', 'Увійдіть у профіль, щоб надсилати повідомлення.');
      return;
    }
    setSending(true);
    try {
      await database()
        .ref(`communityMessages/${communityId}/${selectedChannel.id}`)
        .push({
          text,
          senderId: identity.userId,
          senderName: identity.userName,
          worldName: identity.worldName,
          timestamp: database.ServerValue.TIMESTAMP,
        });
      setMessage('');
    } catch (error) {
      console.error('Помилка надсилання у спільноту:', error);
      Alert.alert('Повідомлення не надіслано', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setSending(false);
    }
  };

  const leaveCommunity = () => {
    Alert.alert(
      'Вийти зі спільноти?',
      `Ви більше не бачитимете «${community?.name || communityName}» серед своїх спільнот.`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Вийти',
          style: 'destructive',
          onPress: async () => {
            try {
              const updates = {};
              updates[`communities/${communityId}/members/${identity.userId}`] = null;
              updates[`communityMemberships/${identity.userId}/${communityId}`] = null;
              await database().ref().update(updates);
              await database().ref(`communities/${communityId}/memberCount`).transaction(
                (count) => Math.max(0, (Number(count) || 0) - 1)
              );
              navigation.goBack();
            } catch (error) {
              console.error('Помилка виходу зі спільноти:', error);
              Alert.alert('Не вдалося вийти', 'Перевірте з’єднання та спробуйте ще раз.');
            }
          },
        },
      ]
    );
  };

  const reportMessage = (item) => {
    if (item.senderId === identity.userId) return;
    Alert.alert('Повідомити про порушення?', 'Модератори спільноти отримають це повідомлення на перевірку.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Надіслати скаргу',
        onPress: async () => {
          try {
            await database().ref(`communityReports/${communityId}`).push({
              channelId: selectedChannel?.id,
              messageId: item.id,
              messageText: item.text,
              reportedBy: identity.userId,
              reportedUserId: item.senderId,
              status: 'open',
              createdAt: database.ServerValue.TIMESTAMP,
            });
            Alert.alert('Скаргу надіслано', 'Дякуємо, модератори її перевірять.');
          } catch (error) {
            console.error('Помилка надсилання скарги:', error);
            Alert.alert('Не вдалося надіслати скаргу');
          }
        },
      },
    ]);
  };

  if (!community) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.communityHeader}>
        {community.avatarUrl ? (
          <Image
            source={{ uri: community.avatarUrl }}
            style={styles.communityAvatar}
          />
        ) : (
          <Text style={styles.emoji}>{community.icon || '💬'}</Text>
        )}
        <View style={styles.headerText}>
          <Text style={styles.communityName}>{community.name}</Text>
          <Text style={styles.communityDescription} numberOfLines={1}>{community.description}</Text>
        </View>
        {isCommunityAuthor && (
          <TouchableOpacity
            accessibilityLabel="Керувати учасниками"
            onPress={openMembersModal}
            style={styles.headerAction}
          >
            <MaterialIcons name="manage-accounts" size={23} color={COLORS.muted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityLabel="Вийти зі спільноти"
          onPress={leaveCommunity}
          style={styles.headerAction}
        >
          <MaterialIcons name="logout" size={21} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.channelSection}>
        <TouchableOpacity
          accessibilityLabel="Теми та канали"
          accessibilityRole="button"
          accessibilityState={{ expanded: channelMenuExpanded }}
          activeOpacity={0.8}
          onPress={() => setChannelMenuExpanded((current) => !current)}
          style={styles.channelSelector}
        >
          <Text style={styles.sectionLabel}>ТЕМИ ТА КАНАЛИ</Text>
          <Text numberOfLines={1} style={styles.selectedChannelLabel}>
            {selectedChannel?.name ? `# ${selectedChannel.name}` : 'Оберіть канал'}
          </Text>
          <MaterialIcons
            name={channelMenuExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={24}
            color={COLORS.muted}
          />
        </TouchableOpacity>

        {channelMenuExpanded && (
          <View style={styles.channelDropdownContent}>
            {canManageChannels && (
              <View style={styles.dropdownManageRow}>
                <TouchableOpacity
                  style={styles.addChannelButton}
                  onPress={() => setCategoryModalVisible(true)}
                >
                  <MaterialIcons name="create-new-folder" size={17} color={COLORS.primary} />
                  <Text style={styles.addChannelText}>Тема</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addChannelButton}
                  onPress={() => setChannelModalVisible(true)}
                >
                  <MaterialIcons name="add" size={18} color={COLORS.primary} />
                  <Text style={styles.addChannelText}>Канал</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              style={styles.groupsScroll}
              contentContainerStyle={styles.groupsContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {channelGroups.map((group) => {
                const collapsed = Boolean(collapsedCategories[group.id]);
                return (
                  <View key={group.id} style={styles.channelGroup}>
                    <TouchableOpacity
                      style={styles.groupHeader}
                      onPress={() =>
                        setCollapsedCategories((current) => ({
                          ...current,
                          [group.id]: !current[group.id],
                        }))
                      }
                    >
                      <MaterialIcons
                        name={collapsed ? 'keyboard-arrow-right' : 'keyboard-arrow-down'}
                        size={21}
                        color={COLORS.muted}
                      />
                      <Text style={styles.groupTitle}>{group.name}</Text>
                      <Text style={styles.groupCount}>{group.channels.length}</Text>
                    </TouchableOpacity>
                    {!collapsed &&
                      (group.channels.length ? group.channels.map((item) => {
                        const active = selectedChannel?.id === item.id;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.channelRow, active && styles.channelRowActive]}
                            onPress={() => {
                              setSelectedChannel(item);
                              setChannelMenuExpanded(false);
                            }}
                          >
                            <Text style={[styles.hash, active && styles.channelTextActive]}>#</Text>
                            <View style={styles.channelRowText}>
                              <Text style={[styles.channelText, active && styles.channelTextActive]}>
                                {item.name}
                              </Text>
                              {item.description ? (
                                <Text numberOfLines={1} style={styles.channelRowDescription}>
                                  {item.description}
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      }) : (
                        <TouchableOpacity
                          style={styles.emptyGroup}
                          disabled={!canManageChannels}
                          onPress={() => {
                            setNewChannelCategory(group.name);
                            setChannelModalVisible(true);
                          }}
                        >
                          <Text style={styles.emptyGroupText}>
                            {canManageChannels ? '+ Додати перший канал' : 'Каналів ще немає'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.channelHeading}>
        <Text style={styles.channelHeadingTitle}># {selectedChannel?.name}</Text>
        <Text style={styles.channelHeadingDescription}>{selectedChannel?.description}</Text>
      </View>

      <FlatList
        ref={messageListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={messages.length ? styles.messages : styles.emptyMessages}
        onContentSizeChange={() => messageListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const own = item.senderId === identity.userId;
          return (
            <View style={[styles.messageRow, own && styles.ownMessageRow]}>
              <View style={[styles.avatar, own && styles.ownAvatar]}>
                <Text style={styles.avatarText}>{String(item.senderName || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={own}
                onLongPress={() => reportMessage(item)}
                style={[styles.messageBody, own && styles.ownMessageBody]}
              >
                <View style={styles.messageMeta}>
                  <Text style={styles.senderName}>{item.senderName || 'Гравець'}</Text>
                  <View style={styles.worldBadge}>
                    <MaterialIcons name="public" size={11} color={COLORS.primary} />
                    <Text style={styles.worldText}>{item.worldName || 'Інший світ'}</Text>
                  </View>
                  <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.messageText}>{item.text}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.welcome}>
            <View style={styles.welcomeIcon}>
              <Text style={styles.welcomeHash}>#</Text>
            </View>
            <Text style={styles.welcomeTitle}>Початок каналу #{selectedChannel?.name}</Text>
            <Text style={styles.welcomeText}>Будьте першим, хто розпочне міжсвітову розмову.</Text>
          </View>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          onFocus={() => setChannelMenuExpanded(false)}
          placeholder={`Написати в #${selectedChannel?.name || ''}`}
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
          disabled={!message.trim() || sending}
          onPress={sendMessage}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="send" size={21} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={membersModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMembersModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.membersModalCard]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Учасники</Text>
                <Text style={styles.modalSubtitle}>
                  {memberRows.length} у спільноті
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Закрити список учасників"
                onPress={() => setMembersModalVisible(false)}
              >
                <MaterialIcons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            {membersError ? (
              <View style={styles.membersError}>
                <MaterialIcons name="error-outline" size={18} color="#ff9a9a" />
                <Text style={styles.membersErrorText}>{membersError}</Text>
              </View>
            ) : null}

            {membersLoading ? (
              <View style={styles.membersLoading}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.membersLoadingText}>Завантаження учасників…</Text>
              </View>
            ) : (
              <FlatList
                data={memberRows}
                keyExtractor={(item) => item.id}
                style={styles.membersList}
                contentContainerStyle={styles.membersListContent}
                ListEmptyComponent={
                  <Text style={styles.emptyMembersText}>Учасників не знайдено.</Text>
                }
                renderItem={({ item }) => {
                  const isOwner = item.role === 'owner';
                  const isBusy = memberRoleBusyId === item.id;
                  return (
                    <View style={styles.memberRow}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.memberAvatar} />
                      ) : (
                        <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
                          <Text style={styles.memberAvatarText}>
                            {String(item.userName || item.id).slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.memberDetails}>
                        <Text numberOfLines={1} style={styles.memberName}>
                          {item.userName}
                        </Text>
                        {item.userName !== item.id ? (
                          <Text numberOfLines={1} style={styles.memberId}>
                            {item.id}
                          </Text>
                        ) : null}
                        <Text style={styles.memberRole}>
                          {isOwner
                            ? 'Автор'
                            : item.role === 'moderator'
                              ? 'Модератор'
                              : 'Учасник'}
                        </Text>
                      </View>
                      {isOwner ? (
                        <View style={styles.authorBadge}>
                          <MaterialIcons name="verified-user" size={15} color={COLORS.primary} />
                          <Text style={styles.authorBadgeText}>Автор</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          accessibilityLabel={
                            item.role === 'moderator'
                              ? `Зняти роль модератора з ${item.userName}`
                              : `Призначити ${item.userName} модератором`
                          }
                          disabled={Boolean(memberRoleBusyId)}
                          onPress={() => toggleMemberRole(item.id)}
                          style={[
                            styles.memberRoleButton,
                            item.role === 'moderator' && styles.memberRoleButtonActive,
                            Boolean(memberRoleBusyId) && styles.memberRoleButtonDisabled,
                          ]}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.memberRoleButtonText}>
                              {item.role === 'moderator' ? 'Зняти роль' : 'Призначити'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={channelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChannelModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новий канал</Text>
              <TouchableOpacity onPress={() => setChannelModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>НАЗВА КАНАЛУ</Text>
            <TextInput
              autoFocus
              value={newChannelName}
              onChangeText={setNewChannelName}
              style={styles.modalInput}
              placeholder="наприклад, торгівля"
              placeholderTextColor={COLORS.muted}
              maxLength={40}
            />
            <Text style={styles.fieldLabel}>ОПИС</Text>
            <TextInput
              value={newChannelDescription}
              onChangeText={setNewChannelDescription}
              style={[styles.modalInput, styles.descriptionInput]}
              placeholder="Про що цей канал?"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={140}
            />
            <Text style={styles.fieldLabel}>ТЕМА / КАТЕГОРІЯ</Text>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChoices}
            >
              {channelGroups.map((group) => {
                const selected = newChannelCategory === group.name;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.categoryChoice, selected && styles.categoryChoiceSelected]}
                    onPress={() => setNewChannelCategory(group.name)}
                  >
                    <Text style={[styles.categoryChoiceText, selected && styles.categoryChoiceTextSelected]}>
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              value={newChannelCategory}
              onChangeText={setNewChannelCategory}
              style={styles.modalInput}
              placeholder="наприклад, Beta або Правила"
              placeholderTextColor={COLORS.muted}
              maxLength={40}
            />
            <TouchableOpacity
              style={[styles.createButton, !newChannelName.trim() && styles.sendButtonDisabled]}
              disabled={!newChannelName.trim() || creatingChannel}
              onPress={createChannel}
            >
              {creatingChannel ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Створити канал</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Нова тема</Text>
                <Text style={styles.modalSubtitle}>Група для пов’язаних каналів</Text>
              </View>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>НАЗВА ТЕМИ</Text>
            <TextInput
              autoFocus
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              style={styles.modalInput}
              placeholder="наприклад, Beta або Правила"
              placeholderTextColor={COLORS.muted}
              maxLength={40}
            />
            <TouchableOpacity
              style={[styles.createButton, !newCategoryName.trim() && styles.sendButtonDisabled]}
              disabled={!newCategoryName.trim() || creatingCategory}
              onPress={createCategory}
            >
              {creatingCategory ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Створити тему</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.background, flex: 1 },
  loading: { alignItems: 'center', backgroundColor: COLORS.background, flex: 1, justifyContent: 'center' },
  communityHeader: {
    alignItems: 'center',
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  communityAvatar: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 24,
    height: 48,
    marginRight: 12,
    width: 48,
  },
  emoji: { fontSize: 30, marginRight: 12 },
  headerText: { flex: 1 },
  headerAction: { padding: 9 },
  communityName: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  communityDescription: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  channelSection: {
    backgroundColor: COLORS.surface,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    maxHeight: 285,
  },
  channelSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  sectionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', marginRight: 12 },
  selectedChannelLabel: {
    color: COLORS.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  channelDropdownContent: {
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexShrink: 1,
  },
  dropdownManageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addChannelButton: { alignItems: 'center', flexDirection: 'row', gap: 3, paddingVertical: 3 },
  addChannelText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  groupsScroll: { maxHeight: 200 },
  groupsContent: { paddingBottom: 9, paddingTop: 4 },
  channelGroup: { paddingHorizontal: 9 },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 5,
  },
  groupTitle: { color: COLORS.muted, flex: 1, fontSize: 13, fontWeight: '700' },
  groupCount: { color: COLORS.muted, fontSize: 11, paddingRight: 8 },
  emptyGroup: { paddingHorizontal: 35, paddingVertical: 9 },
  emptyGroupText: { color: COLORS.primary, fontSize: 12 },
  channelRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    marginBottom: 2,
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  channelRowActive: { backgroundColor: COLORS.surfaceHighlight },
  channelRowText: { flex: 1 },
  channelRowDescription: { color: '#727b89', fontSize: 10, marginTop: 1 },
  hash: { color: COLORS.muted, fontSize: 19, fontWeight: '700', marginRight: 8 },
  channelText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  channelTextActive: { color: COLORS.text },
  channelHeading: { borderBottomColor: COLORS.border, borderBottomWidth: 1, padding: 12, paddingHorizontal: 16 },
  channelHeadingTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  channelHeadingDescription: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  messages: { padding: 14 },
  emptyMessages: { flexGrow: 1, justifyContent: 'flex-end', padding: 20 },
  messageRow: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 17 },
  ownMessageRow: { flexDirection: 'row-reverse' },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#6047a8',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: 10,
    width: 36,
  },
  ownAvatar: { backgroundColor: '#286aa5', marginLeft: 10, marginRight: 0 },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  messageBody: { flex: 1 },
  ownMessageBody: { alignItems: 'flex-end' },
  messageMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  senderName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  worldBadge: {
    alignItems: 'center',
    backgroundColor: '#1b3550',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  worldText: { color: '#8bc3ff', fontSize: 10 },
  time: { color: COLORS.muted, fontSize: 10 },
  messageText: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderTopLeftRadius: 3,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  welcome: { paddingBottom: 12 },
  welcomeIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  welcomeHash: { color: COLORS.text, fontSize: 28, fontWeight: '700' },
  welcomeTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', marginTop: 12 },
  welcomeText: { color: COLORS.muted, fontSize: 13, marginTop: 5 },
  inputRow: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    padding: 10,
  },
  input: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 20,
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginLeft: 8,
    width: 42,
  },
  sendButtonDisabled: { opacity: 0.4 },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 18, width: '100%' },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  membersModalCard: { maxHeight: '85%' },
  membersError: {
    alignItems: 'center',
    backgroundColor: '#3a2024',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    padding: 10,
  },
  membersErrorText: { color: '#ffb4b4', flex: 1, fontSize: 12, lineHeight: 17 },
  membersLoading: { alignItems: 'center', gap: 10, paddingVertical: 34 },
  membersLoadingText: { color: COLORS.muted, fontSize: 13 },
  membersList: { flexGrow: 0 },
  membersListContent: { gap: 9, paddingBottom: 2 },
  emptyMembersText: { color: COLORS.muted, paddingVertical: 24, textAlign: 'center' },
  memberRow: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 10,
  },
  memberAvatar: { borderRadius: 20, height: 40, marginRight: 10, width: 40 },
  memberAvatarFallback: {
    alignItems: 'center',
    backgroundColor: '#315b85',
    justifyContent: 'center',
  },
  memberAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberDetails: { flex: 1, marginRight: 8 },
  memberName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  memberId: { color: '#727b89', fontSize: 9, marginTop: 1 },
  memberRole: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  authorBadge: {
    alignItems: 'center',
    backgroundColor: '#1b3550',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  authorBadgeText: { color: '#8bc3ff', fontSize: 11, fontWeight: '700' },
  memberRoleButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 82,
    paddingHorizontal: 9,
  },
  memberRoleButtonActive: { backgroundColor: '#734b50' },
  memberRoleButtonDisabled: { opacity: 0.55 },
  memberRoleButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 7, marginTop: 9 },
  categoryChoices: { gap: 7, paddingBottom: 8 },
  categoryChoice: {
    backgroundColor: COLORS.surfaceHighlight,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  categoryChoiceSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChoiceText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  categoryChoiceTextSelected: { color: '#fff' },
  modalInput: {
    backgroundColor: COLORS.surfaceHighlight,
    borderColor: COLORS.border,
    borderRadius: 10,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  descriptionInput: { minHeight: 76, textAlignVertical: 'top' },
  createButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    marginTop: 20,
    paddingVertical: 13,
  },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
