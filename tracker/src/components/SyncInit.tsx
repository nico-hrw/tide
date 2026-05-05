'use client'
import { useEffect } from 'react'
import { useTrackerStore } from '@/store/useTrackerStore'
import { initSyncListener } from '@/lib/sync'

export default function SyncInit() {
  const { loadFromDB, triggerSync } = useTrackerStore()

  useEffect(() => {
    loadFromDB()
    triggerSync()
    const cleanup = initSyncListener()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
