import { fetchInstagramMetadataNative } from './nativeMediaStorage';

export interface ParsedVideoLink {
  sourceType: 'youtube' | 'instagram' | 'direct-url';
  canonicalUrl: string;
  externalId?: string;
  coverUrl: string;
  suggestedTitle: string;
  isShortOrReel: boolean;
  resolutionLabel: string;
  containerLabel: string;
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function normalizeRawUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (
    /^(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com|instagr\.am)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function extractYouTubeVideoId(url: URL): {
  id: string;
  isShort: boolean;
} | null {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = segments[0] ?? '';
    return YOUTUBE_ID_RE.test(id) ? { id, isShort: false } : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = url.searchParams.get('v');
    if (vParam && YOUTUBE_ID_RE.test(vParam)) {
      return { id: vParam, isShort: false };
    }
    if (
      segments.length >= 2 &&
      ['shorts', 'embed', 'live', 'v'].includes(segments[0].toLowerCase())
    ) {
      const id = segments[1];
      if (YOUTUBE_ID_RE.test(id)) {
        return {
          id,
          isShort: segments[0].toLowerCase() === 'shorts',
        };
      }
    }
  }

  return null;
}

export function extractInstagramShortcode(url: URL): string | null {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (host !== 'instagram.com' && host !== 'instagr.am' && host !== 'm.instagram.com') {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i].toLowerCase();
    if (seg === 'reel' || seg === 'reels' || seg === 'p' || seg === 'tv') {
      const code = segments[i + 1];
      if (code && /^[a-zA-Z0-9_-]{5,40}$/.test(code)) {
        return code;
      }
    }
  }
  return null;
}

export function getInstagramCanonicalReelUrl(shortcode: string): string {
  return `https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/`;
}

export function getInstagramEmbedUrl(shortcode: string): string {
  return `https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/embed/`;
}

export function parseExternalVideoUrl(rawUrl: string): ParsedVideoLink | null {
  const normalized = normalizeRawUrl(rawUrl);
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const yt = extractYouTubeVideoId(parsed);
  if (yt) {
    const canonicalUrl = yt.isShort
      ? `https://www.youtube.com/shorts/${yt.id}`
      : `https://www.youtube.com/watch?v=${yt.id}`;
    return {
      sourceType: 'youtube',
      canonicalUrl,
      externalId: yt.id,
      coverUrl: `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`,
      suggestedTitle: yt.isShort
        ? `YouTube Short · ${yt.id}`
        : `Vídeo YouTube · ${yt.id}`,
      isShortOrReel: yt.isShort,
      resolutionLabel: 'YouTube',
      containerLabel: 'YT',
    };
  }

  const igCode = extractInstagramShortcode(parsed);
  if (igCode) {
    const canonicalUrl = `https://www.instagram.com/reel/${igCode}/`;
    return {
      sourceType: 'instagram',
      canonicalUrl,
      externalId: igCode,
      coverUrl: '',
      suggestedTitle: `Reel IG · ${igCode}`,
      isShortOrReel: true,
      resolutionLabel: 'IG Reel',
      containerLabel: 'IG',
    };
  }

  // Direct stream URL (.mp4, .webm, .mov, .m4v, .ogv)
  const pathLower = parsed.pathname.toLowerCase();
  const extMatch = pathLower.match(/\.([a-z0-9]+)$/);
  const validDirectExts = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg']);
  if (extMatch && validDirectExts.has(extMatch[1])) {
    const rawFilename =
      decodeURIComponent(parsed.pathname.split('/').pop() || '') || 'video.mp4';
    const baseName = rawFilename
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return {
      sourceType: 'direct-url',
      canonicalUrl: parsed.toString(),
      coverUrl: '',
      suggestedTitle: baseName.slice(0, 60) || 'Vídeo desde URL',
      isShortOrReel: false,
      resolutionLabel: 'Enlace',
      containerLabel: extMatch[1].toUpperCase(),
    };
  }

  return null;
}

export interface YouTubeOEmbedInfo {
  title?: string;
  width?: number;
  height?: number;
}

export async function fetchYouTubeOEmbedInfo(
  youtubeUrl: string
): Promise<YouTubeOEmbedInfo | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return null;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      youtubeUrl
    )}&format=json`;
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      width?: number;
      height?: number;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const width =
      typeof data?.width === 'number' && data.width > 0
        ? data.width
        : typeof data?.thumbnail_width === 'number' && data.thumbnail_width > 0
          ? data.thumbnail_width
          : undefined;
    const height =
      typeof data?.height === 'number' && data.height > 0
        ? data.height
        : typeof data?.thumbnail_height === 'number' &&
            data.thumbnail_height > 0
          ? data.thumbnail_height
          : undefined;
    return {
      title: title ? title.slice(0, 60) : undefined,
      width,
      height,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchYouTubeTitle(
  youtubeUrl: string
): Promise<string | null> {
  const info = await fetchYouTubeOEmbedInfo(youtubeUrl);
  return info?.title ?? null;
}

export interface InstagramInfo {
  title?: string;
  coverUrl?: string;
}

export async function fetchInstagramInfo(
  instagramUrl: string
): Promise<InstagramInfo | null> {
  const nativeMeta = await fetchInstagramMetadataNative(instagramUrl);
  if (!nativeMeta || !nativeMeta.ok) return null;
  const title = nativeMeta.title?.trim();
  const coverUrl = nativeMeta.coverUrl?.trim();
  if (!title && !coverUrl) return null;
  return {
    title: title ? title.slice(0, 60) : undefined,
    coverUrl: coverUrl || undefined,
  };
}
