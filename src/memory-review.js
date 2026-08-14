// ESPELHO de tether/src/core/memory-review.ts - mudou la, muda aqui (repo standalone, sem codigo
// compartilhado). Regua de admissao da MRP + quando cobrar faxina.
//
// FAXINA DA MRP (item #171). A MRP so crescia: a regra de admissao era adjetiva ("regua alta") e
// nao havia saida nenhuma, entao toda sessao achava que a descoberta DELA era a excecao. Com 272
// entradas (argus, 08/2026) o indice de abertura vira parede de texto e ninguem abre nada.
// Quem faxina e a sessao que trabalha DENTRO do projeto: so ela consegue conferir se a nota ainda
// e verdade.

export const REGUA_MRP =
  'REGUA (as TRES precisam ser SIM; na duvida, NAO registre): ' +
  '(1) So vale NESTE projeto? Comportamento de linguagem, biblioteca ou ferramenta que se repete ' +
  'em qualquer projeto fica de fora - a IA ja sabe ou descobre numa busca. ' +
  '(2) Continua verdade daqui a 6 meses sem ninguem atualizar? Estado do dia, "agora"/"por enquanto", ' +
  'numero que muda e data de decisao recente ficam de fora. ' +
  '(3) Sem isso, a proxima sessao ERRA ou REFAZ trabalho? Vale armadilha E orientacao ' +
  '("reuse o X, nao reinvente"); curiosidade nao vale.'

export const MRP_ALVO = 80
export const MRP_INTERVALO_MS = 7 * 24 * 60 * 60 * 1000
export const MRP_LOTE_BASE = 12
export const MRP_LOTE_MAX = 30
export const MRP_MINIMO = 12

const DIA_MS = 24 * 60 * 60 * 1000

// O hook consome o JSON CRU de /api/memory (sem Zod), entao reviewed_at chega AUSENTE enquanto o
// servidor nao migrou - a janela normal de subida. Ausente = "nunca revisada", a leitura segura.
export function planejarFaxina(entries, agora, opts = {}) {
  const alvo = opts.alvo ?? MRP_ALVO
  const intervalo = opts.intervalo ?? MRP_INTERVALO_MS
  const ativos = entries.filter((e) => !e.archived)
  const total = ativos.length
  // reduce, nao Math.max(...): spread de array grande estoura a pilha, e MRP grande e justamente
  // o caso que este codigo existe pra tratar.
  const ultimaBruta = ativos.reduce((max, e) => Math.max(max, e.reviewed_at ?? 0), 0)
  const novas = ativos.filter((e) => e.created_at > ultimaBruta).length
  const vencido = agora - ultimaBruta >= intervalo
  const pendente = total >= MRP_MINIMO && vencido && (total > alvo || novas > 0)
  const tamanho = Math.min(MRP_LOTE_MAX, MRP_LOTE_BASE + Math.ceil(Math.max(0, total - alvo) / 4))
  const lote = [...ativos]
    .sort((a, b) => (a.reviewed_at ?? 0) - (b.reviewed_at ?? 0) || a.created_at - b.created_at)
    .slice(0, tamanho)
  return {
    pendente,
    total,
    alvo,
    excedente: Math.max(0, total - alvo),
    ultima: ultimaBruta > 0 ? ultimaBruta : null,
    dias: ultimaBruta > 0 ? Math.floor((agora - ultimaBruta) / DIA_MS) : null,
    novas,
    lote,
  }
}

// ESPELHO de INSTRUCAO_FAXINA em tether/src/mcp/tools.ts.
export const INSTRUCAO_FAXINA =
  'Julgue TODAS as entradas do lote, uma a uma, e feche a rodada chamando review_memory de novo ' +
  'com keep (continua valendo) e archive ([{id, reason}], sai da MRP). ' +
  'SAI: falha em qualquer uma das tres perguntas da regua; virou mentira (confira no codigo/estado ' +
  'atual antes de julgar - e por isso que a faxina e feita por quem trabalha DENTRO do projeto); ' +
  'duplica outra entrada; ou e trabalho-a-fazer (isso e item do tracker, nao MRP). ' +
  'CORRIGIR conta: entrada boa que envelheceu num ponto se conserta com update_memory e depois vai ' +
  'pro keep - nao arquive o que da pra salvar em uma linha. ' +
  'NA DUVIDA, ARQUIVE com o motivo: arquivar e reversivel e o motivo fica no historico da entrada; ' +
  'entrada duvidosa que fica e o que transforma a MRP numa parede de texto que ninguem le. ' +
  'Nao peca aprovacao pra isso - e reversivel. Termine em uma passada e volte pra tarefa do usuario.'

// ESPELHO de formatFaxina em tether/src/hooks/format.ts.
export function formatFaxina(entries, agora = Date.now()) {
  const plano = planejarFaxina(entries, agora)
  if (!plano.pendente) return null
  const quando = plano.dias === null ? 'nunca passou por faxina' : `ultima faxina ha ${plano.dias} dia(s)`
  const excesso = plano.excedente > 0 ? `, ${plano.excedente} acima do alvo de ${plano.alvo}` : ''
  const linhas = [
    `[FAXINA DA MRP PENDENTE] ${plano.total} entrada(s) ativa(s)${excesso}; ${quando}.`,
    'ANTES da tarefa do usuario: chame review_memory() sem argumentos, julgue o lote que vier e feche com review_memory({keep, archive}).',
    'E uma passada curta, arquivar e reversivel e nao precisa de aprovacao. MRP que so cresce para de ser lida.',
  ]
  // MRP muito inchada nao se resolve numa rodada. Dizer o tamanho do buraco evita duas coisas:
  // a IA achar que terminou o servico, e o usuario nao saber que pode mandar limpar tudo de uma vez.
  const rodadas = Math.ceil(plano.excedente / plano.lote.length)
  if (rodadas > 1)
    linhas.push(`Nesse ritmo sao ~${rodadas} rodadas ate o alvo. Se o usuario pedir faxina completa, encadeie as rodadas agora, sem esperar as proximas sessoes.`)
  return linhas.join('\n')
}
