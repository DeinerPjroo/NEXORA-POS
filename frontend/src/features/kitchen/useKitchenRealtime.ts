import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSession } from '../auth/SessionProvider'

type Connection =
  | { enabled: false }
  | {
      enabled: true
      key: string
      host: string
      port: number
      scheme: string
      channel: string
    }

export function useKitchenRealtime(branchId: string, preview: boolean) {
  const { session, screenBlocked } = useSession()
  const client = useQueryClient()
  const [connected, setConnected] = useState(false)
  const userId = session?.user.id
  const tenantId = session?.company.id
  const allowed = !!session?.permissions.includes('kitchen.view')
  useEffect(() => {
    setConnected(false)
    if (!branchId || !userId || !allowed || screenBlocked || preview) return
    let disposed = false
    let disconnect: (() => void) | undefined
    const controller = new AbortController()
    const refresh = () => {
      if (!disposed)
        void client.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'kitchen-tickets' && query.queryKey[1] === branchId,
        })
    }
    void (async () => {
      const config = await api<Connection>(`kitchen/realtime?branch_id=${branchId}`, {
        signal: controller.signal,
      })
      if (!config.enabled || disposed) return
      const [{ default: Echo }, { default: Pusher }] = await Promise.all([
        import('laravel-echo'),
        import('pusher-js'),
      ])
      if (disposed) return
      const pusher = new Pusher(config.key, {
        cluster: 'local',
        wsHost: config.host,
        wsPort: config.port,
        wssPort: config.port,
        forceTLS: config.scheme === 'https',
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        channelAuthorization: {
          endpoint: '/api/v1/broadcasting/auth',
          transport: 'ajax',
          customHandler: (params, callback) => {
            if (disposed) return
            void api<{ auth: string }>('broadcasting/auth', {
              method: 'POST',
              body: { socket_id: params.socketId, channel_name: params.channelName },
              signal: controller.signal,
            })
              .then((data) => {
                if (!disposed) callback(null, data)
              })
              .catch((error) => {
                if (!disposed) callback(error, null)
              })
          },
        },
      })
      const echo = new Echo({ broadcaster: 'reverb', client: pusher, key: config.key })
      const offline = () => {
        setConnected(false)
        pusher.disconnect()
      }
      const online = () => {
        if (!disposed) pusher.connect()
      }
      window.addEventListener('offline', offline)
      window.addEventListener('online', online)
      disconnect = () => {
        window.removeEventListener('offline', offline)
        window.removeEventListener('online', online)
        echo.leave(config.channel)
        echo.disconnect()
      }
      pusher.connection.bind('state_change', ({ current }: { current: string }) => {
        if (!disposed && current !== 'connected') setConnected(false)
      })
      echo
        .private(config.channel)
        .subscribed(() => {
          if (!disposed) {
            setConnected(true)
            refresh()
          }
        })
        .error(() => {
          if (!disposed) setConnected(false)
        })
        .listen('.kitchen.changed', refresh)
    })().catch(() => {
      if (!disposed) setConnected(false)
    })
    return () => {
      disposed = true
      controller.abort()
      disconnect?.()
    }
  }, [branchId, userId, tenantId, allowed, screenBlocked, preview, client])
  return connected && !screenBlocked && !preview
}
