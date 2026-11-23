import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Film,
  FolderOpen,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Instagram,
  Link2,
  Pencil,
  PlusCircle,
  RefreshCw,
  SlidersHorizontal,
  Upload,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import { ExplorerEntry, VideoSourceType } from '../types/dancevault';
import { BYTES_PER_MB, formatFileBytes } from '../utils/storageSize';
import {
  fetchInstagramInfo,
  fetchYouTubeTitle,
  parseExternalVideoUrl,
} from '../utils/videoLinkUtils';
import {
  isNativePlatform,
  NativePickerMode,
  pickPersistentNativeVideo,
  shouldUseAnonymousCors,
} from '../utils/nativeMediaStorage';
import {
  registerSessionVideoFile,
  unregisterSessionVideoFile,
} from '../utils/videoShareUtils';

export interface ImportVideoPayload {
  name: string;
  originalFileName: string;
  coverUrl: string;
  duration: string;
  sizeBytes?: number;
  sizeLabel: string;
  sizeMb: number;
  resolution: string;
  videoUrl?: string;
  nativeFilePath?: string;
  sourceType?: VideoSourceType;
  externalUrl?: string;
  externalId?: string;
}

interface ImportVideoModalProps {
  destinationPathLabel: string;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onImportVideo: (payload: ImportVideoPayload) => boolean;
}

const MAX_TITLE_LENGTH = 60;

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatSize = (
  bytes: number
): { label: string; mb: number; bytes: number } => {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  return {
    label: formatFileBytes(safeBytes),
    mb: safeBytes / BYTES_PER_MB,
    bytes: safeBytes,
  };
};

const titleFromFilename = (fileName: string): string => {
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.slice(0, MAX_TITLE_LENGTH) || 'Nuevo vídeo';
};

export const ImportVideoModal: React.FC<ImportVideoModalProps> = ({
  destinationPathLabel,
  allEntries,
  onClose,
  onImportVideo,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);

  const [sourceMode, setSourceMode] = useState<'local' | 'link'>('local');

  // Local file states
  const [originalFileName, setOriginalFileName] = useState('');
  const [title, setTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [duration, setDuration] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [sizeLabel, setSizeLabel] = useState('');
  const [sizeMb, setSizeMb] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [resolution, setResolution] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [nativeFilePath, setNativeFilePath] = useState<string | undefined>(
    undefined
  );
  const [isPickingNative, setIsPickingNative] = useState(false);
  const runningNative = useMemo(() => isNativePlatform(), []);

  // External link states
  const [urlDraft, setUrlDraft] = useState('');
  const [linkTitleLoading, setLinkTitleLoading] = useState(false);
  const [igCoverUrl, setIgCoverUrl] = useState('');
  const [directDuration, setDirectDuration] = useState('0:00');
  const [directResolution, setDirectResolution] = useState('Enlace');

  // Import cover options: mutually exclusive auto vs manual frame picker (local)
  const [coverMode, setCoverMode] = useState<'auto' | 'manual'>('auto');
  const [framePct, setFramePct] = useState(35);
  const [autoBis, setAutoBis] = useState(false);

  const parsedLink = useMemo(() => parseExternalVideoUrl(urlDraft), [urlDraft]);

  // Auto-populate YouTube title via oEmbed + probe direct-url duration
  useEffect(() => {
    if (sourceMode !== 'link') return;

    if (!parsedLink) {
      setLinkTitleLoading(false);
      setIgCoverUrl('');
      return;
    }

    if (!titleManuallyEdited) {
      setTitle(parsedLink.suggestedTitle);
    }

    let cancelled = false;

    if (parsedLink.sourceType === 'youtube') {
      setIgCoverUrl('');
      setLinkTitleLoading(true);
      fetchYouTubeTitle(parsedLink.canonicalUrl).then((fetchedTitle) => {
        if (cancelled) return;
        setLinkTitleLoading(false);
        if (fetchedTitle && !titleManuallyEdited) {
          setTitle(fetchedTitle);
        }
      });
    } else if (parsedLink.sourceType === 'instagram') {
      setIgCoverUrl('');
      if (runningNative) {
        setLinkTitleLoading(true);
        fetchInstagramInfo(parsedLink.canonicalUrl).then((info) => {
          if (cancelled) return;
          setLinkTitleLoading(false);
          if (info?.coverUrl) {
            setIgCoverUrl(info.coverUrl);
          }
          if (info?.title && !titleManuallyEdited) {
            setTitle(info.title);
          }
        });
      } else {
        setLinkTitleLoading(false);
      }
    } else {
      setIgCoverUrl('');
      setLinkTitleLoading(false);
    }

    if (parsedLink.sourceType === 'direct-url') {
      setDirectDuration('...');
      setDirectResolution('URL');
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.src = parsedLink.canonicalUrl;
      probe.onloadedmetadata = () => {
        if (cancelled) return;
        const dur = probe.duration;
        setDirectDuration(formatDuration(dur));
        const height = probe.videoHeight || 0;
        setDirectResolution(
          height >= 2160
            ? '4K'
            : height >= 1080
              ? '1080p'
              : height >= 720
                ? '720p'
                : height > 0
                  ? `${height}p`
                  : 'URL'
        );
      };
      probe.onerror = () => {
        if (cancelled) return;
        setDirectDuration('0:00');
        setDirectResolution('URL');
      };
    }

    return () => {
      cancelled = true;
    };
  }, [parsedLink, sourceMode, titleManuallyEdited]);

  const hasSelectedFile =
    sourceMode === 'local' ? Boolean(videoUrl) : Boolean(parsedLink);
  const trimmed = title.trim();
  const isEmpty = trimmed.length === 0;

  // v2.3 rule: Videos must have unique names across ALL libraries (case-insensitive)
  const isVideoNameTaken = useMemo(() => {
    return (candidate: string) => {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) return false;
      return allEntries.some(
        (entry) =>
          entry.type === 'video' &&
          entry.name.trim().toLowerCase() === normalized
      );
    };
  }, [allEntries]);

  const hasConflict = !isEmpty && isVideoNameTaken(trimmed);

  const resolvedBisTitle = useMemo(() => {
    if (!trimmed) return '';
    let candidate = trimmed;
    while (isVideoNameTaken(candidate)) {
      candidate = `BIS ${candidate}`;
    }
    return candidate;
  }, [isVideoNameTaken, trimmed]);

  const isConflictBlocking = hasConflict && !autoBis;
  const isResolvedByBis = hasConflict && autoBis;
  const showEmptyTitleError = hasSelectedFile && isEmpty;
  const canImport =
    hasSelectedFile && !isEmpty && (!hasConflict || autoBis);

  const captureVideoFrame = (
    videoEl: HTMLVideoElement,
    pct: number
  ) => {
    const dur = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    if (dur <= 0) return;
    const targetTime = Math.min(dur - 0.05, Math.max(0, (dur * pct) / 100));
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const vw = videoEl.videoWidth || 420;
        const vh = videoEl.videoHeight || 236;
        canvas.width = Math.min(vw, 420);
        canvas.height = Math.max(1, Math.round((canvas.width * vh) / vw));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          setCoverUrl(canvas.toDataURL('image/jpeg', 0.68));
        }
      } catch {
        // Keep current cover fallback if codec restricts canvas readback
      } finally {
        videoEl.removeEventListener('seeked', onSeeked);
      }
    };
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = targetTime;
  };

  const setupProbeOnVideoUrl = (
    srcUrl: string,
    fallbackDurationSec = 0,
    fallbackHeight = 0
  ) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.playsInline = true;
    if (shouldUseAnonymousCors(srcUrl)) {
      probe.crossOrigin = 'anonymous';
    }
    probe.src = srcUrl;
    hiddenVideoRef.current = probe;

    probe.onloadedmetadata = () => {
      const dur =
        Number.isFinite(probe.duration) && probe.duration > 0
          ? probe.duration
          : fallbackDurationSec;
      setDuration(formatDuration(dur));
      setDurationSeconds(Number.isFinite(dur) ? dur : 0);
      const height = probe.videoHeight || fallbackHeight || 0;
      setResolution(
        height >= 2160
          ? '4K'
          : height >= 1080
            ? '1080p'
            : height >= 720
              ? '720p'
              : height > 0
                ? `${height}p`
                : 'Vídeo'
      );
      if (probe.readyState >= 2) {
        captureVideoFrame(probe, coverMode === 'manual' ? framePct : 20);
      } else {
        const onLoadedData = () => {
          probe.removeEventListener('loadeddata', onLoadedData);
          captureVideoFrame(probe, coverMode === 'manual' ? framePct : 20);
        };
        probe.addEventListener('loadeddata', onLoadedData);
      }
    };
  };

  const handleOpenDevicePicker = async (mode: NativePickerMode = 'gallery') => {
    if (!runningNative) {
      fileInputRef.current?.click();
      return;
    }
    if (isPickingNative) return;
    setIsPickingNative(true);
    try {
      const picked = await pickPersistentNativeVideo(mode);
      if (!picked) return;

      if (videoUrl && videoUrl.startsWith('blob:')) {
        unregisterSessionVideoFile(videoUrl);
        URL.revokeObjectURL(videoUrl);
      }

      const { label, mb, bytes } = formatSize(picked.sizeBytes);
      setOriginalFileName(picked.fileName);
      setTitle(titleFromFilename(picked.fileName));
      setTitleManuallyEdited(false);
      setDuration(
        picked.durationSec > 0 ? formatDuration(picked.durationSec) : '...'
      );
      setDurationSeconds(picked.durationSec);
      setSizeLabel(label);
      setSizeMb(mb);
      setSizeBytes(bytes);
      setResolution(
        picked.height >= 2160
          ? '4K'
          : picked.height >= 1080
            ? '1080p'
            : picked.height >= 720
              ? '720p'
              : picked.height > 0
                ? `${picked.height}p`
                : '...'
      );
      setCoverUrl('');
      setNativeFilePath(picked.contentUri);
      setVideoUrl(picked.playableUrl);
      setupProbeOnVideoUrl(
        picked.playableUrl,
        picked.durationSec,
        picked.height
      );
    } finally {
      setIsPickingNative(false);
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl && videoUrl.startsWith('blob:')) {
      unregisterSessionVideoFile(videoUrl);
      URL.revokeObjectURL(videoUrl);
    }

    const objUrl = URL.createObjectURL(file);
    registerSessionVideoFile(objUrl, file);
    const { label, mb, bytes } = formatSize(file.size);

    setOriginalFileName(file.name);
    setTitle(titleFromFilename(file.name));
    setTitleManuallyEdited(false);
    setDuration('...');
    setDurationSeconds(0);
    setSizeLabel(label);
    setSizeMb(mb);
    setSizeBytes(bytes);
    setResolution('...');
    setCoverUrl('');
    setNativeFilePath(undefined);
    setVideoUrl(objUrl);
    setupProbeOnVideoUrl(objUrl);
  };

  const handleClose = () => {
    if (videoUrl && videoUrl.startsWith('blob:')) {
      unregisterSessionVideoFile(videoUrl);
      URL.revokeObjectURL(videoUrl);
    }
    onClose();
  };

  const handleFrameSliderChange = (pct: number) => {
    setFramePct(pct);
    if (hiddenVideoRef.current && videoUrl) {
      captureVideoFrame(hiddenVideoRef.current, pct);
    }
  };

  const handleSwitchMode = (nextMode: 'local' | 'link') => {
    if (nextMode === sourceMode) return;
    setSourceMode(nextMode);
    setTitleManuallyEdited(false);
    if (nextMode === 'link') {
      setTitle(parsedLink ? parsedLink.suggestedTitle : '');
    } else {
      setTitle(originalFileName ? titleFromFilename(originalFileName) : '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canImport) return;
    const finalName = isResolvedByBis ? resolvedBisTitle : trimmed;

    if (sourceMode === 'link' && parsedLink) {
      const isDirect = parsedLink.sourceType === 'direct-url';
      const resolvedDur = isDirect
        ? directDuration === '...' || !directDuration
          ? '0:00'
          : directDuration
        : parsedLink.sourceType === 'instagram'
          ? 'Reel'
          : '0:00';
      const resolvedRes = isDirect
        ? directResolution === '...' || !directResolution
          ? 'URL'
          : directResolution
        : parsedLink.resolutionLabel;

      if (
        onImportVideo({
          name: finalName,
          originalFileName: parsedLink.canonicalUrl,
          coverUrl:
            parsedLink.sourceType === 'instagram'
              ? igCoverUrl || parsedLink.coverUrl
              : parsedLink.coverUrl,
          duration: resolvedDur,
          sizeBytes: 0,
          sizeLabel: 'Enlace',
          sizeMb: 0,
          resolution: resolvedRes,
          videoUrl: isDirect ? parsedLink.canonicalUrl : undefined,
          sourceType: parsedLink.sourceType,
          externalUrl: parsedLink.canonicalUrl,
          externalId: parsedLink.externalId,
        })
      ) {
        onClose();
      }
      return;
    }

    if (
      onImportVideo({
        name: finalName,
        originalFileName,
        coverUrl,
        duration: duration === '...' || !duration ? '0:00' : duration,
        sizeBytes,
        sizeLabel,
        sizeMb,
        resolution: resolution === '...' || !resolution ? 'Vídeo' : resolution,
        videoUrl,
        nativeFilePath,
        sourceType: 'local',
      })
    ) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-[#1c1b1b] rounded-t-[28px] sm:rounded-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.75)] border border-white/[0.08] flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Drag Handle (Mobile) */}
        <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-12 h-1.5 bg-[#393939] rounded-full" />
        </div>

        <div className="p-5 pt-3 sm:pt-5 pb-safe-6 space-y-4 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 h-12 rounded-xl bg-[#ff5261] text-[#400009] flex items-center justify-center shadow-lg shadow-[#ff5261]/25 shrink-0">
                <Video className="w-6 h-6" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1c1b1b] flex items-center justify-center text-[#ff5261]">
                  <PlusCircle className="w-3.5 h-3.5 fill-current text-[#ff5261]" />
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight leading-tight">
                  Importar Vídeo
                </h2>
                <div className="flex items-start gap-1.5 mt-0.5 text-[#ffb95f] font-mono text-[10px] leading-snug font-semibold max-w-full">
                  <FolderOpen className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="break-words min-w-0">{destinationPathLabel}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              aria-label="Cerrar modal"
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hidden real device video picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFilePicked}
            className="hidden"
          />

          {/* Source Origin Switcher: Local File vs External Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#c8b6b6]">
                Origen del vídeo
              </span>
              <span className="font-mono text-[10px] text-[#4cd7f6]">
                {sourceMode === 'local'
                  ? 'Sin copiar ni duplicar'
                  : '0 B en dispositivo'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#201f1f] rounded-xl">
              <button
                type="button"
                onClick={() => handleSwitchMode('local')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  sourceMode === 'local'
                    ? 'bg-[#353534] text-[#e5e2e1] shadow-sm'
                    : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5 text-[#ffb3b3] shrink-0" />
                <span className="truncate">Dispositivo</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('link')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  sourceMode === 'link'
                    ? 'bg-[#353534] text-[#e5e2e1] shadow-sm'
                    : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                <span className="truncate">Desde enlace</span>
              </button>
            </div>
          </div>

          {/* Source Content Card: Local Picker vs Link Input & Preview */}
          {sourceMode === 'local' ? (
            videoUrl ? (
              <article className="bg-[#201f1f] rounded-2xl p-3.5 space-y-3 border border-white/[0.06] shadow-md">
                <div className="flex items-start gap-3.5">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[#0e0e0e] shadow-inner flex items-center justify-center">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={title || originalFileName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-7 h-7 text-[#ffb3b3]/70" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e]/80 via-transparent to-transparent" />
                    {resolution && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-[#0e0e0e]/90 font-mono text-[10px] font-bold text-[#e5e2e1]">
                        {resolution}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-bold text-[#e5e2e1] truncate">
                      {originalFileName}
                    </p>
                    <p className="font-mono text-xs text-[#c8b6b6] tabular-nums">
                      {duration} · {sizeLabel}
                    </p>
                    <p className="text-[11px] text-[#c8b6b6]/75 leading-snug">
                      {runningNative
                        ? 'Vínculo directo y permanente al archivo original de tu teléfono, sin copiar ni duplicar.'
                        : 'Enlace directo al archivo original del almacenamiento.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {runningNative ? (
                    <>
                      <button
                        type="button"
                        disabled={isPickingNative}
                        onClick={() => void handleOpenDevicePicker('gallery')}
                        className="h-9 px-3.5 rounded-xl bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 text-[#e5e2e1] text-xs font-semibold inline-flex items-center gap-1.5 transition-all disabled:opacity-60"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[#ffb3b3]" />
                        <span>Cambiar en Galería</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPickingNative}
                        onClick={() => void handleOpenDevicePicker('files')}
                        className="h-9 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 text-[#c8b6b6] text-xs font-semibold inline-flex items-center gap-1.5 transition-all disabled:opacity-60"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Archivos</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isPickingNative}
                      onClick={() => void handleOpenDevicePicker('files')}
                      className="h-9 px-3.5 rounded-xl bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 text-[#e5e2e1] text-xs font-semibold inline-flex items-center gap-1.5 transition-all disabled:opacity-60"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#ffb3b3]" />
                      <span>Cambiar archivo</span>
                    </button>
                  )}
                </div>
              </article>
            ) : runningNative ? (
              <div className="bg-[#201f1f]/75 rounded-2xl p-4 border border-dashed border-white/[0.14] space-y-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#131313] border border-white/[0.06] flex items-center justify-center shrink-0 text-[#ffb3b3]">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-bold text-[#e5e2e1]">
                      Ningún vídeo seleccionado
                    </p>
                    <p className="text-xs text-[#c8b6b6] leading-snug">
                      Elige directamente desde tu galería o abre el explorador de archivos sin duplicar el vídeo.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isPickingNative}
                    onClick={() => void handleOpenDevicePicker('gallery')}
                    className="h-11 px-3 rounded-xl bg-[#ff5261] hover:brightness-105 active:scale-[0.98] text-[#400009] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
                  >
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>Abrir Galería</span>
                  </button>
                  <button
                    type="button"
                    disabled={isPickingNative}
                    onClick={() => void handleOpenDevicePicker('files')}
                    className="h-11 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] active:scale-[0.98] text-[#e5e2e1] text-xs font-semibold inline-flex items-center justify-center gap-1.5 border border-white/[0.08] transition-all disabled:opacity-60"
                  >
                    <FolderOpen className="w-4 h-4 text-[#c8b6b6] shrink-0" />
                    <span>Archivos</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isPickingNative}
                onClick={() => void handleOpenDevicePicker('gallery')}
                className="w-full text-left bg-[#201f1f]/70 hover:bg-[#201f1f] rounded-2xl p-4 border border-dashed border-white/[0.14] hover:border-[#ff5261]/55 transition-all flex items-center gap-3.5 group active:scale-[0.99]"
              >
                <div className="w-16 h-16 rounded-xl bg-[#131313] border border-white/[0.06] flex items-center justify-center shrink-0 text-[#ffb3b3] group-hover:text-[#ff5261] transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-[#e5e2e1]">
                    Ningún vídeo seleccionado
                  </p>
                  <p className="text-xs text-[#c8b6b6] leading-snug">
                    Pulsa aquí para elegir un archivo de vídeo real de tu galería o almacenamiento.
                  </p>
                </div>
              </button>
            )
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="import-video-url"
                  className="text-xs font-semibold text-[#c8b6b6] block px-0.5"
                >
                  Enlace de YouTube, Instagram Reel o vídeo directo (.mp4)
                </label>
                <div className="relative flex items-center h-12 px-3.5 rounded-xl bg-[#201f1f] border border-white/[0.08] focus-within:bg-[#2a2a2a] focus-within:border-[#4cd7f6]/70 transition-all">
                  <Globe className="w-4 h-4 text-[#4cd7f6] shrink-0 mr-2.5" />
                  <input
                    id="import-video-url"
                    type="url"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://youtube.com/... o https://instagram.com/reel/..."
                    className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium text-[#e5e2e1] placeholder:text-[#c8b6b6]/45 focus:outline-none"
                  />
                  {urlDraft.length > 0 && (
                    <button
                      type="button"
                      aria-label="Limpiar enlace"
                      onClick={() => {
                        setUrlDraft('');
                        if (!titleManuallyEdited) setTitle('');
                      }}
                      className="w-7 h-7 rounded-full bg-[#1c1b1b] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {parsedLink ? (
                <article className="bg-[#201f1f] rounded-2xl p-3.5 space-y-2.5 border border-white/[0.06] shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-[#0e0e0e] flex items-center justify-center border border-white/[0.06]">
                      {(parsedLink.sourceType === 'instagram'
                        ? igCoverUrl
                        : parsedLink.coverUrl) ? (
                        <img
                          src={
                            parsedLink.sourceType === 'instagram'
                              ? igCoverUrl
                              : parsedLink.coverUrl
                          }
                          alt={title || parsedLink.suggestedTitle}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : parsedLink.sourceType === 'instagram' ? (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#833ab4]/40 via-[#fd1d1d]/30 to-[#fcb045]/40 text-[#e5e2e1]">
                          <Instagram className="w-8 h-8" />
                        </div>
                      ) : (
                        <Film className="w-7 h-7 text-[#4cd7f6]" />
                      )}
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-[#0e0e0e]/90 font-mono text-[9px] font-bold text-[#e5e2e1]">
                        {parsedLink.containerLabel}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {parsedLink.sourceType === 'youtube' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff5261]/20 text-[#ffb3b3] font-mono text-[10px] font-bold">
                            <Youtube className="w-3 h-3" />
                            <span>
                              {parsedLink.isShortOrReel
                                ? 'YouTube Short'
                                : 'YouTube'}
                            </span>
                          </span>
                        ) : parsedLink.sourceType === 'instagram' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ffb95f]/20 text-[#ffb95f] font-mono text-[10px] font-bold">
                            <Instagram className="w-3 h-3" />
                            <span>Instagram Reel</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] font-mono text-[10px] font-bold">
                            <ExternalLink className="w-3 h-3" />
                            <span>URL directa</span>
                          </span>
                        )}
                        {linkTitleLoading && (
                          <span className="font-mono text-[10px] text-[#c8b6b6]">
                            Obteniendo título...
                          </span>
                        )}
                      </div>

                      <p className="font-mono text-[11px] text-[#c8b6b6] truncate">
                        {parsedLink.canonicalUrl}
                      </p>

                      <p className="text-[11px] leading-snug text-[#c8b6b6]">
                        {parsedLink.sourceType === 'youtube'
                          ? 'Bucle A-B, Espejo y velocidades x0.25–x1.0 listos en el estudio.'
                          : parsedLink.sourceType === 'instagram'
                            ? runningNative
                              ? 'Reproducción directa dentro de DanceVault con el Visor integrado y modo Espejo (sin bucle A-B ni slow-mo).'
                              : 'Organizado en carpeta con Espejo, notas y etiquetas (en móvil Android usa Visor integrado).'
                            : `Duración ${directDuration} · Todas las herramientas de estudio al 100%.`}
                      </p>
                    </div>
                  </div>
                </article>
              ) : urlDraft.trim().length > 0 ? (
                <div className="p-3 rounded-xl bg-[#93000a]/20 border border-[#ffb4ab]/30 flex items-start gap-2 text-xs text-[#ffb4ab]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Enlace no reconocido. Pega una URL de YouTube, YouTube Short,
                    Instagram Reel o un vídeo directo (.mp4, .webm, .mov).
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#201f1f]/70 border border-white/[0.06] text-[11px] text-[#c8b6b6] leading-relaxed">
                  Guarda vídeos sin ocupar espacio en tu teléfono: compatible con{' '}
                  <strong className="text-[#e5e2e1]">YouTube / Shorts</strong>,{' '}
                  <strong className="text-[#e5e2e1]">Instagram Reels</strong> y{' '}
                  <strong className="text-[#e5e2e1]">enlaces .mp4/.webm</strong>.
                </div>
              )}
            </div>
          )}

          {/* Title Input + v2.3 Unique Validation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <label
                htmlFor="import-video-title"
                className="text-xs font-semibold text-[#c8b6b6]"
              >
                Título del vídeo / figura
              </label>
              <span
                className={`font-mono text-[11px] font-semibold tabular-nums ${
                  isConflictBlocking || showEmptyTitleError
                    ? 'text-[#ffb4ab]'
                    : 'text-[#c8b6b6]/75'
                }`}
              >
                {title.length}/{MAX_TITLE_LENGTH}
              </span>
            </div>

            <div
              className={`relative flex items-center h-12 px-3.5 rounded-xl border transition-all ${
                isConflictBlocking || showEmptyTitleError
                  ? 'bg-[#93000a]/15 border-[#ffb4ab]/80 ring-1 ring-[#ffb4ab]/35'
                  : isResolvedByBis
                    ? 'bg-[#201f1f] border-[#4cd7f6]/70'
                    : 'bg-[#201f1f] border-white/[0.08] focus-within:bg-[#2a2a2a] focus-within:border-[#ff5261]/70'
              }`}
            >
              <Pencil className="w-4 h-4 text-[#c8b6b6] shrink-0 mr-2.5" />
              <input
                id="import-video-title"
                type="text"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleManuallyEdited(true);
                }}
                placeholder="Se rellenará al elegir el vídeo o escribe un título..."
                className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[#e5e2e1] placeholder:text-[#c8b6b6]/45 focus:outline-none"
              />
              {title.length > 0 && (
                <button
                  type="button"
                  aria-label="Limpiar título"
                  onClick={() => {
                    setTitle('');
                    setTitleManuallyEdited(true);
                  }}
                  className="w-7 h-7 rounded-full bg-[#1c1b1b] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Validation Status */}
            <div className="flex items-center gap-1.5 px-0.5 text-xs font-medium min-h-[18px]">
              {!hasSelectedFile ? (
                <span className="text-[#c8b6b6]/80">
                  {sourceMode === 'local'
                    ? 'Selecciona primero un archivo de vídeo para previsualizar sus datos'
                    : 'Pega un enlace válido arriba para guardar la instancia de vídeo'}
                </span>
              ) : isEmpty ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                  <span className="text-[#ffb4ab]">El título es obligatorio</span>
                </>
              ) : isConflictBlocking ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                  <span className="text-[#ffb4ab]">
                    Ya existe otro vídeo con este nombre en la app
                  </span>
                </>
              ) : isResolvedByBis ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                  <span className="text-[#4cd7f6] truncate">
                    Se importará como: &ldquo;{resolvedBisTitle}&rdquo;
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                  <span className="text-[#4cd7f6]">Nombre disponible</span>
                </>
              )}
            </div>

            {/* Auto-BIS checkbox shown when a conflict exists or toggled */}
            {(hasConflict || autoBis) && (
              <button
                type="button"
                role="checkbox"
                aria-checked={autoBis}
                onClick={() => setAutoBis((prev) => !prev)}
                className={`w-full text-left rounded-xl p-2.5 flex items-center gap-2.5 border transition-all ${
                  autoBis
                    ? 'bg-[#2a2a2a] border-[#4cd7f6]/45'
                    : 'bg-[#201f1f] border-[#ffb95f]/35 hover:border-[#ffb95f]/60'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                    autoBis
                      ? 'bg-[#4cd7f6] border-[#4cd7f6] text-[#002f38]'
                      : 'bg-[#131313] border-[#c8b6b6]/50 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span className="text-xs font-semibold text-[#e5e2e1] truncate">
                  Renombre automático (añadir BIS si está repetido)
                </span>
              </button>
            )}
          </div>

          {/* Toggles Section: Opciones de portada (solo archivo local) */}
          {sourceMode === 'local' && (
            <div className="bg-[#201f1f] rounded-2xl p-3.5 space-y-3 border border-white/[0.05]">
              <span className="block text-xs font-semibold text-[#c8b6b6]">
                Opciones de portada
              </span>

              {/* Toggle 1: Auto thumbnail */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ImageIcon className="w-4 h-4 text-[#ffb3b3] shrink-0" />
                  <span className="text-sm text-[#e5e2e1] leading-snug">
                    Generar fotograma de portada automático
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={coverMode === 'auto'}
                  onClick={() => {
                    setCoverMode('auto');
                    if (hiddenVideoRef.current && videoUrl) {
                      captureVideoFrame(hiddenVideoRef.current, 20);
                    }
                  }}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors relative flex items-center shrink-0 ${
                    coverMode === 'auto' ? 'bg-[#ff5261]' : 'bg-[#353534]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      coverMode === 'auto' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2: Manual frame selection */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 text-[#c8b6b6] shrink-0" />
                  <span className="text-sm text-[#e5e2e1] leading-snug">
                    Elegir fotograma de portada manualmente
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={coverMode === 'manual'}
                  onClick={() => setCoverMode('manual')}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors relative flex items-center shrink-0 ${
                    coverMode === 'manual' ? 'bg-[#ff5261]' : 'bg-[#353534]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      coverMode === 'manual' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Manual Frame Scrubber */}
              {coverMode === 'manual' && (
                <div className="pt-1 space-y-1.5 border-t border-white/[0.06]">
                  {hasSelectedFile && durationSeconds > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#ffb95f] tabular-nums">
                        <span>Posición del fotograma</span>
                        <span>
                          {framePct}% ({formatDuration((durationSeconds * framePct) / 100)})
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={framePct}
                        onChange={(e) => handleFrameSliderChange(Number(e.target.value))}
                        className="w-full accent-[#ff5261]"
                      />
                    </>
                  ) : (
                    <p className="text-[11px] text-[#c8b6b6]/75 pt-1">
                      El selector manual de fotograma estará disponible en cuanto cargues un vídeo.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons Footer */}
          <div className="grid grid-cols-5 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="col-span-2 h-[52px] rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-sm font-semibold text-[#e5e2e1] active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canImport}
              className={`col-span-3 h-[52px] rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                canImport
                  ? 'bg-[#ff5261] text-[#400009] shadow-lg shadow-[#ff5261]/25 hover:brightness-105 active:scale-[0.98]'
                  : 'bg-[#ff5261]/35 text-[#400009]/65 opacity-50 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>
                {sourceMode === 'link' ? 'Guardar enlace' : 'Importar vídeo'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
