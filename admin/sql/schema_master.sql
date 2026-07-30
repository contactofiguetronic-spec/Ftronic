-- =============================================================
-- dagober5_dashboard - Schema Master File
-- Idempotent schema-only (no data) generated from dump
-- =============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================
-- Database
-- =============================================================
CREATE DATABASE IF NOT EXISTS `dagober5_dashboard` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `dagober5_dashboard`;

-- =============================================================
-- Tables
-- =============================================================

-- Table: agenda_bloques
CREATE TABLE IF NOT EXISTS `agenda_bloques` (
  `id` int NOT NULL,
  `dia_semana` tinyint NOT NULL COMMENT '0=domingo,1=lunes,...,6=sabado',
  `hora_apertura` time NOT NULL,
  `hora_cierre` time NOT NULL,
  `intervalo_minutos` int NOT NULL DEFAULT '30' COMMENT 'Duración de cada slot en minutos',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: agenda_slots
CREATE TABLE IF NOT EXISTS `agenda_slots` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `estado` enum('disponible','reservado','confirmado','cancelado','completado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disponible',
  `visita_id` int DEFAULT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: apoyo_tecnico
CREATE TABLE IF NOT EXISTS `apoyo_tecnico` (
  `id` int NOT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehiculo_marca` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_modelo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `modo` enum('conocimiento','soporte') COLLATE utf8mb4_unicode_ci DEFAULT 'conocimiento' COMMENT 'Base de conocimiento o soporte externo',
  `ot_id` int DEFAULT NULL COMMENT 'FK a orden_trabajo.id para soporte externo',
  `proveedor_id` int DEFAULT NULL COMMENT 'FK a proveedores.id',
  `estado` enum('borrador','pendiente','en_proceso','resuelto','cerrado') COLLATE utf8mb4_unicode_ci DEFAULT 'borrador',
  `prioridad` enum('baja','normal','alta') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `responsable` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nombre del especialista o responsable',
  `vehiculo_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: archivos_multimedia
CREATE TABLE IF NOT EXISTS `archivos_multimedia` (
  `id` int NOT NULL,
  `entidad_tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidad_id` int NOT NULL,
  `item_id` int DEFAULT NULL,
  `campo_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'id/name del campo del formulario asociado',
  `tipo_archivo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'documento' COMMENT 'foto|video|nota_voz|documento',
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tamanio_bytes` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ruta_thumbnail` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Miniatura generada (<=400px) para listas'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: articulos
CREATE TABLE IF NOT EXISTS `articulos` (
  `id` int NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marca` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proveedor_id` int DEFAULT NULL,
  `valor_referencia` decimal(12,0) DEFAULT NULL,
  `valor_compra` decimal(12,0) DEFAULT NULL,
  `valor_venta` decimal(12,0) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `stock_minimo` int DEFAULT '5',
  `ubicacion` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalles` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: articulo_proveedor
CREATE TABLE IF NOT EXISTS `articulo_proveedor` (
  `id` int NOT NULL,
  `articulo_id` int NOT NULL,
  `proveedor_id` int NOT NULL,
  `precio_costo` decimal(12,0) DEFAULT '0',
  `tiempo_entrega` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notas` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: cctv_camaras
CREATE TABLE IF NOT EXISTS `cctv_camaras` (
  `id` int NOT NULL,
  `dispositivo_id` int NOT NULL,
  `canal` int NOT NULL DEFAULT '1',
  `nombre` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ubicacion` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: cctv_dispositivos
CREATE TABLE IF NOT EXISTS `cctv_dispositivos` (
  `id` int NOT NULL,
  `nombre` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('DVR','NVR','IPC') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DVR',
  `device_id_p2p` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usuario` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clave_cifrada` text COLLATE utf8mb4_unicode_ci,
  `ip_local` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_publica` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `puerto_http` int NOT NULL DEFAULT '80',
  `puerto_rtsp` int NOT NULL DEFAULT '554',
  `puerto_sdk` int NOT NULL DEFAULT '37777',
  `modelo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `portal_web` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'https://dhi-dms.com',
  `notas` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Reemplazada por recepcion_unificada. Sin uso en API.
-- Table: checkin
CREATE TABLE IF NOT EXISTS `checkin` (
  `id` int NOT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `forma_de_llegada` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `motivo_de_visita` text COLLATE utf8mb4_unicode_ci,
  `necesidad_cliente` text COLLATE utf8mb4_unicode_ci,
  `requerimiento_cliente` text COLLATE utf8mb4_unicode_ci,
  `motor_enciende` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `revision_tecnica` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `permiso_circulacion` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `padron` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chaleco_reflectante` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `botiquin` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cubre_pisos` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `corta_corriente` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sistema_gps` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cubre_volante` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nivel_combustible` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `iluminacion_tablero` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recepcion_repuestos` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recepcion_dinero` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recepcion_otros` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recepcion_documentacion` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guantera_elementos` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firma_cliente` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_ejecucion
CREATE TABLE IF NOT EXISTS `checklist_ejecucion` (
  `id` int NOT NULL,
  `diagnostico_servicio_id` int DEFAULT NULL,
  `checklist_plantilla_id` int DEFAULT NULL COMMENT 'FK a checklist_plantilla.id',
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('pendiente','en_progreso','completado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `porcentaje_completado` int DEFAULT '0' COMMENT '0-100',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `modificado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ot_item_id` int DEFAULT NULL COMMENT 'FK a orden_trabajo_items.id'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_ejecucion_pasos
CREATE TABLE IF NOT EXISTS `checklist_ejecucion_pasos` (
  `id` int NOT NULL,
  `ejecucion_id` int NOT NULL COMMENT 'FK a checklist_ejecucion.id',
  `plantilla_paso_id` int DEFAULT NULL COMMENT 'FK a checklist_plantilla_pasos.id',
  `orden` int NOT NULL DEFAULT '0',
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `completado` tinyint(1) DEFAULT '0',
  `notas` text COLLATE utf8mb4_unicode_ci COMMENT 'Technician notes',
  `completado_por` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completado_en` datetime DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_paso_fotos
CREATE TABLE IF NOT EXISTS `checklist_paso_fotos` (
  `id` int NOT NULL,
  `paso_id` int NOT NULL COMMENT 'FK a checklist_ejecucion_pasos.id',
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_paso_notas_voz
CREATE TABLE IF NOT EXISTS `checklist_paso_notas_voz` (
  `id` int NOT NULL,
  `paso_id` int NOT NULL COMMENT 'FK a checklist_ejecucion_pasos.id',
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_segundos` int DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_paso_videos
CREATE TABLE IF NOT EXISTS `checklist_paso_videos` (
  `id` int NOT NULL,
  `paso_id` int NOT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_segundos` int DEFAULT NULL,
  `thumbnail_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_plantilla
CREATE TABLE IF NOT EXISTS `checklist_plantilla` (
  `id` int NOT NULL,
  `servicio_id` int NOT NULL COMMENT 'FK a trabajos_servicios.id',
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) DEFAULT '1',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `modificado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: checklist_plantilla_pasos
CREATE TABLE IF NOT EXISTS `checklist_plantilla_pasos` (
  `id` int NOT NULL,
  `checklist_id` int NOT NULL COMMENT 'FK a checklist_plantilla.id',
  `orden` int NOT NULL DEFAULT '0' COMMENT 'Order (0, 10, 20...)',
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci COMMENT 'Instructions for the step',
  `requiere_foto` tinyint(1) DEFAULT '0' COMMENT '1=requires photo evidence',
  `requiere_nota_voz` tinyint(1) DEFAULT '0' COMMENT '1=requires voice note',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sin uso en API.
-- Table: cierre_diario
CREATE TABLE IF NOT EXISTS `cierre_diario` (
  `id` int NOT NULL,
  `fecha` date NOT NULL,
  `ingresos_efectivo` decimal(12,0) DEFAULT '0',
  `ingresos_transferencia` decimal(12,0) DEFAULT '0',
  `egresos_efectivo` decimal(12,0) DEFAULT '0',
  `egresos_transferencia` decimal(12,0) DEFAULT '0',
  `saldo_final_caja` decimal(12,0) DEFAULT '0',
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `cerrado_por` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: clientes
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellido` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rut` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `domicilio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banco` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuentabancaria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `facebook` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instagram` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalles_personales` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: compras
CREATE TABLE IF NOT EXISTS `compras` (
  `id` int NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proveedor_id` int DEFAULT NULL,
  `orden_trabajo_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `forma_pago` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuenta_bancaria_id` int DEFAULT NULL,
  `valor` decimal(12,0) DEFAULT NULL,
  `estado_pago` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'Pendiente',
  `fecha_vencimiento` date DEFAULT NULL,
  `numero_documento` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `subtotal` decimal(12,0) DEFAULT NULL,
  `impuesto` decimal(12,0) DEFAULT '0',
  `descuento` decimal(12,0) DEFAULT '0',
  `valor_total` decimal(12,0) DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: compras_rapidas
CREATE TABLE IF NOT EXISTS `compras_rapidas` (
  `id` int NOT NULL,
  `fecha` date NOT NULL DEFAULT (curdate()),
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lugar_compra` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `valor` decimal(12,2) NOT NULL DEFAULT '0.00',
  `empleado_responsable_id` int DEFAULT NULL,
  `proveedor_id` int DEFAULT NULL,
  `tipo_pago` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Efectivo',
  `cuenta_bancaria_id` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: config_sistema
CREATE TABLE IF NOT EXISTS `config_sistema` (
  `id` int NOT NULL,
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('int','string','bool','json') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'string',
  `grupo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_valor` int DEFAULT NULL,
  `max_valor` int DEFAULT NULL,
  `opciones` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array con opciones válidas (para enum)',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `actualizado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: correo_adjuntos
CREATE TABLE IF NOT EXISTS `correo_adjuntos` (
  `id` int NOT NULL,
  `mensaje_id` int NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `size_bytes` int DEFAULT '0',
  `disk_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: correo_cuentas
CREATE TABLE IF NOT EXISTS `correo_cuentas` (
  `id` int NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_encrypted` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `imap_host` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `imap_port` int DEFAULT '993',
  `imap_encryption` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ssl',
  `smtp_host` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `smtp_port` int DEFAULT '465',
  `smtp_encryption` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ssl',
  `nombre_visible` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `activa` tinyint(1) DEFAULT '1',
  `ultima_sync` datetime DEFAULT NULL,
  `last_uid` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: correo_enviados
CREATE TABLE IF NOT EXISTS `correo_enviados` (
  `id` int NOT NULL,
  `cuenta_id` int NOT NULL,
  `mensaje_padre_id` int DEFAULT NULL,
  `remitente` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatarios` json NOT NULL,
  `asunto` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `body_html` mediumtext COLLATE utf8mb4_unicode_ci,
  `tiene_adjuntos` tinyint(1) DEFAULT '0',
  `estado` enum('enviado','error') COLLATE utf8mb4_unicode_ci DEFAULT 'enviado',
  `error_msg` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: correo_mensajes
CREATE TABLE IF NOT EXISTS `correo_mensajes` (
  `id` int NOT NULL,
  `cuenta_id` int NOT NULL,
  `uid` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `in_reply_to` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thread_references` text COLLATE utf8mb4_unicode_ci,
  `folder` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'INBOX',
  `direction` enum('inbound','outbound') COLLATE utf8mb4_unicode_ci DEFAULT 'inbound',
  `remitente_nombre` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `remitente_email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatarios` json DEFAULT NULL,
  `asunto` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `body_text` mediumtext COLLATE utf8mb4_unicode_ci,
  `body_html` mediumtext COLLATE utf8mb4_unicode_ci,
  `fecha_envio` datetime DEFAULT NULL,
  `tiene_adjuntos` tinyint(1) DEFAULT '0',
  `leido` tinyint(1) DEFAULT '0',
  `flaggeado` tinyint(1) DEFAULT '0',
  `cliente_id` int DEFAULT NULL,
  `solicitud_id` int DEFAULT NULL,
  `orden_trabajo_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: cuentas_bancarias
CREATE TABLE IF NOT EXISTS `cuentas_bancarias` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `banco` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_cuenta` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `saldo` decimal(12,0) DEFAULT '0' COMMENT 'LEGACY — calcular con getSaldoCuenta()',
  `detalles` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_compatibilidad
CREATE TABLE IF NOT EXISTS `desarme_compatibilidad` (
  `id` int NOT NULL,
  `maestro_pieza_id` int NOT NULL,
  `combustible` set('diesel','bencina','electrico','hibrido') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traccion` set('delantera','trasera','4x4') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transmision` set('manual','automatica','cvt','dsg') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_carroceria` set('sedan','hatchback','suv','pickup','van','coupe','otro') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marca` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modelo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anio_inicio` int DEFAULT NULL,
  `anio_fin` int DEFAULT NULL,
  `cilindrada_min` int DEFAULT NULL,
  `cilindrada_max` int DEFAULT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_descontaminacion
CREATE TABLE IF NOT EXISTS `desarme_descontaminacion` (
  `id` int NOT NULL,
  `desarme_id` int NOT NULL,
  `item` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `realizado` tinyint(1) DEFAULT '0',
  `litros` decimal(8,2) DEFAULT NULL,
  `destino_disposicion` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_evidencia` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci,
  `tecnico_id` int DEFAULT NULL,
  `fecha` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_historial
CREATE TABLE IF NOT EXISTS `desarme_historial` (
  `id` int NOT NULL,
  `desarme_id` int NOT NULL,
  `accion` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `usuario_id` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_items
CREATE TABLE IF NOT EXISTS `desarme_items` (
  `id` int NOT NULL,
  `desarme_id` int NOT NULL,
  `maestro_pieza_id` int DEFAULT NULL,
  `nombre_pieza` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code_pieza` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subsistema` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado_pieza` enum('bueno','malo','no_verificado','para_reparacion') COLLATE utf8mb4_unicode_ci DEFAULT 'no_verificado',
  `numero_serie` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_parte_fabricante` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigo_barras` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ubicacion_vehiculo` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_1` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_2` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_3` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notas_tecnico` text COLLATE utf8mb4_unicode_ci,
  `tiempo_extraccion_min` int DEFAULT NULL,
  `herramientas_utilizadas` text COLLATE utf8mb4_unicode_ci,
  `inventario_item_id` int DEFAULT NULL,
  `articulo_id` int DEFAULT NULL,
  `precio_venta` decimal(12,2) DEFAULT NULL,
  `estado_publicacion` enum('no_publicado','publicado','publicada','vendido') COLLATE utf8mb4_unicode_ci DEFAULT 'no_publicado',
  `fase` enum('extraida','inspeccionada','preparada','publicada') COLLATE utf8mb4_unicode_ci DEFAULT 'extraida',
  `es_grupo` tinyint(1) NOT NULL DEFAULT '0',
  `nombre_grupo` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_items_grupo
CREATE TABLE IF NOT EXISTS `desarme_items_grupo` (
  `id` int NOT NULL,
  `id_padre` int NOT NULL,
  `id_hijo` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_kits
CREATE TABLE IF NOT EXISTS `desarme_kits` (
  `id` int NOT NULL,
  `nombre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `precio_kit` decimal(12,2) DEFAULT NULL,
  `estado` enum('sugerido','armado','publicado','vendido') COLLATE utf8mb4_unicode_ci DEFAULT 'sugerido',
  `desarme_id` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_kit_items
CREATE TABLE IF NOT EXISTS `desarme_kit_items` (
  `id` int NOT NULL,
  `kit_id` int NOT NULL,
  `desarme_item_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_maestro_piezas
CREATE TABLE IF NOT EXISTS `desarme_maestro_piezas` (
  `id` int NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subsistema` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_preparacion
CREATE TABLE IF NOT EXISTS `desarme_preparacion` (
  `id` int NOT NULL,
  `desarme_item_id` int NOT NULL,
  `inspeccion_visual` tinyint(1) DEFAULT '0',
  `prueba_funcionamiento` tinyint(1) DEFAULT '0',
  `limpieza_realizada` tinyint(1) DEFAULT '0',
  `reparacion_necesaria` tinyint(1) DEFAULT '0',
  `resultado_inspeccion` enum('aprobado','rechazado','condicional') COLLATE utf8mb4_unicode_ci DEFAULT 'aprobado',
  `especificaciones_tecnicas` text COLLATE utf8mb4_unicode_ci,
  `foto_inspeccion_1` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_inspeccion_2` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_prueba` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `precio_estimado` decimal(12,2) DEFAULT NULL,
  `precio_venta` decimal(12,2) DEFAULT NULL,
  `inspector_id` int DEFAULT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci,
  `fecha_inspeccion` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_vehiculo
CREATE TABLE IF NOT EXISTS `desarme_vehiculo` (
  `id` int NOT NULL,
  `folio` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recepcion_id` int DEFAULT NULL,
  `orden_trabajo_id` int DEFAULT NULL,
  `vehiculo_id` int NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `motivo_desarme` enum('siniestrado','baja','multa','donacion','otro','dano_total','robo','abandono','junk') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'otro',
  `motivo_detalle` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('recepcion','descontaminacion','desarme','preparacion','completado','cancelado') COLLATE utf8mb4_unicode_ci DEFAULT 'recepcion',
  `inicio_descontaminacion` datetime DEFAULT NULL,
  `fin_descontaminacion` datetime DEFAULT NULL,
  `inicio_desarme` datetime DEFAULT NULL,
  `fin_desarme` datetime DEFAULT NULL,
  `inicio_preparacion` datetime DEFAULT NULL,
  `fin_preparacion` datetime DEFAULT NULL,
  `tecnico_asignado` int DEFAULT NULL,
  `notas_generales` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: desarme_valorizacion_config
CREATE TABLE IF NOT EXISTS `desarme_valorizacion_config` (
  `id` int NOT NULL,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `precio_base` decimal(12,2) NOT NULL DEFAULT '0.00',
  `factor_bueno` decimal(3,2) NOT NULL DEFAULT '1.00',
  `factor_para_reparacion` decimal(3,2) NOT NULL DEFAULT '0.60',
  `factor_malo` decimal(3,2) NOT NULL DEFAULT '0.30',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnosticos
CREATE TABLE IF NOT EXISTS `diagnosticos` (
  `id` int NOT NULL,
  `folio` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `tecnico` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kilometraje_actual` int DEFAULT NULL,
  `problema_principal` text COLLATE utf8mb4_unicode_ci,
  `sistemas_afectados` text COLLATE utf8mb4_unicode_ci,
  `diagnostico_detalles` json DEFAULT NULL,
  `causa_raiz` text COLLATE utf8mb4_unicode_ci,
  `recomendaciones` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('pendiente','en_proceso','completado','entregado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ot_id` int DEFAULT NULL,
  `diagnostico_final` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sin uso en API.
-- Table: diagnostico_insumos
CREATE TABLE IF NOT EXISTS `diagnostico_insumos` (
  `id` int NOT NULL,
  `diagnostico_id` int NOT NULL,
  `insumo_id` int DEFAULT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` int DEFAULT '1',
  `valor_unitario` decimal(12,0) DEFAULT '0',
  `consumo` enum('total','parcial','nada') COLLATE utf8mb4_unicode_ci DEFAULT 'total',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sin uso en API. Usar diagnostico_pruebas.
-- Table: diagnostico_procedimientos
CREATE TABLE IF NOT EXISTS `diagnostico_procedimientos` (
  `id` int NOT NULL,
  `diagnostico_id` int NOT NULL,
  `ot_id` int DEFAULT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `resultado` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('pendiente','en_proceso','completado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `orden` int DEFAULT '0' COMMENT 'Order of execution (0, 10, 20...)',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `modificado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `tiempo_segundos` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sin uso en API.
-- Table: diagnostico_procedimientos_fotos
CREATE TABLE IF NOT EXISTS `diagnostico_procedimientos_fotos` (
  `id` int NOT NULL,
  `procedimiento_id` int NOT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_archivo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'foto',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sin uso en API.
-- Table: diagnostico_procedimientos_notas_voz
CREATE TABLE IF NOT EXISTS `diagnostico_procedimientos_notas_voz` (
  `id` int NOT NULL,
  `procedimiento_id` int NOT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_segundos` int DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnostico_pruebas
CREATE TABLE IF NOT EXISTS `diagnostico_pruebas` (
  `id` int NOT NULL,
  `diagnostico_id` int NOT NULL,
  `ot_id` int DEFAULT NULL,
  `nombre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `resultado` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','en_proceso','completada') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `articulos_json` json DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `modificado` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `tiempo_segundos` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnostico_pruebas_fotos
CREATE TABLE IF NOT EXISTS `diagnostico_pruebas_fotos` (
  `id` int NOT NULL,
  `prueba_id` int NOT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_archivo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'foto',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnostico_pruebas_notas_voz
CREATE TABLE IF NOT EXISTS `diagnostico_pruebas_notas_voz` (
  `id` int NOT NULL,
  `prueba_id` int NOT NULL,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_segundos` int DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnostico_repuestos — LEGACY: sin uso, datos migrados a orden_trabajo_items
CREATE TABLE IF NOT EXISTS `diagnostico_repuestos` (
  `id` int NOT NULL,
  `diagnostico_id` int NOT NULL,
  `articulo_id` int DEFAULT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `cantidad` int DEFAULT '1',
  `valor_unitario` decimal(12,0) DEFAULT '0',
  `foto_original` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_instalada` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: diagnostico_servicios — LEGACY: sin uso, datos migrados a orden_trabajo_items
CREATE TABLE IF NOT EXISTS `diagnostico_servicios` (
  `id` int NOT NULL,
  `diagnostico_id` int NOT NULL,
  `servicio_id` int DEFAULT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `valor_unitario` decimal(12,0) DEFAULT '0',
  `creado` datetime DEFAULT CURRENT_TIMESTAMP,
  `archivos_json` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array of multimedia files [{ruta,tipo,nombre_original}]'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: empleados
CREATE TABLE IF NOT EXISTS `empleados` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellido` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rut` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `direccion` text COLLATE utf8mb4_unicode_ci,
  `cargo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sueldo` decimal(12,2) DEFAULT NULL,
  `fechaingreso` date DEFAULT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `banco` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuentabancaria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `facebook` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instagram` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcionlaboral` text COLLATE utf8mb4_unicode_ci,
  `detalles_personales` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: historial_cambios
CREATE TABLE IF NOT EXISTS `historial_cambios` (
  `id` int NOT NULL,
  `entidad_tipo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidad_id` int NOT NULL,
  `accion` enum('creado','actualizado','eliminado') COLLATE utf8mb4_unicode_ci NOT NULL,
  `campo_modificado` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor_anterior` text COLLATE utf8mb4_unicode_ci,
  `valor_nuevo` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: inspeccion_visual
CREATE TABLE IF NOT EXISTS `inspeccion_visual` (
  `id` int NOT NULL,
  `vehiculo_id` int NOT NULL,
  `pintura_frontal` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pintura_central` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pintura_trasera` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pintura_superior` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `espejos` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cerraduras` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alzavidrios` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tapiz_puertas` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tapiz_piloto` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tapiz_pasajero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tapiz_trasero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rueda_repuesto` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gata` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `radio` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alarma` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sunrroof` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parabrisas_delantero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parabrisas_trasero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parachoque_delantero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parachoque_trasero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bateria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `focos_delantero` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `focos_traseros` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ralladuras` text COLLATE utf8mb4_unicode_ci,
  `abollones` text COLLATE utf8mb4_unicode_ci,
  `patente_delantera` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `patente_trasera` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: insumos
CREATE TABLE IF NOT EXISTS `insumos` (
  `id` int NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `proveedor_id` int DEFAULT NULL,
  `formato` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor_compra` decimal(12,0) DEFAULT NULL,
  `valor_venta` decimal(12,0) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `stock_minimo` int DEFAULT '5',
  `ubicacion` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: inventario_taller
CREATE TABLE IF NOT EXISTS `inventario_taller` (
  `id` int NOT NULL,
  `identificacion` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zona_taller_id` int DEFAULT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalles` text COLLATE utf8mb4_unicode_ci,
  `utilidad` text COLLATE utf8mb4_unicode_ci,
  `precio_avaluado` decimal(12,2) DEFAULT '0.00',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: movimientos_caja
CREATE TABLE IF NOT EXISTS `movimientos_caja` (
  `id` int NOT NULL,
  `cuenta_bancaria_id` int NOT NULL,
  `fecha` date NOT NULL,
  `tipo` enum('ingreso','egreso','transferencia') COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(12,0) NOT NULL,
  `entidad_tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'venta, compra, pago, ajuste',
  `entidad_id` int DEFAULT NULL,
  `concepto` text COLLATE utf8mb4_unicode_ci,
  `conciliado` tinyint(1) DEFAULT '0',
  `anulado` tinyint(1) NOT NULL DEFAULT '0',
  `motivo_anulacion` text COLLATE utf8mb4_unicode_ci,
  `fecha_conciliacion` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: movimientos_stock
CREATE TABLE IF NOT EXISTS `movimientos_stock` (
  `id` int NOT NULL,
  `producto_tipo` enum('articulo','insumo') COLLATE utf8mb4_unicode_ci NOT NULL,
  `producto_id` int NOT NULL,
  `tipo_movimiento` enum('entrada','salida','ajuste') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` int NOT NULL,
  `referencia_tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'compra, orden_trabajo, ajuste_manual',
  `referencia_id` int DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: opciones_listas
CREATE TABLE IF NOT EXISTS `opciones_listas` (
  `id` int NOT NULL,
  `categoria` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: orden_compra
CREATE TABLE IF NOT EXISTS `orden_compra` (
  `id` int NOT NULL,
  `proveedor_id` int DEFAULT NULL,
  `fecha_emision` date NOT NULL,
  `fecha_entrega_estimada` date DEFAULT NULL,
  `estado` enum('solicitado','en_cotizacion','aprobada','asignada','en_proceso','recibida_parcial','recibida','cancelada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'solicitado',
  `subtotal` decimal(12,0) DEFAULT NULL,
  `impuesto` decimal(12,0) DEFAULT '0',
  `descuento` decimal(12,0) DEFAULT '0',
  `total` decimal(12,0) DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `solicitud_id` int DEFAULT NULL,
  `folio` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Folio OC-XXXXX',
  `solicitante_empleado_id` int DEFAULT NULL COMMENT 'Empleado que solicita',
  `asignado_empleado_id` int DEFAULT NULL COMMENT 'Empleado responsable asignado',
  `origen_tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'manual' COMMENT 'manual|ejecucion_ot|tarea|diagnostico',
  `origen_id` int DEFAULT NULL COMMENT 'id de la entidad de origen',
  `cuenta_bancaria_id` int DEFAULT NULL COMMENT 'Cuenta para registrar el gasto',
  `forma_pago` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'efectivo|transferencia|tarjeta|cheque|otro',
  `fecha_pago` date DEFAULT NULL,
  `cotizacion` text COLLATE utf8mb4_unicode_ci COMMENT 'Análisis, cotización y notas de validación',
  `tarea_id` int DEFAULT NULL COMMENT 'Tarea creada al asignar responsable'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: orden_compra_items
CREATE TABLE IF NOT EXISTS `orden_compra_items` (
  `id` int NOT NULL,
  `orden_compra_id` int NOT NULL,
  `producto_tipo` enum('articulo','insumo','herramienta','repuesto','otro') COLLATE utf8mb4_unicode_ci NOT NULL,
  `producto_id` int DEFAULT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad_solicitada` int NOT NULL DEFAULT '1',
  `cantidad_recibida` int NOT NULL DEFAULT '0',
  `valor_unitario` decimal(12,0) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `descripcion` text COLLATE utf8mb4_unicode_ci COMMENT 'Descripción libre del ítem'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: orden_trabajo
CREATE TABLE IF NOT EXISTS `orden_trabajo` (
  `id` int NOT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `presupuesto_id` int DEFAULT NULL,
  `asignado_empleado_id` int DEFAULT NULL,
  `recepcion_id` int DEFAULT NULL,
  `inspeccion_id` int DEFAULT NULL,
  `estado` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `prioridad` enum('baja','normal','alta','urgente') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `fecha_limite` date DEFAULT NULL,
  `total_horas` decimal(8,2) DEFAULT NULL,
  `evaluacion` text COLLATE utf8mb4_unicode_ci,
  `descripcion_problema` text COLLATE utf8mb4_unicode_ci COMMENT 'Lo que dice el cliente',
  `procedimiento_tecnico` text COLLATE utf8mb4_unicode_ci COMMENT 'Procedimiento tecnico sugerido',
  `servicio_ejecutar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `procedimiento` text COLLATE utf8mb4_unicode_ci,
  `hora_inicio_procesos` datetime DEFAULT NULL,
  `hora_fin_procesos` datetime DEFAULT NULL,
  `info_tecnica` text COLLATE utf8mb4_unicode_ci,
  `orden_compra_id` int DEFAULT NULL,
  `vigencia` date DEFAULT NULL,
  `convertido_a_venta` int DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha` date DEFAULT NULL COMMENT 'Fecha de la OT',
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `diagnostico_final` text COLLATE utf8mb4_unicode_ci COMMENT 'Diagnóstico final del técnico',
  `diagnostico_finalizado` tinyint(1) DEFAULT '0' COMMENT '1=diagnóstico finalizado',
  `diagnostico_id` int DEFAULT NULL,
  `notas_adicionales` text COLLATE utf8mb4_unicode_ci COMMENT 'Notas adicionales de la OT',
  `repuestos_cliente` text COLLATE utf8mb4_unicode_ci COMMENT 'Repuestos entregados por el cliente',
  `comentarios_empleado` text COLLATE utf8mb4_unicode_ci COMMENT 'Indicaciones para el empleado',
  `fecha_inicio_trabajo` date DEFAULT NULL,
  `hora_inicio_trabajo` time DEFAULT NULL,
  `fecha_fin_trabajo` date DEFAULT NULL,
  `hora_fin_trabajo` time DEFAULT NULL,
  `tecnico_id` int DEFAULT NULL,
  `folio_ot` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: orden_trabajo_items
CREATE TABLE IF NOT EXISTS `orden_trabajo_items` (
  `id` int NOT NULL,
  `orden_trabajo_id` int NOT NULL,
  `tipo` enum('servicio','articulo','insumo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'servicio',
  `item_id` int DEFAULT NULL COMMENT 'FK a trabajos_servicios.id o articulos.id',
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `cantidad` int NOT NULL DEFAULT '1',
  `valor_unitario` decimal(12,0) NOT NULL DEFAULT '0',
  `consumido` tinyint(1) DEFAULT '0',
  `fecha_consumo` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `porcentaje_consumo` int DEFAULT NULL COMMENT '0=todo,1=mitad,2=menos_mitad,3=nada',
  `insumo_id` int DEFAULT NULL COMMENT 'FK a insumos.id cuando tipo=insumo',
  `seccion` enum('servicio','repuesto_taller','repuesto_cliente','insumo') COLLATE utf8mb4_unicode_ci DEFAULT 'servicio',
  `completado` tinyint(1) DEFAULT '0',
  `es_imprevisto` tinyint(1) DEFAULT '0' COMMENT '1=item inyectado en caliente durante ejecucion',
  `estado_item` enum('pendiente','en_proceso','completado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `labores_realizadas` text COLLATE utf8mb4_unicode_ci COMMENT 'Detalle obligatorio al completar el item',
  `item_origen_id` int DEFAULT NULL COMMENT 'id del item original (presupuesto/diagnostico) si fue inyectado como imprevisto',
  `etapa_id` int DEFAULT NULL,
  `audio_nota_id` int DEFAULT NULL,
  `duracion_minutos` decimal(8,2) DEFAULT NULL COMMENT 'Duracion real del servicio en minutos',
  `hora_inicio_item` datetime DEFAULT NULL,
  `hora_fin_item` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ot_avances
CREATE TABLE IF NOT EXISTS `ot_avances` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `titulo` varchar(200) DEFAULT '',
  `descripcion` text NOT NULL,
  `porcentaje` int DEFAULT '0',
  `autor_empleado_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Table: ot_comentarios
CREATE TABLE IF NOT EXISTS `ot_comentarios` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `autor_tipo` enum('cliente','tecnico','sistema') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cliente',
  `autor_nombre` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `autor_empleado_id` int DEFAULT NULL,
  `mensaje` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `leido` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ot_documentos
CREATE TABLE IF NOT EXISTS `ot_documentos` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'otro',
  `archivo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ot_etapas
CREATE TABLE IF NOT EXISTS `ot_etapas` (
  `id` int NOT NULL,
  `orden_trabajo_id` int NOT NULL,
  `nombre` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `orden` int NOT NULL DEFAULT '0',
  `estado` enum('pendiente','en_curso','completado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ot_interacciones_cliente
CREATE TABLE IF NOT EXISTS `ot_interacciones_cliente` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `tipo` enum('comentario','foto','video','nota_voz') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'comentario',
  `mensaje` text COLLATE utf8mb4_unicode_ci,
  `ruta_archivo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nombre_original` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tamanio_bytes` int DEFAULT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ot_repuestos_solicitados
CREATE TABLE IF NOT EXISTS `ot_repuestos_solicitados` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `articulo_id` int DEFAULT NULL,
  `insumo_id` int DEFAULT NULL,
  `cantidad` int NOT NULL DEFAULT '1',
  `estado` enum('solicitado','entregado','rechazado','cancelado') COLLATE utf8mb4_unicode_ci DEFAULT 'solicitado',
  `solicitado_por` int DEFAULT NULL COMMENT 'empleado_id que pidio',
  `foto_requerida` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_solicitud` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_entrega` datetime DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `oc_id` int DEFAULT NULL COMMENT 'orden_compra_id asociada'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: pagos
CREATE TABLE IF NOT EXISTS `pagos` (
  `id` int NOT NULL,
  `entidad_tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'venta|compra',
  `entidad_id` int DEFAULT NULL,
  `concepto` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Concepto del pago',
  `receptor` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Receptor/beneficiario',
  `monto` decimal(12,0) NOT NULL,
  `fecha` date NOT NULL,
  `forma_pago` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cuenta_bancaria_id` int DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cuotas_json` json DEFAULT NULL,
  `numero_cuotas` int DEFAULT '1',
  `tipo_pago` enum('contado','cuotas') COLLATE utf8mb4_unicode_ci DEFAULT 'contado'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: pagos_plazos
CREATE TABLE IF NOT EXISTS `pagos_plazos` (
  `id` int NOT NULL,
  `concepto` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `monto` decimal(12,0) NOT NULL,
  `fecha_pago` date NOT NULL,
  `cuenta_bancaria_id` int DEFAULT NULL,
  `receptor` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','pagado','cancelado') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `fecha_ejecucion` date DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: permisos
CREATE TABLE IF NOT EXISTS `permisos` (
  `id` int NOT NULL,
  `modulo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accion` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('accion','campo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accion',
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: portal_config
CREATE TABLE IF NOT EXISTS `portal_config` (
  `id` int NOT NULL,
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` text COLLATE utf8mb4_unicode_ci,
  `tipo` enum('boolean','integer','string','json') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'boolean',
  `seccion` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `etiqueta` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `orden` int NOT NULL DEFAULT '0',
  `actualizado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: portal_ot_permisos
CREATE TABLE IF NOT EXISTS `portal_ot_permisos` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `clave` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: presupuesto
CREATE TABLE IF NOT EXISTS `presupuesto` (
  `id` int NOT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'borrador',
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `vigencia` int DEFAULT NULL,
  `requisito` text COLLATE utf8mb4_unicode_ci,
  `detalle_trabajos` text COLLATE utf8mb4_unicode_ci COMMENT 'LEGACY — no se escribe desde Fase0, usar items_json',
  `detalle_articulos` text COLLATE utf8mb4_unicode_ci COMMENT 'LEGACY — no se escribe desde Fase0, usar items_json',
  `detalle_servicios` text COLLATE utf8mb4_unicode_ci COMMENT 'LEGACY — no se escribe desde Fase0, usar items_json',
  `servicios_json` json DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0, usar items_json',
  `articulos_json` json DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0, usar items_json',
  `items_json` longtext COLLATE utf8mb4_unicode_ci,
  `valor` decimal(12,0) DEFAULT NULL,
  `impuesto` decimal(12,0) DEFAULT '0',
  `descuento` decimal(12,0) DEFAULT '0',
  `descuento_pct` decimal(5,2) DEFAULT '0.00',
  `descuento_global` decimal(12,0) DEFAULT '0',
  `valor_total` decimal(12,0) DEFAULT NULL,
  `convertido_a_ot` int DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `verificado` tinyint(1) DEFAULT '0',
  `ot_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: presupuesto_items
CREATE TABLE IF NOT EXISTS `presupuesto_items` (
  `id` int NOT NULL,
  `presupuesto_id` int NOT NULL,
  `tipo` enum('servicio','articulo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'servicio',
  `item_id` int DEFAULT NULL COMMENT 'FK a trabajos_servicios.id o articulos.id',
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `cantidad` int NOT NULL DEFAULT '1',
  `valor_unitario` decimal(12,0) NOT NULL DEFAULT '0',
  `descuento` decimal(5,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: proveedores
CREATE TABLE IF NOT EXISTS `proveedores` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rut` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rubro` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `direccion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sitio_web` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_nombre` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contacto_telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: proveedor_articulos
CREATE TABLE IF NOT EXISTS `proveedor_articulos` (
  `id` int NOT NULL,
  `proveedor_id` int NOT NULL,
  `articulo_id` int NOT NULL,
  `precio_referencia` decimal(12,2) DEFAULT NULL,
  `tiempo_entrega_dias` int DEFAULT NULL,
  `notas` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Reemplazada por recepcion_unificada. Sin uso en API.
-- Table: recepcion_ingreso
CREATE TABLE IF NOT EXISTS `recepcion_ingreso` (
  `id` int NOT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `forma_llegada` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kilometraje` int DEFAULT NULL,
  `nivel_combustible` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_orden_interna` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asesor_taller` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado_general` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documentacion_recibida` text COLLATE utf8mb4_unicode_ci,
  `repuestos_recibidos` text COLLATE utf8mb4_unicode_ci,
  `objetos_personales` text COLLATE utf8mb4_unicode_ci,
  `rueda_repuesto` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gata` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `botiquin` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chaleco_reflectante` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `motor_enciende` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `luces_delanteras` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `luces_traseras` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `testigos_tablero` text COLLATE utf8mb4_unicode_ci,
  `diagrama_danos` text COLLATE utf8mb4_unicode_ci,
  `detalles_danos` text COLLATE utf8mb4_unicode_ci,
  `motivo_visita` text COLLATE utf8mb4_unicode_ci,
  `analisis_tecnico` text COLLATE utf8mb4_unicode_ci,
  `condiciones_exteriores` text COLLATE utf8mb4_unicode_ci,
  `condiciones_interiores` text COLLATE utf8mb4_unicode_ci,
  `foto_frontal` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_trasera` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_lateral` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_superior` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firma_cliente` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: recepcion_unificada
CREATE TABLE IF NOT EXISTS `recepcion_unificada` (
  `id` int NOT NULL,
  `folio` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_nombre` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_apellido` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_rut` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_domicilio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_banco` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0',
  `cliente_cuentabancaria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0',
  `cliente_facebook` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0',
  `cliente_instagram` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LEGACY — no se escribe desde Fase0',
  `cliente_detalles_personales` text COLLATE utf8mb4_unicode_ci COMMENT 'LEGACY — no se escribe desde Fase0',
  `vehiculo_marca` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_modelo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_anio` int DEFAULT NULL,
  `vehiculo_patente` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_combustible` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_kilometraje` int DEFAULT NULL,
  `vehiculo_cilindrada_motor` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_transmision` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_traccion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_tipo_carroceria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_procedencia` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_disenoestructural` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehiculo_notas_tecnico` text COLLATE utf8mb4_unicode_ci,
  `insp_pintura_frontal` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_pintura_lateral_izq` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_pintura_lateral_der` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_pintura_trasera` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_pintura_techo` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_parabrisas_del` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_parabrisas_tras` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_espejos` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_focos_del` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_focos_tras` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_parachoque_del` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_parachoque_tras` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_neumaticos_del` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_neumaticos_tras` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_tapiz_piloto` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_tapiz_copiloto` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_tapiz_trasero` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_alfombras` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_tablero` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_cinturones` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_motor_enciende` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_nivel_aceite` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_nivel_refrigerante` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_bateria` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_correas` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A',
  `insp_rueda_repuesto` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_gata` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_chaleco` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_triangulo` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_botiquin` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_extintor` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'Sí',
  `insp_ralladuras` text COLLATE utf8mb4_unicode_ci,
  `insp_abollones` text COLLATE utf8mb4_unicode_ci,
  `insp_observaciones_generales` text COLLATE utf8mb4_unicode_ci,
  `foto_frontal` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_trasera` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_lateral_izq` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_lateral_der` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_superior` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_motor` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_interior` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eval_estado_general` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eval_motivo_visita` text COLLATE utf8mb4_unicode_ci,
  `eval_firma_cliente` longtext COLLATE utf8mb4_unicode_ci,
  `numero_orden_interna` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asesor_taller` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `forma_llegada` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `alerta_pernos_rodados` tinyint(1) DEFAULT '0' COMMENT 'Alerta: pernos rodados reportados por el cliente',
  `alerta_falla_red` tinyint(1) DEFAULT '0' COMMENT 'Alerta: falla de red previa reportada por el cliente'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: recepcion_inspeccion_items
-- Tabla normalizada para items del checklist de inspección visual.
-- Reemplaza a las 31 columnas rígidas insp_* en recepcion_unificada.
-- Permite agregar nuevos ítems sin ALTER TABLE.
CREATE TABLE IF NOT EXISTS `recepcion_inspeccion_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recepcion_id` int NOT NULL,
  `campo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'identificador del item (ej: insp_pintura_frontal)',
  `valor` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'N/A' COMMENT 'Bueno | Regular | Malo | Si | No | N/A',
  `seccion` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'exterior | interior | motor | seguridad',
  `orden` int NOT NULL DEFAULT '0' COMMENT 'posición del item dentro de su sección',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_recepcion_campo` (`recepcion_id`, `campo`),
  KEY `idx_recepcion` (`recepcion_id`),
  KEY `idx_seccion` (`seccion`),
  CONSTRAINT `fk_inspeccion_recepcion` FOREIGN KEY (`recepcion_id`) REFERENCES `recepcion_unificada` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: roles
CREATE TABLE IF NOT EXISTS `roles` (
  `id` int NOT NULL,
  `nombre` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nivel` int NOT NULL DEFAULT '5' COMMENT '1=admin max, 6=readonly',
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#6B7280',
  `icono` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fa-user',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: role_permisos
CREATE TABLE IF NOT EXISTS `role_permisos` (
  `id` int NOT NULL,
  `rol_id` int NOT NULL,
  `permiso_id` int NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: solicitudes_compra
CREATE TABLE IF NOT EXISTS `solicitudes_compra` (
  `id` int NOT NULL,
  `diagnostico_id` int DEFAULT NULL,
  `ot_id` int DEFAULT NULL,
  `vehiculo_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `empleado_id` int DEFAULT NULL,
  `nombre_repuesto` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` int DEFAULT '1',
  `motivo` text COLLATE utf8mb4_unicode_ci,
  `foto_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nota_voz_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','asignada','procesada','cancelada') COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `orden_compra_id` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: solicitudes_registro
CREATE TABLE IF NOT EXISTS `solicitudes_registro` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `apellido` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rut` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `empresa` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `motivo` text COLLATE utf8mb4_unicode_ci,
  `campos_extra` json DEFAULT NULL,
  `estado` enum('pendiente','aprobada','rechazada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `admin_id` int DEFAULT NULL,
  `motivo_rechazo` text COLLATE utf8mb4_unicode_ci,
  `usuario_creado_id` int DEFAULT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revisado` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: solicitudes_visita
CREATE TABLE IF NOT EXISTS `solicitudes_visita` (
  `id` int NOT NULL,
  `folio` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cliente_nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_apellido` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `cliente_telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `cliente_rut` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_patente` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehiculo_marca` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_modelo` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_anio` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `motivo` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `fecha_solicitada` date DEFAULT NULL,
  `hora_solicitada` time DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('pendiente','vista','asignada','rechazada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `slot_id` int DEFAULT NULL COMMENT 'Slot asignado en agenda_slots',
  `motivo_rechazo` text COLLATE utf8mb4_unicode_ci,
  `notas_voz` json DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: tareas_diarias
CREATE TABLE IF NOT EXISTS `tareas_diarias` (
  `id` int NOT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asignado_empleado_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `proceso` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prioridad` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `estado` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detalles` text COLLATE utf8mb4_unicode_ci,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `folio` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Folio único TAR-XXXXX'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: tarea_avances
CREATE TABLE IF NOT EXISTS `tarea_avances` (
  `id` int NOT NULL,
  `tarea_id` int NOT NULL,
  `empleado_id` int DEFAULT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `porcentaje` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: tarea_comentarios
CREATE TABLE IF NOT EXISTS `tarea_comentarios` (
  `id` int NOT NULL,
  `tarea_id` int NOT NULL,
  `empleado_id` int DEFAULT NULL,
  `autor_nombre` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Anónimo',
  `comentario` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: trabajos_servicios
CREATE TABLE IF NOT EXISTS `trabajos_servicios` (
  `id` int NOT NULL,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `foto_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tiempo_implementar` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor_trabajo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: trabajos_servicios_checklist_ejecucion
CREATE TABLE IF NOT EXISTS `trabajos_servicios_checklist_ejecucion` (
  `id` int NOT NULL,
  `ot_id` int NOT NULL,
  `item_id` int NOT NULL,
  `completado` tinyint(1) DEFAULT '0',
  `completado_at` datetime DEFAULT NULL,
  `completado_por_empleado_id` int DEFAULT NULL,
  `observaciones` text COLLATE utf8mb4_unicode_ci,
  `foto_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nota_voz_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duracion_segundos` int DEFAULT NULL,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: trabajos_servicios_checklist_items
CREATE TABLE IF NOT EXISTS `trabajos_servicios_checklist_items` (
  `id` int NOT NULL,
  `servicio_id` int NOT NULL,
  `orden` int DEFAULT '0',
  `titulo` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `obligatorio` tinyint(1) DEFAULT '1',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: user_activity
CREATE TABLE IF NOT EXISTS `user_activity` (
  `id` bigint NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `accion` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidad` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidad_id` int DEFAULT NULL,
  `detalle` text COLLATE utf8mb4_unicode_ci,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LEGACY: Sesiones manejadas por PHP nativo. Sin uso en API.
-- Table: user_sesiones
CREATE TABLE IF NOT EXISTS `user_sesiones` (
  `id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `sesion_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expira` datetime NOT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int NOT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('empleado','cliente','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'empleado',
  `empleado_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `intentos_fallidos` int NOT NULL DEFAULT '0',
  `bloqueado_hasta` datetime DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `token_recordar` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token_expira` datetime DEFAULT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: usuario_permisos
CREATE TABLE IF NOT EXISTS `usuario_permisos` (
  `id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `permiso` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creado` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: usuario_roles
CREATE TABLE IF NOT EXISTS `usuario_roles` (
  `id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `rol_id` int NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `asignado_por` int DEFAULT NULL,
  `creado` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: vehiculos
CREATE TABLE IF NOT EXISTS `vehiculos` (
  `id` int NOT NULL,
  `cliente_id` int NOT NULL,
  `marca` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modelo` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anio` int DEFAULT NULL,
  `patente` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `combustible` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kilometraje` int DEFAULT NULL,
  `cilindrada_motor` int DEFAULT NULL,
  `transmision` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traccion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_carroceria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `procedencia` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disenoestructural` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notas_tecnico` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: vehiculo_notas
CREATE TABLE IF NOT EXISTS `vehiculo_notas` (
  `id` int NOT NULL,
  `vehiculo_id` int NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contenido` text COLLATE utf8mb4_unicode_ci,
  `categoria` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: ventas
CREATE TABLE IF NOT EXISTS `ventas` (
  `id` int NOT NULL,
  `nombre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_id` int DEFAULT NULL,
  `presupuesto_id` int DEFAULT NULL,
  `orden_trabajo_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `forma_pago` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cuenta_bancaria_id` int DEFAULT NULL,
  `valor` decimal(12,0) DEFAULT NULL,
  `estado_pago` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pendiente',
  `fecha_vencimiento` date DEFAULT NULL,
  `numero_documento` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `subtotal` decimal(12,0) DEFAULT NULL,
  `impuesto` decimal(12,0) DEFAULT '0',
  `descuento` decimal(12,0) DEFAULT '0',
  `valor_total` decimal(12,0) DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: visitas_taller
CREATE TABLE IF NOT EXISTS `visitas_taller` (
  `id` int NOT NULL,
  `folio` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `slot_id` int NOT NULL,
  `solicitud_id` int DEFAULT NULL,
  `cliente_id` int DEFAULT NULL COMMENT 'FK a clientes si ya existe',
  `cliente_nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_apellido` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `cliente_telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_correo` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_id` int DEFAULT NULL COMMENT 'FK a vehiculos si ya existe',
  `vehiculo_patente` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehiculo_marca` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_modelo` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `vehiculo_anio` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `motivo` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `diagnostico` text COLLATE utf8mb4_unicode_ci,
  `estado` enum('pendiente','en_curso','diagnostico','presupuesto','finalizado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `prioridad` enum('baja','normal','alta','urgente') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `notas` text COLLATE utf8mb4_unicode_ci,
  `empleado_asignado_id` int DEFAULT NULL,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Table: zonas_taller
CREATE TABLE IF NOT EXISTS `zonas_taller` (
  `id` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `creado` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- Indexes
-- =============================================================
ALTER TABLE `agenda_bloques`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bloque_dia` (`dia_semana`,`hora_apertura`);

ALTER TABLE `agenda_slots`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_slot_fecha_hora` (`fecha`,`hora_inicio`),
  ADD KEY `idx_slot_fecha` (`fecha`),
  ADD KEY `idx_slot_estado` (`estado`),
  ADD KEY `fk_slot_visita` (`visita_id`);

ALTER TABLE `apoyo_tecnico`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_apoyo_vehiculo` (`vehiculo_id`);

ALTER TABLE `archivos_multimedia`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_entidad` (`entidad_tipo`,`entidad_id`),
  ADD KEY `idx_entidad_campo` (`entidad_tipo`,`entidad_id`,`campo_key`);

ALTER TABLE `articulos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_tipo` (`tipo`),
  ADD KEY `idx_proveedor` (`proveedor_id`);

ALTER TABLE `articulo_proveedor`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `articulo_id` (`articulo_id`,`proveedor_id`),
  ADD KEY `fk_ap_proveedor` (`proveedor_id`);

ALTER TABLE `cctv_camaras`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cc_disp` (`dispositivo_id`);

ALTER TABLE `cctv_dispositivos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cd_activo` (`activo`);

ALTER TABLE `checkin`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_checkin_vehiculo` (`vehiculo_id`),
  ADD KEY `fk_checkin_cliente` (`cliente_id`);

ALTER TABLE `checklist_ejecucion`
  ADD PRIMARY KEY (`id`),
  ADD KEY `checklist_plantilla_id` (`checklist_plantilla_id`),
  ADD KEY `idx_ejecucion_diag_serv` (`diagnostico_servicio_id`),
  ADD KEY `idx_ejecucion_ot_item` (`ot_item_id`);

ALTER TABLE `checklist_ejecucion_pasos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `plantilla_paso_id` (`plantilla_paso_id`),
  ADD KEY `idx_ej_paso_ejecucion` (`ejecucion_id`),
  ADD KEY `idx_ej_paso_orden` (`ejecucion_id`,`orden`);

ALTER TABLE `checklist_paso_fotos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_foto_paso` (`paso_id`);

ALTER TABLE `checklist_paso_notas_voz`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nota_paso` (`paso_id`);

ALTER TABLE `checklist_paso_videos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_video_paso` (`paso_id`);

ALTER TABLE `checklist_plantilla`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_plantilla_servicio` (`servicio_id`);

ALTER TABLE `checklist_plantilla_pasos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_paso_checklist` (`checklist_id`),
  ADD KEY `idx_paso_orden` (`checklist_id`,`orden`);

ALTER TABLE `cierre_diario`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `fecha` (`fecha`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `fk_cierre_empleado` (`cerrado_por`);

ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `rut` (`rut`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_rut` (`rut`),
  ADD KEY `idx_telefono` (`telefono`);

ALTER TABLE `compras`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_compras_fecha` (`fecha`),
  ADD KEY `idx_compras_estado_pago` (`estado_pago`),
  ADD KEY `idx_compras_proveedor` (`proveedor_id`),
  ADD KEY `idx_compras_cuenta` (`cuenta_bancaria_id`),
  ADD KEY `idx_compras_ot_id` (`orden_trabajo_id`);

ALTER TABLE `compras_rapidas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_cr_cuenta` (`cuenta_bancaria_id`),
  ADD KEY `idx_cr_fecha` (`fecha`),
  ADD KEY `idx_cr_nombre` (`nombre`),
  ADD KEY `idx_cr_empleado` (`empleado_responsable_id`),
  ADD KEY `idx_cr_tipo_pago` (`tipo_pago`);

ALTER TABLE `config_sistema`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `clave` (`clave`);

ALTER TABLE `correo_adjuntos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mensaje` (`mensaje_id`);

ALTER TABLE `correo_cuentas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

ALTER TABLE `correo_enviados`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cuenta` (`cuenta_id`);

ALTER TABLE `correo_mensajes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cuenta_uid` (`cuenta_id`,`uid`),
  ADD KEY `idx_cliente` (`cliente_id`),
  ADD KEY `idx_fecha` (`fecha_envio`),
  ADD KEY `idx_message_id` (`message_id`),
  ADD KEY `idx_in_reply_to` (`in_reply_to`);

ALTER TABLE `correo_mensajes` ADD FULLTEXT KEY `idx_search` (`asunto`,`body_text`);

ALTER TABLE `cuentas_bancarias`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `desarme_compatibilidad`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pieza` (`maestro_pieza_id`),
  ADD KEY `idx_compat` (`combustible`,`traccion`,`transmision`);

ALTER TABLE `desarme_descontaminacion`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_desarme` (`desarme_id`);

ALTER TABLE `desarme_historial`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_desarme` (`desarme_id`),
  ADD KEY `idx_fecha` (`creado`);

ALTER TABLE `desarme_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `maestro_pieza_id` (`maestro_pieza_id`),
  ADD KEY `idx_desarme` (`desarme_id`),
  ADD KEY `idx_fase` (`fase`),
  ADD KEY `idx_categoria` (`categoria`),
  ADD KEY `idx_estado` (`estado_pieza`);

ALTER TABLE `desarme_kits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `desarme_id` (`desarme_id`),
  ADD KEY `idx_estado` (`estado`);

ALTER TABLE `desarme_kit_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_kit_item` (`kit_id`,`desarme_item_id`),
  ADD KEY `desarme_item_id` (`desarme_item_id`);

ALTER TABLE `desarme_maestro_piezas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_code` (`code`),
  ADD KEY `idx_categoria` (`categoria`),
  ADD KEY `idx_subsistema` (`subsistema`),
  ADD KEY `idx_activo` (`activo`);

ALTER TABLE `desarme_preparacion`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_item` (`desarme_item_id`);

ALTER TABLE `desarme_vehiculo`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_folio` (`folio`),
  ADD KEY `recepcion_id` (`recepcion_id`),
  ADD KEY `orden_trabajo_id` (`orden_trabajo_id`),
  ADD KEY `cliente_id` (`cliente_id`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_vehiculo` (`vehiculo_id`),
  ADD KEY `idx_fecha` (`creado`);

ALTER TABLE `desarme_valorizacion_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_categoria` (`categoria`);

ALTER TABLE `diagnosticos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diag_vehiculo` (`vehiculo_id`),
  ADD KEY `idx_diag_cliente` (`cliente_id`),
  ADD KEY `idx_diag_fecha` (`fecha`),
  ADD KEY `idx_diag_estado` (`estado`),
  ADD KEY `idx_diag_folio` (`folio`),
  ADD KEY `fk_diag_ot` (`ot_id`);

ALTER TABLE `diagnostico_insumos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diag_id` (`diagnostico_id`);

ALTER TABLE `diagnostico_procedimientos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_proc_diag` (`diagnostico_id`),
  ADD KEY `idx_proc_ot` (`ot_id`);

ALTER TABLE `diagnostico_procedimientos_fotos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_proc_foto` (`procedimiento_id`);

ALTER TABLE `diagnostico_procedimientos_notas_voz`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_proc_nota` (`procedimiento_id`);

ALTER TABLE `diagnostico_pruebas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diag_id` (`diagnostico_id`),
  ADD KEY `idx_ot_id` (`ot_id`);

ALTER TABLE `diagnostico_pruebas_fotos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prueba_id` (`prueba_id`);

ALTER TABLE `diagnostico_pruebas_notas_voz`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nota_prueba` (`prueba_id`);

ALTER TABLE `diagnostico_repuestos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diag_id` (`diagnostico_id`);

ALTER TABLE `diagnostico_servicios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_diag_id` (`diagnostico_id`);

ALTER TABLE `empleados`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `rut` (`rut`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_rut` (`rut`);

ALTER TABLE `historial_cambios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_entidad` (`entidad_tipo`,`entidad_id`),
  ADD KEY `idx_accion` (`accion`),
  ADD KEY `idx_fecha` (`created_at`);

ALTER TABLE `inspeccion_visual`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_inspeccion_vehiculo` (`vehiculo_id`);

ALTER TABLE `insumos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_proveedor` (`proveedor_id`);

ALTER TABLE `inventario_taller`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_it_categoria` (`categoria`),
  ADD KEY `idx_it_identificacion` (`identificacion`),
  ADD KEY `idx_inventario_zona_id` (`zona_taller_id`);

ALTER TABLE `movimientos_caja`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_entidad` (`entidad_tipo`,`entidad_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_conciliado` (`conciliado`),
  ADD KEY `idx_mc_fecha_tipo` (`fecha`,`tipo`),
  ADD KEY `idx_mc_cuenta` (`cuenta_bancaria_id`);

ALTER TABLE `movimientos_stock`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ms_producto` (`producto_tipo`,`producto_id`),
  ADD KEY `idx_referencia` (`referencia_tipo`,`referencia_id`),
  ADD KEY `idx_ms_fecha` (`created_at`);

ALTER TABLE `opciones_listas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_categoria_valor` (`categoria`,`valor`),
  ADD KEY `idx_categoria` (`categoria`);

ALTER TABLE `orden_compra`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_proveedor` (`proveedor_id`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha` (`fecha_emision`),
  ADD KEY `idx_folio` (`folio`);

ALTER TABLE `orden_compra_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orden_compra` (`orden_compra_id`),
  ADD KEY `idx_producto` (`producto_tipo`,`producto_id`);

ALTER TABLE `orden_trabajo`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ot_estado` (`estado`),
  ADD KEY `idx_ot_fecha` (`creado`),
  ADD KEY `idx_ot_cliente` (`cliente_id`),
  ADD KEY `idx_ot_vehiculo` (`vehiculo_id`),
  ADD KEY `idx_ot_folio` (`folio_ot`),
  ADD KEY `idx_ot_tecnico` (`tecnico_id`),
  ADD KEY `idx_ot_presupuesto_id` (`presupuesto_id`),
  ADD KEY `idx_ot_asignado_empleado` (`asignado_empleado_id`),
  ADD KEY `idx_ot_recepcion_id` (`recepcion_id`),
  ADD KEY `idx_ot_inspeccion_id` (`inspeccion_id`),
  ADD KEY `idx_ot_diagnostico_id` (`diagnostico_id`),
  ADD KEY `idx_ot_orden_compra_id` (`orden_compra_id`);

ALTER TABLE `orden_trabajo_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orden_trabajo` (`orden_trabajo_id`),
  ADD KEY `idx_item` (`item_id`,`tipo`),
  ADD KEY `idx_estado_item` (`estado_item`);

ALTER TABLE `ot_avances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_ot_avances_empleado` (`autor_empleado_id`),
  ADD KEY `idx_ot_avances_ot` (`ot_id`);

ALTER TABLE `ot_comentarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oc_ot` (`ot_id`),
  ADD KEY `idx_oc_creado` (`creado`);

ALTER TABLE `ot_documentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ot_documentos_ot` (`ot_id`);

ALTER TABLE `ot_etapas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_etapa_ot` (`orden_trabajo_id`);

ALTER TABLE `ot_interacciones_cliente`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_oic_ot` (`ot_id`),
  ADD KEY `idx_oic_creado` (`creado`);

ALTER TABLE `ot_repuestos_solicitados`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_ot_rep_articulo` (`articulo_id`),
  ADD KEY `fk_ot_rep_insumo` (`insumo_id`),
  ADD KEY `fk_ot_rep_empleado` (`solicitado_por`),
  ADD KEY `idx_ot` (`ot_id`),
  ADD KEY `idx_estado` (`estado`);

ALTER TABLE `pagos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_entidad` (`entidad_tipo`,`entidad_id`),
  ADD KEY `fk_pagos_cuenta` (`cuenta_bancaria_id`);

ALTER TABLE `pagos_plazos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_pago` (`fecha_pago`),
  ADD KEY `cuenta_bancaria_id` (`cuenta_bancaria_id`);

ALTER TABLE `permisos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_permisos_key` (`modulo`,`accion`,`campo`),
  ADD KEY `idx_permisos_modulo` (`modulo`),
  ADD KEY `idx_permisos_tipo` (`tipo`);

ALTER TABLE `portal_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `clave` (`clave`),
  ADD KEY `idx_pc_seccion` (`seccion`),
  ADD KEY `idx_pc_orden` (`orden`);

ALTER TABLE `portal_ot_permisos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pop_ot` (`ot_id`),
  ADD KEY `idx_pop_clave` (`clave`);

ALTER TABLE `presupuesto`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_presupuesto_fecha` (`creado`),
  ADD KEY `idx_presupuesto_estado` (`estado`),
  ADD KEY `idx_presup_cliente` (`cliente_id`),
  ADD KEY `idx_presup_vehiculo` (`vehiculo_id`),
  ADD KEY `idx_presupuesto_ot_id` (`ot_id`);

ALTER TABLE `presupuesto_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_presupuesto` (`presupuesto_id`),
  ADD KEY `idx_item` (`item_id`,`tipo`);

ALTER TABLE `proveedores`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `rut` (`rut`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_rut` (`rut`);

ALTER TABLE `proveedor_articulos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_proveedor_articulo` (`proveedor_id`,`articulo_id`),
  ADD KEY `idx_pa_proveedor` (`proveedor_id`),
  ADD KEY `idx_pa_articulo` (`articulo_id`);

ALTER TABLE `recepcion_ingreso`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_recepcion_ingreso_vehiculo` (`vehiculo_id`),
  ADD KEY `fk_recepcion_ingreso_cliente` (`cliente_id`);

ALTER TABLE `recepcion_unificada`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_reunif_patente` (`vehiculo_patente`),
  ADD KEY `idx_reunif_fecha` (`fecha`),
  ADD KEY `idx_reunif_folio` (`folio`),
  ADD KEY `idx_reunif_orden` (`numero_orden_interna`),
  ADD KEY `idx_reunif_cliente_id` (`cliente_id`),
  ADD KEY `idx_reunif_vehiculo_id` (`vehiculo_id`);

ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_roles_nombre` (`nombre`),
  ADD KEY `idx_roles_nivel` (`nivel`);

ALTER TABLE `role_permisos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_role_permiso` (`rol_id`,`permiso_id`),
  ADD KEY `idx_rp_rol` (`rol_id`),
  ADD KEY `idx_rp_permiso` (`permiso_id`);

ALTER TABLE `solicitudes_compra`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sol_diag` (`diagnostico_id`),
  ADD KEY `idx_sol_ot` (`ot_id`),
  ADD KEY `idx_sol_estado` (`estado`);

ALTER TABLE `solicitudes_registro`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sr_estado` (`estado`),
  ADD KEY `idx_sr_creado` (`creado`),
  ADD KEY `idx_sr_email` (`email`);

ALTER TABLE `solicitudes_visita`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sol_estado` (`estado`),
  ADD KEY `idx_sol_fecha` (`fecha_solicitada`),
  ADD KEY `fk_sol_slot` (`slot_id`);

ALTER TABLE `tareas_diarias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_td_estado` (`estado`),
  ADD KEY `idx_td_prioridad` (`prioridad`),
  ADD KEY `idx_td_fecha` (`fecha`),
  ADD KEY `idx_td_empleado` (`asignado_empleado_id`),
  ADD KEY `idx_folio` (`folio`);

ALTER TABLE `tarea_avances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_ta_empleado` (`empleado_id`),
  ADD KEY `idx_ta_tarea` (`tarea_id`);

ALTER TABLE `tarea_comentarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_tc_empleado` (`empleado_id`),
  ADD KEY `idx_tc_tarea` (`tarea_id`);

ALTER TABLE `trabajos_servicios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_tipo` (`tipo`);

ALTER TABLE `trabajos_servicios_checklist_ejecucion`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_ejec_ot_item` (`ot_id`,`item_id`),
  ADD KEY `idx_ejec_ot` (`ot_id`),
  ADD KEY `idx_ejec_item` (`item_id`);

ALTER TABLE `trabajos_servicios_checklist_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_checklist_servicio` (`servicio_id`);

ALTER TABLE `user_activity`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ua_usuario` (`usuario_id`),
  ADD KEY `idx_ua_entidad` (`entidad`,`entidad_id`),
  ADD KEY `idx_ua_fecha` (`fecha`);

ALTER TABLE `user_sesiones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sesion_id` (`sesion_id`),
  ADD KEY `idx_ses_usuario` (`usuario_id`),
  ADD KEY `idx_ses_expira` (`expira`);

ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_username` (`username`),
  ADD KEY `idx_usuarios_tipo` (`tipo`),
  ADD KEY `idx_usuarios_empleado` (`empleado_id`),
  ADD KEY `idx_usuarios_cliente` (`cliente_id`),
  ADD KEY `idx_usuarios_activo` (`activo`);

ALTER TABLE `usuario_permisos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_usuario_permiso` (`usuario_id`,`permiso`),
  ADD KEY `idx_usuario` (`usuario_id`);

ALTER TABLE `usuario_roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuario_rol` (`usuario_id`,`rol_id`),
  ADD KEY `idx_ur_usuario` (`usuario_id`),
  ADD KEY `idx_ur_rol` (`rol_id`);

ALTER TABLE `vehiculos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `patente` (`patente`),
  ADD KEY `idx_cliente` (`cliente_id`),
  ADD KEY `idx_patente` (`patente`);

ALTER TABLE `vehiculo_notas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_vn_vehiculo` (`vehiculo_id`);

ALTER TABLE `ventas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ventas_fecha` (`fecha`),
  ADD KEY `idx_ventas_estado_pago` (`estado_pago`),
  ADD KEY `idx_ventas_cliente` (`cliente_id`),
  ADD KEY `idx_ventas_ot_id` (`orden_trabajo_id`),
  ADD KEY `idx_ventas_presupuesto_id` (`presupuesto_id`),
  ADD KEY `idx_ventas_cuenta_id` (`cuenta_bancaria_id`);

ALTER TABLE `visitas_taller`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_visita_estado` (`estado`),
  ADD KEY `idx_visita_slot` (`slot_id`),
  ADD KEY `fk_visita_solicitud` (`solicitud_id`),
  ADD KEY `fk_visita_cliente` (`cliente_id`),
  ADD KEY `fk_visita_vehiculo` (`vehiculo_id`);

ALTER TABLE `zonas_taller`
  ADD PRIMARY KEY (`id`);

-- =============================================================
-- AUTO_INCREMENT values
-- =============================================================
ALTER TABLE `agenda_bloques`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

ALTER TABLE `agenda_slots`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=793;

ALTER TABLE `apoyo_tecnico`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `archivos_multimedia`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=104;

ALTER TABLE `articulos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

ALTER TABLE `articulo_proveedor`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `cctv_camaras`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

ALTER TABLE `cctv_dispositivos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

ALTER TABLE `checkin`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `checklist_ejecucion`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;

ALTER TABLE `checklist_ejecucion_pasos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=100;

ALTER TABLE `checklist_paso_fotos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

ALTER TABLE `checklist_paso_notas_voz`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `checklist_paso_videos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

ALTER TABLE `checklist_plantilla`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

ALTER TABLE `checklist_plantilla_pasos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=66;

ALTER TABLE `cierre_diario`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `clientes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

ALTER TABLE `compras`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `compras_rapidas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `config_sistema`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=92;

ALTER TABLE `correo_adjuntos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `correo_cuentas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `correo_enviados`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `correo_mensajes`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=57;

ALTER TABLE `cuentas_bancarias`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `desarme_compatibilidad`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;

ALTER TABLE `desarme_descontaminacion`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

ALTER TABLE `desarme_historial`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

ALTER TABLE `desarme_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `desarme_kits`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `desarme_kit_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `desarme_maestro_piezas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=248;

ALTER TABLE `desarme_preparacion`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `desarme_vehiculo`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `desarme_valorizacion_config`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `diagnosticos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

ALTER TABLE `diagnostico_insumos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `diagnostico_procedimientos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `diagnostico_procedimientos_fotos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `diagnostico_procedimientos_notas_voz`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `diagnostico_pruebas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

ALTER TABLE `diagnostico_pruebas_fotos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `diagnostico_pruebas_notas_voz`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `diagnostico_repuestos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `diagnostico_servicios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `empleados`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

ALTER TABLE `historial_cambios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=614;

ALTER TABLE `inspeccion_visual`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `insumos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `inventario_taller`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

ALTER TABLE `movimientos_caja`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

ALTER TABLE `movimientos_stock`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

ALTER TABLE `opciones_listas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=210;

ALTER TABLE `orden_compra`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

ALTER TABLE `orden_compra_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

ALTER TABLE `orden_trabajo`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

ALTER TABLE `orden_trabajo_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=96;

ALTER TABLE `ot_avances`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `ot_comentarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `ot_documentos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `ot_etapas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `ot_interacciones_cliente`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `ot_repuestos_solicitados`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

ALTER TABLE `pagos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

ALTER TABLE `pagos_plazos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `permisos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=194;

ALTER TABLE `portal_config`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=39;

ALTER TABLE `portal_ot_permisos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `presupuesto`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

ALTER TABLE `presupuesto_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=171;

ALTER TABLE `proveedores`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `proveedor_articulos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `recepcion_ingreso`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `recepcion_unificada`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

ALTER TABLE `roles`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

ALTER TABLE `role_permisos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2391;

ALTER TABLE `solicitudes_compra`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `solicitudes_registro`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `solicitudes_visita`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

ALTER TABLE `tareas_diarias`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

ALTER TABLE `tarea_avances`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

ALTER TABLE `tarea_comentarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `trabajos_servicios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

ALTER TABLE `trabajos_servicios_checklist_ejecucion`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `trabajos_servicios_checklist_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `user_activity`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=221;

ALTER TABLE `user_sesiones`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `usuarios`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `usuario_permisos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2371;

ALTER TABLE `usuario_roles`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

ALTER TABLE `vehiculos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

ALTER TABLE `vehiculo_notas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `ventas`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `visitas_taller`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `zonas_taller`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

-- =============================================================
-- Foreign Key Constraints
-- =============================================================
ALTER TABLE `agenda_slots`
  ADD CONSTRAINT `fk_slot_visita` FOREIGN KEY (`visita_id`) REFERENCES `visitas_taller` (`id`) ON DELETE SET NULL;

ALTER TABLE `articulos`
  ADD CONSTRAINT `fk_articulos_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE SET NULL;

ALTER TABLE `articulo_proveedor`
  ADD CONSTRAINT `fk_ap_articulo` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ap_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE CASCADE;

ALTER TABLE `cctv_camaras`
  ADD CONSTRAINT `fk_cc_disp` FOREIGN KEY (`dispositivo_id`) REFERENCES `cctv_dispositivos` (`id`) ON DELETE CASCADE;

ALTER TABLE `checkin`
  ADD CONSTRAINT `fk_checkin_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_checkin_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL;

ALTER TABLE `checklist_ejecucion`
  ADD CONSTRAINT `checklist_ejecucion_ibfk_2` FOREIGN KEY (`checklist_plantilla_id`) REFERENCES `checklist_plantilla` (`id`) ON DELETE SET NULL;

ALTER TABLE `checklist_ejecucion_pasos`
  ADD CONSTRAINT `checklist_ejecucion_pasos_ibfk_1` FOREIGN KEY (`ejecucion_id`) REFERENCES `checklist_ejecucion` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `checklist_ejecucion_pasos_ibfk_2` FOREIGN KEY (`plantilla_paso_id`) REFERENCES `checklist_plantilla_pasos` (`id`) ON DELETE SET NULL;

ALTER TABLE `checklist_paso_fotos`
  ADD CONSTRAINT `checklist_paso_fotos_ibfk_1` FOREIGN KEY (`paso_id`) REFERENCES `checklist_ejecucion_pasos` (`id`) ON DELETE CASCADE;

ALTER TABLE `checklist_paso_notas_voz`
  ADD CONSTRAINT `checklist_paso_notas_voz_ibfk_1` FOREIGN KEY (`paso_id`) REFERENCES `checklist_ejecucion_pasos` (`id`) ON DELETE CASCADE;

ALTER TABLE `checklist_paso_videos`
  ADD CONSTRAINT `checklist_paso_videos_ibfk_1` FOREIGN KEY (`paso_id`) REFERENCES `checklist_ejecucion_pasos` (`id`) ON DELETE CASCADE;

ALTER TABLE `checklist_plantilla`
  ADD CONSTRAINT `checklist_plantilla_ibfk_1` FOREIGN KEY (`servicio_id`) REFERENCES `trabajos_servicios` (`id`) ON DELETE CASCADE;

ALTER TABLE `checklist_plantilla_pasos`
  ADD CONSTRAINT `checklist_plantilla_pasos_ibfk_1` FOREIGN KEY (`checklist_id`) REFERENCES `checklist_plantilla` (`id`) ON DELETE CASCADE;

ALTER TABLE `cierre_diario`
  ADD CONSTRAINT `fk_cierre_empleado` FOREIGN KEY (`cerrado_por`) REFERENCES `empleados` (`id`) ON DELETE SET NULL;

ALTER TABLE `compras`
  ADD CONSTRAINT `fk_compras_cuenta` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_compras_ot` FOREIGN KEY (`orden_trabajo_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_compras_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE SET NULL;

ALTER TABLE `compras_rapidas`
  ADD CONSTRAINT `fk_cr_cuenta` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_cr_empleado` FOREIGN KEY (`empleado_responsable_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL;

ALTER TABLE `correo_adjuntos`
  ADD CONSTRAINT `correo_adjuntos_ibfk_1` FOREIGN KEY (`mensaje_id`) REFERENCES `correo_mensajes` (`id`) ON DELETE CASCADE;

ALTER TABLE `correo_enviados`
  ADD CONSTRAINT `correo_enviados_ibfk_1` FOREIGN KEY (`cuenta_id`) REFERENCES `correo_cuentas` (`id`) ON DELETE CASCADE;

ALTER TABLE `correo_mensajes`
  ADD CONSTRAINT `correo_mensajes_ibfk_1` FOREIGN KEY (`cuenta_id`) REFERENCES `correo_cuentas` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_compatibilidad`
  ADD CONSTRAINT `desarme_compatibilidad_ibfk_1` FOREIGN KEY (`maestro_pieza_id`) REFERENCES `desarme_maestro_piezas` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_descontaminacion`
  ADD CONSTRAINT `desarme_descontaminacion_ibfk_1` FOREIGN KEY (`desarme_id`) REFERENCES `desarme_vehiculo` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_historial`
  ADD CONSTRAINT `desarme_historial_ibfk_1` FOREIGN KEY (`desarme_id`) REFERENCES `desarme_vehiculo` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_items`
  ADD CONSTRAINT `desarme_items_ibfk_1` FOREIGN KEY (`desarme_id`) REFERENCES `desarme_vehiculo` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `desarme_items_ibfk_2` FOREIGN KEY (`maestro_pieza_id`) REFERENCES `desarme_maestro_piezas` (`id`) ON DELETE SET NULL;

ALTER TABLE `desarme_kits`
  ADD CONSTRAINT `desarme_kits_ibfk_1` FOREIGN KEY (`desarme_id`) REFERENCES `desarme_vehiculo` (`id`) ON DELETE SET NULL;

ALTER TABLE `desarme_kit_items`
  ADD CONSTRAINT `desarme_kit_items_ibfk_1` FOREIGN KEY (`kit_id`) REFERENCES `desarme_kits` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `desarme_kit_items_ibfk_2` FOREIGN KEY (`desarme_item_id`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_preparacion`
  ADD CONSTRAINT `desarme_preparacion_ibfk_1` FOREIGN KEY (`desarme_item_id`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE;

ALTER TABLE `desarme_vehiculo`
  ADD CONSTRAINT `desarme_vehiculo_ibfk_1` FOREIGN KEY (`recepcion_id`) REFERENCES `recepcion_unificada` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `desarme_vehiculo_ibfk_2` FOREIGN KEY (`orden_trabajo_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `desarme_vehiculo_ibfk_3` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `desarme_vehiculo_ibfk_4` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL;

ALTER TABLE `diagnosticos`
  ADD CONSTRAINT `fk_diag_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE SET NULL;

ALTER TABLE `diagnostico_insumos`
  ADD CONSTRAINT `diagnostico_insumos_ibfk_1` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_procedimientos`
  ADD CONSTRAINT `diagnostico_procedimientos_ibfk_1` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_procedimientos_fotos`
  ADD CONSTRAINT `diagnostico_procedimientos_fotos_ibfk_1` FOREIGN KEY (`procedimiento_id`) REFERENCES `diagnostico_procedimientos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_procedimientos_notas_voz`
  ADD CONSTRAINT `diagnostico_procedimientos_notas_voz_ibfk_1` FOREIGN KEY (`procedimiento_id`) REFERENCES `diagnostico_procedimientos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_pruebas`
  ADD CONSTRAINT `diagnostico_pruebas_ibfk_1` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_pruebas_fotos`
  ADD CONSTRAINT `diagnostico_pruebas_fotos_ibfk_1` FOREIGN KEY (`prueba_id`) REFERENCES `diagnostico_pruebas` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_pruebas_notas_voz`
  ADD CONSTRAINT `diagnostico_pruebas_notas_voz_ibfk_1` FOREIGN KEY (`prueba_id`) REFERENCES `diagnostico_pruebas` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_repuestos`
  ADD CONSTRAINT `diagnostico_repuestos_ibfk_1` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE CASCADE;

ALTER TABLE `diagnostico_servicios`
  ADD CONSTRAINT `diagnostico_servicios_ibfk_1` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE CASCADE;

ALTER TABLE `inspeccion_visual`
  ADD CONSTRAINT `fk_inspeccion_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE CASCADE;

ALTER TABLE `insumos`
  ADD CONSTRAINT `fk_insumos_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE SET NULL;

ALTER TABLE `movimientos_caja`
  ADD CONSTRAINT `fk_movimientos_caja_cuenta` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE CASCADE;

ALTER TABLE `orden_compra`
  ADD CONSTRAINT `fk_orden_compra_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE CASCADE;

ALTER TABLE `orden_compra_items`
  ADD CONSTRAINT `fk_oc_items_orden_compra` FOREIGN KEY (`orden_compra_id`) REFERENCES `orden_compra` (`id`) ON DELETE CASCADE;

ALTER TABLE `orden_trabajo`
  ADD CONSTRAINT `fk_ot_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_diagnostico` FOREIGN KEY (`diagnostico_id`) REFERENCES `diagnosticos` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_empleado` FOREIGN KEY (`asignado_empleado_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_inspeccion` FOREIGN KEY (`inspeccion_id`) REFERENCES `inspeccion_visual` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuesto` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_recepcion_unif` FOREIGN KEY (`recepcion_id`) REFERENCES `recepcion_unificada` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL;

ALTER TABLE `orden_trabajo_items`
  ADD CONSTRAINT `fk_ot_items_orden_trabajo` FOREIGN KEY (`orden_trabajo_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_avances`
  ADD CONSTRAINT `fk_ot_avances_empleado` FOREIGN KEY (`autor_empleado_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_avances_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_comentarios`
  ADD CONSTRAINT `fk_oc_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_documentos`
  ADD CONSTRAINT `fk_ot_doc_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_etapas`
  ADD CONSTRAINT `fk_etapa_ot` FOREIGN KEY (`orden_trabajo_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_interacciones_cliente`
  ADD CONSTRAINT `fk_oic_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `ot_repuestos_solicitados`
  ADD CONSTRAINT `fk_ot_rep_articulo` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_rep_empleado` FOREIGN KEY (`solicitado_por`) REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_rep_insumo` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ot_rep_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `pagos`
  ADD CONSTRAINT `fk_pagos_cuenta` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE SET NULL;

ALTER TABLE `pagos_plazos`
  ADD CONSTRAINT `pagos_plazos_ibfk_1` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE SET NULL;

ALTER TABLE `portal_ot_permisos`
  ADD CONSTRAINT `fk_pop_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE;

ALTER TABLE `presupuesto`
  ADD CONSTRAINT `fk_ppto_ot` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_presupuesto_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_presupuesto_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL;

ALTER TABLE `presupuesto_items`
  ADD CONSTRAINT `fk_presupuesto_items_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuesto` (`id`) ON DELETE CASCADE;

ALTER TABLE `proveedor_articulos`
  ADD CONSTRAINT `proveedor_articulos_ibfk_1` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `proveedor_articulos_ibfk_2` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`) ON DELETE CASCADE;

ALTER TABLE `recepcion_ingreso`
  ADD CONSTRAINT `fk_recepcion_ingreso_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_recepcion_ingreso_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL;

ALTER TABLE `recepcion_unificada`
  ADD CONSTRAINT `fk_recep_unif_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_recep_unif_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL;

ALTER TABLE `role_permisos`
  ADD CONSTRAINT `fk_rp_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rp_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

ALTER TABLE `solicitudes_visita`
  ADD CONSTRAINT `fk_sol_slot` FOREIGN KEY (`slot_id`) REFERENCES `agenda_slots` (`id`) ON DELETE SET NULL;

ALTER TABLE `tareas_diarias`
  ADD CONSTRAINT `fk_tareas_empleado` FOREIGN KEY (`asignado_empleado_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL;

ALTER TABLE `tarea_avances`
  ADD CONSTRAINT `fk_ta_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ta_tarea` FOREIGN KEY (`tarea_id`) REFERENCES `tareas_diarias` (`id`) ON DELETE CASCADE;

ALTER TABLE `tarea_comentarios`
  ADD CONSTRAINT `fk_tc_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_tc_tarea` FOREIGN KEY (`tarea_id`) REFERENCES `tareas_diarias` (`id`) ON DELETE CASCADE;

ALTER TABLE `trabajos_servicios_checklist_ejecucion`
  ADD CONSTRAINT `trabajos_servicios_checklist_ejecucion_ibfk_1` FOREIGN KEY (`ot_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `trabajos_servicios_checklist_ejecucion_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `trabajos_servicios_checklist_items` (`id`) ON DELETE CASCADE;

ALTER TABLE `trabajos_servicios_checklist_items`
  ADD CONSTRAINT `trabajos_servicios_checklist_items_ibfk_1` FOREIGN KEY (`servicio_id`) REFERENCES `trabajos_servicios` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_activity`
  ADD CONSTRAINT `fk_ua_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

ALTER TABLE `user_sesiones`
  ADD CONSTRAINT `fk_ses_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

ALTER TABLE `usuario_permisos`
  ADD CONSTRAINT `fk_up_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

ALTER TABLE `usuario_roles`
  ADD CONSTRAINT `fk_ur_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ur_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

ALTER TABLE `vehiculos`
  ADD CONSTRAINT `fk_vehiculos_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `vehiculo_notas`
  ADD CONSTRAINT `fk_vn_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE CASCADE;

ALTER TABLE `ventas`
  ADD CONSTRAINT `fk_ventas_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ventas_cuenta` FOREIGN KEY (`cuenta_bancaria_id`) REFERENCES `cuentas_bancarias` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ventas_ot` FOREIGN KEY (`orden_trabajo_id`) REFERENCES `orden_trabajo` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ventas_presupuesto` FOREIGN KEY (`presupuesto_id`) REFERENCES `presupuesto` (`id`) ON DELETE SET NULL;

ALTER TABLE `visitas_taller`
  ADD CONSTRAINT `fk_visita_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_visita_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_visita` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_visita_vehiculo` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `visitas_taller_ibfk_1` FOREIGN KEY (`slot_id`) REFERENCES `agenda_slots` (`id`) ON DELETE CASCADE;

-- =============================================================
-- desarme_items_grupo: auto_increment + keys + FKs
-- =============================================================
ALTER TABLE `desarme_items_grupo`
  MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT,
  ADD UNIQUE KEY `uk_padre_hijo` (`id_padre`, `id_hijo`),
  ADD KEY `id_padre` (`id_padre`),
  ADD KEY `id_hijo` (`id_hijo`),
  ADD CONSTRAINT `fk_dig_padre` FOREIGN KEY (`id_padre`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_dig_hijo` FOREIGN KEY (`id_hijo`) REFERENCES `desarme_items` (`id`) ON DELETE CASCADE;

-- =============================================================
-- Triggers
-- =============================================================
DELIMITER $$
CREATE TRIGGER `trg_desarme_folio` BEFORE INSERT ON `desarme_vehiculo` FOR EACH ROW BEGIN IF NEW.folio IS NULL OR NEW.folio = '' THEN SET NEW.folio = CONCAT('DES-', YEAR(COALESCE(NOW(), CURDATE())), '-', LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING(folio, 9) AS UNSIGNED)), 0) + 1 FROM desarme_vehiculo WHERE folio LIKE CONCAT('DES-', YEAR(NOW()), '-%')), 5, '0')); END IF; END
$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER `generar_folio_recepcion` BEFORE INSERT ON `recepcion_unificada` FOR EACH ROW BEGIN
    DECLARE next_num INT;
    DECLARE max_num INT;
    
    IF NEW.folio IS NULL OR NEW.folio = '' THEN
        SELECT COALESCE(
            MAX(CAST(SUBSTRING(folio, 5) AS UNSIGNED)), 
            0
        ) INTO max_num
        FROM recepcion_unificada 
        WHERE folio LIKE 'REC-%';
        
        SET next_num = max_num + 1;
        SET NEW.folio = CONCAT('REC-', LPAD(next_num, 4, '0'));
    END IF;
END
$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER `trg_solicitud_folio` BEFORE INSERT ON `solicitudes_visita` FOR EACH ROW BEGIN IF NEW.folio IS NULL OR NEW.folio = "" THEN SET NEW.folio = CONCAT("SOL-", LPAD((SELECT IFNULL(MAX(id),0)+1 FROM solicitudes_visita), 4, "0")); END IF; END
$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER `trg_visita_folio` BEFORE INSERT ON `visitas_taller` FOR EACH ROW BEGIN IF NEW.folio IS NULL OR NEW.folio = "" THEN SET NEW.folio = CONCAT("VIS-", LPAD((SELECT IFNULL(MAX(id),0)+1 FROM visitas_taller), 4, "0")); END IF; END
$$
DELIMITER ;

-- =============================================================
SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================