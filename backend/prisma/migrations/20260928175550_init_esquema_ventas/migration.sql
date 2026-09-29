-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `nivel` INTEGER NOT NULL DEFAULT 3,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_nombre_key`(`nombre`),
    INDEX `roles_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombres` VARCHAR(100) NOT NULL,
    `apellidos` VARCHAR(100) NOT NULL,
    `nombreCompleto` VARCHAR(201) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `telefono` VARCHAR(20) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `rolId` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `ultimoAcceso` DATETIME(3) NULL,
    `ultimoAccesoIp` VARCHAR(45) NULL,
    `intentosFallidos` INTEGER NOT NULL DEFAULT 0,
    `bloqueadoHasta` DATETIME(3) NULL,
    `debeCambiarPassword` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `usuarios_rolId_idx`(`rolId`),
    INDEX `usuarios_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empresa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `razonSocial` VARCHAR(150) NOT NULL,
    `nombreComercial` VARCHAR(150) NOT NULL,
    `ruc` VARCHAR(20) NULL,
    `direccion` VARCHAR(200) NULL,
    `telefono` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `empresa_ruc_key`(`ruc`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('PERSONA', 'EMPRESA', 'INSTITUCION') NOT NULL DEFAULT 'PERSONA',
    `documento` VARCHAR(20) NOT NULL,
    `nombres` VARCHAR(100) NULL,
    `razonSocial` VARCHAR(150) NULL,
    `nombre` VARCHAR(200) NOT NULL,
    `telefono` VARCHAR(20) NOT NULL,
    `telefonoAlt` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `direccion` VARCHAR(200) NOT NULL,
    `referencia` VARCHAR(200) NULL,
    `distrito` VARCHAR(80) NULL,
    `limiteCredito` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `notas` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fechaRegistro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    INDEX `clientes_nombre_idx`(`nombre`),
    INDEX `clientes_telefono_idx`(`telefono`),
    INDEX `clientes_activo_idx`(`activo`),
    UNIQUE INDEX `clientes_tipo_documento_key`(`tipo`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `descripcion` TEXT NULL,
    `unidadMedida` VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
    `precioVenta` DECIMAL(10, 2) NOT NULL,
    `costoUnitario` DECIMAL(10, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `stockMinimo` INTEGER NOT NULL DEFAULT 0,
    `esRetornable` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `productos_codigo_key`(`codigo`),
    UNIQUE INDEX `productos_nombre_key`(`nombre`),
    INDEX `productos_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `repartidores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombres` VARCHAR(100) NOT NULL,
    `apellidos` VARCHAR(100) NOT NULL,
    `nombre` VARCHAR(201) NOT NULL,
    `documento` VARCHAR(20) NOT NULL,
    `telefono` VARCHAR(20) NOT NULL,
    `direccion` VARCHAR(200) NULL,
    `zona` VARCHAR(100) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fechaRegistro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `repartidores_documento_key`(`documento`),
    INDEX `repartidores_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `recibidoEn` DATETIME(3) NOT NULL,
    `registradoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmadoEn` DATETIME(3) NULL,
    `asignadoEn` DATETIME(3) NULL,
    `enRutaEn` DATETIME(3) NULL,
    `entregadoEn` DATETIME(3) NULL,
    `canceladoEn` DATETIME(3) NULL,
    `canal` ENUM('TELEFONO', 'WHATSAPP', 'MOSTRADOR', 'OTRO') NOT NULL DEFAULT 'WHATSAPP',
    `modalidadEntrega` ENUM('DOMICILIO', 'RECOJO') NOT NULL DEFAULT 'DOMICILIO',
    `direccionEntrega` VARCHAR(200) NOT NULL,
    `referenciaEntrega` VARCHAR(200) NULL,
    `fechaEntregaProgramada` DATETIME(3) NULL,
    `estado` ENUM('PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `descuento` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `observaciones` TEXT NULL,
    `incidencias` TEXT NULL,
    `requiereCorreccion` BOOLEAN NOT NULL DEFAULT false,
    `usuarioId` INTEGER NOT NULL,

    UNIQUE INDEX `pedidos_codigo_key`(`codigo`),
    INDEX `pedidos_clienteId_idx`(`clienteId`),
    INDEX `pedidos_estado_idx`(`estado`),
    INDEX `pedidos_registradoEn_idx`(`registradoEn`),
    INDEX `pedidos_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `observaciones` VARCHAR(255) NULL,

    INDEX `detalle_pedidos_pedidoId_idx`(`pedidoId`),
    INDEX `detalle_pedidos_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ventas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(20) NOT NULL,
    `pedidoId` INTEGER NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `descuento` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL,
    `totalPagado` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `saldo` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `estado` ENUM('PENDIENTE', 'COMPLETADA', 'ANULADA') NOT NULL DEFAULT 'PENDIENTE',
    `constanciaEmitida` BOOLEAN NOT NULL DEFAULT false,
    `constanciaCodigo` VARCHAR(20) NULL,
    `constanciaEmitidaEn` DATETIME(3) NULL,
    `observaciones` TEXT NULL,
    `anuladaEn` DATETIME(3) NULL,
    `motivoAnulacion` VARCHAR(255) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ventas_numero_key`(`numero`),
    UNIQUE INDEX `ventas_pedidoId_key`(`pedidoId`),
    INDEX `ventas_clienteId_idx`(`clienteId`),
    INDEX `ventas_estado_idx`(`estado`),
    INDEX `ventas_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_ventas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `costoUnitario` DECIMAL(10, 2) NULL,

    INDEX `detalle_ventas_ventaId_idx`(`ventaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `metodo` ENUM('EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO') NOT NULL DEFAULT 'EFECTIVO',
    `referencia` VARCHAR(60) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `estado` ENUM('PENDIENTE', 'REGISTRADO', 'ANULADO') NOT NULL DEFAULT 'REGISTRADO',
    `recibidoPorId` INTEGER NULL,
    `observaciones` TEXT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `anuladoEn` DATETIME(3) NULL,
    `motivoAnulacion` VARCHAR(255) NULL,

    INDEX `pagos_ventaId_idx`(`ventaId`),
    INDEX `pagos_metodo_idx`(`metodo`),
    INDEX `pagos_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entregas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `repartidorId` INTEGER NOT NULL,
    `fechaAsignacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `horaSalida` DATETIME(3) NULL,
    `horaEntrega` DATETIME(3) NULL,
    `minutosDemora` INTEGER NULL,
    `estado` ENUM('PENDIENTE', 'ASIGNADA', 'EN_RUTA', 'ENTREGADA', 'NO_ENTREGADO', 'CANCELADA') NOT NULL DEFAULT 'ASIGNADA',
    `asignadoPorId` INTEGER NULL,
    `bidonesEntregados` INTEGER NOT NULL DEFAULT 0,
    `bidonesDevueltos` INTEGER NOT NULL DEFAULT 0,
    `montoRecibido` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `observaciones` TEXT NULL,
    `motivoNoEntrega` VARCHAR(200) NULL,
    `recibeFirma` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `entregas_pedidoId_key`(`pedidoId`),
    INDEX `entregas_repartidorId_idx`(`repartidorId`),
    INDEX `entregas_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_bidones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `pedidoId` INTEGER NULL,
    `entregaId` INTEGER NULL,
    `repartidorId` INTEGER NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` ENUM('ENTREGA', 'DEVOLUCION', 'PERDIDA', 'AJUSTE') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `saldoAnterior` INTEGER NOT NULL DEFAULT 0,
    `saldoResultante` INTEGER NOT NULL DEFAULT 0,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observaciones` VARCHAR(255) NULL,

    INDEX `movimientos_bidones_clienteId_idx`(`clienteId`),
    INDEX `movimientos_bidones_pedidoId_idx`(`pedidoId`),
    INDEX `movimientos_bidones_tipo_idx`(`tipo`),
    INDEX `movimientos_bidones_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productoId` INTEGER NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `tipo` ENUM('ENTRADA', 'SALIDA', 'AJUSTE') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `stockAnterior` INTEGER NOT NULL,
    `stockResultante` INTEGER NOT NULL,
    `pedidoId` INTEGER NULL,
    `ventaId` INTEGER NULL,
    `movimientoBidonId` INTEGER NULL,
    `origen` VARCHAR(40) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observaciones` VARCHAR(255) NULL,

    INDEX `movimientos_inventario_productoId_idx`(`productoId`),
    INDEX `movimientos_inventario_tipo_idx`(`tipo`),
    INDEX `movimientos_inventario_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historial_estados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('PEDIDO', 'VENTA', 'PAGO', 'ENTREGA', 'CLIENTE', 'PRODUCTO', 'REPARTIDOR', 'INVENTARIO', 'BIDON', 'USUARIO') NOT NULL,
    `entidadId` INTEGER NOT NULL,
    `codigo` VARCHAR(20) NULL,
    `estadoAnterior` VARCHAR(30) NULL,
    `estadoNuevo` VARCHAR(30) NULL,
    `accion` ENUM('CREADO', 'ACTUALIZADO', 'ELIMINADO', 'RESTAURADO', 'CAMBIO_ESTADO', 'ASIGNACION', 'SALIDA_RUTA', 'ENTREGA', 'CANCELACION', 'PAGO_REGISTRADO', 'INVENTARIO_MOVIMIENTO', 'BIDON_MOVIMIENTO', 'INICIO_SESION', 'CIERRE_SESION') NOT NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `observaciones` TEXT NULL,
    `incidencia` VARCHAR(200) NULL,
    `usuarioId` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pedidoId` INTEGER NULL,
    `ventaId` INTEGER NULL,
    `pagoId` INTEGER NULL,

    INDEX `historial_estados_tipo_entidadId_idx`(`tipo`, `entidadId`),
    INDEX `historial_estados_codigo_idx`(`codigo`),
    INDEX `historial_estados_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bitacora_http` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `metodo` VARCHAR(10) NOT NULL,
    `ruta` VARCHAR(200) NOT NULL,
    `status` INTEGER NOT NULL,
    `duracionMs` INTEGER NOT NULL,
    `esErrorServidor` BOOLEAN NOT NULL DEFAULT false,
    `registros` INTEGER NULL,
    `usuarioId` INTEGER NULL,
    `ip` VARCHAR(45) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bitacora_http_fecha_idx`(`fecha`),
    INDEX `bitacora_http_ruta_idx`(`ruta`),
    INDEX `bitacora_http_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incidencias_sistema` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `titulo` VARCHAR(200) NOT NULL,
    `descripcion` TEXT NULL,
    `modulo` VARCHAR(60) NULL,
    `severidad` INTEGER NOT NULL DEFAULT 3,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    `inicio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fin` DATETIME(3) NULL,
    `duracionMinutos` INTEGER NULL,
    `reportadoPorId` INTEGER NULL,
    `resueltoPorId` INTEGER NULL,

    UNIQUE INDEX `incidencias_sistema_codigo_key`(`codigo`),
    INDEX `incidencias_sistema_estado_idx`(`estado`),
    INDEX `incidencias_sistema_inicio_idx`(`inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `log_consultas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipoConsulta` VARCHAR(60) NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `duracionMs` INTEGER NOT NULL,
    `registros` INTEGER NOT NULL DEFAULT 0,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usuarioId` INTEGER NULL,

    INDEX `log_consultas_tipoConsulta_idx`(`tipoConsulta`),
    INDEX `log_consultas_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requisitos_funcionales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `modulo` VARCHAR(50) NOT NULL,
    `problema` VARCHAR(200) NULL,
    `dimension` ENUM('ADECUACION_FUNCIONAL', 'EFICIENCIA_DESEMPENO', 'FIABILIDAD', 'RECEPCION_REGISTRO_PEDIDOS', 'PROCESAMIENTO_CONTROL_VENTAS', 'ATENCION_SEGUIMIENTO_PEDIDOS') NOT NULL DEFAULT 'ADECUACION_FUNCIONAL',
    `aprobado` BOOLEAN NOT NULL DEFAULT true,
    `implementado` BOOLEAN NOT NULL DEFAULT false,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `requisitos_funcionales_codigo_key`(`codigo`),
    INDEX `requisitos_funcionales_modulo_idx`(`modulo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `casos_prueba` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `requisitoId` INTEGER NOT NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `pasos` TEXT NULL,
    `resultadoEsperado` VARCHAR(300) NOT NULL,
    `critico` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    `fechaEjecucion` DATETIME(3) NULL,
    `duracionMs` INTEGER NULL,
    `mensajeError` TEXT NULL,
    `vecesEjecutado` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `casos_prueba_codigo_key`(`codigo`),
    INDEX `casos_prueba_requisitoId_idx`(`requisitoId`),
    INDEX `casos_prueba_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_rolId_fkey` FOREIGN KEY (`rolId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos` ADD CONSTRAINT `detalle_pedidos_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_pedidos` ADD CONSTRAINT `detalle_pedidos_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ventas` ADD CONSTRAINT `ventas_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_ventas` ADD CONSTRAINT `detalle_ventas_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `ventas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_ventas` ADD CONSTRAINT `detalle_ventas_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_recibidoPorId_fkey` FOREIGN KEY (`recibidoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos` ADD CONSTRAINT `pagos_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `ventas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_asignadoPorId_fkey` FOREIGN KEY (`asignadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_repartidorId_fkey` FOREIGN KEY (`repartidorId`) REFERENCES `repartidores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_entregaId_fkey` FOREIGN KEY (`entregaId`) REFERENCES `entregas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_repartidorId_fkey` FOREIGN KEY (`repartidorId`) REFERENCES `repartidores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_bidones` ADD CONSTRAINT `movimientos_bidones_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `ventas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados` ADD CONSTRAINT `historial_estados_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados` ADD CONSTRAINT `historial_estados_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados` ADD CONSTRAINT `historial_estados_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `ventas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_estados` ADD CONSTRAINT `historial_estados_pagoId_fkey` FOREIGN KEY (`pagoId`) REFERENCES `pagos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidencias_sistema` ADD CONSTRAINT `incidencias_sistema_reportadoPorId_fkey` FOREIGN KEY (`reportadoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidencias_sistema` ADD CONSTRAINT `incidencias_sistema_resueltoPorId_fkey` FOREIGN KEY (`resueltoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `log_consultas` ADD CONSTRAINT `log_consultas_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `casos_prueba` ADD CONSTRAINT `casos_prueba_requisitoId_fkey` FOREIGN KEY (`requisitoId`) REFERENCES `requisitos_funcionales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
