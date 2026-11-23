import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  Bookmark,
  Check,
  ChevronRight,
  ExternalLink,
  Flag,
  FlipHorizontal2,
  Folder,
  Gauge,
  Image as ImageIcon,
  Instagram,
  Layers,
  Maximize2,
  Minimize2,
  Monitor,
  MoreVertical,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
  Smartphone,
  Star,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
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
  buildNextLoopName,
  formatLoopMarker,
  formatLoopTimecode as formatTimecode,
  getVideoSavedLoops,
  parseDurationToSeconds,
  parseLoopMarkerRange,
} from '../utils/loopUtils';
import {
  fetchInstagramInfo,
  fetchYouTubeOEmbedInfo,
  getInstagramCanonicalReelUrl,
  getInstagramEmbedUrl,
} from '../utils/videoLinkUtils';
import {
  loadYouTubeIframeApi,
  YTPlayerInstance,
} from '../utils/youtubePlayerApi';
import { useBackHandler } from '../utils/backNavigation';
import {
  isNativePlatform,
  openInstagramViewerNative,
  shouldUseAnonymousCors,
  useResolvedVideoUrl,
} from '../utils/nativeMediaStorage';
import { shareVideoEntry } from '../utils/videoShareUtils';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';

interface VideoPlayerModalProps {
  video: VideoEntry;
  library: LibraryItem;
  allEntries: ExplorerEntry[];
  queueVideos?: VideoEntry[];
  onSelectQueueVideo?: (videoId: string) => void;
  onClose: () => void;
  onNavigateFolder: (libraryId: string, folderId: string | null) => void;
  onToggleFavorite: (videoId: string) => void;
  onOpenDetails: (video: VideoEntry) => void;
  onOpenCoverPicker: (video: VideoEntry) => void;
  onSaveLoopMarker: (
    videoId: string,
    loopMarker: string,
    loopActive?: boolean
  ) => void;
  onUpdateMetadata: (
    videoId: string,
    updates: VideoMetadataUpdates,
    options?: { silent?: boolean }
  ) => void;
  onShowToast: (msg: string) => void;
}

const SPEED_OPTIONS = [
  { speed: 1.0, label: 'x1.0', sub: 'Normal' },
  { speed: 0.5, label: 'x0.5', sub: 'Cámara lenta' },
  { speed: 0.25, label: 'x0.25', sub: 'Super slow' },
  { speed: 0.1, label: 'x0.1', sub: 'Detalle paso' },
] as const;



export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  video,
  library,
  allEntries,
  queueVideos,
  onSelectQueueVideo,
  onClose,
  onNavigateFolder,
  onToggleFavorite,
  onOpenDetails,
  onOpenCoverPicker,
  onSaveLoopMarker,
  onUpdateMetadata,
  onShowToast,
}) => {
  const sourceType = video.sourceType ?? 'local';
  const resolvedVideoUrl = useResolvedVideoUrl(video);
  const isYouTube = sourceType === 'youtube' && Boolean(video.externalId);
  const isInstagram = sourceType === 'instagram' && Boolean(video.externalId);
  const canShareVideo = sourceType !== 'youtube' && sourceType !== 'instagram';

  const handleShareFromPlayer = async () => {
    const result = await shareVideoEntry(video);
    if (result.status !== 'cancelled') {
      onShowToast(result.message);
    }
  };

  const parsedDuration = useMemo(
    () => parseDurationToSeconds(video.duration),
    [video.duration]
  );

  const initialLoop = useMemo(
    () => parseLoopMarkerRange(video.loopMarker, parsedDuration),
    [parsedDuration, video.loopMarker]
  );
  const initialLoopEnabled = Boolean(
    video.loopMarker && video.loopActive !== false
  );
  const initialStartTime = initialLoopEnabled ? initialLoop.a : 0;

  const [duration, setDuration] = useState<number>(parsedDuration);
  const [currentTime, setCurrentTime] = useState<number>(initialStartTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [manualMuteOverride, setManualMuteOverride] = useState<boolean | null>(
    null
  );
  const [isMirrored, setIsMirrored] = useState<boolean>(false);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(initialLoopEnabled);
  const [pointA, setPointA] = useState<number>(initialLoop.a);
  const [pointB, setPointB] = useState<number>(initialLoop.b);
  const [quickMenuOpen, setQuickMenuOpen] = useState<boolean>(false);
  const [stageFullscreen, setStageFullscreen] = useState<boolean>(false);
  const [fsHudVisible, setFsHudVisible] = useState<boolean>(true);
  const [fsPanel, setFsPanel] = useState<
    'none' | 'speed' | 'loop' | 'queue' | 'more'
  >('none');
  const [centerFeedback, setCenterFeedback] = useState<'play' | 'pause' | null>(
    null
  );
  const [coverFailed, setCoverFailed] = useState<boolean>(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [localVideoError, setLocalVideoError] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState<boolean>(false);
  const [tagDraft, setTagDraft] = useState<string>('');
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [loopNameDraft, setLoopNameDraft] = useState<string>('');
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<number | null>(
    () => {
      if (sourceType === 'instagram') return 9 / 16;
      if (
        sourceType === 'youtube' &&
        video.externalUrl &&
        video.externalUrl.toLowerCase().includes('/shorts/')
      ) {
        return 9 / 16;
      }
      return null;
    }
  );
  const [aspectOverride, setAspectOverride] = useState<
    'auto' | 'portrait' | 'landscape'
  >('auto');
  const runningNative = useMemo(() => isNativePlatform(), []);
  const [igStageMode, setIgStageMode] = useState<'integrated' | 'embed'>(() =>
    isNativePlatform() ? 'integrated' : 'embed'
  );
  const [igOpening, setIgOpening] = useState<boolean>(false);
  const [igLiveCoverUrl, setIgLiveCoverUrl] = useState<string>('');

  const igReelUrl = useMemo(() => {
    if (video.externalUrl && /^https?:\/\//i.test(video.externalUrl)) {
      return video.externalUrl;
    }
    if (video.externalId) {
      return getInstagramCanonicalReelUrl(video.externalId);
    }
    return '';
  }, [video.externalId, video.externalUrl]);

  const handleOpenInstagramViewer = async () => {
    if (!igReelUrl || igOpening) return;
    setIgOpening(true);
    try {
      const res = await openInstagramViewerNative({
        url: igReelUrl,
        title: video.name,
        mirrored: isMirrored,
      });
      if (res.opened) {
        setIsMirrored(res.mirrored);
      } else {
        setIgStageMode('embed');
        onShowToast('No se pudo abrir el visor integrado; usando embed web.');
      }
    } finally {
      setIgOpening(false);
    }
  };

  useEffect(() => {
    const initial =
      sourceType === 'instagram'
        ? 9 / 16
        : sourceType === 'youtube' &&
            video.externalUrl &&
            video.externalUrl.toLowerCase().includes('/shorts/')
          ? 9 / 16
          : null;
    setDetectedAspectRatio(initial);
    setAspectOverride('auto');
    setLocalVideoError(null);
    setIgStageMode(runningNative ? 'integrated' : 'embed');
    setIgOpening(false);
    setIgLiveCoverUrl('');

    if (sourceType === 'youtube' && video.externalUrl) {
      let cancelled = false;
      fetchYouTubeOEmbedInfo(video.externalUrl).then((info) => {
        if (cancelled || !info?.width || !info?.height) return;
        setDetectedAspectRatio(info.width / info.height);
      });
      return () => {
        cancelled = true;
      };
    }

    if (sourceType === 'instagram' && runningNative && !video.coverUrl && igReelUrl) {
      let cancelled = false;
      fetchInstagramInfo(igReelUrl).then((info) => {
        if (cancelled || !info?.coverUrl) return;
        setIgLiveCoverUrl(info.coverUrl);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [video.id, resolvedVideoUrl, video.externalUrl, video.coverUrl, igReelUrl, runningNative, sourceType]);

  const effectiveAspectRatio = useMemo(() => {
    if (aspectOverride === 'portrait') return 9 / 16;
    if (aspectOverride === 'landscape') return 16 / 9;
    if (detectedAspectRatio && Number.isFinite(detectedAspectRatio)) {
      return Math.max(0.45, Math.min(2.4, detectedAspectRatio));
    }
    return 16 / 9;
  }, [aspectOverride, detectedAspectRatio]);

  const isVerticalStage = effectiveAspectRatio < 0.95;

  const handleToggleAspectOrientation = () => {
    setAspectOverride((prev) => {
      if (prev === 'auto') {
        return isVerticalStage ? 'landscape' : 'portrait';
      }
      return 'auto';
    });
  };

  const savedLoops = useMemo(
    () => getVideoSavedLoops(video, duration),
    [video, duration]
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytMountRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef<boolean>(false);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fsTrackRef = useRef<HTMLDivElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const draggingScrubberRef = useRef<boolean>(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const fsAutoHideTimerRef = useRef<number | null>(null);
  const pendingInitialSeekRef = useRef<number | null>(
    initialLoopEnabled ? initialLoop.a : null
  );
  const lastVideoIdRef = useRef<string>(video.id);
  const lastExternalLoopSigRef = useRef<string>(
    `${video.id}|${video.activeLoopId ?? ''}|${video.loopMarker ?? ''}|${video.loopActive ?? ''}`
  );
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const loopEnabledRef = useRef<boolean>(loopEnabled);
  loopEnabledRef.current = loopEnabled;
  const pointARef = useRef<number>(pointA);
  pointARef.current = pointA;
  const pointBRef = useRef<number>(pointB);
  pointBRef.current = pointB;

  const isAudioMuted =
    manualMuteOverride !== null ? manualMuteOverride : playbackSpeed < 1.0;

  const playbackSpeedRef = useRef<number>(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const isAudioMutedRef = useRef<boolean>(isAudioMuted);
  isAudioMutedRef.current = isAudioMuted;
  const durationRef = useRef<number>(duration);
  durationRef.current = duration;
  const videoLoopMarkerRef = useRef<string | undefined>(video.loopMarker);
  videoLoopMarkerRef.current = video.loopMarker;
  const videoDurationLabelRef = useRef<string>(video.duration);
  videoDurationLabelRef.current = video.duration;
  const onUpdateMetadataRef = useRef(onUpdateMetadata);
  onUpdateMetadataRef.current = onUpdateMetadata;

  // Reset player state when switching videos (e.g. via queue)
  useEffect(() => {
    if (lastVideoIdRef.current === video.id) return;
    lastVideoIdRef.current = video.id;
    lastExternalLoopSigRef.current = `${video.id}|${video.activeLoopId ?? ''}|${video.loopMarker ?? ''}|${video.loopActive ?? ''}`;

    const nextDur = parseDurationToSeconds(video.duration);
    const nextLoop = parseLoopMarkerRange(video.loopMarker, nextDur);
    const nextLoopEnabled = Boolean(
      video.loopMarker && video.loopActive !== false
    );
    const startAt = nextLoopEnabled ? nextLoop.a : 0;

    setDuration(nextDur);
    setPointA(nextLoop.a);
    setPointB(nextLoop.b);
    setLoopEnabled(nextLoopEnabled);
    setCurrentTime(startAt);
    setCoverFailed(false);
    setYtError(null);
    ytReadyRef.current = false;
    setIsPlaying(true);
    setEditingLoopId(null);
    setLoopNameDraft('');
    pendingInitialSeekRef.current = nextLoopEnabled ? nextLoop.a : null;
    if (isYouTube && playbackSpeed < 0.25) {
      setPlaybackSpeed(0.25);
    }

    const el = videoRef.current;
    if (el && el.readyState >= 1) {
      const effectiveDur =
        Number.isFinite(el.duration) && el.duration > 0 ? el.duration : nextDur;
      const syncedLoop = parseLoopMarkerRange(video.loopMarker, effectiveDur);
      const target = nextLoopEnabled
        ? Math.max(0, Math.min(effectiveDur, syncedLoop.a))
        : 0;
      el.currentTime = target;
      setCurrentTime(target);
      pendingInitialSeekRef.current = null;
    }
  }, [
    isYouTube,
    playbackSpeed,
    video.id,
    video.duration,
    video.loopMarker,
    video.loopActive,
    video.activeLoopId,
  ]);

  // Sync external loop selection/deletion changes (e.g. from VideoDetailsModal opened on top)
  useEffect(() => {
    const sig = `${video.id}|${video.activeLoopId ?? ''}|${video.loopMarker ?? ''}|${video.loopActive ?? ''}`;
    if (lastExternalLoopSigRef.current === sig) return;
    lastExternalLoopSigRef.current = sig;

    if (!video.loopMarker) {
      loopEnabledRef.current = false;
      setLoopEnabled(false);
      return;
    }

    const el = videoRef.current;
    const effDur =
      el && Number.isFinite(el.duration) && el.duration > 0
        ? el.duration
        : duration;
    const synced = parseLoopMarkerRange(video.loopMarker, effDur);
    const nextEnabled = video.loopActive !== false;

    pointARef.current = synced.a;
    pointBRef.current = synced.b;
    loopEnabledRef.current = nextEnabled;
    setPointA(synced.a);
    setPointB(synced.b);
    setLoopEnabled(nextEnabled);

    if (nextEnabled) {
      setIsPlaying(true);
      setCurrentTime(synced.a);
      if (isYouTube) {
        if (ytPlayerRef.current && ytReadyRef.current) {
          pendingInitialSeekRef.current = null;
          ytPlayerRef.current.seekTo(synced.a, true);
          ytPlayerRef.current.playVideo();
        } else {
          pendingInitialSeekRef.current = synced.a;
        }
      } else if (el && el.readyState >= 1) {
        pendingInitialSeekRef.current = null;
        el.currentTime = synced.a;
        el.playbackRate = playbackSpeed;
        el.muted = isAudioMuted;
        el.play().catch(() => {
          // Ignore autoplay promise rejections inside preview
        });
      } else if (resolvedVideoUrl) {
        pendingInitialSeekRef.current = synced.a;
      }
    }
  }, [
    duration,
    isAudioMuted,
    isYouTube,
    playbackSpeed,
    video.activeLoopId,
    video.id,
    video.loopActive,
    video.loopMarker,
    resolvedVideoUrl,
  ]);

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

  const triggerCenterFeedback = (state: 'play' | 'pause') => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setCenterFeedback(state);
    feedbackTimerRef.current = window.setTimeout(() => {
      setCenterFeedback(null);
      feedbackTimerRef.current = null;
    }, 360);
  };

  const seekTo = (nextTime: number) => {
    pendingInitialSeekRef.current = null;
    const clamped = Math.max(0, Math.min(duration, nextTime));
    setCurrentTime(clamped);
    if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
      videoRef.current.currentTime = clamped;
    }
    if (isYouTube && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(clamped, true);
      } catch {
        // Ignore YT seek error if player is tearing down
      }
    }
  };

  const attemptInitialSeekAndPlay = (el: HTMLVideoElement): boolean => {
    const target = pendingInitialSeekRef.current;
    if (target === null) return false;
    if (el.readyState < 1) return true;

    const effDur =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const clampedTarget = Math.max(0, Math.min(effDur, target));

    if (Math.abs(el.currentTime - clampedTarget) <= 0.35) {
      pendingInitialSeekRef.current = null;
      setCurrentTime(clampedTarget);
      if (isPlayingRef.current) {
        el.playbackRate = playbackSpeed;
        el.muted = isAudioMuted;
        el.play().catch(() => {
          // Ignore autoplay promise rejections inside preview
        });
      }
      return false;
    }

    if (!el.paused) {
      el.pause();
    }
    try {
      el.currentTime = clampedTarget;
    } catch {
      // Wait for loadeddata/canplay if browser is not seekable yet
    }
    setCurrentTime(clampedTarget);
    return true;
  };

  // Sync HTML5 video element properties
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackSpeed;
    el.muted = isAudioMuted;
    if (isPlaying) {
      if (pendingInitialSeekRef.current !== null) {
        attemptInitialSeekAndPlay(el);
      } else {
        el.play().catch(() => {
          // Ignore autoplay promise rejections inside preview
        });
      }
    } else {
      el.pause();
    }
  }, [duration, isAudioMuted, isPlaying, playbackSpeed, video.id, resolvedVideoUrl]);

  // YouTube IFrame API lifecycle for YouTube / Shorts external videos
  useEffect(() => {
    if (!isYouTube || !video.externalId) return;
    const ytVideoId = video.externalId;
    let cancelled = false;
    let playerInstance: YTPlayerInstance | null = null;
    ytReadyRef.current = false;

    const mountNode = ytMountRef.current;
    if (!mountNode) return;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !ytMountRef.current) return;
        const hostEl = document.createElement('div');
        hostEl.className = 'w-full h-full';
        ytMountRef.current.innerHTML = '';
        ytMountRef.current.appendChild(hostEl);

        playerInstance = new YT.Player(hostEl, {
          videoId: ytVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: isPlayingRef.current ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              ytPlayerRef.current = event.target;
              ytReadyRef.current = true;

              const ytDur = event.target.getDuration();
              let effectiveDur = durationRef.current;
              if (Number.isFinite(ytDur) && ytDur > 0) {
                effectiveDur = ytDur;
                setDuration(ytDur);
                const label = `${Math.floor(ytDur / 60)}:${String(
                  Math.floor(ytDur % 60)
                ).padStart(2, '0')}`;
                if (
                  videoDurationLabelRef.current === '0:00' ||
                  videoDurationLabelRef.current === 'Enlace' ||
                  videoDurationLabelRef.current === 'Enlace YT'
                ) {
                  onUpdateMetadataRef.current(
                    video.id,
                    { duration: label },
                    { silent: true }
                  );
                }
              }

              const ytRate =
                playbackSpeedRef.current < 0.25 ? 0.25 : playbackSpeedRef.current;
              event.target.setPlaybackRate(ytRate);
              if (isAudioMutedRef.current) {
                event.target.mute();
              } else {
                event.target.unMute();
              }

              if (pendingInitialSeekRef.current !== null) {
                const syncedLoop = parseLoopMarkerRange(
                  videoLoopMarkerRef.current,
                  effectiveDur
                );
                pointARef.current = syncedLoop.a;
                pointBRef.current = syncedLoop.b;
                setPointA(syncedLoop.a);
                setPointB(syncedLoop.b);
                const target = Math.max(
                  0,
                  Math.min(effectiveDur, syncedLoop.a)
                );
                pendingInitialSeekRef.current = null;
                setCurrentTime(target);
                event.target.seekTo(target, true);
              }

              if (isPlayingRef.current) {
                event.target.playVideo();
              } else {
                event.target.pauseVideo();
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (event.data === 0) {
                if (
                  loopEnabledRef.current &&
                  pointBRef.current > pointARef.current + 0.2
                ) {
                  event.target.seekTo(pointARef.current, true);
                } else {
                  event.target.seekTo(0, true);
                }
                event.target.playVideo();
              } else if (event.data === 1) {
                if (!isPlayingRef.current) setIsPlaying(true);
              } else if (event.data === 2) {
                if (isPlayingRef.current) setIsPlaying(false);
              }
            },
            onError: () => {
              if (cancelled) return;
              setYtError(
                'Este vídeo de YouTube no permite reproducción incrustada o no está disponible.'
              );
            },
          },
        });
        ytPlayerRef.current = playerInstance;
      })
      .catch(() => {
        if (!cancelled) {
          setYtError(
            'No se pudo inicializar el reproductor de YouTube. Revisa tu conexión.'
          );
        }
      });

    return () => {
      cancelled = true;
      ytReadyRef.current = false;
      try {
        playerInstance?.destroy();
      } catch {
        // Ignore teardown errors
      }
      ytPlayerRef.current = null;
      if (mountNode) {
        mountNode.innerHTML = '';
      }
    };
  }, [isYouTube, video.externalId, video.id]);

  // Sync playback state, speed, and mute to active YouTube player
  useEffect(() => {
    if (!isYouTube || !ytPlayerRef.current || !ytReadyRef.current) return;
    try {
      const yt = ytPlayerRef.current;
      yt.setPlaybackRate(playbackSpeed < 0.25 ? 0.25 : playbackSpeed);
      if (isAudioMuted) {
        yt.mute();
      } else {
        yt.unMute();
      }
      if (isPlaying) {
        yt.playVideo();
      } else {
        yt.pauseVideo();
      }
    } catch {
      // Ignore transient YT API call error
    }
  }, [isAudioMuted, isPlaying, isYouTube, playbackSpeed, video.id]);

  // Poll YouTube playhead every 100ms for smooth scrubber & A-B loop jumps
  useEffect(() => {
    if (!isYouTube) return;
    const id = window.setInterval(() => {
      if (
        draggingScrubberRef.current ||
        pendingInitialSeekRef.current !== null ||
        !ytPlayerRef.current ||
        !ytReadyRef.current
      ) {
        return;
      }
      try {
        const t = ytPlayerRef.current.getCurrentTime();
        if (!Number.isFinite(t)) return;
        if (
          loopEnabledRef.current &&
          pointBRef.current > pointARef.current + 0.2
        ) {
          if (
            t >= pointBRef.current ||
            (isPlayingRef.current && t < pointARef.current - 0.35)
          ) {
            ytPlayerRef.current.seekTo(pointARef.current, true);
            setCurrentTime(pointARef.current);
            return;
          }
        }
        setCurrentTime(t);
      } catch {
        // Ignore transient YT poll error
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [isYouTube, video.id]);

  // Simulated playback clock for built-in sample videos (without videoUrl or external embed)
  useEffect(() => {
    if (resolvedVideoUrl || isYouTube || isInstagram || !isPlaying) return;
    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        let next = prev + dt * playbackSpeed;
        if (loopEnabled && pointB > pointA + 0.2) {
          if (next >= pointB || next < pointA) {
            next = pointA + ((next - pointA) % Math.max(0.2, pointB - pointA));
            if (next < pointA) next = pointA;
          }
        } else if (next >= duration) {
          next = 0;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    duration,
    isInstagram,
    isPlaying,
    isYouTube,
    loopEnabled,
    playbackSpeed,
    pointA,
    pointB,
    resolvedVideoUrl,
  ]);

  const handleTogglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    triggerCenterFeedback(next ? 'play' : 'pause');
  };

  const handleStepFrame = (direction: -1 | 1) => {
    setIsPlaying(false);
    seekTo(currentTime + direction * (1 / 30));
  };

  const handleSkipSeconds = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const handleScrubPointer = (
    clientX: number,
    customTrack?: HTMLDivElement | null
  ) => {
    const track = customTrack ?? trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  const updateLoopMetadataFromPlayer = (
    updates: VideoMetadataUpdates,
    toastMessage?: string
  ) => {
    const nextActiveLoopId =
      'activeLoopId' in updates ? updates.activeLoopId : video.activeLoopId;
    const nextLoopMarker =
      'loopMarker' in updates ? updates.loopMarker : video.loopMarker;
    const nextLoopActive =
      'loopActive' in updates ? updates.loopActive : video.loopActive;
    lastExternalLoopSigRef.current = `${video.id}|${nextActiveLoopId ?? ''}|${nextLoopMarker ?? ''}|${nextLoopActive ?? ''}`;
    onUpdateMetadata(video.id, updates, { silent: true });
    if (toastMessage) {
      onShowToast(toastMessage);
    }
  };

  const handleSetPointA = () => {
    const newA = Number(Math.min(currentTime, duration - 0.5).toFixed(1));
    pointARef.current = newA;
    setPointA(newA);
    if (pointB <= newA + 0.4) {
      const clampedB = Number(Math.min(duration, newA + 4).toFixed(1));
      pointBRef.current = clampedB;
      setPointB(clampedB);
    }
    loopEnabledRef.current = true;
    setLoopEnabled(true);
    if (video.loopMarker && video.loopActive === false) {
      updateLoopMetadataFromPlayer({ loopActive: true });
    }
    onShowToast(`Punto A fijado en ${formatTimecode(newA)}`);
  };

  const handleSetPointB = () => {
    const newB = Number(Math.max(currentTime, pointA + 0.5).toFixed(1));
    const clampedB = Math.min(duration, newB);
    pointBRef.current = clampedB;
    setPointB(clampedB);
    loopEnabledRef.current = true;
    setLoopEnabled(true);
    if (video.loopMarker && video.loopActive === false) {
      updateLoopMetadataFromPlayer({ loopActive: true });
    }
    onShowToast(`Punto B fijado en ${formatTimecode(clampedB)}`);
  };

  const handleSaveLoopCombo = () => {
    const marker = formatLoopMarker(pointA, pointB);
    const existing = savedLoops.find(
      (item) =>
        Math.abs(item.pointA - pointA) < 0.09 &&
        Math.abs(item.pointB - pointB) < 0.09
    );

    if (existing) {
      const normalizedLoops = savedLoops.map((item) =>
        item.id === existing.id ? { ...item, pointA, pointB, marker } : item
      );
      updateLoopMetadataFromPlayer(
        {
          savedLoops: normalizedLoops,
          loopMarker: marker,
          activeLoopId: existing.id,
          loopActive: loopEnabled,
        },
        `"${existing.name}" actualizado (${marker})`
      );
      return;
    }

    const newItem: SavedLoopItem = {
      id: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: buildNextLoopName(savedLoops),
      pointA,
      pointB,
      marker,
      createdAt: Date.now(),
    };
    const nextLoops = [...savedLoops, newItem];
    updateLoopMetadataFromPlayer(
      {
        savedLoops: nextLoops,
        loopMarker: newItem.marker,
        activeLoopId: newItem.id,
        loopActive: loopEnabled,
      },
      `"${newItem.name}" guardada (${marker})`
    );
  };

  const handleSelectSavedLoop = (item: SavedLoopItem) => {
    const maxDur = Math.max(1, duration);
    const clampedA = Math.max(0, Math.min(maxDur - 0.5, item.pointA));
    const clampedB = Math.max(clampedA + 0.5, Math.min(maxDur, item.pointB));
    const formattedMarker = formatLoopMarker(clampedA, clampedB);

    pointARef.current = clampedA;
    pointBRef.current = clampedB;
    loopEnabledRef.current = true;
    setPointA(clampedA);
    setPointB(clampedB);
    setLoopEnabled(true);
    setIsPlaying(true);

    pendingInitialSeekRef.current = null;
    setCurrentTime(clampedA);
    const el = videoRef.current;
    if (isYouTube) {
      if (ytPlayerRef.current && ytReadyRef.current) {
        ytPlayerRef.current.seekTo(clampedA, true);
        ytPlayerRef.current.playVideo();
      } else {
        pendingInitialSeekRef.current = clampedA;
      }
    } else if (el && Number.isFinite(el.duration)) {
      el.currentTime = clampedA;
      el.playbackRate = playbackSpeed;
      el.muted = isAudioMuted;
      el.play().catch(() => {
        // Ignore autoplay promise rejections inside preview
      });
    } else if (resolvedVideoUrl) {
      pendingInitialSeekRef.current = clampedA;
    }

    const normalizedLoops = savedLoops.map((l) =>
      l.id === item.id
        ? { ...l, pointA: clampedA, pointB: clampedB, marker: formattedMarker }
        : l
    );
    updateLoopMetadataFromPlayer(
      {
        savedLoops: normalizedLoops,
        loopMarker: formattedMarker,
        activeLoopId: item.id,
        loopActive: true,
      },
      `Bucle "${item.name}" activo`
    );
  };

  const handleStartRenameLoop = (item: SavedLoopItem) => {
    setEditingLoopId(item.id);
    setLoopNameDraft(item.name);
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
    updateLoopMetadataFromPlayer(
      { savedLoops: nextLoops },
      `Bucle renombrado a "${cleaned}"`
    );
    setEditingLoopId(null);
  };

  const handleDeleteSavedLoop = (item: SavedLoopItem) => {
    const nextLoops = savedLoops.filter((l) => l.id !== item.id);
    const wasCurrent =
      video.activeLoopId === item.id ||
      (!video.activeLoopId && video.loopMarker === item.marker);

    if (wasCurrent) {
      const nextActive = nextLoops[nextLoops.length - 1];
      if (nextActive) {
        updateLoopMetadataFromPlayer(
          {
            savedLoops: nextLoops,
            loopMarker: nextActive.marker,
            activeLoopId: nextActive.id,
            loopActive: loopEnabled,
          },
          `"${item.name}" eliminado`
        );
      } else {
        loopEnabledRef.current = false;
        setLoopEnabled(false);
        updateLoopMetadataFromPlayer(
          {
            savedLoops: [],
            loopMarker: undefined,
            activeLoopId: undefined,
            loopActive: false,
          },
          `"${item.name}" eliminado`
        );
      }
    } else {
      updateLoopMetadataFromPlayer(
        { savedLoops: nextLoops },
        `"${item.name}" eliminado`
      );
    }
    if (editingLoopId === item.id) {
      setEditingLoopId(null);
    }
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

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateMetadata(video.id, {
      tags: video.tags.filter((t) => t !== tagToRemove),
    });
  };

  const resetFsAutoHideTimer = () => {
    if (fsAutoHideTimerRef.current !== null) {
      window.clearTimeout(fsAutoHideTimerRef.current);
      fsAutoHideTimerRef.current = null;
    }
    if (
      stageFullscreen &&
      isPlaying &&
      fsPanel === 'none' &&
      !draggingScrubberRef.current
    ) {
      fsAutoHideTimerRef.current = window.setTimeout(() => {
        setFsHudVisible(false);
        fsAutoHideTimerRef.current = null;
      }, 4500);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs =
        document.fullscreenElement === stageContainerRef.current;
      setStageFullscreen(isNativeFs);
      setFsHudVisible(true);
      if (!isNativeFs) {
        setFsPanel('none');
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    if (!stageFullscreen) {
      if (fsAutoHideTimerRef.current !== null) {
        window.clearTimeout(fsAutoHideTimerRef.current);
        fsAutoHideTimerRef.current = null;
      }
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setStageFullscreen(false);
        setFsPanel('none');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stageFullscreen]);

  useEffect(() => {
    if (!stageFullscreen || !fsHudVisible) return;
    if (!isPlaying || fsPanel !== 'none' || draggingScrubberRef.current) {
      if (fsAutoHideTimerRef.current !== null) {
        window.clearTimeout(fsAutoHideTimerRef.current);
        fsAutoHideTimerRef.current = null;
      }
      return;
    }
    fsAutoHideTimerRef.current = window.setTimeout(() => {
      setFsHudVisible(false);
      fsAutoHideTimerRef.current = null;
    }, 4500);
    return () => {
      if (fsAutoHideTimerRef.current !== null) {
        window.clearTimeout(fsAutoHideTimerRef.current);
        fsAutoHideTimerRef.current = null;
      }
    };
  }, [stageFullscreen, fsHudVisible, isPlaying, fsPanel]);

  const exitFullscreenSync = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setStageFullscreen(false);
    setFsPanel('none');
    setFsHudVisible(true);
  };

  useBackHandler(stageFullscreen, exitFullscreenSync, 55);
  useBackHandler(addingTag, () => setAddingTag(false), 56);
  useBackHandler(Boolean(editingLoopId), () => setEditingLoopId(null), 56);
  useBackHandler(fsPanel !== 'none', () => setFsPanel('none'), 57);
  useBackHandler(quickMenuOpen, () => setQuickMenuOpen(false), 58);

  const handleFullscreenToggle = () => {
    if (stageContainerRef.current && document.fullscreenEnabled) {
      if (!document.fullscreenElement && !stageFullscreen) {
        setFsHudVisible(true);
        setFsPanel('none');
        stageContainerRef.current
          .requestFullscreen()
          .then(() => {
            setStageFullscreen(true);
          })
          .catch(() => {
            setStageFullscreen((v) => !v);
          });
      } else {
        exitFullscreenSync();
      }
      return;
    }
    setStageFullscreen((v) => {
      const next = !v;
      setFsHudVisible(true);
      if (!next) setFsPanel('none');
      return next;
    });
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const pointAPct = duration > 0 ? (pointA / duration) * 100 : 0;
  const pointBPct = duration > 0 ? (pointB / duration) * 100 : 100;
  const loopZoneWidthPct = Math.max(0, pointBPct - pointAPct);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#131313] text-[#e5e2e1] flex flex-col overflow-y-auto"
      onClick={() => quickMenuOpen && setQuickMenuOpen(false)}
    >
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-[#131313]/90 backdrop-blur-xl border-b border-white/[0.06] pt-safe">
        <div className="max-w-3xl mx-auto h-16 px-4 flex items-center justify-between gap-3">
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
              Estudio Reproductor
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

      <div className="max-w-3xl w-full mx-auto px-4 pt-3 pb-safe-10 space-y-4">
        {/* Sub-header Breadcrumb & Quick Menu */}
        <div className="flex items-start justify-between gap-2">
          <nav
            aria-label="Ruta de exploración"
            className="flex flex-wrap items-center gap-1 flex-1 min-w-0"
          >
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateFolder(library.id, null);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c8b6b6] text-[11px] leading-tight font-medium max-w-full text-left transition-colors"
            >
              <Folder className="w-3 h-3 text-[#ffb95f] shrink-0" />
              <span className="break-words">{library.name}</span>
            </button>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="w-3 h-3 text-[#ac8888] shrink-0" />
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateFolder(library.id, crumb.id);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] leading-tight max-w-full text-left transition-colors ${
                      isLast
                        ? 'bg-[#ff5261] text-[#400009] font-bold shadow-sm'
                        : 'bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c8b6b6] font-medium'
                    }`}
                  >
                    {isLast && <Folder className="w-3 h-3 shrink-0" />}
                    <span className="break-words">{crumb.name}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Menú de opciones"
              onClick={(e) => {
                e.stopPropagation();
                setQuickMenuOpen((prev) => !prev);
              }}
              className="h-9 px-2.5 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center active:scale-95 transition-transform"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {quickMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-11 z-40 w-52 rounded-xl bg-[#353534] border border-white/10 shadow-2xl p-1.5 flex flex-col gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    onOpenDetails(video);
                  }}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-[#e5e2e1] hover:bg-[#201f1f]"
                >
                  <BarChart2 className="w-4 h-4 text-[#4cd7f6]" />
                  <span>Detalles</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickMenuOpen(false);
                    onOpenCoverPicker(video);
                  }}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-[#e5e2e1] hover:bg-[#201f1f]"
                >
                  <ImageIcon className="w-4 h-4 text-[#ffb95f]" />
                  <span>Cambiar portada</span>
                </button>
                {canShareVideo && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      void handleShareFromPlayer();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-[#e5e2e1] hover:bg-[#201f1f]"
                  >
                    <Share2 className="w-4 h-4 text-[#ffb95f]" />
                    <span>
                      {sourceType === 'direct-url'
                        ? 'Compartir enlace'
                        : 'Compartir vídeo'}
                    </span>
                  </button>
                )}
                {!isInstagram && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickMenuOpen(false);
                      handleSaveLoopCombo();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-[#e5e2e1] hover:bg-[#201f1f]"
                  >
                    <Bookmark className="w-4 h-4 text-[#ffb3b3]" />
                    <span>Guardar bucle A-B</span>
                  </button>
                )}
                {video.externalUrl && (
                  <a
                    href={video.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setQuickMenuOpen(false)}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-[#4cd7f6] hover:bg-[#201f1f]"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Abrir enlace original</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Video Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xl font-bold text-[#e5e2e1] tracking-tight truncate">
              {video.name}
            </h3>
            {isYouTube && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff5261]/15 text-[#ffb3b3] font-mono text-[10px] font-bold shrink-0">
                <Youtube className="w-3 h-3" />
                <span>YT</span>
              </span>
            )}
            {isInstagram && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e1306c]/20 text-[#ffb3b3] font-mono text-[10px] font-bold shrink-0">
                <Instagram className="w-3 h-3" />
                <span>REEL</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleAspectOrientation}
              title="Cambiar formato de ventana (Vertical / Horizontal)"
              aria-label="Cambiar formato de pantalla entre vertical y horizontal"
              className={`h-8 px-2.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1.5 border transition-colors active:scale-95 ${
                aspectOverride !== 'auto'
                  ? 'bg-[#4cd7f6]/20 border-[#4cd7f6]/50 text-[#4cd7f6]'
                  : 'bg-[#201f1f] border-white/[0.08] text-[#c8b6b6] hover:text-[#e5e2e1]'
              }`}
            >
              {isVerticalStage ? (
                <Smartphone className="w-3.5 h-3.5 text-[#4cd7f6]" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-[#ffb95f]" />
              )}
              <span>{isVerticalStage ? '9:16' : '16:9'}</span>
            </button>

            {queueVideos && queueVideos.length > 1 && onSelectQueueVideo && (
              <span className="font-mono text-[11px] font-semibold text-[#ffb95f] bg-[#201f1f] px-2.5 py-1 rounded-full shrink-0 tabular-nums">
                {queueVideos.findIndex((v) => v.id === video.id) + 1} /{' '}
                {queueVideos.length}
              </span>
            )}
          </div>
        </div>

        {/* Video Player Stage (Dynamic Vertical / Horizontal / Square Container) */}
        <div className="w-full rounded-xl overflow-hidden bg-[#080808] border border-white/[0.06] flex items-center justify-center shadow-2xl">
          <div
            ref={stageContainerRef}
            onClick={() => {
              if (isInstagram || (isYouTube && ytError)) {
                return;
              }
              if (stageFullscreen) {
                if (!fsHudVisible) {
                  setFsHudVisible(true);
                  resetFsAutoHideTimer();
                  return;
                }
                if (fsPanel !== 'none') {
                  setFsPanel('none');
                  resetFsAutoHideTimer();
                  return;
                }
                handleTogglePlay();
                setFsHudVisible(true);
                resetFsAutoHideTimer();
                return;
              }
              handleTogglePlay();
            }}
            style={
              stageFullscreen
                ? undefined
                : {
                    aspectRatio: String(effectiveAspectRatio),
                    width: `min(100%, calc(${isVerticalStage ? '60dvh' : '56dvh'} * ${effectiveAspectRatio.toFixed(4)}))`,
                  }
            }
            className={`relative overflow-hidden bg-[#0e0e0e] flex items-center justify-center select-none ${
              isInstagram ? '' : 'cursor-pointer'
            } group ${
              stageFullscreen
                ? 'fixed inset-0 z-50 rounded-none w-screen h-screen'
                : 'max-w-full'
            }`}
          >
            {resolvedVideoUrl ? (
              localVideoError ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-full flex flex-col items-center justify-center gap-3 p-5 text-center bg-[#1c1b1b]"
                >
                  <Monitor className="w-10 h-10 text-[#ff5261]" />
                  <p className="text-xs text-[#e5e2e1] max-w-xs leading-relaxed">
                    {localVideoError}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalVideoError(null);
                        setIsPlaying(true);
                      }}
                      className="h-9 px-3.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reintentar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDetails(video)}
                      className="h-9 px-3.5 rounded-xl bg-[#ff5261] text-[#131313] text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>Reasignar archivo</span>
                    </button>
                  </div>
                </div>
              ) : (
              <video
                key={`${video.id}|${shouldUseAnonymousCors(resolvedVideoUrl) ? 'cors' : 'plain'}`}
                ref={videoRef}
                src={resolvedVideoUrl}
                crossOrigin={
                  shouldUseAnonymousCors(resolvedVideoUrl)
                    ? 'anonymous'
                    : undefined
                }
                playsInline
                loop={!loopEnabled}
                onError={() => {
                  setIsPlaying(false);
                  setLocalVideoError(
                    'No se pudo reproducir este archivo de vídeo en el visor interno. Prueba a reintentar o reasignar el archivo desde la galería o archivos.'
                  );
                }}
                onLoadedMetadata={(e) => {
                  setLocalVideoError(null);
                  const el = e.currentTarget;
                  if (el.videoWidth > 0 && el.videoHeight > 0) {
                    setDetectedAspectRatio(el.videoWidth / el.videoHeight);
                  }
                  const dur = el.duration;
                  const effectiveDur =
                    Number.isFinite(dur) && dur > 0 ? dur : duration;
                  if (Number.isFinite(dur) && dur > 0) {
                    setDuration(dur);
                  }
                if (pendingInitialSeekRef.current !== null) {
                  const syncedLoop = parseLoopMarkerRange(
                    video.loopMarker,
                    effectiveDur
                  );
                  setPointA(syncedLoop.a);
                  setPointB(syncedLoop.b);
                  const target = Math.max(
                    0,
                    Math.min(effectiveDur, syncedLoop.a)
                  );
                  pendingInitialSeekRef.current = target;
                  attemptInitialSeekAndPlay(el);
                  return;
                }
                if (isPlayingRef.current) {
                  el.playbackRate = playbackSpeed;
                  el.muted = isAudioMuted;
                  el.play().catch(() => {
                    // Ignore autoplay promise rejections inside preview
                  });
                }
              }}
              onLoadedData={(e) => {
                if (pendingInitialSeekRef.current !== null) {
                  attemptInitialSeekAndPlay(e.currentTarget);
                }
              }}
              onCanPlay={(e) => {
                if (pendingInitialSeekRef.current !== null) {
                  attemptInitialSeekAndPlay(e.currentTarget);
                }
              }}
              onSeeked={(e) => {
                if (pendingInitialSeekRef.current !== null) {
                  attemptInitialSeekAndPlay(e.currentTarget);
                }
              }}
              onTimeUpdate={(e) => {
                if (draggingScrubberRef.current) return;
                if (
                  pendingInitialSeekRef.current !== null ||
                  e.currentTarget.seeking
                ) {
                  return;
                }
                const t = e.currentTarget.currentTime;
                if (
                  loopEnabledRef.current &&
                  pointBRef.current > pointARef.current + 0.2
                ) {
                  if (
                    t >= pointBRef.current ||
                    (isPlayingRef.current && t < pointARef.current - 0.25)
                  ) {
                    e.currentTarget.currentTime = pointARef.current;
                    setCurrentTime(pointARef.current);
                    return;
                  }
                }
                setCurrentTime(t);
              }}
              style={{
                transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
              }}
              className="w-full h-full object-contain transition-transform duration-300"
            />
              )
          ) : isYouTube && video.externalId ? (
            ytError ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full h-full flex flex-col items-center justify-center gap-3 p-5 text-center bg-[#1c1b1b]"
              >
                <Youtube className="w-10 h-10 text-[#ff5261]" />
                <p className="text-xs text-[#e5e2e1] max-w-xs leading-relaxed">
                  {ytError}
                </p>
                {video.externalUrl && (
                  <a
                    href={video.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-4 rounded-xl bg-[#ff5261] text-[#131313] text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir en YouTube</span>
                  </a>
                )}
              </div>
            ) : (
              <div
                style={{
                  transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
                }}
                className="w-full h-full transition-transform duration-300 pointer-events-none"
              >
                <div ref={ytMountRef} key={video.id} className="w-full h-full" />
              </div>
            )
          ) : isInstagram && video.externalId ? (
            igStageMode === 'embed' ? (
              <div
                style={{
                  transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
                }}
                className="w-full h-full transition-transform duration-300"
              >
                <iframe
                  key={video.id}
                  src={getInstagramEmbedUrl(video.externalId)}
                  title={video.name}
                  referrerPolicy="no-referrer"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0 bg-black"
                />
              </div>
            ) : (
              <div className="relative w-full h-full bg-[#131313] flex items-center justify-center overflow-hidden">
                {(video.coverUrl || igLiveCoverUrl) && !coverFailed ? (
                  <img
                    src={video.coverUrl || igLiveCoverUrl}
                    alt={video.name}
                    referrerPolicy="no-referrer"
                    onError={() => setCoverFailed(true)}
                    style={{
                      transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
                    }}
                    className="w-full h-full object-cover transition-transform duration-300"
                  />
                ) : (
                  <VideoCoverPlaceholder sourceType="instagram" size="lg" />
                )}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/50" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIgStageMode('embed');
                  }}
                  className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#0e0e0e]/80 backdrop-blur-md border border-white/10 font-mono text-[10px] font-semibold text-[#c8b6b6] hover:text-[#e5e2e1] transition-colors"
                >
                  Probar embed
                </button>

                <div className="relative z-10 flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <button
                    type="button"
                    disabled={igOpening}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleOpenInstagramViewer();
                    }}
                    className="px-5 py-3 rounded-2xl bg-[#ff5261] hover:bg-[#ff6673] text-[#131313] font-bold text-xs sm:text-sm inline-flex items-center gap-2 shadow-2xl active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {igOpening
                        ? 'Abriendo visor...'
                        : 'Reproducir Reel aquí'}
                    </span>
                  </button>
                  <p className="font-mono text-[10px] text-[#e5e2e1]/85 bg-[#0e0e0e]/70 px-2.5 py-1 rounded-lg">
                    Visor integrado DanceVault · Con Espejo
                  </p>
                </div>
              </div>
            )
          ) : video.coverUrl && !coverFailed ? (
            <img
              src={video.coverUrl}
              alt={video.name}
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setDetectedAspectRatio(img.naturalWidth / img.naturalHeight);
                }
              }}
              onError={() => setCoverFailed(true)}
              style={{
                transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)',
              }}
              className="w-full h-full object-contain transition-transform duration-300"
            />
          ) : (
            <VideoCoverPlaceholder sourceType={sourceType} size="lg" />
          )}

          {/* Subtle gradient vignette */}
          {!isInstagram && (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25" />
          )}

          {/* Mirror Mode Active Badge */}
          {isMirrored && (
            <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#009eb9]/90 backdrop-blur-md text-[#002f38] font-mono text-[10px] font-bold flex items-center gap-1 shadow-md">
              <FlipHorizontal2 className="w-3.5 h-3.5" />
              <span>MODO ESPEJO ACTIVO</span>
            </div>
          )}

          {/* Loop Status Pill */}
          {loopEnabled && !isInstagram && (
            <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0e0e0e]/80 backdrop-blur-md font-mono text-[11px] font-semibold text-[#ffb95f]">
              <Repeat className="w-3.5 h-3.5" />
              <span>BUCLE A-B ON</span>
            </div>
          )}

          {/* Center Play/Pause Touch Overlay feedback */}
          {!isInstagram && !(isYouTube && ytError) && (!isPlaying || centerFeedback) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#131313]/70 backdrop-blur-md flex items-center justify-center text-[#e5e2e1] shadow-xl border border-white/10">
                {centerFeedback === 'play' ? (
                  <Play className="w-8 h-8 fill-current ml-0.5" />
                ) : centerFeedback === 'pause' || !isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : null}
              </div>
            </div>
          )}

          {/* Normal Mode Fullscreen Toggle */}
          {!stageFullscreen &&
            !(isInstagram && igStageMode === 'integrated') && (
              <button
                type="button"
                aria-label="Pantalla completa"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFullscreenToggle();
                }}
                className="absolute bottom-3 right-3 w-9 h-9 rounded-lg bg-[#0e0e0e]/75 backdrop-blur-md text-[#e5e2e1] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}

          {/* Fullscreen compact controls for Instagram Embed */}
          {stageFullscreen && isInstagram && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed fs-hud-top right-3 z-50 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setIsMirrored((v) => !v)}
                className={`h-9 px-3 rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-lg ${
                  isMirrored
                    ? 'bg-[#009eb9] text-[#002f38]'
                    : 'bg-[#0e0e0e]/80 text-[#e5e2e1]'
                }`}
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span>Espejo</span>
              </button>
              <button
                type="button"
                aria-label="Salir de pantalla completa"
                onClick={handleFullscreenToggle}
                className="h-9 w-9 rounded-lg bg-[#0e0e0e]/80 backdrop-blur-md text-[#e5e2e1] flex items-center justify-center shadow-lg"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Fullscreen Floating Bottom-Center Studio Controls HUD */}
          {stageFullscreen && !isInstagram && fsHudVisible && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                resetFsAutoHideTimer();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                resetFsAutoHideTimer();
              }}
              className="fixed fs-hud-bottom left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] max-w-xl pointer-events-auto"
            >
              {/* Expandable Studio Sub-Panel above the floating dock */}
              {fsPanel !== 'none' && (
                <div className="mb-2 bg-[#1c1b1b]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-3 space-y-2.5">
                  {fsPanel === 'speed' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5 text-[#ffb95f]" />
                          <span className="text-xs font-bold text-[#e5e2e1]">
                            Velocidad de Estudio
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setManualMuteOverride((prev) => !(prev ?? isAudioMuted))
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold ${
                            isAudioMuted
                              ? 'bg-[#93000a]/70 text-[#ffdad6]'
                              : 'bg-[#2a2a2a] text-[#4cd7f6]'
                          }`}
                        >
                          {isAudioMuted ? (
                            <>
                              <VolumeX className="w-3 h-3" />
                              <span>
                                {playbackSpeed < 1
                                  ? 'Mudo en slow-mo'
                                  : 'Silenciado'}
                              </span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>Audio ON</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0e0e0e] rounded-xl">
                        {SPEED_OPTIONS.map((opt) => {
                          const disabledForYt = isYouTube && opt.speed < 0.25;
                          const active = playbackSpeed === opt.speed;
                          return (
                            <button
                              key={opt.speed}
                              type="button"
                              disabled={disabledForYt}
                              onClick={() => {
                                if (disabledForYt) return;
                                setPlaybackSpeed(opt.speed);
                                setManualMuteOverride(null);
                              }}
                              className={`py-1.5 px-1 rounded-lg flex flex-col items-center justify-center transition-all ${
                                disabledForYt
                                  ? 'opacity-35 cursor-not-allowed text-[#c8b6b6]'
                                  : active
                                    ? 'bg-[#ffb95f] text-[#472a00] font-bold active:scale-95'
                                    : 'text-[#c8b6b6] hover:text-[#e5e2e1] active:scale-95'
                              }`}
                            >
                              <span className="font-mono text-xs font-bold">
                                {opt.label}
                              </span>
                              <span className="font-mono text-[9px] opacity-80">
                                {disabledForYt ? 'Solo local' : opt.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {fsPanel === 'loop' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Repeat className="w-3.5 h-3.5 text-[#ff5261]" />
                          <span className="text-xs font-bold text-[#e5e2e1]">
                            Bucle A-B de Ensayo
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={loopEnabled}
                          onClick={() => {
                            const next = !loopEnabled;
                            loopEnabledRef.current = next;
                            setLoopEnabled(next);
                            if (
                              next &&
                              (currentTime < pointA || currentTime >= pointB)
                            ) {
                              seekTo(pointA);
                            }
                            if (video.loopMarker) {
                              updateLoopMetadataFromPlayer({ loopActive: next });
                            }
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <span
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                              loopEnabled ? 'bg-[#ff5261]' : 'bg-[#353534]'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full bg-[#400009] shadow-sm transition-transform ${
                                loopEnabled
                                  ? 'translate-x-5'
                                  : 'translate-x-0 bg-[#c8b6b6]'
                              }`}
                            />
                          </span>
                          <span className="font-mono text-[10px] font-bold text-[#e5e2e1]">
                            {loopEnabled ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={handleSetPointA}
                          className="h-10 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center gap-2 active:scale-95 transition-all"
                        >
                          <span className="w-5 h-5 rounded bg-[#ffb95f] text-[#472a00] flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                            A
                          </span>
                          <div className="flex flex-col text-left min-w-0">
                            <span className="text-[11px] font-semibold truncate">
                              Fijar Punto A
                            </span>
                            <span className="font-mono text-[9px] text-[#c8b6b6] tabular-nums">
                              {formatTimecode(pointA)}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={handleSetPointB}
                          className="h-10 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center gap-2 active:scale-95 transition-all"
                        >
                          <span className="w-5 h-5 rounded bg-[#ffb95f] text-[#472a00] flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                            B
                          </span>
                          <div className="flex flex-col text-left min-w-0">
                            <span className="text-[11px] font-semibold truncate">
                              Fijar Punto B
                            </span>
                            <span className="font-mono text-[9px] text-[#c8b6b6] tabular-nums">
                              {formatTimecode(pointB)}
                            </span>
                          </div>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveLoopCombo}
                        className="w-full h-9 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                      >
                        <Bookmark className="w-3.5 h-3.5 text-[#ffb3b3]" />
                        <span>Guardar bucle actual</span>
                      </button>

                      {/* Saved Loops & Figures quick selector in Fullscreen */}
                      <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#ffb95f]">
                            Figuras &amp; Bucles Guardados ({savedLoops.length})
                          </span>
                        </div>
                        {savedLoops.length > 0 ? (
                          <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
                            {savedLoops.map((loop) => {
                              const isCurrent =
                                video.activeLoopId === loop.id ||
                                (!video.activeLoopId &&
                                  video.loopMarker === loop.marker);
                              const isEditing = editingLoopId === loop.id;

                              return (
                                <div
                                  key={loop.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isEditing) handleSelectSavedLoop(loop);
                                  }}
                                  className={`p-2 rounded-xl border transition-colors ${
                                    isEditing
                                      ? 'cursor-default'
                                      : 'cursor-pointer active:scale-[0.99]'
                                  } ${
                                    isCurrent
                                      ? 'bg-[#2a1f21] border-[#ff5261]/55'
                                      : 'bg-[#252424] border-white/[0.06] hover:bg-[#2f2e2e]'
                                  }`}
                                >
                                  {isEditing ? (
                                    <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        handleConfirmRenameLoop(loop.id);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-1.5"
                                    >
                                      <input
                                        type="text"
                                        autoFocus
                                        maxLength={40}
                                        value={loopNameDraft}
                                        onChange={(e) =>
                                          setLoopNameDraft(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape')
                                            setEditingLoopId(null);
                                        }}
                                        placeholder="Nombre de figura..."
                                        className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-[#131313] border border-[#ffb95f]/60 text-[11px] text-[#e5e2e1] focus:outline-none"
                                      />
                                      <button
                                        type="submit"
                                        aria-label="Guardar nombre"
                                        className="w-7 h-7 rounded-lg bg-[#ffb95f] text-[#472a00] flex items-center justify-center shrink-0"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Cancelar"
                                        onClick={() => setEditingLoopId(null)}
                                        className="w-7 h-7 rounded-lg bg-[#353534] text-[#c8b6b6] flex items-center justify-center shrink-0"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </form>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] font-bold text-[#e5e2e1] truncate">
                                            {loop.name}
                                          </span>
                                          {isCurrent && (
                                            <span className="px-1 py-0.2 rounded bg-[#ff5261]/25 text-[#ffb3b3] font-mono text-[8px] font-bold uppercase shrink-0">
                                              Activo
                                            </span>
                                          )}
                                        </div>
                                        <span className="block font-mono text-[9px] text-[#c8b6b6] tabular-nums">
                                          {loop.marker}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          aria-label={`Renombrar ${loop.name}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartRenameLoop(loop);
                                          }}
                                          className="w-7 h-7 rounded-lg bg-[#353534] hover:bg-[#434242] text-[#e5e2e1] flex items-center justify-center"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Eliminar ${loop.name}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSavedLoop(loop);
                                          }}
                                          className="w-7 h-7 rounded-lg bg-[#353534] hover:bg-[#93000a]/60 text-[#c8b6b6] hover:text-[#ffb4ab] flex items-center justify-center"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-[#ac8888]">
                            Sin bucles guardados aún. Fija A y B y pulsa &quot;Guardar bucle actual&quot;.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {fsPanel === 'queue' &&
                    queueVideos &&
                    queueVideos.length > 1 &&
                    onSelectQueueVideo && (
                      <div className="space-y-1.5">
                        <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#c8b6b6]">
                          Vídeos del conjunto ({queueVideos.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {queueVideos.map((qv, idx) => {
                            const active = qv.id === video.id;
                            return (
                              <button
                                key={qv.id}
                                type="button"
                                onClick={() => {
                                  onSelectQueueVideo(qv.id);
                                  setFsPanel('none');
                                }}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors max-w-full truncate ${
                                  active
                                    ? 'bg-[#ff5261] text-[#400009]'
                                    : 'bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#e5e2e1]'
                                }`}
                              >
                                {idx + 1}. {qv.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {fsPanel === 'more' && (
                    <div className="grid grid-cols-1 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying(false);
                          exitFullscreenSync();
                          onOpenDetails(video);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#e5e2e1] hover:bg-[#2a2a2a]"
                      >
                        <BarChart2 className="w-4 h-4 text-[#4cd7f6]" />
                        <span>Detalles</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exitFullscreenSync();
                          onOpenCoverPicker(video);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#e5e2e1] hover:bg-[#2a2a2a]"
                      >
                        <ImageIcon className="w-4 h-4 text-[#ffb95f]" />
                        <span>Cambiar portada</span>
                      </button>
                      {canShareVideo && (
                        <button
                          type="button"
                          onClick={() => {
                            setFsPanel('none');
                            void handleShareFromPlayer();
                          }}
                          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#e5e2e1] hover:bg-[#2a2a2a]"
                        >
                          <Share2 className="w-4 h-4 text-[#ffb95f]" />
                          <span>
                            {sourceType === 'direct-url'
                              ? 'Compartir enlace'
                              : 'Compartir vídeo'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Floating Bottom-Center Dock */}
              <div className="bg-[#1c1b1b]/90 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.8)] px-3 py-2.5 space-y-2">
                {/* Title & Timecode Header */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#e5e2e1] truncate">
                    {video.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums shrink-0">
                    {loopEnabled && (
                      <span className="text-[#ffb95f] font-bold">
                        Δ {Math.max(0, pointB - pointA).toFixed(1)}s
                      </span>
                    )}
                    <span>
                      <span className="text-[#ff5261] font-bold">
                        {formatTimecode(currentTime)}
                      </span>
                      <span className="text-[#c8b6b6]">
                        {' '}
                        / {formatTimecode(duration)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Fullscreen Scrubber Track */}
                <div
                  ref={fsTrackRef}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    draggingScrubberRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleScrubPointer(e.clientX, fsTrackRef.current);
                  }}
                  onPointerMove={(e) => {
                    if (!draggingScrubberRef.current) return;
                    e.stopPropagation();
                    handleScrubPointer(e.clientX, fsTrackRef.current);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    draggingScrubberRef.current = false;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    resetFsAutoHideTimer();
                  }}
                  className="relative w-full h-8 flex items-center select-none touch-none cursor-pointer"
                >
                  <div className="w-full h-2 rounded-full bg-[#353534] relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-[#5c3f40]/80 rounded-l-full"
                      style={{ width: `${progressPct}%` }}
                    />
                    {loopEnabled && (
                      <div
                        className="absolute top-0 bottom-0 bg-[#ee9800]/55"
                        style={{
                          left: `${pointAPct}%`,
                          width: `${loopZoneWidthPct}%`,
                        }}
                      />
                    )}
                  </div>

                  {loopEnabled && (
                    <div
                      style={{ left: `${pointAPct}%` }}
                      className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                    >
                      <div className="px-1 rounded bg-[#ffb95f] text-[#472a00] font-mono text-[9px] font-bold shadow">
                        A
                      </div>
                    </div>
                  )}

                  <div
                    style={{ left: `${progressPct}%` }}
                    className="absolute -translate-x-1/2 flex items-center justify-center z-10 pointer-events-none"
                  >
                    <div className="w-4 h-4 rounded-full bg-[#ff5261] shadow-md shadow-[#ff5261]/50 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#400009]" />
                    </div>
                  </div>

                  {loopEnabled && (
                    <div
                      style={{ left: `${pointBPct}%` }}
                      className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                    >
                      <div className="px-1 rounded bg-[#ffb95f] text-[#472a00] font-mono text-[9px] font-bold shadow">
                        B
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary Transport Row */}
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    aria-label="Retroceder 5 segundos"
                    onClick={() => handleSkipSeconds(-5)}
                    className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="font-mono text-[8px] text-[#c8b6b6] leading-none mt-0.5">
                      -5s
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Fotograma anterior"
                    onClick={() => handleStepFrame(-1)}
                    className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span className="font-mono text-[8px] text-[#c8b6b6] leading-none mt-0.5">
                      -1f
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    onClick={handleTogglePlay}
                    className="w-12 h-12 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center shadow-[0_0_20px_rgba(255,82,97,0.4)] active:scale-95 transition-transform"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label="Fotograma siguiente"
                    onClick={() => handleStepFrame(1)}
                    className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span className="font-mono text-[8px] text-[#c8b6b6] leading-none mt-0.5">
                      +1f
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Avanzar 5 segundos"
                    onClick={() => handleSkipSeconds(5)}
                    className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="font-mono text-[8px] text-[#c8b6b6] leading-none mt-0.5">
                      +5s
                    </span>
                  </button>
                </div>

                {/* Studio Tools Utility Row */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() =>
                      setFsPanel((prev) => (prev === 'speed' ? 'none' : 'speed'))
                    }
                    className={`h-8 px-2.5 rounded-lg font-mono text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      fsPanel === 'speed' || playbackSpeed < 1
                        ? 'bg-[#ffb95f] text-[#472a00]'
                        : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353534]'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span>x{playbackSpeed}</span>
                  </button>

                  <button
                    type="button"
                    aria-label={isAudioMuted ? 'Activar audio' : 'Silenciar audio'}
                    onClick={() =>
                      setManualMuteOverride((prev) => !(prev ?? isAudioMuted))
                    }
                    className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                      isAudioMuted
                        ? 'bg-[#93000a]/70 text-[#ffdad6]'
                        : 'bg-[#2a2a2a] text-[#4cd7f6] hover:bg-[#353534]'
                    }`}
                  >
                    {isAudioMuted ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMirrored((v) => !v)}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                      isMirrored
                        ? 'bg-[#009eb9] text-[#002f38]'
                        : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353534]'
                    }`}
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" />
                    <span>Espejo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFsPanel((prev) => (prev === 'loop' ? 'none' : 'loop'))
                    }
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                      fsPanel === 'loop' || loopEnabled
                        ? 'bg-[#ff5261] text-[#400009]'
                        : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353534]'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>Bucle A-B</span>
                  </button>

                  {queueVideos &&
                    queueVideos.length > 1 &&
                    onSelectQueueVideo && (
                      <button
                        type="button"
                        onClick={() =>
                          setFsPanel((prev) =>
                            prev === 'queue' ? 'none' : 'queue'
                          )
                        }
                        className={`h-8 px-2.5 rounded-lg font-mono text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                          fsPanel === 'queue'
                            ? 'bg-[#ffb95f] text-[#472a00]'
                            : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353534]'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>
                          {queueVideos.findIndex((v) => v.id === video.id) + 1}/
                          {queueVideos.length}
                        </span>
                      </button>
                    )}

                  <button
                    type="button"
                    aria-label={
                      video.favorite
                        ? 'Quitar de favoritos'
                        : 'Añadir a favoritos'
                    }
                    onClick={() => onToggleFavorite(video.id)}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                      video.favorite
                        ? 'bg-[#2a2a2a] text-[#ffb95f]'
                        : 'bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#ffb95f]'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        video.favorite ? 'fill-current' : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    aria-label="Más opciones en pantalla completa"
                    onClick={() =>
                      setFsPanel((prev) => (prev === 'more' ? 'none' : 'more'))
                    }
                    className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                      fsPanel === 'more'
                        ? 'bg-[#353534] text-[#ffb3b3]'
                        : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353534]'
                    }`}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Salir de pantalla completa"
                    onClick={handleFullscreenToggle}
                    className="h-8 w-8 rounded-lg bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center transition-colors"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Queue Strip (multi-video playback via Reproducir conjunto) */}
        {queueVideos && queueVideos.length > 1 && onSelectQueueVideo && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {queueVideos.map((qv) => {
              const active = qv.id === video.id;
              return (
                <button
                  key={qv.id}
                  type="button"
                  onClick={() => onSelectQueueVideo(qv.id)}
                  className={`px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#ff5261] text-[#400009]'
                      : 'bg-[#201f1f] text-[#c8b6b6] hover:text-[#e5e2e1]'
                  }`}
                >
                  {qv.name}
                </button>
              );
            })}
          </div>
        )}

        {isInstagram ? (
          <div className="space-y-3">
            <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#e1306c]/20 text-[#ffb3b3] flex items-center justify-center shrink-0">
                    <Instagram className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-[#e5e2e1]">
                      {runningNative
                        ? 'Visor integrado de Instagram'
                        : 'Instagram Reel incrustado'}
                    </h3>
                    <p className="text-xs text-[#c8b6b6] leading-relaxed">
                      {runningNative
                        ? 'Instagram bloquea el modo incrustado en muchos Reels musicales. Ábrelo en el Visor integrado para verlo dentro de DanceVault con modo Espejo (si algún Reel te pide sesión, puedes iniciarla una sola vez y quedará guardada).'
                        : 'Usa los controles propios del Reel en el visor. El modo Espejo, pantalla completa, favoritos, etiquetas y notas siguen activos. Para bucles A-B o cámara lenta exacta, sustitúyelo por archivo local desde Ficha Técnica.'}
                    </p>
                  </div>
                </div>
              </div>

              {runningNative ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={igOpening}
                    onClick={() => void handleOpenInstagramViewer()}
                    className="w-full h-11 px-4 rounded-xl bg-[#ff5261] hover:bg-[#ff6673] text-[#131313] flex items-center justify-center gap-2 text-xs sm:text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>
                      {igOpening
                        ? 'Abriendo visor...'
                        : 'Reproducir Reel aquí (Visor integrado)'}
                    </span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsMirrored((v) => !v)}
                      className={`h-11 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all ${
                        isMirrored
                          ? 'bg-[#009eb9] text-[#002f38]'
                          : 'bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1]'
                      }`}
                    >
                      <FlipHorizontal2
                        className={`w-4 h-4 ${isMirrored ? 'text-[#002f38]' : 'text-[#4cd7f6]'}`}
                      />
                      <span>Espejo (Mirror)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setIgStageMode((prev) =>
                          prev === 'integrated' ? 'embed' : 'integrated'
                        )
                      }
                      className="h-11 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                    >
                      <Instagram className="w-4 h-4 text-[#ffb3b3] shrink-0" />
                      <span>
                        {igStageMode === 'integrated'
                          ? 'Probar embed'
                          : 'Usar visor'}
                      </span>
                    </button>
                  </div>

                  {igReelUrl && (
                    <a
                      href={igReelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-10 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#4cd7f6] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>Abrir fuera (app Instagram / navegador)</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMirrored((v) => !v)}
                    className={`h-11 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all ${
                      isMirrored
                        ? 'bg-[#009eb9] text-[#002f38]'
                        : 'bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1]'
                    }`}
                  >
                    <FlipHorizontal2
                      className={`w-4 h-4 ${isMirrored ? 'text-[#002f38]' : 'text-[#4cd7f6]'}`}
                    />
                    <span>Espejo (Mirror)</span>
                  </button>

                  {igReelUrl && (
                    <a
                      href={igReelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#4cd7f6] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>Abrir Reel</span>
                    </a>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : (
          <>
            {/* Studio Scrubber & Loop Interval Section */}
            <section className="bg-[#201f1f] rounded-xl p-3.5 border border-white/[0.06] shadow-md space-y-1">
              {/* Time Readout */}
              <div className="flex items-center justify-between px-1 font-mono text-xs tabular-nums">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#ff5261] font-bold">
                    {formatTimecode(currentTime)}
                  </span>
                  <span className="text-[#c8b6b6]">/</span>
                  <span className="text-[#c8b6b6]">
                    {formatTimecode(duration)}
                  </span>
                </div>

                {loopEnabled && (
                  <span className="text-[#ffb95f] font-bold">
                    Δ {Math.max(0, pointB - pointA).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Interactive Heavy Scrubber Track */}
              <div
                ref={trackRef}
                onPointerDown={(e) => {
                  draggingScrubberRef.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleScrubPointer(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (!draggingScrubberRef.current) return;
                  handleScrubPointer(e.clientX);
                }}
                onPointerUp={(e) => {
                  draggingScrubberRef.current = false;
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                }}
                className="relative w-full h-11 flex items-center select-none touch-none cursor-pointer"
              >
                <div className="w-full h-3 rounded-full bg-[#353534] relative overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-[#5c3f40]/70 rounded-l-full"
                    style={{ width: `${progressPct}%` }}
                  />
                  {loopEnabled && (
                    <div
                      className="absolute top-0 bottom-0 bg-[#ee9800]/45"
                      style={{
                        left: `${pointAPct}%`,
                        width: `${loopZoneWidthPct}%`,
                      }}
                    />
                  )}
                </div>

                {/* Point A Flag */}
                {loopEnabled && (
                  <div
                    style={{ left: `${pointAPct}%` }}
                    className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <div className="px-1.5 py-0.5 rounded bg-[#ffb95f] text-[#472a00] font-mono text-[10px] font-bold shadow-md">
                      A
                    </div>
                    <div className="w-0.5 h-3.5 bg-[#ffb95f]" />
                  </div>
                )}

                {/* Playhead Needle */}
                <div
                  style={{ left: `${progressPct}%` }}
                  className="absolute -translate-x-1/2 flex items-center justify-center z-10 pointer-events-none"
                >
                  <div className="w-5 h-5 rounded-full bg-[#ff5261] shadow-lg shadow-[#ff5261]/40 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#400009]" />
                  </div>
                </div>

                {/* Point B Flag */}
                {loopEnabled && (
                  <div
                    style={{ left: `${pointBPct}%` }}
                    className="absolute -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <div className="px-1.5 py-0.5 rounded bg-[#ffb95f] text-[#472a00] font-mono text-[10px] font-bold shadow-md">
                      B
                    </div>
                    <div className="w-0.5 h-3.5 bg-[#ffb95f]" />
                  </div>
                )}
              </div>

              {/* A/B Time Stamp Readout */}
              <div className="flex items-center justify-between px-1 font-mono text-[11px] tabular-nums text-[#c8b6b6]">
                <button
                  type="button"
                  onClick={() => seekTo(pointA)}
                  className="text-[#ffb95f] flex items-center gap-1 hover:underline"
                >
                  <Flag className="w-3 h-3" />
                  <span>A: {formatTimecode(pointA)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => seekTo(pointB)}
                  className="text-[#ffb95f] flex items-center gap-1 hover:underline"
                >
                  <span>B: {formatTimecode(pointB)}</span>
                  <Flag className="w-3 h-3" />
                </button>
              </div>
            </section>

            {/* Primary One-Handed Transport Deck */}
            <div className="flex items-center justify-between px-2 pt-1">
              <button
                type="button"
                aria-label="Retroceder 5 segundos"
                onClick={() => handleSkipSeconds(-5)}
                className="w-12 h-12 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform shadow-sm border border-white/[0.05]"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="font-mono text-[9px] text-[#c8b6b6] mt-0.5">
                  -5s
                </span>
              </button>

              <button
                type="button"
                aria-label="Fotograma anterior"
                onClick={() => handleStepFrame(-1)}
                className="w-12 h-12 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform shadow-sm border border-white/[0.05]"
              >
                <SkipBack className="w-4 h-4" />
                <span className="font-mono text-[9px] text-[#c8b6b6] mt-0.5">
                  -1f
                </span>
              </button>

              <button
                type="button"
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                onClick={handleTogglePlay}
                className="w-16 h-16 rounded-full bg-[#ff5261] text-[#400009] flex items-center justify-center shadow-[0_0_24px_rgba(255,82,97,0.35)] active:scale-95 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                aria-label="Fotograma siguiente"
                onClick={() => handleStepFrame(1)}
                className="w-12 h-12 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform shadow-sm border border-white/[0.05]"
              >
                <SkipForward className="w-4 h-4" />
                <span className="font-mono text-[9px] text-[#c8b6b6] mt-0.5">
                  +1f
                </span>
              </button>

              <button
                type="button"
                aria-label="Avanzar 5 segundos"
                onClick={() => handleSkipSeconds(5)}
                className="w-12 h-12 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] flex flex-col items-center justify-center text-[#e5e2e1] active:scale-90 transition-transform shadow-sm border border-white/[0.05]"
              >
                <RotateCw className="w-4 h-4" />
                <span className="font-mono text-[9px] text-[#c8b6b6] mt-0.5">
                  +5s
                </span>
              </button>
            </div>

            {/* Studio Analysis Toolbox Panel */}
            <div className="space-y-3">
              {/* Tempo / Speed Hub */}
              <section className="bg-[#201f1f] rounded-xl p-3.5 border border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-[#ffb95f]" />
                    <span className="text-sm font-semibold text-[#e5e2e1]">
                      Velocidad de Estudio
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setManualMuteOverride((prev) => !(prev ?? isAudioMuted))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold transition-colors ${
                      isAudioMuted
                        ? 'bg-[#93000a]/60 text-[#ffdad6]'
                        : 'bg-[#2a2a2a] text-[#4cd7f6]'
                    }`}
                  >
                    {isAudioMuted ? (
                      <>
                        <VolumeX className="w-3 h-3" />
                        <span>
                          {playbackSpeed < 1
                            ? 'Audio mudo en slow-mo'
                            : 'Silenciado'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" />
                        <span>Audio sincronizado</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0e0e0e] rounded-xl select-none">
                  {SPEED_OPTIONS.map((opt) => {
                    const disabledForYt = isYouTube && opt.speed < 0.25;
                    const active = playbackSpeed === opt.speed;
                    return (
                      <button
                        key={opt.speed}
                        type="button"
                        disabled={disabledForYt}
                        onClick={() => {
                          if (disabledForYt) return;
                          setPlaybackSpeed(opt.speed);
                          setManualMuteOverride(null);
                        }}
                        className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all ${
                          disabledForYt
                            ? 'opacity-35 cursor-not-allowed text-[#c8b6b6]'
                            : active
                              ? 'bg-[#ffb95f] text-[#472a00] font-bold shadow-md active:scale-95'
                              : 'text-[#c8b6b6] hover:text-[#e5e2e1] active:scale-95'
                        }`}
                      >
                        <div className="flex items-center gap-1 font-mono text-xs font-bold">
                          <span>{opt.label}</span>
                          {opt.speed === 1.0 ? (
                            <Volume2
                              className={`w-3 h-3 ${
                                active ? 'text-[#472a00]' : 'text-[#4cd7f6]'
                              }`}
                            />
                          ) : (
                            <VolumeX className="w-3 h-3 opacity-80" />
                          )}
                        </div>
                        <span className="font-mono text-[9px] opacity-80 mt-0.5">
                          {disabledForYt ? 'Solo local' : opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* A-B Loop Controls & Studio Tools */}
              <section className="bg-[#201f1f] rounded-xl p-3.5 border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-[#ff5261]" />
                    <span className="text-sm font-semibold text-[#e5e2e1]">
                      Bucle A-B de Ensayo
                    </span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={loopEnabled}
                    onClick={() => {
                      const next = !loopEnabled;
                      loopEnabledRef.current = next;
                      setLoopEnabled(next);
                      if (
                        next &&
                        (currentTime < pointA || currentTime >= pointB)
                      ) {
                        seekTo(pointA);
                      }
                      if (video.loopMarker) {
                        updateLoopMetadataFromPlayer({ loopActive: next });
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <span
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                        loopEnabled ? 'bg-[#ff5261]' : 'bg-[#353534]'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full bg-[#400009] shadow-sm transition-transform ${
                          loopEnabled ? 'translate-x-5' : 'translate-x-0 bg-[#c8b6b6]'
                        }`}
                      />
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#e5e2e1] w-6 text-left">
                      {loopEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSetPointA}
                    className="h-12 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center gap-2.5 active:scale-95 transition-all"
                  >
                    <span className="w-6 h-6 rounded bg-[#ffb95f] text-[#472a00] flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      A
                    </span>
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-xs font-semibold truncate">
                        Fijar Punto A
                      </span>
                      <span className="font-mono text-[10px] text-[#c8b6b6]">
                        Marca inicio
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleSetPointB}
                    className="h-12 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center gap-2.5 active:scale-95 transition-all"
                  >
                    <span className="w-6 h-6 rounded bg-[#ffb95f] text-[#472a00] flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      B
                    </span>
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-xs font-semibold truncate">
                        Fijar Punto B
                      </span>
                      <span className="font-mono text-[10px] text-[#c8b6b6]">
                        Marca cierre
                      </span>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIsMirrored((v) => !v)}
                    className={`h-11 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all ${
                      isMirrored
                        ? 'bg-[#009eb9] text-[#002f38]'
                        : 'bg-[#1c1b1b] hover:bg-[#2a2a2a] text-[#e5e2e1]'
                    }`}
                  >
                    <FlipHorizontal2
                      className={`w-4 h-4 ${isMirrored ? 'text-[#002f38]' : 'text-[#4cd7f6]'}`}
                    />
                    <span>Espejo (Mirror)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveLoopCombo}
                    className="h-11 px-3 rounded-xl bg-[#1c1b1b] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                  >
                    <Bookmark className="w-4 h-4 text-[#ffb3b3]" />
                    <span>Guardar bucle</span>
                  </button>
                </div>
              </section>

              {/* Block: Figuras & Bucles Guardados */}
              <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ffb95f]" />
                    <h3 className="text-sm font-bold text-[#e5e2e1]">
                      Figuras y Bucles Guardados
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-[#201f1f] font-mono text-[11px] font-semibold text-[#ffb95f] tabular-nums">
                      {savedLoops.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveLoopCombo}
                    className="text-xs font-semibold text-[#4cd7f6] hover:underline flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Guardar actual</span>
                  </button>
                </div>

                {savedLoops.length > 0 ? (
                  <div className="space-y-2">
                    {savedLoops.map((loop) => {
                      const isCurrent =
                        video.activeLoopId === loop.id ||
                        (!video.activeLoopId && video.loopMarker === loop.marker);
                      const isEditing = editingLoopId === loop.id;
                      const loopDur = Math.max(
                        0,
                        loop.pointB - loop.pointA
                      ).toFixed(1);

                      return (
                        <div
                          key={loop.id}
                          onClick={() => {
                            if (!isEditing) handleSelectSavedLoop(loop);
                          }}
                          className={`p-3 rounded-xl border transition-all ${
                            isEditing
                              ? 'cursor-default'
                              : 'cursor-pointer active:scale-[0.99]'
                          } ${
                            isCurrent
                              ? 'bg-[#252020] border-[#ff5261]/55'
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
                                      {loopEnabled ? 'Activo' : 'Último'}
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
                  <p className="text-xs text-[#ac8888] leading-relaxed">
                    Aún no hay figuras o bucles guardados. Fija los puntos A y B y
                    pulsa &quot;Guardar bucle&quot; para estudiar varias figuras del
                    mismo vídeo.
                  </p>
                )}
              </section>
            </div>
          </>
        )}

        <div className="space-y-3">
          {/* Block: Etiquetas del Vídeo (idéntico a Ficha Técnica de Vídeo) */}
          <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
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

          {/* Choreographic Rehearsal Notes Card */}
          <section className="bg-[#201f1f] rounded-xl p-3.5 border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <NotebookPen className="w-4 h-4 text-[#ffb95f]" />
                <span className="text-sm font-semibold text-[#e5e2e1]">
                  Notas de Ensayo
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onOpenDetails(video);
                }}
                className="text-xs font-semibold text-[#4cd7f6] hover:underline"
              >
                Editar en Detalles
              </button>
            </div>
            <p className="text-xs text-[#c8b6b6] leading-relaxed">
              {video.note && video.note.trim().length > 0
                ? `"${video.note}"`
                : 'Sin notas todavía. Abre Detalles para guardar apuntes de compás, marco o correcciones.'}
            </p>
          </section>

          {/* Bottom Primary CTA matching VideoDetailsModal */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                onOpenDetails(video);
              }}
              className="w-full h-14 px-4 rounded-xl bg-[#ff5261] text-[#131313] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/20 active:scale-[0.98] transition-transform font-bold text-sm"
            >
              <BarChart2 className="w-5 h-5" />
              <span>Abrir Detalles del Vídeo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
