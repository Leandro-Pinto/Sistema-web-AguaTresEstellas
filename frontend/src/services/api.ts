import { http } from './http'
import type {
  CambiosUsuario,
  Envoltura,
  ClaveReporte,
  Cliente,
  ClienteDetalle,
  ClienteRapido,
  ComparativoIndicadores,
  DatosUsuario,
  Entrega,
  EstadoEntrega,
  EstadoPedido,
  FilaInventario,
  FilaReporte,
  HistorialEstado,
  HistorialPedido,
  Incidencia,
  IndicadoresProceso,
  IndicadoresSistema,
  MovimientoBidon,
  MetodoPago,
  MovimientoInventario,
  ParametrosPretest,
  Pago,
  Pedido,
  PedidoDetalle,
  Perfil,
  Producto,
  ProductoDetalle,
  ProductoFormulario,
  ProductoVendido,
  Repartidor,
  RegistroLineaBase,
  ResumenTablero,
  Rol,
  SaldoBidon,
  SerieVentas,
  Usuario,
  Venta,
  VentaDetalle,
} from '@/types/dominio'

/**
 * Capa de acceso a la API, agrupada por módulo.
 *
 * Cada función declara los parámetros que el backend acepta en esa ruta. Se
 * replican los nombres exactos de los esquemas Zod: si aquí se inventara un
 * `fechaDesde` donde el servidor espera `fechaInicio`, la petición no fallaría
 * con un error visible, simplemente filtraría por más cosas de las debidas, y
 * el reporte mostraría datos que nadie pidió.
 */

export type Parametro = string | number | boolean | null | undefined

/** Parámetros comunes a todos los listados paginados. */
export interface ConsultaPaginada {
  pagina?: number
  limite?: number
  orden?: 'asc' | 'desc'
  busqueda?: string
}

/** Rango de fechas que comparten ventas, pagos, pedidos, entregas y reportes. */
export interface ConsultaPeriodo {
  fechaInicio?: string
  fechaFin?: string
}

const sinVacios = (params: Record<string, Parametro>): Record<string, Parametro> => {
  const limpio: Record<string, Parametro> = {}
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue
    limpio[clave] = valor
  }
  return limpio
}

// --- Sesión ---------------------------------------------------------------

export interface DatosPerfil {
  nombres?: string
  apellidos?: string
  telefono?: string | null
  email?: string
}

/**
 * `GET /salud`: público y sin sesión.
 *
 * Se consulta una sola vez al montar la aplicación para saber si lo que se
 * está viendo son datos reales o de demostración. La cinta que rotula la
 * demostración se apoya en el entorno que declara el servidor, no en una
 * variable del frontend: así no se puede mostrar sin que el backend lo diga.
 *
 * Va fuera del prefijo `/api` porque el backend monta la salud en la raíz,
 * donde la consulta un monitor externo que no conoce la API de negocio. Ese
 * endpoint responde 503 si la base de datos no está disponible, así que aquí
 * cualquier respuesta distinta de 200 devuelve `null`, y una cinta que no se
 * pudo leer es lo mismo que no tener cinta.
 */
export interface SaludSistema {
  estado: string
  baseDeDatos: string
  entorno: 'prod' | 'demo' | 'test'
  version: string
  horaServidor: string
}

export const consultarSalud = async (): Promise<SaludSistema | null> => {
  try {
    const respuesta = await fetch('/salud')
    if (!respuesta.ok) return null
    const cuerpo = (await respuesta.json()) as Envoltura<SaludSistema>
    return cuerpo.datos ?? null
  } catch {
    return null
  }
}

export const auth = {
  perfil: () => http.get<Perfil>('/auth/perfil'),
  logout: () => http.post<null>('/auth/logout'),
  /** Devuelve el `SELECT_USUARIO` completo, no solo el perfil propio. */
  actualizarPerfil: (datos: DatosPerfil) => http.put<Usuario>('/auth/perfil', datos),
  /**
   * `sinRenovar` es deliberado: el backend responde 401 cuando la contraseña
   * actual es incorrecta. Sin esta opción, la capa HTTP interpretaría ese 401
   * como una sesión caducada, gastaría un token de renovación y reintentaría
   * la misma petición, para volver a recibir el mismo error.
   */
  cambiarPassword: (passwordActual: string, passwordNueva: string) =>
    http.post<null>('/auth/cambiar-password', { passwordActual, passwordNueva }, { sinRenovar: true }),
}

// --- Tablero --------------------------------------------------------------

export const tablero = {
  resumen: () => http.get<ResumenTablero>('/tablero'),
  indicadores: () => http.get<IndicadoresProceso>('/tablero/indicadores'),
  seriesVentas: (dias?: number) => http.get<SerieVentas[]>('/tablero/series-ventas', { params: { dias } }),
  productosMasVendidos: (dias?: number) =>
    http.get<ProductoVendido[]>('/tablero/productos-mas-vendidos', { params: { dias } }),
  /** Solo administradores y vendedores: el repartidor no ve saldos ajenos. */
  alertasBidones: () => http.get<unknown>('/tablero/alertas-bidones'),
}

// --- Clientes -------------------------------------------------------------

/** Cuerpo de alta y edición de clientes, según `crearClienteSchema`. */
export interface DatosCliente {
  tipo: 'PERSONA' | 'EMPRESA' | 'INSTITUCION'
  documento: string
  nombres?: string | null
  razonSocial?: string | null
  telefono: string
  telefonoAlt?: string | null
  email?: string | null
  direccion: string
  referencia?: string | null
  distrito?: string | null
  limiteCredito?: number
  notas?: string | null
  activo?: boolean
}

export const clientes = {
  listar: (
    consulta: ConsultaPaginada & {
      activo?: 'true' | 'false' | 'todos'
      distrito?: string
      tipo?: 'PERSONA' | 'EMPRESA' | 'INSTITUCION' | 'todos'
      soloConSaldo?: 'true' | 'false'
      incluirEliminados?: 'true' | 'false'
    } = {},
  ) => http.pagina<Cliente[]>('/clientes', sinVacios({ ...consulta })),
  /** Autocompletado al registrar un pedido. El backend exige 2 caracteres. */
  buscar: (termino: string, limite?: number, opciones: { signal?: AbortSignal } = {}) =>
    http.get<ClienteRapido[]>('/clientes/buscar', {
      params: sinVacios({ termino, limite }),
      ...opciones,
    }),
  distritos: () => http.get<string[]>('/clientes/distritos'),
  obtener: (id: number) => http.get<ClienteDetalle>(`/clientes/${id}`),
  crear: (datos: DatosCliente) => http.post<Cliente>('/clientes', datos),
  actualizar: (id: number, datos: Partial<DatosCliente>) =>
    http.put<Cliente>(`/clientes/${id}`, datos),
  cambiarEstado: (id: number, activo: boolean) =>
    http.patch<Cliente>(`/clientes/${id}/estado`, { activo }),
  eliminar: (id: number) => http.delete<null>(`/clientes/${id}`),
  restaurar: (id: number) => http.post<null>(`/clientes/${id}/restaurar`),
}

// --- Productos e inventario ----------------------------------------------

/**
 * Cuerpo de alta y edición de productos, según `crearProductoSchema`.
 *
 * `stockInicial` solo existe en el alta: después el stock se mueve por
 * movimientos de inventario y editarlo desde aquí falsearía la trazabilidad.
 */
export interface DatosProducto {
  codigo: string
  nombre: string
  descripcion?: string | null
  unidadMedida?: string | null
  precioVenta: number
  costoUnitario?: number | null
  stockInicial?: number
  stockMinimo?: number
  esRetornable?: boolean
  activo?: boolean
}

/**
 * Movimiento de inventario. Es una unión discriminada por `tipo` porque el
 * backend valida el mismo esquema: un ajuste no lleva cantidad sino el stock
 * final deseado, y exige que el motivo esté justificado.
 */
export type MovimientoInventarioInput =
  | {
      tipo: 'ENTRADA'
      productoId: number
      cantidad: number
      origen: string
      observaciones?: string | null
    }
  | {
      tipo: 'SALIDA'
      productoId: number
      cantidad: number
      origen: string
      observaciones?: string | null
    }
  | {
      tipo: 'AJUSTE'
      productoId: number
      stockFinal: number
      origen: 'AJUSTE MANUAL'
      observaciones: string
    }

export const productos = {
  listar: (
    consulta: ConsultaPaginada & {
      activo?: 'true' | 'false' | 'todos'
      incluirEliminados?: 'true' | 'false'
      esRetornable?: 'true' | 'false' | 'todos'
        soloStockBajo?: 'true' | 'false'
      } = {},
    signal?: AbortSignal,
  ) => http.pagina<Producto[]>('/productos', sinVacios({ ...consulta }), { signal }),
  /** Listado ligero para los formularios de pedido y venta. */
  activos: () => http.get<ProductoFormulario[]>('/productos/activos'),
  obtener: (id: number) => http.get<ProductoDetalle>(`/productos/${id}`),
  crear: (datos: DatosProducto) => http.post<Producto>('/productos', datos),
  actualizar: (id: number, datos: Partial<DatosProducto>) =>
    http.put<Producto>(`/productos/${id}`, datos),
  cambiarEstado: (id: number, activo: boolean) =>
    http.patch<Producto>(`/productos/${id}/estado`, { activo }),
  eliminar: (id: number) => http.delete<Producto>(`/productos/${id}`),
  restaurar: (id: number) => http.post<Producto>(`/productos/${id}/restaurar`),
  /** Inventario con los campos derivados (`stockBajo`, `nivelStock`). */
  verInventario: () => http.get<FilaInventario[]>('/productos/inventario'),
  listarMovimientos: (
    consulta: ConsultaPaginada & {
      productoId?: number
      tipo?: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'todos'
      fechaInicio?: string
      fechaFin?: string
    } = {},
  ) =>
    http.pagina<MovimientoInventario[]>(
      '/productos/inventario/movimientos',
      sinVacios({ ...consulta }),
    ),
  obtenerMovimiento: (id: number) =>
    http.get<MovimientoInventario>(`/productos/inventario/movimientos/${id}`),
  registrarMovimiento: (datos: MovimientoInventarioInput) =>
    http.post<MovimientoInventario>('/productos/inventario/movimientos', datos),
}

// --- Pedidos --------------------------------------------------------------

export interface DetallePedidoInput {
  productoId: number
  cantidad: number
  observaciones?: string | null
}

export interface DatosPedido {
  clienteId: number
  /** Hora en que el cliente solicitó el pedido. El backend guarda aparte la
   *  hora de registro: la diferencia entre ambas es el indicador TPRP. */
  recibidoEn: string
  canal?: 'TELEFONO' | 'WHATSAPP' | 'MOSTRADOR' | 'OTRO'
  modalidadEntrega?: 'DOMICILIO' | 'RECOJO'
  direccionEntrega: string
  referenciaEntrega?: string | null
  fechaEntregaProgramada?: string | null
  detalles: DetallePedidoInput[]
  descuento?: number
  observaciones?: string | null
  /** Incidencia detectada al tomar el pedido; alimenta el indicador de
   *  errores de registro, así que se captura tal cual la reporta el cliente. */
  incidencias?: string | null
  requiereCorreccion?: boolean
  /** Confirmar en el mismo paso reduce el tiempo de proceso. */
  confirmar?: boolean
}

export const pedidos = {
  listar: (
    consulta: ConsultaPaginada &
      ConsultaPeriodo & {
        clienteId?: number
        repartidorId?: number
        usuarioId?: number
        estado?: 'PENDIENTE' | 'CONFIRMADO' | 'ASIGNADO' | 'EN_RUTA' | 'ENTREGADO' | 'CANCELADO' | 'todos'
        canal?: 'TELEFONO' | 'WHATSAPP' | 'MOSTRADOR' | 'OTRO' | 'todos'
        requiereCorreccion?: 'true' | 'false' | 'todos'
      } = {},
    signal?: AbortSignal,
  ) => http.pagina<Pedido[]>('/pedidos', sinVacios({ ...consulta }), { signal }),
  conteoEstados: () => http.get<Record<string, number>>('/pedidos/conteo-estados'),
  obtener: (id: number) => http.get<PedidoDetalle>(`/pedidos/${id}`),
  historial: (id: number) => http.get<HistorialPedido[]>(`/pedidos/${id}/historial`),
  crear: (datos: DatosPedido) => http.post<Pedido>('/pedidos', datos),
  /**
   * Actualizar toma un subconjunto de los campos de creación. Se declara
   * aparte en vez de derivarlo con `Parameters<...>[0]`: la propia referencia
   * cruzada haría que TypeScript no pudiera inferir el tipo de `pedidos`.
   */
  actualizar: (id: number, datos: Partial<DatosPedido>) => http.put<Pedido>(`/pedidos/${id}`, datos),
  cambiarEstado: (
    id: number,
    estado: 'PENDIENTE' | 'CONFIRMADO' | 'ASIGNADO' | 'EN_RUTA' | 'ENTREGADO' | 'CANCELADO',
    extra: { observaciones?: string | null; motivo?: string | null } = {},
  ) => http.patch<Pedido>(`/pedidos/${id}/estado`, { estado, ...extra }),
}

// --- Ventas ---------------------------------------------------------------

export const ventas = {
  listar: (
    consulta: ConsultaPaginada &
      ConsultaPeriodo & {
        clienteId?: number
        pedidoId?: number
        usuarioId?: number
        estado?: 'PENDIENTE' | 'COMPLETADA' | 'ANULADA' | 'todos'
        soloConSaldo?: 'true' | 'false'
        soloSinConstancia?: 'true' | 'false'
      } = {},
    signal?: AbortSignal,
  ) => http.pagina<Venta[]>('/ventas', sinVacios({ ...consulta }), { signal }),
  obtener: (id: number) => http.get<VentaDetalle>(`/ventas/${id}`),
  historial: (id: number) => http.get<HistorialEstado[]>(`/ventas/${id}/historial`),
  constancia: (id: number) => http.get<unknown>(`/ventas/${id}/constancia`),
  /** `pagoInicial` registra el cobro en el mismo paso: es lo habitual. */
  crear: (datos: {
    pedidoId: number
    descuento?: number
    observaciones?: string | null
    pagoInicial?: {
      monto: number
      metodo: 'EFECTIVO' | 'YAPE' | 'TRANSFERENCIA' | 'OTRO'
      referencia?: string | null
      observaciones?: string | null
    } | null
  }) => http.post<Venta>('/ventas', datos),
  anular: (id: number, motivo: string, reponerInventario = true) =>
    http.post<Venta>(`/ventas/${id}/anular`, { motivo, reponerInventario }),
  emitirConstancia: (id: number, observaciones?: string | null) =>
    http.post<Venta>(`/ventas/${id}/emitir-constancia`, { observaciones }),
}

// --- Pagos ----------------------------------------------------------------

export const pagos = {
  listar: (
    consulta: ConsultaPaginada &
      ConsultaPeriodo & {
        ventaId?: number
        clienteId?: number
        metodo?: MetodoPago | 'todos'
        estado?: 'PENDIENTE' | 'REGISTRADO' | 'ANULADO' | 'todos'
      } = {},
  ) => http.pagina<Pago[]>('/pagos', sinVacios({ ...consulta })),
  resumenPorMetodo: (consulta: ConsultaPeriodo = {}, signal?: AbortSignal) =>
    http.get<{ metodo: string; total: number; cantidad: number }[]>(
      '/pagos/resumen-metodo',
      { params: sinVacios({ ...consulta }), signal },
    ),
  obtener: (id: number) => http.get<Pago>(`/pagos/${id}`),
  crear: (datos: {
    ventaId: number
    monto: number
    metodo: MetodoPago
    referencia?: string | null
    observaciones?: string | null
    fecha?: string
  }) => http.post<Pago>('/pagos', datos),
  anular: (id: number, motivo: string) => http.post<Pago>(`/pagos/${id}/anular`, { motivo }),
}

// --- Repartidores ---------------------------------------------------------

export const repartidores = {
  listar: (
    consulta: ConsultaPaginada & {
      activo?: 'true' | 'false' | 'todos'
      zona?: string
      incluirEliminados?: 'true' | 'false'
    } = {},
  ) => http.pagina<Repartidor[]>('/entregas/repartidores', sinVacios({ ...consulta })),
  activos: () => http.get<Repartidor[]>('/entregas/repartidores/activos'),
  zonas: () => http.get<string[]>('/entregas/repartidores/zonas'),
  obtener: (id: number) => http.get<Repartidor>(`/entregas/repartidores/${id}`),
  crear: (datos: Partial<Repartidor> & { nombres: string; apellidos: string; documento: string; telefono: string }) =>
    http.post<Repartidor>('/entregas/repartidores', datos),
  actualizar: (id: number, datos: Partial<Repartidor>) =>
    http.put<Repartidor>(`/entregas/repartidores/${id}`, datos),
  cambiarEstado: (id: number, activo: boolean) =>
    http.patch<Repartidor>(`/entregas/repartidores/${id}/estado`, { activo }),
  eliminar: (id: number) => http.delete<null>(`/entregas/repartidores/${id}`),
  restaurar: (id: number) => http.post<null>(`/entregas/repartidores/${id}/restaurar`),
}

// --- Entregas -------------------------------------------------------------

export type EstadoEntregaFiltro =
  | 'PENDIENTE'
  | 'ASIGNADA'
  | 'EN_RUTA'
  | 'ENTREGADA'
  | 'NO_ENTREGADO'
  | 'CANCELADA'
  | 'todos'

export const entregas = {
  /**
   * Ruta del repartidor. El backend solo acepta `pagina`, `limite` y `estado`:
   * enviar otros filtros lo rechazaría con un 422.
   */
  misEntregas: (
    consulta: Partial<{ pagina: number; limite: number; estado: EstadoEntregaFiltro }> = {},
  ) => http.pagina<Entrega[]>('/entregas/mis-entregas', sinVacios({ ...consulta })),
  listar: (
    consulta: ConsultaPaginada &
      ConsultaPeriodo & {
        repartidorId?: number
        pedidoId?: number
        estado?: EstadoEntregaFiltro
      } = {},
  ) => http.pagina<Entrega[]>('/entregas/entregas', sinVacios({ ...consulta })),
  carga: () => http.get<unknown>('/entregas/entregas/carga'),
  obtener: (id: number) => http.get<Entrega>(`/entregas/entregas/${id}`),
  historial: (id: number) => http.get<HistorialEstado[]>(`/entregas/entregas/${id}/historial`),
  registrar: (datos: { pedidoId: number; repartidorId: number; observaciones?: string | null }) =>
    http.post<Entrega>('/entregas/entregas', datos),
  /**
   * `estado` es obligatorio: la validación lo exige en cada actualización,
   * porque es el evento que mueve la entrega en el circuito.
   */
  actualizar: (
    id: number,
    datos: {
      estado: 'PENDIENTE' | 'ASIGNADA' | 'EN_RUTA' | 'ENTREGADA' | 'NO_ENTREGADO' | 'CANCELADA'
      horaSalida?: string | null
      horaEntrega?: string | null
      minutosDemora?: number | null
      bidonesEntregados?: number
      bidonesDevueltos?: number
      montoRecibido?: number
      motivoNoEntrega?: string | null
      observaciones?: string | null
      recibeFirma?: boolean
      devoluciones?: {
        clienteId: number
        productoId: number
        cantidad: number
        observaciones?: string | null
      }[]
    },
  ) => http.put<Entrega>(`/entregas/entregas/${id}`, datos),
}

// --- Envases (bidones) ----------------------------------------------------

export type MovimientoBidonInput =
  | {
      tipo: 'ENTREGA' | 'DEVOLUCION'
      clienteId: number
      productoId: number
      cantidad: number
      pedidoId?: number
      entregaId?: number
      repartidorId?: number
      observaciones?: string | null
    }
  | {
      tipo: 'PERDIDA'
      productoId: number
      cantidad: number
      clienteId?: number | null
      observaciones: string
    }
  | {
      tipo: 'AJUSTE'
      productoId: number
      cantidad: number
      signo?: '1' | '-1'
      clienteId?: number | null
      observaciones: string
    }

export const bidones = {
  saldos: (
    consulta: ConsultaPaginada & { productoId?: number; soloConSaldo?: 'true' | 'false' } = {},
  ) => http.pagina<SaldoBidon[]>('/bidones/saldos', sinVacios({ ...consulta })),
  saldoTotal: () => http.get<{ totalBidones: number }>('/bidones/saldos/total'),
  saldoCliente: (clienteId: number, productoId?: number) =>
    http.get<number>(`/bidones/clientes/${clienteId}/saldo`, { params: sinVacios({ productoId }) }),
  movimientos: (
    consulta: ConsultaPaginada &
      ConsultaPeriodo & {
        clienteId?: number
        productoId?: number
        pedidoId?: number
        repartidorId?: number
        tipo?: 'ENTREGA' | 'DEVOLUCION' | 'PERDIDA' | 'AJUSTE' | 'todos'
      } = {},
  ) => http.pagina<MovimientoBidon[]>('/bidones/movimientos', sinVacios({ ...consulta })),
  historialCliente: (clienteId: number) =>
    http.get<unknown>(`/bidones/clientes/${clienteId}/historial`),
  /** Variante que además registra la consulta para medir el tiempo de respuesta. */
  historialConsulta: (clienteId: number) =>
    http.get<unknown>(`/bidones/clientes/${clienteId}/historial-consulta`),
  registrar: (datos: MovimientoBidonInput) => http.post<MovimientoBidon>('/bidones/movimientos', datos),
}

// --- Usuarios y roles -----------------------------------------------------

export const usuarios = {
  listar: (
    consulta: ConsultaPaginada & {
      rolId?: number
      activo?: 'true' | 'false' | 'todos'
      incluirEliminados?: 'true' | 'false'
    } = {},
    signal?: AbortSignal,
  ) => http.pagina<Usuario[]>('/usuarios', sinVacios({ ...consulta }), { signal }),
  obtener: (id: number) => http.get<Usuario>(`/usuarios/${id}`),
  crear: (datos: DatosUsuario) => http.post<Usuario>('/usuarios', datos),
  actualizar: (id: number, datos: CambiosUsuario) => http.put<Usuario>(`/usuarios/${id}`, datos),
  cambiarEstado: (id: number, activo: boolean) =>
    http.patch<Usuario>(`/usuarios/${id}/estado`, { activo }),
  resetearPassword: (id: number, passwordNueva: string, debeCambiarPassword = true) =>
    http.post<null>(`/usuarios/${id}/resetear-password`, { passwordNueva, debeCambiarPassword }),
  eliminar: (id: number) => http.delete<null>(`/usuarios/${id}`),
  restaurar: (id: number) => http.post<null>(`/usuarios/${id}/restaurar`),
}

export const roles = {
  listar: (
    consulta: ConsultaPaginada & { activo?: 'true' | 'false' | 'todos' } = {},
    signal?: AbortSignal,
  ) => http.pagina<Rol[]>('/usuarios/roles', sinVacios({ ...consulta }), { signal }),
  crear: (datos: { nombre: string; descripcion?: string | null; nivel: number; activo: boolean }) =>
    http.post<Rol>('/usuarios/roles', datos),
  actualizar: (
    id: number,
    datos: Partial<{ nombre: string; descripcion: string | null; nivel: number; activo: boolean }>,
  ) => http.put<Rol>(`/usuarios/roles/${id}`, datos),
}

// --- Reportes -------------------------------------------------------------

/** Rango de fechas común a los reportes. */
const rango = (fechaInicio?: string, fechaFin?: string) => sinVacios({ fechaInicio, fechaFin })

export const reportes = {
  indicadoresProceso: (fechaInicio?: string, fechaFin?: string) =>
    http.get<IndicadoresProceso>('/reportes/indicadores/proceso', { params: rango(fechaInicio, fechaFin) }),
  indicadoresSistema: (fechaInicio?: string, fechaFin?: string) =>
    http.get<IndicadoresSistema>('/reportes/indicadores/sistema', { params: rango(fechaInicio, fechaFin) }),
  /**
   * Comparativa postest contra la línea base del pretest.
   *
   * No admite parámetros: los nueve valores los fija el administrador desde
   * esta misma pantalla y el servidor los lee de la tabla guardada. Una sola
   * fuente evita que la tabla muestre unos números mientras en el registro
   * figuran otros. Si nunca se registró, `antes` llega en `null` y la
   * pantalla escribe "sin dato".
   */
  comparativo: (fechaInicio?: string, fechaFin?: string) =>
    http.get<ComparativoIndicadores>('/reportes/indicadores/comparativo', {
      params: rango(fechaInicio, fechaFin),
    }),
  /** Línea base guardada y su procedencia; `registrada: false` si aún no existe. */
  pretest: () => http.get<RegistroLineaBase>('/reportes/indicadores/pretest'),
  /** Reservado al administrador: reemplaza la línea base guardada. */
  guardarPretest: (valores: ParametrosPretest) =>
    http.put<RegistroLineaBase>('/reportes/indicadores/pretest', valores),
  periodoPorDefecto: () => http.get<{ fechaInicio: string; fechaFin: string }>('/reportes/indicadores/periodo'),

  // Los reportes comparten el rango de fechas; cada uno añade sus propios
  // filtros. Todos aceptan `formato=csv` en el servidor para la descarga.
  ventas: (fechaInicio?: string, fechaFin?: string, filtros: { clienteId?: number; usuarioId?: number } = {}) =>
    http.get<FilaReporte>('/reportes/ventas', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  pedidos: (
    fechaInicio?: string,
    fechaFin?: string,
    filtros: { estado?: EstadoPedido; clienteId?: number; repartidorId?: number; usuarioId?: number } = {},
  ) => http.get<FilaReporte>('/reportes/pedidos', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  pagos: (
    fechaInicio?: string,
    fechaFin?: string,
    filtros: { metodo?: MetodoPago; clienteId?: number } = {},
  ) => http.get<FilaReporte>('/reportes/pagos', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  entregas: (
    fechaInicio?: string,
    fechaFin?: string,
    filtros: { repartidorId?: number; resultado?: EstadoEntrega } = {},
  ) => http.get<FilaReporte>('/reportes/entregas', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  clientes: (fechaInicio?: string, fechaFin?: string, filtros: { clienteId?: number; repartidorId?: number } = {}) =>
    http.get<FilaReporte>('/reportes/clientes', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  bidones: (fechaInicio?: string, fechaFin?: string, filtros: { clienteId?: number; repartidorId?: number } = {}) =>
    http.get<FilaReporte>('/reportes/bidones', { params: sinVacios({ ...rango(fechaInicio, fechaFin), ...filtros }) }),
  inventario: (fechaInicio?: string, fechaFin?: string) =>
    http.get<FilaReporte>('/reportes/inventario', { params: rango(fechaInicio, fechaFin) }),
  tiemposProceso: (fechaInicio?: string, fechaFin?: string) =>
    http.get<FilaReporte>('/reportes/tiempos-proceso', { params: rango(fechaInicio, fechaFin) }),
  diario: (fecha?: string) => http.get<FilaReporte>('/reportes/diario', { params: sinVacios({ fecha }) }),
  historialBidones: (clienteId: number) => http.get<FilaReporte>(`/reportes/historial-bidones/${clienteId}`),
  // A diferencia del resto, este reporte devuelve el arreglo plano de las
  // consultas más costosas, sin envoltorio `periodo`/`resumen`.
  costoConsultas: () => http.get<FilaReporte[]>('/reportes/costo-consultas'),

  /**
   * Descarga el reporte pedido en el formato dado. Va por `http.descargar` y
   * no por la envoltura JSON: la respuesta es un archivo, no `{ exito, datos }`.
   *
   * `params` se recibe armado por la pantalla porque no todos los reportes
   * usan las mismas claves: los de rango piden `fechaInicio`/`fechaFin`, el
   * consolidado diario solo `fecha`, y los filtrados repiten sus filtros.
   */
  descargarReporte: (reporte: ClaveReporte, formato: 'csv' | 'pdf', params: Record<string, string> = {}) =>
    http.descargar(
      `/reportes/${reporte}`,
      `reporte-${reporte}-${(params.fechaFin ?? params.fecha ?? new Date().toISOString().slice(0, 10))}.${formato}`,
      { ...sinVacios({ ...params }), formato },
    ),

  descargarCsv: (reporte: ClaveReporte, params: Record<string, string> = {}) =>
    reportes.descargarReporte(reporte, 'csv', params),

  descargarPdf: (reporte: ClaveReporte, params: Record<string, string> = {}) =>
    reportes.descargarReporte(reporte, 'pdf', params),

  /**
   * Exportación de indicadores: la genera el backend en CSV y es exclusiva de
   * `ADMINISTRADOR`.
   */
  descargarIndicadores: (fechaInicio?: string, fechaFin?: string) =>
    http.descargar('/reportes/indicadores/exportar', 'indicadores-postest.csv', rango(fechaInicio, fechaFin)),
}

// --- Evidencia del postest ------------------------------------------------

export type ModuloIncidencia =
  | 'AUTENTICACION'
  | 'PEDIDOS'
  | 'VENTAS'
  | 'PAGOS'
  | 'ENTREGAS'
  | 'BIDONES'
  | 'INVENTARIO'
  | 'REPORTES'
  | 'TABLERO'
  | 'OTRO'

export interface DatosIncidencia {
  titulo: string
  descripcion: string
  pasosReproduccion?: string
  modulo?: ModuloIncidencia
  severidad?: number
}

/** Salida de `GET /evidencia/fiabilidad`. */
export interface ResumenFiabilidad {
  totalRegistradas: number
  resueltas: number
  pendientes: number
  tasaResolucion: number
  mttrMinutos: number
}

/** Fila de `GET /evidencia/bitacora` (tabla `bitacora_http`). */
export interface BitacoraHttp {
  id: number
  metodo: string
  ruta: string
  status: number
  duracionMs: number
  usuarioId: number | null
  fecha: string
  esErrorServidor?: boolean
}

export const evidencia = {
  listar: (
    consulta: ConsultaPaginada & {
      modulo?: ModuloIncidencia
      severidad?: number
      estado?: 'ABIERTA' | 'EN_PROCESO' | 'RESUELTA' | 'DESCARTADA'
    } = {},
  ) => http.pagina<Incidencia[]>('/evidencia/incidencias', sinVacios({ ...consulta })),
  obtener: (id: number) => http.get<Incidencia>(`/evidencia/incidencias/${id}`),
  crear: (datos: DatosIncidencia) => http.post<Incidencia>('/evidencia/incidencias', datos),
  actualizar: (id: number, datos: Partial<DatosIncidencia>) =>
    http.put<Incidencia>(`/evidencia/incidencias/${id}`, datos),
  resolver: (id: number, datos: { solucion: string; severidadFinal?: number }) =>
    http.post<Incidencia>(`/evidencia/incidencias/${id}/resolver`, datos),
  descartar: (id: number, motivo: string) =>
    http.post<Incidencia>(`/evidencia/incidencias/${id}/descartar`, { motivo }),
  fiabilidad: () => http.get<ResumenFiabilidad>('/evidencia/fiabilidad'),
  /**
   * Bitácora HTTP. Es exclusiva de `ADMINISTRADOR` y sus filtros son
   * `metodo`, `ruta` y `estado` (código HTTP), no los del historial de estados.
   */
  bitacora: (consulta: ConsultaPaginada & { metodo?: string; ruta?: string; estado?: number } = {}, opciones?: { signal?: AbortSignal }) =>
    http.pagina<BitacoraHttp[]>(
      '/evidencia/bitacora',
      sinVacios({ ...consulta }),
      opciones,
    ),
}
