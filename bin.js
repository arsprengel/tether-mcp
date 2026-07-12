#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, clearSaved, readSaved } from './src/config.js'
import { runServer } from './src/server.js'
import { runLogin } from './src/login.js'
import { runHook } from './src/hook.js'
import { healTetherIfRenamed } from './src/tether-heal.js'
import { installHooks, uninstallHooks, settingsPath } from './src/hooks-install.js'

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
  if (cmd === 'hook') {
    // Chamado pelo Claude Code (SessionStart/Stop). Nunca pode derrubar a sessao:
    // qualquer erro inesperado vira exit 0 silencioso; o unico exit 2 e o reconcile.
    const sub = process.argv[3]
    let input = {}
    try {
      const chunks = []
      for await (const c of process.stdin) chunks.push(c)
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw) {
        const v = JSON.parse(raw)
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) input = v
      }
    } catch {
      /* stdin ruim: segue com input vazio */
    }
    // Auto-heal do .tether ANTES de ler (pega renames; nunca derruba o hook).
    if (sub === 'context') await healTetherIfRenamed(input.cwd ?? process.cwd())
    const outcome = await runHook(sub, input).catch(() => ({ exitCode: 0 }))
    const payload = outcome.stdout ?? outcome.stderr
    if (payload) {
      const stream = outcome.stdout ? process.stdout : process.stderr
      stream.write(payload, () => process.exit(outcome.exitCode))
    } else {
      process.exit(outcome.exitCode)
    }
    return
  }
  if (cmd === 'hooks') {
    const sub = process.argv[3]
    if (sub === 'install' || sub === 'uninstall') {
      try {
        const results = sub === 'install' ? installHooks() : uninstallHooks()
        process.stdout.write(results.map((r) => `  ${r}`).join('\n') + '\n')
        process.stdout.write(`(arquivo: ${settingsPath()}; backup .tether-bak ao lado)\n`)
        if (sub === 'install') process.stdout.write('Reinicie as sessoes do Claude para valer.\n')
      } catch (e) {
        process.stderr.write(`hooks ${sub} falhou (settings.json intacto): ${e instanceof Error ? e.message : String(e)}\n`)
        process.exit(1)
      }
      return
    }
    process.stderr.write('uso: tether-mcp hooks <install|uninstall>\n')
    process.exit(1)
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
        '  tether-mcp hooks install|uninstall   registra/remove os hooks de sessao do Claude',
        '                        (tracker + MRP automaticos no inicio, lembrete no stop)',
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
  // Auto-heal do .tether antes de resolver o projeto da sessao.
  await healTetherIfRenamed()
  await runServer(resolveConfig())
}

main().catch((err) => {
  process.stderr.write('[tether-mcp] ' + (err instanceof Error ? err.message : String(err)) + '\n')
  process.exit(1)
})
