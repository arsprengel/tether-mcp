#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, clearSaved, readSaved } from './src/config.js'
import { runServer } from './src/server.js'
import { runLogin } from './src/login.js'

const cmd = process.argv[2]

const DIR = dirname(fileURLToPath(import.meta.url))
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000

// Auto-atualizacao "na proxima inicializacao": quando instalado por clone (tem .git),
// dispara um git pull ff-only DESANEXADO em background, no maximo a cada 6h. A sessao
// atual segue com a versao ja carregada; a proxima ja sobe atualizada - ninguem precisa
// rodar git pull na mao. Fail-silent por construcao: sem rede, com conflito, sem git ou
// instalado via npx (sem .git), nada acontece e o server sobe normal.
function maybeSelfUpdate() {
  try {
    if (process.platform === 'win32') return
    if (!existsSync(join(DIR, '.git'))) return
    const stamp = join(DIR, '.last-pull')
    try {
      if (Date.now() - statSync(stamp).mtimeMs < UPDATE_INTERVAL_MS) return
    } catch {
      /* sem stamp ainda: primeira vez, segue */
    }
    writeFileSync(stamp, String(Date.now()))
    const sh = `git -C "${DIR}" pull --ff-only --quiet && npm --prefix "${DIR}" install --omit=dev --silent`
    spawn('sh', ['-c', sh], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* atualizacao nunca pode atrapalhar o server */
  }
}

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
  maybeSelfUpdate()
  await runServer(resolveConfig())
}

main().catch((err) => {
  process.stderr.write('[tether-mcp] ' + (err instanceof Error ? err.message : String(err)) + '\n')
  process.exit(1)
})
