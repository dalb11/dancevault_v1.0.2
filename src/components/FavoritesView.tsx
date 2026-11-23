import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  CheckSquare,
  Copy,
  Film,
  Folder,
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
  FolderMetadataUpdates,
  LibraryItem,
  VideoEntry,
  ViewMode,
} from '../types/dancevault';
import { getEntryCreatedAt } from '../utils/dateUtils';
import { DefaultIconCover } from './DefaultIconCover';
import { FolderCoverPickerModal } from './FolderCoverPickerModal';
import { FolderDetailsModal } from './FolderDetailsModal';
import { RenameEntryModal } from './RenameEntryModal';
import { VideoCoverPickerModal } from './VideoCoverPickerModal';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';
import { VideoDetailsModal } from './VideoDetailsModal';
import { formatStorageMb, getVideoSizeMb, parseSizeMb } from '../utils/storageSize';
import { useBackHandler } from '../utils/backNavigation';

type FavTypeFilter = 'all' | 'videos' | 'folders';
type FavSortMode =
  | 'folders-first'
  | 'natural'
  | 'recent-desc'
  | 'recent-asc'
  | 'library';

interface FavoritesViewProps {
  libraries: LibraryItem[];
  activeLibrary?: LibraryItem;
  allEntries: ExplorerEntry[];
  initialLibraryScope?: 'all' | 'active';
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
  onUpdateFolderMetadata?: (
    folderId: string,
    updates: FolderMetadataUpdates
  ) => void;
  onUpdateVideoMetadata: (
    videoId: string,
    updates: import('../types/dancevault').VideoMetadataUpdates
  ) => void;
  onShowToast: (msg: string) => void;
}

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

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  libraries,
  activeLibrary,
  allEntries,
  initialLibraryScope = 'all',
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
  onUpdateFolderMetadata,
  onUpdateVideoMetadata,
  onShowToast,
}) => {
  const [libraryFilter, setLibraryFilter] = useState<string>(
    initialLibraryScope === 'active' && activeLibrary ? activeLibrary.id : 'all'
  );
  const [typeFilter, setTypeFilter] = useState<FavTypeFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<FavSortMode>('folders-first');
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
  const [contextEntry, setContextEntry] = useState<ExplorerEntry | null>(null);
  const [detailsFolderId, setDetailsFolderId] = useState<string | null>(null);
  const [detailsVideoId, setDetailsVideoId] = useState<string | null>(null);
  const [coverPickerTarget, setCoverPickerTarget] = useState<ExplorerEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | null>(null);

  useBackHandler(
    multiSelectMode,
    () => {
      setBatchMoreOpen(false);
      setMultiSelectMode(false);
      setSelectedIds([]);
    },
    30
  );
  useBackHandler(Boolean(contextEntry), () => setContextEntry(null), 35);
  useBackHandler(Boolean(detailsFolderId), () => setDetailsFolderId(null), 40);
  useBackHandler(Boolean(detailsVideoId), () => setDetailsVideoId(null), 40);
  useBackHandler(
    Boolean(coverPickerTarget),
    () => setCoverPickerTarget(null),
    50
  );
  useBackHandler(Boolean(renameTarget), () => setRenameTarget(null), 50);

  const libraryMap = useMemo(
    () => new Map(libraries.map((l) => [l.id, l])),
    [libraries]
  );

  const allFavorites = useMemo(
    () => allEntries.filter((e) => e.favorite),
    [allEntries]
  );

  const scopedFavorites = useMemo(() => {
    if (libraryFilter === 'all') return allFavorites;
    return allFavorites.filter((e) => e.libraryId === libraryFilter);
  }, [allFavorites, libraryFilter]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    scopedFavorites.forEach((entry) => {
      if (entry.type === 'video') {
        entry.tags.forEach((t) => set.add(t));
      }
    });
    return Array.from(set).sort(naturalCompare);
  }, [scopedFavorites]);

  const visibleFavorites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = scopedFavorites.filter((entry) => {
      if (typeFilter === 'videos' && entry.type !== 'video') return false;
      if (typeFilter === 'folders' && entry.type !== 'folder') return false;
      if (
        selectedTag &&
        (entry.type !== 'video' || !entry.tags.includes(selectedTag))
      ) {
        return false;
      }
      if (!q) return true;
      const libName = libraryMap.get(entry.libraryId)?.name.toLowerCase() ?? '';
      const matchesName = entry.name.toLowerCase().includes(q);
      const matchesLib = libName.includes(q);
      const matchesVideoMeta =
        entry.type === 'video' &&
        (entry.tags.some((t) => t.toLowerCase().includes(q)) ||
          (entry.note ?? '').toLowerCase().includes(q));
      return matchesName || matchesLib || matchesVideoMeta;
    });

    const sorted = [...list];
    if (sortMode === 'natural') {
      sorted.sort((a, b) => naturalCompare(a.name, b.name));
    } else if (sortMode === 'folders-first') {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'recent-desc') {
      sorted.sort((a, b) => {
        const diff = getEntryCreatedAt(b) - getEntryCreatedAt(a);
        return diff !== 0 ? diff : naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'recent-asc') {
      sorted.sort((a, b) => {
        const diff = getEntryCreatedAt(a) - getEntryCreatedAt(b);
        return diff !== 0 ? diff : naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'library') {
      sorted.sort((a, b) => {
        const la = libraryMap.get(a.libraryId)?.name ?? '';
        const lb = libraryMap.get(b.libraryId)?.name ?? '';
        const cmp = naturalCompare(la, lb);
        return cmp !== 0 ? cmp : naturalCompare(a.name, b.name);
      });
    }
    return sorted;
  }, [libraryMap, scopedFavorites, searchQuery, selectedTag, sortMode, typeFilter]);

  const summary = useMemo(() => {
    const favVideos = scopedFavorites.filter(
      (e): e is VideoEntry => e.type === 'video'
    );
    const favFolders = scopedFavorites.filter(
      (e): e is FolderEntry => e.type === 'folder'
    );
    const totalSec = favVideos.reduce(
      (acc, v) => acc + parseDurationSeconds(v.duration),
      0
    );
    return {
      videosCount: favVideos.length,
      foldersCount: favFolders.length,
      totalDurationLabel: formatTotalDuration(totalSec),
    };
  }, [scopedFavorites]);

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

  const getDescendantVideos = (folderId: string, libId: string): VideoEntry[] => {
    const libEntries = allEntries.filter((e) => e.libraryId === libId);
    const folderSet = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const item of libEntries) {
        if (
          item.type === 'folder' &&
          item.parentId &&
          folderSet.has(item.parentId) &&
          !folderSet.has(item.id)
        ) {
          folderSet.add(item.id);
          added = true;
        }
      }
    }
    return libEntries.filter(
      (item): item is VideoEntry =>
        item.type === 'video' &&
        item.parentId !== null &&
        folderSet.has(item.parentId)
    );
  };

  const detailsFolder = useMemo(
    () =>
      detailsFolderId
        ? (allEntries.find(
            (e): e is FolderEntry => e.id === detailsFolderId && e.type === 'folder'
          ) ?? null)
        : null,
    [allEntries, detailsFolderId]
  );

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
    const order: FavSortMode[] = [
      'folders-first',
      'natural',
      'recent-desc',
      'recent-asc',
      'library',
    ];
    setSortMode(order[(order.indexOf(sortMode) + 1) % order.length]);
  };

  const sortLabel =
    sortMode === 'folders-first'
      ? 'Carpetas'
      : sortMode === 'natural'
        ? 'A-Z'
        : sortMode === 'recent-desc'
          ? 'Reciente ↓'
          : sortMode === 'recent-asc'
            ? 'Reciente ↑'
            : 'Biblioteca';

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
        .map((id) => allFavorites.find((e) => e.id === id))
        .filter((e): e is VideoEntry => Boolean(e && e.type === 'video')),
    [allFavorites, selectedIds]
  );

  const selectedSizeLabel = useMemo(() => {
    const totalMb = selectedIds.reduce((acc, id) => {
      const item = allFavorites.find((e) => e.id === id);
      if (!item) return acc;
      return (
        acc +
        (item.type === 'video' ? getVideoSizeMb(item) : parseSizeMb(item.sizeLabel))
      );
    }, 0);
    return formatStorageMb(totalMb);
  }, [allFavorites, selectedIds]);

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

  const handleEntryTap = (entry: ExplorerEntry) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (multiSelectMode) {
      toggleSelectId(entry.id);
      return;
    }
    if (entry.type === 'folder') {
      onOpenFolder(entry.libraryId, entry.id);
    } else {
      onPlayVideo(entry);
    }
  };

  return (
    <div className={`space-y-4 ${multiSelectMode ? 'pb-32' : 'pb-6'}`}>
      {/* Header Summary Hero Strip */}
      <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[#ffb95f] font-mono text-[11px] font-semibold uppercase tracking-wider">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Acceso Rápido de Ensayo</span>
            </div>
            <h2 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight mt-0.5">
              Tus Favoritos
            </h2>
            <p className="text-xs text-[#c8b6b6] mt-0.5 tabular-nums">
              {summary.foldersCount}{' '}
              {summary.foldersCount === 1 ? 'carpeta' : 'carpetas'} ·{' '}
              {summary.videosCount}{' '}
              {summary.videosCount === 1 ? 'vídeo' : 'vídeos'} ·{' '}
              {summary.totalDurationLabel} de estudio
            </p>
          </div>
        </div>

        {/* Library Scope Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => {
              setLibraryFilter('all');
              setSelectedTag(null);
            }}
            className={`px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              libraryFilter === 'all'
                ? 'bg-[#e5e2e1] text-[#131313]'
                : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            Todas ({allFavorites.length})
          </button>
          {libraries.map((lib) => {
            const count = allFavorites.filter((e) => e.libraryId === lib.id).length;
            const active = libraryFilter === lib.id;
            return (
              <button
                key={lib.id}
                type="button"
                onClick={() => {
                  setLibraryFilter(lib.id);
                  setSelectedTag(null);
                }}
                className={`px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-[#ff5261] text-[#400009]'
                    : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <span className="truncate max-w-[130px]">{lib.name}</span>
                <span className="font-mono text-[10px] opacity-80 tabular-nums">
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
            placeholder="Buscar favoritos por nombre, etiqueta o nota..."
            className="w-full h-11 pl-10 pr-9 rounded-xl bg-[#201f1f] text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/60 border border-white/[0.06] focus:outline-none focus:border-[#ff5261]"
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

        {/* Type filter + View Mode + Sort */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#201f1f] p-1 rounded-xl border border-white/[0.06]">
            {(
              [
                { id: 'all', label: 'Todo' },
                { id: 'videos', label: 'Vídeos' },
                { id: 'folders', label: 'Carpetas' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                className={`px-3 h-7 rounded-lg text-xs font-semibold transition-colors ${
                  typeFilter === opt.id
                    ? 'bg-[#353534] text-[#e5e2e1]'
                    : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleSortMode}
              className="h-9 px-3 rounded-xl bg-[#201f1f] border border-white/[0.06] text-xs font-medium text-[#e5e2e1] flex items-center gap-1.5 hover:bg-[#2a2a2a]"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#ffb95f]" />
              <span>{sortLabel}</span>
            </button>

            <button
              type="button"
              disabled={visibleFavorites.length === 0 && !multiSelectMode}
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
        {availableTags.length > 0 && typeFilter !== 'folders' && (
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

      {/* Favorites List / Grid */}
      {visibleFavorites.length === 0 ? (
        <div className="py-12 px-4 rounded-2xl bg-[#1c1b1b] border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#201f1f] text-[#ffb95f] flex items-center justify-center mx-auto">
            <Star className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#e5e2e1]">
              {allFavorites.length === 0
                ? 'Aún no tienes elementos favoritos'
                : 'Ningún favorito coincide con el filtro'}
            </p>
            <p className="text-xs text-[#c8b6b6] max-w-xs mx-auto">
              {allFavorites.length === 0
                ? 'Marca la estrella en tus combos clave o carpetas de ensayo para acceder al instante.'
                : 'Prueba cambiando la biblioteca, tipo o búsqueda.'}
            </p>
          </div>
          {allFavorites.length === 0 ? (
            <button
              type="button"
              onClick={onGoToLibraries}
              className="h-10 px-4 rounded-xl bg-[#ff5261] text-[#400009] text-xs font-bold active:scale-95 transition-transform"
            >
              Explorar bibliotecas
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setLibraryFilter('all');
                setTypeFilter('all');
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
          {visibleFavorites.map((entry) => {
            const isSelected = selectedIds.includes(entry.id);
            const isCut = cutIdsSet.has(entry.id);
            const thumbKey = `${entry.id}:${entry.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !entry.coverUrl;
            const pathLabel = getPathLabel(entry);

            return (
              <div
                key={entry.id}
                onPointerDown={(e) => handleCardPointerDown(e, entry.id)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!multiSelectMode) {
                    setMultiSelectMode(true);
                    setSelectedIds((prev) =>
                      prev.includes(entry.id) ? prev : [...prev, entry.id]
                    );
                  }
                }}
                onClick={() => handleEntryTap(entry)}
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

                  {/* Thumbnail */}
                  {entry.type === 'folder' ? (
                    <div
                      className={`relative w-[80px] h-[64px] shrink-0 flex flex-col justify-end transition-all ${
                        isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                      }`}
                    >
                      <div className="mx-1.5 h-1 rounded-t-sm bg-[#352e27] border-t border-x border-[#ffb95f]/35" />
                      <div className="relative flex items-end">
                        <div className="w-11 h-2.5 rounded-t-md bg-[#2a241e] border-t-2 border-x border-[#ffb95f] flex items-center justify-center">
                          <span className="w-5 h-[2px] rounded-full bg-[#ffb95f]/70" />
                        </div>
                        <div className="flex-1 h-1 bg-[#25211d] rounded-tr-sm border-t border-r border-[#ffb95f]/30" />
                      </div>
                      <div className="relative w-full flex-1 rounded-lg rounded-tl-none overflow-hidden bg-[#2a2a2a] border border-[#ffb95f]/55 shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
                        {!thumbFailed ? (
                          <img
                            src={entry.coverUrl}
                            alt={entry.name}
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
                          <DefaultIconCover
                            kind="folder"
                            favorite={entry.favorite}
                            size="sm"
                          />
                        )}
                        {isCut && (
                          <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`relative w-[80px] h-[56px] shrink-0 rounded-lg overflow-hidden bg-[#353534] transition-all ${
                        isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                      }`}
                    >
                      {!thumbFailed ? (
                        <img
                          src={entry.coverUrl}
                          alt={entry.name}
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
                          sourceType={entry.sourceType}
                          size="sm"
                        />
                      )}
                      <div className="absolute top-1 left-1 bg-[#ff5261] text-[#400009] font-mono text-[9px] font-bold px-1 rounded">
                        {entry.sourceType === 'instagram'
                          ? 'IG'
                          : entry.sourceType === 'youtube'
                            ? 'YT'
                            : 'HD'}
                      </div>
                      <div className="absolute bottom-1 right-1 bg-[#131313]/85 backdrop-blur-sm px-1 rounded font-mono text-[10px] text-[#e5e2e1] tabular-nums">
                        {entry.duration}
                      </div>
                      {isCut && (
                        <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                      )}
                    </div>
                  )}

                  {/* Title, Route & Metadata */}
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
                        {entry.name}
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
                      className={`flex items-center gap-1.5 font-mono text-[10px] mt-0.5 tabular-nums ${
                        isCut ? 'text-[#c8b6b6]/50' : 'text-[#c8b6b6]/80'
                      }`}
                    >
                      {entry.type === 'folder' ? (
                        <span>
                          {entry.itemCount} elementos · {entry.sizeLabel}
                        </span>
                      ) : (
                        <>
                          {entry.sourceType === 'instagram' ? (
                            <Instagram
                              className={`w-3 h-3 shrink-0 ${
                                isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb3b3]'
                              }`}
                            />
                          ) : entry.sourceType === 'youtube' ? (
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
                            {entry.sizeLabel}
                            {entry.tags.length > 0
                              ? ` · ${entry.tags.join(', ')}`
                              : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Star + More */}
                {!multiSelectMode && (
                  <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    <button
                      type="button"
                      aria-label="Quitar de favoritos"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteWithUndo(entry.id);
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-[#ffb95f] active:scale-90 transition-transform"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Opciones de ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextEntry(entry);
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
          {visibleFavorites.map((entry) => {
            const isSelected = selectedIds.includes(entry.id);
            const isCut = cutIdsSet.has(entry.id);
            const thumbKey = `${entry.id}:${entry.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !entry.coverUrl;
            const libName =
              libraryMap.get(entry.libraryId)?.name ?? 'Biblioteca';

            return (
              <div
                key={entry.id}
                onPointerDown={(e) => handleCardPointerDown(e, entry.id)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!multiSelectMode) {
                    setMultiSelectMode(true);
                    setSelectedIds((prev) =>
                      prev.includes(entry.id) ? prev : [...prev, entry.id]
                    );
                  }
                }}
                onClick={() => handleEntryTap(entry)}
                className={`group flex flex-col rounded-xl overflow-hidden transition-all cursor-pointer select-none active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#201f1f] border-2 border-[#ff3e55] shadow-[0_0_12px_rgba(255,62,85,0.2)]'
                    : isCut
                      ? 'bg-[#201f1f]/80 border border-dashed border-white/25 hover:bg-[#2a2a2a]'
                      : entry.type === 'folder'
                        ? 'bg-[#201f1f] border border-[#ffb95f]/25 hover:border-[#ffb95f]/45 hover:bg-[#2a2a2a]'
                        : 'bg-[#201f1f] border border-white/[0.06] hover:bg-[#2a2a2a]'
                }`}
              >
                {entry.type === 'folder' ? (
                  <div className="relative w-full aspect-[4/3] bg-[#151414] px-2 pt-2 pb-1 flex flex-col justify-end">
                    <div
                      className={`mx-3 h-1.5 rounded-t-md bg-[#352e27] border-t border-x border-[#ffb95f]/35 transition-all ${
                        isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                      }`}
                    />
                    <div
                      className={`relative flex items-end transition-all ${
                        isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                      }`}
                    >
                      <div className="h-6 px-3 rounded-t-xl bg-[#2a241e] border-t-2 border-x border-[#ffb95f] flex items-center gap-1.5 shadow-sm z-10">
                        <Folder className="w-3.5 h-3.5 text-[#ffb95f] fill-[#ffb95f]/35 shrink-0" />
                        <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#ffb95f]">
                          Carpeta
                        </span>
                      </div>
                      <div className="flex-1 h-2 bg-[#25211d] rounded-tr-lg border-t border-r border-[#ffb95f]/30" />
                    </div>
                    <div className="relative flex-1 w-full rounded-xl rounded-tl-none overflow-hidden bg-[#2a2a2a] border border-[#ffb95f]/55 shadow-[0_8px_20px_rgba(0,0,0,0.55)]">
                      <div
                        className={`w-full h-full transition-all ${
                          isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                        }`}
                      >
                        {!thumbFailed ? (
                          <img
                            src={entry.coverUrl}
                            alt={entry.name}
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
                          <DefaultIconCover
                            kind="folder"
                            favorite={entry.favorite}
                            size="md"
                          />
                        )}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#131313]/65 via-transparent to-black/15 pointer-events-none" />
                      {isCut && (
                        <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                      )}
                      <div
                        className={`absolute bottom-2 right-2 bg-[#131313]/85 backdrop-blur-sm px-2 py-0.5 rounded font-mono text-[11px] font-semibold tabular-nums ${
                          isCut ? 'text-[#e5e2e1]/75' : 'text-[#ffb95f]'
                        }`}
                      >
                        {entry.itemCount} elem.
                      </div>
                      {multiSelectMode && (
                        <div className="absolute top-1.5 left-1.5 z-10">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#ff3e55] text-[#131313] flex items-center justify-center shadow-[0_0_8px_rgba(255,62,85,0.8)]">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-[#131313]/75 border border-white/40" />
                          )}
                        </div>
                      )}
                      {!multiSelectMode && (
                        <button
                          type="button"
                          aria-label="Quitar de favoritos"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavoriteWithUndo(entry.id);
                          }}
                          className={`absolute top-1.5 right-1.5 z-10 w-8 h-8 rounded-full bg-[#131313]/75 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform ${
                            isCut ? 'text-[#e5e2e1]/65' : 'text-[#ffb95f]'
                          }`}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full aspect-[4/3] bg-[#353534] overflow-hidden">
                    <div
                      className={`w-full h-full transition-all ${
                        isCut ? 'grayscale-[85%] brightness-125 contrast-75 opacity-75' : ''
                      }`}
                    >
                      {!thumbFailed ? (
                        <img
                          src={entry.coverUrl}
                          alt={entry.name}
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
                          sourceType={entry.sourceType}
                          size="md"
                        />
                      )}
                    </div>

                    {isCut && (
                      <div className="pointer-events-none absolute inset-0 bg-white/[0.22]" />
                    )}

                    <div
                      className={`absolute bottom-2 left-2 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow ${
                        isCut
                          ? 'bg-[#d4d4d4]/80 text-[#201f1f]'
                          : 'bg-[#ff5261] text-[#400009]'
                      }`}
                    >
                      {entry.sourceType === 'instagram' ? (
                        <>
                          <Instagram className="w-2.5 h-2.5" />
                          <span>IG</span>
                        </>
                      ) : entry.sourceType === 'youtube' ? (
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
                      {entry.duration}
                    </div>

                    {multiSelectMode && (
                      <div className="absolute top-2 left-2 z-10">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-[#ff3e55] text-[#131313] flex items-center justify-center shadow-[0_0_8px_rgba(255,62,85,0.8)]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-[#131313]/75 border border-white/40" />
                        )}
                      </div>
                    )}

                    {!multiSelectMode && (
                      <button
                        type="button"
                        aria-label="Quitar de favoritos"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteWithUndo(entry.id);
                        }}
                        className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-[#131313]/70 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform ${
                          isCut ? 'text-[#e5e2e1]/65' : 'text-[#ffb95f]'
                        }`}
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    )}
                  </div>
                )}

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
                          {entry.name}
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
                        {entry.type === 'folder' ? (
                          <span className="truncate">
                            {entry.itemCount} elementos · {entry.sizeLabel}
                          </span>
                        ) : (
                          <>
                            {entry.sourceType === 'instagram' ? (
                              <Instagram
                                className={`w-3 h-3 shrink-0 ${
                                  isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb3b3]'
                                }`}
                              />
                            ) : entry.sourceType === 'youtube' ? (
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
                            <span className="truncate">{entry.sizeLabel}</span>
                          </>
                        )}
                      </p>
                    </div>
                    {!multiSelectMode && (
                      <button
                        type="button"
                        aria-label={`Opciones de ${entry.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextEntry(entry);
                        }}
                        className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {entry.type === 'video' && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {entry.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2a2a2a] border border-white/[0.06] text-[10px] font-medium text-[#e5e2e1] max-w-[96px] truncate"
                        >
                          <Tag className="w-2.5 h-2.5 text-[#ffb3b3] shrink-0" />
                          <span className="truncate">{tag}</span>
                        </span>
                      ))}
                      {entry.tags.length > 2 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#2a2a2a] border border-white/[0.06] font-mono text-[10px] font-semibold text-[#c8b6b6] tabular-nums">
                          +{entry.tags.length - 2}
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
                    setSelectedIds(visibleFavorites.map((e) => e.id));
                    setBatchMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#e5e2e1] hover:bg-[#2a2a2a]"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  <span>Seleccionar todo ({visibleFavorites.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu Bottom Sheet */}
      {contextEntry && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setContextEntry(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#2a2a2a] rounded-t-2xl sm:rounded-2xl p-4 space-y-1.5 shadow-2xl"
          >
            <div className="w-10 h-1 bg-[#353534] rounded-full mx-auto mb-2 sm:hidden" />

            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              <div className="w-10 h-10 rounded-lg bg-[#201f1f] flex items-center justify-center text-[#ffb3b3] shrink-0">
                {contextEntry.type === 'folder' ? (
                  <Folder className="w-5 h-5 text-[#ffb95f]" />
                ) : (
                  <Film className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#e5e2e1] truncate">
                  {contextEntry.name}
                </p>
                <p className="text-xs text-[#c8b6b6] truncate">
                  {getPathLabel(contextEntry)}
                </p>
              </div>
            </div>

            {contextEntry.type === 'video' ? (
              <button
                type="button"
                onClick={() => {
                  const item = contextEntry;
                  setContextEntry(null);
                  onPlayVideo(item);
                }}
                className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <Play className="w-4 h-4 text-[#ff5261]" />
                <span>Reproducir vídeo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const item = contextEntry;
                  setContextEntry(null);
                  onOpenFolder(item.libraryId, item.id);
                }}
                className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <FolderOpen className="w-4 h-4 text-[#ffb95f]" />
                <span>Abrir carpeta</span>
              </button>
            )}

            {contextEntry.type === 'video' && (
              <button
                type="button"
                onClick={() => {
                  const item = contextEntry;
                  setContextEntry(null);
                  onOpenFolder(item.libraryId, item.parentId);
                }}
                className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <FolderOpen className="w-4 h-4 text-[#ffb95f]" />
                <span>Ir a su carpeta</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const item = contextEntry;
                setContextEntry(null);
                if (item.type === 'folder') {
                  setDetailsFolderId(item.id);
                } else {
                  setDetailsVideoId(item.id);
                }
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <Info className="w-4 h-4 text-[#c8b6b6]" />
              <span>Detalles</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRenameTarget(contextEntry);
                setContextEntry(null);
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
                  onCopyToClipboard([contextEntry.id], 'copy');
                  setContextEntry(null);
                }}
                className="flex items-center gap-2.5 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <Copy className="w-4 h-4 text-[#c8b6b6]" />
                <span>Copiar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onCopyToClipboard([contextEntry.id], 'cut');
                  setContextEntry(null);
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
                setCoverPickerTarget(contextEntry);
                setContextEntry(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <ImageIcon className="w-4 h-4 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>

            {contextEntry.type === 'video' && (
              <button
                type="button"
                onClick={() => {
                  onDuplicateVideo(contextEntry.id);
                  setContextEntry(null);
                }}
                className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
              >
                <Copy className="w-4 h-4 text-[#4cd7f6]" />
                <span>Duplicar instancia (BIS)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onToggleFavoriteWithUndo(contextEntry.id);
                setContextEntry(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#ffb95f] hover:bg-[#393939]"
            >
              <Star className="w-4 h-4" />
              <span>Quitar de favoritos</span>
            </button>

            <button
              type="button"
              onClick={() => setContextEntry(null)}
              className="w-full h-11 rounded-xl bg-[#201f1f] text-sm font-semibold text-[#e5e2e1] mt-1"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Folder Details Modal */}
      {detailsFolder && libraryMap.get(detailsFolder.libraryId) && (
        <FolderDetailsModal
          folder={detailsFolder}
          library={libraryMap.get(detailsFolder.libraryId)!}
          allEntries={allEntries}
          onClose={() => setDetailsFolderId(null)}
          onToggleFavorite={(id) => onToggleFavoriteWithUndo(id)}
          onRename={(folder) => setRenameTarget(folder)}
          onChangeCover={(folder) => setCoverPickerTarget(folder)}
          onMove={(folder) => {
            onCopyToClipboard([folder.id], 'cut');
            onShowToast(
              `"${folder.name}" cortada: ve al destino y pulsa Pegar`
            );
          }}
          onDelete={(id) => {
            onDeleteEntries([id]);
            setDetailsFolderId(null);
          }}
          onUpdateMetadata={onUpdateFolderMetadata}
        />
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

      {/* Cover Pickers */}
      {coverPickerTarget && coverPickerTarget.type === 'folder' && (
        <FolderCoverPickerModal
          folder={coverPickerTarget}
          libraryName={
            libraryMap.get(coverPickerTarget.libraryId)?.name ?? 'Biblioteca'
          }
          allEntries={allEntries}
          candidateVideos={getDescendantVideos(
            coverPickerTarget.id,
            coverPickerTarget.libraryId
          )}
          onClose={() => setCoverPickerTarget(null)}
          onAssignCover={(folderId, coverUrl, sourceVideoName) => {
            onChangeCover(folderId, coverUrl);
            onShowToast(
              coverUrl
                ? `Portada de carpeta actualizada usando "${sourceVideoName}"`
                : 'Portada de carpeta restablecida al icono por defecto'
            );
          }}
        />
      )}

      {coverPickerTarget && coverPickerTarget.type === 'video' && (
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
