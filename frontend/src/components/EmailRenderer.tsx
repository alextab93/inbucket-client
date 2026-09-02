import { useEffect, useRef } from 'react'
import { renderEmailBody } from '../email-renderer'

interface EmailRendererProps {
  html: string
  text: string
  mailbox: string
  messageId: string
}

export const EmailRenderer = ({
  html,
  text,
  mailbox,
  messageId,
}: EmailRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const renderer = renderEmailBody({
      container,
      html,
      text,
      mailbox,
      messageId,
    })
    return () => {
      renderer.destroy()
      container.replaceChildren()
    }
  }, [html, text, mailbox, messageId])

  return <div ref={containerRef} className="message-body" />
}
