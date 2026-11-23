import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  Film,
  Folder,
  Info,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
} from '../types/dancevault';
import {
  computeRecursiveFolderSizeMap,
  formatStorageMb,
  getVideoSizeMb,
} from '../utils/storageSize';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';

export type PendingTrashRequest =
  | {
      kind: 'entries';
      items: ExplorerEntry[];
    }
  | {
      kind: 'library';
      library: LibraryItem;
      entries: ExplorerEntry[];
    };

interface MoveToTrashModalProps {
  request: PendingTrashRequest;
  libraries: LibraryItem[];
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onConfirm: () => void;
}

export const MoveToTrashModal: React.FC<MoveToTrashModalProps> = ({
  request,
  libraries,
  allEntries,
  onClose,
  onConfirm,
}) => {
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const libraryNameMap = useMemo(
    () => new Map(libraries.map((l) => [l.id, l.name])),
    [libraries]
  );

  const folderSizeMap = useMemo(
    () => computeRecursiveFolderSizeMap(allEntries),
    [allEntries]
  );

  // Compute breakdown & totals
  const summary = useMemo(() => {
    if (request.kind === 'library') {
      const libVideosMb = request.entries.reduce(
        (sum, entry) =>
          entry.type === 'video' ? sum + getVideoSizeMb(entry) : sum,
        0
      );
      return {
        count: 1,
        videosCount: request.library.videosCount,
        foldersCount: request.library.foldersCount,
        librariesCount: 1,
        totalMb:
          request.entries.length > 0 ? libVideosMb : request.library.sizeBytes,
      };
    }

    let videosCount = 0;
    let foldersCount = 0;
    let totalMb = 0;

    request.items.forEach((item) => {
      if (item.type === 'video') {
        videosCount += 1;
        totalMb += getVideoSizeMb(item);
      } else {
        foldersCount += 1;
        totalMb += folderSizeMap.get(item.id) ?? 0;
      }
    });

    return {
      count: request.items.length,
      videosCount,
      foldersCount,
      librariesCount: 0,
      totalMb,
    };
  }, [folderSizeMap, request]);

  // Count descendant videos for folder previews
  const getFolderVideoCount = (folder: FolderEntry): number => {
    const queue = [folder.id];
    const seen = new Set<string>();
    let count = 0;
    while (queue.length > 0) {
      const fid = queue.shift()!;
      for (const e of allEntries) {
        if (e.parentId === fid && !seen.has(e.id)) {
          seen.add(e.id);
          if (e.type === 'video') count += 1;
          else queue.push(e.id);
        }
      }
    }
    return count;
  };

  const titleText = useMemo(() => {
    if (request.kind === 'library') {
      return '¿Mover biblioteca a la papelera?';
    }
    if (summary.count === 1) {
      const only = request.items[0];
      return only.type === 'folder'
        ? '¿Mover carpeta a la papelera?'
        : '¿Mover vídeo a la papelera?';
    }
    return `¿Mover ${summary.count} elementos a la papelera?`;
  }, [request, summary.count]);

  const subtitleText =
    request.kind === 'library'
      ? `La biblioteca "${request.library.name}" y todo su contenido dejarán de mostrarse en tu inicio. Podrás restaurarla cuando lo necesites.`
      : 'Los archivos dejarán de mostrarse en tus carpetas habituales. Podrás restaurarlos fácilmente cuando lo necesites.';

  const breakdownLabel = useMemo(() => {
    if (request.kind === 'library') {
      return `(1 biblioteca · ${request.library.videosCount} víd.)`;
    }
    const parts: string[] = [];
    if (summary.videosCount > 0) {
      parts.push(
        `${summary.videosCount} ${summary.videosCount === 1 ? 'vídeo' : 'vídeos'}`
      );
    }
    if (summary.foldersCount > 0) {
      parts.push(
        `${summary.foldersCount} ${summary.foldersCount === 1 ? 'carpeta' : 'carpetas'}`
      );
    }
    return parts.length > 0 ? `(${parts.join(' + ')})` : '';
  }, [request, summary]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-[#0e0e0e]/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titleText}
        className="w-full max-w-md bg-[#1c1b1b] rounded-t-3xl sm:rounded-2xl border border-white/[0.08] p-5 shadow-2xl relative flex flex-col gap-4 max-h-[90dvh] overflow-y-auto"
      >
        {/* Drag Handle */}
        <div className="w-full flex justify-center pt-0.5 pb-0.5">
          <div className="w-10 h-1 rounded-full bg-[#353534]" />
        </div>

        {/* Close Button */}
        <button
          type="button"
          aria-label="Cerrar confirmación"
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#201f1f] flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header: Trash Glow Badge + Title + Subtitle */}
        <div className="flex flex-col items-center text-center mt-0.5 px-2">
          <div className="relative mb-3 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-[#ff5261]/15 flex items-center justify-center text-[#ff5261] shadow-lg shadow-[#ff5261]/20">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#ee9800] flex items-center justify-center shadow">
              <ArrowDown className="w-3 h-3 text-[#0e0e0e] stroke-[3]" />
            </div>
          </div>

          <h2 className="text-[21px] font-bold text-[#e5e2e1] leading-snug tracking-tight mb-1.5">
            {titleText}
          </h2>
          <p className="text-sm text-[#c8b6b6] max-w-xs leading-snug">
            {subtitleText}
          </p>
        </div>

        {/* Summary & Selection Item Breakdown Card */}
        <div className="bg-[#201f1f] rounded-xl p-3.5 flex flex-col gap-2.5 border border-white/[0.04]">
          {/* Top Metrics Header */}
          <div className="flex items-center justify-between gap-2 px-0.5 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#ff5261] shrink-0" />
              <span className="text-xs font-semibold text-[#e5e2e1] tabular-nums">
                {summary.count}{' '}
                {summary.count === 1 ? 'seleccionado' : 'seleccionados'}
              </span>
              {breakdownLabel && (
                <span className="text-[11px] text-[#c8b6b6] truncate">
                  {breakdownLabel}
                </span>
              )}
            </div>
            <span className="font-mono text-[11px] font-semibold text-[#ffb95f] bg-[#ee9800]/15 px-2.5 py-0.5 rounded-full tabular-nums shrink-0">
              {formatStorageMb(summary.totalMb)} total
            </span>
          </div>

          {/* Compact Item Preview List */}
          <div className="flex flex-col gap-1.5 pt-0.5 max-h-44 overflow-y-auto">
            {request.kind === 'library' ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#2a2a2a]/70">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#ff5261]/20 border border-[#ff5261]/40 flex items-center justify-center shrink-0 text-[#ff5261]">
                    <Folder className="w-5 h-5 fill-[#ff5261]/30" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-[#e5e2e1] truncate">
                      {request.library.name}
                    </span>
                    <span className="text-[11px] text-[#c8b6b6] flex items-center gap-1 tabular-nums truncate">
                      <span>{request.library.foldersCount} carpetas</span>
                      <span>•</span>
                      <span>{request.library.videosCount} vídeos</span>
                      <span>•</span>
                      <span>{request.library.sizeLabel}</span>
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[10px] font-bold text-[#ffb3b3] bg-[#93000a]/40 px-1.5 py-0.5 rounded shrink-0 ml-2">
                  BIB
                </span>
              </div>
            ) : (
              request.items.map((item) => {
                const libName =
                  libraryNameMap.get(item.libraryId) ?? 'Biblioteca';
                const thumbKey = `${item.id}:${item.coverUrl}`;
                const thumbFailed = failedThumbs[thumbKey] || !item.coverUrl;

                if (item.type === 'video') {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#2a2a2a]/70"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#353534]">
                          {!thumbFailed ? (
                            <img
                              src={item.coverUrl}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedThumbs((prev) => ({
                                  ...prev,
                                  [thumbKey]: true,
                                }))
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <VideoCoverPlaceholder
                              sourceType={item.sourceType}
                              size="xs"
                            />
                          )}
                          <div className="absolute inset-0 bg-[#0e0e0e]/35 flex items-center justify-center pointer-events-none">
                            <Play className="w-3.5 h-3.5 text-white fill-current" />
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-[#e5e2e1] truncate">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-[#c8b6b6] flex items-center gap-1 truncate tabular-nums">
                            <span className="text-[#ffb95f] font-medium truncate">
                              {libName}
                            </span>
                            <span>•</span>
                            <span>{item.sizeLabel}</span>
                          </span>
                        </div>
                      </div>
                      <Film className="w-4 h-4 text-[#c8b6b6] shrink-0 ml-2" />
                    </div>
                  );
                }

                const folderVideos = getFolderVideoCount(item);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#2a2a2a]/70"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#ee9800]/20 flex items-center justify-center shrink-0 text-[#ffb95f]">
                        <Folder className="w-5 h-5 fill-[#ffb95f]/30" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-[#e5e2e1] truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-[#c8b6b6] flex items-center gap-1 tabular-nums">
                          <span>
                            {folderVideos}{' '}
                            {folderVideos === 1 ? 'vídeo' : 'vídeos'}
                          </span>
                          <span>•</span>
                          <span>{item.sizeLabel}</span>
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-semibold text-[#c8b6b6] bg-[#353534] px-1.5 py-0.5 rounded shrink-0 ml-2">
                      DIR
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Informative Reminder Note */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#353534]/40">
          <Info className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
          <p className="text-xs text-[#c8b6b6] leading-relaxed">
            Los elementos permanecerán en la papelera durante{' '}
            <span className="text-[#e5e2e1] font-semibold">30 días</span> antes de
            eliminarse definitivamente de tu almacenamiento en DanceVault.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-0.5 pb-1">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full h-12 rounded-xl bg-[#ff5261] hover:brightness-110 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/25 active:scale-[0.98] transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {summary.count > 1
                ? `Mover a la papelera (${summary.count})`
                : 'Mover a la papelera'}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] text-xs font-semibold flex items-center justify-center active:scale-[0.98] transition-all"
          >
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
