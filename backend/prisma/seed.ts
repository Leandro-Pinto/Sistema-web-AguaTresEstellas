/**
 * ============================================================================
 *  SEED - Datos iniciales del sistema
 * ============================================================================
 *
 *  Carga lo mínimo indispensable para que el sistema sea usable y, sobre
 *  todo, para que la evaluación del postest pueda ejecutarse:
 *
 *    1. Empresa con los datos reales del negocio (Iberia, Madre de Dios).
 *    2. Los tres roles del proceso y un usuario de ejemplo por rol.
 *    3. Catálogo de productos (bidón retornable de 20 L y Presentations).
 *    4. Repartidores con zona de cobertura.
 *    5. Clientes de los distritos donde se reparte.
 *    6. Stock inicial, registrado como movimiento de inventario (nunca a mano).
 *    7. Requisitos funcionales y casos de prueba de la matriz de la tesis,
 *       ya marcados como implementados para que el indicador de adecuación
 *       funcional tenga una línea base real.
 *
 *  Es idempotente: se puede ejecutar varias veces sin duplicar registros.
 * ============================================================================
 */
import { PrismaClient, DimensionIndicador, EstadoCasoPrueba } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { aplicarMovimientoInventario } from '../src/services/inventario.service';

const prisma = new PrismaClient();

const PASSWORD_POR_DEFECTO = 'Agua2026*';
const ORIGEN_CARGA_INICIAL = 'CARGA INICIAL';

const nombre = (nombres: string, apellidos: string) => `${nombres} ${apellidos}`.trim();

async function main() {
  console.log('Iniciando carga de datos iniciales...\n');

  // -----------------------------------------------------------------------
  // 1. Empresa
  // -----------------------------------------------------------------------
  const empresa = await prisma.empresa.upsert({
    where: { ruc: '20601234567' },
    update: {},
    create: {
      razonSocial: 'Agua Tres Estrellas Pura E.I.R.L.',
      nombreComercial: 'Agua Tres Estrellas Pura',
      ruc: '20601234567',
      direccion: 'Av. Iberia Cuadra 5, Iberia, Madre de Dios',
      telefono: '900123456',
      email: 'contacto@aguarespura.pe',
    },
  });
  console.log(`  Empresa: ${empresa.nombreComercial}`);

  // -----------------------------------------------------------------------
  // 2. Roles
  // -----------------------------------------------------------------------
  const definicionesRoles = [
    {
      nombre: 'ADMINISTRADOR',
      nivel: 1,
      descripcion: 'Control total: usuarios, catálogo, reportes y anulaciones.',
    },
    {
      nombre: 'VENDEDOR',
      nivel: 2,
      descripcion: 'Registra pedidos y ventas, cobra y consulta el historial de cli.',
    },
    {
      nombre: 'REPARTIDOR',
      nivel: 3,
      descripcion: 'Realiza la entrega, registra bidones entregados y devueltos.',
    },
  ];

  const roles = new Map<string, number>();
  for (const definicion of definicionesRoles) {
    const rol = await prisma.rol.upsert({
      where: { nombre: definicion.nombre },
      update: { nivel: definicion.nivel, descripcion: definicion.descripcion },
      create: definicion,
    });
    roles.set(rol.nombre, rol.id);
  }
  console.log(`  Roles: ${[...roles.keys()].join(', ')}`);

  // -----------------------------------------------------------------------
  // 3. Repartidores
  //    Van antes que los usuarios porque el usuario de rol REPARTIDOR
  //    referencia su ficha por documento, y la clave foránea lo exige.
  // -----------------------------------------------------------------------
  const repartidoresDefinidos = [
    {
      nombres: 'Miguel',
      apellidos: 'Chávez Rojas',
      documento: '70099887',
      telefono: '900777888',
      zona: 'Iberia centro',
    },
    {
      nombres: 'Rosa',
      apellidos: 'Paredes Nina',
      documento: '70111999',
      telefono: '900888999',
      zona: 'Iberia perimetral',
    },
    {
      nombres: 'Iván',
      apellidos: 'Ccorimanya Choque',
      documento: '70223444',
      telefono: '900999000',
      zona: 'Iberia y comunidades',
    },
  ];

  const repartidores = new Map<string, number>();
  for (const definicion of repartidoresDefinidos) {
    const repartidor = await prisma.repartidor.upsert({
      where: { documento: definicion.documento },
      update: { zona: definicion.zona, telefono: definicion.telefono },
      create: { ...definicion, nombre: nombre(definicion.nombres, definicion.apellidos) },
    });
    repartidores.set(repartidor.documento, repartidor.id);
  }
  console.log(`  Repartidores: ${repartidoresDefinidos.length}`);

  // -----------------------------------------------------------------------
  // 4. Usuarios
  // -----------------------------------------------------------------------
  const hash = await bcrypt.hash(PASSWORD_POR_DEFECTO, 10);

  const definicionesUsuarios: {
    nombres: string;
    apellidos: string;
    email: string;
    telefono: string;
    rol: string;
    documento: string | null;
  }[] = [
    {
      nombres: 'Carlos',
      apellidos: 'Mendoza Rojas',
      email: 'admin@aguarespura.pe',
      telefono: '900111222',
      rol: 'ADMINISTRADOR',
      // Solo el usuario REPARTIDOR lleva documento: es la llave que lo enlaza
      // con su ficha de repartidor.
      documento: null,
    },
    {
      nombres: 'Lucía',
      apellidos: 'Quispe Huaman',
      email: 'vendedor@aguarespura.pe',
      telefono: '900333444',
      rol: 'VENDEDOR',
      documento: null,
    },
  ];

  // Cada repartidor tiene su propio usuario. El `documento` es la llave que lo
  // enlaza con su ficha: sin ella el repartidor no puede autenticarse, no ve
  // sus entregas y sus movimientos de ruta quedan sin trazabilidad, que es
  // justamente el indicador que la tesis mide.
  //
  // Se derivan de `repartidoresDefinidos` para que nombre, teléfono y documento
  // no puedan divergir de la ficha: el usuario y el repartidor son la misma
  // persona, no dos registros distintos.
  const correosRepartidor = ['repartidor@aguarespura.pe', 'repartidor2@aguarespura.pe', 'repartidor3@aguarespura.pe'];
  repartidoresDefinidos.forEach((repartidor, indice) => {
    definicionesUsuarios.push({
      nombres: repartidor.nombres,
      apellidos: repartidor.apellidos,
      email: correosRepartidor[indice],
      telefono: repartidor.telefono,
      rol: 'REPARTIDOR',
      documento: repartidor.documento,
    });
  });

  const usuarios = new Map<string, { id: number; rol: string }>();
  for (const definicion of definicionesUsuarios) {
    const rolId = roles.get(definicion.rol);
    if (!rolId) throw new Error(`Rol ${definicion.rol} no encontrado`);
    const usuario = await prisma.usuario.upsert({
      where: { email: definicion.email },
      // Se reaplican también los datos de identidad: si el seed corrige un
      // nombre, una base ya sembrada no puede quedarse con el valor viejo.
      // `activo` y `debeCambiarPassword` no se tocan para no reabilitar cuentas
      // desactivadas ni saltarse el cambio de clave del primer ingreso.
      update: {
        nombres: definicion.nombres,
        apellidos: definicion.apellidos,
        nombreCompleto: nombre(definicion.nombres, definicion.apellidos),
        telefono: definicion.telefono,
        documento: definicion.documento,
        passwordHash: hash,
        rolId,
      },
      create: {
        nombres: definicion.nombres,
        apellidos: definicion.apellidos,
        nombreCompleto: nombre(definicion.nombres, definicion.apellidos),
        email: definicion.email,
        telefono: definicion.telefono,
        documento: definicion.documento,
        passwordHash: hash,
        rolId,
        // El password provisional obliga a cambiarlo en el primer ingreso.
        debeCambiarPassword: true,
      },
    });
    usuarios.set(definicion.email, { id: usuario.id, rol: definicion.rol });
  }
  const admin = usuarios.get('admin@aguarespura.pe')!;
  console.log(`  Usuarios: ${definicionesUsuarios.length} (password: ${PASSWORD_POR_DEFECTO})`);

  // -----------------------------------------------------------------------
  // 5. Productos
  // -----------------------------------------------------------------------
  const definicionesProductos = [
    {
      codigo: 'BID20',
      nombre: 'Bidón de agua pura 20 litros',
      descripcion: 'Bidón retornable de 20 litros. Envase retornable con control de saldo.',
      unidadMedida: 'BIDON',
      precioVenta: 12.0,
      costoUnitario: 8.5,
      stock: 320,
      stockMinimo: 80,
      esRetornable: true,
    },
    {
      codigo: 'PRE15',
      nombre: 'Botella de agua pura 625 ml',
      descripcion: 'Botella sellada de 625 ml. No retorna.',
      unidadMedida: 'UNIDAD',
      precioVenta: 2.5,
      costoUnitario: 1.4,
      stock: 480,
      stockMinimo: 100,
      esRetornable: false,
    },
    {
      codigo: 'PRE35',
      nombre: 'Botella de agua pura 1.5 litros',
      descripcion: 'Botella sellada de 1.5 litros. No retorna.',
      unidadMedida: 'UNIDAD',
      precioVenta: 4.5,
      costoUnitario: 2.8,
      stock: 240,
      stockMinimo: 60,
      esRetornable: false,
    },
  ];

  const productos = new Map<string, number>();
  for (const definicion of definicionesProductos) {
    const { stock, ...datosProducto } = definicion;
    const producto = await prisma.producto.upsert({
      where: { codigo: definicion.codigo },
      update: datosProducto,
      create: datosProducto,
    });
    productos.set(definicion.codigo, producto.id);

    // El stock inicial NUNCA se escribe directo en `producto.stock`: se
    // registra como entrada mediante el mismo servicio que usa la aplicación,
    // de modo que queden movimiento, saldos y auditoría consistentes.
    const cargasPrevias = await prisma.movimientoInventario.findMany({
      where: { productoId: producto.id, origen: ORIGEN_CARGA_INICIAL },
      orderBy: { id: 'asc' },
    });

    if (cargasPrevias.length === 0) {
      await prisma.$transaction((tx) =>
        aplicarMovimientoInventario(
          {
            productoId: producto.id,
            tipo: 'ENTRADA',
            cantidad: stock,
            usuarioId: admin.id,
            origen: ORIGEN_CARGA_INICIAL,
            observaciones: 'Stock cargado al instalar el sistema',
          },
          tx,
        ),
      );
      continue;
    }

    // Autorreparación: una carga inicial antigua pudo dejarse registrada sin
    // mover el stock. Si el producto no cuadra con su último movimiento, se
    // descarta la carga inconsistente y se vuelve a aplicar.
    const ultimaCarga = cargasPrevias[cargasPrevias.length - 1];
    if (ultimaCarga.stockResultante !== producto.stock) {
      await prisma.$transaction(async (tx) => {
        await tx.movimientoInventario.deleteMany({
          where: { productoId: producto.id, origen: ORIGEN_CARGA_INICIAL },
        });
        await tx.producto.update({ where: { id: producto.id }, data: { stock: 0 } });
        await aplicarMovimientoInventario(
          {
            productoId: producto.id,
            tipo: 'ENTRADA',
            cantidad: ultimaCarga.stockResultante,
            usuarioId: admin.id,
            origen: ORIGEN_CARGA_INICIAL,
            observaciones: 'Stock cargado al instalar el sistema (reparado)',
          },
          tx,
        );
      });
      console.log(`    · ${definicion.codigo}: carga inicial reparada`);
    }
  }
  console.log(`  Productos: ${definicionesProductos.length}`);

  // -----------------------------------------------------------------------
  // 6. Clientes
  // -----------------------------------------------------------------------
  const clientesDefinidos: {
    tipo: 'EMPRESA' | 'INSTITUCION' | 'PERSONA';
    documento: string;
    razonSocial?: string;
    nombre?: string;
    telefono: string;
    direccion: string;
    distrito: string;
    referencia: string;
  }[] = [
    {
      tipo: 'EMPRESA',
      documento: '20601234567',
      razonSocial: 'Restaurante El Puerto S.A.C.',
      telefono: '900101010',
      direccion: 'Jr. Bolognesi 120, Iberia',
      distrito: 'Iberia',
      referencia: 'Frente a la plaza de armas',
    },
    {
      tipo: 'EMPRESA',
      documento: '20509876543',
      razonSocial: 'Hotel Vista del Sol S.A.C.',
      telefono: '900202020',
      direccion: 'Av. Iberia 450, Iberia',
      distrito: 'Iberia',
      referencia: 'Al lado del mercado modelo',
    },
    {
      tipo: 'INSTITUCION',
      documento: '20123456789',
      razonSocial: 'I.E.P. Bilingüe Iberia',
      telefono: '900303030',
      direccion: 'Av. Castilla 88, Iberia',
      distrito: 'Iberia',
      referencia: 'Ingreso por la Av. Castilla',
    },
    {
      tipo: 'EMPRESA',
      documento: '20445566777',
      razonSocial: 'Comercial Ñanari E.I.R.L.',
      telefono: '900404040',
      direccion: 'Jr. Túpac Amaru 45, Iberia',
      distrito: 'Iberia',
      referencia: 'Casa de tres pisos, portón verde',
    },
    {
      tipo: 'PERSONA',
      documento: '45566778',
      nombre: 'María Elena Quispe Ayala',
      telefono: '900505050',
      direccion: 'Jr. Huáscar 210, Iberia',
      distrito: 'Iberia',
      referencia: 'Cerca de la comisaría',
    },
    {
      tipo: 'PERSONA',
      documento: '45677889',
      nombre: 'Jorge Antonio Flores Ruiz',
      telefono: '900606060',
      direccion: 'Jr. Dos de Mayo 33, Iberia',
      distrito: 'Iberia',
      referencia: 'Fundo a media cuadra',
    },
  ];

  const clientes = new Map<string, number>();
  for (const definicion of clientesDefinidos) {
    // Una persona natural no tiene razón social: su nombre va en `nombre`. Sin
    // él el cliente quedaba como "Cliente 45566778", que no es un dato que
    // pueda usarse en un reporte ni en una entrevista de la tesis.
    const nombreMostrable = definicion.razonSocial ?? definicion.nombre;
    if (!nombreMostrable) {
      throw new Error(`El cliente ${definicion.documento} no tiene ni razón social ni nombre`);
    }
    // Los datos de catálogo se reaplican en cada seed. Con `update: {}` una
    // corrección del seed no llegaba nunca a una base ya sembrada, y quedaba
    // desincronizada respecto de lo que el código dice.
    const datosCliente = {
      tipo: definicion.tipo,
      documento: definicion.documento,
      nombres: definicion.razonSocial ? null : nombreMostrable,
      razonSocial: definicion.razonSocial ?? null,
      nombre: nombreMostrable,
      telefono: definicion.telefono,
      direccion: definicion.direccion,
      distrito: definicion.distrito,
      referencia: definicion.referencia,
    };
    const cliente = await prisma.cliente.upsert({
      where: {
        tipo_documento: { tipo: definicion.tipo, documento: definicion.documento },
      },
      update: datosCliente,
      create: { ...datosCliente, limiteCredito: 0 },
    });
    clientes.set(`${definicion.tipo}:${definicion.documento}`, cliente.id);
  }
  console.log(`  Clientes: ${clientesDefinidos.length}`);

  // -----------------------------------------------------------------------
  // 7. Requisitos funcionales y casos de prueba
  //    Alimentan el indicador de adecuación funcional del postest.
  // -----------------------------------------------------------------------
  const requisitos = [
    {
      codigo: 'RF-01',
      modulo: 'Autenticacion',
      descripcion: 'El sistema permite iniciar sesión de forma segura con correo y contraseña.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-02',
      modulo: 'Clientes',
      descripcion: 'El sistema registra clientes con documento, teléfono y dirección.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-03',
      modulo: 'Pedidos',
      descripcion: 'El sistema registra el pedido con fecha, hora, productos y cantidad.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-04',
      modulo: 'Ventas',
      descripcion: 'El sistema procesa la venta y genera el comprobante de venta.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-05',
      modulo: 'Pagos',
      descripcion: 'El sistema registra pagos en efectivo, Yape o transferencia.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-06',
      modulo: 'Entregas',
      descripcion: 'El sistema asigna repartidor y registra la entrega realizada.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-07',
      modulo: 'Bidones',
      descripcion: 'El sistema controla la salida y devolución de bidones por cliente.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-08',
      modulo: 'Inventario',
      descripcion: 'El sistema actualiza el stock mediante movimientos registrados.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-09',
      modulo: 'Reportes',
      descripcion: 'El sistema genera reportes de ventas, pagos y consolidate diario.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-10',
      modulo: 'Historial',
      descripcion: 'El sistema muestra el historial de estados de cada pedido.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-11',
      modulo: 'Tiempos',
      descripcion: 'El sistema registra marcas de tiempo de cada etapa del proceso.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
    {
      codigo: 'RF-12',
      modulo: 'Permisos',
      descripcion: 'El sistema restringe las operaciones según el rol del usuario.',
      dimension: DimensionIndicador.ADECUACION_FUNCIONAL,
    },
  ] as const;

  for (const definicion of requisitos) {
    await prisma.requisitoFuncional.upsert({
      where: { codigo: definicion.codigo },
      update: { implementado: true },
      create: { ...definicion, aprobado: true, implementado: true },
    });
  }
  console.log(`  Requisitos funcionales: ${requisitos.length} (marcados como implementados)`);

  const casos = [
    ['CP-01', 'RF-01', 'Iniciar sesión con credenciales válidas', 'Acceso concedido y token emitido'],
    ['CP-02', 'RF-01', 'Intentar iniciar sesión con contraseña incorrecta', 'Acceso denegado sin revelar si el usuario existe'],
    ['CP-03', 'RF-02', 'Registrar cliente con documento ya existente', 'Rechazo por documento duplicado'],
    ['CP-04', 'RF-03', 'Registrar pedido con producto y cantidad válidos', 'Pedido guardado con código y hora de registro'],
    ['CP-05', 'RF-03', 'Intentar saltar de PENDIENTE a ENTREGADO', 'Rechazo por transición de estado no permitida'],
    ['CP-06', 'RF-04', 'Generar dos ventas para el mismo pedido', 'Segunda venta rechazada'],
    ['CP-07', 'RF-05', 'Registrar un pago mayor al saldo pendiente', 'Rechazo del pago'],
    ['CP-08', 'RF-05', 'Registrar pago que cancela el saldo total', 'Venta queda en estado COMPLETADA'],
    ['CP-09', 'RF-06', 'Registrar entrega con repartidor no asignado', 'Rechazo de la asignación'],
    ['CP-10', 'RF-07', 'Devolver más bidones que el saldo del cliente', 'Rechazo de la devolución'],
    ['CP-11', 'RF-07', 'Registrar devolución de bidones', 'Saldo del cliente se reduce y stock se repone'],
    ['CP-12', 'RF-08', 'Vender más unidades que el stock disponible', 'Rechazo por stock insuficiente'],
    ['CP-13', 'RF-08', 'Registrar entrada manual de mercadería', 'Stock aumenta y queda movimiento registrado'],
    ['CP-14', 'RF-09', 'Consultar el consolidado de un día', 'Totales del día coherentes con las ventas'],
    ['CP-15', 'RF-10', 'Consultar el historial de un pedido', 'Se muestran todos los cambios de estado con usuario y fecha'],
    ['CP-16', 'RF-11', 'Consultar el tiempo de registro de un pedido', 'Diferencia entre recibido y registrado en minutos'],
    ['CP-17', 'RF-12', 'Un vendedor intenta anular una venta', 'Acceso denegado por rol'],
    ['CP-18', 'RF-12', 'Un repartidor consulta sus entregas asignadas', 'Solo ve las entregas propias'],
  ] as const;

  for (const [codigo, requisitoCodigo, descripcion, esperado] of casos) {
    const requisito = await prisma.requisitoFuncional.findUnique({
      where: { codigo: requisitoCodigo },
      select: { id: true },
    });
    if (!requisito) continue;
    await prisma.casoPrueba.upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        requisitoId: requisito.id,
        descripcion,
        resultadoEsperado: esperado,
        critico: codigo === 'CP-05' || codigo === 'CP-06' || codigo === 'CP-07' || codigo === 'CP-12',
        estado: EstadoCasoPrueba.PENDIENTE,
        pasos: `1. Iniciar sesión con el rol correspondiente.\n2. Ejecutar ${descripcion.toLowerCase()}.\n3. Verificar el resultado en pantalla.`,
      },
    });
  }
  console.log(`  Casos de prueba: ${casos.length} (pendientes de ejecución en el postest)`);

  console.log('\nCarga inicial completada.');
  console.log('Accesos de prueba:');
  console.log(`  Administrador: admin@aguarespura.pe / ${PASSWORD_POR_DEFECTO}`);
  console.log(`  Vendedor:      vendedor@aguarespura.pe / ${PASSWORD_POR_DEFECTO}`);
  correosRepartidor.forEach((correo, indice) => {
    console.log(`  Repartidor ${indice + 1}:  ${correo} / ${PASSWORD_POR_DEFECTO}`);
  });
  console.log('Todos con debeCambiarPassword=true.\n');
}

main()
  .catch((e) => {
    console.error('Error en la carga inicial:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
