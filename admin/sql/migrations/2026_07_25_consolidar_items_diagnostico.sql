-- ============================================================
-- Migración: Consolidación Items Diagnóstico → OT Items
-- Fecha: 2026-07-25
-- Versión: v2.0.0-iter7
-- Descripción: Fix datos huérfanos tipo='repuesto' en orden_trabajo_items
-- ============================================================

-- 1. Fix: Migrar items con tipo='repuesto' → tipo='articulo'
--    (ENUM solo permite servicio/articulo/insumo)
UPDATE orden_trabajo_items
SET tipo = 'articulo'
WHERE tipo = 'repuesto';

-- 2. Verificar resultado
SELECT id, nombre, tipo, seccion
FROM orden_trabajo_items
WHERE tipo = 'repuesto';
-- Debe retornar 0 filas
