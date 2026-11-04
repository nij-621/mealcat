// 영상용 음식 "사진" — 캔버스로 그린 위에서 본 한 접시. paintFood(kind, seed) → canvas 800×800
(() => {
  const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
  function paintFood(kind, seed = 7) {
    const R = rng(seed * 9973 + 11), W = 800, cv = document.createElement('canvas'); cv.width = cv.height = W;
    const c = cv.getContext('2d'), rr = (a, b) => a + (b - a) * R();
    const blob = (x, y, r, col, wob = .25, n = 9) => { c.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, q = r * (1 + rr(-wob, wob)); i ? c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : c.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fillStyle = col; c.fill(); };
    const shade = (x, y, r, a = .18) => { const g = c.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, `rgba(0,0,0,${a * .8})`); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
    const inCircle = (cx, cy, r) => { for (;;) { const x = rr(-r, r), y = rr(-r, r); if (x * x + y * y < r * r) return [cx + x, cy + y]; } };
    // 식탁: 나무결 또는 리넨
    const wood = R() < .6;
    c.fillStyle = wood ? `hsl(${rr(26, 34)},${rr(38, 50)}%,${rr(60, 70)}%)` : `hsl(${rr(30, 200)},${rr(10, 22)}%,${rr(84, 90)}%)`; c.fillRect(0, 0, W, W);
    if (wood) for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(90,50,20,${rr(.03, .1)})`; c.lineWidth = rr(1, 5); c.beginPath(); const y = rr(-50, W + 50); c.moveTo(0, y); c.bezierCurveTo(W * .3, y + rr(-20, 20), W * .6, y + rr(-20, 20), W, y + rr(-15, 15)); c.stroke(); }
    else for (let i = 0; i < W; i += 6) { c.fillStyle = `rgba(0,0,0,${rr(.01, .035)})`; c.fillRect(i, 0, 2, W); c.fillRect(0, i, W, 2); }
    // 냅킨·수저 소품
    if (R() < .7) { c.save(); c.translate(rr(80, 160), rr(560, 700)); c.rotate(rr(-.4, .4)); c.fillStyle = ['#f3d6d2', '#dfe9e2', '#fbf1d8', '#e5e3f3'][Math.floor(R() * 4)]; c.fillRect(-120, -90, 240, 180); c.restore(); }
    c.save(); c.translate(rr(650, 720), 400); c.rotate(rr(-.12, .12)); c.fillStyle = '#c9c4bd'; c.fillRect(-7, -300, 14, 560); c.fillStyle = '#b7b1aa'; c.beginPath(); c.ellipse(0, -300, 26, 40, 0, 0, 7); c.fill(); c.restore();
    // 그릇 그림자 + 그릇
    const cx = 390, cy = 395, pot = kind === 'kimchi' || kind === 'tteok';
    c.fillStyle = 'rgba(40,20,0,.22)'; c.filter = 'blur(18px)'; c.beginPath(); c.arc(cx + 18, cy + 26, 300, 0, 7); c.fill(); c.filter = 'none';
    const plate = pot ? '#3b2a24' : ['#fbfaf7', '#f4efe6', '#e9eef2', '#fff8ef'][Math.floor(R() * 4)];
    c.fillStyle = plate; c.beginPath(); c.arc(cx, cy, 300, 0, 7); c.fill();
    c.strokeStyle = pot ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, 262, 0, 7); c.stroke();
    const inner = pot ? 255 : 235;
    const base = (col, col2) => { const g = c.createRadialGradient(cx - 40, cy - 50, 20, cx, cy, inner); g.addColorStop(0, col); g.addColorStop(1, col2); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, inner, 0, 7); c.fill(); };
    const rice = (x, y, r) => { blob(x, y, r, '#f7f4ec', .08, 18); for (let i = 0; i < r * 4; i++) { const [px, py] = inCircle(x, y, r * .95); c.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '200,190,170'},${rr(.4, .9)})`; c.beginPath(); c.ellipse(px, py, 7, 4, rr(0, 3), 0, 7); c.fill(); } };
    const egg = (x, y, r) => { blob(x, y, r, '#fffdf6', .18, 12); const g = c.createRadialGradient(x - 10, y - 12, 4, x, y, r * .4); g.addColorStop(0, '#ffd45a'); g.addColorStop(1, '#f29a12'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * .38, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(x - r * .12, y - r * .14, r * .1, r * .06, -.6, 0, 7); c.fill(); };
    const scatter = (n, r, fn) => { for (let i = 0; i < n; i++) { const [x, y] = inCircle(cx, cy, r); fn(x, y); } };
    const onion = (n, r = inner - 30) => scatter(n, r, (x, y) => { c.strokeStyle = R() < .5 ? '#5aa33c' : '#8ccf5a'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, rr(6, 10), 0, 7); c.stroke(); });
    const sesame = n => scatter(n, inner - 40, (x, y) => { c.fillStyle = '#f2e6c4'; c.beginPath(); c.ellipse(x, y, 4, 2.2, rr(0, 3), 0, 7); c.fill(); });
    switch (kind) {
      case 'yogurt': base('#ffffff', '#efe9df');
        scatter(55, 120, (x, y) => blob(x + 60, y - 40, rr(9, 16), ['#c78a45', '#b0763a', '#dba560'][Math.floor(R() * 3)], .4, 6));
        scatter(16, 150, (x, y) => { blob(x - 70, y + 50, 17, '#2f3a78', .08); shade(x - 70, y + 50, 17, .35); });
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + .3, x = cx + Math.cos(a) * 150, y = cy + Math.sin(a) * 150; blob(x, y, 36, '#e2333f', .12); c.fillStyle = '#ffb3b3'; c.beginPath(); c.ellipse(x, y, 18, 24, a, 0, 7); c.fill(); }
        c.fillStyle = 'rgba(240,180,60,.55)'; c.lineWidth = 7; c.strokeStyle = '#e8a93a'; c.beginPath(); c.moveTo(cx - 120, cy - 60); c.bezierCurveTo(cx - 20, cy + 40, cx + 60, cy - 80, cx + 140, cy + 20); c.stroke(); break;
      case 'salad': base('#7bb661', '#3f7d32');
        scatter(70, inner - 25, (x, y) => blob(x, y, rr(28, 52), `hsl(${rr(85, 125)},${rr(45, 70)}%,${rr(32, 58)}%)`, .45, 7));
        for (let i = 0; i < 7; i++) { const [x, y] = inCircle(cx, cy, 120); c.fillStyle = '#e9d2b0'; c.save(); c.translate(x, y); c.rotate(rr(0, 3)); c.fillRect(-55, -16, 110, 32); c.fillStyle = '#c99a62'; c.fillRect(-55, -16, 110, 7); c.restore(); }
        scatter(11, inner - 40, (x, y) => { blob(x, y, 24, '#e43b2c', .05); c.fillStyle = '#ff9a7a'; c.beginPath(); c.arc(x, y, 13, 0, 7); c.fill(); c.fillStyle = '#ffe2a0'; c.beginPath(); c.arc(x + 4, y, 3, 0, 7); c.arc(x - 4, y + 3, 3, 0, 7); c.fill(); });
        scatter(26, inner - 40, (x, y) => { c.fillStyle = '#f7cf3c'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); }); break;
      case 'kimchi': base('#e2502a', '#a8260f');
        scatter(40, inner - 20, (x, y) => blob(x, y, rr(16, 34), `rgba(${rr(150, 200)},${rr(30, 60)},20,.6)`, .5, 7));
        for (let i = 0; i < 6; i++) { const [x, y] = inCircle(cx, cy, 150); c.save(); c.translate(x, y); c.rotate(rr(0, 1.5)); c.fillStyle = '#fbf6ea'; c.fillRect(-36, -36, 72, 72); c.fillStyle = 'rgba(220,120,60,.25)'; c.fillRect(-36, 18, 72, 18); c.restore(); }
        scatter(10, 170, (x, y) => blob(x, y, rr(22, 30), '#f0b8a6', .35, 7));
        onion(22); scatter(30, inner - 10, (x, y) => { c.fillStyle = 'rgba(255,190,90,.6)'; c.beginPath(); c.arc(x, y, rr(3, 7), 0, 7); c.fill(); }); break;
      case 'eggrice': base('#f7f4ec', '#e2dccd'); rice(cx, cy, inner - 15); egg(cx + 10, cy - 10, 120);
        c.strokeStyle = 'rgba(90,45,10,.65)'; c.lineWidth = 9; c.beginPath(); c.moveTo(cx - 150, cy + 60); c.bezierCurveTo(cx - 60, cy + 130, cx + 60, cy + 40, cx + 160, cy + 110); c.stroke(); onion(18, 200); sesame(40); break;
      case 'curry': base('#fbfaf7', '#ebe5d9'); rice(cx - 90, cy - 30, 150);
        c.fillStyle = '#c4801e'; c.beginPath(); c.ellipse(cx + 70, cy + 40, 200, 175, .2, 0, 7); c.fill(); c.fillStyle = 'rgba(255,200,80,.35)'; c.beginPath(); c.ellipse(cx + 40, cy + 10, 120, 90, .2, 0, 7); c.fill();
        for (let i = 0; i < 9; i++) { const [x, y] = inCircle(cx + 80, cy + 50, 140); c.save(); c.translate(x, y); c.rotate(rr(0, 3)); c.fillStyle = R() < .5 ? '#f08a24' : '#f3d27a'; c.fillRect(-18, -18, 36, 36); c.restore(); }
        scatter(6, 120, (x, y) => blob(x + 70, y + 40, 18, '#e6c08a', .3, 6)); break;
      case 'tomegg': base('#fbfaf7', '#ebe5d9');
        scatter(26, 190, (x, y) => blob(x, y, rr(26, 46), `hsl(${rr(44, 50)},95%,${rr(55, 66)}%)`, .45, 8));
        scatter(12, 180, (x, y) => { blob(x, y, rr(24, 34), '#d9361e', .3, 6); c.fillStyle = 'rgba(255,140,110,.5)'; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill(); });
        c.fillStyle = 'rgba(210,60,20,.25)'; c.beginPath(); c.arc(cx, cy, 200, 0, 7); c.fill(); onion(16, 180); break;
      case 'toast': base('#fbfaf7', '#ebe5d9');
        c.save(); c.translate(cx - 30, cy - 10); c.rotate(-.18); c.fillStyle = '#b8742c'; c.beginPath(); c.roundRect(-150, -150, 300, 300, 50); c.fill(); c.fillStyle = '#e8b36a'; c.beginPath(); c.roundRect(-128, -128, 256, 256, 40); c.fill();
        for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(160,90,30,.25)'; c.beginPath(); c.arc(rr(-120, 120), rr(-120, 120), rr(2, 6), 0, 7); c.fill(); }
        c.fillStyle = '#fff1b8'; c.beginPath(); c.roundRect(-40, -30, 80, 60, 10); c.fill(); c.restore();
        for (let i = 0; i < 5; i++) { const a = 1.9 + i * .28; const x = cx + Math.cos(a) * 205, y = cy + Math.sin(a) * 205; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = '#c8233a'; c.beginPath(); c.ellipse(0, 0, 30, 62, 0, 0, 7); c.fill(); c.fillStyle = '#fff6d8'; c.beginPath(); c.ellipse(4, 0, 22, 54, 0, 0, 7); c.fill(); c.restore(); } break;
      case 'bibim': base('#f7f4ec', '#e2dccd');
        { const parts = ['#3f8a2c', '#f08a24', '#f4ecc8', '#7a4a2a', '#d9361e', '#8bc34a']; for (let i = 0; i < 6; i++) { const a0 = i / 6 * 6.283; c.fillStyle = parts[i]; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, inner - 15, a0, a0 + 1.047); c.closePath(); c.fill();
          for (let j = 0; j < 40; j++) { const a = a0 + rr(.1, .95), r = rr(80, inner - 30), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; c.strokeStyle = `rgba(255,255,255,${rr(.08, .25)})`; c.lineWidth = rr(2, 6); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rr(-20, 20), y + rr(-20, 20)); c.stroke(); } } }
        blob(cx + 60, cy + 70, 38, '#c4231a', .25, 8); egg(cx - 5, cy - 5, 95); sesame(30); break;
      case 'salmon': base('#fbfaf7', '#ebe5d9');
        c.save(); c.translate(cx - 20, cy); c.rotate(-.3); c.fillStyle = '#f07a45'; c.beginPath(); c.roundRect(-150, -85, 300, 170, 60); c.fill(); c.strokeStyle = 'rgba(255,230,210,.75)'; c.lineWidth = 7; for (let i = -120; i < 140; i += 40) { c.beginPath(); c.moveTo(i, -80); c.quadraticCurveTo(i + 25, 0, i, 80); c.stroke(); } c.fillStyle = 'rgba(150,60,20,.35)'; c.fillRect(-150, -85, 300, 26); c.restore();
        for (let i = 0; i < 6; i++) { c.save(); c.translate(cx + 20, cy + 175 - i * 6); c.rotate(-.15 + i * .06); c.fillStyle = i % 2 ? '#4f8f2c' : '#6aa83a'; c.beginPath(); c.roundRect(-150, -9, 300, 18, 9); c.fill(); c.restore(); }
        c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(cx + 160, cy - 150, 55, 0, 7); c.fill(); c.fillStyle = '#fff6b0'; c.beginPath(); c.arc(cx + 160, cy - 150, 44, 0, 7); c.fill(); break;
      case 'pancake': base('#fbfaf7', '#ebe5d9');
        for (let i = 3; i >= 0; i--) { blob(cx - i * 6, cy - i * 10, 200, i ? '#c9852f' : '#e1a24a', .03, 30); }
        c.fillStyle = 'rgba(140,60,10,.55)'; c.beginPath(); c.ellipse(cx - 20, cy - 40, 130, 100, .3, 0, 7); c.fill();
        c.fillStyle = '#fff3c0'; c.beginPath(); c.roundRect(cx - 50, cy - 70, 70, 50, 8); c.fill();
        scatter(12, 210, (x, y) => { blob(x, y, 17, R() < .5 ? '#2f3a78' : '#c8233a', .1); shade(x, y, 17, .3); }); break;
      case 'tteok': base('#e2502a', '#a8260f');
        for (let i = 0; i < 16; i++) { const [x, y] = inCircle(cx, cy, 190); c.save(); c.translate(x, y); c.rotate(rr(0, 3)); c.fillStyle = '#fbe3d0'; c.beginPath(); c.roundRect(-58, -18, 116, 36, 18); c.fill(); c.fillStyle = 'rgba(230,70,30,.45)'; c.beginPath(); c.roundRect(-58, 2, 116, 16, 8); c.fill(); c.restore(); }
        for (let i = 0; i < 3; i++) { const [x, y] = inCircle(cx, cy, 150); c.save(); c.translate(x, y); c.rotate(rr(0, 3)); c.fillStyle = '#f1d9a8'; c.beginPath(); c.moveTo(-60, -30); c.lineTo(60, -20); c.lineTo(55, 25); c.lineTo(-55, 30); c.fill(); c.restore(); }
        egg(cx + 120, cy - 110, 60); onion(18); sesame(25); break;
    }
    // 김 + 조명
    const g = c.createRadialGradient(W * .35, W * .3, 50, W * .5, W * .5, W * .75); g.addColorStop(0, 'rgba(255,248,230,.18)'); g.addColorStop(1, 'rgba(40,20,0,.28)'); c.fillStyle = g; c.fillRect(0, 0, W, W);
    return cv;
  }
  window.paintFood = paintFood;
})();
