// Messages invalidate server state; they never grant an unlocked state.
export function screenChanged() {
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('nexora:screen')
  channel?.postMessage('changed')
  channel?.close()
  window.dispatchEvent(new Event('nexora:screen-changed'))
}
