// Збирає самодостатній city-map.html з player-city.json
// Запуск:  node city-map/build.js
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'player-city.json'), 'utf8'));

// латинська1 → utf8 (лагодимо «кракозябри» в імені гравця)
function fixMojibake(s) {
  if (!s) return s;
  try {
    const out = Buffer.from(s, 'latin1').toString('utf8');
    return /�/.test(out) ? s : out;
  } catch (e) { return s; }
}

const CELL = 14;
const CAT = {
  main_building: { k: 'main',   label: 'Ратуша',                 v: '--c-main' },
  greatbuilding: { k: 'great',  label: 'Величні споруди',        v: '--c-great' },
  residential:   { k: 'res',    label: 'Житлові / події',        v: '--c-res' },
  production:    { k: 'prod',   label: 'Виробництво',            v: '--c-prod' },
  goods:         { k: 'goods',  label: 'Виробництво товарів',    v: '--c-goods' },
  military:      { k: 'mil',    label: 'Військові',              v: '--c-mil' },
  tower:         { k: 'tower',  label: 'Вежі-бонуси',            v: '--c-tower' },
  decoration:    { k: 'dec',    label: 'Декорації',              v: '--c-dec' },
  street:        { k: 'street', label: 'Дороги',                 v: '--c-street' },
  hub_main:      { k: 'hub',    label: 'Поселення (експедиції)', v: '--c-hub' },
  hub_part:      { k: 'hub',    label: 'Поселення (експедиції)', v: '--c-hub' }
};

// --- будівлі на карті ---
const items = [];
for (const [bid, b] of Object.entries(raw.buildings)) {
  if (b.x < 0 || b.y < 0) continue;
  const vr = raw.buildingVariants[b.variantId] || {};
  const type = vr.type || 'unknown';
  if (type === 'off_grid' || type === 'friends_tavern') continue;
  const cat = CAT[type] || { k: 'other', label: 'Інше', v: '--c-dec' };
  items.push({
    x: b.x, y: b.y,
    w: vr.width || 1, l: vr.length || 1,
    catKey: cat.k, catLabel: cat.label, catVar: cat.v, type,
    name: vr.name || b.buildingId,
    level: (b.level != null ? b.level : null),
    era: vr.era || null
  });
}

// --- сектори (форма міста) ---
const sectors = [];
for (const key of Object.keys(raw.sectors)) {
  const m = key.match(/x(\d+)_y(\d+)_(\d+)x(\d+)/);
  if (!m) continue;
  sectors.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
}

// --- межі ---
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const ext = (x, y, w, h) => {
  minX = Math.min(minX, x); minY = Math.min(minY, y);
  maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
};
sectors.forEach(s => ext(s.x, s.y, s.w, s.h));
items.forEach(it => ext(it.x, it.y, it.w, it.l));
minX -= 1; minY -= 1; maxX += 1; maxY += 1;
const W = (maxX - minX) * CELL;
const H = (maxY - minY) * CELL;

// порядок малювання: спершу дороги/дрібне, зверху великі споруди
const prio = { street: 0, decoration: 1, tower: 2, goods: 3, production: 4, residential: 5, hub_main: 6, hub_part: 6, greatbuilding: 7, main_building: 8 };
items.sort((a, b) => (prio[a.type] ?? 4) - (prio[b.type] ?? 4));

const round = n => Math.round(n * 100) / 100;

let svg = `<svg id="map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Схема розташування будівель міста">`;
for (const s of sectors) {
  svg += `<rect x="${round((s.x - minX) * CELL)}" y="${round((s.y - minY) * CELL)}" width="${round(s.w * CELL)}" height="${round(s.h * CELL)}" fill="var(--land)" stroke="var(--land-edge)" stroke-width="1"/>`;
}
items.forEach((it, i) => {
  const x = round((it.x - minX) * CELL) + 0.6;
  const y = round((it.y - minY) * CELL) + 0.6;
  const w = Math.max(1, round(it.w * CELL) - 1.2);
  const h = Math.max(1, round(it.l * CELL) - 1.2);
  svg += `<rect class="b" data-i="${i}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="var(${it.catVar})" stroke="var(--stroke)" stroke-width="0.9"/>`;
});
svg += `</svg>`;

// підрахунки для легенди / чипів
const counts = {};
items.forEach(it => {
  counts[it.catKey] = counts[it.catKey] || { n: 0, label: it.catLabel, v: it.catVar };
  counts[it.catKey].n++;
});
const legendOrder = ['main', 'great', 'res', 'prod', 'goods', 'mil', 'tower', 'dec', 'hub', 'street'];
const legendHtml = legendOrder.filter(k => counts[k]).map(k => {
  const c = counts[k];
  return `<span class="lg"><i style="background:var(${c.v})"></i>${c.label} <b>${c.n}</b></span>`;
}).join('');

const chips = [
  ['Будівель', items.length],
  ['Відкритих секторів', sectors.length],
  ['Величних споруд', counts.great ? counts.great.n : 0],
  ['Житлових / подій', counts.res ? counts.res.n : 0]
].map(c => `<div class="chip"><b>${c[1]}</b><span>${c[0]}</span></div>`).join('');

const playerName = fixMojibake(raw.player && raw.player.name) || '—';
const capAt = new Date(raw.capturedAt).toLocaleString('uk-UA', { dateStyle: 'long', timeStyle: 'short' });
const dataForClient = JSON.stringify(items);

const html = `<title>Мапа міста</title>
<meta name="description" content="Плановий вигляд міста зі збереженого файлу гри — світ ${raw.worldName}" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
  :root{
    --bg:#f4f3f7; --panel:#fff; --panel-2:#faf9fc; --edge:#e3e0ec;
    --ink:#201d2b; --muted:#6b6780; --accent:#6b4ee6;
    --land:rgba(107,78,230,.07); --land-edge:rgba(107,78,230,.22);
    --stroke:rgba(32,29,43,.28); --c-street:#c3bfd0;
    --shadow:0 1px 2px rgba(32,29,43,.06),0 8px 24px rgba(32,29,43,.08);
    --c-main:#d9a521; --c-great:#9b7ce0; --c-res:#4f9d69; --c-prod:#d07d3c;
    --c-goods:#3d94ad; --c-mil:#cf5b52; --c-tower:#b98a44; --c-dec:#8b8fa2; --c-hub:#6c86b0;
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --bg:#131019; --panel:#1c1926; --panel-2:#191622; --edge:#2d2939;
      --ink:#e9e6f2; --muted:#9a94ab; --accent:#a48bff;
      --land:rgba(164,139,255,.09); --land-edge:rgba(164,139,255,.20);
      --stroke:rgba(0,0,0,.45); --c-street:#403c4e;
      --shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.4);
    }
  }
  :root[data-theme="dark"]{
    --bg:#131019; --panel:#1c1926; --panel-2:#191622; --edge:#2d2939;
    --ink:#e9e6f2; --muted:#9a94ab; --accent:#a48bff;
    --land:rgba(164,139,255,.09); --land-edge:rgba(164,139,255,.20);
    --stroke:rgba(0,0,0,.45); --c-street:#403c4e;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.4);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'IBM Plex Sans',system-ui,sans-serif;line-height:1.5}
  .wrap{max-width:1200px;margin:0 auto;padding:28px 20px 60px}
  .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 6px}
  h1{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:clamp(26px,4vw,40px);margin:0;letter-spacing:.01em}
  .sub{color:var(--muted);margin:6px 0 0;font-size:15px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
  .chip{background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:8px 12px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:1px}
  .chip b{font-family:'Chakra Petch',sans-serif;font-size:18px;font-variant-numeric:tabular-nums}
  .chip span{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
  .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:22px 0 12px}
  .legend{display:flex;flex-wrap:wrap;gap:6px 14px}
  .lg{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted)}
  .lg i{width:13px;height:13px;border-radius:3px;display:inline-block;border:1px solid var(--stroke)}
  .lg b{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
  .zoom{display:flex;gap:6px;margin-left:auto}
  .zoom button{font-family:'IBM Plex Mono',monospace;font-size:14px;width:34px;height:34px;border-radius:8px;cursor:pointer;background:var(--panel);color:var(--ink);border:1px solid var(--edge);box-shadow:var(--shadow)}
  .zoom button:hover{border-color:var(--accent);color:var(--accent)}
  .zoom button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .stage{position:relative;background:var(--panel-2);border:1px solid var(--edge);border-radius:14px;overflow:auto;box-shadow:var(--shadow);max-height:74vh}
  .stage-inner{padding:24px;width:max-content}
  svg#map{display:block}
  svg#map rect.b{cursor:pointer;transition:opacity .12s}
  .stage.dim svg#map rect.b:not(.hot){opacity:.28}
  rect.b.hot{stroke:var(--ink);stroke-width:1.4}
  .tip{position:fixed;z-index:20;pointer-events:none;opacity:0;transition:opacity .1s;background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:10px 12px;box-shadow:var(--shadow);max-width:260px}
  .tip .t-name{font-family:'Chakra Petch',sans-serif;font-weight:600;font-size:14px;margin-bottom:3px}
  .tip .t-meta{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--muted);line-height:1.75}
  .tip .t-meta span{color:var(--ink)}
  footer{margin-top:20px;font-size:12.5px;color:var(--muted)}
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Forge of Empires · Зоряна ера: Відкриття</p>
    <h1>Мапа міста</h1>
    <p class="sub">Світ ${raw.worldName} · ${items.length} будівель на ${sectors.length} відкритих секторах</p>
    <div class="chips">${chips}</div>
  </header>
  <div class="toolbar">
    <div class="legend">${legendHtml}</div>
    <div class="zoom">
      <button id="zout" aria-label="Зменшити">&minus;</button>
      <button id="zreset" aria-label="Скинути масштаб">&#8635;</button>
      <button id="zin" aria-label="Збільшити">+</button>
    </div>
  </div>
  <div class="stage" id="stage"><div class="stage-inner">${svg}</div></div>
  <div class="tip" id="tip"><div class="t-name" id="tipName"></div><div class="t-meta" id="tipMeta"></div></div>
  <footer>Побудовано зі знімка гри від ${capAt}. Кожен квадратик — одна клітинка міста; розмір прямокутника відповідає розміру будівлі з файлу. Наведіть вказівник на будівлю, щоб побачити її назву. Позаміські об'єкти (таверна, експедиції тощо) не показані.</footer>
</div>
<script>
  var ITEMS = ${dataForClient};
  var W = ${W}, H = ${H};
  var stage = document.getElementById('stage');
  var tip = document.getElementById('tip'), tipName = document.getElementById('tipName'), tipMeta = document.getElementById('tipMeta');
  var lastHot = null;
  function show(it, cx, cy){
    tipName.textContent = it.name;
    var rows = ['тип: <span>' + it.catLabel + '</span>'];
    if (it.level != null) rows.push('рівень: <span>' + it.level + '</span>');
    rows.push('розмір: <span>' + it.w + '\\u00d7' + it.l + '</span>');
    rows.push('координати: <span>' + it.x + ', ' + it.y + '</span>');
    if (it.era) rows.push('епоха: <span>' + it.era + '</span>');
    tipMeta.innerHTML = rows.join('<br>');
    tip.style.opacity = '1';
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = cx + 16, top = cy + 16;
    if (left + tw > innerWidth - 8) left = cx - tw - 16;
    if (top + th > innerHeight - 8) top = cy - th - 16;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hide(){
    tip.style.opacity = '0';
    stage.classList.remove('dim');
    if (lastHot){ lastHot.classList.remove('hot'); lastHot = null; }
  }
  stage.addEventListener('mousemove', function(e){
    var t = e.target;
    if (t && t.classList && t.classList.contains('b')){
      if (lastHot !== t){
        if (lastHot) lastHot.classList.remove('hot');
        t.classList.add('hot'); lastHot = t; stage.classList.add('dim');
      }
      show(ITEMS[+t.getAttribute('data-i')], e.clientX, e.clientY);
    } else hide();
  });
  stage.addEventListener('mouseleave', hide);
  var z = 1, svgEl = document.getElementById('map');
  function apply(){ svgEl.setAttribute('width', Math.round(W * z)); svgEl.setAttribute('height', Math.round(H * z)); }
  document.getElementById('zin').onclick = function(){ z = Math.min(3, z * 1.25); apply(); };
  document.getElementById('zout').onclick = function(){ z = Math.max(.4, z / 1.25); apply(); };
  document.getElementById('zreset').onclick = function(){ z = 1; apply(); };
  var avail = stage.clientWidth - 48;
  if (W > avail){ z = Math.max(.4, avail / W); apply(); }
</script>
`;

fs.writeFileSync(path.join(DIR, 'city-map.html'), html, 'utf8');
console.log('city-map.html готово:', items.length, 'будівель,', sectors.length, 'секторів,', W + 'x' + H, 'px');
