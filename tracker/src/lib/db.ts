import type { ActiveWorkout, SyncQueueEntry } from '@/types/tracker'

const DB_NAME = 'tide-tracker'
const DB_VERSION = 1

let _db: IDBDatabase | null = null

async function getDB(): Promise<IDBDatabase> {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('active_workout')) {
        db.createObjectStore('active_workout', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result
      resolve(_db)
    }
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const req = op(transaction.objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export const saveActiveWorkout = (w: ActiveWorkout) =>
  tx('active_workout', 'readwrite', (s) => s.put(w))

export const clearActiveWorkout = () =>
  tx('active_workout', 'readwrite', (s) => s.clear())

export const getActiveWorkout = (): Promise<ActiveWorkout | undefined> =>
  getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction('active_workout', 'readonly')
          .objectStore('active_workout')
          .getAll()
        req.onsuccess = () => resolve((req.result as ActiveWorkout[])[0])
        req.onerror = () => reject(req.error)
      })
  )

export const addToSyncQueue = (entry: SyncQueueEntry) =>
  tx('sync_queue', 'readwrite', (s) => s.put(entry))

export const updateSyncEntry = (entry: SyncQueueEntry) =>
  tx('sync_queue', 'readwrite', (s) => s.put(entry))

export const removeSyncEntry = (id: string) =>
  tx<undefined>('sync_queue', 'readwrite', (s) => s.delete(id))

export const getSyncQueue = (): Promise<SyncQueueEntry[]> =>
  getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction('sync_queue', 'readonly')
          .objectStore('sync_queue')
          .getAll()
        req.onsuccess = () => resolve(req.result as SyncQueueEntry[])
        req.onerror = () => reject(req.error)
      })
  )
