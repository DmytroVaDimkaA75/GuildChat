// components/Culture/SettlementDiag.js
//
// ТИМЧАСОВИЙ екран. Збирає сирі відповіді гри, що стосуються культурних
// поселень (карта / квести / ресурси), і дає скопіювати їх у буфер, щоб
// передати розробнику. Після того, як формат даних зрозумілий, екран і
// пов'язаний із ним код прибираються.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { DarkThemeColors as C } from '../../constants/theme';
import { useFoeSync, useFoeSyncActive } from '../FoeSync/FoeSyncProvider';

const AUTO_STEP_LABELS = {
  start: 'старт',
  click_ship: 'клікаю по кораблю…',
  retry_click: 'клікаю ще раз…',
  entered: 'увійшли в поселення ✓ (підтверджено відповіддю; можна закривати гру)',
  target: 'ціль визначена',
  wrong_grid: 'клік потрапив не туди',
  enter_failed: 'вхід НЕ підтверджено (клік не спрацював?)',
  panning: 'відтворюю скрол до корабля…',
  pan_done: 'нативний скрол завершено ✓',
  native_pan_failed: 'нативний скрол не виконано',
  pan_target: 'ціль скролу визначена',
  probe_click: 'клік на нерухомій точці — дивись на екран',
  error: 'помилка скрипта',
  autoaim_start: 'авто-наведення: рахую координати…',
  autoaim_missing_data: 'авто-наведення: немає даних (потрібна мапа міста з кораблем і ратушею)',
  autoaim_unsupported: 'авто-наведення: недоступне на цьому пристрої',
  autoaim_no_canvas: 'авто-наведення: не бачу canvas гри',
  autoaim_panning: 'авто-наведення: прогортаю за формулою…',
  interaction_wait: 'чекаю, поки сцена гри стане інтерактивною…',
  interaction_ready: 'сцена гри готова ✓',
  interaction_not_ready: 'сцена гри не стала інтерактивною',
  watch_armed: 'чекаю відповідь мапи…',
  touch_started: 'нативний дотик доставлено у гру…',
  request_sent: 'запит мапи відправлено…',
  no_request: 'клієнт не створив запит входу',
  request_no_response: 'запит пішов, але відповідь не надійшла',
  native_tap_failed: 'нативний клік не виконано',
};

function ts(t) {
  try {
    const d = new Date(Number(t));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch (_e) {
    return '';
  }
}

export default function SettlementDiag() {
  // Поки екран відкритий — приховане вікно гри працює й ловить пакети.
  useFoeSyncActive();
  const foe = useFoeSync() || {};
  const {
    rawLog = [],
    seen,
    found = {},
    consent,
    pinGameWindow,
    unpinGameWindow,
    webPinned,
    calibPoints = {},
    resetCalibration,
    autoEnterLog = [],
    health = { packets: 0 },
    debugScrollAndReveal,
    stealthEntering,
  } = foe;

  const [copied, setCopied] = useState('');
  const [openSeq, setOpenSeq] = useState(null);

  // Закриваємо закріплене вікно гри, коли йдемо з екрана.
  useEffect(() => () => unpinGameWindow?.(), [unpinGameWindow]);

  const seenList = useMemo(() => {
    const arr = seen instanceof Set ? Array.from(seen) : Array.isArray(seen) ? seen : [];
    return Array.from(new Set(arr)).sort();
  }, [seen]);

  const foundKeys = useMemo(() => Object.keys(found || {}).sort(), [found]);

  // Дамп спрайт-листів / іконок ресурсів — щоб знайти лист іконок товарів.
  const iconDump = useMemo(() => {
    const lines = [];
    const sheets = foe.settlementSheets || [];
    lines.push(`settlementSheets: ${sheets.length}`);
    for (const s of sheets) {
      const keys = Object.keys(s.frames || {});
      lines.push(`  [${s.base}] ${keys.length} кадрів: ${keys.slice(0, 60).join(', ')}`);
    }
    const iu = foe.settlementIconUrls || {};
    lines.push('', `iconUrls: ${Object.keys(iu).length}`);
    for (const k of Object.keys(iu)) lines.push(`  ${k} = ${iu[k]}`);
    const assets = found.assetUrls || [];
    lines.push('', `assetUrls: ${assets.length}`);
    for (const a of assets) lines.push(`  ${a}`);
    return lines.join('\n');
  }, [foe.settlementSheets, foe.settlementIconUrls, found.assetUrls]);
  const jsEnvTags = useMemo(() => Object.keys(found.jsEnv || {}).sort(), [found.jsEnv]);

  // ТИМЧАСОВО: координати "корабля" й ратуші з уже захопленої мапи міста —
  // щоб вивести формулу переведення ігрових координат у пікселі екрана і
  // прибрати ручний тап (див. розмову про автонаведення без калібрування).
  const autoAimEntities = useMemo(() => {
    const entities = found.cityMap?.entities || [];
    const ship = entities.find((e) => e.type === 'outpost_ship') || null;
    const townhall = entities.find((e) => e.type === 'main_building') || null;
    return { ship, townhall };
  }, [found.cityMap]);
  const autoAimPayload = useMemo(
    () =>
      JSON.stringify(
        {
          shipWorld: autoAimEntities.ship
            ? { x: autoAimEntities.ship.x, y: autoAimEntities.ship.y, cid: autoAimEntities.ship.cid }
            : null,
          townhallWorld: autoAimEntities.townhall
            ? { x: autoAimEntities.townhall.x, y: autoAimEntities.townhall.y }
            : null,
          shipCalib: calibPoints.ship || null,
          shipAfterAutoAim: calibPoints.shipAfterAutoAim || null,
        },
        null,
        2
      ),
    [autoAimEntities, calibPoints.ship, calibPoints.shipAfterAutoAim]
  );

  const copy = async (label, text) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch (_e) {
      setCopied('');
    }
  };

  const copyAll = () =>
    copy(
      'all',
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          packets: health.packets || 0,
          seen: seenList,
          foundKeys,
          calibPoints,
          jsEnv: found.jsEnv || null,
          rawLog,
        },
        null,
        2
      )
    );

  const syncEnabled = consent === 'yes';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Технічні дані поселення</Text>
        <Text style={styles.note}>
          Тимчасовий екран. «Відкрити гру» → поверх гри зʼявиться панель
          керування (калібрування / тест автовходу) — гра на весь екран, тож
          керуємо звідти, а не з цього екрана. Тут — лише результати: сирі
          пакети, координати, лог. «Скопіювати все» й надішли розробнику.
        </Text>

        {!syncEnabled ? (
          <View style={styles.warnRow}>
            <MaterialIcons name="info-outline" size={18} color={C.warning} />
            <Text style={styles.warnText}>
              Синхронізацію з грою не ввімкнено. Відкрий Профіль → «Синхронізація
              з грою» і надай згоду, потім повернися.
            </Text>
          </View>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            activeOpacity={0.85}
            onPress={() => (webPinned ? unpinGameWindow?.() : pinGameWindow?.())}
          >
            <MaterialIcons
              name={webPinned ? 'visibility-off' : 'sports-esports'}
              size={18}
              color="#fff"
            />
            <Text style={styles.btnPrimaryText}>
              {webPinned ? 'Сховати гру' : 'Відкрити гру'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            activeOpacity={0.85}
            onPress={copyAll}
          >
            <MaterialIcons name="content-copy" size={18} color={C.primary} />
            <Text style={styles.btnGhostText}>
              {copied === 'all' ? 'Скопійовано ✓' : 'Скопіювати все'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          «Відкрити гру» → зайди у поселення й поклацай. Вікно тепер не
          зникатиме саме — коли закінчиш, натисни «Сховати гру».
        </Text>

        <Text style={styles.stat}>
          Пакетів від гри: {health.packets || 0} · сирих записів: {rawLog.length}
          {rawLog.length >= 80 ? ' (буфер повний, старі витісняються)' : ''}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Калібрування кліків (автовхід у поселення)</Text>
        <Text style={styles.note}>
          Керування — кнопками «Корабель» / «Тест» у панелі, що зʼявляється
          ПОВЕРХ гри після «Відкрити гру» (бо гра на весь екран і кнопки
          цього екрана під нею недосяжні). Кнопку повернення в місто більше
          не калібруємо — заходимо в поселення останнім кроком і просто
          закриваємо гру. Тут — лише результат.
        </Text>

        {calibPoints.ship || calibPoints.probe || calibPoints.return ? (
          <>
            <Text style={styles.mono}>
              {calibPoints.ship
                ? `корабель: canvas ${calibPoints.ship.canvasX},${calibPoints.ship.canvasY} з ${calibPoints.ship.canvasW}×${calibPoints.ship.canvasH}` +
                  ` · скрол ${calibPoints.ship.scrollDx || 0},${calibPoints.ship.scrollDy || 0}`
                : 'корабель: ще не записано'}
              {calibPoints.probe
                ? `\nточка (без скролу): canvas ${calibPoints.probe.canvasX},${calibPoints.probe.canvasY} з ${calibPoints.probe.canvasW}×${calibPoints.probe.canvasH}`
                : ''}
              {calibPoints.return ? '\n(стара точка «повернення» — вже не потрібна)' : ''}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={() => copy('calib', JSON.stringify(calibPoints, null, 2))}
                style={styles.miniBtn}
                activeOpacity={0.7}
              >
                <MaterialIcons name="content-copy" size={14} color={C.primary} />
                <Text style={styles.miniBtnText}>
                  {copied === 'calib' ? 'Скопійовано ✓' : 'Копіювати координати'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => resetCalibration?.()}
                style={styles.miniBtn}
                activeOpacity={0.7}
              >
                <MaterialIcons name="delete-outline" size={14} color={C.danger} />
                <Text style={[styles.miniBtnText, { color: C.danger }]}>Скинути</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Debug: скрол + маркер (без кліку)</Text>
        <Text style={styles.note}>
          Тихо перезавантажує гру у фоні, прогортає записаними координатами
          («Корабель»), тоді сам відкриває гру видимою з яскравим маркером
          там, куди мав би клацнути — без самого кліку. Дивись, наскільки
          маркер збігається з кораблем, і скажи розробнику.
        </Text>
        <TouchableOpacity
          onPress={() => debugScrollAndReveal?.()}
          disabled={!calibPoints.ship || stealthEntering}
          style={[
            styles.btn,
            styles.btnPrimary,
            { marginTop: 8, opacity: !calibPoints.ship || stealthEntering ? 0.4 : 1 },
          ]}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {stealthEntering ? 'Виконується…' : 'Прогорнути й показати маркер'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Дані для авто-наведення (без ручного тапу)</Text>
        <Text style={styles.note}>
          Координати «корабля» й ратуші з мапи міста — гра вже надсилає їх сама,
          тап не потрібен. Разом зі старим калібруванням кліка це дає числа,
          щоб порахувати формулу переведення ігрових координат у скрол, і
          прибрати ручний тап зовсім. «Відкрити гру» хоч раз (щоб мапа міста
          завантажилась), тоді копіюй.
        </Text>
        <Text style={styles.mono}>
          {autoAimEntities.ship
            ? `корабель (гра): x=${autoAimEntities.ship.x}, y=${autoAimEntities.ship.y}, cid=${autoAimEntities.ship.cid}`
            : 'корабель: ще не в мапі міста — відкрий гру'}
          {'\n'}
          {autoAimEntities.townhall
            ? `ратуша (гра): x=${autoAimEntities.townhall.x}, y=${autoAimEntities.townhall.y}`
            : 'ратуша: ще не в мапі міста — відкрий гру'}
          {calibPoints.shipAfterAutoAim
            ? `\nкораблик після авто-наведення: canvas ${calibPoints.shipAfterAutoAim.canvasX},${calibPoints.shipAfterAutoAim.canvasY}` +
              ` · застосована прокрутка ${Math.round(calibPoints.shipAfterAutoAim.appliedDragX || 0)},${Math.round(calibPoints.shipAfterAutoAim.appliedDragY || 0)}`
            : ''}
        </Text>
        <TouchableOpacity
          onPress={() => copy('autoAim', autoAimPayload)}
          style={styles.miniBtn}
          activeOpacity={0.7}
          disabled={!autoAimEntities.ship && !autoAimEntities.townhall}
        >
          <MaterialIcons name="content-copy" size={14} color={C.primary} />
          <Text style={styles.miniBtnText}>
            {copied === 'autoAim' ? 'Скопійовано ✓' : 'Копіювати дані для авто-наведення'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Тест: автоматичний вхід (як робив Codex)</Text>
        <Text style={styles.note}>
          Скрипт сам клікає по збережених координатах і чекає підтвердження
          від гри (не за таймером — за реальною відповіддю сервера). Кнопка
          «Тест» — у панелі поверх гри. Тут — лише лог результату.
        </Text>
        {autoEnterLog.length ? (
          <Text style={styles.mono}>
            {autoEnterLog
              .map((e) => `${ts(e.at)} — ${AUTO_STEP_LABELS[e.step] || e.step}${e.n ? ` #${e.n}` : ''}${e.gridId ? ` (${e.gridId})` : ''}${e.target ? `: ${e.target}` : ''}`)
              .join('\n')}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>
            JS-середовище гри {jsEnvTags.length ? `(${jsEnvTags.join(', ')})` : '(збирається…)'}
          </Text>
          <TouchableOpacity
            onPress={() => copy('jsenv', JSON.stringify(found.jsEnv || {}, null, 1))}
            style={styles.miniBtn}
            activeOpacity={0.7}
            disabled={!jsEnvTags.length}
          >
            <MaterialIcons name="content-copy" size={14} color={C.primary} />
            <Text style={styles.miniBtnText}>
              {copied === 'jsenv' ? 'Скопійовано ✓' : 'Копіювати'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          Знімок функцій/обʼєктів вікна гри — потрібен, щоб знайти безпечний
          спосіб автоматично відкривати поселення. Збирається за 4 / 12 / 30 с
          після завантаження гри. Відкрий гру, зачекай пів хвилини, тоді копіюй.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Іконки ресурсів</Text>
          <TouchableOpacity
            onPress={() => copy('icons', iconDump)}
            style={styles.miniBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="content-copy" size={14} color={C.primary} />
            <Text style={styles.miniBtnText}>
              {copied === 'icons' ? 'Скопійовано ✓' : 'Копіювати'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          Зайди в поселення, зачекай, тоді (за можливості) відкрий будь-яку
          виробничу будівлю в грі й вибери рецепт — тоді копіюй. Так видно
          адресу листа з іконками товарів.
        </Text>
        <Text style={styles.mono} selectable>
          {iconDump}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Усі запити гри ({seenList.length})</Text>
          <TouchableOpacity
            onPress={() => copy('seen', seenList.join('\n'))}
            style={styles.miniBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="content-copy" size={14} color={C.primary} />
            <Text style={styles.miniBtnText}>
              {copied === 'seen' ? 'Скопійовано ✓' : 'Копіювати'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.mono}>
          {seenList.length ? seenList.join('\n') : '— поки порожньо —'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Сирі пакети ({rawLog.length})</Text>
        {rawLog.length === 0 ? (
          <Text style={styles.note}>
            Порожньо. Відкрий гру й зайди в поселення — пакети зʼявляться тут.
          </Text>
        ) : (
          rawLog.map((e) => {
            const rid = e._id != null ? e._id : `${e.key}-${e.seq}-${e.t}`;
            const open = openSeq === rid;
            return (
              <View key={rid} style={styles.entry}>
                <TouchableOpacity
                  style={styles.entryHead}
                  activeOpacity={0.7}
                  onPress={() => setOpenSeq(open ? null : rid)}
                >
                  <MaterialIcons
                    name={open ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={C.textSecondary}
                  />
                  <Text style={styles.entryKey} numberOfLines={1}>
                    {e.key}
                  </Text>
                  <Text style={styles.entryMeta}>
                    {ts(e.t)} · {(e.size / 1024).toFixed(1)} КБ
                  </Text>
                </TouchableOpacity>
                {open ? (
                  <>
                    <TouchableOpacity
                      onPress={() => copy(`e${rid}`, e.json)}
                      style={styles.miniBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="content-copy" size={14} color={C.primary} />
                      <Text style={styles.miniBtnText}>
                        {copied === `e${rid}` ? 'Скопійовано ✓' : 'Копіювати цей пакет'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.mono} selectable>
                      {e.json}
                    </Text>
                  </>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  content: { padding: 12, paddingBottom: 40 },
  card: {
    padding: 14,
    marginBottom: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  title: { color: C.text, fontSize: 17, fontWeight: '700' },
  note: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8 },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: `${C.warning}14`,
    borderWidth: 1,
    borderColor: `${C.warning}44`,
  },
  warnText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18, marginLeft: 8 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 8 },
  btnGhost: { borderWidth: 1, borderColor: C.primary, backgroundColor: `${C.primary}18` },
  btnGhostText: { color: C.primary, fontSize: 14, fontWeight: '700', marginLeft: 8 },
  stat: { color: C.textSecondary, fontSize: 12, marginTop: 12 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginVertical: 6,
    borderRadius: 8,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  miniBtnText: { color: C.primary, fontSize: 11, fontWeight: '700', marginLeft: 5 },
  mono: {
    color: C.textSecondary,
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 14,
  },
  entry: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.surfaceElevated,
    padding: 8,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center' },
  entryKey: { flex: 1, color: C.text, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  entryMeta: { color: C.textSecondary, fontSize: 10, marginLeft: 6 },
});
