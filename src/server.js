import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createApiClient } from './api.js'

// Espelha tether/src/core/schema.ts (fonte de verdade dos valores validos). Repo standalone,
// nao importa o core do tether - se o core mudar os valores, atualizar aqui tambem.
const ItemType = z.enum(['feature', 'bug', 'chore', 'idea', 'question'])
const ItemStatus = z.enum(['backlog', 'todo', 'in_progress', 'blocked', 'done', 'dropped'])
const Priority = z.enum(['low', 'med', 'high'])
const Ref = z.object({ kind: z.enum(['commit', 'pr', 'file', 'item']), value: z.string().min(1) })
const ItemPatch = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  type: ItemType.optional(),
  status: ItemStatus.optional(),
  priority: Priority.optional(),
  tags: z.array(z.string()).optional(),
  links: z.array(Ref).optional(),
  blocked_by: z.array(z.string()).optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
})
const MemoryCategory = z.enum(['command', 'deploy', 'gotcha', 'decision', 'context'])
const MemoryPatch = z.object({
  category: MemoryCategory.optional(),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  hint: z.string().optional(),
  archived: z.boolean().optional(),
})
const ReminderStatus = z.enum(['pending', 'done', 'dismissed'])

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}
function fail(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: `error: ${msg}` }], isError: true }
}

// #130: TETO DE SAIDA. A resposta de uma tool MCP tem limite no cliente (25K tokens no padrao
// do Claude Code); acima dele a resposta e trocada por um ponteiro pra arquivo em disco - ou
// seja, some justo pra quem le, que e a IA. A MRP cresce sem freio (tether 60 entradas/131K
// chars, argus 177/421K), entao `detail:"full"` ja nascia condenado. 40K chars sobrevive ate
// ao cambio char/token mais pessimista (~2.5) e cabe em qualquer teto praticado.
// ESPELHO de src/mcp/tools.ts no tether (paginarNoTeto/cortarCorpo) - mudou la, muda aqui.
export const TETO_RESPOSTA_CHARS = 40_000

// Corta a lista por ORCAMENTO DE CHARS (nao por numero de entradas: elas variam de 500 a 7000
// chars). Devolve o array puro quando a pagina cobre a lista inteira - o formato antigo, que e
// o caso comum - e so entao veste o envelope com o aviso. O corte nunca e silencioso.
export function paginarNoTeto(todas, opts = {}) {
  const teto = opts.teto ?? TETO_RESPOSTA_CHARS
  const bruto = Math.trunc(Number(opts.offset ?? 0))
  const inicio = Math.min(Math.max(0, Number.isFinite(bruto) ? bruto : 0), todas.length)
  const limite = opts.limit && opts.limit > 0 ? Math.trunc(opts.limit) : todas.length
  const janela = todas.slice(inicio, inicio + limite)

  const escolhidas = []
  let gasto = 0
  let cortou = false
  for (const e of janela) {
    const custo = JSON.stringify(e, null, 2).length
    // A primeira entrada da pagina SEMPRE entra (cortada, se houver como): sem isso uma
    // entrada maior que o teto devolveria pagina vazia pra sempre e a paginacao travava.
    if (escolhidas.length === 0) {
      cortou = custo > teto && !!opts.cortar
      escolhidas.push(cortou ? opts.cortar(e, teto) : e)
    }
    else if (gasto + custo > teto) break
    else escolhidas.push(e)
    gasto += custo
    if (gasto > teto) break
  }

  const montar = (entries) => {
    const proximo = inicio + entries.length
    // Array puro (formato antigo) SO quando a resposta e a lista inteira e nada foi cortado -
    // corpo cortado com cara de resposta completa e exatamente o silencio que este item veio
    // resolver.
    if (inicio === 0 && proximo >= todas.length && !cortou) return entries
    const faltam = todas.length - proximo
    return {
      aviso: entries.length === 0
        ? `Nada nesse offset: a lista tem ${todas.length} entrada(s), offset valido de 0 a ${Math.max(0, todas.length - 1)}.`
        : faltam > 0
          ? `Resposta cortada no teto de saida: vieram ${entries.length} de ${todas.length} entrada(s), a partir de ${inicio}. Faltam ${faltam} - chame de novo com offset:${proximo}${opts.dica ?? ''}.`
          : cortou
            ? 'Entrada grande demais para uma resposta so: o corpo veio cortado (o proprio corpo diz onde e como ler o resto).'
            : `Fim da lista: entrada(s) ${inicio} a ${proximo - 1} de ${todas.length}.`,
      total: todas.length,
      offset: inicio,
      devolvidas: entries.length,
      proximo_offset: faltam > 0 ? proximo : null,
      entries,
    }
  }

  // Garantia dura: o texto EMITIDO (mesmo JSON.stringify do ok()) fica sob o teto. O orcamento
  // acima estima sem o envelope nem a indentacao extra do aninhamento; aqui confere de fato.
  let pagina = montar(escolhidas)
  const tamanho = () => JSON.stringify(pagina, null, 2).length
  while (escolhidas.length > 1 && tamanho() > teto) {
    escolhidas.pop()
    pagina = montar(escolhidas)
  }
  // Sobrou uma entrada so e ainda passa: aperta o corte dela ate caber, em vez de confiar numa
  // folga chutada. Sem isso o envelope (aviso + contadores) empurra a resposta pra fora do teto.
  const inteira = janela[0]
  if (opts.cortar && inteira !== undefined) {
    for (let folga = 0; escolhidas.length === 1 && tamanho() > teto && folga < teto; ) {
      folga += tamanho() - teto + 200
      cortou = true
      escolhidas[0] = opts.cortar(inteira, teto - folga)
      pagina = montar(escolhidas)
    }
  }
  return pagina
}

// Ultimo recurso: UMA entrada da MRP maior que o teto inteiro. Corta o corpo e deixa o aviso
// DENTRO do texto, onde a IA vai ler, com o ponteiro pra leitura completa. Nao se corta o
// corpo de entrada que caiba - meia verdade num gotcha e pior que uma pagina a mais.
function cortarCorpo(e, teto) {
  const cabe = teto - JSON.stringify({ ...e, body: '' }, null, 2).length - 300
  if (cabe <= 0 || e.body.length <= cabe) return e
  const faltam = e.body.length - cabe
  return { ...e, body: `${e.body.slice(0, cabe)}\n\n[corpo cortado aqui - faltam ${faltam} chars. Leia inteiro com get_memory("${e.id}").]` }
}

// Sobe o MCP server (stdio). As tools espelham as do tether e falam com a API REST da nuvem.
export async function runServer(config) {
  if (!config.url || !config.token) {
    process.stderr.write(
      '[tether-mcp] ainda nao conectado - rode: TETHER_API_URL=<url> npx -y github:arsprengel/tether-mcp login\n',
    )
  }
  const api = createApiClient(config)
  const server = new McpServer(
    { name: 'tether', version: '1.9.0' },
    {
      instructions:
        'Tether: tracker de itens + MRP (Memoria Referencial de Projeto). ' +
        'O INDICE da MRP (titulo + gancho de cada entrada) ja vem no inicio da sessao - leia-o e SIGA o que estiver la. ' +
        'O GANCHO (linha com ">") diz QUANDO aquela entrada importa: ao tocar uma area que um gancho cobre, ' +
        'ABRA a entrada com get_memory(id) antes de agir - trabalhar so pelo titulo e o erro que o gancho existe pra evitar. ' +
        'Para o CONTEUDO de uma entrada, leia sob demanda (nao puxe a MRP toda a toa): ' +
        'list_memory da o indice barato (ids+titulos), get_memory(id) abre UMA entrada, ' +
        'list_memory({category, detail:"full"}) le uma categoria inteira antes de operar nela. ' +
        'Ao descobrir um GOTCHA/decisao/comando/deploy nao-obvio e duravel, registre com add_memory - ' +
        'REGUA ALTA: so o que POUPA TEMPO futuro e NAO esta a vista no codigo; na duvida nao registre; ' +
        'grave o PORQUE, nao duplique SQL/estrutura/passo-a-passo. Cheque list_memory antes. ' +
        'TRABALHO-A-FAZER nao vai pra MRP, vira item do tracker (add_item); corte deliberado = ponteiro pro item. ' +
        'Corrija ou aposente entradas velhas com update_memory. ' +
        'Itens de trabalho: list_items/get_next para ver pontas abertas, add_item ao descobrir ' +
        'trabalho novo, update_item ao avancar ou concluir. ' +
        'Lembretes: se prometer avisar algo numa data futura, registre com add_reminder (o Tether ' +
        'guarda e mostra no dashboard, ja que a sessao nao fica aberta pra lembrar); list_reminders ve os pendentes.',
    },
  )
  const scoped = ` Default: projeto "${config.project}" (a pasta aberta); passe project so para outro.`
  // Convencao do item #11: reforca a regra de idea no momento em que a IA puxa um item.
  const ideaHint =
    ' Se o item for type=idea (captura crua), clarifique o escopo com o usuario e entre em plan mode ' +
    '(plano para aprovar) antes de codar; feature/chore/bug detalhados podem ir direto.'

  server.registerTool(
    'list_items',
    {
      description: 'Lista itens do tracker. Use no inicio para ver pontas abertas antes de agir.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        status: ItemStatus.optional(),
        type: ItemType.optional(),
        tag: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return ok(await api.listItems(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'get_item',
    {
      description: 'Detalhe completo de um item por id. Chame antes de agir sobre um item para ver o estado atual.' + ideaHint,
      inputSchema: { id: z.string() },
    },
    async (args) => {
      try {
        return ok(await api.getItem(args.id))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'add_item',
    {
      description: 'Cria um item (ponta solta). Chame ao descobrir trabalho novo a fazer.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        title: z.string(),
        body: z.string().optional(),
        type: ItemType.optional(),
        status: ItemStatus.optional(),
        priority: Priority.optional(),
        links: z.array(Ref).optional(),
        blocked_by: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        return ok(await api.addItem(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'update_item',
    {
      description: 'Atualiza um item (status, notas, links). Chame ao concluir ou avancar trabalho.',
      inputSchema: { id: z.string(), patch: ItemPatch },
    },
    async (args) => {
      try {
        return ok(await api.updateItem(args.id, args.patch))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'move_item',
    {
      description: 'Reordena um item na lista do seu projeto (index 0-based; 0 = topo, um numero grande = fim). Use para controlar a ordem/cronologia dos itens.',
      inputSchema: { id: z.string(), index: z.number().int().min(0) },
    },
    async (args) => {
      try {
        return ok(await api.moveItem(args.id, args.index))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'get_next',
    {
      description: 'Retorna o proximo item aberto de maior prioridade. Chame quando precisar decidir o que atacar a seguir.' + scoped + ideaHint,
      inputSchema: { project: z.string().optional() },
    },
    async (args) => {
      try {
        return ok(await api.getNext(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'delete_item',
    {
      description: 'Apaga um item de vez (item + historico). Use quando um item foi criado por engano ou nao serve mais. Irreversivel.',
      inputSchema: { id: z.string() },
    },
    async (args) => {
      try {
        const deleted = await api.deleteItem(args.id)
        return ok({ deleted, id: args.id })
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'list_memory',
    {
      description: 'Le a MRP (Memoria Referencial de Projeto): comandos, deploy, gotchas, decisoes e contexto duraveis do projeto. Os TITULOS de todas as entradas ja vem no inicio da sessao. Por padrao devolve so o INDICE (id, categoria, titulo) - barato; use pra pegar os ids das entradas que interessam. Para o CONTEUDO: get_memory(id) le UMA entrada; list_memory({category, detail:"full"}) le os bodies de UMA categoria; detail:"full" sem category le TUDO (caro) - so quando precisar de varios bodies. Resposta grande demais vem PAGINADA: nesse caso vem um objeto com aviso/total/proximo_offset/entries - se proximo_offset nao for null, chame de novo com esse offset pra pegar o resto. SIGA o que estiver na MRP.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        category: MemoryCategory.optional(),
        detail: z.enum(['index', 'full']).optional().describe('index (padrao): so id/categoria/titulo. full: bodies completos (combine com category pra escopar).'),
        offset: z.number().int().min(0).optional().describe('Pula as N primeiras entradas. Use o proximo_offset devolvido pela pagina anterior.'),
        limit: z.number().int().min(1).optional().describe('Teto de entradas nesta resposta (o teto de tamanho vale de qualquer jeito).'),
      },
    },
    // #93: default = INDICE (so id/category/title, ~1.5K tok em vez de ~18.5K de bodies). O body
    // vem sob demanda (get_memory ou detail:'full'). 'detail' nao vai pra api.listMemory.
    // #130: offset/limit sao da SAIDA, nao do storage - saem do filtro junto com o detail.
    async ({ detail, offset, limit, ...filter }) => {
      try {
        const entries = await api.listMemory(filter)
        const pag = { offset, limit }
        if (detail === 'full')
          return ok(paginarNoTeto(entries, { ...pag, dica: ', ou filtre por category pra uma fatia menor', cortar: cortarCorpo }))
        return ok(paginarNoTeto(entries.map((e) => ({ id: e.id, category: e.category, title: e.title })), pag))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'get_memory',
    {
      description: 'Le o CONTEUDO completo de UMA entrada da MRP por id (o body inteiro). Use pra abrir so a entrada relevante, a partir do indice do list_memory (ou dos titulos do inicio da sessao). Barato por design - nao puxe a MRP toda pra ler uma nota.',
      inputSchema: { id: z.string() },
    },
    async (args) => {
      try {
        const entry = await api.getMemory(args.id)
        if (!entry) return fail(new Error('entrada da MRP nao encontrada'))
        return ok(entry)
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'add_memory',
    {
      description: 'Registra conhecimento duravel de REFERENCIA na MRP do projeto (comando, deploy, gotcha, decisao, contexto) - o que um agente precisa LER pra nao redescobrir. REGUA ALTA (de gotcha, nao de documentacao): so registre se (1) alguem perderia tempo/bateria a cabeca SEM essa nota, (2) e nao-obvio - NAO esta a vista lendo o codigo, e (3) continua verdade depois; na duvida, NAO registre. Grave so o PORQUE nao-obvio + a implicacao de futuro; NAO duplique SQL, constantes, estrutura de tabela nem passo-a-passo (isso vive no codigo/commit - no maximo aponte pra la). NAO registre trabalho-a-fazer/follow-up/backlog: isso e item do tracker (use add_item). Corte deliberado vira referencia com ponteiro pro item ("out-of-scope, ver #86"), nao TODO. Cheque list_memory antes para nao duplicar.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        category: MemoryCategory,
        title: z.string().describe('Curto (ate ~60 caracteres): o ASSUNTO, nao o resumo. Titulo longo e cortado na exibicao.'),
        body: z.string(),
        hint: z.string().describe('O GANCHO, uma linha: o que essa entrada poupa e QUANDO abri-la. Numa MRP grande e a UNICA coisa que o agente ve alem do titulo, entao e ele que decide se a entrada e lida. Escreva pra quem ainda nao sabe que precisa dela: "Vai te custar 1h cacando cache. Abra ANTES de mexer em pagina de autoatendimento."'),
      },
    },
    async (args) => {
      try {
        return ok(await api.addMemory(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'update_memory',
    {
      description: 'Corrige uma entrada da MRP ou aposenta com patch {archived: true}. Prefira aposentar a apagar.',
      inputSchema: { id: z.string(), patch: MemoryPatch },
    },
    async (args) => {
      try {
        return ok(await api.updateMemory(args.id, args.patch))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'add_reminder',
    {
      description:
        'Registra um lembrete/agendamento no Tether. Chame SEMPRE que prometer avisar algo no futuro ' +
        '("quando chegar o dia X eu te lembro") ou combinar de retomar algo numa data - a sessao nao ' +
        'fica aberta pra lembrar sozinha; o Tether guarda e mostra no dashboard (aba Lembretes).' + scoped,
      inputSchema: {
        project: z.string().optional(),
        message: z.string(),
        remind_at: z.string().describe('data/hora do lembrete em ISO 8601 (ex: 2026-08-01 ou 2026-08-01T09:00:00Z)'),
        item_id: z.string().optional().describe('id de um item do tracker a vincular (opcional)'),
      },
    },
    async (args) => {
      try {
        return ok(await api.addReminder(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'list_reminders',
    {
      description: 'Lista os lembretes/agendamentos do projeto (pendentes por padrao; ordenados por data). Chame pra conferir o que ja foi agendado.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        status: ReminderStatus.optional(),
      },
    },
    async (args) => {
      try {
        return ok(await api.listReminders(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'add_attachment',
    {
      description: 'Anexa um arquivo (base64) a um card do tracker. Use pra guardar spec, doc ou planilha relevante ao card. Nasce INTERNO (so o time ve); passe shared_with_client=true pra o cliente do portal poder baixar.' + scoped,
      inputSchema: {
        item_id: z.string(),
        project: z.string().optional(),
        filename: z.string(),
        content_base64: z.string().describe('conteudo do arquivo em base64'),
        description: z.string().optional().describe('resumo curto do anexo (a IA le isso na lista, barato)'),
        shared_with_client: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const { item_id, ...input } = args
        return ok(await api.addAttachment(item_id, input))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'get_attachment',
    {
      description: 'Le o CONTEUDO de um anexo sob demanda (texto extraido pra txt/csv; base64 pra imagem pequena). Nao chame a toa - a lista de anexos ja vem no get_item com nome e descricao.',
      inputSchema: { id: z.string() },
    },
    async (args) => {
      try {
        const meta = await api.getAttachment(args.id)
        if (!meta) return fail(new Error('anexo nao encontrado'))
        if (meta.extracted_text) return ok({ ...meta, text: meta.extracted_text })
        if (meta.content_type.startsWith('image/') && meta.size_bytes < 1_500_000) {
          const bytes = await api.downloadAttachment(args.id)
          if (!bytes) return fail(new Error('anexo nao encontrado'))
          return ok({ ...meta, content_base64: Buffer.from(bytes).toString('base64') })
        }
        return ok({ ...meta, note: 'sem texto extraido; baixe pelo dashboard para processar' })
      } catch (e) {
        return fail(e)
      }
    },
  )

  await server.connect(new StdioServerTransport())
}
