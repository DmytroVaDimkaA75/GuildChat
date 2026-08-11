import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export const DISTRIBUTION_HEADER_HEIGHT = 38;
export const DISTRIBUTION_ROW_HEIGHT = 48;
export const MIN_DISTRIBUTION_ROWS = 5;

const PLACE_WIDTH = 58;
const CONTRIBUTOR_WIDTH = 146;
const SCROLL_COLUMNS = [
  { key: 'nominalCost', title: 'Номінал', width: 92 },
  { key: 'coefficient', title: 'Коефіцієнт', width: 104 },
  { key: 'placeCost', title: 'Вартість', width: 104 },
  { key: 'forgePoints', title: 'Вкладено', width: 100 },
];

export const getDistributionPlaces = (guarant) => {
  const rawPlaces = guarant?.developerDebug?.places;
  const places = Array.isArray(rawPlaces)
    ? rawPlaces
    : rawPlaces && typeof rawPlaces === 'object'
      ? Object.values(rawPlaces)
      : [];

  return [...places].sort((first, second) =>
    Number(first?.placeNumber) - Number(second?.placeNumber)
  );
};

const formatNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('uk') : '—';
};

const ContributorCell = ({ occupant }) => {
  if (!occupant) return <Text style={styles.emptyText}>Немає</Text>;
  const isGuildMember = occupant.membership === 'guild_member';
  const imageUrl = typeof occupant.imageUrl === 'string' && occupant.imageUrl
    ? occupant.imageUrl
    : typeof occupant.avatar === 'string' && /^https?:\/\//i.test(occupant.avatar)
      ? occupant.avatar
      : null;

  return (
    <View style={styles.contributorCell}>
      <View style={[styles.avatar, isGuildMember ? styles.guildAvatar : styles.outsiderAvatar]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={17} color="#9aa3b2" />
        )}
      </View>
      <Text style={styles.contributorName} numberOfLines={1}>
        {occupant.playerName || occupant.contributorId}
      </Text>
    </View>
  );
};

const getScrollableValue = (row, key) => {
  if (key === 'coefficient') {
    return Number.isFinite(Number(row.coefficient)) ? `×${row.coefficient}` : '—';
  }
  if (key === 'forgePoints') return formatNumber(row.occupant?.forgePoints);
  return formatNumber(row[key]);
};

const MyGBDistributionTable = ({ guarant }) => {
  const places = useMemo(() => getDistributionPlaces(guarant), [guarant]);
  const rows = useMemo(() => {
    const rowCount = Math.max(MIN_DISTRIBUTION_ROWS, places.length);
    return Array.from({ length: rowCount }, (_, index) => places[index] || {
      placeNumber: index + 1,
      occupant: null,
    });
  }, [places]);

  return (
    <View style={styles.tablesRow}>
      <View style={styles.fixedTable}>
        <View style={styles.headerRow}>
          <View style={[styles.headerCell, { width: PLACE_WIDTH }]}>
            <Text style={styles.headerText}>Місце</Text>
          </View>
          <View style={[styles.headerCell, styles.lastFixedCell, { width: CONTRIBUTOR_WIDTH }]}>
            <Text style={styles.headerText}>Вкладник</Text>
          </View>
        </View>
        {rows.map((row, index) => (
          <View key={`fixed-${index}`} style={styles.dataRow}>
            <View style={[styles.dataCell, { width: PLACE_WIDTH }]}>
              <Text style={styles.placeText}>{row.placeNumber ?? index + 1}</Text>
            </View>
            <View style={[styles.dataCell, styles.lastFixedCell, { width: CONTRIBUTOR_WIDTH }]}>
              <ContributorCell occupant={row.occupant} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.scrollTableViewport}>
        <ScrollView
          horizontal
          bounces={false}
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.scrollTable}
        >
          <View>
            <View style={styles.headerRow}>
              {SCROLL_COLUMNS.map((column) => (
                <View key={column.key} style={[styles.headerCell, { width: column.width }]}>
                  <Text style={styles.headerText}>{column.title}</Text>
                </View>
              ))}
            </View>
            {rows.map((row, rowIndex) => (
              <View key={`scroll-${rowIndex}`} style={styles.dataRow}>
                {SCROLL_COLUMNS.map((column) => (
                  <View key={column.key} style={[styles.dataCell, { width: column.width }]}>
                    <Text style={styles.valueText}>{getScrollableValue(row, column.key)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const sharedTable = {
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: '#2a2f3a',
  backgroundColor: '#1b1f2a',
};

const styles = StyleSheet.create({
  tablesRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start' },
  fixedTable: {
    ...sharedTable,
    zIndex: 2,
    width: PLACE_WIDTH + CONTRIBUTOR_WIDTH,
    flexShrink: 0,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  scrollTableViewport: {
    ...sharedTable,
    zIndex: 1,
    flex: 1,
    minWidth: 0,
    marginLeft: -1,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  scrollTable: { flexGrow: 0 },
  headerRow: { height: DISTRIBUTION_HEADER_HEIGHT, flexDirection: 'row' },
  dataRow: { height: DISTRIBUTION_ROW_HEIGHT, flexDirection: 'row' },
  headerCell: {
    height: DISTRIBUTION_HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2a2f3a',
  },
  dataCell: {
    height: DISTRIBUTION_ROW_HEIGHT,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2a2f3a',
  },
  lastFixedCell: { borderRightWidth: 0 },
  headerText: { color: '#e6e9ef', fontSize: 12, fontWeight: '700' },
  placeText: { color: '#e6e9ef', fontSize: 14 },
  valueText: { color: '#e6e9ef', fontSize: 12, textAlign: 'center' },
  emptyText: { color: '#9aa3b2', fontSize: 12 },
  contributorCell: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2b3037',
  },
  guildAvatar: { borderColor: '#55d96b' },
  outsiderAvatar: { borderColor: '#ff4d4f' },
  avatarImage: { width: '100%', height: '100%' },
  contributorName: { flex: 1, marginLeft: 6, color: '#e6e9ef', fontSize: 11 },
});

export default MyGBDistributionTable;
