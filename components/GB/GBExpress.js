import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { filterGbgBots } from '../../src/utils/guildBots';

const COLORS = { background: '#07111b', surface: '#0d1925', surfaceSoft: '#102235', border: '#2d3a48', divider: '#263646', primary: '#2f87ff', primaryLight: '#62a7ff', text: '#f4f7fb', muted: '#a9b3c3' };

const getLocalizedValue = (value, language) => {
  if (!value || typeof value !== 'object') return value || '';
  const normalized = String(language || 'uk').split('-')[0];
  return value[normalized] || value.uk || value.ua || value.en || Object.values(value)[0] || '';
};

const formatSchedule = (timestamp) => new Date(timestamp).toLocaleString('uk-UA', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

const getParticipantIds = (group) => {
  const ids = new Set();
  group.chats.forEach((chat) => Object.entries(chat.allowedUsers || {}).forEach(([userId, allowed]) => {
    if (allowed) ids.add(userId);
  }));
  return ids;
};

const GBExpress = () => {
  const navigation = useNavigation();
  const [guildId, setGuildId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [userLanguage, setUserLanguage] = useState('uk');
  const [expressEntries, setExpressEntries] = useState([]);
  const [buildingCatalog, setBuildingCatalog] = useState({});
  const [guildUsers, setGuildUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [pendingGroup, setPendingGroup] = useState(null);
  const [updatingSchedule, setUpdatingSchedule] = useState(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet(['guildId', 'userId', 'userLanguage']).then((values) => {
      if (!active) return;
      const stored = Object.fromEntries(values);
      setGuildId(stored.guildId || null);
      setCurrentUserId(stored.userId || null);
      setUserLanguage(stored.userLanguage || 'uk');
      if (!stored.guildId || !stored.userId) setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!guildId || !currentUserId) return undefined;
    const expressRef = database().ref(`guilds/${guildId}/express`);
    const usersRef = database().ref(`guilds/${guildId}/guildUsers`);
    const handleExpress = (snapshot) => {
      const now = Date.now();
      setExpressEntries(Object.entries(snapshot.val() || {}).map(([id, value]) => ({ id, ...value }))
        .filter((entry) => Number(entry.scheduleTime) > now));
      setLoading(false);
    };
    const handleUsers = async (snapshot) => setGuildUsers(await filterGbgBots(guildId, snapshot.val() || {}));
    const handleError = () => setLoading(false);
    expressRef.on('value', handleExpress, handleError);
    usersRef.on('value', handleUsers);
    return () => {
      expressRef.off('value', handleExpress);
      usersRef.off('value', handleUsers);
    };
  }, [currentUserId, guildId]);

  const groupedExpresses = useMemo(() => {
    const groups = new Map();
    expressEntries.forEach((entry) => {
      const scheduleTime = Number(entry.scheduleTime);
      if (!groups.has(scheduleTime)) groups.set(scheduleTime, { scheduleTime, chats: [] });
      groups.get(scheduleTime).chats.push(entry);
    });
    return Array.from(groups.values()).sort((a, b) => a.scheduleTime - b.scheduleTime);
  }, [expressEntries]);

  useEffect(() => {
    const ids = Array.from(new Set(expressEntries.map((entry) => entry.allowedGB).filter(Boolean)));
    const missing = ids.filter((id) => !buildingCatalog[id]);
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.all(missing.map(async (id) => {
      const snapshot = await database().ref(`greatBuildings/${id}`).once('value');
      return [id, snapshot.val() || {}];
    })).then((records) => {
      if (!cancelled) setBuildingCatalog((current) => ({ ...current, ...Object.fromEntries(records) }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [buildingCatalog, expressEntries]);

  const updateParticipation = useCallback(async (group, participating) => {
    if (!guildId || !currentUserId || !group) return;
    setUpdatingSchedule(group.scheduleTime);
    try {
      const updates = {};
      group.chats.forEach((chat) => { updates[`${chat.id}/allowedUsers/${currentUserId}`] = participating ? true : null; });
      await database().ref(`guilds/${guildId}/express`).update(updates);
      setPendingGroup(null);
    } catch (_error) {
      Alert.alert('Помилка', 'Не вдалося змінити участь в експрес-прокачці.');
    } finally {
      setUpdatingSchedule(null);
    }
  }, [currentUserId, guildId]);

  const renderBuilding = (chat, index) => {
    const owner = guildUsers[chat.user] || {};
    const building = buildingCatalog[chat.allowedGB] || {};
    const currentLevel = Number(owner?.greatBuild?.[chat.allowedGB]?.level) || 0;
    const levelCount = Number(chat.levelThreshold) || 0;
    const image = typeof building.buildingImage === 'string' ? building.buildingImage : building.buildingImage?.uri;
    const ownerName = owner.userName || owner.name || chat.user || 'Учасник';
    const buildingName = getLocalizedValue(building.buildingName, userLanguage) || chat.allowedGB || 'ВС';
    return (
      <View key={chat.id} style={[styles.buildingRow, index > 0 && styles.buildingDivider]}>
        <View style={styles.buildingVisual}>
          {image ? <Image source={{ uri: image }} resizeMode="contain" style={styles.buildingImage} />
            : <Ionicons name="business-outline" size={58} color={COLORS.primaryLight} />}
        </View>
        <View style={styles.buildingDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="business-outline" size={20} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.15} style={styles.buildingTitle} numberOfLines={2}><Text style={styles.ownerName}>{ownerName}</Text> ({buildingName})</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="trending-up-outline" size={20} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.15} style={styles.detailText}>Орієнтовно <Text style={styles.detailStrong}>{levelCount}</Text> рівнів</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="arrow-forward-outline" size={20} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.15} style={styles.levelRange}>{currentLevel + 1} → {currentLevel + levelCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderGroup = ({ item }) => {
    const participantIds = getParticipantIds(item);
    const isParticipating = participantIds.has(currentUserId);
    const isUpdating = updatingSchedule === item.scheduleTime;
    const ownsEveryExpress = item.chats.every((chat) => chat.user === currentUserId);
    return (
      <View style={styles.card}>
        <View style={styles.scheduleRow}>
          <View style={styles.scheduleCopy}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.15} style={styles.scheduleText}>Запланований час: {formatSchedule(item.scheduleTime)}</Text>
          </View>
          <View style={styles.participants}>
            <Ionicons name="people-outline" size={21} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.15} style={styles.participantCount}>{participantIds.size}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        {item.chats.map(renderBuilding)}
        <View style={styles.actions}>
          <TouchableOpacity activeOpacity={0.78} disabled={isUpdating || ownsEveryExpress}
            onPress={() => isParticipating ? updateParticipation(item, false) : setPendingGroup(item)}
            style={[styles.actionButton, !isParticipating && !ownsEveryExpress && styles.actionButtonPrimary, ownsEveryExpress && styles.actionButtonDisabled]}>
            {isUpdating ? <ActivityIndicator size="small" color="#fff" /> : <>
              <Ionicons name={isParticipating ? 'checkmark-circle-outline' : 'checkmark-sharp'} size={22} color="#fff" />
              <Text maxFontSizeMultiplier={1.1} style={styles.actionText}>{ownsEveryExpress ? 'Ваш експрес' : isParticipating ? 'Скасувати' : 'Взяти участь'}</Text>
            </>}
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.78} onPress={() => navigation.navigate('GBNewExpress', { scheduleTime: item.scheduleTime })} style={styles.actionButton}>
            <Ionicons name="add-circle-outline" size={23} color={COLORS.primary} />
            <Text maxFontSizeMultiplier={1.1} style={[styles.actionText, styles.actionTextOutline]}>Додати свій експрес</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <FlatList contentContainerStyle={styles.content} data={groupedExpresses} keyExtractor={(item) => String(item.scheduleTime)} renderItem={renderGroup} showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.intro}>
          <View style={styles.introIcon}><Ionicons name="shield-checkmark-outline" size={25} color={COLORS.primary} /></View>
          <Text maxFontSizeMultiplier={1.15} style={styles.introText}>Підтвердьте участь в експресі. Якщо рівень вашої Арки відповідає умовам, ви отримаєте нагадування за 5 хвилин до початку.</Text>
        </View>}
        ListEmptyComponent={<View style={styles.emptyCard}>
          <Ionicons name="flash-outline" size={42} color={COLORS.primaryLight} />
          <Text style={styles.emptyTitle}>Немає запланованих експресів</Text>
          <Text style={styles.emptyText}>Нові експрес-прокачки з’являться тут після створення.</Text>
        </View>}
      />
      <Modal animationType="fade" onRequestClose={() => setPendingGroup(null)} transparent visible={Boolean(pendingGroup)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPendingGroup(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}><Ionicons name="shield-checkmark-outline" size={34} color={COLORS.primary} /></View>
            <Text style={styles.modalTitle}>Підтвердити участь?</Text>
            <Text style={styles.modalText}>Якщо ваша Арка відповідатиме умовам експресу, ви отримаєте нагадування за 5 хвилин до початку.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPendingGroup(null)}><Text style={styles.modalCancelText}>Скасувати</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => updateParticipation(pendingGroup, true)}><Text style={styles.modalConfirmText}>Взяти участь</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }, content: { padding: 12, paddingBottom: 24 },
  intro: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingHorizontal: 2 }, introIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceSoft, marginRight: 11 }, introText: { flex: 1, color: '#c2cad6', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 17, borderWidth: 1, marginBottom: 12, padding: 12 }, scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, scheduleCopy: { flex: 1, flexDirection: 'row', alignItems: 'center' }, scheduleText: { flex: 1, color: '#c6ceda', fontSize: 13, lineHeight: 17, marginLeft: 8 }, participants: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 }, participantCount: { color: COLORS.text, fontSize: 14, marginLeft: 5 }, divider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 11 },
  buildingRow: { flexDirection: 'row', minHeight: 120, alignItems: 'center' }, buildingDivider: { borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: 10, marginTop: 10 }, buildingVisual: { width: 102, alignItems: 'center', justifyContent: 'center', marginRight: 7 }, buildingImage: { width: 102, height: 116 }, buildingDetails: { flex: 1, gap: 8 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, buildingTitle: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 19 }, ownerName: { fontWeight: '800' }, detailText: { color: COLORS.muted, fontSize: 13 }, detailStrong: { color: COLORS.text, fontWeight: '700' }, levelRange: { color: COLORS.primary, fontSize: 16, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 }, actionButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 }, actionButtonPrimary: { backgroundColor: COLORS.primary }, actionButtonDisabled: { borderColor: COLORS.border, opacity: 0.55 }, actionText: { color: COLORS.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }, actionTextOutline: { color: COLORS.primary },
  emptyCard: { alignItems: 'center', padding: 30, borderRadius: 18, backgroundColor: COLORS.surface }, emptyTitle: { color: COLORS.text, fontSize: 19, fontWeight: '700', marginTop: 14 }, emptyText: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 22 }, modalCard: { width: '100%', maxWidth: 390, backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 22 }, modalIcon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceSoft }, modalTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', textAlign: 'center', marginTop: 15 }, modalText: { color: COLORS.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 }, modalCancel: { flex: 1, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }, modalCancelText: { color: COLORS.muted, fontSize: 15, fontWeight: '700' }, modalConfirm: { flex: 1, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary }, modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' }
});

export default GBExpress;
