import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2F2F2F',
  textPrimary: '#FFFFFF',
  textSecondary: '#BDBDBD',
  accent: '#2196f3',
  danger: '#ff5d5d',
};

const TechnologyCosts = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const [inputs, setInputs] = useState({});
  const [invalidTechIds, setInvalidTechIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const allTechList = useMemo(() => {
    if (!settlementName) return [];

    const packByKey = RULE_PACKS[settlementName];
    const packByType = Object.values(RULE_PACKS).find(
      (item) => item?.settlementType === settlementName
    );

    const pack = packByKey || packByType;
    const advancements = pack?.techTree?.advancementsCatalog || [];

    return advancements;
  }, [settlementName]);

  const techList = useMemo(
    () => allTechList.filter((item) => (item?.allowedGoods || []).length >= 2),
    [allTechList]
  );

  const allSettlementGoods = useMemo(() => {
    const goods = new Set();
    allTechList.forEach((tech) => {
      (tech.allowedGoods || []).forEach((good) => goods.add(good));
    });
    return Array.from(goods);
  }, [allTechList]);

  const handleChange = (techId, good, value) => {
    const key = `${techId}:${good}`;
    const sanitized = value.replace(/[^0-9]/g, '');
    setInputs((prev) => ({
      ...prev,
      [key]: sanitized,
    }));
    setInvalidTechIds((prev) => prev.filter((id) => id !== techId));
  };

  const buildTechPayload = useCallback(() => {
    const nextInvalidTechIds = [];
    const payload = {};

    allTechList.forEach((tech) => {
      const costGoods = {};
      let total = 0;
      const techAllowedGoods = tech.allowedGoods || [];
      const isSingleGoodsTech = techAllowedGoods.length === 1;

      allSettlementGoods.forEach((good) => {
        let amount = 0;
        if (isSingleGoodsTech && techAllowedGoods[0] === good) {
          amount = Number(tech.totalGoodsCost) || 0;
        } else if (techAllowedGoods.includes(good)) {
          const key = `${tech.id}:${good}`;
          const raw = inputs[key];
          const parsed = Number(raw);
          amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        }

        costGoods[good] = amount;
        total += amount;
      });

      if (total !== tech.totalGoodsCost) {
        nextInvalidTechIds.push(tech.id);
      }

      payload[tech.id] = {
        advancementId: tech.id,
        status: 'locked',
        costGoods,
      };
    });

    return { payload, nextInvalidTechIds };
  }, [allSettlementGoods, allTechList, inputs]);

  const handleSave = useCallback(async () => {
    if (!allTechList.length || isSaving) return;

    const { payload, nextInvalidTechIds } = buildTechPayload();
    const visibleInvalidTechIds = nextInvalidTechIds.filter((id) =>
      techList.some((tech) => tech.id === id)
    );
    setInvalidTechIds(visibleInvalidTechIds);

    if (visibleInvalidTechIds.length > 0) {
      return;
    }

    try {
      setIsSaving(true);
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');

      if (!userId || !guildId) {
        Alert.alert('Помилка', 'Не знайдено userId або guildId для збереження.');
        return;
      }

      const basePath = `/users/${userId}/${guildId}/settlement`;
      await database().ref(`${basePath}/tech`).set(payload);
      await database().ref(basePath).update({
        settlementName: settlementName || null,
        edit: { status: 'edit' },
      });
      Alert.alert('Успіх', 'Технології успішно збережено.');
    } catch (error) {
      console.error('Не вдалося зберегти технології:', error);
      Alert.alert('Помилка', 'Не вдалося зберегти технології. Спробуйте ще раз.');
    } finally {
      setIsSaving(false);
    }
  }, [allTechList.length, buildTechPayload, isSaving, techList]);

  useEffect(() => {
    navigation.setParams({
      onSaveTechnologyCosts: handleSave,
    });
  }, [handleSave, navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Вартість технологій: {settlementName || '—'}</Text>

      {techList.length === 0 ? (
        <Text style={styles.emptyText}>
          Для цього поселення немає технологій із двома або більше товарами для відкриття.
        </Text>
      ) : (
        techList.map((tech) => (
          <View
            key={tech.id}
            style={[styles.card, invalidTechIds.includes(tech.id) && styles.invalidCard]}
          >
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
  invalidCard: {
    borderColor: COLORS.danger,
    borderWidth: 2,
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
