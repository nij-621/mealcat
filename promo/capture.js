// 실제 Mealcat 앱에 한 주치 데이터를 넣고 화면을 찍음 → promo/shots/*.png + shots/rects.json
// 실행: (리포 루트에서) python3 -m http.server 8132 & node promo/capture.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const EN = process.env.VLANG === 'en'; // 영어판: VLANG=en → shots-en/
const OUT = path.join(__dirname, EN ? 'shots-en' : 'shots');
const NOW = new Date('2026-11-04T12:40:00'); // 수요일 점심

(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  await p.goto('http://localhost:8132/index.html');
  await p.addScriptTag({ path: path.join(__dirname, 'food.js') });
  // 사진 + 상태 넣기
  await p.evaluate(async EN => {
    const T = (d, h, m) => { const x = new Date(d + 'T00:00:00'); x.setHours(h, m); return +x; };
    const mon = '2026-11-02', D = i => addDays(mon, i);
    const kinds = { yogurt: 3, salad: 5, kimchi: 8, eggrice: 2, curry: 4, tomegg: 6, toast: 9, bibim: 12, salmon: 14, pancake: 1, tteok: 10 };
    const photos = {};
    for (const [k, s] of Object.entries(kinds)) for (const v of [0, 1, 2]) {
      const blob = await new Promise(r => paintFood(k, s + v * 31).toBlob(r, 'image/jpeg', .9));
      await photoPut(`f_${k}${v || ''}`, blob); photos[k + (v || '')] = 1;
    }
    const A = (photo, d, h, m, s = 'planned', extra = {}) => ({ photo, s, t: T(d, h, m), ...extra });
    const week = (mon, v, done) => {
      const D = i => addDays(mon, i), suf = v ? String(v) : '';
      const days = {
        [D(0)]: { slots: { B: { p: '그릭요거트+블루베리', a: done > 0 && A('f_yogurt' + suf, D(0), 8, 10) }, L: { p: '닭가슴살 샐러드', a: done > 0 && A('f_salad' + suf, D(0), 12, 30) }, D: { p: '돼지고기김치찌개', a: done > 0 && A('f_kimchi' + suf, D(0), 19, 5) } }, snacks: [] },
        [D(1)]: { slots: { B: { p: '간장계란밥', a: done > 1 && A('f_eggrice' + suf, D(1), 8, 0) }, L: { p: '닭가슴살 카레', pp: 'p1', a: done > 1 && A('f_curry' + suf, D(1), 12, 40) }, D: { p: '토마토달걀볶음', h: '제육볶음', a: done > 1 && A('f_tomegg' + suf, D(1), 19, 20) } }, snacks: [] },
        [D(2)]: { slots: { B: { p: '토스트+사과', a: done > 2 && A('f_toast' + suf, D(2), 8, 20) }, L: { p: '비빔밥', a: done > 3 && A('f_bibim' + suf, D(2), 12, 35) }, D: { p: '연어 스테이크', h: '된장찌개', a: done > 3 && A('f_salmon' + suf, D(2), 19, 0) } }, snacks: [] },
        [D(3)]: { slots: { B: { p: '그릭요거트+바나나', a: done > 3 && A('f_yogurt' + suf, D(3), 8, 0) }, L: { p: '닭가슴살 카레', pp: 'p1', a: done > 3 && A('f_curry' + suf, D(3), 12, 0) }, D: { p: '된장찌개', n: EN ? 'Tofu first!' : '두부 먼저!', a: done > 3 && A('f_kimchi' + suf, D(3), 19, 0, 'changed', { m: '돼지고기김치찌개' }) } }, snacks: [] },
        [D(4)]: { slots: { B: { p: '토스트', a: done > 3 && A('f_toast' + suf, D(4), 8, 0) }, L: { p: '김밥', a: done > 3 && A('f_bibim' + suf, D(4), 12, 0, 'changed', { m: '비빔밥' }) }, D: { p: '외식', a: done > 3 && A('f_tteok' + suf, D(4), 19, 0, 'out', { o: EN ? 'Tteokbokki' : '떡볶이' }) } }, snacks: [] },
        [D(5)]: { slots: { BR: { p: '팬케이크', a: done > 3 && A('f_pancake' + suf, D(5), 11, 0) }, D: { p: '떡볶이', a: done > 3 && A('f_tteok' + suf, D(5), 19, 0) } }, snacks: [] },
        [D(6)]: { slots: { BR: { p: '김밥', a: done > 3 && A('f_eggrice' + suf, D(6), 11, 0, 'changed', { m: '간장계란밥' }) }, D: { p: '소고기 주먹밥', pp: 'p2', a: done > 3 && A('f_salmon' + suf, D(6), 19, 0, 'changed', { m: '연어 스테이크' }) } }, snacks: [] },
      };
      for (const d of Object.values(days)) for (const sl of Object.values(d.slots)) if (!sl.a) delete sl.a;
      return { start: mon, days, preps: [{ id: 'p1', type: 'fridge', name: '닭가슴살 카레', count: 4 }, { id: 'p2', type: 'freezer', name: '소고기 주먹밥', count: 6 }], memo: '' };
    };
    const cur = week(mon, 0, 3);
    cur.days[D(2)].snacks = [{ n: '커피', t: T(D(2), 10, 5) }];
    cur.days[D(0)].snacks = [{ n: '사과', t: T(D(0), 15, 0) }, { n: '커피', t: T(D(0), 10, 0) }];
    const st = {
      ...state, names: EN ? { me: 'Me', him: 'Husband' } : { me: '나', him: '남편' }, lang: EN ? 'en' : 'ko', importedAt: Date.now(), backupAt: Date.now(),
      menus: {
        B: [{ name: '그릭요거트', en: 'Greek yogurt', n: 14 }, { name: '토스트', en: 'Toast', n: 9 }, { name: '간장계란밥', en: 'Soy egg rice', n: 7 }], F: [{ name: '사과', en: 'Apple', n: 10 }, { name: '블루베리', en: 'Blueberries', n: 7 }, { name: '바나나', en: 'Banana', n: 6 }, ...(EN ? [['커피', 'Coffee'], ['요거트', 'Yogurt'], ['과자', 'Cookies'], ['초콜릿', 'Chocolate']].map(([name, en]) => ({ name, en, n: 0 })) : [])],
        L: [{ name: '닭가슴살 샐러드', en: 'Chicken salad', n: 11 }, { name: '비빔밥', en: 'Bibimbap', n: 8 }, { name: '김밥', en: 'Gimbap', n: 5 }, { name: '닭가슴살 카레', en: 'Chicken curry', n: 6 }],
        D: [{ name: '돼지고기김치찌개', en: 'Kimchi stew', n: 9 }, { name: '토마토달걀볶음', en: 'Tomato egg stir-fry', n: 8 }, { name: '된장찌개', en: 'Doenjang stew', n: 7 }, { name: '제육볶음', en: 'Spicy pork', n: 6 }, { name: '연어 스테이크', en: 'Salmon steak', n: 5 }, { name: '떡볶이', en: 'Tteokbokki', n: 4 }, ...(EN ? [{ name: '소고기 주먹밥', en: 'Beef rice balls', n: 1 }] : [])]
      },
      recipes: [
        { id: 'r1', name: '토마토달걀볶음', name_en: 'Tomato egg stir-fry', category: ['저녁'], completeness: '완전', tags: ['토마토', '달걀', '대파'], log: ['토마토달걀볶음'] },
        { id: 'r2', name: '돼지고기김치찌개', name_en: 'Kimchi stew', category: ['저녁'], completeness: '완전', tags: ['김치', '돼지고기', '두부'], log: ['돼지고기김치찌개'] },
        { id: 'r3', name: '닭가슴살 카레', name_en: 'Chicken curry', category: ['밀프랩'], completeness: '거의 완전', tags: ['닭가슴살', '감자', '당근'] },
        { id: 'r4', name: '연어 스테이크', name_en: 'Salmon steak', category: ['저녁'], completeness: '완전', tags: ['연어', '아스파라거스'] },
        { id: 'r5', name: '팬케이크', name_en: 'Pancakes', category: ['주말'], completeness: '부분', tags: ['우유', '달걀', '블루베리'] },
        { id: 'r6', name: '양배추 달걀 토스트', name_en: 'Cabbage egg toast', category: ['아침'], completeness: '완전', tags: ['양배추', '달걀', '빵'] },
      ],
      snacks: ['커피', '요거트', '사과', '과자', '초콜릿'],
      fridge: [
        { id: 'x1', name: '시금치', q: '1봉', bought: '2026-11-01', days: 3, from: 'Billa' }, { id: 'x2', name: '방울토마토', q: '500g', bought: '2026-11-01', days: 7, from: 'Billa' },
        { id: 'x3', name: '두부', q: '2모', bought: '2026-11-01', days: 7, from: 'Billa' }, { id: 'x4', name: '연어', q: '2조각', bought: '2026-11-01', days: 4, from: 'Billa' },
        { id: 'x5', name: '달걀', q: '20개', bought: '2026-11-01', days: 21, from: 'Billa' }, { id: 'x6', name: '대파', q: '1단', bought: '2026-11-01', days: 14, from: 'Billa' },
      ],
      weeks: { [mon]: cur, [addDays(mon, -7)]: week(addDays(mon, -7), 1, 9), [addDays(mon, -14)]: week(addDays(mon, -14), 2, 9) },
    };
    if (EN) st.fridge.forEach((x, i) => { x.name = ['Spinach', 'Cherry tomatoes', 'Tofu', 'Salmon', 'Eggs', 'Scallions'][i]; x.q = ['1 bag', '500g', '2 blocks', '2 fillets', '20', '1 bunch'][i]; });
    await kvSet('state', st);
  }, EN);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => document.fonts.ready);
  const rects = {};
  const shot = async (name, full = true) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
  const rect = async (name, sel, i = 0) => { rects[name] = await p.$$eval(sel, (es, i) => { const e = es[i]; const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height]; }, i); };
  const go = async fn => { await p.evaluate(fn, EN); await p.waitForTimeout(300); };

  // 오늘: 점심 사진 전/후, 간식 칩
  await go(() => { S.tab = 'today'; render(); });
  await rect('cam', '.meal .cam'); await rect('lunchCard', '.meal .card', 1); await rect('chipApple', '.chips .chip:nth-child(3)'); await rect('snackLog', '.snack-log'); await rect('chips', '.chips');
  await shot('today_before');
  await go(() => { const sl = getSlot('2026-11-04', 'L'); sl.a = { photo: 'f_bibim', s: 'planned', t: Date.now() }; render(); });
  await rect('thumbL', '.meal .thumb', 1); await rect('metaL', '.meal .meta', 1);
  await shot('today_photo');
  await go(() => { getDay('2026-11-04').snacks.push({ n: '사과', t: Date.now() + 2.5 * 3600e3 }); render(); });
  await rect('snackLog2', '.snack-log');
  await shot('today_snack');
  // 이번 주
  await go(() => { S.tab = 'week'; render(); });
  await rect('wkRows', '.wk-cols'); await rect('splitCell', '.cell.split');
  rects.rows = await p.$$eval('.wk-row', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height]; }));
  await shot('week');
  // 따로 먹기 시트 (수요일 저녁)
  await go(() => { S.tab = 'today'; render(); openSheet({ type: 'pick', date: '2026-11-04', k: 'D', mode: 'plan', side: 'him', q: '', base: null, fruits: [] }); });
  await p.waitForTimeout(600); await shot('pick_split', false);
  await go(() => closeSheet());
  // 다음 주 준비
  await go(EN => { S.tab = 'week'; S.sub = 'prep'; getWeek('2026-11-09').memo = EN ? 'Great week! Try: tomato egg stir-fry, salmon steak, bibimbap, chicken curry' : '이번 주 잘했어요! 추천: 토마토달걀볶음, 연어 스테이크, 비빔밥, 닭가슴살 카레'; render(); });
  rects.steps = await p.$$eval('.step .num', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height]; }));
  await shot('prep');
  await go(() => { S.sub = 'grid'; S.tab = 'history'; render(); }); await shot('history');
  await go(() => { S.tab = 'menus'; S.mt = 'recipes'; render(); }); await shot('recipes');
  await go(() => { S.tab = 'menus'; S.mt = 'fridge'; render(); }); await shot('fridge');
  // 공유 이미지 두 장 (코치용 사진 모음, 남편용 계획표)
  const grab = async (fn, name) => {
    const b64 = await p.evaluate(async fn => {
      let got; window.shareFile = async blob => { got = got || blob; }; navigator.canShare = () => false; window.copyText = async () => true;
      await (fn === 'coach' ? sendCoach('2026-10-26') : shareHim('2026-11-02'));
      const buf = new Uint8Array(await got.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s);
    }, fn);
    fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, 'base64'));
  };
  if (!EN) await grab('coach', 'coach.jpg'); // 코치 사진 모음은 한국어 전용
  await grab('him', 'him.png');
  // 음식 사진 따로 (영상에서 날아다니는 접시)
  await p.addScriptTag({ path: path.join(__dirname, 'food.js') });
  if (!EN) for (const k of ['bibim', 'salad', 'kimchi', 'pancake', 'salmon', 'toast', 'curry', 'tomegg', 'yogurt', 'tteok', 'eggrice']) {
    const b64 = await p.evaluate(k => paintFood(k, 21).toDataURL('image/jpeg', .9).split(',')[1], k);
    fs.writeFileSync(`${OUT}/food_${k}.jpg`, Buffer.from(b64, 'base64'));
  }
  fs.writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 1));
  await b.close();
})();
