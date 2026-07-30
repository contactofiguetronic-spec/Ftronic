#!/usr/bin/env python3
"""
apply_permissions.py — Script para agregar permisos a módulos del ERP
Ejecutar desde línea de comandos:
    python3 apply_permissions.py <modulo> <categoria> [acciones]

Ejemplo:
    python3 apply_permissions.py portal_control "Comunicación" "ver,config,responder,avances,eliminar"
    python3 apply_permissions.py repuestos "Inventario" "ver,crear,editar,eliminar"
"""

import sys
import os
import pymysql

# Configuración de BD (lee de conexion.php si existe)
DB_CONFIG = {
    'host': '186.40.77.162',
    'user': 'dagober5_admin',
    'password': 'cachaelwillo$1',
    'database': 'dagober5_dashboard',
    'charset': 'utf8mb4'
}

# Permisos por defecto si no se especifican
DEFAULT_PERMISOS = ['ver', 'crear', 'editar', 'eliminar']

# Categorías por nivel de rol
PERMISOS_POR_NIVEL = {
    1: None,  # Admin: todos
    2: lambda acc: acc != 'eliminar',  # Gerente: todos excepto eliminar
    3: lambda acc: acc in ('ver', 'crear', 'editar'),  # Recepcionista
    4: lambda acc: acc in ('ver',),  # Técnico: solo ver
    5: lambda acc: acc in ('ver', 'crear'),  # Vendedor
    6: lambda acc: acc in ('ver',),  # Solo Lectura
}

def apply_permissions(modulo, categoria, acciones):
    """Aplica permisos y roles a un módulo"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # 1. Crear permisos
        print(f"\n{'='*60}")
        print(f"MÓDULO: {modulo}")
        print(f"CATEGORÍA: {categoria}")
        print(f"ACCIONES: {', '.join(acciones)}")
        print(f"{'='*60}\n")
        
        print("1. Creando permisos...")
        for accion in acciones:
            descripcion = f"{accion.capitalize()} {modulo.replace('_', ' ').title()}"
            sql = """
                INSERT IGNORE INTO permisos (modulo, accion, descripcion, categoria)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (modulo, accion, descripcion, categoria))
            if cursor.rowcount > 0:
                print(f"   ✓ Permiso creado: {modulo}:{accion}")
            else:
                print(f"   → Permiso ya existe: {modulo}:{accion}")
        
        # 2. Asignar a roles por nivel
        print("\n2. Asignando a roles...")
        total_asignados = 0
        
        for nivel, filtro in PERMISOS_POR_NIVEL.items():
            if filtro is None:
                # Admin: todos los permisos
                accs_nivel = acciones
            else:
                accs_nivel = [a for a in acciones if filtro(a)]
            
            if not accs_nivel:
                continue
            
            placeholders = ', '.join(['%s'] * len(accs_nivel))
            sql = f"""
                INSERT IGNORE INTO role_permisos (rol_id, permiso_id, activo)
                SELECT r.id, p.id, 1
                FROM roles r, permisos p
                WHERE p.modulo = %s AND p.accion IN ({placeholders}) AND r.nivel = %s
            """
            params = [modulo] + accs_nivel + [nivel]
            cursor.execute(sql, params)
            asignados = cursor.rowcount
            total_asignados += asignados
            
            if asignados > 0:
                print(f"   ✓ Nivel {nivel}: {asignados} permisos asignados")
        
        conn.commit()
        print(f"\n{'='*60}")
        print(f"RESUMEN:")
        print(f"  - Permisos creados: {len(acciones)}")
        print(f"  - Roles asignados: {total_asignados}")
        print(f"{'='*60}\n")
        
        # 3. Verificar resultado
        print("3. Verificación final:")
        cursor.execute("""
            SELECT 
                r.nombre as rol,
                r.nivel,
                COUNT(DISTINCT p.modulo) as modulos,
                COUNT(rp.id) as permisos
            FROM roles r
            LEFT JOIN role_permisos rp ON r.id = rp.rol_id AND rp.activo = 1
            LEFT JOIN permisos p ON rp.permiso_id = p.id
            WHERE p.modulo = %s
            GROUP BY r.id, r.nombre, r.nivel
            ORDER BY r.nivel
        """, (modulo,))
        
        print(f"\n   {'ROL':<20} {'NIVEL':<8} {'PERMISOS':<10}")
        print(f"   {'-'*38}")
        for row in cursor.fetchall():
            print(f"   {row[0]:<20} {row[1]:<8} {row[3]:<10}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        print("\nUso: python3 apply_permissions.py <modulo> <categoria> [acciones]")
        print("Ejemplo: python3 apply_permissions.py portal_control \"Comunicación\" \"ver,config,responder,avances,eliminar\"")
        sys.exit(1)
    
    modulo = sys.argv[1]
    categoria = sys.argv[2]
    acciones = sys.argv[3].split(',') if len(sys.argv) > 3 else DEFAULT_PERMISOS
    
    # Limpiar espacios
    acciones = [a.strip() for a in acciones]
    
    success = apply_permissions(modulo, categoria, acciones)
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()