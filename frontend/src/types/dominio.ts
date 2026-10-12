/**
 * Tipos del dominio, alineados con los esquemas Zod y las consultas del
 * backend. Si un contrato cambia, el cambio se hace primero en el backend y
 * aquí; el compilador es la red de seguridad.
 */

// --- Envoltura de respuesta ---------------------------------------------

export interface Envoltura<T> {
  exito: true
  mensaje: string
  datos: T
  meta?: Record<string, unknown>
}

export interface Paginacion {
  pagina: number
  limite: number
  total: number
  totalPaginas: number
}

/** Resultado de un listado paginado, tal como lo devuelve `http.pagina`. */
export interface Pagina<T> {
  datos: T
  paginacion: Paginacion
}

// --- Sesión --------------------------------------------------------------

/** Nombre del rol tal como lo guarda la base de datos. */
export type NombreRol = 'ADMINISTRADOR' | 'VENDEDOR' | 'REPARTIDOR'

/** `GET /auth/perfil`: el `select` del backend, sin campos derivados. */
export interface Perfil {
  id: number
  nombres: string
  apellidos: string
  nombreCompleto: string
  email: string
  telefono: string | null
  activo: boolean
  ultimoAcceso: string | null
  debeCambiarPassword: boolean
  rol: { id: number; nombre: NombreRol; nivel: number }
}

/**
 * `POST /auth/login`.
 *
 * El resumen de sesión trae menos campos que `/auth/perfil`; por eso el
 * contexto consulta el perfil tras entrar en lugar de dar por bueno este
 * objeto como si fuera el perfil completo.
 */
export interface ResumenSesion {
  id: number
  nombreCompleto: string
  email: string
  rol: NombreRol
  debeCambiarPassword: boolean
}

export interface RespuestaLogin {
  tokenAcceso: string
  tokenRefresh: string
  /** '30d' si el usuario pidió recordar la sesión; si no, la del token. */
  expiraEn: string
  usuario: ResumenSesion
}

/** `POST /auth/refresh`: el backend solo emite un token nuevo de acceso. */
export interface RespuestaRefresh {
  tokenAcceso: string
}

// --- Clientes ------------------------------------------------------------

export type TipoCliente = 'PERSONA' | 'EMPRESA' | 'INSTITUCION'

export interface Cliente {
  id: number
  tipo: TipoCliente
  documento: string
  nombres: string | null
  razonSocial: string | null
  nombre: string
  telefono: string
  telefonoAlt: string | null
  email: string | null
  direccion: string
  referencia: string | null
  distrito: string | null
  limiteCredito: number
  notas: string | null
  activo: boolean
  fechaRegistro: string
  creadoEn: string
  eliminadoEn: string | null
  /** Presente en el listado y en el detalle: totales calculados por el backend. */
  totalPedidos?: number
  totalVentas?: number
  saldoPendiente?: number
}

/** Ficha ampliada que devuelve `GET /clientes/:id`. */
export interface ClienteDetalle extends Cliente {
  saldoBidones: number
  deudaTotal: number
  ventasRegistradas: number
  ultimosPedidos: {
    id: number
    codigo: string
    estado: EstadoPedido
    total: number
    registradoEn: string
    entregadoEn: string | null
  }[]
}

/** Resultado del autocompletado de clientes (`GET /clientes/buscar`). */
export interface ClienteRapido {
  id: number
  tipo: TipoCliente
  documento: string
  nombre: string
  telefono: string
  direccion: string
  referencia: string | null
}

// --- Productos e inventario ---------------------------------------------

export type UnidadMedida = string

export type NivelStock = 'AGOTADO' | 'BAJO' | 'NORMAL'

export interface Producto {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  unidadMedida: UnidadMedida
  precioVenta: number
  costoUnitario: number | null
  stock: number
  stockMinimo: number
  esRetornable: boolean
  activo: boolean
  creadoEn?: string
  eliminadoEn: string | null
}

/** Ficha ampliada que devuelve `GET /productos/:id`, con los últimos movimientos. */
export interface ProductoDetalle extends Producto {
  movimientosInventario: {
    id: number
    tipo: TipoMovimientoInventario
    cantidad: number
    stockAnterior: number
    stockResultante: number
    origen: string
    fecha: string
    usuario: { nombreCompleto: string } | null
  }[]
}

/** Campos mínimos que devuelve `GET /productos/activos` para los formularios. */
export interface ProductoFormulario {
  id: number
  codigo: string
  nombre: string
  unidadMedida: UnidadMedida
  precioVenta: number
  stock: number
  stockMinimo: number
  esRetornable: boolean
}

export type TipoMovimientoInventario = 'ENTRADA' | 'SALIDA' | 'AJUSTE'

export interface MovimientoInventario {
  id: number
  productoId: number
  producto?: { id: number; nombre: string; unidadMedida: string } | null
  usuarioId: number
  usuario?: { id: number; nombreCompleto: string } | null
  cantidad: number
  stockAnterior: number
  stockResultante: number
  pedidoId: number | null
  ventaId: number | null
  movimientoBidonId: number | null
  origen: string
  fecha: string
  observaciones: string | null
  tipo: TipoMovimientoInventario
  venta?: { id: number; numero: string } | null
  pedido?: { id: number; codigo: string } | null
}

// --- Pedidos -------------------------------------------------------------

export type EstadoPedido =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'ASIGNADO'
  | 'EN_RUTA'
  | 'ENTREGADO'
  | 'CANCELADO'

export type Canal = 'TELEFONO' | 'WHATSAPP' | 'MOSTRADOR' | 'OTRO'
export type ModalidadEntrega = 'DOMICILIO' | 'RECOJO'

/**
 * Transiciones de estado de un pedido.
 *
 * Es la misma tabla que aplica el backend. Mantenerla aquí evita ofrecer al
 * usuario un botón que el servidor va a rechazar: pedir "entregado" desde el
 * módulo de pedidos, por ejemplo, está prohibido a propósito, porque la entrega
 * la registra el repartidor con su hora real.
 */
export const TRANSICIONES_PEDIDO: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['ASIGNADO', 'CANCELADO'],
  ASIGNADO: ['EN_RUTA', 'CANCELADO'],
  EN_RUTA: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: ['PENDIENTE'],
}

export interface DetallePedido {
  id: number
  productoId: number
  producto?: {
    id: number
    codigo: string
    nombre: string
    unidadMedida: string
    esRetornable: boolean
    stock: number
  } | null
  cantidad: number
  precioUnitario: number
  subtotal: number
  observaciones: string | null
}

export interface Pedido {
  id: number
  codigo: string
  clienteId: number
  cliente?: {
    id: number
    nombre: string
    documento: string
    telefono: string
    direccion: string
    referencia: string | null
  } | null
  recibidoEn: string
  registradoEn: string
  confirmadoEn: string | null
  asignadoEn: string | null
  enRutaEn: string | null
  entregadoEn: string | null
  canceladoEn: string | null
  canal: Canal
  modalidadEntrega: ModalidadEntrega
  direccionEntrega: string
  referenciaEntrega: string | null
  fechaEntregaProgramada: string | null
  subtotal: number
  descuento: number
  total: number
  observaciones: string | null
  incidencias: string | null
  requiereCorreccion: boolean
  usuarioId: number
  usuario?: { id: number; nombreCompleto: string } | null
  estado: EstadoPedido
  detalles: DetallePedido[]
  venta?: VentaResumenPedido | null
  entrega?: Entrega | null
}

/** Datos mínimos de la ventacolgada de un pedido, sin el detalle de sus pagos. */
export interface VentaResumenPedido {
  id: number
  numero: string
  total: number
  totalPagado: number
  saldo: number
  estado: string
}

/** Ficha ampliada que devuelve `GET /pedidos/:id`. */
export interface PedidoDetalle extends Pedido {
  historial: HistorialPedido[]
  movimientosBidon: {
    id: number
    tipo: TipoMovimientoBidon
    cantidad: number
    saldoAnterior: number
    saldoResultante: number
    observaciones: string | null
    producto: { nombre: string }
  }[]
  venta: (VentaResumenPedido & {
    pagos: { id: number; monto: number; metodo: string; referencia: string | null; fecha: string; estado: string }[]
  }) | null
}

/** Entrada del historial de estados de un pedido. */
export interface HistorialPedido {
  id: number
  pedidoId: number
  estadoAnterior: string | null
  estadoNuevo: string | null
  descripcion: string
  observaciones: string | null
  incidencia: string | null
  fecha: string
  usuario: {
    nombreCompleto: string
    rol: { nombre: string } | null
  } | null
}

export interface HistorialEstado {
  id: number
  entidadId: number
  codigo: string | null
  estadoAnterior: string | null
  estadoNuevo: string | null
  descripcion: string
  observaciones: string | null
  incidencia: string | null
  usuarioId: number
  usuario?: { id: number; nombre: string; rol?: NombreRol }
  fecha: string
}

// --- Ventas --------------------------------------------------------------

export type EstadoVenta = 'PENDIENTE' | 'COMPLETADA' | 'ANULADA'
export type MetodoPago = 'EFECTIVO' | 'YAPE' | 'TRANSFERENCIA' | 'OTRO'
export interface DetalleVenta {
  id: number
  productoId: number
  producto?: {
    id: number
    codigo: string
    nombre: string
    unidadMedida: string
    esRetornable: boolean
  } | null
  cantidad: number
  precioUnitario: number
  subtotal: number
  costoUnitario: number | null
}

/** Pedido resumido dentro de una venta, con la entrega si ya ocurrió. */
export interface PedidoDeVenta {
  id: number
  codigo: string
  estado: EstadoPedido
  canal: Canal
  modalidadEntrega: ModalidadEntrega
  direccionEntrega: string
  entregadoEn: string | null
  entrega?: {
    id: number
    repartidorId: number
    estado: EstadoEntrega
    horaSalida: string | null
    horaEntrega: string | null
    recibeFirma: boolean | null
    repartidor: { id: number; nombre: string; documento: string } | null
  } | null
}

export interface Venta {
  id: number
  numero: string
  pedidoId: number
  pedido?: PedidoDeVenta | null
  clienteId: number
  cliente?: {
    id: number
    nombre: string
    documento: string
    telefono: string
    direccion: string
  } | null
  usuarioId: number
  usuario?: { id: number; nombreCompleto: string } | null
  fecha: string
  subtotal: number
  descuento: number
  total: number
  totalPagado: number
  saldo: number
  estado: EstadoVenta
  constanciaEmitida: boolean
  constanciaCodigo: string | null
  constanciaEmitidaEn: string | null
  observaciones: string | null
  anuladaEn: string | null
  motivoAnulacion: string | null
  detalles: DetalleVenta[]
  pagos: Pago[]
}

/** Ficha ampliada de una venta: añade los movimientos de inventario que generó. */
export interface VentaDetalle extends Venta {
  movimientosInventario: {
    id: number
    tipo: TipoMovimientoInventario
    cantidad: number
    stockAnterior: number
    stockResultante: number
    origen: string
    fecha: string
    producto: { nombre: string } | null
  }[]
}

export interface Pago {
  id: number
  ventaId: number
  venta?: {
    id: number
    numero: string
    total: number
    totalPagado: number
    saldo: number
    estado: EstadoVenta
    cliente: {
      id: number
      nombre: string
      documento: string
      telefono: string
    } | null
  } | null
  monto: number
  metodo: MetodoPago
  referencia: string | null
  fecha: string
  creadoEn: string
  recibidoPor: { id: number; nombreCompleto: string } | null
  observaciones: string | null
  estado: 'REGISTRADO' | 'ANULADO'
  anuladoEn: string | null
  motivoAnulacion: string | null
}

// --- Entregas ------------------------------------------------------------

export type EstadoEntrega =
  | 'PENDIENTE'
  | 'ASIGNADA'
  | 'EN_RUTA'
  | 'ENTREGADA'
  | 'NO_ENTREGADO'
  | 'CANCELADA'

/**
 * Transiciones de una entrega, idénticas a la tabla del backend.
 *
 * El repartidor solo ofrece las salidas que su estado permite: desde ASIGNADA
 * se sale a ruta, y desde EN_RUTA se cierra como entregada o no entregada.
 */
export const TRANSICIONES_ENTREGA: Record<EstadoEntrega, EstadoEntrega[]> = {
  PENDIENTE: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA: ['EN_RUTA', 'CANCELADA'],
  EN_RUTA: ['ENTREGADA', 'NO_ENTREGADO', 'CANCELADA'],
  ENTREGADA: [],
  NO_ENTREGADO: ['EN_RUTA', 'CANCELADA'],
  CANCELADA: ['PENDIENTE'],
}

export interface Entrega {
  id: number
  pedidoId: number
  pedido?: {
    id: number
    codigo: string
    estado: EstadoPedido
    total: number
    direccionEntrega: string
    cliente?: { id: number; nombre: string; telefono: string; distrito: string | null }
    detalles?: DetallePedido[]
  }
  repartidorId: number
  repartidor?: { id: number; nombre: string; telefono: string }
  fechaAsignacion: string
  horaSalida: string | null
  horaEntrega: string | null
  minutosDemora: number | null
  bidonesEntregados: number
  bidonesDevueltos: number
  montoRecibido: number
  observaciones: string | null
  motivoNoEntrega: string | null
  recibeFirma: boolean
  estado: EstadoEntrega
}

export interface Repartidor {
  id: number
  nombres: string
  apellidos: string
  nombre: string
  documento: string
  telefono: string
  direccion: string | null
  zona: string | null
  activo: boolean
  fechaRegistro: string
  eliminadoEn: string | null
}

// --- Envases (bidones) ---------------------------------------------------

export type TipoMovimientoBidon = 'ENTREGA' | 'DEVOLUCION' | 'PERDIDA' | 'AJUSTE'

export interface MovimientoBidon {
  id: number
  clienteId: number | null
  cliente?: { id: number; nombre: string } | null
  productoId: number
  producto?: { id: number; nombre: string } | null
  pedidoId: number | null
  pedido?: { id: number; codigo: string } | null
  entregaId: number | null
  repartidorId: number | null
  repartidor?: { id: number; nombre: string } | null
  usuarioId: number
  usuario?: { id: number; nombreCompleto: string } | null
  cantidad: number
  saldoAnterior: number
  saldoResultante: number
  fecha: string
  observaciones: string | null
  tipo: TipoMovimientoBidon
}

export interface SaldoBidon {
  clienteId: number
  cliente: {
    id: number
    nombre: string
    documento: string
    telefono: string
    distrito: string | null
  } | null
  productoId: number
  producto: { id: number; nombre: string; esRetornable: boolean } | null
  saldo: number
}

// --- Tablero -------------------------------------------------------------

export interface ResumenTablero {
  fecha: string
  ventas: {
    hoy: { cantidad: number; total: number; cobrado: number }
    ayer: { cantidad: number; total: number }
  }
  pedidos: {
    hoy: number
    ayer: number
    porEstado: Record<string, number>
    pendientes: number
    entregados: number
    cancelados: number
  }
  ingresos: {
    cobradoHoy: number
    porCobrar: number
    ventasConSaldo: number
  }
  pagosPorMetodo: { metodo: string; total: number; cantidad: number }[]
  productosVendidosHoy: number
  inventario: {
    totalProductos: number
    productosAgotados: number
    productosStockBajo: number
    valorTotalCosto: number
    alertas: { id: number; nombre: string; stock: number; stockMinimo: number }[]
  }
  bidones: { pendientesDeDevolucion: number }
  entregas: { enCurso: number }
  ultimasVentas: Venta[]
  ultimosPedidos: Pedido[]
}

export interface SerieVentas {
  fecha: string
  ventas: number
  cobrado: number
  pedidos: number
  entregados: number
}

export interface ProductoVendido {
  productoId: number
  nombre: string
  cantidad: number
  importe: number
}

/** Fila de inventario con los campos derivados que calcula el backend. */
export interface FilaInventario {
  id: number
  codigo: string
  nombre: string
  unidadMedida: string
  stock: number
  stockMinimo: number
  esRetornable: boolean
  precioVenta: number
  costoUnitario: number | null
  activo: boolean
  valorInventarioCosto: number
  stockBajo: boolean
  nivelStock: NivelStock
}

// --- Indicadores ---------------------------------------------------------

export interface IndicadoresProceso {
  periodo: { fechaInicio: string | null; fechaFin: string | null }
  muestra: {
    pedidos: number
    ventas: number
    pagos: number
    entregas: number
    clientes: number
  }
  recepcionYRegistro: {
    tiempoPromedioRegistroMin: number
    porcentajePedidosRegistradosCorrectamente: number
    porcentajePedidosConErrores: number
  }
  procesamientoYControl: {
    tiempoPromedioProcesamientoVentaMin: number
    porcentajeVentasProcesadasCorrectamente: number
    porcentajeVentasConErrores: number
    porcentajeVentasConPagoRegistrado: number
    porcentajeActualizacionCorrectaStock: number
  }
  atencionYSeguimiento: {
    tiempoPromedioConfirmacionYAsignacionMin: number
    tiempoPromedioCicloCompletoMin: number
    porcentajePedidosAtendidosCorrectamente: number
    porcentajePedidosConTrazabilidadCompleta: number
    porcentajeEntregasRealizadas: number
  }
  complementarios: {
    porcentajeClientesConDatosCompletos: number
    porcentajeEnvasesConInformacionCompleta: number
    tiempoPromedioConsultaHistorialEnvasesMin: number
    tiempoPromedioConsultaEnvasesSegundos: number
    tiempoPromedioConsolidadoDiarioSegundos: number
  }
}

/** Variable independiente: adecuación, eficiencia y fiabilidad del sistema. */
export interface IndicadoresSistema {
  periodo: { fechaInicio: string; fechaFin: string }
  adecuacionFuncional: {
    porcentajeRequisitosImplementadosYApruebados: number
    totalRequisitos: number
    requisitosAprobados: number
    porcentajeCasosDePruebaSuperados: number
    totalCasosEjecutados: number
    casosAprobados: number
    casosFallidos: number
    porcentajeTransaccionesConResultadoEsperado: number
  }
  eficienciaDesempeno: {
    tiempoRespuestaPromedioMs: number
    tiempoRespuestaMedianaMs: number
    tiempoRespuestaP95Ms: number
    tiempoRespuestaP99Ms: number
    rendimientoTransaccionesPorMinuto: number
    picoTransaccionesPorMinuto: number
    totalPeticiones: number
    duracionPromedioPorRuta: { ruta: string; promedioMs: number; maximoMs: number; peticiones: number }[]
  }
  fiabilidad: {
    porcentajeSolicitudesFallidas: number
    solicitudesFallidas: number
    tiempoMedioRecuperacionMin: number
    incidenciasRegistradas: number
    incidenciasResueltas: number
    minutosTotalesDeIndisponibilidad: number
    porcentajeDisponibilidadObservado: number
  }
}

/**
 * Ficha del pretest.
 *
 * El pretest se midió sobre el proceso manual con la ficha de observación de la
 * tesis y lo analiza el investigador fuera del sistema. Aquí no hay ninguna
 * línea base guardada: el backend devuelve un objeto vacío y todos los campos
 * son opcionales. Lo que se escriba en la pantalla es una transcripción de esa
 * ficha, no un dato del sistema, por eso no se persiste ni se precarga.
 *
 * Un campo ausente o `null` se muestra como "sin dato". Nunca como 0: un cero
 * sería un tiempo medido de cero, que es una afirmación distinta de "no se
 * midió".
 */
export interface ParametrosPretest {
  tiempoRegistroMin?: number | null
  tiempoProcesamientoVentaMin?: number | null
  tiempoConfirmacionAsignacionMin?: number | null
  porcentajePedidosCorrectos?: number | null
  porcentajeVentasCorrectas?: number | null
  porcentajeVentasConErrores?: number | null
  porcentajePedidosAtendidos?: number | null
  porcentajePedidosConErrores?: number | null
  porcentajeTrazabilidadCompleta?: number | null
}

/**
 * Línea base del pretest guardada en el sistema.
 *
 * Los nueve valores más la procedencia que los hace auditable: quién los
 * transcribió de la ficha de observación y cuándo. `registrada: false`
 * significa que todavía no se midió el proceso manual, que es distinto de
 * haberlo medido y obtenido cero.
 */
export interface RegistroLineaBase extends ParametrosPretest {
  registrada: boolean
  creadoPor: string | null
  creadoEn: string | null
  actualizadoPor: string | null
  actualizadoEn: string | null
}

export interface ComparacionIndicador {
  antes: number | null
  despues: number
  unidad: string
  diferencia: number | null
  variacionPorcentual: number | null
}

/**
 * Las nueve filas del comparativo, una por indicador del proceso de ventas.
 *
 * Incluye los dos indicadores de «con errores», que también se midieron en el
 * pretest y deben aparecer en la comparación.
 */
export interface ComparativoIndicadores {
  pretest: ParametrosPretest
  postest: IndicadoresProceso
  sistema: IndicadoresSistema
  comparacion: {
    tiempoPromedioRegistro: ComparacionIndicador
    porcentajePedidosRegistradosCorrectamente: ComparacionIndicador
    porcentajePedidosConErroresDeRegistro: ComparacionIndicador
    tiempoPromedioProcesamientoVenta: ComparacionIndicador
    porcentajeVentasProcesadasCorrectamente: ComparacionIndicador
    porcentajeVentasConErrores: ComparacionIndicador
    tiempoPromedioConfirmacionYAsignacion: ComparacionIndicador
    porcentajePedidosAtendidosCorrectamente: ComparacionIndicador
    porcentajePedidosConTrazabilidadCompleta: ComparacionIndicador
  }
}

// --- Reportes ------------------------------------------------------------

export type ClaveReporte =
  | 'ventas'
  | 'pedidos'
  | 'pagos'
  | 'entregas'
  | 'clientes'
  | 'bidones'
  | 'inventario'
  | 'tiempos-proceso'
  | 'diario'
  | 'costo-consultas'

/**
 * Fila genérica de reporte.
 *
 * Todos los reportes comparten `periodo` y `resumen`, pero cada uno añade sus
 * propias listas. Se tipa como `Record<string, unknown>` a propósito: el
 * contenido exacto depende del reporte elegido y se lee por clave en la
 * pantalla, no con un contrato cerrado que obligaría a duplicarlo nueve veces.
 */
export type FilaReporte = Record<string, unknown>

// --- Usuarios y roles ----------------------------------------------------

/** `SELECT_USUARIO`: los campos planos que devuelve el backend. */
export interface Usuario {
  id: number
  nombres: string
  apellidos: string
  nombreCompleto: string
  email: string
  documento: string | null
  telefono: string | null
  activo: boolean
  ultimoAcceso: string | null
  debeCambiarPassword: boolean
  creadoEn: string
  eliminadoEn: string | null
  rol: { id: number; nombre: NombreRol; nivel: number; activo: boolean }
}

/** Cuerpo de alta de un usuario. El password solo viaja en la creación. */
export interface DatosUsuario {
  nombres: string
  apellidos: string
  email: string
  documento?: string | null
  telefono?: string | null
  password?: string
  rolId: number
  activo: boolean
  debeCambiarPassword: boolean
}

/** La actualización nunca cambia la contraseña: eso tiene su propio endpoint. */
export type CambiosUsuario = Partial<Omit<DatosUsuario, 'password'>>

export interface Rol {
  id: number
  nombre: NombreRol
  descripcion: string | null
  nivel: number
  activo: boolean
  /** Presente en `GET /usuarios/roles`, que cuenta usuarios por rol. */
  _count?: { usuarios: number }
}

// --- Incidencias ---------------------------------------------------------

export type EstadoIncidencia = 'ABIERTA' | 'EN_PROCESO' | 'RESUELTA' | 'DESCARTADA'

export interface Incidencia {
  id: number
  codigo: string
  titulo: string
  descripcion: string | null
  pasosReproduccion: string | null
  modulo: string | null
  severidad: number
  estado: EstadoIncidencia
  inicio: string
  fin: string | null
  duracionMinutos: number | null
  solucion: string | null
  reportadoPorId: number | null
  resueltoPorId: number | null
}
