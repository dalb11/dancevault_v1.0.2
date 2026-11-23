import { Share } from '@capacitor/share';
import { VideoEntry } from '../types/dancevault';
import {
  isNativePlatform,
  isShareCancelledError,
  shareNativeContentVideo,
} from './nativeMediaStorage';

/**
 * In-memory registry mapping active session `blob:` URLs to their original `File` objects
 * when running in standard desktop/mobile web browsers.
 */
const sessionVideoFileRegistry = new Map<string, File>();

export function registerSessionVideoFile(blobUrl: string, file: File): void {
  if (!blobUrl || !blobUrl.startsWith('blob:')) return;
  sessionVideoFileRegistry.set(blobUrl, file);
}

export function unregisterSessionVideoFile(blobUrl?: string): void {
  if (!blobUrl) return;
  sessionVideoFileRegistry.delete(blobUrl);
}

function guessVideoMimeType(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.m4v')) return 'video/x-m4v';
  if (clean.endsWith('.ogv') || clean.endsWith('.ogg')) return 'video/ogg';
  return 'video/mp4';
}

export async function resolveSessionVideoFile(
  video: VideoEntry
): Promise<File | null> {
  const url = video.videoUrl?.trim();
  if (!url || !url.startsWith('blob:')) return null;

  const cached = sessionVideoFileRegistry.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;

    const fallbackName =
      video.originalFileName?.trim() ||
      `${video.name.replace(/[^\w\s-]/g, '').trim() || 'dancevault-video'}.mp4`;
    const mimeType = blob.type || guessVideoMimeType(fallbackName);
    const reconstructed = new File([blob], fallbackName, {
      type: mimeType,
      lastModified: Date.now(),
    });
    sessionVideoFileRegistry.set(url, reconstructed);
    return reconstructed;
  } catch {
    return null;
  }
}

export type ShareVideoResult =
  | { status: 'shared'; message: string }
  | { status: 'copied'; message: string }
  | { status: 'cancelled' }
  | { status: 'needs-reassign'; message: string }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

export async function shareVideoEntry(
  video: VideoEntry
): Promise<ShareVideoResult> {
  const sourceType = video.sourceType ?? 'local';
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const native = isNativePlatform();

  // 1. Local device video -> native zero-copy content:// share on Android, or File on Web
  if (sourceType === 'local') {
    if (native) {
      if (video.nativeFilePath) {
        const outcome = await shareNativeContentVideo(
          video.nativeFilePath,
          video.name,
          guessVideoMimeType(video.originalFileName || video.name)
        );
        if (outcome === 'shared') {
          return {
            status: 'shared',
            message: `Vídeo original "${video.originalFileName || video.name}" enviado al menú de compartir.`,
          };
        }
      }

      return {
        status: 'needs-reassign',
        message:
          'El archivo original ya no está accesible en esa ubicación o fue movido fuera de la app. Reasigna el archivo para volver a vincularlo sin duplicar.',
      };
    }

    const file = await resolveSessionVideoFile(video);
    if (!file) {
      return {
        status: 'needs-reassign',
        message:
          'El vínculo temporal al archivo caducó al recargar la versión web. Reasigna el archivo original para enviarlo ahora.',
      };
    }

    if (
      nav &&
      typeof nav.share === 'function' &&
      typeof nav.canShare === 'function'
    ) {
      let canShareFile = false;
      try {
        canShareFile = nav.canShare({ files: [file] });
      } catch {
        canShareFile = false;
      }

      if (canShareFile) {
        try {
          await nav.share({
            files: [file],
            title: video.name,
          });
          return {
            status: 'shared',
            message: `Archivo "${file.name}" enviado al menú de compartir.`,
          };
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return { status: 'cancelled' };
          }
          return {
            status: 'error',
            message:
              'No se pudo completar el envío del archivo desde el navegador.',
          };
        }
      }
    }

    return {
      status: 'unsupported',
      message:
        'Tu navegador actual no permite compartir archivos de vídeo reales con otras apps. En Android (APK) abrirá WhatsApp y el menú nativo directamente.',
    };
  }

  // 2. YouTube / Instagram links use "Abrir enlace original" directly
  if (sourceType === 'youtube' || sourceType === 'instagram') {
    return {
      status: 'unsupported',
      message:
        'En vídeos de YouTube o Instagram, abre el enlace original para compartirlo desde su propia app.',
    };
  }

  // 3. Direct URL -> native Share sheet or web Share / clipboard
  const shareUrl = (video.externalUrl || video.videoUrl || '').trim();
  if (!shareUrl) {
    return {
      status: 'error',
      message: 'Esta instancia no tiene un enlace válido guardado para compartir.',
    };
  }

  if (native) {
    try {
      await Share.share({
        title: video.name,
        text: video.name,
        url: shareUrl,
        dialogTitle: 'Compartir enlace de vídeo',
      });
      return {
        status: 'shared',
        message: 'Enlace enviado al menú de compartir.',
      };
    } catch (err) {
      if (isShareCancelledError(err)) {
        return { status: 'cancelled' };
      }
      // Fall through if native Share fails
    }
  }

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({
        title: video.name,
        text: video.name,
        url: shareUrl,
      });
      return {
        status: 'shared',
        message: 'Enlace enviado al menú de compartir.',
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // Fall through to clipboard copy if share sheet fails in this browser
    }
  }

  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(`${video.name}\n${shareUrl}`);
      return {
        status: 'copied',
        message:
          'Enlace copiado al portapapeles para pegarlo en WhatsApp o cualquier app.',
      };
    } catch {
      // Ignore clipboard failure
    }
  }

  return {
    status: 'unsupported',
    message:
      'Este navegador no permite abrir la hoja de compartir ni copiar automáticamente.',
  };
}
