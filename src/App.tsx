/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Copy,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Heart,
  History,
  Image as ImageIcon,
  Info,
  Library,
  MoreVertical,
  Pencil,
  Play,
  PlusCircle,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { CreateLibraryModal } from './components/CreateLibraryModal';
import { FavoritesView } from './components/FavoritesView';
import { FolderExplorerView } from './components/FolderExplorerView';
import { ImportVideoPayload } from './components/ImportVideoModal';
import {
  LibraryBackupConfirmModal,
  LibraryBackupDialogState,
} from './components/LibraryBackupConfirmModal';
import { LibraryDetailsModal } from './components/LibraryDetailsModal';
import {
  MoveToTrashModal,
  PendingTrashRequest,
} from './components/MoveToTrashModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { RecentsView } from './components/RecentsView';
import { RenameEntryModal } from './components/RenameEntryModal';
import { TrashView } from './components/TrashView';
import { UserProfilesModal } from './components/UserProfilesModal';
import { pasteClipboardEntries } from './utils/clipboardUtils';
import {
  buildLibraryBackupPayload,
  getLibraryBackupStats,
  materializeImportedLibrary,
  parseLibraryBackupPayload,
  ParsedLibraryBackup,
  resolveImportedLibraryName,
  slugifyLibraryFileName,
} from './utils/libraryBackupUtils';
import {
  BYTES_PER_MB,
  computeRecursiveFolderSizeMap,
  formatStorageMb,
  getVideoSizeMb,
} from './utils/storageSize';
import {
  cloneUserWorkspace,
  createEmptyUserWorkspace,
  getUniqueCopyProfileName,
  getUniqueProfileName,
  sanitizeUserWorkspace,
} from './utils/userWorkspaceUtils';
import {
  readIndexedDbWorkspace,
  readLocalStorageMeta,
  requestPersistentStoragePermission,
  saveWorkspaceWith25MbQuota,
  STORAGE_KEY,
} from './utils/workspaceStorage';
import {
  registerNativeRootBackWarn,
  useBackHandler,
} from './utils/backNavigation';
import {
  exportJsonBackupFile,
  isNativePlatform,
  releaseUnreferencedNativeVideoPermissions,
  resolveNativePlayableUrl,
} from './utils/nativeMediaStorage';
import { VideoCoverPickerModal } from './components/VideoCoverPickerModal';
import { VideoDetailsModal } from './components/VideoDetailsModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import {
  DEFAULT_LIBRARY_ICON_COVERS,
  isDefaultIconCoverUrl,
  resolvePersistedCoverUrl,
} from './assets/sampleCovers';
import { DanceVaultLogo } from './components/DanceVaultLogo';
import { DefaultIconCover } from './components/DefaultIconCover';
import { INITIAL_PROFILES } from './data/mockPreviewData';
import {
  BottomTab,
  ExplorerEntry,
  FolderEntry,
  FolderMetadataUpdates,
  LibraryItem,
  ProfileItem,
  SortMode,
  TrashedLibraryItem,
  UserWorkspaceData,
  VideoEntry,
  VideoMetadataUpdates,
  ViewMode,
} from './types/dancevault';

interface PersistedWorkspace {
  profiles: ProfileItem[];
  activeProfileId: string;
  workspacesByProfile: Record<string, UserWorkspaceData>;
}

function getDefaultPersistedWorkspace(): PersistedWorkspace {
  const defaultWorkspacesByProfile: Record<string, UserWorkspaceData> = {};
  INITIAL_PROFILES.forEach((profile) => {
    defaultWorkspacesByProfile[profile.id] = createEmptyUserWorkspace();
  });
  return {
    profiles: INITIAL_PROFILES,
    activeProfileId: 'user-master',
    workspacesByProfile: defaultWorkspacesByProfile,
  };
}

function normalizePersistedWorkspace(
  rawObj: unknown
): PersistedWorkspace | null {
  if (!rawObj || typeof rawObj !== 'object') return null;
  const fallback = getDefaultPersistedWorkspace();
  const parsed = rawObj as Partial<PersistedWorkspace & UserWorkspaceData>;

  const profiles =
    Array.isArray(parsed.profiles) && parsed.profiles.length > 0
      ? parsed.profiles
      : fallback.profiles;

  const masterProfile = profiles.find((p) => p.isMaster) ?? profiles[0];
  const workspacesByProfile: Record<string, UserWorkspaceData> = {};

  if (
    parsed.workspacesByProfile &&
    typeof parsed.workspacesByProfile === 'object'
  ) {
    profiles.forEach((profile) => {
      const rawWs = parsed.workspacesByProfile?.[profile.id];
      workspacesByProfile[profile.id] = sanitizeUserWorkspace(
        rawWs,
        createEmptyUserWorkspace()
      );
    });
  } else {
    const migratedLegacy = sanitizeUserWorkspace(
      parsed,
      createEmptyUserWorkspace()
    );
    profiles.forEach((profile) => {
      workspacesByProfile[profile.id] =
        profile.id === masterProfile.id
          ? cloneUserWorkspace(migratedLegacy)
          : createEmptyUserWorkspace();
    });
  }

  const activeProfileId =
    typeof parsed.activeProfileId === 'string' &&
    profiles.some((p) => p.id === parsed.activeProfileId)
      ? parsed.activeProfileId
      : profiles[0].id;

  return {
    profiles,
    activeProfileId,
    workspacesByProfile,
  };
}

function loadSavedWorkspace(): PersistedWorkspace {
  const fallback = getDefaultPersistedWorkspace();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return normalizePersistedWorkspace(parsed) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [initialWorkspace] = useState<PersistedWorkspace>(() =>
    loadSavedWorkspace()
  );
  const initialActiveUserWs =
    initialWorkspace.workspacesByProfile[initialWorkspace.activeProfileId] ??
    createEmptyUserWorkspace();

  const [libraries, setLibraries] = useState<LibraryItem[]>(
    initialActiveUserWs.libraries
  );
  const [primaryLibraryId, setPrimaryLibraryId] = useState<string>(
    initialActiveUserWs.primaryLibraryId
  );
  const [activeLibraryId, setActiveLibraryId] = useState<string>(
    initialActiveUserWs.activeLibraryId
  );
  const [entries, setEntries] = useState<ExplorerEntry[]>(
    initialActiveUserWs.entries
  );
  const [trashedEntries, setTrashedEntries] = useState<ExplorerEntry[]>(
    initialActiveUserWs.trashedEntries
  );
  const [trashedLibraries, setTrashedLibraries] = useState<TrashedLibraryItem[]>(
    initialActiveUserWs.trashedLibraries
  );
  const [pendingTrashRequest, setPendingTrashRequest] =
    useState<PendingTrashRequest | null>(null);
  const [libraryBackupDialog, setLibraryBackupDialog] =
    useState<LibraryBackupDialogState | null>(null);
  const libraryImportInputRef = useRef<HTMLInputElement | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Screen navigation: 'libraries' | 'explorer' | 'favorites' | 'recents' | 'trash'
  const [screen, setScreen] = useState<
    'libraries' | 'explorer' | 'favorites' | 'recents' | 'trash'
  >('libraries');
  const [recentDays, setRecentDays] = useState<number>(
    initialActiveUserWs.recentDays
  );
  const [trashLibraryScope, setTrashLibraryScope] = useState<'all' | 'active'>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [flatVideosMode, setFlatVideosMode] = useState(false);

  // Header & bottom bar states
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<BottomTab>('bibliotecas');

  // Per-folder persistent view, sort & manual order preferences
  const [folderViewPrefs, setFolderViewPrefs] = useState<Record<string, ViewMode>>(
    initialActiveUserWs.folderViewPrefs
  );
  const [folderSortPrefs, setFolderSortPrefs] = useState<Record<string, SortMode>>(
    initialActiveUserWs.folderSortPrefs
  );
  const [manualOrderByFolder, setManualOrderByFolder] = useState<Record<string, string[]>>(
    initialActiveUserWs.manualOrderByFolder
  );

  // Clipboard & undo
  const [clipboard, setClipboard] = useState<{
    ids: string[];
    mode: 'copy' | 'cut';
  } | null>(null);

  // Overlays
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);
  const [detailsLibraryId, setDetailsLibraryId] = useState<string | null>(null);
  const [libCoverTargetId, setLibCoverTargetId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [folderDetailsSignal, setFolderDetailsSignal] = useState(0);
  const [playerTarget, setPlayerTarget] = useState<{
    videoId: string;
    queueIds?: string[];
  } | null>(null);
  const [playerDetailsVideoId, setPlayerDetailsVideoId] = useState<string | null>(null);
  const [playerCoverVideoId, setPlayerCoverVideoId] = useState<string | null>(null);
  const [playerRenameVideoId, setPlayerRenameVideoId] = useState<string | null>(null);

  // Toast with optional 5s Undo callback + rich subtitle/tone support
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    subtitle?: string;
    tone?: 'info' | 'restore' | 'purge';
    onUndo?: () => void;
  } | null>(null);

  // Edit library name & title modal
  const [editingLib, setEditingLib] = useState<{
    id: string;
    focusField: 'name' | 'title';
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Android physical Back / gesture navigation layers
  useBackHandler(
    screen !== 'libraries',
    () => {
      setFlatVideosMode(false);
      setCurrentFolderId(null);
      setScreen('libraries');
      setActiveTab('bibliotecas');
    },
    10
  );
  useBackHandler(
    screen === 'libraries' && searchOpen,
    () => {
      setSearchOpen(false);
      setSearchQuery('');
    },
    25
  );
  useBackHandler(moreMenuOpen, () => setMoreMenuOpen(false), 35);
  useBackHandler(Boolean(cardMenuId), () => setCardMenuId(null), 35);
  useBackHandler(drawerOpen, () => setDrawerOpen(false), 40);
  useBackHandler(profileMenuOpen, () => setProfileMenuOpen(false), 40);
  useBackHandler(Boolean(detailsLibraryId), () => setDetailsLibraryId(null), 40);
  useBackHandler(createModalOpen, () => setCreateModalOpen(false), 45);
  useBackHandler(Boolean(libCoverTargetId), () => setLibCoverTargetId(null), 45);
  useBackHandler(Boolean(editingLib), () => setEditingLib(null), 45);
  useBackHandler(
    Boolean(playerTarget),
    () => {
      setPlayerTarget(null);
      setPlayerDetailsVideoId(null);
      setPlayerCoverVideoId(null);
      setPlayerRenameVideoId(null);
    },
    50
  );
  useBackHandler(
    Boolean(pendingTrashRequest),
    () => setPendingTrashRequest(null),
    55
  );
  useBackHandler(
    Boolean(playerDetailsVideoId),
    () => setPlayerDetailsVideoId(null),
    60
  );
  useBackHandler(
    Boolean(playerCoverVideoId),
    () => setPlayerCoverVideoId(null),
    65
  );
  useBackHandler(
    Boolean(playerRenameVideoId),
    () => setPlayerRenameVideoId(null),
    65
  );

  useEffect(() => {
    registerNativeRootBackWarn(() => {
      showToast('Pulsa Atrás otra vez para salir');
    });
    return () => registerNativeRootBackWarn(null);
  }, []);

  // Profiles & per-profile isolated workspaces
  const [profiles, setProfiles] = useState<ProfileItem[]>(
    initialWorkspace.profiles
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialWorkspace.activeProfileId
  );
  const [workspacesByProfile, setWorkspacesByProfile] = useState<
    Record<string, UserWorkspaceData>
  >(initialWorkspace.workspacesByProfile);

  const currentWorkspaceSnapshot = useMemo<UserWorkspaceData>(
    () => ({
      libraries,
      primaryLibraryId,
      activeLibraryId,
      entries,
      trashedEntries,
      trashedLibraries,
      folderViewPrefs,
      folderSortPrefs,
      manualOrderByFolder,
      recentDays,
    }),
    [
      libraries,
      primaryLibraryId,
      activeLibraryId,
      entries,
      trashedEntries,
      trashedLibraries,
      folderViewPrefs,
      folderSortPrefs,
      manualOrderByFolder,
      recentDays,
    ]
  );

  const idbHydrationReadyRef = useRef<boolean>(false);
  const quotaWarnedRef = useRef<boolean>(false);

  const getWorkspaceForProfile = (profileId: string): UserWorkspaceData => {
    if (profileId === activeProfileId) {
      return currentWorkspaceSnapshot;
    }
    return workspacesByProfile[profileId] ?? createEmptyUserWorkspace();
  };

  useEffect(() => {
    let cancelled = false;
    void requestPersistentStoragePermission();
    const localMeta = readLocalStorageMeta();

    readIndexedDbWorkspace<PersistedWorkspace>().then((idbRecord) => {
      if (cancelled) return;
      const shouldHydrateFromIdb =
        Boolean(idbRecord?.payload) &&
        (localMeta?.indexedDbPrimary ||
          !localMeta ||
          (idbRecord?.updatedAt ?? 0) >= localMeta.updatedAt);

      if (shouldHydrateFromIdb && idbRecord) {
        const normalized = normalizePersistedWorkspace(idbRecord.payload);
        if (normalized) {
          setProfiles(normalized.profiles);
          setActiveProfileId(normalized.activeProfileId);
          setWorkspacesByProfile(normalized.workspacesByProfile);
          const nextActive =
            normalized.workspacesByProfile[normalized.activeProfileId] ??
            createEmptyUserWorkspace();
          setLibraries(nextActive.libraries);
          setPrimaryLibraryId(nextActive.primaryLibraryId);
          setActiveLibraryId(nextActive.activeLibraryId);
          setEntries(nextActive.entries);
          setTrashedEntries(nextActive.trashedEntries);
          setTrashedLibraries(nextActive.trashedLibraries);
          setFolderViewPrefs(nextActive.folderViewPrefs);
          setFolderSortPrefs(nextActive.folderSortPrefs);
          setManualOrderByFolder(nextActive.manualOrderByFolder);
          setRecentDays(nextActive.recentDays);
        }
      }
      idbHydrationReadyRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!idbHydrationReadyRef.current) return;
    const payload: PersistedWorkspace = {
      profiles,
      activeProfileId,
      workspacesByProfile: {
        ...workspacesByProfile,
        [activeProfileId]: currentWorkspaceSnapshot,
      },
    };
    void saveWorkspaceWith25MbQuota(payload).then((result) => {
      if (!result.ok && result.reason === 'quota_25mb') {
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          showToast({
            message: 'Límite de 25 MB alcanzado en la memoria local',
            subtitle:
              'Exporta una copia o vacía la papelera para liberar espacio',
            tone: 'purge',
          });
        }
      } else if (result.ok) {
        quotaWarnedRef.current = false;
      }
    });
  }, [profiles, activeProfileId, workspacesByProfile, currentWorkspaceSnapshot]);

  const attemptedMissingNativeRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isNativePlatform()) return;

    const collectMissing = (list: ExplorerEntry[]) =>
      list.filter(
        (e): e is VideoEntry =>
          e.type === 'video' &&
          Boolean(e.nativeFilePath) &&
          !e.videoUrl &&
          !attemptedMissingNativeRef.current.has(e.nativeFilePath!)
      );

    const activeMissing = collectMissing(entries);
    const trashMissing = collectMissing(trashedEntries);
    if (activeMissing.length === 0 && trashMissing.length === 0) return;

    let cancelled = false;
    const uniquePaths = Array.from(
      new Set(
        [...activeMissing, ...trashMissing]
          .map((v) => v.nativeFilePath!)
          .filter(Boolean)
      )
    );

    Promise.all(
      uniquePaths.map(async (path) => {
        const url = await resolveNativePlayableUrl({ nativeFilePath: path });
        return [path, url] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      const resolvedMap = new Map<string, string>();
      for (const [path, url] of pairs) {
        if (url) {
          resolvedMap.set(path, url);
        } else {
          attemptedMissingNativeRef.current.add(path);
        }
      }
      if (resolvedMap.size === 0) return;

      const patchList = (prev: ExplorerEntry[]): ExplorerEntry[] => {
        let changed = false;
        const next = prev.map((e) => {
          if (
            e.type === 'video' &&
            e.nativeFilePath &&
            !e.videoUrl &&
            resolvedMap.has(e.nativeFilePath)
          ) {
            changed = true;
            return { ...e, videoUrl: resolvedMap.get(e.nativeFilePath) };
          }
          return e;
        });
        return changed ? next : prev;
      };

      setEntries(patchList);
      setTrashedEntries(patchList);
    });

    return () => {
      cancelled = true;
    };
  }, [entries, trashedEntries]);

  const syncedEntries = useMemo<ExplorerEntry[]>(() => {
    const directChildCounts = new Map<string, number>();
    entries.forEach((e) => {
      if (e.parentId) {
        directChildCounts.set(
          e.parentId,
          (directChildCounts.get(e.parentId) ?? 0) + 1
        );
      }
    });
    const folderMbMap = computeRecursiveFolderSizeMap(entries);
    return entries.map((e) =>
      e.type === 'folder'
        ? {
            ...e,
            itemCount: directChildCounts.get(e.id) ?? 0,
            sizeLabel: formatStorageMb(folderMbMap.get(e.id) ?? 0),
          }
        : e
    );
  }, [entries]);

  const recentVideosCount = useMemo(() => {
    const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
    return syncedEntries.filter(
      (e): e is VideoEntry =>
        e.type === 'video' &&
        typeof e.importedAt === 'number' &&
        e.importedAt >= cutoff
    ).length;
  }, [syncedEntries, recentDays]);

  const syncedLibraries = useMemo<LibraryItem[]>(() => {
    const statsByLib = new Map<
      string,
      { videos: number; folders: number; sizeMb: number }
    >();
    entries.forEach((e) => {
      const current = statsByLib.get(e.libraryId) ?? {
        videos: 0,
        folders: 0,
        sizeMb: 0,
      };
      if (e.type === 'video') {
        current.videos += 1;
        current.sizeMb += getVideoSizeMb(e);
      } else {
        current.folders += 1;
      }
      statsByLib.set(e.libraryId, current);
    });
    return libraries.map((lib) => {
      const c = statsByLib.get(lib.id) ?? { videos: 0, folders: 0, sizeMb: 0 };
      return {
        ...lib,
        videosCount: c.videos,
        foldersCount: c.folders,
        sizeBytes: c.sizeMb,
        sizeLabel: formatStorageMb(c.sizeMb),
      };
    });
  }, [entries, libraries]);

  const activeLibrary = useMemo(
    () =>
      syncedLibraries.find((l) => l.id === activeLibraryId) ?? syncedLibraries[0],
    [syncedLibraries, activeLibraryId]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );

  const currentFolder = useMemo(
    () =>
      currentFolderId
        ? (syncedEntries.find(
            (e): e is FolderEntry => e.id === currentFolderId && e.type === 'folder'
          ) ?? null)
        : null,
    [syncedEntries, currentFolderId]
  );

  const filteredLibraries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...syncedLibraries].sort((a, b) => {
      if (a.id === primaryLibraryId) return -1;
      if (b.id === primaryLibraryId) return 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter((lib) => lib.name.toLowerCase().includes(q));
  }, [syncedLibraries, primaryLibraryId, searchQuery]);

  const totalStorageMb = useMemo(
    () => syncedLibraries.reduce((sum, item) => sum + item.sizeBytes, 0),
    [syncedLibraries]
  );

  const showToast = (
    messageOrOpts:
      | string
      | {
          message: string;
          subtitle?: string;
          tone?: 'info' | 'restore' | 'purge';
          onUndo?: () => void;
          durationMs?: number;
        },
    onUndo?: () => void,
    durationMs = 3500
  ) => {
    const opts =
      typeof messageOrOpts === 'string'
        ? { message: messageOrOpts, onUndo, durationMs, tone: 'info' as const }
        : messageOrOpts;
    const toastId = Date.now() + Math.random();
    setToast({
      id: toastId,
      message: opts.message,
      subtitle: opts.subtitle,
      tone: opts.tone ?? 'info',
      onUndo: opts.onUndo,
    });
    const waitMs = opts.onUndo ? 5500 : opts.durationMs ?? 3800;
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === toastId ? null : prev));
    }, waitMs);
  };

  const hydrateWorkspace = (ws: UserWorkspaceData) => {
    setLibraries(ws.libraries);
    setPrimaryLibraryId(ws.primaryLibraryId);
    setActiveLibraryId(ws.activeLibraryId);
    setEntries(ws.entries);
    setTrashedEntries(ws.trashedEntries);
    setTrashedLibraries(ws.trashedLibraries);
    setFolderViewPrefs(ws.folderViewPrefs);
    setFolderSortPrefs(ws.folderSortPrefs);
    setManualOrderByFolder(ws.manualOrderByFolder);
    setRecentDays(ws.recentDays);

    setScreen('libraries');
    setActiveTab('bibliotecas');
    setCurrentFolderId(null);
    setFlatVideosMode(false);
    setClipboard(null);
    setPlayerTarget(null);
    setPlayerDetailsVideoId(null);
    setPlayerCoverVideoId(null);
    setPlayerRenameVideoId(null);
    setDrawerOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setCardMenuId(null);
    setDetailsLibraryId(null);
    setLibCoverTargetId(null);
    setEditingLib(null);
    setPendingTrashRequest(null);
    setMoreMenuOpen(false);
    setFailedImages({});
  };

  const handleSelectProfile = (profileId: string) => {
    if (profileId === activeProfileId) {
      setProfileMenuOpen(false);
      return;
    }
    const nextMap: Record<string, UserWorkspaceData> = {
      ...workspacesByProfile,
      [activeProfileId]: cloneUserWorkspace(currentWorkspaceSnapshot),
    };
    const targetWs = cloneUserWorkspace(
      nextMap[profileId] ?? createEmptyUserWorkspace()
    );
    setWorkspacesByProfile(nextMap);
    setActiveProfileId(profileId);
    hydrateWorkspace(targetWs);
    setProfileMenuOpen(false);
    const targetName =
      profiles.find((p) => p.id === profileId)?.name ?? 'Usuario';
    showToast(`Perfil activo: ${targetName}`);
  };

  const handleCreateProfile = (rawName: string): boolean => {
    const cleaned = rawName.trim();
    if (!cleaned) return false;
    const duplicate = profiles.some(
      (p) => p.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) return false;

    const created: ProfileItem = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleaned,
      isMaster: false,
    };
    const emptyWs = createEmptyUserWorkspace();
    const nextMap: Record<string, UserWorkspaceData> = {
      ...workspacesByProfile,
      [activeProfileId]: cloneUserWorkspace(currentWorkspaceSnapshot),
      [created.id]: cloneUserWorkspace(emptyWs),
    };

    setProfiles((prev) => [...prev, created]);
    setWorkspacesByProfile(nextMap);
    setActiveProfileId(created.id);
    hydrateWorkspace(emptyWs);
    setProfileMenuOpen(false);
    showToast({
      message: `Usuario "${created.name}" creado`,
      subtitle: 'Espacio vacío listo: sin bibliotecas ni vídeos previos',
    });
    return true;
  };

  const handleRenameProfile = (profileId: string, rawName: string): boolean => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return false;
    const cleaned = rawName.trim();
    if (!cleaned) return false;
    const duplicate = profiles.some(
      (p) =>
        p.id !== profileId &&
        p.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) return false;

    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, name: cleaned } : p))
    );
    showToast(`Usuario renombrado a "${cleaned}"`);
    return true;
  };

  const handleCopyProfile = (profileId: string) => {
    const source = profiles.find((p) => p.id === profileId);
    if (!source) return;

    const copiedName = getUniqueProfileName(source.name, profiles);
    const created: ProfileItem = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: copiedName,
      isMaster: false,
    };
    const clonedWs = cloneUserWorkspace(getWorkspaceForProfile(source.id));

    setProfiles((prev) => [...prev, created]);
    setWorkspacesByProfile((prev) => ({
      ...prev,
      [activeProfileId]: cloneUserWorkspace(currentWorkspaceSnapshot),
      [created.id]: clonedWs,
    }));
    showToast({
      message: `Usuario copiado como "${created.name}"`,
      subtitle: 'Copia independiente creada con todas sus bibliotecas y vídeos',
    });
  };

  const handleDeleteProfile = (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target || target.isMaster) return;

    const removedProfileWs = getWorkspaceForProfile(profileId);
    const removedPaths = [
      ...removedProfileWs.entries,
      ...removedProfileWs.trashedEntries,
      ...removedProfileWs.trashedLibraries.flatMap((tl) => tl.entries),
    ]
      .filter((e): e is VideoEntry => e.type === 'video' && Boolean(e.nativeFilePath))
      .map((v) => v.nativeFilePath!);

    const remaining = profiles.filter((p) => p.id !== profileId);
    const nextMap: Record<string, UserWorkspaceData> = {
      ...workspacesByProfile,
      [activeProfileId]: cloneUserWorkspace(currentWorkspaceSnapshot),
    };
    delete nextMap[profileId];

    const remainingEntriesAcrossProfiles = Object.values(nextMap).flatMap(
      (ws) => [
        ...ws.entries,
        ...ws.trashedEntries,
        ...ws.trashedLibraries.flatMap((tl) => tl.entries),
      ]
    );
    void releaseUnreferencedNativeVideoPermissions(
      removedPaths,
      remainingEntriesAcrossProfiles
    );

    setProfiles(remaining);
    setWorkspacesByProfile(nextMap);

    if (activeProfileId === profileId) {
      const fallbackProfile = remaining.find((p) => p.isMaster) ?? remaining[0];
      if (fallbackProfile) {
        const fallbackWs = cloneUserWorkspace(
          nextMap[fallbackProfile.id] ?? createEmptyUserWorkspace()
        );
        setActiveProfileId(fallbackProfile.id);
        hydrateWorkspace(fallbackWs);
      }
    }

    showToast({
      message: `Usuario "${target.name}" eliminado definitivamente`,
      tone: 'purge',
    });
  };

  const handleExportProfileBackup = (profileId: string) => {
    const targetName =
      profiles.find((p) => p.id === profileId)?.name ?? 'Usuario';
    showToast({
      message: `Copia exportada de "${targetName}"`,
      subtitle: isNativePlatform()
        ? 'Archivo JSON listo para guardar o compartir desde Android'
        : 'Archivo JSON guardado con toda su organización',
    });
  };

  const handleImportProfileBackup = (
    targetCopyName: string,
    importedWorkspace: UserWorkspaceData
  ) => {
    const cleanWs = sanitizeUserWorkspace(
      importedWorkspace,
      createEmptyUserWorkspace()
    );
    const cleanTargetName = targetCopyName.trim();
    const hasCollision =
      !cleanTargetName ||
      profiles.some(
        (p) => p.name.trim().toLowerCase() === cleanTargetName.toLowerCase()
      );
    const createdName = hasCollision
      ? getUniqueCopyProfileName(cleanTargetName || 'Usuario importado', profiles)
      : cleanTargetName;
    const created: ProfileItem = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: createdName,
      isMaster: false,
    };

    setProfiles((prev) => [...prev, created]);
    setWorkspacesByProfile((prev) => ({
      ...prev,
      [activeProfileId]: cloneUserWorkspace(currentWorkspaceSnapshot),
      [created.id]: cloneUserWorkspace(cleanWs),
    }));
    setActiveProfileId(created.id);
    hydrateWorkspace(cloneUserWorkspace(cleanWs));
    setProfileMenuOpen(false);
    showToast({
      message: `Usuario "${created.name}" creado desde copia`,
      subtitle: `${cleanWs.libraries.length} bibliotecas · ${cleanWs.entries.filter((e) => e.type === 'video').length} vídeos importados`,
      tone: 'restore',
    });
  };

  const handleRequestExportLibrary = (lib: LibraryItem) => {
    const libEntries = entries.filter((e) => e.libraryId === lib.id);
    const stats = getLibraryBackupStats(libEntries);
    setLibraryBackupDialog({
      kind: 'export',
      library: lib,
      stats,
      step: 1,
    });
  };

  const handleConfirmExportLibrary = async (lib: LibraryItem) => {
    const payload = buildLibraryBackupPayload(
      lib,
      entries,
      { folderViewPrefs, folderSortPrefs, manualOrderByFolder },
      activeProfile.name
    );
    const jsonText = JSON.stringify(payload, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `dancevault-biblioteca-${slugifyLibraryFileName(lib.name)}-${dateStamp}.json`;

    setLibraryBackupDialog(null);
    try {
      const outcome = await exportJsonBackupFile(filename, jsonText);
      if (outcome === 'cancelled') return;
      showToast({
        message: `Biblioteca "${lib.name}" exportada`,
        subtitle:
          outcome === 'shared'
            ? 'Archivo JSON listo para compartir o guardar en tu dispositivo'
            : 'Archivo JSON guardado para compartir con otros usuarios',
      });
    } catch {
      showToast({
        message: `No se pudo exportar "${lib.name}"`,
        subtitle: 'Inténtalo de nuevo o revisa el espacio libre del teléfono',
        tone: 'purge',
      });
    }
  };

  const handleTriggerImportLibraryFile = () => {
    if (libraryImportInputRef.current) {
      libraryImportInputRef.current.value = '';
      libraryImportInputRef.current.click();
    }
  };

  const handleLibraryImportFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) {
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const outcome = parseLibraryBackupPayload(content);
      if (!outcome.ok) {
        showToast({
          message:
            outcome.reason === 'is-user-backup'
              ? 'Ese archivo es una copia de usuario completa'
              : 'Archivo de biblioteca no válido',
          subtitle:
            outcome.reason === 'is-user-backup'
              ? 'Impórtalo desde Perfiles de usuario → Importar copia (.json)'
              : 'Selecciona un .json exportado desde una biblioteca de DanceVault',
          tone: 'purge',
        });
        return;
      }

      const resultingLibraryName = resolveImportedLibraryName(
        outcome.data.library.name,
        libraries
      );
      const stats = getLibraryBackupStats(outcome.data.entries);
      setCreateModalOpen(false);
      setLibraryBackupDialog({
        kind: 'import',
        fileName: file.name,
        sourceLibraryName: outcome.data.library.name,
        resultingLibraryName,
        sourceProfileName: outcome.data.sourceProfileName,
        activeProfileName: activeProfile.name,
        stats,
        backup: outcome.data,
        step: 1,
      });
    };
    reader.onerror = () => {
      showToast('No se pudo leer el archivo seleccionado');
    };
    reader.onloadend = () => {
      inputEl.value = '';
    };
    reader.readAsText(file);
  };

  const handleConfirmImportLibrary = (
    backup: ParsedLibraryBackup,
    resultingLibraryName: string
  ) => {
    const materialized = materializeImportedLibrary(
      backup,
      libraries,
      entries,
      resultingLibraryName
    );

    setLibraries((prev) => [...prev, materialized.library]);
    if (materialized.entries.length > 0) {
      setEntries((prev) => [...prev, ...materialized.entries]);
    }
    if (Object.keys(materialized.folderViewPrefs).length > 0) {
      setFolderViewPrefs((prev) => ({
        ...prev,
        ...materialized.folderViewPrefs,
      }));
    }
    if (Object.keys(materialized.folderSortPrefs).length > 0) {
      setFolderSortPrefs((prev) => ({
        ...prev,
        ...materialized.folderSortPrefs,
      }));
    }
    if (Object.keys(materialized.manualOrderByFolder).length > 0) {
      setManualOrderByFolder((prev) => ({
        ...prev,
        ...materialized.manualOrderByFolder,
      }));
    }

    if (libraries.length === 0 || !primaryLibraryId) {
      setPrimaryLibraryId(materialized.library.id);
      setActiveLibraryId(materialized.library.id);
    }

    setLibraryBackupDialog(null);
    const videosCount = materialized.entries.filter(
      (en) => en.type === 'video'
    ).length;
    const foldersCount = materialized.entries.filter(
      (en) => en.type === 'folder'
    ).length;
    showToast({
      message: `Biblioteca "${materialized.library.name}" importada`,
      subtitle: `${foldersCount} carpetas · ${videosCount} vídeos añadidos a ${activeProfile.name}`,
      tone: 'restore',
    });
  };

  const openLibraryExplorer = (libId: string) => {
    if (!libId || !libraries.some((l) => l.id === libId)) {
      setFlatVideosMode(false);
      setCurrentFolderId(null);
      setScreen('libraries');
      setSearchOpen(false);
      setActiveTab('bibliotecas');
      return;
    }
    setActiveLibraryId(libId);
    setCurrentFolderId(null);
    setFlatVideosMode(false);
    setScreen('explorer');
    setSearchOpen(false);
    setActiveTab('carpetas');
  };

  const openEditModal = (lib: LibraryItem, focusField: 'name' | 'title') => {
    setEditingLib({ id: lib.id, focusField });
    setEditName(lib.name);
    setEditTitle(lib.disciplineLabel);
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLib) return;
    const cleanedName = editName.trim();
    const cleanedTitle = editTitle.trim();

    if (!cleanedName) {
      setEditError('El nombre de la biblioteca no puede estar vacío.');
      return;
    }
    if (!cleanedTitle) {
      setEditError('El título no puede estar vacío.');
      return;
    }
    const duplicate = libraries.some(
      (l) =>
        l.id !== editingLib.id &&
        l.name.trim().toLowerCase() === cleanedName.toLowerCase()
    );
    if (duplicate) {
      setEditError('Ya existe otra biblioteca con ese nombre.');
      return;
    }

    const target = libraries.find((l) => l.id === editingLib.id);
    if (!target) return;

    const prevName = target.name;
    const prevTitle = target.disciplineLabel;
    const targetId = target.id;

    setLibraries((prev) =>
      prev.map((l) =>
        l.id === targetId
          ? { ...l, name: cleanedName, disciplineLabel: cleanedTitle }
          : l
      )
    );
    setEditingLib(null);
    setEditError(null);
    showToast(`Actualizado: "${cleanedName}"`, () => {
      setLibraries((prev) =>
        prev.map((l) =>
          l.id === targetId
            ? { ...l, name: prevName, disciplineLabel: prevTitle }
            : l
        )
      );
      showToast('Cambio deshecho');
    });
  };

  const handleCreateLibrary = (rawName: string, accentHex: string): boolean => {
    const cleaned = rawName.trim();
    if (!cleaned) {
      showToast('Escribe un nombre para la biblioteca');
      return false;
    }
    const duplicate = libraries.some(
      (l) => l.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) {
      showToast('Ya existe una biblioteca con ese nombre');
      return false;
    }
    const mappedAccent: LibraryItem['accentColor'] =
      accentHex === '#ff3e55' || accentHex === '#ec4899'
        ? 'primary'
        : accentHex === '#f59e0b'
          ? 'secondary'
          : 'tertiary';

    const created: LibraryItem = {
      id: `lib-${Date.now()}`,
      name: cleaned,
      disciplineLabel: 'Nueva colección',
      videosCount: 0,
      foldersCount: 0,
      sizeBytes: 0,
      sizeLabel: '0 B',
      lastPracticed: 'Sin actividad aún',
      coverUrl: '',
      accentColor: mappedAccent,
      accentHex,
    };
    const nextLibraries = [...libraries, created];
    setLibraries(nextLibraries);
    if (libraries.length === 0 || !primaryLibraryId) {
      setPrimaryLibraryId(created.id);
      setActiveLibraryId(created.id);
    }
    showToast(`Biblioteca "${cleaned}" creada`);
    return true;
  };

  const getUniqueLibraryName = (baseName: string): string => {
    let candidate = baseName.trim();
    while (
      libraries.some(
        (l) => l.name.trim().toLowerCase() === candidate.toLowerCase()
      )
    ) {
      candidate = `BIS ${candidate}`;
    }
    return candidate;
  };

  const handleSetPrimaryLibrary = (lib: LibraryItem) => {
    setPrimaryLibraryId(lib.id);
    showToast(`"${lib.name}" es ahora la biblioteca principal`);
  };

  const handleCopyLibrary = (sourceLib: LibraryItem) => {
    const libsSnapshot = libraries;
    const entriesSnapshot = entries;
    const newLibId = `lib-${Date.now()}`;
    const newLibName = getUniqueLibraryName(sourceLib.name);

    const clonedLib: LibraryItem = {
      ...sourceLib,
      id: newLibId,
      name: newLibName,
    };

    const libEntries = entries.filter((e) => e.libraryId === sourceLib.id);
    const idMap = new Map<string, string>();
    libEntries.forEach((e, idx) => {
      idMap.set(
        e.id,
        `${e.type === 'folder' ? 'fld' : 'vid'}-${Date.now()}-${idx}`
      );
    });

    let workingVideoNames = entries
      .filter((e) => e.type === 'video')
      .map((e) => e.name.trim().toLowerCase());

    const clonedEntries: ExplorerEntry[] = libEntries.map((e) => {
      const mappedId = idMap.get(e.id)!;
      const mappedParentId = e.parentId ? (idMap.get(e.parentId) ?? null) : null;
      if (e.type === 'video') {
        let candidate = e.name.trim();
        while (workingVideoNames.includes(candidate.toLowerCase())) {
          candidate = `BIS ${candidate}`;
        }
        workingVideoNames.push(candidate.toLowerCase());
        return {
          ...e,
          id: mappedId,
          libraryId: newLibId,
          parentId: mappedParentId,
          name: candidate,
        };
      }
      return {
        ...e,
        id: mappedId,
        libraryId: newLibId,
        parentId: mappedParentId,
      };
    });

    setLibraries((prev) => [...prev, clonedLib]);
    if (clonedEntries.length > 0) {
      setEntries((prev) => [...prev, ...clonedEntries]);
    }
    showToast(`Biblioteca copiada como "${newLibName}"`, () => {
      setLibraries(libsSnapshot);
      setEntries(entriesSnapshot);
      showToast('Copia de biblioteca deshecha');
    });
  };

  const handleDeleteLibrary = (targetLib: LibraryItem) => {
    if (libraries.length <= 1) {
      showToast('Debe quedar al menos una biblioteca en la aplicación');
      return;
    }
    const syncedLib =
      syncedLibraries.find((l) => l.id === targetLib.id) ?? targetLib;
    const libEntries = syncedEntries.filter(
      (e) => e.libraryId === targetLib.id
    );
    setPendingTrashRequest({
      kind: 'library',
      library: syncedLib,
      entries: libEntries,
    });
  };

  const handleChangeLibraryCover = (
    libId: string,
    coverUrl: string,
    accentHex?: string
  ) => {
    setLibraries((prev) =>
      prev.map((l) =>
        l.id === libId
          ? { ...l, coverUrl, ...(accentHex ? { accentHex } : {}) }
          : l
      )
    );
    setFailedImages((prev) => {
      const next = { ...prev };
      delete next[libId];
      return next;
    });
    showToast(
      coverUrl
        ? 'Portada de biblioteca actualizada'
        : 'Portada restablecida al icono por defecto'
    );
  };

  const handleChangeLibraryAccent = (libId: string, accentHex: string) => {
    const mappedAccent: LibraryItem['accentColor'] =
      accentHex === '#ff3e55' || accentHex === '#ec4899'
        ? 'primary'
        : accentHex === '#f59e0b'
          ? 'secondary'
          : accentHex === '#06b6d4'
            ? 'tertiary'
            : 'neutral';
    setLibraries((prev) =>
      prev.map((l) =>
        l.id === libId ? { ...l, accentColor: mappedAccent, accentHex } : l
      )
    );
    showToast('Color de biblioteca actualizado');
  };

  // Explorer operations respecting v2.3 unique naming & BIS rules
  const getUniqueVideoName = (baseName: string): string => {
    let candidate = baseName.trim();
    while (
      entries.some(
        (e) =>
          e.type === 'video' &&
          e.name.trim().toLowerCase() === candidate.toLowerCase()
      )
    ) {
      candidate = `BIS ${candidate}`;
    }
    return candidate;
  };

  const getUniqueFolderName = (baseName: string, libId: string): string => {
    let candidate = baseName.trim();
    while (
      entries.some(
        (e) =>
          e.type === 'folder' &&
          e.libraryId === libId &&
          e.name.trim().toLowerCase() === candidate.toLowerCase()
      )
    ) {
      candidate = `BIS ${candidate}`;
    }
    return candidate;
  };

  const handleToggleFavorite = (entryId: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, favorite: !e.favorite } : e))
    );
  };

  const handleToggleFavoriteWithUndo = (entryId: string) => {
    const target = entries.find((e) => e.id === entryId);
    if (!target) return;
    const wasFav = target.favorite;
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, favorite: !wasFav } : e))
    );
    if (wasFav) {
      showToast(`"${target.name}" quitado de favoritos`, () => {
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, favorite: true } : e))
        );
        showToast('Restaurado en favoritos');
      });
    } else {
      showToast(`"${target.name}" añadido a favoritos`);
    }
  };

  const handleToggleFavoritesBatch = (ids: string[]) => {
    if (ids.length === 0) return;
    const snapshot = entries;
    const idSet = new Set(ids);
    const targets = entries.filter((e) => idSet.has(e.id));
    if (targets.length === 0) return;
    const allAlreadyFavorite = targets.every((e) => e.favorite);
    const nextFavoriteState = !allAlreadyFavorite;
    setEntries((prev) =>
      prev.map((e) => (idSet.has(e.id) ? { ...e, favorite: nextFavoriteState } : e))
    );
    showToast(
      nextFavoriteState
        ? `${targets.length} elemento(s) añadidos a favoritos`
        : `${targets.length} elemento(s) quitados de favoritos`,
      () => {
        setEntries(snapshot);
        showToast('Favoritos restaurados');
      }
    );
  };

  const handleUpdateFolderMetadata = (
    folderId: string,
    updates: FolderMetadataUpdates
  ) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === folderId && e.type === 'folder' ? { ...e, ...updates } : e
      )
    );
    showToast(
      updates.createdAt !== undefined
        ? 'Fecha de creación de carpeta actualizada'
        : 'Detalles de la carpeta actualizados'
    );
  };

  const handleUpdateVideoMetadata = (
    videoId: string,
    updates: VideoMetadataUpdates,
    options?: { silent?: boolean }
  ) => {
    const prevEntry = entries.find(
      (e): e is VideoEntry => e.id === videoId && e.type === 'video'
    );
    setEntries((prev) =>
      prev.map((e) =>
        e.id === videoId && e.type === 'video' ? { ...e, ...updates } : e
      )
    );

    if (
      prevEntry?.nativeFilePath &&
      'nativeFilePath' in updates &&
      updates.nativeFilePath !== prevEntry.nativeFilePath
    ) {
      const nextEntriesPreview = entries.map((e) =>
        e.id === videoId && e.type === 'video' ? { ...e, ...updates } : e
      );
      const remainingAcrossProfiles = [
        ...nextEntriesPreview,
        ...trashedEntries,
        ...trashedLibraries.flatMap((tl) => tl.entries),
        ...Object.entries(workspacesByProfile)
          .filter(([pid]) => pid !== activeProfileId)
          .flatMap(([, ws]) => [
            ...ws.entries,
            ...ws.trashedEntries,
            ...ws.trashedLibraries.flatMap((tl) => tl.entries),
          ]),
      ];
      void releaseUnreferencedNativeVideoPermissions(
        [prevEntry.nativeFilePath],
        remainingAcrossProfiles
      );
    }

    if (options?.silent) return;
    showToast(
      updates.externalUrl
        ? 'Enlace de vídeo actualizado correctamente'
        : updates.videoUrl || updates.originalFileName
          ? 'Archivo de vídeo reasignado correctamente'
          : updates.loopMarker
            ? 'Bucle A-B guardado en la ficha del vídeo'
            : updates.savedLoops
              ? 'Bucles guardados actualizados'
              : updates.createdAt !== undefined
                ? 'Fecha de creación del vídeo actualizada'
                : 'Detalles del vídeo actualizados'
    );
  };

  const handleRenameEntry = (entryId: string, rawName: string): boolean => {
    const cleaned = rawName.trim();
    if (!cleaned) {
      showToast('El nombre no puede estar vacío');
      return false;
    }
    const target = entries.find((e) => e.id === entryId);
    if (!target) return false;

    const conflict = entries.some((e) => {
      if (e.id === entryId || e.type !== target.type) return false;
      if (target.type === 'video') {
        return e.name.trim().toLowerCase() === cleaned.toLowerCase();
      }
      return (
        e.libraryId === target.libraryId &&
        e.name.trim().toLowerCase() === cleaned.toLowerCase()
      );
    });

    if (conflict) {
      showToast(
        target.type === 'video'
          ? 'Ya existe otro vídeo con ese nombre en la app'
          : 'Ya existe otra carpeta con ese nombre en esta biblioteca'
      );
      return false;
    }

    const oldName = target.name;
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, name: cleaned } : e))
    );
    showToast(`Renombrado a "${cleaned}"`, () => {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, name: oldName } : e))
      );
      showToast('Renombrado deshecho');
    });
    return true;
  };

  const handleCreateFolder = (rawName: string, favorite = false): boolean => {
    const cleaned = rawName.trim();
    if (!cleaned) {
      showToast('Escribe un nombre para la carpeta');
      return false;
    }
    const conflict = entries.some(
      (e) =>
        e.type === 'folder' &&
        e.libraryId === activeLibraryId &&
        e.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (conflict) {
      showToast('Ya existe una carpeta con ese nombre en esta biblioteca');
      return false;
    }
    const now = Date.now();
    const created: FolderEntry = {
      id: `fld-${now}`,
      type: 'folder',
      libraryId: activeLibraryId,
      parentId: currentFolderId,
      name: cleaned,
      coverUrl: '',
      itemCount: 0,
      sizeLabel: '0 B',
      favorite,
      viewMode: 'list',
      sortMode: 'natural',
      createdAt: now,
    };
    setEntries((prev) => [...prev, created]);
    showToast(
      favorite
        ? `Carpeta "${cleaned}" creada en Favoritas`
        : `Carpeta "${cleaned}" creada`
    );
    return true;
  };

  const handleImportVideo = (payload: ImportVideoPayload): boolean => {
    const cleaned = payload.name.trim();
    if (!cleaned) {
      showToast('El título del vídeo no puede estar vacío');
      return false;
    }
    const conflict = entries.some(
      (e) =>
        e.type === 'video' &&
        e.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (conflict) {
      showToast('Ya existe otro vídeo con ese nombre en la app');
      return false;
    }

    const entriesSnapshot = entries;
    const now = Date.now();

    const newVideo: VideoEntry = {
      id: `vid-${now}`,
      type: 'video',
      libraryId: activeLibraryId,
      parentId: currentFolderId,
      name: cleaned,
      originalFileName: payload.originalFileName,
      coverUrl: payload.coverUrl,
      duration: payload.duration,
      sizeBytes: payload.sizeBytes ?? Math.round(payload.sizeMb * BYTES_PER_MB),
      sizeLabel: payload.sizeLabel,
      resolution: payload.resolution,
      favorite: false,
      tags: [],
      createdAt: now,
      importedAt: now,
      importedAtLabel:
        payload.sourceType && payload.sourceType !== 'local'
          ? 'Enlace externo guardado'
          : payload.nativeFilePath
            ? 'Vínculo directo al original'
            : 'Vinculado en esta sesión',
      videoUrl: payload.videoUrl,
      nativeFilePath: payload.nativeFilePath,
      sourceType: payload.sourceType ?? 'local',
      externalUrl: payload.externalUrl,
      externalId: payload.externalId,
    };

    setEntries((prev) => [...prev, newVideo]);

    showToast(
      payload.sourceType && payload.sourceType !== 'local'
        ? `Enlace "${cleaned}" guardado en la carpeta`
        : `Vídeo "${cleaned}" vinculado`,
      () => {
        setEntries(entriesSnapshot);
        showToast('Importación deshecha');
      }
    );
    return true;
  };

  const handleDuplicateVideo = (videoId: string) => {
    const source = entries.find(
      (e): e is VideoEntry => e.id === videoId && e.type === 'video'
    );
    if (!source) return;
    const now = Date.now();
    const bisName = getUniqueVideoName(`BIS ${source.name}`);
    const copy: VideoEntry = {
      ...source,
      id: `vid-${now}`,
      name: bisName,
      createdAt: now,
      importedAt: now,
    };
    setEntries((prev) => [...prev, copy]);
    showToast(`Instancia duplicada: "${bisName}"`);
  };

  const buildEntryOriginPath = (
    item: ExplorerEntry,
    sourcePool: ExplorerEntry[]
  ): string => {
    const libName =
      libraries.find((l) => l.id === item.libraryId)?.name ?? 'Biblioteca';
    if (!item.parentId) return `${libName} › Raíz`;
    const chain: string[] = [];
    let cursor = sourcePool.find((e) => e.id === item.parentId);
    while (cursor) {
      chain.unshift(cursor.name);
      cursor = cursor.parentId
        ? sourcePool.find((e) => e.id === cursor!.parentId)
        : undefined;
    }
    return chain.length > 0
      ? `${libName} › ${chain.join(' › ')}`
      : `${libName} › Raíz`;
  };

  const executeMoveEntriesToTrash = (ids: string[]) => {
    const entriesSnapshot = entries;
    const trashSnapshot = trashedEntries;
    const prevFolderId = currentFolderId;
    const now = Date.now();
    const allIdsToRemove = new Set<string>(ids);
    let added = true;
    while (added) {
      added = false;
      for (const item of entries) {
        if (
          item.parentId &&
          allIdsToRemove.has(item.parentId) &&
          !allIdsToRemove.has(item.id)
        ) {
          allIdsToRemove.add(item.id);
          added = true;
        }
      }
    }
    const removed = entries
      .filter((e) => allIdsToRemove.has(e.id))
      .map((item) => ({
        ...item,
        trashedAt: now,
        trashedFromPath: buildEntryOriginPath(item, entries),
      }));
    setEntries((prev) => prev.filter((e) => !allIdsToRemove.has(e.id)));
    setTrashedEntries((prev) => [...prev, ...removed]);

    if (currentFolderId && allIdsToRemove.has(currentFolderId)) {
      const folderEntry = entries.find((e) => e.id === currentFolderId);
      setCurrentFolderId(
        folderEntry?.parentId && !allIdsToRemove.has(folderEntry.parentId)
          ? folderEntry.parentId
          : null
      );
    }
    if (playerTarget && allIdsToRemove.has(playerTarget.videoId)) {
      setPlayerTarget(null);
    }
    setClipboard((prev) => {
      if (!prev) return null;
      const remaining = prev.ids.filter((id) => !allIdsToRemove.has(id));
      return remaining.length > 0 ? { ...prev, ids: remaining } : null;
    });

    showToast(
      ids.length === 1
        ? `"${removed[0]?.name ?? 'Elemento'}" enviado a la papelera`
        : `${ids.length} elemento(s) enviado(s) a la papelera`,
      () => {
        setEntries(entriesSnapshot);
        setTrashedEntries(trashSnapshot);
        setCurrentFolderId(prevFolderId);
        showToast('Eliminación deshecha');
      }
    );
  };

  const executeMoveLibraryToTrash = (targetLib: LibraryItem) => {
    if (libraries.length <= 1) {
      showToast('Debe quedar al menos una biblioteca en la aplicación');
      return;
    }
    const libsSnapshot = libraries;
    const entriesSnapshot = entries;
    const trashedLibsSnapshot = trashedLibraries;
    const prevPrimary = primaryLibraryId;
    const prevActive = activeLibraryId;
    const prevScreen = screen;

    const syncedLib =
      syncedLibraries.find((l) => l.id === targetLib.id) ?? targetLib;
    const libEntries = entries.filter((e) => e.libraryId === targetLib.id);
    const archivedItem: TrashedLibraryItem = {
      id: `libtrash-${targetLib.id}-${Date.now()}`,
      library: syncedLib,
      entries: libEntries,
      trashedAt: Date.now(),
      wasPrimary: primaryLibraryId === targetLib.id,
    };

    const remaining = libraries.filter((l) => l.id !== targetLib.id);
    setLibraries(remaining);
    setEntries((prev) => prev.filter((e) => e.libraryId !== targetLib.id));
    setTrashedLibraries((prev) => [archivedItem, ...prev]);

    if (primaryLibraryId === targetLib.id && remaining[0]) {
      setPrimaryLibraryId(remaining[0].id);
    }
    if (activeLibraryId === targetLib.id && remaining[0]) {
      setActiveLibraryId(remaining[0].id);
    }
    if (screen === 'explorer' && activeLibraryId === targetLib.id) {
      setScreen('libraries');
      setCurrentFolderId(null);
      setActiveTab('bibliotecas');
    }

    showToast(`Biblioteca "${targetLib.name}" enviada a la papelera`, () => {
      setLibraries(libsSnapshot);
      setEntries(entriesSnapshot);
      setTrashedLibraries(trashedLibsSnapshot);
      setPrimaryLibraryId(prevPrimary);
      setActiveLibraryId(prevActive);
      setScreen(prevScreen);
      showToast('Eliminación de biblioteca deshecha');
    });
  };

  const handleDeleteEntries = (ids: string[]) => {
    if (ids.length === 0) return;
    const itemsToConfirm = syncedEntries.filter((e) => ids.includes(e.id));
    if (itemsToConfirm.length === 0) return;
    setPendingTrashRequest({
      kind: 'entries',
      items: itemsToConfirm,
    });
  };

  const handleConfirmPendingTrash = () => {
    if (!pendingTrashRequest) return;
    const req = pendingTrashRequest;
    setPendingTrashRequest(null);
    if (req.kind === 'library') {
      executeMoveLibraryToTrash(req.library);
    } else {
      executeMoveEntriesToTrash(req.items.map((i) => i.id));
    }
  };

  const handleRestoreItemsFromTrash = (
    entryIds: string[],
    libraryTrashIds: string[]
  ) => {
    if (entryIds.length === 0 && libraryTrashIds.length === 0) return;
    const libsSnapshot = libraries;
    const entriesSnapshot = entries;
    const trashEntriesSnapshot = trashedEntries;
    const trashLibsSnapshot = trashedLibraries;
    const prevPrimary = primaryLibraryId;

    const restoredLibs: LibraryItem[] = [];
    const restoredLibEntries: ExplorerEntry[] = [];
    let nextLibrariesWorking = [...libraries];

    if (libraryTrashIds.length > 0) {
      const libsToRestore = trashedLibraries.filter((tl) =>
        libraryTrashIds.includes(tl.id)
      );
      libsToRestore.forEach((tl) => {
        let candidateName = tl.library.name.trim();
        while (
          nextLibrariesWorking.some(
            (l) => l.name.trim().toLowerCase() === candidateName.toLowerCase()
          )
        ) {
          candidateName = `${candidateName} (restaurada)`;
        }
        const restoredLib: LibraryItem = {
          ...tl.library,
          name: candidateName,
        };
        nextLibrariesWorking.push(restoredLib);
        restoredLibs.push(restoredLib);
        restoredLibEntries.push(...tl.entries);
      });
    }

    const toRestoreIds = new Set<string>(entryIds);
    let addedDescendant = true;
    while (addedDescendant) {
      addedDescendant = false;
      for (const item of trashedEntries) {
        if (
          item.parentId &&
          toRestoreIds.has(item.parentId) &&
          !toRestoreIds.has(item.id)
        ) {
          toRestoreIds.add(item.id);
          addedDescendant = true;
        }
      }
    }

    const activeIds = new Set(entries.map((e) => e.id));
    const survivingIds = new Set([...activeIds, ...toRestoreIds]);

    const itemsToRestore = trashedEntries
      .filter((e) => toRestoreIds.has(e.id))
      .map((item) => {
        const cleanParent =
          item.parentId && survivingIds.has(item.parentId)
            ? item.parentId
            : null;
        const { trashedAt: _ta, trashedFromPath: _tfp, ...cleanEntry } = item;
        return {
          ...cleanEntry,
          parentId: cleanParent,
        } as ExplorerEntry;
      });

    const primaryTargets = trashedEntries.filter((e) => entryIds.includes(e.id));
    const totalCount = primaryTargets.length + restoredLibs.length;

    let destinationLabel = '';
    if (restoredLibs.length > 0 && primaryTargets.length === 0) {
      destinationLabel =
        restoredLibs.length === 1
          ? `Bibliotecas (${restoredLibs[0].name})`
          : `Bibliotecas (${restoredLibs.length} bibliotecas)`;
    } else if (restoredLibs.length === 0) {
      const uniquePaths = Array.from(
        new Set(
          primaryTargets.map(
            (item) =>
              item.trashedFromPath ||
              buildEntryOriginPath(item, [...entries, ...trashedEntries])
          )
        )
      );
      destinationLabel =
        uniquePaths.length === 1
          ? uniquePaths[0]
          : `${primaryTargets.length} ubicaciones originales`;
    } else {
      destinationLabel = `${totalCount} ubicaciones originales`;
    }

    if (restoredLibs.length > 0) {
      setLibraries(nextLibrariesWorking);
      if (!primaryLibraryId || !libraries.some((l) => l.id === primaryLibraryId)) {
        setPrimaryLibraryId(restoredLibs[0].id);
        setActiveLibraryId(restoredLibs[0].id);
      }
      setTrashedLibraries((prev) =>
        prev.filter((tl) => !libraryTrashIds.includes(tl.id))
      );
    }
    if (toRestoreIds.size > 0) {
      setTrashedEntries((prev) => prev.filter((e) => !toRestoreIds.has(e.id)));
    }
    if (itemsToRestore.length > 0 || restoredLibEntries.length > 0) {
      setEntries((prev) => [...prev, ...restoredLibEntries, ...itemsToRestore]);
    }

    showToast({
      message:
        restoredLibs.length === 1 && primaryTargets.length === 0
          ? 'Biblioteca restaurada con éxito'
          : totalCount === 1
            ? 'Elemento restaurado con éxito'
            : `${totalCount} elementos restaurados con éxito`,
      subtitle: `Devuelto a ${destinationLabel}`,
      tone: 'restore',
      onUndo: () => {
        setLibraries(libsSnapshot);
        setEntries(entriesSnapshot);
        setTrashedEntries(trashEntriesSnapshot);
        setTrashedLibraries(trashLibsSnapshot);
        setPrimaryLibraryId(prevPrimary);
        showToast('Restauración deshecha');
      },
    });
  };

  const handlePurgeItemsFromTrash = (
    entryIds: string[],
    libraryTrashIds: string[]
  ) => {
    if (entryIds.length === 0 && libraryTrashIds.length === 0) return;
    const toPurgeIds = new Set<string>(entryIds);

    let addedDescendant = true;
    while (addedDescendant) {
      addedDescendant = false;
      for (const item of trashedEntries) {
        if (
          item.parentId &&
          toPurgeIds.has(item.parentId) &&
          !toPurgeIds.has(item.id)
        ) {
          toPurgeIds.add(item.id);
          addedDescendant = true;
        }
      }
    }

    const rootPurgedEntries = trashedEntries.filter((e) =>
      entryIds.includes(e.id)
    );
    const purgedLibs = trashedLibraries.filter((tl) =>
      libraryTrashIds.includes(tl.id)
    );

    const entriesMb = trashedEntries
      .filter((e): e is VideoEntry => e.type === 'video' && toPurgeIds.has(e.id))
      .reduce((sum, v) => sum + getVideoSizeMb(v), 0);
    const libsMb = purgedLibs.reduce(
      (sum, tl) =>
        sum +
        tl.entries.reduce(
          (acc, e) => (e.type === 'video' ? acc + getVideoSizeMb(e) : acc),
          0
        ),
      0
    );

    const purgedPaths = [
      ...trashedEntries
        .filter(
          (e): e is VideoEntry =>
            e.type === 'video' &&
            toPurgeIds.has(e.id) &&
            Boolean(e.nativeFilePath)
        )
        .map((v) => v.nativeFilePath!),
      ...purgedLibs.flatMap((tl) =>
        tl.entries
          .filter(
            (e): e is VideoEntry =>
              e.type === 'video' && Boolean(e.nativeFilePath)
          )
          .map((v) => v.nativeFilePath!)
      ),
    ];

    const remainingEntries = trashedEntries.filter((e) => !toPurgeIds.has(e.id));
    const remainingLibs = trashedLibraries.filter(
      (tl) => !libraryTrashIds.includes(tl.id)
    );
    setTrashedEntries(remainingEntries);
    setTrashedLibraries(remainingLibs);

    if (purgedPaths.length > 0) {
      const remainingAcrossProfiles = [
        ...entries,
        ...remainingEntries,
        ...remainingLibs.flatMap((tl) => tl.entries),
        ...Object.entries(workspacesByProfile)
          .filter(([pid]) => pid !== activeProfileId)
          .flatMap(([, ws]) => [
            ...ws.entries,
            ...ws.trashedEntries,
            ...ws.trashedLibraries.flatMap((tl) => tl.entries),
          ]),
      ];
      void releaseUnreferencedNativeVideoPermissions(
        purgedPaths,
        remainingAcrossProfiles
      );
    }

    const purgedCount = rootPurgedEntries.length + purgedLibs.length;
    const isNowEmpty =
      remainingEntries.length === 0 && remainingLibs.length === 0;

    showToast({
      message: isNowEmpty
        ? 'Papelera vaciada por completo'
        : 'Eliminación definitiva completada',
      subtitle: `${purgedCount} ${
        purgedCount === 1 ? 'elemento eliminado' : 'elementos eliminados'
      } para siempre · ${formatStorageMb(entriesMb + libsMb)} liberados`,
      tone: 'purge',
    });
  };

  const handleCopyToClipboard = (ids: string[], mode: 'copy' | 'cut') => {
    setClipboard({ ids, mode });
    showToast(
      `${ids.length} elemento(s) ${mode === 'copy' ? 'copiado(s)' : 'cortado(s)'}`
    );
  };

  const handlePasteClipboard = () => {
    if (!clipboard || clipboard.ids.length === 0) return;
    const snapshot = entries;
    const viewPrefsSnapshot = folderViewPrefs;
    const sortPrefsSnapshot = folderSortPrefs;
    const manualOrderSnapshot = manualOrderByFolder;

    const outcome = pasteClipboardEntries(
      entries,
      clipboard.ids,
      clipboard.mode,
      activeLibraryId,
      currentFolderId,
      {
        folderViewPrefs,
        folderSortPrefs,
        manualOrderByFolder,
      }
    );

    if (!outcome.ok) {
      if (outcome.reason === 'cycle') {
        showToast('No puedes mover una carpeta dentro de sí misma');
      }
      return;
    }

    setEntries(outcome.nextEntries);
    if (Object.keys(outcome.addedViewPrefs).length > 0) {
      setFolderViewPrefs((prev) => ({ ...prev, ...outcome.addedViewPrefs }));
    }
    if (Object.keys(outcome.addedSortPrefs).length > 0) {
      setFolderSortPrefs((prev) => ({ ...prev, ...outcome.addedSortPrefs }));
    }
    if (Object.keys(outcome.addedManualOrder).length > 0) {
      setManualOrderByFolder((prev) => ({
        ...prev,
        ...outcome.addedManualOrder,
      }));
    }

    const wasCut = clipboard.mode === 'cut';
    setClipboard(null);

    const toastMsg = wasCut
      ? 'Elementos movidos aquí'
      : outcome.totalAffectedCount > outcome.rootCount
        ? `Pegados ${outcome.rootCount} elemento(s) (${outcome.totalAffectedCount} en total con su contenido)`
        : 'Elementos pegados aquí';

    showToast(toastMsg, () => {
      setEntries(snapshot);
      setFolderViewPrefs(viewPrefsSnapshot);
      setFolderSortPrefs(sortPrefsSnapshot);
      setManualOrderByFolder(manualOrderSnapshot);
      showToast(wasCut ? 'Movimiento deshecho' : 'Pegado deshecho');
    });
  };

  const handleTabPress = (tab: BottomTab) => {
    if (tab === 'carpetas') {
      setMoreMenuOpen(false);
      if (libraries.length === 0) {
        setScreen('libraries');
        setActiveTab('bibliotecas');
        showToast('Crea una biblioteca primero para explorar carpetas');
        return;
      }
      setDrawerOpen(true);
      return;
    }
    if (tab === 'mas') {
      setMoreMenuOpen((prev) => !prev);
      return;
    }
    setMoreMenuOpen(false);
    setActiveTab(tab);

    if (tab === 'bibliotecas') {
      setFlatVideosMode(false);
      setScreen('libraries');
      return;
    }
    if (tab === 'favoritos') {
      setFlatVideosMode(false);
      setScreen('favorites');
      setSearchOpen(false);
      return;
    }
    if (tab === 'papelera') {
      setFlatVideosMode(false);
      setTrashLibraryScope(screen === 'libraries' ? 'all' : 'active');
      setScreen('trash');
      setSearchOpen(false);
    }
  };

  const accentBarColor = (accent: LibraryItem['accentColor']) => {
    switch (accent) {
      case 'primary':
        return 'bg-[#ff5261]';
      case 'secondary':
        return 'bg-[#ffb95f]';
      case 'tertiary':
        return 'bg-[#4cd7f6]';
      default:
        return 'bg-[#c8b6b6]';
    }
  };

  const cardMenuTarget = syncedLibraries.find((l) => l.id === cardMenuId) ?? null;
  const detailsLibrary = syncedLibraries.find((l) => l.id === detailsLibraryId) ?? null;

  const headerTitle =
    screen === 'libraries'
      ? 'Bibliotecas'
      : screen === 'favorites'
        ? 'Favoritos'
        : screen === 'recents'
          ? 'Recientes'
          : screen === 'trash'
            ? 'Papelera'
            : flatVideosMode
              ? 'Todos los vídeos'
              : currentFolder?.name ?? activeLibrary?.name ?? 'Explorador';

  return (
    <div
      className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch && touch.clientX <= 28 && !drawerOpen) {
          edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        } else {
          edgeSwipeStartRef.current = null;
        }
      }}
      onTouchEnd={(e) => {
        if (!edgeSwipeStartRef.current) return;
        const touch = e.changedTouches[0];
        if (touch) {
          const dx = touch.clientX - edgeSwipeStartRef.current.x;
          const dy = Math.abs(touch.clientY - edgeSwipeStartRef.current.y);
          if (dx > 56 && dy < 60) {
            setDrawerOpen(true);
          }
        }
        edgeSwipeStartRef.current = null;
      }}
    >
      {/* Compact Top App Bar */}
      <header className="sticky top-0 z-40 pt-safe bg-[#131313]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto h-14 px-4 flex items-center justify-between gap-3">
          {/* Left: App Icon + Current Screen/Folder Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                setScreen('libraries');
                setActiveTab('bibliotecas');
              }}
              aria-label="Ir a inicio de bibliotecas"
              className="shrink-0 rounded-xl active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5261]"
            >
              <DanceVaultLogo size={36} />
            </button>
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-[#ffb95f] leading-none">
                DanceVault
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-1 text-left group min-w-0 mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5261] rounded"
              >
                <span className="text-base font-bold text-[#e5e2e1] truncate group-hover:text-[#ffb3b3] transition-colors">
                  {headerTitle}
                </span>
                <ChevronDown className="w-4 h-4 text-[#c8b6b6] shrink-0" />
              </button>
            </div>
          </div>

          {/* Right: Quick Search (on Libraries view) + Active User Profile */}
          <div className="flex items-center gap-1.5 shrink-0">
            {screen === 'libraries' && (
              <button
                type="button"
                aria-label="Buscar bibliotecas"
                onClick={() => setSearchOpen((v) => !v)}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-[#201f1f] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5261]"
              >
                {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </button>
            )}

            <button
              type="button"
              aria-label={`Perfil activo: ${activeProfile.name}`}
              onClick={() => setProfileMenuOpen(true)}
              className="min-h-[44px] px-2 rounded-full flex items-center gap-2 hover:bg-[#201f1f] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5261]"
            >
              <span
                className={`text-[11px] sm:text-xs font-semibold truncate max-w-[84px] sm:max-w-[130px] ${
                  activeProfile.isMaster ? 'text-sky-400' : 'text-[#e5e2e1]'
                }`}
              >
                {activeProfile.name}
              </span>
              <span className="w-8 h-8 rounded-full bg-[#ffb3b3] text-[#400009] flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </span>
            </button>
          </div>
        </div>

        {/* Expandable Search Bar (Libraries screen) */}
        {screen === 'libraries' && searchOpen && (
          <div className="max-w-5xl mx-auto px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#c8b6b6] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar bibliotecas por nombre..."
                autoFocus
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#201f1f] text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/60 border border-white/10 focus:outline-none focus:border-[#ff5261]"
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-24">
        {screen === 'libraries' ? (
          <div className="space-y-5">
            <input
              ref={libraryImportInputRef}
              type="file"
              accept=".json,application/json,text/json"
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={handleLibraryImportFileChange}
            />

            {/* Primary CTA: Create New Library */}
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="w-full min-h-[56px] rounded-xl bg-gradient-to-r from-[#ff5261] via-[#ee9800] to-[#ffb95f] text-[#400009] flex items-center justify-between px-4 py-3 active:scale-[0.99] transition-transform shadow-[0_4px_20px_rgba(255,82,97,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb3b3]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#400009]/15 flex items-center justify-center shrink-0">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div className="text-left min-w-0">
                  <span className="block text-base font-bold leading-tight truncate">
                    Nueva Biblioteca
                  </span>
                  <span className="block text-xs font-medium opacity-85 truncate">
                    Crea un espacio independiente por disciplina
                  </span>
                </div>
              </div>
              <PlusCircle className="w-6 h-6 shrink-0" />
            </button>

            {/* Libraries Grid or Empty State */}
            {filteredLibraries.length > 0 ? (
              <section
                aria-label="Listado de bibliotecas"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {filteredLibraries.map((lib) => {
                  const isPrimary = lib.id === primaryLibraryId;
                  const imgKey = `${lib.id}:${lib.coverUrl}`;
                  const imgFailed = failedImages[imgKey] || !lib.coverUrl;

                  return (
                    <article
                      key={lib.id}
                      onClick={() => openLibraryExplorer(lib.id)}
                      className={`relative flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all ${
                        isPrimary
                          ? 'bg-[#2a2a2a] ring-2 ring-[#ff5261]/70 shadow-lg'
                          : 'bg-[#201f1f] hover:bg-[#262525]'
                      }`}
                    >
                      {/* Cover Photo + Scrim */}
                      <div className="relative w-full h-44 overflow-hidden bg-[#1c1b1b]">
                        {!imgFailed ? (
                          <img
                            src={lib.coverUrl}
                            alt={`Portada de la biblioteca ${lib.name}`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [imgKey]: true }))
                            }
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                          />
                        ) : (
                          <DefaultIconCover
                            kind="library"
                            accentHex={
                              lib.accentHex ??
                              (lib.accentColor === 'primary'
                                ? '#ff5261'
                                : lib.accentColor === 'secondary'
                                  ? '#ffb95f'
                                  : lib.accentColor === 'tertiary'
                                    ? '#4cd7f6'
                                    : '#a855f7')
                            }
                            size="lg"
                          />
                        )}

                        <div
                          className={`absolute inset-0 bg-gradient-to-t ${
                            isPrimary
                              ? 'from-[#2a2a2a] via-[#2a2a2a]/45 to-transparent'
                              : 'from-[#201f1f] via-[#201f1f]/45 to-transparent'
                          }`}
                        />

                        {isPrimary && (
                          <div className="absolute top-2.5 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ff5261] text-[#400009] text-[10px] font-extrabold uppercase tracking-wider shadow-md">
                            <Star className="w-3 h-3 fill-current" />
                            <span>Principal</span>
                          </div>
                        )}

                        <button
                          type="button"
                          aria-label={`Opciones de ${lib.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardMenuId(lib.id);
                          }}
                          className="absolute top-2.5 right-2.5 min-h-[40px] min-w-[40px] rounded-full bg-[#0e0e0e]/75 backdrop-blur-md text-[#e5e2e1] flex items-center justify-center hover:bg-[#0e0e0e] active:scale-90 transition-all"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>

                        {/* Title & Name Overlay with Edit Buttons */}
                        <div className="absolute bottom-2.5 left-4 right-4 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p
                              className={`font-mono text-[11px] font-semibold uppercase tracking-wider truncate ${
                                isPrimary ? 'text-[#ffb95f]' : 'text-[#c8b6b6]'
                              }`}
                            >
                              {lib.disciplineLabel}
                            </p>
                            <button
                              type="button"
                              aria-label={`Editar título de ${lib.name}`}
                              title="Editar título"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(lib, 'title');
                              }}
                              className="min-h-[28px] min-w-[28px] rounded-full bg-[#0e0e0e]/60 hover:bg-[#0e0e0e] text-[#c8b6b6] hover:text-[#ffb95f] flex items-center justify-center shrink-0 active:scale-90 transition-all"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <h2 className="text-xl font-extrabold text-[#e5e2e1] truncate">
                              {lib.name}
                            </h2>
                            <button
                              type="button"
                              aria-label={`Editar nombre de ${lib.name}`}
                              title="Editar nombre de la biblioteca"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(lib, 'name');
                              }}
                              className="min-h-[32px] min-w-[32px] rounded-full bg-[#0e0e0e]/65 hover:bg-[#0e0e0e] text-[#e5e2e1] hover:text-[#ffb3b3] flex items-center justify-center shrink-0 active:scale-90 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Metrics & Footer Action */}
                      <div className="p-4 flex flex-col gap-3">
                        <div className="grid grid-cols-3 gap-2 bg-[#1c1b1b] py-2.5 px-2 rounded-lg text-center">
                          <div className="flex flex-col">
                            <span className="font-mono tabular-nums text-sm font-bold text-[#ffb95f]">
                              {lib.videosCount}
                            </span>
                            <span className="text-[11px] text-[#c8b6b6]">Vídeos</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-mono tabular-nums text-sm font-bold text-[#4cd7f6]">
                              {lib.foldersCount}
                            </span>
                            <span className="text-[11px] text-[#c8b6b6]">Carpetas</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-mono tabular-nums text-sm font-bold text-[#e5e2e1]">
                              {lib.sizeLabel}
                            </span>
                            <span className="text-[11px] text-[#c8b6b6]">Vinculados</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 min-h-[36px]">
                          <div className="flex items-center gap-1.5 text-xs text-[#c8b6b6] min-w-0">
                            {isPrimary ? (
                              <History className="w-4 h-4 text-[#ffb3b3] shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-[#c8b6b6] shrink-0" />
                            )}
                            <span className="truncate">
                              Última práctica:{' '}
                              <strong className="text-[#e5e2e1] font-medium">
                                {lib.lastPracticed}
                              </strong>
                            </span>
                          </div>

                          {isPrimary && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLibraryExplorer(lib.id);
                              }}
                              className="px-4 py-2 rounded-full bg-[#ff5261] text-[#400009] text-xs font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-transform shadow-[0_0_12px_rgba(255,82,97,0.3)]"
                            >
                              <span>Abrir</span>
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : (
              <section className="rounded-2xl bg-[#1c1b1b] border border-white/[0.06] px-6 py-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#201f1f] text-[#ffb95f] flex items-center justify-center mx-auto">
                  <Library className="w-6 h-6" />
                </div>
                {libraries.length === 0 ? (
                  <>
                    <h3 className="text-base font-bold text-[#e5e2e1]">
                      Espacio vacío para {activeProfile.name}
                    </h3>
                    <p className="text-xs text-[#c8b6b6] max-w-sm mx-auto leading-relaxed">
                      Este usuario aún no tiene bibliotecas, carpetas ni vídeos.
                      Todo lo que crees aquí será totalmente independiente del
                      resto de perfiles.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-bold text-[#e5e2e1]">
                      Sin resultados
                    </h3>
                    <p className="text-xs text-[#c8b6b6]">
                      Ninguna biblioteca coincide con &laquo;{searchQuery}&raquo;.
                    </p>
                  </>
                )}
              </section>
            )}

            {/* Storage Breakdown Summary */}
            <section
              aria-label="Resumen de espacio vinculado"
              className="bg-[#1c1b1b] p-4 rounded-xl flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-[#ffb95f]" />
                  <h3 className="text-sm font-semibold text-[#e5e2e1]">
                    Peso total de vídeos vinculados
                  </h3>
                </div>
                <span className="font-mono tabular-nums text-xs font-bold text-[#ffb95f]">
                  {formatStorageMb(totalStorageMb)}
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[#353534] overflow-hidden flex">
                {syncedLibraries.map((lib) => {
                  const pct =
                    totalStorageMb > 0 ? (lib.sizeBytes / totalStorageMb) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={lib.id}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: lib.accentHex,
                      }}
                      className={`h-full ${lib.accentHex ? '' : accentBarColor(lib.accentColor)}`}
                      title={`${lib.name}: ${lib.sizeLabel}`}
                    />
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#c8b6b6]">
                {syncedLibraries.slice(0, 4).map((lib) => (
                  <span key={lib.id} className="inline-flex items-center gap-1.5">
                    <span
                      style={
                        lib.accentHex ? { backgroundColor: lib.accentHex } : undefined
                      }
                      className={`w-2 h-2 rounded-full ${
                        lib.accentHex ? '' : accentBarColor(lib.accentColor)
                      }`}
                    />
                    <span className="truncate max-w-[140px]">{lib.name}</span>
                  </span>
                ))}
              </div>
            </section>
          </div>
        ) : screen === 'favorites' ? (
          <FavoritesView
            libraries={syncedLibraries}
            activeLibrary={activeLibrary}
            allEntries={syncedEntries}
            onOpenFolder={(libId, folderId) => {
              setActiveLibraryId(libId);
              setCurrentFolderId(folderId);
              setFlatVideosMode(false);
              setScreen('explorer');
              setActiveTab('carpetas');
            }}
            onGoToLibraries={() => {
              setFlatVideosMode(false);
              setScreen('libraries');
              setActiveTab('bibliotecas');
            }}
            onToggleFavoriteWithUndo={handleToggleFavoriteWithUndo}
            onToggleFavoritesBatch={handleToggleFavoritesBatch}
            onRenameEntry={handleRenameEntry}
            onChangeCover={(entryId, coverUrl) => {
              setEntries((prev) =>
                prev.map((e) => (e.id === entryId ? { ...e, coverUrl } : e))
              );
              showToast('Portada actualizada');
            }}
            onDuplicateVideo={handleDuplicateVideo}
            onDeleteEntries={handleDeleteEntries}
            onCopyToClipboard={handleCopyToClipboard}
            cutEntryIds={clipboard?.mode === 'cut' ? clipboard.ids : []}
            onPlayVideo={(video, queueIds) =>
              setPlayerTarget({ videoId: video.id, queueIds })
            }
            onUpdateFolderMetadata={handleUpdateFolderMetadata}
            onUpdateVideoMetadata={handleUpdateVideoMetadata}
            onShowToast={(msg) => showToast(msg)}
          />
        ) : screen === 'recents' ? (
          <RecentsView
            libraries={syncedLibraries}
            allEntries={syncedEntries}
            recentDays={recentDays}
            onChangeRecentDays={(days) => {
              const clamped = Math.min(7, Math.max(1, Math.round(days)));
              setRecentDays(clamped);
              showToast(
                `Recientes mostrará vídeos de los últimos ${clamped} ${
                  clamped === 1 ? 'día' : 'días'
                }`
              );
            }}
            onOpenFolder={(libId, folderId) => {
              setActiveLibraryId(libId);
              setCurrentFolderId(folderId);
              setFlatVideosMode(false);
              setScreen('explorer');
              setActiveTab('carpetas');
            }}
            onGoToLibraries={() => {
              setFlatVideosMode(false);
              setScreen('libraries');
              setActiveTab('bibliotecas');
            }}
            onToggleFavoriteWithUndo={handleToggleFavoriteWithUndo}
            onToggleFavoritesBatch={handleToggleFavoritesBatch}
            onRenameEntry={handleRenameEntry}
            onChangeCover={(entryId, coverUrl) => {
              setEntries((prev) =>
                prev.map((e) => (e.id === entryId ? { ...e, coverUrl } : e))
              );
              showToast('Portada actualizada');
            }}
            onDuplicateVideo={handleDuplicateVideo}
            onDeleteEntries={handleDeleteEntries}
            onCopyToClipboard={handleCopyToClipboard}
            cutEntryIds={clipboard?.mode === 'cut' ? clipboard.ids : []}
            onPlayVideo={(video, queueIds) =>
              setPlayerTarget({ videoId: video.id, queueIds })
            }
            onUpdateVideoMetadata={handleUpdateVideoMetadata}
            onShowToast={(msg) => showToast(msg)}
          />
        ) : screen === 'trash' ? (
          <TrashView
            key={`${trashLibraryScope}:${activeLibrary?.id ?? 'all'}`}
            libraries={syncedLibraries}
            activeLibrary={activeLibrary}
            trashedEntries={trashedEntries}
            trashedLibraries={trashedLibraries}
            activeEntries={syncedEntries}
            initialLibraryScope={trashLibraryScope}
            onGoToExplorer={(libId) => openLibraryExplorer(libId)}
            onRestoreItems={handleRestoreItemsFromTrash}
            onPurgeItems={handlePurgeItemsFromTrash}
            onPlayVideo={(video, queueIds) =>
              setPlayerTarget({ videoId: video.id, queueIds })
            }
          />
        ) : activeLibrary ? (
          <FolderExplorerView
            library={activeLibrary}
            currentFolderId={currentFolderId}
            flatVideosMode={flatVideosMode}
            onExitFlatVideos={() => {
              setFlatVideosMode(false);
              setCurrentFolderId(null);
            }}
            allEntries={syncedEntries}
            folderViewPrefs={folderViewPrefs}
            folderSortPrefs={folderSortPrefs}
            manualOrderByFolder={manualOrderByFolder}
            onSetFolderViewPref={(key, mode) =>
              setFolderViewPrefs((prev) => ({ ...prev, [key]: mode }))
            }
            onSetFolderSortPref={(key, mode) =>
              setFolderSortPrefs((prev) => ({ ...prev, [key]: mode }))
            }
            onUpdateManualOrder={(key, orderedIds) =>
              setManualOrderByFolder((prev) => ({ ...prev, [key]: orderedIds }))
            }
            onChangeCover={(entryId, coverUrl) => {
              setEntries((prev) =>
                prev.map((e) => (e.id === entryId ? { ...e, coverUrl } : e))
              );
              showToast('Portada actualizada');
            }}
            onNavigateFolder={(folderId) => {
              setFlatVideosMode(false);
              setCurrentFolderId(folderId);
            }}
            onGoToLibraries={() => {
              setFlatVideosMode(false);
              setScreen('libraries');
              setActiveTab('bibliotecas');
            }}
            onToggleFavorite={handleToggleFavorite}
            onRenameEntry={handleRenameEntry}
            onCreateFolder={handleCreateFolder}
            onImportVideo={handleImportVideo}
            onDuplicateVideo={handleDuplicateVideo}
            onDeleteEntries={handleDeleteEntries}
            onCopyToClipboard={handleCopyToClipboard}
            cutEntryIds={clipboard?.mode === 'cut' ? clipboard.ids : []}
            clipboardCount={clipboard?.ids.length ?? 0}
            onPasteClipboard={handlePasteClipboard}
            onOpenFolderDetails={() => {
              if (activeLibrary) {
                setDetailsLibraryId(activeLibrary.id);
              }
            }}
            onPlayVideo={(video, queueIds) =>
              setPlayerTarget({ videoId: video.id, queueIds })
            }
            onUpdateFolderMetadata={handleUpdateFolderMetadata}
            onUpdateVideoMetadata={handleUpdateVideoMetadata}
            openDetailsSignal={folderDetailsSignal}
            onShowToast={(msg) => showToast(msg)}
          />
        ) : (
          <section className="rounded-2xl bg-[#1c1b1b] border border-white/[0.06] px-6 py-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#201f1f] text-[#ffb95f] flex items-center justify-center mx-auto">
              <Library className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#e5e2e1]">
                Aún no tienes bibliotecas en este usuario
              </h3>
              <p className="text-xs text-[#c8b6b6] max-w-sm mx-auto leading-relaxed">
                Crea tu primera biblioteca para empezar a organizar carpetas y
                vídeos en {activeProfile.name}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setScreen('libraries');
                setActiveTab('bibliotecas');
                setCreateModalOpen(true);
              }}
              className="px-5 h-10 rounded-full bg-[#ff5261] text-[#400009] text-xs font-extrabold inline-flex items-center gap-2 active:scale-95 transition-transform"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Crear primera biblioteca</span>
            </button>
          </section>
        )}
      </main>

      {/* Fixed Bottom Navigation Bar (Section 8.4) */}
      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 left-0 right-0 z-40 pb-safe bg-[#131313]/95 backdrop-blur-xl border-t border-white/[0.06]"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-5 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => handleTabPress('bibliotecas')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
              screen === 'libraries'
                ? 'text-[#ffb3b3] font-bold'
                : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <Library className="w-5 h-5" />
            <span className="text-[10px] leading-none">Biblioteca</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabPress('carpetas')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
              screen === 'explorer' || drawerOpen
                ? 'text-[#ffb3b3] font-bold'
                : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-[10px] leading-none">Carpetas</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabPress('favoritos')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
              screen === 'favorites'
                ? 'text-[#ffb3b3] font-bold'
                : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <Heart className={`w-5 h-5 ${screen === 'favorites' ? 'fill-current' : ''}`} />
            <span className="text-[10px] leading-none">Favoritos</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabPress('papelera')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
              screen === 'trash'
                ? 'text-[#ffb3b3] font-bold'
                : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px] leading-none">Papelera</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabPress('mas')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
              moreMenuOpen
                ? 'text-[#ffb3b3] font-bold'
                : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
            }`}
          >
            <MoreVertical className="w-5 h-5" />
            <span className="text-[10px] leading-none">Más</span>
          </button>
        </div>
      </nav>

      {/* Slide-in Tree Drawer (Stitch NavigationDrawer) */}
      {drawerOpen && activeLibrary && (
        <NavigationDrawer
          libraries={syncedLibraries}
          activeLibrary={activeLibrary}
          primaryLibraryId={primaryLibraryId}
          screen={screen}
          currentFolderId={currentFolderId}
          flatVideosMode={flatVideosMode}
          allEntries={syncedEntries}
          trashedEntries={trashedEntries}
          recentCount={recentVideosCount}
          trashCount={
            trashedEntries.filter((e) => e.libraryId === activeLibrary.id).length
          }
          onClose={() => setDrawerOpen(false)}
          onSelectLibraryRoot={(libId) => {
            setActiveLibraryId(libId);
            setCurrentFolderId(null);
            setFlatVideosMode(false);
            setScreen('explorer');
            setActiveTab('carpetas');
          }}
          onSelectAllVideosFlat={(libId) => {
            setActiveLibraryId(libId);
            setCurrentFolderId(null);
            setFlatVideosMode(true);
            setScreen('explorer');
            setSearchOpen(false);
            setActiveTab('carpetas');
          }}
          onSelectFolder={(libId, folderId) => {
            setActiveLibraryId(libId);
            setCurrentFolderId(folderId);
            setFlatVideosMode(false);
            setScreen('explorer');
            setActiveTab('carpetas');
          }}
          onSelectVideoLeaf={(libId, video) => {
            setActiveLibraryId(libId);
            setCurrentFolderId(video.parentId);
            setFlatVideosMode(false);
            setScreen('explorer');
            setActiveTab('carpetas');
            setPlayerTarget({ videoId: video.id });
          }}
          onOpenFavorites={() => {
            setFlatVideosMode(false);
            setScreen('favorites');
            setActiveTab('favoritos');
            setSearchOpen(false);
          }}
          onOpenRecents={() => {
            setFlatVideosMode(false);
            setScreen('recents');
            setActiveTab('carpetas');
            setSearchOpen(false);
          }}
          onOpenTrash={(libId) => {
            setActiveLibraryId(libId);
            setTrashLibraryScope('active');
            setFlatVideosMode(false);
            setScreen('trash');
            setActiveTab('papelera');
            setSearchOpen(false);
          }}
          onOpenLibrarySettings={(lib) => openEditModal(lib, 'name')}
        />
      )}

      {/* Profile Selector & User Management Modal */}
      {profileMenuOpen && (
        <UserProfilesModal
          profiles={profiles}
          activeProfileId={activeProfileId}
          getWorkspaceForProfile={getWorkspaceForProfile}
          onClose={() => setProfileMenuOpen(false)}
          onSelectProfile={handleSelectProfile}
          onCreateProfile={handleCreateProfile}
          onRenameProfile={handleRenameProfile}
          onCopyProfile={handleCopyProfile}
          onDeleteProfile={handleDeleteProfile}
          onExportProfileBackup={handleExportProfileBackup}
          onImportProfileBackup={handleImportProfileBackup}
        />
      )}

      {/* Create New Library Modal (Stitch) */}
      {createModalOpen && (
        <CreateLibraryModal
          existingLibraries={libraries}
          onClose={() => setCreateModalOpen(false)}
          onCreateLibrary={handleCreateLibrary}
          onImportLibrary={handleTriggerImportLibraryFile}
        />
      )}

      {/* Library Card Context Menu */}
      {cardMenuTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setCardMenuId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#201f1f] rounded-2xl border border-white/10 p-4 space-y-1.5"
          >
            <p className="px-2 py-1 text-xs font-mono uppercase tracking-wider text-[#ffb95f] truncate border-b border-white/[0.06] mb-1">
              {cardMenuTarget.name}
            </p>

            <button
              type="button"
              disabled={cardMenuTarget.id === primaryLibraryId}
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                handleSetPrimaryLibrary(target);
              }}
              className={`w-full text-left px-3 py-3 rounded-xl text-sm flex items-center gap-2.5 ${
                cardMenuTarget.id === primaryLibraryId
                  ? 'text-[#ffb95f] bg-[#2a2a2a]/60 cursor-default'
                  : 'text-[#e5e2e1] hover:bg-[#2a2a2a]'
              }`}
            >
              <Star
                className={`w-4 h-4 text-[#ffb95f] ${
                  cardMenuTarget.id === primaryLibraryId ? 'fill-current' : ''
                }`}
              />
              <span>
                {cardMenuTarget.id === primaryLibraryId
                  ? 'Ya es la biblioteca principal'
                  : 'Hacer principal'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                openEditModal(target, 'name');
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <Pencil className="w-4 h-4 text-[#ffb95f]" />
              <span>Editar nombre y título</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const targetId = cardMenuTarget.id;
                setCardMenuId(null);
                setLibCoverTargetId(targetId);
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <ImageIcon className="w-4 h-4 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                handleCopyLibrary(target);
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <Copy className="w-4 h-4 text-[#c8b6b6]" />
              <span>Copiar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                handleRequestExportLibrary(target);
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <Upload className="w-4 h-4 text-[#4cd7f6]" />
              <span>Exportar biblioteca (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                setDetailsLibraryId(target.id);
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#e5e2e1] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <Info className="w-4 h-4 text-[#c8b6b6]" />
              <span>Detalles</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const target = cardMenuTarget;
                setCardMenuId(null);
                handleDeleteLibrary(target);
              }}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-[#ffb4ab] hover:bg-[#2a2a2a] flex items-center gap-2.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      )}

      {/* Library Details Modal */}
      {detailsLibrary && (
        <LibraryDetailsModal
          library={detailsLibrary}
          isPrimary={detailsLibrary.id === primaryLibraryId}
          canDelete={syncedLibraries.length > 1}
          totalStorageMb={totalStorageMb}
          allEntries={syncedEntries}
          onClose={() => setDetailsLibraryId(null)}
          onOpenExplorer={(libId) => openLibraryExplorer(libId)}
          onSetPrimary={handleSetPrimaryLibrary}
          onEdit={(lib) => openEditModal(lib, 'name')}
          onChangeCover={(libId) => setLibCoverTargetId(libId)}
          onChangeAccent={handleChangeLibraryAccent}
          onCopy={handleCopyLibrary}
          onExport={handleRequestExportLibrary}
          onDelete={handleDeleteLibrary}
        />
      )}

      {/* 2-Step Library Export / Import Confirmation Modal */}
      {libraryBackupDialog && (
        <LibraryBackupConfirmModal
          dialog={libraryBackupDialog}
          onClose={() => setLibraryBackupDialog(null)}
          onAdvanceStep={() =>
            setLibraryBackupDialog((prev) =>
              prev ? { ...prev, step: 2 } : null
            )
          }
          onConfirmExport={handleConfirmExportLibrary}
          onConfirmImport={handleConfirmImportLibrary}
        />
      )}

      {/* Library Cover Picker Modal */}
      {libCoverTargetId && (() => {
        const targetLib = libraries.find((l) => l.id === libCoverTargetId);
        if (!targetLib) return null;
        const libVideos = entries.filter(
          (e): e is VideoEntry =>
            e.type === 'video' && e.libraryId === targetLib.id && Boolean(e.coverUrl)
        );
        const hasRealCover =
          Boolean(targetLib.coverUrl) &&
          !isDefaultIconCoverUrl(targetLib.coverUrl);

        return (
          <div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setLibCoverTargetId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#201f1f] rounded-2xl border border-white/10 p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#e5e2e1]">
                    Cambiar portada
                  </h3>
                  <p className="text-xs text-[#c8b6b6] truncate">
                    {targetLib.name}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar selector de portada"
                  onClick={() => setLibCoverTargetId(null)}
                  className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#c8b6b6] hover:bg-[#2a2a2a]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {libVideos.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[#c8b6b6]">
                    Vídeos de esta biblioteca
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {libVideos.map((vid) => (
                      <button
                        key={vid.id}
                        type="button"
                        onClick={() => {
                          handleChangeLibraryCover(targetLib.id, vid.coverUrl);
                          setLibCoverTargetId(null);
                        }}
                        className={`group flex flex-col rounded-xl overflow-hidden bg-[#131313] border text-left transition-all ${
                          targetLib.coverUrl === vid.coverUrl
                            ? 'border-[#ff5261] ring-1 ring-[#ff5261]'
                            : 'border-white/10 hover:border-[#ff5261]'
                        }`}
                      >
                        <div className="w-full aspect-video bg-[#2a2a2a] overflow-hidden">
                          <img
                            src={vid.coverUrl}
                            alt={vid.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <span className="p-2 text-[11px] font-medium text-[#e5e2e1] truncate">
                          {vid.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!hasRealCover ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="block text-xs font-semibold text-[#c8b6b6]">
                      Iconos por defecto
                    </span>
                    <span className="font-mono text-[10px] text-[#c8b6b6]/75">
                      Sin portada real
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEFAULT_LIBRARY_ICON_COVERS.map((cov) => {
                      const active = targetLib.coverUrl === cov.url;
                      return (
                        <button
                          key={cov.id}
                          type="button"
                          onClick={() => {
                            handleChangeLibraryCover(
                              targetLib.id,
                              cov.url,
                              cov.accentHex
                            );
                            setLibCoverTargetId(null);
                          }}
                          className={`group flex flex-col rounded-xl overflow-hidden bg-[#131313] border text-left transition-all ${
                            active
                              ? 'border-[#ff5261] ring-1 ring-[#ff5261]'
                              : 'border-white/10 hover:border-[#ff5261]'
                          }`}
                        >
                          <div className="w-full aspect-video bg-[#181718] overflow-hidden">
                            <img
                              src={cov.url}
                              alt={cov.label}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <span className="p-2 text-[11px] font-medium text-[#e5e2e1] truncate">
                            {cov.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {libVideos.length === 0 && (
                    <p className="text-[11px] text-[#c8b6b6]/80 leading-relaxed pt-1">
                      Cuando añadas vídeos con carátula en esta biblioteca, aparecerán aquí para usarlos como portada real.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 pt-1 border-t border-white/[0.06]">
                  {libVideos.length === 0 && (
                    <p className="text-xs text-[#c8b6b6] leading-relaxed">
                      Esta biblioteca ya tiene una portada real establecida. Añade más vídeos con carátula si quieres cambiarla por otro fotograma.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleChangeLibraryCover(targetLib.id, '');
                      setLibCoverTargetId(null);
                    }}
                    className="w-full h-11 px-4 rounded-xl bg-[#131313] hover:bg-[#2a2a2a] border border-white/10 text-xs font-semibold text-[#ffb95f] transition-colors"
                  >
                    Quitar portada actual (volver a icono por defecto)
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Edit Library Name & Title Modal */}
      {editingLib && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setEditingLib(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
            className="w-full max-w-sm bg-[#201f1f] rounded-2xl border border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#e5e2e1]">
                Editar biblioteca
              </h3>
              <button
                type="button"
                aria-label="Cerrar edición"
                onClick={() => setEditingLib(null)}
                className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#c8b6b6] hover:bg-[#2a2a2a]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-lib-title"
                  className="block text-xs font-medium text-[#c8b6b6]"
                >
                  Título / etiqueta superior
                </label>
                <input
                  id="edit-lib-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    setEditError(null);
                  }}
                  autoFocus={editingLib.focusField === 'title'}
                  placeholder="Ej. Colección de baile"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#131313] text-sm text-[#e5e2e1] border border-white/10 focus:outline-none focus:border-[#ffb95f]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-lib-name"
                  className="block text-xs font-medium text-[#c8b6b6]"
                >
                  Nombre de la biblioteca
                </label>
                <input
                  id="edit-lib-name"
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError(null);
                  }}
                  autoFocus={editingLib.focusField === 'name'}
                  placeholder="Ej. Bachata Sensual"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#131313] text-sm text-[#e5e2e1] border border-white/10 focus:outline-none focus:border-[#ff5261]"
                />
              </div>

              {editError && (
                <p className="text-xs text-[#ffb4ab]">{editError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingLib(null)}
                className="px-4 h-10 rounded-xl text-sm font-medium text-[#c8b6b6] hover:bg-[#2a2a2a]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 h-10 rounded-xl bg-[#ff5261] text-[#400009] text-sm font-bold hover:brightness-110"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom Bar "Más" Menu */}
      {moreMenuOpen && (
        <div
          className="fixed inset-0 z-[45]"
          onClick={() => setMoreMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ bottom: 'calc(5rem + var(--dv-safe-bottom))' }}
            className="fixed right-4 w-56 bg-[#2a2a2a] rounded-xl border border-white/10 shadow-xl p-1.5 space-y-1"
          >
            <button
              type="button"
              disabled={!clipboard || clipboard.ids.length === 0 || screen !== 'explorer'}
              onClick={() => {
                setMoreMenuOpen(false);
                handlePasteClipboard();
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${
                clipboard && clipboard.ids.length > 0 && screen === 'explorer'
                  ? 'text-[#e5e2e1] hover:bg-[#353534]'
                  : 'text-[#c8b6b6]/50 cursor-not-allowed'
              }`}
            >
              Pegar{' '}
              {clipboard && clipboard.ids.length > 0
                ? `(${clipboard.ids.length})`
                : '(portapapeles vacío)'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                if (screen === 'explorer' && currentFolder) {
                  setFolderDetailsSignal((n) => n + 1);
                } else if (activeLibrary) {
                  setDetailsLibraryId(activeLibrary.id);
                }
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#e5e2e1] hover:bg-[#353534]"
            >
              Detalles
            </button>
          </div>
        </div>
      )}

      {/* Studio Video Player Modal */}
      {(() => {
        if (!playerTarget) return null;
        const combinedEntriesPool = [...syncedEntries, ...trashedEntries];
        const playingVideo = combinedEntriesPool.find(
          (e): e is VideoEntry =>
            e.id === playerTarget.videoId && e.type === 'video'
        );
        if (!playingVideo) return null;
        const playingLib =
          syncedLibraries.find((l) => l.id === playingVideo.libraryId) ??
          trashedLibraries.find((tl) => tl.library.id === playingVideo.libraryId)
            ?.library ??
          activeLibrary;
        const queueVideos = playerTarget.queueIds
          ? playerTarget.queueIds
              .slice(0, 5)
              .map((id) =>
                combinedEntriesPool.find(
                  (e): e is VideoEntry => e.id === id && e.type === 'video'
                )
              )
              .filter((v): v is VideoEntry => Boolean(v))
          : undefined;

        const detailsVideo = playerDetailsVideoId
          ? combinedEntriesPool.find(
              (e): e is VideoEntry =>
                e.id === playerDetailsVideoId && e.type === 'video'
            ) ?? null
          : null;
        const detailsLib = detailsVideo
          ? syncedLibraries.find((l) => l.id === detailsVideo.libraryId) ??
            trashedLibraries.find(
              (tl) => tl.library.id === detailsVideo.libraryId
            )?.library ??
            activeLibrary
          : activeLibrary;

        const coverVideo = playerCoverVideoId
          ? combinedEntriesPool.find(
              (e): e is VideoEntry =>
                e.id === playerCoverVideoId && e.type === 'video'
            ) ?? null
          : null;

        const renameVideo = playerRenameVideoId
          ? combinedEntriesPool.find(
              (e): e is VideoEntry =>
                e.id === playerRenameVideoId && e.type === 'video'
            ) ?? null
          : null;

        const getBreadcrumbsLabel = (vid: VideoEntry) => {
          const libName =
            syncedLibraries.find((l) => l.id === vid.libraryId)?.name ??
            trashedLibraries.find((tl) => tl.library.id === vid.libraryId)
              ?.library.name ??
            'Biblioteca';
          const chain: string[] = [];
          let cursorId = vid.parentId;
          while (cursorId) {
            const f = combinedEntriesPool.find(
              (e): e is FolderEntry => e.id === cursorId && e.type === 'folder'
            );
            if (!f) break;
            chain.unshift(f.name);
            cursorId = f.parentId;
          }
          return chain.length > 0 ? `${libName} > ${chain.join(' > ')}` : libName;
        };

        return (
          <>
            <VideoPlayerModal
              video={playingVideo}
              library={playingLib}
              allEntries={combinedEntriesPool}
              queueVideos={queueVideos}
              onSelectQueueVideo={(nextId) =>
                setPlayerTarget((prev) =>
                  prev ? { ...prev, videoId: nextId } : { videoId: nextId }
                )
              }
              onClose={() => {
                setPlayerTarget(null);
                setPlayerDetailsVideoId(null);
                setPlayerCoverVideoId(null);
                setPlayerRenameVideoId(null);
              }}
              onNavigateFolder={(libId, folderId) => {
                setActiveLibraryId(libId);
                setCurrentFolderId(folderId);
                setFlatVideosMode(false);
                setScreen('explorer');
                setActiveTab('carpetas');
              }}
              onToggleFavorite={handleToggleFavorite}
              onOpenDetails={(vid) => setPlayerDetailsVideoId(vid.id)}
              onOpenCoverPicker={(vid) => setPlayerCoverVideoId(vid.id)}
              onSaveLoopMarker={(videoId, loopMarker, loopActive) =>
                handleUpdateVideoMetadata(videoId, {
                  loopMarker,
                  ...(loopActive !== undefined ? { loopActive } : {}),
                })
              }
              onUpdateMetadata={handleUpdateVideoMetadata}
              onShowToast={(msg) => showToast(msg)}
            />

            {detailsVideo && (
              <VideoDetailsModal
                video={detailsVideo}
                library={detailsLib}
                allEntries={syncedEntries}
                onClose={() => setPlayerDetailsVideoId(null)}
                onPlay={(vid) => {
                  setPlayerDetailsVideoId(null);
                  setPlayerTarget((prev) => ({
                    videoId: vid.id,
                    queueIds: prev?.queueIds,
                  }));
                }}
                onToggleFavorite={handleToggleFavorite}
                onRename={(vid) => setPlayerRenameVideoId(vid.id)}
                onChangeCover={(vid) => setPlayerCoverVideoId(vid.id)}
                onMove={(vid) => {
                  handleCopyToClipboard([vid.id], 'cut');
                  showToast(
                    `"${vid.name}" cortado: ve al destino y pulsa Pegar`
                  );
                }}
                onDuplicate={handleDuplicateVideo}
                onDelete={(vidId) => {
                  setPlayerDetailsVideoId(null);
                  handleDeleteEntries([vidId]);
                }}
                onUpdateMetadata={handleUpdateVideoMetadata}
              />
            )}

            {coverVideo && (
              <VideoCoverPickerModal
                video={coverVideo}
                folderPathLabel={getBreadcrumbsLabel(coverVideo)}
                onClose={() => setPlayerCoverVideoId(null)}
                onSaveCover={(targetScope, coverUrl, timecodeLabel) => {
                  if (targetScope === 'folder' && coverVideo.parentId) {
                    setEntries((prev) =>
                      prev.map((e) =>
                        e.id === coverVideo.parentId ? { ...e, coverUrl } : e
                      )
                    );
                    showToast(
                      `Portada de carpeta actualizada con el fotograma ${timecodeLabel}`
                    );
                  } else {
                    setEntries((prev) =>
                      prev.map((e) =>
                        e.id === coverVideo.id ? { ...e, coverUrl } : e
                      )
                    );
                    showToast(
                      `Portada de "${coverVideo.name}" guardada (${timecodeLabel})`
                    );
                  }
                }}
              />
            )}

            {renameVideo && (
              <RenameEntryModal
                key={renameVideo.id}
                target={renameVideo}
                allEntries={syncedEntries}
                onClose={() => setPlayerRenameVideoId(null)}
                onConfirmRename={handleRenameEntry}
              />
            )}
          </>
        );
      })()}

      {/* Universal Move to Trash Confirmation Sheet */}
      {pendingTrashRequest && (
        <MoveToTrashModal
          request={pendingTrashRequest}
          libraries={syncedLibraries}
          allEntries={syncedEntries}
          onClose={() => setPendingTrashRequest(null)}
          onConfirm={handleConfirmPendingTrash}
        />
      )}

      {/* Confirmation Toast (Rich Restore/Purge + standard Undo feedback) */}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] shadow-2xl border transition-all ${
            toast.subtitle || toast.tone === 'restore' || toast.tone === 'purge'
              ? 'w-[calc(100%-2rem)] max-w-md bg-[#1c1b1b] border-[#353534] rounded-xl p-3 flex items-center justify-between gap-3'
              : 'px-4 py-2.5 rounded-xl bg-[#353534] text-[#e5e2e1] text-xs font-medium border-white/10 flex items-center gap-3 whitespace-nowrap'
          }`}
        >
          {toast.subtitle || toast.tone === 'restore' || toast.tone === 'purge' ? (
            <>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    toast.tone === 'purge'
                      ? 'bg-[#93000a]/30 text-[#ffb4ab]'
                      : 'bg-[#201f1f] text-[#4cd7f6]'
                  }`}
                >
                  {toast.tone === 'purge' ? (
                    <Trash2 className="w-4 h-4" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-[#e5e2e1] truncate">
                    {toast.message}
                  </span>
                  {toast.subtitle && (
                    <span className="text-xs text-[#c8b6b6] truncate">
                      {toast.subtitle}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {toast.onUndo && (
                  <button
                    type="button"
                    onClick={() => {
                      const fn = toast.onUndo;
                      setToast(null);
                      fn?.();
                    }}
                    className="px-2 py-1 text-[#ff5261] text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all"
                  >
                    Deshacer
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar notificación"
                  onClick={() => setToast(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#201f1f] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <span>{toast.message}</span>
              {toast.onUndo && (
                <button
                  type="button"
                  onClick={() => {
                    const fn = toast.onUndo;
                    setToast(null);
                    fn?.();
                  }}
                  className="inline-flex items-center gap-1 text-[#ffb95f] font-bold hover:underline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deshacer</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => setToast(null)}
                className="text-[#c8b6b6] hover:text-[#e5e2e1]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
