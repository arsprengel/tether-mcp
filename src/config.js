import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs'

// Sem endereco embutido de proposito: este repo e publico, mas o endereco do Tether e a conta
// sao privados da equipe. A URL vem do admin (env TETHER_API_URL no 1o login) e fica salva
// depois disso. A trava de acesso e o login do servidor, nao este codigo.

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
  const url = (process.env.TETHER_API_URL || saved?.url || '').replace(/\/$/, '')
  let token = process.env.TETHER_API_TOKEN || saved?.token || ''
  const authEnv = process.env.TETHER_API_AUTH
  if (!token && authEnv) token = authEnv.replace(/^Bearer\s+/i, '').trim()
  const project = process.env.TETHER_PROJECT || basename(process.cwd())
  return { url, token, project }
}
