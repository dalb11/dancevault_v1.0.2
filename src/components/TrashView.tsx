import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckSquare,
  Film,
  Folder,
  FolderOpen,
  Hourglass,
  Instagram,
  LayoutGrid,
  List,
  MoreHorizontal,
  MoreVertical,
  Play,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X,
  Youtube,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
  TrashedLibraryItem,
  VideoEntry,
  ViewMode,
} from '../types/dancevault';
import {
  computeRecursiveFolderSizeMap,
  formatStorageMb,
  getVideoSizeMb,
  parseSizeMb,
} from '../utils/storageSize';
import { DefaultIconCover } from './DefaultIconCover';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';
import { useBackHandler } from '../utils/backNavigation';

export { formatStorageMb, parseSizeMb };

type TrashTypeFilter = 'all' | 'videos' | 'folders';
type TrashSortMode = 'recent' | 'expiring' | 'natural';

interface TrashViewProps {
  libraries: LibraryItem[];
  activeLibrary?: LibraryItem;
  trashedEntries: ExplorerEntry[];
  trashedLibraries: TrashedLibraryItem[];
  activeEntries: ExplorerEntry[];
  initialLibraryScope?: 'all' | 'active';
  onGoToExplorer: (libraryId: string) => void;
  onRestoreItems: (entryIds: string[], libraryTrashIds: string[]) => void;
  onPurgeItems: (entryIds: string[], libraryTrashIds: string[]) => void;
  onPlayVideo?: (video: VideoEntry, queueIds?: string[]) => void;
}

type UnifiedTrashItem =
  | {
      itemKind: 'entry';
      selectionId: string;
      entry: ExplorerEntry;
      name: string;
      coverUrl: string;
      sizeLabel: string;
      sizeMb: number;
      trashedAt?: number;
      originLabel: string;
    }
  | {
      itemKind: 'library';
      selectionId: string;
      trashedLib: TrashedLibraryItem;
      name: string;
      coverUrl: string;
      sizeLabel: string;
      sizeMb: number;
      trashedAt: number;
      originLabel: string;
    };

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export const TrashView: React.FC<TrashViewProps> = ({
  libraries,
  activeLibrary,
  trashedEntries,
  trashedLibraries,
  activeEntries,
  initialLibraryScope = 'all',
  onGoToExplorer,
  onRestoreItems,
  onPurgeItems,
  onPlayVideo,
}) => {
  const [libraryFilter, setLibraryFilter] = useState<string>(
    trashedLibraries.length > 0 || initialLibraryScope === 'all' || !activeLibrary
      ? 'all'
      : activeLibrary.id
  );
  const [typeFilter, setTypeFilter] = useState<TrashTypeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<TrashSortMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMoreOpen, setBatchMoreOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [contextItem, setContextItem] = useState<UnifiedTrashItem | null>(null);
  const [purgeModalTarget, setPurgeModalTarget] = useState<{
    entryIds: string[];
    libraryTrashIds: string[];
    count: number;
    title: string;
    totalMb: number;
  } | null>(null);

  useBackHandler(
    multiSelectMode,
    () => {
      setBatchMoreOpen(false);
      setMultiSelectMode(false);
      setSelectedIds([]);
    },
    30
  );
  useBackHandler(Boolean(contextItem), () => setContextItem(null), 35);
  useBackHandler(
    Boolean(purgeModalTarget),
    () => setPurgeModalTarget(null),
    50
  );

  const libraryMap = useMemo(
    () => new Map(libraries.map((l) => [l.id, l])),
    [libraries]
  );

  const trashedIdSet = useMemo(
    () => new Set(trashedEntries.map((e) => e.id)),
    [trashedEntries]
  );

  const rootTrashedEntries = useMemo(
    () =>
      trashedEntries.filter(
        (e) => !e.parentId || !trashedIdSet.has(e.parentId)
      ),
    [trashedEntries, trashedIdSet]
  );

  const folderTrashStats = useMemo(() => {
    const map = new Map<string, { directCount: number; videoCount: number }>();
    const allFolderMap = new Map(
      trashedEntries
        .filter((e): e is FolderEntry => e.type === 'folder')
        .map((f) => [f.id, f])
    );

    allFolderMap.forEach((_, fid) => {
      const descendants = new Set<string>();
      const queue = [fid];
      let directCount = 0;
      let videoCount = 0;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const item of trashedEntries) {
          if (item.parentId === cur) {
            if (cur === fid) directCount += 1;
            if (!descendants.has(item.id)) {
              descendants.add(item.id);
              if (item.type === 'video') videoCount += 1;
              else queue.push(item.id);
            }
          }
        }
      }
      map.set(fid, { directCount, videoCount });
    });
    return map;
  }, [trashedEntries]);

  const getOriginLabel = (entry: ExplorerEntry): string => {
    if (entry.trashedFromPath) return entry.trashedFromPath;
    const libName = libraryMap.get(entry.libraryId)?.name ?? 'Biblioteca';
    if (!entry.parentId) return `${libName} › Raíz`;
    const allLookup = [...activeEntries, ...trashedEntries];
    const chain: string[] = [];
    let cursor = allLookup.find((e) => e.id === entry.parentId);
    while (cursor) {
      chain.unshift(cursor.name);
      cursor = cursor.parentId
        ? allLookup.find((e) => e.id === cursor!.parentId)
        : undefined;
    }
    return chain.length > 0 ? `${libName} › ${chain.join(' › ')}` : `${libName} › Raíz`;
  };

  const getDaysRemaining = (trashedAt?: number): number => {
    if (!trashedAt) return RETENTION_DAYS;
    const elapsedDays = Math.floor(
      Math.max(0, Date.now() - trashedAt) / MS_PER_DAY
    );
    return Math.max(0, RETENTION_DAYS - elapsedDays);
  };

  const trashedFolderMbMap = useMemo(
    () => computeRecursiveFolderSizeMap(trashedEntries),
    [trashedEntries]
  );

  const unifiedScopedAll = useMemo<UnifiedTrashItem[]>(() => {
    const entryPool =
      libraryFilter === 'libraries'
        ? []
        : libraryFilter === 'all'
          ? rootTrashedEntries
          : rootTrashedEntries.filter((e) => e.libraryId === libraryFilter);

    const libPool =
      libraryFilter === 'all' || libraryFilter === 'libraries'
        ? trashedLibraries
        : [];

    const mappedEntries: UnifiedTrashItem[] = entryPool.map((entry) => {
      const sizeMb =
        entry.type === 'video'
          ? getVideoSizeMb(entry)
          : (trashedFolderMbMap.get(entry.id) ?? 0);
      const sizeLabel =
        entry.type === 'video'
          ? entry.sizeLabel || formatStorageMb(sizeMb)
          : formatStorageMb(sizeMb);
      return {
        itemKind: 'entry',
        selectionId: `entry:${entry.id}`,
        entry,
        name: entry.name,
        coverUrl: entry.coverUrl,
        sizeLabel,
        sizeMb,
        trashedAt: entry.trashedAt,
        originLabel: getOriginLabel(entry),
      };
    });

    const mappedLibs: UnifiedTrashItem[] = libPool.map((tl) => {
      const sizeMb = tl.entries.reduce(
        (sum, entry) =>
          entry.type === 'video' ? sum + getVideoSizeMb(entry) : sum,
        0
      );
      return {
        itemKind: 'library',
        selectionId: `lib:${tl.id}`,
        trashedLib: tl,
        name: tl.library.name,
        coverUrl: tl.library.coverUrl,
        sizeLabel: formatStorageMb(sizeMb),
        sizeMb,
        trashedAt: tl.trashedAt,
        originLabel: 'Bibliotecas › Inicio',
      };
    });

    return [...mappedLibs, ...mappedEntries];
  }, [libraryFilter, rootTrashedEntries, trashedFolderMbMap, trashedLibraries]);

  const scopedFilteredByType = useMemo<UnifiedTrashItem[]>(() => {
    if (typeFilter === 'videos') {
      const libScoped =
        libraryFilter === 'libraries'
          ? []
          : libraryFilter === 'all'
            ? trashedEntries
            : trashedEntries.filter((e) => e.libraryId === libraryFilter);

      return libScoped
        .filter((e): e is VideoEntry => e.type === 'video')
        .map((entry) => {
          const sizeMb = getVideoSizeMb(entry);
          return {
            itemKind: 'entry' as const,
            selectionId: `entry:${entry.id}`,
            entry,
            name: entry.name,
            coverUrl: entry.coverUrl,
            sizeLabel: entry.sizeLabel || formatStorageMb(sizeMb),
            sizeMb,
            trashedAt: entry.trashedAt,
            originLabel: getOriginLabel(entry),
          };
        });
    }

    if (typeFilter === 'folders') {
      return unifiedScopedAll.filter(
        (item) =>
          item.itemKind === 'library' ||
          (item.itemKind === 'entry' && item.entry.type === 'folder')
      );
    }

    return unifiedScopedAll;
  }, [libraryFilter, trashedEntries, typeFilter, unifiedScopedAll]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? scopedFilteredByType.filter((item) => {
          if (item.name.toLowerCase().includes(q)) return true;
          if (item.originLabel.toLowerCase().includes(q)) return true;
          if (
            item.itemKind === 'entry' &&
            item.entry.type === 'video' &&
            item.entry.tags.some((t) => t.toLowerCase().includes(q))
          ) {
            return true;
          }
          if (
            item.itemKind === 'library' &&
            item.trashedLib.library.disciplineLabel.toLowerCase().includes(q)
          ) {
            return true;
          }
          return false;
        })
      : [...scopedFilteredByType];

    if (sortMode === 'natural') {
      list.sort((a, b) => naturalCompare(a.name, b.name));
    } else if (sortMode === 'expiring') {
      list.sort(
        (a, b) => getDaysRemaining(a.trashedAt) - getDaysRemaining(b.trashedAt)
      );
    } else {
      list.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
    }

    return list;
  }, [scopedFilteredByType, searchQuery, sortMode]);

  const summary = useMemo(() => {
    const totalMb = scopedFilteredByType.reduce((sum, e) => sum + e.sizeMb, 0);
    return {
      count: scopedFilteredByType.length,
      totalMb,
      sizeFormatted: formatStorageMb(totalMb),
    };
  }, [scopedFilteredByType]);

  const cycleSortMode = () => {
    const order: TrashSortMode[] = ['recent', 'expiring', 'natural'];
    setSortMode(order[(order.indexOf(sortMode) + 1) % order.length]);
  };

  const sortLabel =
    sortMode === 'recent'
      ? 'Recientes'
      : sortMode === 'expiring'
        ? 'Caducidad'
        : 'A-Z';

  const scopedAllRootCount = unifiedScopedAll.length;
  const totalGlobalCount = rootTrashedEntries.length + trashedLibraries.length;

  const toggleSelectMode = () => {
    if (scopedAllRootCount === 0) return;
    setMultiSelectMode((prev) => {
      if (prev) {
        setSelectedIds([]);
        setBatchMoreOpen(false);
      }
      return !prev;
    });
  };

  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedIds([]);
    setBatchMoreOpen(false);
  };

  const toggleItemSelected = (selectionId: string) => {
    setSelectedIds((prev) =>
      prev.includes(selectionId)
        ? prev.filter((x) => x !== selectionId)
        : [...prev, selectionId]
    );
  };

  const selectedVideos = useMemo(
    () =>
      selectedIds
        .map(
          (sid) =>
            visibleItems.find((i) => i.selectionId === sid) ??
            unifiedScopedAll.find((i) => i.selectionId === sid)
        )
        .filter(
          (item): item is Extract<UnifiedTrashItem, { itemKind: 'entry' }> =>
            Boolean(
              item && item.itemKind === 'entry' && item.entry.type === 'video'
            )
        )
        .map((item) => item.entry as VideoEntry),
    [selectedIds, unifiedScopedAll, visibleItems]
  );

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    selectionId: string
  ) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (multiSelectMode) return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMultiSelectMode(true);
      setSelectedIds((prev) =>
        prev.includes(selectionId) ? prev : [...prev, selectionId]
      );
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

  const handleCardTap = (item: UnifiedTrashItem) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (multiSelectMode) {
      toggleItemSelected(item.selectionId);
    } else {
      setContextItem(item);
    }
  };

  const partitionSelectionIds = (selIds: string[]) => {
    const entryIds: string[] = [];
    const libraryTrashIds: string[] = [];
    selIds.forEach((sid) => {
      if (sid.startsWith('entry:')) entryIds.push(sid.slice(6));
      else if (sid.startsWith('lib:')) libraryTrashIds.push(sid.slice(4));
    });
    return { entryIds, libraryTrashIds };
  };

  const handleOpenPurgeAll = () => {
    if (unifiedScopedAll.length === 0) return;
    const { entryIds, libraryTrashIds } = partitionSelectionIds(
      unifiedScopedAll.map((i) => i.selectionId)
    );
    const totalMb = unifiedScopedAll.reduce((sum, i) => sum + i.sizeMb, 0);
    setPurgeModalTarget({
      entryIds,
      libraryTrashIds,
      count: unifiedScopedAll.length,
      title: '¿Vaciar papelera permanentemente?',
      totalMb,
    });
  };

  const handleOpenPurgeSelected = () => {
    if (selectedIds.length === 0) return;
    const chosen = visibleItems.filter((i) =>
      selectedIds.includes(i.selectionId)
    );
    const { entryIds, libraryTrashIds } = partitionSelectionIds(selectedIds);
    const totalMb = chosen.reduce((sum, i) => sum + i.sizeMb, 0);
    setPurgeModalTarget({
      entryIds,
      libraryTrashIds,
      count: selectedIds.length,
      title:
        selectedIds.length === 1
          ? '¿Eliminar elemento definitivamente?'
          : `¿Eliminar ${selectedIds.length} elementos definitivamente?`,
      totalMb,
    });
  };

  const handleOpenPurgeSingle = (item: UnifiedTrashItem) => {
    const { entryIds, libraryTrashIds } = partitionSelectionIds([
      item.selectionId,
    ]);
    setPurgeModalTarget({
      entryIds,
      libraryTrashIds,
      count: 1,
      title: `¿Eliminar "${item.name}" definitivamente?`,
      totalMb: item.sizeMb,
    });
  };

  const handleConfirmPurge = () => {
    if (!purgeModalTarget) return;
    const { entryIds, libraryTrashIds } = purgeModalTarget;
    setPurgeModalTarget(null);
    setMultiSelectMode(false);
    setSelectedIds([]);
    onPurgeItems(entryIds, libraryTrashIds);
  };

  const handleRestoreSelected = () => {
    if (selectedIds.length === 0) return;
    const { entryIds, libraryTrashIds } = partitionSelectionIds(selectedIds);
    setMultiSelectMode(false);
    setSelectedIds([]);
    onRestoreItems(entryIds, libraryTrashIds);
  };

  const handleRestoreAll = () => {
    if (unifiedScopedAll.length === 0) return;
    const { entryIds, libraryTrashIds } = partitionSelectionIds(
      unifiedScopedAll.map((i) => i.selectionId)
    );
    setMultiSelectMode(false);
    setSelectedIds([]);
    onRestoreItems(entryIds, libraryTrashIds);
  };

  const isGlobalEmpty = totalGlobalCount === 0 || scopedAllRootCount === 0;
  const targetReturnLibId =
    libraryFilter === 'all' || libraryFilter === 'libraries'
      ? activeLibrary?.id ?? ''
      : libraryFilter;

  return (
    <div className="min-h-[calc(100dvh-10rem)] flex flex-col justify-between gap-4 pb-4">
      <div className="space-y-3.5">
        {/* Library Scope Pills */}
        {(libraries.length > 1 || trashedLibraries.length > 0) &&
          totalGlobalCount > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setLibraryFilter('all');
                  setSelectedIds([]);
                }}
                className={`px-2.5 h-[26px] rounded-full text-[11px] font-semibold transition-colors ${
                  libraryFilter === 'all'
                    ? 'bg-[#e5e2e1] text-[#131313]'
                    : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                Todas ({totalGlobalCount})
              </button>

              {trashedLibraries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLibraryFilter('libraries');
                    setSelectedIds([]);
                  }}
                  className={`px-2.5 h-[26px] rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                    libraryFilter === 'libraries'
                      ? 'bg-[#ff5261] text-[#400009]'
                      : 'bg-[#201f1f] text-[#ffb3b3] hover:bg-[#2a2a2a]'
                  }`}
                >
                  <span>Bibliotecas</span>
                  <span className="font-mono text-[10px] opacity-85 tabular-nums shrink-0">
                    {trashedLibraries.length}
                  </span>
                </button>
              )}

              {libraries.map((lib) => {
                const count = rootTrashedEntries.filter(
                  (e) => e.libraryId === lib.id
                ).length;
                const active = libraryFilter === lib.id;
                return (
                  <button
                    key={lib.id}
                    type="button"
                    onClick={() => {
                      setLibraryFilter(lib.id);
                      setSelectedIds([]);
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
          )}

        {/* Sub-header Meta Bar */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {isGlobalEmpty ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#353534]" />
              <span className="font-mono text-xs font-semibold text-[#c8b6b6] tabular-nums uppercase tracking-wider">
                0 elementos
              </span>
              <span className="text-[#c8b6b6]/40 text-xs">•</span>
              <span className="font-mono text-xs font-semibold text-[#c8b6b6]/80 tabular-nums">
                0 B
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[#1c1b1b] px-3.5 py-1.5 rounded-full border border-white/[0.06] shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#ff5261]" />
              <span className="text-xs font-medium text-[#e5e2e1] tabular-nums">
                {summary.count} {summary.count === 1 ? 'elemento' : 'elementos'}
              </span>
              <span className="w-1 h-1 rounded-full bg-[#353534]" />
              <span className="font-mono text-xs font-semibold text-[#c8b6b6] tabular-nums">
                {summary.sizeFormatted}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={isGlobalEmpty}
            onClick={toggleSelectMode}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
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
        </div>

        {/* Retention Policy Notice Banner */}
        {!bannerDismissed && (
          <div className="w-full bg-[#201f1f] rounded-xl p-3.5 border border-white/[0.06] shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-lg bg-[#2a2a2a] flex items-center justify-center shrink-0 ${
                  isGlobalEmpty ? 'text-[#ffb95f]' : 'text-[#ff5261]'
                }`}
              >
                <Hourglass className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-bold text-[#e5e2e1] tracking-tight">
                    Retención de 30 días
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#ffb95f]/15 text-[#ffb95f] font-mono text-[10px] font-semibold uppercase tracking-wider">
                    Auto-purga
                  </span>
                </div>
                <p className="text-xs text-[#c8b6b6] leading-relaxed">
                  {isGlobalEmpty
                    ? 'Los elementos que elimines se guardarán aquí durante 30 días antes de ser eliminados permanentemente.'
                    : 'Los elementos se eliminan definitivamente tras 30 días. Puedes recuperarlos o purgarlos de inmediato.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar aviso de retención"
                onClick={() => setBannerDismissed(true)}
                className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-[#c8b6b6]/70 hover:text-[#e5e2e1] hover:bg-[#2a2a2a] transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Populated Controls: Search + Type Selector + Sort + List/Square Toggle */}
        {!isGlobalEmpty && (
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#c8b6b6] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar en papelera..."
                className="w-full h-11 pl-10 pr-9 rounded-full bg-[#1c1b1b] text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/60 border border-white/[0.06] focus:outline-none focus:border-[#ff5261]"
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

            {multiSelectMode && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#1c1b1b] border border-[#ff5261]/30">
                <span className="text-xs font-semibold text-[#e5e2e1] tabular-nums">
                  {selectedIds.length} seleccionado(s)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const allVisibleIds = visibleItems.map(
                      (i) => i.selectionId
                    );
                    const allChosen =
                      allVisibleIds.length > 0 &&
                      allVisibleIds.every((id) => selectedIds.includes(id));
                    setSelectedIds(allChosen ? [] : allVisibleIds);
                  }}
                  className="text-xs font-semibold text-[#ffb95f] hover:underline px-2 py-1"
                >
                  {visibleItems.length > 0 &&
                  visibleItems.every((i) => selectedIds.includes(i.selectionId))
                    ? 'Deseleccionar'
                    : 'Seleccionar todo'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Empty State Visual Hub vs List/Grid */}
        {isGlobalEmpty ? (
          <div className="flex flex-col items-center justify-center text-center px-4 py-10">
            <div className="relative mb-6 flex items-center justify-center">
              <div className="absolute w-28 h-28 rounded-full bg-[#ffb3b3]/10 blur-xl" />
              <div className="relative w-24 h-24 rounded-full bg-[#2a2a2a] flex items-center justify-center shadow-lg">
                <div className="w-16 h-16 rounded-full bg-[#0e0e0e] flex items-center justify-center shadow-inner">
                  <Trash2 className="w-8 h-8 text-[#ffb3b3] stroke-[1.75]" />
                </div>
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#353534] flex items-center justify-center text-[#ffb95f] shadow-md">
                  <RotateCcw className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <h2 className="text-[22px] font-bold text-[#e5e2e1] tracking-tight mb-2">
              La papelera está vacía
            </h2>
            <p className="text-sm text-[#c8b6b6] max-w-[300px] leading-relaxed mb-6">
              No tienes ningún archivo, vídeo ni coreografía en la papelera. Todo tu contenido activo está a salvo en la biblioteca.
            </p>

            <button
              type="button"
              onClick={() => onGoToExplorer(targetReturnLibId)}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#2a2a2a] hover:bg-[#393939] text-[#e5e2e1] text-sm font-semibold transition-transform active:scale-95 shadow-md"
            >
              <FolderOpen className="w-4 h-4 text-[#4cd7f6]" />
              <span>Volver a mis carpetas</span>
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-12 px-4 rounded-2xl bg-[#1c1b1b] border border-white/[0.06] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#201f1f] text-[#c8b6b6] flex items-center justify-center mx-auto">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#e5e2e1]">
                Ningún elemento coincide con el filtro
              </p>
              <p className="text-xs text-[#c8b6b6]">
                Prueba cambiando el tipo (Todo / Vídeos / Carpetas) o la búsqueda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="h-9 px-4 rounded-xl bg-[#2a2a2a] text-xs font-semibold text-[#e5e2e1]"
            >
              Limpiar filtros
            </button>
          </div>
        ) : viewMode === 'list' ? (
          /* Populated List View */
          <div className="flex flex-col gap-2">
            {visibleItems.map((item) => {
              const isSelected = selectedIds.includes(item.selectionId);
              const thumbKey = `${item.selectionId}:${item.coverUrl}`;
              const thumbFailed = failedThumbs[thumbKey] || !item.coverUrl;
              const daysLeft = getDaysRemaining(item.trashedAt);

              const isLibrary = item.itemKind === 'library';
              const isFolder =
                item.itemKind === 'entry' && item.entry.type === 'folder';

              return (
                <div
                  key={item.selectionId}
                  onPointerDown={(e) => handleCardPointerDown(e, item.selectionId)}
                  onPointerMove={handleCardPointerMove}
                  onPointerUp={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!multiSelectMode) {
                      setMultiSelectMode(true);
                      setSelectedIds((prev) =>
                        prev.includes(item.selectionId)
                          ? prev
                          : [...prev, item.selectionId]
                      );
                    }
                  }}
                  onClick={() => handleCardTap(item)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer select-none active:scale-[0.99] ${
                    isSelected
                      ? 'bg-[#201f1f] border-2 border-[#ff5261] shadow-[0_0_12px_rgba(255,82,97,0.2)]'
                      : isLibrary
                        ? 'bg-[#1c1b1b] border border-[#ff5261]/25 hover:bg-[#23191b]'
                        : 'bg-[#1c1b1b] border border-white/[0.06] hover:bg-[#201f1f]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {multiSelectMode && (
                      <div className="flex items-center justify-center pl-0.5 shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-[#c8b6b6]/70" />
                        )}
                      </div>
                    )}

                    {/* Left Icon / Thumbnail */}
                    {isLibrary ? (
                      <div className="relative w-14 h-14 shrink-0">
                        <div className="w-full h-full rounded-xl overflow-hidden border border-[#ff5261]/50 bg-[#2c171b]">
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
                            <DefaultIconCover
                              kind="library"
                              accentHex={item.trashedLib.library.accentHex}
                              size="sm"
                            />
                          )}
                        </div>
                        <span className="absolute -top-1.5 -right-1.5 bg-[#93000a] text-[#ffdad6] font-mono text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums shadow">
                          {item.trashedLib.library.videosCount}
                        </span>
                      </div>
                    ) : isFolder && item.itemKind === 'entry' ? (
                      (() => {
                        const folderStats = folderTrashStats.get(item.entry.id);
                        const videosInFolder =
                          item.entry.type === 'folder'
                            ? (folderStats?.videoCount ?? item.entry.itemCount)
                            : 0;
                        const badgeCount =
                          videosInFolder > 0
                            ? videosInFolder
                            : item.entry.type === 'folder'
                              ? item.entry.itemCount
                              : 0;
                        return (
                          <div className="relative w-14 h-14 shrink-0">
                            <div className="w-full h-full rounded-xl overflow-hidden border border-[#ffb95f]/30 bg-[#2a2a2a]">
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
                                <DefaultIconCover
                                  kind="folder"
                                  favorite={item.entry.favorite}
                                  size="sm"
                                />
                              )}
                            </div>
                            <span className="absolute -top-1.5 -right-1.5 bg-[#353534] text-[#ffb95f] font-mono text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums shadow">
                              {badgeCount}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="relative w-[72px] h-[56px] rounded-xl overflow-hidden shrink-0 bg-[#353534]">
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
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <VideoCoverPlaceholder
                            sourceType={
                              item.itemKind === 'entry' &&
                              item.entry.type === 'video'
                                ? item.entry.sourceType
                                : 'local'
                            }
                            size="sm"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e]/80 via-transparent to-transparent pointer-events-none" />
                        <span className="absolute top-1 left-1 font-mono text-[8px] font-bold px-1 bg-[#ff5261] text-[#400009] rounded">
                          {item.itemKind === 'entry' &&
                          item.entry.type === 'video' &&
                          item.entry.sourceType === 'instagram'
                            ? 'IG'
                            : item.itemKind === 'entry' &&
                                item.entry.type === 'video' &&
                                item.entry.sourceType === 'youtube'
                              ? 'YT'
                              : 'HD'}
                        </span>
                        {item.itemKind === 'entry' &&
                          item.entry.type === 'video' && (
                            <span className="absolute bottom-1 right-1 font-mono text-[9px] px-1 bg-[#0e0e0e]/90 text-[#e5e2e1] rounded tabular-nums">
                              {item.entry.duration}
                            </span>
                          )}
                      </div>
                    )}

                    {/* Title & Meta */}
                    <div className="flex flex-col min-w-0 flex-1 pr-1">
                      <h3 className="text-[15px] font-semibold text-[#e5e2e1] truncate leading-tight">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-[#c8b6b6]/80 truncate mt-0.5">
                        {isLibrary
                          ? `Biblioteca · ${item.trashedLib.library.disciplineLabel}`
                          : item.originLabel}
                      </p>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#c8b6b6] mt-0.5 truncate tabular-nums">
                        {isLibrary && (
                          <>
                            <span className="text-[#ffb3b3]">
                              {item.trashedLib.library.foldersCount} carp. ·{' '}
                              {item.trashedLib.library.videosCount} víd.
                            </span>
                            <span className="text-[#c8b6b6]/50">•</span>
                          </>
                        )}
                        {isFolder &&
                          item.itemKind === 'entry' &&
                          (() => {
                            const folderStats = folderTrashStats.get(
                              item.entry.id
                            );
                            const videosInFolder =
                              item.entry.type === 'folder'
                                ? (folderStats?.videoCount ??
                                  item.entry.itemCount)
                                : 0;
                            return (
                              <>
                                <span>
                                  {videosInFolder}{' '}
                                  {videosInFolder === 1 ? 'vídeo' : 'vídeos'}
                                </span>
                                <span className="text-[#c8b6b6]/50">•</span>
                              </>
                            );
                          })()}
                        <span>{item.sizeLabel}</span>
                        <span className="text-[#c8b6b6]/50">•</span>
                        <span
                          className={
                            daysLeft <= 7 || isLibrary
                              ? 'text-[#ffb4ab] font-semibold'
                              : isFolder
                                ? 'text-[#ffb95f] font-medium'
                                : 'text-[#c8b6b6]'
                          }
                        >
                          {daysLeft}d restantes
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  {!multiSelectMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Restaurar ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.itemKind === 'library') {
                            onRestoreItems([], [item.trashedLib.id]);
                          } else {
                            onRestoreItems([item.entry.id], []);
                          }
                        }}
                        className="w-10 h-10 rounded-full bg-[#201f1f] flex items-center justify-center text-[#e5e2e1] hover:text-[#4cd7f6] hover:bg-[#2a2a2a] transition-colors active:scale-90 shadow-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Más opciones de ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextItem(item);
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] transition-colors active:scale-90"
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
          /* Populated Square Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleItems.map((item) => {
              const isSelected = selectedIds.includes(item.selectionId);
              const thumbKey = `${item.selectionId}:${item.coverUrl}`;
              const thumbFailed = failedThumbs[thumbKey] || !item.coverUrl;
              const daysLeft = getDaysRemaining(item.trashedAt);

              const isLibrary = item.itemKind === 'library';
              const isFolder =
                item.itemKind === 'entry' && item.entry.type === 'folder';

              return (
                <div
                  key={item.selectionId}
                  onPointerDown={(e) => handleCardPointerDown(e, item.selectionId)}
                  onPointerMove={handleCardPointerMove}
                  onPointerUp={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!multiSelectMode) {
                      setMultiSelectMode(true);
                      setSelectedIds((prev) =>
                        prev.includes(item.selectionId)
                          ? prev
                          : [...prev, item.selectionId]
                      );
                    }
                  }}
                  onClick={() => handleCardTap(item)}
                  className={`group flex flex-col rounded-xl overflow-hidden transition-all cursor-pointer select-none active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[#201f1f] border-2 border-[#ff5261] shadow-[0_0_12px_rgba(255,82,97,0.25)]'
                      : isLibrary
                        ? 'bg-[#201f1f] border border-[#ff5261]/35 hover:border-[#ff5261]/65 hover:bg-[#2a2a2a]'
                        : isFolder
                          ? 'bg-[#201f1f] border border-[#ffb95f]/25 hover:border-[#ffb95f]/45 hover:bg-[#2a2a2a]'
                          : 'bg-[#201f1f] border border-white/[0.06] hover:bg-[#2a2a2a]'
                  }`}
                >
                  {isLibrary ? (
                    /* Whole Deleted Library in Square Mode: Same Stacked-Folder Geometry, Redder Palette, Tab Label "Biblioteca" */
                    <div className="relative w-full aspect-[4/3] bg-[#151414] px-2 pt-2 pb-1 flex flex-col justify-end">
                      <div className="mx-3 h-1.5 rounded-t-md bg-[#381c20] border-t border-x border-[#ff5261]/40" />
                      <div className="relative flex items-end">
                        <div className="h-6 px-3 rounded-t-xl bg-[#2c171b] border-t-2 border-x border-[#ff5261] flex items-center gap-1.5 shadow-sm z-10">
                          <Folder className="w-3.5 h-3.5 text-[#ff5261] fill-[#ff5261]/35 shrink-0" />
                          <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#ffb3b3]">
                            Biblioteca
                          </span>
                        </div>
                        <div className="flex-1 h-2 bg-[#251518] rounded-tr-lg border-t border-r border-[#ff5261]/35" />
                      </div>
                      <div className="relative flex-1 w-full rounded-xl rounded-tl-none overflow-hidden bg-[#2a2a2a] border border-[#ff5261]/60 shadow-[0_8px_20px_rgba(0,0,0,0.55)]">
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
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <DefaultIconCover
                            kind="library"
                            accentHex={item.trashedLib.library.accentHex}
                            size="md"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#131313]/75 via-transparent to-black/15 pointer-events-none" />
                        <div className="absolute bottom-2 right-2 bg-[#131313]/85 backdrop-blur-sm px-2 py-0.5 rounded font-mono text-[10px] font-semibold text-[#ffb3b3] tabular-nums">
                          {daysLeft}d
                        </div>
                        {multiSelectMode && (
                          <div className="absolute top-1.5 left-1.5 z-10">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center shadow">
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
                            aria-label={`Restaurar ${item.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestoreItems([], [item.trashedLib.id]);
                            }}
                            className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-[#131313]/80 backdrop-blur-sm text-[#4cd7f6] flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isFolder ? (
                    /* Deleted Folder in Square Mode */
                    <div className="relative w-full aspect-[4/3] bg-[#151414] px-2 pt-2 pb-1 flex flex-col justify-end">
                      <div className="mx-3 h-1.5 rounded-t-md bg-[#352e27] border-t border-x border-[#ffb95f]/35" />
                      <div className="relative flex items-end">
                        <div className="h-6 px-3 rounded-t-xl bg-[#2a241e] border-t-2 border-x border-[#ffb95f] flex items-center gap-1.5 shadow-sm z-10">
                          <Folder className="w-3.5 h-3.5 text-[#ffb95f] fill-[#ffb95f]/35 shrink-0" />
                          <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-[#ffb95f]">
                            Carpeta
                          </span>
                        </div>
                        <div className="flex-1 h-2 bg-[#25211d] rounded-tr-lg border-t border-r border-[#ffb95f]/30" />
                      </div>
                      <div className="relative flex-1 w-full rounded-xl rounded-tl-none overflow-hidden bg-[#2a2a2a] border border-[#ffb95f]/55 shadow-[0_8px_20px_rgba(0,0,0,0.55)]">
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
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <DefaultIconCover
                            kind="folder"
                            favorite={
                              item.itemKind === 'entry'
                                ? item.entry.favorite
                                : false
                            }
                            size="md"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#131313]/70 via-transparent to-black/15 pointer-events-none" />
                        <div className="absolute bottom-2 right-2 bg-[#131313]/85 backdrop-blur-sm px-2 py-0.5 rounded font-mono text-[10px] font-semibold text-[#ffb95f] tabular-nums">
                          {daysLeft}d
                        </div>
                        {multiSelectMode && (
                          <div className="absolute top-1.5 left-1.5 z-10">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center shadow">
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
                            aria-label={`Restaurar ${item.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.itemKind === 'entry') {
                                onRestoreItems([item.entry.id], []);
                              }
                            }}
                            className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-[#131313]/80 backdrop-blur-sm text-[#4cd7f6] flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Deleted Video in Square Mode */
                    <div className="relative w-full aspect-[4/3] bg-[#353534] overflow-hidden">
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
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <VideoCoverPlaceholder
                          sourceType={
                            item.itemKind === 'entry' &&
                            item.entry.type === 'video'
                              ? item.entry.sourceType
                              : 'local'
                          }
                          size="md"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#131313]/70 via-transparent to-black/15 pointer-events-none" />
                      {!multiSelectMode &&
                        item.itemKind === 'entry' &&
                        item.entry.type === 'video' && (
                          <div className="absolute top-2 left-2 bg-[#ff5261] text-[#400009] font-mono text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow">
                            {item.entry.sourceType === 'instagram' ? (
                              <>
                                <Instagram className="w-2.5 h-2.5" />
                                <span>IG</span>
                              </>
                            ) : item.entry.sourceType === 'youtube' ? (
                              <>
                                <Youtube className="w-2.5 h-2.5" />
                                <span>YT</span>
                              </>
                            ) : (
                              <span>HD</span>
                            )}
                          </div>
                        )}
                      <div className="absolute bottom-2 left-2 bg-[#131313]/85 backdrop-blur-md px-1.5 py-0.5 rounded font-mono text-[10px] text-[#ffb95f] tabular-nums">
                        {daysLeft}d
                      </div>
                      {item.itemKind === 'entry' &&
                        item.entry.type === 'video' && (
                          <div className="absolute bottom-2 right-2 bg-[#131313]/85 backdrop-blur-md px-1.5 py-0.5 rounded font-mono text-[10px] text-[#e5e2e1] tabular-nums">
                            {item.entry.duration}
                          </div>
                        )}
                      {multiSelectMode && (
                        <div className="absolute top-1.5 left-1.5 z-10">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center shadow">
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
                          aria-label={`Restaurar ${item.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.itemKind === 'entry') {
                              onRestoreItems([item.entry.id], []);
                            }
                          }}
                          className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-[#131313]/80 backdrop-blur-sm text-[#4cd7f6] flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-2.5 flex items-center justify-between gap-1.5">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-semibold text-[#e5e2e1] truncate leading-tight">
                        {item.name}
                      </h4>
                      <span className="text-[10px] text-[#c8b6b6] truncate mt-0.5 tabular-nums flex items-center gap-1">
                        {item.itemKind === 'entry' &&
                          item.entry.type === 'video' &&
                          (item.entry.sourceType === 'instagram' ? (
                            <Instagram className="w-3 h-3 text-[#ffb3b3] shrink-0" />
                          ) : item.entry.sourceType === 'youtube' ? (
                            <Youtube className="w-3 h-3 text-[#ff5261] shrink-0" />
                          ) : (
                            <Film className="w-3 h-3 text-[#ffb3b3] shrink-0" />
                          ))}
                        <span className="truncate">
                          {isLibrary
                            ? `${item.trashedLib.library.videosCount} víd. · ${item.sizeLabel}`
                            : `${
                                item.itemKind === 'entry'
                                  ? libraryMap.get(item.entry.libraryId)?.name ??
                                    'Biblioteca'
                                  : 'Biblioteca'
                              } · ${item.sizeLabel}`}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Opciones de ${item.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextItem(item);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Action Shelf */}
      <div className="w-full pt-3 mt-auto">
        {isGlobalEmpty ? (
          <div className="bg-[#1c1b1b] rounded-xl p-2 flex items-center gap-2 border border-white/[0.05] shadow-md">
            <button
              type="button"
              disabled
              className="flex-1 h-12 rounded-lg bg-[#201f1f] flex items-center justify-center gap-2 text-[#c8b6b6]/40 text-sm font-semibold opacity-40 cursor-not-allowed select-none"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restaurar todo</span>
            </button>
            <button
              type="button"
              disabled
              className="flex-1 h-12 rounded-lg bg-[#93000a]/20 flex items-center justify-center gap-2 text-[#ffb4ab]/40 text-sm font-semibold opacity-40 cursor-not-allowed select-none"
            >
              <Trash2 className="w-4 h-4" />
              <span>Vaciar papelera</span>
            </button>
          </div>
        ) : multiSelectMode ? (
          <div className="relative flex items-center gap-2.5">
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleRestoreSelected}
              className="flex-1 h-12 rounded-full bg-[#2a2a2a] hover:bg-[#393939] disabled:opacity-40 active:scale-95 text-[#e5e2e1] text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <RotateCcw className="w-4 h-4 text-[#4cd7f6]" />
              <span>Restaurar ({selectedIds.length})</span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleOpenPurgeSelected}
              className="flex-1 h-12 rounded-full bg-[#ff5261] hover:opacity-95 disabled:opacity-40 active:scale-95 text-[#400009] text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar ({selectedIds.length})</span>
            </button>
            <button
              type="button"
              aria-label="Más acciones de selección"
              onClick={() => setBatchMoreOpen((prev) => !prev)}
              className="w-12 h-12 rounded-full bg-[#2a2a2a] hover:bg-[#393939] border border-white/10 text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-95 transition-all"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {batchMoreOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-[#201f1f] border border-white/10 rounded-xl shadow-2xl p-1.5 space-y-1 z-50">
                {selectedIds.length >= 2 &&
                  selectedIds.length <= 5 &&
                  selectedVideos.length === selectedIds.length &&
                  Boolean(onPlayVideo) && (
                  <button
                    type="button"
                    onClick={() => {
                      onPlayVideo?.(
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
                    const allVisibleIds = visibleItems.map((i) => i.selectionId);
                    const allChosen =
                      allVisibleIds.length > 0 &&
                      allVisibleIds.every((id) => selectedIds.includes(id));
                    setSelectedIds(allChosen ? [] : allVisibleIds);
                    setBatchMoreOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#e5e2e1] hover:bg-[#2a2a2a]"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  <span>
                    {visibleItems.length > 0 &&
                    visibleItems.every((i) => selectedIds.includes(i.selectionId))
                      ? 'Deseleccionar todo'
                      : `Seleccionar todo (${visibleItems.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={exitMultiSelect}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#c8b6b6] hover:bg-[#2a2a2a]"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Salir de selección</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleRestoreAll}
              className="h-12 rounded-full bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 text-[#e5e2e1] text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restaurar todo</span>
            </button>
            <button
              type="button"
              onClick={handleOpenPurgeAll}
              className="h-12 rounded-full bg-[#ff5261] hover:opacity-95 active:scale-95 text-[#400009] text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Vaciar papelera</span>
            </button>
          </div>
        )}
      </div>

      {/* Item Context Bottom Sheet */}
      {contextItem && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setContextItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#201f1f] rounded-2xl border border-white/10 p-4 space-y-2 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.06]">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#e5e2e1] truncate">
                  {contextItem.name}
                </p>
                <p className="text-[11px] text-[#c8b6b6] truncate mt-0.5">
                  Origen: {contextItem.originLabel}
                </p>
                <p className="font-mono text-[10px] text-[#ffb95f] mt-0.5 tabular-nums">
                  {contextItem.sizeLabel} ·{' '}
                  {getDaysRemaining(contextItem.trashedAt)} días restantes
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setContextItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#c8b6b6] hover:bg-[#2a2a2a] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const target = contextItem;
                setContextItem(null);
                if (target.itemKind === 'library') {
                  onRestoreItems([], [target.trashedLib.id]);
                } else {
                  onRestoreItems([target.entry.id], []);
                }
              }}
              className="w-full px-3 py-3 rounded-xl text-sm font-semibold text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-3 text-left"
            >
              <RotateCcw className="w-4 h-4 text-[#4cd7f6]" />
              <span>Restaurar a su ubicación original</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = contextItem;
                setContextItem(null);
                handleOpenPurgeSingle(target);
              }}
              className="w-full px-3 py-3 rounded-xl text-sm font-semibold text-[#ffb4ab] hover:bg-[#93000a]/25 flex items-center gap-3 text-left"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar definitivamente</span>
            </button>
          </div>
        </div>
      )}

      {/* Permanent Deletion Confirmation Modal */}
      {purgeModalTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setPurgeModalTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#201f1f] w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl flex flex-col gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-[#93000a]/30 text-[#ffb4ab] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-[#e5e2e1] leading-snug">
                {purgeModalTarget.title}
              </h4>
              <p className="text-sm text-[#c8b6b6] mt-1.5 leading-relaxed">
                Esta acción borrará definitivamente{' '}
                <span className="font-semibold text-[#e5e2e1] tabular-nums">
                  {purgeModalTarget.count}{' '}
                  {purgeModalTarget.count === 1 ? 'elemento' : 'elementos'}
                </span>{' '}
                y liberará{' '}
                <span className="font-mono font-semibold text-[#e5e2e1] tabular-nums">
                  {formatStorageMb(purgeModalTarget.totalMb)}
                </span>
                . No podrás revertirla.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmPurge}
                className="h-12 w-full rounded-full bg-[#ffb4ab] text-[#690005] font-bold text-sm flex items-center justify-center active:scale-95 transition-transform"
              >
                Sí, eliminar para siempre
              </button>
              <button
                type="button"
                onClick={() => setPurgeModalTarget(null)}
                className="h-12 w-full rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] font-semibold text-sm active:scale-95 transition-transform"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
