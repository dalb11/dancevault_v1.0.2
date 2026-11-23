import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  History,
  Image as ImageIcon,
  Instagram,
  Link2,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Scissors,
  Share2,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
  SavedLoopItem,
  VideoEntry,
  VideoMetadataUpdates,
} from '../types/dancevault';
import {
  formatCreationDateLabel,
  fromDateTimeLocalInputValue,
  getEntryCreatedAt,
  toDateTimeLocalInputValue,
} from '../utils/dateUtils';
import { getVideoSavedLoops } from '../utils/loopUtils';
import { formatFileBytes } from '../utils/storageSize';
import {
  fetchInstagramInfo,
  fetchYouTubeTitle,
  parseExternalVideoUrl,
} from '../utils/videoLinkUtils';
import { useBackHandler } from '../utils/backNavigation';
import {
  isNativePlatform,
  NativePickerMode,
  pickPersistentNativeVideo,
  shouldUseAnonymousCors,
} from '../utils/nativeMediaStorage';
import {
  registerSessionVideoFile,
  shareVideoEntry,
  unregisterSessionVideoFile,
} from '../utils/videoShareUtils';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';

interface VideoDetailsModalProps {
  video: VideoEntry;
  library: LibraryItem;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onPlay: (video: VideoEntry) => void;
  onToggleFavorite: (videoId: string) => void;
  onRename: (video: VideoEntry) => void;
  onChangeCover: (video: VideoEntry) => void;
  onMove: (video: VideoEntry) => void;
  onDuplicate: (videoId: string) => void;
  onDelete: (videoId: string) => void;
  onUpdateMetadata: (
    videoId: string,
    updates: VideoMetadataUpdates,
    options?: { silent?: boolean }
  ) => void;
}

const formatResolutionDetail = (res: string): string => {
  const clean = res.trim().toLowerCase();
  if (clean === '1080p') return '1920 × 1080 (FHD)';
  if (clean === '720p') return '1280 × 720 (HD)';
  if (clean === '4k' || clean === '2160p') return '3840 × 2160 (4K)';
  return res || 'HD Local';
};

const parseContainerFormat = (fileName: string): string => {
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  return extMatch ? extMatch[1].toUpperCase() : 'MP4';
};

export const VideoDetailsModal: React.FC<VideoDetailsModalProps> = ({
  video,
  library,
  allEntries,
  onClose,
  onPlay,
  onToggleFavorite,
  onRename,
  onChangeCover,
  onMove,
  onDuplicate,
  onDelete,
  onUpdateMetadata,
}) => {
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [video.coverUrl]);

  // Tags editing state
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const tagSectionRef = useRef<HTMLElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);

  // Rehearsal note editing state
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(video.note ?? '');
  const reassignInputRef = useRef<HTMLInputElement | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [relinkingUrlOpen, setRelinkingUrlOpen] = useState(false);
  const [relinkUrlDraft, setRelinkUrlDraft] = useState(video.externalUrl ?? '');
  const [relinkingUrlBusy, setRelinkingUrlBusy] = useState(false);
  const [relinkUrlError, setRelinkUrlError] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
    canReassign?: boolean;
  } | null>(null);

  const createdAtMs = useMemo(() => getEntryCreatedAt(video), [video]);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(() =>
    toDateTimeLocalInputValue(createdAtMs)
  );
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    setRelinkingUrlOpen(false);
    setRelinkUrlDraft(video.externalUrl ?? '');
    setRelinkUrlError('');
    setRelinkingUrlBusy(false);
    setShareFeedback(null);
    setIsSharing(false);
    setEditingDate(false);
    setDateError('');
    setDateDraft(toDateTimeLocalInputValue(getEntryCreatedAt(video)));
  }, [video.createdAt, video.externalUrl, video.id]);

  const parsedRelink = useMemo(
    () => parseExternalVideoUrl(relinkUrlDraft),
    [relinkUrlDraft]
  );

  // Saved A-B loops management
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [loopNameDraft, setLoopNameDraft] = useState('');

  useBackHandler(editingDate, () => setEditingDate(false), 75);
  useBackHandler(relinkingUrlOpen, () => setRelinkingUrlOpen(false), 75);
  useBackHandler(Boolean(editingLoopId), () => setEditingLoopId(null), 75);
  useBackHandler(editingNote, () => setEditingNote(false), 75);
  useBackHandler(addingTag, () => setAddingTag(false), 75);

  const handleSaveCreatedAt = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = fromDateTimeLocalInputValue(dateDraft);
    if (parsed === null) {
      setDateError('Selecciona una fecha y hora válidas.');
      return;
    }
    onUpdateMetadata(video.id, { createdAt: parsed });
    setDateError('');
    setEditingDate(false);
  };

  const savedLoops = useMemo(() => getVideoSavedLoops(video), [video]);

  const breadcrumbs = useMemo(() => {
    const chain: FolderEntry[] = [];
    let cursor = video.parentId
      ? allEntries.find(
          (e): e is FolderEntry => e.id === video.parentId && e.type === 'folder'
        )
      : undefined;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parentId
        ? allEntries.find(
            (e): e is FolderEntry =>
              e.id === cursor!.parentId && e.type === 'folder'
          )
        : undefined;
    }
    return chain;
  }, [allEntries, video.parentId]);

  const sourceType = video.sourceType ?? 'local';
  const isExternalLink = sourceType !== 'local';
  const canShareVideo = sourceType !== 'youtube' && sourceType !== 'instagram';

  const containerFormat = useMemo(() => {
    if (sourceType === 'youtube') return 'YOUTUBE';
    if (sourceType === 'instagram') return 'IG REEL';
    return parseContainerFormat(video.originalFileName);
  }, [sourceType, video.originalFileName]);

  const resolutionDetail = useMemo(
    () => formatResolutionDetail(video.resolution),
    [video.resolution]
  );

  const existingTagSuggestions = useMemo(() => {
    const assigned = new Set(video.tags.map((t) => t.trim().toLowerCase()));
    const counts = new Map<string, { label: string; count: number }>();
    allEntries.forEach((entry) => {
      if (entry.type !== 'video') return;
      entry.tags.forEach((rawTag) => {
        const clean = rawTag.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (assigned.has(key)) return;
        const prev = counts.get(key);
        if (prev) {
          prev.count += 1;
        } else {
          counts.set(key, { label: clean, count: 1 });
        }
      });
    });
    const q = tagDraft.trim().toLowerCase();
    return Array.from(counts.values())
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          b.count - a.count || a.label.localeCompare(b.label, 'es')
      )
      .map((item) => item.label);
  }, [allEntries, tagDraft, video.tags]);

  const handleQuickAddExistingTag = (tagToAdd: string) => {
    const exists = video.tags.some(
      (t) => t.toLowerCase() === tagToAdd.toLowerCase()
    );
    if (!exists) {
      onUpdateMetadata(video.id, { tags: [...video.tags, tagToAdd] });
    }
    setTagDraft('');
  };

  const handleOpenTagEditor = () => {
    setAddingTag(true);
    window.setTimeout(() => {
      tagSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      tagInputRef.current?.focus();
    }, 50);
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tagDraft.trim();
    if (!cleaned) return;
    const exists = video.tags.some(
      (t) => t.toLowerCase() === cleaned.toLowerCase()
    );
    if (!exists) {
      onUpdateMetadata(video.id, { tags: [...video.tags, cleaned] });
    }
    setTagDraft('');
    setAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateMetadata(video.id, {
      tags: video.tags.filter((t) => t !== tagToRemove),
    });
  };

  const handleSaveNote = () => {
    const cleaned = noteDraft.trim();
    const nowLabel = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
    onUpdateMetadata(video.id, {
      note: cleaned,
      noteUpdatedAt: `Hoy ${nowLabel}`,
    });
    setEditingNote(false);
  };

  const handlePlaySavedLoop = (loop: SavedLoopItem) => {
    const nextUpdates: VideoMetadataUpdates = {
      savedLoops,
      loopMarker: loop.marker,
      activeLoopId: loop.id,
      loopActive: true,
    };
    onUpdateMetadata(video.id, nextUpdates, { silent: true });
    onPlay({
      ...video,
      ...nextUpdates,
    });
  };

  const handleStartRenameLoop = (loop: SavedLoopItem) => {
    setEditingLoopId(loop.id);
    setLoopNameDraft(loop.name);
  };

  const handleConfirmRenameLoop = (loopId: string) => {
    const cleaned = loopNameDraft.trim();
    if (!cleaned) {
      setEditingLoopId(null);
      return;
    }
    const nextLoops = savedLoops.map((l) =>
      l.id === loopId ? { ...l, name: cleaned } : l
    );
    onUpdateMetadata(video.id, { savedLoops: nextLoops }, { silent: true });
    setEditingLoopId(null);
  };

  const handleDeleteSavedLoop = (loop: SavedLoopItem) => {
    const nextLoops = savedLoops.filter((l) => l.id !== loop.id);
    const wasCurrent =
      video.activeLoopId === loop.id ||
      (!video.activeLoopId && video.loopMarker === loop.marker);

    if (wasCurrent) {
      const nextActive = nextLoops[nextLoops.length - 1];
      if (nextActive) {
        onUpdateMetadata(video.id, {
          savedLoops: nextLoops,
          loopMarker: nextActive.marker,
          activeLoopId: nextActive.id,
          loopActive: video.loopActive !== false,
        });
      } else {
        onUpdateMetadata(video.id, {
          savedLoops: [],
          loopMarker: undefined,
          activeLoopId: undefined,
          loopActive: false,
        });
      }
    } else {
      onUpdateMetadata(video.id, { savedLoops: nextLoops });
    }
    if (editingLoopId === loop.id) {
      setEditingLoopId(null);
    }
  };

  const probeAndCommitReassignedUrl = async (params: {
    fileName: string;
    sizeBytes: number;
    sizeLabel: string;
    playableUrl: string;
    nativeFilePath?: string;
    fallbackDurationSec?: number;
    fallbackHeight?: number;
  }) => {
    const fileChanged =
      params.fileName.trim().toLowerCase() !==
      video.originalFileName.trim().toLowerCase();
    const shouldRefreshCover = fileChanged || !video.coverUrl;

    const probed = await new Promise<{
      durationStr: string;
      resolutionStr: string;
      coverDataUrl?: string;
    }>((resolve) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.muted = true;
      probe.playsInline = true;
      if (shouldUseAnonymousCors(params.playableUrl)) {
        probe.crossOrigin = 'anonymous';
      }
      probe.src = params.playableUrl;

      const finish = (
        durationStr: string,
        resolutionStr: string,
        coverDataUrl?: string
      ) => {
        probe.removeAttribute('src');
        probe.load();
        resolve({ durationStr, resolutionStr, coverDataUrl });
      };

      const timer = window.setTimeout(() => {
        const fbDur = params.fallbackDurationSec ?? 0;
        const fbTotal = fbDur > 0 ? Math.round(fbDur) : 0;
        const fbDurStr =
          fbTotal > 0
            ? `${Math.floor(fbTotal / 60)}:${String(fbTotal % 60).padStart(2, '0')}`
            : video.duration;
        const fbH = params.fallbackHeight ?? 0;
        const fbResStr =
          fbH >= 2160
            ? '4K'
            : fbH >= 1080
              ? '1080p'
              : fbH >= 720
                ? '720p'
                : fbH > 0
                  ? `${fbH}p`
                  : video.resolution;
        finish(fbDurStr, fbResStr);
      }, 4000);

      probe.onloadedmetadata = () => {
        const dur =
          Number.isFinite(probe.duration) && probe.duration > 0
            ? probe.duration
            : params.fallbackDurationSec ?? 0;
        const total = Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0;
        const durationStr = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
        const vh = probe.videoHeight || params.fallbackHeight || 0;
        const resolutionStr =
          vh >= 2160
            ? '4K'
            : vh >= 1080
              ? '1080p'
              : vh >= 720
                ? '720p'
                : vh > 0
                  ? `${vh}p`
                  : 'Vídeo';

        if (!shouldRefreshCover || !Number.isFinite(dur) || dur <= 0) {
          window.clearTimeout(timer);
          finish(durationStr, resolutionStr);
          return;
        }

        const captureCover = () => {
          try {
            const vw = probe.videoWidth || 420;
            const vhReal = probe.videoHeight || 236;
            const targetW = Math.min(vw, 420);
            const targetH = Math.max(1, Math.round((targetW * vhReal) / vw));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            const captured = ctx
              ? (() => {
                  ctx.drawImage(probe, 0, 0, targetW, targetH);
                  return canvas.toDataURL('image/jpeg', 0.68);
                })()
              : undefined;
            window.clearTimeout(timer);
            finish(durationStr, resolutionStr, captured);
          } catch {
            window.clearTimeout(timer);
            finish(durationStr, resolutionStr);
          }
        };

        const onSeeked = () => {
          probe.removeEventListener('seeked', onSeeked);
          captureCover();
        };

        probe.addEventListener('seeked', onSeeked);
        probe.currentTime = Math.min(Math.max(0, dur - 0.05), dur * 0.2);
      };

      probe.onerror = () => {
        window.clearTimeout(timer);
        finish(video.duration, video.resolution);
      };
    });

    onUpdateMetadata(video.id, {
      originalFileName: params.fileName,
      duration: probed.durationStr,
      sizeBytes: params.sizeBytes,
      sizeLabel: params.sizeLabel,
      resolution: probed.resolutionStr,
      fps: 'Local',
      videoUrl: params.playableUrl,
      nativeFilePath: params.nativeFilePath,
      sourceType: 'local',
      externalUrl: undefined,
      externalId: undefined,
      importedAtLabel: params.nativeFilePath
        ? 'Vínculo directo permanente al original'
        : 'Reasignado en esta sesión',
      ...(probed.coverDataUrl ? { coverUrl: probed.coverDataUrl } : {}),
    });
  };

  const triggerReassignPicker = async (mode: NativePickerMode = 'gallery') => {
    if (isReassigning) return;
    if (!isNativePlatform()) {
      reassignInputRef.current?.click();
      return;
    }

    setIsReassigning(true);
    setShareFeedback(null);
    try {
      const picked = await pickPersistentNativeVideo(mode);
      if (!picked) {
        setIsReassigning(false);
        return;
      }
      if (video.videoUrl && video.videoUrl.startsWith('blob:')) {
        unregisterSessionVideoFile(video.videoUrl);
        try {
          URL.revokeObjectURL(video.videoUrl);
        } catch {
          // Ignore cleanup errors
        }
      }
      await probeAndCommitReassignedUrl({
        fileName: picked.fileName,
        sizeBytes: picked.sizeBytes,
        sizeLabel: formatFileBytes(picked.sizeBytes),
        playableUrl: picked.playableUrl,
        nativeFilePath: picked.contentUri,
        fallbackDurationSec: picked.durationSec,
        fallbackHeight: picked.height,
      });
    } finally {
      setIsReassigning(false);
    }
  };

  const handleReassignFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsReassigning(true);
    setShareFeedback(null);
    const objUrl = URL.createObjectURL(file);
    registerSessionVideoFile(objUrl, file);

    if (video.videoUrl && video.videoUrl.startsWith('blob:')) {
      unregisterSessionVideoFile(video.videoUrl);
      try {
        URL.revokeObjectURL(video.videoUrl);
      } catch {
        // Ignore cleanup errors
      }
    }

    try {
      await probeAndCommitReassignedUrl({
        fileName: file.name,
        sizeBytes: file.size,
        sizeLabel: formatFileBytes(file.size),
        playableUrl: objUrl,
        nativeFilePath: undefined,
      });
    } finally {
      setIsReassigning(false);
    }
  };

  const handleConfirmRelinkUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedRelink) {
      setRelinkUrlError(
        'Pega un enlace válido de YouTube, Instagram Reel o vídeo directo (.mp4, .webm, .mov).'
      );
      return;
    }

    setRelinkingUrlBusy(true);
    setRelinkUrlError('');

    if (
      video.videoUrl &&
      video.videoUrl.startsWith('blob:') &&
      video.videoUrl !== parsedRelink.canonicalUrl
    ) {
      try {
        URL.revokeObjectURL(video.videoUrl);
      } catch {
        // Ignore cleanup errors
      }
    }

    if (parsedRelink.sourceType === 'youtube') {
      const ytTitle = parsedRelink.externalId
        ? await fetchYouTubeTitle(parsedRelink.externalId).catch(() => null)
        : null;
      onUpdateMetadata(video.id, {
        sourceType: 'youtube',
        externalUrl: parsedRelink.canonicalUrl,
        externalId: parsedRelink.externalId,
        videoUrl: undefined,
        nativeFilePath: undefined,
        coverUrl: parsedRelink.coverUrl,
        originalFileName: ytTitle || parsedRelink.suggestedTitle,
        sizeBytes: 0,
        sizeLabel: 'Enlace',
        resolution: parsedRelink.resolutionLabel,
        fps: 'Web',
        duration: '0:00',
        importedAtLabel: 'Enlace actualizado en esta sesión',
      });
      setRelinkingUrlBusy(false);
      setRelinkingUrlOpen(false);
      return;
    }

    if (parsedRelink.sourceType === 'instagram') {
      const igInfo = await fetchInstagramInfo(parsedRelink.canonicalUrl).catch(
        () => null
      );
      onUpdateMetadata(video.id, {
        sourceType: 'instagram',
        externalUrl: parsedRelink.canonicalUrl,
        externalId: parsedRelink.externalId,
        videoUrl: undefined,
        nativeFilePath: undefined,
        coverUrl: igInfo?.coverUrl || '',
        originalFileName: igInfo?.title || parsedRelink.suggestedTitle,
        sizeBytes: 0,
        sizeLabel: 'Enlace',
        resolution: parsedRelink.resolutionLabel,
        fps: 'Web',
        duration: 'Reel',
        importedAtLabel: 'Enlace actualizado en esta sesión',
      });
      setRelinkingUrlBusy(false);
      setRelinkingUrlOpen(false);
      return;
    }

    // Direct video URL: probe metadata quickly with a timeout fallback
    const probed = await new Promise<{ duration: string; resolution: string }>(
      (resolve) => {
        let settled = false;
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.playsInline = true;

        const finish = (durationStr: string, resStr: string) => {
          if (settled) return;
          settled = true;
          probe.removeAttribute('src');
          probe.load();
          resolve({ duration: durationStr, resolution: resStr });
        };

        const timer = window.setTimeout(
          () => finish('0:00', parsedRelink.resolutionLabel),
          3500
        );

        probe.onloadedmetadata = () => {
          window.clearTimeout(timer);
          const dur = probe.duration;
          const total = Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0;
          const durationStr =
            total > 0
              ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
              : '0:00';
          const vh = probe.videoHeight || 0;
          const resStr =
            vh >= 2160
              ? '4K'
              : vh >= 1080
                ? '1080p'
                : vh >= 720
                  ? '720p'
                  : vh > 0
                    ? `${vh}p`
                    : parsedRelink.resolutionLabel;
          finish(durationStr, resStr);
        };

        probe.onerror = () => {
          window.clearTimeout(timer);
          finish('0:00', parsedRelink.resolutionLabel);
        };

        probe.src = parsedRelink.canonicalUrl;
      }
    );

    onUpdateMetadata(video.id, {
      sourceType: 'direct-url',
      externalUrl: parsedRelink.canonicalUrl,
      externalId: parsedRelink.externalId,
      videoUrl: parsedRelink.canonicalUrl,
      nativeFilePath: undefined,
      coverUrl: '',
      originalFileName: parsedRelink.suggestedTitle,
      sizeBytes: 0,
      sizeLabel: 'Enlace',
      resolution: probed.resolution,
      fps: 'Web',
      duration: probed.duration,
      importedAtLabel: 'Enlace actualizado en esta sesión',
    });
    setRelinkingUrlBusy(false);
    setRelinkingUrlOpen(false);
  };

  const handleShareVideo = async () => {
    if (isSharing) return;
    setIsSharing(true);
    setShareFeedback(null);
    const result = await shareVideoEntry(video);
    setIsSharing(false);

    if (result.status === 'cancelled') return;

    if (result.status === 'shared' || result.status === 'copied') {
      setShareFeedback({ tone: 'success', message: result.message });
      return;
    }

    if (result.status === 'needs-reassign') {
      setShareFeedback({
        tone: 'warning',
        message: result.message,
        canReassign: true,
      });
      return;
    }

    if (result.status === 'unsupported') {
      setShareFeedback({
        tone: 'warning',
        message: result.message,
      });
      return;
    }

    setShareFeedback({
      tone: 'error',
      message: result.message,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#131313] text-[#e5e2e1] flex flex-col overflow-y-auto">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-[#131313]/90 backdrop-blur-xl border-b border-white/[0.06] pt-safe">
        <div className="max-w-xl mx-auto h-16 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="Volver"
              onClick={onClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-[#e5e2e1] hover:bg-[#201f1f] active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-[#e5e2e1] truncate">
              Detalles
            </h2>
          </div>

          <button
            type="button"
            aria-label={
              video.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'
            }
            onClick={() => onToggleFavorite(video.id)}
            className={`w-11 h-11 rounded-full flex items-center justify-center bg-[#201f1f] hover:bg-[#2a2a2a] active:scale-90 transition-all shrink-0 ${
              video.favorite ? 'text-[#ffb95f]' : 'text-[#c8b6b6]'
            }`}
          >
            <Star
              className={`w-5 h-5 ${video.favorite ? 'fill-current' : ''}`}
            />
          </button>
        </div>
      </header>

      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-safe-10 space-y-5">
        {/* Title & Quick Edit Pills */}
        <div className="space-y-3">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#ff5261]">
              {isExternalLink
                ? `Enlace Externo · ${containerFormat}`
                : `Vídeo Vinculado · ${containerFormat}`}
            </span>
            <h3 className="text-2xl font-extrabold text-[#e5e2e1] tracking-tight leading-snug break-words mt-0.5">
              {video.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onRename(video)}
              className="h-9 px-3.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all border border-white/[0.06]"
            >
              <Pencil className="w-3.5 h-3.5 text-[#ffb3b3]" />
              <span>Renombrar</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeCover(video)}
              className="h-9 px-3.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all border border-white/[0.06]"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>

            {canShareVideo && (
              <button
                type="button"
                disabled={isSharing}
                onClick={handleShareVideo}
                className="h-9 px-3.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all border border-white/[0.06] disabled:opacity-60"
              >
                <Share2 className="w-3.5 h-3.5 text-[#ffb95f]" />
                <span>
                  {isSharing
                    ? 'Preparando...'
                    : isExternalLink
                      ? 'Compartir enlace'
                      : 'Compartir vídeo'}
                </span>
              </button>
            )}
          </div>

          {canShareVideo && shareFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed space-y-2 ${
                shareFeedback.tone === 'success'
                  ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#a7f3d0]'
                  : shareFeedback.tone === 'warning'
                    ? 'bg-[#ffb95f]/10 border-[#ffb95f]/35 text-[#ffddb0]'
                    : 'bg-[#93000a]/25 border-[#ffb4ab]/35 text-[#ffb4ab]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span>{shareFeedback.message}</span>
                <button
                  type="button"
                  aria-label="Cerrar aviso de compartir"
                  onClick={() => setShareFeedback(null)}
                  className="p-0.5 rounded opacity-75 hover:opacity-100 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {shareFeedback.canReassign && (
                <button
                  type="button"
                  onClick={() => void triggerReassignPicker()}
                  className="h-8 px-3 rounded-lg bg-[#ffb95f] text-[#472a00] font-bold text-[11px] inline-flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reasignar archivo ahora</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Media Preview Hero Card */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-[#1c1b1b] shadow-xl border border-white/[0.06]">
          <div className="relative aspect-video w-full overflow-hidden bg-[#0e0e0e]">
            {video.coverUrl && !coverFailed ? (
              <img
                src={video.coverUrl}
                alt={video.name}
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <VideoCoverPlaceholder sourceType={sourceType} size="lg" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/25 to-black/40" />

            {/* Top Badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0e0e0e]/80 backdrop-blur-md text-[#e5e2e1] font-mono text-[11px] font-semibold">
                <Video className="w-3.5 h-3.5 text-[#4cd7f6]" />
                <span className="uppercase">
                  {video.resolution} • {video.fps ?? '60fps'}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[#e5e2e1] font-mono text-[11px] font-semibold tabular-nums">
                {video.duration}
              </div>
            </div>

            {/* Center Play Touch Point */}
            <button
              type="button"
              aria-label="Reproducir en visor de estudio"
              onClick={() => onPlay(video)}
              className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-[#ff5261] text-[#131313] flex items-center justify-center shadow-[0_0_24px_rgba(255,82,97,0.45)] hover:scale-105 active:scale-90 transition-transform"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>

            {/* Active Loop Pill Marker (only if real loop data exists) */}
            {video.loopMarker && (
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ff5261]/90 text-[#400009] font-mono text-[11px] font-bold">
                <Repeat className="w-3.5 h-3.5" />
                <span>{video.loopMarker}</span>
              </div>
            )}

            {/* Change Cover Overlay Trigger */}
            <div className="absolute bottom-3 right-3">
              <button
                type="button"
                onClick={() => onChangeCover(video)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2a2a2a]/90 backdrop-blur-md text-[#e5e2e1] text-[11px] font-semibold hover:bg-[#393939] active:scale-95 transition-all border border-white/10"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#ffb3b3]" />
                <span>Cambiar portada</span>
              </button>
            </div>
          </div>
        </div>

        {/* Block: Etiquetas del Vídeo */}
        <section
          ref={tagSectionRef}
          className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ff5261]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Etiquetas de búsqueda
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddingTag((prev) => !prev);
                window.setTimeout(() => tagInputRef.current?.focus(), 40);
              }}
              className="text-xs font-semibold text-[#4cd7f6] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </div>

          {video.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {video.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[#2a2a2a] text-[11px] font-medium text-[#e5e2e1] border border-white/[0.06] max-w-full"
                >
                  <Tag className="w-2.5 h-2.5 text-[#ffb3b3] shrink-0" />
                  <span className="break-words">{tag}</span>
                  <button
                    type="button"
                    aria-label={`Quitar etiqueta ${tag}`}
                    onClick={() => handleRemoveTag(tag)}
                    className="w-4 h-4 rounded-full hover:bg-[#393939] flex items-center justify-center text-[#c8b6b6] hover:text-[#ffb4ab] shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#c8b6b6]">
              Sin etiquetas todavía. Añade etiquetas como "Giros", "Sensual" o
              "Footwork" para filtrar más rápido.
            </p>
          )}

          {addingTag && (
            <div className="space-y-2.5 pt-1">
              <form onSubmit={handleAddTagSubmit} className="flex items-center gap-2">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagDraft}
                  maxLength={24}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="Ej. Disociación, Musicalidad..."
                  className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-[#131313] border border-white/10 text-xs text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none focus:border-[#4cd7f6]"
                />
                <button
                  type="submit"
                  className="h-10 px-4 rounded-xl bg-[#4cd7f6] text-[#003640] text-xs font-bold shrink-0 active:scale-95 transition-transform"
                >
                  Añadir
                </button>
              </form>

              {existingTagSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#c8b6b6]">
                    Etiquetas ya creadas
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {existingTagSuggestions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleQuickAddExistingTag(tag)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#2a2a2a] hover:bg-[#353534] border border-white/[0.08] text-[11px] font-medium text-[#e5e2e1] max-w-full active:scale-95 transition-all"
                      >
                        <Plus className="w-2.5 h-2.5 text-[#4cd7f6] shrink-0" />
                        <span className="break-words">{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Block: Figuras & Bucles Guardados */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffb95f]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Figuras &amp; Bucles Guardados
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#201f1f] font-mono text-[11px] font-semibold text-[#ffb95f] tabular-nums">
              {savedLoops.length}
            </span>
          </div>

          {savedLoops.length > 0 ? (
            <div className="space-y-2">
              {savedLoops.map((loop) => {
                const isCurrent =
                  video.activeLoopId === loop.id ||
                  (!video.activeLoopId && video.loopMarker === loop.marker);
                const isEditing = editingLoopId === loop.id;
                const loopDur = Math.max(0, loop.pointB - loop.pointA).toFixed(1);

                return (
                  <div
                    key={loop.id}
                    onClick={() => {
                      if (!isEditing) handlePlaySavedLoop(loop);
                    }}
                    className={`p-3 rounded-xl border transition-all ${
                      isEditing ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                    } ${
                      isCurrent
                        ? 'bg-[#252020] border-[#ff5261]/50'
                        : 'bg-[#201f1f] border-white/[0.06] hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleConfirmRenameLoop(loop.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          autoFocus
                          maxLength={40}
                          value={loopNameDraft}
                          onChange={(e) => setLoopNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingLoopId(null);
                          }}
                          placeholder="Nombre de la figura o bucle..."
                          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-[#131313] border border-[#ffb95f]/60 text-xs text-[#e5e2e1] focus:outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Guardar nombre"
                          className="w-9 h-9 rounded-lg bg-[#ffb95f] text-[#472a00] flex items-center justify-center shrink-0 active:scale-95"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar"
                          onClick={() => setEditingLoopId(null)}
                          className="w-9 h-9 rounded-lg bg-[#2a2a2a] text-[#c8b6b6] flex items-center justify-center shrink-0 active:scale-95"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Repeat
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isCurrent ? 'text-[#ff5261]' : 'text-[#ffb95f]'
                              }`}
                            />
                            <span className="text-xs font-bold text-[#e5e2e1] break-words">
                              {loop.name}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-[#ff5261]/20 text-[#ffb3b3] font-mono text-[9px] font-bold uppercase">
                                Último
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[11px] text-[#c8b6b6] tabular-nums">
                            {loop.marker} · Δ {loopDur}s
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label={`Reproducir ${loop.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlaySavedLoop(loop);
                            }}
                            className="w-8 h-8 rounded-lg bg-[#ff5261]/15 hover:bg-[#ff5261]/25 text-[#ff5261] flex items-center justify-center active:scale-95"
                          >
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Renombrar ${loop.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRenameLoop(loop);
                            }}
                            className="w-8 h-8 rounded-lg bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center active:scale-95"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${loop.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSavedLoop(loop);
                            }}
                            className="w-8 h-8 rounded-lg bg-[#2a2a2a] hover:bg-[#93000a]/50 text-[#c8b6b6] hover:text-[#ffb4ab] flex items-center justify-center active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[#201f1f] flex items-start gap-2.5 text-xs text-[#c8b6b6]">
              <Bookmark className="w-4 h-4 text-[#ffb95f] shrink-0 mt-0.5" />
              <span>
                Sin bucles guardados todavía. Abre el reproductor, fija los
                puntos A y B y pulsa &quot;Guardar bucle&quot; para registrar
                figuras de este vídeo.
              </span>
            </div>
          )}
        </section>

        {/* Block: Registro de Vinculación & Práctica (actualizado a v2.3) */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#4cd7f6]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Registro de Vinculación &amp; Origen
              </h3>
            </div>
            <History className="w-4 h-4 text-[#c8b6b6]" />
          </div>

          <input
            ref={reassignInputRef}
            type="file"
            accept="video/*"
            onChange={handleReassignFile}
            className="hidden"
          />

          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-[#201f1f] space-y-2.5">
              <div className="flex items-start gap-3">
                {sourceType === 'youtube' ? (
                  <Youtube className="w-4 h-4 text-[#ff5261] mt-0.5 shrink-0" />
                ) : sourceType === 'instagram' ? (
                  <Instagram className="w-4 h-4 text-[#ffb95f] mt-0.5 shrink-0" />
                ) : (
                  <Video className="w-4 h-4 text-[#4cd7f6] mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                    {isExternalLink
                      ? 'Enlace externo guardado'
                      : 'Archivo de origen intacto'}
                  </p>
                  <p className="text-sm font-semibold text-[#e5e2e1] break-all mt-0.5">
                    {video.externalUrl || video.originalFileName}
                  </p>
                  <p className="text-xs text-[#c8b6b6] mt-0.5">
                    {isExternalLink
                      ? 'Guardado como referencia web sin ocupar memoria en tu dispositivo.'
                      : 'Renombrar en DanceVault nunca modifica el nombre real en tu galería.'}
                  </p>
                </div>
              </div>

              {isExternalLink && video.externalUrl && (
                <a
                  href={video.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-white/[0.06] text-[#4cd7f6] text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir enlace original</span>
                </a>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {isNativePlatform() ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={isReassigning}
                      onClick={() => void triggerReassignPicker('gallery')}
                      className="flex-1 h-10 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-white/[0.06] text-[#e5e2e1] text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-[#4cd7f6] shrink-0 ${
                          isReassigning ? 'animate-spin' : ''
                        }`}
                      />
                      <span className="truncate">
                        {isReassigning
                          ? 'Vinculando...'
                          : isExternalLink
                            ? 'Galería (local)'
                            : 'Reasignar (Galería)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isReassigning}
                      onClick={() => void triggerReassignPicker('files')}
                      className="h-10 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-white/[0.06] text-[#c8b6b6] text-xs font-semibold flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      <span>Archivos</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isReassigning}
                    onClick={() => void triggerReassignPicker('gallery')}
                    className="w-full h-10 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-white/[0.06] text-[#e5e2e1] text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[#4cd7f6] shrink-0 ${
                        isReassigning ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="truncate">
                      {isReassigning
                        ? 'Vinculando archivo...'
                        : isExternalLink
                          ? 'Sustituir por archivo local'
                          : 'Reasignar archivo de vídeo'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRelinkUrlDraft(video.externalUrl ?? '');
                    setRelinkUrlError('');
                    setRelinkingUrlOpen((prev) => !prev);
                  }}
                  className={`w-full h-10 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                    relinkingUrlOpen
                      ? 'bg-[#ffb95f]/20 border-[#ffb95f]/60 text-[#ffb95f]'
                      : 'bg-[#2a2a2a] hover:bg-[#353534] border-white/[0.06] text-[#e5e2e1]'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5 text-[#ffb95f] shrink-0" />
                  <span className="truncate">Re-vincular a un enlace</span>
                </button>
              </div>

              {relinkingUrlOpen && (
                <form
                  onSubmit={handleConfirmRelinkUrl}
                  className="p-3 rounded-xl bg-[#131313] border border-[#ffb95f]/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#ffb95f]">
                      Nuevo enlace de origen
                    </span>
                    {parsedRelink && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#201f1f] font-mono text-[10px] font-semibold text-[#4cd7f6]">
                        {parsedRelink.sourceType === 'youtube' ? (
                          <Youtube className="w-3 h-3 text-[#ff5261]" />
                        ) : parsedRelink.sourceType === 'instagram' ? (
                          <Instagram className="w-3 h-3 text-[#ffb95f]" />
                        ) : (
                          <Globe className="w-3 h-3 text-[#4cd7f6]" />
                        )}
                        <span>
                          {parsedRelink.sourceType === 'youtube'
                            ? parsedRelink.isShortOrReel
                              ? 'YouTube Short'
                              : 'YouTube'
                            : parsedRelink.sourceType === 'instagram'
                              ? 'Instagram Reel'
                              : 'URL directa'}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center h-10 px-3 rounded-xl bg-[#201f1f] border border-white/10 focus-within:border-[#ffb95f]/70">
                    <Globe className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0 mr-2" />
                    <input
                      type="url"
                      autoFocus
                      value={relinkUrlDraft}
                      onChange={(e) => {
                        setRelinkUrlDraft(e.target.value);
                        if (relinkUrlError) setRelinkUrlError('');
                      }}
                      placeholder="https://youtube.com/... o https://instagram.com/reel/..."
                      className="flex-1 min-w-0 bg-transparent text-xs text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none"
                    />
                    {relinkUrlDraft.length > 0 && (
                      <button
                        type="button"
                        aria-label="Limpiar URL"
                        onClick={() => {
                          setRelinkUrlDraft('');
                          setRelinkUrlError('');
                        }}
                        className="w-6 h-6 rounded-full bg-[#131313] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {relinkUrlError && (
                    <p className="text-[11px] text-[#ffb4ab] leading-snug">
                      {relinkUrlError}
                    </p>
                  )}

                  {!relinkUrlError &&
                    relinkUrlDraft.trim().length > 0 &&
                    !parsedRelink && (
                      <p className="text-[11px] text-[#c8b6b6] leading-snug">
                        Introduce un enlace válido de YouTube, Shorts, Instagram
                        Reel o vídeo directo (.mp4, .webm, .mov).
                      </p>
                    )}

                  <p className="text-[11px] text-[#c8b6b6]/80 leading-snug">
                    Mantiene tu título, etiquetas, notas y bucles guardados; solo
                    actualiza el enlace y la portada de origen.
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRelinkingUrlOpen(false);
                        setRelinkUrlError('');
                      }}
                      className="h-9 px-3 rounded-lg bg-[#2a2a2a] text-xs font-semibold text-[#c8b6b6] hover:text-[#e5e2e1]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!parsedRelink || relinkingUrlBusy}
                      className="h-9 px-4 rounded-lg bg-[#ffb95f] text-[#472a00] text-xs font-bold flex items-center gap-1.5 disabled:opacity-45 active:scale-95 transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {relinkingUrlBusy ? 'Guardando...' : 'Guardar enlace'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#201f1f]">
              <Link2 className="w-4 h-4 text-[#ffb95f] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                  Instancia de vídeo vinculado en DanceVault
                </p>
                <p className="text-sm font-semibold text-[#e5e2e1] break-words mt-0.5">
                  {video.name}
                </p>
                <p className="text-xs text-[#c8b6b6] mt-0.5">
                  {video.importedAtLabel
                    ? `${video.importedAtLabel} · `
                    : ''}
                  {isExternalLink
                    ? '0 B en dispositivo · Referencia online directa'
                    : '0 B adicionales duplicados · Enlazado directamente al vídeo original'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#201f1f] space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Calendar className="w-4 h-4 text-[#4cd7f6] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                      Fecha de creación de instancia
                    </p>
                    <p className="font-mono text-xs font-semibold text-[#e5e2e1] mt-0.5 tabular-nums truncate">
                      {formatCreationDateLabel(createdAtMs)}
                    </p>
                  </div>
                </div>

                {!editingDate && (
                  <button
                    type="button"
                    aria-label="Editar fecha de creación de instancia"
                    onClick={() => {
                      setDateDraft(toDateTimeLocalInputValue(createdAtMs));
                      setDateError('');
                      setEditingDate(true);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
                  >
                    <Pencil className="w-3 h-3 text-[#ffb95f]" />
                    <span>Editar</span>
                  </button>
                )}
              </div>

              {editingDate && (
                <form
                  onSubmit={handleSaveCreatedAt}
                  className="pt-2 border-t border-white/[0.06] space-y-2"
                >
                  <input
                    type="datetime-local"
                    aria-label="Fecha y hora de creación de instancia"
                    value={dateDraft}
                    onChange={(e) => {
                      setDateDraft(e.target.value);
                      if (dateError) setDateError('');
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-[#131313] border border-[#ffb95f]/60 font-mono text-xs text-[#e5e2e1] [color-scheme:dark] focus:outline-none focus:border-[#ffb95f]"
                  />
                  {dateError && (
                    <p className="text-[11px] text-[#ffb4ab]">{dateError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDate(false);
                        setDateError('');
                      }}
                      className="h-8 px-3 rounded-lg bg-[#2a2a2a] text-xs font-semibold text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar</span>
                    </button>
                    <button
                      type="submit"
                      className="h-8 px-3.5 rounded-lg bg-[#ffb95f] text-[#472a00] text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Block: Ubicación & Organización */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffb95f]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Ubicación &amp; Organización
              </h3>
            </div>
            <FolderOpen className="w-4 h-4 text-[#c8b6b6]" />
          </div>

          <div className="bg-[#201f1f] p-3 rounded-xl flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ffb95f]/15 text-[#ffb95f] flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                Ruta dentro de la biblioteca
              </span>
              <div className="flex items-center flex-wrap gap-1 text-[11px] leading-snug mt-1">
                <span className="font-medium text-[#c8b6b6] break-words">
                  {library.name}
                </span>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight className="w-3 h-3 text-[#ac8888] shrink-0" />
                    <span
                      className={
                        idx === breadcrumbs.length - 1
                          ? 'font-semibold text-[#ffb3b3] break-words'
                          : 'text-[#c8b6b6] break-words'
                      }
                    >
                      {crumb.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onMove(video)}
            className="w-full h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-[0.98] transition-all"
          >
            <Scissors className="w-4 h-4 text-[#ffb95f]" />
            <span>Cortar</span>
          </button>
        </section>

        {/* Block: Ficha Técnica del Archivo */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ac8888]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Ficha Técnica del Archivo
              </h3>
            </div>
            <HardDrive className="w-4 h-4 text-[#c8b6b6]" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-left">
            <div className="p-3 rounded-xl bg-[#201f1f]">
              <p className="font-mono text-[10px] text-[#c8b6b6] uppercase tracking-wider">
                Formato &amp; Duración
              </p>
              <p className="font-mono text-xs font-semibold text-[#e5e2e1] mt-1 tabular-nums">
                {containerFormat} • {video.duration}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#201f1f]">
              <p className="font-mono text-[10px] text-[#c8b6b6] uppercase tracking-wider">
                Resolución nativa
              </p>
              <p className="font-mono text-xs font-semibold text-[#e5e2e1] mt-1 tabular-nums">
                {resolutionDetail}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#201f1f]">
              <p className="font-mono text-[10px] text-[#c8b6b6] uppercase tracking-wider">
                Peso original
              </p>
              <p className="font-mono text-xs font-semibold text-[#e5e2e1] mt-1 tabular-nums">
                {video.sizeLabel}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#201f1f]">
              <p className="font-mono text-[10px] text-[#c8b6b6] uppercase tracking-wider">
                Tasa de cuadros
              </p>
              <p className="font-mono text-xs font-semibold text-[#4cd7f6] mt-1 tabular-nums">
                {video.fps ?? '60.00 FPS'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#131313] text-[#c8b6b6] border border-white/[0.04]">
            <ShieldCheck className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed">
              {sourceType === 'youtube'
                ? 'Enlace externo de YouTube: se reproduce sin ocupar almacenamiento en tu dispositivo mediante el reproductor integrado y conserva su miniatura oficial.'
                : sourceType === 'instagram'
                  ? 'Enlace externo de Instagram Reel: se reproduce mediante vista incrustada de Instagram sin descargar el vídeo ni duplicar espacio.'
                  : sourceType === 'direct-url'
                    ? 'Enlace directo de vídeo: se reproduce desde la URL externa (.mp4/.webm/.mov) sin duplicar espacio en el dispositivo.'
                    : video.nativeFilePath
                      ? 'Vínculo directo al archivo original (sin duplicar): DanceVault no copia el vídeo ni puede borrar o modificar el archivo real en tu dispositivo; solo gestiona esta instancia.'
                      : 'Vinculación local sin duplicado: referencia directa al archivo original sin copiarlo. En navegador web el acceso al archivo se limita a la sesión; en Android (APK) el vínculo es permanente.'}
            </span>
          </div>
        </section>

        {/* Rehearsal Notes & Teaching Cues */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffb95f]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Notas de Ensayo &amp; Correcciones
              </h3>
            </div>
            {!editingNote && (
              <button
                type="button"
                aria-label="Editar nota de ensayo"
                onClick={() => {
                  setNoteDraft(video.note ?? '');
                  setEditingNote(true);
                }}
                className="min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all"
              >
                <NotebookPen className="w-4 h-4" />
              </button>
            )}
          </div>

          {editingNote ? (
            <div className="space-y-2.5">
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Anota tiempos musicales, marco de brazos, pie de salida o correcciones..."
                className="w-full p-3 rounded-xl bg-[#131313] border border-[#ffb95f]/50 text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none focus:border-[#ffb95f]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingNote(false)}
                  className="h-9 px-3.5 rounded-xl bg-[#2a2a2a] text-xs font-semibold text-[#c8b6b6] hover:text-[#e5e2e1]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="h-9 px-4 rounded-xl bg-[#ffb95f] text-[#472a00] text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar nota</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                setNoteDraft(video.note ?? '');
                setEditingNote(true);
              }}
              className="p-3.5 rounded-xl bg-[#201f1f] text-sm text-[#e5e2e1] leading-relaxed cursor-pointer hover:bg-[#2a2a2a] transition-colors"
            >
              {video.note && video.note.trim().length > 0 ? (
                <>
                  <p className="italic">"{video.note}"</p>
                  <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#c8b6b6]">
                    <span>
                      {video.noteUpdatedAt
                        ? `Editado: ${video.noteUpdatedAt}`
                        : 'Toca para editar nota'}
                    </span>
                    <span className="text-[#ffb95f] font-medium">Editar</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-[#c8b6b6]">
                  Sin notas todavía. Toca aquí para añadir apuntes de ensayo o
                  correcciones técnicas.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Action Deck / Bottom Operations */}
        <div className="pt-1 space-y-2.5">
          <button
            type="button"
            onClick={() => onPlay(video)}
            className="w-full h-14 px-4 rounded-xl bg-[#ff5261] text-[#131313] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/20 active:scale-[0.98] transition-transform font-bold text-sm"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Abrir en Reproductor de Estudio</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleOpenTagEditor}
              className="h-11 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
            >
              <Tag className="w-4 h-4 text-[#4cd7f6]" />
              <span>Añadir etiqueta</span>
            </button>

            <button
              type="button"
              onClick={() => onDuplicate(video.id)}
              className="h-11 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
            >
              <Copy className="w-4 h-4 text-[#ffb3b3]" />
              <span>Duplicar (BIS)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onDelete(video.id);
              onClose();
            }}
            className="w-full h-12 rounded-xl bg-[#201f1f] hover:bg-[#93000a]/25 text-[#ffb4ab] flex items-center justify-center gap-2 text-xs font-semibold active:scale-[0.98] transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span>Mover a la papelera</span>
          </button>
        </div>
      </div>
    </div>
  );
};
