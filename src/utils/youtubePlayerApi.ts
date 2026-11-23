export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (suggestedRate: number) => void;
  getAvailablePlaybackRates?: () => number[];
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

export interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number | undefined>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: {
      target: YTPlayerInstance;
      data: number;
    }) => void;
    onError?: (event: { target: YTPlayerInstance; data: number }) => void;
  };
}

export interface YTApiNamespace {
  Player: new (
    element: HTMLElement | string,
    options: YTPlayerOptions
  ) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTApiNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTApiNamespace> | null = null;

export function loadYouTubeIframeApi(): Promise<YTApiNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No browser window'));
  }

  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YTApiNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    const timeoutId = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube IFrame API load timeout'));
    }, 10000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      if (prevReady) {
        try {
          prevReady();
        } catch {
          // Ignore prior callback error
        }
      }
      if (window.YT && typeof window.YT.Player === 'function') {
        resolve(window.YT);
      } else {
        ytApiPromise = null;
        reject(new Error('YT.Player unavailable'));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}
