import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const TOTAL_MINUTES = 24 * 60;

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

const buildScheduleSummary = (scheduleId, scheduleData) => {
  if (!scheduleData) return null;
  if (scheduleData.weekly) {
    const dayKeys = Object.keys(scheduleData.weekly)
      .filter((key) => Array.isArray(scheduleData.weekly[key]) && scheduleData.weekly[key].length)
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const slots = dayKeys.flatMap((dayKey) => scheduleData.weekly[dayKey] || []);
    const range = resolveTimeRange(slots);
    const timeLabel = range
      ? `${formatMinutes(range.start)}–${formatMinutes(range.end)}`
      : 'Час не задано';
    const daysLabel = dayKeys.length ? dayKeys.map((day) => DAYS_SHORT[day]).join(', ') : null;
    return {
      id: scheduleId,
      title: 'Щотижневий графік',
      subtitle: daysLabel ? `${timeLabel} · ${daysLabel}` : timeLabel,
    };
  }
  if (scheduleData.rollingWeeks?.weeks) {
    const weeks = Object.values(scheduleData.rollingWeeks.weeks);
    const slots = weeks.flatMap((week) =>
      Object.values(week.days || {}).flatMap((daySlots) => daySlots || [])
    );
    const range = resolveTimeRange(slots);
    const timeLabel = range
      ? `${formatMinutes(range.start)}–${formatMinutes(range.end)}`
      : 'Час не задано';
    const dayCount = weeks.reduce(
      (total, week) => total + Object.keys(week.days || {}).length,
      0
    );
    const countLabel = dayCount ? `обрано днів: ${dayCount}` : null;
    return {
      id: scheduleId,
      title: 'Графік за датами',
      subtitle: countLabel ? `${timeLabel} · ${countLabel}` : timeLabel,
    };
  }
  return null;
};

const AddSchedule = () => {
  const [schedules, setSchedules] = useState([]);
  const navigation = useNavigation();

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
              buildScheduleSummary(scheduleId, scheduleData)
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
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Автоматичне ввімкнення</Text>
      <Text style={styles.description}>
        Режим буде автоматично ввімкнено, якщо хоча б одна з умов нижче виконується.
      </Text>

      <View style={styles.suggestedConditionsContainer}>
        <Text style={styles.suggestedTitle}>Запропоновані умови</Text>
        {schedules.length ? (
          schedules.map((schedule) => (
            <TouchableOpacity
              key={schedule.id}
              style={styles.scheduleItem}
              onPress={() => navigation.navigate('SleepSchedule', { scheduleId: schedule.id })}
            >
              <View>
                <Text style={styles.scheduleTitle}>{schedule.title}</Text>
                <Text style={styles.scheduleSubtitle}>{schedule.subtitle}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#A0D8FF" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>Збережених графіків активності поки немає.</Text>
        )}
        <TouchableOpacity style={styles.suggestedItem} onPress={handleSleepSchedule}>
          <Text style={styles.suggestedText}>Час активності</Text>
          <MaterialIcons name="add" size={24} color="#3498db" />
        </TouchableOpacity>
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.buttonSecondary}>
          <Text style={styles.buttonTextSecondary}>Скасувати</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonPrimary}>
          <Text style={styles.buttonTextPrimary}>Готово</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#121212',
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E0E0E0',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9BA1A6',
    marginBottom: 16,
    lineHeight: 20,
  },
  scheduleContainer: {
    backgroundColor: '#1e1e1e',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  scheduleSubtitle: {
    fontSize: 14,
    color: '#C7CDD3',
  },
  scheduleItem: {
    backgroundColor: '#1e1e1e',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestedConditionsContainer: {
    marginTop: 10,
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#A0D8FF',
    marginBottom: 8,
  },
  suggestedItem: {
    backgroundColor: '#1e1e1e',
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
    color: '#E0E0E0',
  },
  emptyText: {
    fontSize: 14,
    color: '#9BA1A6',
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#1e1e1e',
    padding: 10,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  buttonPrimary: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  buttonSecondary: {
    backgroundColor: '#1e1e1e',
    paddingVertical: 12,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default AddSchedule;
