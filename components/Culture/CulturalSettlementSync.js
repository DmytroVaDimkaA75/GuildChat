import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import FoeCityMap from '../FoeSync/FoeCityMap';
import { useFoeSync, useFoeSyncActive } from '../FoeSync/FoeSyncProvider';
import { describePacketSettlement, isSettlementGrid } from '../FoeSync/settlementPacketSession';
import SettlementProductions, {
  COLORS,
  goodsEntries,
  isRowReady,
  resLabel,
} from './SettlementProductions';

const SETTLEMENTS = {
  vikings: { name: 'Вікінги', image: require('./Vikings.png') },
  japanese: { name: 'Феодальна Японія', image: require('./Japan.png') },
  egyptians: { name: 'Стародавній Єгипет', image: require('./Egypt.png') },
  aztecs: { name: 'Ацтеки', image: require('./Aztecs.png') },
  mughals: { name: 'Імперія Моголів', image: require('./Mughal.png') },
  polynesia: { name: 'Полінезія', image: require('./Polynesia.png') },
  pirates: { name: 'Піратське поселення', image: require('./Pirates.png') },
};

const ERROR_TEXT = {
  identity: 'Не вдалося визначити ваш світ. Перевірте вибрану гільдію та підключення до гри в розділі «Місто».',
  layout: 'Розмір екрана змінився під час завантаження. Оновіть дані, щоб повторити вхід у поселення.',
  timeout: 'Не вдалося отримати дані поселення. Перевірте з’єднання та спробуйте ще раз. Якщо сесія гри завершилася, увійдіть через «Місто».',
  load: 'Не вдалося завантажити гру. Перевірте з’єднання або увійдіть у свій світ через «Місто».',
  unsupported: 'Автоматичний вхід недоступний у цій збірці. Відкрийте «Місто», щоб перевірити підключення до гри.',
  cancelled: 'Вхід у поселення скасовано.',
};

export default function CulturalSettlementSync() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const {
    consent,
    packetSettlement = {},
    packetAttempt = 1,
    packetMaxAttempts = 1,
    startPacketSettlementSync,
    cancelPacketSettlementSync,
    found = {},
    settlementDefs,
    settlementDefsProgress,
    settlementBuildings = [],
    settlementProductions = [],
    settlementSheets = [],
    settlementIconUrls = {},
    iconSheet = null,
    goodsSheet = null,
    aimCalib,
  } = useFoeSync();
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const { phase = 'idle', settlementId, error } = packetSettlement;
  const busy = consent === 'yes' && ['idle', 'loading', 'opening', 'aiming'].includes(phase);
  const settlement = SETTLEMENTS[settlementId];
  const map = phase === 'ready' && isSettlementGrid(found.settlementMap?.gridId)
    ? found.settlementMap : null;
  const rows = map ? settlementProductions : [];
  // Вхід завершився, а мапи немає: її міг прибрати інший екран, що почав свою
  // синхронізацію у тому самому (єдиному) вікні гри. Це не помилка — просто
  // треба оновити.
  const stale = phase === 'ready' && !map;
  const progressText = [
    packetAttempt > 1 ? `Спроба ${packetAttempt} з ${packetMaxAttempts}.` : null,
    settlement ? `${settlement.name}.` : null,
    describePacketSettlement(packetSettlement),
  ].filter(Boolean).join(' ');

  // Усі доступні спрайт-листи — спершу поселенські, далі загальні.
  const iconSheets = useMemo(
    () => [...(settlementSheets || []), goodsSheet, iconSheet].filter(Boolean),
    [settlementSheets, goodsSheet, iconSheet]
  );

  useFoeSyncActive(isFocused && consent === 'yes');

  // Вхід у поселення — це перезавантаження гри, пошук корабля і жести, до 75 с.
  // Тому запускаємо його ОДИН раз за відкриття екрана, а не на кожне повернення
  // фокуса: далі дані оновлює кнопка у шапці.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!isFocused || consent !== 'yes' || startedRef.current) return;
    startedRef.current = true;
    startPacketSettlementSync();
  }, [isFocused, consent, startPacketSettlementSync]);

  // Перехід на сусідній екран не вбиває процедуру, що вже йде — інакше
  // зазирнув у чат і чекай ці 75 секунд заново. Скасовуємо лише при закритті.
  useEffect(() => () => cancelPacketSettlementSync(), [cancelPacketSettlementSync]);

  useEffect(() => {
    if (!isFocused) return undefined;
    setNowSec(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30000);
    return () => clearInterval(timer);
  }, [isFocused]);

  const refresh = useCallback(() => {
    if (busy || !isFocused || consent !== 'yes') return;
    setNowSec(Math.floor(Date.now() / 1000));
    startPacketSettlementSync();
  }, [busy, isFocused, consent, startPacketSettlementSync]);

  useLayoutEffect(() => {
    const options = {
      title: settlement?.name || 'Культурні поселення',
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerRefresh}
          onPress={refresh}
          disabled={busy || consent !== 'yes'}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Оновити дані поселення"
          accessibilityState={{ disabled: busy || consent !== 'yes', busy }}
        >
          {busy ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : (
            <Ionicons
              name="refresh"
              size={24}
              color={consent === 'yes' ? COLORS.textPrimary : '#9fb4c8'}
            />
          )}
        </TouchableOpacity>
      ),
    };
    // Іконка поселення в хедері — як на попередньому екрані.
    if (settlement) {
      options.headerTitle = () => (
        <View style={styles.headerTitle}>
          <Image source={settlement.image} style={styles.headerIcon} />
          <Text style={styles.headerText}>{settlement.name}</Text>
        </View>
      );
    }
    navigation.setOptions(options);
  }, [navigation, settlement, refresh, busy, consent]);

  // Скільки всього готово до збору — одним рядком під мапою.
  const readyGoods = useMemo(() => {
    const totals = {};
    if (!map) return totals;
    settlementProductions.forEach((row) => {
      if (!isRowReady(row, nowSec)) return;
      goodsEntries(row.product).forEach(([key, amount]) => {
        totals[key] = (totals[key] || 0) + Number(amount);
      });
    });
    return totals;
  }, [map, settlementProductions, nowSec]);

  // Карта — найважчий елемент екрана (сотні клітинок). Тримаємо її окремим
  // запам'ятованим блоком, щоб щохвилинний таймер зворотного відліку оновлював
  // лише рядки виробництв, а не перемальовував усю мапу.
  const mapBlock = useMemo(() => (map ? (
    <View style={styles.mapCard}>
      <FoeCityMap
        cityMap={map}
        defs={settlementDefs}
        buildings={settlementBuildings.length ? settlementBuildings : undefined}
        horizontalInset={46}
      />
    </View>
  ) : null), [map, settlementDefs, settlementBuildings]);

  // ТИМЧАСОВО: числа, записані ручним наведенням. Їх треба перенести у
  // DEFAULT_SHIP_CALIB (settlementPacketSession.js), щоб вони стали заводськими
  // для всіх, а не лише збереженими на цьому телефоні.
  const calibText = aimCalib
    ? ['canvasX', 'canvasY', 'canvasW', 'canvasH', 'scrollDx', 'scrollDy']
      .map((key) => `${key}: ${Math.round(Number(aimCalib[key]))}`)
      .join(', ')
    : null;

  const openCity = () => navigation.navigate('FoeSync', { screen: 'FoeSyncScreen' });
  const readyEntries = goodsEntries(readyGoods);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}
    >
      {map ? (
        <>
          {mapBlock}
          {readyEntries.length ? (
            <Text style={styles.sectorStats}>
              Готово до збору: {readyEntries.map(([k, v]) => `${v} ${resLabel(k)}`).join(', ')}
            </Text>
          ) : null}
          <SettlementProductions
            productions={rows}
            buildings={settlementBuildings}
            nowSec={nowSec}
            iconSheets={iconSheets}
            iconUrls={settlementIconUrls}
            defsProgress={settlementDefsProgress}
            hasBuildings={settlementBuildings.length > 0}
          />
        </>
      ) : consent == null ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.loadingText}>Підготовка…</Text>
        </View>
      ) : consent !== 'yes' ? (
        <>
          <View style={styles.titleRow}>
            <Ionicons name="compass-outline" size={36} color={COLORS.accent} />
            <Text style={styles.title}>Культурні поселення</Text>
          </View>
          <Text style={styles.note}>
            Увімкніть синхронізацію з грою в розділі «Місто», щоб отримувати дані свого поселення.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={openCity} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Відкрити «Місто»</Text>
          </TouchableOpacity>
        </>
      ) : busy ? (
        <View style={styles.loadingRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.loadingText}>{progressText}</Text>
        </View>
      ) : phase === 'error' || phase === 'empty' || stale ? (
        <>
          {settlement ? (
            <View style={styles.titleRow}>
              <Image source={settlement.image} style={styles.image} />
              <Text style={styles.title}>{settlement.name}</Text>
            </View>
          ) : null}
          <Text style={styles.note} accessibilityLiveRegion="polite">
            {stale
              ? 'Дані поселення більше не збережені — їх очистив інший екран, що звертався до гри. Оновіть, щоб отримати їх знову.'
              : phase === 'empty'
                ? 'На мапі міста не знайдено активного культурного поселення. Перевірте його в грі та оновіть дані.'
                : ERROR_TEXT[error] || ERROR_TEXT.load}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={refresh}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Спробувати ще раз</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={openCity} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>Відкрити «Місто»</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {calibText ? (
        <View style={styles.catalogCard}>
          <Text style={styles.catalogTitle}>Записана калібровка входу</Text>
          <Text style={styles.calib} selectable>{calibText}</Text>
          <Text style={styles.catalogHint}>
            Ці числа вже діють на цьому телефоні. Перекажіть їх розробнику, щоб
            вони стали заводськими для всіх.
          </Text>
        </View>
      ) : null}

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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  image: { width: 46, height: 46, resizeMode: 'contain' },
  title: { flex: 1, color: COLORS.textPrimary, fontSize: 20, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  note: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  catalogCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  catalogTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  catalogHint: { color: '#9fb4c8', fontSize: 11, lineHeight: 16, marginTop: 8 },
  calib: { color: COLORS.textPrimary, fontSize: 12, fontFamily: 'monospace' },
  retryButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: COLORS.accent,
  },
  retryButtonText: { color: '#0f1115', fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
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
    marginTop: 16,
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
