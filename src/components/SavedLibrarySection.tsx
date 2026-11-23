import React from 'react';
import { Trash2 } from 'lucide-react';
import { VideoAnalysisResult } from '../types/video';

interface SavedLibrarySectionProps {
  savedAnalyses: VideoAnalysisResult[];
  activeId?: string;
  onSelectAnalysis: (item: VideoAnalysisResult) => void;
  onDeleteAnalysis: (id: string) => void;
}

export const SavedLibrarySection: React.FC<SavedLibrarySectionProps> = ({
  savedAnalyses,
  activeId,
  onSelectAnalysis,
  onDeleteAnalysis,
}) => {
  return (
    <section id="saved" className="mx-auto max-w-[1280px] px-6 py-10">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Workspace History · Stored Locally</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">Saved Breakdowns</h2>
        </div>
        <span className="font-mono text-xs text-slate-500 tabular-nums">
          {savedAnalyses.length} {savedAnalyses.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {savedAnalyses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">No saved video breakdowns yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Completed video analyses are automatically stored here so you can compare hooks, cuts, and scripts across clips.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Title & Clip</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4 text-right">Cuts</th>
                  <th className="py-3 px-4 text-right">Moments</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {savedAnalyses.map((item) => {
                  const isActive = item.id === activeId;
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50 ${isActive ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectAnalysis(item)}
                          className="text-left hover:text-blue-700 cursor-pointer"
                        >
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="font-mono text-xs text-slate-500">{item.fileName}</p>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{item.category}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {item.modelUsed}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {item.pacingAndEditing.estimatedCutCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {item.timelineMoments.length}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectAnalysis(item)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAnalysis(item.id)}
                            aria-label={`Delete ${item.title}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
