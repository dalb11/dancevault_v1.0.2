import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Info,
  Instagram,
  Layers,
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
  Video,
  X,
  Youtube,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  FolderMetadataUpdates,
  LibraryItem,
  SortMode,
  VideoEntry,
  ViewMode,
} from '../types/dancevault';
import { getEntryCreatedAt } from '../utils/dateUtils';
import { CreateFolderModal } from './CreateFolderModal';
import { DefaultIconCover } from './DefaultIconCover';
import { FolderCoverPickerModal } from './FolderCoverPickerModal';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';
import { FolderDetailsModal } from './FolderDetailsModal';
import { ImportVideoModal, ImportVideoPayload } from './ImportVideoModal';
import { RenameEntryModal } from './RenameEntryModal';
import { VideoCoverPickerModal } from './VideoCoverPickerModal';
import { VideoDetailsModal } from './VideoDetailsModal';
import { formatStorageMb, getVideoSizeMb, parseSizeMb } from '../utils/storageSize';
import { useBackHandler } from '../utils/backNavigation';

interface FolderExplorerViewProps {
  library: LibraryItem;
  currentFolderId: string | null;
  flatVideosMode?: boolean;
  onExitFlatVideos?: () => void;
  allEntries: ExplorerEntry[];
  folderViewPrefs: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortMode>;
  manualOrderByFolder: Record<string, string[]>;
  onSetFolderViewPref: (key: string, mode: ViewMode) => void;
  onSetFolderSortPref: (key: string, mode: SortMode) => void;
  onUpdateManualOrder: (key: string, orderedIds: string[]) => void;
  onChangeCover: (entryId: string, coverUrl: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onGoToLibraries: () => void;
  onToggleFavorite: (entryId: string) => void;
  onRenameEntry: (entryId: string, newName: string) => boolean;
  onCreateFolder: (name: string, favorite?: boolean) => boolean;
  onImportVideo: (payload: ImportVideoPayload) => boolean;
  onDuplicateVideo: (videoId: string) => void;
  onDeleteEntries: (ids: string[]) => void;
  onCopyToClipboard: (ids: string[], mode: 'copy' | 'cut') => void;
  cutEntryIds?: string[];
  clipboardCount: number;
  onPasteClipboard: () => void;
  onOpenFolderDetails: () => void;
  onPlayVideo: (video: VideoEntry, queueIds?: string[]) => void;
  onUpdateFolderMetadata?: (
    folderId: string,
    updates: FolderMetadataUpdates
  ) => void;
  onUpdateVideoMetadata: (
    videoId: string,
    updates: import('../types/dancevault').VideoMetadataUpdates
  ) => void;
  openDetailsSignal?: number;
  onShowToast: (msg: string) => void;
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export const FolderExplorerView: React.FC<FolderExplorerViewProps> = ({
  library,
  currentFolderId,
  flatVideosMode = false,
  onExitFlatVideos,
  allEntries,
  folderViewPrefs,
  folderSortPrefs,
  manualOrderByFolder,
  onSetFolderViewPref,
  onSetFolderSortPref,
  onUpdateManualOrder,
  onChangeCover,
  onNavigateFolder,
  onGoToLibraries,
  onToggleFavorite,
  onRenameEntry,
  onCreateFolder,
  onImportVideo,
  onDuplicateVideo,
  onDeleteEntries,
  onCopyToClipboard,
  cutEntryIds = [],
  clipboardCount,
  onPasteClipboard,
  onOpenFolderDetails,
  onPlayVideo,
  onUpdateFolderMetadata,
  onUpdateVideoMetadata,
  openDetailsSignal = 0,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Multi-select
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMoreOpen, setBatchMoreOpen] = useState(false);

  // Dragging in manual sort mode
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Long-press refs
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Context menus & modals
  const [contextEntry, setContextEntry] = useState<ExplorerEntry | null>(null);
  const [coverPickerTarget, setCoverPickerTarget] = useState<ExplorerEntry | null>(null);
  const [emptyAreaMenuOpen, setEmptyAreaMenuOpen] = useState(false);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [importVideoModalOpen, setImportVideoModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | null>(null);
  const [detailsFolderId, setDetailsFolderId] = useState<string | null>(null);
  const [detailsVideoId, setDetailsVideoId] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const lastDetailsSignalRef = useRef(openDetailsSignal);
  const cutIdsSet = useMemo(() => new Set(cutEntryIds), [cutEntryIds]);

  const prefKey = flatVideosMode
    ? `flat:${library.id}`
    : currentFolderId ?? `root:${library.id}`;
  const currentFolder = useMemo(
    () =>
      !flatVideosMode && currentFolderId
        ? (allEntries.find(
            (e): e is FolderEntry => e.id === currentFolderId && e.type === 'folder'
          ) ?? null)
        : null,
    [allEntries, currentFolderId, flatVideosMode]
  );

  useBackHandler(
    Boolean(flatVideosMode && onExitFlatVideos),
    () => onExitFlatVideos?.(),
    15
  );
  useBackHandler(
    !flatVideosMode && Boolean(currentFolderId),
    () => onNavigateFolder(currentFolder?.parentId ?? null),
    20
  );
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
  useBackHandler(emptyAreaMenuOpen, () => setEmptyAreaMenuOpen(false), 35);
  useBackHandler(Boolean(detailsFolderId), () => setDetailsFolderId(null), 40);
  useBackHandler(Boolean(detailsVideoId), () => setDetailsVideoId(null), 40);
  useBackHandler(
    Boolean(coverPickerTarget),
    () => setCoverPickerTarget(null),
    50
  );
  useBackHandler(Boolean(renameTarget), () => setRenameTarget(null), 50);
  useBackHandler(newFolderModalOpen, () => setNewFolderModalOpen(false), 50);
  useBackHandler(
    importVideoModalOpen,
    () => setImportVideoModalOpen(false),
    50
  );

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

  useEffect(() => {
    if (openDetailsSignal !== lastDetailsSignalRef.current) {
      lastDetailsSignalRef.current = openDetailsSignal;
      if (!flatVideosMode && currentFolderId) {
        setDetailsFolderId(currentFolderId);
      }
    }
  }, [openDetailsSignal, currentFolderId, flatVideosMode]);

  const viewMode: ViewMode =
    folderViewPrefs[prefKey] ?? currentFolder?.viewMode ?? 'list';
  const rawSortMode: SortMode =
    folderSortPrefs[prefKey] ?? currentFolder?.sortMode ?? 'natural';
  const sortMode: SortMode =
    flatVideosMode && rawSortMode === 'folders-first' ? 'natural' : rawSortMode;

  const setViewMode = (mode: ViewMode) => {
    onSetFolderViewPref(prefKey, mode);
  };

  const cycleSortMode = () => {
    const order: SortMode[] = flatVideosMode
      ? ['natural', 'recent-desc', 'recent-asc', 'manual']
      : ['natural', 'folders-first', 'recent-desc', 'recent-asc', 'manual'];
    const currentIdx = order.indexOf(sortMode);
    const next = order[(currentIdx === -1 ? 0 : currentIdx + 1) % order.length];
    onSetFolderSortPref(prefKey, next);
  };

  // Build breadcrumb chain from library root to current folder
  const breadcrumbs = useMemo(() => {
    const chain: FolderEntry[] = [];
    let cursor = currentFolder;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parentId
        ? (allEntries.find(
            (e): e is FolderEntry => e.id === cursor!.parentId && e.type === 'folder'
          ) ?? null)
        : null;
    }
    return chain;
  }, [allEntries, currentFolder]);

  // Collect all descendant folder IDs for contextual search (Section 10.1)
  const scopedDescendantEntries = useMemo(() => {
    const libEntries = allEntries.filter((e) => e.libraryId === library.id);
    if (flatVideosMode) {
      return libEntries.filter((e) => e.type === 'video');
    }
    if (!currentFolderId) return libEntries;

    const allowedParentIds = new Set<string>([currentFolderId]);
    let added = true;
    while (added) {
      added = false;
      for (const item of libEntries) {
        if (
          item.type === 'folder' &&
          item.parentId &&
          allowedParentIds.has(item.parentId) &&
          !allowedParentIds.has(item.id)
        ) {
          allowedParentIds.add(item.id);
          added = true;
        }
      }
    }
    return libEntries.filter(
      (item) => item.parentId !== null && allowedParentIds.has(item.parentId)
    );
  }, [allEntries, library.id, currentFolderId, flatVideosMode]);

  // Available video tags inside current scope (Section 10 + 2.4)
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    scopedDescendantEntries.forEach((entry) => {
      if (entry.type === 'video') {
        entry.tags.forEach((t) => set.add(t));
      }
    });
    return Array.from(set).sort(naturalCompare);
  }, [scopedDescendantEntries]);

  // Visible items (either direct children, flattened videos, or contextual search results)
  const isSearching = searchQuery.trim().length > 0 || selectedTag !== null;

  const visibleEntries = useMemo(() => {
    const base =
      flatVideosMode || isSearching
        ? scopedDescendantEntries.filter((entry) => {
            if (flatVideosMode && entry.type !== 'video') return false;
            const q = searchQuery.trim().toLowerCase();
            const matchesQuery =
              !q ||
              entry.name.toLowerCase().includes(q) ||
              (entry.type === 'video' &&
                entry.tags.some((t) => t.toLowerCase().includes(q)));
            const matchesTag =
              !selectedTag ||
              (entry.type === 'video' && entry.tags.includes(selectedTag));
            return matchesQuery && matchesTag;
          })
        : allEntries.filter(
            (e) => e.libraryId === library.id && e.parentId === currentFolderId
          );

    const list = [...base];
    if (sortMode === 'natural') {
      list.sort((a, b) => naturalCompare(a.name, b.name));
    } else if (sortMode === 'folders-first') {
      list.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'recent-desc') {
      list.sort((a, b) => {
        const diff = getEntryCreatedAt(b) - getEntryCreatedAt(a);
        return diff !== 0 ? diff : naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'recent-asc') {
      list.sort((a, b) => {
        const diff = getEntryCreatedAt(a) - getEntryCreatedAt(b);
        return diff !== 0 ? diff : naturalCompare(a.name, b.name);
      });
    } else if (sortMode === 'manual') {
      const savedOrder = manualOrderByFolder[prefKey];
      if (savedOrder && savedOrder.length > 0) {
        const indexMap = new Map(savedOrder.map((id, idx) => [id, idx]));
        list.sort((a, b) => {
          const ia = indexMap.get(a.id);
          const ib = indexMap.get(b.id);
          if (ia !== undefined && ib !== undefined) return ia - ib;
          if (ia !== undefined) return -1;
          if (ib !== undefined) return 1;
          return 0;
        });
      }
    }
    return list;
  }, [
    allEntries,
    currentFolderId,
    flatVideosMode,
    isSearching,
    library.id,
    manualOrderByFolder,
    prefKey,
    scopedDescendantEntries,
    searchQuery,
    selectedTag,
    sortMode,
  ]);

  const getVideoFolderLabel = (video: VideoEntry): string => {
    if (!video.parentId) return 'Raíz';
    const names: string[] = [];
    let cursorId: string | null = video.parentId;
    while (cursorId) {
      const folder = allEntries.find(
        (e): e is FolderEntry => e.id === cursorId && e.type === 'folder'
      );
      if (!folder) break;
      names.unshift(folder.name);
      cursorId = folder.parentId;
    }
    return names.length > 0 ? names.join(' › ') : 'Raíz';
  };

  const moveManualItem = (id: string, direction: -1 | 1) => {
    const ids = visibleEntries.map((e) => e.id);
    const idx = ids.indexOf(id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= ids.length) return;
    const next = [...ids];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onUpdateManualOrder(prefKey, next);
  };

  const reorderManualDrop = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = visibleEntries.map((e) => e.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...ids];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdateManualOrder(prefKey, next);
  };

  // Descendant videos available for folder cover selection (Section 12)
  const getDescendantVideos = (folderId: string): VideoEntry[] => {
    const libEntries = allEntries.filter((e) => e.libraryId === library.id);
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
        item.type === 'video' && item.parentId !== null && folderSet.has(item.parentId)
    );
  };

  const sortLabel =
    sortMode === 'natural'
      ? 'A-Z'
      : sortMode === 'folders-first'
        ? 'Carpetas'
        : sortMode === 'recent-desc'
          ? 'Reciente ↓'
          : sortMode === 'recent-asc'
            ? 'Reciente ↑'
            : 'Manual';

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
        .map((id) => allEntries.find((e) => e.id === id))
        .filter((e): e is VideoEntry => Boolean(e && e.type === 'video')),
    [allEntries, selectedIds]
  );

  const selectedSizeLabel = useMemo(() => {
    const totalMb = selectedIds.reduce((acc, id) => {
      const item = allEntries.find((e) => e.id === id);
      if (!item) return acc;
      return acc + (item.type === 'video' ? getVideoSizeMb(item) : parseSizeMb(item.sizeLabel));
    }, 0);
    return formatStorageMb(totalMb);
  }, [allEntries, selectedIds]);

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

  const handleCardTap = (entry: ExplorerEntry) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (multiSelectMode) {
      toggleSelectId(entry.id);
      return;
    }
    if (entry.type === 'folder') {
      setSearchQuery('');
      setSelectedTag(null);
      onNavigateFolder(entry.id);
    } else {
      onPlayVideo(entry);
    }
  };

  const handleBackStep = () => {
    if (flatVideosMode) {
      if (onExitFlatVideos) {
        onExitFlatVideos();
      } else {
        onNavigateFolder(null);
      }
      return;
    }
    if (currentFolder) {
      onNavigateFolder(currentFolder.parentId);
    } else {
      onGoToLibraries();
    }
  };

  const destinationPathLabel = useMemo(
    () => [library.name, ...breadcrumbs.map((b) => b.name)].join(' > '),
    [breadcrumbs, library.name]
  );

  return (
    <div className="flex flex-col w-full space-y-4">
      {/* Back Button + Dynamic Breadcrumbs (Section 8.2) */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={handleBackStep}
          aria-label="Retroceder carpeta"
          title="Subir un nivel"
          className="w-11 min-h-[48px] rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-95 transition-all border border-white/[0.06]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <nav aria-label="Ruta de carpetas" className="flex flex-wrap items-center content-center gap-1 py-0.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (flatVideosMode && onExitFlatVideos) {
                onExitFlatVideos();
              } else {
                onNavigateFolder(null);
              }
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] leading-tight max-w-full text-left active:scale-95 transition-all ${
              currentFolderId === null && !flatVideosMode
                ? 'bg-[#ff5261] text-[#400009] font-bold shadow-sm'
                : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1] font-medium'
            }`}
          >
            <Folder className="w-3 h-3 shrink-0" />
            <span className="break-words">{library.name}</span>
          </button>

          {flatVideosMode ? (
            <>
              <ChevronRight className="w-3 h-3 text-[#c8b6b6]/60 shrink-0" />
              <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] leading-tight bg-[#ff5261] text-[#400009] font-bold shadow-sm">
                <Layers className="w-3 h-3 shrink-0" />
                <span>Todos los vídeos</span>
              </div>
            </>
          ) : (
            breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="w-3 h-3 text-[#c8b6b6]/60 shrink-0" />
                  <button
                    type="button"
                    onClick={() => onNavigateFolder(crumb.id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] leading-tight max-w-full text-left active:scale-95 transition-all ${
                      isLast
                        ? 'bg-[#ff5261] text-[#400009] font-bold shadow-sm'
                        : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1] font-medium'
                    }`}
                  >
                    {isLast && <FolderOpen className="w-3 h-3 shrink-0" />}
                    <span className="break-words">{crumb.name}</span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </nav>
      </div>

      {/* Contextual Search Input + Video Tag Filter Chips (Section 10 & v2.3) */}
      <div className="space-y-2.5">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#c8b6b6] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              flatVideosMode
                ? `Buscar entre los ${scopedDescendantEntries.length} vídeos de "${library.name}"...`
                : currentFolder
                  ? `Buscar en "${currentFolder.name}" y subcarpetas...`
                  : `Buscar en "${library.name}"...`
            }
            className="w-full h-11 bg-[#2a2a2a] text-[#e5e2e1] placeholder:text-[#c8b6b6]/60 text-sm pl-10 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ff5261]/60 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Interactive Tag Filter Chips (videos only, Section 10) */}
        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-[#c8b6b6] shrink-0 mr-0.5">
              <Tag className="w-2.5 h-2.5 text-[#ffb95f]" />
              <span>Etiquetas:</span>
            </span>
            {availableTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(active ? null : tag)}
                  className={`px-2 py-0.5 rounded-md text-[11px] leading-tight font-medium max-w-full break-words transition-colors ${
                    active
                      ? 'bg-[#ff5261] text-[#400009] font-bold'
                      : 'bg-[#201f1f] text-[#c8b6b6] hover:bg-[#2a2a2a] hover:text-[#e5e2e1]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Control Bar: View Modes, Sorting, Multi-Select & Quick Actions */}
      <div className="flex flex-col gap-2.5 bg-[#1c1b1b] p-2.5 rounded-xl">
        <div className="flex items-center justify-between gap-2">
          {/* 2 View Sizes: Lista vs Cuadrado (Section 13) */}
          <div className="flex items-center bg-[#0e0e0e] p-0.5 rounded-xl border border-white/10">
            <button
              type="button"
              aria-label="Tamaño Lista"
              onClick={() => setViewMode('list')}
              className={`min-w-[38px] h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-[#2a2a2a] text-[#ffb3b3]'
                  : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              type="button"
              aria-label="Tamaño Cuadrado"
              onClick={() => setViewMode('square')}
              className={`min-w-[38px] h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'square'
                  ? 'bg-[#2a2a2a] text-[#ffb3b3]'
                  : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Cuadrado</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleSortMode}
              title={
                sortMode === 'recent-desc'
                  ? 'Orden: reciente descendente (más recientes primero)'
                  : sortMode === 'recent-asc'
                    ? 'Orden: reciente ascendente (más antiguos primero)'
                    : 'Cambiar orden'
              }
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#201f1f] border border-white/10 text-xs font-medium text-[#e5e2e1] hover:border-[#ff5261]/50 active:scale-95 transition-all"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#ffb3b3]" />
              <span>{sortLabel}</span>
              {sortMode !== 'recent-desc' && sortMode !== 'recent-asc' && (
                <ArrowDown className="w-3 h-3 text-[#c8b6b6]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (multiSelectMode) {
                  exitMultiSelect();
                } else {
                  setMultiSelectMode(true);
                }
              }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs active:scale-95 transition-all ${
                multiSelectMode
                  ? 'bg-[#1c1b1b] border-2 border-[#ff3e55] text-[#ff3e55] font-semibold shadow-[0_0_10px_rgba(255,62,85,0.25)]'
                  : 'bg-[#201f1f] border border-white/10 text-[#e5e2e1] font-medium hover:border-[#ff5261]/50'
              }`}
            >
              <CheckSquare className={`w-3.5 h-3.5 ${multiSelectMode ? 'text-[#ff3e55]' : 'text-[#ffb3b3]'}`} />
              <span>Seleccionar</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <div className="flex items-center gap-2">
            {!flatVideosMode && (
              <button
                type="button"
                onClick={() => setNewFolderModalOpen(true)}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#201f1f] border border-white/10 text-xs font-medium text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#ffb3b3]" />
                <span>+ Carpeta</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setImportVideoModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#201f1f] border border-white/10 text-xs font-medium text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all"
            >
              <Video className="w-3.5 h-3.5 text-[#ffb3b3]" />
              <span>+ Vídeo</span>
            </button>
          </div>

          {flatVideosMode && (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-[#4cd7f6]/12 border border-[#4cd7f6]/25 font-mono text-[11px] font-semibold text-[#4cd7f6] tabular-nums">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>{visibleEntries.length} vídeos sin carpetas</span>
            </span>
          )}
        </div>
      </div>

      {/* Manual Sort Hint Banner */}
      {sortMode === 'manual' && !isSearching && visibleEntries.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#201f1f] border border-[#ffb95f]/25 text-xs text-[#c8b6b6]">
          <span className="flex items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-[#ffb95f] shrink-0" />
            <span>Orden manual activo: arrastra o usa ↑ ↓ para ordenar esta vista</span>
          </span>
        </div>
      )}

      {/* Mixed Folder + Video List or Square Grid (Section 9 & 13) */}
      {visibleEntries.length === 0 ? (
        <div className="py-12 px-4 rounded-xl bg-[#1c1b1b] text-center space-y-2">
          {flatVideosMode ? (
            <Film className="w-8 h-8 text-[#4cd7f6]/60 mx-auto" />
          ) : (
            <FolderOpen className="w-8 h-8 text-[#c8b6b6]/50 mx-auto" />
          )}
          <p className="text-sm font-semibold text-[#e5e2e1]">
            {isSearching
              ? 'No hay coincidencias en esta vista'
              : flatVideosMode
                ? 'Esta biblioteca no tiene vídeos todavía'
                : 'Carpeta vacía'}
          </p>
          <p className="text-xs text-[#c8b6b6]">
            {isSearching
              ? 'Prueba con otro nombre o limpia el filtro de etiquetas.'
              : flatVideosMode
                ? 'Importa un vídeo con "+ Vídeo" para verlo aquí directamente.'
                : 'Añade subcarpetas o importa vídeos desde tu dispositivo.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2">
          {visibleEntries.map((entry, idx) => {
            const isSelected = selectedIds.includes(entry.id);
            const isCut = cutIdsSet.has(entry.id);
            const thumbKey = `${entry.id}:${entry.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !entry.coverUrl;
            const canManualReorder =
              sortMode === 'manual' && !isSearching && !multiSelectMode;

            return (
              <div
                key={entry.id}
                draggable={canManualReorder}
                onDragStart={() => setDraggingId(entry.id)}
                onDragOver={(e) => {
                  if (canManualReorder) e.preventDefault();
                }}
                onDrop={() => {
                  if (canManualReorder && draggingId) {
                    reorderManualDrop(draggingId, entry.id);
                    setDraggingId(null);
                  }
                }}
                onDragEnd={() => setDraggingId(null)}
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
                onClick={() => handleCardTap(entry)}
                className={`group flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none active:scale-[0.99] ${
                  isSelected
                    ? 'bg-[#201f1f] border-2 border-[#ff3e55] shadow-[0_0_12px_rgba(255,62,85,0.2)]'
                    : draggingId === entry.id
                      ? 'bg-[#2a2a2a] border border-[#ffb95f] opacity-60'
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

                  {/* Title & Metadata */}
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
                    <div
                      className={`flex items-center gap-1.5 font-mono text-[11px] mt-1 ${
                        isCut ? 'text-[#c8b6b6]/55' : 'text-[#c8b6b6]'
                      }`}
                    >
                      {entry.type === 'folder' ? (
                        <>
                          <Folder
                            className={`w-3 h-3 shrink-0 ${
                              isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb95f]'
                            }`}
                          />
                          <span className="truncate tabular-nums">
                            {entry.itemCount} elementos · {entry.sizeLabel}
                          </span>
                        </>
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
                          <span className="truncate tabular-nums">
                            {flatVideosMode
                              ? `${getVideoFolderLabel(entry)} · ${entry.sizeLabel}${entry.tags.length > 0 ? ` · ${entry.tags.join(', ')}` : ''}`
                              : `${entry.sizeLabel}${entry.tags.length > 0 ? ` · ${entry.tags.join(', ')}` : ''}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Manual Reorder / Star + Contextual Menu */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                  {canManualReorder && (
                    <div className="flex items-center gap-0.5 mr-0.5">
                      <button
                        type="button"
                        aria-label={`Subir ${entry.name}`}
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveManualItem(entry.id, -1);
                        }}
                        className="min-w-[30px] min-h-[34px] rounded-lg bg-[#1c1b1b] hover:bg-[#353534] text-[#ffb95f] disabled:opacity-25 flex items-center justify-center"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${entry.name}`}
                        disabled={idx === visibleEntries.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveManualItem(entry.id, 1);
                        }}
                        className="min-w-[30px] min-h-[34px] rounded-lg bg-[#1c1b1b] hover:bg-[#353534] text-[#ffb95f] disabled:opacity-25 flex items-center justify-center"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    aria-label={
                      entry.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(entry.id);
                    }}
                    className={`min-w-[36px] min-h-[36px] flex items-center justify-center active:scale-90 transition-transform ${
                      entry.favorite
                        ? 'text-[#ffb95f]'
                        : 'text-[#c8b6b6]/50 hover:text-[#ffb95f]'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${entry.favorite ? 'fill-current' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Opciones de ${entry.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextEntry(entry);
                    }}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] active:scale-90 transition-transform"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tamaño Cuadrado (2 cols on mobile, 3-4 on tablet/desktop) */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleEntries.map((entry, idx) => {
            const isSelected = selectedIds.includes(entry.id);
            const isCut = cutIdsSet.has(entry.id);
            const thumbKey = `${entry.id}:${entry.coverUrl}`;
            const thumbFailed = failedThumbs[thumbKey] || !entry.coverUrl;
            const canManualReorder =
              sortMode === 'manual' && !isSearching && !multiSelectMode;

            return (
              <div
                key={entry.id}
                draggable={canManualReorder}
                onDragStart={() => setDraggingId(entry.id)}
                onDragOver={(e) => {
                  if (canManualReorder) e.preventDefault();
                }}
                onDrop={() => {
                  if (canManualReorder && draggingId) {
                    reorderManualDrop(draggingId, entry.id);
                    setDraggingId(null);
                  }
                }}
                onDragEnd={() => setDraggingId(null)}
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
                onClick={() => handleCardTap(entry)}
                className={`group flex flex-col rounded-xl overflow-hidden transition-all cursor-pointer select-none active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#201f1f] border-2 border-[#ff3e55] shadow-[0_0_12px_rgba(255,62,85,0.2)]'
                    : draggingId === entry.id
                      ? 'bg-[#2a2a2a] border border-[#ffb95f] opacity-60'
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

                      <button
                        type="button"
                        aria-label={`Opciones de ${entry.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextEntry(entry);
                        }}
                        className="absolute top-1.5 right-1.5 z-10 w-8 h-8 rounded-full bg-[#131313]/75 backdrop-blur-sm text-[#e5e2e1] flex items-center justify-center"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
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
                      className={`absolute bottom-2 right-2 bg-[#131313]/85 px-1.5 py-0.5 rounded font-mono text-[11px] ${
                        isCut ? 'text-[#e5e2e1]/75' : 'text-[#e5e2e1]'
                      }`}
                    >
                      {entry.duration}
                    </div>

                    <button
                      type="button"
                      aria-label={`Opciones de ${entry.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextEntry(entry);
                      }}
                      className="absolute top-1.5 right-1.5 z-10 w-8 h-8 rounded-full bg-[#131313]/75 text-[#e5e2e1] flex items-center justify-center"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-1.5">
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
                        className={`text-[11px] font-mono truncate flex items-center gap-1 mt-0.5 tabular-nums ${
                          isCut ? 'text-[#c8b6b6]/55' : 'text-[#c8b6b6]'
                        }`}
                      >
                        {entry.type === 'folder' ? (
                          <>
                            <Folder
                              className={`w-3 h-3 shrink-0 ${
                                isCut ? 'text-[#e5e2e1]/55' : 'text-[#ffb95f]'
                              }`}
                            />
                            <span>
                              {entry.itemCount} elementos · {entry.sizeLabel}
                            </span>
                          </>
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
                              {flatVideosMode
                                ? `${getVideoFolderLabel(entry)} · ${entry.sizeLabel}`
                                : entry.sizeLabel}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Favorito"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(entry.id);
                      }}
                      className={`w-7 h-7 flex items-center justify-center shrink-0 ${
                        entry.favorite
                          ? isCut
                            ? 'text-[#e5e2e1]/55'
                            : 'text-[#ffb95f]'
                          : 'text-[#c8b6b6]/50'
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${entry.favorite ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>

                  {entry.type === 'video' && entry.tags.length > 0 && (
                    <div
                      className={`flex items-center gap-1 flex-wrap ${
                        isCut ? 'opacity-65' : ''
                      }`}
                    >
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

                  {canManualReorder && (
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        aria-label={`Mover ${entry.name} antes`}
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveManualItem(entry.id, -1);
                        }}
                        className="flex-1 h-7 rounded-lg bg-[#1c1b1b] hover:bg-[#353534] text-[#ffb95f] disabled:opacity-25 flex items-center justify-center"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Mover ${entry.name} después`}
                        disabled={idx === visibleEntries.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveManualItem(entry.id, 1);
                        }}
                        className="flex-1 h-7 rounded-lg bg-[#1c1b1b] hover:bg-[#353534] text-[#ffb95f] disabled:opacity-25 flex items-center justify-center"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reserved empty interaction zone at bottom (Section 4.4 footnote *) */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setEmptyAreaMenuOpen(true);
        }}
        onClick={() => setEmptyAreaMenuOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setEmptyAreaMenuOpen(true);
        }}
        className={`min-h-[84px] rounded-xl border border-dashed border-white/[0.06] flex items-center justify-center text-xs text-[#c8b6b6]/60 hover:text-[#c8b6b6] hover:border-white/15 cursor-pointer transition-colors ${
          multiSelectMode ? 'mb-28' : ''
        }`}
      >
        Espacio reservado de carpeta (toca o mantén pulsado para Pegar / Detalles)
      </div>

      {/* Stitch Floating Bottom Multi-Select Action Dock (Section 5) */}
      {multiSelectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-[45] bg-[#1c1b1b] border-t border-white/15 shadow-[0_-12px_32px_rgba(0,0,0,0.8)] px-3 pt-2 pb-safe">
          <div className="max-w-5xl mx-auto relative bg-[#2a2a2a] border border-white/10 rounded-2xl p-2.5 mb-2 flex flex-col gap-1.5">
            {/* Top summary row */}
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

            {/* 5 Action Buttons */}
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
                  selectedIds.forEach((id) => onToggleFavorite(id));
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

            {/* Extra Batch Actions ("Reproducir conjunto", "Seleccionar todo") */}
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
                    setSelectedIds(visibleEntries.map((e) => e.id));
                    setBatchMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#e5e2e1] hover:bg-[#2a2a2a]"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  <span>Seleccionar todo ({visibleEntries.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Element Context Menu Bottom Sheet (Section 16 / 17 / Stitch) */}
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
                <p className="text-xs font-mono text-[#c8b6b6]">
                  {contextEntry.type === 'folder'
                    ? `Carpeta · ${contextEntry.itemCount} elementos`
                    : `Vídeo · ${contextEntry.duration} · ${contextEntry.sizeLabel}`}
                </p>
              </div>
            </div>

            {contextEntry.type === 'video' && (
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
            )}

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
                setCoverPickerTarget(contextEntry);
                setContextEntry(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#393939]"
            >
              <ImageIcon className="w-4 h-4 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>

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
                onDeleteEntries([contextEntry.id]);
                setContextEntry(null);
              }}
              className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm text-[#ffb4ab] hover:bg-[#393939]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar a papelera</span>
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

      {/* Ficha Técnica de Carpeta (Detalles - Stitch) */}
      {detailsFolder && (
        <FolderDetailsModal
          folder={detailsFolder}
          library={library}
          allEntries={allEntries}
          onClose={() => setDetailsFolderId(null)}
          onToggleFavorite={(folderId) => onToggleFavorite(folderId)}
          onRename={(folder) => setRenameTarget(folder)}
          onChangeCover={(folder) => setCoverPickerTarget(folder)}
          onMove={(folder) => {
            onCopyToClipboard([folder.id], 'cut');
            onShowToast(
              `"${folder.name}" cortada: ve al destino y pulsa Pegar`
            );
          }}
          onDelete={(folderId) => {
            onDeleteEntries([folderId]);
            setDetailsFolderId(null);
          }}
          onUpdateMetadata={onUpdateFolderMetadata}
        />
      )}

      {/* Ficha Técnica de Vídeo (Detalles - Stitch actualizado v2.3) */}
      {detailsVideo && (
        <VideoDetailsModal
          video={detailsVideo}
          library={library}
          allEntries={allEntries}
          onClose={() => setDetailsVideoId(null)}
          onPlay={(video) => onPlayVideo(video)}
          onToggleFavorite={(videoId) => onToggleFavorite(videoId)}
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

      {/* Cambiar Portada Modal (Carpeta: Stitch FolderCoverPickerModal | Vídeo: Stitch VideoCoverPickerModal) */}
      {coverPickerTarget && coverPickerTarget.type === 'folder' && (
        <FolderCoverPickerModal
          folder={coverPickerTarget}
          libraryName={library.name}
          allEntries={allEntries}
          candidateVideos={getDescendantVideos(coverPickerTarget.id)}
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
          folderPathLabel={
            breadcrumbs.length > 0
              ? breadcrumbs.map((b) => b.name).join(' > ')
              : library.name
          }
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

      {/* Empty Space Context Menu */}
      {emptyAreaMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setEmptyAreaMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-[#2a2a2a] rounded-2xl p-2 space-y-1 border border-white/10"
          >
            <button
              type="button"
              disabled={clipboardCount === 0}
              onClick={() => {
                onPasteClipboard();
                setEmptyAreaMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm ${
                clipboardCount > 0
                  ? 'text-[#e5e2e1] hover:bg-[#353534]'
                  : 'text-[#c8b6b6]/40 cursor-not-allowed'
              }`}
            >
              Pegar {clipboardCount > 0 ? `(${clipboardCount})` : '(portapapeles vacío)'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEmptyAreaMenuOpen(false);
                setNewFolderModalOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#353534]"
            >
              Nueva subcarpeta aquí
            </button>
            <button
              type="button"
              onClick={() => {
                setEmptyAreaMenuOpen(false);
                setImportVideoModalOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#353534]"
            >
              Nuevo vídeo
            </button>
            <button
              type="button"
              onClick={() => {
                setEmptyAreaMenuOpen(false);
                if (currentFolder) {
                  setDetailsFolderId(currentFolder.id);
                } else {
                  onOpenFolderDetails();
                }
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#353534]"
            >
              Detalles de esta carpeta
            </button>
          </div>
        </div>
      )}

      {/* New Folder Modal (Stitch) */}
      {newFolderModalOpen && (
        <CreateFolderModal
          libraryId={library.id}
          pathLabel={destinationPathLabel}
          allEntries={allEntries}
          onClose={() => setNewFolderModalOpen(false)}
          onCreateFolder={(name, favorite) => onCreateFolder(name, favorite)}
        />
      )}

      {/* Import Video Modal (Stitch) */}
      {importVideoModalOpen && (
        <ImportVideoModal
          destinationPathLabel={destinationPathLabel}
          allEntries={allEntries}
          onClose={() => setImportVideoModalOpen(false)}
          onImportVideo={onImportVideo}
        />
      )}

      {/* Rename Modal (Stitch Conflict + Valid + Auto-BIS) */}
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
