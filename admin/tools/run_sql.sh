#!/bin/bash
# ==============================================================================
# run_sql.sh — MySQL remoto Figuetronic ERP
# ==============================================================================
# Uso:
#   bash admin/tools/run_sql.sh archivo.sql         # Ejecutar archivo SQL
#   bash admin/tools/run_sql.sh -e "SELECT * FROM…" # Query inline
#   bash admin/tools/run_sql.sh -t                   # Ver tablas
#   bash admin/tools/run_sql.sh -d tabla             # Estructura de tabla
#   bash admin/tools/run_sql.sh -m                   # Ejecutar migraciones
#   bash admin/tools/run_sql.sh -v                   # Verificar esquema
#   bash admin/tools/run_sql.sh                      # Menú interactivo
# ==============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── COLORS ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── CHECK PYMYSQL ─────────────────────────────────────────────────────────────
python3 -c "import pymysql" 2>/dev/null || {
    echo -e "${YELLOW}Instalando pymysql...${NC}"
    python3 -m pip install --break-system-packages pymysql 2>/dev/null || {
        echo -e "${RED}Error: instalar pymysql manualmente${NC}"; exit 1; }
}

PY="$SCRIPT_DIR/run_sql.py"

# ── DISPATCH ──────────────────────────────────────────────────────────────────
case "${1:-}" in
    -e|--exec)
        [ -z "${2:-}" ] && { echo "Uso: $0 -e \"SELECT ...\""; exit 1; }
        python3 "$PY" exec "$2"
        ;;
    -t|--tables)
        python3 "$PY" tables
        ;;
    -d|--describe)
        [ -z "${2:-}" ] && { echo "Uso: $0 -d nombre_tabla"; exit 1; }
        python3 "$PY" describe "$2"
        ;;
    -m|--migrate)
        python3 "$PY" migrate
        ;;
    -s|--seed)
        python3 "$PY" seed
        ;;
    -v|--verify)
        python3 "$PY" verify
        ;;
    -D|--dump)
        python3 "$PY" dump
        ;;
    -c|--connect)
        python3 "$PY" test
        ;;
    "")
        python3 "$PY"
        ;;
    *)
        if [ -f "$1" ]; then
            python3 "$PY" file "$1"
        else
            echo -e "${RED}Archivo no encontrado: $1${NC}"
            exit 1
        fi
        ;;
esac
