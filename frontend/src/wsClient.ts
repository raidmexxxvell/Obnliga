type Handler = (msg: any) => void

export class WSClient {
  ws: WebSocket | null = null
  url: string
  topic: string | null = null
  handlers: Map<string, Handler[]> = new Map()
  queuedActions: Array<() => void> = []

  constructor(url: string) {
    this.url = url
  }

  connect(token?: string) {
    if (this.ws) this.ws.close()
    const sep = this.url.includes('?') ? '&' : '?'
    const u = token ? `${this.url}${sep}token=${encodeURIComponent(token)}` : this.url
    this.ws = new WebSocket(u)
    this.ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); this.dispatch(m) } catch(e) {}
    }
    this.ws.onopen = () => {
      // flush queued subscribe/unsubscribe actions
      for (const fn of this.queuedActions) {
        try { fn() } catch (e) {}
      }
      this.queuedActions = []
    }
    this.ws.onclose = () => { this.ws = null }
  }

  dispatch(msg: any) {
    const type = msg.type || 'message'
    const list = this.handlers.get(type) || []
    for (const h of list) h(msg)
  }

  on(type: string, cb: Handler) {
    const list = this.handlers.get(type) || []
    list.push(cb)
    this.handlers.set(type, list)
  }

  subscribe(topic: string) {
    const doSubscribe = () => {
      if (!this.ws) return
      if (this.topic === topic) return
      if (this.topic) this.unsubscribe(this.topic)
      this.topic = topic
      try { this.ws!.send(JSON.stringify({ action: 'subscribe', topic })) } catch (e) {}
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queuedActions.push(doSubscribe)
      // ensure connect is called
      if (!this.ws) this.connect()
      return
    }
    doSubscribe()
  }

  unsubscribe(topic: string) {
    const doUnsub = () => {
      if (!this.ws) return
      try { this.ws!.send(JSON.stringify({ action: 'unsubscribe', topic })) } catch (e) {}
      if (this.topic === topic) this.topic = null
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queuedActions.push(doUnsub)
      if (!this.ws) this.connect()
      return
    }
    doUnsub()
  }
}

const token = typeof window !== 'undefined' ? (localStorage.getItem('session') || undefined) : undefined

// Resolve WS URL from Vite env or derive from BACKEND_URL / location
const metaEnv: any = (import.meta as any).env || {}
const VITE_WS_URL = (metaEnv && (metaEnv.VITE_WS_URL as string)) || ''
const VITE_BACKEND_URL = (metaEnv && (metaEnv.VITE_BACKEND_URL as string)) || ''
let resolvedWsUrl = ''
if (VITE_WS_URL) {
  resolvedWsUrl = VITE_WS_URL
} else if (VITE_BACKEND_URL) {
  resolvedWsUrl = VITE_BACKEND_URL.replace(/^http/, 'ws') + '/realtime'
} else if (typeof location !== 'undefined') {
  resolvedWsUrl = `${location.origin.replace(/^http/, 'ws')}/realtime`
} else {
  resolvedWsUrl = '/realtime'
}

export const wsClient = new WSClient(resolvedWsUrl)
wsClient.connect(token)
