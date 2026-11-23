import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  MessageSquare,
  Play,
  Send,
  Upload,
} from 'lucide-react';
import {
  ChatTurn,
  GeminiModelId,
  UrlAnalysisResult,
  VideoAnalysisResult,
} from '../types/video';

interface AnalysisBreakdownProps {
  videoAnalysis: VideoAnalysisResult | null;
  urlAnalysis: UrlAnalysisResult | null;
  isAnalyzing: boolean;
  selectedModel: GeminiModelId;
  chatTurns: ChatTurn[];
  isChatLoading: boolean;
  onAskFollowUp: (question: string) => Promise<void>;
  onSeekTo: (seconds: number) => void;
  onSwitchToUpload: () => void;
  onLoadFeaturedLink: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestampLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderFormattedReport(markdown: string): React.ReactNode {
  const lines = markdown.split('\n');
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-700">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={index} className="pt-2 font-display text-base font-semibold text-slate-900">
              {trimmed.slice(4).replace(/\*\*/g, '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return (
            <h3 key={index} className="pt-3 font-display text-lg font-semibold text-slate-900">
              {trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '')}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
          const content = trimmed.replace(/^(-|\*|\d+\.)\s*/, '').replace(/\*\*/g, '');
          return (
            <div key={index} className="flex items-start gap-2.5 pl-1">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
              <span>{content}</span>
            </div>
          );
        }
        return <p key={index}>{trimmed.replace(/\*\*/g, '')}</p>;
      })}
    </div>
  );
}

export const AnalysisBreakdown: React.FC<AnalysisBreakdownProps> = ({
  videoAnalysis,
  urlAnalysis,
  isAnalyzing,
  selectedModel,
  chatTurns,
  isChatLoading,
  onAskFollowUp,
  onSeekTo,
  onSwitchToUpload,
  onLoadFeaturedLink,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [questionInput, setQuestionInput] = useState('');
  const [ogImageFailed, setOgImageFailed] = useState(false);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleExportJson = () => {
    const payload = videoAnalysis || urlAnalysis;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = videoAnalysis
      ? `${videoAnalysis.fileName.replace(/\.[^.]+$/, '')}-analysis.json`
      : 'short-url-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || isChatLoading) return;
    setQuestionInput('');
    await onAskFollowUp(trimmed);
  };

  if (isAnalyzing) {
    return (
      <section id="breakdown" className="mx-auto max-w-[1280px] px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-5">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
              <div className="h-7 w-72 rounded bg-slate-200 animate-pulse" />
            </div>
            <span className="text-sm font-medium text-slate-600">
              Analyzing frames with {selectedModel}...
            </span>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-28 rounded-lg bg-slate-100 animate-pulse" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-10 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-10 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-10 w-3/4 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  if (!videoAnalysis && !urlAnalysis) {
    return (
      <section id="breakdown" className="mx-auto max-w-[1280px] px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Video Intelligence Workspace · Powered by {selectedModel}
              </p>
              <h2 className="font-display text-2xl font-semibold text-slate-900">
                Your structured video breakdown appears here
              </h2>
              <p className="text-[15px] leading-relaxed text-slate-600">
                Upload a downloaded Facebook Reel, TikTok, or YouTube Short—or generate a test clip above—to inspect the opening 3-second hook, clickable shot-by-shot timestamps, spoken transcript, on-screen captions, and remix templates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onSwitchToUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Upload MP4 / WebM
              </button>
              <button
                type="button"
                onClick={onLoadFeaturedLink}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                Inspect Facebook Share URL
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (urlAnalysis && !videoAnalysis) {
    return (
      <section id="breakdown" className="mx-auto max-w-[1280px] px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>URL Context & Search Grounding</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{urlAnalysis.modelUsed}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatTimestampLabel(urlAnalysis.analyzedAt)}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold text-slate-900 text-balance">
                {urlAnalysis.openGraph.title || 'Short-Form Video Link Inspection'}
              </h2>
              <a
                href={urlAnalysis.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline break-all"
              >
                <span>{urlAnalysis.url}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onSwitchToUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Upload Clip for Frame Analysis
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <Download className="h-4 w-4" />
                Export JSON
              </button>
            </div>
          </div>

          {urlAnalysis.openGraph.directVideoBlocked && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
              Direct video stream access is restricted by the host platform for this share URL. Public metadata and search grounding are shown below; upload the downloaded <span className="font-mono">.mp4</span> clip in the Upload tab to run frame-by-frame timestamp and transcript analysis with Gemini 4 Neon.
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {urlAnalysis.openGraph.image && !ogImageFailed && (
              <div className="lg:col-span-4">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img
                    src={urlAnalysis.openGraph.image}
                    alt={urlAnalysis.openGraph.title || 'Shared link preview'}
                    referrerPolicy="no-referrer"
                    onError={() => setOgImageFailed(true)}
                    className="aspect-video w-full object-cover"
                  />
                  {urlAnalysis.openGraph.description && (
                    <p className="border-t border-slate-200 bg-white p-3.5 text-xs leading-relaxed text-slate-600">
                      {urlAnalysis.openGraph.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className={urlAnalysis.openGraph.image && !ogImageFailed ? 'lg:col-span-8' : 'lg:col-span-12'}>
              {renderFormattedReport(urlAnalysis.reportMarkdown)}

              {urlAnalysis.groundingSources.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Referenced Web Sources</h3>
                  <ul className="mt-2.5 space-y-1.5">
                    {urlAnalysis.groundingSources.map((src, i) => (
                      <li key={i} className="text-sm">
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"
                        >
                          <span className="truncate max-w-xl">{src.title}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!videoAnalysis) return null;

  return (
    <section id="breakdown" className="mx-auto max-w-[1280px] px-6 py-10 space-y-6">
      {/* Primary Report Header & Summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{videoAnalysis.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{videoAnalysis.fileName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatFileSize(videoAnalysis.fileSizeBytes)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{videoAnalysis.modelUsed}</span>
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-slate-900 text-balance">
              {videoAnalysis.title}
            </h2>
            <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600">{videoAnalysis.summary}</p>
          </div>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export Breakdown
          </button>
        </div>

        {/* 4-column Pacing & Hook Metrics Row */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Hook Window</p>
            <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {videoAnalysis.hookAnalysis.timestamp}
            </p>
            <p className="text-xs leading-relaxed text-slate-600">{videoAnalysis.hookAnalysis.visualHook}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Estimated Cuts</p>
            <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {videoAnalysis.pacingAndEditing.estimatedCutCount} cuts
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              Avg shot: {videoAnalysis.pacingAndEditing.averageShotLength}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Visual Style</p>
            <p className="text-sm font-semibold text-slate-900">Framing & Motion</p>
            <p className="text-xs leading-relaxed text-slate-600">{videoAnalysis.pacingAndEditing.visualStyle}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Audio Layering</p>
            <p className="text-sm font-semibold text-slate-900">Sound & Voice</p>
            <p className="text-xs leading-relaxed text-slate-600">{videoAnalysis.pacingAndEditing.audioLayering}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Opening Audio Hook</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{videoAnalysis.hookAnalysis.audioHook}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Retention Mechanism</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {videoAnalysis.hookAnalysis.retentionMechanism}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Timestamped Timeline & Transcript Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Shot-by-Shot Key Moments</h3>
              <p className="text-xs text-slate-500">Click any timestamp to seek the video player</p>
            </div>
            <Film className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="divide-y divide-slate-100">
            {videoAnalysis.timelineMoments.map((moment, idx) => (
              <div
                key={`${moment.timestamp}-${idx}`}
                className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:gap-4"
              >
                <button
                  type="button"
                  onClick={() => onSeekTo(moment.seconds)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-blue-700 tabular-nums transition-colors hover:border-blue-300 hover:bg-blue-50 shrink-0 cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                  <span>{moment.timestamp}</span>
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize font-medium text-slate-700">{moment.importance}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{moment.audioOrTextCue}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-800">{moment.visualAction}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-lg font-semibold text-slate-900">Transcript & On-Screen Text</h3>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Spoken Transcript</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                  {videoAnalysis.transcriptAndOnScreenText.spokenTranscript}
                </p>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-medium text-slate-500">Detected Frame Overlays</p>
                {videoAnalysis.transcriptAndOnScreenText.onScreenOverlays.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
                    {videoAnalysis.transcriptAndOnScreenText.onScreenOverlays.map((overlay, idx) => (
                      <li key={idx} className="font-mono text-xs text-slate-700">
                        {idx + 1}. {overlay}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-500">No text overlays detected in video frames.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-display text-lg font-semibold text-slate-900">Why It Spreads</h3>
            <div className="mt-4 divide-y divide-slate-100">
              {videoAnalysis.viralDrivers.map((item, idx) => (
                <div key={idx} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold text-slate-900">{item.driver}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Remix Ideas & Follow-up Video Chat */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-display text-lg font-semibold text-slate-900">Remix & Script Kit</h3>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Suggested Hook Titles</p>
              <ul className="mt-2 space-y-2">
                {videoAnalysis.remixIdeas.suggestedTitles.map((title, idx) => {
                  const copyKey = `title-${idx}`;
                  return (
                    <li
                      key={copyKey}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-800"
                    >
                      <span>{title}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(copyKey, title)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0 cursor-pointer"
                        aria-label="Copy title"
                      >
                        {copiedId === copyKey ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedId === copyKey ? 'Copied' : 'Copy'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Caption Templates</p>
              <ul className="mt-2 space-y-2">
                {videoAnalysis.remixIdeas.captionTemplates.map((cap, idx) => {
                  const copyKey = `cap-${idx}`;
                  return (
                    <li
                      key={copyKey}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-700"
                    >
                      <span>{cap}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(copyKey, cap)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0 cursor-pointer mt-0.5"
                        aria-label="Copy caption"
                      >
                        {copiedId === copyKey ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedId === copyKey ? 'Copied' : 'Copy'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-slate-200 pt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-600 font-mono truncate">
                {videoAnalysis.remixIdeas.hashtags.join(' ')}
              </p>
              <button
                type="button"
                onClick={() => handleCopy('hashtags', videoAnalysis.remixIdeas.hashtags.join(' '))}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline shrink-0 cursor-pointer"
              >
                {copiedId === 'hashtags' ? 'Copied tags' : 'Copy tags'}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Ask About This Video</h3>
              <p className="text-xs text-slate-500">Query specific frames, audio cues, or editing ideas</p>
            </div>
            <MessageSquare className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="mt-4 flex-1 space-y-3 max-h-72 overflow-y-auto pr-1">
            {chatTurns.length === 0 ? (
              <div className="space-y-2 py-4">
                <p className="text-sm text-slate-600">Try asking a direct follow-up question:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'What visual changes happen in the first 2 seconds?',
                    'Rewrite this clip as a 20-second voiceover script',
                    'Which moment has the strongest retention payoff?',
                  ].map((promptSuggestion) => (
                    <button
                      key={promptSuggestion}
                      type="button"
                      onClick={() => onAskFollowUp(promptSuggestion)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      {promptSuggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatTurns.map((turn) => (
                <div
                  key={turn.id}
                  className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'ml-8 bg-slate-900 text-white'
                      : 'mr-8 border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                </div>
              ))
            )}
            {isChatLoading && (
              <div className="mr-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Checking video frames with {selectedModel}...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitQuestion} className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-4">
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask about a timestamp, visual cue, or script rewrite..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isChatLoading || !questionInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              <Send className="h-4 w-4" />
              <span>Ask</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};
