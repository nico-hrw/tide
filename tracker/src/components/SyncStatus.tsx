'use client'
import { useTrackerStore } from '@/store/useTrackerStore'

export default function SyncStatus() {
  const { syncQueue, syncStatus, triggerSync, exportQueue, importQueue } = useTrackerStore()
  const pending = syncQueue.filter((e) => e.status === 'pending').length
  const failed = syncQueue.filter((e) => e.status === 'failed').length

  if (syncQueue.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-800">
          {syncStatus === 'syncing'
            ? '⏳ Synchronisiere…'
            : failed > 0
              ? `⚠️ ${failed} fehlgeschlagen`
              : `🕐 ${pending} ausstehend`}
        </span>
        <button
          onClick={() => triggerSync()}
          className="text-xs bg-black text-white rounded-full px-3 py-1"
        >
          Sync
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={exportQueue} className="text-xs text-gray-500 underline">
          Exportieren
        </button>
        <label className="text-xs text-gray-500 underline cursor-pointer">
          Importieren
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importQueue(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  )
}
