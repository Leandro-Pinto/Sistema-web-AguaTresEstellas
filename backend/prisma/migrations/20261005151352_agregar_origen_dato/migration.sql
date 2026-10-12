-- AlterTable
ALTER TABLE `entregas` ADD COLUMN `origen` ENUM('REAL', 'SIMULADO') NOT NULL DEFAULT 'REAL';

-- AlterTable
ALTER TABLE `historial_estados` ADD COLUMN `origen` ENUM('REAL', 'SIMULADO') NOT NULL DEFAULT 'REAL';

-- AlterTable
ALTER TABLE `pagos` ADD COLUMN `origen` ENUM('REAL', 'SIMULADO') NOT NULL DEFAULT 'REAL';

-- AlterTable
ALTER TABLE `pedidos` ADD COLUMN `origen` ENUM('REAL', 'SIMULADO') NOT NULL DEFAULT 'REAL';

-- AlterTable
ALTER TABLE `ventas` ADD COLUMN `origen` ENUM('REAL', 'SIMULADO') NOT NULL DEFAULT 'REAL';

-- CreateIndex
CREATE INDEX `entregas_origen_idx` ON `entregas`(`origen`);

-- CreateIndex
CREATE INDEX `pagos_origen_idx` ON `pagos`(`origen`);

-- CreateIndex
CREATE INDEX `pedidos_origen_idx` ON `pedidos`(`origen`);

-- CreateIndex
CREATE INDEX `ventas_origen_idx` ON `ventas`(`origen`);
