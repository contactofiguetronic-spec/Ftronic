-- ============================================================================
-- Migración: Desarme Module Fixes
-- Fecha: 2026-07-25
-- Descripción: Corrección de bugs críticos + nueva tabla de valorización
-- ============================================================================

SET NAMES utf8mb4;

-- Bug 1: Extender ENUM motivo_desarme para aceptar valores del frontend
ALTER TABLE `desarme_vehiculo`
  MODIFY COLUMN `motivo_desarme` ENUM('siniestrado','baja','multa','donacion','otro','dano_total','robo','abandono','junk') NOT NULL DEFAULT 'otro';

-- Bug 5: Agregar columna precio_venta a desarme_items (faltaba en schema)
ALTER TABLE `desarme_items`
  ADD COLUMN IF NOT EXISTS `precio_venta` DECIMAL(12,2) DEFAULT NULL AFTER `articulo_id`;

-- Fix: Extender enum estado_publicacion para aceptar 'publicada'
ALTER TABLE `desarme_items`
  MODIFY COLUMN `estado_publicacion` ENUM('no_publicado','publicado','publicada','vendido') DEFAULT 'no_publicado';

-- Nueva tabla: Configuración de valorización automática
CREATE TABLE IF NOT EXISTS `desarme_valorizacion_config` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `categoria` VARCHAR(50) NOT NULL,
  `precio_base` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `factor_bueno` DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  `factor_para_reparacion` DECIMAL(3,2) NOT NULL DEFAULT 0.60,
  `factor_malo` DECIMAL(3,2) NOT NULL DEFAULT 0.30,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `creado` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categoria` (`categoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos iniciales de ejemplo (precios base configurables por admin)
INSERT IGNORE INTO `desarme_valorizacion_config` (`categoria`, `precio_base`, `factor_bueno`, `factor_para_reparacion`, `factor_malo`) VALUES
('Motor', 150000.00, 1.00, 0.60, 0.30),
('Frenos', 80000.00, 1.00, 0.55, 0.25),
('Transmisión', 120000.00, 1.00, 0.50, 0.20),
('Suspensión', 60000.00, 1.00, 0.60, 0.30),
('Carrocería', 200000.00, 1.00, 0.70, 0.40),
('Eléctrico', 45000.00, 1.00, 0.50, 0.20),
('Interior', 35000.00, 1.00, 0.65, 0.35),
('Exterior', 55000.00, 1.00, 0.60, 0.30),
('Otros', 25000.00, 1.00, 0.50, 0.25);
