import React from 'react';
import { Download, Upload } from 'lucide-react';
import { LibraryItem } from '../types/dancevault';
import { ParsedLibraryBackup } from '../utils/libraryBackupUtils';
import { useBackHandler } from '../utils/backNavigation';

export type LibraryBackupDialogState =
  | {
      kind: 'export';
      library: LibraryItem;
      stats: { foldersCount: number; videosCount: number; loopsCount: number };
      step: 1 | 2;
    }
  | {
      kind: 'import';
      fileName: string;
      sourceLibraryName: string;
      resultingLibraryName: string;
      sourceProfileName?: string;
      activeProfileName: string;
      stats: { foldersCount: number; videosCount: number; loopsCount: number };
      backup: ParsedLibraryBackup;
      step: 1 | 2;
    };

interface LibraryBackupConfirmModalProps {
  dialog: LibraryBackupDialogState;
  onClose: () => void;
  onAdvanceStep: () => void;
  onConfirmExport: (library: LibraryItem) => void;
  onConfirmImport: (
    backup: ParsedLibraryBackup,
    resultingLibraryName: string
  ) => void;
}

export const LibraryBackupConfirmModal: React.FC<
  LibraryBackupConfirmModalProps
> = ({
  dialog,
  onClose,
  onAdvanceStep,
  onConfirmExport,
  onConfirmImport,
}) => {
  useBackHandler(true, onClose, 65);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[#201f1f] border border-white/15 p-5 space-y-4 shadow-2xl"
      >
        {dialog.kind === 'export' ? (
          dialog.step === 1 ? (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h4 className="text-base font-bold text-[#e5e2e1] break-words">
                    Exportar biblioteca &laquo;{dialog.library.name}&raquo;
                  </h4>
                  <p className="text-xs text-[#4cd7f6] font-semibold">
                    Paso 1 de 2 · Revisión de la copia
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#1c1b1b] border border-white/[0.06] space-y-2 text-xs text-[#c8b6b6] leading-relaxed">
                <p>
                  Se generará un archivo{' '}
                  <strong className="text-[#e5e2e1]">.json</strong> con toda la
                  estructura de esta biblioteca (carpetas, vídeos, enlaces,
                  etiquetas, notas y bucles A-B) para poder compartirla con otros
                  usuarios o dispositivos.
                </p>
                <p className="font-mono text-[11px] text-[#e5e2e1]">
                  Contenido: {dialog.stats.foldersCount} carp. ·{' '}
                  {dialog.stats.videosCount} vídeos · {dialog.stats.loopsCount}{' '}
                  bucles
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onAdvanceStep}
                  className="h-11 rounded-xl bg-[#4cd7f6] text-[#003640] text-xs font-extrabold active:scale-95 transition-all"
                >
                  Continuar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-[#e5e2e1]">
                    Confirmar exportación
                  </h4>
                  <p className="text-xs text-[#4cd7f6] font-semibold">
                    Paso 2 de 2 · Confirmación definitiva
                  </p>
                </div>
              </div>

              <p className="text-xs text-[#c8b6b6] leading-relaxed bg-[#1c1b1b] p-3 rounded-xl border border-[#4cd7f6]/20">
                ¿Confirmas que deseas descargar la biblioteca{' '}
                <strong className="text-[#e5e2e1]">{dialog.library.name}</strong>{' '}
                como archivo <strong className="text-[#e5e2e1]">.json</strong>{' '}
                en tu dispositivo?
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => onConfirmExport(dialog.library)}
                  className="h-11 rounded-xl bg-[#4cd7f6] text-[#003640] text-xs font-extrabold active:scale-95 transition-all"
                >
                  Descargar copia
                </button>
              </div>
            </>
          )
        ) : dialog.step === 1 ? (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#ffb95f]/20 text-[#ffb95f] flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#e5e2e1]">
                  ¿Importar biblioteca desde copia?
                </h4>
                <p className="text-xs text-[#ffb95f] font-semibold">
                  Paso 1 de 2 · Destino: {dialog.activeProfileName}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#1c1b1b] border border-white/[0.06] space-y-1.5 text-xs text-[#c8b6b6] leading-relaxed">
              <p className="truncate">
                Archivo:{' '}
                <strong className="text-[#e5e2e1]">{dialog.fileName}</strong>
              </p>
              <p>
                Biblioteca original:{' '}
                <strong className="text-[#e5e2e1]">
                  {dialog.sourceLibraryName}
                </strong>
              </p>
              {dialog.sourceProfileName && (
                <p>
                  Usuario origen:{' '}
                  <strong className="text-[#e5e2e1]">
                    {dialog.sourceProfileName}
                  </strong>
                </p>
              )}
              <p>
                Se añadirá como:{' '}
                <strong className="text-[#4cd7f6]">
                  {dialog.resultingLibraryName}
                </strong>
              </p>
              <p className="font-mono text-[11px] text-[#e5e2e1]">
                Contenido: {dialog.stats.foldersCount} carp. ·{' '}
                {dialog.stats.videosCount} vídeos · {dialog.stats.loopsCount}{' '}
                bucles
              </p>
              <p className="text-[11px] text-[#c8b6b6]/80">
                Tus bibliotecas actuales de este usuario no se modificarán ni
                sobrescribirán.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onAdvanceStep}
                className="h-11 rounded-xl bg-[#ffb95f] hover:bg-[#ffa834] text-xs font-extrabold text-[#472a00] active:scale-95 transition-all"
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#e5e2e1]">
                  Confirmación definitiva
                </h4>
                <p className="text-xs text-[#4cd7f6] font-semibold">
                  Paso 2 de 2 · Añadir al perfil activo
                </p>
              </div>
            </div>

            <p className="text-xs text-[#c8b6b6] leading-relaxed bg-[#1c1b1b] p-3 rounded-xl border border-[#4cd7f6]/25">
              ¿Confirmas definitivamente que deseas importar la biblioteca{' '}
              <strong className="text-[#e5e2e1]">
                {dialog.resultingLibraryName}
              </strong>{' '}
              dentro de{' '}
              <strong className="text-[#e5e2e1]">
                {dialog.activeProfileName}
              </strong>
              ?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfirmImport(dialog.backup, dialog.resultingLibraryName)
                }
                className="h-11 rounded-xl bg-[#ff5261] hover:bg-[#ff6875] text-xs font-extrabold text-[#400009] active:scale-95 transition-all"
              >
                Importar biblioteca
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
