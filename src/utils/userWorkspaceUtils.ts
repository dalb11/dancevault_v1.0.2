import { resolvePersistedCoverUrl } from '../assets/sampleCovers';
import {
  ExplorerEntry,
  LibraryItem,
  ProfileItem,
  TrashedLibraryItem,
  UserWorkspaceData,
} from '../types/dancevault';
import { isVolatileVideoUrl } from './nativeMediaStorage';

export function sanitizeEntries(raw: ExplorerEntry[]): ExplorerEntry[] {
  return raw.map((item) => {
    const cleanCover = resolvePersistedCoverUrl(item.coverUrl);
    if (item.type === 'video') {
      const cleanVideoUrl =
        item.videoUrl && isVolatileVideoUrl(item.videoUrl)
          ? undefined
          : item.videoUrl;
      return {
        ...item,
        coverUrl: cleanCover,
        videoUrl: cleanVideoUrl,
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        savedLoops: Array.isArray(item.savedLoops)
          ? item.savedLoops.map((loop) => ({ ...loop }))
          : undefined,
      };
    }
    return { ...item, coverUrl: cleanCover };
  });
}

export function createEmptyUserWorkspace(): UserWorkspaceData {
  return {
    libraries: [],
    primaryLibraryId: '',
    activeLibraryId: '',
    entries: [],
    trashedEntries: [],
    trashedLibraries: [],
    folderViewPrefs: {},
    folderSortPrefs: {},
    manualOrderByFolder: {},
    recentDays: 3,
  };
}

export function sanitizeUserWorkspace(
  raw: Partial<UserWorkspaceData> | undefined,
  fallback?: UserWorkspaceData
): UserWorkspaceData {
  const base = fallback ?? createEmptyUserWorkspace();
  if (!raw || typeof raw !== 'object') return cloneUserWorkspace(base);

  const libraries: LibraryItem[] = Array.isArray(raw.libraries)
    ? raw.libraries.map((lib) => ({
        ...lib,
        coverUrl: resolvePersistedCoverUrl(lib.coverUrl),
      }))
    : base.libraries.map((lib) => ({ ...lib }));

  const entries = Array.isArray(raw.entries)
    ? sanitizeEntries(raw.entries)
    : sanitizeEntries(base.entries);

  const trashedEntries = Array.isArray(raw.trashedEntries)
    ? sanitizeEntries(raw.trashedEntries)
    : sanitizeEntries(base.trashedEntries);

  const trashedLibraries: TrashedLibraryItem[] = Array.isArray(
    raw.trashedLibraries
  )
    ? raw.trashedLibraries.map((tl) => ({
        ...tl,
        library: {
          ...tl.library,
          coverUrl: resolvePersistedCoverUrl(tl.library.coverUrl),
        },
        entries: sanitizeEntries(tl.entries ?? []),
      }))
    : base.trashedLibraries.map((tl) => ({
        ...tl,
        library: { ...tl.library },
        entries: sanitizeEntries(tl.entries ?? []),
      }));

  const validLibIds = new Set(libraries.map((l) => l.id));
  const primaryLibraryId =
    typeof raw.primaryLibraryId === 'string' &&
    validLibIds.has(raw.primaryLibraryId)
      ? raw.primaryLibraryId
      : libraries[0]?.id ?? '';
  const activeLibraryId =
    typeof raw.activeLibraryId === 'string' &&
    validLibIds.has(raw.activeLibraryId)
      ? raw.activeLibraryId
      : primaryLibraryId;

  const folderViewPrefs =
    raw.folderViewPrefs && typeof raw.folderViewPrefs === 'object'
      ? { ...raw.folderViewPrefs }
      : { ...base.folderViewPrefs };

  const folderSortPrefs =
    raw.folderSortPrefs && typeof raw.folderSortPrefs === 'object'
      ? { ...raw.folderSortPrefs }
      : { ...base.folderSortPrefs };

  const manualOrderByFolder: Record<string, string[]> = {};
  const rawOrder =
    raw.manualOrderByFolder && typeof raw.manualOrderByFolder === 'object'
      ? raw.manualOrderByFolder
      : base.manualOrderByFolder;
  Object.entries(rawOrder).forEach(([k, arr]) => {
    if (Array.isArray(arr)) {
      manualOrderByFolder[k] = [...arr];
    }
  });

  const recentDays =
    typeof raw.recentDays === 'number' && !Number.isNaN(raw.recentDays)
      ? Math.min(7, Math.max(1, Math.round(raw.recentDays)))
      : base.recentDays;

  return {
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
  };
}

export function cloneUserWorkspace(ws: UserWorkspaceData): UserWorkspaceData {
  const clonedOrder: Record<string, string[]> = {};
  Object.entries(ws.manualOrderByFolder).forEach(([k, arr]) => {
    clonedOrder[k] = [...arr];
  });

  return {
    libraries: ws.libraries.map((lib) => ({ ...lib })),
    primaryLibraryId: ws.primaryLibraryId,
    activeLibraryId: ws.activeLibraryId,
    entries: ws.entries.map((entry) =>
      entry.type === 'video'
        ? {
            ...entry,
            tags: [...entry.tags],
            savedLoops: entry.savedLoops
              ? entry.savedLoops.map((loop) => ({ ...loop }))
              : undefined,
          }
        : { ...entry }
    ),
    trashedEntries: ws.trashedEntries.map((entry) =>
      entry.type === 'video'
        ? {
            ...entry,
            tags: [...entry.tags],
            savedLoops: entry.savedLoops
              ? entry.savedLoops.map((loop) => ({ ...loop }))
              : undefined,
          }
        : { ...entry }
    ),
    trashedLibraries: ws.trashedLibraries.map((tl) => ({
      ...tl,
      library: { ...tl.library },
      entries: tl.entries.map((entry) =>
        entry.type === 'video'
          ? {
              ...entry,
              tags: [...entry.tags],
              savedLoops: entry.savedLoops
                ? entry.savedLoops.map((loop) => ({ ...loop }))
                : undefined,
            }
          : { ...entry }
      ),
    })),
    folderViewPrefs: { ...ws.folderViewPrefs },
    folderSortPrefs: { ...ws.folderSortPrefs },
    manualOrderByFolder: clonedOrder,
    recentDays: ws.recentDays,
  };
}

export function getUniqueProfileName(
  baseName: string,
  existingProfiles: ProfileItem[]
): string {
  const trimmed = baseName.trim() || 'Usuario';
  const matches = (candidate: string) =>
    existingProfiles.some(
      (p) => p.name.trim().toLowerCase() === candidate.toLowerCase()
    );

  if (!matches(trimmed)) return trimmed;

  const copyBase = `${trimmed} (copia)`;
  if (!matches(copyBase)) return copyBase;

  let index = 2;
  while (matches(`${trimmed} (copia ${index})`)) {
    index += 1;
  }
  return `${trimmed} (copia ${index})`;
}

export function getUniqueCopyProfileName(
  sourceName: string,
  existingProfiles: ProfileItem[]
): string {
  const base =
    sourceName
      .trim()
      .replace(/\s*\(copia(?:\s+\d+)?\)$/i, '')
      .trim() || 'Usuario';
  const matches = (candidate: string) =>
    existingProfiles.some(
      (p) => p.name.trim().toLowerCase() === candidate.toLowerCase()
    );

  const first = `${base} (copia)`;
  if (!matches(first)) return first;

  let index = 2;
  while (matches(`${base} (copia ${index})`)) {
    index += 1;
  }
  return `${base} (copia ${index})`;
}

export interface DanceVaultUserBackup {
  app: 'DanceVault';
  version: '1.0.0';
  exportedAt: string;
  profileName: string;
  workspace: UserWorkspaceData;
}

export function buildUserBackupPayload(
  profileName: string,
  workspace: UserWorkspaceData
): DanceVaultUserBackup {
  return {
    app: 'DanceVault',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    profileName,
    workspace: cloneUserWorkspace(workspace),
  };
}

export function parseUserBackupPayload(
  rawJson: string
): {
  profileName?: string;
  exportedAt?: string;
  workspace: UserWorkspaceData;
} | null {
  try {
    const cleanJson = rawJson.replace(/^\uFEFF/, '').trim();
    if (!cleanJson) return null;

    const parsed = JSON.parse(cleanJson) as Partial<
      DanceVaultUserBackup & UserWorkspaceData
    >;
    if (!parsed || typeof parsed !== 'object') return null;

    const rawWorkspace =
      parsed.workspace && typeof parsed.workspace === 'object'
        ? parsed.workspace
        : parsed;

    const isDanceVaultEnvelope = parsed.app === 'DanceVault';
    const hasLibrariesArray = Array.isArray(rawWorkspace.libraries);
    const hasEntriesArray = Array.isArray(rawWorkspace.entries);

    if (!hasLibrariesArray || (!hasEntriesArray && !isDanceVaultEnvelope)) {
      return null;
    }

    return {
      profileName:
        typeof parsed.profileName === 'string' && parsed.profileName.trim()
          ? parsed.profileName.trim()
          : undefined,
      exportedAt:
        typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      workspace: sanitizeUserWorkspace(rawWorkspace, createEmptyUserWorkspace()),
    };
  } catch {
    return null;
  }
}

export function getWorkspaceBackupStats(workspace: UserWorkspaceData): {
  librariesCount: number;
  foldersCount: number;
  videosCount: number;
  loopsCount: number;
  trashedCount: number;
} {
  let foldersCount = 0;
  let videosCount = 0;
  let loopsCount = 0;

  workspace.entries.forEach((entry) => {
    if (entry.type === 'folder') {
      foldersCount += 1;
    } else if (entry.type === 'video') {
      videosCount += 1;
      const saved = Array.isArray(entry.savedLoops) ? entry.savedLoops.length : 0;
      loopsCount += saved > 0 ? saved : entry.loopMarker ? 1 : 0;
    }
  });

  return {
    librariesCount: workspace.libraries.length,
    foldersCount,
    videosCount,
    loopsCount,
    trashedCount:
      workspace.trashedEntries.length + workspace.trashedLibraries.length,
  };
}
