#!/bin/bash

set -e

AQUA='\033[1;36m'
NC='\033[0m'
PREFIX="${AQUA}[orca-slicer-api]${NC}"

REPO_URL="https://github.com/AFKFelix/orca-slicer-api.git"
REPO_DIR="orca-slicer-api"

if ! command -v git &>/dev/null; then
    echo -e "$PREFIX git not found. Please install git."
    exit 1
fi

if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
    echo -e "$PREFIX Node.js v22 not found. Please install Node.js v22."
    exit 1
fi

if ! command -v pm2 &>/dev/null; then
    echo -e "$PREFIX PM2 not found. Installing globally..."
    npm install -g pm2
fi

echo -e "$PREFIX Cloning repository from $REPO_URL..."
git clone "$REPO_URL"

cd "$REPO_DIR"
git checkout main

echo -e "$PREFIX Installing dependencies..."
npm install

echo -e "$PREFIX Building the project..."
npm run build

read -p "$(echo -e "$PREFIX Enter PORT [3000]: ")" PORT
PORT=${PORT:-3000}

if [[ "$OSTYPE" == "darwin"* ]]; then
    DEFAULT_PATH="/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer"
    read -p "$(echo -e "$PREFIX Enter ORCASLICER_PATH [$DEFAULT_PATH]: ")" ORCASLICER_PATH
    ORCASLICER_PATH=${ORCASLICER_PATH:-$DEFAULT_PATH}
else
    while [[ -z "$ORCASLICER_PATH" ]]; do
        read -p "$(echo -e "$PREFIX Enter ORCASLICER_PATH (required): ")" ORCASLICER_PATH
        if [[ -z "$ORCASLICER_PATH" ]]; then
            echo -e "$PREFIX ORCASLICER_PATH is required on Linux."
        fi
    done
fi

read -p "$(echo -e "$PREFIX Enter DATA_PATH [$(pwd)/data]: ")" DATA_PATH
DATA_PATH=${DATA_PATH:-$(pwd)/data}

cat > .env <<EOF
PORT=$PORT
ORCASLICER_PATH=$ORCASLICER_PATH
DATA_PATH=$DATA_PATH
EOF

echo -e "$PREFIX Configuration saved to .env"

echo -e "$PREFIX Starting orca-slicer-api with PM2..."
pm2 start ecosystem.config.cjs

read -p "$(echo -e "$PREFIX Do you want to auto-start and persist orca-slicer-api? (y/n) [n]: ")" AUTO_START
AUTO_START=${AUTO_START:-n}

if [[ "$AUTO_START" =~ ^[Yy]$ ]]; then
    echo -e "$PREFIX Saving PM2 process list..."
    pm2 save

    echo -e "$PREFIX Setting up PM2 to launch on system startup..."
    sudo pm2 startup

    echo -e "$PREFIX PM2 is now set to auto-start orca-slicer-api on boot."
fi

echo -e "$PREFIX Setup complete!"