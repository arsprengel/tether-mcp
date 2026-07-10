import { basename } from 'node:path'
import { resolveConfig } from './config.js'
import { findTetherProject } from './tether-file.js'

// Hooks de sessao do Claude Code falando com a API do Tether (mesmo desenho dos hooks do
// repo principal, portado pro cliente standalone): "context" injeta itens abertos + MRP no
// inicio da sessao; "reconcile" cobra reconciliacao de item in_progress no stop.
// REGRA DE OURO: hook NUNCA derruba nem atrasa a sessao - qualquer falha (sem login, sem
// rede, timeout, HTTP ruim) vira exit 0 silencioso. O unico exit 2 e o reconcile intencional.

const CATEGORY_ORDER = ['command', 'deploy', 'gotcha', 'decision', 'context']
const CATEGORY_LABEL = {
  command: 'Comandos',
  deploy: 'Deploy',
  gotcha: 'Gotchas',
  decision: 'Decisoes',
  context: 'Contexto',
}

export const MEMORY_REMINDER =
  'Descobriu gotcha/comando/decisao duravel do projeto nesta sessao? Registre na MRP via add_memory (cheque list_memory antes; aposente entradas velhas com update_memory).'

function line(i) {
  // #N = "ponto N" (numero 1-based na ordem natural do projeto), o MESMO que a UI mostra e que
  // humanos/commits usam - pra IA nao traduzir via position (0-based, com gaps) e pegar o item
  // errado. Vem do payload da API (/api/items). Omite o #N se faltar (nao imprime "#undefined").
  const n = i.number != null ? `#${i.number} ` : ''
  return `- ${n}[${i.type}/${i.status}/${i.priority}] ${i.title} (${i.id})`
}

// Convencao do item #11: idea = captura crua. Ao atacar, a IA clarifica escopo + plan mode
// antes de codar (feature/chore/bug ja detalhados vao direto). So aparece quando ha idea aberta.
export const IDEA_CONVENTION =
  'Convencao para itens type=idea (captura crua do usuario): ao atacar uma idea, NAO saia codando. ' +
  'Primeiro clarifique o escopo com o usuario e apresente um plano para aprovacao (plan mode) antes de ' +
  'implementar. Itens feature/chore/bug ja detalhados podem ir direto.'

// Convencao do item #12: a sessao nao fica aberta pra "lembrar sozinha" numa data futura. Se a IA
// prometer avisar algo, ela grava AGORA no Tether (add_reminder), que guarda e mostra no dashboard.
export const REMINDER_CONVENTION =
  'Lembretes: se voce prometer avisar algo no futuro ("quando chegar o dia X eu te lembro") ou ' +
  'combinar de retomar algo numa data, registre AGORA via add_reminder (message + remind_at ISO) - ' +
  'a sessao nao fica aberta pra lembrar sozinha; o Tether guarda e mostra na aba Lembretes.'

export function formatContext(open) {
  const body = open.map(line).join('\n')
  const base = `Tracker Tether deste projeto - ${open.length} item(ns) aberto(s):\n${body}\n\nConsulte/atualize via as tools do MCP tether (list_items, get_item, update_item, get_next) conforme avancar.`
  const withIdea = open.some((i) => i.type === 'idea') ? `${base}\n\n${IDEA_CONVENTION}` : base
  return `${withIdea}\n\n${REMINDER_CONVENTION}`
}

export function formatReconcile(inProgress) {
  const body = inProgress.map(line).join('\n')
  return `Antes de encerrar: ha ${inProgress.length} item(ns) marcado(s) in_progress no tracker Tether. Para cada um, chame a tool update_item e ajuste o status conforme o que aconteceu nesta sessao (done se concluiu, blocked se travou, todo se nao avancou) e registre notas/links de evidencia se houver:\n${body}`
}

export function formatGentle(open) {
  return `Lembrete: se voce avancou ou concluiu algo rastreado nesta sessao, registre via update_item no tracker Tether (${open.length} item(ns) aberto(s)).`
}

export function formatMemory(entries) {
  const active = entries.filter((e) => !e.archived)
  if (active.length === 0)
    return 'MRP (Memoria Referencial de Projeto) vazia - ao descobrir comando, gotcha ou decisao duravel do projeto, registre via add_memory.'
  const totalChars = active.reduce((n, e) => n + e.body.length, 0)
  const compact = active.length > 30 || totalChars > 8000
  const lines = [
    `MRP (Memoria Referencial de Projeto) - ${active.length} entrada(s)${compact ? ' [resumo: so titulos; chame list_memory para o conteudo]' : ''}:`,
  ]
  for (const cat of CATEGORY_ORDER) {
    const group = active.filter((e) => e.category === cat)
    if (group.length === 0) continue
    lines.push(`[${CATEGORY_LABEL[cat]}]`)
    for (const e of group) lines.push(compact ? `- ${e.title}` : `- ${e.title}: ${e.body.replace(/\n/g, '\n  ')}`)
  }
  lines.push('Siga o que esta na MRP ao trabalhar neste projeto.')
  return lines.join('\n')
}

function sessionStart(context) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } })
}
function stopContext(context) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context } })
}

async function fetchJson(url, token, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function runHook(command, input = {}, fetchImpl = fetch) {
  const cfg = resolveConfig()
  if (!cfg.url || !cfg.token) return { exitCode: 0 }
  const cwd = input.cwd ?? process.cwd()
  const project = process.env.TETHER_PROJECT || findTetherProject(cwd) || basename(cwd)
  const q = '?project=' + encodeURIComponent(project)

  if (command === 'context') {
    const [items, memory] = await Promise.all([
      fetchJson(cfg.url + '/api/items' + q, cfg.token, fetchImpl),
      fetchJson(cfg.url + '/api/memory' + q, cfg.token, fetchImpl),
    ])
    const open = (items ?? []).filter((i) => i.status !== 'done' && i.status !== 'dropped')
    const mem = memory ?? []
    if (open.length === 0 && mem.length === 0) return { exitCode: 0 }
    const parts = []
    if (open.length > 0) parts.push(formatContext(open))
    parts.push(formatMemory(mem))
    return { exitCode: 0, stdout: sessionStart(parts.join('\n\n')) }
  }

  if (command === 'reconcile') {
    if (input.stop_hook_active === true) return { exitCode: 0 }
    const items = await fetchJson(cfg.url + '/api/items' + q, cfg.token, fetchImpl)
    if (!items) return { exitCode: 0 }
    const inProgress = items.filter((i) => i.status === 'in_progress')
    if (inProgress.length > 0) return { exitCode: 2, stderr: formatReconcile(inProgress) }
    const open = items.filter((i) => i.status !== 'done' && i.status !== 'dropped')
    if (open.length > 0) return { exitCode: 0, stdout: stopContext(formatGentle(open) + '\n' + MEMORY_REMINDER) }
    return { exitCode: 0 }
  }

  return { exitCode: 0 }
}
