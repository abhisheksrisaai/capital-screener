#!/usr/bin/env bash
set -e

PORT="${PORT:-8000}"
APP_HOST="${APP_HOST:-0.0.0.0}"

echo "Capital Screener API — starting on ${APP_HOST}:${PORT}"

if [ "${QDRANT_MODE}" = "remote" ]; then
    for i in $(seq 1 30); do
        if curl -s -o /dev/null "http://${QDRANT_HOST}:${QDRANT_PORT}/collections" 2>/dev/null; then
            echo "Qdrant ready"
            break
        fi
        sleep 2
    done
fi

exec uvicorn main:app \
    --host "${APP_HOST}" \
    --port "${PORT}" \
    --log-level "${LOG_LEVEL:-info}" \
    --forwarded-allow-ips "*" \
    --proxy-headers
