declare module 'linkify-element' {
  interface LinkifyOptions {
    defaultProtocol: string
    target: string
    rel: string
  }

  const linkifyElement: (element: HTMLElement, options: LinkifyOptions) => void
  export default linkifyElement
}
