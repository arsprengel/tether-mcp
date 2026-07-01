#!/usr/bin/env sh
# Instala/atualiza o MCP do tether nesta maquina: deps + registro no Claude Code + login.
# Uso: TETHER_API_URL=https://SEU-TETHER ./install.sh   (o admin te passa a URL)
#  ou: ./install.sh https://SEU-TETHER
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${TETHER_API_URL:-$1}"
if [ -z "$URL" ]; then
  echo "Falta o endereco do Tether. Rode assim (o admin te passa a URL):"
  echo "    TETHER_API_URL=https://SEU-TETHER $0"
  exit 1
fi

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
TETHER_API_URL="$URL" node "$DIR/bin.js" login

echo ""
echo "Pronto. Abra o Claude em qualquer projeto e peca: \"lista as pendencias do tether\"."
