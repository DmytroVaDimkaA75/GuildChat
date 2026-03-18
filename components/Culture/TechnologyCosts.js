import { useRoute } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2F2F2F',
  textPrimary: '#FFFFFF',
  textSecondary: '#BDBDBD',
  accent: '#2196f3',
};

const TechnologyCosts = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const [inputs, setInputs] = useState({});

  const techList = useMemo(() => {
    if (!settlementName) return [];

    const packByKey = RULE_PACKS[settlementName];
    const packByType = Object.values(RULE_PACKS).find(
      (item) => item?.settlementType === settlementName
    );

    const pack = packByKey || packByType;
    const advancements = pack?.techTree?.advancementsCatalog || [];

    return advancements.filter((item) => (item?.allowedGoods || []).length >= 2);
  }, [settlementName]);

  const handleChange = (techId, good, value) => {
    const key = `${techId}:${good}`;
    setInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Вартість технологій: {settlementName || '—'}</Text>

      {techList.length === 0 ? (
        <Text style={styles.emptyText}>
          Для цього поселення немає технологій із двома або більше можливими товарами.
        </Text>
      ) : (
        techList.map((tech) => (
          <View key={tech.id} style={styles.card}>
            <Text style={styles.techTitle}>{tech.name}</Text>
            <Text style={styles.techMeta}>Загальна вартість: {tech.totalGoodsCost}</Text>

            {(tech.allowedGoods || []).map((good) => {
              const key = `${tech.id}:${good}`;
              return (
                <View key={key} style={styles.row}>
                  <Text style={styles.goodLabel}>{good}</Text>
                  <TextInput
                    value={inputs[key] || ''}
                    onChangeText={(value) => handleChange(tech.id, good, value)}
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  techTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  techMeta: {
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  goodLabel: {
    color: COLORS.textPrimary,
    fontSize: 15,
    flex: 1,
  },
  input: {
    width: 90,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    color: COLORS.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
  },
});

export default TechnologyCosts;
