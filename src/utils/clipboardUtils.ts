import {
  ExplorerEntry,
  SortMode,
  ViewMode,
} from '../types/dancevault';

export interface ClipboardPrefsSnapshot {
  folderViewPrefs: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortMode>;
  manualOrderByFolder: Record<string, string[]>;
}

export type PasteClipboardOutcome =
  | { ok: false; reason: 'empty' | 'cycle' }
  | {
      ok: true;
      nextEntries: ExplorerEntry[];
      rootCount: number;
      totalAffectedCount: number;
      addedViewPrefs: Record<string, ViewMode>;
      addedSortPrefs: Record<string, SortMode>;
      addedManualOrder: Record<string, string[]>;
    };

function nextBisUniqueName(rawName: string, usedLower: Set<string>): string {
  let candidate = rawName.trim() || 'Elemento';
  while (usedLower.has(candidate.toLowerCase())) {
    candidate = `BIS ${candidate}`;
  }
  usedLower.add(candidate.toLowerCase());
  return candidate;
}

function getTopLevelRoots(
  clipboardIds: string[],
  entries: ExplorerEntry[]
): string[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const selectedSet = new Set(clipboardIds.filter((id) => byId.has(id)));
  const seen = new Set<string>();
  const roots: string[] = [];

  for (const id of clipboardIds) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);

    // Skip entries whose ancestor is already included in clipboardIds
    let cursor = byId.get(id)?.parentId ?? null;
    const guard = new Set<string>([id]);
    let hasSelectedAncestor = false;
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      if (selectedSet.has(cursor)) {
        hasSelectedAncestor = true;
        break;
      }
      cursor = byId.get(cursor)?.parentId ?? null;
    }

    if (!hasSelectedAncestor) {
      roots.push(id);
    }
  }

  return roots;
}

function collectSubtreeBfs(
  rootIds: string[],
  entries: ExplorerEntry[]
): ExplorerEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const childrenByParent = new Map<string, ExplorerEntry[]>();

  for (const entry of entries) {
    if (entry.parentId) {
      const list = childrenByParent.get(entry.parentId);
      if (list) {
        list.push(entry);
      } else {
        childrenByParent.set(entry.parentId, [entry]);
      }
    }
  }

  const visited = new Set<string>();
  const queue: ExplorerEntry[] = [];
  const ordered: ExplorerEntry[] = [];

  for (const rootId of rootIds) {
    const rootEntry = byId.get(rootId);
    if (rootEntry && !visited.has(rootEntry.id)) {
      visited.add(rootEntry.id);
      queue.push(rootEntry);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    if (current.type === 'folder') {
      const children = childrenByParent.get(current.id) ?? [];
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          queue.push(child);
        }
      }
    }
  }

  return ordered;
}

export function pasteClipboardEntries(
  entries: ExplorerEntry[],
  clipboardIds: string[],
  mode: 'copy' | 'cut',
  targetLibraryId: string,
  targetParentId: string | null,
  prefs: ClipboardPrefsSnapshot
): PasteClipboardOutcome {
  const topLevelIds = getTopLevelRoots(clipboardIds, entries);
  if (topLevelIds.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const topLevelSet = new Set(topLevelIds);
  const subtreeItems = collectSubtreeBfs(topLevelIds, entries);
  const subtreeIdSet = new Set(subtreeItems.map((e) => e.id));

  if (mode === 'cut') {
    // Prevent moving a folder inside itself or one of its descendants
    const byId = new Map(entries.map((e) => [e.id, e]));
    let cursor = targetParentId;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      if (subtreeIdSet.has(cursor)) {
        return { ok: false, reason: 'cycle' };
      }
      cursor = byId.get(cursor)?.parentId ?? null;
    }

    const workingFolderNames = new Set<string>(
      entries
        .filter(
          (e) =>
            e.type === 'folder' &&
            e.libraryId === targetLibraryId &&
            !subtreeIdSet.has(e.id)
        )
        .map((e) => e.name.trim().toLowerCase())
    );

    const movedFolderNames = new Map<string, string>();
    for (const item of subtreeItems) {
      if (item.type === 'folder') {
        movedFolderNames.set(
          item.id,
          nextBisUniqueName(item.name, workingFolderNames)
        );
      }
    }

    const nextEntries = entries.map((e) => {
      if (!subtreeIdSet.has(e.id)) return e;
      const nextParentId = topLevelSet.has(e.id) ? targetParentId : e.parentId;
      if (e.type === 'folder') {
        return {
          ...e,
          libraryId: targetLibraryId,
          parentId: nextParentId,
          name: movedFolderNames.get(e.id) ?? e.name,
        };
      }
      return {
        ...e,
        libraryId: targetLibraryId,
        parentId: nextParentId,
      };
    });

    return {
      ok: true,
      nextEntries,
      rootCount: topLevelIds.length,
      totalAffectedCount: subtreeItems.length,
      addedViewPrefs: {},
      addedSortPrefs: {},
      addedManualOrder: {},
    };
  }

  // Deep recursive copy preserving folder structure + BIS unique naming rule
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const idMap = new Map<string, string>();

  subtreeItems.forEach((item, idx) => {
    const prefix = item.type === 'folder' ? 'fld' : 'vid';
    idMap.set(item.id, `${prefix}-${stamp}-${idx}-${rand}`);
  });

  const workingVideoNames = new Set<string>(
    entries
      .filter((e) => e.type === 'video')
      .map((e) => e.name.trim().toLowerCase())
  );

  const workingFolderNames = new Set<string>(
    entries
      .filter((e) => e.type === 'folder' && e.libraryId === targetLibraryId)
      .map((e) => e.name.trim().toLowerCase())
  );

  const addedViewPrefs: Record<string, ViewMode> = {};
  const addedSortPrefs: Record<string, SortMode> = {};
  const addedManualOrder: Record<string, string[]> = {};

  const clones: ExplorerEntry[] = subtreeItems.map((item) => {
    const newId = idMap.get(item.id)!;
    const newParentId = topLevelSet.has(item.id)
      ? targetParentId
      : item.parentId
        ? (idMap.get(item.parentId) ?? targetParentId)
        : targetParentId;

    if (item.type === 'video') {
      const uniqueName = nextBisUniqueName(item.name, workingVideoNames);
      return {
        ...item,
        id: newId,
        libraryId: targetLibraryId,
        parentId: newParentId,
        name: uniqueName,
        createdAt: stamp,
        tags: [...item.tags],
        savedLoops: item.savedLoops
          ? item.savedLoops.map((loop) => ({ ...loop }))
          : undefined,
      };
    }

    const uniqueFolderName = nextBisUniqueName(item.name, workingFolderNames);
    if (prefs.folderViewPrefs[item.id]) {
      addedViewPrefs[newId] = prefs.folderViewPrefs[item.id];
    }
    if (prefs.folderSortPrefs[item.id]) {
      addedSortPrefs[newId] = prefs.folderSortPrefs[item.id];
    }
    if (prefs.manualOrderByFolder[item.id]) {
      addedManualOrder[newId] = prefs.manualOrderByFolder[item.id]
        .map((childId) => idMap.get(childId))
        .filter((mapped): mapped is string => Boolean(mapped));
    }

    return {
      ...item,
      id: newId,
      libraryId: targetLibraryId,
      parentId: newParentId,
      name: uniqueFolderName,
      createdAt: stamp,
    };
  });

  return {
    ok: true,
    nextEntries: [...entries, ...clones],
    rootCount: topLevelIds.length,
    totalAffectedCount: clones.length,
    addedViewPrefs,
    addedSortPrefs,
    addedManualOrder,
  };
}
