import { SavedLoopItem, VideoEntry } from '../types/dancevault';

export const parseDurationToSeconds = (dur: string): number => {
  const parts = dur.split(':').map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return 48;
  if (parts.length === 2) return Math.max(1, parts[0] * 60 + parts[1]);
  if (parts.length === 3) {
    return Math.max(1, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return 48;
};

export const formatLoopTimecode = (sec: number): string => {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
};

export const formatLoopMarker = (pointA: number, pointB: number): string =>
  `A: ${formatLoopTimecode(pointA)} • B: ${formatLoopTimecode(pointB)}`;

export const parseLoopMarkerRange = (
  marker: string | undefined,
  totalSec: number
): { a: number; b: number } => {
  if (marker) {
    const matches = marker.match(/(\d+):(\d+(?:\.\d+)?)/g);
    if (matches && matches.length >= 2) {
      const toSec = (str: string) => {
        const [m, s] = str.split(':').map(Number);
        return m * 60 + s;
      };
      const a = Math.max(0, Math.min(totalSec - 1, toSec(matches[0])));
      const b = Math.max(a + 0.5, Math.min(totalSec, toSec(matches[1])));
      return { a, b };
    }
  }
  return {
    a: Number((totalSec * 0.25).toFixed(1)),
    b: Number((totalSec * 0.52).toFixed(1)),
  };
};

export const getVideoSavedLoops = (
  video: Pick<VideoEntry, 'duration' | 'loopMarker' | 'savedLoops'>,
  totalDurationSec?: number
): SavedLoopItem[] => {
  if (Array.isArray(video.savedLoops)) {
    return video.savedLoops;
  }
  if (video.loopMarker) {
    const dur = totalDurationSec ?? parseDurationToSeconds(video.duration);
    const { a, b } = parseLoopMarkerRange(video.loopMarker, dur);
    return [
      {
        id: 'legacy-loop',
        name: 'Figura 1',
        pointA: a,
        pointB: b,
        marker: video.loopMarker,
      },
    ];
  }
  return [];
};

export const buildNextLoopName = (existing: SavedLoopItem[]): string => {
  const usedNames = new Set(existing.map((l) => l.name.trim().toLowerCase()));
  let idx = existing.length + 1;
  while (usedNames.has(`figura ${idx}`)) {
    idx += 1;
  }
  return `Figura ${idx}`;
};
