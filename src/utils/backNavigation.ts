import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

interface BackHandlerEntry {
  id: number;
  order: number;
  priority: number;
  onBack: () => void;
}

const activeHandlers: BackHandlerEntry[] = [];
let nextId = 1;
let nextOrder = 1;
let trapPushed = false;
let ignoreNextPop = false;
let flushTimer: number | null = null;
let listenerAttached = false;
let nativeListenerAttached = false;
let lastRootBackAt = 0;
let rootBackWarnCallback: (() => void) | null = null;

export function registerNativeRootBackWarn(cb: (() => void) | null): void {
  rootBackWarnCallback = cb;
}

function getTopBackHandler(): BackHandlerEntry | null {
  if (activeHandlers.length === 0) return null;
  let top = activeHandlers[0];
  for (let i = 1; i < activeHandlers.length; i += 1) {
    const candidate = activeHandlers[i];
    if (
      candidate.priority > top.priority ||
      (candidate.priority === top.priority && candidate.order > top.order)
    ) {
      top = candidate;
    }
  }
  return top;
}

function scheduleTrapSync() {
  if (typeof window === 'undefined') return;
  if (Capacitor.isNativePlatform()) return;
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    if (activeHandlers.length > 0 && !trapPushed) {
      try {
        window.history.pushState({ dvBackTrap: true }, '');
        trapPushed = true;
      } catch {
        // Ignore history restriction in sandboxed environments
      }
    } else if (activeHandlers.length === 0 && trapPushed) {
      trapPushed = false;
      ignoreNextPop = true;
      try {
        window.history.back();
      } catch {
        ignoreNextPop = false;
      }
    }
  }, 60);
}

function handleWindowPopState() {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }

  trapPushed = false;

  const top = getTopBackHandler();
  if (!top) {
    return;
  }

  try {
    top.onBack();
  } finally {
    // Re-arm trap if any active back layers remain after React commits state updates
    scheduleTrapSync();
  }
}

function ensurePopListener() {
  if (typeof window === 'undefined') return;

  if (Capacitor.isNativePlatform()) {
    if (nativeListenerAttached) return;
    nativeListenerAttached = true;
    void CapApp.addListener('backButton', () => {
      const top = getTopBackHandler();
      if (top) {
        top.onBack();
        return;
      }
      const now = Date.now();
      if (now - lastRootBackAt < 2000) {
        void CapApp.exitApp();
      } else {
        lastRootBackAt = now;
        rootBackWarnCallback?.();
      }
    });
    return;
  }

  if (listenerAttached) return;
  window.addEventListener('popstate', handleWindowPopState);
  listenerAttached = true;
}

/**
 * Registers an Android hardware Back / swipe-back handler.
 * Uses Capacitor native App backButton in Android builds, and History API popstate in browsers.
 */
export function useBackHandler(
  active: boolean,
  onBack: () => void,
  priority = 0
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const entryIdRef = useRef<number | null>(null);

  useEffect(() => {
    ensurePopListener();

    if (!active) {
      if (entryIdRef.current !== null) {
        const idx = activeHandlers.findIndex((h) => h.id === entryIdRef.current);
        if (idx !== -1) {
          activeHandlers.splice(idx, 1);
        }
        entryIdRef.current = null;
        scheduleTrapSync();
      }
      return;
    }

    if (entryIdRef.current === null) {
      const id = nextId++;
      entryIdRef.current = id;
      activeHandlers.push({
        id,
        order: nextOrder++,
        priority,
        onBack: () => onBackRef.current(),
      });
    } else {
      const existing = activeHandlers.find((h) => h.id === entryIdRef.current);
      if (existing) {
        existing.priority = priority;
      }
    }

    scheduleTrapSync();

    return () => {
      if (entryIdRef.current !== null) {
        const idx = activeHandlers.findIndex((h) => h.id === entryIdRef.current);
        if (idx !== -1) {
          activeHandlers.splice(idx, 1);
        }
        entryIdRef.current = null;
        scheduleTrapSync();
      }
    };
  }, [active, priority]);
}
