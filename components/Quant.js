import database from '@react-native-firebase/database';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { GuildContext } from '../GuildContext';

const COLORS = {
  background: '#0f1115', surface: '#152330', surfaceHighlight: '#1b2b3b',
  primary: '#4ea1ff', textPrimary: '#f4f7fb', textSecondary: '#9aa3b2',
  danger: '#ff5b5b', separator: '#36516a',
};
const HORIZONTAL_STEP = 51;
const VERTICAL_STEP = 54;
const MAP_PADDING = 32;
const NODE_SIZE = 38;

const toNodeList = (nodes) => {
  if (Array.isArray(nodes)) return nodes.filter(Boolean);
  if (!nodes || typeof nodes !== 'object') return [];
  return Object.entries(nodes).map(([key, node]) => ({ ...node, id: node?.id || key }));
};

const getGeometry = (nodes) => {
  const positioned = nodes.filter((node) =>
    Number.isFinite(Number(node?.position?.x)) && Number.isFinite(Number(node?.position?.y))
  );
  const maxX = Math.max(1, ...positioned.map((node) => Number(node.position.x)));
  const maxY = Math.max(1, ...positioned.map((node) => Number(node.position.y)));
  return {
    width: MAP_PADDING * 2 + (maxX - 1) * HORIZONTAL_STEP + NODE_SIZE,
    height: MAP_PADDING * 2 + (maxY - 1) * VERTICAL_STEP + NODE_SIZE,
  };
};

const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const buildMapHtml = (nodes, geometry, selectedNodeId) => `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${COLORS.surface}}
svg{display:block;width:100%;height:100%;touch-action:manipulation}.route{stroke:${COLORS.separator};stroke-width:4;stroke-linecap:round}
.node{cursor:pointer}.shape{stroke:#0f1115;stroke-width:3}.node.avoid .shape{stroke:#ff9f43;stroke-width:4}
.node.current .shape,.node.selected .shape{stroke:#fff;stroke-width:5}.label{fill:#fff;font:700 14px Arial,sans-serif;text-anchor:middle;dominant-baseline:central;pointer-events:none}
</style></head><body>
<svg id="map" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="xMidYMid meet" aria-label="Мапа квантових вторгнень"></svg>
<script>
const nodes=${jsonForHtml(nodes)},selected=${jsonForHtml(selectedNodeId || '')},NS='http://www.w3.org/2000/svg',map=document.getElementById('map');
const byId=new Map(nodes.map(n=>[String(n.id),n]));
const point=n=>({x:${MAP_PADDING + NODE_SIZE / 2}+(Number(n.position.x)-1)*${HORIZONTAL_STEP},y:${MAP_PADDING + NODE_SIZE / 2}+(Number(n.position.y)-1)*${VERTICAL_STEP}});
const el=(name,attrs)=>{const node=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));return node};
const list=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
const className=n=>String(n.type?.__class__||'').toLowerCase();
const fightType=n=>String(n.type?.fightType||n.fightType||'').toLowerCase();
const finalBoss=n=>fightType(n)==='final-boss';
const start=n=>className(n).includes('start')||String(n.type?.type||'').toLowerCase()==='start';
const fill=n=>{if(finalBoss(n))return'${COLORS.danger}';if(start(n))return'#42c7e8';const s=String(n.state?.state||'').toLowerCase();if(s==='finished')return'${COLORS.primary}';if(s==='open')return'#35b86b';return'#67717e'};
const routes=el('g',{'aria-hidden':'true'}),drawn=new Set();
nodes.forEach(n=>{if(!n.position)return;list(n.connectedNodes).forEach(c=>{const id=String(c?.targetNodeId||''),target=byId.get(id);if(!target?.position)return;const key=[String(n.id),id].sort().join('-');if(drawn.has(key))return;drawn.add(key);const a=point(n),b=point(target);routes.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'route'}))})});map.appendChild(routes);
const nodeLayer=el('g',{});nodes.forEach(n=>{if(!n.position||!n.id)return;const p=point(n),classes=['node'];if(String(n.state?.indicator?.value||'')==='avoid')classes.push('avoid');if(n.currentNode||n.isCurrent)classes.push('current');if(String(n.id)===String(selected))classes.push('selected');const g=el('g',{class:classes.join(' '),role:'button',tabindex:'0','aria-label':'Вузол '+String(n.id).toUpperCase(),transform:'translate('+p.x+' '+p.y+')'});g.appendChild(el('circle',{r:${NODE_SIZE / 2},fill:fill(n),class:'shape'}));const text=el('text',{x:0,y:1,class:'label'});text.textContent=String(n.id).toUpperCase();g.appendChild(text);const press=()=>window.ReactNativeWebView?.postMessage(JSON.stringify({type:'nodePress',nodeId:String(n.id)}));g.addEventListener('click',press);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')press()});nodeLayer.appendChild(g)});map.appendChild(nodeLayer);
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

export default function Quant() {
  const { guildId } = useContext(GuildContext);
  const { width } = useWindowDimensions();
  const [config, setConfig] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId) {
      setLoading(false);
      setError('Не вибрано гільдію.');
      return undefined;
    }
    setLoading(true);
    setError('');
    const configRef = database().ref(`guilds/${guildId}/quantum`);
    const onConfig = (snapshot) => {
      const nextConfig = snapshot.val() || {};
      setConfig(nextConfig);
      setSelectedNodeId(null);
      if (!nextConfig.mapKey || nextConfig.difficultyLevel === undefined || nextConfig.difficultyLevel === null) {
        setNodes([]);
        setLoading(false);
        setError('Для гільдії не вказано mapKey або difficultyLevel.');
        return;
      }
      database().ref(`quantumMaps/${nextConfig.mapKey}/${nextConfig.difficultyLevel}/nodes`).once('value')
        .then((mapSnapshot) => {
          const nextNodes = toNodeList(mapSnapshot.val());
          setNodes(nextNodes);
          setError(nextNodes.length ? '' : 'Мапа не містить вузлів.');
        })
        .catch((loadError) => {
          console.error('Не вдалося завантажити мапу квантових вторгнень:', loadError);
          setNodes([]);
          setError('Не вдалося завантажити мапу.');
        })
        .finally(() => setLoading(false));
    };
    const onError = (loadError) => {
      console.error('Не вдалося завантажити налаштування квантових вторгнень:', loadError);
      setLoading(false);
      setError('Не вдалося завантажити налаштування мапи.');
    };
    configRef.on('value', onConfig, onError);
    return () => configRef.off('value', onConfig);
  }, [guildId]);

  const geometry = useMemo(() => getGeometry(nodes), [nodes]);
  const mapHeight = Math.max(220, width * 0.96 * geometry.height / geometry.width);
  const selectedNode = nodes.find((node) => String(node.id) === String(selectedNodeId));
  const html = useMemo(() => buildMapHtml(nodes, geometry, selectedNodeId), [nodes, geometry, selectedNodeId]);

  const onMapMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'nodePress') setSelectedNodeId(message.nodeId);
    } catch (messageError) {
      console.warn('Некоректне повідомлення від мапи:', messageError);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.stateText}>Завантаження мапи...</Text></View>
      ) : nodes.length ? (
        <View style={[styles.map, { height: mapHeight }]}>
          <WebView originWhitelist={['*']} source={{ html }} style={styles.webView} onMessage={onMapMessage}
            javaScriptEnabled scrollEnabled={false} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} />
        </View>
      ) : (
        <View style={styles.state}><Text style={styles.errorTitle}>Мапа недоступна</Text><Text style={styles.stateText}>{error}</Text></View>
      )}
      {nodes.length > 0 && <View style={styles.meta}><Text style={styles.metaText}>{config?.mapKey}</Text><Text style={styles.metaText}>Рівень {config?.difficultyLevel}</Text></View>}
      {selectedNode && (
        <View style={styles.details}>
          <View style={styles.detailsHeader}><Text style={styles.nodeId}>{String(selectedNode.id).toUpperCase()}</Text><Text style={styles.nodeType}>{getNodeTypeLabel(selectedNode)}</Text></View>
          {(selectedNode.currentProgress !== undefined || selectedNode.requiredProgress !== undefined) && <Text style={styles.detailText}>Прогрес: {selectedNode.currentProgress || 0} / {selectedNode.requiredProgress || 0}</Text>}
          {selectedNode.playersCount !== undefined && <Text style={styles.detailText}>Учасників: {selectedNode.playersCount}</Text>}
        </View>
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
  details: { marginTop: 16, marginHorizontal: 16, padding: 16, borderRadius: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceHighlight },
  detailsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  nodeId: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '700' },
  nodeType: { flexShrink: 1, color: COLORS.primary, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  detailText: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 },
});
