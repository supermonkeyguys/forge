import { useEffect, useState } from 'react'

interface PWAState {
  needRefresh: boolean
  offlineReady: boolean
  updateServiceWorker: () => Promise<void>
}

export function usePWA(): PWAState {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
      // Listen for service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setNeedRefresh(true)
      })

      // Check if service worker is ready
      navigator.serviceWorker.ready.then(() => {
        setOfflineReady(true)
      })
    }
  }, [])

  const updateServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.update()
      window.location.reload()
    }
  }

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker,
  }
}
