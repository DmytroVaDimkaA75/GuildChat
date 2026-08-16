import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import Ionicons from 'react-native-vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  primary: '#4ea1ff',
  primarySoft: '#1b2b3b',
  text: '#f4f7fb',
  muted: '#9aa3b2',
  divider: '#36516a',
};

const sections = [
  {
    icon: 'business-outline',
    title: 'Мої ВС',
    subtitle: 'Власні споруди, вкладники та прогрес',
    count: '0',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Гаранти',
    subtitle: 'Споруди співгільдійців, де можна безпечно зайти',
    count: '4',
  },
  {
    icon: 'flash-outline',
    title: 'Експрес прокачки',
    subtitle: 'Долучитися до найближчої експрес-прокачки',
    count: '0',
  },
];

const activity = [
  { icon: 'arrow-up-circle', color: '#55d96b', text: 'Вклад у ВС «Форт 7» на 120 FP', time: '22:48' },
  { icon: 'shield-checkmark-outline', color: COLORS.primary, text: 'Додано новий гарант у ВС «Бастіон»', time: '21:35' },
  { icon: 'chatbubble-ellipses-outline', color: '#ffa719', text: 'Повідомлення в чаті прокачки', time: '20:12' },
];

const moreItems = [
  { icon: 'calculator-outline', label: 'Авторозрахунок гаранту' },
  { icon: 'notifications-outline', label: 'Сповіщення' },
  { icon: 'time-outline', label: 'Історія вкладень' },
];

const GUARANTEE_SCREEN_STATUSES = new Set([
  'empty_guaranteed',
  'empty_urgent_deposit',
  'empty_urgent_proportional_deposit',
  'guild_member_below_place_cost',
]);

function MainSection({ icon, title, subtitle, count, onPress }) {
  return (
    <TouchableOpacity style={styles.mainSection} onPress={onPress} activeOpacity={onPress ? 0.75 : 1}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={31} color={COLORS.primary} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
      </View>
      <Ionicons name="chevron-forward" size={28} color={COLORS.muted} />
    </TouchableOpacity>
  );
}

const GBCenterScreen = ({ navigation }) => {
  const [myGBCount, setMyGBCount] = useState(0);
  const [guaranteeCount, setGuaranteeCount] = useState(0);
  const [expressCount, setExpressCount] = useState(0);

  useEffect(() => {
    let greatBuildRef;
    let handleGreatBuildingsChange;
    let expressRef;
    let handleExpressChange;
    let isCancelled = false;

    const subscribeToGreatBuildings = async () => {
      try {
        const [guildId, userId] = await Promise.all([
          AsyncStorage.getItem('guildId'),
          AsyncStorage.getItem('userId'),
        ]);

        if (isCancelled) return;

        if (!guildId || !userId) {
          setMyGBCount(0);
          return;
        }

        greatBuildRef = database().ref(`guilds/${guildId}/guildUsers`);
        handleGreatBuildingsChange = (snapshot) => {
          const guildUsers = snapshot.val() || {};
          setMyGBCount(Object.keys(guildUsers[userId]?.greatBuild || {}).length);
          const arcLevel = Number(guildUsers[userId]?.greatBuild?.['The Arc']?.level) || 0;
          let visibleGuarantees = 0;
          Object.entries(guildUsers).forEach(([ownerUserId, owner]) => {
            // "Гаранти" contains only Great Buildings owned by other members
            // of the current guild. The current user's GBs belong to "Мої ВС".
            if (ownerUserId === userId) return;
            Object.values(owner?.greatBuild || {}).forEach((building) => {
              if (building?.lock === true) return;
              const currentUserContribution = Number(
                building?.contributors?.[userId]?.forgePoints
              ) || 0;
              const guarant = building?.guarant;
              const isTopUpTarget = guarant?.status === 'guild_member_below_place_cost'
                && guarant?.action?.contributorId === userId;
              if (currentUserContribution > 0 && !isTopUpTarget) return;
              if (guarant?.status === 'guild_member_below_place_cost' && !isTopUpTarget) return;
              if (!GUARANTEE_SCREEN_STATUSES.has(guarant?.status)) return;
              if (arcLevel < (Number(guarant.requiredArcLevel) || 0)) return;
              visibleGuarantees += 1;
            });
          });
          setGuaranteeCount(visibleGuarantees);
        };
        greatBuildRef.on('value', handleGreatBuildingsChange);

        expressRef = database().ref(`guilds/${guildId}/express`);
        handleExpressChange = (snapshot) => {
          const now = Date.now();
          const futureTimes = new Set(
            Object.values(snapshot.val() || {})
              .map((express) => Number(express?.scheduleTime) || 0)
              .filter((scheduleTime) => scheduleTime > now)
          );
          setExpressCount(futureTimes.size);
        };
        expressRef.on('value', handleExpressChange);
      } catch (error) {
        if (isCancelled) return;
        console.error('Не вдалося завантажити кількість ВС:', error);
        setMyGBCount(0);
      }
    };

    subscribeToGreatBuildings();

    return () => {
      isCancelled = true;
      if (greatBuildRef && handleGreatBuildingsChange) {
        greatBuildRef.off('value', handleGreatBuildingsChange);
      }
      if (expressRef && handleExpressChange) {
        expressRef.off('value', handleExpressChange);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionList}>
          {sections.map((item) => (
            <MainSection
              key={item.title}
              {...item}
              count={
                item.title === 'Мої ВС'
                  ? myGBCount
                  : item.title === 'Гаранти'
                    ? guaranteeCount
                    : expressCount
              }
              onPress={
                item.title === 'Мої ВС'
                  ? () => navigation.navigate('MyGBCenter')
                  : item.title === 'Гаранти'
                    ? () => navigation.navigate('GBGuarantees')
                    : expressCount > 0
                      ? () => navigation.navigate('GBExpress')
                      : undefined
              }
            />
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Остання активність</Text>
          {activity.map((item, index) => (
            <View key={item.text} style={[styles.activityRow, index > 0 && styles.dividedRow]}>
              <View style={[styles.activityIcon, { borderColor: item.color }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={styles.activityText}>{item.text}</Text>
              <Text style={styles.activityTime}>{item.time}</Text>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Що ще</Text>
          {moreItems.map((item, index) => (
            <View key={item.label} style={[styles.moreRow, index > 0 && styles.dividedRow]}>
              <Ionicons name={item.icon} size={26} color={COLORS.primary} />
              <Text style={styles.moreLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={25} color={COLORS.muted} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 28 },
  sectionList: { paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  mainSection: {
    minHeight: 96,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  sectionIcon: {
    width: 57,
    height: 57,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  sectionCopy: { flex: 1, marginLeft: 13, marginRight: 8 },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  sectionSubtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 19, marginTop: 3 },
  countBadge: {
    minWidth: 43,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  countText: { color: '#79baff', fontSize: 17, fontWeight: '600' },
  panel: {
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  panelTitle: { color: '#8ecbff', fontSize: 18, fontWeight: '700', margin: 14, marginBottom: 9 },
  activityRow: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  dividedRow: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  activityIcon: {
    width: 34,
    height: 34,
    borderWidth: 2,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: { flex: 1, color: COLORS.text, fontSize: 14, marginHorizontal: 11 },
  activityTime: { color: '#8992a0', fontSize: 13 },
  moreRow: { minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  moreLabel: { flex: 1, color: '#d7dbe2', fontSize: 15, marginLeft: 18 },
});

export default GBCenterScreen;
