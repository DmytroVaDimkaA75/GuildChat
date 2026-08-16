import React from 'react';
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const REACTION_OPTIONS = [
  { key: 'like', emoji: '👍', label: 'Подобається' },
  { key: 'love', emoji: '❤️', label: 'Любов' },
  { key: 'laugh', emoji: '😂', label: 'Смішно' },
  { key: 'wow', emoji: '😮', label: 'Вау' },
  { key: 'sad', emoji: '😢', label: 'Сумно' },
  { key: 'fire', emoji: '🔥', label: 'Вогонь' },
];

export const toggleExclusiveUserReaction = (currentReactions, userId, reactionKey) => {
  const normalizedUserId = String(userId || '');
  const normalizedReactionKey = String(reactionKey || '');
  if (!normalizedUserId || !normalizedReactionKey) return currentReactions || null;

  const source = currentReactions && typeof currentReactions === 'object' ? currentReactions : {};
  const next = {};
  let selectedReactionWasActive = false;

  Object.entries(source).forEach(([key, users]) => {
    if (!users || typeof users !== 'object') {
      next[key] = users;
      return;
    }
    const nextUsers = { ...users };
    if (Object.prototype.hasOwnProperty.call(nextUsers, normalizedUserId)) {
      if (key === normalizedReactionKey && Boolean(nextUsers[normalizedUserId])) selectedReactionWasActive = true;
      delete nextUsers[normalizedUserId];
    }
    if (Object.keys(nextUsers).length > 0) next[key] = nextUsers;
  });

  if (!selectedReactionWasActive) {
    next[normalizedReactionKey] = {
      ...(next[normalizedReactionKey] || {}),
      [normalizedUserId]: true,
    };
  }

  return Object.keys(next).length > 0 ? next : null;
};

export function ReactionActionIcon() {
  return <Text style={styles.actionIcon}>😊</Text>;
}

const getReactionUsers = (reactions, key) => {
  const value = reactions?.[key];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([userId]) => userId);
};

export function MessageReactions({ reactions, currentUserId, onToggle }) {
  const visible = REACTION_OPTIONS
    .map((option) => ({ ...option, users: getReactionUsers(reactions, option.key) }))
    .filter((option) => option.users.length > 0);

  if (!visible.length) return null;
  return (
    <View style={styles.reactionRow}>
      {visible.map((option) => {
        const selected = option.users.includes(String(currentUserId || ''));
        return (
          <TouchableOpacity
            accessibilityLabel={`${option.label}: ${option.users.length}`}
            activeOpacity={0.75}
            key={option.key}
            onPress={() => onToggle?.(option.key)}
            style={[styles.reactionChip, selected && styles.reactionChipSelected]}
          >
            <Text style={styles.reactionEmoji}>{option.emoji}</Text>
            <Text style={[styles.reactionCount, selected && styles.reactionCountSelected]}>{option.users.length}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ReactionPicker({ visible, onClose, onSelect }) {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <SafeAreaView style={[styles.sheet, { paddingBottom: Math.max(24, safeAreaInsets.bottom + 12) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Додати реакцію</Text>
          <View style={styles.pickerRow}>
            {REACTION_OPTIONS.map((option) => (
              <TouchableOpacity
                accessibilityLabel={option.label}
                activeOpacity={0.7}
                key={option.key}
                onPress={() => onSelect?.(option.key)}
                style={styles.pickerButton}
              >
                <Text style={styles.pickerEmoji}>{option.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionIcon: { fontSize: 19, lineHeight: 24, textAlign: 'center', width: 24 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  reactionChip: {
    alignItems: 'center', backgroundColor: '#1b2b3b', borderColor: '#36516a', borderRadius: 13,
    borderWidth: 1, flexDirection: 'row', minHeight: 27, paddingHorizontal: 8,
  },
  reactionChipSelected: { backgroundColor: '#17354a', borderColor: '#4ea1ff' },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: '#9aa3b2', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  reactionCountSelected: { color: '#82c6ff' },
  overlay: { backgroundColor: 'rgba(0,0,0,0.68)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#152330', borderColor: '#36516a', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, borderWidth: 1, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 10,
  },
  handle: { alignSelf: 'center', backgroundColor: '#52677a', borderRadius: 2, height: 4, marginBottom: 12, width: 42 },
  title: { color: '#9aa3b2', fontSize: 12, fontWeight: '700', marginBottom: 12, paddingHorizontal: 4 },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pickerButton: {
    alignItems: 'center', backgroundColor: '#1b2b3b', borderColor: '#36516a', borderRadius: 18,
    borderWidth: 1, height: 48, justifyContent: 'center', width: 48,
  },
  pickerEmoji: { fontSize: 25 },
});
