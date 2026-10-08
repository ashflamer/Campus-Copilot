#!/usr/bin/env sh
# Start all 3 servers (Mac/Linux). Ctrl+C stops everything.
cd "$(dirname "$0")"
export GEMMA_PROVIDER="${GEMMA_PROVIDER:-ollama}"
export GEMMA_MODEL="${GEMMA_MODEL:-gemma4:e4b}"
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
(cd backend/navigator-api && $PY run.py) &
(cd backend/assignments-api && $PY run.py) &
(cd frontend/workspace-ui && $PY serve.py) &
sleep 2
echo ""
echo "  Workspace  ->  http://localhost:5173"
echo "  Navigator  ->  http://localhost:8765"
echo "  Gemma      ->  $GEMMA_PROVIDER / $GEMMA_MODEL"
trap 'kill 0' INT TERM
wait
