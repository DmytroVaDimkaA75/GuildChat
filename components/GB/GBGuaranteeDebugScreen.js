import database from '@react-native-firebase/database';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { DarkThemeColors } from '../../constants/theme';

const COLORS = {
  ...DarkThemeColors,
  guild: '#55d96b',
  outsider: '#ff5b61',
  header: '#203047',
};

const COLUMNS = [
  { key: 'place', label: 'Місце', width: 70 },
  { key: 'contributor', label: 'Вкладник', width: 220 },
  { key: 'nominalCost', label: 'Номінал', width: 105 },
  { key: 'coefficient', label: 'Коефіцієнт', width: 105 },
  { key: 'placeCost', label: 'Повна вартість', width: 130 },
  { key: 'forgePoints', label: 'Вклад', width: 105 },
];

const formatNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('uk') : '—';
};

const ContributorCell = ({ occupant }) => {
  if (!occupant) return <Text style={styles.emptyText}>Порожньо</Text>;
  const borderColor = occupant.membership === 'guild_member'
    ? COLORS.guild
    : COLORS.outsider;
  const imageUrl = typeof occupant.imageUrl === 'string' && occupant.imageUrl
    ? occupant.imageUrl
    : typeof occupant.avatar === 'string' && /^https?:\/\//i.test(occupant.avatar)
      ? occupant.avatar
      : null;

  return (
    <View style={styles.contributorCell}>
      <View style={[styles.avatar, { borderColor }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={20} color={COLORS.textSecondary} />
        )}
      </View>
      <View style={styles.contributorCopy}>
        <Text style={styles.contributorName} numberOfLines={1}>{occupant.playerName}</Text>
        <Text style={styles.contributorId} numberOfLines={1}>{occupant.contributorId}</Text>
      </View>
    </View>
  );
};

const GBGuaranteeDebugScreen = ({ route }) => {
  const { guildId, ownerUserId, buildingId, buildingName } = route.params || {};
  const [guarant, setGuarant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!guildId || !ownerUserId || !buildingId) {
      setError(new Error('Не передано шлях до ВС'));
      setLoading(false);
      return undefined;
    }

    const guarantRef = database().ref(
      `guilds/${guildId}/guildUsers/${ownerUserId}/greatBuild/${buildingId}/guarant`
    );
    const onValue = (snapshot) => {
      setGuarant(snapshot.val() || null);
      setError(null);
      setLoading(false);
    };
    const onError = (readError) => {
      setError(readError);
      setLoading(false);
    };
    guarantRef.on('value', onValue, onError);
    return () => guarantRef.off('value', onValue);
  }, [buildingId, guildId, ownerUserId]);

  const places = useMemo(() => {
    const value = guarant?.developerDebug?.places;
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }, [guarant]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  if (error) {
    return <View style={styles.center}><Text style={styles.stateText}>{error.message}</Text></View>;
  }
  if (places.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.stateText}>
          Немає developerDebug. Оновіть ВС після розгортання нової функції.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{buildingName || buildingId}</Text>
      <Text style={styles.pathText}>{ownerUserId} / {buildingId}</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Повна вартість рівня</Text>
          <Text style={styles.summaryValue}>{formatNumber(guarant.totalFp)} СО</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Вклад власника</Text>
          <Text style={styles.summaryValue}>
            {formatNumber(guarant.developerDebug?.ownerDeposit)} СО
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Залишилось до закриття</Text>
          <Text style={styles.summaryValue}>{formatNumber(guarant.remainingFp)} СО</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableWrap}>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            {COLUMNS.map((column) => (
              <View key={column.key} style={[styles.cell, { width: column.width }]}>
                <Text style={styles.headerText}>{column.label}</Text>
              </View>
            ))}
          </View>
          {places.map((place) => (
            <View key={place.placeNumber} style={styles.row}>
              <View style={[styles.cell, { width: COLUMNS[0].width }]}>
                <Text style={styles.placeText}>{place.placeNumber}</Text>
              </View>
              <View style={[styles.cell, { width: COLUMNS[1].width }]}>
                <ContributorCell occupant={place.occupant} />
              </View>
              <View style={[styles.cell, { width: COLUMNS[2].width }]}>
                <Text style={styles.valueText}>{formatNumber(place.nominalCost)}</Text>
              </View>
              <View style={[styles.cell, { width: COLUMNS[3].width }]}>
                <Text style={styles.valueText}>
                  {Number.isFinite(Number(place.coefficient)) ? `×${place.coefficient}` : '—'}
                </Text>
              </View>
              <View style={[styles.cell, { width: COLUMNS[4].width }]}>
                <Text style={styles.valueText}>{formatNumber(place.placeCost)}</Text>
              </View>
              <View style={[styles.cell, { width: COLUMNS[5].width }]}>
                <Text style={styles.valueText}>{formatNumber(place.occupant?.forgePoints)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 14, paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.background,
  },
  stateText: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  title: { color: COLORS.text, fontSize: 21, fontWeight: '700' },
  pathText: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  summaryCard: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  summaryItem: { flex: 1 },
  summaryDivider: { width: 1, marginHorizontal: 14, backgroundColor: COLORS.border },
  summaryLabel: { color: COLORS.textSecondary, fontSize: 12 },
  summaryValue: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginTop: 5 },
  tableWrap: { paddingBottom: 10 },
  table: { overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },
  row: { flexDirection: 'row', minHeight: 58, backgroundColor: COLORS.surface },
  headerRow: { minHeight: 44, backgroundColor: COLORS.header },
  cell: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  headerText: { color: COLORS.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  valueText: { color: COLORS.text, fontSize: 13, textAlign: 'right' },
  placeText: { color: COLORS.primary, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: 13 },
  contributorCell: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
  },
  avatarImage: { width: '100%', height: '100%' },
  contributorCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  contributorName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  contributorId: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
});

export default GBGuaranteeDebugScreen;
