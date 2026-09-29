-- AlterTable
ALTER TABLE `incidencias_sistema` ADD COLUMN `pasosReproduccion` TEXT NULL,
    ADD COLUMN `solucion` TEXT NULL;

-- CreateIndex
CREATE INDEX `incidencias_sistema_modulo_idx` ON `incidencias_sistema`(`modulo`);
