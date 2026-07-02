// Cliente REST do tether (mesmos endpoints do dashboard). Fala HTTP com Bearer token.
// Injeta o project da pasta aberta como default (Onboarding Parte C); a IA pode sobrescrever
// passando project explicito para mexer em outro projeto.
export function createApiClient({ url, token, project }, fetchImpl = fetch) {
  const base = (url || '').replace(/\/$/, '')
  const authHeaders = { authorization: `Bearer ${token}` }

  async function req(method, path, body) {
    if (!base || !token) {
      throw new Error('nao conectado - rode: TETHER_API_URL=<url> npx -y github:arsprengel/tether-mcp login')
    }
    const headers = { ...authHeaders }
    const opt = { method, headers }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      opt.body = JSON.stringify(body)
    }
    return fetchImpl(base + path, opt)
  }

  async function jsonOrThrow(r, ctx) {
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      let msg = t
      try {
        const j = JSON.parse(t)
        if (j && typeof j.error === 'string') msg = j.error
      } catch {
        /* corpo nao-JSON: usa o texto cru mesmo */
      }
      const detail = msg ? ': ' + msg.slice(0, 200) : ''
      throw new Error(`${ctx} -> HTTP ${r.status}${detail}`)
    }
    return r.json()
  }

  function qs(filter = {}) {
    const f = { project, ...filter } // filter (ex: project explicito da IA) sobrescreve o default
    const p = new URLSearchParams()
    for (const k of ['project', 'status', 'type', 'tag']) if (f[k]) p.set(k, String(f[k]))
    const s = p.toString()
    return s ? '?' + s : ''
  }

  return {
    async listItems(filter = {}) {
      return jsonOrThrow(await req('GET', '/api/items' + qs(filter)), 'list_items')
    },
    async getItem(id) {
      const r = await req('GET', `/api/items/${id}`)
      if (r.status === 404) return null
      return jsonOrThrow(r, 'get_item')
    },
    async addItem(input = {}) {
      const body = { project, ...input } // project da pasta; input.project (se houver) sobrescreve
      return jsonOrThrow(await req('POST', '/api/items', body), 'add_item')
    },
    async updateItem(id, patch = {}) {
      return jsonOrThrow(await req('PATCH', `/api/items/${id}`, patch), 'update_item')
    },
    async moveItem(id, index, filter = {}) {
      return jsonOrThrow(await req('POST', `/api/items/${id}/move` + qs(filter), { index }), 'move_item')
    },
    async getNext(filter = {}) {
      return jsonOrThrow(await req('GET', '/api/next' + qs(filter)), 'get_next')
    },
    async deleteItem(id) {
      const r = await req('DELETE', `/api/items/${id}`)
      if (r.status === 404) return false
      await jsonOrThrow(r, 'delete_item')
      return true
    },
  }
}
