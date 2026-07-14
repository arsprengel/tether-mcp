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

// Sobe o MCP server (stdio). As tools espelham as do tether e falam com a API REST da nuvem.
export async function runServer(config) {
  if (!config.url || !config.token) {
    process.stderr.write(
      '[tether-mcp] ainda nao conectado - rode: TETHER_API_URL=<url> npx -y github:arsprengel/tether-mcp login\n',
    )
  }
  const api = createApiClient(config)
  const server = new McpServer(
    { name: 'tether', version: '1.7.0' },
    {
      instructions:
        'Tether: tracker de itens + MRP (Memoria Referencial de Projeto). ' +
        'Os TITULOS da MRP ja vem no inicio da sessao - leia-os e SIGA o que estiver la. ' +
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
      description: 'Le a MRP (Memoria Referencial de Projeto): comandos, deploy, gotchas, decisoes e contexto duraveis do projeto. Os TITULOS de todas as entradas ja vem no inicio da sessao. Por padrao devolve so o INDICE (id, categoria, titulo) - barato; use pra pegar os ids das entradas que interessam. Para o CONTEUDO: get_memory(id) le UMA entrada; list_memory({category, detail:"full"}) le os bodies de UMA categoria; detail:"full" sem category le TUDO (caro) - so quando precisar de varios bodies. SIGA o que estiver na MRP.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        category: MemoryCategory.optional(),
        detail: z.enum(['index', 'full']).optional().describe('index (padrao): so id/categoria/titulo. full: bodies completos (combine com category pra escopar).'),
      },
    },
    // #93: default = INDICE (so id/category/title, ~1.5K tok em vez de ~18.5K de bodies). O body
    // vem sob demanda (get_memory ou detail:'full'). 'detail' nao vai pra api.listMemory.
    async ({ detail, ...filter }) => {
      try {
        const entries = await api.listMemory(filter)
        if (detail === 'full') return ok(entries)
        return ok(entries.map((e) => ({ id: e.id, category: e.category, title: e.title })))
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
        title: z.string(),
        body: z.string(),
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
