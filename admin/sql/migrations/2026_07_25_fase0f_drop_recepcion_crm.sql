-- ============================================================
-- Migración: Fase0-F — Eliminar campos CRM de recepción
-- Fecha: 2026-07-25
-- Versión: v2.0.0-fase0
-- Descripción: Eliminar columnas LEGACY cliente_banco,
--   cliente_cuentabancaria, cliente_facebook, cliente_instagram,
--   cliente_detalles_personales de recepcion_unificada
-- IMPORTANTE: Ejecutar SOLO después de verificar que el código
--             refactorizado está desplegado y funciona correctamente.
-- ============================================================

ALTER TABLE `recepcion_unificada`
  DROP COLUMN IF EXISTS `cliente_banco`,
  DROP COLUMN IF EXISTS `cliente_cuentabancaria`,
  DROP COLUMN IF EXISTS `cliente_facebook`,
  DROP COLUMN IF EXISTS `cliente_instagram`,
  DROP COLUMN IF EXISTS `cliente_detalles_personales`;
