# tether-mcp

MCP do **Tether** - conecta o Claude Code (a IA) ao tracker de roadmap da sua equipe na nuvem.

O login e pelo site (device flow, estilo `gh auth login`): voce nao copia token a mao. Cada
pessoa conecta a propria maquina e o Claude passa a escrever no tracker **como ela**, enxergando
so os projetos que ela pode ver.

## Instalar (cada dev, uma vez)

```bash
# 1. registra o MCP do tether no Claude Code (escopo user = vale em todos os seus projetos)
claude mcp add tether -s user -- npx -y github:arsprengel/tether-mcp

# 2. conecta esta maquina a sua conta do Tether (abre o navegador; voce autoriza logado)
npx -y github:arsprengel/tether-mcp login
```

Pronto. Abra o Claude em qualquer projeto e peca "lista as pendencias do tether".

## Como funciona o escopo de projeto

O tracker na nuvem e um banco unico com varios projetos. O MCP usa **a pasta aberta** como o
projeto (o nome da pasta, ou a env `TETHER_PROJECT`). Assim o Claude escreve no projeto certo e
nao mistura projetos. Para mexer em outro projeto, a IA passa `project` explicito na tool.

## Comandos

```bash
npx github:arsprengel/tether-mcp login     # conecta esta maquina (device flow)
npx github:arsprengel/tether-mcp status    # mostra url, projeto e se ha token
npx github:arsprengel/tether-mcp logout    # apaga o token salvo
```

O token fica em `~/.config/tether/token.json` (chmod 600). Revogue quando quiser pelo painel
"Token da IA" do dashboard.

## Configuracao (env, opcional)

- `TETHER_API_URL` - dashboard do Tether (default `https://tether.intecma.com.br`).
- `TETHER_PROJECT` - forca o nome do projeto (default: o nome da pasta aberta).
- `TETHER_API_TOKEN` / `TETHER_API_AUTH` - token direto (pula o login pelo site; util em CI).

## Tools expostas

`list_items`, `get_item`, `add_item`, `update_item`, `get_next`, `delete_item` - a mesma
interface do Tether, falando com a API REST do dashboard (sem dependencia de banco).
