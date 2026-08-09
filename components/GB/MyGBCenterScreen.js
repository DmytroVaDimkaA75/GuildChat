import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import Ionicons from 'react-native-vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const COLORS = {
  background: '#0f1115',
  surface: '#171b22',
  border: '#343a44',
  primary: '#4ea1ff',
  primarySoft: '#203047',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  divider: '#303640',
  success: '#59df68',
  warning: '#ff9848',
  danger: '#ff4d4f',
};

const getLocalizedBuildingName = (buildingName, language, buildId) => {
  if (typeof buildingName === 'string') return buildingName;
  if (!buildingName || typeof buildingName !== 'object') return buildId;

  const normalizedLanguage = language?.split('-')[0];
  return buildingName[language]
    || buildingName[normalizedLanguage]
    || buildingName.uk
    || buildingName.en
    || Object.values(buildingName).find((name) => typeof name === 'string')
    || buildId;
};

const getForgePointsUnit = (language) => {
  const normalizedLanguage = language?.split('-')[0];
  if (['uk', 'be', 'ru'].includes(normalizedLanguage)) return 'СО';
  if (normalizedLanguage === 'pl') return 'PR';
  return 'FP';
};

const formatNumber = (value, language) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';

  try {
    return number.toLocaleString(language || 'uk');
  } catch {
    return number.toLocaleString('uk');
  }
};

const getUpdateTime = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;
  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const sortBuildings = (items) => [...items].sort((first, second) =>
  second.progress - first.progress
  || second.level - first.level
  || getUpdateTime(second.updateAt) - getUpdateTime(first.updateAt)
  || first.id.localeCompare(second.id)
);

const SCOREDB_BASE_URL = 'https://foe.scoredb.io';

const extractScoreDbAvatarUrl = (html) => {
  const frameIndex = html.search(
    /<div\b[^>]*class\s*=\s*["'][^"']*\bavatar-frame\b[^"']*["'][^>]*>/i
  );
  if (frameIndex < 0) return null;

  const frameContent = html.slice(frameIndex);
  const imageMatch = frameContent.match(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  if (!imageMatch?.[2]) return null;

  const source = imageMatch[2].replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('//')) return `https:${source}`;
  return `${SCOREDB_BASE_URL}${source.startsWith('/') ? '' : '/'}${source}`;
};

const fetchScoreDbAvatar = async (worldId, investorId) => {
  if (!worldId || !investorId) return null;

  try {
    const response = await fetch(
      `${SCOREDB_BASE_URL}/${encodeURIComponent(worldId)}/Player/${encodeURIComponent(investorId)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return extractScoreDbAvatarUrl(await response.text());
  } catch (error) {
    console.error(`Не вдалося отримати аватар вкладника ${investorId}:`, error);
    return null;
  }
};

const formatFreshness = (value) => {
  const timestamp = getUpdateTime(value);
  if (!timestamp) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  return `${Math.floor(hours / 24)} д тому`;
};

function ProgressImage({ image, progress }) {
  const size = 132;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.progressImageWrap}>
      {image ? (
        <Image source={{ uri: image }} style={styles.buildingImage} />
      ) : (
        <View style={[styles.buildingImage, styles.imagePlaceholder]}>
          <Ionicons name="business-outline" size={42} color={COLORS.primary} />
        </View>
      )}
      <Svg width={size} height={size} style={styles.progressCircle}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#24384d" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress / 100)}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.progressPill}>
        <Text style={styles.progressPillText}>{progress}%</Text>
      </View>
    </View>
  );
}

const InfoItem = ({ icon, label, value }) => (
  <View style={styles.infoItem}>
    <Ionicons name={icon} size={18} color={COLORS.muted} style={styles.infoIcon} />
    <View style={styles.infoCopy}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  </View>
);

const getGuaranteeBadge = (building, forgePointsUnit) => {
  if (building.totalLevelCost > 0 && building.totalContribution > building.totalLevelCost) {
    return { label: 'Перелив', type: 'danger' };
  }
  const guarant = building.guarant;
  if (
    guarant?.status === 'empty_urgent_deposit'
    || guarant?.status === 'empty_urgent_proportional_deposit'
  ) {
    const placeNumber = Number(guarant.placeNumber);
    const totalFp = Number(guarant.totalFp);
    if (
      Number.isInteger(placeNumber)
      && placeNumber > 0
      && Number.isFinite(totalFp)
      && totalFp >= 0
    ) {
      return {
        label: `Перелив. На місце ${placeNumber} запропоновано вкласти ${formatNumber(totalFp, 'uk')} СО`,
        type: 'danger',
      };
    }
  }
  if (guarant?.status === 'empty_guaranteed') {
    const placeNumber = Number(guarant.placeNumber);
    if (Number.isInteger(placeNumber) && placeNumber > 0) {
      return { label: `Гарантовано місце ${placeNumber}`, type: 'success' };
    }
  }
  if (guarant?.status === 'guild_member_can_be_overtaken') {
    const placeNumber = Number(guarant.placeNumber);
    const ownerGuaranteeFp = Number(guarant.ownerGuaranteeFp);
    if (
      Number.isInteger(placeNumber)
      && placeNumber > 0
      && Number.isFinite(ownerGuaranteeFp)
      && ownerGuaranteeFp > 0
    ) {
      return {
        label: `Для прикриття вкладника на місці ${placeNumber} слід додати ${formatNumber(ownerGuaranteeFp, 'uk')} СО`,
        type: 'warning',
      };
    }
  }
  if (guarant?.status !== 'ready') return null;
  const place = guarant.place?.placeNumber;
  if (guarant.action?.type === 'take_place' && place) {
    return { label: `Гарантовано місце ${place}`, type: 'success' };
  }
  const amount = Number(guarant.action?.amount);
  if (place && Number.isFinite(amount) && amount > 0) {
    return { label: `До гаранту на місце ${place} — ${formatNumber(amount, 'uk')} ${forgePointsUnit}`, type: 'warning' };
  }
  return null;
};

function BuildingCard({ building, language, onPress }) {
  const forgePointsUnit = getForgePointsUnit(language);
  const remaining = Math.max(0, building.totalLevelCost - building.totalContribution);
  const badge = getGuaranteeBadge(building, forgePointsUnit);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <ProgressImage image={building.image} progress={building.progress} />
        <View style={styles.summary}>
          <Text style={styles.buildingName}>{building.name}</Text>
          <Text style={styles.level}>Рівень {building.level}</Text>
          <View style={styles.avatarRow}>
            {building.contributors.length === 0 ? (
              <Text style={styles.noContributionsText}>Вкладів ще не було</Text>
            ) : building.contributors.map((contributor, index) => (
              <View
                key={contributor.id}
                style={[
                  styles.avatar,
                  contributor.isGuildMember ? styles.guildAvatar : styles.externalAvatar,
                  index > 0 && styles.overlapAvatar,
                ]}
              >
                {contributor.imageUrl ? (
                  <Image source={{ uri: contributor.imageUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={18} color={COLORS.muted} />
                )}
              </View>
            ))}
            {building.extraContributors > 0 && (
              <View style={[styles.extraAvatar, styles.overlapAvatar]}>
                <Text style={styles.extraText}>+{building.extraContributors}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.divider} />
      <View style={styles.infoGrid}>
        <View style={styles.infoColumn}>
          <InfoItem icon="server-outline" label="Вартість рівня" value={`${formatNumber(building.totalLevelCost, language)} ${forgePointsUnit}`} />
          <InfoItem icon="person-add-outline" label="Мій вклад" value={`${formatNumber(building.ownContribution, language)} ${forgePointsUnit}`} />
        </View>
        <View style={styles.verticalDivider} />
        <View style={styles.infoColumn}>
          <InfoItem icon="flag-outline" label="Залишилось до закриття" value={`${formatNumber(remaining, language)} ${forgePointsUnit}`} />
          <InfoItem icon="time-outline" label="Оновлено" value={formatFreshness(building.updateAt)} />
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.badgeSlot}>
          {badge && (
            <View style={[styles.statusBadge, styles[`${badge.type}Badge`]]}>
              <Text style={styles[`${badge.type}BadgeText`]}>{badge.label}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={onPress} accessibilityRole="button">
          <Ionicons name="chevron-forward" size={30} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const MyGBCenterScreen = ({ navigation }) => {
  const { i18n } = useTranslation();
  const [buildings, setBuildings] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const filters = [
    { id: 'all', label: 'Усі' },
    { id: 'guaranteed', label: 'З гарантом' },
    { id: 'needs_fp', label: `Потребують ${getForgePointsUnit(i18n.language)}` },
  ];

  useEffect(() => {
    let greatBuildRef;
    let handleGreatBuildsChange;
    let requestVersion = 0;
    let isCancelled = false;

    const subscribeToGreatBuildings = async () => {
      try {
        const [guildId, userId] = await Promise.all([
          AsyncStorage.getItem('guildId'),
          AsyncStorage.getItem('userId'),
        ]);

        if (isCancelled) return;
        if (!guildId || !userId) {
          setBuildings([]);
          return;
        }

        greatBuildRef = database().ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild`);
        handleGreatBuildsChange = async (snapshot) => {
          const currentRequest = ++requestVersion;
          const userBuilds = snapshot.val() || {};

          try {
            const guildUsersSnapshot = await database().ref(`guilds/${guildId}/guildUsers`).once('value');
            const guildUsers = guildUsersSnapshot.val() || {};
            const worldId = String(guildId).split('_')[0];
            const loadedBuildings = await Promise.all(
              Object.entries(userBuilds).map(async ([buildId, userBuild]) => {
                const buildingSnapshot = await database().ref(`greatBuildings/${buildId}`).once('value');
                const buildingInfo = buildingSnapshot.val() || {};

                const contributors = userBuild?.contributors && typeof userBuild.contributors === 'object'
                  ? userBuild.contributors
                  : {};
                const ownContributor = contributors[userId] || {};
                const ownContribution = Number(ownContributor.forgePoints) || 0;
                const totalContribution = Object.values(contributors).reduce(
                  (sum, contributor) => sum + (Number(contributor?.forgePoints) || 0),
                  0
                );
                const currentLevel = Number(ownContributor.level ?? userBuild?.level) || 0;
                const nextLevel = currentLevel + 1;
                let totalLevelCost = 0;

                if (typeof buildingInfo.levelBase === 'string' && buildingInfo.levelBase) {
                  try {
                    const response = await fetch(`${buildingInfo.levelBase}${nextLevel}`);
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    const apiData = await response.json();
                    totalLevelCost = Number(apiData?.response?.total_fp ?? apiData?.total_fp) || 0;
                  } catch (error) {
                    console.error(`Не вдалося отримати вартість рівня для ${buildId}:`, error);
                  }
                }

                const progress = totalLevelCost > 0
                  ? Math.min(100, Math.max(0, Math.round((totalContribution / totalLevelCost) * 100)))
                  : 0;
                const contributorEntries = Object.entries(contributors)
                  .filter(([contributorId]) => contributorId !== userId)
                  .sort(([, first], [, second]) =>
                    (Number(second?.forgePoints) || 0) - (Number(first?.forgePoints) || 0)
                  );
                const visibleContributors = await Promise.all(
                  contributorEntries.slice(0, 5).map(async ([contributorId, contributor]) => {
                    const isGuildMember = Object.prototype.hasOwnProperty.call(guildUsers, contributorId);
                    const imageUrl = isGuildMember
                      ? guildUsers[contributorId]?.imageUrl || null
                      : await fetchScoreDbAvatar(worldId, contributorId);

                    return {
                      id: contributorId,
                      forgePoints: Number(contributor?.forgePoints) || 0,
                      imageUrl,
                      isGuildMember,
                    };
                  })
                );

                return {
                  id: buildId,
                  name: getLocalizedBuildingName(buildingInfo.buildingName, i18n.language, buildId),
                  image: typeof buildingInfo.buildingImage === 'string'
                    ? buildingInfo.buildingImage
                    : buildingInfo.buildingImage?.uri || null,
                  level: currentLevel,
                  ownContribution,
                  totalContribution,
                  totalLevelCost,
                  progress,
                  updateAt: userBuild?.guarant?.calculatedAt,
                  guarant: userBuild?.guarant || null,
                  contributors: visibleContributors,
                  extraContributors: Math.max(0, contributorEntries.length - 5),
                };
              })
            );

            if (!isCancelled && currentRequest === requestVersion) {
              setBuildings(sortBuildings(loadedBuildings));
            }
          } catch (error) {
            if (!isCancelled && currentRequest === requestVersion) {
              console.error('Не вдалося завантажити дані ВС:', error);
              setBuildings([]);
            }
          }
        };

        greatBuildRef.on('value', handleGreatBuildsChange);
      } catch (error) {
        if (!isCancelled) {
          console.error('Не вдалося підписатися на список ВС:', error);
          setBuildings([]);
        }
      }
    };

    subscribeToGreatBuildings();

    return () => {
      isCancelled = true;
      requestVersion += 1;
      if (greatBuildRef && handleGreatBuildsChange) {
        greatBuildRef.off('value', handleGreatBuildsChange);
      }
    };
  }, [i18n.language]);

  const visibleBuildings = buildings.filter((building) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'needs_fp') {
      return building.guarant?.status === 'guild_member_can_be_overtaken'
        || building.guarant?.action?.type === 'owner_deposit';
    }
    return building.guarant?.status === 'empty_guaranteed'
      || building.guarant?.action?.type === 'take_place';
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.filterRow}>
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              accessibilityRole="button"
              onPress={() => setSelectedFilter(filter.id)}
              style={[styles.filterChip, selectedFilter === filter.id && styles.activeFilter]}
            >
              <Text style={[styles.filterText, selectedFilter === filter.id && styles.activeFilterText]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.cards}>
          {visibleBuildings.map((building) => (
            <BuildingCard
              key={building.id}
              building={building}
              language={i18n.language}
              onPress={() => navigation.navigate('GBGuarant', {
                buildingName: building.name,
                buildingId: building.id,
                buildingImage: building.image,
              })}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 28 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },
  activeFilter: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  filterText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  activeFilterText: { color: '#8ecbff' },
  cards: { paddingHorizontal: 12, gap: 10 },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#3b536d',
    borderRadius: 17,
    backgroundColor: '#111c29',
  },
  cardTop: { minHeight: 136, flexDirection: 'row', alignItems: 'center' },
  progressImageWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  buildingImage: {
    width: 114,
    height: 114,
    resizeMode: 'contain',
    borderRadius: 57,
  },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  progressCircle: { position: 'absolute' },
  progressPill: {
    position: 'absolute',
    bottom: 0,
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 14,
    backgroundColor: '#101b29',
  },
  progressPillText: { color: '#c9ddf5', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  summary: { flex: 1, minWidth: 0, marginLeft: 14, alignSelf: 'stretch', justifyContent: 'center' },
  buildingName: { color: COLORS.primary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  level: { color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  statusBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
  },
  successBadge: { borderColor: '#24b84b', backgroundColor: '#173d29' },
  warningBadge: { borderColor: '#d79600', backgroundColor: '#553900' },
  dangerBadge: { borderColor: COLORS.danger, backgroundColor: '#682022' },
  successBadgeText: { color: '#9af5a5', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  warningBadgeText: { color: '#fff0c7', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  dangerBadgeText: { color: '#ffe3e3', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  divider: { height: 1, marginTop: 8, marginBottom: 10, backgroundColor: '#395068' },
  infoGrid: { minHeight: 88, flexDirection: 'row' },
  infoColumn: { flex: 1, justifyContent: 'space-around' },
  verticalDivider: { width: 1, marginHorizontal: 9, backgroundColor: '#75a3cb' },
  infoItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center' },
  infoIcon: { width: 24, textAlign: 'center' },
  infoCopy: { flex: 1, minWidth: 0, marginLeft: 5 },
  infoLabel: { color: COLORS.muted, fontSize: 11 },
  infoValue: { color: COLORS.text, fontSize: 12, fontWeight: '700', marginTop: 2 },
  cardFooter: { minHeight: 43, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 5 },
  badgeSlot: { flex: 1, minHeight: 28, alignItems: 'flex-start', justifyContent: 'center', marginRight: 10 },
  avatarRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    marginLeft: -4,
    paddingRight: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 2,
    backgroundColor: '#2b3037',
  },
  avatarImage: { width: '100%', height: '100%' },
  guildAvatar: { borderColor: '#55d96b' },
  externalAvatar: { borderColor: COLORS.danger },
  noContributionsText: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  overlapAvatar: { marginLeft: -11 },
  extraAvatar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#29313d' },
  extraText: { color: '#79baff', fontSize: 12, fontWeight: '700' },
  iconButton: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3c5879',
    borderRadius: 13,
  },
});

export default MyGBCenterScreen;
