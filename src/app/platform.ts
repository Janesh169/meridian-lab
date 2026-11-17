/**
 * Feature detection and the browser APIs that differ between file:// and HTTPS.
 * Everything is optional: missing features degrade quietly.
 */
import { STORAGE_KEYS } from '../config';
import { MemoryKV, type KV } from '../core/store';

export const platform = {
  get secure(): boolean {
    return typeof window !== 'undefined' && !!window.isSecureContext;
  },
  get fileProtocol(): boolean {
    return typeof location !== 'undefined' && (location.protocol === 'file:' || location.protocol === 'content:');
  },
  get wakeLock(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator && platform.secure;
  },
  get vibrate(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  },
  get notifications(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && platform.secure;
  },
  get serviceWorker(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && platform.secure && location.protocol === 'https:';
  },
  get broadcast(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  },
};

/** Pick working persistent storage, or fall back to memory (with a warning flag). */
export function pickStorage(): { kv: KV; persistent: boolean; error: string | null } {
  try {
    const ls = window.localStorage;
    const k = STORAGE_KEYS.save + '.probe';
    ls.setItem(k, '1');
    const ok = ls.getItem(k) === '1';
    ls.removeItem(k);
    if (ok) return { kv: ls, persistent: true, error: null };
  } catch (e) {
    return { kv: new MemoryKV(), persistent: false, error: String(e) };
  }
  return { kv: new MemoryKV(), persistent: false, error: 'localStorage did not keep a value' };
}

/* ------------------------------------------------------------ IndexedDB mirror */
/**
 * A second copy of the save in IndexedDB. If only localStorage gets cleared (some
 * cleaner apps do this), the game restores from the mirror. "Clear site data"
 * clears both, which is the one bypass the browser can't prevent.
 */
const IDB_STORE = 'kv';
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(STORAGE_KEYS.idbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let pendingJson: string | null = null;
export function mirrorSave(json: string): void {
  pendingJson = json;
  if (mirrorTimer) return;
  mirrorTimer = setTimeout(async () => {
    mirrorTimer = null;
    const data = pendingJson;
    pendingJson = null;
    const db = await idb();
    if (!db || !data) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, 'save');
      tx.oncomplete = () => db.close();
    } catch { /* ignore */ }
  }, 400);
}

export async function readMirror(): Promise<string | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const r = tx.objectStore(IDB_STORE).get('save');
      r.onsuccess = () => { resolve(typeof r.result === 'string' ? r.result : null); db.close(); };
      r.onerror = () => { resolve(null); db.close(); };
    } catch {
      resolve(null);
    }
  });
}

/* --------------------------------------------------------------- wake lock */
let wakeSentinel: any = null;
let wantWake = false;
export async function requestWakeLock(): Promise<boolean> {
  wantWake = true;
  if (!platform.wakeLock) return false;
  try {
    wakeSentinel = await (navigator as any).wakeLock.request('screen');
    wakeSentinel.addEventListener?.('release', () => { wakeSentinel = null; });
    return true;
  } catch {
    return false;
  }
}
export function releaseWakeLock(): void {
  wantWake = false;
  try { wakeSentinel?.release?.(); } catch { /* ignore */ }
  wakeSentinel = null;
}
/** Wake locks are dropped when the page is hidden; re-acquire on return. */
export function reacquireWakeLock(): void {
  if (wantWake && !wakeSentinel && document.visibilityState === 'visible') void requestWakeLock();
}

/* ---------------------------------------------------- notifications (HTTPS) */
let swReg: ServiceWorkerRegistration | null = null;
export async function registerServiceWorker(): Promise<void> {
  if (!platform.serviceWorker) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
  } catch {
    swReg = null;
  }
}
export async function askNotificationPermission(): Promise<void> {
  if (!platform.notifications) return;
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* ignore */ }
}
export function notify(title: string, body: string): void {
  if (!platform.notifications || Notification.permission !== 'granted') return;
  const opts: NotificationOptions & { vibrate?: number[]; requireInteraction?: boolean } = { body, tag: 'meridian-lock', requireInteraction: true, vibrate: [500, 200, 500] };
  try {
    if (swReg) void swReg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* ignore */ }
}

export function vibrate(pattern: number[]): boolean {
  if (!platform.vibrate) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
