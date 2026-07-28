import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DarkThemeColors as C } from '../../constants/theme';

const seedTasks = [
  {
    id: 'treasury',
    title: 'Зібрати товари для скарбниці',
    audience: 'Уся гільдія',
    filter: 'Гільдія',
    status: 'Активне',
    due: 'До 30 липня',
    progress: 68,
    progressLabel: '68%',
    reward: '+500 XP',
    icon: 'treasure-chest',
    color: '#4ea1ff',
  },
  {
    id: 'gvg',
    title: 'Підготувати сектор до ПБГ',
    audience: 'Блок: Варта',
    filter: 'Блоки',
    status: 'Високий пріоритет',
    due: 'Сьогодні, 20:00',
    progress: 57,
    progressLabel: '4 з 7',
    icon: 'sword-cross',
    color: '#ff6b4a',
  },
  {
    id: 'members',
    title: 'Оновити список учасників',
    audience: 'Офіцери',
    filter: 'Мої',
    status: 'Заплановано',
    due: '1 серпня',
    progress: 0,
    progressLabel: '',
    icon: 'account-group',
    color: '#8b65d6',
  },
];

const filters = ['Усі', 'Гільдія', 'Блоки', 'Мої'];

const statusColors = {
  Активне: '#55c878',
  'Високий пріоритет': '#ff6b4a',
  Заплановано: '#e7aa32',
  Виконано: '#55c878',
};

function SummaryItem({ icon, color, label, value }) {
  return (
    <View style={styles.summaryItem}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}24` }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function TaskCard({ task, onToggleDone }) {
  const statusColor = statusColors[task.status] || C.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onToggleDone(task.id)}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <View style={[styles.taskIcon, { backgroundColor: `${task.color}2b` }]}>
          <MaterialCommunityIcons name={task.icon} size={26} color={task.color} />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={17} color={C.textSecondary} />
            <Text style={styles.metaText}>{task.audience}</Text>
          </View>
        </View>
        <Ionicons name="ellipsis-vertical" size={20} color={C.textSecondary} />
      </View>

      <View style={styles.detailsRow}>
        <View style={[styles.statusPill, { borderColor: statusColor, backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{task.status}</Text>
        </View>
        <View style={styles.dueRow}>
          <Ionicons name="calendar-outline" size={17} color={C.textSecondary} />
          <Text style={styles.metaText}>{task.due}</Text>
        </View>
        {!!task.reward && <Text style={styles.reward}>{task.reward}</Text>}
      </View>

      {(task.progress > 0 || task.status === 'Виконано') && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${task.status === 'Виконано' ? 100 : task.progress}%`, backgroundColor: task.color },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {task.status === 'Виконано' ? '100%' : task.progressLabel}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function GuildTasksScreen() {
  const [tasks, setTasks] = useState(seedTasks);
  const [filter, setFilter] = useState('Усі');
  const [query, setQuery] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('Уся гільдія');

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('uk');
    return tasks.filter((task) => {
      const matchesFilter = filter === 'Усі' || task.filter === filter;
      const matchesQuery = !normalized
        || task.title.toLocaleLowerCase('uk').includes(normalized)
        || task.audience.toLocaleLowerCase('uk').includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, tasks]);

  const counts = useMemo(() => ({
    active: tasks.filter((task) => task.status === 'Активне' || task.status === 'Високий пріоритет').length,
    overdue: tasks.filter((task) => task.status === 'Прострочено').length,
    done: tasks.filter((task) => task.status === 'Виконано').length,
  }), [tasks]);

  const toggleDone = (id) => {
    setTasks((current) => current.map((task) => (
      task.id === id
        ? { ...task, status: task.status === 'Виконано' ? 'Активне' : 'Виконано' }
        : task
    )));
  };

  const createTask = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setTasks((current) => [{
      id: `task-${Date.now()}`,
      title: cleanTitle,
      audience,
      filter: audience === 'Уся гільдія' ? 'Гільдія' : 'Блоки',
      status: 'Заплановано',
      due: 'Без дедлайну',
      progress: 0,
      progressLabel: '',
      icon: audience === 'Уся гільдія' ? 'flag-variant' : 'account-group',
      color: '#4ea1ff',
    }, ...current]);
    setTitle('');
    setCreateVisible(false);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summary}>
          <SummaryItem icon="clipboard-outline" color={C.primary} label="Активні" value={counts.active} />
          <View style={styles.summaryDivider} />
          <SummaryItem icon="time-outline" color="#ff6b4a" label="Прострочені" value={counts.overdue} />
          <View style={styles.summaryDivider} />
          <SummaryItem icon="checkmark-circle-outline" color="#55c878" label="Виконані" value={counts.done} />
        </View>

        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Ionicons name="search" size={21} color={C.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Пошук завдань"
              placeholderTextColor={C.textSecondary}
              style={styles.searchInput}
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={19} color={C.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="options-outline" size={23} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filterChip, filter === item && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.hint}>Натисніть завдання, щоб позначити його виконаним</Text>

        {visibleTasks.map((task) => (
          <TaskCard key={task.id} task={task} onToggleDone={toggleDone} />
        ))}
        {visibleTasks.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={34} color={C.textSecondary} />
            <Text style={styles.emptyTitle}>Завдань не знайдено</Text>
            <Text style={styles.emptyText}>Спробуйте змінити пошук або фільтр</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.createButton} onPress={() => setCreateVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={25} color="#fff" />
        <Text style={styles.createButtonText}>Створити</Text>
      </TouchableOpacity>

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Нове завдання</Text>
              <TouchableOpacity onPress={() => setCreateVisible(false)}>
                <Ionicons name="close" size={25} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Назва</Text>
            <TextInput
              autoFocus
              value={title}
              onChangeText={setTitle}
              placeholder="Що потрібно зробити?"
              placeholderTextColor={C.textSecondary}
              style={styles.modalInput}
            />
            <Text style={styles.inputLabel}>Виконавці</Text>
            <View style={styles.audienceRow}>
              {['Уся гільдія', 'Окремий блок'].map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setAudience(item)}
                  style={[styles.audienceChip, audience === item && styles.audienceChipActive]}
                >
                  <Text style={[styles.audienceText, audience === item && styles.audienceTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              disabled={!title.trim()}
              onPress={createTask}
              style={[styles.publishButton, !title.trim() && styles.publishButtonDisabled]}
            >
              <Text style={styles.publishText}>Створити завдання</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { padding: 16, paddingBottom: 108 },
  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14,
  },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  summaryIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: C.textSecondary, fontSize: 11 },
  summaryValue: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 1 },
  summaryDivider: { width: 1, height: 40, backgroundColor: C.border, marginHorizontal: 6 },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  search: {
    flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
  filterButton: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14,
  },
  filters: { gap: 8, paddingVertical: 14 },
  filterChip: {
    minWidth: 70, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20,
  },
  filterChipActive: { backgroundColor: `${C.primary}2b`, borderColor: C.primary },
  filterText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: C.text },
  hint: { color: C.textSecondary, fontSize: 11, marginBottom: 9 },
  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 18, padding: 15, marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  taskIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1, marginHorizontal: 12 },
  taskTitle: { color: C.text, fontSize: 17, fontWeight: '750', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  metaText: { color: C.textSecondary, fontSize: 13 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  statusPill: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reward: { marginLeft: 'auto', color: C.primary, fontSize: 14, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: C.surfaceElevated },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { minWidth: 35, textAlign: 'right', color: C.text, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 50 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 10 },
  emptyText: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  createButton: {
    position: 'absolute', right: 18, bottom: 22, height: 54, flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 20, borderRadius: 27, backgroundColor: C.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '750' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlay },
  modalCard: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: C.border, padding: 20, paddingBottom: 32,
  },
  modalHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 17 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  modalTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  inputLabel: { color: C.text, fontSize: 13, fontWeight: '650', marginBottom: 8 },
  modalInput: {
    height: 50, color: C.text, backgroundColor: C.background, borderWidth: 1,
    borderColor: C.border, borderRadius: 13, paddingHorizontal: 14, fontSize: 15, marginBottom: 18,
  },
  audienceRow: { flexDirection: 'row', gap: 9, marginBottom: 24 },
  audienceChip: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11,
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
  },
  audienceChipActive: { borderColor: C.primary, backgroundColor: `${C.primary}20` },
  audienceText: { color: C.textSecondary, fontSize: 13, fontWeight: '650' },
  audienceTextActive: { color: C.text },
  publishButton: { alignItems: 'center', paddingVertical: 15, borderRadius: 13, backgroundColor: C.primary },
  publishButtonDisabled: { opacity: 0.35 },
  publishText: { color: '#fff', fontSize: 15, fontWeight: '750' },
});
