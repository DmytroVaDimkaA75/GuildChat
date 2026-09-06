import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { DarkThemeColors as COLORS } from '../../constants/theme';
import FoeCityMap from '../FoeSync/FoeCityMap';
import { useFoeSync, useFoeSyncActive } from '../FoeSync/FoeSyncProvider';

const SETTLEMENTS = {
  vikings: { name: 'Вікінги', image: require('./Vikings.png') },
  japanese: { name: 'Феодальна Японія', image: require('./Japan.png') },
  egyptians: { name: 'Стародавній Єгипет', image: require('./Egypt.png') },
  aztecs: { name: 'Ацтеки', image: require('./Aztecs.png') },
  mughals: { name: 'Імперія Моголів', image: require('./Mughal.png') },
  polynesia: { name: 'Полінезія', image: require('./Polynesia.png') },
  pirates: { name: 'Піратське поселення', image: require('./Pirates.png') },
};

// Ті самі ідентифікатори ресурсів, що надходять у продукції поселення.
const RESOURCE_NAMES = {
  doubloons: 'дублони', pirate_fish: 'риба', pirate_spice: 'спеції',
  pirate_rum: 'ром', pirate_cannons: 'гармати', shells: 'мушлі',
  fresh_fish: 'свіжа риба', coconuts: 'кокоси', kava: 'кава', catamarans: 'катамарани',
  rupees: 'рупії', basmati: 'басматі', saree: 'сарі', spices: 'прянощі', lotus: 'лотос',
  cocoa_beans: 'какао-боби', vegetables: 'овочі', headdress: 'головні убори',
  maize: 'кукурудза', stone_figures: 'кам’яні фігури', deben: 'дебен',
  barley: 'ячмінь', pottery: 'кераміка', flowers: 'квіти',
  sacrificial_offerings: 'жертовні дари', koban_coins: 'кобан', soy: 'соя',
  paintings: 'картини', armor: 'обладунки', instruments: 'інструменти',
  copper_coins: 'мідні монети', axes: 'сокири', mead: 'медовуха', horns: 'роги', wool: 'вовна',
};

const ERROR_TEXT = {
  identity: 'Не вдалося визначити ваш світ. Перевірте вибрану гільдію та підключення до гри в розділі «Місто».',
  layout: 'Розмір екрана змінився під час завантаження. Оновіть дані, щоб повторити вхід у поселення.',
  timeout: 'Не вдалося отримати дані поселення. Перевірте з’єднання та спробуйте ще раз. Якщо сесія гри завершилася, увійдіть через «Місто».',
  load: 'Не вдалося завантажити гру. Перевірте з’єднання або увійдіть у свій світ через «Місто».',
  unsupported: 'Автоматичний вхід недоступний у цій збірці. Відкрийте «Місто», щоб перевірити підключення до гри.',
};

function resourceEntries(product) {
  return Object.entries(product || {}).filter(([, amount]) => (
    Number.isFinite(Number(amount)) && Number(amount) > 0
  ));
}

function formatResources(product) {
  return resourceEntries(product)
    .map(([key, amount]) => `${Number(amount)} ${RESOURCE_NAMES[key] || key}`)
    .join(', ');
}

function productionTime(row, nowSec) {
  if (row.ready || (row.readyAt && row.readyAt <= nowSec)) return 'Готово до збору';
  if (!row.readyAt) {
    if (/Construction/i.test(row.state || '')) return 'Будується';
    if (/Unconnected/i.test(row.state || '')) return 'Немає дороги';
    return 'Виробництво не запущено';
  }
  const minutes = Math.ceil((row.readyAt - nowSec) / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `Залишилось ${days} дн ${hours} год`;
  if (hours) return `Залишилось ${hours} год ${minutes % 60} хв`;
  return `Залишилось ${minutes} хв`;
}

export default function CulturalSettlementSync() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const {
    consent,
    packetSettlement = {},
    startPacketSettlementSync,
    cancelPacketSettlementSync,
    found = {},
    settlementDefs,
    settlementBuildings = [],
    settlementProductions = [],
  } = useFoeSync();
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const { phase = 'idle', settlementId, error } = packetSettlement;
  const busy = consent === 'yes' && ['idle', 'loading', 'opening'].includes(phase);
  const settlement = SETTLEMENTS[settlementId];
  const map = phase === 'ready' && found.settlementMap?.gridId === 'cultural_outpost'
    ? found.settlementMap : null;
  const rows = map ? settlementProductions : [];

  useFoeSyncActive(isFocused && consent === 'yes');

  useEffect(() => {
    if (!isFocused || consent !== 'yes') return undefined;
    startPacketSettlementSync();
    return () => cancelPacketSettlementSync();
  }, [isFocused, consent, startPacketSettlementSync, cancelPacketSettlementSync]);

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
    navigation.setOptions({
      title: settlement?.name || 'Культурні поселення',
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerAction}
          onPress={refresh}
          disabled={busy || consent !== 'yes'}
          accessibilityRole="button"
          accessibilityLabel="Оновити дані поселення"
          accessibilityState={{ disabled: busy || consent !== 'yes', busy }}
        >
          {busy ? <ActivityIndicator color={COLORS.primary} /> : (
            <Ionicons
              name="refresh"
              size={24}
              color={consent === 'yes' ? COLORS.text : COLORS.textSecondary}
            />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, settlement?.name, refresh, busy, consent]);

  const readyResources = useMemo(() => {
    const totals = {};
    if (!map) return totals;
    settlementProductions.forEach((row) => {
      if (!row.ready && !(row.readyAt && row.readyAt <= nowSec)) return;
      resourceEntries(row.product).forEach(([key, amount]) => {
        totals[key] = (totals[key] || 0) + Number(amount);
      });
    });
    return totals;
  }, [map, settlementProductions, nowSec]);

  const openCity = () => navigation.navigate('FoeSync', { screen: 'FoeSyncScreen' });

  const header = (
    <>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          {settlement ? <Image source={settlement.image} style={styles.image} /> : (
            <Ionicons name="compass-outline" size={36} color={COLORS.primarySoft} />
          )}
          <Text style={styles.title}>{settlement?.name || 'Культурні поселення'}</Text>
        </View>
        {consent == null ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.body}>Підготовка…</Text>
          </View>
        ) : consent !== 'yes' ? (
          <>
            <Text style={styles.body}>Увімкніть синхронізацію з грою в розділі «Місто», щоб отримувати дані свого поселення.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={openCity} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Відкрити «Місто»</Text>
            </TouchableOpacity>
          </>
        ) : busy ? (
          <View style={styles.loadingRow} accessibilityLiveRegion="polite">
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.body}>Отримуємо дані поселення…</Text>
          </View>
        ) : phase === 'error' || phase === 'empty' ? (
          <>
            <Text style={styles.body} accessibilityLiveRegion="polite">
              {phase === 'empty'
                ? 'На мапі міста не знайдено активного культурного поселення. Перевірте його в грі та оновіть дані.'
                : ERROR_TEXT[error] || ERROR_TEXT.timeout}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={refresh}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.primaryButtonText}>Спробувати ще раз</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={openCity} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Відкрити «Місто»</Text>
            </TouchableOpacity>
          </>
        ) : map ? (
          <Text style={styles.body}>Дані отримано з гри. Оновіть їх після змін у поселенні.</Text>
        ) : null}
      </View>

      {map ? (
        <>
          <View style={styles.mapCard}>
            <FoeCityMap
              cityMap={map}
              defs={settlementDefs}
              buildings={settlementBuildings.length ? settlementBuildings : undefined}
              horizontalInset={46}
            />
          </View>
          {resourceEntries(readyResources).length ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Готово до збору</Text>
              <Text style={styles.body}>{formatResources(readyResources)}</Text>
            </View>
          ) : null}
          <Text style={styles.sectionHeading}>Виробництва · {rows.length}</Text>
          {!rows.length ? (
            <View style={styles.card}>
              <Text style={styles.body}>У отриманих даних немає активних виробництв.</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}
      data={rows}
      keyExtractor={(row) => String(row.instanceId)}
      extraData={nowSec}
      ListHeaderComponent={header}
      ListFooterComponent={(
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('CulturalSettlements')}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Попередній екран</Text>
        </TouchableOpacity>
      )}
      renderItem={({ item }) => {
        const ready = item.ready || (item.readyAt && item.readyAt <= nowSec);
        return (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{item.name || item.cid}</Text>
            <Text style={styles.body}>
              {formatResources(item.product) || item.productName || 'Продукт не вказано'}
            </Text>
            <Text style={[styles.productionTime, ready && styles.ready]}>{productionTime(item, nowSec)}</Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  card: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1,
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  mapCard: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1,
    borderRadius: 16, padding: 6, marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  image: { width: 46, height: 46, resizeMode: 'contain' },
  title: { flex: 1, color: COLORS.text, fontSize: 20, fontWeight: '700' },
  body: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sectionHeading: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productionTime: { color: COLORS.primarySoft, fontSize: 13, marginTop: 8 },
  ready: { color: COLORS.success },
  primaryButton: {
    backgroundColor: COLORS.primary, minHeight: 46, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  primaryButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  secondaryButton: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  secondaryButtonText: { color: COLORS.primarySoft, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  headerAction: { minWidth: 44, minHeight: 44, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
});
