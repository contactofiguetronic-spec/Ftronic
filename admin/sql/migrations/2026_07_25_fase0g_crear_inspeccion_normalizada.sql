-- ============================================================
-- Migración: Fase0-G — Normalizar checklist de inspección
-- Fecha: 2026-07-25
-- Versión: v2.0.0-fase0
-- Descripción: Crear tabla normalizada recepcion_inspeccion_items.
--   Paso 1: solo crear la tabla. Las columnas insp_* en
--   recepcion_unificada se mantienen (LEGACY) para compatibilidad.
--   Nuevos registros escriben dual (legacy + nueva tabla).
--   Paso 2 (futuro): migrar datos existentes y DROP columns.
-- ============================================================

CREATE TABLE IF NOT EXISTS `recepcion_inspeccion_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recepcion_id` int NOT NULL,
  `campo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `seccion` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orden` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_recepcion_campo` (`recepcion_id`, `campo`),
  KEY `idx_recepcion` (`recepcion_id`),
  KEY `idx_seccion` (`seccion`),
  CONSTRAINT `fk_inspeccion_recepcion` FOREIGN KEY (`recepcion_id`) REFERENCES `recepcion_unificada` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
