# Mealcat 소개 영상

`mealcat-intro.mp4` — 40초, 1080×1920 세로, 60fps, 한국어, 소리 포함.

- `capture.js` — 실제 앱에 한 주치 데이터를 넣고 화면을 찍음 → `shots/`
- `food.js` — 영상·앱 사진 칸에 쓰는 음식 접시 그림 (캔버스)
- `video.html` — 장면과 소리를 한 타임라인으로 (`seek(t)`, `renderAudio()`); `?t=12` 한 장면, `?play` 재생 미리보기
- `render.js` — 프레임 + 소리 → MP4 (ffmpeg)

다시 만들기 (리포 루트):

    python3 -m http.server 8132 &
    node promo/capture.js
    node promo/render.js

## 고양이 소리

`sfx/*.wav`는 진짜 고양이 녹음을 잘라 쓴 것: ESC-50 데이터셋(K. J. Piczak, 2015)의 cat 클래스, 원본은 freesound.org.
ESC-50 라이선스는 **CC BY-NC 3.0** — 비상업적 사용만 가능. 광고·상업용으로 쓰려면 상업 사용이 허락된 고양이 소리로 바꿔야 함.
