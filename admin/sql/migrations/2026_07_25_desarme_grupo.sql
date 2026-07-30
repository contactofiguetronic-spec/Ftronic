-- ============================================================================
-- Migración: Desarme — Grupo de Piezas + Multimedia
-- Fecha: 2026-07-25
-- Descripción: Tabla puente desarme_items_grupo, columnas es_grupo/nombre_grupo,
--              migración de legacy, y soporte para galería por pieza vía multimedia
-- ============================================================================

SET NAMES utf8mb4;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Nueva columna: es_grupo + nombre_grupo en desarme_items
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE `desarme_items`
  ADD COLUMN `es_grupo` TINYINT(1) NOT NULL DEFAULT 0 AFTER `fase`,
  ADD COLUMN `nombre_grupo` VARCHAR(200) NULL AFTER `es_grupo`;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Tabla puente: desarme_items_grupo (padre ↔ hijos)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `desarme_items_grupo` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_padre` INT NOT NULL,
  `id_hijo` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_padre_hijo` (`id_padre`, `id_hijo`),
  CONSTRAINT `fk_dig_padre` FOREIGN KEY (`id_padre`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dig_hijo` FOREIGN KEY (`id_hijo`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Migrar legacy: piezas con notas_tecnico = 'Grupo compuesto por: ...'
--    Marca como es_grupo=1, extrae nombre del grupo, limpia notas.
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE `desarme_items`
SET `es_grupo` = 1,
    `nombre_grupo` = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`notas_tecnico`, ' [Códigos:', 1), 'Grupo compuesto por: ', -1)),
    `notas_tecnico` = NULL
WHERE `notas_tecnico` LIKE 'Grupo compuesto por:%';
