import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Film,
  Folder,
  Pencil,
  X,
} from 'lucide-react';
import { ExplorerEntry } from '../types/dancevault';
import { DefaultIconCover } from './DefaultIconCover';
import { VideoCoverPlaceholder } from './VideoCoverPlaceholder';

interface RenameEntryModalProps {
  target: ExplorerEntry;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onConfirmRename: (entryId: string, newName: string) => boolean;
}

const MAX_NAME_LENGTH = 60;

export const RenameEntryModal: React.FC<RenameEntryModalProps> = ({
  target,
  allEntries,
  onClose,
  onConfirmRename,
}) => {
  const [value, setValue] = useState(target.name);
  const [autoBis, setAutoBis] = useState(false);

  const trimmed = value.trim();
  const isUnchanged =
    trimmed.toLowerCase() === target.name.trim().toLowerCase();

  // v2.3 rules:
  // - Videos must have unique names across ALL libraries (case-insensitive).
  // - Folders must have unique names within the SAME library (case-insensitive).
  // - A video and a folder may share the same name.
  const isNameTaken = useMemo(() => {
    const check = (candidate: string) => {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) return false;
      return allEntries.some((entry) => {
        if (entry.id === target.id || entry.type !== target.type) return false;
        if (target.type === 'video') {
          return entry.name.trim().toLowerCase() === normalized;
        }
        return (
          entry.libraryId === target.libraryId &&
          entry.name.trim().toLowerCase() === normalized
        );
      });
    };
    return check;
  }, [allEntries, target.id, target.libraryId, target.type]);

  const hasConflict = trimmed.length > 0 && !isUnchanged && isNameTaken(trimmed);

  // Cumulative BIS resolution (e.g. "BIS Nombre" -> "BIS BIS Nombre")
  const resolvedBisName = useMemo(() => {
    if (!trimmed) return '';
    let candidate = trimmed;
    while (isNameTaken(candidate)) {
      candidate = `BIS ${candidate}`;
    }
    return candidate;
  }, [isNameTaken, trimmed]);

  const isEmpty = trimmed.length === 0;
  const isConflictBlocking = hasConflict && !autoBis;
  const isResolvedByBis = hasConflict && autoBis;
  const isValidAvailable = !isEmpty && !isUnchanged && !hasConflict;
  const canSave = !isEmpty && !isUnchanged && (!hasConflict || autoBis);

  const finalNameToSave = isResolvedByBis ? resolvedBisName : trimmed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (onConfirmRename(target.id, finalNameToSave)) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-[#1c1b1b] rounded-t-[28px] sm:rounded-2xl p-5 pt-3 shadow-2xl border border-white/[0.08] space-y-4 overflow-hidden"
      >
        {/* Subtle top coral ambient glow */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-28 rounded-full bg-[#ff5261]/15 blur-2xl" />

        {/* Mobile drag handle */}
        <div className="w-12 h-1.5 rounded-full bg-[#393939]/80 mx-auto sm:hidden" />

        {/* Sheet Header */}
        <div className="relative flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#ff5261]/20 flex items-center justify-center text-[#ff5261] shrink-0">
              {target.type === 'folder' ? (
                <Folder className="w-6 h-6" />
              ) : (
                <Film className="w-6 h-6" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-[#e5e2e1] leading-tight">
                Renombrar {target.type === 'folder' ? 'carpeta' : 'vídeo'}
              </h3>
              <p className="text-xs text-[#c8b6b6] truncate">
                {target.type === 'folder'
                  ? 'Nombre único dentro de esta biblioteca'
                  : 'Nombre único sin modificar el archivo original'}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Cerrar diálogo de renombrado"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Item Preview Card */}
        <div className="bg-[#201f1f] rounded-2xl p-3 flex items-center gap-3.5 border border-white/[0.06]">
          <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-[#2a2a2a] shrink-0">
            {target.coverUrl ? (
              <img
                src={target.coverUrl}
                alt={target.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : target.type === 'folder' ? (
              <DefaultIconCover
                kind="folder"
                favorite={target.favorite}
                size="xs"
              />
            ) : (
              <VideoCoverPlaceholder sourceType={target.sourceType} size="sm" />
            )}
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-[#131313]/85 font-mono text-[10px] font-semibold text-[#e5e2e1] tabular-nums">
              {target.type === 'video' ? target.duration : `${target.itemCount} elem.`}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-[#ffb95f]">
              Nombre actual
            </span>
            <p className="text-sm font-bold text-[#e5e2e1] truncate">
              {target.name}
            </p>
            <p className="font-mono text-[11px] text-[#c8b6b6] tabular-nums truncate">
              {target.type === 'video'
                ? `${target.sizeLabel} • ${target.resolution}`
                : `${target.itemCount} elementos • ${target.sizeLabel}`}
            </p>
          </div>
        </div>

        {/* Input & Validation Block */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <label
              htmlFor="rename-entry-input"
              className="text-xs font-semibold text-[#c8b6b6]"
            >
              Nuevo nombre
            </label>
            <span
              className={`font-mono text-[11px] font-semibold tabular-nums ${
                isConflictBlocking || isEmpty
                  ? 'text-[#ffb4ab]'
                  : 'text-[#c8b6b6]'
              }`}
            >
              {value.length}/{MAX_NAME_LENGTH}
            </span>
          </div>

          <div
            className={`flex items-center gap-2.5 h-13 px-3.5 rounded-2xl border transition-all ${
              isConflictBlocking || isEmpty
                ? 'bg-[#93000a]/15 border-[#ffb4ab]/80 ring-1 ring-[#ffb4ab]/40'
                : isResolvedByBis
                  ? 'bg-[#2a2a2a] border-[#4cd7f6]/70 ring-1 ring-[#4cd7f6]/25'
                  : 'bg-[#2a2a2a] border-white/10 focus-within:border-[#ff5261]/80 focus-within:ring-1 focus-within:ring-[#ff5261]/30'
            }`}
          >
            {isConflictBlocking || isEmpty ? (
              <AlertTriangle className="w-4 h-4 text-[#ffb4ab] shrink-0" />
            ) : (
              <Pencil className="w-4 h-4 text-[#c8b6b6] shrink-0" />
            )}

            <input
              id="rename-entry-input"
              type="text"
              value={value}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                target.type === 'folder'
                  ? 'Nombre de la carpeta...'
                  : 'Nombre del vídeo...'
              }
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none"
            />

            {value.length > 0 && (
              <button
                type="button"
                aria-label="Limpiar nombre"
                onClick={() => setValue('')}
                className="w-7 h-7 rounded-full bg-[#201f1f] hover:bg-[#353534] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Validation Status Line */}
          <div className="min-h-[20px] flex items-center gap-1.5 px-0.5 text-xs font-medium">
            {isEmpty ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                <span className="text-[#ffb4ab]">El nombre es obligatorio</span>
              </>
            ) : isUnchanged ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#c8b6b6] shrink-0" />
                <span className="text-[#c8b6b6]">Nombre actual sin cambios</span>
              </>
            ) : isConflictBlocking ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                <span className="text-[#ffb4ab]">
                  Este nombre ya está en uso
                </span>
              </>
            ) : isResolvedByBis ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                <span className="text-[#4cd7f6] truncate">
                  Disponible como: &ldquo;{resolvedBisName}&rdquo;
                </span>
              </>
            ) : isValidAvailable ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                <span className="text-[#4cd7f6]">Nombre disponible</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Automatic BIS Renaming Checkbox ("palomilla") */}
        <button
          type="button"
          role="checkbox"
          aria-checked={autoBis}
          onClick={() => setAutoBis((prev) => !prev)}
          className={`w-full text-left rounded-2xl p-3 flex items-start gap-3 border transition-all ${
            autoBis
              ? 'bg-[#2a2a2a] border-[#4cd7f6]/45'
              : hasConflict
                ? 'bg-[#201f1f] border-[#ffb95f]/35 hover:border-[#ffb95f]/60'
                : 'bg-[#201f1f] border-white/[0.06] hover:border-white/15'
          }`}
        >
          <span
            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
              autoBis
                ? 'bg-[#4cd7f6] border-[#4cd7f6] text-[#002f38]'
                : 'bg-[#131313] border-[#c8b6b6]/50 text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>

          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-xs font-bold text-[#e5e2e1]">
              Renombre automático (añadir BIS)
            </span>
            {hasConflict && autoBis ? (
              <span className="block text-[11px] text-[#4cd7f6] font-medium truncate">
                Se guardará como: &ldquo;{resolvedBisName}&rdquo;
              </span>
            ) : (
              <span className="block text-[11px] text-[#c8b6b6] leading-snug">
                Si el nombre ya está en uso, antepone &ldquo;BIS&rdquo; automáticamente hasta obtener uno único.
              </span>
            )}
          </span>
        </button>

        {/* Bottom Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-14 rounded-2xl bg-[#2a2a2a] hover:bg-[#353534] text-sm font-bold text-[#e5e2e1] active:scale-[0.98] transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className={`h-14 rounded-2xl text-sm font-bold transition-all ${
              canSave
                ? 'bg-[#ff5261] text-[#400009] shadow-[0_0_20px_rgba(255,82,97,0.35)] hover:brightness-105 active:scale-[0.98]'
                : 'bg-[#ff5261]/35 text-[#400009]/70 opacity-50 cursor-not-allowed'
            }`}
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
};
