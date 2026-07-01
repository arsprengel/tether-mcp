import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs'

// Dashboard padrao da Intecma. Trocavel por env TETHER_API_URL (outra instalacao/empresa).
export const DEFAULT_URL = 'https://tether.intecma.com.br'

export function configDir() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'tether')
}

export function tokenPath() {
  return join(configDir(), 'token.json')
}

export function readSaved() {
  try {
    return JSON.parse(readFileSync(tokenPath(), 'utf8'))
  } catch {
    return null
  }
}

export function writeSaved(data) {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(tokenPath(), JSON.stringify(data, null, 2))
  // Token e credencial: so o dono le.
  try {
    chmodSync(tokenPath(), 0o600)
  } catch {
    /* windows/fs sem chmod: ignora */
  }
}

export function clearSaved() {
  try {
    rmSync(tokenPath())
    return true
  } catch {
    return false
  }
}

// Resolve a config do server: env > token salvo (login) > default.
// O project vem da PASTA ABERTA (ou TETHER_PROJECT): assim o Claude escreve no projeto
// certo no banco unico da nuvem, sem misturar projetos (Onboarding Parte C).
export function resolveConfig() {
  const saved = readSaved()
  const url = (process.env.TETHER_API_URL || saved?.url || DEFAULT_URL).replace(/\/$/, '')
  let token = process.env.TETHER_API_TOKEN || saved?.token || ''
  const authEnv = process.env.TETHER_API_AUTH
  if (!token && authEnv) token = authEnv.replace(/^Bearer\s+/i, '').trim()
  const project = process.env.TETHER_PROJECT || basename(process.cwd())
  return { url, token, project }
}
