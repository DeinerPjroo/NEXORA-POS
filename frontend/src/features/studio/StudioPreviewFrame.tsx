import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { OrderComposer } from '../orders/OrderComposer'
import { posComponents, type PosLayout, type PosPanel } from './pos-layout'
import type { OrderChannel } from '../catalog/context-price-types'
import { useSession } from '../auth/SessionProvider'

export type PreviewBox = { id: PosPanel; left: number; top: number; width: number; height: number }

export function StudioPreviewFrame({
  config,
  content,
  channel = 'dine_in',
  panel = 'menu',
  width,
  height,
  onMeasure,
}: {
  content?: ReactNode
  channel?: OrderChannel
  config?: PosLayout
  panel?: 'menu' | 'cart'
  width: number
  height: number
  onMeasure: (boxes: PreviewBox[]) => void
}) {
  const [document, setDocument] = useState<Document | null>(null)
  const attachFrame = useCallback((node: HTMLIFrameElement | null) => {
    if (node?.contentDocument?.body) setDocument(node.contentDocument)
  }, [])
  const { session, screenBlocked } = useSession()
  const trackPanels = !!config
  useEffect(() => {
    if (!document) return
    const source = window.document
    const syncStyles = () => {
      document.head.replaceChildren(
        ...Array.from(source.head.querySelectorAll('style, link[rel="stylesheet"]')).map((node) =>
          node.cloneNode(true),
        ),
      )
      const style = document.createElement('style')
      style.textContent =
        'html,body{margin:0;width:100%;height:100%;overflow:hidden}.studio-pos-render,.studio-pos-render .pos-terminal{width:100%;height:100%}.studio-pos-render .pos-terminal{position:absolute;inset:0;z-index:0}'
      document.head.append(style)
    }
    const syncTheme = () => {
      for (const attribute of Array.from(document.documentElement.attributes))
        document.documentElement.removeAttribute(attribute.name)
      for (const attribute of Array.from(source.documentElement.attributes))
        document.documentElement.setAttribute(attribute.name, attribute.value)
    }
    syncStyles()
    syncTheme()
    const styles = new MutationObserver(syncStyles)
    styles.observe(source.head, { childList: true, subtree: true, characterData: true })
    const theme = new MutationObserver(syncTheme)
    theme.observe(source.documentElement, { attributes: true })
    return () => {
      styles.disconnect()
      theme.disconnect()
    }
  }, [document])
  useEffect(() => {
    if (!document || !trackPanels) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        onMeasure(
          (Object.keys(posComponents) as PosPanel[]).flatMap((id) => {
            const node = document.querySelector(`[data-pos-slot="${id}"]`)
            if (!node) return []
            const rect = node.getBoundingClientRect()
            if (!rect.width || !rect.height) return []
            return [{ id, left: rect.left, top: rect.top, width: rect.width, height: rect.height }]
          }),
        ),
      )
    }
    const observer = new MutationObserver(measure)
    observer.observe(document.body, { childList: true, attributes: true, subtree: true })
    const resize = new ResizeObserver(measure)
    resize.observe(document.body)
    document.addEventListener('load', measure, true)
    measure()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resize.disconnect()
      document.removeEventListener('load', measure, true)
    }
  }, [document, width, height, onMeasure, trackPanels])
  return (
    <>
      <iframe
        ref={attachFrame}
        title="Vista previa de Terminal por dispositivo"
        sandbox="allow-same-origin"
        tabIndex={-1}
        style={{ width, height, border: 0, pointerEvents: 'none' }}
        onLoad={(event) => setDocument(event.currentTarget.contentDocument)}
      />
      {document &&
        session &&
        !screenBlocked &&
        createPortal(
          <div className="studio-pos-render" inert>
            {content ??
              (config && (
                <OrderComposer
                  terminal
                  initialChannel={channel}
                  studioPreview={config}
                  studioPreviewPanel={panel}
                />
              ))}
          </div>,
          document.body,
        )}
    </>
  )
}
