-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `documento` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `correlativos` (
    `anio` INTEGER NOT NULL,
    `pedidoContador` INTEGER NOT NULL DEFAULT 0,
    `ventaContador` INTEGER NOT NULL DEFAULT 0,
    `entregaContador` INTEGER NOT NULL DEFAULT 0,
    `incidenciaContador` INTEGER NOT NULL DEFAULT 0,
    `constanciaContador` INTEGER NOT NULL DEFAULT 0,
    `actualizadoEn` DATETIME(3) NOT NULL,

    PRIMARY KEY (`anio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_documento_fkey` FOREIGN KEY (`documento`) REFERENCES `repartidores`(`documento`) ON DELETE SET NULL ON UPDATE NO ACTION;
