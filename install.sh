#!/usr/bin/env sh
# Instala/atualiza o MCP do tether nesta maquina: deps + registro no Claude Code + login.
# Uso: clone este repo e rode ./install.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> instalando dependencias"
( cd "$DIR" && npm install --omit=dev --silent )

echo "==> registrando o MCP no Claude Code (escopo user, vale em todos os seus projetos)"
if command -v claude >/dev/null 2>&1; then
  claude mcp add tether -s user -- node "$DIR/bin.js" 2>/dev/null \
    || echo "(ja estava registrado - ok)"
else
  echo "(claude nao encontrado no PATH - registre manualmente:)"
  echo "    claude mcp add tether -s user -- node \"$DIR/bin.js\""
fi

echo "==> conectando esta maquina ao Tether (abre o navegador; autorize logado)"
node "$DIR/bin.js" login

echo ""
echo "Pronto. Abra o Claude em qualquer projeto e peca: \"lista as pendencias do tether\"."
