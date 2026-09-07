// components/CulturalSettlements.js
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useFoeSync, useFoeSyncActive } from '../FoeSync/FoeSyncProvider';
import FoeCityMap from '../FoeSync/FoeCityMap';
import SettlementProductions, { COLORS } from './SettlementProductions';

const SETTLEMENTS = [
  {
    label: 'Вікінги',
    value: 'vikings',
    image: require('./Vikings.png'),
  },
  {
    label: 'Феодальна Японія',
    value: 'japanese',
    image: require('./Japan.png'),
  },
  {
    label: 'Стародавній Єгипет',
    value: 'egyptians',
    image: require('./Egypt.png'),
  },
  {
    label: 'Ацтеки',
    value: 'aztecs',
    image: require('./Aztecs.png'),
  },
  {
    label: 'Імперія Моголів',
    value: 'mughals',
    image: require('./Mughal.png'),
  },
  {
    label: 'Полінезія',
    value: 'polynesia',
    image: require('./Polynesia.png'),
  },
  {
    label: 'Піратське поселення',
    value: 'pirates',
    image: require('./Pirates.png'),
  },
];

// Гра називає будівлі поселення за схемою "<префікс>_<Назва>_<Тип>" (напр.
// "H_Pirates_Townhall" усередині поселення, "Y_Pirates_Ship1" — сам кораблик
// у ГОЛОВНОМУ місті, що веде туди). Це дає назву активного поселення БЕЗ
// заходу в нього — досить cityentity_id кораблика з уже синхронізованої
// мапи міста. Якщо гра не надіслала головну мапу в цьому світі, тип можна
// визначити вже з сутностей отриманої мапи поселення. Аліаси — бо англійська
// назва в грі не завжди збігається з нашим value 1-в-1.
// мапи міста. Якщо гра не надіслала головну мапу в цьому світі, тип можна
// визначити вже з сутностей отриманої мапи поселення. Аліаси — бо англійська
// назва в грі не завжди збігається з нашим value 1-в-1.
const SETTLEMENT_CID_ALIASES = {
  vikings: ['vikings', 'viking'],
  japanese: ['japan', 'japanese'],
  egyptians: ['egypt', 'egyptians', 'egyptian'],
  aztecs: ['aztecs', 'aztec'],
  mughals: ['mughal', 'mughals'],
  polynesia: ['polynesia', 'polynesian'],
  pirates: ['pirates', 'pirate'],
};

function detectSettlementFromCid(cid) {
  if (!cid) return null;
  const segments = String(cid).toLowerCase().split('_');
  return (
    SETTLEMENTS.find((item) => {
      const aliases = SETTLEMENT_CID_ALIASES[item.value] || [item.value];
      return segments.some((seg) => aliases.includes(seg));
    }) || null
  );
}

const CulturalSettlements = () => {
  const navigation = useNavigation();
  const {
    found = {},
    autoEnterSettlementQuietly,
    stealthEntering,
    autoEnterLog = [],
    calibPoints = {},
    settlementDefs = null,
    settlementBuildings = [],
    settlementDefsProgress = null,
    settlementProductions = [],
    settlementSheets = [],
    settlementIconUrls = {},
    iconSheet = null,
    goodsSheet = null,
  } = useFoeSync() || {};

  // Усі доступні спрайт-листи — спершу поселенські, далі загальні.
  const iconSheets = useMemo(
    () => [...(settlementSheets || []), goodsSheet, iconSheet].filter(Boolean),
    [settlementSheets, goodsSheet, iconSheet]
  );

  // Живий відлік: раз на 30 с оновлюємо «залишилось».
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30000);
    return () => clearInterval(timer);
  }, []);
  // Авто-вхід більше не потребує ручного калібрування: якщо своєї записаної
  // точки немає, провайдер бере «заводську» (DEFAULT_SHIP_CALIB). Тож екран
  // не має нічого блокувати — інакше новий користувач ніколи не дочекався б
  // автоматичного входу.
  const hasCalibShip = true;
  const settlementMap = found.settlementMap;
  // Поки не маємо мапи поселення — тримаємо фонову синхронізацію активною
  // (потрібна мапа міста, щоб дізнатись координати корабля/ратуші). Щойно
  // отримали мапу поселення — відпускаємо: вікно гри само згорнеться
  // (див. SYNC_LINGER_MS у FoeSyncProvider), не тримаємо його довше, ніж треба.
  useFoeSyncActive(!settlementMap);

  const ship = useMemo(
    () => (found.cityMap?.entities || []).find((e) => e.type === 'outpost_ship') || null,
    [found.cityMap]
  );
  const activeSettlement = useMemo(() => {
    const fromShip = detectSettlementFromCid(ship?.cid);
    if (fromShip) return fromShip;
    for (const entity of settlementMap?.entities || []) {
      const fromSettlement = detectSettlementFromCid(entity?.cid);
      if (fromSettlement) return fromSettlement;
    }
    return null;
  }, [settlementMap, ship?.cid]);

  // ТИМЧАСОВО: рахуємо завершені спроби — щоб після невдалої мовчазної
  // спроби показати кнопку "Спробувати ще раз" замість вічного "зараз
  // спробуємо…" (раніше екран просто зависав без жодної ознаки провалу).
  const [attempts, setAttempts] = React.useState(0);
  // Захист від повторного накладання спроб, поки асинхронний вхід ще триває.
  const runningRef = React.useRef(false);
  const runAutoEnter = React.useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    Promise.resolve(autoEnterSettlementQuietly?.()).finally(() => {
      runningRef.current = false;
      setAttempts((n) => n + 1);
    });
  }, [autoEnterSettlementQuietly]);

  // Кнопка «Оновити» в хедері — примусовий повторний вхід у поселення заради
  // свіжих даних (мапа, час виробництв), навіть якщо мапа вже завантажена.
  const runRefresh = React.useCallback(() => {
    if (runningRef.current || stealthEntering) return;
    runningRef.current = true;
    Promise.resolve(autoEnterSettlementQuietly?.({ force: true })).finally(() => {
      runningRef.current = false;
      setNowSec(Math.floor(Date.now() / 1000));
    });
  }, [autoEnterSettlementQuietly, stealthEntering]);

  // Автозапуск — тепер на ОСНОВІ ОДНОРАЗОВОЇ ручної калібровки (реальні
  // координати з "Корабель", підтверджено надійні через кнопку "Тест"),
  // а не здогадної формули "з ігрових координат" (та була ненадійна й
  // покинута — див. пам'ять settlement-diag-temp-screen). Спрацьовує сам,
  // без жодної дії користувача, щойно калібровка є.
  useEffect(() => {
    if (settlementMap || !hasCalibShip || attempts > 0 || runningRef.current) return;
    runAutoEnter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementMap, hasCalibShip]);

  const sectorStats = useMemo(() => {
    if (!settlementMap) return null;
    const areas = Array.isArray(settlementMap.unlocked_areas) ? settlementMap.unlocked_areas : [];
    const SECTOR = 4;
    const unlockedCount = areas.reduce((sum, area) => {
      const width = Number(area?.width) || SECTOR;
      const length = Number(area?.length) || SECTOR;
      return sum + (width / SECTOR) * (length / SECTOR);
    }, 0);
    const purchasable = Array.isArray(settlementMap.tilesets) ? settlementMap.tilesets.length : 0;
    return { unlockedCount, purchasable };
  }, [settlementMap]);

  useLayoutEffect(() => {
    const options = {};
    if (activeSettlement) {
      options.headerTitle = () => (
        <View style={styles.headerTitle}>
          <Image source={activeSettlement.image} style={styles.headerIcon} />
          <Text style={styles.headerText}>{activeSettlement.label}</Text>
        </View>
      );
    }
    if (hasCalibShip) {
      options.headerRight = () => (
        <TouchableOpacity
          style={styles.headerRefresh}
          onPress={runRefresh}
          disabled={stealthEntering}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Оновити дані поселення"
        >
          {stealthEntering ? (
            <ActivityIndicator size="small" color={COLORS.textPrimary} />
          ) : (
            <Ionicons name="refresh" size={24} color={COLORS.textPrimary} />
          )}
        </TouchableOpacity>
      );
    }
    navigation.setOptions(options);
  }, [navigation, activeSettlement, hasCalibShip, stealthEntering, runRefresh]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {settlementMap ? (
        <>
          <View style={styles.mapCard}>
            <FoeCityMap
              cityMap={settlementMap}
              defs={settlementDefs}
              buildings={settlementBuildings.length ? settlementBuildings : undefined}
              horizontalInset={46}
            />
          </View>
          {sectorStats ? (
            <Text style={styles.sectorStats}>
              Відкритих секторів: {sectorStats.unlockedCount} · доступно для викупу: {sectorStats.purchasable}
            </Text>
          ) : null}

          <SettlementProductions
            productions={settlementProductions}
            nowSec={nowSec}
            iconSheets={iconSheets}
            iconUrls={settlementIconUrls}
            defsProgress={settlementDefsProgress}
            hasBuildings={settlementBuildings.length > 0}
          />
        </>
      ) : stealthEntering ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.loadingText}>Отримуємо дані поселення…</Text>
        </View>
      ) : hasCalibShip && attempts > 0 ? (
        <>
          <Text style={styles.note}>
            Не вдалось автоматично отримати мапу поселення. Можна спробувати
            ще раз, або зробити вручну через «Технічні дані поселення» → «Тест».
          </Text>
          {autoEnterLog.length ? (
            <Text style={styles.debugLog}>
              Останній крок: {autoEnterLog[autoEnterLog.length - 1].step}
              {autoEnterLog[autoEnterLog.length - 1].target
                ? ` · ${autoEnterLog[autoEnterLog.length - 1].target}`
                : ''}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={runAutoEnter}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Спробувати ще раз</Text>
          </TouchableOpacity>
        </>
      ) : hasCalibShip ? (
        <Text style={styles.note}>Зараз спробуємо отримати мапу поселення автоматично…</Text>
      ) : (
        <Text style={styles.note}>
          Потрібне одноразове калібрування: відкрийте «Технічні дані
          поселення» → «Відкрити гру» → прогорніть до кораблика поселення й
          натисніть «Корабель» (один тап). Після цього вхід відбуватиметься
          автоматично щоразу, без жодних дій.
        </Text>
      )}

      {/* ТИМЧАСОВО: збір технічних даних поселень для розробника */}
      <TouchableOpacity
        style={styles.diagButton}
        onPress={() => navigation.navigate('SettlementDiag')}
        activeOpacity={0.8}
      >
        <Text style={styles.diagButtonText}>🛠 Технічні дані поселення (тимчасово)</Text>
      </TouchableOpacity>
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
  mapCard: {
    padding: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  sectorStats: {
    color: COLORS.textPrimary,
    fontSize: 13,
    marginTop: 10,
    marginBottom: 16,
    textAlign: 'center',
  },
  note: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    marginLeft: 10,
  },
  debugLog: {
    color: COLORS.border,
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
    marginRight: 8,
  },
  headerText: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  headerRefresh: {
    marginRight: 15,
  },
  diagButton: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(78,161,255,0.12)',
  },
  diagButtonText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default CulturalSettlements;
