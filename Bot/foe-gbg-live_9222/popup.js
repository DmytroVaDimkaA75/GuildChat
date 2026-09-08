let state = null;
let tickTimer = null;
let pullTimer = null;

const $rows    = document.getElementById('rows');
const $empty   = document.getElementById('empty');
const $mapId   = document.getElementById('mapId');
const $updated = document.getElementById('updated');
const $search  = document.getElementById('search');

function fmtDelta(sec) {
  if (sec <= 0) return 'відкрито';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return (h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
}

function render() {
  if (!state || !Array.isArray(state.provinces) || state.provinces.length === 0) {
    $rows.innerHTML = '';
    $empty.style.display = 'block';
    $mapId.textContent = '';
    $updated.textContent = '—';
    return;
  }

  $empty.style.display = 'none';
  $mapId.textContent = state.mapId ? `карта: ${state.mapId}` : '';
  $updated.textContent = `оновлено: ${new Date(state.lastUpdate).toLocaleTimeString()}`;

  const q = ($search.value || '').trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const myGuildId = state.myGuild?.id ?? null;

  let list = state.provinces.filter(p =>
    !q ||
    (p.short && p.short.toLowerCase().includes(q)) ||
    (p.title && p.title.toLowerCase().includes(q)) ||
    (p.ownerName && p.ownerName.toLowerCase().includes(q))
  );

  list = list.slice().sort((a, b) => {
    const aLocked = Number.isFinite(a.lockedUntil) && a.lockedUntil > now;
    const bLocked = Number.isFinite(b.lockedUntil) && b.lockedUntil > now;
    if (aLocked && bLocked) return (a.lockedUntil - b.lockedUntil);
    if (aLocked && !bLocked) return -1;
    if (!aLocked && bLocked) return  1;
    const aKey = (a.short || a.title || '').toString();
    const bKey = (b.short || b.title || '').toString();
    return aKey.localeCompare(bKey, 'uk');
  });

  const rowsHtml = list.map(p => {
    const locked = Number.isFinite(p.lockedUntil) && p.lockedUntil > now;
    const delta  = locked ? Math.max(0, p.lockedUntil - now) : 0;
    const isHQ   = Number.isFinite(p.totalBuildingSlots) && p.totalBuildingSlots === 1;

    let timeHtml;
    if (locked) {
      timeHtml = `<span class="time-locked">${fmtDelta(delta)}</span>`;
    } else {
      timeHtml = `<span class="time-open">${isHQ ? 'штаб' : 'відкрито'}</span>`;
    }

    const unixHtml = locked
      ? `<span class="unix-cell">${p.lockedUntil}</span>`
      : `<span class="muted">—</span>`;

    const dot = p.isAttackBattleType ? '<span class="attack-dot"></span>' : '<span class="def-dot"></span>';

    const buff = p.buffs || {};
    const parts = [];
    if ((buff.attritionReduction | 0) > 0) parts.push(`всередині: ⇩${buff.attritionReduction}%`);
    if ((p.adjacentAttritionAny | 0) > 0) {
      const partial = (p.adjacentTotal > 0 && p.adjacentKnown < p.adjacentTotal) ? '≥' : '';
      parts.push(`суміжні: ${partial}⇩${p.adjacentAttritionAny}%`);
    }
    if ((buff.attack  | 0) > 0) parts.push(`⚔️${buff.attack}%`);
    if ((buff.defense | 0) > 0) parts.push(`🛡️${buff.defense}%`);
    const buffsStr = parts.length ? ` <span class="muted">·</span> ${parts.join(' · ')}` : '';

    let infoCell = '';
    if (p.buildings && p.buildings.length) {
      const btags = p.buildings.slice(0, 4).map(b => `<span class="tag">${b}</span>`).join(' ');
      infoCell = `${btags}${buffsStr}`;
    } else {
      if (Number.isFinite(p.totalBuildingSlots)) {
        infoCell = (p.totalBuildingSlots === 1)
          ? `<span class="muted">—</span>${buffsStr}`
          : `<span class="muted">слотів: ${p.totalBuildingSlots}</span>${buffsStr}`;
      } else {
        infoCell = `<span class="muted">—</span>${buffsStr}`;
      }
    }

    const label = p.short || (p.title ? (p.title.split(':')[0]) : ('Сектор ' + p.id));
    const titleAttr = p.title ? ` title="${p.title.replace(/"/g, '&quot;')}"` : '';

    const displayedId = p.ownerClanId ?? p.ownerId ?? null;
    const swatch = myGuildId != null && displayedId != null && String(displayedId) === String(myGuildId)
      ? `<span class="swatch" style="background:#CDCDCD"></span>`
      : p.ownerColor
      ? `<span class="swatch" style="background:${p.ownerColor}"></span>`
      : `<span class="swatch none" title="немає даних"></span>`;

    const gid = (p.ownerClanId != null)
      ? `${p.ownerClanId}`
      : (p.ownerId != null ? `${p.ownerId}` : '<span class="muted">—</span>');

    return `
      <tr>
        <td>${timeHtml}</td>
        <td class="unix-cell">${unixHtml}</td>
        <td${titleAttr}>${dot}${label}</td>
        <td class="swatch-cell">${swatch}</td>
        <td class="id-cell">${gid}</td>
        <td>${p.ownerName ? `<span class="owner">${p.ownerName}</span>` : '<span class="muted">немає</span>'}</td>
        <td>${infoCell}</td>
      </tr>
    `;
  }).join('');

  $rows.innerHTML = rowsHtml;
}

function setState(next) {
  state = next;
  render();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(render, 1000);
}

function startPulling() {
  if (pullTimer) clearInterval(pullTimer);

  const pullOnce = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
      if (res?.ok) { setState(res.state); return; }
      chrome.runtime.sendMessage({ type: 'GET_STATE_FROM_PAGE' }, (res2) => {
        if (res2?.ok) setState(res2.state);
      });
    });
  };

  pullOnce();
  pullTimer = setInterval(pullOnce, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  startPulling();
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'GBG_PUSH') setState(msg.payload);
  });
  $search.addEventListener('input', render);
});
