-- ============================================================================
-- Migración: Desarme — Deshabilitar piezas + expanded groups
-- Fecha: 2026-07-25
-- ============================================================================

SET NAMES utf8mb4;

-- Tabla para piezas deshabilitadas por desarme (el modelo no las presenta)
CREATE TABLE IF NOT EXISTS `desarme_piezas_deshabilitadas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `desarme_id` INT NOT NULL,
  `maestro_pieza_id` INT NOT NULL,
  `motivo` VARCHAR(200) DEFAULT NULL,
  `creado` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_desarme_pieza` (`desarme_id`, `maestro_pieza_id`),
  CONSTRAINT `fk_dpd_desarme` FOREIGN KEY (`desarme_id`) REFERENCES `desarme_vehiculo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dpd_pieza` FOREIGN KEY (`maestro_pieza_id`) REFERENCES `desarme_maestro_piezas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
