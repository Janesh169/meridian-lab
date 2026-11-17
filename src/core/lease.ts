/**
 * "Only one tab plays at a time." The playing tab renews a lease in storage. Other
 * tabs see it and show a "Game is open in another tab" screen with a takeover
 * button. The timer itself is shared through the save, so this only stops two
 * copies of the same puzzle fighting over the save.
 */
import { ENGINE, STORAGE_KEYS } from '../config';
import type { KV } from './store';

interface LeaseRec { tabId: string; until: number }

export class Lease {
  constructor(private kv: KV, private tabId: string, private now: () => number) {}

  private read(): LeaseRec | null {
    try {
      const raw = this.kv.getItem(STORAGE_KEYS.lease);
      return raw ? (JSON.parse(raw) as LeaseRec) : null;
    } catch {
      return null;
    }
  }

  /** Who holds the lease right now (null if nobody or expired). */
  holder(): string | null {
    const r = this.read();
    if (!r) return null;
    // A lease far in the future means the clock went back; treat it as expired.
    const t = this.now();
    if (r.until < t || r.until > t + ENGINE.leaseTtlMs * 2) return null;
    return r.tabId;
  }

  /** Try to take or renew the lease. Fails if another live tab holds it, unless forced. */
  acquire(force = false): boolean {
    const h = this.holder();
    if (h && h !== this.tabId && !force) return false;
    try {
      this.kv.setItem(STORAGE_KEYS.lease, JSON.stringify({ tabId: this.tabId, until: this.now() + ENGINE.leaseTtlMs }));
    } catch {
      return true; // without storage there is only one tab's view anyway
    }
    return true;
  }

  held(): boolean {
    return this.holder() === this.tabId;
  }

  release(): void {
    if (this.held()) {
      try { this.kv.removeItem(STORAGE_KEYS.lease); } catch { /* ignore */ }
    }
  }
}
