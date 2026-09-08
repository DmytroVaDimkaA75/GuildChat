// components/Culture/SettlementProductions.js
//
// Таблиця виробництв поселення — «Споруда · Продукт · Залишилось», з іконками
// товарів від самої гри. Винесена сюди, щоб екран автоматичного входу і старий
// екран «Культурні поселення» показували ОДНЕ І ТЕ САМЕ, а не розходились.
import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import FoeIcon, { findFrame } from '../FoeSync/FoeIcon';
import { formatRawEntity } from '../FoeSync/rawEntity';

export const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  border: '#36516a',
  textPrimary: '#f4f7fb',
  accent: '#4ea1ff',
};

// Короткі назви ресурсів поселень (для колонки «Продукт»). Ключ, якого тут
// немає, показуємо як є, прибравши префікс поселення (pirate_rum -> rum).
// ПІДТВЕРДЖЕНО ГРОЮ: склад кожного поселення взято з відповіді
// OutpostService.getAll (поля primaryResourceId — валюта, goodsResourceIds —
// чотири товари). Нічого не вгадано. Ті самі id є іменами кадрів у листі
// icons_0, тож за ними ж знаходяться й іконки.
export const RES_LABELS = {
  // Пірати · валюта doubloons
  doubloons: 'дублони',
  pirate_fish: 'риба', pirate_spice: 'спеції', pirate_rum: 'ром', pirate_cannons: 'гармати',
  // Полінезія · валюта shells
  shells: 'мушлі',
  fresh_fish: 'свіжа риба', coconuts: 'кокоси', kava: 'кава', catamarans: 'катамарани',
  // Імперія Моголів · валюта rupees
  rupees: 'рупії',
  basmati: 'басматі', saree: 'сарі', spices: 'прянощі', lotus: 'лотос',
  // Ацтеки · валюта cocoa_beans
  cocoa_beans: 'какао-боби',
  vegetables: 'овочі', headdress: 'головні убори', maize: 'кукурудза',
  stone_figures: 'камʼяні фігури',
  // Древній Єгипет · валюта deben
  deben: 'дебен',
  barley: 'ячмінь', pottery: 'кераміка', flowers: 'квіти',
  sacrificial_offerings: 'жертовні дари',
  // Феодальна Японія · валюта koban_coins
  koban_coins: 'кобан',
  soy: 'соя', paintings: 'картини', armor: 'обладунки', instruments: 'інструменти',
  // Вікінги · валюта copper_coins
  copper_coins: 'мідні монети',
  axes: 'сокири', mead: 'медовуха', horns: 'роги', wool: 'вовна',
};

export function resLabel(key) {
  return RES_LABELS[key] || String(key || '').replace(/^[a-z]+_/, '');
}

// Гра називає той самий товар по-різному в різних місцях (в id ресурсу — одне,
// в імені файлу іконки — інше). Відомі пари тримаємо тут.
const ICON_KEY_ALIASES = {
  deben: 'egyptians_loot',
  egyptians_loot: 'deben',
};

// Для цих восьми товарів (Єгипет і Полінезія) кадр у листі називається
// `fine_<id>`, а не `<id>`. Звірено з foe-helfer-extension, який робить рівно
// такий самий виняток саме для цього переліку — тож пробуємо їх першими.
const FINE_PREFIX_ICONS = new Set([
  'barley', 'pottery', 'flowers', 'sacrificial_offerings',
  'fresh_fish', 'coconuts', 'kava', 'catamarans',
]);

// Варіанти імені кадру ресурсу в спрайт-листах гри. Порядок = пріоритет.
// `fine_<id>` і `<id>_1` — реальні шаблони імен файлів гри (видно в шляхах
// assets/shared/icons/goods_100x100/fine_<id>.png і
// assets/city/gui/production_icons/<id>_<n>.png).
export function iconNames(key) {
  const id = String(key || '');
  const bare = id.replace(/^[a-z]+_/, '');
  const alias = ICON_KEY_ALIASES[id] || ICON_KEY_ALIASES[bare];
  const names = FINE_PREFIX_ICONS.has(id)
    ? [`fine_${id}`, id, `${id}_1`, `icon_${id}`, `${id}_icon`]
    : [
      id, `fine_${id}`, `${id}_1`,
      `icon_${id}`, `${id}_icon`, `good_${id}`, `resource_${id}`,
      bare, `fine_${bare}`, `${bare}_1`,
    ];
  if (alias) names.push(alias, `fine_${alias}`, `${alias}_1`);
  return names.filter((n, i) => n && names.indexOf(n) === i);
}

// Пряме посилання на PNG-іконку ресурсу (гра вантажить їх поштучно, лише
// коли реально показує на екрані — тож часто цього посилання ще немає).
export function directIconUrl(iconUrls, key) {
  if (!iconUrls) return null;
  for (const candidate of iconNames(key)) {
    if (iconUrls[candidate]) return iconUrls[candidate];
  }
  return null;
}

export function goodsEntries(det) {
  return Object.entries(det || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => b[1] - a[1]);
}

export function formatGoods(det) {
  const entries = goodsEntries(det);
  if (!entries.length) return null;
  return entries.map(([key, value]) => `${value} ${resLabel(key)}`).join(', ');
}

// Пояснення стану, коли часу завершення нема (виробництво не йде).
export function stateNote(st) {
  const s = String(st || '');
  if (/Idle/i.test(s)) return 'не запущено';
  if (/Construction/i.test(s)) return 'будується';
  if (/Unconnected/i.test(s)) return 'немає дороги';
  return '—';
}

// Час, що лишився до завершення виробництва.
export function formatLeft(readyAt, nowSec) {
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
export const TYPE_LABELS = {
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

export function isRowReady(row, nowSec) {
  return !!(row.ready || (row.readyAt && row.readyAt <= nowSec));
}

export default function SettlementProductions({
  productions = [],
  buildings = [],
  nowSec,
  iconSheets = [],
  iconUrls = {},
  defsProgress = null,
  hasBuildings = false,
}) {
  // Тап по рядку — технічні дані тієї споруди. Особливі споруди (наприклад
  // Чорний ринок) стоять поза сіткою міста, на мапі їх не тапнути — а тут вони
  // є, тож саме звідси до них і дістаємось.
  const [detailId, setDetailId] = useState(null);
  const detail = detailId
    ? buildings.find((item) => String(item?.instanceId) === String(detailId))
      || productions.find((row) => String(row.instanceId) === String(detailId))
      || null
    : null;

  if (!productions.length) {
    return hasBuildings ? (
      <Text style={styles.sectorStats}>
        Активних виробництв не знайдено{defsProgress ? ` (${defsProgress})` : ''}.
      </Text>
    ) : null;
  }
  const readyCount = productions.filter((row) => isRowReady(row, nowSec)).length;
  return (
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
      {productions.map((row) => {
        const isReady = isRowReady(row, nowSec);
        const left = isReady ? 'готово' : formatLeft(row.readyAt, nowSec) || stateNote(row.state);
        const entries = goodsEntries(row.product);
        return (
          <TouchableOpacity
            key={row.instanceId}
            style={styles.prodRow}
            activeOpacity={0.7}
            onPress={() => setDetailId(row.instanceId)}
            accessibilityRole="button"
            accessibilityLabel={`Технічні дані: ${row.name}`}
          >
            <View style={[styles.prodCell, styles.prodColName]}>
              <Text style={styles.prodName} numberOfLines={1}>{row.name}</Text>
              <Text style={styles.prodType}>{TYPE_LABELS[row.type] || row.type}</Text>
            </View>
            <View style={[styles.prodCell, styles.prodColGoods, styles.prodGoodsWrap]}>
              {entries.length ? (
                entries.map(([key, amount]) => {
                  // Ім'я кадру від самої гри (asset_name) пробуємо першим —
                  // воно точне; далі загальні варіанти.
                  const names = row.productAsset
                    ? [row.productAsset, ...iconNames(key)]
                    : iconNames(key);
                  const url = directIconUrl(iconUrls, key);
                  const hasFrame = !url && names.some((n) => !!findFrame(iconSheets, n));
                  const hasIcon = !!url || hasFrame;
                  return (
                    <View key={key} style={styles.prodGoodItem}>
                      {url ? (
                        <Image source={{ uri: url }} style={styles.prodGoodIcon} resizeMode="contain" />
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
          </TouchableOpacity>
        );
      })}
      <Text style={styles.catalogHint}>
        Торкніться рядка — технічні дані споруди. Час рахується від останньої
        синхронізації з грою.
      </Text>

      <Modal
        visible={!!detail}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailId(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDetailId(null)} accessible={false}>
          <Pressable style={styles.popup} onPress={() => {}} accessible={false} accessibilityViewIsModal>
            {detail ? (
              <>
                <View style={styles.popupHeader}>
                  <Text style={styles.popupTitle} numberOfLines={2}>
                    {detail.name || detail.cid || detail.entityId}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDetailId(null)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Закрити технічні дані"
                  >
                    <Text style={styles.popupClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.popupMeta}>
                  {TYPE_LABELS[detail.type] || detail.type || 'тип уточнюється'}
                  {detail.cid || detail.entityId ? ` · ${detail.cid || detail.entityId}` : ''}
                </Text>
                <ScrollView style={styles.popupScroll}>
                  <Text style={styles.rawText} selectable>
                    {formatRawEntity(detail, detail.definition || null)}
                  </Text>
                </ScrollView>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export const styles = StyleSheet.create({
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  popup: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  popupTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  popupClose: {
    color: COLORS.textPrimary,
    fontSize: 18,
    paddingHorizontal: 6,
  },
  popupMeta: {
    color: '#9fb4c8',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  popupScroll: {
    maxHeight: '100%',
  },
  rawText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'monospace',
  },
});
