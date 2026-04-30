#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install modal

echo
echo "Modal client installed in $SCRIPT_DIR/.venv"
echo "Next steps:"
echo "  1) source .venv/bin/activate"
echo "  2) python3 -m modal setup   # or: modal token new"
echo "  3) modal run get_started.py"
echo "  4) modal deploy modal_app.py"
