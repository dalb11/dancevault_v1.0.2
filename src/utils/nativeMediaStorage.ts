import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ExplorerEntry, VideoEntry } from '../types/dancevault';

export type NativePickerMode = 'gallery' | 'files';

interface PickNativeVideoResult {
  cancelled: boolean;
  uri?: string;
  playableUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  durationSec?: number;
  width?: number;
  height?: number;
}

interface DanceVaultMediaBridge {
  getMediaServerInfo(): Promise<{
    port: number;
    token: string;
    baseUrl: string;
  }>;
  pickVideo(options?: { mode?: NativePickerMode }): Promise<PickNativeVideoResult>;
  checkUriAccessible(options: {
    uri: string;
  }): Promise<{ accessible: boolean; playableUrl?: string }>;
  releaseUriPermission(options: { uri: string }): Promise<void>;
  shareVideo(options: {
    uri: string;
    title?: string;
    mimeType?: string;
  }): Promise<{ shared: boolean }>;
  fetchInstagramMetadata(options: { url: string }): Promise<{
    ok: boolean;
    title?: string;
    coverUrl?: string;
    canonicalUrl?: string;
  }>;
  openInstagramViewer(options: {
    url: string;
    title?: string;
    mirrored?: boolean;
  }): Promise<{ closed: boolean; mirrored?: boolean }>;
}

const DanceVaultMedia =
  registerPlugin<DanceVaultMediaBridge>('DanceVaultMedia');

const BACKUPS_DIR = 'dancevault/backups';
const MEDIA_ROUTE_PREFIX = '/_dv_media';

/**
 * Runtime cache mapping persisted Android `content://` URIs to:
 * - string: live session streaming URL (`http://127.0.0.1:<port>/media?...` or fallback `/_dv_media`)
 * - null: original file is no longer reachable outside DanceVault
 */
const resolvedPlayableUrlCache = new Map<string, string | null>();
const pendingResolutionPromises = new Map<
  string,
  Promise<string | undefined>
>();

export interface PickedNativeVideo {
  contentUri: string;
  playableUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
}

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isLoopbackMediaUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('http://127.0.0.1:') && url.includes('/media?');
}

export function shouldUseAnonymousCors(url?: string): boolean {
  if (!url) return false;
  return isLoopbackMediaUrl(url) || url.includes(`${MEDIA_ROUTE_PREFIX}?`);
}

export function isVolatileVideoUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('blob:') ||
    url.startsWith('file:') ||
    url.includes('/_capacitor_file_/') ||
    url.includes('/_capacitor_content_/') ||
    url.includes(`${MEDIA_ROUTE_PREFIX}?`) ||
    isLoopbackMediaUrl(url)
  );
}

export function buildNativeMediaPlayableUrl(contentUri: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://localhost';
  return `${origin}${MEDIA_ROUTE_PREFIX}?uri=${encodeURIComponent(contentUri)}`;
}

export function getCachedNativeVideoUrl(
  nativeFilePath?: string
): string | undefined {
  if (!nativeFilePath) return undefined;
  const cached = resolvedPlayableUrlCache.get(nativeFilePath);
  return typeof cached === 'string' ? cached : undefined;
}

/**
 * Opens Android's visual Video Gallery (`PickVisualMedia`, `mode: 'gallery'`)
 * or system file explorer (`ACTION_OPEN_DOCUMENT`, `mode: 'files'`) and
 * acquires read access to the original file with ZERO copying or duplication.
 */
export async function pickPersistentNativeVideo(
  mode: NativePickerMode = 'gallery'
): Promise<PickedNativeVideo | null> {
  if (!isNativePlatform()) return null;

  const result = await DanceVaultMedia.pickVideo({ mode });
  if (!result || result.cancelled || !result.uri) {
    return null;
  }

  const contentUri = result.uri.trim();
  const playableUrl =
    result.playableUrl?.trim() || buildNativeMediaPlayableUrl(contentUri);
  resolvedPlayableUrlCache.set(contentUri, playableUrl);

  return {
    contentUri,
    playableUrl,
    fileName: result.fileName?.trim() || 'video.mp4',
    sizeBytes:
      typeof result.sizeBytes === 'number' && Number.isFinite(result.sizeBytes)
        ? Math.max(0, result.sizeBytes)
        : 0,
    mimeType: result.mimeType?.trim() || 'video/mp4',
    durationSec:
      typeof result.durationSec === 'number' &&
      Number.isFinite(result.durationSec)
        ? Math.max(0, result.durationSec)
        : 0,
    width:
      typeof result.width === 'number' && Number.isFinite(result.width)
        ? Math.max(0, result.width)
        : 0,
    height:
      typeof result.height === 'number' && Number.isFinite(result.height)
        ? Math.max(0, result.height)
        : 0,
  };
}

export async function resolveNativePlayableUrl(
  video: Pick<VideoEntry, 'videoUrl' | 'nativeFilePath'>
): Promise<string | undefined> {
  if (!isNativePlatform()) {
    return video.videoUrl;
  }

  if (video.videoUrl && !isVolatileVideoUrl(video.videoUrl)) {
    return video.videoUrl;
  }

  const contentUri = video.nativeFilePath?.trim();
  if (!contentUri) {
    return video.videoUrl;
  }

  if (resolvedPlayableUrlCache.has(contentUri)) {
    const cached = resolvedPlayableUrlCache.get(contentUri);
    return cached ?? undefined;
  }

  const existingPromise = pendingResolutionPromises.get(contentUri);
  if (existingPromise) {
    return existingPromise;
  }

  const resolvePromise = (async (): Promise<string | undefined> => {
    try {
      const check = await DanceVaultMedia.checkUriAccessible({
        uri: contentUri,
      });
      if (!check.accessible) {
        resolvedPlayableUrlCache.set(contentUri, null);
        return undefined;
      }
      const playable =
        check.playableUrl?.trim() || buildNativeMediaPlayableUrl(contentUri);
      resolvedPlayableUrlCache.set(contentUri, playable);
      return playable;
    } catch {
      resolvedPlayableUrlCache.set(contentUri, null);
      return undefined;
    } finally {
      pendingResolutionPromises.delete(contentUri);
    }
  })();

  pendingResolutionPromises.set(contentUri, resolvePromise);
  return resolvePromise;
}

export function useResolvedVideoUrl(
  video: Pick<VideoEntry, 'videoUrl' | 'nativeFilePath'>
): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => {
    if (video.videoUrl) return video.videoUrl;
    if (isNativePlatform() && video.nativeFilePath) {
      return getCachedNativeVideoUrl(video.nativeFilePath);
    }
    return undefined;
  });

  useEffect(() => {
    if (video.videoUrl && !isNativePlatform()) {
      setResolvedUrl(video.videoUrl);
      return;
    }
    if (video.videoUrl && !isVolatileVideoUrl(video.videoUrl)) {
      setResolvedUrl(video.videoUrl);
      return;
    }
    if (
      video.videoUrl &&
      isNativePlatform() &&
      isLoopbackMediaUrl(video.videoUrl)
    ) {
      setResolvedUrl(video.videoUrl);
      return;
    }
    if (!isNativePlatform() || !video.nativeFilePath) {
      setResolvedUrl(video.videoUrl);
      return;
    }

    const cached = resolvedPlayableUrlCache.get(video.nativeFilePath);
    if (cached !== undefined) {
      setResolvedUrl(cached ?? undefined);
      return;
    }

    let cancelled = false;
    void resolveNativePlayableUrl(video).then((url) => {
      if (!cancelled) {
        setResolvedUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [video.videoUrl, video.nativeFilePath]);

  return resolvedUrl;
}

export async function shareNativeContentVideo(
  contentUri: string,
  title: string,
  mimeType?: string
): Promise<'shared' | 'unavailable'> {
  if (!isNativePlatform() || !contentUri?.trim()) return 'unavailable';
  try {
    await DanceVaultMedia.shareVideo({
      uri: contentUri.trim(),
      title,
      mimeType,
    });
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

export interface InstagramNativeMetadata {
  ok: boolean;
  title?: string;
  coverUrl?: string;
  canonicalUrl?: string;
}

export async function fetchInstagramMetadataNative(
  url: string
): Promise<InstagramNativeMetadata | null> {
  if (!isNativePlatform() || !url?.trim()) return null;
  try {
    const res = await DanceVaultMedia.fetchInstagramMetadata({
      url: url.trim(),
    });
    return res?.ok ? res : null;
  } catch {
    return null;
  }
}

export async function openInstagramViewerNative(options: {
  url: string;
  title?: string;
  mirrored?: boolean;
}): Promise<{ opened: boolean; mirrored: boolean }> {
  if (!isNativePlatform() || !options.url?.trim()) {
    return { opened: false, mirrored: Boolean(options.mirrored) };
  }
  try {
    const res = await DanceVaultMedia.openInstagramViewer({
      url: options.url.trim(),
      title: options.title,
      mirrored: Boolean(options.mirrored),
    });
    return {
      opened: true,
      mirrored:
        typeof res?.mirrored === 'boolean'
          ? res.mirrored
          : Boolean(options.mirrored),
    };
  } catch {
    return { opened: false, mirrored: Boolean(options.mirrored) };
  }
}

/**
 * Releases DanceVault's persistable URI read-permission token when no instance
 * across any profile still references that URI.
 *
 * IMPORTANT: This ONLY forgets DanceVault's read token; it NEVER deletes or
 * alters the user's original video file on device storage.
 */
export async function releaseUnreferencedNativeVideoPermissions(
  candidateUris: string[],
  remainingEntries: ExplorerEntry[]
): Promise<void> {
  if (!isNativePlatform() || candidateUris.length === 0) return;

  const uniqueCandidates = Array.from(
    new Set(
      candidateUris
        .map((p) => p?.trim())
        .filter((p): p is string => Boolean(p))
    )
  );
  if (uniqueCandidates.length === 0) return;

  const stillReferenced = new Set<string>();
  for (const entry of remainingEntries) {
    if (entry.type === 'video' && entry.nativeFilePath) {
      stillReferenced.add(entry.nativeFilePath.trim());
    }
  }

  for (const uri of uniqueCandidates) {
    if (stillReferenced.has(uri)) continue;
    resolvedPlayableUrlCache.delete(uri);
    try {
      await DanceVaultMedia.releaseUriPermission({ uri });
    } catch {
      // Safe no-op if already released
    }
  }
}

export function isShareCancelledError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(err ?? '');
  return /cancel|abort/i.test(msg);
}

export async function exportJsonBackupFile(
  filename: string,
  jsonText: string
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (isNativePlatform()) {
    const cachePath = `${BACKUPS_DIR}/${filename}`;
    await Filesystem.writeFile({
      directory: Directory.Cache,
      path: cachePath,
      data: jsonText,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      directory: Directory.Cache,
      path: cachePath,
    });
    try {
      await Share.share({
        title: filename,
        url: uri,
        dialogTitle: 'Guardar o compartir copia de seguridad',
      });
      return 'shared';
    } catch (err) {
      if (isShareCancelledError(err)) {
        return 'cancelled';
      }
      throw err;
    }
  }

  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'downloaded';
}
