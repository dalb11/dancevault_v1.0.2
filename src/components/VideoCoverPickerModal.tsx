import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronFirst,
  ChevronLast,
  Crop,
  Film,
  FolderHeart,
  Lock,
  Maximize2,
  Move,
  RotateCcw,
  ZoomIn,
} from 'lucide-react';
import { VideoEntry } from '../types/dancevault';
import { useBackHandler } from '../utils/backNavigation';
import {
  shouldUseAnonymousCors,
  useResolvedVideoUrl,
} from '../utils/nativeMediaStorage';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';

interface VideoCoverPickerModalProps {
  video: VideoEntry;
  folderPathLabel: string;
  onClose: () => void;
  onSaveCover: (
    targetScope: 'video' | 'folder',
    coverUrl: string,
    timecodeLabel: string
  ) => void;
}

type FramingMode = 'crop' | 'contain';

const FPS = 60;
const STRIP_COUNT = 9;
const EXPORT_WIDTH = 480;
const EXPORT_HEIGHT = 360; // Compressed 4:3 target cover ratio used across cards & folders

const parseDurationSeconds = (duration: string): number => {
  const parts = duration.split(':').map((n) => parseInt(n, 10));
  if (parts.length === 2 && !parts.some(Number.isNaN)) {
    return Math.max(1, parts[0] * 60 + parts[1]);
  }
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return Math.max(1, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return 48;
};

const formatTimecode = (seconds: number): string => {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped % 1) * 100);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(centis)}`;
};

const formatShortTime = (seconds: number): string => {
  const clamped = Math.max(0, Math.round(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const VideoCoverPickerModal: React.FC<VideoCoverPickerModalProps> = ({
  video,
  folderPathLabel,
  onClose,
  onSaveCover,
}) => {
  useBackHandler(true, onClose, 65);
  const [realDurationSec, setRealDurationSec] = useState<number>(() =>
    parseDurationSeconds(video.duration)
  );
  const totalFrames = Math.max(1, Math.round(realDurationSec * FPS));
  const initialFrame = Math.min(totalFrames, Math.round(totalFrames * 0.25));

  const [frameIndex, setFrameIndex] = useState<number>(initialFrame);
  const [targetScope, setTargetScope] = useState<'video' | 'folder'>('video');
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string>(
    video.coverUrl
  );
  const resolvedVideoUrl = useResolvedVideoUrl(video);
  const [filmstripFrames, setFilmstripFrames] = useState<(string | null)[]>(() =>
    Array.from({ length: STRIP_COUNT }, () => null)
  );
  const [isExtractingStrip, setIsExtractingStrip] = useState(
    Boolean(resolvedVideoUrl)
  );
  const [isDraggingTrack, setIsDraggingTrack] = useState(false);

  // Interactive framing ("encuadre") state for portrait & landscape videos
  const [framingMode, setFramingMode] = useState<FramingMode>('crop');
  const [zoom, setZoom] = useState<number>(1);
  // Pan stored relative to crop box dimensions so DOM preview & 640x480 export match 1:1
  const [panRatio, setPanRatio] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: 16,
    h: 9,
  });
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 360,
    h: 340,
  });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const cropDragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoReadyRef = useRef(false);

  const currentSeconds = frameIndex / FPS;
  const currentTimecode = formatTimecode(currentSeconds);
  const totalTimecode = formatTimecode(realDurationSec);
  const progressRatio = totalFrames > 0 ? frameIndex / totalFrames : 0;

  const isPortraitFrame = naturalSize.h > naturalSize.w;

  // Observe stage container dimensions for pixel-exact crop framing
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute crop box dimensions inside the stage (4:3 target aspect)
  const cropGeometry = useMemo(() => {
    const padX = 28;
    const padY = 48;
    const availW = Math.max(160, stageSize.w - padX);
    const availH = Math.max(120, stageSize.h - padY);
    let cropW = availW;
    let cropH = cropW * (3 / 4);
    if (cropH > availH) {
      cropH = availH;
      cropW = cropH * (4 / 3);
    }

    const imgW = Math.max(1, naturalSize.w);
    const imgH = Math.max(1, naturalSize.h);

    if (framingMode === 'contain') {
      const containScale = Math.min(cropW / imgW, cropH / imgH);
      return {
        cropW,
        cropH,
        drawW: imgW * containScale,
        drawH: imgH * containScale,
        offsetX: 0,
        offsetY: 0,
        maxPanRatioX: 0,
        maxPanRatioY: 0,
      };
    }

    const baseScale = Math.max(cropW / imgW, cropH / imgH);
    const drawW = imgW * baseScale * zoom;
    const drawH = imgH * baseScale * zoom;
    const maxOffsetX = Math.max(0, (drawW - cropW) / 2);
    const maxOffsetY = Math.max(0, (drawH - cropH) / 2);
    const maxPanRatioX = maxOffsetX / cropW;
    const maxPanRatioY = maxOffsetY / cropH;

    const clampedRatioX = Math.max(-maxPanRatioX, Math.min(maxPanRatioX, panRatio.x));
    const clampedRatioY = Math.max(-maxPanRatioY, Math.min(maxPanRatioY, panRatio.y));

    return {
      cropW,
      cropH,
      drawW,
      drawH,
      offsetX: clampedRatioX * cropW,
      offsetY: clampedRatioY * cropH,
      maxPanRatioX,
      maxPanRatioY,
    };
  }, [framingMode, naturalSize.h, naturalSize.w, panRatio.x, panRatio.y, stageSize.h, stageSize.w, zoom]);

  // Clamp panRatio when zoom changes
  useEffect(() => {
    setPanRatio((prev) => ({
      x: Math.max(-cropGeometry.maxPanRatioX, Math.min(cropGeometry.maxPanRatioX, prev.x)),
      y: Math.max(-cropGeometry.maxPanRatioY, Math.min(cropGeometry.maxPanRatioY, prev.y)),
    }));
  }, [cropGeometry.maxPanRatioX, cropGeometry.maxPanRatioY]);

  // Extract 9 REAL frames along the actual video timeline
  useEffect(() => {
    if (!resolvedVideoUrl) {
      setIsExtractingStrip(false);
      setFilmstripFrames(
        Array.from({ length: STRIP_COUNT }, () => video.coverUrl || null)
      );
      return;
    }

    let cancelled = false;
    setIsExtractingStrip(true);
    setFilmstripFrames(Array.from({ length: STRIP_COUNT }, () => null));

    const stripProbe = document.createElement('video');
    stripProbe.preload = 'auto';
    stripProbe.muted = true;
    stripProbe.playsInline = true;
    if (shouldUseAnonymousCors(resolvedVideoUrl)) {
      stripProbe.crossOrigin = 'anonymous';
    }
    stripProbe.src = resolvedVideoUrl;

    const runExtraction = async () => {
      const dur =
        Number.isFinite(stripProbe.duration) && stripProbe.duration > 0
          ? stripProbe.duration
          : realDurationSec;

      const canvas = document.createElement('canvas');
      const vw = stripProbe.videoWidth || 320;
      const vh = stripProbe.videoHeight || 180;
      const targetW = 160;
      const targetH = Math.max(90, Math.round((targetW * vh) / vw));
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsExtractingStrip(false);
        return;
      }

      for (let i = 0; i < STRIP_COUNT; i++) {
        if (cancelled) return;
        const seekTime = Math.min(
          Math.max(0, dur - 0.04),
          Math.max(0.02, ((i + 0.5) / STRIP_COUNT) * dur)
        );

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            stripProbe.removeEventListener('seeked', onSeeked);
            resolve();
          };
          const onSeeked = () => {
            if (!cancelled) {
              try {
                ctx.drawImage(stripProbe, 0, 0, targetW, targetH);
                const thumbUrl = canvas.toDataURL('image/jpeg', 0.65);
                setFilmstripFrames((prev) => {
                  const next = [...prev];
                  next[i] = thumbUrl;
                  return next;
                });
              } catch {
                // Skip slot if browser blocks canvas readback
              }
            }
            finish();
          };
          stripProbe.addEventListener('seeked', onSeeked);
          window.setTimeout(finish, 1200);
          stripProbe.currentTime = seekTime;
        });
      }

      if (!cancelled) {
        setIsExtractingStrip(false);
      }
    };

    const onLoadedData = () => {
      stripProbe.removeEventListener('loadeddata', onLoadedData);
      if (!cancelled) {
        if (Number.isFinite(stripProbe.duration) && stripProbe.duration > 0) {
          setRealDurationSec(stripProbe.duration);
        }
        void runExtraction();
      }
    };

    const onStripError = () => {
      if (!cancelled) {
        setIsExtractingStrip(false);
        setFilmstripFrames(
          Array.from({ length: STRIP_COUNT }, () => video.coverUrl || null)
        );
      }
    };

    stripProbe.addEventListener('loadeddata', onLoadedData);
    stripProbe.addEventListener('error', onStripError);

    return () => {
      cancelled = true;
      stripProbe.removeEventListener('loadeddata', onLoadedData);
      stripProbe.removeEventListener('error', onStripError);
      stripProbe.removeAttribute('src');
      stripProbe.load();
    };
  }, [video.coverUrl, resolvedVideoUrl]);

  // Setup offscreen <video> probe for live frame-by-frame preview scrubbing
  useEffect(() => {
    if (!resolvedVideoUrl) return;
    videoReadyRef.current = false;
    const probe = document.createElement('video');
    probe.preload = 'auto';
    probe.muted = true;
    probe.playsInline = true;
    if (shouldUseAnonymousCors(resolvedVideoUrl)) {
      probe.crossOrigin = 'anonymous';
    }
    probe.src = resolvedVideoUrl;
    hiddenVideoRef.current = probe;

    const handleLoadedData = () => {
      videoReadyRef.current = true;
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setRealDurationSec(probe.duration);
      }
    };
    probe.addEventListener('loadeddata', handleLoadedData);

    return () => {
      probe.removeEventListener('loadeddata', handleLoadedData);
      videoReadyRef.current = false;
      hiddenVideoRef.current = null;
      probe.removeAttribute('src');
      probe.load();
    };
  }, [resolvedVideoUrl]);

  // Capture real frame via canvas whenever frameIndex changes on a real video
  useEffect(() => {
    const probe = hiddenVideoRef.current;
    if (!probe || !resolvedVideoUrl) return;

    let cancelled = false;

    const seekAndCapture = () => {
      if (cancelled || !videoReadyRef.current) return;
      const dur =
        Number.isFinite(probe.duration) && probe.duration > 0
          ? probe.duration
          : realDurationSec;
      const seekTo = Math.min(Math.max(0, currentSeconds), Math.max(0, dur - 0.02));

      const handleSeeked = () => {
        probe.removeEventListener('seeked', handleSeeked);
        if (cancelled) return;
        try {
          const vw = probe.videoWidth || 640;
          const vh = probe.videoHeight || 360;
          const maxDim = 600;
          const scale = Math.min(1, maxDim / Math.max(vw, vh));
          const w = Math.max(1, Math.round(vw * scale));
          const h = Math.max(1, Math.round(vh * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(probe, 0, 0, w, h);
            setCapturedPreviewUrl(canvas.toDataURL('image/jpeg', 0.72));
          }
        } catch {
          // Keep previous preview if browser restricts canvas readback
        }
      };

      probe.addEventListener('seeked', handleSeeked);
      probe.currentTime = seekTo;
    };

    const timer = window.setTimeout(() => {
      if (videoReadyRef.current) {
        seekAndCapture();
      } else {
        const onReady = () => {
          probe.removeEventListener('loadeddata', onReady);
          videoReadyRef.current = true;
          seekAndCapture();
        };
        probe.addEventListener('loadeddata', onReady);
      }
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentSeconds, realDurationSec, resolvedVideoUrl]);

  const activeStripIdx = Math.min(
    STRIP_COUNT - 1,
    Math.max(0, Math.floor(progressRatio * STRIP_COUNT))
  );

  const updateFrameFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setFrameIndex(Math.round(ratio * totalFrames));
  };

  const selectStripSlot = (slotIdx: number) => {
    const ratio = (slotIdx + 0.5) / STRIP_COUNT;
    setFrameIndex(Math.round(ratio * totalFrames));
  };

  const nudgeFrame = (delta: number) => {
    setFrameIndex((prev) => Math.min(totalFrames, Math.max(0, prev + delta)));
  };

  const handleResetFraming = () => {
    setZoom(1);
    setPanRatio({ x: 0, y: 0 });
  };

  // Bake the user's exact framing (crop + pan + zoom or full contain) into a 4:3 cover JPEG
  const renderFramedCoverDataUrl = async (): Promise<string> => {
    if (!capturedPreviewUrl) return '';
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const loader = new Image();
        loader.crossOrigin = 'anonymous';
        loader.onload = () => resolve(loader);
        loader.onerror = () => reject(new Error('Image load failed'));
        loader.src = capturedPreviewUrl;
      });

      const imgW = img.naturalWidth || naturalSize.w;
      const imgH = img.naturalHeight || naturalSize.h;
      const canvas = document.createElement('canvas');
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return capturedPreviewUrl;

      ctx.fillStyle = '#0e0e0e';
      ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

      if (framingMode === 'contain') {
        // Blurred darkened ambient fill behind the complete uncropped frame
        const bgScale = Math.max(EXPORT_WIDTH / imgW, EXPORT_HEIGHT / imgH);
        const bgW = imgW * bgScale;
        const bgH = imgH * bgScale;
        ctx.save();
        ctx.filter = 'blur(20px) brightness(0.45)';
        ctx.drawImage(
          img,
          (EXPORT_WIDTH - bgW) / 2,
          (EXPORT_HEIGHT - bgH) / 2,
          bgW,
          bgH
        );
        ctx.restore();

        const fgScale = Math.min(EXPORT_WIDTH / imgW, EXPORT_HEIGHT / imgH);
        const fgW = imgW * fgScale;
        const fgH = imgH * fgScale;
        ctx.drawImage(
          img,
          (EXPORT_WIDTH - fgW) / 2,
          (EXPORT_HEIGHT - fgH) / 2,
          fgW,
          fgH
        );
      } else {
        const baseScale = Math.max(EXPORT_WIDTH / imgW, EXPORT_HEIGHT / imgH);
        const drawW = imgW * baseScale * zoom;
        const drawH = imgH * baseScale * zoom;
        const maxOffsetX = Math.max(0, (drawW - EXPORT_WIDTH) / 2);
        const maxOffsetY = Math.max(0, (drawH - EXPORT_HEIGHT) / 2);
        const offsetX = Math.max(
          -maxOffsetX,
          Math.min(maxOffsetX, panRatio.x * EXPORT_WIDTH)
        );
        const offsetY = Math.max(
          -maxOffsetY,
          Math.min(maxOffsetY, panRatio.y * EXPORT_HEIGHT)
        );
        ctx.drawImage(
          img,
          (EXPORT_WIDTH - drawW) / 2 + offsetX,
          (EXPORT_HEIGHT - drawH) / 2 + offsetY,
          drawW,
          drawH
        );
      }

      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return capturedPreviewUrl;
    }
  };

  const handleSave = async () => {
    const finalCoverUrl = await renderFramedCoverDataUrl();
    onSaveCover(
      targetScope,
      finalCoverUrl,
      `${currentTimecode} (F ${frameIndex})`
    );
    onClose();
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
              Cambiar Portada
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            className="px-4 py-2 rounded-full bg-[#ff5261] text-[#400009] text-sm font-bold shadow-md shadow-[#ff5261]/25 active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            <Check className="w-4 h-4 stroke-[2.75]" />
            <span>Guardar</span>
          </button>
        </div>
      </header>

      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-safe-8 space-y-4">
        {/* Selected Video Label */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#c8b6b6]">
              <Film className="w-3.5 h-3.5 text-[#ff5261]" />
              <span>Vídeo seleccionado</span>
              {isPortraitFrame && (
                <span className="px-1.5 py-0.5 rounded bg-[#4cd7f6]/15 text-[#4cd7f6] font-bold">
                  Vertical
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-[#e5e2e1] truncate">
              {video.name}
            </h3>
          </div>
        </div>

        {/* Interactive Framing Stage (supports both Vertical 9:16 & Horizontal 16:9) */}
        <div className="bg-[#1c1b1b] rounded-2xl p-3 border border-white/[0.06] shadow-xl space-y-3">
          {/* Mode Switch + Quick Framing Actions */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex p-1 rounded-xl bg-[#0e0e0e] border border-white/[0.05]">
              <button
                type="button"
                onClick={() => setFramingMode('crop')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  framingMode === 'crop'
                    ? 'bg-[#353534] text-[#e5e2e1] shadow-sm'
                    : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <Crop className="w-3.5 h-3.5 text-[#ff5261]" />
                <span>Encuadrar 4:3</span>
              </button>
              <button
                type="button"
                onClick={() => setFramingMode('contain')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  framingMode === 'contain'
                    ? 'bg-[#353534] text-[#e5e2e1] shadow-sm'
                    : 'text-[#c8b6b6] hover:text-[#e5e2e1]'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#4cd7f6]" />
                <span>Completo</span>
              </button>
            </div>

            {framingMode === 'crop' && (
              <div className="flex items-center gap-1.5">
                {isPortraitFrame && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setPanRatio((p) => ({ ...p, y: cropGeometry.maxPanRatioY }))
                      }
                      className="px-2 py-1 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[11px] font-semibold text-[#c8b6b6] hover:text-[#e5e2e1] transition-colors"
                    >
                      Arriba
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanRatio((p) => ({ ...p, y: 0 }))}
                      className="px-2 py-1 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[11px] font-semibold text-[#c8b6b6] hover:text-[#e5e2e1] transition-colors"
                    >
                      Centro
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPanRatio((p) => ({ ...p, y: -cropGeometry.maxPanRatioY }))
                      }
                      className="px-2 py-1 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[11px] font-semibold text-[#c8b6b6] hover:text-[#e5e2e1] transition-colors"
                    >
                      Abajo
                    </button>
                  </>
                )}
                {(zoom > 1 || panRatio.x !== 0 || panRatio.y !== 0) && (
                  <button
                    type="button"
                    aria-label="Restablecer encuadre"
                    onClick={handleResetFraming}
                    className="p-1.5 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[#ffb95f] transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Interactive Drag/Crop Viewport */}
          <div
            ref={stageRef}
            onPointerDown={(e) => {
              if (framingMode !== 'crop') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsDraggingCrop(true);
              cropDragStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                startPanX: panRatio.x,
                startPanY: panRatio.y,
              };
            }}
            onPointerMove={(e) => {
              if (!isDraggingCrop || !cropDragStartRef.current || framingMode !== 'crop') {
                return;
              }
              const dx = e.clientX - cropDragStartRef.current.clientX;
              const dy = e.clientY - cropDragStartRef.current.clientY;
              const nextX = cropDragStartRef.current.startPanX + dx / cropGeometry.cropW;
              const nextY = cropDragStartRef.current.startPanY + dy / cropGeometry.cropH;
              setPanRatio({
                x: Math.max(-cropGeometry.maxPanRatioX, Math.min(cropGeometry.maxPanRatioX, nextX)),
                y: Math.max(-cropGeometry.maxPanRatioY, Math.min(cropGeometry.maxPanRatioY, nextY)),
              });
            }}
            onPointerUp={() => {
              setIsDraggingCrop(false);
              cropDragStartRef.current = null;
            }}
            onPointerCancel={() => {
              setIsDraggingCrop(false);
              cropDragStartRef.current = null;
            }}
            className={`relative w-full h-[330px] sm:h-[370px] rounded-xl overflow-hidden bg-[#0e0e0e] flex items-center justify-center select-none touch-none ${
              framingMode === 'crop'
                ? 'cursor-grab active:cursor-grabbing'
                : 'cursor-default'
            }`}
          >
            {/* Ambient blurred backdrop in Contain mode */}
            {framingMode === 'contain' && capturedPreviewUrl && (
              <img
                src={capturedPreviewUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 scale-110 pointer-events-none"
              />
            )}

            {/* Real Video Frame Layer */}
            {capturedPreviewUrl ? (
              <img
                src={capturedPreviewUrl}
                alt={video.name}
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setNaturalSize({
                      w: img.naturalWidth,
                      h: img.naturalHeight,
                    });
                  }
                }}
                style={{
                  width: `${cropGeometry.drawW}px`,
                  height: `${cropGeometry.drawH}px`,
                  transform: `translate(${cropGeometry.offsetX}px, ${cropGeometry.offsetY}px)`,
                }}
                className="max-w-none max-h-none pointer-events-none select-none will-change-transform"
              />
            ) : video.sourceType && video.sourceType !== 'local' ? (
              <VideoCoverPlaceholder sourceType={video.sourceType} size="lg" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[#c8b6b6]/70">
                <Film className="w-10 h-10" />
                <span className="text-xs">Cargando fotograma...</span>
              </div>
            )}

            {/* Target 4:3 Framing Mask & Rule of Thirds Grid */}
            <div
              style={{
                width: `${cropGeometry.cropW}px`,
                height: `${cropGeometry.cropH}px`,
                boxShadow:
                  framingMode === 'crop'
                    ? '0 0 0 9999px rgba(10, 10, 10, 0.68)'
                    : undefined,
              }}
              className="pointer-events-none absolute rounded-lg border-2 border-white/85 z-10 overflow-hidden"
            >
              {/* Rule of Thirds lines inside the active crop window */}
              <div className="absolute inset-0 opacity-25 flex flex-col justify-evenly">
                <div className="w-full h-px bg-white" />
                <div className="w-full h-px bg-white" />
              </div>
              <div className="absolute inset-0 opacity-25 flex justify-evenly">
                <div className="h-full w-px bg-white" />
                <div className="h-full w-px bg-white" />
              </div>
            </div>

            {/* Subtle Drag Hint Pill */}
            {framingMode === 'crop' && (
              <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-full bg-[#131313]/85 backdrop-blur-sm border border-white/10 flex items-center gap-1.5 text-[10px] font-medium text-[#e5e2e1]/90 whitespace-nowrap">
                <Move className="w-3 h-3 text-[#ffb95f]" />
                <span>Arrastra para encuadrar la zona visible</span>
              </div>
            )}
          </div>

          {/* Zoom Slider (in Crop mode) */}
          {framingMode === 'crop' ? (
            <div className="flex items-center gap-3 px-1">
              <ZoomIn className="w-4 h-4 text-[#c8b6b6] shrink-0" />
              <input
                type="range"
                aria-label="Zoom de encuadre"
                min={1}
                max={2.5}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[#ff5261]"
              />
              <span className="font-mono text-xs font-semibold text-[#ffb95f] tabular-nums w-11 text-right">
                {zoom.toFixed(1)}x
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[#c8b6b6] px-1">
              El fotograma completo se guardará encajado dentro del formato de portada sin recortar cabeza ni pies.
            </p>
          )}
        </div>

        {/* Interactive Real Filmstrip Scrubber */}
        <section className="bg-[#1c1b1b] rounded-2xl p-4 shadow-lg border border-white/[0.06] space-y-3">
          {/* Timecode & Precision Indicators */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-base font-bold text-[#ffb3b3] tracking-tight">
                {currentTimecode}
              </span>
              <span className="text-xs text-[#c8b6b6]">/ {totalTimecode}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#2a2a2a] px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tabular-nums">
              <span className="text-[#ffb95f]">
                {isExtractingStrip ? 'Extrayendo...' : 'Línea real'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb95f]" />
              <span className="text-[#c8b6b6]">F {frameIndex}</span>
            </div>
          </div>

          {/* Scrubber Track with Real Extracted Video Frames */}
          <div
            ref={trackRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsDraggingTrack(true);
              updateFrameFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!isDraggingTrack) return;
              updateFrameFromClientX(e.clientX);
            }}
            onPointerUp={() => setIsDraggingTrack(false)}
            onPointerCancel={() => setIsDraggingTrack(false)}
            className="relative w-full h-20 rounded-xl overflow-hidden bg-[#0e0e0e] select-none touch-none cursor-grab active:cursor-grabbing flex items-center px-2"
          >
            {/* Filmstrip Frames Row */}
            <div className="w-full h-14 grid grid-cols-9 gap-1 items-center">
              {filmstripFrames.map((src, idx) => {
                const isKey = idx === activeStripIdx;
                const slotSec = ((idx + 0.5) / STRIP_COUNT) * realDurationSec;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Fotograma en ${formatShortTime(slotSec)}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => selectStripSlot(idx)}
                    className={`relative h-full rounded overflow-hidden bg-[#201f1f] transition-all ${
                      isKey
                        ? 'ring-2 ring-[#ff5261] shadow-[0_0_12px_rgba(255,82,97,0.45)] scale-y-105 z-10 opacity-100'
                        : 'opacity-65 hover:opacity-95'
                    }`}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        draggable={false}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#201f1f] animate-pulse">
                        <span className="font-mono text-[8px] text-[#c8b6b6]/60 tabular-nums">
                          {formatShortTime(slotSec)}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Playhead Needle positioned by live progressRatio */}
            <div
              style={{ left: `${progressRatio * 100}%` }}
              className="pointer-events-none absolute inset-y-0 -translate-x-1/2 w-1 bg-[#ff5261] z-20 shadow-[0_0_10px_rgba(255,82,97,0.9)] flex flex-col justify-between items-center"
            >
              <div className="w-2.5 h-2 bg-[#ff5261] rounded-b-sm" />
              <div className="w-2.5 h-2 bg-[#ff5261] rounded-t-sm" />
            </div>

            {/* Millisecond Tick Rulers */}
            <div className="pointer-events-none absolute top-0 inset-x-0 h-2 flex justify-between px-2 opacity-30">
              {Array.from({ length: STRIP_COUNT }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-px bg-[#e5e2e1] ${
                    idx % 3 === 0 ? 'h-full' : 'h-1'
                  }`}
                />
              ))}
            </div>
          </div>

          {!resolvedVideoUrl && (
            <p className="text-[11px] text-[#c8b6b6]/80 leading-snug">
              {video.sourceType === 'instagram'
                ? 'Los Reels de Instagram no permiten capturar fotogramas directamente por restricciones del reproductor incrustado; esta ficha mantiene su logotipo identificativo.'
                : video.sourceType === 'youtube'
                  ? 'Los vídeos enlazados de YouTube usan automáticamente su miniatura oficial de YouTube, pero puedes ajustar su encuadre o recortarla aquí.'
                  : 'Este vídeo no tiene un archivo local o flujo reproducible vinculado en esta sesión, por lo que no puede recorrer nuevos instantes, pero sí puedes ajustar su encuadre.'}
            </p>
          )}

          {/* Fine Tuning Stepper Controls */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => nudgeFrame(-1)}
              className="h-12 bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 transition-all rounded-xl flex items-center justify-center gap-1.5 text-[#e5e2e1] font-mono text-xs font-semibold"
            >
              <ChevronFirst className="w-4 h-4 text-[#ffb95f]" />
              <span>-1 frame (16ms)</span>
            </button>
            <button
              type="button"
              onClick={() => nudgeFrame(1)}
              className="h-12 bg-[#2a2a2a] hover:bg-[#393939] active:scale-95 transition-all rounded-xl flex items-center justify-center gap-1.5 text-[#e5e2e1] font-mono text-xs font-semibold"
            >
              <span>+1 frame (16ms)</span>
              <ChevronLast className="w-4 h-4 text-[#ffb95f]" />
            </button>
          </div>
        </section>

        {/* Target Destination Selector */}
        <section className="bg-[#1c1b1b] rounded-2xl p-4 shadow-md border border-white/[0.06] space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#e5e2e1]">
              Destino de Portada
            </h4>
            <span className="text-[11px] text-[#c8b6b6]">
              Selecciona alcance
            </span>
          </div>

          {/* Option 1: This video */}
          <button
            type="button"
            role="radio"
            aria-checked={targetScope === 'video'}
            onClick={() => setTargetScope('video')}
            className={`w-full text-left flex items-center p-3.5 rounded-xl border transition-all ${
              targetScope === 'video'
                ? 'bg-[#353534] border-[#ff5261]/60'
                : 'bg-[#201f1f] border-white/[0.04] hover:bg-[#2a2a2a]'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center mr-3.5 shrink-0 transition-colors ${
                targetScope === 'video' ? 'bg-[#ff5261]' : 'bg-[#353534]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  targetScope === 'video' ? 'bg-[#400009]' : 'bg-[#0e0e0e]'
                }`}
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#e5e2e1]">
                <Film className="w-4 h-4 text-[#ffb3b3] shrink-0" />
                <span className="truncate">Aplicar a este vídeo</span>
              </span>
              <span className="block text-xs text-[#c8b6b6] mt-0.5 truncate">
                Sustituirá la miniatura actual en tu videoteca personal
              </span>
            </span>
          </button>

          {/* Option 2: Containing Folder */}
          {video.parentId && (
            <button
              type="button"
              role="radio"
              aria-checked={targetScope === 'folder'}
              onClick={() => setTargetScope('folder')}
              className={`w-full text-left flex items-center p-3.5 rounded-xl border transition-all ${
                targetScope === 'folder'
                  ? 'bg-[#353534] border-[#ff5261]/60'
                  : 'bg-[#201f1f] border-white/[0.04] hover:bg-[#2a2a2a]'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center mr-3.5 shrink-0 transition-colors ${
                  targetScope === 'folder' ? 'bg-[#ff5261]' : 'bg-[#353534]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    targetScope === 'folder' ? 'bg-[#400009]' : 'bg-[#0e0e0e]'
                  }`}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[#e5e2e1]">
                  <FolderHeart className="w-4 h-4 text-[#ffb95f] shrink-0" />
                  <span className="truncate">
                    Portada de carpeta: {folderPathLabel}
                  </span>
                </span>
                <span className="block text-xs text-[#c8b6b6] mt-0.5 truncate">
                  Visible como icono representativo de la carpeta contenedora
                </span>
              </span>
            </button>
          )}
        </section>

        {/* Privacy & Local Security Notice */}
        <div className="p-3.5 rounded-xl bg-[#0e0e0e] border border-white/[0.05] flex items-start gap-3">
          <Lock className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#4cd7f6]">
              Aislamiento Local &amp; Privacidad
            </span>
            <p className="text-xs text-[#c8b6b6] leading-snug">
              Las portadas se generan exclusivamente a partir del archivo de vídeo vinculado (sin acceso ni exportación a tu galería externa). Todo el procesamiento se realiza en tu dispositivo.
            </p>
          </div>
        </div>

        {/* Bottom Main Affirmative Action */}
        <button
          type="button"
          onClick={() => void handleSave()}
          className="w-full py-4 px-5 rounded-xl bg-[#ff5261] text-[#400009] text-sm font-bold shadow-xl shadow-[#ff5261]/25 flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all"
        >
          <Camera className="w-5 h-5" />
          <span>Guardar Portada Oficial</span>
        </button>
      </div>
    </div>
  );
};
