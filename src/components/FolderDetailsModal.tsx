import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Film,
  FolderOpen,
  FolderTree,
  HardDrive,
  Image as ImageIcon,
  Pencil,
  Scissors,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  ExplorerEntry,
  FolderEntry,
  FolderMetadataUpdates,
  LibraryItem,
  VideoEntry,
} from '../types/dancevault';
import { useBackHandler } from '../utils/backNavigation';
import {
  formatCreationDateLabel,
  fromDateTimeLocalInputValue,
  getEntryCreatedAt,
  toDateTimeLocalInputValue,
} from '../utils/dateUtils';
import { formatStorageParts, getVideoSizeMb } from '../utils/storageSize';
import { DefaultIconCover } from './DefaultIconCover';

interface FolderDetailsModalProps {
  folder: FolderEntry;
  library: LibraryItem;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onToggleFavorite: (folderId: string) => void;
  onRename: (folder: FolderEntry) => void;
  onChangeCover: (folder: FolderEntry) => void;
  onMove: (folder: FolderEntry) => void;
  onDelete: (folderId: string) => void;
  onUpdateMetadata?: (
    folderId: string,
    updates: FolderMetadataUpdates
  ) => void;
}

export const FolderDetailsModal: React.FC<FolderDetailsModalProps> = ({
  folder,
  library,
  allEntries,
  onClose,
  onToggleFavorite,
  onRename,
  onChangeCover,
  onMove,
  onDelete,
  onUpdateMetadata,
}) => {
  const createdAtMs = useMemo(() => getEntryCreatedAt(folder), [folder]);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(() =>
    toDateTimeLocalInputValue(createdAtMs)
  );
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    setEditingDate(false);
    setDateError('');
    setDateDraft(toDateTimeLocalInputValue(getEntryCreatedAt(folder)));
  }, [folder.createdAt, folder.id]);

  useBackHandler(editingDate, () => setEditingDate(false), 75);

  const handleSaveCreatedAt = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = fromDateTimeLocalInputValue(dateDraft);
    if (parsed === null) {
      setDateError('Selecciona una fecha y hora válidas.');
      return;
    }
    onUpdateMetadata?.(folder.id, { createdAt: parsed });
    setDateError('');
    setEditingDate(false);
  };
  const breadcrumbs = useMemo(() => {
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

  const stats = useMemo(() => {
    const libEntries = allEntries.filter((e) => e.libraryId === library.id);
    const folderIds = new Set<string>([folder.id]);
    let added = true;
    while (added) {
      added = false;
      for (const item of libEntries) {
        if (
          item.type === 'folder' &&
          item.parentId &&
          folderIds.has(item.parentId) &&
          !folderIds.has(item.id)
        ) {
          folderIds.add(item.id);
          added = true;
        }
      }
    }

    const subfoldersCount = Math.max(0, folderIds.size - 1);
    const descendantVideos = libEntries.filter(
      (item): item is VideoEntry =>
        item.type === 'video' &&
        item.parentId !== null &&
        folderIds.has(item.parentId)
    );

    const totalMb = descendantVideos.reduce(
      (sum, v) => sum + getVideoSizeMb(v),
      0
    );
    const sizeParts = formatStorageParts(totalMb);

    const libraryTotalMb = Math.max(0, library.sizeBytes, totalMb);
    const proportionPct =
      libraryTotalMb > 0
        ? Math.min(
            100,
            Math.max(totalMb > 0 ? 4 : 0, Math.round((totalMb / libraryTotalMb) * 100))
          )
        : 0;

    return {
      subfoldersCount,
      videosCount: descendantVideos.length,
      valueLabel: sizeParts.value,
      unitLabel: sizeParts.unit,
      fullSizeLabel: sizeParts.full,
      proportionPct,
    };
  }, [allEntries, folder.id, library.id, library.sizeBytes]);

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
        </div>
      </header>

      <div className="max-w-xl w-full mx-auto px-4 pt-4 pb-10 space-y-6">
        {/* Folder Header Card */}
        <section className="relative overflow-hidden rounded-2xl bg-[#1c1b1b] p-5 shadow-sm border border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-[#201f1f] overflow-hidden flex items-center justify-center shrink-0 text-[#ff5261] shadow-inner border border-white/[0.05]">
                {folder.coverUrl ? (
                  <img
                    src={folder.coverUrl}
                    alt={folder.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <DefaultIconCover
                    kind="folder"
                    favorite={folder.favorite}
                    size="sm"
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1 font-mono text-[11px] font-semibold">
                  <span className="text-[#ff5261] uppercase tracking-wider">
                    Carpeta Local
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5c3f40] inline-block" />
                  <span className="text-[#c8b6b6] flex items-center gap-1 tabular-nums">
                    <FolderTree className="w-3.5 h-3.5 text-[#4cd7f6]" />
                    <span>
                      {stats.subfoldersCount}{' '}
                      {stats.subfoldersCount === 1 ? 'subcarpeta' : 'subcarpetas'}
                    </span>
                  </span>
                </div>
                <h3 className="text-2xl font-extrabold text-[#e5e2e1] tracking-tight truncate">
                  {folder.name}
                </h3>
              </div>
            </div>

            <button
              type="button"
              aria-label={
                folder.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'
              }
              onClick={() => onToggleFavorite(folder.id)}
              className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] active:scale-90 transition-all ${
                folder.favorite ? 'text-[#ffb95f]' : 'text-[#c8b6b6]'
              }`}
            >
              <Star
                className={`w-5 h-5 ${folder.favorite ? 'fill-current' : ''}`}
              />
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => onRename(folder)}
              className="h-10 px-4 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all shadow-sm"
            >
              <Pencil className="w-4 h-4 text-[#ffb3b3]" />
              <span>Renombrar</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeCover(folder)}
              className="h-10 px-4 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-all shadow-sm"
            >
              <ImageIcon className="w-4 h-4 text-[#4cd7f6]" />
              <span>Cambiar portada</span>
            </button>
          </div>
        </section>

        {/* Section: Ubicación & Organización */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-[#ff5261]" />
            <h3 className="text-sm font-bold text-[#e5e2e1] tracking-wide">
              Ubicación &amp; Organización
            </h3>
          </div>

          <div className="rounded-2xl bg-[#1c1b1b] p-4 space-y-4 shadow-sm border border-white/[0.06]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#201f1f] flex items-center justify-center text-[#ff5261] shrink-0 mt-0.5">
                <FolderOpen className="w-5 h-5" />
              </div>

              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold text-[#c8b6b6] mb-1 uppercase tracking-wider">
                  Directorio Raíz
                </span>
                <div className="flex items-center flex-wrap gap-1 text-xs leading-snug">
                  <span className="text-[#c8b6b6] break-words">{library.name}</span>
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight className="w-3.5 h-3.5 text-[#ac8888] shrink-0" />
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

            <div className="p-3 rounded-xl bg-[#201f1f] space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#1c1b1b] flex items-center justify-center text-[#4cd7f6] shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                      Fecha de creación
                    </span>
                    <p className="font-mono text-xs font-semibold text-[#e5e2e1] mt-0.5 tabular-nums truncate">
                      {formatCreationDateLabel(createdAtMs)}
                    </p>
                  </div>
                </div>

                {onUpdateMetadata && !editingDate && (
                  <button
                    type="button"
                    aria-label="Editar fecha de creación de carpeta"
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
                    aria-label="Fecha y hora de creación de carpeta"
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

            <button
              type="button"
              onClick={() => onMove(folder)}
              className="w-full h-12 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center gap-2 text-xs font-semibold active:scale-[0.98] transition-all"
            >
              <Scissors className="w-4 h-4 text-[#ffb95f]" />
              <span>Cortar</span>
            </button>
          </div>
        </section>

        {/* Section: Contenido & Almacenamiento */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-[#ffb95f]" />
            <h3 className="text-sm font-bold text-[#e5e2e1] tracking-wide">
              Contenido &amp; Almacenamiento
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Tile: Total Videos */}
            <div className="rounded-2xl bg-[#1c1b1b] p-4 flex flex-col justify-between space-y-3 shadow-sm border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                  Archivos
                </span>
                <div className="w-8 h-8 rounded-full bg-[#201f1f] flex items-center justify-center text-[#ffb3b3]">
                  <Film className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="font-mono text-[26px] leading-8 font-bold text-[#e5e2e1] tabular-nums tracking-tight">
                  {stats.videosCount}
                </span>
                <span className="block text-xs text-[#c8b6b6] mt-0.5">
                  vídeos coreográficos
                </span>
              </div>
            </div>

            {/* Tile: Storage Usage */}
            <div className="rounded-2xl bg-[#1c1b1b] p-4 flex flex-col justify-between space-y-3 shadow-sm border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                  Tamaño Total
                </span>
                <div className="w-8 h-8 rounded-full bg-[#201f1f] flex items-center justify-center text-[#ffb95f]">
                  <HardDrive className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="font-mono text-[26px] leading-8 font-bold text-[#e5e2e1] tabular-nums tracking-tight">
                  {stats.valueLabel}{' '}
                  <span className="text-sm font-semibold text-[#c8b6b6]">
                    {stats.unitLabel}
                  </span>
                </span>
                <span className="block text-xs text-[#c8b6b6] mt-0.5">
                  espacio vinculado
                </span>
              </div>
            </div>
          </div>

          {/* Proportion Bar inside Library */}
          <div className="rounded-2xl bg-[#1c1b1b] p-4 space-y-2 shadow-sm border border-white/[0.06]">
            <div className="flex items-center justify-between font-mono text-xs tabular-nums">
              <span className="text-[#c8b6b6]">
                Proporción de peso en Biblioteca
              </span>
              <span className="text-[#e5e2e1] font-semibold">
                {stats.fullSizeLabel} / {library.sizeLabel}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#201f1f] overflow-hidden">
              <div
                className="h-full bg-[#ff5261] rounded-full transition-all duration-300"
                style={{ width: `${stats.proportionPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* Bottom Destructive Action */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              onDelete(folder.id);
              onClose();
            }}
            className="w-full h-12 rounded-xl bg-[#201f1f] hover:bg-[#93000a]/25 text-[#ffb4ab] flex items-center justify-center gap-2 text-xs font-semibold active:scale-[0.98] transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span>Mover carpeta a la papelera</span>
          </button>
        </div>
      </div>
    </div>
  );
};
