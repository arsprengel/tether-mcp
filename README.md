# tether-mcp

MCP do **Tether** - conecta o Claude Code (a IA) ao tracker de roadmap da sua equipe na nuvem.

O login e pelo site (device flow, estilo `gh auth login`): voce nao copia token a mao. Cada
pessoa conecta a propria maquina e o Claude passa a escrever no tracker **como ela**, enxergando
so os projetos que ela pode ver. E escreve no projeto da **pasta aberta**, sem misturar projetos.

Leve: so `@modelcontextprotocol/sdk` + `zod` + `fetch` nativo (fala com a API REST do dashboard;
sem dependencia de banco).

## Pre-requisitos

- Node 18+ e Claude Code.
- Acesso a este repositorio (o admin te adiciona) e `gh auth login` feito (ou git com credencial do GitHub).
- Uma conta no Tether (o admin cria; voce loga no dashboard com email e senha).

## Instalar (cada dev, uma vez)

```bash
git clone https://github.com/arsprengel/tether-mcp ~/.tether-mcp
~/.tether-mcp/install.sh
```

O `install.sh` instala as dependencias, registra o MCP no Claude Code (escopo user) e ja abre o
login. Se preferir manual:

```bash
git clone https://github.com/arsprengel/tether-mcp ~/.tether-mcp
cd ~/.tether-mcp && npm install --omit=dev
claude mcp add tether -s user -- node ~/.tether-mcp/bin.js
node ~/.tether-mcp/bin.js login
```

Pronto. Abra o Claude em qualquer projeto e peca "lista as pendencias do tether".

> Alternativa em 1 comando via `npx github:...` funciona quando o repo esta acessivel sem
> autenticacao git (repo publico ou org com SSO). Em repo privado sem chave SSH o `npx` pode
> falhar ao clonar; nesse caso use o `git clone` acima (robusto).

## Como funciona o escopo de projeto

O tracker na nuvem e um banco unico com varios projetos. O MCP usa **a pasta aberta** como
projeto (o nome da pasta, ou a env `TETHER_PROJECT`). Assim o Claude escreve no projeto certo e
nao mistura projetos. Para mexer em outro projeto, a IA passa `project` explicito na tool.

## Comandos

```bash
node ~/.tether-mcp/bin.js login     # conecta esta maquina (device flow pelo site)
node ~/.tether-mcp/bin.js status    # mostra url, projeto e se ha token
node ~/.tether-mcp/bin.js logout    # apaga o token salvo
```

O token fica em `~/.config/tether/token.json` (chmod 600). Revogue quando quiser pelo painel
"Token da IA" do dashboard.

## Configuracao (env, opcional)

- `TETHER_API_URL` - dashboard do Tether (default `https://tether.intecma.com.br`).
- `TETHER_PROJECT` - forca o nome do projeto (default: o nome da pasta aberta).
- `TETHER_API_TOKEN` / `TETHER_API_AUTH` - token direto (pula o login pelo site; util em CI).

## Tools expostas

`list_items`, `get_item`, `add_item`, `update_item`, `get_next`, `delete_item` - a mesma
interface do Tether.
