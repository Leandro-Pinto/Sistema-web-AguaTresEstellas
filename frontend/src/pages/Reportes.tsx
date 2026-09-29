import { useMemo, useState } from 'react'
import { reportes } from '@/services/api'
import { usePeticion } from '@/hooks'
import { useAutenticacion } from '@/context/autenticacion'
import type { ClaveReporte, EstadoEntrega, EstadoPedido, FilaReporte, MetodoPago } from '@/types/dominio'
import { Aviso, Boton, Entrada, Error_, Pagina, Seleccion, Tabla, Tarjeta, Cargador, Etiqueta } from '@/components/ui'
import { clases, dinero, fechaHora, numero, paraCampoFecha, porcentaje as textoPorcentaje } from '@/utils/formato'

/**
 * Cada reporte declara sus bloques. `resumen` siempre viene del backend; las
 * listas son las que ese reporte expone en particular, y la tabla se arma con
 * las claves declaradas aquí. Declarar las columnas evita recorrer objetos
 * desconocidos en render y fija qué se muestra de cada reporte.
 */
interface DefinicionReporte {
  clave: ClaveReporte
  nombre: string
  descripcion: string
  /** Rangos que no aplican: el consolidado diario es de un solo día. */
  usaRango: boolean
  resumen: { clave: string; nombre: string; tipo: 'dinero' | 'numero' | 'porcentaje' | 'minutos' | 'conteo' }[]
  listas: {
    clave: string
    nombre: string
    columnas: { clave: string; nombre: string; tipo?: 'dinero' | 'numero' | 'fecha' | 'porcentaje' | 'minutos' }[]
  }[]
  /** Reportes que devuelven un arreglo plano en lugar de `{ periodo, resumen }`. */
  listaPlana?: {
    nombre: string
    columnas: { clave: string; nombre: string; tipo?: 'dinero' | 'numero' | 'fecha' | 'porcentaje' | 'minutos' }[]
  }
  /** Si es `true`, el módulo solo se ofrece al administrador. */
  admin?: boolean
  /** Reportes que no aceptan un rango ni una fecha (costo de consultas). */
  sinFecha?: boolean
  /** Reportes sin exportación CSV en el backend. */
  descargable?: boolean
  /**
   * Cuando es `true`, las claves de `resumen` se resuelven contra la raíz de la
   * respuesta y no contra su objeto `resumen`. Lo necesitan los reportes que
   * reparten sus totales en varios bloques (`tiempos-proceso` expone `muestra`,
   * `indicadores` y `conteos` sueltos).
   */
  resumenEnRaiz?: boolean
  filtros?: 'estadoPedido' | 'metodoPago' | 'resultadoEntrega'
}

const DEFINICIONES: DefinicionReporte[] = [
  {
    clave: 'ventas',
    nombre: 'Ventas',
    descripcion: 'Ventas del periodo con método de pago, evolución diaria y principales clientes.',
    usaRango: true,
    resumen: [
      { clave: 'cantidadVentas', nombre: 'Ventas', tipo: 'numero' },
      { clave: 'totalVendido', nombre: 'Total vendido', tipo: 'dinero' },
      { clave: 'totalCobrado', nombre: 'Total cobrado', tipo: 'dinero' },
      { clave: 'porCobrar', nombre: 'Por cobrar', tipo: 'dinero' },
      { clave: 'descuentos', nombre: 'Descuentos', tipo: 'dinero' },
      { clave: 'ticketPromedio', nombre: 'Ticket promedio', tipo: 'dinero' },
    ],
    listas: [
      { clave: 'porMetodoPago', nombre: 'Por método de pago', columnas: [{ clave: 'metodo', nombre: 'Método' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }, { clave: 'cantidad', nombre: 'Pagos', tipo: 'numero' }] },
      { clave: 'porDia', nombre: 'Evolución diaria', columnas: [{ clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }, { clave: 'cantidad', nombre: 'Ventas', tipo: 'numero' }] },
      { clave: 'topClientes', nombre: 'Mejores clientes', columnas: [{ clave: 'nombre', nombre: 'Cliente' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }, { clave: 'ventas', nombre: 'Ventas', tipo: 'numero' }] },
      {
        clave: 'ventas',
        nombre: 'Detalle de ventas',
        columnas: [
          { clave: 'id', nombre: '#', tipo: 'numero' },
          { clave: 'numero', nombre: 'N°' },
          { clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
          { clave: 'cliente.nombre', nombre: 'Cliente' },
          { clave: 'total', nombre: 'Total', tipo: 'dinero' },
          { clave: 'saldo', nombre: 'Saldo', tipo: 'dinero' },
          { clave: 'estado', nombre: 'Estado' },
        ],
      },
    ],
  },
  {
    clave: 'pedidos',
    nombre: 'Pedidos',
    descripcion: 'Pedidos registrados, su distribución por estado y canal, y los tiempos del ciclo.',
    usaRango: true,
    filtros: 'estadoPedido',
    resumen: [
      { clave: 'totalPedidos', nombre: 'Pedidos', tipo: 'numero' },
      { clave: 'porEstado', nombre: 'Por estado', tipo: 'conteo' },
      { clave: 'porCanal', nombre: 'Por canal', tipo: 'conteo' },
      { clave: 'tiempos.registroMin', nombre: 'Registro (min)', tipo: 'minutos' },
      { clave: 'tiempos.confirmacionMin', nombre: 'Confirmación (min)', tipo: 'minutos' },
      { clave: 'tiempos.cicloCompletoMin', nombre: 'Ciclo (min)', tipo: 'minutos' },
    ],
    listas: [
      {
        clave: 'pedidos',
        nombre: 'Detalle de pedidos',
        columnas: [
          { clave: 'codigo', nombre: 'Código' },
          { clave: 'registradoEn', nombre: 'Registrado', tipo: 'fecha' },
          { clave: 'cliente.nombre', nombre: 'Cliente' },
          { clave: 'total', nombre: 'Total', tipo: 'dinero' },
          { clave: 'estado', nombre: 'Estado' },
          { clave: 'entrega.repartidor.nombre', nombre: 'Repartidor' },
        ],
      },
    ],
  },
  {
    clave: 'pagos',
    nombre: 'Pagos',
    descripcion: 'Cobros registrados, su reparto por método y la evolución diaria.',
    usaRango: true,
    filtros: 'metodoPago',
    resumen: [
      { clave: 'totalCobrado', nombre: 'Total cobrado', tipo: 'dinero' },
      { clave: 'cantidadPagos', nombre: 'Pagos', tipo: 'numero' },
      { clave: 'pagosAnulados', nombre: 'Anulados', tipo: 'numero' },
    ],
    listas: [
      { clave: 'porMetodo', nombre: 'Por método', columnas: [{ clave: 'metodo', nombre: 'Método' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }, { clave: 'cantidad', nombre: 'Pagos', tipo: 'numero' }] },
      { clave: 'porDia', nombre: 'Evolución diaria', columnas: [{ clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }] },
      {
        clave: 'pagos',
        nombre: 'Detalle de pagos',
        columnas: [
          { clave: 'id', nombre: '#', tipo: 'numero' },
          { clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
          { clave: 'venta.cliente.nombre', nombre: 'Cliente' },
          { clave: 'metodo', nombre: 'Método' },
          { clave: 'monto', nombre: 'Monto', tipo: 'dinero' },
          { clave: 'estado', nombre: 'Estado' },
        ],
      },
    ],
  },
  {
    clave: 'entregas',
    nombre: 'Entregas',
    descripcion: 'Entregas del periodo, su resultado y el desempeño por repartidor.',
    usaRango: true,
    filtros: 'resultadoEntrega',
    resumen: [
      { clave: 'totalEntregas', nombre: 'Entregas', tipo: 'numero' },
      { clave: 'entregadas', nombre: 'Realizadas', tipo: 'numero' },
      { clave: 'noEntregadas', nombre: 'No realizadas', tipo: 'numero' },
      { clave: 'porcentajeEntregadas', nombre: '% realizadas', tipo: 'porcentaje' },
      { clave: 'minutosPromedioSalida', nombre: 'Salida (min)', tipo: 'minutos' },
      { clave: 'minutosPromedioEntrega', nombre: 'Entrega (min)', tipo: 'minutos' },
    ],
    listas: [
      {
        clave: 'porRepartidor',
        nombre: 'Por repartidor',
        columnas: [
          { clave: 'nombre', nombre: 'Repartidor' },
          { clave: 'zona', nombre: 'Zona' },
          { clave: 'entregas', nombre: 'Entregas', tipo: 'numero' },
          { clave: 'minutosPromedioDemora', nombre: 'Demora prom.', tipo: 'minutos' },
        ],
      },
      {
        clave: 'entregas',
        nombre: 'Detalle de entregas',
        columnas: [
          { clave: 'id', nombre: '#', tipo: 'numero' },
          { clave: 'fechaAsignacion', nombre: 'Asignada', tipo: 'fecha' },
          { clave: 'pedido.codigo', nombre: 'Pedido' },
          { clave: 'pedido.cliente.nombre', nombre: 'Cliente' },
          { clave: 'repartidor.nombre', nombre: 'Repartidor' },
          { clave: 'horaEntrega', nombre: 'Entregada', tipo: 'fecha' },
          { clave: 'estado', nombre: 'Estado' },
        ],
      },
    ],
  },
  {
    clave: 'clientes',
    nombre: 'Clientes',
    descripcion: 'Clientes con su compra del periodo, saldo pendiente y calidad de datos.',
    usaRango: true,
    resumen: [
      { clave: 'totalClientes', nombre: 'Clientes', tipo: 'numero' },
      { clave: 'clientesActivos', nombre: 'Activos', tipo: 'numero' },
      { clave: 'clientesInactivos', nombre: 'Inactivos', tipo: 'numero' },
      { clave: 'conDatosCompletos', nombre: 'Datos completos', tipo: 'numero' },
      { clave: 'porcentajeDatosCompletos', nombre: '% completos', tipo: 'porcentaje' },
    ],
    listas: [
      {
        clave: 'clientes',
        nombre: 'Detalle por cliente',
        columnas: [
          { clave: 'nombre', nombre: 'Cliente' },
          { clave: 'documento', nombre: 'Documento' },
          { clave: 'distrito', nombre: 'Distrito' },
          { clave: 'ventasPeriodo', nombre: 'Ventas', tipo: 'numero' },
          { clave: 'pedidosPeriodo', nombre: 'Pedidos', tipo: 'numero' },
          { clave: 'totalComprado', nombre: 'Comprado', tipo: 'dinero' },
          { clave: 'saldoPendiente', nombre: 'Saldo', tipo: 'dinero' },
        ],
      },
    ],
  },
  {
    clave: 'bidones',
    nombre: 'Bidones',
    descripcion: 'Envases entregados, devueltos y perdidos, con el saldo por cliente.',
    usaRango: true,
    resumen: [
      { clave: 'entregados', nombre: 'Entregados', tipo: 'numero' },
      { clave: 'devueltos', nombre: 'Devueltos', tipo: 'numero' },
      { clave: 'perdidos', nombre: 'Perdidos', tipo: 'numero' },
      { clave: 'saldoPendiente', nombre: 'Saldo pendiente', tipo: 'numero' },
      { clave: 'clientesConSaldo', nombre: 'Clientes con saldo', tipo: 'numero' },
      { clave: 'movimientos', nombre: 'Movimientos', tipo: 'numero' },
    ],
    listas: [
      { clave: 'porTipo', nombre: 'Por tipo de movimiento', columnas: [{ clave: 'tipo', nombre: 'Tipo' }, { clave: 'cantidad', nombre: 'Bidones', tipo: 'numero' }, { clave: 'movimientos', nombre: 'Movimientos', tipo: 'numero' }] },
      {
        clave: 'saldos',
        nombre: 'Saldos por cliente',
        columnas: [
          { clave: 'nombre', nombre: 'Cliente' },
          { clave: 'documento', nombre: 'Documento' },
          { clave: 'saldo', nombre: 'Saldo', tipo: 'numero' },
        ],
      },
      {
        clave: 'movimientos',
        nombre: 'Detalle de movimientos',
        columnas: [
          { clave: 'id', nombre: '#', tipo: 'numero' },
          { clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
          { clave: 'cliente.nombre', nombre: 'Cliente' },
          { clave: 'producto.nombre', nombre: 'Producto' },
          { clave: 'tipo', nombre: 'Tipo' },
          { clave: 'cantidad', nombre: 'Cantidad', tipo: 'numero' },
          { clave: 'saldoResultante', nombre: 'Saldo', tipo: 'numero' },
        ],
      },
    ],
  },
  {
    clave: 'inventario',
    nombre: 'Inventario',
    descripcion: 'Stock actual, productos agotados y consistencia de los movimientos.',
    usaRango: true,
    resumen: [
      { clave: 'totalProductos', nombre: 'Productos', tipo: 'numero' },
      { clave: 'productosAgotados', nombre: 'Agotados', tipo: 'numero' },
      { clave: 'productosStockBajo', nombre: 'Stock bajo', tipo: 'numero' },
      { clave: 'movimientosRegistrados', nombre: 'Movimientos', tipo: 'numero' },
      { clave: 'porcentajeActualizacionCorrecta', nombre: '% actualización correcta', tipo: 'porcentaje' },
      { clave: 'valorInventarioCosto', nombre: 'Valor a costo', tipo: 'dinero' },
    ],
    listas: [
      {
        clave: 'productos',
        nombre: 'Stock por producto',
        columnas: [
          { clave: 'codigo', nombre: 'Código' },
          { clave: 'nombre', nombre: 'Producto' },
          { clave: 'unidadMedida', nombre: 'Unidad' },
          { clave: 'stock', nombre: 'Stock', tipo: 'numero' },
          { clave: 'stockMinimo', nombre: 'Mínimo', tipo: 'numero' },
          { clave: 'costoUnitario', nombre: 'Costo', tipo: 'dinero' },
        ],
      },
      {
        clave: 'movimientos',
        nombre: 'Detalle de movimientos',
        columnas: [
          { clave: 'id', nombre: '#', tipo: 'numero' },
          { clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
          { clave: 'producto.nombre', nombre: 'Producto' },
          { clave: 'tipo', nombre: 'Tipo' },
          { clave: 'cantidad', nombre: 'Cantidad', tipo: 'numero' },
          { clave: 'usuario.nombreCompleto', nombre: 'Registrado por' },
        ],
      },
    ],
  },
  {
    clave: 'tiempos-proceso',
    nombre: 'Tiempos de proceso',
    descripcion: 'Duración de cada etapa y cumplimiento de los objetivos de la matriz.',
    usaRango: true,
    // Este reporte no agrupa sus totales en un objeto `resumen`: los entrega
    // en `muestra`, `indicadores` y `conteos`, por eso las claves se resuelven
    // contra la raíz.
    resumenEnRaiz: true,
    resumen: [
      { clave: 'muestra', nombre: 'Pedidos medidos', tipo: 'numero' },
      { clave: 'conteos.conErrorRegistro', nombre: 'Con error de registro', tipo: 'numero' },
      { clave: 'conteos.entregados', nombre: 'Pedidos entregados', tipo: 'numero' },
      { clave: 'indicadores.tiempoPromedioRegistroMin', nombre: 'Registro (min)', tipo: 'minutos' },
      { clave: 'indicadores.tiempoPromedioConfirmacionMin', nombre: 'Confirmación (min)', tipo: 'minutos' },
      { clave: 'indicadores.tiempoPromedioAsignacionMin', nombre: 'Asignación (min)', tipo: 'minutos' },
      { clave: 'indicadores.tiempoPromedioCicloMin', nombre: 'Ciclo completo (min)', tipo: 'minutos' },
    ],
    listas: [],
  },
  {
    // Endpoint distinto en forma: devuelve el arreglo plano de las veinte
    // consultas más costosas, sin `periodo` ni `resumen`.
    clave: 'costo-consultas',
    nombre: 'Costo de consultas',
    descripcion: 'Las veinte consultas más costosas del postest, con su duración y cuántos registros movieron. Solo el administrador.',
    usaRango: false,
    admin: true,
    sinFecha: true,
    descargable: false,
    listaPlana: {
      nombre: 'Consultas más costosas',
      columnas: [
        { clave: 'tipoConsulta', nombre: 'Tipo' },
        { clave: 'descripcion', nombre: 'Descripción' },
        { clave: 'duracionMs', nombre: 'Duración (ms)', tipo: 'numero' },
        { clave: 'registros', nombre: 'Registros', tipo: 'numero' },
        { clave: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
      ],
    },
    resumen: [],
    listas: [],
  },
  {
    clave: 'diario',
    nombre: 'Consolidado diario',
    descripcion: 'Resumen de un solo día: cuánto se vendió, se cobró y queda por cobrar.',
    usaRango: false,
    // El endpoint del consolidado diario responde solo JSON: no hay descarga
    // en el backend, y ofrecer un botón produciría un archivo que no es CSV.
    descargable: false,
    // Las claves son relativas al objeto `resumen` de la respuesta, que es
    // donde ya se resuelve el bloque de indicadores.
    resumen: [
      { clave: 'ventas', nombre: 'Ventas', tipo: 'numero' },
      { clave: 'totalVendido', nombre: 'Total vendido', tipo: 'dinero' },
      { clave: 'totalCobrado', nombre: 'Total cobrado', tipo: 'dinero' },
      { clave: 'porCobrar', nombre: 'Por cobrar', tipo: 'dinero' },
      { clave: 'descuentos', nombre: 'Descuentos', tipo: 'dinero' },
      { clave: 'ticketPromedio', nombre: 'Ticket promedio', tipo: 'dinero' },
      { clave: 'unidadesVendidas', nombre: 'Unidades', tipo: 'numero' },
    ],
    listas: [
      { clave: 'pagosPorMetodo', nombre: 'Pagos por método', columnas: [{ clave: 'metodo', nombre: 'Método' }, { clave: 'total', nombre: 'Total', tipo: 'dinero' }, { clave: 'cantidad', nombre: 'Pagos', tipo: 'numero' }] },
    ],
  },
]

// Los tres filtros se alimentan de los enums reales de `schema.prisma`; un
// valor inventado aquí arrive al backend como un enum inválido y Prisma
// responde 500 en lugar de un mensaje de validación.
const ESTADOS_PEDIDO = ['PENDIENTE', 'CONFIRMADO', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'CANCELADO']
const METODOS_PAGO: MetodoPago[] = ['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO']
const RESULTADOS_ENTREGA = ['ENTREGADA', 'NO_ENTREGADO']

/**
 * Lee un valor por ruta con puntos (`cliente.nombre`).
 *
 * El detalle de los reportes viene anidado tal como lo devuelve Prisma
 * (`cliente: { nombre }`, `venta: { cliente: { nombre } }`). Recorrer la ruta
 * evita duplicar el aplanado en el backend solo para que la tabla lo lea.
 */
const leer = (fila: unknown, ruta: string): unknown => {
  if (ruta.includes('.')) {
    let actual = fila
    for (const parte of ruta.split('.')) {
      if (actual === null || actual === undefined || typeof actual !== 'object') return undefined
      actual = (actual as Record<string, unknown>)[parte]
    }
    return actual
  }
  return fila && typeof fila === 'object' ? (fila as Record<string, unknown>)[ruta] : undefined
}

/** Presenta un valor del reporte según el tipo declarado para su columna. */
const presentar = (valor: unknown, tipo?: string): string => {
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (tipo) {
    case 'dinero':
      return dinero(Number(valor))
    case 'numero':
      return numero(Number(valor))
    case 'porcentaje':
      return textoPorcentaje(Number(valor))
    case 'minutos':
      return `${numero(Number(valor), 1)} min`
    case 'fecha':
      return fechaHora(String(valor))
    default:
      return String(valor)
  }
}

/** Un resumen puede traer objetos (`porEstado`, `porCanal`); se cuentan como una magnitud. */
const valorResumen = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'object') return numero(Object.keys(valor as object).length)
  return String(valor)
}

type Columna = { clave: string; nombre: string; tipo?: string }

/** Tabla de detalle común a todos los reportes. */
const TablaReporte = ({ columnas, filas }: { columnas: Columna[]; filas: FilaReporte[] }) => (
  <Tabla
    columnas={columnas.map((c) => ({ clave: c.clave, encabezado: c.nombre }))}
    filas={filas}
    // Las listas agregadas (por día, por método) no traen `id`, así que la
    // clave combina las columnas que sí identifican la fila en lugar de usar
    // el índice del arreglo, que cambiaría con el orden.
    claveFila={(fila) =>
      String(
        fila.id ??
          fila.codigo ??
          fila.fecha ??
          fila.clienteId ??
          fila.nombre ??
          fila.metodo ??
          fila.tipoConsulta ??
          JSON.stringify(fila),
      )
    }
    renderFila={(fila) => (
      <tr key={String(fila.id ?? fila.codigo ?? fila.fecha ?? fila.clienteId ?? fila.nombre ?? fila.metodo)} className="border-t border-slate-100">
        {columnas.map((c) => (
          <td
            key={c.clave}
            className={clases('px-4 py-2.5', c.tipo === 'dinero' || c.tipo === 'numero' ? 'text-right' : '')}
          >
            {presentar(leer(fila, c.clave), c.tipo)}
          </td>
        ))}
      </tr>
    )}
  />
)

const Reportes = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [clave, setClave] = useState<ClaveReporte>('ventas')
  const disponibles = useMemo(() => DEFINICIONES.filter((d) => !d.admin || esAdmin), [esAdmin])
  const definicion = disponibles.find((d) => d.clave === clave) ?? disponibles[0]

  const hoy = paraCampoFecha()
  const [desde, setDesde] = useState(() => {
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 29)
    return paraCampoFecha(inicio)
  })
  const [hasta, setHasta] = useState(hoy)
  const [fecha, setFecha] = useState(hoy)
  const [filtro, setFiltro] = useState('')

  const [descargando, setDescargando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  // El rango se envía siempre ordenado: si alguien invierte las fechas, el
  // backend recibiría un periodo imposible en lugar de corregirlo.
  const rangoOrdenado = useMemo(
    () => (desde > hasta ? { fechaInicio: hasta, fechaFin: desde } : { fechaInicio: desde, fechaFin: hasta }),
    [desde, hasta],
  )

  const activa = definicion.clave

  // Un solo objeto de filtros, compartido por la consulta en pantalla y por la
  // descarga: si el CSV se armara aparte, podría salir sin el filtro que el
  // usuario cree estar viendo en la tabla. Cada reporte nombra su propio
  // parámetro, así que solo se envía el que le corresponde.
  const filtrosActivos = useMemo((): Record<string, string> => {
    if (!filtro) return {}
    if (definicion.filtros === 'estadoPedido') return { estado: filtro }
    if (definicion.filtros === 'metodoPago') return { metodo: filtro }
    if (definicion.filtros === 'resultadoEntrega') return { resultado: filtro }
    return {}
  }, [filtro, definicion.filtros])

  const { cargando, error, datos, recargar } = usePeticion<FilaReporte | FilaReporte[]>(
    async () => {
      switch (activa) {
        case 'ventas':
          return reportes.ventas(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin)
        case 'pedidos':
          return reportes.pedidos(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin, {
            ...(filtro ? { estado: filtro as EstadoPedido } : {}),
          })
        case 'pagos':
          return reportes.pagos(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin, {
            ...(filtro ? { metodo: filtro as MetodoPago } : {}),
          })
        case 'entregas':
          return reportes.entregas(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin, {
            ...(filtro ? { resultado: filtro as EstadoEntrega } : {}),
          })
        case 'clientes':
          return reportes.clientes(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin)
        case 'bidones':
          return reportes.bidones(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin)
        case 'inventario':
          return reportes.inventario(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin)
        case 'tiempos-proceso':
          return reportes.tiemposProceso(rangoOrdenado.fechaInicio, rangoOrdenado.fechaFin)
        case 'diario':
          return reportes.diario(fecha)
        case 'costo-consultas':
          return reportes.costoConsultas()
      }
    },
    [activa, rangoOrdenado, fecha, filtro],
  )

  // `costo-consultas` devuelve un arreglo plano; el resto, un objeto con
  // `periodo` y `resumen`. Se normaliza aquí para no repetir la comprobación en
  // cada bloque de la pantalla.
  const esPlano = Array.isArray(datos)
  const cuerpo = (esPlano ? {} : (datos ?? {})) as FilaReporte

  // La mayoría de los reportes agrupan sus totales en `resumen`; los que los
  // reparten en varios bloques se leen contra la raíz completa.
  const resumen = (definicion.resumenEnRaiz ? cuerpo : (cuerpo.resumen ?? {})) as Record<string, unknown>
  // El consolidado diario no trae `periodo`: su fecha está en la raíz.
  const periodo = cuerpo.periodo as { fechaInicio?: string; fechaFin?: string } | undefined
  const fechaInicioReal = periodo?.fechaInicio ?? (cuerpo.fecha as string | undefined)

  const descargar = async () => {
    setDescargando(true)
    try {
      await reportes.descargarCsv(definicion.clave, {
        ...(definicion.usaRango ? { fechaInicio: rangoOrdenado.fechaInicio, fechaFin: rangoOrdenado.fechaFin } : {}),
        ...(definicion.usaRango ? {} : { fecha }),
        ...filtrosActivos,
      })
      setAviso({ tipo: 'exito', mensaje: `El reporte de ${definicion.nombre.toLowerCase()} se descargó en CSV.` })
    } catch {
      setAviso({ tipo: 'error', mensaje: 'No se pudo descargar el reporte. Intente nuevamente.' })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <Pagina
      titulo="Reportes"
      descripcion="Consolidados del periodo para la tesis: los datos los calcula el backend, aquí solo se presentan y descargan."
      acciones={
        definicion.descargable !== false && (
          <Boton variante="secundario" onClick={descargar} cargando={descargando}>
            Descargar CSV
          </Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Tarjeta titulo="Reporte" descripcion={definicion.descripcion}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Seleccion
            etiqueta="Reporte"
            value={definicion.clave}
            onChange={(e) => {
              setClave(e.target.value as ClaveReporte)
              setFiltro('')
            }}
            opciones={disponibles.map((d) => ({ valor: d.clave, texto: d.nombre }))}
          />

          {definicion.usaRango && (
            <>
              <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              <Entrada etiqueta="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
            </>
          )}

          {!definicion.usaRango && !definicion.sinFecha && (
            <Entrada etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          )}

          {definicion.filtros === 'estadoPedido' && (
            <Seleccion
              etiqueta="Estado"
              marcador="Todos"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              opciones={ESTADOS_PEDIDO.map((e) => ({ valor: e, texto: e }))}
            />
          )}
          {definicion.filtros === 'metodoPago' && (
            <Seleccion
              etiqueta="Método de pago"
              marcador="Todos"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              opciones={METODOS_PAGO.map((m) => ({ valor: m, texto: m }))}
            />
          )}
          {definicion.filtros === 'resultadoEntrega' && (
            <Seleccion
              etiqueta="Resultado"
              marcador="Todos"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              opciones={RESULTADOS_ENTREGA.map((r) => ({ valor: r, texto: r }))}
            />
          )}
        </div>

        {(fechaInicioReal || periodo) && (
          <p className="mt-3 text-xs text-slate-500">
            Periodo consultado:{' '}
            {fechaInicioReal ? fechaHora(fechaInicioReal) : '—'}
            {periodo?.fechaFin ? ` al ${fechaHora(periodo.fechaFin)}` : ''}
          </p>
        )}
      </Tarjeta>

      {error && <Error_ error={error} reintentar={recargar} />}

      {cargando && <Cargador texto="Generando reporte." />}

      {!cargando && !error && datos && (
        <>
          {definicion.listaPlana && (
            <Tarjeta titulo={definicion.listaPlana.nombre}>
              {datos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavía no hay consultas registradas. Los tiempos se miden cuando se consultan reportes e
                  historiales.
                </p>
              ) : (
                <TablaReporte columnas={definicion.listaPlana.columnas} filas={esPlano ? datos : []} />
              )}
            </Tarjeta>
          )}

          {definicion.resumen.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {definicion.resumen.map((item) => (
                <div key={item.clave} className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.nombre}</p>
                  <p
                    className={clases(
                      'mt-1 text-lg font-semibold text-slate-900',
                      item.tipo === 'porcentaje' && 'text-emerald-700',
                    )}
                  >
                    {item.tipo === 'conteo'
                      ? valorResumen(leer(resumen, item.clave))
                      : presentar(leer(resumen, item.clave), item.tipo)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {definicion.listas.map((lista) => {
            const filas = (cuerpo[lista.clave] ?? []) as FilaReporte[]
            return (
              <Tarjeta key={lista.clave} titulo={lista.nombre}>
                {lista.columnas.length === 0 ? (
                  <p className="text-sm text-slate-500">Este reporte no incluye detalle.</p>
                ) : filas.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin datos en el periodo seleccionado.</p>
                ) : (
                  <TablaReporte columnas={lista.columnas} filas={filas} />
                )}
              </Tarjeta>
            )
          })}

          {definicion.listas.length === 0 && (
            <Tarjeta>
              <Etiqueta>
                Este reporte se resume en las tarjetas superiores; el detalle por etapa está en los conteos del
                indicador de tiempos de proceso.
              </Etiqueta>
            </Tarjeta>
          )}
        </>
      )}
    </Pagina>
  )
}

export default Reportes
