import React, { useId } from 'react';

interface DanceVaultLogoProps {
  className?: string;
  size?: number;
  roundedClassName?: string;
}

/**
 * Official DanceVault Brand Mark:
 * - Obsidian vault jewel frame with subtle coral stage glow
 * - Kinetic cyan-to-amber orbital A-B practice loop arc
 * - Sculpted dance-ribbon spine + coral-crimson Play vault prism ("DV")
 */
export const DanceVaultLogo: React.FC<DanceVaultLogoProps> = ({
  className = '',
  size = 36,
  roundedClassName = 'rounded-xl',
}) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `dv-bg-${uid}`;
  const glowId = `dv-glow-${uid}`;
  const arcId = `dv-arc-${uid}`;
  const spineId = `dv-spine-${uid}`;
  const playId = `dv-play-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${roundedClassName} shrink-0 shadow-[0_4px_16px_rgba(255,82,97,0.28)] ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bgId} x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2a161b" />
          <stop offset="52%" stopColor="#181517" />
          <stop offset="100%" stopColor="#100f10" />
        </linearGradient>

        <radialGradient id={glowId} cx="50%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#ff5261" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#ffb95f" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#131313" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={arcId} x1="12" y1="50" x2="52" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4cd7f6" />
          <stop offset="55%" stopColor="#ffb95f" />
          <stop offset="100%" stopColor="#ff5261" />
        </linearGradient>

        <linearGradient id={spineId} x1="18" y1="15" x2="26" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffb95f" />
          <stop offset="100%" stopColor="#ff5261" />
        </linearGradient>

        <linearGradient id={playId} x1="25" y1="17" x2="49" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff7480" />
          <stop offset="45%" stopColor="#ff5261" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>

      {/* Vault Jewel Backdrop */}
      <rect x="1.5" y="1.5" width="61" height="61" rx="15" fill={`url(#${bgId})`} />
      <rect x="1.5" y="1.5" width="61" height="61" rx="15" fill={`url(#${glowId})`} />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15"
        stroke="#ff5261"
        strokeOpacity="0.38"
        strokeWidth="1.5"
      />

      {/* Precision Vault Corner Ticks */}
      <path
        d="M11 16V12.5C11 11.67 11.67 11 12.5 11H16M48 11H51.5C52.33 11 53 11.67 53 12.5V16M53 48V51.5C53 52.33 52.33 53 51.5 53H48M16 53H12.5C11.67 53 11 52.33 11 51.5V48"
        stroke="#ffffff"
        strokeOpacity="0.14"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Orbital Rhythm & A-B Loop Arc */}
      <path
        d="M46.5 45.8C39.2 52.2 27.6 52.8 19.6 46.5C11.5 40.1 10.1 28.4 16.2 20.1C21.8 12.4 32.3 10.1 40.9 14.3"
        stroke={`url(#${arcId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeOpacity="0.92"
      />
      <circle cx="48.5" cy="43.5" r="2.2" fill="#4cd7f6" />

      {/* Kinetic Dance Spine ("D" Ribbon Curve / Vault Pillar) */}
      <path
        d="M21.5 19.5C24.8 22.8 24.8 41.2 21.5 44.5"
        stroke={`url(#${spineId})`}
        strokeWidth="4.2"
        strokeLinecap="round"
      />

      {/* Sculpted Vault Play Prism ("V" + Forward Play Core) */}
      <path
        d="M28.5 20.3C28.5 18.7 30.25 17.75 31.6 18.6L48.6 29.3C49.9 30.12 49.9 32.02 48.6 32.84L31.6 43.54C30.25 44.39 28.5 43.42 28.5 41.84V20.3Z"
        fill={`url(#${playId})`}
      />
      {/* Crisp Inner Stage Highlight */}
      <path
        d="M31.2 22.4L44.8 31.07L31.2 39.74V22.4Z"
        stroke="#ffd6db"
        strokeOpacity="0.32"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
};
