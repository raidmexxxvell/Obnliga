type Handler = (msg: any) => void

export class WSClient {
  ws: WebSocket | null = null
  url: string
  topic: string | null = null
  handlers: Map<string, Handler[]> = new Map()

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
    if (!this.ws) return
    if (this.topic === topic) return
    if (this.topic) this.unsubscribe(this.topic)
    this.topic = topic
    this.ws.send(JSON.stringify({ action: 'subscribe', topic }))
  }

  unsubscribe(topic: string) {
    if (!this.ws) return
    this.ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
    if (this.topic === topic) this.topic = null
  }
}

const token = typeof window !== 'undefined' ? (localStorage.getItem('session') || undefined) : undefined
export const wsClient = new WSClient(`${location.origin.replace(/^http/, 'ws')}/realtime`)
wsClient.connect(token)
