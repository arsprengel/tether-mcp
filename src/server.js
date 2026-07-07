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
    { name: 'tether', version: '1.3.1' },
    {
      instructions:
        'Tether: tracker de itens + MRP (Memoria Referencial de Projeto). ' +
        'Ao COMECAR a trabalhar num projeto, chame list_memory e siga o que estiver la ' +
        '(comandos, deploy, gotchas, decisoes, contexto). ' +
        'Ao descobrir algo duravel do projeto, registre com add_memory (cheque list_memory antes ' +
        'para nao duplicar); corrija ou aposente entradas velhas com update_memory. ' +
        'Itens de trabalho: list_items/get_next para ver pontas abertas, add_item ao descobrir ' +
        'trabalho novo, update_item ao avancar ou concluir.',
    },
  )
  const scoped = ` Default: projeto "${config.project}" (a pasta aberta); passe project so para outro.`

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
      description: 'Detalhe completo de um item por id. Chame antes de agir sobre um item para ver o estado atual.',
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
      description: 'Retorna o proximo item aberto de maior prioridade. Chame quando precisar decidir o que atacar a seguir.' + scoped,
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
      description: 'Le a MRP (Memoria Referencial de Projeto): comandos, deploy, gotchas, decisoes e contexto duraveis do projeto. Chame ao comecar a trabalhar e SIGA o que estiver la.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        category: MemoryCategory.optional(),
      },
    },
    async (args) => {
      try {
        return ok(await api.listMemory(args))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'add_memory',
    {
      description: 'Registra uma descoberta duravel na MRP do projeto (comando, deploy, gotcha, decisao, contexto). Cheque list_memory antes para nao duplicar.' + scoped,
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

  await server.connect(new StdioServerTransport())
}
