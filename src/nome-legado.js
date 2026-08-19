// O produto passou a se chamar Trail. O nome antigo (Tether) continua valendo PARA SEMPRE em tudo
// que alguem ja configurou: variavel de ambiente, arquivo de pasta e pasta de credencial. Quem esta
// rodando com a configuracao antiga nao precisa mexer em nada, nunca.
//
// Espelha o repo principal (src/core/nome-legado.ts). O espelhamento e de mao dupla de proposito:
// uma maquina configurada com TETHER_* funciona nesta versao, e uma configurada com TRAIL_*
// funciona no codigo que ainda le TETHER_*.

export const PREFIXO_NOVO = 'TRAIL_'
export const PREFIXO_LEGADO = 'TETHER_'

// Arquivo que amarra uma pasta a um projeto. O novo vem primeiro; o antigo segue lido pra sempre.
export const ARQUIVOS_DE_PASTA = ['.trail', '.tether']

// Pasta de credencial dentro de ~/.config. Mesma regra: a nova vence, a antiga continua valendo.
export const PASTAS_DE_CONFIG = ['trail', 'tether']

// Espelha TETHER_X <-> TRAIL_X no ambiente, sem NUNCA sobrescrever valor ja definido.
export function espelharAmbiente(env = process.env) {
  for (const [chave, valor] of Object.entries(env)) {
    if (valor === undefined) continue
    if (chave.startsWith(PREFIXO_LEGADO)) {
      const novo = PREFIXO_NOVO + chave.slice(PREFIXO_LEGADO.length)
      if (env[novo] === undefined) env[novo] = valor
    } else if (chave.startsWith(PREFIXO_NOVO)) {
      const legado = PREFIXO_LEGADO + chave.slice(PREFIXO_NOVO.length)
      if (env[legado] === undefined) env[legado] = valor
    }
  }
}
