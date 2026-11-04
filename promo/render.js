// video.html → mealcat-intro.mp4 (1080×1920, 60fps, 40초, 소리 포함)
// 실행: (리포 루트에서) python3 -m http.server 8132 & node promo/render.js [미리보기 시각들...]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const EN = process.env.VLANG === 'en'; // 영어판(30초): VLANG=en
const FPS = 60, OUT = path.join(__dirname, EN ? 'mealcat-intro-en.mp4' : 'mealcat-intro.mp4'), TMP = process.env.TMPDIR || '/tmp';
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto('http://localhost:8132/promo/video.html' + (EN ? '?lang=en' : '')); await p.evaluate(() => window.ready);
  const DUR = await p.evaluate(() => DUR);
  const stills = process.argv.slice(2).map(Number);
  if (stills.length) { // 미리보기 컷만
    for (const t of stills) { await p.evaluate(t => seek(t), t); await p.screenshot({ path: path.join(TMP, `still-${EN ? 'en-' : ''}${t}.png`) }); }
    return b.close();
  }
  const wav = path.join(TMP, 'mealcat-audio.wav');
  fs.writeFileSync(wav, Buffer.from(await p.evaluate(() => renderAudio()), 'base64'));
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'animation',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < FPS * DUR; i++) {
    await p.evaluate(t => seek(t), i / FPS);
    const jpg = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await b.close(); console.log('done', OUT);
})();
