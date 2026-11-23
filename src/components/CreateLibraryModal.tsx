import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FolderHeart,
  Library,
  Plus,
  X,
} from 'lucide-react';
import { LibraryItem } from '../types/dancevault';

interface CreateLibraryModalProps {
  existingLibraries: LibraryItem[];
  onClose: () => void;
  onCreateLibrary: (name: string, accentHex: string) => boolean;
  onImportLibrary?: () => void;
}

interface ColorOption {
  hex: string;
  rgb: string;
  label: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  { hex: '#10b981', rgb: '16, 185, 129', label: 'Esmeralda Menta' },
  { hex: '#ff3e55', rgb: '255, 62, 85', label: 'Coral DanceVault' },
  { hex: '#3b82f6', rgb: '59, 130, 246', label: 'Azul Zafiro' },
  { hex: '#a855f7', rgb: '168, 85, 247', label: 'Púrpura Intenso' },
  { hex: '#f59e0b', rgb: '245, 158, 11', label: 'Ámbar Dorado' },
  { hex: '#ec4899', rgb: '236, 72, 153', label: 'Magenta Neón' },
];

const MAX_LIB_NAME = 30;

export const CreateLibraryModal: React.FC<CreateLibraryModalProps> = ({
  existingLibraries,
  onClose,
  onCreateLibrary,
  onImportLibrary,
}) => {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<ColorOption>(COLOR_OPTIONS[0]);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;

  const isDuplicate = useMemo(() => {
    if (!trimmed) return false;
    const normalized = trimmed.toLowerCase();
    return existingLibraries.some(
      (lib) => lib.name.trim().toLowerCase() === normalized
    );
  }, [existingLibraries, trimmed]);

  const canCreate = !isEmpty && !isDuplicate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (onCreateLibrary(trimmed, selectedColor.hex)) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-[#1c1b1b] rounded-t-[28px] sm:rounded-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.65)] border border-white/[0.08] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Ambient Tint Glow */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-3xl transition-colors duration-500"
          style={{ backgroundColor: `rgba(${selectedColor.rgb}, 0.16)` }}
        />

        {/* Drag Handle (Mobile) */}
        <div className="w-full flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#353534]" />
        </div>

        <div className="relative p-5 pt-3 sm:pt-5 space-y-4 overflow-y-auto">
          {/* Modal Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[#ff5261] text-[#400009] flex items-center justify-center shadow-lg shadow-[#ff5261]/25 shrink-0">
                <Library className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-[#e5e2e1] tracking-tight leading-tight">
                  Nueva Biblioteca
                </h2>
                <p className="text-xs text-[#c8b6b6] leading-snug">
                  Crea una biblioteca independiente para un estilo o colección
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="Cerrar modal"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Input: Library Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="create-library-name"
                className="font-semibold text-[#e5e2e1]"
              >
                Nombre de la biblioteca
              </label>
              <span className="text-[11px] text-[#c8b6b6]/70">Obligatorio</span>
            </div>

            <div
              className={`relative flex items-center rounded-xl px-3 py-1 bg-[#0e0e0e] border transition-all ${
                isDuplicate
                  ? 'border-[#ffb4ab]/80 ring-1 ring-[#ffb4ab]/35 bg-[#93000a]/10'
                  : 'border-white/[0.08] focus-within:border-[#ff5261]/60 focus-within:ring-2 focus-within:ring-[#ff5261]/25'
              }`}
            >
              <input
                id="create-library-name"
                type="text"
                value={name}
                maxLength={MAX_LIB_NAME}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Salsa On2, Bachata Sensual..."
                autoFocus
                className="w-full bg-transparent py-2.5 text-sm font-medium text-[#e5e2e1] placeholder:text-[#c8b6b6]/45 focus:outline-none"
              />
              {name.length > 0 && (
                <button
                  type="button"
                  aria-label="Borrar texto"
                  onClick={() => setName('')}
                  className="w-7 h-7 rounded-full bg-[#2a2a2a] hover:bg-[#353534] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center shrink-0 active:scale-90 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Validation & Counter Footer */}
            <div className="flex items-center justify-between px-1 pt-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {isEmpty ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#c8b6b6]/75 shrink-0" />
                    <span className="font-mono text-[11px] text-[#c8b6b6]/80">
                      Ingresa un nombre
                    </span>
                  </>
                ) : isDuplicate ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0" />
                    <span className="font-mono text-[11px] text-[#ffb4ab]">
                      Ya existe esa biblioteca
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                    <span className="font-mono text-[11px] text-[#4cd7f6]">
                      Nombre disponible
                    </span>
                  </>
                )}
              </div>

              <span
                className={`font-mono text-[11px] font-semibold tabular-nums ${
                  isDuplicate ? 'text-[#ffb4ab]' : 'text-[#c8b6b6]/70'
                }`}
              >
                {name.length}/{MAX_LIB_NAME}
              </span>
            </div>
          </div>

          {/* Color Selector Section */}
          <div className="space-y-2">
            <div>
              <span className="block text-xs font-semibold text-[#e5e2e1]">
                Color identificativo
              </span>
              <span className="block text-[11px] text-[#c8b6b6]/75">
                Se usará en la portada, etiquetas y accesos directos
              </span>
            </div>

            <div className="grid grid-cols-6 gap-2.5 pt-1">
              {COLOR_OPTIONS.map((option) => {
                const active = option.hex === selectedColor.hex;
                return (
                  <button
                    key={option.hex}
                    type="button"
                    aria-label={`Seleccionar color ${option.label}`}
                    aria-pressed={active}
                    onClick={() => setSelectedColor(option)}
                    style={{
                      backgroundColor: option.hex,
                      boxShadow: active
                        ? `0 6px 18px rgba(${option.rgb}, 0.4)`
                        : undefined,
                    }}
                    className={`aspect-square w-full rounded-full flex items-center justify-center transition-all active:scale-90 ${
                      active
                        ? 'scale-105 ring-2 ring-white/80 opacity-100'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    {active && <Check className="w-5 h-5 text-white stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Card Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold tracking-widest uppercase text-[#c8b6b6]/75">
                Vista previa de la biblioteca
              </span>
              <span
                className="font-mono text-[10px] font-semibold"
                style={{ color: selectedColor.hex }}
              >
                {selectedColor.label}
              </span>
            </div>

            <div
              className="relative overflow-hidden rounded-xl p-4 transition-all duration-300 shadow-md border border-white/[0.06]"
              style={{
                background: `linear-gradient(135deg, rgba(${selectedColor.rgb}, 0.16) 0%, rgba(32, 31, 31, 0.96) 60%)`,
              }}
            >
              {/* Left Accent Bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300"
                style={{ backgroundColor: selectedColor.hex }}
              />

              <div className="flex items-center justify-between gap-3 pl-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300"
                    style={{
                      backgroundColor: `rgba(${selectedColor.rgb}, 0.2)`,
                      color: selectedColor.hex,
                    }}
                  >
                    <FolderHeart className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#e5e2e1] truncate">
                      {trimmed || 'Sin título'}
                    </h3>
                    <p className="font-mono text-[11px] text-[#c8b6b6] tabular-nums mt-0.5">
                      0 carpetas • 0 vídeos
                    </p>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-[#353534]/70 text-[#c8b6b6] flex items-center justify-center shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-[52px] rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-sm font-semibold text-[#e5e2e1] active:scale-[0.98] transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className={`h-[52px] rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                canCreate
                  ? 'bg-[#ff5261] text-[#400009] shadow-lg shadow-[#ff5261]/30 hover:brightness-105 active:scale-[0.98]'
                  : 'bg-[#ff5261]/35 text-[#400009]/65 opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[2.75]" />
              <span>Crear biblioteca</span>
            </button>
          </div>

          {onImportLibrary && (
            <div className="pt-1 space-y-2">
              <div className="flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-wider text-[#c8b6b6]/60">
                <span className="h-px flex-1 bg-white/[0.06]" />
                <span>o bien</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>

              <button
                type="button"
                onClick={onImportLibrary}
                className="w-full h-11 px-4 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-[#ffb95f]/30 text-xs font-semibold text-[#e5e2e1] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Download className="w-4 h-4 text-[#ffb95f] shrink-0" />
                <span>Importar biblioteca (.json)</span>
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
