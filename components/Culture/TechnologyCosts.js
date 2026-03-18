import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  surface: '#1E1E1E',
  border: '#2F2F2F',
  borderError: '#EF5350',
  textPrimary: '#FFFFFF',
  textSecondary: '#BDBDBD',
  accent: '#2196f3',
};

const TechnologyCosts = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const [inputs, setInputs] = useState({});
  const [invalidTechIds, setInvalidTechIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const techList = useMemo(() => {
    const selectedPack = RULE_PACKS[settlementName];
    const selectedAdvancements = selectedPack?.techTree?.advancementsCatalog || [];

    if (selectedAdvancements.length > 0) {
      return selectedAdvancements.filter((item) => (item?.allowedGoods || []).length >= 1);
    }

    const fallbackAdvancements = RULE_PACKS?.pirates?.techTree?.advancementsCatalog || [];
    return fallbackAdvancements.filter((item) => (item?.allowedGoods || []).length >= 1);
  }, [settlementName]);

  const handleChange = (techId, good, value) => {
    const key = `${techId}:${good}`;
    setInputs((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (invalidTechIds.includes(techId)) {
      setInvalidTechIds((prev) => prev.filter((id) => id !== techId));
    }
  };

  const parseGoodValue = (rawValue) => {
    const value = String(rawValue ?? '').trim();

    if (value === '') {
      return { value: 0, isValid: true };
    }

    if (!/^\d+$/.test(value)) {
      return { value: 0, isValid: false };
    }

    return { value: Number(value), isValid: true };
  };

  const buildSavePayload = useCallback(() => {
    const invalidIds = [];

    const payload = techList.map((tech) => {
      const allowedGoods = tech.allowedGoods || [];
      const totalCost = Number(tech.totalGoodsCost || 0);
      let sum = 0;
      let hasInvalidInput = false;

      const costGoods = allowedGoods.reduce((acc, good) => {
        const key = `${tech.id}:${good}`;
        const parsed = parseGoodValue(inputs[key]);

        if (!parsed.isValid) {
          hasInvalidInput = true;
        }

        sum += parsed.value;
        acc[good] = parsed.value;
        return acc;
      }, {});

      if (hasInvalidInput || sum !== totalCost) {
        invalidIds.push(tech.id);
      }

      return {
        advancementId: tech.id,
        status: 'unlocked',
        costGoods,
      };
    });

    return {
      invalidIds,
      payload,
    };
  }, [inputs, techList]);

  const handleSave = useCallback(async () => {
    const { invalidIds, payload } = buildSavePayload();

    if (invalidIds.length > 0) {
      setInvalidTechIds(invalidIds);
      Alert.alert(
        'Помилка перевірки',
        'Для виділених технологій сума товарів має дорівнювати загальній вартості, а значення мають бути цілими невід’ємними числами.',
      );
      return;
    }

    try {
      setIsSaving(true);
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');

      if (!userId || !guildId) {
        Alert.alert('Помилка', 'Не вдалося визначити користувача або гільдію.');
        return;
      }

      const path = `users/${userId}/${guildId}/settlement/tech`;
      await database().ref(path).set(payload);
      Alert.alert('Збережено', 'Технології успішно збережені.');
      setInvalidTechIds([]);
    } catch (error) {
      console.error('Помилка збереження технологій:', error);
      Alert.alert('Помилка', 'Не вдалося зберегти технології. Спробуйте ще раз.');
    } finally {
      setIsSaving(false);
    }
  }, [buildSavePayload]);



  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={isSaving}
        >
          <Ionicons
            name="checkmark-circle"
            size={24}
            color={isSaving ? COLORS.textSecondary : COLORS.textPrimary}
          />
        </TouchableOpacity>
      ),
    });
  }, [handleSave, isSaving, navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Вартість технологій: {settlementName || '—'}</Text>


      {techList.length === 0 ? (
        <Text style={styles.emptyText}>
          Для цього поселення немає технологій з доступними товарами.
        </Text>
      ) : (
        techList.map((tech) => (
          <View
            key={tech.id}
            style={[styles.card, invalidTechIds.includes(tech.id) && styles.cardError]}
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
  saveButton: {
    marginRight: 10,
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
  cardError: {
    borderColor: COLORS.borderError,
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
