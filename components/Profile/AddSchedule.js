import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useTranslation } from 'react-i18next';

const TOTAL_MINUTES = 24 * 60;
const SWIPE_DELETE_THRESHOLD = 60;
const DELETE_ACTION_WIDTH = 72;

const formatMinutes = (value) => {
  if (typeof value !== 'number') return null;
  const safeValue = Math.max(0, Math.min(value, TOTAL_MINUTES));
  const hours = Math.floor(safeValue / 60);
  const minutes = safeValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const resolveTimeRange = (slots) => {
  if (!slots.length) return null;
  const primary = slots.find((slot) => slot.part === 'full') || slots[0];
  if (!primary) return null;
  if (primary.part === 'full') {
    return { start: primary.startMinutes, end: primary.endMinutes };
  }
  if (primary.part === 'head') {
    const tail = slots.find(
      (slot) => slot.rangeId === primary.rangeId && slot.part === 'tail'
    );
    return { start: primary.startMinutes, end: tail?.endMinutes ?? primary.endMinutes };
  }
  if (primary.part === 'tail') {
    const head = slots.find(
      (slot) => slot.rangeId === primary.rangeId && slot.part === 'head'
    );
    return { start: head?.startMinutes ?? primary.startMinutes, end: primary.endMinutes };
  }
  return null;
};

// ---------- NEW: key helpers (support new + legacy) ----------
const dayKeyToIndex = (key) => {
  if (typeof key !== 'string') return null;
  if (key.startsWith('d')) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(key); // legacy: "0".."6"
  return Number.isFinite(n) ? n : null;
};

const weekKeyToIndex = (key) => {
  if (typeof key !== 'string') return null;
  if (key.startsWith('w')) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(key); // legacy: "0","1","2"...
  return Number.isFinite(n) ? n : null;
};

const weeklyIndexToKey = (idx) => `d${idx}`;
const rollingWeekIndexToKey = (idx) => `w${idx}`;
const rollingDayIndexToKey = (idx) => `d${idx}`;

// Normalize weekly to object with d0..d6
const normalizeWeekly = (weeklyRaw) => {
  const out = {};
  if (!weeklyRaw) return out;

  // legacy array: [null, [...], ...]
  if (Array.isArray(weeklyRaw)) {
    for (let i = 0; i < weeklyRaw.length; i += 1) {
      const daySlots = weeklyRaw[i];
      if (!Array.isArray(daySlots) || !daySlots.length) continue;
      out[weeklyIndexToKey(i)] = daySlots;
    }
    return out;
  }

  // object: {"1":[...]} or {"d1":[...]}
  if (typeof weeklyRaw === 'object') {
    Object.keys(weeklyRaw).forEach((k) => {
      const idx = dayKeyToIndex(k);
      if (idx === null) return;
      const daySlots = weeklyRaw[k];
      if (!Array.isArray(daySlots) || !daySlots.length) return;
      out[weeklyIndexToKey(idx)] = daySlots;
    });
  }

  return out;
};

// Normalize rollingWeeks to weeks.wX.days.dY
const normalizeRollingWeeks = (rollingWeeksRaw) => {
  if (!rollingWeeksRaw || typeof rollingWeeksRaw !== 'object') return null;

  const anchorAt = rollingWeeksRaw.anchorAt;
  const weeksRaw = rollingWeeksRaw.weeks;

  const weeksOut = {};
  if (!weeksRaw || typeof weeksRaw !== 'object') {
    return { anchorAt, weeks: weeksOut };
  }

  Object.keys(weeksRaw).forEach((wk) => {
    const wIndex = weekKeyToIndex(wk);
    if (wIndex === null) return;

    const weekObj = weeksRaw[wk];
    const daysRaw = weekObj?.days;

    const wKey = rollingWeekIndexToKey(wIndex);
    if (!weeksOut[wKey]) weeksOut[wKey] = { days: {} };

    if (!daysRaw || typeof daysRaw !== 'object') return;

    Object.keys(daysRaw).forEach((dk) => {
      const dIndex = dayKeyToIndex(dk);
      if (dIndex === null) return;

      const slots = daysRaw[dk];
      if (!Array.isArray(slots) || !slots.length) return;

      const dKey = rollingDayIndexToKey(dIndex);
      weeksOut[wKey].days[dKey] = slots;
    });
  });

  return { anchorAt, weeks: weeksOut };
};

const buildScheduleSummary = (scheduleId, scheduleData, t, daysShort) => {
  if (!scheduleData) return null;

  // WEEKLY (new + legacy)
  if (scheduleData.weekly) {
    const weekly = normalizeWeekly(scheduleData.weekly);

    const dayIndexes = Object.keys(weekly)
      .filter((k) => Array.isArray(weekly[k]) && weekly[k].length)
      .map((k) => dayKeyToIndex(k))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    const slots = dayIndexes.flatMap((dayIndex) => weekly[weeklyIndexToKey(dayIndex)] || []);
    const range = resolveTimeRange(slots);

    const timeLabel = range
      ? `${formatMinutes(range.start)}–${formatMinutes(range.end)}`
      : t('addSchedule.noTimeSet');

    const daysLabel = dayIndexes.length
      ? dayIndexes.map((day) => daysShort[day]).join(', ')
      : null;

    return {
      id: scheduleId,
      title: t('addSchedule.weeklyTitle'),
      subtitle: daysLabel ? `${timeLabel} · ${daysLabel}` : timeLabel,
    };
  }

  // ROLLING WEEKS (new + legacy)
  if (scheduleData.rollingWeeks?.weeks) {
    const rolling = normalizeRollingWeeks(scheduleData.rollingWeeks);
    const weeksObj = rolling?.weeks || {};

    const weeks = Object.values(weeksObj);
    const slots = weeks.flatMap((week) =>
      Object.values(week.days || {}).flatMap((daySlots) => daySlots || [])
    );

    const range = resolveTimeRange(slots);
    const timeLabel = range
      ? `${formatMinutes(range.start)}–${formatMinutes(range.end)}`
      : t('addSchedule.noTimeSet');

    const rangeIds = new Set();
    weeks.forEach((week) => {
      Object.values(week.days || {}).forEach((daySlots) => {
        (daySlots || []).forEach((slot) => {
          if (slot?.rangeId) rangeIds.add(slot.rangeId);
        });
      });
    });

    const dayCount = rangeIds.size;
    const countLabel = dayCount ? t('addSchedule.selectedDaysCount', { count: dayCount }) : null;

    return {
      id: scheduleId,
      title: t('addSchedule.datesTitle'),
      subtitle: countLabel ? `${timeLabel} · ${countLabel}` : timeLabel,
    };
  }

  return null;
};

const SwipeableScheduleItem = ({ schedule, onPress, onDelete }) => {
  const swipeX = useRef(new Animated.Value(0)).current;
  const isSwipeOpen = useRef(false);
  const { t } = useTranslation();

  const resetSwipe = useCallback(() => {
    isSwipeOpen.current = false;
    Animated.spring(swipeX, {
      toValue: 0,
      useNativeDriver: true
    }).start();
  }, [swipeX]);

  const openSwipe = useCallback(() => {
    isSwipeOpen.current = true;
    Animated.spring(swipeX, {
      toValue: -DELETE_ACTION_WIDTH,
      useNativeDriver: true
    }).start();
  }, [swipeX]);

  const deleteSchedule = useCallback(async () => {
    try {
      await onDelete(schedule.id);
    } catch (error) {
      console.error('Помилка видалення графіка активності:', error);
      resetSwipe();
    }
  }, [onDelete, resetSwipe, schedule.id]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          (gestureState.dx < 0 || isSwipeOpen.current),
        onPanResponderMove: (_, gestureState) => {
          const startPosition = isSwipeOpen.current ? -DELETE_ACTION_WIDTH : 0;
          const nextPosition = Math.max(
            -DELETE_ACTION_WIDTH,
            Math.min(0, startPosition + gestureState.dx)
          );
          swipeX.setValue(nextPosition);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isSwipeOpen.current) {
            if (gestureState.dx > 10) {
              resetSwipe();
            } else {
              openSwipe();
            }
          } else if (gestureState.dx <= -SWIPE_DELETE_THRESHOLD) {
            openSwipe();
          } else {
            resetSwipe();
          }
        },
        onPanResponderTerminate: () => {
          if (isSwipeOpen.current) {
            openSwipe();
          } else {
            resetSwipe();
          }
        }
      }),
    [openSwipe, resetSwipe, swipeX]
  );

  return (
    <View style={styles.swipeContainer}>
      <TouchableOpacity
        style={styles.deleteBackground}
        onPress={deleteSchedule}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('addSchedule.delete')}
      >
        <MaterialIcons name="delete-outline" size={25} color="#fff" />
        <Text
          style={styles.deleteText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {t('addSchedule.delete')}
        </Text>
      </TouchableOpacity>
      <Animated.View style={{ transform: [{ translateX: swipeX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.scheduleItem} onPress={onPress} activeOpacity={0.75}>
          <View style={styles.scheduleText}>
            <Text style={styles.scheduleTitle}>{schedule.title}</Text>
            <Text style={styles.scheduleSubtitle}>{schedule.subtitle}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#82c6ff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const AddSchedule = () => {
  const [schedules, setSchedules] = useState([]);
  const [userId, setUserId] = useState(null);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const daysShortList = useMemo(() => {
    const daysShort = t('addSchedule.daysShort', { returnObjects: true });
    return Array.isArray(daysShort) ? daysShort : [];
  }, [t]);

  const handleSleepSchedule = () => {
    navigation.navigate('SleepSchedule');
  };

  useEffect(() => {
    let scheduleRef;
    let onValue;
    let isActive = true;

    const subscribe = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (!userId) {
          if (isActive) setSchedules([]);
          return;
        }
        setUserId(userId);

        scheduleRef = database().ref(`users/${userId}/setting/schedules`);

        onValue = (snapshot) => {
          if (!isActive) return;

          if (!snapshot.exists()) {
            setSchedules([]);
            return;
          }

          const data = snapshot.val();
          const parsed = Object.entries(data)
            .map(([scheduleId, scheduleData]) =>
              buildScheduleSummary(scheduleId, scheduleData, t, daysShortList)
            )
            .filter(Boolean);

          setSchedules(parsed);
        };

        scheduleRef.on('value', onValue);
      } catch (error) {
        console.error(error);
      }
    };

    subscribe();

    return () => {
      isActive = false;
      if (scheduleRef && onValue) {
        scheduleRef.off('value', onValue);
      }
    };
  }, [daysShortList, t]);

  const handleDeleteSchedule = async (scheduleId) => {
    if (!userId || !scheduleId) return;
    await database().ref(`users/${userId}/setting/schedules/${scheduleId}`).remove();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('addSchedule.header')}</Text>
      <Text style={styles.description}>{t('addSchedule.description')}</Text>

      <View style={styles.suggestedConditionsContainer}>
        <Text style={styles.suggestedTitle}>{t('addSchedule.suggestedTitle')}</Text>

        {schedules.length ? (
          schedules.map((schedule) => (
            <SwipeableScheduleItem
              key={schedule.id}
              schedule={schedule}
              onPress={() => navigation.navigate('SleepSchedule', { scheduleId: schedule.id })}
              onDelete={handleDeleteSchedule}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>{t('addSchedule.emptyText')}</Text>
        )}

        <TouchableOpacity style={styles.suggestedItem} onPress={handleSleepSchedule}>
          <Text style={styles.suggestedText}>{t('addSchedule.activityTime')}</Text>
          <MaterialIcons name="add" size={24} color="#4ea1ff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0f1115',
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f4f7fb',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9BA1A6',
    marginBottom: 16,
    lineHeight: 20,
  },
  scheduleContainer: {
    backgroundColor: '#152330',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f4f7fb',
  },
  scheduleSubtitle: {
    fontSize: 14,
    color: '#C7CDD3',
  },
  scheduleText: {
    flex: 1,
    paddingRight: 12
  },
  swipeContainer: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden'
  },
  deleteBackground: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    backgroundColor: '#d9363e',
    alignItems: 'center',
    justifyContent: 'center',
    width: DELETE_ACTION_WIDTH + 20,
    paddingLeft: 20,
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
  },
  deleteText: {
    width: DELETE_ACTION_WIDTH - 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center'
  },
  scheduleItem: {
    backgroundColor: '#152330',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestedConditionsContainer: {
    marginTop: 10,
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#82c6ff',
    marginBottom: 8,
  },
  suggestedItem: {
    backgroundColor: '#152330',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestedText: {
    fontSize: 16,
    color: '#f4f7fb',
  },
  emptyText: {
    fontSize: 14,
    color: '#9BA1A6',
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#152330',
    padding: 10,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f4f7fb',
  },
});

export default AddSchedule;
