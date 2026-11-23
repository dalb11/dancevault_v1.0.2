import React from 'react';
import { Film, Instagram, Youtube } from 'lucide-react';
import { VideoSourceType } from '../types/dancevault';

interface VideoCoverPlaceholderProps {
  sourceType?: VideoSourceType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const VideoCoverPlaceholder: React.FC<VideoCoverPlaceholderProps> = ({
  sourceType = 'local',
  size = 'md',
}) => {
  if (sourceType === 'instagram') {
    const iconSizeClass =
      size === 'xs'
        ? 'w-4 h-4'
        : size === 'sm'
          ? 'w-5 h-5'
          : size === 'lg'
            ? 'w-12 h-12'
            : 'w-8 h-8';

    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-[#181318] bg-gradient-to-br from-[#833ab4]/35 via-[#fd1d1d]/25 to-[#fcb045]/35 text-[#e5e2e1] ${
          size === 'lg' ? 'gap-2' : size === 'md' ? 'gap-1.5' : 'gap-0.5'
        }`}
      >
        <Instagram className={iconSizeClass} />
        {size === 'md' && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#e5e2e1]/90">
            Instagram Reel
          </span>
        )}
        {size === 'lg' && (
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#e5e2e1]/85">
            Instagram Reel
          </span>
        )}
      </div>
    );
  }

  if (sourceType === 'youtube') {
    const iconSizeClass =
      size === 'xs'
        ? 'w-4 h-4'
        : size === 'sm'
          ? 'w-5 h-5'
          : size === 'lg'
            ? 'w-12 h-12'
            : 'w-8 h-8';

    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#ff5261]/25 via-[#2a1518] to-[#141313] text-[#ffb3b3] ${
          size === 'lg' ? 'gap-2' : size === 'md' ? 'gap-1.5' : 'gap-0.5'
        }`}
      >
        <Youtube className={iconSizeClass} />
        {(size === 'md' || size === 'lg') && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#ffb3b3]/85">
            YouTube
          </span>
        )}
      </div>
    );
  }

  const badgeClass =
    size === 'xs'
      ? 'w-7 h-7 rounded-lg'
      : size === 'sm'
        ? 'w-9 h-9 rounded-xl'
        : size === 'lg'
          ? 'w-16 h-16 rounded-2xl'
          : 'w-12 h-12 rounded-xl';

  const filmSizeClass =
    size === 'xs'
      ? 'w-4 h-4 text-[#ff5261]'
      : size === 'sm'
        ? 'w-5 h-5 text-[#ff5261]'
        : size === 'lg'
          ? 'w-8 h-8 text-[#ff5261]'
          : 'w-6 h-6 text-[#ff5261]';

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#ff5261]/20 via-[#221a1c] to-[#151415] ${
        size === 'lg' ? 'gap-2' : 'gap-1'
      }`}
    >
      <div
        className={`flex items-center justify-center bg-[#ff5261]/15 border border-[#ff5261]/35 shadow-inner ${badgeClass}`}
      >
        <Film className={filmSizeClass} />
      </div>
      {size === 'lg' && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#ffb3b3]/85">
          Vídeo local
        </span>
      )}
    </div>
  );
};
