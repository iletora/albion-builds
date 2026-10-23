/* Albion Builds — static build planner. No build step, works on GitHub Pages. */
(() => {
'use strict';

const SLOTS = [
  { key: 'weapon',  label: 'Weapon' },
  { key: 'offhand', label: 'Off-hand' },
  { key: 'head',    label: 'Head' },
  { key: 'armor',   label: 'Armor' },
  { key: 'shoes',   label: 'Shoes' },
  { key: 'cape',    label: 'Cape' },
  { key: 'potion',  label: 'Potion' },
  { key: 'food',    label: 'Food' },
];
const MAX_PER_SLOT = 3;      // main + 2 alternatives
const PNG_ROWS = 10;         // rows per image
const STORE_KEY = 'albionBuilds.v1';
const NEW_ROWS = 5;
const SITE_URL = 'iletora.github.io/albion-builds';   // printed at the bottom of every image

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, props) => { const e = document.createElement(tag); if (cls) e.className = cls; if (props) Object.assign(e, props); return e; };
const iconUrl = id => `icons/items/${id}.png`;
const phUrl = slot => `icons/slots/${slot}.png`;

/* ---------- Item helpers ---------- */
const ALL = {};               // id -> slot key
for (const [slot, groups] of Object.entries(window.CATALOG))
  for (const g of groups) for (const id of g.items) ALL[id] = slot;

const SET_NAMES = {
  CLOTH: ['Scholar', 'Cleric', 'Mage'], LEATHER: ['Mercenary', 'Hunter', 'Assassin'], PLATE: ['Soldier', 'Knight', 'Guardian'],
};
const ART = { AVALON: 'Avalonian', HELL: 'Demon', UNDEAD: 'Undead', KEEPER: 'Keeper', MORGANA: 'Morgana', CRYSTAL: 'Crystal', FEY: 'Fey', ROYAL: 'Royal', FISH: 'Fish', DRAGON: 'Dragonslayer', DRAGONAREA: 'Leyfin' };
function itemName(id) {
  let p = id.replace(/^T\d_/, '').split('_');
  const tier = (id.match(/^T(\d)/) || [])[1];
  const kinds = { HEAD: 'Hood/Helmet', ARMOR: 'Armor', SHOES: 'Shoes' };
  if (kinds[p[0]] && SET_NAMES[p[1]]) {
    const mat = p[1], rest = p[2];
    const piece = { HEAD: { CLOTH: 'Cowl', LEATHER: 'Hood', PLATE: 'Helmet' }, ARMOR: { CLOTH: 'Robe', LEATHER: 'Jacket', PLATE: 'Armor' }, SHOES: { CLOTH: 'Sandals', LEATHER: 'Shoes', PLATE: 'Boots' } }[p[0]][mat];
    const m = /^SET(\d)$/.exec(rest);
    const pre = m ? SET_NAMES[mat][m[1] - 1] : (ART[rest] || cap(rest));
    return `${pre} ${piece}`;
  }
  p = p.filter(x => !['2H', 'MAIN', 'OFF', 'MEAL', 'POTION', 'CAPEITEM', 'FW', 'HEAD', 'ARMOR', 'SHOES'].includes(x));
  const words = p.map(x => ART[x] || cap(x));
  if (/2H_/.test(id)) words.push('(2H)');
  return (tier ? `T${tier} ` : '') + words.join(' ');
}
function cap(s) { return s ? s[0] + s.slice(1).toLowerCase() : ''; }
const is2H = id => /_2H_/.test(id);

/* ---------- State ---------- */
const emptyRow = () => ({ slots: Object.fromEntries(SLOTS.map(s => [s.key, []])), notes: '' });
const newSet = (title = '') => ({ title, desc: '', rows: Array.from({ length: NEW_ROWS }, emptyRow) });
let project = { active: 0, sets: [newSet()] };
const undoStack = [], redoStack = [];

const cur = () => project.sets[project.active];
const snapshot = () => JSON.stringify(project);
function pushUndo(snap = snapshot()) {
  undoStack.push(snap); if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0; updateUndoButtons();
}
function commitTyping() { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur(); }
function mutate(fn) { commitTyping(); pushUndo(); fn(); persist(); render(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); project = JSON.parse(undoStack.pop()); persist(); render(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); project = JSON.parse(redoStack.pop()); persist(); render(); }
function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, snapshot()); } catch (e) { /* storage unavailable */ } }, 150);
}

/* Validate and normalise anything loaded from file / link / storage */
function normRow(r) {
  const row = emptyRow();
  if (r && typeof r === 'object') {
    row.notes = typeof r.notes === 'string' ? r.notes : '';
    for (const s of SLOTS) {
      const v = r.slots && r.slots[s.key];
      row.slots[s.key] = (Array.isArray(v) ? v : []).filter(id => typeof id === 'string' && ALL[id]).slice(0, MAX_PER_SLOT);
    }
  }
  return row;
}
function normSet(s) {
  const rows = Array.isArray(s && s.rows) ? s.rows.map(normRow) : [];
  return { title: typeof (s && s.title) === 'string' ? s.title.slice(0, 80) : '', desc: typeof (s && s.desc) === 'string' ? s.desc : '', rows: rows.length ? rows : [emptyRow()] };
}
function normProject(p) {
  if (p && Array.isArray(p.rows)) p = { sets: [p] };          // a single set
  const sets = Array.isArray(p && p.sets) ? p.sets.map(normSet) : [];
  if (!sets.length) throw new Error('No builds found in this file');
  return { active: Math.min(Math.max(0, p.active | 0), sets.length - 1), sets };
}

const rowEmpty = r => !r.notes.trim() && SLOTS.every(s => !r.slots[s.key].length);
const setEmpty = s => !s.title.trim() && !s.desc.trim() && s.rows.every(rowEmpty);
const offLocked = r => r.slots.weapon.length > 0 && r.slots.weapon.every(is2H);

/* ---------- Rendering ---------- */
function render() {
  renderTabs();
  renderSheet();
  updateUndoButtons();
}

function renderTabs() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  project.sets.forEach((s, i) => {
    const t = el('div', 'tab' + (i === project.active ? ' active' : ''));
    t.append(el('span', '', { textContent: s.title.trim() || 'Untitled' }));
    if (project.sets.length > 1) {
      const x = el('button', 'x', { textContent: '✕', title: 'Close this set' });
      x.onclick = e => { e.stopPropagation(); closeSet(i); };
      t.append(x);
    }
    t.onclick = () => { if (project.active !== i) { project.active = i; persist(); render(); } };
    tabs.append(t);
  });
  const add = el('button', 'tab-add', { textContent: '+ New set', title: 'Add another build set' });
  add.onclick = () => mutate(() => { project.sets.push(newSet()); project.active = project.sets.length - 1; });
  tabs.append(add);
}

function closeSet(i) {
  if (!setEmpty(project.sets[i]) && !confirm(`Close "${project.sets[i].title || 'Untitled'}"? You can undo with Ctrl+Z.`)) return;
  mutate(() => {
    project.sets.splice(i, 1);
    if (project.active >= project.sets.length) project.active = project.sets.length - 1;
    else if (project.active > i) project.active--;
  });
}

function slotTemplate(set) {
  return SLOTS.map(s => set.rows.some(r => r.slots[s.key].length > 1) ? 'calc(var(--slot) + 2px + var(--alt))' : 'var(--slot)').join(' ');
}

function renderSheet() {
  const set = cur();
  const title = $('#setTitle');
  if (document.activeElement !== title) title.value = set.title;
  const desc = $('#setDesc');
  if (document.activeElement !== desc) { desc.value = set.desc; autoGrow(desc); }
  const tpl = slotTemplate(set);

  const head = $('#colhead'); head.innerHTML = '';
  head.append(el('div'), el('div', 'c', { textContent: '#' }));
  const hs = el('div', 'slots'); hs.style.setProperty('--slot-tpl', tpl);
  for (const s of SLOTS) hs.append(el('div', 'c', { textContent: s.label }));
  head.append(hs, el('div', '', { textContent: 'Notes' }), el('div'));

  const rows = $('#rows'); rows.innerHTML = '';
  set.rows.forEach((r, i) => {
    if (i % PNG_ROWS === 0) rows.append(chunkBar(i, Math.min(i + PNG_ROWS, set.rows.length)));
    rows.append(renderRow(r, i, tpl));
  });
}

function renderRow(r, i, tpl) {
  const row = el('div', 'row');
  row.dataset.index = i;
  row.append(el('div', 'handle', { textContent: '⋮⋮', title: 'Drag to reorder' }));
  row.append(el('div', 'num', { textContent: i + 1 }));

  const slots = el('div', 'slots'); slots.style.setProperty('--slot-tpl', tpl);
  for (const s of SLOTS) slots.append(renderSlot(r, i, s.key));
  row.append(slots);

  const notes = el('textarea', 'notes', { placeholder: 'Notes: role, rotation, swaps…', value: r.notes, rows: 2 });
  let before = null;
  notes.onfocus = () => { before = snapshot(); };
  notes.oninput = () => { cur().rows[i].notes = notes.value; persist(); };
  notes.onchange = () => { if (before && notes.isConnected) { pushUndo(before); before = snapshot(); } };
  row.append(notes);

  const act = el('div', 'row-actions');
  const btn = (txt, title, fn, cls = '') => { const b = el('button', cls, { textContent: txt, title }); b.onclick = fn; act.append(b); };
  btn('🎲', 'Random build for this row', () => randomRow(i));
  btn('⧉', 'Duplicate row', () => mutate(() => cur().rows.splice(i + 1, 0, JSON.parse(JSON.stringify(cur().rows[i])))));
  btn('✕', 'Delete row', () => { mutate(() => { cur().rows.splice(i, 1); if (!cur().rows.length) cur().rows.push(emptyRow()); }); toast('Row deleted · Ctrl+Z to undo'); }, 'del');
  row.append(act);
  return row;
}

function renderSlot(r, i, key) {
  const items = r.slots[key];
  const wrap = el('div', 'slot');
  const tile = el('div', 'tile');
  const locked = key === 'offhand' && offLocked(r);
  if (locked) { tile.classList.add('locked'); tile.title = 'Two-handed weapon — no off-hand'; }
  if (items.length) {
    tile.append(el('img', '', { src: iconUrl(items[0]), alt: itemName(items[0]), draggable: false }));
    tile.title = items.map(itemName).join('  /  ');
  } else {
    tile.append(el('img', 'ph', { src: phUrl(key), alt: '', draggable: false }));
    if (!locked) tile.title = `Choose ${SLOTS.find(s => s.key === key).label.toLowerCase()}`;
  }
  if (!locked) {
    tile.onclick = () => openPicker(i, key);
    tile.oncontextmenu = e => { e.preventDefault(); if (items.length) mutate(() => { cur().rows[i].slots[key] = []; }); };
  }
  wrap.append(tile);
  if (items.length > 1) {
    const alts = el('div', 'alts');
    for (const id of items.slice(1)) alts.append(el('img', '', { src: iconUrl(id), alt: itemName(id), title: itemName(id), draggable: false }));
    wrap.append(alts);
  }
  return wrap;
}

/* ---------- Random ---------- */
const pickRand = a => a[Math.floor(Math.random() * a.length)];
function randomFor(key) {
  const groups = window.CATALOG[key].filter(g => g.key !== 'gatherer');
  return pickRand(groups.flatMap(g => g.items));
}
function rollRow(row) {
  for (const s of SLOTS) row.slots[s.key] = [randomFor(s.key)];
  if (is2H(row.slots.weapon[0])) row.slots.offhand = [];
}
let rolling = false;
function randomRow(i) {
  if (rolling) return;
  rolling = true;
  commitTyping();
  pushUndo();
  const row = cur().rows[i];
  let n = 0;
  const tick = () => {
    rollRow(row);
    const fresh = renderRow(row, i, slotTemplate(cur()));
    fresh.querySelectorAll('.slot').forEach(s => s.classList.add('spin'));
    const old = $(`#rows .row[data-index="${i}"]`);
    if (old) old.replaceWith(fresh);
    if (++n < 10) setTimeout(tick, 55 + n * 12);
    else { rolling = false; persist(); render(); }
  };
  tick();
}

/* ---------- Picker ---------- */
const pick = { row: -1, slot: null, group: null, before: null };

function openPicker(rowIdx, slot) {
  pick.row = rowIdx; pick.slot = slot; pick.before = snapshot();
  const groups = window.CATALOG[slot];
  const sel = cur().rows[rowIdx].slots[slot];
  const g = sel.length ? groups.find(g => g.items.includes(sel[0])) : null;
  pick.group = (g || groups[0]).key;
  $('#pickTitle').textContent = SLOTS.find(s => s.key === slot).label;
  $('#picker').hidden = false;
  renderPicker();
}
function closePicker() {
  if ($('#picker').hidden) return;
  $('#picker').hidden = true;
  if (pick.before && pick.before !== snapshot()) pushUndo(pick.before);
  persist(); render();
}
function pickSel() { return cur().rows[pick.row].slots[pick.slot]; }
function setPickSel(arr) {
  const row = cur().rows[pick.row];
  row.slots[pick.slot] = arr;
  if (pick.slot === 'weapon' && offLocked(row)) row.slots.offhand = [];
  persist();
}

function renderPicker() {
  const sel = pickSel();
  const selBox = $('#pickSel'); selBox.innerHTML = '';
  if (!sel.length) selBox.append(el('div', 'sel-empty', { textContent: 'Nothing selected yet.' }));
  sel.forEach((id, i) => {
    const it = el('div', 'sel-item' + (i === 0 ? ' main' : ''), { title: i ? `${itemName(id)} — click to make main` : itemName(id) });
    it.append(el('img', '', { src: iconUrl(id), alt: itemName(id) }));
    it.append(el('span', 'tag', { textContent: i === 0 ? 'Main' : 'Alt' }));
    const rm = el('button', 'rm', { textContent: '✕', title: 'Remove' });
    rm.onclick = e => { e.stopPropagation(); setPickSel(sel.filter(x => x !== id)); renderPicker(); };
    it.append(rm);
    if (i > 0) it.onclick = () => { setPickSel([id, ...sel.filter(x => x !== id)]); renderPicker(); };
    selBox.append(it);
  });

  const groups = window.CATALOG[pick.slot];
  const tabbed = pick.slot === 'weapon';   // only weapons are split into trees; everything else is shown at once
  const chips = $('#pickGroups'); chips.innerHTML = ''; chips.style.display = tabbed ? '' : 'none';
  for (const g of groups) {
    const c = el('button', 'chip' + (g.key === pick.group ? ' on' : ''), { textContent: g.label });
    c.onclick = () => { pick.group = g.key; renderPicker(); };
    chips.append(c);
  }

  const grid = $('#pickGrid'); grid.innerHTML = '';
  const makeItem = id => {
    const idx = sel.indexOf(id);
    const b = el('button', 'item' + (idx >= 0 ? ' sel' : ''), { title: itemName(id) });
    b.append(el('img', '', { src: iconUrl(id), alt: itemName(id) }));
    if (idx >= 0) b.append(el('span', 'badge', { textContent: idx + 1 }));
    b.onclick = () => {
      const s = pickSel();
      if (s.includes(id)) setPickSel(s.filter(x => x !== id));
      else if (s.length >= MAX_PER_SLOT) { toast(`Up to ${MAX_PER_SLOT} items per slot`); return; }
      else setPickSel([...s, id]);
      renderPicker();
    };
    b.ondblclick = () => {   // double-click: take this item and apply right away
      const s = pickSel();
      if (!s.includes(id) && s.length < MAX_PER_SLOT) setPickSel([...s, id]);
      closePicker();
    };
    return b;
  };
  const grouped = !tabbed && groups.length > 1;   // clothing: one line per material
  grid.classList.toggle('grouped', grouped);
  if (grouped) {
    grid.style.setProperty('--n', Math.max(...groups.map(g => g.items.length)));
    for (const g of groups) {
      const line = el('div', 'gline');
      line.append(el('div', 'glabel', { textContent: g.label }));
      const items = el('div', 'gitems');
      g.items.forEach(id => items.append(makeItem(id)));
      line.append(items);
      grid.append(line);
    }
  } else {
    const shown = tabbed ? (groups.find(g => g.key === pick.group) || groups[0]).items : groups.flatMap(g => g.items);
    shown.forEach(id => grid.append(makeItem(id)));
  }
}

/* ---------- File save / open ---------- */
function download(blob, name) {
  const a = el('a', '', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = s => (s || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60);
const today = () => new Date().toISOString().slice(0, 10);

function saveFile() {
  const data = { app: 'albion-builds', version: 1, saved: new Date().toISOString(), active: project.active, sets: project.sets };
  const name = project.sets.length === 1 && cur().title.trim() ? slug(cur().title) : `albion-builds-${today()}`;
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'text/plain' }), name + '.txt');
}

async function openFile(file) {
  try {
    const p = normProject(JSON.parse(await file.text()));
    const replace = project.sets.every(setEmpty) || confirm(
      `Open "${file.name}" (${p.sets.length} set${p.sets.length > 1 ? 's' : ''})?\n\nOK — replace current builds\nCancel — add them as new tabs`);
    mutate(() => {
      if (replace) project = p;
      else { project.sets.push(...p.sets); project.active = project.sets.length - p.sets.length; }
    });
    toast(`Loaded ${file.name}`);
  } catch (e) {
    alert('Could not read this file. Make sure it was saved by Albion Builds.\n\n' + e.message);
  }
}

/* ---------- Share link (current set, compressed into the URL hash) ---------- */
const b64u = {
  enc: bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
};
async function streamBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
async function shareLink() {
  const s = cur();
  let last = s.rows.length; while (last > 1 && rowEmpty(s.rows[last - 1])) last--;
  const compact = { t: s.title, d: s.desc, r: s.rows.slice(0, last).map(r => [SLOTS.map(x => r.slots[x.key]), r.notes]) };
  const bytes = await streamBytes(new TextEncoder().encode(JSON.stringify(compact)), new CompressionStream('deflate-raw'));
  const url = `${location.origin}${location.pathname}#b=${b64u.enc(bytes)}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied to clipboard'); }
  catch { prompt('Copy this link:', url); }
}
async function loadFromHash() {
  const m = /#b=([\w-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const json = new TextDecoder().decode(await streamBytes(b64u.dec(m[1]), new DecompressionStream('deflate-raw')));
    const c = JSON.parse(json);
    const set = normSet({ title: c.t, desc: c.d, rows: (c.r || []).map(([slots, notes]) => ({ notes, slots: Object.fromEntries(SLOTS.map((x, i) => [x.key, slots[i]])) })) });
    mutate(() => {
      if (project.sets.length === 1 && setEmpty(project.sets[0])) project.sets = [set];
      else project.sets.push(set);
      project.active = project.sets.length - 1;
    });
    toast('Opened shared build');
  } catch (e) { toast('This share link is broken'); }
}

/* ---------- PNG export ---------- */
const imgCache = new Map();
// Opened as a local file (file://)? Browsers then refuse to export a canvas that used
// local images, so icons are taken from the embedded copy in icons-data.js instead.
const LOCAL = location.protocol === 'file:';
let iconData = null;
function loadIconData() {
  if (!iconData) iconData = new Promise(res => {
    if (window.ICON_DATA) return res();
    const s = el('script', '', { src: 'icons-data.js' });
    s.onload = res; s.onerror = res; document.head.append(s);
  });
  return iconData;
}
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
    im.src = (LOCAL && window.ICON_DATA && window.ICON_DATA[src]) || src;
  }));
  return imgCache.get(src);
}
function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) {
        if (!line && ctx.measureText(word).width > maxW) {  // very long word: hard-break
          let chunk = '';
          for (const ch of word) { if (ctx.measureText(chunk + ch).width > maxW) { out.push(chunk); chunk = ''; } chunk += ch; }
          line = chunk;
        } else line = test;
      } else { out.push(line); line = word; }
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

async function renderPng(start = 0) {
  const set = cur();
  let rows = set.rows.slice(start, start + PNG_ROWS);
  while (rows.length && rowEmpty(rows[rows.length - 1])) rows.pop();
  if (!rows.length) { toast(`Rows ${start + 1}–${start + PNG_ROWS} are empty — nothing to export`); return null; }

  if (LOCAL) await loadIconData();
  await Promise.all([document.fonts.load('15px Ubuntu'), document.fonts.load('bold 26px Ubuntu'), document.fonts.load('500 15px Ubuntu')]).catch(() => {});
  const ids = new Set(rows.flatMap(r => SLOTS.flatMap(s => r.slots[s.key])));
  const imgs = {};
  await Promise.all([...ids].map(async id => { imgs[id] = await loadImg(iconUrl(id)); }));
  const ph = {};
  await Promise.all(SLOTS.map(async s => { ph[s.key] = await loadImg(phUrl(s.key)); }));

  const S = 2, PAD = 28, NUMW = 30, TILE = 72, ALT = 36, AG = 3, GAP = 8, RP = 10, RG = 8, NOTEW = 440, LH = 21, NOTEGAP = 18;
  const colW = SLOTS.map(s => rows.some(r => r.slots[s.key].length > 1) ? TILE + AG + ALT : TILE);
  const slotsW = colW.reduce((a, b) => a + b, 0) + GAP * (SLOTS.length - 1);
  const hasNotes = rows.some(r => r.notes.trim());
  const title = set.title.trim();

  const m = document.createElement('canvas').getContext('2d');
  m.font = '15px Ubuntu';
  const lines = rows.map(r => hasNotes ? wrapText(m, r.notes.trim(), NOTEW) : []);
  const rowH = lines.map(l => Math.max(TILE, l.length * LH) + RP * 2);

  const W = PAD * 2 + NUMW + slotsW + (hasNotes ? NOTEGAP + NOTEW : 0) + RP * 2;
  const desc = (set.desc || '').trim();
  let titleW = 0, descLines = [];
  if (title) { m.font = 'bold 26px Ubuntu'; titleW = Math.min(m.measureText(title).width, W * 0.45); }
  const descX = PAD + (title ? titleW + 33 : 0);
  if (desc) { m.font = '15px Ubuntu'; descLines = wrapText(m, desc, W - PAD - descX); }
  const titleH = (title || desc) ? Math.max(title ? 34 : 0, descLines.length * LH) + 18 : 0;
  const FOOT = 34;
  const H = PAD * 2 + titleH + rowH.reduce((a, b) => a + b, 0) + RG * (rows.length - 1) + FOOT;

  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#121418'; ctx.fillRect(0, 0, W, H);

  let y = PAD;
  if (title) {
    ctx.fillStyle = '#d4a649'; ctx.font = 'bold 26px Ubuntu'; ctx.textBaseline = 'top';
    ctx.fillText(title, PAD, y + 2, titleW);
  }
  if (desc) {
    if (title) { ctx.fillStyle = '#3a3f4b'; ctx.fillRect(descX - 17, y + 2, 2, titleH - 22); }
    ctx.fillStyle = '#c9c5bb'; ctx.font = '15px Ubuntu'; ctx.textBaseline = 'top';
    descLines.forEach((ln, j) => ctx.fillText(ln, descX, y + 3 + j * LH));
  }
  y += titleH;

  rows.forEach((r, i) => {
    const h = rowH[i];
    ctx.fillStyle = i % 2 ? '#1d2027' : '#1a1d23';
    rrect(ctx, PAD, y, W - PAD * 2, h, 8); ctx.fill();
    ctx.strokeStyle = '#2b303b'; ctx.lineWidth = 1; ctx.stroke();

    const cy = y + RP + (h - RP * 2 - TILE) / 2;   // tiles vertically centred
    ctx.fillStyle = '#8d8f99'; ctx.font = '500 15px Ubuntu'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(String(start + i + 1), PAD + RP + NUMW / 2, cy + TILE / 2);
    ctx.textAlign = 'left';

    let x = PAD + RP + NUMW;
    SLOTS.forEach((s, k) => {
      const items = r.slots[s.key];
      const locked = s.key === 'offhand' && offLocked(r);
      ctx.globalAlpha = locked ? 0.35 : 1;
      ctx.fillStyle = '#262a33'; rrect(ctx, x, cy, TILE, TILE, 6); ctx.fill();
      ctx.strokeStyle = '#333845'; ctx.stroke();
      if (items.length && imgs[items[0]]) ctx.drawImage(imgs[items[0]], x, cy, TILE, TILE);
      else if (ph[s.key]) { ctx.globalAlpha = locked ? 0.05 : 0.12; const p = TILE * 0.27; ctx.drawImage(ph[s.key], x + p, cy + p, TILE - p * 2, TILE - p * 2); }
      ctx.globalAlpha = 1;
      items.slice(1).forEach((id, j) => {
        const ax = x + TILE + AG, ay = cy + j * ALT;
        ctx.fillStyle = '#262a33'; rrect(ctx, ax, ay + 1, ALT, ALT - 2, 4); ctx.fill();
        if (imgs[id]) ctx.drawImage(imgs[id], ax, ay, ALT, ALT);
      });
      x += colW[k] + GAP;
    });

    if (hasNotes) {
      const nx = PAD + RP + NUMW + slotsW + NOTEGAP;
      const ny = y + RP + (h - RP * 2 - lines[i].length * LH) / 2;
      ctx.fillStyle = '#e6e2d8'; ctx.font = '15px Ubuntu'; ctx.textBaseline = 'top';
      lines[i].forEach((ln, j) => ctx.fillText(ln, nx, ny + j * LH + 2));
    }
    y += h + RG;
  });

  // footer: link to the site
  const fy = H - PAD - FOOT + 22;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.font = '500 14px Ubuntu'; ctx.fillStyle = '#d4a649';
  const urlW = ctx.measureText(SITE_URL).width;
  ctx.fillText(SITE_URL, W - PAD, fy);
  ctx.font = '14px Ubuntu'; ctx.fillStyle = '#8d8f99';
  ctx.fillText('Make your own builds at  ', W - PAD - urlW, fy);
  ctx.textAlign = 'left';

  return new Promise(res => cv.toBlob(res, 'image/png'));
}

function chunkBar(from, to) {
  const bar = el('div', 'chunk-bar');
  bar.append(el('span', 'chunk-label', { textContent: `Rows ${from + 1}–${from + PNG_ROWS}` }));
  const copy = el('button', '', { textContent: `Copy PNG ${from + 1}–${from + PNG_ROWS}`, title: 'Copy image of these rows to clipboard' });
  copy.onclick = () => copyPng(from);
  const dl = el('button', 'primary', { textContent: `Download PNG ${from + 1}–${from + PNG_ROWS}`, title: 'Download image of these rows' });
  dl.onclick = () => downloadPng(from);
  bar.append(copy, dl);
  return bar;
}
function pngName(start) {
  const base = slug(cur().title) || 'albion-build';
  return cur().rows.length > PNG_ROWS ? `${base}-${start + 1}-${start + PNG_ROWS}.png` : `${base}.png`;
}
async function downloadPng(start = 0) {
  const blob = await renderPng(start);
  if (blob) download(blob, pngName(start));
}
async function copyPng(start = 0) {
  if (!window.ClipboardItem || !navigator.clipboard) { toast('Copy not supported here — use Download PNG'); return; }
  let empty = false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPng(start).then(b => b || (empty = true, Promise.reject())) })]);
    toast(`Rows ${start + 1}–${start + PNG_ROWS} copied — paste into Discord`);
  } catch { if (!empty) toast('Copy not supported here — use Download PNG'); }
}

/* ---------- Drag to reorder rows (pointer events: mouse + touch) ---------- */
function startDrag(e, rowEl) {
  e.preventDefault();
  commitTyping();
  const els = [...$('#rows').querySelectorAll('.row')];
  const from = els.indexOf(rowEl);
  const centers = els.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
  const shift = rowEl.getBoundingClientRect().height + 6;
  const startY = e.clientY;
  let to = from;
  rowEl.classList.add('dragging');
  els.forEach(r => { if (r !== rowEl) r.style.transition = 'transform .15s'; });

  const move = ev => {
    const dy = ev.clientY - startY;
    rowEl.style.transform = `translateY(${dy}px)`;
    const c = centers[from] + dy;
    to = from;
    while (to < els.length - 1 && c > centers[to + 1]) to++;
    while (to > 0 && c < centers[to - 1]) to--;
    els.forEach((r, j) => {
      if (r === rowEl) return;
      const off = (from < j && j <= to) ? -shift : (to <= j && j < from) ? shift : 0;
      r.style.transform = off ? `translateY(${off}px)` : '';
    });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (to !== from) mutate(() => { const rs = cur().rows; rs.splice(to, 0, rs.splice(from, 1)[0]); });
    else render();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/* ---------- Misc UI ---------- */
function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

function bind() {
  $('#btnOpen').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; };
  $('#btnSave').onclick = saveFile;
  $('#btnShare').onclick = shareLink;
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnAddRow').onclick = () => mutate(() => cur().rows.push(emptyRow()));
  $('#btnDupSet').onclick = () => mutate(() => {
    const copy = JSON.parse(JSON.stringify(cur()));
    copy.title = (copy.title || 'Untitled') + ' (copy)';
    project.sets.splice(project.active + 1, 0, copy); project.active++;
  });

  const title = $('#setTitle');
  let before = null;
  title.onfocus = () => { before = snapshot(); };
  title.oninput = () => { cur().title = title.value; persist(); renderTabs(); };
  title.onchange = () => { if (before) { pushUndo(before); before = snapshot(); } };
  const desc = $('#setDesc');
  let beforeD = null;
  desc.onfocus = () => { beforeD = snapshot(); };
  desc.oninput = () => { cur().desc = desc.value; autoGrow(desc); persist(); };
  desc.onchange = () => { if (beforeD) { pushUndo(beforeD); beforeD = snapshot(); } };

  $('#pickClose').onclick = closePicker;
  $('#pickDone').onclick = closePicker;
  $('#pickClear').onclick = () => { setPickSel([]); renderPicker(); };
  $('#picker').onclick = e => { if (e.target.id === 'picker') closePicker(); };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePicker();
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (typing || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); saveFile(); }
  });

  // drop a saved file anywhere on the page
  document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); openFile(f); } });

  $('#rows').addEventListener('pointerdown', e => {
    const h = e.target.closest('.handle');
    if (h && e.button === 0) startDrag(e, h.closest('.row'));
  });

  window.addEventListener('hashchange', loadFromHash);
}

function init() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) project = normProject(JSON.parse(saved));
  } catch (e) { /* start fresh */ }
  bind();
  render();
  loadFromHash();
}
init();
})();
