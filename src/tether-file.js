import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

// Sobe da startDir ate a raiz procurando o 1o .tether LEGIVEL e devolve { path, name } (name pode
// ser null se vazio/so-comentario). O path e usado pelo auto-heal (reescrever o nome quando o
// projeto foi renomeado). Espelha tether/src/core/tether-file.ts.
export function findTetherFile(startDir) {
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
      if (content !== null) return { path: file, name: parseTetherFile(content) }
    }
    const parent = dirname(dir)
    if (parent === dir) return null // chegou na raiz
    dir = parent
  }
}

// Compat: so o nome do projeto do .tether mais proximo (ou null).
export function findTetherProject(startDir) {
  const f = findTetherFile(startDir)
  return f ? f.name : null
}

// Troca o NOME no conteudo do .tether preservando comentarios/estrutura. Prefere a linha
// `project: X` (mantendo o prefixo); senao a 1a linha util (mantendo indentacao); se so havia
// comentarios/branco, anexa o nome. Funcao pura.
export function replaceTetherName(content, newName) {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*project\s*[:=]\s*)(.+?)(\s*)$/i)
    if (m) {
      lines[i] = m[1] + newName
      return lines.join('\n')
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t.length > 0 && !t.startsWith('#')) {
      const indent = lines[i].match(/^(\s*)/)?.[1] ?? ''
      lines[i] = indent + newName
      return lines.join('\n')
    }
  }
  return content + (content.endsWith('\n') || content === '' ? '' : '\n') + newName + '\n'
}

// Reescreve o nome no arquivo .tether em `path` (best-effort).
export function rewriteTetherFile(path, newName) {
  const content = readFileSync(path, 'utf8')
  writeFileSync(path, replaceTetherName(content, newName))
}
