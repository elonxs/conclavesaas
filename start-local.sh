#!/bin/bash

PROJECT_DIR="$(pwd)"
NODE_DIR="$PROJECT_DIR/.local_node"

if [ ! -f "$NODE_DIR/bin/node" ]; then
    echo "Erro: Node.js local não encontrado. Por favor, execute './setup-local.sh' primeiro!"
    exit 1
fi

export PATH="$NODE_DIR/bin:$PATH"

echo "=== Iniciando FlashCut (Micro SaaS) ==="
echo "Node.js local: $(which node)"

# Matar processos filhos se o script for interrompido
cleanup() {
    echo ""
    echo "=== Encerrando servidores... ==="
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Iniciar Backend
echo "Iniciando Backend na porta 5000..."
cd "$PROJECT_DIR/backend"
node server.js &
BACKEND_PID=$!

# Iniciar Frontend
echo "Iniciando Frontend na porta 5173..."
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Esperar os processos
wait $BACKEND_PID $FRONTEND_PID
