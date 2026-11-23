import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MODELS = new Set(['gemini-4-neon', 'gemini-4-hydrogen']);

interface CachedVideoSession {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  createdAt: number;
}

const videoSessionCache = new Map<string, CachedVideoSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CACHED_SESSIONS = 6;

function pruneVideoSessions() {
  const now = Date.now();
  for (const [key, session] of videoSessionCache.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      videoSessionCache.delete(key);
    }
  }
  while (videoSessionCache.size >= MAX_CACHED_SESSIONS) {
    const oldestKey = videoSessionCache.keys().next().value;
    if (!oldestKey) break;
    videoSessionCache.delete(oldestKey);
  }
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getNvidiaApiKey(): string | null {
  const key = (process.env.NVIDIA_API_KEY || '').trim();
  if (!key || key === 'MY_NVIDIA_API_KEY') {
    return null;
  }
  return key;
}

function isSafeExternalUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const NVIDIA_ASPECT_DIMENSIONS: Record<'9:16' | '1:1' | '16:9' | '3:4', { width: number; height: number }> = {
  '9:16': { width: 768, height: 1344 },
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '3:4': { width: 896, height: 1152 },
};

async function generateNvidiaImage(
  prompt: string,
  aspectRatio: '9:16' | '1:1' | '16:9' | '3:4',
  modelSlug: 'black-forest-labs/flux.1-dev' | 'stabilityai/stable-diffusion-3-medium'
): Promise<{ dataUrl: string; mimeType: string }> {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured. Add your nvapi-... key in Settings > Secrets.');
  }

  const dims = NVIDIA_ASPECT_DIMENSIONS[aspectRatio] || NVIDIA_ASPECT_DIMENSIONS['9:16'];
  const invokeUrl = `https://ai.api.nvidia.com/v1/genai/${modelSlug}`;
  const payload =
    modelSlug === 'black-forest-labs/flux.1-dev'
      ? {
          prompt,
          mode: 'base',
          cfg_scale: 3.5,
          width: dims.width,
          height: dims.height,
          steps: 30,
        }
      : {
          prompt,
          cfg_scale: 5,
          aspect_ratio: aspectRatio,
          steps: 30,
        };

  const res = await fetch(invokeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });

  const rawText = await res.text();
  let parsed: {
    artifacts?: Array<{ base64?: string }>;
    data?: Array<{ b64_json?: string; url?: string }>;
    image?: string;
    detail?: string;
    message?: string;
    error?: string | { message?: string };
  } = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Non-JSON response
  }

  if (!res.ok) {
    const errMsg =
      (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ||
      parsed.detail ||
      parsed.message ||
      `NVIDIA NIM image request failed (HTTP ${res.status}).`;
    throw new Error(errMsg);
  }

  const b64 =
    parsed.artifacts?.[0]?.base64 ||
    parsed.data?.[0]?.b64_json ||
    parsed.image;

  if (b64) {
    const mimeType = b64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    return {
      dataUrl: `data:${mimeType};base64,${b64}`,
      mimeType,
    };
  }

  const imgUrl = parsed.data?.[0]?.url;
  if (imgUrl && isSafeExternalUrl(imgUrl)) {
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
    if (imgRes.ok) {
      const mimeType = (imgRes.headers.get('content-type') || 'image/png').split(';')[0];
      const buf = Buffer.from(await imgRes.arrayBuffer());
      return {
        dataUrl: `data:${mimeType};base64,${buf.toString('base64')}`,
        mimeType,
      };
    }
  }

  throw new Error('NVIDIA NIM returned no image payload.');
}

async function generateNvidiaChatJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured. Add your nvapi-... key in Settings > Secrets.');
  }

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      temperature: 0.4,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error?.message || data.detail || `NVIDIA NIM chat request failed (HTTP ${res.status}).`
    );
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('NVIDIA NIM returned an empty script response.');
  }
  return content;
}

function resolveModel(
  requested?: unknown,
  fallback: 'gemini-4-neon' | 'gemini-4-hydrogen' = 'gemini-4-neon'
): 'gemini-4-neon' | 'gemini-4-hydrogen' {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested)) {
    return requested as 'gemini-4-neon' | 'gemini-4-hydrogen';
  }
  return fallback;
}

function extractErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string; status?: string; code?: number } };
      if (parsed?.error?.message) {
        return `${parsed.error.code ?? ''} ${parsed.error.status ?? ''} ${parsed.error.message}`.trim();
      }
    } catch {
      // Fall through to raw string
    }
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  const text = extractErrorText(err).toLowerCase();
  return (
    text.includes('503') ||
    text.includes('unavailable') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('500 internal')
  );
}

async function callWithRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        const delayMs = 700 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function formatGeminiError(err: unknown, modelUsed: string): { status: number; message: string; code: string } {
  const rawMessage = extractErrorText(err);
  const lower = rawMessage.toLowerCase();
  const isPaidMediaModel =
    modelUsed.includes('image') ||
    modelUsed.includes('nano-banana') ||
    modelUsed.includes('omni');
  const modelLabel =
    modelUsed === 'gemini-4-neon'
      ? 'Gemini 4 Neon'
      : modelUsed === 'gemini-omni-1.2-flash'
        ? 'Gemini Omni 1.2 Flash'
        : modelUsed.includes('nano-banana') || modelUsed.includes('image')
          ? 'Gemini Image Generator'
          : 'Gemini 4 Hydrogen';

  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      status: 503,
      code: 'MODEL_UNAVAILABLE',
      message: `${modelLabel} is temporarily experiencing high demand. Click Try Again in a few seconds, or switch models.`,
    };
  }

  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message: isPaidMediaModel
        ? `${modelLabel} requires a billing-enabled API key in Settings > Secrets. Add a paid key for native image/video generation, or use the Free-Tier Smart Remix / Motion Studio options.`
        : modelUsed === 'gemini-4-neon'
          ? 'Gemini 4 Neon quota exhausted or requires a billing-enabled API key. Select a paid key in Settings > Secrets, or switch to Gemini 4 Hydrogen.'
          : 'API rate limit or quota reached. Please wait a moment and try again, or check your quota in Settings > Secrets.',
    };
  }

  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message:
        'Your Gemini API key was rejected or lacks permission for this model. Check or update your key in the Settings > Secrets panel.',
    };
  }

  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: `Model "${modelUsed}" was not found or is currently unavailable for your key. Try switching models or verifying your API key in Settings > Secrets.`,
    };
  }

  return {
    status: 500,
    code: 'GEMINI_ERROR',
    message: rawMessage || 'Unexpected error while calling Gemini API.',
  };
}

function extractMetaTag(html: string, propertyOrName: string): string | undefined {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const pattern2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern1) || html.match(pattern2);
  if (!match?.[1]) return undefined;
  return decodeHtmlEntities(match[1].trim());
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function extractPageTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : undefined;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 45 * 1024 * 1024, // 45 MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload an MP4, WebM, or MOV video file.'));
    }
  },
});

const videoAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'A concise, descriptive editorial title for the video content.',
    },
    category: {
      type: Type.STRING,
      description: 'Short-form content category (e.g., Street Food, Tech Review, Fitness, Craft, Comedy).',
    },
    summary: {
      type: Type.STRING,
      description: 'A 2 to 3 sentence summary covering both visual events and audio/spoken context.',
    },
    hookAnalysis: {
      type: Type.OBJECT,
      properties: {
        timestamp: { type: Type.STRING, description: 'Opening window, e.g., 00:00 - 00:03' },
        visualHook: { type: Type.STRING, description: 'What visually grabs attention in the opening frames.' },
        audioHook: { type: Type.STRING, description: 'Opening sound effect, music drop, or spoken hook.' },
        retentionMechanism: { type: Type.STRING, description: 'Why viewers keep watching past the first 3 seconds.' },
      },
      required: ['timestamp', 'visualHook', 'audioHook', 'retentionMechanism'],
    },
    pacingAndEditing: {
      type: Type.OBJECT,
      properties: {
        estimatedCutCount: { type: Type.INTEGER, description: 'Estimated number of distinct camera or scene cuts.' },
        averageShotLength: { type: Type.STRING, description: 'Estimated average shot duration, e.g., 1.4s per cut.' },
        visualStyle: { type: Type.STRING, description: 'Camera framing, lighting, color tone, and motion style.' },
        audioLayering: { type: Type.STRING, description: 'Voiceover, ambient sound, SFX, or music bed balance.' },
      },
      required: ['estimatedCutCount', 'averageShotLength', 'visualStyle', 'audioLayering'],
    },
    timelineMoments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.STRING, description: 'Formatted MM:SS timestamp, e.g., 00:04' },
          seconds: { type: Type.NUMBER, description: 'Numeric timestamp in seconds for seeking, e.g., 4' },
          visualAction: { type: Type.STRING, description: 'Exact visual action occurring on screen.' },
          audioOrTextCue: { type: Type.STRING, description: 'Spoken words, sound cue, or on-screen text at this moment.' },
          importance: {
            type: Type.STRING,
            description: 'Must be one of: hook, peak, payoff, transition',
          },
        },
        required: ['timestamp', 'seconds', 'visualAction', 'audioOrTextCue', 'importance'],
      },
    },
    transcriptAndOnScreenText: {
      type: Type.OBJECT,
      properties: {
        spokenTranscript: {
          type: Type.STRING,
          description: 'Accurate transcript of spoken dialogue or narration, or "No spoken dialogue detected" if silent/music-only.',
        },
        onScreenOverlays: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of text overlays, captions, or labels visible in the video frames.',
        },
      },
      required: ['spokenTranscript', 'onScreenOverlays'],
    },
    viralDrivers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          driver: { type: Type.STRING, description: 'Short name of the engagement driver (e.g., Curiosity Gap, Sensory Payoff).' },
          explanation: { type: Type.STRING, description: 'Specific evidence from the video explaining this driver.' },
        },
        required: ['driver', 'explanation'],
      },
    },
    remixIdeas: {
      type: Type.OBJECT,
      properties: {
        suggestedTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
        captionTemplates: { type: Type.ARRAY, items: { type: Type.STRING } },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['suggestedTitles', 'captionTemplates', 'hashtags'],
    },
  },
  required: [
    'title',
    'category',
    'summary',
    'hookAnalysis',
    'pacingAndEditing',
    'timelineMoments',
    'transcriptAndOnScreenText',
    'viralDrivers',
    'remixIdeas',
  ],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, hasApiKey: Boolean(getAiClient()) });
  });

  app.post('/api/analyze-video', (req: Request, res: Response) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Video upload failed.' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Please select or drop a video file to analyze.' });
      }

      const ai = getAiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
        });
      }

      const modelUsed = resolveModel(req.body?.model);
      const focusPrompt = typeof req.body?.focusPrompt === 'string' ? req.body.focusPrompt.trim() : '';
      const mimeType = req.file.mimetype || 'video/mp4';
      const fileSize = req.file.size;

      let uploadedRemoteFileName: string | null = null;

      try {
        let videoPart: Record<string, unknown>;

        if (fileSize <= 15 * 1024 * 1024) {
          videoPart = {
            inlineData: {
              mimeType,
              data: req.file.buffer.toString('base64'),
            },
          };
        } else {
          const blob = new Blob([new Uint8Array(req.file.buffer)], { type: mimeType });
          const uploaded = await ai.files.upload({
            file: blob,
            config: {
              mimeType,
              displayName: req.file.originalname,
            },
          });

          if (!uploaded.name) {
            throw new Error('Failed to obtain uploaded file handle from Gemini Files API.');
          }
          uploadedRemoteFileName = uploaded.name;

          let activeFile = uploaded;
          const maxWaitMs = 60_000;
          const startWait = Date.now();
          while (activeFile.state === 'PROCESSING') {
            if (Date.now() - startWait > maxWaitMs) {
              throw new Error('Video processing timed out on Gemini Files API. Please try a shorter clip.');
            }
            await new Promise((r) => setTimeout(r, 2000));
            activeFile = await ai.files.get({ name: uploaded.name });
          }

          if (activeFile.state === 'FAILED') {
            throw new Error('Gemini Files API failed to process this video format.');
          }

          videoPart = {
            fileData: {
              fileUri: activeFile.uri,
              mimeType: activeFile.mimeType || mimeType,
            },
          };
        }

        const promptText = [
          'Analyze this short-form video thoroughly frame by frame and listen to its audio track.',
          'Extract accurate timestamps (in MM:SS and numeric seconds), the opening hook, editing/pacing characteristics, verbatim spoken transcript, all visible on-screen text overlays, why the format drives retention/shares, and practical remix ideas.',
          'Ground every observation strictly in what is actually visible and audible in the video.',
          focusPrompt ? `Additional user focus request: ${focusPrompt}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        const response = await callWithRetry(() =>
          ai.models.generateContent({
            model: modelUsed,
            contents: {
              parts: [videoPart, { text: promptText }],
            },
            config: {
              systemInstruction:
                'You are a senior short-form video editor and content analyst. Report only factual observations grounded in the video frames and audio.',
              responseMimeType: 'application/json',
              responseSchema: videoAnalysisSchema,
            },
          })
        );

        const rawJson = (response.text ?? '').trim();
        if (!rawJson) {
          throw new Error('Model returned an empty response for the video analysis.');
        }

        const parsed = JSON.parse(rawJson);

        pruneVideoSessions();
        const sessionId = crypto.randomUUID();
        videoSessionCache.set(sessionId, {
          buffer: req.file.buffer,
          mimeType,
          fileName: req.file.originalname,
          createdAt: Date.now(),
        });

        return res.json({
          id: crypto.randomUUID(),
          sessionId,
          fileName: req.file.originalname,
          fileSizeBytes: fileSize,
          modelUsed,
          analyzedAt: new Date().toISOString(),
          ...parsed,
        });
      } catch (err) {
        const formatted = formatGeminiError(err, modelUsed);
        return res.status(formatted.status).json({
          error: formatted.message,
          code: formatted.code,
          modelUsed,
        });
      } finally {
        if (uploadedRemoteFileName) {
          try {
            await ai.files.delete({ name: uploadedRemoteFileName });
          } catch {
            // Best-effort cleanup
          }
        }
      }
    });
  });

  app.post('/api/analyze-url', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const focusPrompt = typeof req.body?.focusPrompt === 'string' ? req.body.focusPrompt.trim() : '';
    const modelUsed = resolveModel(req.body?.model);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http:// and https:// URLs are supported.' });
      }
    } catch {
      return res.status(400).json({ error: 'Please enter a valid short-video URL.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    const openGraph: {
      requestedUrl: string;
      resolvedUrl: string;
      title?: string;
      description?: string;
      siteName?: string;
      image?: string;
      videoUrl?: string;
      directVideoBlocked: boolean;
    } = {
      requestedUrl: rawUrl,
      resolvedUrl: rawUrl,
      directVideoBlocked: true,
    };

    try {
      const hostname = parsedUrl.hostname.toLowerCase();
      const useCrawlerUa = hostname.includes('facebook.com') || hostname.includes('fb.watch') || hostname.includes('fb.com');
      const pageRes = await fetch(rawUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: useCrawlerUa ? FB_CRAWLER_HEADERS : BROWSER_NAV_HEADERS,
      });
      openGraph.resolvedUrl = pageRes.url || rawUrl;
      const html = await pageRes.text();
      openGraph.title = sanitizeExtractedTitle(extractMetaTag(html, 'og:title') || extractPageTitle(html));
      openGraph.description = decodeHtmlEntities(extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description'));
      openGraph.siteName = decodeHtmlEntities(extractMetaTag(html, 'og:site_name'));
      openGraph.image = decodeHtmlEntities(extractMetaTag(html, 'og:image'));
      openGraph.videoUrl = decodeHtmlEntities(extractMetaTag(html, 'og:video:secure_url') || extractMetaTag(html, 'og:video'));
      if (openGraph.videoUrl) {
        openGraph.directVideoBlocked = false;
      }
    } catch {
      // Public metadata fetch blocked or timed out; continue with Gemini URL Context + Search grounding
    }

    try {
      const ogSummaryLines = [
        `Requested URL: ${rawUrl}`,
        openGraph.resolvedUrl !== rawUrl ? `Resolved URL: ${openGraph.resolvedUrl}` : '',
        openGraph.siteName ? `Platform / Site: ${openGraph.siteName}` : '',
        openGraph.title ? `Page Title: ${openGraph.title}` : '',
        openGraph.description ? `Page Description: ${openGraph.description}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const prompt = [
        `Inspect this short-form video share link and analyze whatever public information, creator details, caption context, or viral short-form patterns are accessible: ${rawUrl}`,
        ogSummaryLines ? `Server-fetched public metadata:\n${ogSummaryLines}` : '',
        focusPrompt ? `User focus: ${focusPrompt}` : '',
        'Provide a concise, honest breakdown organized under:',
        '1. Accessible Link & Context Summary (clearly state if the platform restricts direct video stream access behind a login wall, and never invent unseen video frames)',
        '2. Topic, Creator & Format Signals',
        '3. Recommended Viral Hook & Editing Checklist for this style of short',
        '4. Next Step for Frame-by-Frame Analysis (how uploading the downloaded .mp4 clip unlocks exact timestamps and transcript extraction).',
      ]
        .filter(Boolean)
        .join('\n\n');

      let response;
      try {
        response = await callWithRetry(() =>
          ai.models.generateContent({
            model: modelUsed,
            contents: prompt,
            config: {
              tools: [{ urlContext: {} }, { googleSearch: {} }],
            },
          })
        );
      } catch (toolErr) {
        const errText = extractErrorText(toolErr).toLowerCase();
        if (modelUsed === 'gemini-4-neon' && (errText.includes('free_tier') || errText.includes('limit: 0') || errText.includes('403'))) {
          throw toolErr;
        }
        response = await callWithRetry(() =>
          ai.models.generateContent({
            model: modelUsed,
            contents: prompt,
          })
        );
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingSources: Array<{ title: string; uri: string }> = [];
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }

      return res.json({
        id: crypto.randomUUID(),
        url: rawUrl,
        modelUsed,
        analyzedAt: new Date().toISOString(),
        openGraph,
        reportMarkdown: response.text || 'No public context could be retrieved for this URL.',
        groundingSources,
      });
    } catch (err) {
      const formatted = formatGeminiError(err, modelUsed);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  app.get('/api/proxy-image', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Invalid image URL protocol.' });
      }
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
      ) {
        return res.status(400).json({ error: 'Restricted host.' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid image URL.' });
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: 'Upstream image unavailable.' });
      }
      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return res.status(415).json({ error: 'Upstream resource is not an image.' });
      }
      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength > 5 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image exceeds 5 MB limit.' });
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(Buffer.from(arrayBuf));
    } catch {
      return res.status(502).json({ error: 'Could not fetch upstream image.' });
    }
  });

  const BROWSER_NAV_HEADERS: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  const FB_CRAWLER_HEADERS: Record<string, string> = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  function decodeHtmlEntities(input?: string): string | undefined {
    if (!input) return undefined;
    const decoded = input
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const cp = parseInt(hex, 16);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
      })
      .replace(/&#(\d+);/g, (_, dec) => {
        const cp = parseInt(dec, 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
      })
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#039;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\u00a0/g, ' ')
      .trim();
    return decoded || undefined;
  }

  function sanitizeExtractedTitle(rawTitle?: string): string | undefined {
    const clean = decodeHtmlEntities(rawTitle);
    if (!clean) return undefined;
    const lower = clean.toLowerCase();
    if (
      lower === 'error' ||
      lower === 'facebook' ||
      lower === 'instagram' ||
      lower === 'log in' ||
      lower === 'login' ||
      lower === 'page not found'
    ) {
      return undefined;
    }
    return clean;
  }

  function detectVideoPlatform(hostname: string): 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'web' {
    const h = hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) return 'youtube';
    if (h.includes('instagram.com') || h.includes('instagr.am')) return 'instagram';
    if (h.includes('facebook.com') || h.includes('fb.watch') || h.includes('fb.com')) return 'facebook';
    if (h.includes('tiktok.com')) return 'tiktok';
    return 'web';
  }

  function unescapeEmbeddedUrl(raw: string): string {
    return raw
      .replace(/\\u0025/gi, '%')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .trim();
  }

  function collectVideoCandidatesFromHtml(
    html: string,
    candidates: Array<{ label: string; quality: string; url: string }>
  ) {
    const ogVideoSecure = decodeHtmlEntities(extractMetaTag(html, 'og:video:secure_url'));
    const ogVideo = decodeHtmlEntities(extractMetaTag(html, 'og:video'));
    const twitterStream = decodeHtmlEntities(extractMetaTag(html, 'twitter:player:stream'));
    if (ogVideoSecure) candidates.push({ label: 'HD Stream (OpenGraph)', quality: 'HD', url: ogVideoSecure });
    if (ogVideo && ogVideo !== ogVideoSecure) candidates.push({ label: 'Video Stream (OpenGraph)', quality: 'Standard', url: ogVideo });
    if (twitterStream) candidates.push({ label: 'Player Stream', quality: 'Standard', url: twitterStream });

    const jsonPatterns: Array<{ regex: RegExp; label: string; quality: string }> = [
      { regex: /"hd_src"\s*:\s*"([^"]+)"/g, label: 'Facebook HD MP4', quality: 'HD' },
      { regex: /"browser_native_hd_url"\s*:\s*"([^"]+)"/g, label: 'Facebook HD MP4', quality: 'HD' },
      { regex: /"playable_url_quality_hd"\s*:\s*"([^"]+)"/g, label: 'HD MP4 Stream', quality: 'HD' },
      { regex: /"sd_src"\s*:\s*"([^"]+)"/g, label: 'Facebook SD MP4', quality: 'SD' },
      { regex: /"browser_native_sd_url"\s*:\s*"([^"]+)"/g, label: 'Facebook SD MP4', quality: 'SD' },
      { regex: /"playable_url"\s*:\s*"([^"]+)"/g, label: 'SD MP4 Stream', quality: 'SD' },
      { regex: /"video_url"\s*:\s*"([^"]+)"/g, label: 'Direct MP4 Stream', quality: 'HD' },
      { regex: /"contentUrl"\s*:\s*"(https?:[^"]+\.(?:mp4|webm|mov)[^"]*)"/gi, label: 'Embedded MP4', quality: 'Original' },
      { regex: /<video[^>]+src=["'](https?:[^"']+)["']/gi, label: 'HTML5 Video Element', quality: 'Original' },
      { regex: /<source[^>]+src=["'](https?:[^"']+\.(?:mp4|webm|mov)[^"']*)["']/gi, label: 'HTML5 Video Source', quality: 'Original' },
    ];

    for (const { regex, label, quality } of jsonPatterns) {
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = regex.exec(html)) !== null && count < 3) {
        count++;
        if (match[1]) {
          const clean = unescapeEmbeddedUrl(match[1]);
          if (clean.startsWith('http')) {
            candidates.push({ label, quality, url: clean });
          }
        }
      }
    }
  }

  async function probePlayableVideoUrl(
    candidateUrl: string
  ): Promise<{ ok: boolean; mimeType: string; sizeBytes?: number }> {
    const safe = isSafeExternalUrl(candidateUrl);
    if (!safe) return { ok: false, mimeType: 'video/mp4' };
    try {
      const res = await fetch(safe.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: {
          Range: 'bytes=0-1023',
          'User-Agent': BROWSER_NAV_HEADERS['User-Agent'],
        },
      });
      if (!res.ok) return { ok: false, mimeType: 'video/mp4' };
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let sizeBytes: number | undefined;
      const contentRange = res.headers.get('content-range');
      const totalMatch = contentRange?.match(/\/(\d+)$/);
      if (totalMatch?.[1]) {
        const parsed = Number(totalMatch[1]);
        if (Number.isFinite(parsed) && parsed > 0) sizeBytes = parsed;
      } else {
        const cl = Number(res.headers.get('content-length'));
        if (Number.isFinite(cl) && cl > 1024) sizeBytes = cl;
      }
      if (ct.startsWith('video/') || ct === 'application/octet-stream') {
        return {
          ok: true,
          mimeType: ct.startsWith('video/') ? ct.split(';')[0] : 'video/mp4',
          sizeBytes,
        };
      }
      return { ok: false, mimeType: 'video/mp4' };
    } catch {
      return { ok: false, mimeType: 'video/mp4' };
    }
  }

  app.post('/api/extract-video-link', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const parsedUrl = isSafeExternalUrl(rawUrl);
    if (!parsedUrl) {
      return res.status(400).json({ error: 'Please enter a valid public http:// or https:// video URL.' });
    }

    const platformHint = detectVideoPlatform(parsedUrl.hostname);
    let resolvedUrl = parsedUrl.toString();
    let title: string | undefined;
    let author: string | undefined;
    let description: string | undefined;
    let thumbnailUrl: string | undefined;

    const candidates: Array<{ label: string; quality: string; url: string }> = [];

    // 1. Check if URL itself is a direct video stream
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(parsedUrl.pathname)) {
      const directProbe = await probePlayableVideoUrl(resolvedUrl);
      if (directProbe.ok) {
        return res.json({
          platform: 'direct',
          requestedUrl: rawUrl,
          resolvedUrl,
          title: path.basename(parsedUrl.pathname) || 'Direct Video Clip',
          directDownloadAvailable: true,
          downloadOptions: [
            {
              label: 'Direct Video Stream',
              quality: 'Original',
              url: resolvedUrl,
              mimeType: directProbe.mimeType,
              sizeBytes: directProbe.sizeBytes,
            },
          ],
        });
      }
    }

    // 2. YouTube public oEmbed metadata
    if (platformHint === 'youtube') {
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(resolvedUrl)}&format=json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (oembedRes.ok) {
          const oembed = (await oembedRes.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          title = sanitizeExtractedTitle(oembed.title) || title;
          author = decodeHtmlEntities(oembed.author_name) || author;
          thumbnailUrl = oembed.thumbnail_url || thumbnailUrl;
        }
      } catch {
        // Continue with HTML inspection
      }
    }

    // 3. Facebook canonical link + crawler metadata resolution (prevents HTTP 400 Error on /share/v/...)
    if (platformHint === 'facebook') {
      try {
        const crawlerRes = await fetch(resolvedUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: FB_CRAWLER_HEADERS,
        });
        if (crawlerRes.url) {
          resolvedUrl = crawlerRes.url;
        }
        const crawlerHtml = await crawlerRes.text();
        title = title || sanitizeExtractedTitle(extractPageTitle(crawlerHtml)) || sanitizeExtractedTitle(extractMetaTag(crawlerHtml, 'og:title'));
        description = description || decodeHtmlEntities(extractMetaTag(crawlerHtml, 'og:description') || extractMetaTag(crawlerHtml, 'og:title'));
        thumbnailUrl = thumbnailUrl || decodeHtmlEntities(extractMetaTag(crawlerHtml, 'og:image'));
        collectVideoCandidatesFromHtml(crawlerHtml, candidates);
      } catch {
        // Ignore and continue to browser navigation fetch
      }
    }

    // 4. Fetch HTML with full browser navigation headers (and platform embed endpoints)
    const pagesToInspect: string[] = [resolvedUrl];
    if (platformHint === 'facebook') {
      const canonicalClean = resolvedUrl.split('?')[0];
      pagesToInspect.push(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonicalClean)}`);
    } else if (platformHint === 'instagram') {
      const igMatch = resolvedUrl.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if (igMatch?.[1]) {
        pagesToInspect.push(`https://www.instagram.com/reel/${igMatch[1]}/embed/`);
      }
    }

    for (const targetPage of pagesToInspect) {
      try {
        const pageRes = await fetch(targetPage, {
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: BROWSER_NAV_HEADERS,
        });
        if (!pageRes.ok) continue;

        const ct = (pageRes.headers.get('content-type') || '').toLowerCase();
        if (ct.startsWith('video/')) {
          return res.json({
            platform: 'direct',
            requestedUrl: rawUrl,
            resolvedUrl: pageRes.url || targetPage,
            title: title || 'Direct Video Stream',
            directDownloadAvailable: true,
            downloadOptions: [
              {
                label: 'Direct Video Stream',
                quality: 'Original',
                url: pageRes.url || targetPage,
                mimeType: ct.split(';')[0],
              },
            ],
          });
        }

        const html = await pageRes.text();
        title = title || sanitizeExtractedTitle(extractMetaTag(html, 'og:title')) || sanitizeExtractedTitle(extractPageTitle(html));
        description = description || decodeHtmlEntities(extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description'));
        thumbnailUrl = thumbnailUrl || decodeHtmlEntities(extractMetaTag(html, 'og:image'));
        collectVideoCandidatesFromHtml(html, candidates);
      } catch {
        // Ignore individual page fetch failure
      }
    }

    // 5. Deduplicate and verify candidates actually serve playable video bytes
    const seenUrls = new Set<string>();
    const seenVariantKeys = new Set<string>();
    const verifiedOptions: Array<{ label: string; quality: string; url: string; mimeType: string; sizeBytes?: number }> = [];

    for (const candidate of candidates) {
      if (seenUrls.has(candidate.url)) continue;
      seenUrls.add(candidate.url);
      const probe = await probePlayableVideoUrl(candidate.url);
      if (probe.ok) {
        const variantKey =
          typeof probe.sizeBytes === 'number'
            ? `${candidate.quality}-${probe.sizeBytes}`
            : candidate.url;
        if (seenVariantKeys.has(variantKey)) continue;
        seenVariantKeys.add(variantKey);
        verifiedOptions.push({
          label: candidate.label,
          quality: candidate.quality,
          url: candidate.url,
          mimeType: probe.mimeType,
          sizeBytes: probe.sizeBytes,
        });
      }
      if (verifiedOptions.length >= 4) break;
    }

    let blockedReason: string | undefined;
    if (verifiedOptions.length === 0) {
      if (platformHint === 'youtube') {
        blockedReason =
          'YouTube blocks automated video stream downloads from cloud servers without an authenticated browser session. Public video metadata was retrieved—you can create a Key-Point Short clip from this link below or upload a local MP4 file.';
      } else if (platformHint === 'instagram') {
        blockedReason =
          'Instagram restricts direct Reel MP4 streams behind an authenticated session wall. Upload the saved MP4 clip or generate a Key-Point Short from this URL below.';
      } else if (platformHint === 'facebook') {
        blockedReason =
          'Facebook restricted direct video stream access for this share link (login wall or private reel). You can create a Key-Point Short clip from this link below or upload the downloaded MP4.';
      } else {
        blockedReason =
          'No directly downloadable MP4/WebM stream was exposed in this page. Direct .mp4/.webm CDN links work immediately, or you can create a 9:16 Key-Point clip from this URL.';
      }
    }

    return res.json({
      platform: platformHint,
      requestedUrl: rawUrl,
      resolvedUrl,
      title,
      author,
      description,
      thumbnailUrl,
      directDownloadAvailable: verifiedOptions.length > 0,
      downloadOptions: verifiedOptions,
      blockedReason,
    });
  });

  app.get('/api/proxy-video', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const downloadFlag = req.query.download === '1';
    const analyzeMode = req.query.mode === 'analyze';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : 'shortscope_video.mp4';
    const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'shortscope_video.mp4';

    const parsed = isSafeExternalUrl(rawUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid or restricted video URL.' });
    }

    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': BROWSER_NAV_HEADERS['User-Agent'],
      };
      if (typeof req.headers.range === 'string') {
        upstreamHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: abortController.signal,
        headers: upstreamHeaders,
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ error: 'Upstream video server rejected the video request.' });
      }
      const contentType = (upstream.headers.get('content-type') || 'video/mp4').split(';')[0];
      if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
        return res.status(415).json({ error: 'Upstream URL did not return a video file.' });
      }
      const contentLength = Number(upstream.headers.get('content-length'));
      if (analyzeMode && Number.isFinite(contentLength) && contentLength > 45 * 1024 * 1024) {
        abortController.abort();
        return res.status(413).json({
          error: 'Video exceeds the 45 MB limit for in-browser analysis. Use Download MP4 or Play in Stage instead.',
        });
      }
      if (Number.isFinite(contentLength) && contentLength > 1500 * 1024 * 1024) {
        abortController.abort();
        return res.status(413).json({ error: 'Video exceeds the 1.5 GB streaming download limit.' });
      }

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', contentType.startsWith('video/') ? contentType : 'video/mp4');
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) {
        res.setHeader('Accept-Ranges', acceptRanges);
      } else {
        res.setHeader('Accept-Ranges', 'bytes');
      }
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      if (Number.isFinite(contentLength) && contentLength > 0) {
        res.setHeader('Content-Length', String(contentLength));
      }
      if (downloadFlag) {
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as NodeReadableStream);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        return res.status(502).json({ error: 'Failed to stream video from upstream host.' });
      }
      res.end();
    }
  });

  function formatSecondsTimestamp(totalSec: number): string {
    const safe = Math.max(0, Math.round(totalSec));
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  app.post('/api/probe-video-parts', async (req: Request, res: Response) => {
    const streamUrl = typeof req.body?.streamUrl === 'string' ? req.body.streamUrl.trim() : '';
    const requestedParts = Math.min(10, Math.max(2, Number(req.body?.numParts) || 10));
    const rawMode = req.body?.partMode;
    const partMode: '30s' | '60s' | 'full' =
      rawMode === '60s' ? '60s' : rawMode === 'full' ? 'full' : '30s';

    const parsed = isSafeExternalUrl(streamUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Please provide a valid public video stream URL.' });
    }

    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-show_entries',
          'stream=width,height',
          '-of',
          'json',
          parsed.toString(),
        ],
        { timeout: 20000 }
      );
      const probeJson = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Array<{ width?: number; height?: number }>;
      };
      const totalDurationSec = Number(probeJson.format?.duration);
      if (!Number.isFinite(totalDurationSec) || totalDurationSec <= 1) {
        return res.status(422).json({ error: 'Could not read video duration from stream.' });
      }

      const firstVideoStream = (probeJson.streams || []).find(
        (s) => typeof s.width === 'number' && typeof s.height === 'number'
      );

      const segmentSpan = totalDurationSec / requestedParts;
      const parts = Array.from({ length: requestedParts }, (_, idx) => {
        const startSec = Number((idx * segmentSpan).toFixed(2));
        let durationSec: number;
        if (partMode === 'full') {
          durationSec = Number(Math.max(1, Math.min(segmentSpan, totalDurationSec - startSec)).toFixed(2));
        } else {
          const targetCap = partMode === '60s' ? 60 : 30;
          durationSec = Number(
            Math.max(1, Math.min(targetCap, segmentSpan, totalDurationSec - startSec)).toFixed(2)
          );
        }
        return {
          partNumber: idx + 1,
          label: `Part ${String(idx + 1).padStart(2, '0')}`,
          startSec,
          durationSec,
          startFormatted: formatSecondsTimestamp(startSec),
          endFormatted: formatSecondsTimestamp(startSec + durationSec),
        };
      });

      return res.json({
        streamUrl: parsed.toString(),
        totalDurationSec,
        totalDurationFormatted: formatSecondsTimestamp(totalDurationSec),
        width: firstVideoStream?.width,
        height: firstVideoStream?.height,
        partMode,
        parts,
      });
    } catch {
      return res.status(502).json({ error: 'Could not probe video stream duration with ffprobe.' });
    }
  });

  app.get('/api/clip-part', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const startSec = Math.max(0, Number(req.query.start) || 0);
    const durationSec = Math.min(900, Math.max(1, Number(req.query.duration) || 30));
    const downloadFlag = req.query.download === '1';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : 'short_part.mp4';
    const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'short_part.mp4';

    const parsed = isSafeExternalUrl(rawUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid or restricted video URL.' });
    }

    const tmpOut = path.join(os.tmpdir(), `shortscope_part_${crypto.randomUUID()}.mp4`);
    const cleanupTmp = () => {
      fs.unlink(tmpOut, () => {
        // Best-effort cleanup
      });
    };

    try {
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-ss',
            String(startSec),
            '-i',
            parsed.toString(),
            '-t',
            String(durationSec),
            '-c',
            'copy',
            '-avoid_negative_ts',
            'make_zero',
            '-movflags',
            '+faststart',
            tmpOut,
          ],
          { timeout: 60000 }
        );
      } catch {
        // Fallback to quick re-encode if stream copy fails on non-keyframe/container
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-ss',
            String(startSec),
            '-i',
            parsed.toString(),
            '-t',
            String(durationSec),
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '25',
            '-c:a',
            'aac',
            '-movflags',
            '+faststart',
            tmpOut,
          ],
          { timeout: 90000 }
        );
      }

      const stat = fs.statSync(tmpOut);
      if (stat.size <= 0) {
        cleanupTmp();
        return res.status(502).json({ error: 'Generated video part was empty.' });
      }
      if (stat.size > 250 * 1024 * 1024) {
        cleanupTmp();
        return res.status(413).json({ error: 'Sliced video part exceeds the 250 MB limit.' });
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(stat.size));
      if (downloadFlag) {
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      }

      const fileStream = fs.createReadStream(tmpOut);
      fileStream.on('close', cleanupTmp);
      fileStream.on('error', () => {
        cleanupTmp();
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      res.on('close', () => {
        fileStream.destroy();
        cleanupTmp();
      });
      fileStream.pipe(res);
    } catch {
      cleanupTmp();
      if (!res.headersSent) {
        return res.status(502).json({ error: 'Could not slice video segment from stream.' });
      }
      res.end();
    }
  });

  async function fetchOpenGraphBasic(targetUrl: string): Promise<{
    title?: string;
    desc?: string;
    image?: string;
    site?: string;
  }> {
    try {
      const parsed = new URL(targetUrl);
      const useCrawlerUa =
        parsed.hostname.includes('facebook.com') ||
        parsed.hostname.includes('fb.watch') ||
        parsed.hostname.includes('fb.com');
      const pageRes = await fetch(targetUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: useCrawlerUa ? FB_CRAWLER_HEADERS : BROWSER_NAV_HEADERS,
      });
      const html = await pageRes.text();
      return {
        title: sanitizeExtractedTitle(extractMetaTag(html, 'og:title') || extractPageTitle(html)),
        desc: decodeHtmlEntities(extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description')),
        image: decodeHtmlEntities(extractMetaTag(html, 'og:image')),
        site: decodeHtmlEntities(extractMetaTag(html, 'og:site_name')),
      };
    } catch {
      return {};
    }
  }

  app.post('/api/url-to-clip-plan', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const rawSecondaryUrl = typeof req.body?.secondaryUrl === 'string' ? req.body.secondaryUrl.trim() : '';
    const clipFormat =
      req.body?.clipFormat === 'two_url_mashup'
        ? 'two_url_mashup'
        : req.body?.clipFormat === 'ten_parts'
          ? 'ten_parts'
          : 'key_points';
    const customAngle = typeof req.body?.customAngle === 'string' ? req.body.customAngle.trim() : '';
    const requestedDuration = Number(req.body?.durationSec);
    const totalDurationSec = [6, 9, 12].includes(requestedDuration) ? requestedDuration : 9;
    const requestedStyle = typeof req.body?.style === 'string' ? req.body.style : 'editorial_dark';
    const style = ['editorial_dark', 'cobalt_studio', 'street_warm'].includes(requestedStyle)
      ? requestedStyle
      : 'editorial_dark';
    const modelUsed = resolveModel(req.body?.model);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only http:// and https:// URLs are supported.' });
      }
    } catch {
      return res.status(400).json({ error: 'Please enter a valid primary URL to convert into a short clip.' });
    }

    let parsedSecondaryUrl: URL | null = null;
    if (clipFormat === 'two_url_mashup') {
      if (!rawSecondaryUrl) {
        return res.status(400).json({ error: 'Please enter a second URL for Two-URL Mashup mode.' });
      }
      try {
        parsedSecondaryUrl = new URL(rawSecondaryUrl);
        if (parsedSecondaryUrl.protocol !== 'http:' && parsedSecondaryUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'Second URL must start with http:// or https://.' });
        }
      } catch {
        return res.status(400).json({ error: 'Please enter a valid second URL.' });
      }
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    const [og1, og2] = await Promise.all([
      fetchOpenGraphBasic(rawUrl),
      parsedSecondaryUrl
        ? fetchOpenGraphBasic(rawSecondaryUrl)
        : Promise.resolve<{ title?: string; desc?: string; image?: string; site?: string }>({}),
    ]);

    try {
      const beatCount =
        clipFormat === 'ten_parts'
          ? 10
          : clipFormat === 'two_url_mashup'
            ? 4
            : totalDurationSec === 6
              ? 3
              : 4;
      const effectiveTotalDuration = clipFormat === 'ten_parts' ? 20 : totalDurationSec;
      const perBeatSec = Number((effectiveTotalDuration / beatCount).toFixed(1));
      const ogContext1 = [
        `URL 1: ${rawUrl}`,
        og1.site ? `URL 1 Platform / Site: ${og1.site}` : '',
        og1.title ? `URL 1 Title: ${og1.title}` : '',
        og1.desc ? `URL 1 Description: ${og1.desc}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const ogContext2 = parsedSecondaryUrl
        ? [
            `URL 2: ${rawSecondaryUrl}`,
            og2.site ? `URL 2 Platform / Site: ${og2.site}` : '',
            og2.title ? `URL 2 Title: ${og2.title}` : '',
            og2.desc ? `URL 2 Description: ${og2.desc}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      const modeInstruction =
        clipFormat === 'two_url_mashup' && parsedSecondaryUrl
          ? `Build a ${effectiveTotalDuration}-second 9:16 Two-URL Point Short combining URL 1 and URL 2 across ${beatCount} tight scenes: Scene 1 hook introducing both links ("sourceSlot": 1), Scene 2 key point from URL 1 ("sourceSlot": 1), Scene 3 key point from URL 2 ("sourceSlot": 2), Scene 4 combined takeaway/verdict ("sourceSlot": 2).`
          : clipFormat === 'ten_parts'
            ? `Break down this URL into a 10-part short-form series (10 beats numbered PART 01 through PART 10, ${perBeatSec}s each). Each beat should work as a distinct chapter or standalone short takeaway ("kicker": "PART 01" .. "PART 10"). Set "sourceSlot": 1 on each beat.`
            : `Turn this URL into a ${effectiveTotalDuration}-second 9:16 Key Points Short with ${beatCount} numbered highlight shots (Hook + most important key points + Payoff). Set "sourceSlot": 1 on each beat.`;

      const prompt = [
        modeInstruction,
        ogContext1,
        ogContext2,
        customAngle ? `Creative angle requested by user: ${customAngle}` : '',
        'Use only real information retrieved from the URLs or search context (if a link is behind a social login wall like a private Facebook share link, frame the key points honestly around the accessible link format without inventing fake facts).',
        `Return ONLY a valid JSON object (wrapped in \`\`\`json ... \`\`\`) with this exact shape:`,
        `{`,
        `  "title": "Short video title (max 8 words)",`,
        `  "category": "Content category (e.g. Key Points Short, Two-URL Short, 10-Part Series)",`,
        `  "beats": [`,
        `    {`,
        `      "index": 1,`,
        `      "kicker": "${clipFormat === 'ten_parts' ? 'PART 01' : 'KEY POINT 01'}",`,
        `      "headline": "PUNCHY 3 TO 6 WORD POINT",`,
        `      "caption": "Concise 8 to 14 word takeaway subtitle for viewers.",`,
        `      "durationSec": ${perBeatSec},`,
        `      "sourceSlot": 1`,
        `    }`,
        `  ]`,
        `}`,
        `Make sure "beats" has exactly ${beatCount} items summing to approximately ${effectiveTotalDuration} seconds.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      let response;
      try {
        response = await callWithRetry(() =>
          ai.models.generateContent({
            model: modelUsed,
            contents: prompt,
            config: {
              tools: [{ urlContext: {} }, { googleSearch: {} }],
            },
          })
        );
      } catch (toolErr) {
        const errText = extractErrorText(toolErr).toLowerCase();
        if (modelUsed === 'gemini-4-neon' && (errText.includes('free_tier') || errText.includes('limit: 0') || errText.includes('403'))) {
          throw toolErr;
        }
        response = await callWithRetry(() =>
          ai.models.generateContent({
            model: modelUsed,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          })
        );
      }

      const rawText = (response.text ?? '').trim();
      const jsonMatch =
        rawText.match(/```json\s*([\s\S]*?)\s*```/i) ||
        rawText.match(/(\{[\s\S]*\})/);

      if (!jsonMatch?.[1]) {
        throw new Error('Could not parse storyboard scenes from Gemini response.');
      }

      const parsed = JSON.parse(jsonMatch[1]) as {
        title?: string;
        category?: string;
        beats?: Array<{
          index?: number;
          kicker?: string;
          headline?: string;
          caption?: string;
          durationSec?: number;
          sourceSlot?: number;
        }>;
      };

      const rawBeats = Array.isArray(parsed.beats) ? parsed.beats : [];
      if (rawBeats.length === 0) {
        throw new Error('Storyboard returned no video scenes.');
      }

      const maxBeats = clipFormat === 'ten_parts' ? 10 : 5;
      const beats = rawBeats.slice(0, maxBeats).map((b, idx) => ({
        index: idx + 1,
        kicker: (
          b.kicker ||
          (clipFormat === 'ten_parts'
            ? `PART ${String(idx + 1).padStart(2, '0')}`
            : `KEY POINT 0${idx + 1}`)
        ).slice(0, 28),
        headline: (b.headline || og1.title || 'Key Short Highlight').slice(0, 64),
        caption: (b.caption || og1.desc || `Point ${idx + 1} from ${parsedUrl.hostname}`).slice(0, 120),
        durationSec: typeof b.durationSec === 'number' && b.durationSec >= 1.2 ? b.durationSec : perBeatSec,
        sourceSlot: (b.sourceSlot === 2 && parsedSecondaryUrl ? 2 : 1) as 1 | 2,
      }));

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingSources: Array<{ title: string; uri: string }> = [];
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }

      return res.json({
        id: crypto.randomUUID(),
        sourceUrl: rawUrl,
        secondaryUrl: parsedSecondaryUrl ? rawSecondaryUrl : undefined,
        clipFormat,
        domain: parsedUrl.hostname.replace(/^www\./, ''),
        secondaryDomain: parsedSecondaryUrl ? parsedSecondaryUrl.hostname.replace(/^www\./, '') : undefined,
        title: parsed.title || og1.title || `${parsedUrl.hostname} Key Points Short`,
        category: parsed.category || (clipFormat === 'two_url_mashup' ? 'Two-URL Short' : 'Key Points Short'),
        style,
        totalDurationSec,
        backdropImageUrl: og1.image,
        secondaryBackdropUrl: og2.image,
        fallbackImagePath: '/src/assets/images/short_creator_studio_1795427706081.jpg',
        beats,
        modelUsed,
        groundingSources,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const formatted = formatGeminiError(err, modelUsed);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  app.post('/api/video-chat', async (req: Request, res: Response) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const contextSummary = typeof req.body?.contextSummary === 'string' ? req.body.contextSummary : '';
    const modelUsed = resolveModel(req.body?.model);

    if (!question) {
      return res.status(400).json({ error: 'Please enter a question about the video.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    const cached = sessionId ? videoSessionCache.get(sessionId) : undefined;

    try {
      const parts: Array<Record<string, unknown>> = [];

      if (cached && cached.buffer.byteLength <= 15 * 1024 * 1024) {
        parts.push({
          inlineData: {
            mimeType: cached.mimeType,
            data: cached.buffer.toString('base64'),
          },
        });
      }

      const instructionContext = contextSummary
        ? `Previous structured analysis summary:\n${contextSummary}\n\n`
        : '';

      parts.push({
        text: `${instructionContext}Answer the user's follow-up question accurately and concisely based on the video content:\n\n${question}`,
      });

      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: modelUsed,
          contents: { parts },
        })
      );

      return res.json({
        answer: response.text || 'No response generated.',
        modelUsed,
      });
    } catch (err) {
      const formatted = formatGeminiError(err, modelUsed);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  app.get('/api/providers-status', (_req: Request, res: Response) => {
    return res.json({
      geminiConfigured: Boolean(getAiClient()),
      nvidiaConfigured: Boolean(getNvidiaApiKey()),
    });
  });

  app.post('/api/ai-generate-image', async (req: Request, res: Response) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const aspectRatioRaw = typeof req.body?.aspectRatio === 'string' ? req.body.aspectRatio : '9:16';
    const aspectRatio = ['9:16', '1:1', '16:9', '3:4'].includes(aspectRatioRaw)
      ? (aspectRatioRaw as '9:16' | '1:1' | '16:9' | '3:4')
      : '9:16';
    const rawQuality = typeof req.body?.qualityMode === 'string' ? req.body.qualityMode : 'fast';

    if (!prompt) {
      return res.status(400).json({ error: 'Please enter a prompt to create an AI image.' });
    }

    if (rawQuality === 'nvidia_flux' || rawQuality === 'nvidia_sd3') {
      const nvidiaKey = getNvidiaApiKey();
      const nvidiaModel =
        rawQuality === 'nvidia_sd3'
          ? 'stabilityai/stable-diffusion-3-medium'
          : 'black-forest-labs/flux.1-dev';
      if (!nvidiaKey) {
        return res.status(503).json({
          error:
            'NVIDIA_API_KEY is not configured yet. Add your nvapi-... key in Settings > Secrets to use NVIDIA NIM.',
          code: 'NVIDIA_KEY_MISSING',
        });
      }
      try {
        const result = await generateNvidiaImage(prompt, aspectRatio, nvidiaModel);
        return res.json({
          id: crypto.randomUUID(),
          prompt,
          aspectRatio,
          modelUsed: `nvidia:${nvidiaModel}`,
          dataUrl: result.dataUrl,
          mimeType: result.mimeType,
        });
      } catch (err) {
        return res.status(502).json({
          error: err instanceof Error ? err.message : 'NVIDIA NIM image generation failed.',
          modelUsed: `nvidia:${nvidiaModel}`,
        });
      }
    }

    const qualityMode = rawQuality === 'hq' ? 'hq' : 'fast';
    const modelUsed =
      qualityMode === 'hq' ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    try {
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: modelUsed,
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: {
              aspectRatio,
              ...(modelUsed === 'gemini-nano-banana-2.1' ? { imageSize: '1K' } : {}),
            },
          },
        })
      );

      let dataUrl: string | undefined;
      let mimeType = 'image/png';
      let caption: string | undefined;

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data && !dataUrl) {
          mimeType = part.inlineData.mimeType || 'image/png';
          dataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption = (caption ? `${caption} ` : '') + part.text.trim();
        }
      }

      if (!dataUrl) {
        return res.status(502).json({
          error: 'No image data was returned by the model. Try adjusting the prompt.',
        });
      }

      return res.json({
        id: crypto.randomUUID(),
        prompt,
        aspectRatio,
        modelUsed,
        dataUrl,
        mimeType,
        caption,
      });
    } catch (err) {
      const formatted = formatGeminiError(err, modelUsed);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  app.post('/api/ai-generate-video', async (req: Request, res: Response) => {
    const provider = req.body?.provider === 'nvidia' ? 'nvidia' : 'gemini';
    const mode = req.body?.mode === 'url' ? 'url' : 'prompt';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';
    const aspectRatio = req.body?.aspectRatio === '16:9' ? '16:9' : '9:16';
    const duration = req.body?.duration === '5s' ? '5s' : '10s';
    const referenceImageBase64 =
      typeof req.body?.referenceImageBase64 === 'string' ? req.body.referenceImageBase64 : '';
    const referenceImageMimeType =
      typeof req.body?.referenceImageMimeType === 'string' ? req.body.referenceImageMimeType : 'image/png';
    const modelUsed = provider === 'nvidia' ? 'nvidia:wan-ai/wan2.2' : 'gemini-omni-1.2-flash';

    if (mode === 'prompt' && !prompt && !referenceImageBase64) {
      return res.status(400).json({ error: 'Please enter a video prompt or attach a reference image.' });
    }
    if (mode === 'url' && !isSafeExternalUrl(sourceUrl)) {
      return res.status(400).json({ error: 'Please provide a valid public http(s) URL for Option 2.' });
    }

    if (provider === 'nvidia') {
      const nvidiaKey = getNvidiaApiKey();
      if (!nvidiaKey) {
        return res.status(503).json({
          error:
            'NVIDIA_API_KEY is not configured yet. Add your nvapi-... key in Settings > Secrets to use NVIDIA NIM Video.',
          code: 'NVIDIA_KEY_MISSING',
        });
      }

      try {
        let nvidiaPrompt = prompt;
        if (mode === 'url' && sourceUrl) {
          const og = await fetchOpenGraphBasic(sourceUrl);
          nvidiaPrompt = [
            `Cinematic ${aspectRatio} short video inspired by ${sourceUrl}`,
            og.title ? `Title: ${og.title}` : '',
            og.desc ? `Summary: ${og.desc}` : '',
            prompt ? `Direction: ${prompt}` : '',
          ]
            .filter(Boolean)
            .join('. ');
        }

        const nvRes = await fetch('https://integrate.api.nvidia.com/v1/videos/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${nvidiaKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'wan-ai/wan2.2',
            prompt: nvidiaPrompt || 'Cinematic camera motion',
            seconds: duration === '10s' ? 6 : 4,
            resolution: '720p',
          }),
          signal: AbortSignal.timeout(180000),
        });

        const nvData = (await nvRes.json().catch(() => ({}))) as {
          data?: Array<{ b64_json?: string; url?: string }>;
          video?: string;
          error?: string | { message?: string };
          detail?: string;
        };

        if (!nvRes.ok) {
          const msg =
            (typeof nvData.error === 'string' ? nvData.error : nvData.error?.message) ||
            nvData.detail ||
            `NVIDIA NIM video generation failed (HTTP ${nvRes.status}).`;
          return res.status(nvRes.status >= 400 && nvRes.status < 600 ? nvRes.status : 502).json({
            error: msg,
            modelUsed,
          });
        }

        const b64 = nvData.data?.[0]?.b64_json || nvData.video;
        if (b64) {
          return res.json({
            videoDataUrl: `data:video/mp4;base64,${b64}`,
            mimeType: 'video/mp4',
            modelUsed,
            aspectRatio,
            duration,
          });
        }
        const vidUrl = nvData.data?.[0]?.url;
        if (vidUrl && isSafeExternalUrl(vidUrl)) {
          return res.json({
            videoUri: vidUrl,
            mimeType: 'video/mp4',
            modelUsed,
            aspectRatio,
            duration,
          });
        }

        return res.status(502).json({ error: 'NVIDIA NIM returned no video data.', modelUsed });
      } catch (err) {
        return res.status(502).json({
          error: err instanceof Error ? err.message : 'NVIDIA NIM video generation failed.',
          modelUsed,
        });
      }
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    try {
      const inputItems: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; mime_type: string; data: string }
      > = [];

      if (referenceImageBase64) {
        inputItems.push({
          type: 'image',
          mime_type: referenceImageMimeType,
          data: referenceImageBase64,
        });
      }

      let combinedPrompt = prompt;
      if (mode === 'url' && sourceUrl) {
        const og = await fetchOpenGraphBasic(sourceUrl);
        if (og.image && !referenceImageBase64 && isSafeExternalUrl(og.image)) {
          try {
            const imgRes = await fetch(og.image, { signal: AbortSignal.timeout(5000) });
            const ct = imgRes.headers.get('content-type') || '';
            if (imgRes.ok && ct.startsWith('image/')) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              if (buf.byteLength <= 4 * 1024 * 1024) {
                inputItems.push({
                  type: 'image',
                  mime_type: ct.split(';')[0],
                  data: buf.toString('base64'),
                });
              }
            }
          } catch {
            // Continue with text context only
          }
        }
        combinedPrompt = [
          `Create a dynamic ${aspectRatio} short video inspired by this source link: ${sourceUrl}`,
          og.title ? `Source Title: ${og.title}` : '',
          og.desc ? `Source Summary: ${og.desc}` : '',
          prompt ? `Visual Direction: ${prompt}` : 'Use cinematic pacing and crisp lighting.',
        ]
          .filter(Boolean)
          .join('\n');
      }

      inputItems.push({
        type: 'text',
        text: combinedPrompt || 'Animate this reference scene with smooth cinematic camera motion.',
      });

      const interaction = await ai.interactions.create(
        {
          model: modelUsed,
          input:
            inputItems.length === 1 && inputItems[0].type === 'text'
              ? inputItems[0].text
              : inputItems,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        return res.json({
          videoDataUrl: `data:${mime};base64,${videoPart.data}`,
          mimeType: mime,
          modelUsed,
          aspectRatio,
          duration,
        });
      }
      if (videoPart?.uri) {
        return res.json({
          videoUri: videoPart.uri,
          mimeType: videoPart.mime_type || 'video/mp4',
          modelUsed,
          aspectRatio,
          duration,
        });
      }

      return res.status(502).json({
        error: 'Gemini Omni returned no video output for this prompt.',
      });
    } catch (err) {
      const formatted = formatGeminiError(err, modelUsed);
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  app.post('/api/ai-remix-video', (req: Request, res: Response) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Video upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Please select a local video file for Option 3.' });
      }

      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const aspectRatio = req.body?.aspectRatio === '16:9' ? '16:9' : '9:16';
      const modelUsed = 'gemini-omni-1.2-flash';

      if (!prompt) {
        return res.status(400).json({ error: 'Please describe how to transform the local video.' });
      }

      const ai = getAiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
        });
      }

      const tmpIn = path.join(os.tmpdir(), `shortscope_omni_in_${crypto.randomUUID()}.mp4`);
      let uploadedName: string | undefined;

      try {
        fs.writeFileSync(tmpIn, req.file.buffer);
        let videoFile = await ai.files.upload({
          file: tmpIn,
          config: { mimeType: req.file.mimetype || 'video/mp4' },
        });
        uploadedName = videoFile.name;

        let pollAttempts = 0;
        while (videoFile.state === 'PROCESSING' && pollAttempts < 24) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          videoFile = await ai.files.get({ name: videoFile.name || '' });
          pollAttempts++;
        }
        if (videoFile.state !== 'ACTIVE' || !videoFile.uri) {
          throw new Error('Uploaded video did not finish processing for AI remix.');
        }

        const interaction = await ai.interactions.create(
          {
            model: modelUsed,
            input: [
              { type: 'video', uri: videoFile.uri },
              { type: 'text', text: prompt },
            ],
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: 'video',
              aspect_ratio: aspectRatio,
            },
          },
          { timeout: 300000 }
        );

        const videoPart = interaction.output_video;
        if (videoPart?.data) {
          const mime = videoPart.mime_type || 'video/mp4';
          return res.json({
            videoDataUrl: `data:${mime};base64,${videoPart.data}`,
            mimeType: mime,
            modelUsed,
          });
        }
        if (videoPart?.uri) {
          return res.json({
            videoUri: videoPart.uri,
            mimeType: videoPart.mime_type || 'video/mp4',
            modelUsed,
          });
        }

        return res.status(502).json({ error: 'Gemini Omni returned no remixed video output.' });
      } catch (err) {
        const formatted = formatGeminiError(err, modelUsed);
        return res.status(formatted.status).json({
          error: formatted.message,
          code: formatted.code,
          modelUsed,
        });
      } finally {
        fs.unlink(tmpIn, () => {});
        if (uploadedName) {
          ai.files.delete({ name: uploadedName }).catch(() => {});
        }
      }
    });
  });

  app.post('/api/smart-remix-local-video', (req: Request, res: Response) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Video upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Please choose a local video file first.' });
      }

      const instruction =
        typeof req.body?.prompt === 'string' && req.body.prompt.trim()
          ? req.body.prompt.trim()
          : 'Create a high-energy viral short cut with punchy framing and contrast';
      const targetAspect =
        req.body?.aspectRatio === '16:9'
          ? '16:9'
          : req.body?.aspectRatio === 'original'
            ? 'original'
            : '9:16';

      const id = crypto.randomUUID();
      const ext = req.file.mimetype.includes('webm') ? '.webm' : '.mp4';
      const tmpIn = path.join(os.tmpdir(), `shortscope_remix_in_${id}${ext}`);
      const tmpOut = path.join(os.tmpdir(), `shortscope_remix_out_${id}.mp4`);
      const cleanup = () => {
        fs.unlink(tmpIn, () => {});
        fs.unlink(tmpOut, () => {});
      };

      try {
        fs.writeFileSync(tmpIn, req.file.buffer);

        const { stdout: probeOut } = await execFileAsync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-show_entries',
            'stream=codec_type',
            '-of',
            'json',
            tmpIn,
          ],
          { timeout: 10000 }
        );
        const probeData = JSON.parse(probeOut) as {
          format?: { duration?: string };
          streams?: Array<{ codec_type?: string }>;
        };
        const totalDuration = Math.max(2, Number(probeData.format?.duration) || 10);
        const hasAudio = (probeData.streams || []).some((s) => s.codec_type === 'audio');

        let startSec = 0;
        let clipDuration = Math.min(12, totalDuration);
        let speed = 1.08;
        let contrast = 1.08;
        let saturation = 1.15;

        const ai = getAiClient();
        if (ai) {
          try {
            const planRes = await callWithRetry(() =>
              ai.models.generateContent({
                model: 'gemini-4-hydrogen',
                contents: `Given a ${totalDuration.toFixed(1)}s video and user remix goal: "${instruction}", pick optimal FFmpeg edit settings as JSON.`,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      startSec: { type: Type.NUMBER },
                      clipDuration: { type: Type.NUMBER },
                      speed: { type: Type.NUMBER },
                      contrast: { type: Type.NUMBER },
                      saturation: { type: Type.NUMBER },
                    },
                    required: ['startSec', 'clipDuration', 'speed', 'contrast', 'saturation'],
                  },
                },
              })
            );
            const cfg = JSON.parse((planRes.text ?? '{}').trim()) as {
              startSec?: number;
              clipDuration?: number;
              speed?: number;
              contrast?: number;
              saturation?: number;
            };
            if (typeof cfg.startSec === 'number' && Number.isFinite(cfg.startSec)) {
              startSec = Math.max(0, Math.min(Math.max(0, totalDuration - 3), cfg.startSec));
            }
            if (typeof cfg.clipDuration === 'number' && Number.isFinite(cfg.clipDuration)) {
              clipDuration = Math.max(3, Math.min(15, Math.min(totalDuration - startSec, cfg.clipDuration)));
            }
            if (typeof cfg.speed === 'number' && Number.isFinite(cfg.speed)) {
              speed = Math.max(0.85, Math.min(1.4, cfg.speed));
            }
            if (typeof cfg.contrast === 'number' && Number.isFinite(cfg.contrast)) {
              contrast = Math.max(0.95, Math.min(1.25, cfg.contrast));
            }
            if (typeof cfg.saturation === 'number' && Number.isFinite(cfg.saturation)) {
              saturation = Math.max(0.8, Math.min(1.45, cfg.saturation));
            }
          } catch {
            // Fall back to safe deterministic edit parameters
          }
        }

        const vfParts: string[] = [];
        if (targetAspect === '9:16') {
          vfParts.push('scale=540:960:force_original_aspect_ratio=increase,crop=540:960');
        } else if (targetAspect === '16:9') {
          vfParts.push('scale=960:540:force_original_aspect_ratio=increase,crop=960:540');
        }
        vfParts.push(`setpts=${(1 / speed).toFixed(3)}*PTS`);
        vfParts.push(`eq=contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`);

        const args = [
          '-y',
          '-ss',
          String(startSec.toFixed(2)),
          '-i',
          tmpIn,
          '-t',
          String(clipDuration.toFixed(2)),
          '-vf',
          vfParts.join(','),
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '24',
        ];
        if (hasAudio) {
          args.push('-af', `atempo=${speed.toFixed(2)}`, '-c:a', 'aac');
        } else {
          args.push('-an');
        }
        args.push('-movflags', '+faststart', tmpOut);

        await execFileAsync('ffmpeg', args, { timeout: 90000 });
        const outBuf = fs.readFileSync(tmpOut);
        cleanup();
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(outBuf.byteLength));
        return res.send(outBuf);
      } catch (err) {
        cleanup();
        return res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to process local video remix with FFmpeg.',
        });
      }
    });
  });

  app.post('/api/ai-movie-plan', async (req: Request, res: Response) => {
    const provider = req.body?.provider === 'nvidia' ? 'nvidia' : 'gemini';
    const conceptPrompt = typeof req.body?.conceptPrompt === 'string' ? req.body.conceptPrompt.trim() : '';
    const genre = typeof req.body?.genre === 'string' && req.body.genre.trim() ? req.body.genre.trim() : 'Cinematic Short';
    const aspectRatio = req.body?.aspectRatio === '16:9' ? '16:9' : '9:16';
    const rawCount = Number(req.body?.sceneCount);
    const sceneCount = [4, 6, 8].includes(rawCount) ? rawCount : 6;
    const includeAiKeyframes = req.body?.includeAiKeyframes === true;

    if (!conceptPrompt) {
      return res.status(400).json({ error: 'Please describe your movie idea or storyline prompt.' });
    }

    if (provider === 'nvidia' && !getNvidiaApiKey()) {
      return res.status(503).json({
        error:
          'NVIDIA_API_KEY is not configured yet. Add your nvapi-... key in Settings > Secrets, or switch back to Gemini 4 Hydrogen.',
        code: 'NVIDIA_KEY_MISSING',
      });
    }

    const ai = getAiClient();
    if (provider === 'gemini' && !ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Add a valid key in the Settings > Secrets panel.',
      });
    }

    const modelUsed = provider === 'nvidia' ? 'nvidia:meta/llama-3.3-70b-instruct' : 'gemini-4-hydrogen';

    try {
      let jsonText = '{}';
      const promptBlock = [
        `Write a ${sceneCount}-scene short film storyboard for this movie concept:`,
        `Concept: ${conceptPrompt}`,
        `Genre: ${genre}`,
        `Aspect Ratio: ${aspectRatio}`,
        `Generate a tight, dramatic multi-act arc across exactly ${sceneCount} scenes (Opening Hook -> Rising Action -> Climax -> Resolution).`,
        `Return JSON with keys: movieTitle, genre, logline, scenes (array of ${sceneCount} items with sceneNumber, actLabel, headline, narrationSubtitle, visualPrompt, cameraMotion ["zoom_in"|"pan_left"|"pan_right"|"dramatic_hold"], visualMood ["noir"|"neon"|"warm_gold"|"crimson"], durationSec [2.5 to 3.5]).`,
      ].join('\n');

      if (provider === 'nvidia') {
        jsonText = await generateNvidiaChatJson(
          'You are a cinematic short film screenwriter. Output strictly valid JSON matching the requested schema.',
          promptBlock
        );
      } else {
        const response = await callWithRetry(() =>
          ai!.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: promptBlock,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  movieTitle: { type: Type.STRING },
                  genre: { type: Type.STRING },
                  logline: { type: Type.STRING },
                  scenes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sceneNumber: { type: Type.INTEGER },
                        actLabel: { type: Type.STRING },
                        headline: { type: Type.STRING },
                        narrationSubtitle: { type: Type.STRING },
                        visualPrompt: { type: Type.STRING },
                        cameraMotion: { type: Type.STRING },
                        visualMood: { type: Type.STRING },
                        durationSec: { type: Type.NUMBER },
                      },
                      required: [
                        'sceneNumber',
                        'actLabel',
                        'headline',
                        'narrationSubtitle',
                        'visualPrompt',
                        'cameraMotion',
                        'visualMood',
                        'durationSec',
                      ],
                    },
                  },
                },
                required: ['movieTitle', 'genre', 'logline', 'scenes'],
              },
            },
          })
        );
        jsonText = (response.text ?? '{}').trim();
      }

      const parsed = JSON.parse(jsonText) as {
        movieTitle?: string;
        genre?: string;
        logline?: string;
        scenes?: Array<{
          sceneNumber?: number;
          actLabel?: string;
          headline?: string;
          narrationSubtitle?: string;
          visualPrompt?: string;
          cameraMotion?: string;
          visualMood?: string;
          durationSec?: number;
        }>;
      };

      const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, sceneCount) : [];
      if (rawScenes.length === 0) {
        throw new Error('Could not generate scenes for this movie concept.');
      }

      let keyframeWarning: string | undefined;
      const hasNvidiaKey = Boolean(getNvidiaApiKey());
      const scenes = await Promise.all(
        rawScenes.map(async (s, idx) => {
          const validMotions = ['zoom_in', 'pan_left', 'pan_right', 'dramatic_hold'] as const;
          const validMoods = ['noir', 'neon', 'warm_gold', 'crimson'] as const;
          const motion = validMotions.includes(s.cameraMotion as (typeof validMotions)[number])
            ? (s.cameraMotion as (typeof validMotions)[number])
            : validMotions[idx % validMotions.length];
          const mood = validMoods.includes(s.visualMood as (typeof validMoods)[number])
            ? (s.visualMood as (typeof validMoods)[number])
            : validMoods[idx % validMoods.length];

          let imageDataUrl: string | undefined;
          if (includeAiKeyframes && idx < 4) {
            const framePrompt = `${s.visualPrompt || s.headline}, cinematic film still, ${genre}`;
            if (hasNvidiaKey && (provider === 'nvidia' || !ai)) {
              try {
                const nvFrame = await generateNvidiaImage(
                  framePrompt,
                  aspectRatio,
                  'black-forest-labs/flux.1-dev'
                );
                imageDataUrl = nvFrame.dataUrl;
              } catch (nvErr) {
                keyframeWarning =
                  nvErr instanceof Error ? nvErr.message : 'NVIDIA keyframe generation failed.';
              }
            } else if (ai) {
              try {
                const imgRes = await ai.models.generateContent({
                  model: 'gemini-3.1-flash-lite-image',
                  contents: { parts: [{ text: framePrompt }] },
                  config: { imageConfig: { aspectRatio } },
                });
                for (const part of imgRes.candidates?.[0]?.content?.parts ?? []) {
                  if (part.inlineData?.data) {
                    imageDataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    break;
                  }
                }
              } catch (imgErr) {
                if (hasNvidiaKey) {
                  try {
                    const nvFrame = await generateNvidiaImage(
                      framePrompt,
                      aspectRatio,
                      'black-forest-labs/flux.1-dev'
                    );
                    imageDataUrl = nvFrame.dataUrl;
                  } catch (nvErr) {
                    keyframeWarning =
                      nvErr instanceof Error ? nvErr.message : formatGeminiError(imgErr, 'gemini-3.1-flash-lite-image').message;
                  }
                } else {
                  keyframeWarning = formatGeminiError(imgErr, 'gemini-3.1-flash-lite-image').message;
                }
              }
            }
          }

          return {
            sceneNumber: idx + 1,
            actLabel: (s.actLabel || `SCENE 0${idx + 1}`).slice(0, 28),
            headline: (s.headline || conceptPrompt).slice(0, 60),
            narrationSubtitle: (s.narrationSubtitle || s.visualPrompt || conceptPrompt).slice(0, 120),
            visualPrompt: (s.visualPrompt || conceptPrompt).slice(0, 180),
            cameraMotion: motion,
            visualMood: mood,
            durationSec: typeof s.durationSec === 'number' && s.durationSec >= 1.8 && s.durationSec <= 5 ? s.durationSec : 2.8,
            imageDataUrl,
          };
        })
      );

      const totalDurationSec = Number(
        scenes.reduce((acc, sc) => acc + sc.durationSec, 0).toFixed(1)
      );

      return res.json({
        plan: {
          id: crypto.randomUUID(),
          conceptPrompt,
          movieTitle: parsed.movieTitle || 'Untitled AI Short Film',
          genre: parsed.genre || genre,
          logline: parsed.logline || conceptPrompt,
          aspectRatio,
          totalDurationSec,
          scenes,
          modelUsed,
        },
        keyframeWarning,
      });
    } catch (err) {
      if (provider === 'nvidia') {
        return res.status(502).json({
          error: err instanceof Error ? err.message : 'NVIDIA NIM movie plan generation failed.',
          modelUsed,
        });
      }
      const formatted = formatGeminiError(err, 'gemini-4-hydrogen');
      return res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        modelUsed,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShortScope server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
