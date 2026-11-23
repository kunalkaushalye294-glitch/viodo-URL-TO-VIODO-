export type GeminiModelId = 'gemini-4-neon' | 'gemini-4-hydrogen';

export interface TimelineMoment {
  timestamp: string;
  seconds: number;
  visualAction: string;
  audioOrTextCue: string;
  importance: 'hook' | 'peak' | 'payoff' | 'transition';
}

export interface ViralDriver {
  driver: string;
  explanation: string;
}

export interface VideoAnalysisResult {
  id: string;
  sessionId?: string;
  fileName: string;
  fileSizeBytes: number;
  durationLabel?: string;
  modelUsed: GeminiModelId;
  analyzedAt: string;
  title: string;
  category: string;
  summary: string;
  hookAnalysis: {
    timestamp: string;
    visualHook: string;
    audioHook: string;
    retentionMechanism: string;
  };
  pacingAndEditing: {
    estimatedCutCount: number;
    averageShotLength: string;
    visualStyle: string;
    audioLayering: string;
  };
  timelineMoments: TimelineMoment[];
  transcriptAndOnScreenText: {
    spokenTranscript: string;
    onScreenOverlays: string[];
  };
  viralDrivers: ViralDriver[];
  remixIdeas: {
    suggestedTitles: string[];
    captionTemplates: string[];
    hashtags: string[];
  };
}

export interface UrlOpenGraphMeta {
  requestedUrl: string;
  resolvedUrl: string;
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  videoUrl?: string;
  directVideoBlocked: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface UrlAnalysisResult {
  id: string;
  url: string;
  modelUsed: GeminiModelId;
  analyzedAt: string;
  openGraph: UrlOpenGraphMeta;
  reportMarkdown: string;
  groundingSources: GroundingSource[];
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  modelUsed?: GeminiModelId;
  createdAt: string;
}

export interface PopularShortFormat {
  id: string;
  title: string;
  category: string;
  durationRange: string;
  hookPattern: string;
  imagePath: string;
  summary: string;
  shotBlueprint: string[];
  sampleTemplateId: 'street_food_countdown' | 'creator_desk_hook' | 'urban_sprint_cut' | 'pottery_process_loop';
}

export type UrlClipStyle = 'editorial_dark' | 'cobalt_studio' | 'street_warm';

export type UrlClipFormatMode = 'key_points' | 'two_url_mashup' | 'ten_parts';

export interface UrlClipBeat {
  index: number;
  kicker: string;
  headline: string;
  caption: string;
  durationSec: number;
  sourceSlot?: 1 | 2;
}

export interface UrlClipPlan {
  id: string;
  sourceUrl: string;
  secondaryUrl?: string;
  clipFormat?: UrlClipFormatMode;
  domain: string;
  secondaryDomain?: string;
  title: string;
  category: string;
  style: UrlClipStyle;
  totalDurationSec: number;
  backdropImageUrl?: string;
  secondaryBackdropUrl?: string;
  fallbackImagePath: string;
  beats: UrlClipBeat[];
  modelUsed: GeminiModelId;
  groundingSources: GroundingSource[];
  createdAt: string;
}

export interface ExtractedDownloadOption {
  label: string;
  quality: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface VideoLinkExtractResult {
  platform: 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'direct' | 'web';
  requestedUrl: string;
  resolvedUrl: string;
  title?: string;
  author?: string;
  description?: string;
  thumbnailUrl?: string;
  directDownloadAvailable: boolean;
  downloadOptions: ExtractedDownloadOption[];
  blockedReason?: string;
}

export interface VideoPartSegment {
  partNumber: number;
  label: string;
  startSec: number;
  durationSec: number;
  startFormatted: string;
  endFormatted: string;
}

export interface VideoPartsPlan {
  streamUrl: string;
  totalDurationSec: number;
  totalDurationFormatted: string;
  width?: number;
  height?: number;
  partMode: '30s' | '60s' | 'full';
  parts: VideoPartSegment[];
}

export type AiGeneratorSubMode = 'image' | 'video' | 'movie';

export type AiVideoInputOption = 'prompt' | 'url' | 'local';

export type AiImageQualityMode = 'fast' | 'hq' | 'nvidia_flux' | 'nvidia_sd3';

export type AiEngineProvider = 'gemini' | 'nvidia';

export interface AiProvidersStatus {
  geminiConfigured: boolean;
  nvidiaConfigured: boolean;
}

export interface AiGeneratedImageResult {
  id: string;
  prompt: string;
  aspectRatio: '9:16' | '1:1' | '16:9' | '3:4';
  modelUsed: string;
  dataUrl: string;
  mimeType: string;
  caption?: string;
}

export interface AiMovieScene {
  sceneNumber: number;
  actLabel: string;
  headline: string;
  narrationSubtitle: string;
  visualPrompt: string;
  cameraMotion: 'zoom_in' | 'pan_left' | 'pan_right' | 'dramatic_hold';
  visualMood: 'noir' | 'neon' | 'warm_gold' | 'crimson';
  durationSec: number;
  imageDataUrl?: string;
}

export interface AiMoviePlan {
  id: string;
  conceptPrompt: string;
  movieTitle: string;
  genre: string;
  logline: string;
  aspectRatio: '9:16' | '16:9';
  totalDurationSec: number;
  scenes: AiMovieScene[];
  modelUsed: string;
}
