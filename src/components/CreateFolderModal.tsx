import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Star,
  X,
} from 'lucide-react';
import { ExplorerEntry } from '../types/dancevault';

interface CreateFolderModalProps {
  libraryId: string;
  pathLabel: string;
  allEntries: ExplorerEntry[];
  onClose: () => void;
  onCreateFolder: (name: string, favorite: boolean) => boolean;
}

const MAX_FOLDER_NAME = 45;

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  libraryId,
  pathLabel,
  allEntries,
  onClose,
  onCreateFolder,
}) => {
  const [name, setName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;

  // v2.3 rule: Folders must have unique names within the SAME library (case-insensitive)
  const isDuplicate = useMemo(() => {
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase();
    return allEntries.some(
      (entry) =>
        entry.type === 'folder' &&
        entry.libraryId === libraryId &&
        entry.name.trim().toLowerCase() === normalized
    );
  }, [allEntries, libraryId, trimmed]);

  const canCreate = !isEmpty && !isDuplicate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (onCreateFolder(trimmed, isFavorite)) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-[#1c1b1b] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/[0.08] overflow-hidden flex flex-col"
      >
        {/* Top subtle coral ambient glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-[#ff5261] blur-sm opacity-80 rounded-full" />

        {/* Drag handle + Quick Close */}
        <div className="w-full pt-3 px-4 flex flex-col items-center">
          <div className="w-12 h-1 bg-[#393939] rounded-full sm:hidden" />
          <div className="w-full flex justify-end mt-1 sm:mt-0">
            <button
              type="button"
              aria-label="Cerrar modal"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#e5e2e1] hover:bg-[#353534] flex items-center justify-center transition-all active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 pt-1 space-y-4">
          {/* Header with Coral Icon + Destination Path */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ff5261] flex items-center justify-center text-[#400009] shadow-lg shadow-[#ff5261]/25 shrink-0">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold text-[#e5e2e1] tracking-tight leading-tight">
                Nueva Carpeta
              </h2>
              <div className="inline-flex items-center gap-1.5 mt-1 text-[#ffb95f] font-mono text-[11px] font-semibold max-w-full">
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{pathLabel}</span>
              </div>
            </div>
          </div>

          {/* Input: Folder Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-folder-name-input"
              className="block text-xs font-medium text-[#c8b6b6]"
            >
              Nombre de la carpeta
            </label>

            <div
              className={`relative flex items-center rounded-xl bg-[#0e0e0e] border transition-all ${
                isDuplicate
                  ? 'border-[#ffb4ab]/80 ring-1 ring-[#ffb4ab]/35 bg-[#93000a]/10'
                  : 'border-white/[0.08] focus-within:bg-[#201f1f] focus-within:border-[#ff5261]/70'
              }`}
            >
              <div className="pl-3 text-[#ff5261] flex items-center pointer-events-none">
                <Pencil className="w-4 h-4" />
              </div>
              <input
                id="create-folder-name-input"
                type="text"
                value={name}
                maxLength={MAX_FOLDER_NAME}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Técnica de Aislamiento"
                autoFocus
                className="w-full bg-transparent text-sm font-medium text-[#e5e2e1] px-2.5 py-3.5 focus:outline-none placeholder:text-[#c8b6b6]/40"
              />
              {name.length > 0 && (
                <button
                  type="button"
                  aria-label="Limpiar nombre"
                  onClick={() => setName('')}
                  className="pr-3 text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Live Validation & Counter */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                {isEmpty ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#c8b6b6]/75 shrink-0" />
                    <span className="text-[#c8b6b6]/80">
                      Escribe un nombre para la carpeta
                    </span>
                  </>
                ) : isDuplicate ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                    <span className="text-[#ffb4ab]">
                      Ya existe en esta biblioteca
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#ffb95f] shrink-0" />
                    <span className="text-[#ffb95f]">
                      Disponible en tu biblioteca
                    </span>
                  </>
                )}
              </div>

              <span
                className={`font-mono text-[11px] font-semibold tabular-nums ${
                  isDuplicate ? 'text-[#ffb4ab]' : 'text-[#c8b6b6]/75'
                }`}
              >
                {name.length}/{MAX_FOLDER_NAME}
              </span>
            </div>
          </div>

          {/* Add to Favorites Tactile Switch */}
          <div className="bg-[#201f1f] rounded-2xl p-3 flex items-center justify-between gap-3 border border-white/[0.05]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#2a2a2a] flex items-center justify-center text-[#ffb95f] shrink-0">
                <Star className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-[#e5e2e1] leading-tight">
                  Añadir a favoritas de inmediato
                </span>
                <span className="block font-mono text-[11px] text-[#c8b6b6] truncate">
                  Acceso rápido desde el panel principal
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isFavorite}
              aria-label="Añadir a favoritas de inmediato"
              onClick={() => setIsFavorite((prev) => !prev)}
              className={`w-12 h-7 rounded-full p-1 transition-colors relative flex items-center shrink-0 cursor-pointer ${
                isFavorite ? 'bg-[#ff5261]' : 'bg-[#353534]'
              }`}
            >
              <span
                className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                  isFavorite ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Live Folder Thumbnail Preview */}
          <div className="bg-[#0e0e0e] rounded-xl p-3 flex items-center gap-3 border border-white/[0.05]">
            <div className="relative w-12 h-12 rounded-lg bg-[#2a2a2a] flex items-center justify-center text-[#ff5261] shrink-0">
              <Folder className="w-6 h-6" />
              {isFavorite && (
                <Star className="w-3.5 h-3.5 text-[#ffb95f] fill-current absolute -top-1 -right-1" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] font-semibold text-[#c8b6b6] uppercase tracking-wider">
                Vista previa
              </span>
              <p className="text-sm font-bold text-[#e5e2e1] truncate">
                {trimmed || 'Sin nombre'}
              </p>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] text-sm font-semibold hover:bg-[#353534] active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className={`flex-[1.4] py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                canCreate
                  ? 'bg-[#ff5261] text-[#400009] hover:brightness-110 active:scale-95 shadow-lg shadow-[#ff5261]/25'
                  : 'bg-[#ff5261]/35 text-[#400009]/65 opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[2.75]" />
              <span>Crear carpeta</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
