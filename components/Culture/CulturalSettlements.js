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
import FoeIcon, { findFrame } from '../FoeSync/FoeIcon';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  textPrimary: '#f4f7fb',
  accent: '#4ea1ff',
};

// Короткі назви ресурсів поселень (для колонки «Продукт»). Ключ, якого тут
// немає, показуємо як є, прибравши префікс поселення (pirate_rum -> rum).
const RES_LABELS = {
  doubloons: 'дублони',
  pirate_fish: 'риба', pirate_spice: 'спеції', pirate_rum: 'ром', pirate_cannons: 'гармати',
  viking_meat: 'мʼясо', viking_beer: 'пиво', viking_salt: 'сіль', viking_wool: 'вовна',
  aztec_cocoa: 'какао', aztec_wood: 'деревина', aztec_textiles: 'тканини', aztec_ceramics: 'кераміка',
  mughal_rice: 'рис', mughal_tea: 'чай', mughal_gems: 'самоцвіти', mughal_silk: 'шовк',
  feudal_rice: 'рис', feudal_silk: 'шовк', feudal_tea: 'чай', feudal_lacquerware: 'лак',
  egypt_papyrus: 'папірус', egypt_grain: 'зерно', egypt_gold: 'золото', egypt_ebony: 'чорне дерево',
  polynesia_fish: 'риба', polynesia_shells: 'мушлі', polynesia_pearls: 'перли', polynesia_wood: 'деревина',
};

function resLabel(key) {
  return RES_LABELS[key] || String(key || '').replace(/^[a-z]+_/, '');
}

// Варіанти імені кадру ресурсу в спрайт-листах гри.
function iconNames(key) {
  const bare = String(key || '').replace(/^[a-z]+_/, '');
  return [key, bare, `icon_${key}`, `${key}_icon`, `good_${key}`, `resource_${key}`];
}

// Пряме посилання на PNG-іконку ресурсу (гра іноді вантажить поштучно).
function directIconUrl(iconUrls, key) {
  if (!iconUrls) return null;
  const bare = String(key || '').replace(/^[a-z]+_/, '');
  for (const candidate of [key, bare, `icon_${key}`, `good_${key}`]) {
    if (iconUrls[candidate]) return iconUrls[candidate];
  }
  return null;
}

function goodsEntries(det) {
  return Object.entries(det || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => b[1] - a[1]);
}

function formatGoods(det) {
  const entries = goodsEntries(det);
  if (!entries.length) return null;
  return entries.map(([key, value]) => `${value} ${resLabel(key)}`).join(', ');
}

// Пояснення стану, коли часу завершення нема (виробництво не йде).
function stateNote(st) {
  const s = String(st || '');
  if (/Idle/i.test(s)) return 'не запущено';
  if (/Construction/i.test(s)) return 'будується';
  if (/Unconnected/i.test(s)) return 'немає дороги';
  return '—';
}

// Час, що лишився до завершення виробництва.
function formatLeft(readyAt, nowSec) {
  if (!readyAt) return null;
  const left = readyAt - nowSec;
  if (left <= 0) return 'готово';
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const mins = Math.floor((left % 3600) / 60);
  if (days > 0) return `${days} дн ${hours} год`;
  if (hours > 0) return `${hours} год ${mins} хв`;
  if (mins > 0) return `${mins} хв`;
  return 'менше хв';
}

// Людські назви типів споруд поселення (той самий набір, що й у грі/на мапі).
const TYPE_LABELS = {
  main_building: 'ратуша',
  residential: 'житлова',
  production: 'виробнича',
  goods: 'виробнича',
  diplomacy: 'дипломатична',
  military: 'військова',
  decoration: 'декорація',
  street: 'дорога',
  impediment: 'перешкода',
  off_grid: 'особлива',
  generic_building: 'будівля',
  unknown: 'тип уточнюється',
};

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
  const hasCalibShip = !!calibPoints?.ship;
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

  const readyCount = useMemo(
    () => settlementProductions.reduce(
      (sum, row) => sum + (row.ready || (row.readyAt && row.readyAt <= nowSec) ? 1 : 0),
      0
    ),
    [settlementProductions, nowSec]
  );

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

          {settlementProductions.length ? (
            <View style={styles.catalogCard}>
              <View style={styles.catalogHeaderRow}>
                <Text style={styles.catalogTitle}>
                  Виробництва{readyCount ? ` · готово ${readyCount}` : ''}
                </Text>
              </View>
              <View style={[styles.prodRow, styles.prodHeadRow]}>
                <Text style={[styles.prodCell, styles.prodColName, styles.prodHead]}>Споруда</Text>
                <Text style={[styles.prodCell, styles.prodColGoods, styles.prodHead]}>Продукт</Text>
                <Text style={[styles.prodCell, styles.prodColLeft, styles.prodHead]}>Залишилось</Text>
              </View>
              {settlementProductions.map((row) => {
                const isReady = row.ready || (row.readyAt && row.readyAt <= nowSec);
                const left = isReady
                  ? 'готово'
                  : formatLeft(row.readyAt, nowSec) || stateNote(row.state);
                const entries = goodsEntries(row.product);
                return (
                  <View key={row.instanceId} style={styles.prodRow}>
                    <View style={[styles.prodCell, styles.prodColName]}>
                      <Text style={styles.prodName} numberOfLines={1}>{row.name}</Text>
                      <Text style={styles.prodType}>{TYPE_LABELS[row.type] || row.type}</Text>
                    </View>
                    <View style={[styles.prodCell, styles.prodColGoods, styles.prodGoodsWrap]}>
                      {entries.length ? (
                        entries.map(([key, amount]) => {
                          const names = iconNames(key);
                          const url = directIconUrl(settlementIconUrls, key);
                          const hasFrame = !url && names.some((n) => !!findFrame(iconSheets, n));
                          const hasIcon = !!url || hasFrame;
                          return (
                            <View key={key} style={styles.prodGoodItem}>
                              {url ? (
                                <Image
                                  source={{ uri: url }}
                                  style={styles.prodGoodIcon}
                                  resizeMode="contain"
                                />
                              ) : hasFrame ? (
                                <FoeIcon sheet={iconSheets} name={names} size={15} />
                              ) : null}
                              <Text style={styles.prodGoods} numberOfLines={1}>
                                {hasIcon ? ` ${amount}` : `${amount} ${resLabel(key)}`}
                              </Text>
                            </View>
                          );
                        })
                      ) : (
                        <Text style={styles.prodGoods} numberOfLines={1}>
                          {row.productName || '—'}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.prodCell,
                        styles.prodColLeft,
                        styles.prodLeft,
                        isReady && styles.prodLeftReady,
                      ]}
                      numberOfLines={1}
                    >
                      {left}
                    </Text>
                  </View>
                );
              })}
              <Text style={styles.catalogHint}>
                Час рахується від останньої синхронізації з грою.
              </Text>
            </View>
          ) : settlementBuildings.length ? (
            <Text style={styles.sectorStats}>
              Активних виробництв не знайдено{settlementDefsProgress ? ` (${settlementDefsProgress})` : ''}.
            </Text>
          ) : null}
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
  catalogCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  catalogHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  catalogTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  catalogProgress: {
    color: COLORS.accent,
    fontSize: 11,
  },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(54,81,106,0.4)',
  },
  catalogRowMain: {
    flex: 1,
    paddingRight: 10,
  },
  catalogName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  catalogNameDim: {
    color: '#9fb4c8',
    fontWeight: '500',
  },
  catalogMeta: {
    color: '#9fb4c8',
    fontSize: 11,
    marginTop: 1,
  },
  catalogCount: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  catalogBadge: {
    color: COLORS.accent,
    fontSize: 11,
  },
  catalogHint: {
    color: '#9fb4c8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(54,81,106,0.4)',
  },
  prodHeadRow: {
    borderTopWidth: 0,
    paddingVertical: 4,
  },
  prodCell: {
    paddingRight: 8,
  },
  prodColName: { flex: 1.3 },
  prodColGoods: { flex: 1.4 },
  prodColLeft: { flex: 1, paddingRight: 0, textAlign: 'right' },
  prodHead: {
    color: '#9fb4c8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prodName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  prodType: {
    color: '#9fb4c8',
    fontSize: 10,
    marginTop: 1,
  },
  prodGoodsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  prodGoodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginVertical: 1,
  },
  prodGoodIcon: {
    width: 15,
    height: 15,
  },
  prodGoods: {
    color: COLORS.textPrimary,
    fontSize: 12,
  },
  prodLeft: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  prodLeftReady: {
    color: '#3ddc84',
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
