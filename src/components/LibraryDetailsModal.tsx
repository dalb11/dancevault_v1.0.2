import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Copy,
  Film,
  Folder,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Pencil,
  Play,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  LibraryItem,
  VideoEntry,
} from '../types/dancevault';
import { formatStorageMb } from '../utils/storageSize';
import { DefaultIconCover } from './DefaultIconCover';

const ACCENT_SWATCHES = [
  { hex: '#ff3e55', label: 'Coral' },
  { hex: '#f59e0b', label: 'Ámbar' },
  { hex: '#06b6d4', label: 'Cian' },
  { hex: '#10b981', label: 'Esmeralda' },
  { hex: '#a855f7', label: 'Violeta' },
  { hex: '#ec4899', label: 'Rosa' },
];

interface LibraryDetailsModalProps {
  library: LibraryItem;
  isPrimary: boolean;
  canDelete: boolean;
  totalStorageMb: number;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onOpenExplorer: (libId: string) => void;
  onSetPrimary: (lib: LibraryItem) => void;
  onEdit: (lib: LibraryItem) => void;
  onChangeCover: (libId: string) => void;
  onChangeAccent: (libId: string, accentHex: string) => void;
  onCopy: (lib: LibraryItem) => void;
  onExport: (lib: LibraryItem) => void;
  onDelete: (lib: LibraryItem) => void;
}

const resolveAccentHex = (lib: LibraryItem): string => {
  if (lib.accentHex) return lib.accentHex;
  switch (lib.accentColor) {
    case 'primary':
      return '#ff5261';
    case 'secondary':
      return '#ffb95f';
    case 'tertiary':
      return '#4cd7f6';
    default:
      return '#c8b6b6';
  }
};

export const LibraryDetailsModal: React.FC<LibraryDetailsModalProps> = ({
  library,
  isPrimary,
  canDelete,
  totalStorageMb,
  allEntries,
  onClose,
  onOpenExplorer,
  onSetPrimary,
  onEdit,
  onChangeCover,
  onChangeAccent,
  onCopy,
  onExport,
  onDelete,
}) => {
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [library.coverUrl]);

  const activeHex = resolveAccentHex(library);

  const stats = useMemo(() => {
    const libEntries = allEntries.filter((e) => e.libraryId === library.id);
    const folders = libEntries.filter(
      (e): e is FolderEntry => e.type === 'folder'
    );
    const videos = libEntries.filter(
      (e): e is VideoEntry => e.type === 'video'
    );
    const rootFoldersCount = folders.filter((f) => f.parentId === null).length;
    const favoritesCount = libEntries.filter((e) => e.favorite).length;

    const tagFreq = new Map<string, number>();
    videos.forEach((v) => {
      v.tags.forEach((t) => tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1));
    });
    const topTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);

    const proportionPct =
      totalStorageMb > 0
        ? Math.min(
            100,
            Math.max(
              library.sizeBytes > 0 ? 4 : 0,
              Math.round((library.sizeBytes / totalStorageMb) * 100)
            )
          )
        : 0;

    const totalAllGb = formatStorageMb(totalStorageMb);

    return {
      videosCount: videos.length,
      foldersCount: folders.length,
      rootFoldersCount,
      favoritesCount,
      topTags,
      proportionPct,
      totalAllGb,
    };
  }, [
    allEntries,
    library.id,
    library.sizeBytes,
    totalStorageMb,
  ]);

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
              Detalles de Biblioteca
            </h2>
          </div>

          <button
            type="button"
            aria-label={
              isPrimary
                ? 'Biblioteca principal activa'
                : 'Hacer biblioteca principal'
            }
            disabled={isPrimary}
            onClick={() => onSetPrimary(library)}
            className={`h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-all shrink-0 ${
              isPrimary
                ? 'bg-[#ff5261]/20 text-[#ffb3b3] cursor-default'
                : 'bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c8b6b6] active:scale-95'
            }`}
          >
            <Star
              className={`w-4 h-4 ${
                isPrimary ? 'text-[#ffb95f] fill-current' : ''
              }`}
            />
            <span>{isPrimary ? 'Principal' : 'Hacer principal'}</span>
          </button>
        </div>
      </header>

      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-10 space-y-5">
        {/* Library Hero Header Card */}
        <section className="relative overflow-hidden rounded-2xl bg-[#1c1b1b] border border-white/[0.06] shadow-sm">
          {/* Cover Banner */}
          <div className="relative h-36 w-full bg-[#2a2a2a] overflow-hidden">
            {library.coverUrl && !coverFailed ? (
              <img
                src={library.coverUrl}
                alt={library.name}
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <DefaultIconCover
                kind="library"
                accentHex={activeHex}
                size="lg"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1c1b1b] via-[#1c1b1b]/45 to-black/25" />

            <button
              type="button"
              onClick={() => onChangeCover(library.id)}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#131313]/80 backdrop-blur-md text-[#e5e2e1] text-[11px] font-semibold hover:bg-[#2a2a2a] active:scale-95 transition-all border border-white/10"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>
          </div>

          <div className="p-5 pt-2 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] font-semibold">
                  <span
                    className="uppercase tracking-wider"
                    style={{ color: activeHex }}
                  >
                    {library.disciplineLabel}
                  </span>
                  {isPrimary && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5c3f40]" />
                      <span className="text-[#ffb95f]">Por defecto</span>
                    </>
                  )}
                </div>
                <h3 className="text-2xl font-extrabold text-[#e5e2e1] tracking-tight truncate mt-0.5">
                  {library.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-[#c8b6b6] mt-1">
                  <Clock className="w-3.5 h-3.5 text-[#ffb3b3] shrink-0" />
                  <span>Última práctica: {library.lastPracticed}</span>
                </div>
              </div>
            </div>

            {/* Action Pills + Accent Swatches */}
            <div className="pt-3 border-t border-white/[0.05] flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onEdit(library)}
                  className="h-9 px-3.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#ffb3b3]" />
                  <span>Editar nombre y título</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeCover(library.id)}
                  className="h-9 px-3.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  <span>Portada</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#c8b6b6]">
                  Color identificativo
                </span>
                <div className="flex items-center gap-2">
                  {ACCENT_SWATCHES.map((swatch) => {
                    const selected =
                      activeHex.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        aria-label={`Color ${swatch.label}`}
                        onClick={() => onChangeAccent(library.id, swatch.hex)}
                        style={{ backgroundColor: swatch.hex }}
                        className={`w-6 h-6 rounded-full transition-transform active:scale-90 ${
                          selected
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1c1b1b] scale-110'
                            : 'opacity-75 hover:opacity-100'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Contenido & Almacenamiento */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: activeHex }}
            />
            <h3 className="text-sm font-bold text-[#e5e2e1] tracking-wide">
              Contenido &amp; Almacenamiento
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#1c1b1b] p-4 flex flex-col justify-between space-y-2.5 border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                  Vídeos
                </span>
                <div className="w-8 h-8 rounded-full bg-[#201f1f] flex items-center justify-center text-[#ffb3b3]">
                  <Film className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="font-mono text-[26px] leading-8 font-bold text-[#e5e2e1] tabular-nums">
                  {stats.videosCount}
                </span>
                <span className="block text-xs text-[#c8b6b6] mt-0.5">
                  vídeos vinculados
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1c1b1b] p-4 flex flex-col justify-between space-y-2.5 border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                  Carpetas
                </span>
                <div className="w-8 h-8 rounded-full bg-[#201f1f] flex items-center justify-center text-[#ffb95f]">
                  <Folder className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="font-mono text-[26px] leading-8 font-bold text-[#e5e2e1] tabular-nums">
                  {stats.foldersCount}
                </span>
                <span className="block text-xs text-[#c8b6b6] mt-0.5">
                  {stats.rootFoldersCount} en raíz · {stats.favoritesCount} fav.
                </span>
              </div>
            </div>
          </div>

          {/* Storage Proportion Bar */}
          <div className="rounded-2xl bg-[#1c1b1b] p-4 space-y-2 border border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-[#c8b6b6]">
                <HardDrive className="w-4 h-4 text-[#ffb95f] shrink-0" />
                <span>Peso en DanceVault</span>
              </div>
              <span className="font-mono text-xs font-semibold text-[#e5e2e1] tabular-nums">
                {library.sizeLabel} / {stats.totalAllGb} ({stats.proportionPct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#201f1f] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${stats.proportionPct}%`,
                  backgroundColor: activeHex,
                }}
              />
            </div>
          </div>
        </section>

        {/* Section: Etiquetas frecuentes & Arquitectura v2.3 */}
        <section className="rounded-2xl bg-[#1c1b1b] p-4 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#4cd7f6]" />
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Etiquetas frecuentes
              </h3>
            </div>
            <span className="font-mono text-[11px] text-[#c8b6b6] tabular-nums">
              {stats.topTags.length} activas
            </span>
          </div>

          {stats.topTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {stats.topTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-[#2a2a2a] text-xs font-medium text-[#e5e2e1] border border-white/[0.06]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#c8b6b6]">
              Aún no hay etiquetas asignadas a los vídeos de esta biblioteca.
            </p>
          )}

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#131313] text-[#c8b6b6] border border-white/[0.04]">
            <ShieldCheck className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed">
              Espacio aislado independiente: los nombres de carpetas son únicos
              dentro de esta biblioteca y sus vídeos se enlazan sin duplicar
              archivos en disco.
            </span>
          </div>
        </section>

        {/* Bottom Operations */}
        <div className="pt-1 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenExplorer(library.id);
            }}
            className="w-full h-14 px-4 rounded-xl bg-[#ff5261] text-[#400009] flex items-center justify-center gap-2 shadow-lg shadow-[#ff5261]/20 active:scale-[0.98] transition-transform font-bold text-sm"
          >
            <FolderOpen className="w-5 h-5" />
            <span>Abrir explorador de biblioteca</span>
            <Play className="w-4 h-4 fill-current" />
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                onCopy(library);
                onClose();
              }}
              className="h-11 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
            >
              <Copy className="w-4 h-4 text-[#4cd7f6]" />
              <span>Duplicar</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeCover(library.id)}
              className="h-11 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
            >
              <ImageIcon className="w-4 h-4 text-[#ffb95f]" />
              <span>Cambiar portada</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onExport(library);
            }}
            className="w-full h-11 px-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] border border-white/[0.06] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
          >
            <Upload className="w-4 h-4 text-[#4cd7f6]" />
            <span>Exportar biblioteca (.json)</span>
          </button>

          <button
            type="button"
            disabled={!canDelete}
            onClick={() => {
              onDelete(library);
              onClose();
            }}
            className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
              canDelete
                ? 'bg-[#201f1f] hover:bg-[#93000a]/25 text-[#ffb4ab] active:scale-[0.98]'
                : 'bg-[#201f1f]/50 text-[#c8b6b6]/40 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {canDelete
                ? 'Eliminar biblioteca'
                : 'Debe haber al menos una biblioteca activa'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
