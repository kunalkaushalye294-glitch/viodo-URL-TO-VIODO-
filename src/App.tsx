import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Link2,
  Play,
  Scissors,
  Sparkles,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import { TopBar } from './components/TopBar';
import { AnalysisBreakdown } from './components/AnalysisBreakdown';
import { PopularFormatsSection } from './components/PopularFormatsSection';
import { SavedLibrarySection } from './components/SavedLibrarySection';
import { FEATURED_FACEBOOK_SHARE_URL, POPULAR_SHORT_FORMATS } from './data/popularFormats';
import { generateSampleShortVideo } from './utils/sampleClipGenerator';
import { renderVideoClipFromPlan } from './utils/urlClipCreator';
import { renderMovieFromPlan } from './utils/aiMovieRenderer';
import {
  AiEngineProvider,
  AiGeneratedImageResult,
  AiGeneratorSubMode,
  AiImageQualityMode,
  AiMoviePlan,
  AiProvidersStatus,
  AiVideoInputOption,
  ChatTurn,
  ExtractedDownloadOption,
  GeminiModelId,
  PopularShortFormat,
  UrlAnalysisResult,
  UrlClipFormatMode,
  UrlClipPlan,
  UrlClipStyle,
  VideoAnalysisResult,
  VideoLinkExtractResult,
  VideoPartSegment,
  VideoPartsPlan,
} from './types/video';

const STORAGE_KEY = 'shortscope_saved_analyses_v1';

type InputMode = 'upload' | 'ai-studio' | 'downloader' | 'url' | 'create-clip';

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [stageAspectRatio, setStageAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [shareUrl, setShareUrl] = useState<string>(FEATURED_FACEBOOK_SHARE_URL);
  const [focusPrompt, setFocusPrompt] = useState<string>('');
  const [clipUrl, setClipUrl] = useState<string>(FEATURED_FACEBOOK_SHARE_URL);
  const [secondaryClipUrl, setSecondaryClipUrl] = useState<string>('');
  const [clipFormat, setClipFormat] = useState<UrlClipFormatMode>('key_points');
  const [clipDurationSec, setClipDurationSec] = useState<6 | 9 | 12>(9);
  const [clipStyle, setClipStyle] = useState<UrlClipStyle>('editorial_dark');
  const [clipAngle, setClipAngle] = useState<string>('');
  const [downloadUrlInput, setDownloadUrlInput] = useState<string>(FEATURED_FACEBOOK_SHARE_URL);
  const [isExtractingLink, setIsExtractingLink] = useState(false);
  const [extractedLinkResult, setExtractedLinkResult] = useState<VideoLinkExtractResult | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [isLoadingRemoteVideo, setIsLoadingRemoteVideo] = useState(false);
  const [downloadingOptionUrl, setDownloadingOptionUrl] = useState<string | null>(null);
  const [downloadProgressLabel, setDownloadProgressLabel] = useState<string>('');
  const [activeRemoteStream, setActiveRemoteStream] = useState<{
    option: ExtractedDownloadOption;
    title: string;
    usingProxyFallback: boolean;
  } | null>(null);
  const [partMode, setPartMode] = useState<'30s' | '60s' | 'full'>('30s');
  const [isProbingParts, setIsProbingParts] = useState(false);
  const [videoPartsPlan, setVideoPartsPlan] = useState<VideoPartsPlan | null>(null);
  const [busyPartNumber, setBusyPartNumber] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // AI Generator Studio State
  const [providersStatus, setProvidersStatus] = useState<AiProvidersStatus>({
    geminiConfigured: true,
    nvidiaConfigured: false,
  });
  const [aiSubMode, setAiSubMode] = useState<AiGeneratorSubMode>('image');
  const [aiImagePrompt, setAiImagePrompt] = useState<string>('');
  const [aiImageAspect, setAiImageAspect] = useState<'9:16' | '1:1' | '16:9' | '3:4'>('9:16');
  const [aiImageQuality, setAiImageQuality] = useState<AiImageQualityMode>('fast');
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [generatedAiImage, setGeneratedAiImage] = useState<AiGeneratedImageResult | null>(null);

  const [aiVideoOption, setAiVideoOption] = useState<AiVideoInputOption>('prompt');
  const [aiVideoPrompt, setAiVideoPrompt] = useState<string>('');
  const [aiVideoSourceUrl, setAiVideoSourceUrl] = useState<string>(FEATURED_FACEBOOK_SHARE_URL);
  const [aiVideoAspect, setAiVideoAspect] = useState<'9:16' | '16:9'>('9:16');
  const [aiVideoDuration, setAiVideoDuration] = useState<'5s' | '10s'>('5s');
  const [aiReferenceImage, setAiReferenceImage] = useState<{
    base64: string;
    mimeType: string;
    dataUrl: string;
    label: string;
  } | null>(null);
  const [aiLocalVideoFile, setAiLocalVideoFile] = useState<File | null>(null);
  const [aiLocalTargetAspect, setAiLocalTargetAspect] = useState<'9:16' | '16:9' | 'original'>('9:16');
  const [isGeneratingAiVideo, setIsGeneratingAiVideo] = useState(false);
  const [aiVideoPhaseLabel, setAiVideoPhaseLabel] = useState<string>('');

  const [movieConcept, setMovieConcept] = useState<string>('');
  const [movieGenre, setMovieGenre] = useState<string>('Action Thriller');
  const [movieSceneCount, setMovieSceneCount] = useState<4 | 6 | 8>(6);
  const [movieAspect, setMovieAspect] = useState<'9:16' | '16:9'>('9:16');
  const [movieEngine, setMovieEngine] = useState<AiEngineProvider>('gemini');
  const [movieIncludeKeyframes, setMovieIncludeKeyframes] = useState(false);
  const [generatedMoviePlan, setGeneratedMoviePlan] = useState<AiMoviePlan | null>(null);
  const [movieWarning, setMovieWarning] = useState<string | null>(null);
  const [isCreatingMovie, setIsCreatingMovie] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [clipCreationPhase, setClipCreationPhase] = useState<'idle' | 'planning' | 'rendering'>('idle');
  const [createdClipPlan, setCreatedClipPlan] = useState<UrlClipPlan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [urlAnalysis, setUrlAnalysis] = useState<UrlAnalysisResult | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<VideoAnalysisResult[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as VideoAnalysisResult[]) : [];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const aiLocalInputRef = useRef<HTMLInputElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAnalyses.slice(0, 12)));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedAnalyses]);

  useEffect(() => {
    fetch('/api/providers-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AiProvidersStatus | null) => {
        if (data && typeof data.nvidiaConfigured === 'boolean') {
          setProvidersStatus(data);
        }
      })
      .catch(() => {
        // Keep default status on transient network failure
      });
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  const attachVideoFile = (
    file: File,
    keepCurrentMode = false,
    aspectOverride: '9:16' | '16:9' = '9:16'
  ) => {
    if (!file.type.startsWith('video/')) {
      setErrorMessage('Please choose an MP4, WebM, or MOV video file.');
      setErrorCode('INVALID_FILE');
      return;
    }
    if (file.size > 45 * 1024 * 1024) {
      setErrorMessage('Video clip exceeds the 45 MB upload limit. Please trim the short clip and retry.');
      setErrorCode('FILE_TOO_LARGE');
      return;
    }
    setErrorMessage(null);
    setErrorCode(null);
    setActiveRemoteStream(null);
    setStageAspectRatio(aspectOverride);
    setSelectedFile(file);
    if (!keepCurrentMode) {
      setInputMode('upload');
    }
    setVideoPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const runVideoAnalysis = async (fileToAnalyze: File, modelOverride?: GeminiModelId) => {
    const activeModel = modelOverride || selectedModel;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setErrorCode(null);
    setUrlAnalysis(null);
    setChatTurns([]);

    try {
      const formData = new FormData();
      formData.append('video', fileToAnalyze);
      formData.append('model', activeModel);
      if (focusPrompt.trim()) {
        formData.append('focusPrompt', focusPrompt.trim());
      }

      const res = await fetch('/api/analyze-video', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'Video analysis request failed.');
      }

      const result = data as VideoAnalysisResult;
      setVideoAnalysis(result);
      setSavedAnalyses((prev) => [result, ...prev.filter((item) => item.id !== result.id)].slice(0, 12));

      requestAnimationFrame(() => {
        document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to analyze video.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runUrlAnalysis = async (targetUrl?: string, modelOverride?: GeminiModelId) => {
    const activeModel = modelOverride || selectedModel;
    const urlToCheck = (targetUrl ?? shareUrl).trim();
    if (!urlToCheck) {
      setErrorMessage('Please paste a short-form video share link first.');
      setErrorCode('EMPTY_URL');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    setErrorCode(null);
    setVideoAnalysis(null);
    setChatTurns([]);

    try {
      const res = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToCheck,
          model: activeModel,
          focusPrompt: focusPrompt.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'URL inspection failed.');
      }

      setUrlAnalysis(data as UrlAnalysisResult);
      requestAnimationFrame(() => {
        document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to inspect share URL.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runUrlToClip = async (targetUrl?: string, modelOverride?: GeminiModelId) => {
    const activeModel = modelOverride || selectedModel;
    const urlToConvert = (targetUrl ?? clipUrl).trim();
    if (!urlToConvert) {
      setErrorMessage('Please paste a URL to generate a video clip.');
      setErrorCode('EMPTY_URL');
      return;
    }

    setErrorMessage(null);
    setErrorCode(null);
    setClipCreationPhase('planning');

    try {
      const res = await fetch('/api/url-to-clip-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToConvert,
          secondaryUrl: clipFormat === 'two_url_mashup' ? secondaryClipUrl.trim() : undefined,
          clipFormat,
          durationSec: clipDurationSec,
          style: clipStyle,
          customAngle: clipAngle.trim() || undefined,
          model: activeModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'Could not plan video scenes from URL.');
      }

      const plan = data as UrlClipPlan;
      setCreatedClipPlan(plan);
      setClipCreationPhase('rendering');

      const renderedFile = await renderVideoClipFromPlan(plan);
      setStageAspectRatio('9:16');
      setSelectedFile(renderedFile);
      setVideoPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(renderedFile);
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create video clip from URL.');
    } finally {
      setClipCreationPhase('idle');
    }
  };

  const runAiGenerateImage = async () => {
    const prompt = aiImagePrompt.trim();
    if (!prompt) {
      setErrorMessage('Please enter a visual prompt to create an AI image.');
      setErrorCode('EMPTY_PROMPT');
      return;
    }
    setErrorMessage(null);
    setErrorCode(null);
    setIsGeneratingAiImage(true);

    try {
      const res = await fetch('/api/ai-generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio: aiImageAspect,
          qualityMode: aiImageQuality,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'AI image generation failed.');
      }
      setGeneratedAiImage(data as AiGeneratedImageResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate AI image.');
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const handleDownloadGeneratedAiImage = async () => {
    if (!generatedAiImage) return;
    try {
      const res = await fetch(generatedAiImage.dataUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const ext = generatedAiImage.mimeType.includes('jpeg') ? 'jpg' : 'png';
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `shortscope_ai_image_${generatedAiImage.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setErrorMessage('Could not download generated image.');
    }
  };

  const handleAnimateGeneratedImage = () => {
    if (!generatedAiImage) return;
    const base64 = generatedAiImage.dataUrl.includes(',')
      ? generatedAiImage.dataUrl.split(',')[1]
      : '';
    if (base64) {
      setAiReferenceImage({
        base64,
        mimeType: generatedAiImage.mimeType || 'image/png',
        dataUrl: generatedAiImage.dataUrl,
        label: generatedAiImage.prompt.slice(0, 40),
      });
    }
    setAiSubMode('video');
    setAiVideoOption('prompt');
    setAiVideoPrompt(`Cinematic camera push and realistic lighting motion: ${generatedAiImage.prompt}`);
    if (generatedAiImage.aspectRatio === '16:9' || generatedAiImage.aspectRatio === '9:16') {
      setAiVideoAspect(generatedAiImage.aspectRatio);
    }
    clearError();
  };

  const attachAiVideoPayloadToStage = async (
    payload: { videoDataUrl?: string; videoUri?: string; mimeType?: string },
    filename: string,
    aspect: '9:16' | '16:9'
  ) => {
    if (payload.videoDataUrl) {
      const blobRes = await fetch(payload.videoDataUrl);
      const blob = await blobRes.blob();
      const file = new File([blob], filename, { type: payload.mimeType || 'video/mp4' });
      attachVideoFile(file, true, aspect);
      requestAnimationFrame(() => {
        videoElementRef.current?.play().catch(() => {});
      });
      return;
    }
    if (payload.videoUri) {
      const proxyRes = await fetch(
        `/api/proxy-video?url=${encodeURIComponent(payload.videoUri)}&filename=${encodeURIComponent(filename)}`,
        { credentials: 'include' }
      );
      if (!proxyRes.ok) {
        throw new Error('Generated video stream could not be loaded.');
      }
      const blob = await proxyRes.blob();
      const file = new File([blob], filename, { type: payload.mimeType || 'video/mp4' });
      attachVideoFile(file, true, aspect);
      requestAnimationFrame(() => {
        videoElementRef.current?.play().catch(() => {});
      });
    }
  };

  const runAiGenerateVideo = async (engine: 'omni' | 'nvidia' | 'free_motion' | 'free_ffmpeg') => {
    setErrorMessage(null);
    setErrorCode(null);

    if (aiVideoOption === 'prompt') {
      const prompt = aiVideoPrompt.trim();
      if (!prompt && !aiReferenceImage) {
        setErrorMessage('Please enter a video prompt for Option 1.');
        setErrorCode('EMPTY_PROMPT');
        return;
      }

      setIsGeneratingAiVideo(true);
      try {
        if (engine === 'omni' || engine === 'nvidia') {
          setAiVideoPhaseLabel(
            engine === 'nvidia' ? 'Rendering with NVIDIA NIM...' : 'Rendering with Gemini Omni...'
          );
          const res = await fetch('/api/ai-generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: engine === 'nvidia' ? 'nvidia' : 'gemini',
              mode: 'prompt',
              prompt,
              aspectRatio: aiVideoAspect,
              duration: aiVideoDuration,
              referenceImageBase64: aiReferenceImage?.base64,
              referenceImageMimeType: aiReferenceImage?.mimeType,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setErrorCode(data.code || null);
            throw new Error(
              data.error ||
                (engine === 'nvidia'
                  ? 'NVIDIA NIM video generation failed.'
                  : 'Gemini Omni video generation failed.')
            );
          }
          await attachAiVideoPayloadToStage(
            data,
            engine === 'nvidia' ? 'shortscope_nvidia_video.mp4' : 'shortscope_omni_video.mp4',
            aiVideoAspect
          );
        } else {
          setAiVideoPhaseLabel('Planning 4-Scene Motion Short...');
          const res = await fetch('/api/ai-movie-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conceptPrompt: prompt || 'Visual storytelling motion short',
              genre: 'Motion Short',
              aspectRatio: aiVideoAspect,
              sceneCount: 4,
              includeAiKeyframes: false,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setErrorCode(data.code || null);
            throw new Error(data.error || 'Motion short planning failed.');
          }
          setAiVideoPhaseLabel('Rendering Video Track...');
          const renderedFile = await renderMovieFromPlan(data.plan as AiMoviePlan);
          attachVideoFile(renderedFile, true, aiVideoAspect);
          requestAnimationFrame(() => {
            videoElementRef.current?.play().catch(() => {});
          });
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to generate AI video.');
      } finally {
        setIsGeneratingAiVideo(false);
        setAiVideoPhaseLabel('');
      }
      return;
    }

    if (aiVideoOption === 'url') {
      const urlVal = aiVideoSourceUrl.trim();
      if (!urlVal) {
        setErrorMessage('Please paste a URL for Option 2.');
        setErrorCode('EMPTY_URL');
        return;
      }

      setIsGeneratingAiVideo(true);
      try {
        if (engine === 'omni' || engine === 'nvidia') {
          setAiVideoPhaseLabel(
            engine === 'nvidia'
              ? 'Generating URL Video via NVIDIA NIM...'
              : 'Generating URL Video via Gemini Omni...'
          );
          const res = await fetch('/api/ai-generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: engine === 'nvidia' ? 'nvidia' : 'gemini',
              mode: 'url',
              sourceUrl: urlVal,
              prompt: aiVideoPrompt.trim(),
              aspectRatio: aiVideoAspect,
              duration: aiVideoDuration,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setErrorCode(data.code || null);
            throw new Error(
              data.error ||
                (engine === 'nvidia'
                  ? 'NVIDIA NIM URL video generation failed.'
                  : 'Gemini Omni URL video generation failed.')
            );
          }
          await attachAiVideoPayloadToStage(
            data,
            engine === 'nvidia' ? 'shortscope_url_nvidia_video.mp4' : 'shortscope_url_ai_video.mp4',
            aiVideoAspect
          );
        } else {
          setAiVideoPhaseLabel('Planning URL Storyboard...');
          const res = await fetch('/api/url-to-clip-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: urlVal,
              clipFormat: 'key_points',
              durationSec: aiVideoDuration === '10s' ? 12 : 6,
              style: 'cobalt_studio',
              customAngle: aiVideoPrompt.trim() || undefined,
              model: 'gemini-4-hydrogen',
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setErrorCode(data.code || null);
            throw new Error(data.error || 'Could not generate URL motion clip.');
          }
          setAiVideoPhaseLabel('Rendering 9:16 Video...');
          const renderedFile = await renderVideoClipFromPlan(data as UrlClipPlan);
          attachVideoFile(renderedFile, true, '9:16');
          requestAnimationFrame(() => {
            videoElementRef.current?.play().catch(() => {});
          });
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to create URL video.');
      } finally {
        setIsGeneratingAiVideo(false);
        setAiVideoPhaseLabel('');
      }
      return;
    }

    // Option 3: Local Video -> AI Video Remix
    const sourceFile = aiLocalVideoFile || selectedFile;
    if (!sourceFile) {
      setErrorMessage('Please choose a local video file for Option 3.');
      setErrorCode('NO_FILE');
      return;
    }
    const remixPrompt =
      aiVideoPrompt.trim() || 'High-energy viral short cut with punchy pacing and contrast';

    setIsGeneratingAiVideo(true);
    try {
      const formData = new FormData();
      formData.append('video', sourceFile);
      formData.append('prompt', remixPrompt);

      if (engine === 'omni') {
        setAiVideoPhaseLabel('Uploading & Remixing in Gemini Omni...');
        formData.append(
          'aspectRatio',
          aiLocalTargetAspect === 'original' ? '9:16' : aiLocalTargetAspect
        );
        const res = await fetch('/api/ai-remix-video', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorCode(data.code || null);
          throw new Error(data.error || 'Gemini Omni video remix failed.');
        }
        await attachAiVideoPayloadToStage(
          data,
          'shortscope_omni_remix.mp4',
          aiLocalTargetAspect === '16:9' ? '16:9' : '9:16'
        );
      } else {
        setAiVideoPhaseLabel('Smart Remixing Local Video (FFmpeg + Gemini)...');
        formData.append('aspectRatio', aiLocalTargetAspect);
        const res = await fetch('/api/smart-remix-local-video', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const errPayload = await res.json().catch(() => ({}));
          throw new Error(errPayload.error || 'Smart local video remix failed.');
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          throw new Error('Unexpected HTML response returned from remix endpoint.');
        }
        const blob = await res.blob();
        const baseName = sourceFile.name.replace(/\.[^.]+$/, '') || 'local_clip';
        const remixedFile = new File([blob], `${baseName}_smart_remix.mp4`, { type: 'video/mp4' });
        attachVideoFile(
          remixedFile,
          true,
          aiLocalTargetAspect === '16:9' ? '16:9' : '9:16'
        );
        requestAnimationFrame(() => {
          videoElementRef.current?.play().catch(() => {});
        });
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to remix local video.');
    } finally {
      setIsGeneratingAiVideo(false);
      setAiVideoPhaseLabel('');
    }
  };

  const runCreateAiMovie = async () => {
    const concept = movieConcept.trim();
    if (!concept) {
      setErrorMessage('Please describe your movie storyline or prompt.');
      setErrorCode('EMPTY_PROMPT');
      return;
    }

    setErrorMessage(null);
    setErrorCode(null);
    setMovieWarning(null);
    setIsCreatingMovie(true);

    try {
      const res = await fetch('/api/ai-movie-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: movieEngine,
          conceptPrompt: concept,
          genre: movieGenre,
          aspectRatio: movieAspect,
          sceneCount: movieSceneCount,
          includeAiKeyframes: movieIncludeKeyframes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'Failed to generate AI movie script.');
      }

      const plan = data.plan as AiMoviePlan;
      setGeneratedMoviePlan(plan);
      if (data.keyframeWarning) {
        setMovieWarning(data.keyframeWarning);
      }

      const movieFile = await renderMovieFromPlan(plan);
      attachVideoFile(movieFile, true, plan.aspectRatio);
      requestAnimationFrame(() => {
        videoElementRef.current?.play().catch(() => {});
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create AI movie.');
    } finally {
      setIsCreatingMovie(false);
    }
  };

  const runExtractVideoLink = async (targetUrl?: string) => {
    const urlToExtract = (targetUrl ?? downloadUrlInput).trim();
    if (!urlToExtract) {
      setErrorMessage('Please paste a YouTube, Instagram, Facebook, or direct video link.');
      setErrorCode('EMPTY_URL');
      return;
    }

    setErrorMessage(null);
    setErrorCode(null);
    setIsExtractingLink(true);
    setThumbFailed(false);
    setVideoPartsPlan(null);

    try {
      const res = await fetch('/api/extract-video-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToExtract }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not inspect this video link.');
      }
      setExtractedLinkResult(data as VideoLinkExtractResult);
    } catch (err) {
      setExtractedLinkResult(null);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to extract video stream from URL.');
    } finally {
      setIsExtractingLink(false);
    }
  };

  const runProbeVideoParts = async (
    streamUrl: string,
    modeOverride?: '30s' | '60s' | 'full'
  ) => {
    const activeMode = modeOverride ?? partMode;
    setErrorMessage(null);
    setErrorCode(null);
    setIsProbingParts(true);

    try {
      const res = await fetch('/api/probe-video-parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl,
          numParts: 10,
          partMode: activeMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not calculate 10 short parts for this video.');
      }
      setVideoPartsPlan(data as VideoPartsPlan);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not split video into 10 parts.');
    } finally {
      setIsProbingParts(false);
    }
  };

  const handleVideoPartAction = async (
    part: VideoPartSegment,
    action: 'play' | 'download',
    title?: string
  ) => {
    if (!videoPartsPlan) return;
    setErrorMessage(null);
    setErrorCode(null);
    setBusyPartNumber(part.partNumber);

    const safeBase =
      (title || 'shortscope_clip')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32) || 'shortscope_clip';
    const filename = `${safeBase}_part_${String(part.partNumber).padStart(2, '0')}.mp4`;

    try {
      const res = await fetch(
        `/api/clip-part?url=${encodeURIComponent(videoPartsPlan.streamUrl)}&start=${part.startSec}&duration=${part.durationSec}&filename=${encodeURIComponent(filename)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `Could not slice ${part.label}.`);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error('Slice endpoint returned HTML instead of MP4 bytes.');
      }
      const blob = await res.blob();

      if (action === 'download') {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else if (blob.size <= 45 * 1024 * 1024) {
        const file = new File([blob], filename, { type: 'video/mp4' });
        attachVideoFile(file, true);
        requestAnimationFrame(() => {
          videoElementRef.current?.play().catch(() => {});
        });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        setSelectedFile(null);
        setActiveRemoteStream({
          option: {
            label: part.label,
            quality: `${part.startFormatted}-${part.endFormatted}`,
            url: videoPartsPlan.streamUrl,
            mimeType: 'video/mp4',
            sizeBytes: blob.size,
          },
          title: `${title || 'Video'} · ${part.label}`,
          usingProxyFallback: false,
        });
        setVideoPreviewUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return blobUrl;
        });
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : `Failed to process ${part.label}.`);
    } finally {
      setBusyPartNumber(null);
    }
  };

  const buildSafeVideoFilename = (option: ExtractedDownloadOption, title?: string) => {
    const ext = option.mimeType.includes('webm') ? 'webm' : 'mp4';
    const safeBase =
      (title || 'shortscope_video')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'shortscope_video';
    return `${safeBase}.${ext}`;
  };

  const handlePlayOptionInStage = (option: ExtractedDownloadOption, title?: string) => {
    setErrorMessage(null);
    setErrorCode(null);
    setSelectedFile(null);
    setStageAspectRatio('9:16');
    setActiveRemoteStream({
      option,
      title: title || option.label || 'Remote Video Stream',
      usingProxyFallback: false,
    });
    setVideoPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return option.url;
    });
    requestAnimationFrame(() => {
      const el = videoElementRef.current;
      if (el) {
        el.play().catch(() => {
          // User can click play manually
        });
      }
    });
  };

  const handleDownloadStreamOption = async (option: ExtractedDownloadOption, title?: string) => {
    if (downloadingOptionUrl) {
      downloadAbortRef.current?.abort();
    }
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setErrorMessage(null);
    setErrorCode(null);
    setDownloadingOptionUrl(option.url);
    setDownloadProgressLabel('Starting...');

    const filename = buildSafeVideoFilename(option, title);

    try {
      let response: globalThis.Response | null = null;
      try {
        const directRes = await fetch(option.url, { signal: controller.signal });
        const directCt = (directRes.headers.get('content-type') || '').toLowerCase();
        if (directRes.ok && (directCt.startsWith('video/') || directCt === 'application/octet-stream')) {
          response = directRes;
        }
      } catch {
        // CORS blocked direct fetch or aborted; fall through to authenticated proxy fetch
      }

      if (!response && !controller.signal.aborted) {
        const proxyRes = await fetch(
          `/api/proxy-video?url=${encodeURIComponent(option.url)}&filename=${encodeURIComponent(filename)}`,
          { credentials: 'include', signal: controller.signal }
        );
        const proxyCt = (proxyRes.headers.get('content-type') || '').toLowerCase();
        if (!proxyRes.ok) {
          const errPayload = await proxyRes.json().catch(() => ({}));
          throw new Error(errPayload.error || 'Could not download video stream.');
        }
        if (proxyCt.includes('text/html')) {
          throw new Error('Download was blocked by an upstream HTML security gate instead of returning video bytes.');
        }
        response = proxyRes;
      }

      if (!response || !response.body) {
        throw new Error('Unable to read video stream from host.');
      }

      const totalBytes = Number(response.headers.get('content-length')) || option.sizeBytes || 0;
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.byteLength;
          const recvMb = (receivedBytes / (1024 * 1024)).toFixed(1);
          if (totalBytes > 0) {
            const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
            const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
            setDownloadProgressLabel(`${recvMb} / ${totalMb} MB (${pct}%)`);
          } else {
            setDownloadProgressLabel(`${recvMb} MB`);
          }
        }
      }

      const blob = new Blob(chunks, {
        type: option.mimeType.startsWith('video/') ? option.mimeType : 'video/mp4',
      });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to download video file.');
      }
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
      }
      setDownloadingOptionUrl(null);
      setDownloadProgressLabel('');
    }
  };

  const handleLoadDownloadedOptionToPreview = async (
    option: ExtractedDownloadOption,
    title?: string
  ) => {
    setErrorMessage(null);
    setErrorCode(null);
    setIsLoadingRemoteVideo(true);

    try {
      const filename = buildSafeVideoFilename(option, title);

      const res = await fetch(
        `/api/proxy-video?url=${encodeURIComponent(option.url)}&mode=analyze&filename=${encodeURIComponent(filename)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || 'Failed to load video stream into analyzer.');
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error('Upstream returned HTML instead of a video stream.');
      }
      const blob = await res.blob();
      const file = new File([blob], filename, {
        type: option.mimeType.startsWith('video/') ? option.mimeType : 'video/mp4',
      });
      attachVideoFile(file);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load remote video.');
    } finally {
      setIsLoadingRemoteVideo(false);
    }
  };

  const clearError = () => {
    setErrorMessage(null);
    setErrorCode(null);
  };

  const handlePrimaryAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'upload') {
      if (!selectedFile) {
        const maybeUrl = focusPrompt.trim();
        if (/^https?:\/\//i.test(maybeUrl)) {
          clearError();
          setClipUrl(maybeUrl);
          setShareUrl(maybeUrl);
          setDownloadUrlInput(maybeUrl);
          setFocusPrompt('');
          setInputMode('create-clip');
          await runUrlToClip(maybeUrl);
          return;
        }
        setErrorMessage('Select a video file, generate a sample clip, or switch to Link Downloader / URL to Clip.');
        setErrorCode('NO_FILE');
        return;
      }
      await runVideoAnalysis(selectedFile);
    } else if (inputMode === 'downloader') {
      await runExtractVideoLink();
    } else if (inputMode === 'url') {
      await runUrlAnalysis();
    } else {
      await runUrlToClip();
    }
  };

  const handleGenerateAndAnalyzeFormat = async (format: PopularShortFormat) => {
    try {
      setErrorMessage(null);
      setErrorCode(null);
      setIsGeneratingSample(true);
      const generatedFile = await generateSampleShortVideo(format);
      attachVideoFile(generatedFile);
      setIsGeneratingSample(false);
      await runVideoAnalysis(generatedFile);
    } catch (err) {
      setIsGeneratingSample(false);
      setErrorMessage(err instanceof Error ? err.message : 'Could not synthesize sample clip.');
    }
  };

  const handleAskFollowUp = async (question: string) => {
    if (!videoAnalysis) return;
    const userTurn: ChatTurn = {
      id: `${Date.now()}-u`,
      role: 'user',
      text: question,
      createdAt: new Date().toISOString(),
    };
    setChatTurns((prev) => [...prev, userTurn]);
    setIsChatLoading(true);

    try {
      const contextSummary = JSON.stringify({
        title: videoAnalysis.title,
        summary: videoAnalysis.summary,
        hookAnalysis: videoAnalysis.hookAnalysis,
        timelineMoments: videoAnalysis.timelineMoments,
        spokenTranscript: videoAnalysis.transcriptAndOnScreenText.spokenTranscript,
      });

      const res = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: videoAnalysis.sessionId,
          question,
          contextSummary,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not get an answer for that question.');
      }

      const assistantTurn: ChatTurn = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        text: data.answer,
        modelUsed: data.modelUsed,
        createdAt: new Date().toISOString(),
      };
      setChatTurns((prev) => [...prev, assistantTurn]);
    } catch (err) {
      const errorTurn: ChatTurn = {
        id: `${Date.now()}-err`,
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Follow-up query failed.',
        createdAt: new Date().toISOString(),
      };
      setChatTurns((prev) => [...prev, errorTurn]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSeekTo = (seconds: number) => {
    const el = videoElementRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds);
    el.play().catch(() => {
      // Autoplay may be blocked by browser policy
    });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleUploadTrigger = () => {
    setInputMode('upload');
    document.getElementById('analyzer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fileInputRef.current?.click();
  };

  const handleLoadFeaturedFacebookUrl = () => {
    setInputMode('url');
    setShareUrl(FEATURED_FACEBOOK_SHARE_URL);
    document.getElementById('analyzer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void runUrlAnalysis(FEATURED_FACEBOOK_SHARE_URL);
  };

  const handleRetryWithHydrogen = async () => {
    setSelectedModel('gemini-4-hydrogen');
    if (inputMode === 'upload' && selectedFile) {
      await runVideoAnalysis(selectedFile, 'gemini-4-hydrogen');
    } else if (inputMode === 'url') {
      await runUrlAnalysis(shareUrl, 'gemini-4-hydrogen');
    } else if (inputMode === 'create-clip') {
      await runUrlToClip(clipUrl, 'gemini-4-hydrogen');
    }
  };

  const handleDownloadActiveClip = () => {
    if (!selectedFile || !videoPreviewUrl) return;
    const a = document.createElement('a');
    a.href = videoPreviewUrl;
    a.download = selectedFile.name;
    a.click();
  };

  const previewFallbackFormat = POPULAR_SHORT_FORMATS[0];

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-900">
      <TopBar onUploadClick={handleUploadTrigger} />

      <main>
        {/* Hero & Primary Video Understanding Workbench */}
        <section id="analyzer" className="mx-auto max-w-[1280px] px-6 pt-10 pb-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
            {/* Left Workbench Column */}
            <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 md:p-8">
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-500">
                    Short-Form Video Intelligence · Frame & Audio Understanding
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance leading-[1.12]">
                    Decode why popular short videos go viral.
                  </h1>
                  <p className="max-w-2xl text-[15px] leading-relaxed text-slate-600">
                    Upload a downloaded Reel, TikTok, or Short—or inspect a shared Facebook link—to extract the opening 3-second hook, shot-by-shot timestamps, spoken transcript, and remix scripts with Gemini 4 Neon.
                  </p>
                </div>

                {/* Mode Switcher */}
                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('upload');
                      clearError();
                    }}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === 'upload'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Clip</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('ai-studio');
                      clearError();
                    }}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === 'ai-studio'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>AI Generator</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('downloader');
                      clearError();
                    }}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === 'downloader'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Link Downloader</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('url');
                      clearError();
                    }}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === 'url'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Inspect URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('create-clip');
                      clearError();
                    }}
                    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inputMode === 'create-clip'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>URL to Clip</span>
                  </button>
                </div>

                <form onSubmit={handlePrimaryAnalyze} className="space-y-5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) attachVideoFile(file);
                    }}
                  />

                  {inputMode === 'upload' && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const dropped = e.dataTransfer.files?.[0];
                        if (dropped) attachVideoFile(dropped);
                      }}
                      className={`rounded-xl border border-dashed p-6 transition-colors ${
                        isDragging
                          ? 'border-blue-700 bg-blue-50/50'
                          : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {selectedFile ? selectedFile.name : 'Drop an MP4, WebM, or MOV short clip here'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {selectedFile
                              ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready for frame-by-frame analysis`
                              : 'Supports vertical 9:16 and landscape clips up to 45 MB'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                          >
                            {selectedFile ? 'Replace File' : 'Choose File'}
                          </button>
                          <button
                            type="button"
                            disabled={isAnalyzing || isGeneratingSample || clipCreationPhase !== 'idle'}
                            onClick={() => handleGenerateAndAnalyzeFormat(POPULAR_SHORT_FORMATS[0])}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            <Film className="h-3.5 w-3.5" />
                            <span>{isGeneratingSample ? 'Synthesizing...' : 'Generate 4s Sample Clip'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {inputMode === 'ai-studio' && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                      <input
                        ref={aiLocalInputRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setAiLocalVideoFile(f);
                            clearError();
                          }
                        }}
                      />

                      {/* AI Generator Sub-Mode Switcher */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="block text-xs font-medium text-slate-700">AI Creation Tool</span>
                          <span className="block text-[11px] text-slate-500">
                            {providersStatus.nvidiaConfigured
                              ? 'NVIDIA NIM (NVIDIA_API_KEY) active on server'
                              : 'Add NVIDIA_API_KEY in Settings > Secrets to enable NVIDIA FLUX & Video'}
                          </span>
                        </div>
                        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAiSubMode('image');
                              clearError();
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              aiSubMode === 'image'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            <span>AI Image</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAiSubMode('video');
                              clearError();
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              aiSubMode === 'video'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Video className="h-3.5 w-3.5" />
                            <span>AI Video (3 Options)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAiSubMode('movie');
                              clearError();
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              aiSubMode === 'movie'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Clapperboard className="h-3.5 w-3.5" />
                            <span>AI Movie</span>
                          </button>
                        </div>
                      </div>

                      {/* Sub-mode 1: AI Image from Prompt */}
                      {aiSubMode === 'image' && (
                        <div className="space-y-4 border-t border-slate-200 pt-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor="ai-image-prompt" className="text-xs font-medium text-slate-700">
                                Image Prompt
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setAiImagePrompt(
                                    'Neon rain over a bustling Tokyo street food stall at midnight, steam rising, cinematic 35mm photography'
                                  );
                                  clearError();
                                }}
                                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                Sample Prompt
                              </button>
                            </div>
                            <textarea
                              id="ai-image-prompt"
                              rows={3}
                              value={aiImagePrompt}
                              onChange={(e) => {
                                setAiImagePrompt(e.target.value);
                                clearError();
                              }}
                              placeholder="Describe the scene, lighting, camera angle, and style..."
                              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <span className="block text-xs font-medium text-slate-700">Aspect Ratio</span>
                              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                {(['9:16', '1:1', '16:9', '3:4'] as const).map((ar) => (
                                  <button
                                    key={ar}
                                    type="button"
                                    onClick={() => setAiImageAspect(ar)}
                                    className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                                      aiImageAspect === ar
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    {ar}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block text-xs font-medium text-slate-700">Image Model</span>
                              <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                <button
                                  type="button"
                                  onClick={() => setAiImageQuality('nvidia_flux')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    aiImageQuality === 'nvidia_flux'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  NVIDIA FLUX.1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAiImageQuality('nvidia_sd3')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    aiImageQuality === 'nvidia_sd3'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  NVIDIA SD3
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAiImageQuality('fast')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    aiImageQuality === 'fast'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Gemini Flash
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAiImageQuality('hq')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    aiImageQuality === 'hq'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Nano Banana 2.1
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">
                              {aiImageQuality.startsWith('nvidia')
                                ? providersStatus.nvidiaConfigured
                                  ? 'Using server-side NVIDIA_API_KEY via NVIDIA NIM.'
                                  : 'Configure NVIDIA_API_KEY in Settings > Secrets to run NVIDIA models.'
                                : 'Native Gemini image models require a billing-enabled GEMINI_API_KEY.'}
                            </p>
                            <button
                              type="button"
                              disabled={isGeneratingAiImage}
                              onClick={() => void runAiGenerateImage()}
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              <span>{isGeneratingAiImage ? 'Generating Image...' : 'Generate AI Image'}</span>
                            </button>
                          </div>

                          {generatedAiImage && (
                            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                <img
                                  src={generatedAiImage.dataUrl}
                                  alt={generatedAiImage.prompt}
                                  className="max-h-56 w-auto rounded-lg border border-slate-200 object-contain bg-slate-950"
                                />
                                <div className="min-w-0 flex-1 space-y-2">
                                  <p className="font-mono text-[11px] text-slate-500">
                                    {generatedAiImage.modelUsed} · {generatedAiImage.aspectRatio}
                                  </p>
                                  <p className="text-xs text-slate-700 line-clamp-3">
                                    {generatedAiImage.prompt}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleDownloadGeneratedAiImage()}
                                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap cursor-pointer"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      <span>Download PNG</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleAnimateGeneratedImage}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                                    >
                                      <Video className="h-3.5 w-3.5" />
                                      <span>Animate in AI Video</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sub-mode 2: AI Video Generator (3 Options) */}
                      {aiSubMode === 'video' && (
                        <div className="space-y-4 border-t border-slate-200 pt-4">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {([
                              { id: 'prompt' as const, title: 'Option 1 · Prompt', sub: 'Text or Image to Video' },
                              { id: 'url' as const, title: 'Option 2 · URL', sub: 'Link to AI Video' },
                              { id: 'local' as const, title: 'Option 3 · Local Video', sub: 'Remix Uploaded Clip' },
                            ]).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setAiVideoOption(opt.id);
                                  clearError();
                                }}
                                className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                                  aiVideoOption === opt.id
                                    ? 'border-blue-700 bg-blue-50/70 text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <p className="text-xs font-semibold text-slate-900">{opt.title}</p>
                                <p className="text-[11px] text-slate-500">{opt.sub}</p>
                              </button>
                            ))}
                          </div>

                          {aiVideoOption === 'url' && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <label htmlFor="ai-video-url" className="text-xs font-medium text-slate-700">
                                  Source URL (Option 2)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAiVideoSourceUrl(FEATURED_FACEBOOK_SHARE_URL);
                                    clearError();
                                  }}
                                  className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                                >
                                  Use Facebook Reel Link
                                </button>
                              </div>
                              <input
                                id="ai-video-url"
                                type="url"
                                value={aiVideoSourceUrl}
                                onChange={(e) => {
                                  setAiVideoSourceUrl(e.target.value);
                                  clearError();
                                }}
                                placeholder="https://www.facebook.com/... or https://youtube.com/..."
                                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                              />
                            </div>
                          )}

                          {aiVideoOption === 'local' && (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3.5">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {(aiLocalVideoFile || selectedFile)
                                      ? (aiLocalVideoFile || selectedFile)!.name
                                      : 'Select a local MP4, WebM, or MOV video'}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {(aiLocalVideoFile || selectedFile)
                                      ? `${(((aiLocalVideoFile || selectedFile)!.size) / (1024 * 1024)).toFixed(2)} MB · Ready for Option 3 Remix`
                                      : 'Smart Remix uses FFmpeg + Gemini 4 Hydrogen directly on the server'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => aiLocalInputRef.current?.click()}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                                  >
                                    {aiLocalVideoFile ? 'Change Video' : 'Choose Local Video'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {aiVideoOption === 'prompt' && aiReferenceImage && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={aiReferenceImage.dataUrl}
                                  alt="Reference frame"
                                  className="h-10 w-10 rounded object-cover border border-slate-200 shrink-0"
                                />
                                <span className="truncate text-slate-700">
                                  Reference image: {aiReferenceImage.label}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setAiReferenceImage(null)}
                                className="text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <label htmlFor="ai-video-prompt" className="block text-xs font-medium text-slate-700">
                              {aiVideoOption === 'local'
                                ? 'Remix Direction (e.g., high-contrast punchy cut, fast pacing)'
                                : aiVideoOption === 'url'
                                  ? 'Visual Direction (optional)'
                                  : 'Video Generation Prompt'}
                            </label>
                            <textarea
                              id="ai-video-prompt"
                              rows={2}
                              value={aiVideoPrompt}
                              onChange={(e) => {
                                setAiVideoPrompt(e.target.value);
                                clearError();
                              }}
                              placeholder={
                                aiVideoOption === 'local'
                                  ? 'Make it a fast 9:16 short with crisp contrast and dynamic pacing...'
                                  : 'Describe the motion, camera movement, and visual story...'
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <span className="block text-xs font-medium text-slate-700">Aspect Ratio</span>
                              {aiVideoOption === 'local' ? (
                                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                  {(['9:16', '16:9', 'original'] as const).map((ar) => (
                                    <button
                                      key={ar}
                                      type="button"
                                      onClick={() => setAiLocalTargetAspect(ar)}
                                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                                        aiLocalTargetAspect === ar
                                          ? 'bg-white text-slate-900 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {ar === 'original' ? 'Original' : ar}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                  {(['9:16', '16:9'] as const).map((ar) => (
                                    <button
                                      key={ar}
                                      type="button"
                                      onClick={() => setAiVideoAspect(ar)}
                                      className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                                        aiVideoAspect === ar
                                          ? 'bg-white text-slate-900 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {ar}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {aiVideoOption !== 'local' && (
                              <div className="space-y-1.5">
                                <span className="block text-xs font-medium text-slate-700">Duration</span>
                                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                  {(['5s', '10s'] as const).map((dur) => (
                                    <button
                                      key={dur}
                                      type="button"
                                      onClick={() => setAiVideoDuration(dur)}
                                      className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                                        aiVideoDuration === dur
                                          ? 'bg-white text-slate-900 shadow-xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {dur}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                            {aiVideoOption === 'local' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isGeneratingAiVideo}
                                  onClick={() => void runAiGenerateVideo('free_ffmpeg')}
                                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Scissors className="h-3.5 w-3.5" />
                                  <span>
                                    {isGeneratingAiVideo
                                      ? aiVideoPhaseLabel || 'Remixing...'
                                      : 'Smart Remix Cut (FFmpeg + Gemini)'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isGeneratingAiVideo}
                                  onClick={() => void runAiGenerateVideo('omni')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  <span>Gemini Omni Remix (Paid Key)</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isGeneratingAiVideo}
                                  onClick={() => void runAiGenerateVideo('free_motion')}
                                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Film className="h-3.5 w-3.5" />
                                  <span>
                                    {isGeneratingAiVideo
                                      ? aiVideoPhaseLabel || 'Creating...'
                                      : aiVideoOption === 'url'
                                        ? 'Create URL Motion Short'
                                        : 'Generate Motion Short'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isGeneratingAiVideo}
                                  onClick={() => void runAiGenerateVideo('nvidia')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Wand2 className="h-3.5 w-3.5" />
                                  <span>NVIDIA NIM Video</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isGeneratingAiVideo}
                                  onClick={() => void runAiGenerateVideo('omni')}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  <span>Gemini Omni Video</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Sub-mode 3: AI Movie Creator */}
                      {aiSubMode === 'movie' && (
                        <div className="space-y-4 border-t border-slate-200 pt-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor="ai-movie-concept" className="text-xs font-medium text-slate-700">
                                Movie Concept / Storyline
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setMovieConcept(
                                    'A midnight courier discovers a locked silver briefcase ticking under a neon subway platform with 60 seconds to decide whether to open it'
                                  );
                                  clearError();
                                }}
                                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                Sample Story
                              </button>
                            </div>
                            <textarea
                              id="ai-movie-concept"
                              rows={3}
                              value={movieConcept}
                              onChange={(e) => {
                                setMovieConcept(e.target.value);
                                clearError();
                              }}
                              placeholder="Describe your movie premise, characters, conflict, and climax..."
                              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                              <label htmlFor="ai-movie-genre" className="block text-xs font-medium text-slate-700">
                                Genre
                              </label>
                              <select
                                id="ai-movie-genre"
                                value={movieGenre}
                                onChange={(e) => setMovieGenre(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
                              >
                                <option value="Action Thriller">Action Thriller</option>
                                <option value="Sci-Fi Drama">Sci-Fi Drama</option>
                                <option value="Mystery Reel">Mystery Reel</option>
                                <option value="Documentary Short">Documentary Short</option>
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block text-xs font-medium text-slate-700">Scenes</span>
                              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                {([4, 6, 8] as const).map((cnt) => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    onClick={() => setMovieSceneCount(cnt)}
                                    className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                                      movieSceneCount === cnt
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    {cnt}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block text-xs font-medium text-slate-700">Format</span>
                              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                {(['9:16', '16:9'] as const).map((ar) => (
                                  <button
                                    key={ar}
                                    type="button"
                                    onClick={() => setMovieAspect(ar)}
                                    className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors cursor-pointer ${
                                      movieAspect === ar
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    {ar}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                                <button
                                  type="button"
                                  onClick={() => setMovieEngine('gemini')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    movieEngine === 'gemini'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Gemini 4 Hydrogen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMovieEngine('nvidia')}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                    movieEngine === 'nvidia'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  NVIDIA Llama 3.3
                                </button>
                              </div>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={movieIncludeKeyframes}
                                  onChange={(e) => setMovieIncludeKeyframes(e.target.checked)}
                                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                                />
                                <span>Generate AI scene stills (NVIDIA FLUX.1 / Gemini)</span>
                              </label>
                            </div>
                            <button
                              type="button"
                              disabled={isCreatingMovie}
                              onClick={() => void runCreateAiMovie()}
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Clapperboard className="h-3.5 w-3.5" />
                              <span>{isCreatingMovie ? 'Directing & Rendering...' : 'Create AI Movie'}</span>
                            </button>
                          </div>

                          {movieWarning && (
                            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              AI stills skipped ({movieWarning}). Rendered with curated studio cinema backdrops.
                            </p>
                          )}

                          {generatedMoviePlan && (
                            <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {generatedMoviePlan.movieTitle}
                                  </p>
                                  <p className="text-xs text-slate-500">{generatedMoviePlan.logline}</p>
                                </div>
                                <span className="font-mono text-xs text-slate-500 tabular-nums">
                                  {generatedMoviePlan.scenes.length} scenes · {generatedMoviePlan.totalDurationSec}s
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {generatedMoviePlan.scenes.map((sc) => (
                                  <div
                                    key={sc.sceneNumber}
                                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs"
                                  >
                                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-500">
                                      <span>{sc.actLabel}</span>
                                      <span className="tabular-nums">{sc.durationSec}s</span>
                                    </div>
                                    <p className="mt-0.5 font-semibold text-slate-900 truncate">{sc.headline}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-600 line-clamp-1">
                                      {sc.narrationSubtitle}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {inputMode === 'downloader' && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="downloader-url-input" className="text-xs font-medium text-slate-700">
                          YouTube, Instagram, Facebook, TikTok, or Direct MP4 Link
                        </label>
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setDownloadUrlInput(FEATURED_FACEBOOK_SHARE_URL);
                              clearError();
                            }}
                            className="font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Facebook Reel
                          </button>
                          <span aria-hidden="true" className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDownloadUrlInput('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
                              clearError();
                            }}
                            className="font-medium text-slate-700 hover:underline cursor-pointer"
                          >
                            YouTube Link
                          </button>
                          <span aria-hidden="true" className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDownloadUrlInput('');
                              setExtractedLinkResult(null);
                              clearError();
                            }}
                            className="font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <input
                        id="downloader-url-input"
                        type="url"
                        value={downloadUrlInput}
                        onChange={(e) => {
                          setDownloadUrlInput(e.target.value);
                          clearError();
                        }}
                        placeholder="https://youtube.com/... or https://instagram.com/reel/... or https://facebook.com/..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />

                      {extractedLinkResult && (
                        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            {extractedLinkResult.thumbnailUrl && !thumbFailed && (
                              <img
                                src={extractedLinkResult.thumbnailUrl}
                                alt={extractedLinkResult.title || 'Video thumbnail'}
                                referrerPolicy="no-referrer"
                                onError={() => setThumbFailed(true)}
                                className="h-16 w-24 shrink-0 rounded-md border border-slate-200 object-cover bg-slate-100"
                              />
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                {extractedLinkResult.platform}
                                {extractedLinkResult.author ? ` · ${extractedLinkResult.author}` : ''}
                              </p>
                              <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                                {extractedLinkResult.title || extractedLinkResult.resolvedUrl}
                              </p>
                              {extractedLinkResult.description && (
                                <p className="text-xs text-slate-500 line-clamp-2">
                                  {extractedLinkResult.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {extractedLinkResult.directDownloadAvailable &&
                          extractedLinkResult.downloadOptions.length > 0 ? (
                            <div className="space-y-2 border-t border-slate-200 pt-3">
                              <p className="text-xs font-medium text-slate-700">
                                Verified Video Streams Ready
                              </p>
                              <div className="space-y-2">
                                {extractedLinkResult.downloadOptions.map((opt, idx) => {
                                  const sizeMb =
                                    typeof opt.sizeBytes === 'number'
                                      ? `${(opt.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                                      : null;
                                  const exceedsAnalyzerLimit =
                                    typeof opt.sizeBytes === 'number' && opt.sizeBytes > 45 * 1024 * 1024;
                                  const isThisDownloading = downloadingOptionUrl === opt.url;
                                  return (
                                    <div
                                      key={`${opt.url}-${idx}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-slate-900">{opt.label}</span>
                                        <span className="ml-2 font-mono text-slate-500">
                                          {opt.quality} · {opt.mimeType}
                                          {sizeMb ? ` · ${sizeMb}` : ''}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handlePlayOptionInStage(opt, extractedLinkResult.title)
                                          }
                                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                                        >
                                          <Play className="h-3.5 w-3.5" />
                                          <span>Play in Stage</span>
                                        </button>
                                        {isThisDownloading ? (
                                          <button
                                            type="button"
                                            onClick={() => downloadAbortRef.current?.abort()}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 whitespace-nowrap cursor-pointer"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                            <span>{downloadProgressLabel || 'Downloading...'} (Cancel)</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={downloadingOptionUrl !== null}
                                            onClick={() =>
                                              handleDownloadStreamOption(opt, extractedLinkResult.title)
                                            }
                                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            <span>Download MP4</span>
                                          </button>
                                        )}
                                        {!exceedsAnalyzerLimit && (
                                          <button
                                            type="button"
                                            disabled={isLoadingRemoteVideo}
                                            onClick={() =>
                                              handleLoadDownloadedOptionToPreview(opt, extractedLinkResult.title)
                                            }
                                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-700 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                          >
                                            <Sparkles className="h-3.5 w-3.5" />
                                            <span>{isLoadingRemoteVideo ? 'Loading...' : 'Analyze Clip'}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 10-Part Short Splitter */}
                              <div className="border-t border-slate-200 pt-3 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-xs font-semibold text-slate-900">
                                      Split into 10 Short Parts (Part 01 – Part 10)
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Create 10 individual MP4 clips to play, download, or analyze each part.
                                    </p>
                                  </div>
                                  <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                                    {([
                                      { id: '30s' as const, label: '30s Shorts' },
                                      { id: '60s' as const, label: '60s Shorts' },
                                      { id: 'full' as const, label: 'Full Split' },
                                    ]).map((opt) => (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                          setPartMode(opt.id);
                                          if (videoPartsPlan) {
                                            void runProbeVideoParts(videoPartsPlan.streamUrl, opt.id);
                                          }
                                        }}
                                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                          partMode === opt.id
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {!videoPartsPlan && (
                                  <button
                                    type="button"
                                    disabled={isProbingParts}
                                    onClick={() => {
                                      const sdFirst =
                                        extractedLinkResult.downloadOptions.find((o) => o.quality === 'SD') ||
                                        extractedLinkResult.downloadOptions[0];
                                      if (sdFirst) {
                                        void runProbeVideoParts(sdFirst.url);
                                      }
                                    }}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                  >
                                    <Scissors className="h-3.5 w-3.5" />
                                    <span>
                                      {isProbingParts
                                        ? 'Scanning Video Duration...'
                                        : 'Split Video into 10 Parts'}
                                    </span>
                                  </button>
                                )}

                                {videoPartsPlan && (
                                  <div className="space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                                      <span>
                                        Total Duration:{' '}
                                        <span className="font-mono font-medium text-slate-900 tabular-nums">
                                          {videoPartsPlan.totalDurationFormatted}
                                        </span>
                                        {videoPartsPlan.width && videoPartsPlan.height
                                          ? ` · ${videoPartsPlan.width}x${videoPartsPlan.height}`
                                          : ''}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isProbingParts}
                                        onClick={() => void runProbeVideoParts(videoPartsPlan.streamUrl)}
                                        className="font-medium text-blue-700 hover:underline cursor-pointer"
                                      >
                                        {isProbingParts ? 'Updating...' : 'Refresh 10 Parts'}
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      {videoPartsPlan.parts.map((part) => {
                                        const isBusy = busyPartNumber === part.partNumber;
                                        return (
                                          <div
                                            key={part.partNumber}
                                            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                                          >
                                            <div className="min-w-0">
                                              <p className="font-semibold text-slate-900">{part.label}</p>
                                              <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                                                {part.startFormatted} – {part.endFormatted}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                type="button"
                                                disabled={busyPartNumber !== null}
                                                onClick={() =>
                                                  handleVideoPartAction(part, 'play', extractedLinkResult.title)
                                                }
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                              >
                                                <Play className="h-3 w-3" />
                                                <span>{isBusy ? '...' : 'Play'}</span>
                                              </button>
                                              <button
                                                type="button"
                                                disabled={busyPartNumber !== null}
                                                onClick={() =>
                                                  handleVideoPartAction(part, 'download', extractedLinkResult.title)
                                                }
                                                className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                                              >
                                                <Download className="h-3 w-3" />
                                                <span>{isBusy ? '...' : 'MP4'}</span>
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 border-t border-slate-200 pt-3">
                              <p className="text-xs leading-relaxed text-slate-600">
                                {extractedLinkResult.blockedReason ||
                                  'Direct video stream access was restricted by the source host.'}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setClipUrl(extractedLinkResult.requestedUrl);
                                    setClipFormat('ten_parts');
                                    setInputMode('create-clip');
                                    clearError();
                                    void runUrlToClip(extractedLinkResult.requestedUrl);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap cursor-pointer"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  <span>Create 10-Part Short from URL</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleUploadTrigger}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  <span>Upload Saved MP4</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {inputMode === 'url' && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="share-url-input" className="text-xs font-medium text-slate-700">
                          Short Video Share Link
                        </label>
                        <button
                          type="button"
                          onClick={() => setShareUrl(FEATURED_FACEBOOK_SHARE_URL)}
                          className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                        >
                          Use Facebook Reel Link
                        </button>
                      </div>
                      <input
                        id="share-url-input"
                        type="url"
                        value={shareUrl}
                        onChange={(e) => {
                          setShareUrl(e.target.value);
                          clearError();
                        }}
                        placeholder="https://www.facebook.com/share/v/..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                      <p className="text-xs leading-relaxed text-slate-500">
                        Inspects public link context and search signals. Note: Facebook share links often block direct video streams behind login; upload the downloaded MP4 clip in the Upload tab for frame-by-frame analysis.
                      </p>
                    </div>
                  )}

                  {inputMode === 'create-clip' && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700">Short Shot Format</span>
                        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setClipFormat('key_points');
                              clearError();
                            }}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              clipFormat === 'key_points'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Key Points Short
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setClipFormat('two_url_mashup');
                              clearError();
                            }}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              clipFormat === 'two_url_mashup'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Two-URL Mashup
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setClipFormat('ten_parts');
                              clearError();
                            }}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              clipFormat === 'ten_parts'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            10-Part Series
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label htmlFor="clip-source-url" className="text-xs font-medium text-slate-700">
                            {clipFormat === 'two_url_mashup' ? 'URL 1 (Opening & Point 1)' : 'Source URL for Key-Point Short'}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setClipUrl(FEATURED_FACEBOOK_SHARE_URL);
                              clearError();
                            }}
                            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Use Facebook Reel Link
                          </button>
                        </div>
                        <input
                          id="clip-source-url"
                          type="url"
                          value={clipUrl}
                          onChange={(e) => {
                            setClipUrl(e.target.value);
                            clearError();
                          }}
                          placeholder="https://... (article, product page, or social share link)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                        />
                      </div>

                      {clipFormat === 'two_url_mashup' && (
                        <div className="space-y-2">
                          <label htmlFor="clip-secondary-url" className="block text-xs font-medium text-slate-700">
                            URL 2 (Comparison / Point 2)
                          </label>
                          <input
                            id="clip-secondary-url"
                            type="url"
                            value={secondaryClipUrl}
                            onChange={(e) => {
                              setSecondaryClipUrl(e.target.value);
                              clearError();
                            }}
                            placeholder="https://... (second link to compare or combine in one short)"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <span className="block text-xs font-medium text-slate-700">Clip Duration</span>
                          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                            {([6, 9, 12] as const).map((sec) => (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => setClipDurationSec(sec)}
                                className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition-colors tabular-nums cursor-pointer ${
                                  clipDurationSec === sec
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {sec}s
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="block text-xs font-medium text-slate-700">Visual Theme</span>
                          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                            {[
                              { id: 'editorial_dark' as const, label: 'Slate' },
                              { id: 'cobalt_studio' as const, label: 'Cobalt' },
                              { id: 'street_warm' as const, label: 'Amber' },
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setClipStyle(opt.id)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                                  clipStyle === opt.id
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="clip-angle" className="block text-xs font-medium text-slate-700 mb-1.5">
                          Creative Angle (optional)
                        </label>
                        <input
                          id="clip-angle"
                          type="text"
                          value={clipAngle}
                          onChange={(e) => {
                            setClipAngle(e.target.value);
                            clearError();
                          }}
                          placeholder="e.g., Open with a curiosity hook and highlight 3 fast takeaways"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                        />
                      </div>

                      {createdClipPlan && (
                        <div className="border-t border-slate-200 pt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span className="font-medium text-slate-800">{createdClipPlan.title}</span>
                            <span className="font-mono tabular-nums">{createdClipPlan.beats.length} scenes</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {createdClipPlan.beats.map((beat) => (
                              <div
                                key={beat.index}
                                className="flex items-baseline justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs"
                              >
                                <span className="font-medium text-slate-800 truncate">
                                  {beat.kicker}: {beat.headline}
                                </span>
                                <span className="font-mono text-slate-500 tabular-nums shrink-0">
                                  {beat.durationSec}s
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {inputMode === 'upload' && !selectedFile && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
                      <span>Have a YouTube, Instagram, Facebook, or web link?</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setInputMode('downloader');
                            clearError();
                          }}
                          className="font-medium text-blue-700 hover:underline cursor-pointer"
                        >
                          Link Downloader
                        </button>
                        <span aria-hidden="true" className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            setInputMode('create-clip');
                            clearError();
                          }}
                          className="font-medium text-blue-700 hover:underline cursor-pointer"
                        >
                          Create Clip from URL
                        </button>
                        <span aria-hidden="true" className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            setInputMode('url');
                            clearError();
                          }}
                          className="font-medium text-slate-700 hover:underline cursor-pointer"
                        >
                          Inspect URL
                        </button>
                      </div>
                    </div>
                  )}

                  {((inputMode === 'upload' && selectedFile) || inputMode === 'url') && (
                    <div>
                      <label htmlFor="focus-prompt" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Analysis Focus (optional)
                      </label>
                      <input
                        id="focus-prompt"
                        type="text"
                        value={focusPrompt}
                        onChange={(e) => {
                          setFocusPrompt(e.target.value);
                          clearError();
                        }}
                        placeholder="e.g., Focus on opening 3-second hook, camera cuts, and caption phrasing"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                  )}

                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm text-red-900 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                          <p>{errorMessage}</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearError}
                          aria-label="Clear error"
                          className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-800 shrink-0 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {errorCode === 'NO_FILE' && (
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <button
                            type="button"
                            onClick={() => {
                              clearError();
                              void handleGenerateAndAnalyzeFormat(POPULAR_SHORT_FORMATS[0]);
                            }}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 cursor-pointer"
                          >
                            Generate & Analyze Sample Clip
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              clearError();
                              setInputMode('create-clip');
                            }}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 cursor-pointer"
                          >
                            Switch to URL to Clip
                          </button>
                        </div>
                      )}
                      {errorCode === 'MODEL_UNAVAILABLE' && (
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <button
                            type="button"
                            onClick={() => {
                              clearError();
                              if (inputMode === 'upload' && selectedFile) {
                                void runVideoAnalysis(selectedFile);
                              } else if (inputMode === 'url') {
                                void runUrlAnalysis();
                              } else if (inputMode === 'create-clip') {
                                void runUrlToClip();
                              }
                            }}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 cursor-pointer"
                          >
                            Try Again
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const altModel: GeminiModelId =
                                selectedModel === 'gemini-4-neon' ? 'gemini-4-hydrogen' : 'gemini-4-neon';
                              setSelectedModel(altModel);
                              clearError();
                              if (inputMode === 'upload' && selectedFile) {
                                void runVideoAnalysis(selectedFile, altModel);
                              } else if (inputMode === 'url') {
                                void runUrlAnalysis(shareUrl, altModel);
                              } else if (inputMode === 'create-clip') {
                                void runUrlToClip(clipUrl, altModel);
                              }
                            }}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 cursor-pointer"
                          >
                            Switch to {selectedModel === 'gemini-4-neon' ? 'Gemini 4 Hydrogen' : 'Gemini 4 Neon'} & Retry
                          </button>
                        </div>
                      )}
                      {(errorCode === 'RESOURCE_EXHAUSTED' || errorCode === 'PERMISSION_DENIED') &&
                        selectedModel === 'gemini-4-neon' && (
                          <div className="pl-6">
                            <button
                              type="button"
                              onClick={handleRetryWithHydrogen}
                              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 cursor-pointer"
                            >
                              Retry with Gemini 4 Hydrogen
                            </button>
                          </div>
                        )}
                    </div>
                  )}

                  {inputMode !== 'ai-studio' && (
                    <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      {inputMode === 'downloader' ? (
                        <p className="text-xs text-slate-500">
                          Checks public MP4/WebM streams, OpenGraph embeds, and video metadata.
                        </p>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-500">Model</span>
                          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModel('gemini-4-neon');
                                clearError();
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                selectedModel === 'gemini-4-neon'
                                  ? 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Gemini 4 Neon
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModel('gemini-4-hydrogen');
                                clearError();
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                selectedModel === 'gemini-4-hydrogen'
                                  ? 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Gemini 4 Hydrogen
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={
                          isAnalyzing ||
                          isGeneratingSample ||
                          isExtractingLink ||
                          clipCreationPhase !== 'idle'
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {inputMode === 'downloader' ? (
                          <Download className="h-4 w-4" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        <span>
                          {isExtractingLink
                            ? 'Checking Link...'
                            : clipCreationPhase === 'planning'
                              ? 'Planning Scenes...'
                              : clipCreationPhase === 'rendering'
                                ? 'Rendering Clip...'
                                : isAnalyzing
                                  ? 'Analyzing...'
                                  : inputMode === 'upload'
                                    ? 'Analyze Video'
                                    : inputMode === 'downloader'
                                      ? 'Find Video & Download'
                                      : inputMode === 'url'
                                        ? 'Inspect Share URL'
                                        : 'Create Video Clip'}
                        </span>
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Right Preview Stage Column */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-900 p-6 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    {videoPreviewUrl ? 'Active Clip Preview' : '9:16 Vertical Stage'}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-white truncate max-w-[240px]">
                    {selectedFile
                      ? selectedFile.name
                      : activeRemoteStream
                        ? activeRemoteStream.title
                        : previewFallbackFormat.title}
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {selectedFile
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : activeRemoteStream && typeof activeRemoteStream.option.sizeBytes === 'number'
                      ? `${(activeRemoteStream.option.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                      : previewFallbackFormat.durationRange}
                </span>
              </div>

              <div className="my-5 flex flex-1 items-center justify-center">
                {videoPreviewUrl ? (
                  <div
                    className={`relative overflow-hidden rounded-xl border border-slate-700 bg-black ${
                      stageAspectRatio === '16:9'
                        ? 'aspect-video w-full'
                        : 'aspect-[9/16] w-full max-w-[290px]'
                    }`}
                  >
                    <video
                      ref={videoElementRef}
                      src={videoPreviewUrl}
                      controls
                      playsInline
                      onError={() => {
                        if (activeRemoteStream && !activeRemoteStream.usingProxyFallback) {
                          const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(activeRemoteStream.option.url)}`;
                          setActiveRemoteStream((prev) =>
                            prev ? { ...prev, usingProxyFallback: true } : prev
                          );
                          setVideoPreviewUrl(proxyUrl);
                        }
                      }}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="relative aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                    <img
                      src={previewFallbackFormat.imagePath}
                      alt={previewFallbackFormat.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover opacity-90"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-5">
                      <p className="text-xs text-slate-300">{previewFallbackFormat.category}</p>
                      <p className="mt-1 font-display text-lg font-semibold text-white">
                        {previewFallbackFormat.title}
                      </p>
                      <button
                        type="button"
                        disabled={isAnalyzing || isGeneratingSample}
                        onClick={() => handleGenerateAndAnalyzeFormat(previewFallbackFormat)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>{isGeneratingSample ? 'Creating Clip...' : 'Test Sample Short'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-4 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                {selectedFile && videoPreviewUrl ? (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadActiveClip}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Clip</span>
                      </button>
                      <button
                        type="button"
                        disabled={isAnalyzing || clipCreationPhase !== 'idle'}
                        onClick={() => runVideoAnalysis(selectedFile)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Analyze Clip</span>
                      </button>
                    </div>
                    <span className="font-mono text-slate-300">{stageAspectRatio}</span>
                  </>
                ) : activeRemoteStream && videoPreviewUrl ? (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={downloadingOptionUrl !== null}
                        onClick={() =>
                          handleDownloadStreamOption(activeRemoteStream.option, activeRemoteStream.title)
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>
                          {downloadingOptionUrl === activeRemoteStream.option.url
                            ? downloadProgressLabel || 'Downloading...'
                            : 'Download MP4'}
                        </span>
                      </button>
                      <span className="text-slate-400">{activeRemoteStream.option.quality}</span>
                    </div>
                    <span className="font-mono text-slate-300">{stageAspectRatio}</span>
                  </>
                ) : (
                  <>
                    <span>Click timestamps in the breakdown to jump directly</span>
                    <span className="font-mono text-slate-300">9:16</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Breakdown Results */}
        <AnalysisBreakdown
          videoAnalysis={videoAnalysis}
          urlAnalysis={urlAnalysis}
          isAnalyzing={isAnalyzing}
          selectedModel={selectedModel}
          chatTurns={chatTurns}
          isChatLoading={isChatLoading}
          onAskFollowUp={handleAskFollowUp}
          onSeekTo={handleSeekTo}
          onSwitchToUpload={handleUploadTrigger}
          onLoadFeaturedLink={handleLoadFeaturedFacebookUrl}
        />

        {/* Popular Viral Formats Showcase */}
        <PopularFormatsSection
          onGenerateAndAnalyze={handleGenerateAndAnalyzeFormat}
          isBusy={isAnalyzing || isGeneratingSample}
        />

        {/* Saved Local History */}
        <SavedLibrarySection
          savedAnalyses={savedAnalyses}
          activeId={videoAnalysis?.id}
          onSelectAnalysis={(item) => {
            setUrlAnalysis(null);
            setVideoAnalysis(item);
            setChatTurns([]);
            document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onDeleteAnalysis={(id) => {
            setSavedAnalyses((prev) => prev.filter((item) => item.id !== id));
            if (videoAnalysis?.id === id) {
              setVideoAnalysis(null);
            }
          }}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>ShortScope · Short-Form Video Structure & Retention Studio</p>
          <div className="flex items-center gap-5">
            <a href="#analyzer" className="hover:text-slate-900">
              Analyzer
            </a>
            <a href="#formats" className="hover:text-slate-900">
              Popular Formats
            </a>
            <a href="#saved" className="hover:text-slate-900">
              Saved Library
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
