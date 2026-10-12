-- CreateTable
CREATE TABLE `linea_base_pretest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tiempoRegistroMin` DOUBLE NULL,
    `tiempoProcesamientoVentaMin` DOUBLE NULL,
    `tiempoConfirmacionAsignacionMin` DOUBLE NULL,
    `porcentajePedidosCorrectos` DOUBLE NULL,
    `porcentajeVentasCorrectas` DOUBLE NULL,
    `porcentajeVentasConErrores` DOUBLE NULL,
    `porcentajePedidosAtendidos` DOUBLE NULL,
    `porcentajePedidosConErrores` DOUBLE NULL,
    `porcentajeTrazabilidadCompleta` DOUBLE NULL,
    `creadoPor` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoPor` INTEGER NOT NULL,
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `linea_base_pretest_creadoEn_idx`(`creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `linea_base_pretest` ADD CONSTRAINT `linea_base_pretest_creadoPor_fkey` FOREIGN KEY (`creadoPor`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `linea_base_pretest` ADD CONSTRAINT `linea_base_pretest_actualizadoPor_fkey` FOREIGN KEY (`actualizadoPor`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
