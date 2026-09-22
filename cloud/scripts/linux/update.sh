#!/bin/bash
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

echo "🔄 Pulling latest changes..."
cd "$ROOT_DIR"
git pull origin main

echo "🏗️ Building Go backend..."
cd "$ROOT_DIR/cloud"
go build -o tide-server ./cmd/server/main.go

echo "📦 Installing and building web frontend..."
cd "$ROOT_DIR/web"
npm install
npm run build

echo "✅ Tide updated and built successfully!"
