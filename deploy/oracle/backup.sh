#!/usr/bin/env bash
set -euo pipefail

APP_DATA_DIR="${APP_DATA_DIR:-/var/lib/chat-app/data}"
APP_UPLOAD_DIR="${APP_UPLOAD_DIR:-/var/lib/chat-app/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/chat-app-backups}"
STAMP="$(date +%F-%H%M%S)"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/chat-app-$STAMP.tar.gz" "$APP_DATA_DIR" "$APP_UPLOAD_DIR"
echo "$BACKUP_DIR/chat-app-$STAMP.tar.gz"
