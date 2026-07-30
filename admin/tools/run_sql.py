#!/usr/bin/env python3
"""
run_sql.py — MySQL remoto para Figuetronic ERP
Conexión directa al hosting (figuetronic.cl:3306 / dagober5_dashboard)
"""

import sys
import os
import json
from pathlib import Path

# ── CREDENCIALES ──────────────────────────────────────────────────────────────
DB_HOST = os.environ.get("FTRONIC_DB_HOST", "figuetronic.cl")
DB_PORT = int(os.environ.get("FTRONIC_DB_PORT", "3306"))
DB_NAME = os.environ.get("FTRONIC_DB_NAME", "dagober5_dashboard")
DB_USER = os.environ.get("FTRONIC_DB_USER", "dagober5_admin")
DB_PASS = os.environ.get("FTRONIC_DB_PASS", "cachaelwillo$1")

# ── PYMYSQL CHECK ─────────────────────────────────────────────────────────────
try:
    import pymysql
    import pymysql.cursors
except ImportError:
    print("Instalando pymysql...")
    os.system(f"{sys.executable} -m pip install --break-system-packages pymysql 2>/dev/null || {sys.executable} -m pip install pymysql")
    import pymysql
    import pymysql.cursors

# ── COLORS ────────────────────────────────────────────────────────────────────
R = "\033[0;31m"; G = "\033[0;32m"; Y = "\033[1;33m"
C = "\033[0;36m"; B = "\033[1m"; N = "\033[0m"

# ── CONEXIÓN ──────────────────────────────────────────────────────────────────
def get_conn(autocommit=True):
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
        database=DB_NAME, charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=autocommit,
        connect_timeout=10,
    )

# ── COMANDOS ──────────────────────────────────────────────────────────────────
def cmd_test():
    """Probar conexión"""
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT VERSION() as ver, DATABASE() as db, USER() as user, NOW() as now")
            r = cur.fetchone()
        conn.close()
        print(f"{G}✓ Conexión OK{N}")
        print(f"  MySQL:   {r['ver']}")
        print(f"  BD:      {r['db']}")
        print(f"  Usuario: {r['user']}")
        print(f"  Hora:    {r['now']}")
        return True
    except Exception as e:
        print(f"{R}✗ Error: {e}{N}")
        return False

def cmd_tables():
    """Listar tablas"""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES")
        rows = cur.fetchall()
    conn.close()
    key = list(rows[0].keys())[0] if rows else None
    tables = [r[key] for r in rows] if key else []
    print(f"{B}Tablas ({len(tables)}):{N}")
    for t in sorted(tables):
        print(f"  {t}")
    return tables

def cmd_describe(table):
    """Estructura de tabla"""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(f"DESCRIBE `{table}`")
        rows = cur.fetchall()
        cur.execute(f"SELECT COUNT(*) as cnt FROM `{table}`")
        cnt = cur.fetchone()['cnt']
    conn.close()
    print(f"{B}{table} ({cnt} filas):{N}")
    print(f"  {'Columna':<30} {'Tipo':<40} {'Null':<6} {'Key':<5} {'Default'}")
    print(f"  {'─'*30} {'─'*40} {'─'*6} {'─'*5} {'─'*20}")
    for r in rows:
        print(f"  {r['Field']:<30} {r['Type']:<40} {r['Null']:<5} {r['Key']:<4} {r.get('Default','')}")
    return rows

def cmd_exec(query):
    """Ejecutar query inline"""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query)
        if cur.description:
            rows = cur.fetchall()
            if rows:
                cols = list(rows[0].keys())
                widths = [max(len(str(c)), max(len(str(r.get(c,''))) for r in rows)) for c in cols]
                header = " | ".join(f"{c:<{w}}" for c, w in zip(cols, widths))
                print(f"{B}{header}{N}")
                print(" | ".join("─" * w for w in widths))
                for r in rows:
                    print(" | ".join(f"{str(r.get(c,'')):<{w}}" for c, w in zip(cols, widths)))
                print(f"\n{len(rows)} filas")
            else:
                print(f"{G}OK{N} ({cur.rowcount} affected)")
        else:
            print(f"{G}OK{N} ({cur.rowcount} affected)")
    conn.close()

def cmd_file(filepath):
    """Ejecutar archivo SQL"""
    sql_file = Path(filepath)
    if not sql_file.exists():
        print(f"{R}Archivo no encontrado: {filepath}{N}")
        return

    sql = sql_file.read_text(encoding="utf-8")
    # Remove comments and split
    lines = [l for l in sql.split("\n") if l.strip() and not l.strip().startswith("--")]
    clean = "\n".join(lines)
    statements = [s.strip() for s in clean.split(";") if s.strip()]

    print(f"{B}Ejecutando {len(statements)} statements de {sql_file.name}{N}")

    conn = get_conn(autocommit=False)
    ok = err = skipped = 0
    try:
        with conn.cursor() as cur:
            for i, stmt in enumerate(statements, 1):
                try:
                    cur.execute(stmt)
                    ok += 1
                    affected = cur.rowcount if cur.rowcount >= 0 else 0
                    print(f"  {G}✓{N} [{i}/{len(statements)}] ({affected} affected)")
                except pymysql.err.OperationalError as e:
                    if "1060" in str(e) or "Duplicate" in str(e) or "already exists" in str(e).lower():
                        skipped += 1
                        print(f"  {Y}~{N} [{i}/{len(statements)}] ya existe (skip)")
                    else:
                        err += 1
                        print(f"  {R}✗{N} [{i}/{len(statements)}] {e}")
                except Exception as e:
                    err += 1
                    print(f"  {R}✗{N} [{i}/{len(statements)}] {e}")
        conn.commit()
    finally:
        conn.close()
    print(f"\n{B}Resultado: {G}{ok} ok{N}, {Y}{skipped} skip{N}, {R}{err} error{N}")

def cmd_migrate():
    """Ejecuta migraciones pendientes del directorio sql/migrations/"""
    migrations_dir = Path(__file__).parent.parent / "sql" / "migrations"
    if not migrations_dir.exists():
        print(f"{R}Directorio no encontrado: {migrations_dir}{N}")
        return

    # Check which migrations already ran
    conn = get_conn()
    with conn.cursor() as cur:
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS _migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("SELECT filename FROM _migrations")
            executed = {r['filename'] for r in cur.fetchall()}
        except:
            executed = set()

    sql_files = sorted(migrations_dir.glob("*.sql"))
    pending = [f for f in sql_files if f.name not in executed]

    if not pending:
        print(f"{G}✓ Todas las migraciones ejecutadas{N}")
        return

    print(f"{B}Migraciones pendientes: {len(pending)}{N}")
    for f in pending:
        print(f"  → {f.name}")

    conn = get_conn(autocommit=False)
    try:
        with conn.cursor() as cur:
            for f in pending:
                sql = f.read_text(encoding="utf-8")
                lines = [l for l in sql.split("\n") if l.strip() and not l.strip().startswith("--")]
                clean = "\n".join(lines)
                stmts = [s.strip() for s in clean.split(";") if s.strip()]
                ok = 0
                for stmt in stmts:
                    try:
                        cur.execute(stmt)
                        ok += 1
                    except pymysql.err.OperationalError as e:
                        if "1060" in str(e) or "Duplicate" in str(e) or "already exists" in str(e).lower():
                            ok += 1
                        else:
                            raise
                cur.execute("INSERT INTO _migrations (filename) VALUES (%s)", (f.name,))
                print(f"  {G}✓{N} {f.name} ({ok} statements)")
        conn.commit()
        print(f"\n{G}Migraciones completadas{N}")
    except Exception as e:
        conn.rollback()
        print(f"\n{R}Error: {e}{N}")
    finally:
        conn.close()

def cmd_seed():
    """Cargar datos de seed desde sql/seeds/"""
    seeds_dir = Path(__file__).parent.parent / "sql" / "seeds"
    if not seeds_dir.exists():
        print(f"{Y}Directorio no encontrado: {seeds_dir}{N}")
        return
    sql_files = sorted(seeds_dir.glob("*.sql"))
    if not sql_files:
        print(f"{Y}No hay archivos de seed{N}")
        return
    for f in sql_files:
        print(f"{C}→ {f.name}{N}")
        cmd_file(str(f))

def cmd_dump():
    """Exportar esquema (sin datos)"""
    import subprocess
    output = Path(__file__).parent.parent / "sql" / "schema_dump.sql"
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "mysqldump", f"--host={DB_HOST}", f"--port={DB_PORT}",
        f"--user={DB_USER}", f"--password={DB_PASS}",
        "--no-data", "--routines", "--triggers", "--single-transaction",
        "--skip-lock-tables", DB_NAME
    ]
    try:
        with open(output, "w") as f:
            subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, check=True)
        print(f"{G}✓ Dump guardado en {output}{N}")
    except Exception as e:
        print(f"{R}Error: {e}{N}")

def cmd_verify():
    """Verificar integridad del esquema vs schema_master.sql"""
    schema_file = Path(__file__).parent.parent / "sql" / "schema_master.sql"
    if not schema_file.exists():
        print(f"{R}schema_master.sql no encontrado{N}")
        return

    # Get tables from DB
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES")
        db_tables = {list(r.values())[0] for r in cur.fetchall()}

    # Get tables from schema file
    import re
    sql = schema_file.read_text(encoding="utf-8")
    schema_tables = set(re.findall(r'CREATE TABLE.*?`(\w+)`', sql))

    missing = schema_tables - db_tables
    extra = db_tables - schema_tables
    ok = schema_tables & db_tables

    print(f"{B}Verificación de esquema:{N}")
    print(f"  {G}✓{N} Tablas OK: {len(ok)}")
    if missing:
        print(f"  {R}✗{N} Faltantes en BD: {', '.join(sorted(missing))}")
    if extra:
        print(f"  {Y}~{N} Existentes solo en BD: {', '.join(sorted(extra))}")
    if not missing and not extra:
        print(f"  {G}Esquema consistente{N}")
    conn.close()

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(f"{B}╔══════════════════════════════════════════════════╗{N}")
        print(f"{B}║  MySQL Remote — Figuetronic ERP                 ║{N}")
        print(f"{B}║  {DB_HOST}:{DB_PORT} / {DB_NAME:<23} ║{N}")
        print(f"{B}╠══════════════════════════════════════════════════╣{N}")
        print(f"{B}║  1) Probar conexión                            ║{N}")
        print(f"{B}║  2) Ejecutar archivo .sql                      ║{N}")
        print(f"{B}║  3) Ejecutar query inline                      ║{N}")
        print(f"{B}║  4) Ver tablas                                 ║{N}")
        print(f"{B}║  5) Ver estructura de tabla                    ║{N}")
        print(f"{B}║  6) Ejecutar migraciones pendientes            ║{N}")
        print(f"{B}║  7) Cargar seeds                               ║{N}")
        print(f"{B}║  8) Verificar esquema vs schema_master         ║{N}")
        print(f"{B}║  9) Exportar dump (schema)                     ║{N}")
        print(f"{B}║  0) Salir                                      ║{N}")
        print(f"{B}╚══════════════════════════════════════════════════╝{N}")
        print()
        while True:
            try:
                opt = input(f"{C}Opción: {N}").strip()
            except (EOFError, KeyboardInterrupt):
                print(f"\n{G}Hasta luego.{N}")
                break
            if opt == "1": cmd_test()
            elif opt == "2":
                f = input(f"{C}Archivo .sql: {N}").strip()
                cmd_file(f)
            elif opt == "3":
                q = input(f"{C}Query: {N}").strip()
                if q: cmd_exec(q)
            elif opt == "4": cmd_tables()
            elif opt == "5":
                t = input(f"{C}Tabla: {N}").strip()
                if t: cmd_describe(t)
            elif opt == "6": cmd_migrate()
            elif opt == "7": cmd_seed()
            elif opt == "8": cmd_verify()
            elif opt == "9": cmd_dump()
            elif opt == "0":
                print(f"{G}Hasta luego.{N}")
                break
            else:
                print(f"{R}Opción inválida{N}")
            print()
        return

    cmd = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None

    if cmd == "test": cmd_test()
    elif cmd == "tables": cmd_tables()
    elif cmd == "describe" and arg: cmd_describe(arg)
    elif cmd == "exec" and arg: cmd_exec(arg)
    elif cmd == "file" and arg: cmd_file(arg)
    elif cmd == "migrate": cmd_migrate()
    elif cmd == "seed": cmd_seed()
    elif cmd == "verify": cmd_verify()
    elif cmd == "dump": cmd_dump()
    else:
        # Treat as file path
        if os.path.isfile(cmd):
            cmd_file(cmd)
        else:
            print(f"{R}Comando no reconocido: {cmd}{N}")
            print("Uso: python3 run_sql.py [test|tables|describe|exec|file|migrate|seed|verify|dump]")

if __name__ == "__main__":
    main()
