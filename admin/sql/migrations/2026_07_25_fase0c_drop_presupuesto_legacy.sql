-- ============================================================
-- Migración: Fase0-C — Eliminar columnas muertas de presupuesto
-- Fecha: 2026-07-25
-- Versión: v2.0.0-fase0
-- Descripción: Eliminar columnas LEGACY detalle_*/servicios_json/articulos_json
-- IMPORTANTE: Ejecutar SOLO después de verificar que el código
--             refactorizado está desplegado y funciona correctamente.
-- ============================================================

ALTER TABLE `presupuesto`
  DROP COLUMN IF EXISTS `detalle_trabajos`,
  DROP COLUMN IF EXISTS `detalle_articulos`,
  DROP COLUMN IF EXISTS `detalle_servicios`,
  DROP COLUMN IF EXISTS `servicios_json`,
  DROP COLUMN IF EXISTS `articulos_json`;
