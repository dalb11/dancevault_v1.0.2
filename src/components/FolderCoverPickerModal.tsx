import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Film,
  FolderHeart,
  Star,
  Video,
} from 'lucide-react';
import { ExplorerEntry, FolderEntry, VideoEntry } from '../types/dancevault';

interface FolderCoverPickerModalProps {
  folder: FolderEntry;
  libraryName: string;
  allEntries: ExplorerEntry[];
  candidateVideos: VideoEntry[];
  onClose: () => void;
  onAssignCover: (folderId: string, coverUrl: string, sourceVideoName: string) => void;
}

export const FolderCoverPickerModal: React.FC<FolderCoverPickerModalProps> = ({
  folder,
  libraryName,
  allEntries,
  candidateVideos,
  onClose,
  onAssignCover,
}) => {
  // Build full path from library root to this folder
  const folderBreadcrumbs = useMemo(() => {
    const chain: FolderEntry[] = [];
    let cursor: FolderEntry | undefined = folder;
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
  }, [allEntries, folder]);

  const videosWithCover = useMemo(
    () => candidateVideos.filter((v) => Boolean(v.coverUrl)),
    [candidateVideos]
  );

  const initialSelectedVideo = useMemo(() => {
    if (videosWithCover.length === 0) return null;
    return (
      videosWithCover.find((v) => v.coverUrl === folder.coverUrl) ??
      videosWithCover[0]
    );
  }, [videosWithCover, folder.coverUrl]);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(
    initialSelectedVideo?.id ?? null
  );

  const selectedVideo = useMemo(
    () =>
      videosWithCover.find((v) => v.id === selectedVideoId) ??
      videosWithCover[0] ??
      null,
    [videosWithCover, selectedVideoId]
  );

  const previewCoverUrl = selectedVideo?.coverUrl || folder.coverUrl;

  const handleConfirm = () => {
    if (!selectedVideo) return;
    onAssignCover(folder.id, selectedVideo.coverUrl, selectedVideo.name);
    onClose();
  };

  const handleClearCover = () => {
    onAssignCover(folder.id, '', '');
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
              Portada De Carpeta
            </h2>
          </div>
        </div>
      </header>

      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-safe-10 space-y-4">
        {/* Status Context Ribbon */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#ffb3b3]">
            <FolderHeart className="w-4 h-4 shrink-0" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
              Carpeta Seleccionada
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold bg-[#2a2a2a] text-[#c8b6b6] px-2.5 py-0.5 rounded-full tabular-nums">
            {videosWithCover.length}{' '}
            {videosWithCover.length === 1 ? 'portada disponible' : 'portadas disponibles'}
          </span>
        </div>

        {/* Folder Breadcrumb & Title Card */}
        <div className="bg-[#1c1b1b] rounded-xl p-4 border border-white/[0.06] space-y-1">
          <div className="flex items-center gap-1 text-[11px] text-[#c8b6b6] flex-wrap">
            <span>{libraryName}</span>
            {folderBreadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight className="w-3 h-3 opacity-60 shrink-0" />
                <span
                  className={
                    idx === folderBreadcrumbs.length - 1
                      ? 'text-[#e5e2e1] font-semibold'
                      : ''
                  }
                >
                  {crumb.name}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <h3 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight truncate">
              {folder.name}
            </h3>
            {folder.favorite && (
              <Star className="w-4 h-4 text-[#ffb3b3] fill-current shrink-0" />
            )}
          </div>
        </div>

        {videosWithCover.length === 0 ? (
          <div className="py-12 px-5 rounded-2xl bg-[#1c1b1b] border border-white/[0.06] text-center space-y-2.5">
            <Film className="w-8 h-8 text-[#ffb95f]/65 mx-auto" />
            <p className="text-sm font-semibold text-[#e5e2e1]">
              {candidateVideos.length === 0
                ? 'Carpeta sin vídeos todavía'
                : 'Sin portadas reales disponibles todavía'}
            </p>
            <p className="text-xs text-[#c8b6b6] leading-relaxed">
              {candidateVideos.length === 0
                ? `Añade o importa algún vídeo dentro de «${folder.name}» o sus subcarpetas para usar su fotograma como portada.`
                : `Ningún vídeo de «${folder.name}» tiene una portada real asociada todavía. Guarda un fotograma desde el visor de vídeo para asignarla.`}
            </p>
            <div className="pt-2 flex flex-col gap-2 max-w-xs mx-auto">
              {folder.coverUrl && (
                <button
                  type="button"
                  onClick={handleClearCover}
                  className="px-5 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#353534] border border-white/10 text-xs font-semibold text-[#ffb95f]"
                >
                  Restablecer al icono por defecto
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 h-10 rounded-full bg-[#2a2a2a] text-sm font-semibold text-[#e5e2e1]"
              >
                Volver
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Primary Preview Card (Hero Visor) */}
            <div className="relative w-full aspect-[4/3] sm:aspect-video max-h-[360px] rounded-2xl overflow-hidden bg-[#2a2a2a] shadow-xl border border-white/[0.06]">
              {previewCoverUrl ? (
                <img
                  src={previewCoverUrl}
                  alt={selectedVideo?.name ?? folder.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#201f1f]">
                  <Film className="w-10 h-10 text-[#c8b6b6]/40" />
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/25 to-black/55" />

              {/* Top Floating Selected Indicator */}
              <div className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 bg-[#ff5261] text-[#400009] text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-md">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Portada Seleccionada</span>
              </div>

              {/* Bottom Origin Media Metadata Glass Anchor */}
              {selectedVideo && (
                <div className="absolute inset-x-3.5 bottom-3.5 p-3.5 bg-[#1c1b1b]/90 backdrop-blur-xl rounded-xl border border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase text-[#ffb3b3] flex items-center gap-1">
                      <Video className="w-3.5 h-3.5" />
                      <span>Vídeo origen</span>
                    </span>
                    <span className="font-mono text-[11px] text-[#c8b6b6] tabular-nums">
                      {selectedVideo.duration} • {selectedVideo.resolution}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#e5e2e1] truncate">
                    {selectedVideo.name}
                  </p>
                </div>
              )}
            </div>

            {/* Selection Hub Header */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-[#e5e2e1] tracking-tight">
                  Elegir portada de un vídeo
                </h4>
                <span className="font-mono text-[11px] font-semibold text-[#ffb3b3]">
                  Exclusivo
                </span>
              </div>
              <p className="text-xs text-[#c8b6b6]">
                Selecciona la portada de cualquiera de los {videosWithCover.length}{' '}
                vídeos con carátula contenidos en «{folder.name}» o sus subcarpetas.
              </p>
            </div>

            {/* 2-Column Grid of Candidate Video Covers */}
            <div
              role="radiogroup"
              aria-label="Portadas disponibles en la carpeta"
              className="grid grid-cols-2 gap-2.5"
            >
              {videosWithCover.map((vid) => {
                const isSelected = selectedVideo?.id === vid.id;
                const isCurrentFolderCover = vid.coverUrl === folder.coverUrl;
                return (
                  <button
                    key={vid.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedVideoId(vid.id)}
                    className={`relative flex flex-col rounded-xl overflow-hidden text-left transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'bg-[#2a2a2a] ring-2 ring-[#ff5261] shadow-md'
                        : 'bg-[#201f1f] border border-white/[0.05] hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <div className="relative w-full aspect-video bg-[#131313]">
                      <img
                        src={vid.coverUrl}
                        alt={vid.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e]/80 to-transparent" />

                      <div
                        className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#ff5261] text-[#400009] shadow-lg'
                            : 'bg-[#353534]/85 text-[#c8b6b6]'
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </div>

                      <span className="absolute bottom-1.5 left-2 font-mono text-[10px] font-semibold text-[#e5e2e1] bg-black/65 px-1.5 py-0.5 rounded tabular-nums">
                        {vid.duration}
                      </span>
                    </div>

                    <div className="p-2.5 flex flex-col justify-between flex-1 bg-[#201f1f]">
                      <p className="text-xs font-semibold text-[#e5e2e1] line-clamp-1">
                        {vid.name}
                      </p>
                      <span
                        className={`text-[10px] font-medium mt-1 ${
                          isSelected
                            ? 'text-[#ffb3b3]'
                            : 'text-[#c8b6b6]/80'
                        }`}
                      >
                        {isSelected
                          ? 'Seleccionada'
                          : isCurrentFolderCover
                            ? 'Portada actual'
                            : 'Portada oficial'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Direct Linkage Information Banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#1c1b1b] border border-white/[0.05]">
              <div className="w-10 h-10 rounded-full bg-[#009eb9]/20 text-[#4cd7f6] flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#4cd7f6]">
                  Vinculación Directa
                </span>
                <p className="text-xs text-[#c8b6b6] leading-snug">
                  La portada de la carpeta se actualizará inmediatamente en el explorador y en las vistas de lista y cuadrado. No modifica el archivo original ni re-codifica vídeo.
                </p>
              </div>
            </div>

            {/* Primary & Secondary Action Dock */}
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full h-14 rounded-full bg-[#ff5261] text-[#400009] text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/25 hover:brightness-105 active:scale-[0.98] transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Asignar como Portada de Carpeta</span>
              </button>
              {folder.coverUrl && (
                <button
                  type="button"
                  onClick={handleClearCover}
                  className="w-full h-11 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/10 text-[#ffb95f] text-xs font-semibold flex items-center justify-center transition-colors active:scale-[0.98]"
                >
                  Quitar portada actual (usar icono por defecto)
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-sm font-semibold flex items-center justify-center transition-colors active:scale-[0.98]"
              >
                Cancelar y mantener actual
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
