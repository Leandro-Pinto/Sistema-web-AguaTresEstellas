-- AlterTable
ALTER TABLE `historial_estados` MODIFY `tipo` ENUM('PEDIDO', 'VENTA', 'PAGO', 'ENTREGA', 'CLIENTE', 'PRODUCTO', 'REPARTIDOR', 'INVENTARIO', 'BIDON', 'USUARIO', 'INCIDENCIA') NOT NULL;

-- AlterTable
ALTER TABLE `movimientos_bidones` MODIFY `clienteId` INTEGER NULL;
