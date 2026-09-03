import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { filterGbgBots } from '../../src/utils/guildBots';

const C = { bg: '#07111b', card: '#0d1925', soft: '#102235', border: '#2d3a48', line: '#263646', blue: '#2f87ff', text: '#f4f7fb', muted: '#a9b3c3' };
const INFO = 'Підтвердіть ваше бажання взяти участь в експрес-прокачці. Під час формування складу враховується коефіцієнт, який дає ваша Арка, а також черговість підтвердження. Якщо вас буде відібрано, ви отримаєте повідомлення за 10 хвилин до початку експресу.';
const formatTime = (v) => new Date(Number(v)).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const localize = (v, lang) => typeof v === 'object' ? v?.[lang] || v?.uk || v?.ua || v?.en || Object.values(v || {})[0] || '' : v || '';
const multiplier = (user) => {
  const level = Math.max(0, Number(user?.greatBuild?.['X_FutureEra_Landmark1']?.level) || 0);
  if (!level) return 1;
  if (level <= 10) return 1 + [10, 12, 14, 17, 19, 22, 24, 26, 29, 31][level - 1] / 100;
  if (level <= 58) return 1 + (level + 21) / 100;
  if (level <= 80) return 1.79 + (level - 58) * .005;
  return 1.9 + Math.min(level - 80, 100) * .001;
};
const normalize = (root) => {
  const groups = []; const legacy = new Map();
  Object.entries(root || {}).forEach(([id, value]) => {
    if (value?.gbs) groups.push({ id, ...value });
    else if (value?.allowedGB && value?.scheduleTime) {
      const key = String(value.scheduleTime);
      if (!legacy.has(key)) legacy.set(key, { id: `legacy_${key}`, scheduleTime: value.scheduleTime, gbs: {}, interested: {} });
      legacy.get(key).gbs[id] = { id, ...value };
      Object.entries(value.allowedUsers || {}).forEach(([uid, allowed]) => { if (allowed) legacy.get(key).interested[uid] = typeof allowed === 'object' ? allowed : {}; });
    }
  });
  return groups.concat([...legacy.values()]).sort((a, b) => Number(a.scheduleTime) - Number(b.scheduleTime));
};

const SelectionModal = ({ state, selected, setSelected, close, submit }) => <Modal transparent visible={Boolean(state)} animationType="fade" onRequestClose={close}>
  <Pressable style={s.overlay} onPress={close}><Pressable style={s.modal} onPress={() => {}}>
    <Text style={s.modalTitle}>{state?.kind === 'postpone' ? 'ВС для відтермінування' : 'Оберіть ВС для скасування'}</Text>
    <ScrollView style={s.choiceScroll}>{(state?.items || []).map((item) => <TouchableOpacity key={item.id} style={s.choice} onPress={() => setSelected((old) => old.includes(item.id) ? old.filter((id) => id !== item.id) : [...old, item.id])}>
      <Ionicons name={selected.includes(item.id) ? 'checkbox' : 'square-outline'} size={25} color={C.blue} /><Text style={s.choiceText}>{item.name}</Text>
    </TouchableOpacity>)}</ScrollView>
    <View style={s.actions}><TouchableOpacity style={s.secondary} onPress={close}><Text style={s.secondaryText}>Відмінити</Text></TouchableOpacity><TouchableOpacity disabled={!selected.length} style={[s.primary, !selected.length && s.disabled]} onPress={submit}><Text style={s.primaryText}>Підтвердити</Text></TouchableOpacity></View>
  </Pressable></Pressable>
</Modal>;

export default function GBExpress() {
  const navigation = useNavigation();
  const [guildId, setGuildId] = useState(''); const [uid, setUid] = useState(''); const [lang, setLang] = useState('uk');
  const [root, setRoot] = useState({}); const [users, setUsers] = useState({}); const [catalog, setCatalog] = useState({});
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [modal, setModal] = useState(null); const [selected, setSelected] = useState([]);
  const [serverOffset, setServerOffset] = useState(0);
  useEffect(() => { AsyncStorage.multiGet(['guildId', 'userId', 'userLanguage']).then((rows) => { const x = Object.fromEntries(rows); setGuildId(x.guildId || ''); setUid(x.userId || ''); setLang((x.userLanguage || 'uk').split('-')[0]); }); }, []);
  useEffect(() => {
    if (!guildId || !uid) return undefined;
    const er = database().ref(`guilds/${guildId}/express`); const ur = database().ref(`guilds/${guildId}/guildUsers`); const cr = database().ref('greatBuildings');
    const eh = (x) => { setRoot(x.val() || {}); setLoading(false); }; const uh = async (x) => setUsers(await filterGbgBots(guildId, x.val() || {})); const ch = (x) => setCatalog(x.val() || {});
    er.on('value', eh, () => setLoading(false)); ur.on('value', uh); cr.on('value', ch);
    return () => { er.off('value', eh); ur.off('value', uh); cr.off('value', ch); };
  }, [guildId, uid]);
  useEffect(() => { const offsetRef = database().ref('.info/serverTimeOffset'); const handler = (snap) => setServerOffset(Number(snap.val()) || 0); offsetRef.on('value', handler); return () => offsetRef.off('value', handler); }, []);
  const groups = useMemo(() => normalize(root).filter((g) => Number(g.scheduleTime) > Date.now() - 60000), [root]);
  const ref = (group) => database().ref(`guilds/${guildId}/express/${group.id}`);
  const owned = (group) => Object.entries(group.gbs || {}).filter(([, gb]) => String(gb.user) === uid).map(([id, gb]) => { const info = catalog[gb.allowedGB] || {}; return { id, ...gb, name: localize(info.buildingName, lang) || gb.allowedGB, image: typeof info.buildingImage === 'string' ? info.buildingImage : info.buildingImage?.uri }; });
  const run = async (key, action) => { if (busy) return; setBusy(key); try { await action(); } catch (error) { Alert.alert('Помилка', error?.message || 'Не вдалося виконати дію.'); } finally { setBusy(''); } };
  const interest = (group, enabled) => run(`interest_${group.id}`, async () => {
    if (group.id.startsWith('legacy_')) { const updates = {}; Object.keys(group.gbs).forEach((id) => { updates[`${id}/allowedUsers/${uid}`] = enabled ? true : null; }); return database().ref(`guilds/${guildId}/express`).update(updates); }
    return ref(group).transaction((current) => {
      if (!current || (current.workflow?.stage && current.workflow.stage !== 'open')) return;
      current.interested = current.interested || {}; current.ranks = current.ranks || {};
      if (!enabled) { delete current.interested[uid]; return current; }
      const rank = current.ranks[uid] || Math.max(0, ...Object.values(current.ranks).map(Number).filter(Number.isFinite)) + 1;
      current.ranks[uid] = rank; current.interested[uid] = { contributionMultiplier: Number(multiplier(users[uid]).toFixed(3)) }; return current;
    });
  });
  const confirm = (group) => run(`confirm_${group.id}`, () => ref(group).child(`interested/${uid}/confirmationTime`).transaction((value) => value || database.ServerValue.TIMESTAMP));
  const remove = (group, ids) => run(`remove_${group.id}`, async () => {
    if (group.id.startsWith('legacy_')) { const updates = {}; ids.forEach((id) => { updates[id] = null; }); return database().ref(`guilds/${guildId}/express`).update(updates); }
    let ask = false;
    await ref(group).transaction((current) => { if (!current) return current; ids.forEach((id) => { if (String(current.gbs?.[id]?.user) === uid) delete current.gbs[id]; }); const left = Object.values(current.gbs || {}); ask = left.some((gb) => String(gb.user) !== uid) && !left.some((gb) => String(gb.user) === uid); if (left.length) return current; if (['initial_confirmation', 'reserve_confirmation', 'final'].includes(current.workflow?.stage)) { current.workflow.pendingManualDelete = true; return current; } return null; });
    if (ask) Alert.alert('Участь', 'Чи бажаєте взяти участь в інших експрес-прокачках призначений на цей час', [{ text: 'Ні', onPress: () => ref(group).child(`ranks/${uid}`).remove() }, { text: 'Так', onPress: () => interest(group, true) }]);
  });
  const postpone = (group, items) => navigation.navigate('GBNewExpress', { postpone: true, originalChatId: group.id, originalScheduleTime: Number(group.scheduleTime), selectedGbs: items });
  const ownerAction = (group, kind) => { const items = owned(group); if (items.length === 1 && kind === 'cancel') return Alert.alert('Підтвердження', 'Ви підтверджуєте видалення ВС із запланованої експрес- прокачки?', [{ text: 'Ні' }, { text: 'Так', onPress: () => remove(group, [items[0].id]) }]); if (items.length === 1) return postpone(group, items); setModal({ group, kind, items }); setSelected(items.map((x) => x.id)); };
  const complete = (group, gbId) => run(`complete_${gbId}`, () => ref(group).transaction((current) => { if (!current || String(current.gbs?.[gbId]?.user) !== uid || Date.now() + serverOffset < Number(current.scheduleTime)) return; delete current.gbs[gbId]; return Object.keys(current.gbs || {}).length ? current : null; }));

  const card = ({ item: group }) => {
    const mine = owned(group); const owner = mine.length > 0; const me = group.interested?.[uid]; const stage = group.workflow?.stage || 'open';
    const visible = stage === 'postponement' ? owner : ['initial_confirmation', 'reserve_confirmation'].includes(stage) ? Boolean(me) : stage === 'final' ? Object.values(group.finalOrder || {}).some((x) => String(x.userId) === uid) : true;
    if (!visible) return null;
    const count = new Set([...Object.keys(group.interested || {}), ...Object.values(group.gbs || {}).map((gb) => String(gb.user))]).size;
    return <View style={s.card}><View style={s.schedule}><Ionicons name="calendar-outline" size={20} color={C.blue} /><Text style={s.scheduleText}>Запланований час: {formatTime(group.scheduleTime)}</Text>{owner && <View style={s.counter}><Ionicons name="people-outline" size={20} color={C.blue} /><Text style={s.count}>{count}</Text></View>}</View>
      {Object.entries(group.gbs || {}).map(([gbId, gb], index) => { const info = catalog[gb.allowedGB] || {}; const gbOwner = users[gb.user] || {}; const rows = Object.values(group.finalOrder || {}).filter((x) => String(x.userId) !== String(gb.user)); return <View key={gbId} style={[s.gb, index > 0 && s.gbLine]}><View style={s.gbTop}>{info.buildingImage ? <Image source={{ uri: typeof info.buildingImage === 'string' ? info.buildingImage : info.buildingImage.uri }} style={s.gbImage} resizeMode="contain" /> : <Ionicons name="business-outline" size={48} color={C.blue} />}<View style={s.gbCopy}><Text style={s.gbTitle}>{gbOwner.userName || gbOwner.name || gb.user} ({localize(info.buildingName, lang) || gb.allowedGB})</Text><Text style={s.muted}>Орієнтовно {gb.levelThreshold || 0} рівнів</Text></View></View>
        {stage === 'final' && <View style={s.table}><View style={s.tableHead}><Text style={s.place}>Місце</Text><Text style={s.contributor}>Вкладник</Text></View>{rows.map((row, i) => { const p = users[row.userId] || {}; return <View key={row.userId} style={s.tableRow}><Text style={s.place}>{i + 1}</Text><View style={[s.contributor, s.person]}>{p.avatar || p.photoURL ? <Image source={{ uri: p.avatar || p.photoURL }} style={s.avatar} /> : <Ionicons name="person-circle-outline" size={28} color={C.muted} />}<Text style={s.personName}>{p.userName || p.login || p.name || row.userId}</Text></View></View>; })}</View>}
        {stage === 'final' && String(gb.user) === uid && <TouchableOpacity disabled={Date.now() + serverOffset < Number(group.scheduleTime) || Boolean(busy)} onPress={() => complete(group, gbId)} style={[s.complete, Date.now() + serverOffset < Number(group.scheduleTime) && s.disabled]}><Text style={s.primaryText}>Прокачка закінченна</Text></TouchableOpacity>}</View>; })}
      {stage !== 'final' && <View style={s.actions}>{stage === 'postponement' && owner ? <><TouchableOpacity style={s.secondary} onPress={() => ownerAction(group, 'cancel')}><Text style={s.secondaryText}>Скасувати</Text></TouchableOpacity><TouchableOpacity style={s.primary} onPress={() => ownerAction(group, 'postpone')}><Text style={s.primaryText}>Відтермінувати</Text></TouchableOpacity></> : ['initial_confirmation', 'reserve_confirmation'].includes(stage) ? <TouchableOpacity disabled={Boolean(me?.confirmationTime) || Boolean(busy)} style={[s.primary, me?.confirmationTime && s.disabled]} onPress={() => confirm(group)}><Text style={s.primaryText}>{me?.confirmationTime ? 'Підтверджено' : me?.owner ? 'Підтвердити свої наміри' : 'Підтвердити своє бажання'}</Text></TouchableOpacity> : <><TouchableOpacity style={owner || me ? s.secondary : s.primary} onPress={() => owner ? ownerAction(group, 'cancel') : interest(group, !me)}><Text style={owner || me ? s.secondaryText : s.primaryText}>{owner || me ? 'Скасувати' : 'Взяти участь'}</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={() => navigation.navigate('GBNewExpress', { scheduleTime: group.scheduleTime, chatId: group.id })}><Text style={s.secondaryText}>Додати свій експрес</Text></TouchableOpacity></>}</View>}
    </View>;
  };
  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.blue} /></View>;
  return <View style={s.container}><FlatList data={groups} keyExtractor={(x) => x.id} renderItem={card} contentContainerStyle={s.content} ListHeaderComponent={<View style={s.intro}><Ionicons name="shield-checkmark-outline" size={26} color={C.blue} /><Text style={s.introText}>{INFO}</Text></View>} ListEmptyComponent={<Text style={s.empty}>Немає запланованих експресів</Text>} /><SelectionModal state={modal} selected={selected} setSelected={setSelected} close={() => setModal(null)} submit={() => { const state = modal; const ids = selected; setModal(null); if (state.kind === 'postpone') postpone(state.group, state.items.filter((x) => ids.includes(x.id))); else remove(state.group, ids); }} /></View>;
}

const s = StyleSheet.create({ container: { flex: 1, backgroundColor: C.bg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }, content: { padding: 12, paddingBottom: 30 }, intro: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' }, introText: { flex: 1, color: '#c2cad6', fontSize: 13, lineHeight: 19 }, card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 17, marginBottom: 12, padding: 12 }, schedule: { flexDirection: 'row', alignItems: 'center' }, scheduleText: { flex: 1, color: '#c6ceda', fontSize: 13, marginLeft: 8 }, counter: { flexDirection: 'row', alignItems: 'center', gap: 5 }, count: { color: C.text }, gb: { paddingTop: 12 }, gbLine: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 12 }, gbTop: { flexDirection: 'row', alignItems: 'center' }, gbImage: { width: 92, height: 100 }, gbCopy: { flex: 1, paddingLeft: 9 }, gbTitle: { color: C.text, fontSize: 14, fontWeight: '700' }, muted: { color: C.muted, marginTop: 8 }, actions: { flexDirection: 'row', gap: 8, marginTop: 14 }, primary: { flex: 1, minHeight: 46, borderRadius: 10, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', padding: 8 }, secondary: { flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: C.blue, alignItems: 'center', justifyContent: 'center', padding: 8 }, primaryText: { color: '#fff', fontWeight: '800', textAlign: 'center' }, secondaryText: { color: '#62a7ff', fontWeight: '800', textAlign: 'center' }, disabled: { opacity: .45 }, empty: { color: C.muted, textAlign: 'center', marginTop: 40 }, overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.75)', justifyContent: 'center', padding: 22 }, modal: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 20, maxHeight: '75%' }, modalTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 12, textAlign: 'center' }, choiceScroll: { maxHeight: 330 }, choice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }, choiceText: { color: C.text, flex: 1 }, table: { marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 9, overflow: 'hidden' }, tableHead: { flexDirection: 'row', backgroundColor: C.soft, padding: 9 }, tableRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderTopWidth: 1, borderTopColor: C.line }, place: { width: 65, color: C.text, textAlign: 'center' }, contributor: { flex: 1, color: C.text }, person: { flexDirection: 'row', alignItems: 'center', gap: 8 }, personName: { color: C.text }, avatar: { width: 28, height: 28, borderRadius: 14 }, complete: { alignSelf: 'center', minWidth: 210, backgroundColor: C.blue, borderRadius: 10, padding: 13, marginTop: 12 } });
