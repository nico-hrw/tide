import { apiFetch } from './api'
import * as idb from './db'

let syncing = false

export async function triggerSync(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const queue = await idb.getSyncQueue()
    for (const entry of queue) {
      try {
        const res = await apiFetch('/tracker/workouts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.workout),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await idb.removeSyncEntry(entry.id)
      } catch (e) {
        await idb.updateSyncEntry({
          ...entry,
          status: 'failed',
          attempts: entry.attempts + 1,
          lastError: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }
  } finally {
    syncing = false
  }
}

export function initSyncListener(): () => void {
  const handler = () => triggerSync()
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
