# tether-mcp

MCP do **Tether** - conecta o Claude Code (a IA) ao tracker de roadmap da sua equipe.

Este pacote e so o **cliente**: ele fala com o seu servidor do Tether. Qualquer um pode instalar,
mas para usar precisa de uma **conta** no seu Tether (criada pelo admin) - a trava de acesso e o
login do servidor, nao este codigo. O login e pelo site (device flow, estilo `gh auth login`):
voce nao copia token a mao. Cada pessoa conecta a propria maquina e o Claude passa a escrever
**como ela**, so nos projetos que ela pode ver, e no projeto da **pasta aberta** (nao mistura).

Leve: so `@modelcontextprotocol/sdk` + `zod` + `fetch` nativo (fala com a API REST; sem banco).

## Instalar (cada dev, uma vez)

O admin te passa **o endereco do Tether** (a URL) e cria sua conta. Depois:

```bash
# 1. registra o MCP no Claude Code (escopo user = vale em todos os seus projetos)
claude mcp add tether -s user -- npx -y github:arsprengel/tether-mcp

# 2. conecta esta maquina a sua conta (troque pela URL que o admin te passou)
TETHER_API_URL=https://SEU-TETHER npx -y github:arsprengel/tether-mcp login
```

O login abre o navegador numa pagina `/conectar`; voce confirma (ja logado) e o terminal recebe
o token sozinho. A URL fica salva, entao o Claude ja sobe conectado nas proximas vezes.

Pronto. Abra o Claude em qualquer projeto e peca "lista as pendencias do tether".

## Comandos

```bash
TETHER_API_URL=https://SEU-TETHER npx -y github:arsprengel/tether-mcp login   # conecta esta maquina
npx -y github:arsprengel/tether-mcp status                                    # url, projeto, token
npx -y github:arsprengel/tether-mcp logout                                    # apaga o token salvo
```

O token fica em `~/.config/tether/token.json` (chmod 600). Revogue quando quiser pelo painel
"Token da IA" do dashboard.

## Como funciona o escopo de projeto

O tracker e um banco unico com varios projetos. O MCP usa **a pasta aberta** como projeto (o nome
da pasta, ou a env `TETHER_PROJECT`). Assim o Claude escreve no projeto certo e nao mistura. Para
mexer em outro projeto, a IA passa `project` explicito na tool.

## Configuracao (env)

- `TETHER_API_URL` - endereco do seu Tether. Obrigatorio no 1o login; depois fica salvo.
- `TETHER_PROJECT` - forca o nome do projeto (default: o nome da pasta aberta).
- `TETHER_API_TOKEN` - token direto (pula o login pelo site; util em CI).

## Tools expostas

Itens: `list_items`, `get_item`, `add_item`, `update_item`, `move_item`, `get_next`, `delete_item`.

MRP (Memoria Referencial de Projeto, v1.1.0+): `list_memory`, `add_memory`, `update_memory` -
o conhecimento duravel do projeto (comandos, deploy, gotchas, decisoes, contexto), compartilhado
entre todos os participantes. A IA consulta ao comecar a trabalhar e registra o que descobre;
no dashboard e a aba "Referencia".

## Atualizar (pegar tools novas)

A partir da **v1.2.0** o cliente instalado por clone se atualiza SOZINHO: ao subir, dispara um
`git pull` silencioso em background (no maximo a cada 6h) - a sessao atual segue como esta e a
PROXIMA ja sobe na versao nova. Sem rede ou com conflito local, nada acontece (fail-silent).

Se a sua instalacao e anterior a v1.2.0, atualize UMA ultima vez na mao: entre na pasta do
clone, `git pull` e reinicie as sessoes do Claude. Se instalou via `npx github:...`: limpe o
cache do npx (`rm -rf ~/.npm/_npx`) e reinicie (via npx nao ha auto-update; prefira o clone).
