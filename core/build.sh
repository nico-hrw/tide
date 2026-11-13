#!/usr/bin/env bash
set -euo pipefail

# Help / usage
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "Usage: $0 [OUTPUT_DIR]"
    echo ""
    echo "Builds tide-daemon.exe via Docker cross-compilation and outputs to OUTPUT_DIR."
    echo "Default OUTPUT_DIR: <core_dir>/dist"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${1:-"$SCRIPT_DIR/dist"}"
IMAGE_NAME="tide-core-builder:latest"

# Check Docker prerequisite
if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required but not found in PATH." >&2
    exit 1
fi

# Ensure output directory exists and obtain absolute path
mkdir -p "$OUTPUT_DIR"
ABS_OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"

# Prevent path conversion issues in MSYS / Git Bash environments on Windows
export MSYS_NO_PATHCONV=1

echo "==> Building Docker image ($IMAGE_NAME)..."
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"

echo "==> Exporting tide-daemon.exe to $ABS_OUTPUT_DIR..."
docker run --rm -v "$ABS_OUTPUT_DIR:/output" "$IMAGE_NAME"

TARGET_BIN="$ABS_OUTPUT_DIR/tide-daemon.exe"
if [ -f "$TARGET_BIN" ]; then
    echo "==> Build complete: $TARGET_BIN"
    if command -v ls >/dev/null 2>&1; then
        ls -lh "$TARGET_BIN"
    fi
else
    echo "Error: Output binary not found at $TARGET_BIN" >&2
    exit 1
fi
