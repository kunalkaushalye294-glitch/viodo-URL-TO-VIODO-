import React from 'react';

interface TopBarProps {
  onUploadClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onUploadClick }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
        <a
          href="#analyzer"
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          ShortScope
        </a>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a
            href="#analyzer"
            className="whitespace-nowrap shrink-0 py-1 hover:text-slate-900 hover:underline hover:underline-offset-4 transition-colors"
          >
            Analyzer
          </a>
          <a
            href="#breakdown"
            className="whitespace-nowrap shrink-0 py-1 hover:text-slate-900 hover:underline hover:underline-offset-4 transition-colors"
          >
            Breakdown
          </a>
          <a
            href="#formats"
            className="whitespace-nowrap shrink-0 py-1 hover:text-slate-900 hover:underline hover:underline-offset-4 transition-colors"
          >
            Popular Formats
          </a>
          <a
            href="#saved"
            className="whitespace-nowrap shrink-0 py-1 hover:text-slate-900 hover:underline hover:underline-offset-4 transition-colors"
          >
            Saved Library
          </a>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onUploadClick}
            className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upload Clip
          </button>
        </div>
      </div>
    </header>
  );
};
