export type ViewMode = 'list' | 'square';
export type SortMode =
  | 'natural'
  | 'folders-first'
  | 'recent-desc'
  | 'recent-asc'
  | 'manual';
export type BottomTab = 'bibliotecas' | 'carpetas' | 'favoritos' | 'papelera' | 'mas';
export type VideoSourceType = 'local' | 'youtube' | 'instagram' | 'direct-url';

export interface LibraryItem {
  id: string;
  name: string;
  disciplineLabel: string;
  videosCount: number;
  foldersCount: number;
  sizeBytes: number;
  sizeLabel: string;
  lastPracticed: string;
  coverUrl: string;
  accentColor: 'primary' | 'secondary' | 'tertiary' | 'neutral';
  accentHex?: string;
}

export interface ProfileItem {
  id: string;
  name: string;
  isMaster: boolean;
}

export interface FolderEntry {
  id: string;
  type: 'folder';
  libraryId: string;
  parentId: string | null; // null = library root
  name: string;
  coverUrl: string;
  itemCount: number;
  sizeLabel: string;
  favorite: boolean;
  viewMode: ViewMode;
  sortMode: SortMode;
  createdAt?: number;
  trashedAt?: number;
  trashedFromPath?: string;
}

export interface SavedLoopItem {
  id: string;
  name: string;
  pointA: number;
  pointB: number;
  marker: string;
  createdAt?: number;
}

export interface VideoEntry {
  id: string;
  type: 'video';
  libraryId: string;
  parentId: string | null; // null = library root
  name: string;
  originalFileName: string;
  coverUrl: string;
  duration: string;
  sizeBytes?: number;
  sizeLabel: string;
  resolution: string;
  favorite: boolean;
  tags: string[];
  note?: string;
  noteUpdatedAt?: string;
  createdAt?: number;
  importedAt?: number;
  importedAtLabel?: string;
  fps?: string;
  loopMarker?: string;
  loopActive?: boolean;
  activeLoopId?: string;
  savedLoops?: SavedLoopItem[];
  videoUrl?: string;
  nativeFilePath?: string;
  sourceType?: VideoSourceType;
  externalUrl?: string;
  externalId?: string;
  trashedAt?: number;
  trashedFromPath?: string;
}

export type ExplorerEntry = FolderEntry | VideoEntry;

export interface TrashedLibraryItem {
  id: string;
  library: LibraryItem;
  entries: ExplorerEntry[];
  trashedAt: number;
  wasPrimary?: boolean;
}

export interface FolderMetadataUpdates {
  createdAt?: number;
}

export interface VideoMetadataUpdates {
  tags?: string[];
  note?: string;
  noteUpdatedAt?: string;
  createdAt?: number;
  importedAt?: number;
  loopMarker?: string;
  loopActive?: boolean;
  activeLoopId?: string;
  savedLoops?: SavedLoopItem[];
  originalFileName?: string;
  duration?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  resolution?: string;
  fps?: string;
  videoUrl?: string;
  nativeFilePath?: string;
  sourceType?: VideoSourceType;
  externalUrl?: string;
  externalId?: string;
  coverUrl?: string;
  importedAtLabel?: string;
}

export interface UserWorkspaceData {
  libraries: LibraryItem[];
  primaryLibraryId: string;
  activeLibraryId: string;
  entries: ExplorerEntry[];
  trashedEntries: ExplorerEntry[];
  trashedLibraries: TrashedLibraryItem[];
  folderViewPrefs: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortMode>;
  manualOrderByFolder: Record<string, string[]>;
  recentDays: number;
}

