-- ============================================================
-- Migración: Fase0-P — Eliminar columna saldo denormalizada
-- Fecha: 2026-07-25
-- Versión: v2.0.0-fase0
-- Descripción: Eliminar columna saldo de cuentas_bancarias.
--   El saldo ahora se calcula desde movimientos_caja via
--   getSaldoCuenta().
-- IMPORTANTE: Ejecutar SOLO después de verificar que todos los
--   callers usan getSaldoCuenta() en lugar de leer saldo directo.
-- ============================================================

ALTER TABLE `cuentas_bancarias`
  DROP COLUMN IF EXISTS `saldo`;
