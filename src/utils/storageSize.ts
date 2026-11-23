import { ExplorerEntry, VideoEntry } from '../types/dancevault';

export const BYTES_PER_MB = 1024 * 1024;

export function parseSizeMb(sizeLabel?: string): number {
  if (!sizeLabel) return 0;
  const match = sizeLabel.trim().match(/^([\d.,]+)\s*(gb|mb|kb|b)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(',', '.'));
  if (Number.isNaN(num)) return 0;
  const unit = (match[2] ?? 'mb').toLowerCase();
  if (unit === 'gb') return num * 1024;
  if (unit === 'kb') return num / 1024;
  if (unit === 'b') return num / BYTES_PER_MB;
  return num;
}

export function getVideoSizeMb(
  video: Pick<VideoEntry, 'sizeBytes' | 'sizeLabel'>
): number {
  if (
    typeof video.sizeBytes === 'number' &&
    Number.isFinite(video.sizeBytes) &&
    video.sizeBytes >= 0
  ) {
    return video.sizeBytes / BYTES_PER_MB;
  }
  return parseSizeMb(video.sizeLabel);
}

export function formatStorageMb(totalMb: number): string {
  if (!Number.isFinite(totalMb) || totalMb <= 0) return '0 B';
  if (totalMb < 1 / 1024) {
    return `${Math.max(1, Math.round(totalMb * BYTES_PER_MB))} B`;
  }
  if (totalMb < 1) {
    return `${Math.max(1, Math.round(totalMb * 1024))} KB`;
  }
  if (totalMb < 10) {
    return `${Number(totalMb.toFixed(1))} MB`;
  }
  if (totalMb < 1024) {
    return `${Math.round(totalMb)} MB`;
  }
  return `${(totalMb / 1024).toFixed(2)} GB`;
}

export function formatStorageParts(totalMb: number): {
  value: string;
  unit: string;
  full: string;
} {
  const full = formatStorageMb(totalMb);
  const idx = full.indexOf(' ');
  if (idx === -1) return { value: full, unit: '', full };
  return {
    value: full.slice(0, idx),
    unit: full.slice(idx + 1),
    full,
  };
}

export function formatFileBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  return formatStorageMb(bytes / BYTES_PER_MB);
}

export function computeRecursiveFolderSizeMap(
  entries: ExplorerEntry[]
): Map<string, number> {
  const childrenByParent = new Map<string, ExplorerEntry[]>();
  const folderIds: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'folder') {
      folderIds.push(entry.id);
    }
    if (entry.parentId) {
      const list = childrenByParent.get(entry.parentId);
      if (list) list.push(entry);
      else childrenByParent.set(entry.parentId, [entry]);
    }
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const sumFolderMb = (folderId: string): number => {
    const cached = memo.get(folderId);
    if (cached !== undefined) return cached;
    if (visiting.has(folderId)) return 0;
    visiting.add(folderId);

    let total = 0;
    const children = childrenByParent.get(folderId) ?? [];
    for (const child of children) {
      if (child.type === 'video') {
        total += getVideoSizeMb(child);
      } else {
        total += sumFolderMb(child.id);
      }
    }

    visiting.delete(folderId);
    memo.set(folderId, total);
    return total;
  };

  for (const fid of folderIds) {
    sumFolderMb(fid);
  }

  return memo;
}
