import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export default function CommunityChannelsScreen({ route, navigation }) {
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.communityHeader}>
        <Text style={styles.emoji}>{community.icon || '💬'}</Text>
        <View style={styles.headerText}>
          <Text style={styles.communityName}>{community.name}</Text>
          <Text style={styles.communityDescription} numberOfLines={1}>{community.description}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Вийти зі спільноти"
          onPress={leaveCommunity}
          style={styles.headerAction}
        >
          <MaterialIcons name="logout" size={21} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.channelSection}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionLabel}>ТЕМИ ТА КАНАЛИ</Text>
          {canManageChannels && (
            <View style={styles.manageButtons}>
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
        </View>
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
                        onPress={() => setSelectedChannel(item)}
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
    paddingTop: 10,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  sectionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  manageButtons: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  addChannelButton: { alignItems: 'center', flexDirection: 'row', gap: 3, paddingVertical: 3 },
  addChannelText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  groupsScroll: { marginTop: 7 },
  groupsContent: { paddingBottom: 9 },
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
