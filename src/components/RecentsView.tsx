import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Instagram,
  LayoutGrid,
  List,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Play,
  Scissors,
  Search,
  Square,
  Star,
  Tag,
  Trash2,
  X,
  Youtube,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
  VideoEntry,
  VideoMetadataUpdates,
  ViewMode,
} from '../types/dancevault';
import { formatStorageMb, getVideoSizeMb } from '../utils/storageSize';
import { useBackHandler } from '../utils/backNavigation';
import { RenameEntryModal } from './RenameEntryModal';
import { VideoCoverPickerModal } from './VideoCoverPickerModal';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';
import { VideoDetailsModal } from './VideoDetailsModal';

type RecentSortMode = 'newest' | 'oldest' | 'natural';

interface RecentsViewProps {
  libraries: LibraryItem[];
  allEntries: ExplorerEntry[];
  recentDays: number;
  onChangeRecentDays: (days: number) => void;
  onOpenFolder: (libraryId: string, folderId: string | null) => void;
  onGoToLibraries: () => void;
  onToggleFavoriteWithUndo: (entryId: string) => void;
  onToggleFavoritesBatch?: (ids: string[]) => void;
  onRenameEntry: (entryId: string, newName: string) => boolean;
  onChangeCover: (entryId: string, coverUrl: string) => void;
  onDuplicateVideo: (videoId: string) => void;
  onDeleteEntries: (ids: string[]) => void;
  onCopyToClipboard: (ids: string[], mode: 'copy' | 'cut') => void;
  cutEntryIds?: string[];
  onPlayVideo: (video: VideoEntry, queueIds?: string[]) => void;
  onUpdateVideoMetadata: (
    videoId: string,
    updates: VideoMetadataUpdates
  ) => void;
  onShowToast: (msg: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

const parseDurationSeconds = (dur: string): number => {
  const parts = dur.split(':').map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

const formatTotalDuration = (totalSec: number): string => {
  if (totalSec <= 0) return '0:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

const formatImportRelative = (importedAt: number, now: number): string => {
  const diffMs = Math.max(0, now - importedAt);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Recién importado';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) {
    const d = new Date(importedAt);
    const sameDay = new Date(now).toDateString() === d.toDateString();
    if (sameDay) {
      return `Hoy ${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`;
    }
    return `Hace ${diffHours} h`;
  }
  const diffDays = Math.floor(diffMs / DAY_MS);
  if (diffDays === 1) return 'Ayer';
  return `Hace ${diffDays} días`;
};

const formatRemainingBadge = (
  importedAt: number,
  recentDays: number,
  now: number
): string => {
  const expiresAt = importedAt + recentDays * DAY_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingHours = Math.ceil(remainingMs / 3600000);
  if (remainingHours <= 24) {
    return remainingHours <= 1 ? '< 1 h' : `${remainingHours} h rest.`;
  }
  const remainingDays = Math.ceil(remainingMs / DAY_MS);
  return `${remainingDays} d rest.`;
};

export const RecentsView: React.FC<RecentsViewProps> = ({
  libraries,
  allEntries,
  recentDays,
  onChangeRecentDays,
  onOpenFolder,
  onGoToLibraries,
  onToggleFavoriteWithUndo,
  onToggleFavoritesBatch,
  onRenameEntry,
  onChangeCover,
  onDuplicateVideo,
  onDeleteEntries,
  onCopyToClipboard,
  cutEntryIds = [],
  onPlayVideo,
  onUpdateVideoMetadata,
  onShowToast,
}) => {
  const [libraryFilter, setLibraryFilter] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<RecentSortMode>('newest');
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const cutIdsSet = useMemo(() => new Set(cutEntryIds), [cutEntryIds]);

  // Multi-select
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMoreOpen, setBatchMoreOpen] = useState(false);

  // Long-press refs
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Context menu & sub-modals
  const [contextVideo, setContextVideo] = useState<VideoEntry | null>(null);
  const [detailsVideoId, setDetailsVideoId] = useState<string | null>(null);
  const [coverPickerTarget, setCoverPickerTarget] = useState<VideoEntry | null>(
    null
  );
  const [renameTarget, setRenameTarget] = useState<VideoEntry | null>(null);

  useBackHandler(
    multiSelectMode,
    () => {
      setBatchMoreOpen(false);
      setMultiSelectMode(false);
      setSelectedIds([]);
    },
    30
  );
  useBackHandler(Boolean(contextVideo), () => setContextVideo(null), 35);
  useBackHandler(Boolean(detailsVideoId), () => setDetailsVideoId(null), 40);
  useBackHandler(
    Boolean(coverPickerTarget),
    () => setCoverPickerTarget(null),
    50
  );
  useBackHandler(Boolean(renameTarget), () => setRenameTarget(null), 50);

  const now = Date.now();
  const cutoffMs = now - recentDays * DAY_MS;
  const maxSevenDayCutoffMs = now - 7 * DAY_MS;

  const libraryMap = useMemo(
    () => new Map(libraries.map((l) => [l.id, l])),
    [libraries]
  );

  const allRecentVideos = useMemo(
    () =>
      allEntries
        .filter(
          (e): e is VideoEntry =>
            e.type === 'video' &&
            typeof e.importedAt === 'number' &&
            e.importedAt >= cutoffMs
        )
        .sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0)),
    [allEntries, cutoffMs]
  );

  const upToSevenDaysCount = useMemo(
    () =>
      allEntries.filter(
        (e): e is VideoEntry =>
          e.type === 'video' &&
          typeof e.importedAt === 'number' &&
          e.importedAt >= maxSevenDayCutoffMs
      ).length,
    [allEntries, maxSevenDayCutoffMs]
  );

  const scopedRecentVideos = useMemo(() => {
    if (libraryFilter === 'all') return allRecentVideos;
    return allRecentVideos.filter((v) => v.libraryId === libraryFilter);
  }, [allRecentVideos, libraryFilter]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    scopedRecentVideos.forEach((v) => {
      v.tags.forEach((t) => set.add(t));
    });
    return Array.from(set).sort(naturalCompare);
  }, [scopedRecentVideos]);

  const visibleRecents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = scopedRecentVideos.filter((video) => {
      if (selectedTag && !video.tags.includes(selectedTag)) return false;
      if (!q) return true;
      const libName = libraryMap.get(video.libraryId)?.name.toLowerCase() ?? '';
      return (
        video.name.toLowerCase().includes(q) ||
        video.originalFileName.toLowerCase().includes(q) ||
        libName.includes(q) ||
        video.tags.some((t) => t.toLowerCase().includes(q)) ||
        (video.note ?? '').toLowerCase().includes(q)
      );
    });

    const sorted = [...list];
    if (sortMode === 'newest') {
      sorted.sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0));
    } else if (sortMode === 'oldest') {
      sorted.sort((a, b) => (a.importedAt ?? 0) - (b.importedAt ?? 0));
    } else {
      sorted.sort((a, b) => naturalCompare(a.name, b.name));
    }
    return sorted;
  }, [libraryMap, scopedRecentVideos, searchQuery, selectedTag, sortMode]);

  const summary = useMemo(() => {
    const totalSec = scopedRecentVideos.reduce(
      (acc, v) => acc + parseDurationSeconds(v.duration),
      0
    );
    const totalSizeMb = scopedRecentVideos.reduce(
      (acc, v) => acc + getVideoSizeMb(v),
      0
    );
    return {
      count: scopedRecentVideos.length,
      totalDurationLabel: formatTotalDuration(totalSec),
      totalSizeLabel: formatStorageMb(totalSizeMb),
    };
  }, [scopedRecentVideos]);

  const getPathLabel = (entry: ExplorerEntry): string => {
    const libName = libraryMap.get(entry.libraryId)?.name ?? 'Biblioteca';
    const chain: string[] = [];
    let cursorId = entry.parentId;
    while (cursorId) {
      const parent = allEntries.find(
        (e): e is FolderEntry => e.id === cursorId && e.type === 'folder'
      );
      if (!parent) break;
      chain.unshift(parent.name);
      cursorId = parent.parentId;
    }
    return chain.length > 0 ? `${libName} › ${chain.join(' › ')}` : libName;
  };

  const detailsVideo = useMemo(
    () =>
      detailsVideoId
        ? (allEntries.find(
            (e): e is VideoEntry => e.id === detailsVideoId && e.type === 'video'
          ) ?? null)
        : null,
    [allEntries, detailsVideoId]
  );

  const cycleSortMode = () => {
    const order: RecentSortMode[] = ['newest', 'oldest', 'natural'];
    setSortMode(order[(order.indexOf(sortMode) + 1) % order.length]);
  };

  const sortLabel =
    sortMode === 'newest'
      ? 'Más recientes'
      : sortMode === 'oldest'
        ? 'Más antiguos'
        : 'A-Z';

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedIds([]);
    setBatchMoreOpen(false);
  };

  const selectedVideos = useMemo(
    () =>
      selectedIds
        .map((id) => allRecentVideos.find((v) => v.id === id))
        .filter((v): v is VideoEntry => Boolean(v)),
    [allRecentVideos, selectedIds]
  );

  const selectedSizeLabel = useMemo(() => {
    const totalMb = selectedVideos.reduce((acc, v) => acc + getVideoSizeMb(v), 0);
    return formatStorageMb(totalMb);
  }, [selectedVideos]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    entryId: string
  ) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (multiSelectMode) return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMultiSelectMode(true);
      setSelectedIds((prev) => (prev.includes(entryId) ? prev : [...prev, entryId]));
      longPressTimerRef.current = null;
    }, 420);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || longPressTimerRef.current === null) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > 8 || dy > 8) {
      clearLongPressTimer();
    }
  };

  const handleCardTap = (video: VideoEntry) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (multiSelectMode) {
      toggleSelectId(video.id);
      return;
    }
    onPlayVideo(video);
  };

  return (
    <div className={`space-y-4 ${multiSelectMode ? 'pb-32' : 'pb-6'}`}>
      {/* Header Summary & Retention Window Controls */}
      <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[#4cd7f6] font-mono text-[11px] font-semibold uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>Importaciones Recientes</span>
            </div>
            <h2 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight mt-0.5">
              Recientes
            </h2>
            <p className="text-xs text-[#c8b6b6] mt-0.5 tabular-nums">
              {summary.count} {summary.count === 1 ? 'vídeo' : 'vídeos'} ·{' '}
              {summary.totalDurationLabel} · {summary.totalSizeLabel}
            </p>
          </div>
        </div>

        {/* Retention Window Picker: 1 to 7 days (default 3) */}
        <div className="rounded-xl bg-[#201f1f] p-2.5 border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[#e5e2e1]">
              Permanencia en Recientes
            </span>
            <span className="font-mono text-[11px] font-bold text-[#4cd7f6] tabular-nums">
              Últimos {recentDays} {recentDays === 1 ? 'día' : 'días'}
              {recentDays === 3 ? ' (por defecto)' : ''}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DAY_OPTIONS.map((days) => {
              const active = recentDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => onChangeRecentDays(days)}
                  aria-label={`Mostrar vídeos de los últimos ${days} ${
                    days === 1 ? 'día' : 'días'
                  }`}
                  className={`h-8 rounded-lg font-mono text-xs font-bold transition-all active:scale-95 ${
                    active
                      ? 'bg-[#4cd7f6] text-[#003640] shadow-[0_0_10px_rgba(76,215,246,0.28)]'
                      : 'bg-[#171616] text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#2a2a2a]'
                  }`}
                >
                  {days}d
                </button>
              );
            })}
          </div>
        </div>

        {/* Library Scope Pills */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setLibraryFilter('all');
              setSelectedTag(null);
            }}
            className={`px-2.5 h-[26px] rounded-full text-[11px] font-semibold transition-colors ${
              libraryFilter === 'all'
                ? 'bg-[#e5e2e1] text-[#131313]'
                : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            Todas ({allRecentVideos.length})
          </button>
          {libraries.map((lib) => {
            const count = allRecentVideos.filter(
              (v) => v.libraryId === lib.id
            ).length;
            const active = libraryFilter === lib.id;
            return (
              <button
                key={lib.id}
                type="button"
                onClick={() => {
                  setLibraryFilter(lib.id);
                  setSelectedTag(null);
                }}
                className={`px-2.5 h-[26px] rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors max-w-[155px] ${
                  active
                    ? 'bg-[#ff5261] text-[#400009]'
                    : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <span className="truncate">{lib.name}</span>
                <span className="font-mono text-[10px] opacity-80 tabular-nums shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Search & Toolbar */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-[#c8b6b6] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar recientes por nombre, archivo, etiqueta o nota..."
            className="w-full h-11 pl-10 pr-9 rounded-xl bg-[#201f1f] text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/60 border border-white/[0.06] focus:outline-none focus:border-[#4cd7f6]"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearchQuery('')}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] absolute right-1.5 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sort + View Mode + Multi-select */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-[#c8b6b6] font-mono tabular-nums">
            {visibleRecents.length}{' '}
            {visibleRecents.length === 1 ? 'resultado' : 'resultados'}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleSortMode}
              className="h-9 px-3 rounded-xl bg-[#201f1f] border border-white/[0.06] text-xs font-medium text-[#e5e2e1] flex items-center gap-1.5 hover:bg-[#2a2a2a]"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#4cd7f6]" />
              <span>{sortLabel}</span>
            </button>

            <button
              type="button"
              disabled={visibleRecents.length === 0 && !multiSelectMode}
              onClick={() => {
                if (multiSelectMode) {
                  exitMultiSelect();
                } else {
                  setMultiSelectMode(true);
                }
              }}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs active:scale-95 transition-all disabled:opacity-40 ${
                multiSelectMode
                  ? 'bg-[#1c1b1b] border-2 border-[#ff3e55] text-[#ff3e55] font-semibold shadow-[0_0_10px_rgba(255,62,85,0.25)]'
                  : 'bg-[#201f1f] border border-white/[0.06] text-[#e5e2e1] font-medium hover:bg-[#2a2a2a]'
              }`}
            >
              <CheckSquare
                className={`w-3.5 h-3.5 ${
                  multiSelectMode ? 'text-[#ff3e55]' : 'text-[#ffb3b3]'
                }`}
              />
              <span>Seleccionar</span>
            </button>

            <div className="flex items-center bg-[#201f1f] p-1 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                aria-label="Vista lista"
                onClick={() => setViewMode('list')}
                className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[#353534] text-[#ffb3b3]'
                    : 'text-[#c8b6b6]'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Vista cuadrado"
                onClick={() => setViewMode('square')}
                className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  viewMode === 'square'
                    ? 'bg-[#353534] text-[#ffb3b3]'
                    : 'text-[#c8b6b6]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tag Filter Chips */}
        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#c8b6b6] shrink-0 mr-0.5">
              <Tag className="w-2.5 h-2.5 text-[#4cd7f6]" />
            </span>
            {availableTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(active ? null : tag)}
                  className={`px-2 py-0.5 rounded-full text-[10px] leading-tight font-medium max-w-full break-words transition-colors ${
                    active
                      ? 'bg-[#4cd7f6] text-[#003640] font-bold'
                      : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty State or Recents List / Grid */}
      {visibleRecents.length === 0 ? (
        <div className="py-12 px-4 rounded-2xl bg-[#1c1b1b] border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#201f1f] text-[#4cd7f6] flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#e5e2e1]">
              {allRecentVideos.length === 0
                ? `Sin importaciones en los últimos ${recentDays} ${
                    recentDays === 1 ? 'día' : 'días'
                  }`
                : 'Ningún vídeo reciente coincide con el filtro'}
            </p>
            <p className="text-xs text-[#c8b6b6] max-w-xs mx-auto">
              {allRecentVideos.length === 0
                ? `Los vídeos que importes aparecerán aquí ordenados del más reciente al más antiguo durante ${recentDays} ${
                    recentDays === 1 ? 'día' : 'días'
                  } (ajustable hasta 7 días).`
                : 'Prueba cambiando la biblioteca, etiqueta o texto de búsqueda.'}
            </p>
          </div>

          {allRecentVideos.length === 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {recentDays < 7 && upToSevenDaysCount > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeRecentDays(7)}
                  className="h-10 px-4 rounded-xl bg-[#4cd7f6] text-[#003640] text-xs font-bold active:scale-95 transition-transform"
                >
                  Ampliar a 7 días ({upToSevenDaysCount})
                </button>
              )}
              <button
                type="button"
                onClick={onGoToLibraries}
                className="h-10 px-4 rounded-xl bg-[#ff5261] text-[#400009] text-xs font-bold active:scale-95 transition-transform"
              >
                Ir a bibliotecas
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setLibraryFilter('all');
                setSelectedTag(null);
                setSearchQuery('');
              }}
              className="h-9 px-4 rounded-xl bg-[#2a2a2a] text-xs font-semibold text-[#e5e2e1]"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2">
          {visibleRecents.map((video) => {
            const isSelected = selectedIds.includes(video.id);
            const isCut = cutIdsSet.has(video.id);
            const thumbKey = `${video.id}:${video.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !video.coverUrl;
            const pathLabel = getPathLabel(video);
            const importedAt = video.importedAt ?? now;
            const relLabel = formatImportRelative(importedAt, now);
            const remLabel = formatRemainingBadge(importedAt, recentDays, now);

            return (
              <div
                key={video.id}
                onPointerDown={(e) => handleCardPointerDown(e, video.id)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!multiSelectMode) {
                    setMultiSelectMode(true);
                    setSelectedIds((prev) =>
                      prev.includes(video.id) ? prev : [...prev, video.id]
                    );
                  }
                }}
                onClick={() => handleCardTap(video)}
                className={`group flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none active:scale-[0.99] ${
                  isSelected
                    ? 'bg-[#201f1f] border-2 border-[#ff3e55] shadow-[0_0_12px_rgba(255,62,85,0.2)]'
                    : isCut
                      ? 'bg-[#201f1f]/80 border border-dashed border-white/25 hover:bg-[#2a2a2a]'
                      : 'bg-[#201f1f] border border-white/[0.06] hover:bg-[#2a2a2a]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {multiSelectMode && (
                    <div className="flex items-center justify-center pl-1 shrink-0">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-[#ff3e55] text-[#131313] flex items-center justify-center shadow-[0_0_8px_rgba(255,62,85,0.8)]">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-[#c8b6b6]/70" />
                      )}
                    </div>
                  )}

                  <div
                    className={`relative w-[80px] h-[56px] shrink-0 rounded-lg overflow-hidden bg-[#353534] transition-all ${
                      isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                    }`}
                  >
                    {!thumbFailed ? (
                      <img
                        src={video.coverUrl}
                        alt={video.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedThumbs((prev) => ({
                            ...prev,
                            [thumbKey]: true,
                          }))
                        }
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <VideoCoverPlaceholder
                        sourceType={video.sourceType}
                        size="sm"
                      />
                    )}
                    <div className="absolute top-1 left-1 bg-[#ff5261] text-[#400009] font-mono text-[9px] font-bold px-1 rounded">
                      {video.sourceType === 'instagram'
                        ? 'IG'
                        : video.sourceType === 'youtube'
                          ? 'YT'
                          : 'HD'}
                    </div>
                    <div className="absolute bottom-1 right-1 bg-[#131313]/85 backdrop-blur-sm px-1 rounded font-mono text-[10px] text-[#e5e2e1] tabular-nums">
                      {video.duration}
                    </div>
                    {isCut && (
                      <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isCut && (
                        <Scissors className="w-3.5 h-3.5 text-[#e5e2e1]/75 shrink-0" />
                      )}
                      <h4
                        className={`text-[15px] font-semibold leading-tight truncate ${
                          isCut ? 'text-[#e5e2e1]/65' : 'text-[#e5e2e1]'
                        }`}
                      >
                        {video.name}
                      </h4>
                    </div>
                    <p
                      className={`text-[10px] leading-snug break-words line-clamp-2 mt-0.5 ${
                        isCut ? 'text-[#c8b6b6]/55' : 'text-[#c8b6b6]'
                      }`}
                    >
                      {pathLabel}
                    </p>
                    <div
                      className={`flex items-center gap-1.5 font-mono text-[10px] mt-0.5 tabular-nums flex-wrap ${
                        isCut ? 'text-[#c8b6b6]/50' : 'text-[#c8b6b6]/80'
                      }`}
                    >
                      {video.sourceType === 'instagram' && (
                        <Instagram
                          className={`w-3 h-3 shrink-0 ${
                            isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb3b3]'
                          }`}
                        />
                      )}
                      {video.sourceType === 'youtube' && (
                        <Youtube
                          className={`w-3 h-3 shrink-0 ${
                            isCut ? 'text-[#e5e2e1]/55' : 'text-[#ff5261]'
                          }`}
                        />
                      )}
                      <span
                        className={`font-semibold ${
                          isCut ? 'text-[#e5e2e1]/60' : 'text-[#4cd7f6]'
                        }`}
                      >
                        {relLabel}
                      </span>
                      <span>· {remLabel}</span>
                      <span>· {video.sizeLabel}</span>
                      {video.tags.length > 0 && (
                        <span className="truncate">
                          · {video.tags.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!multiSelectMode && (
                  <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    <button
                      type="button"
                      aria-label={
                        video.favorite
                          ? 'Quitar de favoritos'
                          : 'Añadir a favoritos'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteWithUndo(video.id);
                      }}
                      className={`min-w-[38px] min-h-[38px] flex items-center justify-center active:scale-90 transition-transform ${
                        video.favorite
                          ? 'text-[#ffb95f]'
                          : 'text-[#c8b6b6]/70 hover:text-[#ffb95f]'
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${video.favorite ? 'fill-current' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={`Opciones de ${video.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextVideo(video);
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] active:scale-90 transition-transform"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleRecents.map((video) => {
            const isSelected = selectedIds.includes(video.id);
            const isCut = cutIdsSet.has(video.id);
            const thumbKey = `${video.id}:${video.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !video.coverUrl;
            const libName =
              libraryMap.get(video.libraryId)?.name ?? 'Biblioteca';
            const importedAt = video.importedAt ?? now;
            const relLabel = formatImportRelative(importedAt, now);

            return (
              <div
                key={video.id}
                onPointerDown={(e) => handleCardPointerDown(e, video.id)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!multiSelectMode) {
                    setMultiSelectMode(true);
                    setSelectedIds((prev) =>
                      prev.includes(video.id) ? prev : [...prev, video.id]
                    );
                  }
                }}
                onClick={() => handleCardTap(video)}
                className={`group flex flex-col rounded-xl overflow-hidden transition-all cursor-pointer select-none active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#201f1f] border-2 border-[#ff3e55] shadow-[0_0_12px_rgba(255,62,85,0.2)]'
                    : isCut
                      ? 'bg-[#201f1f]/80 border border-dashed border-white/25 hover:bg-[#2a2a2a]'
                      : 'bg-[#201f1f] border border-white/[0.06] hover:bg-[#2a2a2a]'
                }`}
              >
                <div className="relative w-full aspect-[4/3] bg-[#353534] overflow-hidden">
                  <div
                    className={`w-full h-full transition-all ${
                      isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                    }`}
                  >
                    {!thumbFailed ? (
                      <img
                        src={video.coverUrl}
                        alt={video.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedThumbs((prev) => ({
                            ...prev,
                            [thumbKey]: true,
                          }))
                        }
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <VideoCoverPlaceholder
                        sourceType={video.sourceType}
                        size="md"
                      />
                    )}
                  </div>

                  {isCut && (
                    <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                  )}

                  {multiSelectMode ? (
                    <div className="absolute top-2 left-2 z-10">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-[#ff3e55] text-[#131313] flex items-center justify-center shadow-[0_0_8px_rgba(255,62,85,0.8)]">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#131313]/75 border border-white/40" />
                      )}
                    </div>
                  ) : (
                    <div
                      className={`absolute top-2 left-2 bg-[#131313]/80 backdrop-blur-md px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold tabular-nums ${
                        isCut ? 'text-[#e5e2e1]/70' : 'text-[#4cd7f6]'
                      }`}
                    >
                      {relLabel}
                    </div>
                  )}

                  <div
                    className={`absolute bottom-2 left-2 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow ${
                      isCut
                        ? 'bg-[#d4d4d4]/80 text-[#201f1f]'
                        : 'bg-[#ff5261] text-[#400009]'
                    }`}
                  >
                    {video.sourceType === 'instagram' ? (
                      <>
                        <Instagram className="w-2.5 h-2.5" />
                        <span>IG</span>
                      </>
                    ) : video.sourceType === 'youtube' ? (
                      <>
                        <Youtube className="w-2.5 h-2.5" />
                        <span>YT</span>
                      </>
                    ) : (
                      <span>HD</span>
                    )}
                  </div>

                  <div
                    className={`absolute bottom-2 right-2 bg-[#131313]/85 backdrop-blur-md px-1.5 py-0.5 rounded font-mono text-[10px] tabular-nums ${
                      isCut ? 'text-[#e5e2e1]/75' : 'text-[#e5e2e1]'
                    }`}
                  >
                    {video.duration}
                  </div>

                  {!multiSelectMode && (
                    <button
                      type="button"
                      aria-label={
                        video.favorite
                          ? 'Quitar de favoritos'
                          : 'Añadir a favoritos'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteWithUndo(video.id);
                      }}
                      className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-[#131313]/70 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform ${
                        video.favorite
                          ? isCut
                            ? 'text-[#e5e2e1]/60'
                            : 'text-[#ffb95f]'
                          : 'text-[#e5e2e1]/75'
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${video.favorite ? 'fill-current' : ''}`}
                      />
                    </button>
                  )}
                </div>

                <div className="p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isCut && (
                          <Scissors className="w-3.5 h-3.5 text-[#e5e2e1]/75 shrink-0" />
                        )}
                        <h4
                          className={`text-sm font-semibold truncate ${
                            isCut ? 'text-[#e5e2e1]/65' : 'text-[#e5e2e1]'
                          }`}
                        >
                          {video.name}
                        </h4>
                      </div>
                      <p
                        className={`text-[11px] truncate mt-0.5 ${
                          isCut ? 'text-[#c8b6b6]/55' : 'text-[#c8b6b6]'
                        }`}
                      >
                        {libName}
                      </p>
                      <p
                        className={`text-[11px] font-mono truncate mt-0.5 tabular-nums flex items-center gap-1 ${
                          isCut ? 'text-[#c8b6b6]/50' : 'text-[#c8b6b6]/80'
                        }`}
                      >
                        {video.sourceType === 'instagram' ? (
                          <Instagram
                            className={`w-3 h-3 shrink-0 ${
                              isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb3b3]'
                            }`}
                          />
                        ) : video.sourceType === 'youtube' ? (
                          <Youtube
                            className={`w-3 h-3 shrink-0 ${
                              isCut ? 'text-[#e5e2e1]/55' : 'text-[#ff5261]'
                            }`}
                          />
                        ) : (
                          <Film
                            className={`w-3 h-3 shrink-0 ${
                              isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb3b3]'
                            }`}
                          />
                        )}
                        <span className="truncate">
                          {video.sizeLabel} ·{' '}
                          {formatRemainingBadge(importedAt, recentDays, now)}
                        </span>
                      </p>
                    </div>
                    {!multiSelectMode && (
                      <button
                        type="button"
                        aria-label={`Opciones de ${video.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextVideo(video);
                        }}
                        className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {video.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {video.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2a2a2a] border border-white/[0.06] text-[10px] font-medium text-[#e5e2e1] max-w-[96px] truncate"
                        >
                          <Tag className="w-2.5 h-2.5 text-[#ffb3b3] shrink-0" />
                          <span className="truncate">{tag}</span>
                        </span>
                      ))}
                      {video.tags.length > 2 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#2a2a2a] border border-white/[0.06] font-mono text-[10px] font-semibold text-[#c8b6b6] tabular-nums">
                          +{video.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Multi-Select Action Dock */}
      {multiSelectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-[45] bg-[#1c1b1b] border-t border-white/15 shadow-[0_-12px_32px_rgba(0,0,0,0.8)] px-3 pt-2 pb-safe">
          <div className="max-w-5xl mx-auto relative bg-[#2a2a2a] border border-white/10 rounded-2xl p-2.5 mb-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1 pb-1.5 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#ff3e55] shadow-[0_0_8px_rgba(255,62,85,0.8)] shrink-0" />
                <span className="text-xs font-semibold text-[#e5e2e1] truncate font-mono tabular-nums">
                  {selectedIds.length}{' '}
                  {selectedIds.length === 1 ? 'seleccionado' : 'seleccionados'}
                  {selectedIds.length > 0 && (
                    <span className="text-[#c8b6b6] font-normal">
                      {' '}
                      • {selectedSizeLabel}
                    </span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={exitMultiSelect}
                className="text-xs font-medium text-[#c8b6b6] hover:text-[#e5e2e1] active:scale-95 transition-all shrink-0"
              >
                Deseleccionar
              </button>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  onCopyToClipboard(selectedIds, 'cut');
                  onShowToast(
                    `${selectedIds.length} elemento(s) cortado(s): ve al destino y pulsa Pegar`
                  );
                  exitMultiSelect();
                }}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[#e5e2e1] hover:text-[#ffb95f] disabled:opacity-40 transition-all active:scale-95"
              >
                <Scissors className="w-5 h-5" />
                <span className="text-[11px]">Cortar</span>
              </button>

              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  onCopyToClipboard(selectedIds, 'copy');
                  exitMultiSelect();
                }}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[#e5e2e1] hover:text-[#ffb3b3] disabled:opacity-40 transition-all active:scale-95"
              >
                <Copy className="w-5 h-5" />
                <span className="text-[11px]">Copiar</span>
              </button>

              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  if (onToggleFavoritesBatch) {
                    onToggleFavoritesBatch(selectedIds);
                  } else {
                    selectedIds.forEach((id) => onToggleFavoriteWithUndo(id));
                  }
                  exitMultiSelect();
                }}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[#e5e2e1] hover:text-[#ffb95f] disabled:opacity-40 transition-all active:scale-95"
              >
                <Star className="w-5 h-5" />
                <span className="text-[11px]">Favorito</span>
              </button>

              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  onDeleteEntries(selectedIds);
                  exitMultiSelect();
                }}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[#ff3e55] hover:opacity-80 disabled:opacity-40 transition-all active:scale-95"
              >
                <Trash2 className="w-5 h-5" />
                <span className="text-[11px] font-semibold">Eliminar</span>
              </button>

              <button
                type="button"
                onClick={() => setBatchMoreOpen((prev) => !prev)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[#e5e2e1] hover:text-[#ffb3b3] transition-all active:scale-95"
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[11px]">Más</span>
              </button>
            </div>

            {batchMoreOpen && (
              <div className="absolute right-2 bottom-full mb-2 w-56 bg-[#201f1f] border border-white/10 rounded-xl shadow-2xl p-1.5 space-y-1">
                {selectedIds.length >= 2 &&
                  selectedIds.length <= 5 &&
                  selectedVideos.length === selectedIds.length && (
                  <button
                    type="button"
                    onClick={() => {
                      onPlayVideo(
                        selectedVideos[0],
                        selectedVideos.map((v) => v.id)
                      );
                      exitMultiSelect();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#ff5261] hover:bg-[#2a2a2a]"
                  >
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span>Reproducir conjunto ({selectedVideos.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(visibleRecents.map((v) => v.id));
                    setBatchMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#e5e2e1] hover:bg-[#2a2a2a]"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  <span>Seleccionar todo ({visibleRecents.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu Bottom Sheet */}
      {contextVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setContextVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#2a2a2a] rounded-t-2xl sm:rounded-2xl p-4 space-y-1.5 shadow-2xl"
          >
            <div className="w-10 h-1 bg-[#353534] rounded-full mx-auto mb-2 sm:hidden" />

            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              <div className="w-10 h-10 rounded-lg bg-[#201f1f] flex items-center justify-center text-[#ffb3b3] shrink-0 overflow-hidden">
                {contextVideo.sourceType === 'instagram' ? (
                  <Instagram className="w-5 h-5 text-[#ffb3b3]" />
                ) : contextVideo.sourceType === 'youtube' ? (
                  <Youtube className="w-5 h-5 text-[#ff5261]" />
                ) : (
                  <Film className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#e5e2e1] truncate">
                  {contextVideo.name}
                </p>
                <p className="text-xs text-[#c8b6b6] truncate">
                  {getPathLabel(contextVideo)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const item = contextVideo;
                setContextVideo(null);
                onPlayVideo(item);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <Play className="w-4 h-4 text-[#ff5261]" />
              <span>Reproducir vídeo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const item = contextVideo;
                setContextVideo(null);
                onOpenFolder(item.libraryId, item.parentId);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <FolderOpen className="w-4 h-4 text-[#ffb95f]" />
              <span>Ir a su carpeta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const item = contextVideo;
                setContextVideo(null);
                setDetailsVideoId(item.id);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <Info className="w-4 h-4 text-[#c8b6b6]" />
              <span>Detalles</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRenameTarget(contextVideo);
                setContextVideo(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <Pencil className="w-4 h-4 text-[#ffb95f]" />
              <span>Renombrar</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onCopyToClipboard([contextVideo.id], 'copy');
                  setContextVideo(null);
                }}
                className="flex items-center gap-2.5 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <Copy className="w-4 h-4 text-[#c8b6b6]" />
                <span>Copiar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onCopyToClipboard([contextVideo.id], 'cut');
                  setContextVideo(null);
                }}
                className="flex items-center gap-2.5 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <Scissors className="w-4 h-4 text-[#ffb95f]" />
                <span>Cortar</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCoverPickerTarget(contextVideo);
                setContextVideo(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <ImageIcon className="w-4 h-4 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDuplicateVideo(contextVideo.id);
                setContextVideo(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <Copy className="w-4 h-4 text-[#4cd7f6]" />
              <span>Duplicar instancia (BIS)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleFavoriteWithUndo(contextVideo.id);
                setContextVideo(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#ffb95f] hover:bg-[#393939]"
            >
              <Star className="w-4 h-4" />
              <span>
                {contextVideo.favorite
                  ? 'Quitar de favoritos'
                  : 'Añadir a favoritos'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const id = contextVideo.id;
                setContextVideo(null);
                onDeleteEntries([id]);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#ffb4ab] hover:bg-[#393939]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Mover a papelera</span>
            </button>

            <button
              type="button"
              onClick={() => setContextVideo(null)}
              className="w-full h-11 rounded-xl bg-[#201f1f] text-sm font-semibold text-[#e5e2e1] mt-1"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Video Details Modal */}
      {detailsVideo && libraryMap.get(detailsVideo.libraryId) && (
        <VideoDetailsModal
          video={detailsVideo}
          library={libraryMap.get(detailsVideo.libraryId)!}
          allEntries={allEntries}
          onClose={() => setDetailsVideoId(null)}
          onPlay={(video) => onPlayVideo(video)}
          onToggleFavorite={(id) => onToggleFavoriteWithUndo(id)}
          onRename={(video) => setRenameTarget(video)}
          onChangeCover={(video) => setCoverPickerTarget(video)}
          onMove={(video) => {
            onCopyToClipboard([video.id], 'cut');
            onShowToast(
              `"${video.name}" cortado: ve al destino y pulsa Pegar`
            );
          }}
          onDuplicate={(videoId) => onDuplicateVideo(videoId)}
          onDelete={(videoId) => {
            onDeleteEntries([videoId]);
            setDetailsVideoId(null);
          }}
          onUpdateMetadata={(videoId, updates) =>
            onUpdateVideoMetadata(videoId, updates)
          }
        />
      )}

      {/* Video Cover Picker */}
      {coverPickerTarget && (
        <VideoCoverPickerModal
          video={coverPickerTarget}
          folderPathLabel={getPathLabel(coverPickerTarget)}
          onClose={() => setCoverPickerTarget(null)}
          onSaveCover={(targetScope, coverUrl, timecodeLabel) => {
            if (targetScope === 'folder' && coverPickerTarget.parentId) {
              onChangeCover(coverPickerTarget.parentId, coverUrl);
              onShowToast(
                `Portada de carpeta actualizada con el fotograma ${timecodeLabel}`
              );
            } else {
              onChangeCover(coverPickerTarget.id, coverUrl);
              onShowToast(
                `Portada de "${coverPickerTarget.name}" guardada (${timecodeLabel})`
              );
            }
          }}
        />
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <RenameEntryModal
          key={renameTarget.id}
          target={renameTarget}
          allEntries={allEntries}
          onClose={() => setRenameTarget(null)}
          onConfirmRename={onRenameEntry}
        />
      )}
    </div>
  );
};
