import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { filterGbgBots } from '../../src/utils/guildBots';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GuildContext } from '../../GuildContext';
import { DarkThemeColors } from '../../constants/theme';
import GBIcon from '../ico/GB.svg';

const COLORS = {
  ...DarkThemeColors,
  blueSoft: '#203047',
  green: '#55d96b',
  greenSoft: '#183923',
  amber: '#ffad33',
  amberSoft: '#422f17',
  red: '#ff5b61',
  redSoft: '#4a1d21',
};

const urgentDepositStatuses = new Set([
  'empty_urgent_deposit',
  'empty_urgent_proportional_deposit',
]);

const placeFilters = ['all', '1-2', '3-5'];

const numericTime = (value) => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : 0;
};

const formatForgePoints = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('uk') : '0';
};

// Округлення коефіцієнта для показу (STATUSES.md): до 1,9 включно — 2 знаки вгору,
// понад 1,9 — 3 знаки вгору.
const formatCoefficient = (value) => {
  const coef = Number(value);
  if (!Number.isFinite(coef)) return null;
  const factor = coef <= 1.9 ? 100 : 1000;
  return (Math.ceil(coef * factor) / factor).toLocaleString('uk');
};

// Рекомендований внесок співгільдійця: для переливу — recommendedDeposit,
// для empty_guaranteed — повна вартість місця (action.amount).
const memberDepositAmount = (guarant) => {
  const recommended = Number(guarant?.recommendedDeposit);
  if (Number.isFinite(recommended) && recommended > 0) return recommended;
  const actionAmount = Number(guarant?.action?.amount);
  return Number.isFinite(actionAmount) ? actionAmount : null;
};

const getBuildingName = (catalogEntry, language, buildingId) => {
  const names = catalogEntry?.buildingName;
  if (typeof names === 'string' && names.trim()) return names;
  return names?.[language] || names?.uk || names?.en || buildingId;
};

const formatFreshness = (timestamp, t) => {
  const updatedAt = numericTime(timestamp);
  if (!updatedAt) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
  if (minutes < 1) return t('gbGuarantees.freshness.now');
  if (minutes < 60) return t('gbGuarantees.freshness.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('gbGuarantees.freshness.hours', { count: hours });
  return t('gbGuarantees.freshness.days', { count: Math.floor(hours / 24) });
};

// Плашки гаранта для екрана «Гаранти». Формулювання — docs/guarant/FIELD_CASES.md
// (F-002, F-006, F-007) і docs/guarant/STATUSES.md.
const statusPresentation = (item, t) => {
  const { guarant } = item;
  if (guarant.status === 'guild_member_below_place_cost') {
    return {
      label: t('gbGuarantees.plashka.topUpTarget', {
        place: guarant.placeNumber,
        placeCost: formatForgePoints(guarant.placeCost),
        amount: formatForgePoints(guarant.requiredTopUp ?? guarant.action?.amount),
      }),
      color: COLORS.red,
      background: COLORS.redSoft,
    };
  }
  if (guarant.status === 'empty_guaranteed') {
    return {
      label: t('gbGuarantees.plashka.guaranteed'),
      color: COLORS.green,
      background: COLORS.greenSoft,
    };
  }
  if (urgentDepositStatuses.has(guarant.status)) {
    return {
      label: t('gbGuarantees.plashka.overflowMember', {
        amount: formatForgePoints(memberDepositAmount(guarant)),
      }),
      color: COLORS.red,
      background: COLORS.redSoft,
    };
  }
  return null;
};

const CompactInfoRow = ({ icon, label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.compactInfoRow}>
      <Ionicons name={icon} size={18} color={COLORS.textSecondary} />
      <Text style={styles.compactInfoLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.compactInfoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
};

const GuaranteeCard = ({ item, onPress, t }) => {
  const { guarant, owner, building, level, updateAt } = item;
  const status = statusPresentation(item, t);
  const freshness = formatFreshness(updateAt, t);
  const hasLevel = level !== undefined && level !== null && level !== '';
  const contributionMultiplier = formatCoefficient(guarant.coefficient);
  const contributionSize = guarant.status === 'empty_guaranteed'
    ? guarant.action?.amount
    : memberDepositAmount(guarant) ?? guarant.remainingFp;

  return (
    <TouchableOpacity
      accessibilityRole={onPress ? 'button' : undefined}
      activeOpacity={onPress ? 0.78 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          {owner.imageUrl ? (
            <Image source={{ uri: owner.imageUrl }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={24} color={COLORS.textSecondary} />
          )}
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.ownerName} numberOfLines={1}>{owner.displayName}</Text>
          <View style={styles.buildingMeta}>
            <GBIcon width={16} height={16} color={COLORS.primary} />
            <Text style={styles.buildingName} numberOfLines={1}>{building.name}</Text>
          </View>
          {hasLevel && (
            <Text style={styles.buildingLevel} numberOfLines={1}>
              {t('gbGuarantees.level', { level })}
            </Text>
          )}
        </View>
        {status && (
          <View style={[styles.statusPill, { backgroundColor: status.background }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoColumn}>
          <CompactInfoRow
            icon="shield-checkmark-outline"
            label={t('gbGuarantees.labels.guaranteedPlace')}
            value={guarant.placeNumber}
          />
          <CompactInfoRow
            icon="speedometer-outline"
            label={t('gbGuarantees.labels.multiplier')}
            value={contributionMultiplier}
          />
        </View>
        <View style={[styles.infoColumn, styles.secondInfoColumn]}>
          <CompactInfoRow
            icon="server-outline"
            label={t('gbGuarantees.labels.contributionSize')}
            value={contributionSize}
          />
          <CompactInfoRow
            icon="time-outline"
            label={t('gbGuarantees.labels.updated')}
            value={freshness}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const Chip = ({ selected, label, onPress }) => (
  <TouchableOpacity style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

const GBGuaranteesScreen = ({ isDeveloper = false, navigation }) => {
  const { guildId } = useContext(GuildContext);
  const { t, i18n } = useTranslation();
  const [guildUsers, setGuildUsers] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [placeFilter, setPlaceFilter] = useState('all');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshAllGreatBuildings = useCallback(async () => {
    if (!guildId || bulkRefreshing) return;
    setBulkRefreshing(true);
    try {
      const snapshot = await database()
        .ref(`guilds/${guildId}/guildUsers`)
        .once('value');
      const updates = {};
      Object.entries(snapshot.val() || {}).forEach(([ownerUserId, ownerData]) => {
        Object.keys(ownerData?.greatBuild || {}).forEach((buildingId) => {
          updates[
            `guilds/${guildId}/guildUsers/${ownerUserId}/greatBuild/${buildingId}/updateAt`
          ] = database.ServerValue.TIMESTAMP;
        });
      });
      if (Object.keys(updates).length > 0) {
        await database().ref().update(updates);
      }
    } catch (refreshError) {
      console.error('Failed to refresh guild Great Buildings:', refreshError);
      Alert.alert(
        t('gbGuarantees.refreshErrorTitle'),
        t('gbGuarantees.refreshError')
      );
    } finally {
      setBulkRefreshing(false);
    }
  }, [bulkRefreshing, guildId, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          accessibilityLabel={t('gbGuarantees.refreshAll')}
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={!guildId || bulkRefreshing}
          onPress={refreshAllGreatBuildings}
          style={[styles.headerAction, (!guildId || bulkRefreshing) && styles.headerActionDisabled]}
        >
          {bulkRefreshing ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <Ionicons name="refresh" size={24} color={COLORS.text} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [bulkRefreshing, guildId, navigation, refreshAllGreatBuildings, t]);

  useEffect(() => {
    let disposed = false;
    AsyncStorage.getItem('userId').then((id) => {
      if (!disposed) setCurrentUserId(id || '');
    }).catch((loadError) => {
      if (!disposed) setError(loadError);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!guildId) {
      setGuildUsers({});
      setCatalog({});
      return undefined;
    }
    setError(null);
    const guildUsersRef = database().ref(`guilds/${guildId}/guildUsers`);
    const catalogRef = database().ref('greatBuildings');
    let disposed = false;
    let filterVersion = 0;
    const onGuildUsers = async (snapshot) => {
      const version = ++filterVersion;
      const rawUsers = snapshot.val() || {};
      // Основний список показуємо відразу; визначення службових ботів не блокує екран.
      setGuildUsers(Object.fromEntries(
        Object.entries(rawUsers).filter(([, user]) => user?.role !== 'GBGbot')
      ));
      setRefreshing(false);
      const filteredUsers = await filterGbgBots(guildId, rawUsers);
      if (!disposed && version === filterVersion) setGuildUsers(filteredUsers);
    };
    const onCatalog = (snapshot) => {
      setCatalog(snapshot.val() || {});
      setRefreshing(false);
    };
    const onError = (readError) => {
      setError(readError);
      setRefreshing(false);
    };
    guildUsersRef.on('value', onGuildUsers, onError);
    catalogRef.on('value', onCatalog, onError);
    return () => {
      disposed = true;
      guildUsersRef.off('value', onGuildUsers);
      catalogRef.off('value', onCatalog);
    };
  }, [guildId, reloadKey]);

  // Ключ ВС «Арка» в даних — X_FutureEra_Landmark1.
  const currentArcLevel = Number(
    guildUsers?.[currentUserId]?.greatBuild?.['X_FutureEra_Landmark1']?.level
  ) || 0;

  const records = useMemo(() => {
    if (!guildUsers || !catalog) return [];
    const language = i18n.language || 'uk';
    const items = [];
    Object.entries(guildUsers).forEach(([ownerUserId, ownerData]) => {
      if (ownerUserId === currentUserId) return;
      Object.entries(ownerData?.greatBuild || {}).forEach(([buildingId, parent]) => {
        if (parent?.lock === true) return;
        const currentUserContribution = Number(
          parent?.contributors?.[currentUserId]?.forgePoints
        ) || 0;
        const guarant = parent?.guarant;
        const isTopUpTarget = guarant?.status === 'guild_member_below_place_cost'
          && guarant?.action?.contributorId === currentUserId;
        if (currentUserContribution > 0 && !isTopUpTarget) return;
        if (guarant?.status === 'guild_member_below_place_cost' && !isTopUpTarget) return;
        if (
          guarant?.status !== 'empty_guaranteed'
          && guarant?.status !== 'guild_member_below_place_cost'
          && !urgentDepositStatuses.has(guarant?.status)
        ) return;
        const requiredArcLevel = Number(guarant.requiredArcLevel);
        if (Number.isFinite(requiredArcLevel) && currentArcLevel < requiredArcLevel) return;
        const catalogEntry = catalog[buildingId] || {};
        items.push({
          id: `${ownerUserId}:${buildingId}`,
          ownerUserId,
          buildingId,
          guarant,
          level: parent.level,
          updateAt: guarant.calculatedAt,
          owner: {
            displayName: ownerData.userName || ownerData.playerName || ownerData.name || ownerUserId,
            imageUrl: ownerData.imageUrl || ownerData.avatarUrl || null,
          },
          building: {
            name: getBuildingName(catalogEntry, language, buildingId),
            imageUrl: catalogEntry.buildingImage || null,
          },
        });
      });
    });
    return items.sort((a, b) => {
      return numericTime(b.updateAt) - numericTime(a.updateAt) || a.id.localeCompare(b.id);
    });
  }, [catalog, currentArcLevel, currentUserId, guildUsers, i18n.language]);

  const visibleRecords = records.filter((item) => {
    if (placeFilter === 'all') return true;
    const place = Number(item.guarant.placeNumber);
    return placeFilter === '1-2' ? place >= 1 && place <= 2 : place >= 3 && place <= 5;
  });
  const loading = guildUsers === null || catalog === null || currentUserId === null;
  const emptyText = records.length === 0
    ? t('gbGuarantees.empty.ready')
    : t('gbGuarantees.empty.filtered');

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textSecondary} />
        <Text style={styles.stateText}>{t('gbGuarantees.loadError')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setReloadKey((value) => value + 1)}>
          <Text style={styles.retryText}>{t('gbGuarantees.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {placeFilters.map((filter) => (
          <Chip
            key={filter}
            selected={placeFilter === filter}
            label={t(`gbGuarantees.placeFilters.${filter}`)}
            onPress={() => setPlaceFilter(filter)}
          />
        ))}
      </View>
      <FlatList
        data={visibleRecords}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GuaranteeCard
            item={item}
            t={t}
            onPress={isDeveloper ? () => navigation.navigate('GBGuaranteeDebug', {
              guildId,
              ownerUserId: item.ownerUserId,
              buildingId: item.buildingId,
              buildingName: item.building.name,
            }) : undefined}
          />
        )}
        contentContainerStyle={[styles.list, visibleRecords.length === 0 && styles.emptyList]}
        ListEmptyComponent={<Text style={styles.stateText}>{emptyText}</Text>}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.primary}
            onRefresh={() => { setRefreshing(true); setReloadKey((value) => value + 1); }}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: COLORS.background },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  horizontalFilterRow: { gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  chip: { borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.surface },
  chipSelected: { backgroundColor: COLORS.blueSoft, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#8ecbff' },
  list: { padding: 12, paddingBottom: 28 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: { marginBottom: 10, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceElevated },
  avatarImage: { width: '100%', height: '100%' },
  headingCopy: { flex: 1, marginLeft: 10, marginRight: 8, minWidth: 0 },
  ownerName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  buildingMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, minWidth: 0 },
  buildingName: { color: COLORS.primary, fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
  buildingLevel: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 1, marginLeft: 21 },
  statusPill: { maxWidth: 130, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  protectedText: { marginTop: 10, color: COLORS.green, fontSize: 13, fontWeight: '600' },
  infoGrid: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  infoColumn: { width: '50%', gap: 9, paddingRight: 10 },
  secondInfoColumn: { borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: 10, paddingRight: 0 },
  compactInfoRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 5 },
  compactInfoLabel: { color: COLORS.textSecondary, fontSize: 11, flex: 1, minWidth: 0 },
  compactInfoValue: { color: COLORS.text, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  stateText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 15, lineHeight: 21, marginTop: 12 },
  retryButton: { marginTop: 16, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: COLORS.primary },
  retryText: { color: COLORS.text, fontWeight: '700' },
  headerAction: { marginRight: 15, width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerActionDisabled: { opacity: 0.5 },
});

export default GBGuaranteesScreen;
