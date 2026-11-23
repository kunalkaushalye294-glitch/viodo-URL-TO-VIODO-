import { AiMoviePlan, AiMovieScene } from '../types/video';

const MOOD_PALETTES: Record<
  AiMovieScene['visualMood'],
  { bgTop: string; bgMid: string; bgBottom: string; glow: string; accent: string }
> = {
  noir: {
    bgTop: '#020617',
    bgMid: '#0F172A',
    bgBottom: '#1E293B',
    glow: 'rgba(148, 163, 184, 0.28)',
    accent: '#E2E8F0',
  },
  neon: {
    bgTop: '#090D1F',
    bgMid: '#172554',
    bgBottom: '#0F172A',
    glow: 'rgba(59, 130, 246, 0.42)',
    accent: '#60A5FA',
  },
  warm_gold: {
    bgTop: '#1C1917',
    bgMid: '#451A03',
    bgBottom: '#0C0A09',
    glow: 'rgba(245, 158, 11, 0.36)',
    accent: '#FBBF24',
  },
  crimson: {
    bgTop: '#18080D',
    bgMid: '#450A0A',
    bgBottom: '#09090B',
    glow: 'rgba(239, 68, 68, 0.34)',
    accent: '#F87171',
  },
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderMovieFromPlan(plan: AiMoviePlan): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Browser MediaRecorder is unavailable in this environment.');
  }

  const isVertical = plan.aspectRatio === '9:16';
  const width = isVertical ? 540 : 960;
  const height = isVertical ? 960 : 540;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  // Preload any scene keyframe images or fallback assets
  const fallbackAssets = [
    '/src/assets/images/short_creator_studio_1795427706081.jpg',
    '/src/assets/images/short_urban_parkour_1795427705892.jpg',
    '/src/assets/images/short_street_food_1795427706012.jpg',
    '/src/assets/images/short_craft_pottery_1795427705886.jpg',
  ];

  const loadedImages: Array<HTMLImageElement | null> = await Promise.all(
    plan.scenes.map(async (scene, idx) => {
      if (scene.imageDataUrl) {
        const img = await loadImage(scene.imageDataUrl);
        if (img) return img;
      }
      return loadImage(fallbackAssets[idx % fallbackAssets.length]);
    })
  );

  // Subtle ambient Web Audio score mixed into MediaRecorder stream
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  const videoStream = canvas.captureStream(24);
  const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

  try {
    audioCtx = new AudioContext();
    audioDest = audioCtx.createMediaStreamDestination();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(audioDest);

    const oscA = audioCtx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 110;
    const oscB = audioCtx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 164.81;

    oscA.connect(masterGain);
    oscB.connect(masterGain);
    oscA.start();
    oscB.start();

    const audioTrack = audioDest.stream.getAudioTracks()[0];
    if (audioTrack) {
      combinedTracks.push(audioTrack);
    }
  } catch {
    // Fallback cleanly to video-only track if audio synthesis is blocked
  }

  const combinedStream = new MediaStream(combinedTracks);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

  const recorder = mimeType
    ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2_500_000 })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const slug =
    plan.movieTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'ai_movie_short';

  const outputReady = new Promise<File>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Failed while encoding movie video file.'));
    recorder.onstop = () => {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(new File([blob], `${slug}.webm`, { type: 'video/webm' }));
    };
  });

  const windows: Array<{ start: number; end: number; scene: AiMovieScene; idx: number }> = [];
  let cursor = 0;
  plan.scenes.forEach((scene, idx) => {
    const dur = Math.max(1.8, scene.durationSec || 2.5);
    windows.push({ start: cursor, end: cursor + dur, scene, idx });
    cursor += dur;
  });
  const totalDur = Math.max(4, cursor);

  recorder.start(100);
  const startMs = performance.now();

  await new Promise<void>((resolve) => {
    function drawFrame(now: number) {
      const elapsedSec = (now - startMs) / 1000;
      if (elapsedSec >= totalDur) {
        recorder.stop();
        combinedStream.getTracks().forEach((t) => t.stop());
        resolve();
        return;
      }

      const activeIdx = Math.max(
        0,
        windows.findIndex((w) => elapsedSec >= w.start && elapsedSec < w.end)
      );
      const current = windows[activeIdx] || windows[windows.length - 1];
      const sceneDur = Math.max(0.2, current.end - current.start);
      const progress = Math.min(1, Math.max(0, (elapsedSec - current.start) / sceneDur));
      const mood = MOOD_PALETTES[current.scene.visualMood] || MOOD_PALETTES.neon;
      const img = loadedImages[current.idx];

      // Background base
      const bgGrad = ctx!.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, mood.bgTop);
      bgGrad.addColorStop(0.55, mood.bgMid);
      bgGrad.addColorStop(1, mood.bgBottom);
      ctx!.fillStyle = bgGrad;
      ctx!.fillRect(0, 0, width, height);

      // Animated backdrop image with directional camera motion
      if (img) {
        const imgRatio = img.width / Math.max(1, img.height);
        const canvasRatio = width / height;
        let baseW = width;
        let baseH = height;
        if (imgRatio > canvasRatio) {
          baseH = height;
          baseW = height * imgRatio;
        } else {
          baseW = width;
          baseH = width / Math.max(0.1, imgRatio);
        }

        let zoom = 1.06;
        let panX = 0;
        if (current.scene.cameraMotion === 'zoom_in') {
          zoom = 1.04 + 0.14 * progress;
        } else if (current.scene.cameraMotion === 'pan_left') {
          zoom = 1.12;
          panX = (0.5 - progress) * 44;
        } else if (current.scene.cameraMotion === 'pan_right') {
          zoom = 1.12;
          panX = (progress - 0.5) * 44;
        } else {
          zoom = 1.05 + 0.04 * Math.sin(progress * Math.PI);
        }

        const drawW = baseW * zoom;
        const drawH = baseH * zoom;
        ctx!.save();
        ctx!.globalAlpha = current.scene.imageDataUrl ? 0.92 : 0.42;
        ctx!.drawImage(img, (width - drawW) / 2 + panX, (height - drawH) / 2, drawW, drawH);
        ctx!.restore();
      }

      // Cinematic vignette & atmospheric glow orb
      const radial = ctx!.createRadialGradient(
        width * (0.3 + 0.4 * progress),
        height * 0.34,
        24,
        width * 0.5,
        height * 0.45,
        width * 0.85
      );
      radial.addColorStop(0, mood.glow);
      radial.addColorStop(1, 'rgba(2, 6, 23, 0.86)');
      ctx!.fillStyle = radial;
      ctx!.fillRect(0, 0, width, height);

      // Subtle floating light motes
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let m = 0; m < 10; m++) {
        const mx = ((m * 137 + elapsedSec * (18 + m * 3)) % (width + 40)) - 20;
        const my = ((m * 97 + Math.sin(elapsedSec + m) * 28) % height + height) % height;
        ctx!.beginPath();
        ctx!.arc(mx, my, (m % 3) + 1.2, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Top & bottom cinema framing + progress segments
      const barH = isVertical ? 48 : 34;
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx!.fillRect(0, 0, width, barH);
      ctx!.fillRect(0, height - barH, width, barH);

      const segGap = 5;
      const padX = 24;
      const segW = (width - padX * 2 - segGap * (windows.length - 1)) / windows.length;
      windows.forEach((_, i) => {
        const sx = padX + i * (segW + segGap);
        ctx!.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx!.fillRect(sx, barH - 12, segW, 3);
        const fill = i < activeIdx ? 1 : i === activeIdx ? progress : 0;
        if (fill > 0) {
          ctx!.fillStyle = mood.accent;
          ctx!.fillRect(sx, barH - 12, segW * fill, 3);
        }
      });

      // Header metadata inside top bar
      ctx!.fillStyle = 'rgba(248, 250, 252, 0.88)';
      ctx!.font = '600 13px monospace';
      ctx!.fillText(
        `${plan.movieTitle.toUpperCase()} · SCENE ${String(current.scene.sceneNumber).padStart(2, '0')}/${String(windows.length).padStart(2, '0')}`,
        padX,
        barH - 22
      );

      const timeStr = `${elapsedSec.toFixed(1)}s / ${totalDur.toFixed(0)}s`;
      const timeW = ctx!.measureText(timeStr).width;
      ctx!.fillText(timeStr, width - padX - timeW, barH - 22);

      // Entrance fade/slide
      const enter = Math.min(1, (elapsedSec - current.start) / 0.3);
      ctx!.save();
      ctx!.globalAlpha = 0.15 + 0.85 * enter;
      const slideY = (1 - enter) * 16;

      // Act label & scene headline
      const contentStartY = isVertical ? height * 0.56 + slideY : height * 0.44 + slideY;
      ctx!.fillStyle = mood.accent;
      ctx!.font = '700 14px monospace';
      ctx!.fillText(current.scene.actLabel.toUpperCase(), 32, contentStartY);

      ctx!.fillStyle = '#FFFFFF';
      ctx!.font = isVertical ? '700 32px sans-serif' : '700 34px sans-serif';
      const headLines = wrapLines(ctx!, current.scene.headline, width - 64).slice(0, 2);
      let curY = contentStartY + 40;
      for (const hl of headLines) {
        ctx!.fillText(hl, 32, curY);
        curY += isVertical ? 40 : 42;
      }

      // Narration subtitle
      ctx!.fillStyle = 'rgba(226, 232, 240, 0.94)';
      ctx!.font = isVertical ? '500 19px sans-serif' : '500 18px sans-serif';
      const subLines = wrapLines(ctx!, current.scene.narrationSubtitle, width - 64).slice(0, 3);
      curY += 10;
      for (const sl of subLines) {
        ctx!.fillText(sl, 32, curY);
        curY += 27;
      }

      ctx!.restore();
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });

  return outputReady;
}
