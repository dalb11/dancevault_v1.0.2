import React from 'react';
import { Folder, Layers, Music2, Sparkles } from 'lucide-react';

interface DefaultIconCoverProps {
  kind: 'library' | 'folder';
  accentHex?: string;
  favorite?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showBadgeLabel?: boolean;
}

export const DefaultIconCover: React.FC<DefaultIconCoverProps> = ({
  kind,
  accentHex,
  favorite = false,
  size = 'md',
  showBadgeLabel = false,
}) => {
  if (kind === 'folder') {
    const primary = favorite ? '#ff5261' : '#ffb95f';
    const secondary = favorite ? '#ffb95f' : '#4cd7f6';

    const iconBoxClass =
      size === 'xs'
        ? 'w-7 h-7 rounded-lg'
        : size === 'sm'
          ? 'w-10 h-10 rounded-xl'
          : size === 'lg'
            ? 'w-16 h-16 rounded-2xl'
            : 'w-12 h-12 rounded-2xl';

    const mainIconClass =
      size === 'xs'
        ? 'w-4 h-4'
        : size === 'sm'
          ? 'w-5 h-5'
          : size === 'lg'
            ? 'w-8 h-8'
            : 'w-6 h-6';

    const accentBadgeClass =
      size === 'xs'
        ? 'hidden'
        : size === 'sm'
          ? 'w-4 h-4 -bottom-1 -right-1'
          : 'w-5 h-5 -bottom-1 -right-1';

    return (
      <div
        className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${primary}2e 0%, ${secondary}12 46%, #181718 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute w-[78%] aspect-square rounded-full border opacity-20"
          style={{ borderColor: primary }}
        />
        <div
          className="pointer-events-none absolute w-[52%] aspect-square rounded-full border border-dashed opacity-20"
          style={{ borderColor: secondary }}
        />

        <div
          className={`relative flex items-center justify-center border shadow-inner ${iconBoxClass}`}
          style={{
            background: `linear-gradient(135deg, ${primary}33 0%, ${secondary}1f 100%)`,
            borderColor: `${primary}66`,
          }}
        >
          <Folder
            className={mainIconClass}
            style={{ color: primary, fill: `${primary}30` }}
          />
          <div
            className={`absolute rounded-full bg-[#181718] border flex items-center justify-center shadow ${accentBadgeClass}`}
            style={{ borderColor: `${secondary}88`, color: secondary }}
          >
            {favorite ? (
              <Sparkles className="w-2.5 h-2.5" />
            ) : (
              <Music2 className="w-2.5 h-2.5" />
            )}
          </div>
        </div>
      </div>
    );
  }

  const primary = accentHex || '#ff5261';
  const secondary = primary.toLowerCase() === '#ffb95f' ? '#ff5261' : '#4cd7f6';

  const iconBoxClass =
    size === 'xs'
      ? 'w-8 h-8 rounded-lg'
      : size === 'sm'
        ? 'w-11 h-11 rounded-xl'
        : size === 'lg'
          ? 'w-16 h-16 rounded-2xl'
          : 'w-14 h-14 rounded-2xl';

  const mainIconClass =
    size === 'xs'
      ? 'w-4 h-4'
      : size === 'sm'
        ? 'w-5 h-5'
        : size === 'lg'
          ? 'w-8 h-8'
          : 'w-7 h-7';

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        background: `radial-gradient(circle at 52% 40%, ${primary}38 0%, ${secondary}14 48%, #161516 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 w-36 h-36 rounded-full blur-2xl opacity-35"
        style={{ backgroundColor: primary }}
      />
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-1.5"
        style={{ backgroundColor: primary }}
      />
      <div
        className="pointer-events-none absolute w-40 h-40 rounded-full border opacity-15"
        style={{ borderColor: primary }}
      />
      <div
        className="pointer-events-none absolute w-28 h-28 rounded-full border border-dashed opacity-20"
        style={{ borderColor: secondary }}
      />

      <div
        className={`relative flex items-center justify-center border shadow-lg ${iconBoxClass}`}
        style={{
          background: `linear-gradient(135deg, ${primary}38 0%, ${secondary}22 100%)`,
          borderColor: `${primary}70`,
        }}
      >
        <Layers className={mainIconClass} style={{ color: primary }} />
        <div
          className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#151415] border flex items-center justify-center shadow"
          style={{ borderColor: `${secondary}88`, color: secondary }}
        >
          <Music2 className="w-3 h-3" />
        </div>
      </div>

      {showBadgeLabel && (
        <span
          className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#131313]/75 border border-white/10"
          style={{ color: primary }}
        >
          Sin portada real
        </span>
      )}
    </div>
  );
};
