import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createApiClient } from './api.js'

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
  const server = new McpServer({ name: 'tether', version: '1.0.0' })
  const scoped = ` Default: projeto "${config.project}" (a pasta aberta); passe project so para outro.`

  server.registerTool(
    'list_items',
    {
      description: 'Lista itens do tracker. Use no inicio para ver pontas abertas antes de agir.' + scoped,
      inputSchema: {
        project: z.string().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
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
        type: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
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
      inputSchema: { id: z.string(), patch: z.record(z.string(), z.unknown()) },
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

  await server.connect(new StdioServerTransport())
}
