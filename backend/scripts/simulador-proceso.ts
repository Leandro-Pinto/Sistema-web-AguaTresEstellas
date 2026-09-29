/**
 * ============================================================================
 *  SIMULADOR DEL PROCESO DE VENTAS
 * ============================================================================
 *
 *  Genera un histórico de operación realista para poder calcular los
 *  indicadores del POSTEST (variable dependiente: proceso de ventas).
 *
 *  PRINCIPIOS DE DISEÑO
 *
 *  1. Se usan los servicios reales, nunca escrituras directas. Así el
 *     histórico cumple exactamente las mismas reglas de negocio que la
 *     aplicación en producción: no se puede vender sin stock, no se puede
 *     cerrar una entrega sin salir a ruta, no se puede pagar más que el
 *     saldo. Los indicadores miden el proceso tal como el sistema lo
 *     impone, no un dataset fabricado a mano.
 *
 *  2. El resultado es reproducible. Con la misma semilla, los mismos
 *     argumentos y el mismo catálogo, la corrida es idéntica. Esto importa
 *     en una tesis: las cifras del postest deben poder reproducirse y
 *     auditarse.
 *
 *  3. Solo se "retroceden" las marcas de tiempo. Los servicios escriben
 *     `new Date()`, o sea el momento real de la ejecución. Como el postest
 *     necesita un periodo histórico, después de cada paso se ajustan las
 *     columnas de fecha al instante simulado. No se altera ningún saldo,
 *     cantidad ni estado: esa coherencia la siguen garantizando los
 *     servicios.
 *
 *  USO
 *
 *    npm run simular -- --dias=30 --pedidosPorDia=60
 *    npm run simular -- --dias=7 --fechaInicio=2026-09-01 --semilla=2026
 *    npm run simular -- --limpiar
 *    npm run simular -- --ayuda
 *
 *  ADVERTENCIA
 *
 *    `--limpiar` borra los datos operativos. Ejecutar siempre sobre la base
 *    de pruebas, nunca sobre una base con información real.
 * ============================================================================
 */

import { prisma } from '../src/config/prisma';
import * as pedidosService from '../src/services/pedidos.service';
import * as ventasService from '../src/services/ventas.service';
import * as pagosService from '../src/services/pagos.service';
import * as entregasService from '../src/services/entregas.service';
import * as inventarioService from '../src/services/inventario.service';
import * as indicadoresService from '../src/services/indicadores.service';

// ============================================================================
//  Configuración
// ============================================================================

interface Opciones {
  dias: number;
  pedidosPorDia: number;
  fechaInicio?: Date;
  fechaFin?: Date;
  semilla: number;
  limpiar: boolean;
  ayuda: boolean;
  mostrarIndicadores: boolean;
}

const POR_DEFECTO = {
  dias: 30,
  pedidosPorDia: 60,
  semilla: 20260928,
  /** Ventana horaria de atención en la que se reciben pedidos. */
  horaApertura: 8,
  horaCierre: 18,
} as const;

/** Stock al que se repone el inventario al inicio de cada jornada. */
const STOCK_OBJETIVO = 900;
/** Por debajo de este stock se reabastece antes de empezar el día. */
const STOCK_MINIMO = 400;

/** Valores admitidos en `unidadMedida` que representan un envase retornable. */
const UNIDAD_BIDON = 'BIDON';

const leerOpciones = (argv: string[]): Opciones => {
  const opciones: Opciones = {
    dias: POR_DEFECTO.dias,
    pedidosPorDia: POR_DEFECTO.pedidosPorDia,
    semilla: POR_DEFECTO.semilla,
    limpiar: false,
    ayuda: false,
    mostrarIndicadores: true,
  };

  for (const argumento of argv) {
    const [clave, valor] = argumento.replace(/^--/, '').split('=');

    switch (clave) {
      case 'dias':
        opciones.dias = Number(valor);
        break;
      case 'pedidosPorDia':
      case 'pedidos-dia':
        opciones.pedidosPorDia = Number(valor);
        break;
      case 'fechaInicio':
        opciones.fechaInicio = valor ? new Date(valor) : undefined;
        break;
      case 'fechaFin':
        opciones.fechaFin = valor ? new Date(valor) : undefined;
        break;
      case 'semilla':
        opciones.semilla = Number(valor);
        break;
      case 'limpiar':
        opciones.limpiar = true;
        break;
      case 'sinIndicadores':
        opciones.mostrarIndicadores = false;
        break;
      case 'ayuda':
      case 'help':
      case 'h':
        opciones.ayuda = true;
        break;
      default:
        throw new Error(`Opción desconocida: --${clave}`);
    }
  }

  if (!Number.isFinite(opciones.dias) || opciones.dias <= 0) {
    throw new Error('--dias debe ser un número entero positivo');
  }
  if (!Number.isFinite(opciones.pedidosPorDia) || opciones.pedidosPorDia < 0) {
    throw new Error('--pedidosPorDia debe ser un número entero no negativo');
  }
  if (!Number.isFinite(opciones.semilla)) {
    throw new Error('--semilla debe ser un número');
  }
  if (opciones.fechaInicio && Number.isNaN(opciones.fechaInicio.getTime())) {
    throw new Error('--fechaInicio no es una fecha válida (use AAAA-MM-DD)');
  }
  if (opciones.fechaFin && Number.isNaN(opciones.fechaFin.getTime())) {
    throw new Error('--fechaFin no es una fecha válida (use AAAA-MM-DD)');
  }

  return opciones;
};

const mostrarAyuda = (): void => {
  process.stdout.write(`
Simulador del proceso de ventas - Agua Tres Estrellas Pura

  Genera un histórico de pedidos, ventas, pagos y entregas usando los
  servicios reales del sistema, y devuelve los indicadores del postest.

Opciones
  --dias=N                  Días a simular hacia atrás desde hoy       (${POR_DEFECTO.dias})
  --pedidosPorDia=N         Pedidos promedio por jornada              (${POR_DEFECTO.pedidosPorDia})
  --fechaInicio=AAAA-MM-DD  Primer día del periodo
  --fechaFin=AAAA-MM-DD     Último día del periodo
  --semilla=N               Semilla del azar; misma semilla, mismos datos (${POR_DEFECTO.semilla})
  --limpiar                 Borra los datos operativos antes de simular
  --sinIndicadores          No imprime el resumen de indicadores al final
  --ayuda                   Muestra este mensaje

Ejemplos
  npm run simular -- --dias=30 --pedidosPorDia=60
  npm run simular -- --dias=7 --pedidosPorDia=20 --semilla=42
  npm run simular -- --fechaInicio=2026-09-01 --fechaFin=2026-09-30
`);
};

// ============================================================================
//  Azar reproducible
// ============================================================================

/**
 * Generador congruencial mulberry32.
 *
 * Se usa en lugar de `Math.random()` porque `Math.random()` no es
 * reproducible: dos corridas con la misma semilla darían datos distintos y la
 * evidencia del postest no podría repetirse ni auditarse.
 */
const crearAzar = (semilla: number) => {
  let estado = semilla >>> 0;

  const siguiente = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** Entero en [minimo, maximo], ambos incluidos. */
    entero: (minimo: number, maximo: number): number =>
      minimo + Math.floor(siguiente() * (maximo - minimo + 1)),

    /** Evalúa una probabilidad entre 0 y 1. */
    chance: (probabilidad: number): boolean => siguiente() < probabilidad,

    elegir: <T>(valores: readonly T[]): T => valores[Math.floor(siguiente() * valores.length)],

    /** Elige según pesos: pares [valor, peso]. */
    elegirPonderado<T>(opciones: readonly (readonly [T, number])[]): T {
      const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
      let objetivo = siguiente() * total;
      for (const [valor, peso] of opciones) {
        objetivo -= peso;
        if (objetivo <= 0) return valor;
      }
      return opciones[opciones.length - 1][0];
    },
  };
};

type Azar = ReturnType<typeof crearAzar>;

const MINUTOS = (n: number): number => n * 60 * 1000;
const redondearMonto = (n: number): number => Number(n.toFixed(2));

// ============================================================================
//  Catálogo
// ============================================================================

interface ProductoSimulado {
  id: number;
  codigo: string;
  precioVenta: number;
  esRetornable: boolean;
  esBidon: boolean;
}

interface Catalogo {
  adminId: number;
  vendedorId: number;
  clientes: { id: number; direccion: string; distrito: string | null }[];
  repartidores: { id: number; usuarioId: number }[];
  productos: ProductoSimulado[];
}

const cargarCatalogo = async (): Promise<Catalogo> => {
  const [usuarios, clientes, repartidores, productos] = await Promise.all([
    prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, rol: { select: { nombre: true } } },
    }),
    prisma.cliente.findMany({
      where: { activo: true, eliminadoEn: null },
      select: { id: true, direccion: true, distrito: true },
      orderBy: { id: 'asc' },
    }),
    prisma.repartidor.findMany({
      where: { activo: true },
      // El repartidor se relaciona con su usuario por documento. Los servicios
      // de entrega registran el historial con un `usuarioId`, no con el id del
      // repartidor: son tablas distintas y confundirlas rompe la trazabilidad.
      select: { id: true, usuarios: { select: { id: true }, take: 1 } },
      orderBy: { id: 'asc' },
    }),
    prisma.producto.findMany({
      where: { activo: true, eliminadoEn: null },
      select: { id: true, codigo: true, esRetornable: true, unidadMedida: true, precioVenta: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  const admin = usuarios.find((u) => u.rol.nombre === 'ADMINISTRADOR');
  const vendedor = usuarios.find((u) => u.rol.nombre === 'VENDEDOR');

  if (!admin) throw new Error('No hay un usuario ADMINISTRADOR activo. Ejecute el seed primero.');
  if (!vendedor) throw new Error('No hay un usuario VENDEDOR activo. Ejecute el seed primero.');
  if (clientes.length === 0) throw new Error('No hay clientes activos. Ejecute el seed primero.');
  if (repartidores.length === 0) throw new Error('No hay repartidores activos. Ejecute el seed primero.');
  if (productos.length === 0) throw new Error('No hay productos activos. Ejecute el seed primero.');

  const repartidoresResueltos = repartidores.map((r) => {
    const usuario = r.usuarios[0];
    if (!usuario) {
      throw new Error(
        `El repartidor ${r.id} no tiene usuario asociado. Los servicios de entrega lo requieren para registrar la trazabilidad.`,
      );
    }
    return { id: r.id, usuarioId: usuario.id };
  });

  return {
    adminId: admin.id,
    vendedorId: vendedor.id,
    clientes: clientes.map((c) => ({ id: c.id, direccion: c.direccion, distrito: c.distrito })),
    repartidores: repartidoresResueltos,
    productos: productos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      precioVenta: Number(p.precioVenta),
      esRetornable: p.esRetornable,
      esBidon: p.unidadMedida === UNIDAD_BIDON,
    })),
  };
};

// ============================================================================
//  Utilidades de fecha
// ============================================================================

/** Día a las 00:00 en hora local, para no desbordar el día por zona horaria. */
const inicioDeDia = (fecha: Date): Date => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

const sumarDias = (fecha: Date, dias: number): Date => {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
};

/** El domingo se opera a media intensidad; el sábado, algo por debajo del promedio. */
const factorDia = (fecha: Date): number => {
  const dia = fecha.getDay();
  if (dia === 0) return 0.35;
  if (dia === 6) return 0.75;
  return 1;
};

const iso = (fecha: Date): string => fecha.toISOString().slice(0, 10);

// ============================================================================
//  Retroceso de marcas de tiempo
// ============================================================================

type CamposFecha = Record<string, Date | null>;

/**
 * Los servicios registran `new Date()`. Para que el histórico caiga en el
 * periodo simulado se ajustan las fechas DESPUÉS de aplicar cada paso.
 *
 * Solo se tocan columnas de fecha: importes, saldos, stock y estados los
 * calculó y validó el servicio de verdad.
 */
const retrocesos = {
  pedido: (id: number, datos: CamposFecha) => prisma.pedido.update({ where: { id }, data: datos }),
  venta: (id: number, datos: CamposFecha) => prisma.venta.update({ where: { id }, data: datos }),

  movimientosInventarioDeVenta: (ventaId: number, fecha: Date) =>
    prisma.movimientoInventario.updateMany({ where: { ventaId }, data: { fecha } }),

  movimientosBidonDePedido: (pedidoId: number, fecha: Date) =>
    prisma.movimientoBidon.updateMany({ where: { pedidoId }, data: { fecha } }),

  /**
   * Marca de agua del historial. Se toma ANTES de invocar un servicio y se
   * usa DESPUÉS para retroceder únicamente las filas nuevas. Sin esta
   * marca, un `updateMany` sin filtro reescribiría el historial completo y
   * todas las transiciones de todos los pedidos quedarían con la misma fecha.
   */
  marcaHistorial: async (): Promise<number> => {
    const ultimo = await prisma.historialEstado.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return ultimo?.id ?? 0;
  },

  historial: (desdeId: number, fecha: Date) =>
    prisma.historialEstado.updateMany({ where: { id: { gt: desdeId } }, data: { fecha } }),
};

// ============================================================================
//  Catálogos de realismo
// ============================================================================

const CANALES = ['WHATSAPP', 'TELEFONO', 'MOSTRADOR', 'OTRO'] as const;
const METODOS_PAGO = ['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO'] as const;

/** Errores típicos del registro manual, que el proceso de venta arrastra. */
const INCIDENCIAS_REGISTRO = [
  'Se registró el pedido con el teléfono del cliente incompleto y se corrigió después.',
  'El cliente indicó dos cantidades distintas del mismo producto; se confirmó por WhatsApp.',
  'Faltaba la dirección de entrega; el repartidor la completó al llegar.',
  'Se confundió el nombre del producto y se rectificó antes de confirmar.',
] as const;

const MOTIVOS_NO_ENTREGA = [
  'El cliente no se encontraba en el domicilio.',
  'Se reprogramó la entrega para el día siguiente.',
  'El cliente canceló la recepción del pedido.',
] as const;

interface Resumen {
  pedidos: number;
  ventas: number;
  cancelados: number;
  noEntregados: number;
  conErrorRegistro: number;
  fallidos: number;
}

const resumenVacio = (): Resumen => ({
  pedidos: 0,
  ventas: 0,
  cancelados: 0,
  noEntregados: 0,
  conErrorRegistro: 0,
  fallidos: 0,
});

const acumular = (destino: Resumen, origen: Resumen): void => {
  destino.pedidos += origen.pedidos;
  destino.ventas += origen.ventas;
  destino.cancelados += origen.cancelados;
  destino.noEntregados += origen.noEntregados;
  destino.conErrorRegistro += origen.conErrorRegistro;
  destino.fallidos += origen.fallidos;
};

// ============================================================================
//  Ciclo de vida de un pedido
// ============================================================================

/**
 * Recorre un pedido por el proceso completo.
 *
 * Los intervalos entre pasos son justo lo que mide el postest: distancia
 * entre recepción y registro, entre registro y confirmación, y así
 * sucesivamente. Si el flujo no puede completarse por una regla de negocio
 * (por ejemplo, no hay stock), el pedido se cancela y se contabiliza como
 * descartado, que es lo que ocurriría en la operación real.
 */
const simularPedido = async (
  azar: Azar,
  catalogo: Catalogo,
  momentoRecepcion: Date,
  resumen: Resumen,
): Promise<void> => {
  const cliente = azar.elegir(catalogo.clientes);
  const esRecojo = azar.chance(0.3);

  // --- Detalle del pedido ------------------------------------------------
  // Entre 1 y 3 líneas. Los envases se piden en cantidades mayores que los
  // preformados, que se consumen por unidades.
  const detalles = new Map<number, number>();
  for (let linea = 0; linea < azar.entero(1, 3); linea += 1) {
    const producto = azar.elegir(catalogo.productos);
    const cantidad = producto.esBidon ? azar.entero(1, 6) : azar.entero(1, 12);
    detalles.set(producto.id, (detalles.get(producto.id) ?? 0) + cantidad);
  }

  // Uno de cada veinte pedidos se registró con un error en el proceso
  // manual y tuvo que corregirse antes de confirmarse.
  const conError = azar.chance(0.05);

  /**
   * El descuento es una cortesía ocasional. Se calcula sobre el subtotal real
   * del pedido en lugar de sortear una cifra: un descuento fijo podría superar
   * el subtotal de un pedido pequeño, que el sistema rechaza, y además una
   * venta con total cero no es una venta real.
   */
  const subtotal = [...detalles.entries()].reduce((suma, [productoId, cantidad]) => {
    const producto = catalogo.productos.find((p) => p.id === productoId);
    return suma + (producto?.precioVenta ?? 0) * cantidad;
  }, 0);
  const descuento = azar.chance(0.12) ? Math.min(Number((subtotal * 0.05).toFixed(2)), 5) : 0;

  // --- 1. Recepción y registro ------------------------------------------
  // El cliente comunica el pedido; el registro ocurre minutos después.
  const recibidoEn = new Date(momentoRecepcion.getTime() - MINUTOS(azar.entero(2, 18)));
  const registradoEn = momentoRecepcion;

  const pedido = await pedidosService.crearPedido(
    {
      clienteId: cliente.id,
      recibidoEn,
      canal: azar.elegirPonderado([
        ['WHATSAPP', 55],
        ['TELEFONO', 25],
        ['MOSTRADOR', 15],
        ['OTRO', 5],
      ]) as (typeof CANALES)[number],
      modalidadEntrega: esRecojo ? 'RECOJO' : 'DOMICILIO',
      direccionEntrega: esRecojo
        ? 'Recojo en tienda - Jr. Los Pinos 123'
        : `${cliente.direccion}${cliente.distrito ? `, ${cliente.distrito}` : ''}`,
      referenciaEntrega: azar.chance(0.25) ? `Casa color crema, timbre ${azar.entero(1, 4)}` : null,
      detalles: [...detalles.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad })),
      descuento,
      observaciones: null,
      incidencias: conError ? azar.elegir(INCIDENCIAS_REGISTRO) : null,
      requiereCorreccion: conError,
      confirmar: false,
    },
    catalogo.vendedorId,
  );

  await retrocesos.pedido(pedido.id, { recibidoEn, registradoEn });
  resumen.pedidos += 1;
  if (conError) resumen.conErrorRegistro += 1;

  /** Cierra un pedido que no llegó a completarse, como haría el vendedor. */
  const descartar = async (instante: Date, motivo: string): Promise<void> => {
    const marca = await retrocesos.marcaHistorial();
    try {
      await pedidosService.cambiarEstadoPedido(pedido.id, 'CANCELADO', catalogo.adminId, { motivo });
    } catch {
      // Si el estado no admite el paso, se deja constancia y se cuenta igual.
    }
    await retrocesos.pedido(pedido.id, { canceladoEn: instante });
    await retrocesos.historial(marca, instante);
    resumen.cancelados += 1;
  };

  try {
    // --- 2. Confirmación -------------------------------------------------
    const confirmadoEn = new Date(registradoEn.getTime() + MINUTOS(azar.entero(1, 25)));

    // Un 5% de los pedidos se cancela antes de confirmarse.
    if (azar.chance(0.05)) {
      await descartar(confirmadoEn, 'El cliente canceló el pedido antes de confirmarlo.');
      return;
    }

    const marcaConfirmacion = await retrocesos.marcaHistorial();
    await pedidosService.cambiarEstadoPedido(pedido.id, 'CONFIRMADO', catalogo.vendedorId, {
      observaciones: null,
      motivo: null,
    });
    await retrocesos.pedido(pedido.id, { confirmadoEn });
    await retrocesos.historial(marcaConfirmacion, confirmadoEn);

    // --- 3. Venta --------------------------------------------------------
    const ventaCreadaEn = new Date(confirmadoEn.getTime() + MINUTOS(azar.entero(1, 30)));
    const marcaVenta = await retrocesos.marcaHistorial();

    const venta = await ventasService.crearVenta(
      { pedidoId: pedido.id, descuento: 0, observaciones: null },
      catalogo.vendedorId,
    );

    await retrocesos.venta(venta.id, { fecha: ventaCreadaEn, creadoEn: ventaCreadaEn });
    await retrocesos.movimientosInventarioDeVenta(venta.id, ventaCreadaEn);
    await retrocesos.historial(marcaVenta, ventaCreadaEn);
    resumen.ventas += 1;

    const metodoPago = azar.elegirPonderado([
      ['EFECTIVO', 55],
      ['YAPE', 30],
      ['TRANSFERENCIA', 13],
      ['OTRO', 2],
    ]) as (typeof METODOS_PAGO)[number];

    /**
     * El saldo se relee de la base en cada cobro, no se reutiliza el de la
     * creación de la venta. Entre ambos momentos puede haber cambiado, y
     * pagar un saldo ya cubierto lanzaría "el pago supera el saldo pendiente".
     */
    const saldoVigente = async (): Promise<number> => {
      const actual = await prisma.venta.findUnique({
        where: { id: venta.id },
        select: { saldo: true },
      });
      return Number(actual?.saldo ?? 0);
    };

    // --- 4. Cobro en el momento de la venta ----------------------------
    // El 60% de los clientes pagan al facturar; el resto, contra entrega.
    const pagaEnVenta = azar.chance(0.6);
    const saldoACobrar = pagaEnVenta ? await saldoVigente() : 0;

    if (saldoACobrar > 0) {
      const marcaCobro = await retrocesos.marcaHistorial();
      await pagosService.crearPago(
        {
          ventaId: venta.id,
          monto: redondearMonto(saldoACobrar),
          metodo: metodoPago,
          referencia: null,
          observaciones: 'Cobro al momento de emitir la venta',
          fecha: ventaCreadaEn,
        },
        catalogo.vendedorId,
      );
      await retrocesos.historial(marcaCobro, ventaCreadaEn);
    }

    // --- 5. Constancia ---------------------------------------------------
    // La constancia de venta es un documento exigido en el rubro, así que se
    // emite en casi todas las ventas. Se deja un margen de omisiones porque
    // son justamente el defecto de proceso que el indicador de ventas
    // procesadas correctamente debe ser capaz de detectar.
    if (azar.chance(0.95)) {
      const emitidaEn = new Date(ventaCreadaEn.getTime() + MINUTOS(azar.entero(2, 90)));
      await ventasService.emitirConstancia(venta.id, catalogo.vendedorId);
      await retrocesos.venta(venta.id, { constanciaEmitidaEn: emitidaEn });
    }

    // --- 6. Asignación al reparto ---------------------------------------
    const repartidor = azar.elegir(catalogo.repartidores);
    const asignadoEn = new Date(ventaCreadaEn.getTime() + MINUTOS(azar.entero(2, 40)));
    const marcaAsignacion = await retrocesos.marcaHistorial();

    const entrega = await entregasService.registrarEntrega(
      { pedidoId: pedido.id, repartidorId: repartidor.id, observaciones: null },
      repartidor.usuarioId,
    );

    await prisma.entrega.update({
      where: { id: entrega.id },
      data: { fechaAsignacion: asignadoEn, creadoEn: asignadoEn },
    });
    await retrocesos.pedido(pedido.id, { asignadoEn });
    await retrocesos.historial(marcaAsignacion, asignadoEn);

    // --- 7. Ruta y entrega ----------------------------------------------
    const salidaEn = new Date(asignadoEn.getTime() + MINUTOS(azar.entero(5, 45)));
    const marcaRuta = await retrocesos.marcaHistorial();
    await entregasService.actualizarEntrega(
      entrega.id,
      { estado: 'EN_RUTA', horaSalida: salidaEn },
      repartidor.usuarioId,
    );
    const enRutaEn = new Date(salidaEn.getTime() + MINUTOS(azar.entero(20, 180)));
    await retrocesos.pedido(pedido.id, { enRutaEn });
    await retrocesos.historial(marcaRuta, enRutaEn);

    // Un 6% de las entregas no se concretan porque el cliente no está.
    if (azar.chance(0.06)) {
      const intentoEn = new Date(salidaEn.getTime() + MINUTOS(azar.entero(20, 120)));
      const marcaIntento = await retrocesos.marcaHistorial();
      await entregasService.actualizarEntrega(
        entrega.id,
        {
          estado: 'NO_ENTREGADO',
          horaEntrega: intentoEn,
          motivoNoEntrega: azar.elegir(MOTIVOS_NO_ENTREGA),
        },
        repartidor.usuarioId,
      );
      await prisma.entrega.update({
        where: { id: entrega.id },
        data: { horaEntrega: intentoEn },
      });
      await retrocesos.historial(marcaIntento, intentoEn);
      resumen.noEntregados += 1;
      return;
    }

    // --- 8. Entrega efectiva, devolución y cobro pendiente ---------------
    const entregadoEn = new Date(salidaEn.getTime() + MINUTOS(azar.entero(30, 240)));

    // El cliente devuelve parte de los envases que tenía en su poder. Solo
    // producto retornable y nunca más de lo que se le entregó en esta visita,
    // para no violar la regla de saldo de bidones.
    const lineasRetornables = catalogo.productos.filter(
      (p) => p.esRetornable && detalles.has(p.id),
    );
    const bidonesEntregados = lineasRetornables.reduce(
      (suma, p) => suma + (detalles.get(p.id) ?? 0),
      0,
    );

    const devoluciones =
      bidonesEntregados > 0 && azar.chance(0.35)
        ? lineasRetornables.map((p) => ({
            clienteId: cliente.id,
            productoId: p.id,
            cantidad: azar.entero(1, detalles.get(p.id) ?? 1),
            observaciones: 'Devolución en la ruta',
          }))
        : undefined;

    const bidonesDevueltos = devoluciones?.reduce((s, d) => s + d.cantidad, 0) ?? 0;

    // El saldo que quedó pendiente se cobra contra entrega, salvo que el
    // cliente no se haga presente: entonces queda como cartera por cobrar.
    const saldoPendiente = await saldoVigente();
    const cobraPendiente = saldoPendiente > 0 && azar.chance(0.85);

    const marcaEntrega = await retrocesos.marcaHistorial();
    await entregasService.actualizarEntrega(
      entrega.id,
      {
        estado: 'ENTREGADA',
        horaEntrega: entregadoEn,
        minutosDemora: azar.entero(0, 45),
        bidonesEntregados,
        bidonesDevueltos,
        montoRecibido: cobraPendiente ? redondearMonto(saldoPendiente) : 0,
        recibeFirma: azar.chance(0.8),
        devoluciones,
      },
      repartidor.usuarioId,
    );

    if (cobraPendiente) {
      const marcaPago = await retrocesos.marcaHistorial();
      await pagosService.crearPago(
        {
          ventaId: venta.id,
          monto: redondearMonto(saldoPendiente),
          metodo: metodoPago,
          referencia: null,
          observaciones: 'Cobro contra entrega',
          fecha: entregadoEn,
        },
        repartidor.usuarioId,
      );
      await retrocesos.historial(marcaPago, entregadoEn);
    }

    await prisma.entrega.update({
      where: { id: entrega.id },
      data: { horaEntrega: entregadoEn },
    });
    await retrocesos.movimientosBidonDePedido(pedido.id, entregadoEn);
    await retrocesos.historial(marcaEntrega, entregadoEn);
  } catch (error) {
    // El flujo se interrumpió por una regla de negocio. Se cancela el pedido
    // para no dejar un registro colgado y se contabiliza el descarte.
    const mensaje = error instanceof Error ? error.message : String(error);
    await descartar(registradoEn, `No se pudo completar el proceso: ${mensaje}`);
    resumen.fallidos += 1;
    process.stdout.write(`  [aviso] ${iso(registradoEn)} pedido descartado: ${mensaje}\n`);
  }
};

// ============================================================================
//  Reabastecimiento
// ============================================================================

/**
 * Repone el inventario al inicio de cada jornada.
 *
 * Una distribuidora de agua no opera al límite del stock: cada mañana entra
 * mercadería. Además, reabastecer por el servicio conserva la trazabilidad
 * (movimiento con su origen y su usuario), que es exactamente lo que mide el
 * indicador de actualización correcta del stock.
 */
const reabastecer = async (
  catalogo: Catalogo,
  fecha: Date,
  stockPorProducto: Map<number, number>,
): Promise<number> => {
  let entradas = 0;

  for (const producto of catalogo.productos) {
    const stock = stockPorProducto.get(producto.id) ?? 0;
    if (stock >= STOCK_MINIMO) continue;

    const faltante = STOCK_OBJETIVO - stock;
    if (faltante <= 0) continue;

    await inventarioService.registrarMovimientoManual(
      {
        tipo: 'ENTRADA',
        productoId: producto.id,
        cantidad: faltante,
        origen: 'REABASTECIMIENTO',
        observaciones: `Ingreso de mercadería del ${iso(fecha)}`,
      },
      catalogo.adminId,
    );
    stockPorProducto.set(producto.id, stock + faltante);
    entradas += 1;
  }

  return entradas;
};

// ============================================================================
//  Limpieza
// ============================================================================

/**
 * Borra los datos operativos conservando el catálogo y la configuración.
 *
 * El orden respeta las claves foráneas: primero los hijos, después los
 * padres. Se conservan las cargas iniciales de inventario, que son la base
 * del stock sembrado.
 */
const limpiarOperativo = async (): Promise<void> => {
  process.stdout.write('Limpiando datos operativos...\n');

  await prisma.$transaction([
    prisma.movimientoBidon.deleteMany(),
    prisma.logConsulta.deleteMany(),
    prisma.pago.deleteMany(),
    prisma.detalleVenta.deleteMany(),
    prisma.venta.deleteMany(),
    prisma.entrega.deleteMany(),
    prisma.historialEstado.deleteMany(),
    prisma.detallePedido.deleteMany(),
    prisma.pedido.deleteMany(),
    prisma.movimientoInventario.deleteMany({ where: { origen: { not: 'CARGA INICIAL' } } }),
    prisma.incidenciaSistema.deleteMany(),
  ]);

  // El stock de cada producto vuelve al de su carga inicial, que es el punto
  // de partida del seed.
  const productos = await prisma.producto.findMany({
    select: { id: true, codigo: true },
    orderBy: { id: 'asc' },
  });

  for (const producto of productos) {
    const base = await prisma.movimientoInventario.findFirst({
      where: { productoId: producto.id, origen: 'CARGA INICIAL' },
      orderBy: { id: 'asc' },
      select: { stockResultante: true },
    });
    await prisma.producto.update({
      where: { id: producto.id },
      data: { stock: base?.stockResultante ?? 0 },
    });
  }

  // Los correlativos se reinician para que los códigos de la simulación
  // empiecen como en una base recién sembrada.
  await prisma.correlativo.deleteMany({});
};

// ============================================================================
//  Ejecución principal
// ============================================================================

const ejecutar = async (opciones: Opciones): Promise<void> => {
  const tiempoInicio = Date.now();

  if (opciones.limpiar) {
    await limpiarOperativo();
  }

  const catalogo = await cargarCatalogo();
  const azar = crearAzar(opciones.semilla);

  const fechaFin = inicioDeDia(opciones.fechaFin ?? new Date());
  const fechaInicio = inicioDeDia(
    opciones.fechaInicio ?? sumarDias(fechaFin, -(opciones.dias - 1)),
  );
  const totalDias = Math.max(
    1,
    Math.round((fechaFin.getTime() - fechaInicio.getTime()) / 86400000) + 1,
  );

  const separador = '='.repeat(64);
  process.stdout.write(`\n${separador}\n`);
  process.stdout.write('SIMULADOR DEL PROCESO DE VENTAS - Agua Tres Estrellas Pura\n');
  process.stdout.write(`${separador}\n`);
  process.stdout.write(`  Periodo     : ${iso(fechaInicio)} a ${iso(fechaFin)} (${totalDias} dias)\n`);
  process.stdout.write(`  Pedidos/dia : ~${opciones.pedidosPorDia} (ajustado por dia de la semana)\n`);
  process.stdout.write(`  Semilla     : ${opciones.semilla} (corrida reproducible)\n`);
  process.stdout.write(
    `  Catalogo    : ${catalogo.clientes.length} clientes, ${catalogo.productos.length} productos, ${catalogo.repartidores.length} repartidores\n`,
  );
  process.stdout.write(`${separador}\n\n`);

  const stocks = await prisma.producto.findMany({
    where: { id: { in: catalogo.productos.map((p) => p.id) } },
    select: { id: true, stock: true },
  });
  const stockPorProducto = new Map<number, number>(stocks.map((p) => [p.id, p.stock]));

  const global = resumenVacio();
  let diasSimulados = 0;

  // El periodo termina, por defecto, hoy. Simular el día completo generaría
  // pedidos con `recibidoEn` futuro, y los servicios lo rechazan: el último día
  // se limita a las horas que ya ocurrieron. El margen de un minuto evita que
  // un pedido caiga en el mismo instante en que se está creando.
  const ahora = new Date();

  for (let dia = 0; dia < totalDias; dia += 1) {
    const fechaDia = sumarDias(fechaInicio, dia);
    const esHoy = fechaDia.getTime() === inicioDeDia(ahora).getTime();
    const minutoDelDiaMaximo = esHoy
      ? Math.floor((ahora.getTime() - fechaDia.getTime()) / 60000) - 1
      : POR_DEFECTO.horaCierre * 60;
    const minutoDelDiaMinimo = POR_DEFECTO.horaApertura * 60;

    // El día simulado todavía no abre: no hay nada que generar.
    if (minutoDelDiaMaximo < minutoDelDiaMinimo) {
      diasSimulados += 1;
      continue;
    }

    // En el día en curso solo se genera la parte del día que ya transcurrió.
    const fraccionDelDia =
      (minutoDelDiaMaximo - minutoDelDiaMinimo + 1) /
      (POR_DEFECTO.horaCierre * 60 - POR_DEFECTO.horaApertura * 60 + 1);
    const pedidosDelDia = Math.round(opciones.pedidosPorDia * factorDia(fechaDia) * fraccionDelDia);

    if (pedidosDelDia === 0) {
      diasSimulados += 1;
      continue;
    }

    const entradas = await reabastecer(catalogo, fechaDia, stockPorProducto);
    const resumen = resumenVacio();

    for (let i = 0; i < pedidosDelDia; i += 1) {
      // Hora de recepción dentro de la ventana de atención, con dispersión
      // para que los pedidos no caigan todos en el mismo minuto.
      const minutoDelDia = azar.entero(minutoDelDiaMinimo, minutoDelDiaMaximo);
      const momento = new Date(fechaDia);
      momento.setHours(Math.floor(minutoDelDia / 60), minutoDelDia % 60, azar.entero(0, 59), 0);
      if (momento.getTime() > ahora.getTime() - 60000) momento.setTime(ahora.getTime() - 60000);

      await simularPedido(azar, catalogo, momento, resumen);
    }

    // El stock en memoria se relee de la base para no desviarse del valor
    // real tras todas las deducciones del día.
    const stocksReales = await prisma.producto.findMany({
      where: { id: { in: catalogo.productos.map((p) => p.id) } },
      select: { id: true, stock: true },
    });
    for (const producto of stocksReales) {
      stockPorProducto.set(producto.id, producto.stock);
    }

    acumular(global, resumen);
    diasSimulados += 1;

    const entregadas = resumen.pedidos - resumen.noEntregados - resumen.cancelados;
    process.stdout.write(
      `  ${iso(fechaDia)}  ` +
        `pedidos ${String(resumen.pedidos).padStart(3)}  ` +
        `ventas ${String(resumen.ventas).padStart(3)}  ` +
        `entregadas ${String(entregadas).padStart(3)}  ` +
        `no entregadas ${String(resumen.noEntregados).padStart(2)}  ` +
        `canceladas ${String(resumen.cancelados).padStart(2)}  ` +
        `entradas inv ${String(entradas).padStart(2)}\n`,
    );
  }

  const segundos = ((Date.now() - tiempoInicio) / 1000).toFixed(1);

  process.stdout.write(`\n${separador}\n`);
  process.stdout.write('RESUMEN DE LA SIMULACION\n');
  process.stdout.write(`${separador}\n`);
  process.stdout.write(`  Dias simulados               : ${diasSimulados}\n`);
  process.stdout.write(`  Pedidos generados            : ${global.pedidos}\n`);
  process.stdout.write(`  Ventas generadas             : ${global.ventas}\n`);
  process.stdout.write(`  Pedidos cancelados           : ${global.cancelados}\n`);
  process.stdout.write(`  Entregas no concretadas      : ${global.noEntregados}\n`);
  process.stdout.write(`  Pedidos con error de registro: ${global.conErrorRegistro}\n`);
  process.stdout.write(`  Pedidos descartados por regla: ${global.fallidos}\n`);
  process.stdout.write(`  Tiempo de ejecucion          : ${segundos} s\n`);

  if (opciones.mostrarIndicadores) {
    const indicadores = await indicadoresService.indicadoresProcesoVentas(
      inicioDeDia(fechaInicio),
      new Date(inicioDeDia(fechaFin).getTime() + 86399999),
    );
    process.stdout.write(`\n${separador}\n`);
    process.stdout.write('INDICADORES DEL POSTEST (variable dependiente)\n');
    process.stdout.write(`${separador}\n`);
    process.stdout.write(`${JSON.stringify(indicadores, null, 2)}\n`);
  }

  process.stdout.write('\nSimulacion completada.\n');
};

// ============================================================================
//  Punto de entrada
// ============================================================================

const principal = async (): Promise<void> => {
  try {
    const opciones = leerOpciones(process.argv.slice(2));

    if (opciones.ayuda) {
      mostrarAyuda();
      return;
    }

    await ejecutar(opciones);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\nError del simulador: ${mensaje}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void principal();
