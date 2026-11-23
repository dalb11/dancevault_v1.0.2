import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { ProfileItem, UserWorkspaceData } from '../types/dancevault';
import { useBackHandler } from '../utils/backNavigation';
import { exportJsonBackupFile } from '../utils/nativeMediaStorage';
import {
  buildUserBackupPayload,
  getUniqueCopyProfileName,
  getWorkspaceBackupStats,
  parseUserBackupPayload,
} from '../utils/userWorkspaceUtils';

interface UserProfilesModalProps {
  profiles: ProfileItem[];
  activeProfileId: string;
  getWorkspaceForProfile: (profileId: string) => UserWorkspaceData;
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string) => boolean;
  onRenameProfile: (profileId: string, newName: string) => boolean;
  onCopyProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onExportProfileBackup: (profileId: string) => void;
  onImportProfileBackup: (
    targetCopyName: string,
    workspace: UserWorkspaceData
  ) => void;
}

type BackupDialogState =
  | {
      kind: 'export';
      profile: ProfileItem;
      step: 1 | 2;
    }
  | {
      kind: 'import';
      resultingProfileName: string;
      fileName: string;
      sourceProfileName?: string;
      exportedAt?: string;
      workspace: UserWorkspaceData;
      step: 1 | 2;
    };

function slugifyFileName(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'usuario'
  );
}

export const UserProfilesModal: React.FC<UserProfilesModalProps> = ({
  profiles,
  activeProfileId,
  getWorkspaceForProfile,
  onClose,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onCopyProfile,
  onDeleteProfile,
  onExportProfileBackup,
  onImportProfileBackup,
}) => {
  const [creatingUser, setCreatingUser] = useState(false);
  const [newNameDraft, setNewNameDraft] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Two-step irreversible delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ProfileItem | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);

  // Two-step backup export/import confirmation state
  const [backupDialog, setBackupDialog] = useState<BackupDialogState | null>(
    null
  );
  const [backupError, setBackupError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Android Back / gesture layers inside UserProfilesModal
  useBackHandler(creatingUser, () => setCreatingUser(false), 60);
  useBackHandler(
    Boolean(editingProfileId),
    () => {
      setEditingProfileId(null);
      setRenameError(null);
    },
    60
  );
  useBackHandler(Boolean(deleteTarget), () => setDeleteTarget(null), 65);
  useBackHandler(Boolean(backupDialog), () => setBackupDialog(null), 65);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newNameDraft.trim();
    if (!cleaned) {
      setCreateError('Escribe un nombre para el usuario.');
      return;
    }
    const duplicate = profiles.some(
      (p) => p.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) {
      setCreateError('Ya existe un usuario con ese nombre.');
      return;
    }
    const ok = onCreateProfile(cleaned);
    if (ok) {
      setNewNameDraft('');
      setCreateError(null);
      setCreatingUser(false);
    }
  };

  const handleStartRename = (profile: ProfileItem) => {
    setEditingProfileId(profile.id);
    setRenameDraft(profile.name);
    setRenameError(null);
  };

  const handleConfirmRename = (profile: ProfileItem) => {
    const cleaned = renameDraft.trim();
    if (!cleaned) {
      setRenameError('El nombre no puede estar vacío.');
      return;
    }
    const duplicate = profiles.some(
      (p) =>
        p.id !== profile.id &&
        p.name.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) {
      setRenameError('Ya existe otro usuario con ese nombre.');
      return;
    }
    const ok = onRenameProfile(profile.id, cleaned);
    if (ok) {
      setEditingProfileId(null);
      setRenameError(null);
    }
  };

  const handleRequestDelete = (profile: ProfileItem) => {
    if (profile.isMaster) return;
    setEditingProfileId(null);
    setDeleteTarget(profile);
    setDeleteStep(1);
  };

  const handleRequestExportBackup = (profile: ProfileItem) => {
    setBackupError(null);
    setBackupDialog({
      kind: 'export',
      profile,
      step: 1,
    });
  };

  const handleTriggerImportFile = () => {
    setBackupError(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) {
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseUserBackupPayload(content);
      if (!parsed) {
        setBackupError(
          'El archivo seleccionado no es una copia de seguridad válida de DanceVault.'
        );
        return;
      }

      const sourceBase =
        parsed.profileName ||
        file.name
          .replace(/^dancevault-/i, '')
          .replace(/-\d{4}-\d{2}-\d{2}\.json$/i, '')
          .replace(/\.json$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim() ||
        'Usuario importado';

      const resultingProfileName = getUniqueCopyProfileName(
        sourceBase,
        profiles
      );

      setBackupError(null);
      setBackupDialog({
        kind: 'import',
        resultingProfileName,
        fileName: file.name,
        sourceProfileName: parsed.profileName || sourceBase,
        exportedAt: parsed.exportedAt,
        workspace: parsed.workspace,
        step: 1,
      });
    };
    reader.onerror = () => {
      setBackupError('No se pudo leer el archivo seleccionado.');
    };
    reader.onloadend = () => {
      inputEl.value = '';
    };
    reader.readAsText(file);
  };

  const executeBackupDownload = async (profile: ProfileItem) => {
    const ws = getWorkspaceForProfile(profile.id);
    const payload = buildUserBackupPayload(profile.name, ws);
    const jsonText = JSON.stringify(payload, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `dancevault-${slugifyFileName(profile.name)}-${dateStamp}.json`;

    try {
      const outcome = await exportJsonBackupFile(filename, jsonText);
      if (outcome !== 'cancelled') {
        onExportProfileBackup(profile.id);
      }
    } catch {
      setBackupError(
        'No se pudo generar o compartir la copia de seguridad en este dispositivo.'
      );
    }
  };

  const targetStats = deleteTarget
    ? getWorkspaceBackupStats(getWorkspaceForProfile(deleteTarget.id))
    : null;

  const backupStats = backupDialog
    ? backupDialog.kind === 'export'
      ? getWorkspaceBackupStats(
          getWorkspaceForProfile(backupDialog.profile.id)
        )
      : getWorkspaceBackupStats(backupDialog.workspace)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#201f1f] rounded-2xl border border-white/10 p-5 space-y-4 max-h-[88dvh] flex flex-col shadow-2xl"
      >
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json,text/json"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={handleImportFileChange}
        />
        {/* Header */}
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-[#e5e2e1]">
              Perfiles de usuario
            </h3>
            <p className="text-[11px] text-[#c8b6b6] mt-0.5">
              Cada usuario tiene bibliotecas, carpetas, vídeos y copias de
              seguridad independientes.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar perfiles"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#c8b6b6] hover:bg-[#2a2a2a] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {backupError && (
          <div className="p-2.5 rounded-xl bg-[#93000a]/30 border border-[#ffb4ab]/30 flex items-start justify-between gap-2 text-xs text-[#ffb4ab] shrink-0">
            <span>{backupError}</span>
            <button
              type="button"
              onClick={() => setBackupError(null)}
              className="text-[#ffb4ab] hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Profiles List */}
        <div className="space-y-2.5 overflow-y-auto pr-0.5 flex-1">
          {profiles.map((p) => {
            const isCurrent = p.id === activeProfileId;
            const isEditing = editingProfileId === p.id;
            const ws = getWorkspaceForProfile(p.id);
            const libCount = ws.libraries.length;
            const vidCount = ws.entries.filter((e) => e.type === 'video').length;

            return (
              <div
                key={p.id}
                onClick={() => {
                  if (!isEditing) onSelectProfile(p.id);
                }}
                className={`rounded-xl px-3 py-2.5 border transition-colors space-y-2 ${
                  isEditing
                    ? 'cursor-default bg-[#252424] border-[#ffb95f]/50'
                    : isCurrent
                      ? 'cursor-pointer bg-[#2a2a2a] border-[#ff5261]/70'
                      : 'cursor-pointer bg-[#1c1b1b] border-white/[0.06] hover:bg-[#262525]'
                }`}
              >
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleConfirmRename(p);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        maxLength={32}
                        value={renameDraft}
                        onChange={(e) => {
                          setRenameDraft(e.target.value);
                          setRenameError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingProfileId(null);
                            setRenameError(null);
                          }
                        }}
                        placeholder="Nuevo nombre de usuario..."
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
                        aria-label="Cancelar renombrado"
                        onClick={() => {
                          setEditingProfileId(null);
                          setRenameError(null);
                        }}
                        className="w-9 h-9 rounded-lg bg-[#353534] text-[#c8b6b6] flex items-center justify-center shrink-0 active:scale-95"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {renameError && (
                      <p className="text-[11px] text-[#ffb4ab]">{renameError}</p>
                    )}
                  </form>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            p.isMaster
                              ? 'bg-sky-500/20 text-sky-400'
                              : isCurrent
                                ? 'bg-[#ff5261]/20 text-[#ffb3b3]'
                                : 'bg-[#2a2a2a] text-[#c8b6b6]'
                          }`}
                        >
                          {p.isMaster ? (
                            <ShieldCheck className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-sm font-bold break-words ${
                                p.isMaster ? 'text-sky-400' : 'text-[#e5e2e1]'
                              }`}
                            >
                              {p.name}
                            </span>
                            {p.isMaster && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[9px] font-bold uppercase shrink-0">
                                Principal
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-[#ff5261]/20 text-[#ffb3b3] font-mono text-[9px] font-bold uppercase shrink-0">
                                Activo
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-[#c8b6b6] mt-0.5 tabular-nums">
                            {libCount === 0 && vidCount === 0
                              ? 'Espacio vacío · 0 bibliotecas'
                              : `${libCount} ${libCount === 1 ? 'biblioteca' : 'bibliotecas'} · ${vidCount} ${vidCount === 1 ? 'vídeo' : 'vídeos'}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Renombrar usuario"
                          aria-label={`Renombrar ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(p);
                          }}
                          className="w-8 h-8 rounded-lg bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center justify-center active:scale-95 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Copiar usuario y sus bibliotecas"
                          aria-label={`Copiar ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyProfile(p.id);
                          }}
                          className="w-8 h-8 rounded-lg bg-[#2a2a2a] hover:bg-[#353534] text-[#4cd7f6] flex items-center justify-center active:scale-95 transition-all"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {!p.isMaster && (
                          <button
                            type="button"
                            title="Eliminar usuario"
                            aria-label={`Eliminar ${p.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDelete(p);
                            }}
                            className="w-8 h-8 rounded-lg bg-[#2a2a2a] hover:bg-[#93000a]/60 text-[#c8b6b6] hover:text-[#ffb4ab] flex items-center justify-center active:scale-95 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-user Export Backup Action (Upward arrow) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-white/[0.06]"
                    >
                      <button
                        type="button"
                        onClick={() => handleRequestExportBackup(p)}
                        className="w-full h-8 px-2.5 rounded-lg bg-[#131313]/80 hover:bg-[#353534] text-[11px] font-semibold text-[#e5e2e1] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                        <span>Exportar copia de seguridad (.json)</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Create Empty User Section / Footer Actions */}
        {creatingUser ? (
          <form
            onSubmit={handleCreateSubmit}
            className="p-3 rounded-xl bg-[#1c1b1b] border border-[#ffb95f]/40 space-y-2.5 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#ffb95f]">
                Nuevo usuario (espacio vacío)
              </span>
              <button
                type="button"
                onClick={() => {
                  setCreatingUser(false);
                  setCreateError(null);
                  setNewNameDraft('');
                }}
                className="text-[11px] text-[#c8b6b6] hover:text-[#e5e2e1]"
              >
                Cancelar
              </button>
            </div>
            <p className="text-[11px] text-[#c8b6b6] leading-snug">
              Entrarás en un perfil completamente vacío: sin bibliotecas, carpetas ni vídeos.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                maxLength={32}
                value={newNameDraft}
                onChange={(e) => {
                  setNewNameDraft(e.target.value);
                  setCreateError(null);
                }}
                placeholder={`Ej. Bailarín ${profiles.length + 1}`}
                className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-[#131313] border border-white/15 text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none focus:border-[#ffb95f]"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-lg bg-[#ffb95f] text-[#472a00] text-xs font-extrabold shrink-0 active:scale-95 transition-transform"
              >
                Crear
              </button>
            </div>
            {createError && (
              <p className="text-[11px] text-[#ffb4ab]">{createError}</p>
            )}
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCreatingUser(true);
                setNewNameDraft(`Bailarín ${profiles.length + 1}`);
                setCreateError(null);
              }}
              className="h-11 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-semibold text-[#e5e2e1] flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4 text-[#ffb95f] shrink-0" />
              <span>Crear usuario</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerImportFile}
              className="h-11 px-3 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] border border-[#ffb95f]/25 text-xs font-semibold text-[#e5e2e1] flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 text-[#ffb95f] shrink-0" />
              <span>Importar usuario (.json)</span>
            </button>
          </div>
        )}
      </div>

      {/* 2-Step Irreversible Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[#201f1f] border border-[#ffb4ab]/30 p-5 space-y-4 shadow-2xl"
          >
            {deleteStep === 1 ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#ffb95f]/20 text-[#ffb95f] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-[#e5e2e1]">
                      ¿Eliminar usuario &laquo;{deleteTarget.name}&raquo;?
                    </h4>
                    <p className="text-xs text-[#ffb95f] font-semibold">
                      Atención: esta acción no tiene vuelta atrás.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#1c1b1b] border border-white/[0.06] space-y-1.5 text-xs text-[#c8b6b6] leading-relaxed">
                  <p>
                    Si eliminas este usuario se perderán para siempre sus datos
                    independientes (bibliotecas, carpetas, vídeos, bucles y
                    etiquetas).
                  </p>
                  {targetStats && (
                    <p className="font-mono text-[11px] text-[#e5e2e1]">
                      Contenido afectado: {targetStats.librariesCount}{' '}
                      {targetStats.librariesCount === 1
                        ? 'biblioteca'
                        : 'bibliotecas'}{' '}
                      · {targetStats.videosCount}{' '}
                      {targetStats.videosCount === 1 ? 'vídeo' : 'vídeos'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    className="h-11 rounded-xl bg-[#ffb95f] hover:bg-[#ffa834] text-xs font-extrabold text-[#472a00] active:scale-95 transition-all"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#93000a]/60 text-[#ffb4ab] flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-[#ffb4ab]">
                      Confirmación definitiva
                    </h4>
                    <p className="text-xs text-[#e5e2e1] font-medium">
                      Último paso antes de borrar para siempre
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#c8b6b6] leading-relaxed bg-[#1c1b1b] p-3 rounded-xl border border-[#ffb4ab]/20">
                  ¿Confirmas definitivamente que deseas borrar al usuario{' '}
                  <strong className="text-[#e5e2e1]">{deleteTarget.name}</strong>{' '}
                  y todo su contenido? No se podrá deshacer ni recuperar después.
                </p>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idToDelete = deleteTarget.id;
                      setDeleteTarget(null);
                      onDeleteProfile(idToDelete);
                    }}
                    className="h-11 rounded-xl bg-[#93000a] hover:bg-[#b5000e] text-xs font-extrabold text-[#ffdad6] active:scale-95 transition-all"
                  >
                    Borrar definitivamente
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2-Step Backup Export / Import Confirmation Dialog */}
      {backupDialog && backupStats && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setBackupDialog(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[#201f1f] border border-white/15 p-5 space-y-4 shadow-2xl"
          >
            {backupDialog.kind === 'export' ? (
              backupDialog.step === 1 ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#4cd7f6]/20 text-[#4cd7f6] flex items-center justify-center shrink-0">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-[#e5e2e1]">
                        Exportar copia de &laquo;{backupDialog.profile.name}&raquo;
                      </h4>
                      <p className="text-xs text-[#4cd7f6] font-semibold">
                        Paso 1 de 2 · Revisión de la copia de seguridad
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#1c1b1b] border border-white/[0.06] space-y-2 text-xs text-[#c8b6b6] leading-relaxed">
                    <p>
                      Se generará un archivo{' '}
                      <strong className="text-[#e5e2e1]">.json</strong> con toda
                      la organización independiente de este usuario:
                      bibliotecas, carpetas, enlaces, notas, etiquetas y bucles
                      A-B guardados.
                    </p>
                    <p className="font-mono text-[11px] text-[#e5e2e1]">
                      Resumen: {backupStats.librariesCount} bibl. ·{' '}
                      {backupStats.foldersCount} carp. · {backupStats.videosCount}{' '}
                      vídeos · {backupStats.loopsCount} bucles
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setBackupDialog(null)}
                      className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBackupDialog((prev) =>
                          prev ? { ...prev, step: 2 } : null
                        )
                      }
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
                    ¿Confirmas que deseas descargar la copia de seguridad
                    completa de{' '}
                    <strong className="text-[#e5e2e1]">
                      {backupDialog.profile.name}
                    </strong>{' '}
                    en tu dispositivo?
                  </p>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setBackupDialog(null)}
                      className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetProfile = backupDialog.profile;
                        setBackupDialog(null);
                        void executeBackupDownload(targetProfile);
                      }}
                      className="h-11 rounded-xl bg-[#4cd7f6] text-[#003640] text-xs font-extrabold active:scale-95 transition-all"
                    >
                      Descargar copia
                    </button>
                  </div>
                </>
              )
            ) : backupDialog.step === 1 ? (
              (() => {
                const importTrimmedName = backupDialog.resultingProfileName.trim();
                const importNameEmpty = importTrimmedName.length === 0;
                const importNameDuplicate =
                  importTrimmedName.length > 0 &&
                  profiles.some(
                    (p) =>
                      p.name.trim().toLowerCase() ===
                      importTrimmedName.toLowerCase()
                  );
                const canAdvanceImport =
                  !importNameEmpty && !importNameDuplicate;

                return (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!canAdvanceImport) return;
                      setBackupDialog((prev) =>
                        prev && prev.kind === 'import'
                          ? {
                              ...prev,
                              resultingProfileName: importTrimmedName,
                              step: 2,
                            }
                          : prev
                      );
                    }}
                    className="space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#ffb95f]/20 text-[#ffb95f] flex items-center justify-center shrink-0">
                        <Download className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-bold text-[#e5e2e1]">
                          ¿Importar como nuevo usuario?
                        </h4>
                        <p className="text-xs text-[#ffb95f] font-semibold">
                          Paso 1 de 2 · Elige el nombre del nuevo usuario
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#1c1b1b] border border-white/[0.06] space-y-2 text-xs text-[#c8b6b6] leading-relaxed">
                      <p className="truncate">
                        Archivo:{' '}
                        <strong className="text-[#e5e2e1]">
                          {backupDialog.fileName}
                        </strong>
                      </p>
                      {backupDialog.sourceProfileName && (
                        <p>
                          Usuario original:{' '}
                          <strong className="text-[#e5e2e1]">
                            {backupDialog.sourceProfileName}
                          </strong>
                        </p>
                      )}
                      <p className="font-mono text-[11px] text-[#e5e2e1]">
                        Contenido: {backupStats.librariesCount} bibl. ·{' '}
                        {backupStats.foldersCount} carp. ·{' '}
                        {backupStats.videosCount} vídeos ·{' '}
                        {backupStats.loopsCount} bucles
                      </p>

                      <div className="pt-1 space-y-1.5">
                        <label
                          htmlFor="import-user-name-input"
                          className="block text-[11px] font-semibold text-[#e5e2e1]"
                        >
                          Nombre del nuevo usuario
                        </label>
                        <div className="relative flex items-center">
                          <input
                            id="import-user-name-input"
                            type="text"
                            autoFocus
                            maxLength={32}
                            value={backupDialog.resultingProfileName}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setBackupDialog((prev) =>
                                prev && prev.kind === 'import'
                                  ? { ...prev, resultingProfileName: nextVal }
                                  : prev
                              );
                            }}
                            placeholder="Escribe el nombre del usuario..."
                            className={`w-full h-10 pl-3 pr-8 rounded-lg bg-[#131313] border text-sm text-[#e5e2e1] placeholder:text-[#c8b6b6]/50 focus:outline-none ${
                              importNameDuplicate
                                ? 'border-[#ffb4ab]/80'
                                : 'border-white/15 focus:border-[#ffb95f]'
                            }`}
                          />
                          {backupDialog.resultingProfileName.length > 0 && (
                            <button
                              type="button"
                              aria-label="Limpiar nombre"
                              onClick={() =>
                                setBackupDialog((prev) =>
                                  prev && prev.kind === 'import'
                                    ? { ...prev, resultingProfileName: '' }
                                    : prev
                                )
                              }
                              className="absolute right-2 w-5 h-5 rounded-full bg-[#2a2a2a] text-[#c8b6b6] hover:text-[#e5e2e1] flex items-center justify-center"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {importNameEmpty ? (
                          <p className="text-[11px] text-[#ffb4ab]">
                            Escribe un nombre para crear el nuevo usuario.
                          </p>
                        ) : importNameDuplicate ? (
                          <p className="text-[11px] text-[#ffb4ab]">
                            Ya existe otro usuario con ese nombre.
                          </p>
                        ) : (
                          <p className="text-[11px] text-[#c8b6b6]/80">
                            Ningún usuario existente será modificado ni
                            sobrescrito.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setBackupDialog(null)}
                        className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={!canAdvanceImport}
                        className={`h-11 rounded-xl text-xs font-extrabold transition-all ${
                          canAdvanceImport
                            ? 'bg-[#ffb95f] hover:bg-[#ffa834] text-[#472a00] active:scale-95'
                            : 'bg-[#ffb95f]/35 text-[#472a00]/65 opacity-55 cursor-not-allowed'
                        }`}
                      >
                        Continuar
                      </button>
                    </div>
                  </form>
                );
              })()
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
                      Paso 2 de 2 · Creación de copia exacta
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#c8b6b6] leading-relaxed bg-[#1c1b1b] p-3 rounded-xl border border-[#4cd7f6]/25">
                  ¿Confirmas definitivamente que deseas crear el usuario{' '}
                  <strong className="text-[#e5e2e1]">
                    {backupDialog.resultingProfileName}
                  </strong>{' '}
                  con una copia exacta de todas las bibliotecas, carpetas,
                  vídeos y bucles del archivo?
                </p>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setBackupDialog(null)}
                    className="h-11 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-xs font-bold text-[#e5e2e1] active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetName = backupDialog.resultingProfileName;
                      const importedWs = backupDialog.workspace;
                      setBackupDialog(null);
                      onImportProfileBackup(targetName, importedWs);
                    }}
                    className="h-11 rounded-xl bg-[#ff5261] hover:bg-[#ff6875] text-xs font-extrabold text-[#400009] active:scale-95 transition-all"
                  >
                    Crear e importar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
