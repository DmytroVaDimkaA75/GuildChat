import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  surfaceHighlight: '#1b2b3b',
  primary: '#4ea1ff',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  border: '#36516a',
  success: '#4cc38a',
};

const COMMUNITY_FILTERS = [
  { key: 'mine', label: 'Мої' },
  { key: 'all', label: 'Всі' },
];

const toCommunityList = (value) =>
  Object.entries(value || {}).map(([id, community]) => ({ id, ...community }));

export default function CommunityScreen({ navigation }) {
  const [communities, setCommunities] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [userId, setUserId] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newAvatarUri, setNewAvatarUri] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
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

  const filtered = useMemo(() => {
    return communities
      .filter(
        (item) =>
          selectedFilter === 'all' ||
          Boolean(memberships[item.id] || item.members?.[userId])
      )
      .sort((a, b) => {
        const joinedDifference =
          Number(Boolean(memberships[b.id] || b.members?.[userId])) -
          Number(Boolean(memberships[a.id] || a.members?.[userId]));
        return joinedDifference || (b.memberCount || 0) - (a.memberCount || 0);
      });
  }, [communities, memberships, selectedFilter, userId]);

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
        Alert.alert('Спільноту не знайдено', 'Можливо, її вже було видалено.');
        return;
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

  const resetCreateForm = () => {
    setNewAvatarUri('');
    setNewName('');
    setNewDescription('');
  };

  const openCreateModal = () => {
    resetCreateForm();
    setCreateModalVisible(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateModalVisible(false);
    resetCreateForm();
  };

  const pickCommunityAvatar = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert(
            'Потрібен доступ до фото',
            'Дозвольте доступ до медіатеки, щоб вибрати аватарку спільноти.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setNewAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Помилка вибору аватарки спільноти:', error);
      Alert.alert('Не вдалося вибрати фото', 'Спробуйте вибрати інше зображення.');
    }
  };

  const createCommunity = async () => {
    const name = newName.trim();
    if (!name || !newAvatarUri || creating) return;
    if (!userId) {
      Alert.alert('Потрібен профіль', 'Увійдіть у профіль, щоб створити спільноту.');
      return;
    }

    setCreating(true);
    let avatarRef = null;
    let communityPersisted = false;
    try {
      const communityRef = database().ref('communities').push();
      const communityId = communityRef.key;
      avatarRef = storage().ref(`communities/${communityId}/avatar.jpg`);
      await avatarRef.putFile(newAvatarUri);
      const avatarUrl = await avatarRef.getDownloadURL();

      const community = {
        name,
        description: newDescription.trim() || 'Нова міжсвітова спільнота.',
        avatarUrl,
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
      communityPersisted = true;

      setCreateModalVisible(false);
      resetCreateForm();
      navigation.navigate('CommunityChannels', {
        communityId,
        communityName: name,
      });
    } catch (error) {
      if (avatarRef && !communityPersisted) {
        avatarRef.delete().catch(() => {});
      }
      console.error('Помилка створення спільноти:', error);
      Alert.alert('Не вдалося створити спільноту', 'Перевірте з’єднання та спробуйте ще раз.');
    } finally {
      setCreating(false);
    }
  };

  const renderCommunity = ({ item }) => {
    const joined = Boolean(memberships[item.id] || item.members?.[userId]);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.communityIcon}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.communityAvatar} />
            ) : (
              <Text style={styles.emoji}>{item.icon || '💬'}</Text>
            )}
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{item.name}</Text>
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
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCommunity}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.filters}>
            {COMMUNITY_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterChip,
                  selectedFilter === filter.key && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter.key && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={COLORS.primary} style={styles.empty} />
          ) : (
            <View style={styles.empty}>
              <MaterialIcons name="groups" size={42} color={COLORS.muted} />
              <Text style={styles.emptyText}>
                {selectedFilter === 'mine'
                  ? 'Ви ще не приєдналися до жодної спільноти'
                  : 'Спільнот поки немає'}
              </Text>
            </View>
          )
        }
      />
      <TouchableOpacity
        accessibilityLabel="Створити спільноту"
        style={styles.floatingButton}
        onPress={openCreateModal}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCreateModal}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Нова спільнота</Text>
                <Text style={styles.modalSubtitle}>Ви станете її власником</Text>
              </View>
              <TouchableOpacity disabled={creating} onPress={closeCreateModal}>
                <MaterialIcons name="close" size={24} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>АВАТАРКА *</Text>
            <TouchableOpacity
              accessibilityLabel={newAvatarUri ? 'Замінити аватарку' : 'Обрати аватарку'}
              activeOpacity={0.8}
              disabled={creating}
              onPress={pickCommunityAvatar}
              style={styles.avatarPicker}
            >
              {newAvatarUri ? (
                <Image source={{ uri: newAvatarUri }} style={styles.avatarPreview} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="add-a-photo" size={28} color={COLORS.primary} />
                </View>
              )}
              <View style={styles.avatarPickerText}>
                <Text style={styles.avatarPickerTitle}>
                  {newAvatarUri ? 'Замінити аватарку' : 'Обрати аватарку'}
                </Text>
                <Text style={styles.avatarPickerHint}>Квадратне зображення виглядатиме найкраще</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.fieldLabel}>НАЗВА *</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              style={styles.modalInput}
              placeholder="Назва спільноти"
              placeholderTextColor={COLORS.muted}
              maxLength={60}
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
              style={[
                styles.createButton,
                (!newAvatarUri || !newName.trim()) && styles.createButtonDisabled,
              ]}
              disabled={!newAvatarUri || !newName.trim() || creating}
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
  list: { paddingBottom: 28 },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  filterChip: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.muted, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
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
  communityAvatar: { borderRadius: 13, height: '100%', width: '100%' },
  emoji: { fontSize: 24 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
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
  avatarPicker: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 10,
  },
  avatarPreview: { borderRadius: 14, height: 68, width: 68 },
  avatarPlaceholder: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  avatarPickerText: { flex: 1, marginLeft: 12 },
  avatarPickerTitle: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  avatarPickerHint: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
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
