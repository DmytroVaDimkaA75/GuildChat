import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import Ionicons from 'react-native-vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

const COLORS = {
  background: '#0f1115',
  surface: '#171b22',
  border: '#343a44',
  primary: '#4ea1ff',
  primarySoft: '#203047',
  text: '#f4f7fb',
  muted: '#a7afbd',
  divider: '#303640',
  success: '#59df68',
  warning: '#ff9848',
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

function StatusBadge({ type, label }) {
  const isSuccess = type === 'success';
  const isWarning = type === 'warning';
  const color = isSuccess ? COLORS.success : isWarning ? COLORS.warning : COLORS.muted;
  const icon = isSuccess ? 'shield-checkmark-outline' : isWarning ? 'flame-outline' : 'lock-closed-outline';

  return (
    <View style={[styles.statusBadge, isSuccess && styles.successBadge, isWarning && styles.warningBadge]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

function BuildingCard({ building, language }) {
  const forgePointsUnit = getForgePointsUnit(language);

  return (
    <View style={styles.card}>
      {building.image ? (
        <Image source={{ uri: building.image }} style={styles.buildingImage} />
      ) : (
        <View style={[styles.buildingImage, styles.imagePlaceholder]}>
          <Ionicons name="business-outline" size={42} color={COLORS.primary} />
        </View>
      )}
      <View style={styles.cardContent}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.buildingName}>{building.name}</Text>
            <Text style={styles.level}>Рівень {building.level}</Text>
          </View>
          <View style={styles.guaranteeSlot}>
            {building.status && <StatusBadge type={building.statusType} label={building.status} />}
          </View>
        </View>

        <View style={styles.divider} />
        <View style={styles.contributionRow}>
          <View>
            <Text style={styles.contributionLabel}>Мій вклад</Text>
            <Text style={styles.contributionValue}>
              {formatNumber(building.ownContribution, language)} {forgePointsUnit}
            </Text>
          </View>
          <View style={styles.totalContribution}>
            <Text style={styles.contributionLabel}>Сумарний вклад</Text>
            <Text style={styles.contributionValue}>
              {formatNumber(building.totalContribution, language)} {forgePointsUnit}
            </Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${building.progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{building.progress}%</Text>
        </View>

        <View style={styles.cardFooter}>
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
          <View style={styles.cardActions}>
            <View style={styles.iconButton}>
              <Ionicons name="chevron-forward" size={25} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const MyGBCenterScreen = () => {
  const { i18n } = useTranslation();
  const [buildings, setBuildings] = useState([]);
  const filters = ['Усі', 'З гарантом', `Потребують ${getForgePointsUnit(i18n.language)}`];

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
                  updateAt: userBuild?.updateAt,
                  status: null,
                  statusType: 'closed',
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.filterRow}>
          {filters.map((filter, index) => (
            <View key={filter} style={[styles.filterChip, index === 0 && styles.activeFilter]}>
              <Text style={[styles.filterText, index === 0 && styles.activeFilterText]}>{filter}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cards}>
          {buildings.map((building) => (
            <BuildingCard key={building.id} building={building} language={i18n.language} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 28 },
  filterRow: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingVertical: 14 },
  filterChip: {
    minHeight: 42,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 21,
  },
  activeFilter: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  filterText: { color: COLORS.muted, fontSize: 15 },
  activeFilterText: { color: '#8ecbff', fontWeight: '700' },
  cards: { paddingHorizontal: 12, gap: 10 },
  card: {
    minHeight: 214,
    padding: 11,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
  },
  buildingImage: {
    width: 112,
    height: 124,
    resizeMode: 'contain',
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
  },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 7 },
  titleCopy: { flex: 1 },
  guaranteeSlot: { minWidth: 96, minHeight: 31, alignItems: 'flex-end' },
  buildingName: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  level: { color: COLORS.muted, fontSize: 14, marginTop: 5 },
  statusBadge: {
    minHeight: 31,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    backgroundColor: '#292c31',
  },
  successBadge: { backgroundColor: '#1d3b22' },
  warningBadge: { backgroundColor: '#472d18' },
  statusText: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, marginVertical: 9, backgroundColor: COLORS.divider },
  contributionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalContribution: { minWidth: 115 },
  contributionLabel: { color: COLORS.muted, fontSize: 13 },
  contributionValue: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: 3 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11 },
  progressTrack: { flex: 1, height: 5, overflow: 'hidden', borderRadius: 3, backgroundColor: '#31363d' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },
  progressText: { minWidth: 42, color: COLORS.primary, fontSize: 14, textAlign: 'right' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 34,
    height: 34,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: 2,
    backgroundColor: '#2b3037',
  },
  avatarImage: { width: '100%', height: '100%' },
  guildAvatar: { borderColor: '#55d96b' },
  externalAvatar: { borderColor: '#ff5b5b' },
  noContributionsText: { color: COLORS.muted, fontSize: 13 },
  overlapAvatar: { marginLeft: -7 },
  extraAvatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#29313d' },
  extraText: { color: '#79baff', fontSize: 14 },
  cardActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 47,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3c5879',
    borderRadius: 11,
  },
});

export default MyGBCenterScreen;
