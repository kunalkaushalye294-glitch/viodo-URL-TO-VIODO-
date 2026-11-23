import { PopularShortFormat } from '../types/video';

interface SceneBeat {
  startSec: number;
  endSec: number;
  headline: string;
  subtext: string;
  zoomFrom: number;
  zoomTo: number;
  panX: number;
  tint: string;
}

const TEMPLATE_BEATS: Record<PopularShortFormat['sampleTemplateId'], { fileName: string; beats: SceneBeat[] }> = {
  street_food_countdown: {
    fileName: 'night_market_sizzle_short.webm',
    beats: [
      {
        startSec: 0,
        endSec: 1.4,
        headline: 'WAIT FOR THE FLAME',
        subtext: '01 · High-heat wok sear at 00:00',
        zoomFrom: 1.0,
        zoomTo: 1.12,
        panX: 0,
        tint: 'rgba(15, 23, 42, 0.35)',
      },
      {
        startSec: 1.4,
        endSec: 2.8,
        headline: 'GARLIC + CHILI OIL',
        subtext: '02 · Rapid aromatics drop',
        zoomFrom: 1.18,
        zoomTo: 1.08,
        panX: -18,
        tint: 'rgba(30, 27, 24, 0.32)',
      },
      {
        startSec: 2.8,
        endSec: 4.2,
        headline: 'SERVED IN 18 SECONDS',
        subtext: '03 · Steam reveal + loop cue',
        zoomFrom: 1.04,
        zoomTo: 1.16,
        panX: 12,
        tint: 'rgba(15, 23, 42, 0.28)',
      },
    ],
  },
  creator_desk_hook: {
    fileName: 'creator_rig_breakdown_short.webm',
    beats: [
      {
        startSec: 0,
        endSec: 1.4,
        headline: 'ONE LIGHT. ZERO CLUTTER.',
        subtext: 'Hook · Studio desk setup tour',
        zoomFrom: 1.0,
        zoomTo: 1.1,
        panX: 0,
        tint: 'rgba(15, 23, 42, 0.3)',
      },
      {
        startSec: 1.4,
        endSec: 2.8,
        headline: '45° SOFTBOX KEY',
        subtext: 'Step 1 · Diffused side contrast',
        zoomFrom: 1.15,
        zoomTo: 1.05,
        panX: 16,
        tint: 'rgba(15, 23, 42, 0.35)',
      },
      {
        startSec: 2.8,
        endSec: 4.2,
        headline: 'SAVE FOR YOUR NEXT SHOOT',
        subtext: 'Payoff · Full camera mount spec',
        zoomFrom: 1.05,
        zoomTo: 1.14,
        panX: -12,
        tint: 'rgba(15, 23, 42, 0.25)',
      },
    ],
  },
  urban_sprint_cut: {
    fileName: 'golden_hour_sprint_short.webm',
    beats: [
      {
        startSec: 0,
        endSec: 1.4,
        headline: '30 STAIRS · 06:15 AM',
        subtext: 'Beat 1 · Golden hour launch',
        zoomFrom: 1.02,
        zoomTo: 1.15,
        panX: -14,
        tint: 'rgba(15, 23, 42, 0.32)',
      },
      {
        startSec: 1.4,
        endSec: 2.8,
        headline: 'HOLD THE CADENCE',
        subtext: 'Beat 2 · Mid-stride match cut',
        zoomFrom: 1.18,
        zoomTo: 1.06,
        panX: 14,
        tint: 'rgba(15, 23, 42, 0.34)',
      },
      {
        startSec: 2.8,
        endSec: 4.2,
        headline: 'REPEAT TO TOP',
        subtext: 'Beat 3 · Summit loop frame',
        zoomFrom: 1.04,
        zoomTo: 1.14,
        panX: 0,
        tint: 'rgba(15, 23, 42, 0.26)',
      },
    ],
  },
  pottery_process_loop: {
    fileName: 'stoneware_wheel_short.webm',
    beats: [
      {
        startSec: 0,
        endSec: 1.4,
        headline: 'CENTERING 800G CLAY',
        subtext: '00:00 · Wet stoneware start',
        zoomFrom: 1.0,
        zoomTo: 1.1,
        panX: 0,
        tint: 'rgba(15, 23, 42, 0.32)',
      },
      {
        startSec: 1.4,
        endSec: 2.8,
        headline: 'PULLING THE WALL',
        subtext: '00:02 · Steady thumb compression',
        zoomFrom: 1.16,
        zoomTo: 1.08,
        panX: 10,
        tint: 'rgba(15, 23, 42, 0.30)',
      },
      {
        startSec: 2.8,
        endSec: 4.2,
        headline: 'CLEAN RIM FINISH',
        subtext: '00:04 · Ready for kiln trim',
        zoomFrom: 1.04,
        zoomTo: 1.12,
        panX: -10,
        tint: 'rgba(15, 23, 42, 0.25)',
      },
    ],
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image asset for sample video.'));
    img.src = src;
  });
}

export async function generateSampleShortVideo(format: PopularShortFormat): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Browser MediaRecorder is unavailable. Please upload an MP4 or WebM file directly.');
  }

  const template = TEMPLATE_BEATS[format.sampleTemplateId];
  const img = await loadImage(format.imagePath);

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
    videoBitsPerSecond: 1_800_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const durationSec = 4.2;

  const recordingDone = new Promise<File>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Failed while encoding sample WebM clip.'));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const file = new File([blob], template.fileName, { type: 'video/webm' });
      resolve(file);
    };
  });

  recorder.start(100);

  const startTime = performance.now();

  await new Promise<void>((resolve) => {
    function renderFrame(now: number) {
      const elapsedSec = (now - startTime) / 1000;
      if (elapsedSec >= durationSec) {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        resolve();
        return;
      }

      const beat =
        template.beats.find((b) => elapsedSec >= b.startSec && elapsedSec < b.endSec) ||
        template.beats[template.beats.length - 1];

      const beatProgress = Math.min(
        1,
        Math.max(0, (elapsedSec - beat.startSec) / Math.max(0.1, beat.endSec - beat.startSec))
      );

      const zoom = beat.zoomFrom + (beat.zoomTo - beat.zoomFrom) * beatProgress;
      const panX = beat.panX * beatProgress;

      ctx!.fillStyle = '#0F172A';
      ctx!.fillRect(0, 0, width, height);

      const drawW = width * zoom;
      const drawH = height * zoom;
      const offsetX = (width - drawW) / 2 + panX;
      const offsetY = (height - drawH) / 2;
      ctx!.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Contrast scrim
      const grad = ctx!.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
      grad.addColorStop(0.45, beat.tint);
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, width, height);

      // Top retention progress bar
      const totalProgress = elapsedSec / durationSec;
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx!.fillRect(28, 28, width - 56, 4);
      ctx!.fillStyle = '#FFFFFF';
      ctx!.fillRect(28, 28, (width - 56) * totalProgress, 4);

      // Timecode top-left
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx!.font = '600 18px monospace';
      ctx!.fillText(`00:0${elapsedSec.toFixed(1)}`, 28, 66);

      // Center kinetic headline
      ctx!.textAlign = 'center';
      ctx!.fillStyle = '#FFFFFF';
      ctx!.font = '700 34px sans-serif';
      ctx!.fillText(beat.headline, width / 2, height * 0.72);

      ctx!.fillStyle = 'rgba(226, 232, 240, 0.92)';
      ctx!.font = '500 20px sans-serif';
      ctx!.fillText(beat.subtext, width / 2, height * 0.77);

      ctx!.textAlign = 'left';

      requestAnimationFrame(renderFrame);
    }

    requestAnimationFrame(renderFrame);
  });

  return recordingDone;
}
