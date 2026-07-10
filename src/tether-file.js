import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Vinculo por pasta: um arquivo .tether na pasta (ou em qualquer ancestral) diz qual projeto
// do Tether essa pasta representa, independente do nome da pasta. Espelha o mesmo resolver do
// repo tether (src/core/tether-file.ts). Prioridade de resolucao do projeto no MCP/hooks:
// TETHER_PROJECT (env) > .tether (mais proximo subindo) > nome da pasta (basename).

// Le o conteudo de um .tether e devolve o nome do projeto (ou null). Tolerante: ignora linhas
// em branco e comentarios (#...); prefere uma linha `project: nome` (ou `project=nome`); senao
// usa a 1a linha util.
export function parseTetherFile(content) {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  for (const line of lines) {
    const m = line.match(/^project\s*[:=]\s*(.+)$/i)
    if (m) {
      const captured = m[1].trim()
      if (captured) return captured
    }
  }
  return lines[0] ?? null
}

// Sobe da startDir ate a raiz do filesystem procurando um .tether. O 1o .tether LEGIVEL decide
// (nome OU null) e para a subida - um .tether vazio/so-comentario cai no basename, nao adota o
// de um ancestral. Arquivo ilegivel e tratado como se nao existisse aqui (continua subindo).
export function findTetherProject(startDir) {
  let dir = startDir
  for (;;) {
    const file = join(dir, '.tether')
    if (existsSync(file)) {
      let content = null
      try {
        content = readFileSync(file, 'utf8')
      } catch {
        content = null // ilegivel -> trata como se nao houvesse .tether aqui, continua subindo
      }
      if (content !== null) return parseTetherFile(content) // 1o .tether legivel manda; para de subir
    }
    const parent = dirname(dir)
    if (parent === dir) return null // chegou na raiz
    dir = parent
  }
}
