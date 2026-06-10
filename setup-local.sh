#!/bin/bash
set -e

PROJECT_DIR="$(pwd)"
echo "=== Iniciando Setup Local para o FlashCut ==="
echo "Diretório do projeto: $PROJECT_DIR"

# Verificar arquitetura
ARCH=$(uname -m)
echo "Arquitetura detectada: $ARCH"

# Criar diretórios se não existirem
mkdir -p "$PROJECT_DIR/backend/uploads"
mkdir -p "$PROJECT_DIR/backend/outputs"
mkdir -p "$PROJECT_DIR/backend/assets/photos"
mkdir -p "$PROJECT_DIR/backend/assets/videos"

NODE_VERSION="v20.11.0"
NODE_DIR="$PROJECT_DIR/.local_node"

if [ ! -f "$NODE_DIR/bin/node" ]; then
    echo "Node.js local não encontrado. Baixando versão portátil..."
    
    if [ "$ARCH" = "arm64" ]; then
        URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-arm64.tar.gz"
    else
        URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-x64.tar.gz"
    fi
    
    echo "Baixando de: $URL"
    TEMP_TAR="$PROJECT_DIR/node-temp.tar.gz"
    curl -L "$URL" -o "$TEMP_TAR"
    
    echo "Extraindo Node.js..."
    TEMP_EXTRACT="$PROJECT_DIR/node-temp-extract"
    mkdir -p "$TEMP_EXTRACT"
    tar -xzf "$TEMP_TAR" -C "$TEMP_EXTRACT"
    
    # Mover e renomear diretório extraído para .local_node
    EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -maxdepth 1 -type d | grep "node-$NODE_VERSION")
    mv "$EXTRACTED_DIR" "$NODE_DIR"
    
    # Limpar temporários
    rm -rf "$TEMP_TAR" "$TEMP_EXTRACT"
    
    echo "Node.js local instalado com sucesso!"
else
    echo "Node.js local já está instalado."
fi

# Adicionar node ao PATH atual da execução do script
export PATH="$NODE_DIR/bin:$PATH"
echo "Versão do Node.js: $(node -v)"
echo "Versão do NPM: $(npm -v)"

# Configurar Backend
echo "=== Configurando dependências do Backend ==="
cd "$PROJECT_DIR/backend"
if [ ! -f "package.json" ]; then
    echo "Erro: backend/package.json não existe!"
    exit 1
fi
npm install

# Configurar Frontend
echo "=== Configurando dependências do Frontend ==="
cd "$PROJECT_DIR/frontend"
if [ ! -f "package.json" ]; then
    echo "Erro: frontend/package.json não existe!"
    exit 1
fi
npm install

echo "=== Executando Seeding de Fotos e Vídeos ==="
cd "$PROJECT_DIR"
# Rodar seeding
"$NODE_DIR/bin/node" backend/seedAssets.js

echo "=== Setup concluído com sucesso! ==="
