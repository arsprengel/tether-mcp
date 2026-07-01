#!/usr/bin/env node
import { resolveConfig, clearSaved, readSaved } from './src/config.js'
import { runServer } from './src/server.js'
import { runLogin } from './src/login.js'

const cmd = process.argv[2]

async function main() {
  if (cmd === 'login') {
    const url = process.env.TETHER_API_URL || readSaved()?.url
    if (!url) {
      process.stderr.write(
        'Defina o endereco do Tether no 1o login (o admin te passa), ex:\n' +
          '  TETHER_API_URL=https://SEU-TETHER npx -y github:arsprengel/tether-mcp login\n',
      )
      process.exit(1)
    }
    await runLogin(url)
    return
  }
  if (cmd === 'logout') {
    process.stdout.write(clearSaved() ? 'Token removido.\n' : 'Nenhum token salvo.\n')
    return
  }
  if (cmd === 'status') {
    const cfg = resolveConfig()
    process.stdout.write(`url:     ${cfg.url}\n`)
    process.stdout.write(`project: ${cfg.project}\n`)
    process.stdout.write(`token:   ${cfg.token ? 'presente' : 'AUSENTE (rode: tether-mcp login)'}\n`)
    return
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(
      [
        'tether-mcp - MCP do Tether',
        '',
        'Uso:',
        '  tether-mcp            sobe o servidor MCP (stdio) - usado pelo Claude',
        '  tether-mcp login      conecta esta maquina ao Tether (login pelo site)',
        '  tether-mcp logout     apaga o token salvo',
        '  tether-mcp status     mostra url, projeto e se ha token',
        '',
        'Env: TETHER_API_URL (endereco do Tether; obrigatorio no 1o login, o admin te passa),',
        '     TETHER_PROJECT (default = nome da pasta atual).',
        '',
      ].join('\n'),
    )
    return
  }
  // default (sem argumento): MCP server stdio
  await runServer(resolveConfig())
}

main().catch((err) => {
  process.stderr.write('[tether-mcp] ' + (err instanceof Error ? err.message : String(err)) + '\n')
  process.exit(1)
})
