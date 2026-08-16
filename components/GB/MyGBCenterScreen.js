import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { getGbgBotIds } from '../../src/utils/guildBots';
import Ionicons from 'react-native-vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import MyGBDistributionTable, {
  DISTRIBUTION_HEADER_HEIGHT,
  DISTRIBUTION_ROW_HEIGHT,
  MIN_DISTRIBUTION_ROWS,
  getDistributionPlaces,
} from './MyGBDistributionTable';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  primary: '#4ea1ff',
  primarySoft: '#1b2b3b',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  divider: '#36516a',
  success: '#4edb78',
  warning: '#ffa51f',
  danger: '#ff5b5b',
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

const ExtraContributorsModal = ({ contributors, visible, onClose }) => (
  <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
    <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.contributorsModalOverlay}>
      <TouchableOpacity activeOpacity={1} style={styles.contributorsModalCard}>
        <Text style={styles.contributorsModalTitle}>Інші вкладники</Text>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.contributorsModalContent}
          showsVerticalScrollIndicator={contributors.length > 5}
        >
          {contributors.map((contributor) => (
            <View key={contributor.id} style={styles.contributorModalRow}>
              <View
                style={[
                  styles.contributorModalAvatar,
                  contributor.isGuildMember ? styles.guildAvatar : styles.externalAvatar,
                ]}
              >
                {contributor.imageUrl ? (
                  <Image source={{ uri: contributor.imageUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={19} color={COLORS.muted} />
                )}
              </View>
              <Text numberOfLines={1} style={styles.contributorModalName}>
                {contributor.name || contributor.id}
              </Text>
            </View>
          ))}
        </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
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
  if (guarant?.status === 'empty_requires_owner_guarantee') {
    const ownerGuaranteeFp = Number(guarant.ownerGuaranteeFp);
    if (Number.isFinite(ownerGuaranteeFp) && ownerGuaranteeFp > 0) {
      return {
        label: `Терміново вкласти ${formatNumber(ownerGuaranteeFp, 'uk')} СО`,
        type: 'danger',
      };
    }
  }
  if (guarant?.status === 'guild_member_below_place_cost') {
    const playerName = guarant.occupant?.playerName;
    if (playerName) {
      return {
        label: `Очікуємо доплати від ${playerName}`,
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

function BuildingCard({
  building,
  language,
  onToggleLock,
  lockUpdating,
  onScheduleExpress,
}) {
  const forgePointsUnit = getForgePointsUnit(language);
  const remaining = Math.max(0, building.totalLevelCost - building.totalContribution);
  const badge = getGuaranteeBadge(building, forgePointsUnit);
  const [expanded, setExpanded] = useState(false);
  const [showExtraContributors, setShowExtraContributors] = useState(false);
  const expansion = useRef(new Animated.Value(0)).current;
  const distributionRowCount = Math.max(
    MIN_DISTRIBUTION_ROWS,
    getDistributionPlaces(building.guarant).length
  );
  const expandedAreaHeight = 14
    + DISTRIBUTION_HEADER_HEIGHT
    + distributionRowCount * DISTRIBUTION_ROW_HEIGHT
    + 58;
  const chevronRotation = expansion.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    Animated.timing(expansion, {
      toValue: nextExpanded ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={building.lockEligible
          ? building.lock ? 'Відкрити ВС' : 'Закрити ВС'
          : 'Блокування недоступне для ВС із внесками'}
        activeOpacity={0.7}
        disabled={lockUpdating || !building.lockEligible}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        onPress={onToggleLock}
        style={[
          styles.lockButton,
          (lockUpdating || !building.lockEligible) && styles.lockButtonDisabled,
        ]}
      >
        <Ionicons
          name={building.lock ? 'lock-closed' : 'lock-open'}
          size={23}
          color={building.lock ? COLORS.warning : COLORS.primary}
        />
      </TouchableOpacity>
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
            {building.hiddenContributors.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Показати ще ${building.hiddenContributors.length} вкладників`}
                activeOpacity={0.7}
                hitSlop={5}
                onPress={() => setShowExtraContributors(true)}
                style={[styles.extraAvatar, styles.overlapAvatar]}
              >
                <Text style={styles.extraText}>+{building.hiddenContributors.length}</Text>
              </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.expandButton}
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Згорнути таблицю місць' : 'Розгорнути таблицю місць'}
          accessibilityState={{ expanded }}
        >
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-down" size={31} color={COLORS.primary} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.expandedArea,
          {
            height: expansion.interpolate({ inputRange: [0, 1], outputRange: [0, expandedAreaHeight] }),
            opacity: expansion,
          },
        ]}
      >
        <MyGBDistributionTable guarant={building.guarant} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Запланувати експрес"
          activeOpacity={0.75}
          onPress={onScheduleExpress}
          style={styles.scheduleExpressButton}
        >
          <Text style={styles.scheduleExpressButtonText}>Запланувати експрес</Text>
        </TouchableOpacity>
      </Animated.View>
      <ExtraContributorsModal
        contributors={building.hiddenContributors}
        visible={showExtraContributors}
        onClose={() => setShowExtraContributors(false)}
      />
    </View>
  );
}

const MyGBCenterScreen = ({ navigation }) => {
  const { i18n } = useTranslation();
  const [buildings, setBuildings] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [updatingLockId, setUpdatingLockId] = useState(null);
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

          const forcedUnlocks = {};
          Object.entries(userBuilds).forEach(([buildId, userBuild]) => {
            const totalContribution = Object.values(userBuild?.contributors || {}).reduce(
              (sum, contributor) => sum + (Number(contributor?.forgePoints) || 0),
              0
            );
            if (totalContribution > 0 && userBuild?.lock === true) {
              forcedUnlocks[`${buildId}/lock`] = false;
            }
          });
          if (Object.keys(forcedUnlocks).length > 0) {
            greatBuildRef.update(forcedUnlocks).catch((unlockError) => {
              console.error('Не вдалося автоматично відкрити ВС із внесками:', unlockError);
            });
          }

          try {
            const guildUsersSnapshot = await database().ref(`guilds/${guildId}/guildUsers`).once('value');
            const guildUsers = guildUsersSnapshot.val() || {};
            const gbgBotIds = await getGbgBotIds(guildId, Object.keys(guildUsers));
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
                  .filter(([contributorId]) => !gbgBotIds.has(String(contributorId)))
                  .sort(([, first], [, second]) =>
                    (Number(second?.forgePoints) || 0) - (Number(first?.forgePoints) || 0)
                  );
                const loadedContributors = await Promise.all(
                  contributorEntries.map(async ([contributorId, contributor]) => {
                    const isGuildMember = Object.prototype.hasOwnProperty.call(guildUsers, contributorId);
                    const imageUrl = isGuildMember
                      ? guildUsers[contributorId]?.imageUrl || null
                      : await fetchScoreDbAvatar(worldId, contributorId);

                    return {
                      id: contributorId,
                      name: isGuildMember
                        ? guildUsers[contributorId]?.userName
                          || guildUsers[contributorId]?.login
                          || contributor?.playerName
                          || contributorId
                        : contributor?.playerName
                          || contributor?.userName
                          || contributor?.login
                          || contributor?.name
                          || contributorId,
                      forgePoints: Number(contributor?.forgePoints) || 0,
                      imageUrl,
                      isGuildMember,
                    };
                  })
                );

                return {
                  id: buildId,
                  lock: totalContribution === 0 && userBuild?.lock === true,
                  lockEligible: totalContribution === 0,
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
                  contributors: loadedContributors.slice(0, 5),
                  hiddenContributors: loadedContributors.slice(5),
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

  const toggleBuildingLock = async (building) => {
    if (updatingLockId || !building?.id || !building.lockEligible) return;
    const nextLock = !building.lock;
    setUpdatingLockId(building.id);
    setBuildings((currentBuildings) => currentBuildings.map((item) =>
      item.id === building.id ? { ...item, lock: nextLock } : item
    ));
    try {
      const [guildId, userId] = await Promise.all([
        AsyncStorage.getItem('guildId'),
        AsyncStorage.getItem('userId'),
      ]);
      if (!guildId || !userId) throw new Error('Не знайдено guildId або userId');
      await database()
        .ref(`guilds/${guildId}/guildUsers/${userId}/greatBuild/${building.id}/lock`)
        .set(nextLock);
    } catch (error) {
      console.error(`Не вдалося змінити блокування ВС ${building.id}:`, error);
      setBuildings((currentBuildings) => currentBuildings.map((item) =>
        item.id === building.id ? { ...item, lock: building.lock } : item
      ));
    } finally {
      setUpdatingLockId(null);
    }
  };

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
              lockUpdating={updatingLockId === building.id}
              onToggleLock={() => toggleBuildingLock(building)}
              onScheduleExpress={() => navigation.navigate('GBNewExpress', {
                buildingId: building.id,
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
    position: 'relative',
    padding: 12,
    borderWidth: 1,
    borderColor: '#3b536d',
    borderRadius: 17,
    backgroundColor: '#111c29',
  },
  lockButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    elevation: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3c5879',
    borderRadius: 12,
    backgroundColor: '#152334',
  },
  lockButtonDisabled: { opacity: 0.5 },
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
  summary: { flex: 1, minWidth: 0, marginLeft: 14, paddingRight: 38, alignSelf: 'stretch', justifyContent: 'center' },
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
    backgroundColor: '#1b2b3b',
  },
  avatarImage: { width: '100%', height: '100%' },
  guildAvatar: { borderColor: '#55d96b' },
  externalAvatar: { borderColor: COLORS.danger },
  noContributionsText: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  overlapAvatar: { marginLeft: -11 },
  extraAvatar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#29313d' },
  extraText: { color: '#79baff', fontSize: 12, fontWeight: '700' },
  contributorsModalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  contributorsModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '68%',
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },
  contributorsModalTitle: {
    marginBottom: 12,
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  contributorsModalContent: { paddingBottom: 2 },
  contributorModalRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  contributorModalAvatar: {
    width: 42,
    height: 42,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 2,
    backgroundColor: COLORS.primarySoft,
  },
  contributorModalName: {
    flex: 1,
    marginLeft: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  expandButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedArea: { overflow: 'hidden', paddingTop: 12 },
  scheduleExpressButton: {
    height: 46,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#4ea1ff',
  },
  scheduleExpressButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default MyGBCenterScreen;
