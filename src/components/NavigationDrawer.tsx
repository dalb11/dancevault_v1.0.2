import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Film,
  Folder,
  FolderOpen,
  HardDrive,
  Layers,
  Library,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { DanceVaultLogo } from './DanceVaultLogo';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
  VideoEntry,
} from '../types/dancevault';

interface NavigationDrawerProps {
  libraries: LibraryItem[];
  activeLibrary: LibraryItem;
  primaryLibraryId: string;
  screen: 'libraries' | 'explorer' | 'favorites' | 'recents' | 'trash';
  currentFolderId: string | null;
  flatVideosMode?: boolean;
  allEntries: ExplorerEntry[];
  trashedEntries?: ExplorerEntry[];
  recentCount: number;
  trashCount: number;
  onClose: () => void;
  onSelectLibraryRoot: (libraryId: string) => void;
  onSelectAllVideosFlat: (libraryId: string) => void;
  onSelectFolder: (libraryId: string, folderId: string) => void;
  onSelectVideoLeaf: (libraryId: string, video: VideoEntry) => void;
  onOpenFavorites: () => void;
  onOpenRecents: () => void;
  onOpenTrash: (libraryId: string) => void;
  onOpenLibrarySettings: (library: LibraryItem) => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  libraries,
  activeLibrary,
  primaryLibraryId,
  screen,
  currentFolderId,
  flatVideosMode = false,
  allEntries,
  trashedEntries,
  recentCount,
  trashCount,
  onClose,
  onSelectLibraryRoot,
  onSelectAllVideosFlat,
  onSelectFolder,
  onSelectVideoLeaf,
  onOpenFavorites,
  onOpenRecents,
  onOpenTrash,
  onOpenLibrarySettings,
}) => {
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [viewedLibId, setViewedLibId] = useState(activeLibrary.id);
  const touchStartX = useRef<number | null>(null);

  const viewedLibrary = useMemo(
    () => libraries.find((l) => l.id === viewedLibId) ?? activeLibrary,
    [activeLibrary, libraries, viewedLibId]
  );

  // Auto-expand ancestor folders of the active folder on open
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    let cursor = currentFolderId
      ? allEntries.find(
          (e): e is FolderEntry =>
            e.id === currentFolderId && e.type === 'folder'
        )
      : undefined;
    while (cursor) {
      set.add(cursor.id);
      cursor = cursor.parentId
        ? allEntries.find(
            (e): e is FolderEntry =>
              e.id === cursor!.parentId && e.type === 'folder'
          )
        : undefined;
    }
    return Array.from(set);
  }, [allEntries, currentFolderId]);

  const [expandedIds, setExpandedIds] = useState<string[]>(initialExpanded);

  const toggleExpand = (folderId: string) => {
    setExpandedIds((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId]
    );
  };

  const libEntries = useMemo(
    () => allEntries.filter((e) => e.libraryId === viewedLibrary.id),
    [allEntries, viewedLibrary.id]
  );

  const rootFolders = useMemo(
    () =>
      libEntries.filter(
        (e): e is FolderEntry => e.type === 'folder' && e.parentId === null
      ),
    [libEntries]
  );

  const rootVideos = useMemo(
    () =>
      libEntries.filter(
        (e): e is VideoEntry => e.type === 'video' && e.parentId === null
      ),
    [libEntries]
  );

  const favoritesCount = useMemo(
    () => libEntries.filter((e) => e.favorite).length,
    [libEntries]
  );

  const totalVideosCount = useMemo(
    () => libEntries.filter((e) => e.type === 'video').length,
    [libEntries]
  );

  const viewedTrashCount = useMemo(
    () =>
      trashedEntries
        ? trashedEntries.filter((e) => e.libraryId === viewedLibrary.id).length
        : trashCount,
    [trashedEntries, trashCount, viewedLibrary.id]
  );

  const renderFolderBranch = (folder: FolderEntry, depth = 0) => {
    const childFolders = libEntries.filter(
      (e): e is FolderEntry => e.type === 'folder' && e.parentId === folder.id
    );
    const childVideos = libEntries.filter(
      (e): e is VideoEntry => e.type === 'video' && e.parentId === folder.id
    );
    const hasChildren = childFolders.length > 0 || childVideos.length > 0;
    const isExpanded = expandedIds.includes(folder.id);
    const isSelected =
      screen === 'explorer' &&
      !flatVideosMode &&
      currentFolderId === folder.id &&
      activeLibrary.id === viewedLibrary.id;

    return (
      <div key={folder.id} className="flex flex-col">
        <div
          className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl transition-all ${
            isSelected
              ? 'bg-[#ff5261]/20 shadow-[0_0_12px_rgba(255,82,97,0.22)]'
              : 'hover:bg-[#201f1f]'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              type="button"
              aria-label={isExpanded ? `Contraer ${folder.name}` : `Expandir ${folder.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleExpand(folder.id);
              }}
              className={`w-6 h-7 flex items-center justify-center rounded-md shrink-0 transition-transform ${
                hasChildren
                  ? 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                  : 'opacity-25 cursor-default'
              }`}
            >
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  isExpanded && hasChildren ? 'rotate-90 text-[#ffb3b3]' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectFolder(viewedLibrary.id, folder.id);
                onClose();
              }}
              className="flex items-center gap-2 min-w-0 flex-1 py-1 text-left"
            >
              {isExpanded || isSelected ? (
                <FolderOpen
                  className={`w-4 h-4 shrink-0 ${
                    isSelected
                      ? 'text-[#ffb3b3]'
                      : depth === 0
                        ? 'text-[#ffb95f]'
                        : 'text-[#4cd7f6]'
                  }`}
                />
              ) : (
                <Folder
                  className={`w-4 h-4 shrink-0 ${
                    depth === 0 ? 'text-[#ffb95f]' : 'text-[#c8b6b6]'
                  }`}
                />
              )}

              <span
                className={`text-sm truncate ${
                  isSelected
                    ? 'font-bold text-[#ffb3b3]'
                    : depth === 0
                      ? 'font-semibold text-[#e5e2e1]'
                      : 'font-medium text-[#c8b6b6]'
                }`}
              >
                {folder.name}
              </span>
            </button>
          </div>

          {isSelected ? (
            <CheckCircle2 className="w-4 h-4 text-[#ffb3b3] shrink-0 mr-1" />
          ) : (
            <span className="font-mono text-[11px] text-[#c8b6b6]/75 tabular-nums pr-1.5 shrink-0">
              {folder.itemCount}
            </span>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div className="pl-5 ml-2.5 border-l border-white/[0.06] flex flex-col gap-0.5 mt-0.5 mb-1">
            {childFolders.map((sub) => renderFolderBranch(sub, depth + 1))}

            {childVideos.map((vid) => (
              <button
                key={vid.id}
                type="button"
                onClick={() => {
                  onSelectVideoLeaf(viewedLibrary.id, vid);
                  onClose();
                }}
                className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg hover:bg-[#2a2a2a] text-left group transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-[#ff5261]'
                        : 'bg-[#353534] group-hover:bg-[#ffb3b3]'
                    }`}
                  />
                  <span className="text-xs text-[#c8b6b6] group-hover:text-[#e5e2e1] truncate">
                    {vid.name}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#c8b6b6]/70 tabular-nums shrink-0">
                  {vid.duration}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
    >
      {/* Dimmed Backdrop */}
      <div className="fixed inset-0 bg-[#0e0e0e]/75 backdrop-blur-sm transition-opacity" />

      {/* Android-style Navigation Drawer */}
      <aside
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const deltaX = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (deltaX < -60) onClose();
        }}
        className="relative w-[84%] max-w-[340px] h-full bg-[#1c1b1b] shadow-[8px_0_32px_rgba(0,0,0,0.85)] border-r border-white/[0.08] flex flex-col justify-between pt-safe pb-safe z-10 overflow-hidden"
      >
        {/* Top Section: Header, Library Switcher & Metrics Strip */}
        <div className="p-4 pb-2 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <DanceVaultLogo size={40} />

              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#ffb95f]">
                  DanceVault
                </span>
                <button
                  type="button"
                  onClick={() => setLibraryPickerOpen((prev) => !prev)}
                  className="flex items-center gap-1 text-left group min-w-0 max-w-full"
                >
                  <span className="text-sm font-bold text-[#e5e2e1] truncate group-hover:text-[#ffb3b3] transition-colors">
                    {viewedLibrary.name}
                  </span>
                  <ChevronsUpDown className="w-4 h-4 text-[#c8b6b6] shrink-0" />
                </button>
              </div>
            </div>

            <button
              type="button"
              aria-label="Cerrar menú lateral"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-90 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Expandable Library Switcher Dropdown */}
          {libraryPickerOpen && (
            <div className="bg-[#201f1f] rounded-xl p-1.5 border border-white/[0.08] space-y-1 max-h-48 overflow-y-auto">
              {libraries.map((lib) => {
                const isViewed = lib.id === viewedLibrary.id;
                const isPrimary = lib.id === primaryLibraryId;
                return (
                  <button
                    key={lib.id}
                    type="button"
                    onClick={() => {
                      setViewedLibId(lib.id);
                      setLibraryPickerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                      isViewed
                        ? 'bg-[#ff5261]/20 text-[#ffb3b3] font-bold'
                        : 'text-[#e5e2e1] hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Library className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{lib.name}</span>
                    </span>
                    {isPrimary && (
                      <Star className="w-3 h-3 text-[#ffb95f] fill-current shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Metrics Strip */}
          <div className="flex items-center justify-between bg-[#201f1f] px-3.5 py-2 rounded-xl shadow-inner border border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              <Film className="w-4 h-4 text-[#4cd7f6]" />
              <span className="font-mono text-[11px] font-semibold text-[#e5e2e1] tabular-nums">
                {viewedLibrary.videosCount} Clips
              </span>
            </div>
            <div className="h-3 w-px bg-[#353534]" />
            <div className="flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-[#ffb95f]" />
              <span className="font-mono text-[11px] font-semibold text-[#e5e2e1] tabular-nums">
                {viewedLibrary.foldersCount} Carp.
              </span>
            </div>
            <div className="h-3 w-px bg-[#353534]" />
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-[#ffb3b3]" />
              <span className="font-mono text-[11px] font-semibold text-[#e5e2e1] tabular-nums">
                {viewedLibrary.sizeLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Middle Section: Interactive Hierarchical Folder Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          {/* Library Root Quick Target */}
          <button
            type="button"
            onClick={() => {
              onSelectLibraryRoot(viewedLibrary.id);
              onClose();
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
              screen === 'explorer' &&
              !flatVideosMode &&
              currentFolderId === null &&
              activeLibrary.id === viewedLibrary.id
                ? 'bg-[#ff5261]/20 text-[#ffb3b3] font-bold shadow-[0_0_12px_rgba(255,82,97,0.2)]'
                : 'text-[#c8b6b6] hover:bg-[#201f1f] hover:text-[#e5e2e1]'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Library className="w-4 h-4 text-[#ffb3b3] shrink-0" />
              <span className="text-xs font-semibold truncate">
                Inicio de {viewedLibrary.name}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider opacity-75">
              Raíz
            </span>
          </button>

          {/* Flattened All-Videos Virtual Folder */}
          <button
            type="button"
            onClick={() => {
              onSelectAllVideosFlat(viewedLibrary.id);
              onClose();
            }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
              screen === 'explorer' &&
              flatVideosMode &&
              activeLibrary.id === viewedLibrary.id
                ? 'bg-[#ff5261]/20 text-[#ffb3b3] font-bold shadow-[0_0_12px_rgba(255,82,97,0.2)]'
                : 'text-[#c8b6b6] hover:bg-[#201f1f] hover:text-[#e5e2e1]'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-[#4cd7f6] shrink-0" />
              <span className="text-xs font-semibold truncate">
                Todos los vídeos
              </span>
            </span>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#4cd7f6]/15 text-[#4cd7f6] tabular-nums shrink-0">
              {totalVideosCount}
            </span>
          </button>

          {rootFolders.length === 0 && rootVideos.length === 0 ? (
            <div className="py-8 px-3 text-center text-xs text-[#c8b6b6]/70">
              Esta biblioteca aún no tiene carpetas.
            </div>
          ) : (
            <div className="space-y-0.5 pt-1">
              {rootFolders.map((folder) => renderFolderBranch(folder, 0))}

              {rootVideos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => {
                    onSelectVideoLeaf(viewedLibrary.id, vid);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg hover:bg-[#201f1f] text-left group transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Film className="w-3.5 h-3.5 text-[#ffb3b3] shrink-0" />
                    <span className="text-xs text-[#c8b6b6] group-hover:text-[#e5e2e1] truncate">
                      {vid.name}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#c8b6b6]/70 tabular-nums shrink-0">
                    {vid.duration}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Section: Persistent Direct Access Hub */}
        <div className="p-2.5 bg-[#201f1f] rounded-t-2xl shadow-lg border-t border-white/[0.06] space-y-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFavorites();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl active:scale-[0.98] transition-all text-left group ${
              screen === 'favorites'
                ? 'bg-[#ffb95f]/15 text-[#ffb95f]'
                : 'hover:bg-[#2a2a2a]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Star className="w-5 h-5 text-[#ffb95f] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-[#e5e2e1]">Favoritos</span>
            </span>
            <span className="font-mono text-xs font-bold bg-[#ffb95f]/15 text-[#ffb95f] px-2 py-0.5 rounded-full tabular-nums">
              {favoritesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRecents();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl active:scale-[0.98] transition-all text-left group ${
              screen === 'recents'
                ? 'bg-[#4cd7f6]/15 text-[#4cd7f6]'
                : 'hover:bg-[#2a2a2a]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-[#4cd7f6] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-[#e5e2e1]">Recientes</span>
            </span>
            <span className="font-mono text-xs font-bold bg-[#4cd7f6]/15 text-[#4cd7f6] px-2 py-0.5 rounded-full tabular-nums">
              {recentCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTrash(viewedLibrary.id);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl active:scale-[0.98] transition-all text-left group ${
              screen === 'trash'
                ? 'bg-[#ffb4ab]/15 text-[#ffb4ab]'
                : 'hover:bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Trash2 className="w-4 h-4 group-hover:text-[#ffb4ab] transition-colors" />
              <span className="text-sm">Papelera</span>
            </span>
            <span className="font-mono text-xs text-[#c8b6b6] tabular-nums">
              {viewedTrashCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenLibrarySettings(viewedLibrary);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#2a2a2a] active:scale-[0.98] transition-all text-left text-[#c8b6b6] hover:text-[#e5e2e1] group"
          >
            <span className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 group-hover:text-[#ffb3b3] transition-colors" />
              <span className="text-sm">Ajustes de Biblioteca</span>
            </span>
            <ChevronRight className="w-4 h-4 text-[#c8b6b6]" />
          </button>
        </div>
      </aside>
    </div>
  );
};
