// Mealcat — 주간 식단 계획 + 사진 기록 (서버·AI 없음, 데이터는 이 기기 IndexedDB)
'use strict';

/* ───────── 작은 도구 ───────── */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ic = (id, cls = '', vb = '0 0 32 32') => `<svg class="dd ${cls}" viewBox="${vb}" aria-hidden="true"><use href="#${id}"/></svg>`;
const CAT_VB = { 'cat-sit': '0 0 74 86', 'cat-peek': '0 0 80 46', 'cat-sleep': '0 0 96 56', tulip: '0 0 32 42' };
const art = (id, cls = '') => ic(id, cls, CAT_VB[id] || '0 0 32 32');

/* ───────── 날짜 ───────── */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayStr = () => ymd(new Date());
const mondayOf = s => { const d = parse(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ymd(d); };
const weekDays = mon => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(mon, i));
const isWeekend = s => [0, 6].includes(parse(s).getDay());
const isTwo = s => isWeekend(s) || !!state.weeks[mondayOf(s)]?.days[s]?.two; // 주말 또는 2끼 날(휴일·휴가)
const slotsOf = s => isTwo(s) ? ['BR', 'D'] : ['B', 'L', 'D'];
const hhmm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ───────── 언어 ───────── */
const t = (ko, en) => state.lang === 'en' ? en : ko;
const DOW = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const DOW_L = { ko: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dow = s => DOW[state.lang][parse(s).getDay()];
const dowL = s => DOW_L[state.lang][parse(s).getDay()];
const dateL = s => { const d = parse(s); return t(`${d.getMonth() + 1}월 ${d.getDate()}일`, `${MON_EN[d.getMonth()]} ${d.getDate()}`); };
const rangeL = mon => {
  const a = parse(mon), b = parse(addDays(mon, 6));
  return t(`${a.getMonth() + 1}.${a.getDate()} – ${b.getMonth() + 1}.${b.getDate()}`,
    `${MON_EN[a.getMonth()]} ${a.getDate()} – ${a.getMonth() === b.getMonth() ? '' : MON_EN[b.getMonth()] + ' '}${b.getDate()}`);
};
const SLOT = { B: ['아침', 'Breakfast'], L: ['점심', 'Lunch'], D: ['저녁', 'Dinner'], BR: ['브런치', 'Brunch'] };
const slotL = k => t(...SLOT[k]);
const PREP = { fridge: ['상밀', 'Fridge'], freezer: ['냉밀', 'Freezer'] };
const prepL = ty => t(...PREP[ty]);
const STATUS = { planned: ['계획대로', 'As planned'], changed: ['바꿈', 'Changed'], out: ['외식', 'Out'] };
const OUT = '외식';

/* ───────── 저장소 (IndexedDB) ───────── */
let db;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open('mealcat', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = (store, mode, fn) => new Promise((res, rej) => {
  const x = db.transaction(store, mode); const st = x.objectStore(store); const out = fn(st);
  x.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
  x.onerror = () => rej(x.error);
});
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const photoPut = (id, blob) => tx('photos', 'readwrite', s => s.put(blob, id));
const photoGet = id => tx('photos', 'readonly', s => s.get(id));
const photoDel = id => tx('photos', 'readwrite', s => s.delete(id));
const photoKeys = () => tx('photos', 'readonly', s => s.getAllKeys());

/* ───────── 상태 ───────── */
let state = {
  v: 1, lang: 'ko', names: { me: '나', him: '남편' },
  menus: { B: [], F: [], L: [], D: [] }, recipes: [], snacks: ['커피', '요거트', '사과', '과자'], habits: [],
  weeks: {}, fridge: [], backupAt: null, importedAt: null
};
const S = { tab: 'today', day: todayStr(), weekOf: mondayOf(todayStr()), sub: 'grid', mt: 'menus', rq: '', rf: 'all', sheet: null };
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => kvSet('state', state), 250); };
const flush = () => { clearTimeout(saveT); return kvSet('state', state); };

const getWeek = (mon, make = true) => state.weeks[mon] || (make ? (state.weeks[mon] = { start: mon, days: {}, preps: [], memo: '' }) : null);
const getDay = (s, make = true) => { const w = getWeek(mondayOf(s), make); if (!w) return null; return w.days[s] || (make ? (w.days[s] = { slots: {}, snacks: [] }) : null); };
const getSlot = (s, k, make = true) => { const d = getDay(s, make); if (!d) return null; return d.slots[k] || (make ? (d.slots[k] = {}) : null); };
const prepOf = (s, id) => id ? (getWeek(mondayOf(s), false)?.preps || []).find(p => p.id === id) : null;
function prepLeft(w, id) {
  const p = w.preps.find(x => x.id === id); if (!p) return 0;
  let used = 0;
  for (const d of Object.values(w.days)) for (const sl of Object.values(d.slots)) { if (sl.pp === id) used++; if (sl.hp === id) used++; }
  return p.count - used;
}

/* 메뉴 이름 → 영어·별칭 */
let IDX = { en: {}, canon: {} };
function buildIndex() {
  const en = { [OUT]: 'Eating out' }, canon = {};
  for (const list of Object.values(state.menus)) for (const m of list) {
    if (m.en) en[m.name] = m.en;
    canon[m.name] = m.name;
    for (const a of m.aka || []) canon[a] = m.name;
  }
  for (const r of state.recipes) { if (r.name_en) en[r.name] = r.name_en; }
  IDX = { en, canon };
}
const m = name => {
  if (!name) return '';
  if (state.lang !== 'en') return name;
  return String(name).split('+').map(x => { x = x.trim(); return IDX.en[x] || IDX.en[IDX.canon[x]] || x; }).join(' + ');
};
const planName = (sl, who = 'me') => {
  if (!sl) return '';
  return who === 'him' ? (sl.h ?? '') : (sl.p ?? '');
};
const outL = a => m(OUT) + (a?.o ? ' · ' + a.o : '');

/* ───────── 사진 ───────── */
const urls = new Map();
async function purl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await photoGet(id); if (!b) return '';
  const u = URL.createObjectURL(b); urls.set(id, u); return u;
}
const pimg = id => `<img data-pid="${esc(id)}" alt="">`;
function hydrate() { document.querySelectorAll('img[data-pid]:not([src])').forEach(async img => { const u = await purl(img.dataset.pid); if (u) img.src = u; }); }
async function shrink(file, max = 1024) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}

/* ───────── 그리기 ───────── */
function render() {
  document.body.classList.toggle('en', state.lang === 'en');
  document.documentElement.lang = state.lang;
  const view = $('#view');
  const views = { today: vToday, week: () => S.sub === 'prep' ? vPrep() : vWeek(), history: vHistory, menus: vMenus };
  view.innerHTML = views[S.tab]();
  $('#tabs').innerHTML = [['today', 'daisy', t('오늘', 'Today')], ['week', 'i-grid', t('이번 주', 'Week')], ['history', 'i-book', t('지난 기록', 'History')], ['menus', 'bowl', t('메뉴', 'Menus')]]
    .map(([k, i, l]) => `<button class="tab${S.tab === k ? ' on' : ''}" data-a="tab" data-v="${k}">${ic(i)}${l}</button>`).join('');
  if (S.sheet) renderSheet();
  hydrate();
}

/* 오늘 */
function vToday() {
  const s = S.day, isToday = s === todayStr();
  const d = getDay(s, false);
  let h = `<div class="head">
    <div><div class="lab">${dowL(s)}
      <span class="nav"><button data-a="day" data-v="-1" aria-label="${t('전날', 'Previous day')}">${ic('i-back')}</button><button data-a="day" data-v="1" aria-label="${t('다음 날', 'Next day')}">${ic('i-next')}</button></span>
      ${isToday ? '' : `<button class="today-link" data-a="day" data-v="0">${t('오늘로', 'Today')}</button>`}</div>
      <div class="big">${dateL(s)}</div></div>
    ${art('cat-sit', 'cat')}</div>`;
  if (!state.importedAt && !state.recipes.length && !Object.keys(state.weeks).length) h += welcome();
  for (const k of slotsOf(s)) h += mealCard(s, k);
  const sn = d?.snacks || [];
  h += `<div class="snack-h"><b>${t('간식', 'Snacks')}</b><span>${t('누르면 지금 시각으로 남아요', 'Tap to log it now')}</span></div>`;
  if (sn.length) h += `<div class="snack-log">${sn.map((x, i) => `<button data-a="snack-del" data-v="${i}" aria-label="${t('지우기', 'Remove')}">${ic(snackIcon(x.n))}${esc(m(x.n))} <em>${hhmm(x.t)}</em></button>`).join('')}</div>`;
  h += `<div class="chips">${state.snacks.map(n => `<button class="chip pen" data-a="snack" data-v="${esc(n)}">${ic(snackIcon(n))}${esc(m(n))}</button>`).join('')}
    <button class="chip pen add" data-a="snack-new">${t('+ 직접 쓰기', '+ Write one')}</button></div>`;
  return h;
}
const SNACK_IC = [['커피', 'coffee'], ['차', 'coffee'], ['요거트', 'yogurt'], ['요플레', 'yogurt'], ['과자', 'cookie'], ['쿠키', 'cookie'], ['초콜릿', 'cookie'], ['도넛', 'cookie'], ['케이크', 'cookie'], ['김밥', 'onigiri'], ['주먹밥', 'onigiri'], ['빵', 'toast']];
const snackIcon = n => (SNACK_IC.find(([k]) => n.includes(k)) || [0, /사과|바나나|복숭아|딸기|과일|토마토|포도|배|귤/.test(n) ? 'apple' : 'cookie'])[1];

function mealCard(s, k) {
  const sl = getSlot(s, k, false) || {};
  const a = sl.a, plan = planName(sl), split = sl.h != null;
  const him = split ? himLine(s, sl) : '';
  let body;
  if (a && (a.photo || a.s)) {
    const nm = a.s === 'out' ? outL(a) : m(a.m || plan);
    const st = a.s ? t(...STATUS[a.s]) : t('이름 고르기', 'Pick a name');
    body = `<div class="card pen swap-in"><div class="rec">
      ${a.photo ? `<button class="thumb pen" data-a="photo-view" data-d="${s}" data-k="${k}">${pimg(a.photo)}</button>` : ''}
      <div><div class="nm">${esc(nm) || `<span class="muted">${t('무엇을 먹었나요?', 'What did you eat?')}</span>`}</div>
        <div class="meta">${ic('i-check')}${a.t ? hhmm(a.t) + ' · ' : ''}${st}</div></div>
      <div class="tools">
        ${a.photo ? '' : `<button class="cam sm" data-a="shoot" data-d="${s}" data-k="${k}" aria-label="${t('사진 찍기', 'Take photo')}">${ic('i-cam', 'w')}</button>`}
        <button class="ghost pen" data-a="pick" data-d="${s}" data-k="${k}" data-mode="actual">${t('바꾸기', 'Change')}</button></div>
    </div>${him}</div>`;
  } else {
    const pr = prepOf(s, sl.pp);
    const w = getWeek(mondayOf(s), false);
    body = `<div class="card pen plan">
      ${pr ? `<span class="tag">${prepL(pr.type)}</span>` : ''}
      <div class="nm${plan ? '' : ' none'}">${plan ? esc(m(plan)) : t('계획 없음', 'Nothing planned')}</div>
      ${pr && w ? `<div class="sub">${t(`밀프랩 · 이번 주 ${Math.max(0, prepLeft(w, pr.id))}개 남음`, `Meal prep · ${Math.max(0, prepLeft(w, pr.id))} left this week`)}</div>` : ''}
      <div class="actions">
        <button class="cam" data-a="shoot" data-d="${s}" data-k="${k}" aria-label="${t('사진 찍기', 'Take photo')}">${ic('i-cam', 'w')}</button>
        <button class="icon-btn pen" data-a="album" data-d="${s}" data-k="${k}" aria-label="${t('앨범에서', 'From album')}">${ic('i-grid')}</button>
        ${plan ? `<button class="ghost pen" data-a="as-planned" data-d="${s}" data-k="${k}">${t('계획대로 먹음', 'As planned')}</button>` : ''}
        <button class="ghost pen" data-a="pick" data-d="${s}" data-k="${k}" data-mode="actual">${plan ? t('바꾸기', 'Change') : t('먹은 것 고르기', 'Log a meal')}</button>
      </div>${him}</div>`;
  }
  return `<div class="meal"><div class="meal-label">${slotL(k)}</div>${body}</div>`;
}
function himLine(s, sl) {
  const pr = prepOf(s, sl.hp);
  return `<div class="him-line">${ic('him', 'av')}${esc(state.names.him)} <b>${esc(m(sl.h)) || '—'}</b>${pr ? `<em>${prepL(pr.type)}</em>` : ''}</div>`;
}
function welcome() {
  return `<div class="welcome pen">${art('cat-peek')}
    <h2>${t('처음이에요', 'Welcome')}</h2>
    <p>${t('Claude가 만든 import.json을 불러오면 1년치 메뉴 목록과 레시피 카드가 들어와요. 없으면 그냥 시작해도 돼요.', 'Load the import.json Claude made to bring in your menu list and recipe cards. You can also just start.')}</p>
    <button class="solid" data-a="import">${ic('i-down', 'w')}${t('import.json 불러오기', 'Load import.json')}</button></div>`;
}

/* 이번 주 */
function weekStats(mon) {
  const w = getWeek(mon, false); const r = { photo: 0, changed: 0, out: 0, miss: 0, split: 0, plans: 0 };
  if (!w) return r;
  const today = todayStr();
  for (const [s, d] of Object.entries(w.days)) for (const [k, sl] of Object.entries(d.slots)) {
    if (!slotsOf(s).includes(k)) continue;
    if (sl.p || sl.h) r.plans++;
    if (sl.a?.photo) r.photo++;
    if (sl.a?.s === 'changed') r.changed++;
    if (sl.a?.s === 'out') r.out++;
    if (sl.h != null) r.split++;
    if (s < today && sl.p && !sl.a && !w.legacy) r.miss++;
  }
  return r;
}
function statLine(mon) {
  const r = weekStats(mon);
  return t(`사진 ${r.photo} · 바꿈 ${r.changed} · 외식 ${r.out} · 기록 없음 ${r.miss}${r.split ? ` · 따로 ${r.split}` : ''}`,
    `${r.photo} photos · ${r.changed} changed · ${r.out} out · ${r.miss} not logged${r.split ? ` · ${r.split} split` : ''}`);
}
function relWeek(mon) {
  const cur = mondayOf(todayStr());
  if (mon === cur) return t('이번 주', 'This week');
  if (mon === addDays(cur, 7)) return t('다음 주', 'Next week');
  if (mon === addDays(cur, -7)) return t('지난주', 'Last week');
  return mon < cur ? t('지난 기록', 'Past week') : t('앞으로', 'Upcoming');
}
function vWeek() {
  const mon = S.weekOf, w = getWeek(mon, false), today = todayStr();
  let h = `<div class="head">
    <div><div class="lab">${relWeek(mon)}<span class="nav"><button data-a="wk" data-v="-7" aria-label="${t('전 주', 'Previous week')}">${ic('i-back')}</button><button data-a="wk" data-v="7" aria-label="${t('다음 주', 'Next week')}">${ic('i-next')}</button></span>
      ${mon === mondayOf(today) ? '' : `<button class="today-link" data-a="wk" data-v="0">${t('이번 주로', 'This week')}</button>`}</div>
      <div class="big" style="font-size:28px">${rangeL(mon)}</div></div>
    <div class="wk-btns"><button class="icon-btn pen" data-a="share-him" aria-label="${t('남편에게 공유', 'Share')}">${ic('i-share')}</button>
      <button class="prep-btn pen" data-a="prep">${ic('daisy')}${t('다음 주 준비', 'Next week')}${art('cat-peek', 'peek')}</button></div></div>
  <div class="wk-stat">${w?.legacy ? t('메모앱에서 옮긴 계획 · ', 'Plan from my notes app · ') : ''}${statLine(mon)}</div>`;
  if (!weekStats(mon).plans) {
    const prev = weekStats(addDays(mon, -7)).plans;
    h += `<div class="empty-week pen dash">${art('cat-sleep')}<div><p>${t('칸을 눌러 메뉴를 적어요.', 'Tap a slot to write a dish.')}</p>
      ${prev ? `<button class="ghost pen" style="margin-top:8px" data-a="copy-week" data-v="${mon}">${t('지난주 그대로 복사', 'Copy last week')}</button>` : ''}</div></div>`;
  }
  h += `<div class="wk-cols"><span></span><span>${t('아침', 'Breakfast')}</span><span>${t('점심', 'Lunch')}</span><span>${t('저녁', 'Dinner')}</span></div>`;
  for (const s of weekDays(mon)) {
    const d = w?.days[s]; const sn = d?.snacks?.length || 0;
    const dayIn = `<b>${dow(s)}</b><small>${parse(s).getDate()}</small>${d?.two ? `<small class="two">${t('2끼', '2 meals')}</small>` : ''}${sn ? `<small class="sn">${ic('cookie')}${sn}</small>` : ''}`;
    h += `<div class="wk-row${s === today ? ' today' : ''}">${isWeekend(s) ? `<div class="wk-day">${dayIn}</div>` : `<button class="wk-day" data-a="two" data-v="${s}" aria-label="${dowL(s)} · ${d?.two ? t('3끼로 돌리기', 'Back to 3 meals') : t('2끼 날로 바꾸기', 'Make it a 2-meal day')}">${dayIn}</button>`}`;
    for (const k of slotsOf(s)) h += cell(s, k, d?.slots[k], s < today && !w?.legacy);
    h += `</div>`;
  }
  h += `<div class="wk-hint">${t('평일 요일을 누르면 2끼 날(브런치·저녁)로 바뀌어요', 'Tap a weekday to make it a 2-meal day (brunch + dinner)')}</div>`;
  if (w?.preps.length) h += `<div class="mp pen"><b>${t('밀프랩', 'Meal prep')}</b><span>${w.preps.map(p => `${prepL(p.type)} ${esc(m(p.name))} ${Math.max(0, prepLeft(w, p.id))}/${p.count}`).join(' · ')}</span></div>`;
  if (w && mon < mondayOf(today)) h += `<div class="wk-del"><button class="ghost pen" data-a="week-del" data-v="${mon}">${ic('i-x')}${t('이 주 기록 지우기', 'Delete this week')}</button></div>`;
  return h;
}
const weekPhotos = w => Object.values(w.days).flatMap(d => Object.values(d.slots)).map(sl => sl.a?.photo).filter(Boolean);
function cell(s, k, sl, past) {
  const span = k === 'BR' ? ' span' : '';
  const attrs = `data-a="pick" data-d="${s}" data-k="${k}"`;
  const lab = k === 'BR' || (isTwo(s) && k === 'D') ? `<span class="slot">${slotL(k)}</span>` : '';
  sl = sl || {};
  if (sl.a?.photo) {
    const b = sl.a.s === 'changed' ? `<span class="badge">${t('바꿈', 'Changed')}</span>` : sl.a.s === 'out' ? `<span class="badge out">${t('외식', 'Out')}</span>` : '';
    return `<button class="cell pen photo${span}" ${attrs} aria-label="${esc(sl.a.s === 'out' ? outL(sl.a) : m(sl.a.m || sl.p))}">${pimg(sl.a.photo)}${b}</button>`;
  }
  if (sl.h != null) return `<button class="cell pen split${span}" ${attrs}><span class="half">${ic('me', 'av')}<span class="nm">${esc(m(sl.p)) || '—'}</span></span><span class="half">${ic('him', 'av')}<span class="nm">${esc(m(sl.h)) || '—'}</span></span>${sl.n ? `<span class="memo">${esc(sl.n)}</span>` : ''}</button>`;
  const pr = prepOf(s, sl.pp);
  const name = sl.a?.s ? (sl.a.s === 'out' ? OUT : sl.a.m || sl.p) : sl.p;
  const memo = sl.n ? `<span class="memo">${esc(sl.n)}</span>` : '';
  if (!name) return `<button class="cell pen soft empty${span}" ${attrs} aria-label="${slotL(k)}">${lab}<span class="nm">+</span>${memo}</button>`;
  const miss = past && !sl.a;
  const out = name === OUT;
  return `<button class="cell pen${span}${miss ? ' miss' : ''}${out ? ' dash' : ''}" ${attrs}>${pr ? `<span class="prep">${prepL(pr.type)}</span>` : lab}<span class="nm">${esc(out ? outL(sl.a) : m(name))}</span>
    ${memo}${miss ? `<span class="note">${t('기록 없음', 'Not logged')}</span>` : ''}${sl.a?.s ? ic('i-check', 'ok') : ''}</button>`;
}

/* 다음 주 준비 */
function memoFound(memo) {
  if (!memo) return [];
  const names = new Set();
  for (const list of Object.values(state.menus)) for (const x of list) { names.add(x.name); (x.aka || []).forEach(a => names.add(a)); }
  state.recipes.forEach(r => names.add(r.name));
  const hits = [];
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    if (n.length < 2) continue;
    const i = memo.indexOf(n);
    if (i >= 0 && !hits.some(h => h.n.includes(n) && i >= h.i && i < h.i + h.n.length)) hits.push({ n, i });
  }
  const out = [];
  for (const h of hits.sort((a, b) => a.i - b.i)) { const c = IDX.canon[h.n] || h.n; if (!out.includes(c)) out.push(c); }
  return out;
}
function vPrep() {
  const cur = S.weekOf, next = addDays(cur, 7), wc = getWeek(cur, false), wn = getWeek(next, false);
  const found = memoFound(wn?.memo);
  const carry = (wc?.preps || []).filter(p => p.type === 'freezer' && prepLeft(wc, p.id) > 0 && !(wn?.preps || []).some(q => q.from === p.id));
  const sent = wc?.sentAt;
  fridgeTidy(); const soon = fridgeLive().filter(x => !isLong(x)).slice(0, 5);
  const backupDays = state.backupAt ? Math.floor((Date.now() - state.backupAt) / 864e5) : null;
  return `<button class="back" data-a="sub" data-v="grid">${ic('i-back')}${rangeL(cur)}</button>
  <div class="head" style="margin-top:0"><div><div class="big">${t('다음 주 준비', 'Plan next week')}</div><div class="lab">${rangeL(next)} · ${t('주말에 한 번', 'once on the weekend')}</div></div></div>
  <div class="step"><div class="num pen">1</div><div>
    <h3>${t('냉장고 확인', 'Check the fridge')}</h3>
    <span class="meta">${t('장 봤으면 영수증 목록 붙여넣기 · 다 쓴 것만 탭', 'Shopped? Paste the receipt list · tap what’s used up')}</span>
    ${soon.length ? `<div class="use-first">${soon.map(x => `<span class="pen soft">${ic(fIcon(x.name))}${esc(x.name)}<small>${leftL(fridgeLeft(x))}</small></span>`).join('')}</div>` : ''}
    <div class="two" style="margin-top:8px"><button class="ghost pen" data-a="fpaste">${ic('i-down')}${t('목록 붙여넣기', 'Paste list')}</button><button class="ghost pen" data-a="go-fridge">${t(`냉장고 전체 ${fridgeLive().length}`, `Whole fridge ${fridgeLive().length}`)}</button></div></div></div>
  <div class="step"><div class="num pen${sent ? ' done' : ''}">${sent ? ic('i-check', 'w') : '2'}</div><div>
    <h3>${t('이번 주를 코치에게 보내기', 'Send this week to the coach')}</h3>
    <span class="meta">${sent ? t(`${dateL(ymd(new Date(sent)))} ${hhmm(sent)}에 보냄`, `Sent ${dateL(ymd(new Date(sent)))} ${hhmm(sent)}`) + ' · ' : ''}${t('사진 모음 한 장 + 계획·실제 기록 글 + 냉장고 목록', 'One photo collage + plan vs. actual text + fridge list')}</span>
    <button class="ghost pen" style="margin-top:8px" data-a="send-coach">${ic('i-share')}${sent ? t('다시 보내기', 'Send again') : t('보내기', 'Send')}</button></div></div>
  <div class="step"><div class="num pen">3</div><div>
    <h3>${t('코치 메모 붙여넣기', 'Paste the coach’s note')}</h3>
    <div class="note pen"><textarea data-in="memo" data-v="${next}" placeholder="${t('코치가 준 답을 통째로 붙여 넣어요', 'Paste the coach’s whole reply')}">${esc(wn?.memo || '')}</textarea>${art('tulip', 'tulip')}</div>
    <div class="found" id="found">${foundHTML(found)}</div></div></div>
  <div class="step"><div class="num pen">4</div><div>
    <h3>${t('다음 주 밀프랩', 'Next week’s meal prep')}</h3>
    ${(wn?.preps || []).map(p => `<div class="mpline"><span class="tag">${prepL(p.type)}</span>${esc(m(p.name))} ×${p.count}${p.from ? `<em>${t('지난주에서 이어 옴', 'carried over')}</em>` : ''}
      <button class="x" data-a="prep-del" data-v="${p.id}" aria-label="${t('지우기', 'Remove')}">${ic('i-x')}</button></div>`).join('')}
    ${carry.map(p => `<div class="carry">${prepL(p.type)} ${esc(m(p.name))} ${t(`${prepLeft(wc, p.id)}개 남음`, `${prepLeft(wc, p.id)} left`)}<button class="ghost pen" data-a="prep-carry" data-v="${p.id}">${t('이어 가기', 'Carry over')}</button></div>`).join('')}
    <div class="mp-add"><select id="mp-type"><option value="fridge">${prepL('fridge')}</option><option value="freezer">${prepL('freezer')}</option></select>
      <input id="mp-name" placeholder="${t('예: 닭가슴살 카레', 'e.g. chicken curry')}"><input id="mp-count" type="number" inputmode="numeric" min="1" value="4" aria-label="${t('개수', 'Count')}">
      <button class="icon-btn pen" data-a="prep-add" aria-label="${t('밀프랩 추가', 'Add meal prep')}">${ic('i-plus')}</button></div></div></div>
  <div class="step"><div class="num pen">5</div><div>
    <h3>${t('칸 채우기', 'Fill the slots')}</h3>
    <button class="solid" data-a="go-week" data-v="${next}">${t('다음 주 칸 채우러 가기', 'Go fill next week')}${ic('i-next', 'w')}</button>
    ${weekStats(next).plans || !weekStats(cur).plans ? '' : `<button class="ghost pen" style="margin-top:8px" data-a="copy-week" data-v="${next}">${t('이번 주 그대로 복사해서 시작', 'Start from a copy of this week')}</button>`}</div></div>
  <div class="foot"><p>${backupDays == null ? t('아직 사진 백업을 안 했어요', 'No photo backup yet') : t(`사진 백업한 지 ${backupDays}일`, `Photos backed up ${backupDays} days ago`)} · <u data-a="backup">${t('지금 백업하기', 'Back up now')}</u></p>${art('cat-sleep', 'cat')}</div>`;
}
const foundHTML = f => f.length
  ? t(`분홍 밑줄 = 내 메뉴에서 찾은 이름 ${f.length}개 → 칸 고를 때 맨 위에 떠요<br>`, `Pink = ${f.length} dishes found in your menus → they show first when you fill a slot<br>`) + f.map(n => `<mark>${esc(m(n))}</mark>`).join(' ')
  : t('메모를 붙여 넣으면 내 메뉴·레시피 이름을 찾아 표시해요', 'Paste the note and I’ll mark the dishes I know');

/* 지난 기록 */
function vHistory() {
  const cur = mondayOf(todayStr());
  const mons = Object.keys(state.weeks).filter(k => k <= cur && (weekStats(k).plans || weekStats(k).photo)).sort().reverse();
  let h = `<div class="head"><div><div class="lab">${t('지난 기록', 'History')}</div><div class="big">${t(`${mons.length}주`, `${mons.length} weeks`)}</div></div>${art('cat-sit', 'cat')}</div>`;
  if (!mons.length) return h + `<div class="empty-week pen dash">${art('cat-sleep')}<p>${t('한 주를 기록하면 여기에 쌓여요.', 'Weeks you log will pile up here.')}</p></div>`;
  for (const mon of mons) {
    const w = state.weeks[mon]; const pics = [];
    for (const s of weekDays(mon)) { const d = w.days[s]; const sl = d && slotsOf(s).map(k => d.slots[k]).find(x => x?.a?.photo); pics.push(sl ? sl.a.photo : null); }
    h += `<button class="hist pen" data-a="go-week" data-v="${mon}"><b>${rangeL(mon)} <span class="muted small">${parse(mon).getFullYear()}</span></b><div class="meta">${w.legacy ? t('메모앱 기록', 'From notes app') : statLine(mon)}</div>
      ${pics.some(Boolean) || !w.legacy ? `<div class="strip">${pics.map(p => `<span>${p ? pimg(p) : ''}</span>`).join('')}</div>`
        : `<div class="dinners pn">${weekDays(mon).map(s => w.days[s]?.slots.D?.p).filter(Boolean).map(n => esc(m(n))).join(' · ')}</div>`}</button>`;
  }
  return h;
}

/* 메뉴·레시피 */
const R_IC = [[/파스타|면|우동|누들|국수|짬뽕|라면/, 'bowl'], [/계란|달걀|오믈|에그/, 'egg'], [/샐러드|양배추|겉절이/, 'salad'], [/토스트|빵|번/, 'toast'],
  [/케이크|쿠키|브라우니|초콜릿|과자|칩/, 'cookie'], [/문어|새우|연어|생선|굴비|세비체/, 'fish'], [/팬케이크/, 'pancake'], [/사과|바나나|토마토|딸기/, 'apple'], [/주먹밥|김밥/, 'onigiri'], [/피자/, 'pizza'], [/커피|우유/, 'coffee']];
const rIcon = n => (R_IC.find(([re]) => re.test(n)) || [0, 'bowl'])[1];
const CATS = ['아침', '점심', '저녁', '주말', '밀프랩', '간식·기타'];
const CAT_EN = { '아침': 'Breakfast', '점심': 'Lunch', '저녁': 'Dinner', '주말': 'Weekend', '밀프랩': 'Meal prep', '간식·기타': 'Snacks & more' };
const catL = c => t(c, CAT_EN[c] || c);
const doneL = c => t(c, { '완전': 'Complete', '거의 완전': 'Nearly complete', '부분': 'Partial' }[c] || c);
function vMenus() {
  if (S.mt === 'fridge') fridgeTidy();
  const nf = state.fridge.filter(x => !x.used && fridgeLeft(x) >= 0).length;
  let h = `<div class="head"><div><div class="lab">${t('메뉴와 레시피', 'Menus & recipes')}</div><div class="big">${{ menus: t('메뉴', 'Menus'), recipes: t('레시피', 'Recipes'), fridge: t('냉장고', 'Fridge') }[S.mt]}</div></div>
    <button class="icon-btn pen" data-a="settings" aria-label="${t('설정', 'Settings')}">${ic('daisy')}</button></div>
  <div class="seg pen top three"><button class="${S.mt === 'menus' ? 'on' : ''}" data-a="mt" data-v="menus">${t('메뉴', 'Menus')}</button><button class="${S.mt === 'recipes' ? 'on' : ''}" data-a="mt" data-v="recipes">${t('레시피', 'Recipes')} ${state.recipes.length}</button><button class="${S.mt === 'fridge' ? 'on' : ''}" data-a="mt" data-v="fridge">${t('냉장고', 'Fridge')} ${nf}</button></div>`;
  if (S.mt === 'fridge') return h + vFridge();
  if (!state.importedAt && !state.recipes.length) h += welcome();
  if (S.mt === 'menus') {
    for (const [k, ko, en] of [['B', '아침 기본', 'Breakfast base'], ['F', '과일', 'Fruit'], ['L', '점심', 'Lunch'], ['D', '저녁', 'Dinner']]) {
      const list = [...state.menus[k]].sort((a, b) => (b.n || 0) - (a.n || 0));
      h += `<div class="sec"><b>${t(ko, en)}</b><span>${list.length}</span><button class="today-link" style="margin-left:auto" data-a="menu-add" data-v="${k}">${t('+ 추가', '+ Add')}</button></div>
        ${list.map(x => `<div class="item pen soft"><button class="nm" data-a="menu-ren" data-v="${esc(x.name)}" aria-label="${t('이름 고치기', 'Rename')} ${esc(m(x.name))}">${esc(m(x.name))}${ic('i-pen', 'p')}</button><span class="n">${x.n || 0}${t('회', '×')}</span>
          <button class="x" data-a="menu-del" data-k="${k}" data-v="${esc(x.name)}" aria-label="${t('지우기', 'Remove')}">${ic('i-x', 'p')}</button></div>`).join('')}`;
    }
    h += `<div class="sec"><b>${t('간식 칩', 'Snack chips')}</b><button class="today-link" style="margin-left:auto" data-a="snack-new">${t('+ 추가', '+ Add')}</button></div>
      <div class="base-row">${state.snacks.map(n => `<button class="chip pen" data-a="snack-chip-del" data-v="${esc(n)}">${ic(snackIcon(n))}${esc(m(n))} ${ic('i-x', 'p')}</button>`).join('')}</div>`;
    return h;
  }
  const q = S.rq.trim();
  const fz = S.rf === 'fridge';
  let list = fz ? fridgeRecipes() : state.recipes.filter(r => S.rf === 'all' || (S.rf === 'part' ? r.completeness !== '완전' : r.category?.includes(S.rf)));
  if (q) list = list.filter(r => [r.name, r.name_en, ...(r.tags || []), ...(r.log || [])].join(' ').toLowerCase().includes(q.toLowerCase()));
  h += `<button class="solid" data-a="radd">${ic('i-plus', 'w')}${t('레시피 추가', 'Add a recipe')}</button>
    <div class="field pen">${ic('i-search')}<input data-in="rq" value="${esc(S.rq)}" placeholder="${t('이름·재료로 찾기 (예: 양배추)', 'Search by name or ingredient')}"></div>
    <div class="filters">${[['all', t('전체', 'All')], ['fridge', t('냉장고 재료로', 'From my fridge')], ...CATS.map(c => [c, catL(c)]), ['part', t('부분 레시피', 'Partial')]].map(([v, l]) => `<button class="chip pen${S.rf === v ? ' on' : ''}" data-a="rf" data-v="${esc(v)}">${l}</button>`).join('')}</div>
    <div class="rlist">${list.map(r => `<button class="rcard pen" data-a="recipe" data-v="${esc(r.id)}">${ic(rIcon(r.name), 'ic')}
      <span><b>${esc(state.lang === 'en' ? r.name_en || r.name : r.name)}</b><small>${(r.category || []).map(catL).join(' · ')}${r.log?.length ? ' · ' + t('내 기록에 있음', 'in my log') : ''}</small>${fz ? `<span class="fm">${t('냉장고', 'Fridge')}: ${r.fm.hit.map(n => `<u>${esc(n)}</u>`).join(' · ')}</span>` : ''}</span>
      ${fz ? `<span class="tag st">${r.fm.hit.length}/${r.fm.of}</span>` : r.completeness && r.completeness !== '완전' ? `<span class="tag st">${doneL(r.completeness)}</span>` : ''}</button>`).join('')
      || `<p class="muted small">${fz ? t('냉장고 재료와 맞는 레시피가 없어요. 냉장고 목록을 먼저 채워요.', 'No recipe matches the fridge yet. Fill the fridge list first.') : t('찾는 레시피가 없어요.', 'No recipes match.')}</p>`}</div>
    ${fz && list.length ? `<p class="small muted" style="line-height:1.6;margin-top:10px">${t('레시피 카드의 "주재료"와 냉장고 이름을 맞춰 봐요. 먼저 쓸 재료가 들어간 레시피가 위로.', 'Matches each card’s main ingredients against the fridge. Recipes using soon-to-expire items come first.')}</p>` : ''}`;
  return h;
}

/* 냉장고: 코치가 영수증을 읽어 준 목록. 품목마다 보관 기간 → 지나면 "아마 다 먹음"으로 접혔다가 1주 뒤 사라짐 */
const fridgeLeft = x => Math.round((parse(addDays(x.bought, x.days)) - parse(todayStr())) / 864e5);
const leftL = (n, ko) => {
  const k = ko || state.lang !== 'en';
  if (n <= 0) return k ? '오늘' : 'today';
  if (n < 7) return k ? `${n}일` : `${n}d`;
  if (n < 30) return k ? `${Math.floor(n / 7)}주` : `${Math.floor(n / 7)}w`;
  return k ? `${Math.floor(n / 30)}달` : `${Math.floor(n / 30)}mo`;
};
const isLong = x => x.snack || x.days >= 60;
function fridgeTidy() {
  const today = todayStr(), n = state.fridge.length;
  state.fridge = state.fridge.filter(x => x.used ? ymd(new Date(x.used)) === today : fridgeLeft(x) >= -7);
  if (state.fridge.length !== n) save();
}
const fridgeLive = () => state.fridge.filter(x => !x.used && fridgeLeft(x) >= 0).sort((a, b) => fridgeLeft(a) - fridgeLeft(b));
const F_IC = [[/우유|요거트|요플레|크림/, 'yogurt'], [/달걀|계란|에그/, 'egg'], [/빵|토스트|바게트|베이글|링/, 'toast'], [/치즈|피자/, 'pizza'], [/생선|연어|새우|참치|고등어|오징어|문어/, 'fish'],
  [/초콜릿|과자|쿠키|칩|젤리|케이크/, 'cookie'], [/만두|밥|떡|김밥/, 'onigiri'], [/사과|바나나|복숭아|딸기|포도|배|귤|오렌지|토마토|레몬|키위|베리|망고|과일/, 'apple'], [/커피|차|주스/, 'coffee'], [/면|파스타|라면|맥앤치즈|국수|쌀/, 'bowl']];
const fIcon = n => (F_IC.find(([re]) => re.test(n)) || [0, 'carrot'])[1];

/* 레시피 주재료 ↔ 냉장고 이름: 한쪽이 다른 쪽을 품으면 같은 것 (방울토마토 ⊃ 토마토) */
function fridgeMatch(r, live) {
  const tags = (r.tags || []).filter(x => x.length >= 2), hit = [];
  let soon = false;
  for (const tg of tags) {
    const f = live.find(x => x.name.includes(tg) || (x.name.length >= 2 && tg.includes(x.name.split(' ')[0])));
    if (f) { hit.push(f.name.split(' ')[0]); if (fridgeLeft(f) <= 3) soon = true; }
  }
  return { hit: [...new Set(hit)], of: tags.length, soon };
}
function fridgeRecipes() {
  const live = fridgeLive();
  return state.recipes.map(r => ({ ...r, fm: fridgeMatch(r, live) }))
    .filter(r => r.fm.hit.length >= 2 || (r.fm.hit.length && r.fm.hit.length === r.fm.of))
    .sort((a, b) => (b.fm.soon - a.fm.soon) || (b.fm.hit.length / b.fm.of - a.fm.hit.length / a.fm.of) || (b.fm.hit.length - a.fm.hit.length));
}

function fRow(x) {
  const n = fridgeLeft(x);
  return `<div class="fr${x.used ? ' used' : ''}">${ic(fIcon(x.name))}<button class="nm" data-a="fitem" data-v="${x.id}">${esc(x.name)}</button><span class="q">${esc(x.q || (x.snack ? t('간식', 'snack') : ''))}</span>
    <span class="d${!x.used && n <= 3 ? ' hot' : ''}">${x.used ? t('다 씀', 'used') : leftL(n)}</span>
    <button class="ck pen${x.used ? '' : ' soft'}" data-a="fused" data-v="${x.id}" aria-label="${x.used ? t('되돌리기', 'Undo') : t('다 씀', 'Used up')}">${ic('i-check')}</button></div>`;
}
function vFridge() {
  const all = [...state.fridge].sort((a, b) => fridgeLeft(a) - fridgeLeft(b));
  const gone = all.filter(x => !x.used && fridgeLeft(x) < 0);
  const cur = all.filter(x => x.used || fridgeLeft(x) >= 0);
  const first = cur.filter(x => !isLong(x) && Math.max(0, fridgeLeft(x)) <= 3), long = cur.filter(isLong), rest = cur.filter(x => !first.includes(x) && !long.includes(x));
  const shops = [...new Map(state.fridge.map(x => [x.bought, x.from])).entries()].sort((a, b) => b[0] < a[0] ? -1 : 1).slice(0, 2);
  const nr = fridgeRecipes().length;
  let h = shops.length ? `<div class="fr-sum">${t('장 본 날', 'Shopped')} ${shops.map(([d, f]) => `${dateL(d)}${f ? ' ' + esc(f) : ''}`).join(' · ')}</div>` : '';
  h += `<button class="solid" data-a="fpaste">${ic('i-down', 'w')}${t('영수증 목록 붙여넣기', 'Paste the receipt list')}</button>`;
  if (!state.fridge.length) return h + `<div class="empty-week pen dash">${art('cat-sleep')}<p>${t('영수증을 식단 코치에 올리고, 받은 "냉장고:" 목록을 붙여 넣어요. 품목마다 보관 기간이 붙어서 지나면 저절로 정리돼요.', 'Give the receipt to the coach and paste its “Fridge:” list here. Each item gets a shelf life and tidies itself away.')}</p></div>
    <button class="today-link" style="margin-top:4px" data-a="fitem-new">${t('+ 직접 쓰기', '+ Write one')}</button>`;
  if (nr) h += `<button class="fr-link pen soft" data-a="fz-recipes">${ic('bowl')}${t('냉장고 재료로 할 수 있는 레시피', 'Recipes from my fridge')}<em>${t(`${nr}개 →`, `${nr} →`)}</em></button>`;
  if (first.length) h += `<div class="sec"><b>${t('먼저 쓸 것', 'Use first')}</b><span>${t('3일 안', 'within 3 days')}</span></div>${first.map(fRow).join('')}`;
  if (rest.length) h += `<div class="sec"><b>${t('있음', 'In the fridge')}</b><span>${t('기한 순', 'by date')}</span></div>${rest.map(fRow).join('')}`;
  if (long.length) h += `<div class="sec"><b>${t('냉동 · 저장', 'Freezer & pantry')}</b><span>${t('오래 남음', 'keeps long')}</span></div>${long.map(fRow).join('')}`;
  h += `<button class="today-link" style="margin-top:12px" data-a="fitem-new">${t('+ 직접 쓰기', '+ Write one')}</button>`;
  if (gone.length) h += `<div class="gone-box pen dash"><div class="sec" style="margin:4px 0 4px"><b class="muted">${t('아마 다 먹음', 'Probably eaten')}</b><span>${t('기한 지남 · 1주 뒤 저절로 사라져요', 'past date · disappears after a week')}</span></div>
    ${gone.map(x => `<div class="gone-row"><span class="nm">${esc(x.name)}</span><span class="small">${dateL(x.bought)}</span><button class="ghost pen soft" data-a="fkeep" data-v="${x.id}">${t('아직 있음', 'Still have it')}</button></div>`).join('')}</div>`;
  return h;
}

function shelfDays(s) {
  if (/간식|snack/i.test(s)) return { days: 90, snack: true };
  if (/저장|오래|pantry/i.test(s)) return { days: 90 };
  const mm = s.match(/(\d+)\s*(일|주|달|개월|d|w|m)/i); if (!mm) return { days: 7 };
  return { days: +mm[1] * ({ '일': 1, d: 1, '주': 7, w: 7, '달': 30, '개월': 30, m: 30 }[mm[2].toLowerCase()] || 1) };
}
function parseFridge(text) {
  let date = todayStr(), from = '', inBlock = false;
  const HEAD = /^\**\s*(냉장고|fridge)\s*\**\s*[:：]\s*(.*)$/i, hasHead = text.split('\n').some(l => HEAD.test(l.trim()));
  const items = [];
  for (let line of text.split('\n')) {
    line = line.trim(); if (!line) continue;
    const h = line.match(HEAD);
    if (h) {
      inBlock = true; const d = h[2].match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (d) { date = `${d[1]}-${pad(+d[2])}-${pad(+d[3])}`; if (date > todayStr()) date = todayStr(); }
      from = h[2].replace(d?.[0] || '', '').replace(/\*/g, '').trim(); continue;
    }
    const bullet = /^[-•*]\s/.test(line);
    if (!bullet && !line.includes('|')) { inBlock = false; continue; }
    if (hasHead && !inBlock) continue;
    const [left, right = ''] = line.replace(/^[-•*]\s*/, '').split('|').map(s => s.trim());
    if (!left) continue;
    const qm = left.match(/^(.+?)\s+([\d.,]+\s*[a-zA-Z가-힣]*(?:\s*[×x]\s*\d+)?)$/);
    items.push({ name: (qm ? qm[1] : left).trim(), q: qm ? qm[2] : '', ...shelfDays(right) });
  }
  return { date, from, items };
}
function fpPreview(text) {
  const { date, items } = parseFridge(text || '');
  if (!items.length) return t('"- 이름 양 | 보관 기간" 줄을 찾아요', 'Looking for “- name qty | shelf life” lines');
  const have = items.filter(it => state.fridge.some(x => !x.used && x.name === it.name)).map(it => it.name);
  return t(`<mark>${items.length}가지</mark> 찾음 · ${dateL(date)} 장으로 넣어요`, `Found <mark>${items.length}</mark> · shopped ${dateL(date)}`)
    + (have.length ? '<br>' + t(`이미 있는 ${have.map(n => `<mark>${esc(n)}</mark>`).join(' ')} → 새로 산 걸로 기한만 늘려요`, `${have.map(n => `<mark>${esc(n)}</mark>`).join(' ')} already there — date refreshed`) : '');
}
function shFridgePaste() {
  return `<div class="sh-top"><div><b>${t('영수증 목록 붙여넣기', 'Paste the receipt list')}</b><p>${t('식단 코치에 영수증을 올리고 받은 "냉장고:" 답을 통째로', 'Give the coach your receipt, paste its whole “Fridge:” reply')}</p></div>${xBtn()}</div>
  <div class="field pen ta" style="margin-top:12px"><textarea class="mono" id="fp-text" data-in="fp" autofocus placeholder="냉장고: 2026-10-18 Billa&#10;- 달걀 20개 | 3주&#10;- 방울토마토 2팩 | 1주&#10;- 냉동 만두 | 3달">${esc(S.sheet.text || '')}</textarea></div>
  <div class="parse" id="fp-parse">${fpPreview(S.sheet.text)}</div>
  <button class="solid" style="margin-top:12px" data-a="fp-save">${t('냉장고에 넣기', 'Add to fridge')}</button>
  <p class="small muted">${t('형식은 설정 → 코치 프로젝트 지침에 들어 있어요.', 'The format is in Settings → Coach instructions.')}</p>`;
}
const SHELF = [[3, '3일', '3d'], [7, '1주', '1w'], [14, '2주', '2w'], [21, '3주', '3w'], [30, '1달', '1mo'], [90, '3달', '3mo'], ['snack', '간식', 'Snack']];
function shFitem() {
  const P = S.sheet, x = state.fridge.find(y => y.id === P.id);
  const on = v => v === 'snack' ? P.snack : !P.snack && P.days === v;
  return `<div class="sh-top"><div><b>${x ? esc(x.name) : t('직접 쓰기', 'Add an item')}</b><p>${x ? t(`${dateL(x.bought)} 장 · ${dateL(addDays(x.bought, x.days))}까지`, `Bought ${dateL(x.bought)} · until ${dateL(addDays(x.bought, x.days))}`) : t('오늘 산 걸로 넣어요', 'Counts from today')}</p></div>${xBtn()}</div>
  <div class="big-q"><div class="field pen"><input data-in="fi-name" value="${esc(P.name)}" placeholder="${t('이름', 'Name')}" ${x ? '' : 'autofocus'}></div><div class="field pen q"><input data-in="fi-q" value="${esc(P.q)}" placeholder="${t('양', 'Qty')}"></div></div>
  <div class="shelf">${SHELF.map(([v, ko, en]) => `<button class="pen${on(v) ? ' on' : ' soft'}" data-a="fi-days" data-v="${v}">${t(ko, en)}</button>`).join('')}</div>
  <div class="${x ? 'two' : ''}" style="margin-top:12px">${x ? `<button class="ghost pen" data-a="fused" data-v="${x.id}">${ic('i-check')}${t('다 씀', 'Used up')}</button>` : ''}<button class="solid" style="height:44px" data-a="fi-save">${t('저장', 'Save')}</button></div>`;
}

/* ───────── 시트 ───────── */
function openSheet(sheet) { S.sheet = sheet; renderSheet(true); }
function closeSheet() {
  const sh = $('.sheet'), dim = $('.dim'); S.sheet = null;
  if (!sh) return;
  sh.classList.remove('in'); dim?.classList.remove('in');
  setTimeout(() => { if (!S.sheet) $('#sheet-root').innerHTML = ''; }, 300);
}
function renderSheet(fresh) {
  const root = $('#sheet-root'); const html = { pick: shPick, recipe: shRecipe, radd: shRecipeAdd, settings: shSettings, ask: shAsk, fpaste: shFridgePaste, fitem: shFitem }[S.sheet.type]();
  let sh = $('.sheet');
  if (fresh || !sh) {
    root.innerHTML = `<div class="dim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="in-w"></div></div>`;
    sh = $('.sheet');
    sh.querySelector('.in-w').innerHTML = `<div class="grab"></div>${html}`;
    requestAnimationFrame(() => requestAnimationFrame(() => { sh.classList.add('in'); $('.dim')?.classList.add('in'); }));
  } else sh.querySelector('.in-w').innerHTML = `<div class="grab"></div>${html}`;
  hydrate();
  const f = sh.querySelector('[autofocus]'); if (f && fresh) setTimeout(() => f.focus(), 340);
}
const xBtn = () => `<button class="x" data-a="close" aria-label="${t('닫기', 'Close')}">${ic('i-x')}</button>`;

/* 메뉴 고르기 */
function slotMenus(k) {
  const by = l => [...(state.menus[l] || [])].sort((a, b) => (b.n || 0) - (a.n || 0));
  if (k === 'BR') { const seen = new Set(); return [...by('D'), ...by('B')].filter(x => !seen.has(x.name) && seen.add(x.name)).sort((a, b) => (b.n || 0) - (a.n || 0)); }
  return by(k);
}
function shPick() {
  const P = S.sheet, s = P.date, k = P.k, sl = getSlot(s, k, false) || {}, w = getWeek(mondayOf(s), false);
  const actual = P.mode === 'actual', split = sl.h != null;
  const cur = actual ? (sl.a?.s === 'out' ? OUT : sl.a?.m) : (P.side === 'him' ? sl.h : sl.p);
  const title = `${dowL(s)} ${slotL(k)}${actual ? ' · ' + t('먹은 것', 'what I ate') : ''}`;
  let h = `<div class="sh-top"><div><b>${title}</b><p>${actual ? t('계획', 'Plan') + ' · <em>' + (esc(m(sl.p)) || '—') + '</em>' : (cur ? t('지금 적힌 메뉴', 'Written now') + ' · <em>' + esc(m(cur)) + '</em>' : t('아직 비어 있어요', 'Still empty'))}${!actual && cur && cur !== OUT ? `<button class="ren" data-a="slot-ren" aria-label="${t('이름 고치기', 'Rename')}">${ic('i-pen', 'p')}</button>` : ''}</p></div>${xBtn()}</div>`;
  if (!actual) {
    h += `<div class="seg pen"><button class="${split ? '' : 'on'}" data-a="split" data-v="0">${t('같이 먹어요', 'Together')}</button><button class="${split ? 'on' : ''}" data-a="split" data-v="1">${t('따로 먹어요', 'Separately')}</button></div>`;
    if (split) h += `<div class="who">${['me', 'him'].map(who => `<button class="pen${P.side === who ? ' on' : ''}" data-a="side" data-v="${who}">${ic(who, 'av')}<span><b>${esc(state.names[who])}</b><small>${esc(m(planName(sl, who))) || '—'}</small></span></button>`).join('')}</div>`;
  }
  // 검색 → 메모를 맨 위에 (2026-10-24). 검색어가 있으면 결과만 보여 줌
  const q = (P.q || '').trim();
  h += `<div class="field pen">${ic('i-search')}<input data-in="pq" value="${esc(P.q || '')}" placeholder="${t('전체 메뉴·레시피에서 찾기 / 새 이름 쓰기', 'Search all, or type a new dish')}" enterkeyhint="done"></div>`;
  if (!actual) h += `<div class="field pen memo-f">${ic('i-pen')}<input data-in="slot-note" value="${esc(sl.n || '')}" placeholder="${t('메모 — 칸 아래 작게 보여요', 'Note — shown small under the dish')}" maxlength="40" enterkeyhint="done"></div>`;
  if (q) {
    const all = new Map();
    for (const l of Object.values(state.menus)) for (const x of l) if ([x.name, x.en, ...(x.aka || [])].join(' ').toLowerCase().includes(q.toLowerCase())) all.set(x.name, { n: x.name, c: x.n });
    for (const r of state.recipes) if ([r.name, r.name_en, ...(r.tags || [])].join(' ').toLowerCase().includes(q.toLowerCase())) all.set(r.name, { n: r.name, r: 1 });
    h += `<div class="cands" style="margin-top:8px">${[...all.values()].slice(0, 16).map(x => cand(x.n, cur, x.r)).join('')}
      <button class="cand pen dash" data-a="choose" data-v="${esc(q)}">+ “${esc(q)}”</button></div>`;
  } else h += pickLists(P, s, k, w, cur, actual);
  h += `<div class="two" style="margin-top:14px">
    <button class="ghost pen" data-a="choose" data-v="${OUT}">${ic('i-out')}${t('외식 · 배달', 'Eating out')}</button>
    <button class="ghost pen" data-a="clear-slot">${actual ? t('기록 지우기', 'Clear log') : t('비워 두기', 'Leave empty')}</button></div>`;
  return h;
}
function pickLists(P, s, k, w, cur, actual) {
  let h = '';
  if (!actual && s <= todayStr()) h += `<div class="pick-actual">${ic('i-cam', 'p')}<button class="today-link" data-a="goto-day" data-v="${s}">${t('이 날 기록하러 가기', 'Log this day')}</button></div>`;
  if (k === 'B') {
    const bases = slotMenus('B').slice(0, 12), fruits = [...state.menus.F].sort((a, b) => (b.n || 0) - (a.n || 0));
    const combo = [P.base, ...P.fruits].filter(Boolean).join('+');
    if (bases.length) h += `<div class="sec"><b>${t('아침 = 기본 + 과일', 'Breakfast = base + fruit')}</b><span>${t('하나씩 눌러 조합', 'tap to combine')}</span></div>
      <div class="base-row">${bases.map(x => `<button class="chip pen${P.base === x.name ? ' on' : ''}" data-a="base" data-v="${esc(x.name)}">${esc(m(x.name))}</button>`).join('')}</div>
      <div class="base-row" style="margin-top:7px">${fruits.map(x => `<button class="chip pen${P.fruits.includes(x.name) ? ' on' : ''}" data-a="fruit" data-v="${esc(x.name)}">${ic('apple')}${esc(m(x.name))}</button>`).join('')}</div>
      ${combo ? `<button class="solid" style="margin-top:10px" data-a="choose" data-v="${esc(combo)}">“${esc(m(combo))}” ${t('넣기', 'add')}</button>` : ''}`;
  }
  const found = memoFound(w?.memo);
  if (found.length) h += `<div class="sec"><b>${t('이번 주 후보', 'This week’s picks')}</b><span>${t('코치 메모에서 찾은 메뉴', 'from the coach’s note')}</span></div>
    <div class="cands">${found.map(n => cand(n, cur)).join('')}</div>`;
  if (w?.preps.length) h += `<div class="sec"><b>${t('밀프랩', 'Meal prep')}</b><span>${t('고르면 남은 개수가 줄어요', 'count drops when picked')}</span></div>
    ${w.preps.map(p => { const left = prepLeft(w, p.id); return `<button class="mprow pen${left <= 0 ? ' zero' : ''}" data-a="choose-prep" data-v="${p.id}"><span class="tag">${prepL(p.type)}</span><span class="nm">${esc(m(p.name))}</span><span class="left">${left > 0 ? t(`${left}개 남음`, `${left} left`) : t('다 씀', 'all used')}</span></button>`; }).join('')}`;
  const list = (k === 'B' ? [] : slotMenus(k)).filter(x => x.name !== OUT).slice(0, 16);
  if (list.length) h += `<div class="sec"><b>${t('자주 먹은 메뉴', 'Most eaten')}</b><span>${slotL(k)}</span></div><div class="cands">${list.map(x => cand(x.name, cur, 0, x.n)).join('')}</div>`;
  return h;
}
const cand = (n, cur, isR, cnt) => `<button class="cand pen${n === cur ? ' on' : ''}" data-a="choose" data-v="${esc(n)}">${esc(m(n))}${isR || state.recipes.some(r => r.name === n) ? `<span class="rcp">${t('레시피', 'Recipe')}</span>` : cnt ? `<span class="n">${cnt}</span>` : ''}</button>`;

function bumpMenu(k, name) {
  if (!name || name === OUT || name.includes('+')) {
    if (name?.includes('+')) name.split('+').forEach((x, i) => bumpMenu(i === 0 ? 'B' : 'F', x.trim()));
    return;
  }
  const l = k === 'BR' ? 'D' : k;
  const canon = IDX.canon[name] || name;
  for (const list of Object.values(state.menus)) { const x = list.find(y => y.name === canon); if (x) { x.n = (x.n || 0) + 1; return; } }
  state.menus[l].push({ name, n: 1 }); buildIndex();
}
/* 메뉴 이름 바꾸기: 목록 + 모든 주의 계획·기록·밀프랩까지, 옛 이름은 별칭으로 남김 */
function renameMenu(from, to, alsoSlot) {
  for (const list of Object.values(state.menus)) {
    const i = list.findIndex(x => x.name === from); if (i < 0) continue;
    const x = list[i], dup = list.find(y => y.name === to);
    if (dup) { dup.n = (dup.n || 0) + (x.n || 0); dup.en = dup.en || x.en; dup.aka = [...new Set([...(dup.aka || []), ...(x.aka || []), from])]; list.splice(i, 1); }
    else { x.name = to; x.aka = [...new Set([...(x.aka || []), from])].filter(a => a !== to); }
  }
  const olds = [from, alsoSlot].filter(Boolean);
  const sw = n => n && n.split('+').map(p => olds.includes(p.trim()) ? to : p).join('+');
  for (const w of Object.values(state.weeks)) {
    for (const d of Object.values(w.days)) for (const sl of Object.values(d.slots)) { if (sl.p) sl.p = sw(sl.p); if (sl.h) sl.h = sw(sl.h); if (sl.a?.m) sl.a.m = sw(sl.a.m); }
    for (const p of w.preps || []) p.name = sw(p.name);
  }
  buildIndex(); save();
}
const inMenus = n => Object.values(state.menus).some(l => l.some(x => x.name === n));

function choose(name, prepId, P = S.sheet, note) {
  const sl = getSlot(P.date, P.k);
  if (P.mode === 'actual') {
    const planned = (prepId && sl.pp === prepId) || (!prepId && name === sl.p);
    sl.a = { ...(sl.a || {}), s: name === OUT ? 'out' : planned ? 'planned' : 'changed', m: name, t: sl.a?.t || Date.now() };
    if (name === OUT && note) sl.a.o = note; else delete sl.a.o;
    bumpMenu(P.k, name); save(); closeSheet(); render(); return;
  }
  if (P.side === 'him') { sl.h = name; sl.hp = prepId || null; } else { sl.p = name; sl.pp = prepId || null; }
  if (!prepId) bumpMenu(P.k, name);
  save();
  if (sl.h != null && P.side === 'me') { P.side = 'him'; P.q = ''; P.base = null; P.fruits = []; renderSheet(); render(); toast(t(`${state.names.him} 몫을 골라요`, `Now pick for ${state.names.him}`)); return; }
  closeSheet(); render();
}

/* 레시피 보기 */
function shRecipe() {
  const r = state.recipes.find(x => x.id === S.sheet.id); if (!r) return '';
  const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
  const src = r.source || {};
  const [big, small] = state.lang === 'en' && r.name_en ? [r.name_en, r.name] : [r.name, r.name_en || ''];
  return `<div class="sh-top"><div><b>${esc(big)}</b><p>${esc(small)}</p></div>${xBtn()}</div>
  <div class="rdet">
    <div class="cats">${(r.category || []).map(c => `<span class="tag">${catL(c)}</span>`).join('')}${r.completeness ? `<span class="tag" style="border-style:dashed">${doneL(r.completeness)}</span>` : ''}</div>
    ${r.photo ? `<div class="thumb pen" style="width:100%;height:200px;margin-top:12px">${pimg(r.photo)}</div>` : ''}
    ${r.missing ? `<div class="miss">${t('원본에 없음', 'Not in the source')}: ${esc(r.missing)}</div>` : ''}
    ${r.ingredients?.length ? `<h4>${t('재료', 'Ingredients')}</h4><ul>${li(r.ingredients)}</ul>` : ''}
    ${r.steps?.length ? `<h4>${t('순서', 'Steps')}</h4><ol>${li(r.steps)}</ol>` : ''}
    ${r.tips?.length ? `<h4>${t('팁', 'Tips')}</h4><ul>${li(r.tips)}</ul>` : ''}
    ${r.log?.length ? `<h4>${t('내 식단 기록에 나온 이름', 'Names in my log')}</h4><p class="small">${r.log.map(esc).join(', ')}</p>` : ''}
    <div class="src">${src.account ? '@' + esc(src.account) + '<br>' : ''}${src.link ? `<a href="${esc(src.link)}" target="_blank" rel="noopener">${esc(src.link)}</a><br>` : ''}${(src.files || []).length ? t('사진첩 원본', 'Original in Photos') + ': ' + src.files.map(esc).join(', ') : ''}</div>
    <div class="two" style="margin-top:16px"><button class="ghost pen" data-a="recipe-copy" data-v="${esc(r.id)}">${ic('i-copy')}${t('글로 복사', 'Copy as text')}</button>
      <button class="ghost pen" data-a="recipe-del" data-v="${esc(r.id)}">${ic('i-x')}${t('지우기', 'Delete')}</button></div>
  </div>`;
}
function recipeText(r) {
  const L = (h, a, num) => a?.length ? `${h}:\n${a.map((x, i) => (num ? `${i + 1}. ` : '- ') + x).join('\n')}\n` : '';
  return `이름: ${r.name}\n${r.name_en ? `영어 이름: ${r.name_en}\n` : ''}분류: ${(r.category || []).join(', ')}\n주재료: ${(r.tags || []).join(', ')}\n${L('재료', r.ingredients)}${L('순서', r.steps, 1)}${L('팁', r.tips)}${r.source?.link ? `링크: ${r.source.link}\n` : ''}`;
}

/* 레시피 추가 */
function shRecipeAdd() {
  const P = S.sheet;
  let h = `<div class="sh-top"><div><b>${t('레시피 추가', 'Add a recipe')}</b><p>${t('코치가 준 카드 글을 붙여 넣거나, 이름만 적어 두세요', 'Paste the coach’s card, or just jot the name')}</p></div>${xBtn()}</div>
  <div class="seg pen"><button class="${P.mode === 'paste' ? 'on' : ''}" data-a="radd-mode" data-v="paste">${t('붙여넣기', 'Paste')}</button><button class="${P.mode === 'hand' ? 'on' : ''}" data-a="radd-mode" data-v="hand">${t('직접 쓰기', 'Write')}</button></div>`;
  if (P.mode === 'paste') return h + `<div class="field pen ta" style="margin-top:12px"><textarea class="mono" id="radd-text" autofocus placeholder="이름: 대파 참치 덮밥&#10;분류: 점심, 저녁&#10;주재료: 대파, 참치캔, 달걀&#10;재료:&#10;- 대파 1대&#10;순서:&#10;1. …"></textarea></div>
    <button class="solid" style="margin-top:10px" data-a="radd-paste">${t('카드 만들기', 'Make card')}</button>
    <p class="small muted">${t('카드 여러 장도 한 번에 넣을 수 있어요 (빈 줄 두 개로 나누거나 JSON).', 'Several cards at once work too (separate with two blank lines, or JSON).')}</p>`;
  return h + `<div class="field pen" style="margin-top:12px"><input id="rh-name" autofocus placeholder="${t('이름', 'Name')}"></div>
    <div class="field pen"><input id="rh-tags" placeholder="${t('주재료 (쉼표로)', 'Main ingredients (comma)')}"></div>
    <div class="field pen"><input id="rh-link" placeholder="${t('원본 링크 (선택)', 'Source link (optional)')}" inputmode="url"></div>
    <div class="base-row" style="margin-top:10px">${CATS.map(c => `<button class="chip pen${P.cats.includes(c) ? ' on' : ''}" data-a="rh-cat" data-v="${c}">${catL(c)}</button>`).join('')}</div>
    <div class="field pen ta" style="margin-top:8px"><textarea class="mono" id="rh-steps" style="min-height:90px" placeholder="${t('순서 (선택, 한 줄에 하나) — 비우면 부분 카드로 저장해요', 'Steps (optional, one per line) — empty saves a partial card')}"></textarea></div>
    <div class="two" style="margin-top:10px"><button class="ghost pen" data-a="rh-photo">${ic('i-cam')}${P.photo ? t('사진 바꾸기', 'Change photo') : t('스크린샷 1장', 'Add screenshot')}</button>
      <button class="solid" style="height:44px" data-a="rh-save">${t('저장', 'Save')}</button></div>`;
}
function parseCards(text) {
  text = text.trim(); if (!text) return [];
  try { const j = JSON.parse(text); return (Array.isArray(j) ? j : j.recipes || [j]).filter(x => x && x.name); } catch { }
  const KEYS = { '이름': 'name', 'name': 'name', '영어 이름': 'name_en', 'english': 'name_en', '분류': 'category', 'category': 'category', '주재료': 'tags', 'main': 'tags',
    '재료': 'ingredients', 'ingredients': 'ingredients', '순서': 'steps', 'steps': 'steps', '팁': 'tips', 'tips': 'tips', '출처': 'account', 'source': 'account', '링크': 'link', 'link': 'link', '원본에 없음': 'missing', 'missing': 'missing' };
  return text.split(/\n\s*\n\s*\n|\n-{3,}\n/).map(block => {
    const r = { ingredients: [], steps: [], tips: [] }; let cur = null;
    for (let line of block.split('\n')) {
      line = line.trim(); if (!line) continue;
      const mm = line.match(/^([^:：]{1,12})[:：]\s*(.*)$/);
      const key = mm && KEYS[mm[1].trim().toLowerCase()];
      if (key) {
        cur = key; const v = mm[2].trim();
        if (['ingredients', 'steps', 'tips'].includes(key)) { if (v) r[key].push(v); }
        else if (key === 'category' || key === 'tags') r[key] = v.split(/[,，·]/).map(x => x.trim()).filter(Boolean);
        else r[key] = v;
        if (!['ingredients', 'steps', 'tips'].includes(key)) cur = null;
      } else if (cur) r[cur].push(line.replace(/^(\d+[.)]|[-•*])\s*/, ''));
    }
    return r;
  }).filter(r => r.name).map(r => ({ ...r, source: { account: (r.account || '').replace(/^@/, ''), link: r.link || '' } }));
}
function addRecipes(cards) {
  for (const c of cards) {
    const r = { id: c.id && !state.recipes.some(x => x.id === c.id) ? c.id : 'u' + uid(), name: c.name, name_en: c.name_en || '', category: c.category || [], tags: c.tags || [],
      ingredients: c.ingredients || [], steps: c.steps || [], tips: c.tips || [], source: c.source || {}, missing: c.missing || '', log: c.log || [], photo: c.photo || null,
      completeness: c.completeness || (c.steps?.length ? '완전' : '부분'), added: Date.now() };
    state.recipes.unshift(r);
  }
  buildIndex(); save();
}

/* 설정 */
function shSettings() {
  return `<div class="sh-top"><div><b>${t('설정', 'Settings')}</b><p>Mealcat</p></div>${xBtn()}</div>
  <div class="set-row"><div><b>${t('언어', 'Language')}</b><small>${t('메뉴 이름도 함께 바뀌어요', 'Dish names switch too')}</small></div>
    <div class="lang pen"><button class="${state.lang === 'ko' ? 'on' : ''}" data-a="lang" data-v="ko">한국어</button><button class="${state.lang === 'en' ? 'on' : ''}" data-a="lang" data-v="en">English</button></div></div>
  <div class="set-row"><div><b>${t('이름', 'Names')}</b><small>${t('따로 먹는 칸에 보여요', 'Shown on split slots')}</small></div>
    <div class="names">${ic('me', 'av')}<input data-in="name-me" value="${esc(state.names.me)}">${ic('him', 'av')}<input data-in="name-him" value="${esc(state.names.him)}"></div></div>
  <div class="set-row"><div><b>${t('코치 프로젝트 지침', 'Coach instructions')}</b><small>${t('claude.ai 프로젝트에 붙여 넣는 글', 'Paste into the claude.ai project')}</small></div><button class="ghost pen" data-a="coach-copy">${ic('i-copy')}${t('복사', 'Copy')}</button></div>
  <div class="set-row"><div><b>${t('import.json 불러오기', 'Load import.json')}</b><small>${state.importedAt ? t(`불러온 날 ${dateL(ymd(new Date(state.importedAt)))}`, `Loaded ${dateL(ymd(new Date(state.importedAt)))}`) : t('메뉴 목록 + 레시피 카드', 'Menu list + recipe cards')}</small></div><button class="ghost pen" data-a="import">${ic('i-down')}${t('열기', 'Open')}</button></div>
  ${legacyWeeks().length ? `<div class="set-row"><div><b>${t('메모앱 기록 지우기', 'Remove notes-app weeks')}</b><small>${t(`불러온 옛 식단 ${legacyWeeks().length}주`, `${legacyWeeks().length} imported old weeks`)}</small></div><button class="ghost pen" data-a="legacy-del">${ic('i-x')}${t('지우기', 'Remove')}</button></div>` : ''}
  <div class="set-row"><div><b>${t('전체 백업 (사진 포함)', 'Full backup (with photos)')}</b><small>${state.backupAt ? t(`마지막 ${dateL(ymd(new Date(state.backupAt)))}`, `Last ${dateL(ymd(new Date(state.backupAt)))}`) : t('아직 없음 — 한 달에 한 번 권장', 'None yet — once a month')}</small></div><button class="ghost pen" data-a="backup">${ic('i-share')}${t('백업', 'Back up')}</button></div>
  <div class="set-row"><div><b>${t('글만 백업', 'Text-only backup')}</b><small>${t('작은 JSON, 사진 없음', 'Small JSON, no photos')}</small></div><button class="ghost pen" data-a="backup-json">${ic('i-share')}JSON</button></div>
  <div class="set-row"><div><b>${t('백업에서 되살리기', 'Restore')}</b><small>${t('.zip 또는 .json — 지금 기록을 덮어써요', '.zip or .json — replaces current data')}</small></div><button class="ghost pen" data-a="restore">${ic('i-down')}${t('열기', 'Open')}</button></div>
  <p class="small muted" id="storage-info" style="margin-top:14px"></p>`;
}

const outNote = async cur => { const o = await ask(t('외식 · 배달 — 뭐 먹었어요?', 'Eating out — what did you have?'), t('예: 쌀국수 (비워도 돼요)', 'e.g. pho (optional)'), cur || ''); return o == null ? null : o.trim(); };
const legacyWeeks =() => Object.keys(state.weeks).filter(k => state.weeks[k].legacy);

/* 짧은 입력 */
let askResolve;
function ask(title, placeholder = '', value = '') { return new Promise(res => { askResolve = res; openSheet({ type: 'ask', title, placeholder, value }); }); }
function shAsk() {
  const P = S.sheet;
  return `<div class="sh-top"><div><b>${esc(P.title)}</b></div>${xBtn()}</div>
  <div class="field pen" style="margin-top:12px"><input id="ask-in" autofocus value="${esc(P.value)}" placeholder="${esc(P.placeholder)}" enterkeyhint="done"></div>
  <button class="solid" style="margin-top:10px" data-a="ask-ok">${t('확인', 'OK')}</button>`;
}

/* ───────── 동작 ───────── */
let timer;
// 클립보드가 막히면(iOS에서 가끔) 옛 방식으로 한 번 더
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { }
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove(); return ok;
}
async function copyToast(text, msg) { toast(await copyText(text) ? msg : t('복사가 안 됐어요 · 다시 눌러 보세요', 'Couldn’t copy · try again')); }
function toast(msg) { const el = $('#toast-bar'); el.textContent = msg; el.classList.add('in'); clearTimeout(timer); timer = setTimeout(() => el.classList.remove('in'), 2200); }
let camTarget = null;

const A = {
  tab: v => { S.tab = v; S.sub = 'grid'; if (v === 'today') S.day = S.day || todayStr(); scrollTo(0, 0); render(); },
  day: v => { S.day = +v === 0 ? todayStr() : addDays(S.day, +v); render(); },
  wk: v => { S.weekOf = +v === 0 ? mondayOf(todayStr()) : addDays(S.weekOf, +v); render(); },
  sub: v => { S.sub = v; scrollTo(0, 0); render(); },
  prep: () => { S.sub = 'prep'; scrollTo(0, 0); render(); },
  'go-week': v => { S.tab = 'week'; S.sub = 'grid'; S.weekOf = v; scrollTo(0, 0); render(); },
  'goto-day': v => { closeSheet(); S.tab = 'today'; S.day = v; scrollTo(0, 0); render(); },
  mt: v => { S.mt = v; render(); },
  rf: v => { S.rf = v; render(); },
  close: () => { const pick = S.sheet?.type === 'pick'; if (S.sheet?.type === 'ask' && askResolve) { askResolve(null); askResolve = null; } closeSheet(); if (pick) render(); },

  pick: (v, el) => openSheet({ type: 'pick', date: el.dataset.d, k: el.dataset.k, mode: el.dataset.mode || 'plan', side: 'me', q: '', base: null, fruits: [] }),
  split: v => {
    const P = S.sheet, sl = getSlot(P.date, P.k);
    if (v === '1') { if (sl.h == null) { sl.h = sl.p || ''; sl.hp = sl.pp || null; } P.side = 'him'; }
    else { delete sl.h; delete sl.hp; P.side = 'me'; }
    save(); renderSheet(); render();
  },
  side: v => { S.sheet.side = v; renderSheet(); },
  base: v => { const P = S.sheet; P.base = P.base === v ? null : v; renderSheet(); },
  fruit: v => { const P = S.sheet; P.fruits = P.fruits.includes(v) ? P.fruits.filter(x => x !== v) : [...P.fruits, v]; renderSheet(); },
  choose: async v => {
    const P = S.sheet;
    if (v !== OUT || P.mode !== 'actual') return choose(v);
    const o = await outNote(getSlot(P.date, P.k, false)?.a?.o); if (o == null) return;
    choose(v, null, P, o);
  },
  two: v => {
    if (isWeekend(v)) return;
    const d = getDay(v), on = !d.two, gone = on ? ['B', 'L'] : ['BR'];
    const used = gone.map(k => d.slots[k]).filter(sl => sl && (sl.p || sl.h != null || sl.a || sl.n));
    if (used.some(sl => sl.a)) { toast(t('이미 기록한 끼니가 있어서 바꿀 수 없어요', 'A meal here is already logged, so it can’t change')); return; }
    if (used.length && !confirm(on ? t(`${dowL(v)} 아침·점심 계획을 지우고 2끼(브런치·저녁)로 바꿀까요?`, `Clear ${dowL(v)}’s breakfast and lunch plans and make it 2 meals?`)
      : t(`${dowL(v)} 브런치 계획을 지우고 3끼로 돌릴까요?`, `Clear ${dowL(v)}’s brunch plan and go back to 3 meals?`))) return;
    for (const k of gone) delete d.slots[k];
    if (on) d.two = true; else delete d.two;
    save(); render(); toast(on ? t(`${dowL(v)}은 2끼 날이에요`, `${dowL(v)} is a 2-meal day`) : t(`${dowL(v)} 3끼로 돌렸어요`, `${dowL(v)} is back to 3 meals`));
  },
  'choose-prep': v => { const P = S.sheet; const p = prepOf(P.date, v); if (p) choose(p.name, p.id); },
  'clear-slot': () => {
    const P = S.sheet, sl = getSlot(P.date, P.k);
    if (P.mode === 'actual') { if (sl.a?.photo && !confirm(t('사진도 같이 지울까요?', 'Delete the photo too?'))) return; if (sl.a?.photo) photoDel(sl.a.photo); delete sl.a; }
    else if (P.side === 'him') { sl.h = ''; sl.hp = null; } else { delete sl.p; delete sl.pp; }
    save(); closeSheet(); render();
  },
  'as-planned': async (v, el) => {
    const sl = getSlot(el.dataset.d, el.dataset.k); let o = '';
    if (sl.p === OUT && (o = await outNote(sl.a?.o)) == null) return;
    sl.a = { ...(sl.a || {}), s: sl.p === OUT ? 'out' : 'planned', m: sl.p, t: Date.now() };
    if (o) sl.a.o = o; else delete sl.a.o;
    save(); render();
  },
  shoot: (v, el) => { camTarget = { d: el.dataset.d, k: el.dataset.k }; $('#in-cam').value = ''; $('#in-cam').click(); },
  album: (v, el) => { camTarget = { d: el.dataset.d, k: el.dataset.k }; $('#in-album').value = ''; $('#in-album').click(); },
  'photo-view': async (v, el) => {
    const sl = getSlot(el.dataset.d, el.dataset.k, false); if (!sl?.a?.photo) return;
    const u = await purl(sl.a.photo); if (u) window.open(u, '_blank');
  },

  snack: v => { getDay(S.day).snacks.push({ n: v, t: S.day === todayStr() ? Date.now() : parse(S.day).setHours(15) }); save(); render(); const b = [...document.querySelectorAll('[data-a="snack"]')].find(x => x.dataset.v === v); b?.classList.add('just'); setTimeout(() => b?.classList.remove('just'), 900); },
  'snack-del': v => { const d = getDay(S.day); const x = d.snacks[+v]; if (!x || !confirm(t(`${x.n} 기록을 지울까요?`, `Remove ${x.n}?`))) return; d.snacks.splice(+v, 1); save(); render(); },
  'snack-new': async () => {
    const n = (await ask(t('간식 이름', 'Snack name'), t('예: 견과류', 'e.g. nuts')))?.trim(); if (!n) return;
    if (!state.snacks.includes(n)) state.snacks.push(n);
    if (S.tab === 'today') getDay(S.day).snacks.push({ n, t: Date.now() });
    save(); render();
  },
  'snack-chip-del': v => { if (!confirm(t(`${v} 칩을 뺄까요?`, `Remove the ${v} chip?`))) return; state.snacks = state.snacks.filter(x => x !== v); save(); render(); },

  'copy-week': v => {
    const src = getWeek(addDays(v, -7), false); if (!src) return;
    const dst = getWeek(v);
    for (const [s, d] of Object.entries(src.days)) {
      const ns = addDays(s, 7); const nd = getDay(ns);
      for (const [k, sl] of Object.entries(d.slots)) { if (!sl.p && sl.h == null) continue; const n = (nd.slots[k] = nd.slots[k] || {}); if (n.p || n.h) continue; if (sl.p) n.p = sl.p; if (sl.h != null) n.h = sl.h; }
    }
    if (!dst.memo && src.memo) { /* 메모는 주마다 새로 — 복사하지 않음 */ }
    save(); S.tab = 'week'; S.sub = 'grid'; S.weekOf = v; render(); toast(t('지난주 계획을 복사했어요 (밀프랩 칸은 빼고)', 'Copied last week’s plan (without meal-prep links)'));
  },
  'prep-add': () => {
    const name = $('#mp-name').value.trim(), count = Math.max(1, parseInt($('#mp-count').value) || 1), type = $('#mp-type').value;
    if (!name) { $('#mp-name').focus(); return; }
    getWeek(addDays(S.weekOf, 7)).preps.push({ id: uid(), type, name, count }); save(); render();
  },
  'prep-del': v => {
    const w = getWeek(addDays(S.weekOf, 7)); w.preps = w.preps.filter(p => p.id !== v);
    for (const d of Object.values(w.days)) for (const sl of Object.values(d.slots)) { if (sl.pp === v) sl.pp = null; if (sl.hp === v) sl.hp = null; }
    save(); render();
  },
  'prep-carry': v => {
    const wc = getWeek(S.weekOf), p = wc.preps.find(x => x.id === v); if (!p) return;
    getWeek(addDays(S.weekOf, 7)).preps.push({ id: uid(), type: p.type, name: p.name, count: prepLeft(wc, p.id), from: p.id }); save(); render();
  },
  'send-coach': () => sendCoach(S.weekOf),
  'share-him': () => shareHim(S.weekOf),
  'wait-poke': () => waitPoke(),

  'menu-add': async v => { const n = (await ask(t('메뉴 이름', 'Dish name'), ''))?.trim(); if (!n) return; if (!state.menus[v].some(x => x.name === n)) state.menus[v].push({ name: n, n: 0 }); buildIndex(); save(); render(); },
  'menu-ren': async v => {
    const n = (await ask(t('메뉴 이름 고치기 — 지난 기록에서도 바뀌어요', 'Rename — past logs change too'), '', v))?.trim();
    if (!n || n === v) return; renameMenu(v, n); render(); toast(t(`“${n}”(으)로 바꿨어요`, `Renamed to “${n}”`));
  },
  'slot-ren': async () => {
    const P = S.sheet, sl = getSlot(P.date, P.k), key = P.side === 'him' ? 'h' : 'p', cur = sl[key], canon = IDX.canon[cur] || cur;
    const all = !cur.includes('+') && inMenus(canon);
    const n = (await ask(all ? t('메뉴 이름 고치기 — 지난 기록에서도 바뀌어요', 'Rename — past logs change too') : t('이 칸 이름 고치기', 'Rename this slot'), '', all ? canon : cur))?.trim();
    if (n && n !== cur) { if (all) renameMenu(canon, n, cur); else { sl[key] = n; save(); } toast(t(`“${n}”(으)로 바꿨어요`, `Renamed to “${n}”`)); }
    openSheet(P); render();
  },
  'menu-del': (v, el) => { if (!confirm(t(`${v}을(를) 목록에서 뺄까요?`, `Remove ${v}?`))) return; const k = el.dataset.k; state.menus[k] = state.menus[k].filter(x => x.name !== v); buildIndex(); save(); render(); },
  recipe: v => openSheet({ type: 'recipe', id: v }),
  'recipe-copy': v => { const r = state.recipes.find(x => x.id === v); if (r) copyToast(recipeText(r), t('복사했어요', 'Copied')); },
  'recipe-del': v => { const r = state.recipes.find(x => x.id === v); if (!r || !confirm(t(`${r.name} 카드를 지울까요?`, `Delete ${r.name}?`))) return; state.recipes = state.recipes.filter(x => x.id !== v); if (r.photo) photoDel(r.photo); buildIndex(); save(); closeSheet(); render(); },
  radd: () => openSheet({ type: 'radd', mode: 'paste', cats: [], photo: null }),
  'radd-mode': v => { S.sheet.mode = v; renderSheet(); },
  'radd-paste': () => {
    const cards = parseCards($('#radd-text').value);
    if (!cards.length) { toast(t('"이름:" 줄을 못 찾았어요', 'No “Name:” line found')); return; }
    addRecipes(cards); closeSheet(); S.tab = 'menus'; S.mt = 'recipes'; render(); toast(t(`카드 ${cards.length}장을 추가했어요`, `Added ${cards.length} card(s)`));
  },
  'rh-cat': v => { const P = S.sheet; const keep = { name: $('#rh-name').value, tags: $('#rh-tags').value, link: $('#rh-link').value, steps: $('#rh-steps').value };
    P.cats = P.cats.includes(v) ? P.cats.filter(x => x !== v) : [...P.cats, v]; renderSheet(); restoreHand(keep); },
  'rh-photo': () => { camTarget = { recipe: true, keep: { name: $('#rh-name').value, tags: $('#rh-tags').value, link: $('#rh-link').value, steps: $('#rh-steps').value } }; $('#in-album').value = ''; $('#in-album').click(); },
  'rh-save': () => {
    const name = $('#rh-name').value.trim(); if (!name) { $('#rh-name').focus(); return; }
    const steps = $('#rh-steps').value.split('\n').map(x => x.replace(/^(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
    addRecipes([{ name, tags: $('#rh-tags').value.split(/[,，]/).map(x => x.trim()).filter(Boolean), category: S.sheet.cats, steps,
      source: { link: $('#rh-link').value.trim() }, photo: S.sheet.photo, missing: steps.length ? '' : t('순서 — 나중에 코치에게 채우기', 'steps — fill later with the coach') }]);
    closeSheet(); S.tab = 'menus'; S.mt = 'recipes'; render(); toast(t('저장했어요', 'Saved'));
  },

  fpaste: () => openSheet({ type: 'fpaste', text: '' }),
  'fp-save': () => {
    const { date, from, items } = parseFridge($('#fp-text').value);
    if (!items.length) { toast(t('"- 이름 | 기간" 줄을 못 찾았어요', 'No “- name | shelf” lines found')); return; }
    for (const it of items) {
      const ex = state.fridge.find(x => !x.used && x.name === it.name), v = { q: it.q || ex?.q || '', bought: date, days: it.days, snack: !!it.snack, from };
      if (ex) Object.assign(ex, v); else state.fridge.push({ id: uid(), name: it.name, ...v });
    }
    save(); closeSheet(); S.tab = 'menus'; S.mt = 'fridge'; render(); toast(t(`냉장고에 ${items.length}가지를 넣었어요`, `Added ${items.length} items`));
  },
  fitem: v => { const x = state.fridge.find(y => y.id === v); if (x) openSheet({ type: 'fitem', id: x.id, name: x.name, q: x.q || '', days: x.days, snack: !!x.snack }); },
  'fitem-new': () => openSheet({ type: 'fitem', id: null, name: '', q: '', days: 7, snack: false }),
  'fi-days': v => { const P = S.sheet; P.snack = v === 'snack'; P.days = P.snack ? 90 : +v; renderSheet(); },
  'fi-save': () => {
    const P = S.sheet, name = P.name.trim(); if (!name) { $('[data-in="fi-name"]').focus(); return; }
    const x = state.fridge.find(y => y.id === P.id), v = { name, q: P.q.trim(), days: P.days, snack: P.snack };
    if (x) Object.assign(x, v); else state.fridge.push({ id: uid(), bought: todayStr(), from: '', ...v });
    save(); closeSheet(); render();
  },
  fused: v => {
    const x = state.fridge.find(y => y.id === v); if (!x) return;
    if (x.used) delete x.used; else x.used = Date.now();
    save(); if (S.sheet?.type === 'fitem') closeSheet(); render();
    toast(x.used ? t(`${x.name} 다 씀 · 다시 누르면 되돌려요`, `${x.name} used up · tap again to undo`) : t(`${x.name} 되돌렸어요`, `${x.name} is back`));
  },
  fkeep: v => { const x = state.fridge.find(y => y.id === v); if (!x) return; x.days = Math.round((parse(todayStr()) - parse(x.bought)) / 864e5) + 7; save(); render(); toast(t(`${x.name} 1주 늘렸어요`, `${x.name} kept another week`)); },
  'fz-recipes': () => { S.mt = 'recipes'; S.rf = 'fridge'; scrollTo(0, 0); render(); },
  'go-fridge': () => { S.tab = 'menus'; S.mt = 'fridge'; scrollTo(0, 0); render(); },

  settings: () => { openSheet({ type: 'settings' }); storageInfo(); },
  lang: v => { state.lang = v; save(); render(); },
  'coach-copy': () => copyToast(COACH, t('지침을 복사했어요 · 프로젝트에 붙여 넣으세요', 'Instructions copied · paste them into the project')),
  import: () => pickFile('.json,application/json', importFile),
  'week-del': v => {
    const w = state.weeks[v]; if (!w) return;
    const ph = weekPhotos(w);
    if (!confirm(t(`${rangeL(v)} 기록을 지울까요?${ph.length ? ` 사진 ${ph.length}장도 같이 지워져요.` : ''} 되돌릴 수 없어요.`, `Delete the ${rangeL(v)} week?${ph.length ? ` Its ${ph.length} photos go too.` : ''} This can’t be undone.`))) return;
    for (const id of ph) photoDel(id);
    delete state.weeks[v]; save(); S.tab = 'history'; scrollTo(0, 0); render(); toast(t(`${rangeL(v)}을 지웠어요`, `Deleted ${rangeL(v)}`));
  },
  'legacy-del': () => {
    const mons = legacyWeeks(); if (!confirm(t(`메모앱에서 옮긴 ${mons.length}주를 지울까요? 메뉴 목록은 그대로예요.`, `Remove ${mons.length} weeks from the notes app? Your menu list stays.`))) return;
    for (const mon of mons) {
      for (const d of Object.values(state.weeks[mon].days)) for (const sl of Object.values(d.slots)) if (sl.a?.photo) photoDel(sl.a.photo);
      delete state.weeks[mon];
    }
    save(); renderSheet(); render(); toast(t(`${mons.length}주를 지웠어요`, `Removed ${mons.length} weeks`));
  },
  backup: () => backupZip(),
  'backup-json': () => shareFile(new Blob([JSON.stringify(state)], { type: 'application/json' }), `mealcat-${todayStr()}.json`),
  restore: () => pickFile('.zip,.json,application/zip,application/json', restoreFile),
  'ask-ok': () => { const v = $('#ask-in').value; const r = askResolve; askResolve = null; closeSheet(); r?.(v); }
};
function restoreHand(k) { if (!k) return; for (const [id, v] of [['rh-name', k.name], ['rh-tags', k.tags], ['rh-link', k.link], ['rh-steps', k.steps]]) { const el = $('#' + id); if (el) el.value = v || ''; } }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (fn) { e.preventDefault(); fn(el.dataset.v, el); }
});
document.addEventListener('input', e => {
  const el = e.target, k = el.dataset?.in; if (!k) return;
  if (k === 'memo') { getWeek(el.dataset.v).memo = el.value; save(); const f = $('#found'); if (f) f.innerHTML = foundHTML(memoFound(el.value)); }
  else if (k === 'rq') { S.rq = el.value; const pos = el.selectionStart; render(); const n = $('[data-in="rq"]'); n.focus(); n.setSelectionRange(pos, pos); }
  else if (k === 'pq') { S.sheet.q = el.value; const pos = el.selectionStart; renderSheet(); const n = $('[data-in="pq"]'); n.focus(); n.setSelectionRange(pos, pos); }
  else if (k === 'slot-note') { const sl = getSlot(S.sheet.date, S.sheet.k), v = el.value.trim(); if (v) sl.n = v; else delete sl.n; save(); }
  else if (k === 'fp') { S.sheet.text = el.value; const p = $('#fp-parse'); if (p) p.innerHTML = fpPreview(el.value); }
  else if (k === 'fi-name' || k === 'fi-q') S.sheet[k.slice(3)] = el.value;
  else if (k === 'name-me' || k === 'name-him') { state.names[k.slice(5)] = el.value.trim() || (k === 'name-me' ? '나' : '남편'); save(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ask-in') A['ask-ok']();
  if (e.key === 'Enter' && e.target.dataset?.in === 'pq' && e.target.value.trim()) choose(e.target.value.trim());
  if (e.key === 'Escape' && S.sheet) A.close();
});

async function onPhoto(file) {
  if (!file || !camTarget) return;
  const tgt = camTarget; camTarget = null;
  const blob = await shrink(file), id = 'p' + uid();
  await photoPut(id, blob);
  if (tgt.recipe) { S.sheet.photo = id; renderSheet(); restoreHand(tgt.keep); return; }
  const sl = getSlot(tgt.d, tgt.k);
  if (sl.a?.photo) photoDel(sl.a.photo);
  sl.a = { ...(sl.a || {}), photo: id, t: sl.a?.t || (tgt.d === todayStr() ? Date.now() : parse(tgt.d).setHours(12)) };
  if (!sl.a.s && sl.p) { sl.a.s = sl.p === OUT ? 'out' : 'planned'; sl.a.m = sl.p; }
  save(); render();
  if (!sl.a.s) openSheet({ type: 'pick', date: tgt.d, k: tgt.k, mode: 'actual', side: 'me', q: '', base: null, fruits: [] });
}
$('#in-cam').addEventListener('change', e => onPhoto(e.target.files[0]));
$('#in-album').addEventListener('change', e => onPhoto(e.target.files[0]));
function pickFile(accept, cb) { const i = $('#in-file'); i.accept = accept; i.value = ''; i.onchange = () => i.files[0] && cb(i.files[0]); i.click(); }

/* ───────── 불러오기·백업 ───────── */
function mergeMenus(dst, src) {
  for (const x of src || []) { const y = dst.find(z => z.name === x.name); if (y) { y.n = Math.max(y.n || 0, x.n || 0); y.en = y.en || x.en; y.aka = [...new Set([...(y.aka || []), ...(x.aka || [])])]; } else dst.push({ ...x }); }
}
async function importFile(file) {
  let j; try { j = JSON.parse(await file.text()); } catch { toast(t('JSON 파일이 아니에요', 'Not a JSON file')); return; }
  if (j.legacy_weeks) {
    // 메모앱 옛 식단: 이미 있는 주·날은 건드리지 않고 빈 곳만 채움
    let weeks = 0, days = 0;
    for (const [mon, lw] of Object.entries(j.legacy_weeks)) {
      const w = state.weeks[mon];
      if (!w) { state.weeks[mon] = lw; weeks++; days += Object.keys(lw.days).length; continue; }
      for (const [s, d] of Object.entries(lw.days)) if (!w.days[s] || !Object.keys(w.days[s].slots).length) { w.days[s] = d; days++; }
      if (lw.memo && !w.memo.includes(lw.memo)) w.memo = (w.memo ? w.memo + '\n' : '') + lw.memo;
    }
    await flush(); closeSheet(); render();
    toast(t(`옛 식단 ${weeks}주 · ${days}일을 넣었어요`, `Added ${weeks} weeks · ${days} days of old plans`)); return;
  }
  if (j.weeks) { await restoreState(j, []); return; }
  if (!j.menus && !j.recipes) { toast(t('import.json 형식이 아니에요', 'Not an import.json')); return; }
  const M = j.menus || {};
  mergeMenus(state.menus.B, M.breakfast_base); mergeMenus(state.menus.F, M.fruit); mergeMenus(state.menus.L, M.lunch); mergeMenus(state.menus.D, M.dinner);
  for (const n of M.snacks || []) if (!state.snacks.includes(n)) state.snacks.push(n);
  state.habits = M.habits || state.habits;
  let added = 0;
  for (const r of j.recipes || []) { const i = state.recipes.findIndex(x => x.id === r.id); if (i >= 0) state.recipes[i] = { ...state.recipes[i], ...r }; else { state.recipes.push(r); added++; } }
  state.importedAt = Date.now(); buildIndex(); await flush(); closeSheet(); render();
  toast(t(`메뉴와 레시피 ${added}개를 불러왔어요`, `Loaded menus and ${added} recipes`));
}
/* ───────── 기다리는 동안 고양이 (백업 · 사진 모음 · 남편 공유, 목업 .grill/meal-planner-loading-mockup.html A안) ─────────
   0.4초 안에 끝나면 안 뜸. 공유 창은 기다리지 않고 바로 열고(iOS 사용자 동작 만료 방지), 카드는 그 뒤에서 사라짐 */
const WAIT_CAT = `<svg class="dd w-cat" width="74" height="86" viewBox="0 0 74 86" aria-hidden="true">
  <g class="w-tail"><path d="M58 76c9 1 13-5 11-11-1-3-4-4.5-6.5-3.5"/></g>
  <path d="M21 46c-6 8-8 19-6 29 1 4 4 6.5 8 6.5h26c4 0 7-2.5 8-6.5 2-10 0-21-6-29" style="fill:var(--paper)"/>
  <path d="M41 60c3-2.5 8.5-1.5 9.5 3-2.5 3-7.5 3-9.5-3z" style="fill:var(--ink)"/><path d="M30 82v-7M44 82v-7"/>
  <g class="w-head"><path d="M14 43c-4-4-5-10-4-16 1-4 3-7 6-9L18 4l11 9c5-1.5 9-1.5 14 0l11-9 2 14c3 2 5 5 6 9 1 6 0 12-4 16-5 5-12 6-22 6s-17-1-22-6z" style="fill:var(--paper)"/>
    <path d="M16.4 17.8 18 4l11 9c-5 1-9 2.4-12.6 4.8z" style="fill:var(--ink)"/>
    <circle class="w-eye" cx="28.5" cy="30" r="2" style="fill:var(--ink)" stroke="none"/><circle class="w-eye" cx="43.5" cy="30" r="2" style="fill:var(--ink)" stroke="none"/>
    <path d="M33 35q1.5 2.2 3 0q1.5 2.2 3 0"/>
    <ellipse class="w-bl" cx="22" cy="35.5" rx="3.6" ry="2.2" style="fill:var(--blush)" stroke="none"/><ellipse class="w-bl" cx="50" cy="35.5" rx="3.6" ry="2.2" style="fill:var(--blush)" stroke="none"/></g></svg>`;
const WAIT_DRAW = {
  backup: ['M6 26c20-3 40 3 60 0s46-3 78 0'],
  collage: ['M30 4h90v38H30z', 'M60 4v38', 'M90 4v38', 'M30 23h90'],
  plan: ['M22 6h106', 'M22 18h106', 'M22 30h106', 'M22 42h106', 'M44 6v36', 'M86 6v36'],
};
const WAIT_SAY = { ko: ['냥', '조금만!', '거의 다 됐어', '사진 고르는 중', '간식은 나중에', '냐앙'], en: ['Meow', 'Almost!', 'Nearly there', 'Picking photos', 'Snacks later', 'Mrrow'] };
let W = null;
function waitStart(kind) {
  waitHide(true);
  const [msg, hint] = {
    backup: [t('백업 만드는 중', 'Making the backup'), t('기록을 챙기는 중이에요', 'Packing up the log')],
    collage: [t('사진 모음 만드는 중', 'Making the collage'), t('코치에게 보낼 한 장으로 붙여요', 'One image for the coach')],
    plan: [t('계획표 그리는 중', 'Drawing the plan'), t(`${state.names.him}에게 보낼 이미지예요`, `An image for ${state.names.him}`)],
  }[kind];
  const el = document.createElement('div'); el.id = 'wait'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="w-dim"></div><div class="w-card pen">
    <button class="w-stage" data-a="wait-poke" aria-label="${t('고양이 쓰다듬기', 'Pet the cat')}">${WAIT_CAT}<span class="w-bub pen"></span>
      <svg class="dd w-heart" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" style="fill:var(--blush)"/></svg></button>
    <svg class="dd w-draw ${kind === 'backup' ? 'prog' : 'loop'}" viewBox="0 0 150 46" aria-hidden="true">${WAIT_DRAW[kind].map(d => `<path class="ln" pathLength="1" d="${d}"/>`).join('')}</svg>
    <div class="w-msg">${msg}</div><div class="w-hint">${hint}</div></div>`;
  document.body.appendChild(el);
  W = { el, kind, shown: 0, say: 0 };
  W.timer = setTimeout(() => { el.classList.add('in'); W.shown = Date.now(); }, 400);
}
function waitProgress(i, n) {
  if (!W || !n) return;
  W.el.querySelector('.w-hint').textContent = t(`사진 ${i} / ${n}장 챙겼어요`, `${i} / ${n} photos packed`);
  W.el.querySelector('.ln').style.strokeDashoffset = 1 - i / n;
}
function waitDone() {
  if (!W) return;
  clearTimeout(W.timer);
  if (!W.shown) return waitHide(true); // 너무 빨리 끝남 — 안 보여 줌
  W.el.querySelector('.w-msg').textContent = t('다 됐어요', 'All done');
  W.el.querySelector('.w-hint').textContent = W.kind === 'backup' ? t('파일을 저장해요', 'Saving the file') : t('공유 창을 열어요', 'Opening the share sheet');
  const d = W.el.querySelector('.w-draw'); d.setAttribute('class', 'dd w-draw'); d.innerHTML = '<path d="M58 24l12 12 24-26"/>';
  W.el.classList.add('done');
}
async function waitHide(now) {
  const w = W; W = null; if (!w) return;
  clearTimeout(w.timer);
  if (!now && w.shown) { const left = 900 - (Date.now() - w.shown); if (left > 0) await new Promise(r => setTimeout(r, left)); }
  w.el.classList.remove('in'); setTimeout(() => w.el.remove(), now ? 0 : 260);
}
function waitPoke() {
  if (!W) return;
  const re = (el, c) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
  re(W.el.querySelector('.w-cat'), 'hop'); re(W.el.querySelector('.w-stage'), 'blushy'); re(W.el.querySelector('.w-heart'), 'go');
  const b = W.el.querySelector('.w-bub'), says = WAIT_SAY[state.lang];
  b.textContent = says[W.say++ % says.length]; b.classList.add('in');
  clearTimeout(W.bub); W.bub = setTimeout(() => b.classList.remove('in'), 1100);
}

async function backupZip() {
  waitStart('backup');
  try {
    const enc = new TextEncoder(), files = [{ name: 'state.json', data: enc.encode(JSON.stringify(state)) }];
    const ids = await photoKeys();
    for (const [i, id] of ids.entries()) { const b = await photoGet(id); files.push({ name: `photos/${id}.jpg`, data: new Uint8Array(await b.arrayBuffer()) }); waitProgress(i + 1, ids.length); }
    const zip = Zip.zip(files);
    waitDone();
    const ok = await shareFile(zip, `mealcat-backup-${todayStr()}.zip`);
    if (ok) { state.backupAt = Date.now(); save(); render(); }
  } finally { waitHide(); }
}
async function restoreFile(file) {
  if (!confirm(t('지금 기록을 백업 내용으로 바꿀까요?', 'Replace current data with this backup?'))) return;
  try {
    if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
      const entries = Zip.unzip(await file.arrayBuffer());
      const st = entries.find(e => e.name === 'state.json'); if (!st) throw 0;
      await restoreState(JSON.parse(new TextDecoder().decode(st.data)), entries.filter(e => e.name.startsWith('photos/')));
    } else await restoreState(JSON.parse(await file.text()), []);
  } catch { toast(t('백업 파일을 읽지 못했어요', 'Could not read the backup')); }
}
async function restoreState(st, photos) {
  for (const p of photos) await photoPut(p.name.slice(7).replace(/\.jpg$/, ''), new Blob([p.data], { type: 'image/jpeg' }));
  state = { ...state, ...st }; urls.clear(); buildIndex(); await flush(); closeSheet(); render();
  toast(t(`되살렸어요${photos.length ? ` · 사진 ${photos.length}장` : ''}`, `Restored${photos.length ? ` · ${photos.length} photos` : ''}`));
}
async function shareFile(blob, name, text) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], ...(text ? { text } : {}) }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
}
async function storageInfo() {
  const el = $('#storage-info'); if (!el || !navigator.storage?.estimate) return;
  const e = await navigator.storage.estimate(); const n = (await photoKeys()).length;
  el.textContent = t(`사진 ${n}장 · 쓰는 공간 약 ${(e.usage / 1048576).toFixed(0)}MB`, `${n} photos · about ${(e.usage / 1048576).toFixed(0)} MB used`);
}

/* ───────── 코치에게 보내기 ───────── */
function weekText(mon) {
  const w = getWeek(mon, false); if (!w) return '';
  const L = [`[Mealcat] ${mon} ~ ${addDays(mon, 6)} 주간 기록`, `(나 = ${state.names.me}, 남편 = ${state.names.him}. 남편 몫은 계획만 있음)`, ''];
  for (const s of weekDays(mon)) {
    const d = w.days[s]; L.push(`${DOW_L.ko[parse(s).getDay()]} ${s}`);
    for (const k of slotsOf(s)) {
      const sl = d?.slots[k] || {}; const pr = prepOf(s, sl.pp);
      const plan = sl.p ? (pr ? `${PREP[pr.type][0]}(${sl.p})` : sl.p) : '계획 없음';
      const a = sl.a; const act = !a ? (s < todayStr() || (s === todayStr()) ? '기록 없음' : '아직') : a.s === 'planned' ? '계획대로' : a.s === 'out' ? `외식${a.o ? `(${a.o})` : ''}` : a.s === 'changed' ? `바꿈 → ${a.m}` : '사진만';
      L.push(`- ${SLOT[k][0]}: ${plan} → ${act}${a?.photo ? ' [사진]' : ''}${a?.t ? ` (${hhmm(a.t)})` : ''}${sl.h != null ? ` / 남편: ${sl.h || '-'}` : ''}`);
    }
    if (d?.snacks?.length) L.push(`- 간식: ${d.snacks.map(x => `${x.n} ${hhmm(x.t)}`).join(', ')}`);
  }
  if (w.preps.length) L.push('', '밀프랩: ' + w.preps.map(p => `${PREP[p.type][0]} ${p.name} ×${p.count} (남음 ${Math.max(0, prepLeft(w, p.id))})`).join(', '));
  const st = weekStats(mon); L.push('', `요약: 사진 ${st.photo} · 바꿈 ${st.changed} · 외식 ${st.out} · 기록 없음 ${st.miss}`);
  if (w.memo) L.push('', '지난번 코치 메모:', w.memo);
  const live = fridgeLive();
  if (live.length) {
    const fmt = x => `${x.name}${x.q ? ' ' + x.q : ''}(${leftL(fridgeLeft(x), 1)})`;
    const first = live.filter(x => !isLong(x) && fridgeLeft(x) <= 3), long = live.filter(isLong), rest = live.filter(x => !first.includes(x) && !long.includes(x));
    L.push('', `냉장고 (${todayStr()} 기준, 괄호 = 남은 보관 기간):`);
    if (first.length) L.push('- 먼저 쓸 것: ' + first.map(fmt).join(', '));
    if (rest.length) L.push('- 있음: ' + rest.map(fmt).join(', '));
    if (long.length) L.push('- 냉동·저장: ' + long.map(fmt).join(', '));
    L.push('', '요청: 지침대로 이번 주를 평가하고, 위 냉장고 목록을 보고 다음 주 아이디어를 주세요.');
  } else L.push('', '요청: 지침대로 이번 주를 평가하고, 장 본 재료(아래에 적거나 냉장고 사진)를 보고 다음 주 아이디어를 주세요.', '냉장고 재료: ');
  return L.join('\n');
}
async function loadBmp(id) { const b = await photoGet(id); return b ? createImageBitmap(b) : null; }
function cover(ctx, img, x, y, w, h) { const r = Math.max(w / img.width, h / img.height); const sw = w / r, sh = h / r; ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 3) {
  const words = [...String(text)]; let line = '', lines = [];
  for (const ch of words) { if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; }
  if (line) lines.push(line);
  lines = lines.slice(0, maxLines); lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH)); return lines.length;
}
async function sendCoach(mon) {
  const w = getWeek(mon, false); if (!w) { toast(t('이번 주 기록이 아직 없어요', 'No log for this week yet')); return; }
  waitStart('collage');
  try { await coachCollage(mon, w); } finally { waitHide(); }
}
async function coachCollage(mon, w) {
  await document.fonts.ready;
  const C = 300, LW = 110, HEAD = 110, W = LW + C * 3, H = HEAD + C * 7 + 30;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2f2c2b'; ctx.font = '44px Jua'; ctx.fillText(`Mealcat  ${mon} ~ ${addDays(mon, 6).slice(5)}`, 24, 66);
  ctx.font = '22px "Gowun Dodum"'; ctx.fillStyle = '#8f8984'; ctx.fillText(statLine(mon), 24, 98);
  for (const [i, s] of weekDays(mon).entries()) {
    const y = HEAD + i * C; ctx.fillStyle = '#2f2c2b'; ctx.font = '34px Jua'; ctx.fillText(DOW.ko[parse(s).getDay()], 30, y + C / 2 + 4);
    ctx.font = '20px "Gowun Dodum"'; ctx.fillStyle = '#8f8984'; ctx.fillText(s.slice(5), 24, y + C / 2 + 34);
    const ks = slotsOf(s); let x = LW;
    for (const k of ks) {
      const cw = k === 'BR' ? C * 2 : C, sl = w.days[s]?.slots[k] || {};
      const pad = 6; rrect(ctx, x + pad, y + pad, cw - pad * 2, C - pad * 2, 22);
      ctx.save(); ctx.clip();
      const img = sl.a?.photo && await loadBmp(sl.a.photo);
      if (img) cover(ctx, img, x + pad, y + pad, cw - pad * 2, C - pad * 2); else { ctx.fillStyle = '#f6f5f3'; ctx.fill(); }
      const name = sl.a?.s ? (sl.a.s === 'out' ? OUT + (sl.a.o ? ' · ' + sl.a.o : '') : sl.a.m) : sl.p;
      const tag = `${SLOT[k][0]}${sl.a?.s === 'changed' ? ' · 바꿈' : sl.a?.s === 'out' ? ' · 외식' : sl.a ? '' : sl.p && s < todayStr() ? ' · 기록 없음' : ''}`;
      ctx.fillStyle = img ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,0)'; ctx.fillRect(x + pad, y + C - pad - 74, cw - pad * 2, 74);
      ctx.fillStyle = img ? '#fff' : '#8f8984'; ctx.font = '20px Jua'; ctx.fillText(tag, x + 20, y + C - 52);
      ctx.fillStyle = img ? '#fff' : '#2f2c2b'; ctx.font = 'bold 30px Gaegu'; ctx.fillText((name || '—') + (sl.h != null ? ` / 남편 ${sl.h || '-'}` : ''), x + 20, y + C - 20, cw - 40);
      ctx.restore();
      x += cw;
    }
  }
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
  const text = weekText(mon);
  await copyText(text);
  waitDone();
  const files = [new File([blob], `mealcat-${mon}.jpg`, { type: 'image/jpeg' }), new File([text], `mealcat-${mon}.txt`, { type: 'text/plain' })];
  let ok = false;
  if (navigator.canShare?.({ files })) { try { await navigator.share({ files }); ok = true; } catch (e) { if (e.name === 'AbortError') return; } }
  if (!ok) { for (const f of files) await shareFile(f, f.name); ok = true; }
  w.sentAt = Date.now(); save(); render();
  toast(t('보냈어요 · 글은 클립보드에도 복사했어요', 'Sent · text also copied to the clipboard'));
}

/* ───────── 남편에게 공유 (계획만 이미지 한 장) ───────── */
function symbolImage(id, w, h) {
  const sym = document.getElementById(id); if (!sym) return Promise.resolve(null);
  const inner = sym.innerHTML.replace(/var\(--paper\)/g, '#fff').replace(/var\(--ink\)/g, '#2f2c2b').replace(/var\(--blush\)/g, '#f5b9b2');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sym.getAttribute('viewBox')}" width="${w}" height="${h}"><g fill="none" stroke="#2f2c2b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
  return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
}
async function shareHim(mon) {
  const w = getWeek(mon, false); if (!weekStats(mon).plans) { toast(t('보낼 계획이 아직 없어요', 'No plan to share yet')); return; }
  waitStart('plan');
  try { await planImage(mon, w); } finally { waitHide(); }
}
async function planImage(mon, w) {
  await document.fonts.ready;
  const W = 1080, LW = 110, CW = (W - LW - 40) / 3, RH = 150, HEAD = 232, H = HEAD + RH * 7 + 140;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const ink = '#2f2c2b', pencil = '#8f8984';
  ctx.fillStyle = ink; ctx.font = '58px Jua'; ctx.fillText(t('다음 주 식단', 'Next week’s meals').replace(t('다음 주', 'Next week'), relWeek(mon)), 40, 86);
  ctx.font = '30px "Gowun Dodum"'; ctx.fillStyle = pencil; ctx.fillText(rangeL(mon), 42, 130);
  const [me, him, cat] = await Promise.all([symbolImage('me', 34, 34), symbolImage('him', 34, 34), symbolImage('cat-sit', 120, 140)]);
  if (cat) ctx.drawImage(cat, W - 160, 24, 120, 140);
  ctx.font = '24px "Gowun Dodum"';
  if (weekStats(mon).split) { if (me) ctx.drawImage(me, 40, 146, 30, 30); ctx.fillText(state.names.me, 76, 170); if (him) ctx.drawImage(him, 150, 146, 30, 30); ctx.fillText(state.names.him, 186, 170); }
  ctx.font = '26px Jua'; ctx.fillStyle = pencil; ctx.textAlign = 'center';
  [t('아침', 'Breakfast'), t('점심', 'Lunch'), t('저녁', 'Dinner')].forEach((l, i) => ctx.fillText(l, LW + CW * i + CW / 2, HEAD - 8));
  ctx.textAlign = 'left';
  for (const [i, s] of weekDays(mon).entries()) {
    const y = HEAD + i * RH; ctx.fillStyle = ink; ctx.font = '34px Jua'; ctx.textAlign = 'center'; ctx.fillText(dow(s), 60, y + RH / 2 + 12); ctx.textAlign = 'left';
    let x = LW;
    for (const k of slotsOf(s)) {
      const cw = k === 'BR' ? CW * 2 : CW, sl = w.days[s]?.slots[k] || {};
      rrect(ctx, x + 6, y + 6, cw - 12, RH - 12, 20); ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.stroke();
      if (k === 'BR' || (isTwo(s) && k === 'D')) { ctx.fillStyle = pencil; ctx.font = '20px Jua'; ctx.fillText(slotL(k), x + 22, y + 38); }
      const pr = prepOf(s, sl.pp);
      if (pr && !(k === 'BR')) { ctx.fillStyle = pencil; ctx.font = '20px Jua'; ctx.fillText(prepL(pr.type), x + 22, y + 38); }
      ctx.fillStyle = ink;
      if (sl.h != null) {
        ctx.font = 'bold 30px Gaegu';
        if (me) ctx.drawImage(me, x + 18, y + 26, 28, 28); ctx.fillText(m(sl.p) || '—', x + 52, y + 50, cw - 70);
        if (him) ctx.drawImage(him, x + 18, y + 84, 28, 28); ctx.fillText(m(sl.h) || '—', x + 52, y + 108, cw - 70);
      } else { ctx.font = 'bold 34px Gaegu'; wrapText(ctx, m(sl.p) || '', x + 22, y + (pr || k === 'BR' || isTwo(s) ? 82 : 66), cw - 44, 36, 2); }
      x += cw;
    }
  }
  if (w.preps.length) { ctx.fillStyle = pencil; ctx.font = '26px "Gowun Dodum"'; wrapText(ctx, t('밀프랩 · ', 'Meal prep · ') + w.preps.map(p => `${prepL(p.type)} ${m(p.name)} ×${p.count}`).join(' · '), 40, HEAD + RH * 7 + 56, W - 80, 34, 2); }
  ctx.fillStyle = '#d0cbc6'; ctx.font = '22px Jua'; ctx.fillText('Mealcat', W - 130, H - 26);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  waitDone();
  await shareFile(blob, `mealcat-${mon}.png`);
}

/* ───────── 코치 프로젝트 지침 (coach-instructions.md와 같은 내용) ───────── */
const COACH = `너는 내 식단 코치야. 나는 매주 주말에 장을 본 뒤 다음 주 아침·점심·저녁(주말은 브런치·저녁)을 가이드라인으로 짜고, Mealcat 앱에 먹은 걸 사진으로 남겨. 남편과 같이 먹는 끼니가 많고, 따로 먹는 칸은 "남편: …"으로 표시돼 (남편 몫은 계획만).

## 매주 받는 것
1. 사진 모음 한 장 (요일 × 끼니, 칸 아래 계획·실제 표시)
2. 주간 기록 글 (계획 → 계획대로 / 바꿈 → 실제 / 외식 / 기록 없음, 간식 시각, 밀프랩 남은 개수, 지난번 코치 메모)
3. 냉장고 목록 (앱이 남은 보관 기간과 함께 붙여 보냄 — 먼저 쓸 것 / 있음 / 냉동·저장)

## 답하는 형식 (이 순서, 짧게)
**이번 주** — 대략 kcal 범위(하루 평균)와 균형(단백질 충분한 끼니 수 / 채소 있는 끼니 수)을 한두 줄. 정확한 척하지 말고 범위로.
**패턴** — 눈에 띄는 것 1~2개 (예: "밀프랩 있는 날은 지켰고 금요일 저녁마다 배달").
**먼저 쓸 재료:** 빨리 상하는 재료 → 언제 쓰면 좋을지
**추천:** 메뉴 6~8개를 쉼표로. 반드시 내 메뉴 목록과 저장 레시피 이름 그대로 (앱이 이름으로 알아봄). 새 메뉴는 넣지 말 것.
**해볼 레시피:** 저장 레시피 중 냉장고 재료와 맞는 것 1개 (이름 그대로)
**지난주에서:** 다음 주에 바꿔 볼 것 한 줄
칸 21개를 다 채운 표는 만들지 마. 칸은 내가 앱에서 채워.

## 감량 모드
내가 "감량 모드 켜기, 하루 ○○kcal"라고 하면 그 목표를 기억하고, 매주 "이번 주"에 목표 대비 주 평균을 적어 줘. 하루 단위로 지적하지 말고 주 평균으로만 판단해.

## 영수증 → 냉장고 목록
내가 장 본 영수증(사진·PDF)을 올리면 아래 형식 그대로만 답해 (앱에 붙여 넣음).
냉장고: YYYY-MM-DD 가게이름
- 이름 양 | 보관 기간
- 이름은 짧은 한국어로 (예: Beilagenerdäpfel → 알감자, Jungzwiebel → 쪽파, Pizzakäse → 피자치즈). 양은 숫자+단위로 (1.6kg, 20개, 2팩)
- 보관 기간은 3일 / 1주 / 2주 / 3주 / 1달 / 3달 / 간식 중 하나. 냉장 기준으로 대충 잡고, 냉동·통조림·건조식품·쌀은 3달, 과자·초콜릿은 간식
- 같은 물건 여러 줄은 한 줄로 합치고, 할인·보증금(Pfand)·봉투·세제처럼 음식이 아닌 줄은 빼

## 레시피 카드 만들기
내가 레시피 스크린샷·영상 장면을 올리고 "카드로 만들어 줘"라고 하면, 아래 형식 그대로 답해 (앱에 붙여 넣음). 여러 장이면 카드 사이에 빈 줄 두 개.
이름:
영어 이름:
분류: 아침 / 점심 / 저녁 / 주말 / 밀프랩 / 간식·기타 중 해당하는 것 (쉼표)
주재료: 냉장고 재료와 맞출 핵심 재료 (쉼표)
재료:
- 양까지
순서:
1. …
팁:
- …
원본에 없음: 원본에서 빠진 정보 (없으면 이 줄 생략)
출처: @계정
원본에 없는 양이나 단계는 지어내지 말고 "원본에 없음"에 적어.

## 지식
- 메뉴 목록·레시피 카드 이름은 프로젝트 지식의 import.json 기준
- 줄임말: 간계밥=간장계란밥, 식판밥=밥+반찬, 돼고김=돼지고기김치찌개, 상밀=냉장 밀프랩, 냉밀=냉동 밀프랩, 라나=인스턴트파스타, 토달볶=토마토달걀볶음
- 습관: 아침에 따뜻한 차 한 잔, 하루 과일 1개`;

/* ───────── 시작 ───────── */
(async () => {
  db = await openDB();
  const saved = await kvGet('state');
  if (saved) state = { ...state, ...saved, names: { ...state.names, ...(saved.names || {}) }, menus: { ...state.menus, ...(saved.menus || {}) } };
  buildIndex(); render();
  navigator.storage?.persist?.();
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else if (S.tab === 'today' && S.day < todayStr() && !S.sheet) { S.day = todayStr(); render(); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
