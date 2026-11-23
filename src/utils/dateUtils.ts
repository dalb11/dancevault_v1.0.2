import { ExplorerEntry } from '../types/dancevault';

function parseEmbeddedTimestampFromId(id: string): number | null {
  const matches = id.match(/\d{12,14}/g);
  if (!matches || matches.length === 0) return null;
  const parsed = Number(matches[0]);
  if (!Number.isFinite(parsed) || parsed < 1_000_000_000_000) return null;
  return parsed;
}

function parseTimestampFromOriginalFileName(fileName?: string): number | null {
  if (!fileName) return null;
  const m = fileName.match(/(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ts = new Date(year, month, day, hour, minute, second).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function getEntryCreatedAt(entry: ExplorerEntry): number {
  if (typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)) {
    return entry.createdAt;
  }
  if (
    entry.type === 'video' &&
    typeof entry.importedAt === 'number' &&
    Number.isFinite(entry.importedAt)
  ) {
    return entry.importedAt;
  }
  const fromId = parseEmbeddedTimestampFromId(entry.id);
  if (fromId !== null) return fromId;
  if (entry.type === 'video') {
    const fromFile = parseTimestampFromOriginalFileName(entry.originalFileName);
    if (fromFile !== null) return fromFile;
  }
  return 0;
}

const MONTH_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatCreationDateLabel(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return 'Sin fecha definida';
  }
  const d = new Date(ms);
  const day = d.getDate();
  const month = MONTH_SHORT_ES[d.getMonth()] ?? '';
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} · ${hh}:${mm}`;
}

export function toDateTimeLocalInputValue(ms?: number): string {
  const base =
    typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : Date.now();
  const d = new Date(base);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function fromDateTimeLocalInputValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed).getTime();
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
