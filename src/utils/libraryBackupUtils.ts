import { resolvePersistedCoverUrl } from '../assets/sampleCovers';
import {
  ExplorerEntry,
  LibraryItem,
  SortMode,
  VideoEntry,
  ViewMode,
} from '../types/dancevault';
import { sanitizeEntries } from './userWorkspaceUtils';

export interface DanceVaultLibraryBackup {
  app: 'DanceVault';
  backupType: 'library';
  version: '1.0.0';
  exportedAt: string;
  sourceProfileName?: string;
  library: LibraryItem;
  entries: ExplorerEntry[];
  folderViewPrefs?: Record<string, ViewMode>;
  folderSortPrefs?: Record<string, SortMode>;
  manualOrderByFolder?: Record<string, string[]>;
}

export interface ParsedLibraryBackup {
  sourceProfileName?: string;
  exportedAt?: string;
  library: LibraryItem;
  entries: ExplorerEntry[];
  folderViewPrefs: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortMode>;
  manualOrderByFolder: Record<string, string[]>;
}

export type ParseLibraryBackupOutcome =
  | { ok: true; data: ParsedLibraryBackup }
  | { ok: false; reason: 'is-user-backup' | 'invalid' };

export function slugifyLibraryFileName(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'biblioteca'
  );
}

export function buildLibraryBackupPayload(
  library: LibraryItem,
  allEntries: ExplorerEntry[],
  prefs: {
    folderViewPrefs: Record<string, ViewMode>;
    folderSortPrefs: Record<string, SortMode>;
    manualOrderByFolder: Record<string, string[]>;
  },
  sourceProfileName?: string
): DanceVaultLibraryBackup {
  const libEntries = sanitizeEntries(
    allEntries.filter((e) => e.libraryId === library.id)
  );
  const libFolderIds = new Set(
    libEntries.filter((e) => e.type === 'folder').map((e) => e.id)
  );
  const isOwnedPrefKey = (key: string) =>
    key === `root:${library.id}` ||
    key === `flat:${library.id}` ||
    libFolderIds.has(key);

  const folderViewPrefs: Record<string, ViewMode> = {};
  Object.entries(prefs.folderViewPrefs).forEach(([k, v]) => {
    if (isOwnedPrefKey(k)) folderViewPrefs[k] = v;
  });

  const folderSortPrefs: Record<string, SortMode> = {};
  Object.entries(prefs.folderSortPrefs).forEach(([k, v]) => {
    if (isOwnedPrefKey(k)) folderSortPrefs[k] = v;
  });

  const manualOrderByFolder: Record<string, string[]> = {};
  Object.entries(prefs.manualOrderByFolder).forEach(([k, arr]) => {
    if (isOwnedPrefKey(k) && Array.isArray(arr)) {
      manualOrderByFolder[k] = [...arr];
    }
  });

  return {
    app: 'DanceVault',
    backupType: 'library',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    ...(sourceProfileName ? { sourceProfileName } : {}),
    library: {
      ...library,
      coverUrl: resolvePersistedCoverUrl(library.coverUrl),
    },
    entries: libEntries,
    folderViewPrefs,
    folderSortPrefs,
    manualOrderByFolder,
  };
}

export function parseLibraryBackupPayload(
  rawJson: string
): ParseLibraryBackupOutcome {
  try {
    const cleanJson = rawJson.replace(/^\uFEFF/, '').trim();
    if (!cleanJson) return { ok: false, reason: 'invalid' };

    const parsed = JSON.parse(cleanJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: 'invalid' };
    }

    // Detect if the user selected a full user-profile backup instead of a library backup
    if (
      parsed.workspace &&
      typeof parsed.workspace === 'object' &&
      !parsed.library
    ) {
      return { ok: false, reason: 'is-user-backup' };
    }

    const rawLib = parsed.library as Partial<LibraryItem> | undefined;
    if (
      !rawLib ||
      typeof rawLib !== 'object' ||
      typeof rawLib.name !== 'string' ||
      !rawLib.name.trim()
    ) {
      return { ok: false, reason: 'invalid' };
    }

    const rawEntries = Array.isArray(parsed.entries)
      ? (parsed.entries as ExplorerEntry[])
      : parsed.app === 'DanceVault' && parsed.backupType === 'library'
        ? []
        : null;
    if (!rawEntries) return { ok: false, reason: 'invalid' };

    const cleanLib: LibraryItem = {
      id: typeof rawLib.id === 'string' && rawLib.id ? rawLib.id : 'lib-import',
      name: rawLib.name.trim(),
      disciplineLabel:
        typeof rawLib.disciplineLabel === 'string' &&
        rawLib.disciplineLabel.trim()
          ? rawLib.disciplineLabel.trim()
          : 'Colección importada',
      videosCount:
        typeof rawLib.videosCount === 'number' ? rawLib.videosCount : 0,
      foldersCount:
        typeof rawLib.foldersCount === 'number' ? rawLib.foldersCount : 0,
      sizeBytes: typeof rawLib.sizeBytes === 'number' ? rawLib.sizeBytes : 0,
      sizeLabel:
        typeof rawLib.sizeLabel === 'string' && rawLib.sizeLabel
          ? rawLib.sizeLabel
          : '0 B',
      lastPracticed:
        typeof rawLib.lastPracticed === 'string' && rawLib.lastPracticed
          ? rawLib.lastPracticed
          : 'Importado hoy',
      coverUrl: resolvePersistedCoverUrl(
        typeof rawLib.coverUrl === 'string' ? rawLib.coverUrl : ''
      ),
      accentColor:
        rawLib.accentColor === 'primary' ||
        rawLib.accentColor === 'secondary' ||
        rawLib.accentColor === 'tertiary' ||
        rawLib.accentColor === 'neutral'
          ? rawLib.accentColor
          : 'primary',
      ...(typeof rawLib.accentHex === 'string' && rawLib.accentHex
        ? { accentHex: rawLib.accentHex }
        : {}),
    };

    const folderViewPrefs: Record<string, ViewMode> = {};
    if (parsed.folderViewPrefs && typeof parsed.folderViewPrefs === 'object') {
      Object.entries(
        parsed.folderViewPrefs as Record<string, unknown>
      ).forEach(([k, v]) => {
        if (v === 'list' || v === 'square') folderViewPrefs[k] = v;
      });
    }

    const folderSortPrefs: Record<string, SortMode> = {};
    if (parsed.folderSortPrefs && typeof parsed.folderSortPrefs === 'object') {
      Object.entries(
        parsed.folderSortPrefs as Record<string, unknown>
      ).forEach(([k, v]) => {
        if (
          v === 'natural' ||
          v === 'folders-first' ||
          v === 'recent-desc' ||
          v === 'recent-asc' ||
          v === 'manual'
        ) {
          folderSortPrefs[k] = v;
        }
      });
    }

    const manualOrderByFolder: Record<string, string[]> = {};
    if (
      parsed.manualOrderByFolder &&
      typeof parsed.manualOrderByFolder === 'object'
    ) {
      Object.entries(
        parsed.manualOrderByFolder as Record<string, unknown>
      ).forEach(([k, arr]) => {
        if (Array.isArray(arr)) {
          manualOrderByFolder[k] = arr.filter(
            (id): id is string => typeof id === 'string'
          );
        }
      });
    }

    return {
      ok: true,
      data: {
        sourceProfileName:
          typeof parsed.sourceProfileName === 'string' &&
          parsed.sourceProfileName.trim()
            ? parsed.sourceProfileName.trim()
            : undefined,
        exportedAt:
          typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
        library: cleanLib,
        entries: sanitizeEntries(rawEntries),
        folderViewPrefs,
        folderSortPrefs,
        manualOrderByFolder,
      },
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export function getLibraryBackupStats(entries: ExplorerEntry[]): {
  foldersCount: number;
  videosCount: number;
  loopsCount: number;
} {
  let foldersCount = 0;
  let videosCount = 0;
  let loopsCount = 0;

  entries.forEach((entry) => {
    if (entry.type === 'folder') {
      foldersCount += 1;
    } else if (entry.type === 'video') {
      videosCount += 1;
      const saved = Array.isArray(entry.savedLoops)
        ? entry.savedLoops.length
        : 0;
      loopsCount += saved > 0 ? saved : entry.loopMarker ? 1 : 0;
    }
  });

  return { foldersCount, videosCount, loopsCount };
}

export function resolveImportedLibraryName(
  sourceName: string,
  existingLibraries: LibraryItem[]
): string {
  const trimmed = sourceName.trim() || 'Biblioteca importada';
  const matches = (candidate: string) =>
    existingLibraries.some(
      (l) => l.name.trim().toLowerCase() === candidate.toLowerCase()
    );

  if (!matches(trimmed)) return trimmed;

  const base =
    trimmed.replace(/\s*\(copia(?:\s+\d+)?\)$/i, '').trim() || trimmed;
  const firstCopy = `${base} (copia)`;
  if (!matches(firstCopy)) return firstCopy;

  let index = 2;
  while (matches(`${base} (copia ${index})`)) {
    index += 1;
  }
  return `${base} (copia ${index})`;
}

export function materializeImportedLibrary(
  backup: ParsedLibraryBackup,
  existingLibraries: LibraryItem[],
  existingEntries: ExplorerEntry[],
  preferredName?: string
): {
  library: LibraryItem;
  entries: ExplorerEntry[];
  folderViewPrefs: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortMode>;
  manualOrderByFolder: Record<string, string[]>;
} {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const oldLibId = backup.library.id;
  const newLibId = `lib-${stamp}-${rand}`;
  const resolvedName = resolveImportedLibraryName(
    preferredName ?? backup.library.name,
    existingLibraries
  );

  const idMap = new Map<string, string>();
  backup.entries.forEach((entry, idx) => {
    const prefix = entry.type === 'folder' ? 'fld' : 'vid';
    idMap.set(entry.id, `${prefix}-${stamp}-${idx}-${rand}`);
  });

  const workingVideoNames = existingEntries
    .filter((e): e is VideoEntry => e.type === 'video')
    .map((e) => e.name.trim().toLowerCase());

  const materializedEntries: ExplorerEntry[] = backup.entries.map((entry) => {
    const newId = idMap.get(entry.id)!;
    const newParentId = entry.parentId ? (idMap.get(entry.parentId) ?? null) : null;

    if (entry.type === 'video') {
      let candidate = entry.name.trim() || 'Vídeo';
      while (workingVideoNames.includes(candidate.toLowerCase())) {
        candidate = `BIS ${candidate}`;
      }
      workingVideoNames.push(candidate.toLowerCase());
      return {
        ...entry,
        id: newId,
        libraryId: newLibId,
        parentId: newParentId,
        name: candidate,
        tags: [...entry.tags],
        savedLoops: entry.savedLoops
          ? entry.savedLoops.map((loop) => ({ ...loop }))
          : undefined,
      };
    }

    return {
      ...entry,
      id: newId,
      libraryId: newLibId,
      parentId: newParentId,
    };
  });

  const remapKey = (key: string): string | null => {
    if (key === `root:${oldLibId}`) return `root:${newLibId}`;
    if (key === `flat:${oldLibId}`) return `flat:${newLibId}`;
    return idMap.get(key) ?? null;
  };

  const remappedViewPrefs: Record<string, ViewMode> = {};
  Object.entries(backup.folderViewPrefs).forEach(([k, v]) => {
    const nextK = remapKey(k);
    if (nextK) remappedViewPrefs[nextK] = v;
  });

  const remappedSortPrefs: Record<string, SortMode> = {};
  Object.entries(backup.folderSortPrefs).forEach(([k, v]) => {
    const nextK = remapKey(k);
    if (nextK) remappedSortPrefs[nextK] = v;
  });

  const remappedManualOrder: Record<string, string[]> = {};
  Object.entries(backup.manualOrderByFolder).forEach(([k, arr]) => {
    const nextK = remapKey(k);
    if (nextK) {
      remappedManualOrder[nextK] = arr
        .map((oldEntryId) => idMap.get(oldEntryId))
        .filter((mapped): mapped is string => Boolean(mapped));
    }
  });

  return {
    library: {
      ...backup.library,
      id: newLibId,
      name: resolvedName,
    },
    entries: materializedEntries,
    folderViewPrefs: remappedViewPrefs,
    folderSortPrefs: remappedSortPrefs,
    manualOrderByFolder: remappedManualOrder,
  };
}
