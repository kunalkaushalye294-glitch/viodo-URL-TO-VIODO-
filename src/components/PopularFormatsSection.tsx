import React, { useState } from 'react';
import { Film, Play, X } from 'lucide-react';
import { POPULAR_SHORT_FORMATS } from '../data/popularFormats';
import { PopularShortFormat } from '../types/video';

interface PopularFormatsSectionProps {
  onGenerateAndAnalyze: (format: PopularShortFormat) => Promise<void>;
  isBusy: boolean;
}

export const PopularFormatsSection: React.FC<PopularFormatsSectionProps> = ({
  onGenerateAndAnalyze,
  isBusy,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<PopularShortFormat | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <section id="formats" className="mx-auto max-w-[1280px] px-6 py-10">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Short-Form Archetypes · 9:16 Reference Structures</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">
            Popular Viral Short Formats
          </h2>
        </div>
        <p className="max-w-md text-sm text-slate-600">
          Inspect proven vertical pacing blueprints or synthesize a real sample WebM clip from any format to test Gemini 4 Neon video understanding immediately.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {POPULAR_SHORT_FORMATS.map((format) => {
          const isFailed = Boolean(failedImages[format.id]);
          return (
            <article
              key={format.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-900">
                {!isFailed ? (
                  <img
                    src={format.imagePath}
                    alt={format.title}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((prev) => ({ ...prev, [format.id]: true }))}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-center text-slate-300">
                    <Film className="h-8 w-8 text-slate-400" />
                    <span className="text-sm font-medium">{format.title}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 text-white">
                  <p className="font-mono text-xs text-slate-200 tabular-nums">{format.durationRange}</p>
                  <h3 className="mt-0.5 font-display text-lg font-semibold leading-snug">{format.title}</h3>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">
                    <span>{format.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{format.hookPattern}</span>
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">{format.summary}</p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onGenerateAndAnalyze(format)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Analyze Sample Clip</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFormat(format)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    Shot List
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedFormat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="format-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedFormat.category} · {selectedFormat.durationRange}
                </p>
                <h3 id="format-dialog-title" className="mt-1 font-display text-xl font-semibold text-slate-900">
                  {selectedFormat.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFormat(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Close shot blueprint"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-sm leading-relaxed text-slate-600">{selectedFormat.summary}</p>
              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-900">Production Shot Blueprint</p>
                <ol className="mt-2.5 space-y-2 text-sm text-slate-700">
                  {selectedFormat.shotBlueprint.map((shot, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs">
                      {shot}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setSelectedFormat(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  const target = selectedFormat;
                  setSelectedFormat(null);
                  await onGenerateAndAnalyze(target);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                <span>Generate & Analyze Clip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
