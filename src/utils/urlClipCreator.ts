import { UrlClipPlan, UrlClipStyle } from '../types/video';

const STYLE_PALETTES: Record<
  UrlClipStyle,
  {
    overlayTop: string;
    overlayMid: string;
    overlayBottom: string;
    accent: string;
    kickerColor: string;
  }
> = {
  editorial_dark: {
    overlayTop: 'rgba(15, 23, 42, 0.68)',
    overlayMid: 'rgba(15, 23, 42, 0.42)',
    overlayBottom: 'rgba(2, 6, 23, 0.92)',
    accent: '#FFFFFF',
    kickerColor: '#94A3B8',
  },
  cobalt_studio: {
    overlayTop: 'rgba(15, 23, 42, 0.65)',
    overlayMid: 'rgba(30, 58, 138, 0.36)',
    overlayBottom: 'rgba(15, 23, 42, 0.92)',
    accent: '#60A5FA',
    kickerColor: '#BFDBFE',
  },
  street_warm: {
    overlayTop: 'rgba(28, 25, 23, 0.65)',
    overlayMid: 'rgba(120, 53, 15, 0.32)',
    overlayBottom: 'rgba(12, 10, 9, 0.92)',
    accent: '#FBBF24',
    kickerColor: '#FDE68A',
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function resolveBackdropImage(
  remoteUrl: string | undefined,
  fallbackPath: string
): Promise<HTMLImageElement | null> {
  if (remoteUrl) {
    try {
      const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(remoteUrl)}`;
      return await loadImage(proxiedUrl);
    } catch {
      // Fall through to local fallback
    }
  }
  try {
    return await loadImage(fallbackPath);
  } catch {
    return null;
  }
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function renderVideoClipFromPlan(plan: UrlClipPlan): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Browser MediaRecorder is unavailable. Please try a modern desktop or mobile browser.');
  }

  const primaryImg = await resolveBackdropImage(plan.backdropImageUrl, plan.fallbackImagePath);
  const secondaryFallback = '/src/assets/images/short_street_food_1795427706012.jpg';
  const secondaryImg =
    plan.clipFormat === 'two_url_mashup'
      ? await resolveBackdropImage(plan.secondaryBackdropUrl, secondaryFallback)
      : primaryImg;

  const width = 540;
  const height = 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const slug = plan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
  const outputFileName = `${slug || 'url_short_clip'}.webm`;

  const recordingDone = new Promise<File>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Failed while encoding WebM video clip.'));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(new File([blob], outputFileName, { type: 'video/webm' }));
    };
  });

  const windows: Array<{ start: number; end: number; beat: UrlClipPlan['beats'][number] }> = [];
  let cursor = 0;
  for (const beat of plan.beats) {
    const dur = Math.max(1.2, beat.durationSec);
    windows.push({ start: cursor, end: cursor + dur, beat });
    cursor += dur;
  }
  const totalDuration = Math.max(3, cursor);
  const palette = STYLE_PALETTES[plan.style] || STYLE_PALETTES.editorial_dark;

  recorder.start(100);
  const startMs = performance.now();

  await new Promise<void>((resolve) => {
    function drawFrame(now: number) {
      const elapsedSec = (now - startMs) / 1000;
      if (elapsedSec >= totalDuration) {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        resolve();
        return;
      }

      const activeIdx = Math.max(
        0,
        windows.findIndex((w) => elapsedSec >= w.start && elapsedSec < w.end)
      );
      const current = windows[activeIdx] || windows[windows.length - 1];
      const beatDuration = Math.max(0.2, current.end - current.start);
      const beatProgress = Math.min(1, Math.max(0, (elapsedSec - current.start) / beatDuration));

      const direction = activeIdx % 2 === 0 ? 1 : -1;
      const zoom = 1.03 + 0.11 * (direction > 0 ? beatProgress : 1 - beatProgress);
      const panX = direction * (beatProgress - 0.5) * 28;

      const activeImg = current.beat.sourceSlot === 2 ? secondaryImg || primaryImg : primaryImg;

      ctx!.fillStyle = '#0F172A';
      ctx!.fillRect(0, 0, width, height);

      if (activeImg) {
        const imgRatio = activeImg.width / Math.max(1, activeImg.height);
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
        const drawW = baseW * zoom;
        const drawH = baseH * zoom;
        const offsetX = (width - drawW) / 2 + panX;
        const offsetY = (height - drawH) / 2;
        ctx!.drawImage(activeImg, offsetX, offsetY, drawW, drawH);
      }

      const grad = ctx!.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, palette.overlayTop);
      grad.addColorStop(0.45, palette.overlayMid);
      grad.addColorStop(1, palette.overlayBottom);
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, width, height);

      // Multi-segment progress bar at top
      const segGap = 6;
      const barMarginX = 24;
      const barY = 26;
      const totalBarW = width - barMarginX * 2;
      const segW = (totalBarW - segGap * (windows.length - 1)) / windows.length;

      for (let i = 0; i < windows.length; i++) {
        const sx = barMarginX + i * (segW + segGap);
        ctx!.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx!.fillRect(sx, barY, segW, 4);

        let fillRatio = 0;
        if (i < activeIdx) fillRatio = 1;
        else if (i === activeIdx) fillRatio = beatProgress;

        if (fillRatio > 0) {
          ctx!.fillStyle = palette.accent;
          ctx!.fillRect(sx, barY, segW * fillRatio, 4);
        }
      }

      // Top metadata line (active source domain + timecode)
      const activeDomain =
        current.beat.sourceSlot === 2 && plan.secondaryDomain
          ? plan.secondaryDomain
          : plan.domain;

      ctx!.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx!.font = '600 15px monospace';
      ctx!.fillText(activeDomain.toUpperCase(), barMarginX, 58);

      const timeStr = `00:${elapsedSec.toFixed(1).padStart(4, '0')}`;
      const timeWidth = ctx!.measureText(timeStr).width;
      ctx!.fillText(timeStr, width - barMarginX - timeWidth, 58);

      // Entrance ease for beat typography
      const enterProgress = Math.min(1, (elapsedSec - current.start) / 0.25);
      const slideOffset = (1 - enterProgress) * 18;
      ctx!.globalAlpha = 0.2 + 0.8 * enterProgress;

      // Prominent key-point index numeral
      const pointNum = String(current.beat.index).padStart(2, '0');
      ctx!.fillStyle = palette.accent;
      ctx!.font = '700 48px monospace';
      const pointY = height * 0.56 + slideOffset;
      ctx!.fillText(pointNum, 32, pointY);

      // Kicker
      ctx!.fillStyle = palette.kickerColor;
      ctx!.font = '700 15px sans-serif';
      const kickerY = pointY + 32;
      ctx!.fillText(current.beat.kicker.toUpperCase(), 32, kickerY);

      // Headline (wrapped cleanly)
      ctx!.fillStyle = '#FFFFFF';
      ctx!.font = '700 32px sans-serif';
      const headlineLines = wrapTextLines(ctx!, current.beat.headline, width - 64).slice(0, 3);
      let cursorY = kickerY + 40;
      for (const line of headlineLines) {
        ctx!.fillText(line, 32, cursorY);
        cursorY += 40;
      }

      // Caption / key point detail
      ctx!.fillStyle = 'rgba(226, 232, 240, 0.94)';
      ctx!.font = '500 19px sans-serif';
      const captionLines = wrapTextLines(ctx!, current.beat.caption, width - 64).slice(0, 3);
      cursorY += 10;
      for (const line of captionLines) {
        ctx!.fillText(line, 32, cursorY);
        cursorY += 27;
      }

      ctx!.globalAlpha = 1;

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  });

  return recordingDone;
}
