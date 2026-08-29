import database from '@react-native-firebase/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { GuildContext } from '../GuildContext';
import {
  getSectorGradient as getGbgSectorGradient,
  mixColors,
} from './GBG/gbgSectorGradients';

const COLORS = {
  background: '#0f1115', surface: '#152330', surfaceHighlight: '#1b2b3b',
  primary: '#4ea1ff', textPrimary: '#f4f7fb', textSecondary: '#9aa3b2',
  danger: '#ff5b5b', separator: '#36516a',
};
const HORIZONTAL_STEP = 51;
const VERTICAL_STEP = 54;
const NODE_SIZE = 57;
const MAP_PADDING = NODE_SIZE / 2 + 12;

const getSectorGradient = (baseColor) => {
  const gradient = getGbgSectorGradient(baseColor);
  if (String(gradient[1]).toUpperCase() === String(baseColor).toUpperCase()) return gradient;
  return [
    mixColors(baseColor, '#FFFFFF', 0.24),
    baseColor,
    mixColors(baseColor, '#000000', 0.32),
  ];
};

const QUANT_NODE_BASE_COLORS = {
  attack: '#E5484D',
  defense: '#4E86D8',
  resources: '#F2C94C',
  standard: '#35B86B',
};

const QUANT_NODE_GRADIENTS = {
  attack: getSectorGradient(QUANT_NODE_BASE_COLORS.attack),
  defense: getSectorGradient(QUANT_NODE_BASE_COLORS.defense),
  resources: getSectorGradient(QUANT_NODE_BASE_COLORS.resources),
  standard: getSectorGradient(QUANT_NODE_BASE_COLORS.standard),
};

const gradientIds = {
  attack: 'quant-node-attack',
  defense: 'quant-node-defense',
  resources: 'quant-node-resources',
  standard: 'quant-node-standard',
};

const getNodeGradientType = (node) => {
  const nodeClass = String(node?.type?.__class__ || '').toLowerCase();
  const armyType = String(node?.type?.armyType || node?.armyType || '').toLowerCase();
  const fightType = String(
    node?.type?.fightType ||
    node?.fightType ||
    ''
  ).toLowerCase();
  const subtype = String(node?.type?.type || '').toLowerCase();
  const state = String(node?.state?.state || '').toLowerCase();
  const guildState = String(node?.guildState || '').toLowerCase();

  if (state === 'finished' || guildState === 'finished') return 'standard';
  if (
    nodeClass.includes('donation') ||
    subtype === 'goods' ||
    subtype === 'resources'
  ) return 'resources';
  if (armyType === 'defending' || armyType === 'defense') return 'defense';
  if (armyType === 'attacking' || armyType === 'attack') return 'attack';
  if (
    fightType === 'garrison' ||
    fightType === 'stronghold' ||
    fightType === 'defense' ||
    nodeClass.includes('defense')
  ) return 'defense';
  if (
    fightType === 'final-boss' ||
    fightType === 'mini-boss' ||
    fightType === 'attack' ||
    nodeClass.includes('fight') ||
    nodeClass.includes('attack')
  ) return 'attack';
  return 'standard';
};

const toNodeList = (nodes) => {
  if (Array.isArray(nodes)) return nodes.filter(Boolean);
  if (!nodes || typeof nodes !== 'object') return [];
  return Object.entries(nodes).map(([key, node]) => ({ ...node, id: node?.id || key }));
};

const getMapRotation = (nodes, mapRotation) => {
  if (mapRotation !== null && mapRotation !== undefined && Number.isFinite(Number(mapRotation))) {
    return Number(mapRotation);
  }
  const sourceNode = nodes.find((node) =>
    (node?.display?.rotation ?? node?.rotation) !== null &&
    (node?.display?.rotation ?? node?.rotation) !== undefined &&
    Number.isFinite(Number(node.display?.rotation ?? node.rotation))
  );
  return sourceNode ? Number(sourceNode.display?.rotation ?? sourceNode.rotation) : 0;
};

const getGeometry = (nodes, rotation = 0) => {
  const positioned = nodes.filter((node) =>
    Number.isFinite(Number(node?.position?.x)) && Number.isFinite(Number(node?.position?.y))
  );
  const minX = positioned.length
    ? Math.min(...positioned.map((node) => Number(node.position.x)))
    : 1;
  const minY = positioned.length
    ? Math.min(...positioned.map((node) => Number(node.position.y)))
    : 1;
  const maxX = Math.max(minX, ...positioned.map((node) => Number(node.position.x)));
  const maxY = Math.max(minY, ...positioned.map((node) => Number(node.position.y)));
  const rawWidth = MAP_PADDING * 2 + (maxX - minX) * HORIZONTAL_STEP + NODE_SIZE;
  const rawHeight = MAP_PADDING * 2 + (maxY - minY) * VERTICAL_STEP + NODE_SIZE;
  const radians = rotation * Math.PI / 180;
  return {
    rawWidth,
    rawHeight,
    minX,
    minY,
    width: Math.abs(rawWidth * Math.cos(radians)) + Math.abs(rawHeight * Math.sin(radians)),
    height: Math.abs(rawWidth * Math.sin(radians)) + Math.abs(rawHeight * Math.cos(radians)),
  };
};

const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const buildMapHtml = (nodes, geometry, rotation) => `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${COLORS.surface}}
svg{display:block;width:100%;height:100%;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.route{stroke-width:4;stroke-linecap:round}
.node{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}.node:focus,.node:focus-visible{outline:none}.shape{stroke:#0f1115;stroke-width:3}.node.avoid .shape{stroke:#ff9f43;stroke-width:4}
.node.detailed .shape{stroke:#69d2ff;stroke-width:5;filter:drop-shadow(0 0 5px rgba(105,210,255,.9))}
.node.current .shape,.node.selected .shape{stroke:#fff;stroke-width:5}.multi-ring{fill:none;stroke:#fff;stroke-width:5;opacity:0;pointer-events:none}.blink-on .node.multiple .multi-ring{opacity:1}.avoid-cross{display:none;pointer-events:none}.node.avoid .avoid-cross{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.9))}.avoid-cross-underlay{stroke:#0f1115;stroke-width:9;stroke-linecap:round}.avoid-cross-line{stroke:#ff9f43;stroke-width:5;stroke-linecap:round}.label{fill:#fff;font:700 14px Arial,sans-serif;text-anchor:middle;dominant-baseline:central;pointer-events:none;text-shadow:0 1px 2px #000}.label.resources{fill:#1b1b1b;text-shadow:none}
</style></head><body>
<svg id="map" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="xMidYMid meet" aria-label="Мапа квантових вторгнень">
<defs>
${Object.entries(gradientIds).map(([type, id]) => {
    const colors = QUANT_NODE_GRADIENTS[type];
    return `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="48%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="${colors[2]}"/></linearGradient>`;
  }).join('')}
</defs>
</svg>
<script>
const nodes=${jsonForHtml(nodes.map((node) => ({ ...node, gradientType: getNodeGradientType(node) })))},NS='http://www.w3.org/2000/svg',map=document.getElementById('map');
const byId=new Map(nodes.map(n=>[String(n.id),n]));
const angle=${rotation}*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
const rotatePoint=p=>{const dx=p.x-${geometry.rawWidth / 2},dy=p.y-${geometry.rawHeight / 2};return{x:dx*cos-dy*sin+${geometry.width / 2},y:dx*sin+dy*cos+${geometry.height / 2}}};
const point=n=>rotatePoint({x:${MAP_PADDING + NODE_SIZE / 2}+(Number(n.position.x)-${geometry.minX})*${HORIZONTAL_STEP},y:${MAP_PADDING + NODE_SIZE / 2}+(Number(n.position.y)-${geometry.minY})*${VERTICAL_STEP}});
const el=(name,attrs)=>{const node=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));return node};
const list=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
const finished=n=>String(n.guildState||'').toLowerCase()==='finished';
const blocked=n=>String(n.guildState||'').toLowerCase()==='blocked';
const avoid=n=>n.isAvoidSelection||String(n.state?.indicator?.value||n.state?.indicatot?.value||'').toLowerCase()==='avoid';
const gradientType=n=>n.gradientType||'standard';
const fill=n=>'url(#'+${jsonForHtml(gradientIds)}[gradientType(n)]+')';
const routes=el('g',{'aria-hidden':'true'}),drawn=new Set();
nodes.forEach(n=>{if(!n.position)return;list(n.connectedNodes).forEach(c=>{const id=String(c?.targetNodeId||''),target=byId.get(id);if(!target?.position)return;const key=[String(n.id),id].sort().join('-');if(drawn.has(key))return;drawn.add(key);const a=point(n),b=point(target),stroke=finished(n)||finished(target)?'#35b86b':'${COLORS.separator}';routes.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'route',stroke}))})});map.appendChild(routes);
const multiIds=new Set();let blinkTimer=null,longPressTimer=null,longPressTriggered=false,suppressClick=false,touchStart=null;
const send=(type,nodeId)=>window.ReactNativeWebView?.postMessage(JSON.stringify({type,nodeId}));
const sendMultiple=()=>window.ReactNativeWebView?.postMessage(JSON.stringify({type:'multiSelection',nodeIds:Array.from(multiIds)}));
const clearNormal=()=>nodeLayer.querySelectorAll('.selected').forEach(node=>node.classList.remove('selected'));
const clearMultiple=()=>{multiIds.clear();nodeLayer.querySelectorAll('.multiple').forEach(node=>node.classList.remove('multiple'));map.classList.remove('blink-on');if(blinkTimer){clearInterval(blinkTimer);blinkTimer=null}sendMultiple()};
const clearSelection=()=>{clearMultiple();clearNormal();send('clearSelection',null)};
const removeMultiple=id=>{const normalized=String(id),node=nodeLayer.querySelector('[data-node-id="'+normalized+'"]');multiIds.delete(normalized);node?.classList.remove('multiple');if(!multiIds.size){map.classList.remove('blink-on');if(blinkTimer){clearInterval(blinkTimer);blinkTimer=null}send('clearSelection',null)}sendMultiple()};
window.removeQuantumMultiple=removeMultiple;
const ensureBlink=()=>{if(blinkTimer)return;map.classList.add('blink-on');blinkTimer=setInterval(()=>map.classList.toggle('blink-on'),500)};
const addMultiple=(n,g)=>{if(!blocked(n)||gradientType(n)==='standard'||avoid(n))return;clearNormal();multiIds.add(String(n.id));g.classList.add('multiple');ensureBlink();send('nodePress',String(n.id));sendMultiple()};
const tap=(n,g)=>{if(multiIds.size){if(!blocked(n)){clearSelection();return}if(avoid(n))return;if(gradientType(n)==='standard')clearSelection();else addMultiple(n,g);return}clearNormal();g.classList.add('selected');send('nodePress',String(n.id))};
const longPress=(n,g)=>{if(!blocked(n)){if(multiIds.size)clearSelection();return}if(avoid(n))return;if(gradientType(n)==='standard'){if(multiIds.size)clearSelection();return}addMultiple(n,g)};
const nodeLayer=el('g',{});nodes.forEach(n=>{if(!n.position||!n.id)return;const p=point(n),classes=['node'];if(avoid(n))classes.push('avoid');if(n.hasNodeDetails)classes.push('detailed');if(n.currentNode||n.isCurrent)classes.push('current');const g=el('g',{class:classes.join(' '),role:'button',tabindex:'0','data-node-id':String(n.id),'aria-label':'Вузол '+String(n.id).toUpperCase(),transform:'translate('+p.x+' '+p.y+')'});g.appendChild(el('circle',{r:${NODE_SIZE / 2},fill:fill(n),class:'shape'}));g.appendChild(el('circle',{r:${NODE_SIZE / 2},class:'multi-ring'}));const cross=el('g',{class:'avoid-cross'});cross.appendChild(el('line',{x1:-18,y1:-18,x2:18,y2:18,class:'avoid-cross-underlay'}));cross.appendChild(el('line',{x1:18,y1:-18,x2:-18,y2:18,class:'avoid-cross-underlay'}));cross.appendChild(el('line',{x1:-18,y1:-18,x2:18,y2:18,class:'avoid-cross-line'}));cross.appendChild(el('line',{x1:18,y1:-18,x2:-18,y2:18,class:'avoid-cross-line'}));g.appendChild(cross);const text=el('text',{x:0,y:1,class:'label '+gradientType(n)});text.textContent=String(n.id).toUpperCase();g.appendChild(text);g.addEventListener('touchstart',e=>{const touch=e.touches[0];touchStart={x:touch.clientX,y:touch.clientY};longPressTriggered=false;clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>{longPressTriggered=true;suppressClick=true;longPress(n,g)},550)},{passive:true});g.addEventListener('touchmove',e=>{const touch=e.touches[0];if(touchStart&&(Math.abs(touch.clientX-touchStart.x)>10||Math.abs(touch.clientY-touchStart.y)>10))clearTimeout(longPressTimer)},{passive:true});g.addEventListener('touchend',e=>{clearTimeout(longPressTimer);touchStart=null;if(longPressTriggered){e.preventDefault();setTimeout(()=>{suppressClick=false},350)}},{passive:false});g.addEventListener('touchcancel',()=>{clearTimeout(longPressTimer);touchStart=null});g.addEventListener('click',e=>{e.stopPropagation();if(suppressClick)return;tap(n,g)});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')tap(n,g)});nodeLayer.appendChild(g)});map.appendChild(nodeLayer);
map.addEventListener('click',()=>clearSelection());
document.addEventListener('contextmenu',event=>event.preventDefault());document.addEventListener('selectstart',event=>event.preventDefault());
</script></body></html>`;

const getNodeTypeLabel = (node) => {
  const nodeClass = String(node?.type?.__class__ || '').toLowerCase();
  const fightType = String(node?.type?.fightType || node?.fightType || '').toLowerCase();
  const subtype = String(node?.type?.type || '').toLowerCase();
  if (fightType === 'final-boss') return 'Фінальний бос';
  if (fightType === 'mini-boss') return 'Мінібос';
  if (fightType === 'garrison') return 'Гарнізон';
  if (fightType === 'stronghold') return 'Фортеця';
  if (nodeClass.includes('donation')) return subtype === 'goods' ? 'Внесок товарами' : 'Внесок ресурсами';
  if (nodeClass.includes('start') || subtype === 'start') return 'Старт';
  if (nodeClass.includes('fight')) return 'Звичайний бій';
  return 'Вузол мапи';
};

const TYPE_COLORS = {
  attacking: '#e5484d',
  defending: '#4e86d8',
  donation: '#f2c94c',
  fallback: '#35b86b',
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const getSectorType = (node) => {
  const armyType = String(node?.type?.armyType || '').toLowerCase();
  const donationType = String(node?.type?.type || '').toLowerCase();
  if (armyType === 'attacking') return { label: 'Атака', icon: 'sword-cross', color: TYPE_COLORS.attacking };
  if (armyType === 'defending') return { label: 'Захист', icon: 'shield-half-full', color: TYPE_COLORS.defending };
  if (donationType === 'resources') return { label: 'Ресурси', icon: 'hammer-wrench', color: TYPE_COLORS.donation };
  if (donationType === 'goods') return { label: 'Товари', icon: 'treasure-chest-outline', color: TYPE_COLORS.donation };
  return { label: getNodeTypeLabel(node), icon: 'map-marker-outline', color: TYPE_COLORS.fallback };
};

const getSectorProgress = (node) => {
  const guildNode = node?.guildNodeData || {};
  const details = node?.nodeDetailsData || {};
  const responseData = details.responseData || guildNode.responseData || {};
  const current = Number(firstDefined(
    details.currentProgress, guildNode.currentProgress, responseData.currentProgress,
    details.progress?.current, responseData.progress?.current,
    guildNode.progress?.current, node?.currentProgress, 0
  )) || 0;
  const required = Number(firstDefined(
    details.requiredProgress, guildNode.requiredProgress, responseData.requiredProgress,
    details.progress?.required, responseData.progress?.required,
    guildNode.progress?.required, node?.type?.requiredProgress, node?.requiredProgress, 0
  )) || 0;
  return { current, required, percent: required > 0 ? Math.min(100, Math.max(0, current / required * 100)) : 0 };
};

const toEntries = (value) => {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
};

const getSectorParticipants = (node) => {
  const guildNode = node?.guildNodeData || {};
  const details = node?.nodeDetailsData || {};
  const responseData = details.responseData || guildNode.responseData || {};
  const source = firstDefined(
    details.contributors, details.participants, details.players, details.playerContributions,
    details.contributions, guildNode.contributors, guildNode.participants, guildNode.players,
    guildNode.playerContributions, guildNode.contributions, responseData.contributors,
    responseData.participants, responseData.players, responseData.playerContributions,
    responseData.contributions
  );
  const participants = toEntries(source).map(([id, raw], index) => {
    const data = raw && typeof raw === 'object' ? raw : { value: raw };
    const amount = Number(firstDefined(
      data.contribution, data.amount, data.value, data.progress, data.points,
      data.currentProgress, data.contributionAmount, data.contributed, data.total, 0
    )) || 0;
    return {
      id,
      rank: Number(firstDefined(data.rank, data.place, index + 1)) || index + 1,
      name: String(firstDefined(data.userName, data.playerName, data.displayName, data.name, data.player?.name, id)),
      imageUrl: firstDefined(data.imageUrl, data.avatarUrl, data.avatar, data.photoURL, data.player?.imageUrl, data.player?.avatarUrl),
      amount,
      raw: data,
    };
  }).sort((a, b) => a.rank - b.rank || b.amount - a.amount);
  const total = participants.reduce((sum, participant) => sum + participant.amount, 0);
  return participants.map((participant) => ({
    ...participant,
    percent: total > 0 ? Math.round(participant.amount / total * 100) : 0,
  }));
};

const formatNumber = (value) => new Intl.NumberFormat('uk-UA').format(Number(value) || 0);

const SectorTypeCard = ({ node, fullWidth }) => {
  const type = getSectorType(node);
  return (
    <View style={[styles.dataCard, fullWidth && styles.fullWidthCard, { borderColor: type.color }]}>
      <View style={[styles.dataIcon, { borderColor: `${type.color}88`, backgroundColor: `${type.color}14` }]}>
        <MaterialCommunityIcons name={type.icon} size={24} color={type.color} />
      </View>
      <View style={styles.dataCardText}>
        <Text style={styles.dataLabel}>Тип сектору</Text>
        <Text style={[styles.dataValue, { color: type.color }]}>{type.label}</Text>
      </View>
    </View>
  );
};

const ProgressCard = ({ progress }) => (
  <View style={styles.dataCard}>
    <View style={styles.dataIcon}>
      <MaterialCommunityIcons name="chart-line" size={24} color={COLORS.primary} />
    </View>
    <View style={styles.progressContent}>
      <Text style={styles.dataLabel}>Поточний прогрес</Text>
      <Text style={styles.dataValue}>{formatNumber(progress.current)} / {formatNumber(progress.required)}</Text>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
        </View>
        <Text style={styles.progressPercent}>{Math.round(progress.percent)}%</Text>
      </View>
    </View>
  </View>
);

const ParticipantsCard = ({ participants, title }) => (
  <View style={styles.participantsCard}>
    <View style={styles.participantsTitleRow}>
      <MaterialCommunityIcons name="account-group-outline" size={19} color={COLORS.primary} />
      <Text style={styles.participantsTitle}>{title}</Text>
    </View>
    {participants.length ? participants.map((participant) => (
      <View key={participant.id} style={styles.participantRow}>
        <View style={styles.rank}><Text style={styles.rankText}>{participant.rank}</Text></View>
        {participant.imageUrl ? (
          <Image source={{ uri: participant.imageUrl }} style={styles.participantAvatar} />
        ) : (
          <View style={styles.participantAvatarFallback}>
            <MaterialCommunityIcons name="account" size={20} color={COLORS.textSecondary} />
          </View>
        )}
        <Text style={styles.participantName} numberOfLines={1}>{participant.name}</Text>
        <Text style={styles.participantAmount}>{formatNumber(participant.amount)}</Text>
        <Text style={styles.participantPercent}>{participant.percent}%</Text>
      </View>
    )) : (
      <Text style={styles.emptyParticipants}>Дані про учасників відсутні</Text>
    )}
  </View>
);

const SectorDetails = ({ node, isNotificationScheduled, isSchedulingNotification, onNotify }) => {
  const state = String(node.guildState || '').toLowerCase();
  const isFinished = state === 'finished';
  const isBlockedForbidden = state === 'blocked' && node.isAvoidSelection;
  const isForbidden = (state === 'open' || state === 'blocked') && node.isAvoidSelection;
  const isActive = state === 'open' && !node.isAvoidSelection;
  const isBlocked = state === 'blocked' && !node.isAvoidSelection;
  const usesActiveLayout = isActive || isBlocked;
  const progress = getSectorProgress(node);
  const participants = getSectorParticipants(node);
  const status = isFinished
    ? { text: 'Сектор закритий', color: '#35b86b' }
    : isForbidden
      ? { text: 'Сектор заборонений', color: COLORS.danger }
      : isActive
        ? { text: 'Сектор активний', color: '#f2c94c' }
        : { text: 'Статус не визначено', color: COLORS.textSecondary };

  return (
    <View style={styles.details}>
      <View style={styles.detailsHeader}>
        <Text style={styles.nodeId}>{String(node.id).toUpperCase()}</Text>
        {isBlocked ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Сповістити про сектор"
            activeOpacity={0.75}
            disabled={isSchedulingNotification || isNotificationScheduled}
            onPress={() => onNotify([node.id])}
            style={[styles.notifyButton, (isSchedulingNotification || isNotificationScheduled) && styles.notifyButtonDisabled]}
          >
            {isSchedulingNotification ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <MaterialCommunityIcons name={isNotificationScheduled ? 'bell-check-outline' : 'bell-outline'} size={18} color={COLORS.primary} />
            )}
            <Text style={styles.notifyButtonText}>{isNotificationScheduled ? 'Заплановано' : 'Сповістити'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        )}
      </View>
      <View style={styles.detailsDivider} />
      <Text style={styles.sectionHeading}>Дані сектора</Text>
      {usesActiveLayout ? (
        <View style={styles.cardsRow}>
          <ProgressCard progress={progress} />
          <SectorTypeCard node={node} />
        </View>
      ) : (
        <SectorTypeCard node={node} fullWidth />
      )}
      {!isBlockedForbidden && (
        <ParticipantsCard participants={participants} title={usesActiveLayout ? 'Учасники' : 'Участь'} />
      )}
    </View>
  );
};

const MultiSectorDetails = ({ isNotificationScheduled, isSchedulingNotification, nodes, onNotify, onRemove }) => {
  const indicatorCount = nodes.filter((node) => node.hasIndicator).length;
  const typeSummary = nodes.reduce((summary, node) => {
    const type = getSectorType(node);
    const existing = summary.find((item) => item.label === type.label);
    if (existing) existing.count += 1;
    else summary.push({ ...type, count: 1 });
    return summary;
  }, []);

  return (
    <View style={styles.multiDetails}>
      <View style={styles.multiHeader}>
        <Text style={styles.multiCount}>{nodes.length} {nodes.length === 1 ? 'сектор обрано' : 'сектори обрано'}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Сповістити про вибрані сектори"
          activeOpacity={0.75}
          disabled={isSchedulingNotification || isNotificationScheduled}
          onPress={() => onNotify(nodes.map((node) => node.id))}
          style={[styles.notifyButton, (isSchedulingNotification || isNotificationScheduled) && styles.notifyButtonDisabled]}
        >
          {isSchedulingNotification ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <MaterialCommunityIcons name={isNotificationScheduled ? 'bell-check-outline' : 'bell-outline'} size={18} color={COLORS.primary} />
          )}
          <Text style={styles.notifyButtonText}>{isNotificationScheduled ? 'Заплановано' : 'Сповістити'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.detailsDivider} />
      <Text style={styles.multiSectionTitle}>Зведення</Text>
      <View style={styles.selectedChips}>
        {nodes.map((node) => {
          const type = getSectorType(node);
          return (
            <View key={node.id} style={styles.selectedChip}>
              <View style={[styles.selectedChipId, { backgroundColor: type.color }]}>
                <Text style={styles.selectedChipIdText}>{String(node.id).toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Прибрати сектор ${String(node.id).toUpperCase()}`}
                onPress={() => onRemove(node.id)}
                style={styles.removeChipButton}
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <View style={styles.aggregateNote}>
        <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.aggregateNoteText}>Дані агреговано за вибраними секторами</Text>
      </View>
      <View style={styles.aggregateRow}>
        <View style={styles.aggregateCard}>
          <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} />
          <View>
            <Text style={styles.aggregateLabel}>Стан</Text>
            <Text style={styles.aggregateValue}>Заблоковані</Text>
          </View>
        </View>
        <View style={styles.aggregateCard}>
          <MaterialCommunityIcons name="target" size={22} color={COLORS.primary} />
          <View>
            <Text style={styles.aggregateLabel}>Індикатор</Text>
            <Text style={styles.aggregateValue}>{indicatorCount} присутні</Text>
          </View>
        </View>
      </View>
      <View style={styles.typesSummary}>
        <Text style={styles.aggregateLabel}>Типи секторів</Text>
        {typeSummary.map((type) => (
          <View key={type.label} style={styles.typeSummaryRow}>
            <View style={[styles.typeSummaryIcon, { backgroundColor: `${type.color}14` }]}>
              <MaterialCommunityIcons name={type.icon} size={19} color={type.color} />
            </View>
            <Text style={styles.typeSummaryLabel}>{type.label}</Text>
            <Text style={[styles.typeSummaryCount, { color: type.color }]}>{type.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default function Quant() {
  const { guildId } = useContext(GuildContext);
  const { width } = useWindowDimensions();
  const webViewRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [mapRotation, setMapRotation] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([]);
  const [scheduledSectorIds, setScheduledSectorIds] = useState([]);
  const [schedulingNotification, setSchedulingNotification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId) {
      setConfig(null);
      setNodes([]);
      setMapRotation(null);
      setMultiSelectedNodeIds([]);
      setScheduledSectorIds([]);
      setLoading(false);
      setError('Не вибрано гільдію.');
      return undefined;
    }
    setLoading(true);
    setError('');
    setConfig(null);
    setNodes([]);
    setMapRotation(null);
    setSelectedNodeId(null);
    setMultiSelectedNodeIds([]);
    setScheduledSectorIds([]);
    const configRef = database().ref(`guilds/${guildId}/quantum`);
    const onConfig = (snapshot) => {
      const nextConfig = snapshot.val() || {};
      setConfig(nextConfig);
    };
    const onError = (loadError) => {
      console.error('Не вдалося завантажити налаштування квантових вторгнень:', loadError);
      setLoading(false);
      setError('Не вдалося завантажити налаштування мапи.');
    };
    configRef.on('value', onConfig, onError);
    return () => configRef.off('value', onConfig);
  }, [guildId]);

  const mapKey = config?.mapKey;
  const difficultyLevel = config?.difficultyLevel;
  const isConfigLoaded = config !== null;

  useEffect(() => {
    let cancelled = false;
    let subscriptionsRef = null;
    let onSubscriptions = null;

    setScheduledSectorIds([]);
    const subscribeToScheduledSectors = async () => {
      if (!guildId) return;
      const userId = String((await AsyncStorage.getItem('userId')) || '').trim();
      if (cancelled || !userId) return;

      subscriptionsRef = database().ref(`guilds/${guildId}/quantumStateNotifications`);
      onSubscriptions = (snapshot) => {
        if (cancelled) return;
        const subscriptions = snapshot.val() || {};
        const nextSectorIds = Object.entries(subscriptions)
          .filter(([, users]) => users && Object.prototype.hasOwnProperty.call(users, userId))
          .map(([sectorId]) => String(sectorId));
        setScheduledSectorIds(nextSectorIds);
      };
      const onSubscriptionsError = (syncError) => {
        if (cancelled) return;
        console.warn('Не вдалося відновити підписки квантових секторів:', syncError);
      };
      subscriptionsRef.on('value', onSubscriptions, onSubscriptionsError);
    };

    subscribeToScheduledSectors().catch((syncError) => {
      console.warn('Не вдалося відновити підписки квантових секторів:', syncError);
    });
    return () => {
      cancelled = true;
      if (subscriptionsRef && onSubscriptions) {
        subscriptionsRef.off('value', onSubscriptions);
      }
    };
  }, [guildId]);

  useEffect(() => {
    if (!isConfigLoaded) return undefined;
    if (!mapKey || difficultyLevel === undefined || difficultyLevel === null) {
      setNodes([]);
      setLoading(false);
      setError('Для гільдії не вказано mapKey або difficultyLevel.');
      return undefined;
    }

    setLoading(true);
    setError('');
    const nodesRef = database().ref(`quantumMaps/${mapKey}/${difficultyLevel}`);
    const onNodes = (snapshot) => {
      const mapData = snapshot.val() || {};
      const nextNodes = toNodeList(mapData.nodes);
      setMapRotation(mapData.display?.rotation ?? mapData.rotation ?? null);
      setNodes(nextNodes);
      setLoading(false);
      setError(nextNodes.length ? '' : 'Мапа не містить вузлів.');
    };
    const onNodesError = (loadError) => {
      console.error('Не вдалося завантажити мапу квантових вторгнень:', loadError);
      setNodes([]);
      setMapRotation(null);
      setLoading(false);
      setError('Не вдалося завантажити мапу.');
    };

    nodesRef.on('value', onNodes, onNodesError);
    return () => nodesRef.off('value', onNodes);
  }, [difficultyLevel, isConfigLoaded, mapKey]);

  const renderedNodes = useMemo(() => {
    const guildNodes = config?.nodes;
    const nodeDetails = config?.nodeDetails;

    return nodes.map((node) => {
      const nodeId = String(node.id);
      const guildNode = guildNodes?.[nodeId];
      const guildState = typeof guildNode?.state === 'string'
        ? guildNode.state
        : guildNode?.state?.state;
      const indicatorValue =
        guildNode?.state?.indicator?.value ??
        guildNode?.state?.indicatot?.value ??
        guildNode?.indicator?.value ??
        guildNode?.indicatot?.value ??
        node?.state?.indicator?.value ??
        node?.state?.indicatot?.value;
      const hasNodeDetails = Boolean(
        nodeDetails && Object.prototype.hasOwnProperty.call(nodeDetails, nodeId)
      );

      return {
        ...node,
        guildState,
        hasIndicator: indicatorValue !== undefined && indicatorValue !== null && String(indicatorValue) !== '',
        isAvoidSelection: String(indicatorValue || '').toLowerCase() === 'avoid',
        hasNodeDetails,
        mapNodeData: node,
        guildNodeData: guildNode ?? null,
        nodeDetailsData: hasNodeDetails ? nodeDetails[nodeId] : null,
      };
    });
  }, [config?.nodeDetails, config?.nodes, nodes]);

  const rotation = useMemo(
    () => getMapRotation(renderedNodes, mapRotation),
    [mapRotation, renderedNodes]
  );
  const geometry = useMemo(() => getGeometry(renderedNodes, rotation), [renderedNodes, rotation]);
  const mapHeight = Math.max(220, width * 0.96 * geometry.height / geometry.width);
  const selectedNode = renderedNodes.find((node) => String(node.id) === String(selectedNodeId));
  const multiSelectedNodes = multiSelectedNodeIds
    .map((nodeId) => renderedNodes.find((node) => String(node.id) === String(nodeId)))
    .filter(Boolean);
  const html = useMemo(
    () => buildMapHtml(renderedNodes, geometry, rotation),
    [renderedNodes, geometry, rotation]
  );
  const webViewSource = useMemo(() => ({ html }), [html]);

  const onMapMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'nodePress') setSelectedNodeId(message.nodeId);
      if (message.type === 'clearSelection') setSelectedNodeId(null);
      if (message.type === 'multiSelection' && Array.isArray(message.nodeIds)) {
        setMultiSelectedNodeIds(message.nodeIds);
      }
    } catch (messageError) {
      console.warn('Некоректне повідомлення від мапи:', messageError);
    }
  };

  const removeMultiSelectedNode = (nodeId) => {
    webViewRef.current?.injectJavaScript(
      `window.removeQuantumMultiple?.(${JSON.stringify(String(nodeId))}); true;`
    );
  };

  const scheduleSectorNotifications = async (sectorIds) => {
    const requestedSectorIds = Array.from(new Set(
      (sectorIds || []).map((sectorId) => String(sectorId || '').trim()).filter(Boolean)
    ));
    const normalizedSectorIds = requestedSectorIds.filter((sectorId) => {
      const node = renderedNodes.find((item) => String(item.id) === sectorId);
      return node?.guildState === 'blocked' && !node.isAvoidSelection;
    });
    if (!guildId || !normalizedSectorIds.length || schedulingNotification) return;

    setSchedulingNotification(true);
    try {
      const userId = String((await AsyncStorage.getItem('userId')) || '').trim();
      if (!userId) throw new Error('Не вдалося визначити користувача. Увійдіть у застосунок ще раз.');

      const updates = {};
      normalizedSectorIds.forEach((sectorId) => {
        updates[`guilds/${guildId}/quantumStateNotifications/${sectorId}/${userId}`] = {
          userId,
          sectorId,
          expectedState: 'blocked',
          createdAt: database.ServerValue.TIMESTAMP,
        };
      });
      await database().ref().update(updates);
      setScheduledSectorIds((current) => Array.from(new Set([...current, ...normalizedSectorIds])));
      Alert.alert(
        'Сповіщення заплановано',
        normalizedSectorIds.length === 1
          ? `Ви отримаєте push, коли сектор ${normalizedSectorIds[0].toUpperCase()} відкриється.`
          : `Ви отримаєте push, коли відкриється кожен із ${normalizedSectorIds.length} вибраних секторів.`
      );
    } catch (scheduleError) {
      console.error('Не вдалося запланувати сповіщення квантового сектора:', scheduleError);
      Alert.alert('Не вдалося запланувати сповіщення', scheduleError?.message || 'Спробуйте ще раз.');
    } finally {
      setSchedulingNotification(false);
    }
  };

  const isMultiNotificationScheduled = multiSelectedNodes.length > 0 &&
    multiSelectedNodes.every((node) => scheduledSectorIds.includes(String(node.id)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.stateText}>Завантаження мапи...</Text></View>
      ) : nodes.length ? (
        <View style={[styles.map, { height: mapHeight }]}>
          <WebView
            ref={webViewRef}
            key={`${mapKey}-${difficultyLevel}-${rotation}`}
            originWhitelist={['*']} source={webViewSource} style={styles.webView} onMessage={onMapMessage}
            javaScriptEnabled scrollEnabled={false} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} />
        </View>
      ) : (
        <View style={styles.state}><Text style={styles.errorTitle}>Мапа недоступна</Text><Text style={styles.stateText}>{error}</Text></View>
      )}
      {nodes.length > 0 && <View style={styles.meta}><Text style={styles.metaText}>{config?.raidName || config?.mapKey}</Text><Text style={styles.metaText}>Рівень {config?.difficultyLevel}</Text></View>}
      {multiSelectedNodes.length > 0 && (
        <MultiSectorDetails
          isNotificationScheduled={isMultiNotificationScheduled}
          isSchedulingNotification={schedulingNotification}
          nodes={multiSelectedNodes}
          onNotify={scheduleSectorNotifications}
          onRemove={removeMultiSelectedNode}
        />
      )}
      {selectedNode && !multiSelectedNodes.length && (
        <SectorDetails
          node={selectedNode}
          isNotificationScheduled={scheduledSectorIds.includes(String(selectedNode.id))}
          isSchedulingNotification={schedulingNotification}
          onNotify={scheduleSectorNotifications}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, paddingBottom: 24 },
  map: {
    width: '96%',
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.separator,
    marginTop: 12,
  },
  webView: { flex: 1, backgroundColor: COLORS.surface },
  state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  stateText: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center' },
  errorTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '600' },
  meta: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.separator },
  metaText: { color: COLORS.textSecondary, fontSize: 13 },
  multiDetails: { marginTop: 14, marginHorizontal: 16 },
  multiHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  multiCount: { flexShrink: 1, color: COLORS.textPrimary, fontSize: 19, fontWeight: '700' },
  multiSectionTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  selectedChip: { height: 42, flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surface, overflow: 'hidden' },
  selectedChipId: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  selectedChipIdText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeChipButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  aggregateNote: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  aggregateNoteText: { flex: 1, color: COLORS.textSecondary, fontSize: 11 },
  aggregateRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  aggregateCard: { flex: 1, minWidth: 0, minHeight: 70, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surface },
  aggregateLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 3 },
  aggregateValue: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  typesSummary: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surface },
  typeSummaryRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.surfaceHighlight },
  typeSummaryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  typeSummaryLabel: { flex: 1, color: COLORS.textSecondary, fontSize: 13 },
  typeSummaryCount: { fontSize: 14, fontWeight: '700' },
  details: { marginTop: 16, marginHorizontal: 16 },
  detailsHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  nodeId: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '700' },
  statusText: { flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  notifyButton: { minHeight: 36, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}14` },
  notifyButtonText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  notifyButtonDisabled: { opacity: 0.65 },
  detailsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator, marginVertical: 12 },
  sectionHeading: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  cardsRow: { flexDirection: 'row', gap: 12 },
  dataCard: { flex: 1, minWidth: 0, minHeight: 112, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surface, justifyContent: 'center' },
  fullWidthCard: { width: '100%', flex: 0, minHeight: 92, flexDirection: 'row', alignItems: 'center' },
  dataIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surfaceHighlight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  dataCardText: { flexShrink: 1 },
  dataLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  dataValue: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  progressContent: { flex: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  progressTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: COLORS.surfaceHighlight, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#42c7e8' },
  progressPercent: { width: 31, color: COLORS.textSecondary, fontSize: 11, textAlign: 'right' },
  participantsCard: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.separator, backgroundColor: COLORS.surface, overflow: 'hidden' },
  participantsTitleRow: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.separator },
  participantsTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  participantRow: { minHeight: 54, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.surfaceHighlight },
  rank: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.separator, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  rankText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700' },
  participantAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 9 },
  participantAvatarFallback: { width: 30, height: 30, borderRadius: 15, marginRight: 9, backgroundColor: COLORS.surfaceHighlight, alignItems: 'center', justifyContent: 'center' },
  participantName: { flex: 1, minWidth: 0, color: COLORS.textPrimary, fontSize: 12 },
  participantAmount: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600', marginLeft: 8 },
  participantPercent: { width: 38, color: '#35b86b', fontSize: 11, textAlign: 'right', marginLeft: 5 },
  emptyParticipants: { padding: 14, color: COLORS.textSecondary, fontSize: 12, textAlign: 'center' },
});
