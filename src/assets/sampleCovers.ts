export interface DefaultIconCoverPreset {
  id: string;
  label: string;
  subtitle: string;
  accentHex: string;
  url: string;
}

const LEGACY_GENERATED_FILENAME_RE =
  /(?:bachata_library_cover|salsa_library_cover|kizomba_library_cover|practice_library_cover|folder_spins_thumb|folder_musical_thumb|video_cinta_thumb|video_shadow_thumb|video_onda_thumb)/i;

function encodeSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

function buildLibraryIconCoverSvg(options: {
  id: string;
  primaryHex: string;
  secondaryHex: string;
  innerPath: string;
}): string {
  const { id, primaryHex, secondaryHex, innerPath } = options;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#191718"/>
      <stop offset="55%" stop-color="#141314"/>
      <stop offset="100%" stop-color="#1d1a1c"/>
    </linearGradient>
    <radialGradient id="glow-${id}" cx="50%" cy="46%" r="55%">
      <stop offset="0%" stop-color="${primaryHex}" stop-opacity="0.34"/>
      <stop offset="48%" stop-color="${secondaryHex}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#141314" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tile-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryHex}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${secondaryHex}" stop-opacity="0.14"/>
    </linearGradient>
    <linearGradient id="stroke-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryHex}"/>
      <stop offset="100%" stop-color="${secondaryHex}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg-${id})"/>
  <rect width="640" height="360" fill="url(#glow-${id})"/>
  <g opacity="0.14" stroke="${primaryHex}" stroke-width="1.2" fill="none">
    <circle cx="320" cy="166" r="142"/>
    <circle cx="320" cy="166" r="102" stroke-dasharray="6 8"/>
  </g>
  <g opacity="0.12" stroke="${secondaryHex}" stroke-width="1">
    <line x1="0" y1="300" x2="210" y2="90"/>
    <line x1="430" y1="270" x2="640" y2="60"/>
  </g>
  <rect x="252" y="98" width="136" height="136" rx="34" fill="url(#tile-${id})" stroke="url(#stroke-${id})" stroke-width="2.5"/>
  <rect x="262" y="108" width="116" height="116" rx="26" fill="#131313" fill-opacity="0.45"/>
  <g transform="translate(320 166)" stroke="url(#stroke-${id})" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${innerPath}
  </g>
</svg>`;
  return encodeSvgDataUri(svg);
}

export const DEFAULT_LIBRARY_ICON_COVERS: DefaultIconCoverPreset[] = [
  {
    id: 'dv-icon-coral',
    label: 'Ritmo Coral',
    subtitle: 'Discoteca & pulso',
    accentHex: '#ff5261',
    url: buildLibraryIconCoverSvg({
      id: 'coral',
      primaryHex: '#ff5261',
      secondaryHex: '#ffb95f',
      innerPath: `
        <circle cx="0" cy="0" r="30"/>
        <circle cx="0" cy="0" r="10" fill="#ff5261" fill-opacity="0.28"/>
        <path d="M-42 -12v24M42 -18v36M-20 -38h40"/>
      `,
    }),
  },
  {
    id: 'dv-icon-amber',
    label: 'Compás Ámbar',
    subtitle: 'Musicalidad & tiempo',
    accentHex: '#ffb95f',
    url: buildLibraryIconCoverSvg({
      id: 'amber',
      primaryHex: '#ffb95f',
      secondaryHex: '#ff5261',
      innerPath: `
        <path d="M-24 22V-22L18 -30V14"/>
        <circle cx="-30" cy="22" r="9" fill="#ffb95f" fill-opacity="0.3"/>
        <circle cx="12" cy="14" r="9" fill="#ffb95f" fill-opacity="0.3"/>
        <path d="M30 -16c8 8 8 24 0 32"/>
      `,
    }),
  },
  {
    id: 'dv-icon-cyan',
    label: 'Fluidez Cian',
    subtitle: 'Giros & dinámica',
    accentHex: '#4cd7f6',
    url: buildLibraryIconCoverSvg({
      id: 'cyan',
      primaryHex: '#4cd7f6',
      secondaryHex: '#3b82f6',
      innerPath: `
        <path d="M-32 4c0-18 14-30 32-30 14 0 26 8 30 20"/>
        <path d="M22 -14l10 10 10-10"/>
        <path d="M32 -4c0 18-14 30-32 30-14 0-26-8-30-20"/>
        <path d="M-22 14l-10-10-10 10"/>
      `,
    }),
  },
  {
    id: 'dv-icon-emerald',
    label: 'Técnica Esmeralda',
    subtitle: 'Colección & estudio',
    accentHex: '#10b981',
    url: buildLibraryIconCoverSvg({
      id: 'emerald',
      primaryHex: '#10b981',
      secondaryHex: '#4cd7f6',
      innerPath: `
        <path d="M0 -30l34 16-34 16-34-16z" fill="#10b981" fill-opacity="0.25"/>
        <path d="M-34 0l34 16 34-16"/>
        <path d="M-34 16l34 16 34-16"/>
      `,
    }),
  },
  {
    id: 'dv-icon-violet',
    label: 'Fusión Violeta',
    subtitle: 'Pareja & estilos',
    accentHex: '#a855f7',
    url: buildLibraryIconCoverSvg({
      id: 'violet',
      primaryHex: '#a855f7',
      secondaryHex: '#ec4899',
      innerPath: `
        <circle cx="-13" cy="0" r="22" fill="#a855f7" fill-opacity="0.18"/>
        <circle cx="13" cy="0" r="22" fill="#ec4899" fill-opacity="0.18"/>
      `,
    }),
  },
  {
    id: 'dv-icon-magenta',
    label: 'Escena Magenta',
    subtitle: 'Coreografía & show',
    accentHex: '#ec4899',
    url: buildLibraryIconCoverSvg({
      id: 'magenta',
      primaryHex: '#ec4899',
      secondaryHex: '#ffb95f',
      innerPath: `
        <path d="M0 -32l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z" fill="#ec4899" fill-opacity="0.25"/>
      `,
    }),
  },
];

const DEFAULT_ICON_URL_SET = new Set(
  DEFAULT_LIBRARY_ICON_COVERS.map((item) => item.url)
);

export function isDefaultIconCoverUrl(url: string | undefined): boolean {
  if (!url) return false;
  return DEFAULT_ICON_URL_SET.has(url);
}

export function resolvePersistedCoverUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('blob:')) return '';
  if (
    url.startsWith('/src/assets/images/') ||
    LEGACY_GENERATED_FILENAME_RE.test(url)
  ) {
    return '';
  }
  return url;
}
