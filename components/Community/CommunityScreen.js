import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
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
  success: '#4cc38a',
};

const STARTER_COMMUNITIES = [
  {
    id: 'forge-of-empires',
    name: 'Forge of Empires',
    description: 'Стратегії розвитку, події та спілкування між світами.',
    category: 'Ігри',
    icon: '🏛️',
    channels: {
      general: { name: 'загальний', description: 'Знайомства та вільне спілкування', order: 1 },
      strategy: { name: 'стратегії', description: 'Поради щодо розвитку міста', order: 2 },
      events: { name: 'події', description: 'Обговорення поточних подій', order: 3 },
    },
  },
  {
    id: 'guild-leaders',
    name: 'Лідери гільдій',
    description: 'Обмін досвідом керування, дипломатії та організації.',
    category: 'Гільдії',
    icon: '🛡️',
    channels: {
      general: { name: 'загальний', description: 'Спілкування лідерів', order: 1 },
      recruitment: { name: 'набір', description: 'Пошук гравців і гільдій', order: 2 },
      diplomacy: { name: 'дипломатія', description: 'Міжгільдійні домовленості', order: 3 },
    },
  },
  {
    id: 'creative-corner',
    name: 'Творчий куточок',
    description: 'Меми, оформлення міст, історії та фан-творчість.',
    category: 'Творчість',
    icon: '🎨',
    channels: {
      general: { name: 'загальний', description: 'Покажіть, що ви створили', order: 1 },
      screenshots: { name: 'скриншоти', description: 'Міста та цікаві моменти', order: 2 },
    },
  },
  {
    id: 'help-hub',
    name: 'Центр допомоги',
    description: 'Запитання про гру та взаємодопомога без прив’язки до світу.',
    category: 'Допомога',
    icon: '💡',
    channels: {
      questions: { name: 'запитання', description: 'Поставте запитання спільноті', order: 1 },
      guides: { name: 'гайди', description: 'Корисні інструкції та поради', order: 2 },
    },
  },
];

const toCommunityList = (value) =>
  Object.entries(value || {}).map(([id, community]) => ({ id, ...community }));

export default function CommunityScreen({ navigation }) {
  const [communities, setCommunities] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Усі');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let communitiesRef;
    let membershipsRef;
    let onCommunities;
    let onMemberships;

    const subscribe = async () => {
      const storedUserId = await AsyncStorage.getItem('userId');
      setUserId(storedUserId || '');

      communitiesRef = database().ref('communities');
      onCommunities = communitiesRef.on(
        'value',
        (snapshot) => {
          setCommunities(toCommunityList(snapshot.val()));
          setLoading(false);
        },
        (error) => {
          console.error('Помилка завантаження спільнот:', error);
          setLoading(false);
        }
      );

      if (storedUserId) {
        membershipsRef = database().ref(`communityMemberships/${storedUserId}`);
        onMemberships = membershipsRef.on('value', (snapshot) => {
          setMemberships(snapshot.val() || {});
        });
      }
    };

    subscribe();
    return () => {
      if (communitiesRef && onCommunities) communitiesRef.off('value', onCommunities);
      if (membershipsRef && onMemberships) membershipsRef.off('value', onMemberships);
    };
  }, []);

  const visibleCommunities = communities.length ? communities : STARTER_COMMUNITIES;
  const categories = useMemo(
    () => ['Усі', ...new Set(visibleCommunities.map((item) => item.category).filter(Boolean))],
    [visibleCommunities]
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('uk');
    return visibleCommunities
      .filter((item) => selectedCategory === 'Усі' || item.category === selectedCategory)
      .filter(
        (item) =>
          !query ||
          item.name?.toLocaleLowerCase('uk').includes(query) ||
          item.description?.toLocaleLowerCase('uk').includes(query)
      )
      .sort((a, b) => {
        const joinedDifference = Number(Boolean(memberships[b.id])) - Number(Boolean(memberships[a.id]));
        return joinedDifference || (b.memberCount || 0) - (a.memberCount || 0);
      });
  }, [memberships, search, selectedCategory, visibleCommunities]);

  const joinCommunity = async (community) => {
    if (!userId) {
      Alert.alert('Потрібен профіль', 'Увійдіть у свій профіль, щоб приєднатися до спільноти.');
      return;
    }
    setBusyId(community.id);
    try {
      const communityRef = database().ref(`communities/${community.id}`);
      const snapshot = await communityRef.once('value');
      if (!snapshot.exists()) {
        const { id, ...starterData } = community;
        await communityRef.set({
          ...starterData,
          memberCount: 0,
          createdAt: database.ServerValue.TIMESTAMP,
        });
      }

      const updates = {};
      updates[`communities/${community.id}/members/${userId}`] = {
        role: 'member',
        joinedAt: database.ServerValue.TIMESTAMP,
      };
      updates[`communityMemberships/${userId}/${community.id}`] = true;
      await database().ref().update(updates);
      await database().ref(`communities/${community.id}/memberCount`).transaction(
        (count) => (Number(count) || 0) + 1
      );
    } catch (error) {
      console.error('Помилка вступу до спільноти:', error);
      Alert.alert('Не вдалося приєднатися', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setBusyId('');
    }
  };

  const openCommunity = (community) => {
    navigation.navigate('CommunityChannels', {
      communityId: community.id,
      communityName: community.name,
    });
  };

  const createCommunity = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    if (!userId) {
      Alert.alert('Потрібен профіль', 'Увійдіть у профіль, щоб створити спільноту.');
      return;
    }

    setCreating(true);
    try {
      const communityRef = database().ref('communities').push();
      const communityId = communityRef.key;
      const community = {
        name,
        description: newDescription.trim() || 'Нова міжсвітова спільнота.',
        category: newCategory.trim() || 'Інше',
        icon: '💬',
        createdBy: userId,
        createdAt: database.ServerValue.TIMESTAMP,
        memberCount: 1,
        members: {
          [userId]: { role: 'owner', joinedAt: database.ServerValue.TIMESTAMP },
        },
        channels: {
          general: {
            name: 'загальний',
            description: 'Загальне спілкування',
            categoryId: 'general',
            order: 1,
            createdBy: userId,
            createdAt: database.ServerValue.TIMESTAMP,
          },
        },
        categories: {
          general: {
            name: 'Загальне',
            order: 1,
            createdBy: userId,
            createdAt: database.ServerValue.TIMESTAMP,
          },
        },
      };
      const updates = {};
      updates[`communities/${communityId}`] = community;
      updates[`communityMemberships/${userId}/${communityId}`] = true;
      await database().ref().update(updates);

      setNewName('');
      setNewDescription('');
      setNewCategory('');
      setCreateModalVisible(false);
      navigation.navigate('CommunityChannels', {
        communityId,
        communityName: name,
      });
    } catch (error) {
      console.error('Помилка створення спільноти:', error);
      Alert.alert('Не вдалося створити спільноту', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setCreating(false);
    }
  };

  const renderCommunity = ({ item }) => {
    const joined = Boolean(memberships[item.id]);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.communityIcon}>
            <Text style={styles.emoji}>{item.icon || '💬'}</Text>
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.category}>{item.category}</Text>
          </View>
          {joined && (
            <View style={styles.joinedBadge}>
              <MaterialIcons name="check" size={14} color={COLORS.success} />
              <Text style={styles.joinedText}>Ви тут</Text>
            </View>
          )}
        </View>
        <Text style={styles.description}>{item.description}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.memberInfo}>
            <MaterialIcons name="people-outline" size={18} color={COLORS.muted} />
            <Text style={styles.memberText}>{item.memberCount || 0} учасників</Text>
          </View>
          <TouchableOpacity
            style={[styles.actionButton, joined && styles.openButton]}
            disabled={busyId === item.id}
            onPress={() => (joined ? openCommunity(item) : joinCommunity(item))}
          >
            {busyId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionText}>{joined ? 'Відкрити' : 'Приєднатися'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Знайдіть своїх людей</Text>
        <Text style={styles.heroText}>Спілкуйтеся за інтересами з гравцями з усіх світів.</Text>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={22} color={COLORS.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder="Пошук спільнот"
            placeholderTextColor={COLORS.muted}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={20} color={COLORS.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCommunity}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <FlatList
            horizontal
            data={categories}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categories}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.categoryChip, selectedCategory === item && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text style={[styles.categoryChipText, selectedCategory === item && styles.categoryChipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={COLORS.primary} style={styles.empty} />
          ) : (
            <View style={styles.empty}>
              <MaterialIcons name="search-off" size={42} color={COLORS.muted} />
              <Text style={styles.emptyText}>Нічого не знайдено</Text>
            </View>
          )
        }
      />
      <TouchableOpacity
        accessibilityLabel="Створити спільноту"
        style={styles.floatingButton}
        onPress={() => setCreateModalVisible(true)}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Нова спільнота</Text>
                <Text style={styles.modalSubtitle}>Ви станете її власником</Text>
              </View>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>НАЗВА *</Text>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              style={styles.modalInput}
              placeholder="Назва спільноти"
              placeholderTextColor={COLORS.muted}
              maxLength={60}
            />
            <Text style={styles.fieldLabel}>КАТЕГОРІЯ</Text>
            <TextInput
              value={newCategory}
              onChangeText={setNewCategory}
              style={styles.modalInput}
              placeholder="Ігри, творчість, допомога…"
              placeholderTextColor={COLORS.muted}
              maxLength={30}
            />
            <Text style={styles.fieldLabel}>ОПИС</Text>
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              style={[styles.modalInput, styles.descriptionInput]}
              placeholder="Кому і для чого ця спільнота?"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={240}
            />
            <TouchableOpacity
              style={[styles.createButton, !newName.trim() && styles.createButtonDisabled]}
              disabled={!newName.trim() || creating}
              onPress={createCommunity}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Створити спільноту</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  hero: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  heroTitle: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  heroText: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  searchInput: { color: COLORS.text, flex: 1, fontSize: 16, paddingHorizontal: 9, paddingVertical: 12 },
  list: { paddingBottom: 28 },
  categories: { gap: 8, paddingHorizontal: 18, paddingVertical: 10 },
  categoryChip: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { color: COLORS.muted, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 12,
    padding: 15,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row' },
  communityIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 13,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  emoji: { fontSize: 24 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  category: { color: COLORS.primary, fontSize: 12, marginTop: 3 },
  joinedBadge: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  joinedText: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
  description: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 13 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', marginTop: 15 },
  memberInfo: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6 },
  memberText: { color: COLORS.muted, fontSize: 12 },
  actionButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 112,
    paddingHorizontal: 13,
  },
  openButton: { backgroundColor: '#285a8e' },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 70 },
  emptyText: { color: COLORS.muted, fontSize: 15, marginTop: 10 },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    bottom: 22,
    elevation: 6,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    shadowColor: '#000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    width: 56,
  },
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
    marginBottom: 16,
  },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 7, marginTop: 10 },
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
  descriptionInput: { minHeight: 82, textAlignVertical: 'top' },
  createButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    marginTop: 20,
    paddingVertical: 13,
  },
  createButtonDisabled: { opacity: 0.4 },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
