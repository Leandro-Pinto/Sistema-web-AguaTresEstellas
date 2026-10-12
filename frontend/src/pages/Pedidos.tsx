import { useEffect, useMemo, useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import {
  AreaTexto,
  Aviso,
  Boton,
  Casilla,
  Celda,
  Entrada,
  Etiqueta,
  Modal,
  Pagina,
  Seleccion,
  Tabla,
  Tarjeta,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { clientes, pedidos, productos } from '@/services/api'
import type { DatosPedido, DetallePedidoInput } from '@/services/api'
import {
  TRANSICIONES_PEDIDO,
  type Canal,
  type ClienteRapido,
  type EstadoPedido,
  type ModalidadEntrega,
  type Pedido,
  type PedidoDetalle,
  type ProductoFormulario,
} from '@/types/dominio'
import { dinero, fechaHora, paraCampoFechaHora, presentacionPedido } from '@/utils/formato'

const ESTADOS: EstadoPedido[] = [
  'PENDIENTE',
  'CONFIRMADO',
  'ASIGNADO',
  'EN_RUTA',
  'ENTREGADO',
  'CANCELADO',
]

const CANALES: { valor: Canal; texto: string }[] = [
  { valor: 'TELEFONO', texto: 'Teléfono' },
  { valor: 'WHATSAPP', texto: 'WhatsApp' },
  { valor: 'MOSTRADOR', texto: 'Mostrador' },
  { valor: 'OTRO', texto: 'Otro' },
]

/**
 * Texto del botón que aplica cada transición.
 *
 * Es una tabla y no una cadena de condicionales porque `TRANSICIONES_PEDIDO`
 * incluye un destino que ningún "if" contemplaba: reabrir un pedido cancelado
 * pasa a `PENDIENTE`, y ese botón se llegaba a etiquetar como "Entregar". Un
 * texto equivocado ahí no es un detalle: quien reabre un pedido mal cancelado
 * leería "Entregar" y creería que lo está entregando, cuando en realidad lo
 * devuelve a la cola. Ante la duda se muestra el nombre crudo del estado.
 */
const ETIQUETA_TRANSICION: Partial<Record<EstadoPedido, string>> = {
  PENDIENTE: 'Reactivar',
  CONFIRMADO: 'Confirmar',
  ASIGNADO: 'Asignar',
  EN_RUTA: 'En ruta',
  ENTREGADO: 'Entregar',
}

/** Línea del formulario mientras se compone el pedido. */
interface LineaForm {
  productoId: number
  cantidad: number
}

interface PedidoForm {
  clienteId: number
  recibidoEn: string
  canal: Canal
  modalidadEntrega: ModalidadEntrega
  direccionEntrega: string
  referenciaEntrega: string
  fechaEntregaProgramada: string
  descuento: number
  observaciones: string
  incidencias: string
  requiereCorreccion: boolean
  confirmar: boolean
}

const pedidoVacio = (): PedidoForm => ({
  clienteId: 0,
  recibidoEn: paraCampoFechaHora(),
  canal: 'WHATSAPP',
  modalidadEntrega: 'DOMICILIO',
  direccionEntrega: '',
  referenciaEntrega: '',
  fechaEntregaProgramada: '',
  descuento: 0,
  observaciones: '',
  incidencias: '',
  requiereCorreccion: false,
  confirmar: false,
})

export const PaginaPedidos = () => {
  const [estado, setEstado] = useState<'todos' | EstadoPedido>('todos')
  const [canal, setCanal] = useState<'todos' | Canal>('todos')
  const [corregir, setCorregir] = useState<'todos' | 'true' | 'false'>('todos')

  const [registrando, setRegistrando] = useState(false)
  const [codigoCreado, setCodigoCreado] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [transicion, setTransicion] = useState<{ pedido: Pedido; estado: EstadoPedido } | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Pedido>('/pedidos', {
    estado,
    canal,
    requiereCorreccion: corregir,
  })

  const abrirDetalle = (pedido: Pedido) => {
    setDetalle(null)
    setVerDetalle(true)
    void pedidos
      .obtener(pedido.id)
      .then(setDetalle)
      .catch((fallo: unknown) => {
        setVerDetalle(false)
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo abrir el pedido.',
        })
      })
  }

  const aplicarTransicion = () => {
    if (!transicion) return
    setProcesando(true)
    const { pedido, estado: destino } = transicion
    void pedidos
      .cambiarEstado(pedido.id, destino, {
        motivo: destino === 'CANCELADO' ? motivoDeCancelacion : null,
      })
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Pedido ${pedido.codigo} ahora está en estado ${destino}.`,
        })
        tabla.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.',
        })
      })
      .finally(() => {
        setProcesando(false)
        setTransicion(null)
        setMotivoDeCancelacion('')
      })
  }

  const [motivoDeCancelacion, setMotivoDeCancelacion] = useState('')

  return (
    <Pagina
      titulo="Pedidos"
      descripcion="Registro, consulta y seguimiento del estado de cada pedido."
      acciones={
        <Boton onClick={() => setRegistrando(true)}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Registrar pedido
        </Boton>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}
      {codigoCreado && (
        <Aviso
          tipo="exito"
          mensaje={`Pedido ${codigoCreado} registrado correctamente.`}
          alCerrar={() => setCodigoCreado(null)}
        />
      )}

      <Listado<Pedido>
        {...tabla}
        claveFila={(pedido) => pedido.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por código o cliente…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as typeof estado)}
              opciones={[
                { valor: 'todos', texto: 'Todos los estados' },
                ...ESTADOS.map((valor) => ({ valor, texto: valor })),
              ]}
              className="w-full sm:w-44"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por canal"
              value={canal}
              onChange={(evento) => setCanal(evento.target.value as typeof canal)}
              opciones={[{ valor: 'todos', texto: 'Todos los canales' }, ...CANALES]}
              className="w-full sm:w-44"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por incidencias"
              value={corregir}
              onChange={(evento) => setCorregir(evento.target.value as typeof corregir)}
              opciones={[
                { valor: 'todos', texto: 'Todos' },
                { valor: 'false', texto: 'Sin incidencias' },
                { valor: 'true', texto: 'Requieren corrección' },
              ]}
              className="w-full sm:w-48"
            />
          </BarraListado>
        }
        columnas={[
          { clave: 'codigo', encabezado: 'Código' },
          { clave: 'cliente', encabezado: 'Cliente' },
          { clave: 'recibido', encabezado: 'Recibido' },
          { clave: 'canal', encabezado: 'Canal' },
          { clave: 'total', encabezado: 'Total', clase: 'text-right' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay pedidos que coincidan',
          descripcion: 'Ajuste los filtros o registre el pedido de hoy.',
          accion: <Boton onClick={() => setRegistrando(true)}>Registrar pedido</Boton>,
        }}
        renderFila={(pedido) => {
          const estilo = presentacionPedido(pedido.estado)
          const siguientes = TRANSICIONES_PEDIDO[pedido.estado]
          return (
            <>
              <Celda className="font-medium text-slate-900">
                {pedido.codigo}
                {pedido.requiereCorreccion && (
                  <span className="ml-2 text-xs font-medium text-amber-700">revisar</span>
                )}
              </Celda>
              <Celda>
                <span className="block max-w-[14rem] truncate" title={pedido.cliente?.nombre}>
                  {pedido.cliente?.nombre ?? '—'}
                </span>
                <span className="text-xs text-slate-500">{pedido.cliente?.documento}</span>
              </Celda>
              <Celda>{fechaHora(pedido.recibidoEn)}</Celda>
              <Celda>
                {CANALES.find((opcion) => opcion.valor === pedido.canal)?.texto ?? pedido.canal}
              </Celda>
              <Celda numerica className="font-medium">
                {dinero(pedido.total)}
              </Celda>
              <Celda>
                <Etiqueta tono={estilo.estilo}>{estilo.etiqueta}</Etiqueta>
              </Celda>
              <Celda className="text-right">
                <div className="flex justify-end gap-1">
                  {siguientes
                    .filter((destino) => destino !== 'CANCELADO')
                    .map((destino) => (
                      <Boton
                        key={destino}
                        variante="secundario"
                        tamano="sm"
                        onClick={() => setTransicion({ pedido, estado: destino })}
                      >
                        {ETIQUETA_TRANSICION[destino] ?? destino}
                      </Boton>
                    ))}
                  {siguientes.includes('CANCELADO') && (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      className="text-rose-600"
                      onClick={() => setTransicion({ pedido, estado: 'CANCELADO' })}
                    >
                      Cancelar
                    </Boton>
                  )}
                  <Boton variante="fantasma" tamano="sm" onClick={() => abrirDetalle(pedido)}>
                    Ver
                  </Boton>
                </div>
              </Celda>
            </>
          )
        }}
      />

      <ModalPedido
        abierto={registrando}
        alCerrar={() => setRegistrando(false)}
        alGuardar={(codigo) => {
          setRegistrando(false)
          // El código es lo que se comunica al cliente y al repartidor; sin él
          // el usuario no tiene cómo localizar el pedido que acaba de crear.
          setCodigoCreado(codigo)
          tabla.recargar()
        }}
      />

      <ModalDetallePedido
        abierto={verDetalle}
        pedido={detalle}
        alCerrar={() => setVerDetalle(false)}
      />

      <Modal
        abierto={transicion !== null}
        titulo={
          transicion?.estado === 'CANCELADO'
            ? `Cancelar pedido ${transicion.pedido.codigo}`
            : `Cambiar estado a ${transicion?.estado ?? ''}`
        }
        descripcion={
          transicion?.estado === 'CANCELADO'
            ? 'La cancelación exige un motivo: queda en el historial del pedido y en la bitácora.'
            : `El pedido ${transicion?.pedido.codigo} pasará de ${transicion?.pedido.estado} a ${transicion?.estado}.`
        }
        ancho="sm"
        alCerrar={() => setTransicion(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setTransicion(null)} disabled={procesando}>
              Volver
            </Boton>
            <Boton
              variante={transicion?.estado === 'CANCELADO' ? 'peligro' : 'primario'}
              onClick={aplicarTransicion}
              cargando={procesando}
            >
              {transicion?.estado === 'CANCELADO' ? 'Cancelar pedido' : 'Confirmar cambio'}
            </Boton>
          </>
        }
      >
        {transicion?.estado === 'CANCELADO' ? (
          <AreaTexto
            etiqueta="Motivo de la cancelación"
            requerido
            filas={3}
            ayuda="Explique por qué se cancela. Ejemplo: el cliente ya recibió el pedido por otro canal."
            value={motivoDeCancelacion}
            onChange={(evento) => setMotivoDeCancelacion(evento.target.value)}
          />
        ) : (
          <p className="text-sm text-slate-700">
            Se registrará la hora de este cambio en el historial del pedido, que alimenta la medición de
            tiempos del proceso.
          </p>
        )}
      </Modal>
    </Pagina>
  )
}

/**
 * Alta de pedido.
 *
 * El precio, el subtotal y el total los calcula el backend a partir del
 * catálogo; aquí solo se muestra una estimación para que el vendedor vea el
 * importe mientras arma el pedido, sin que ese número sea el que se guarde.
 */
const ModalPedido = ({
  abierto,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean
  alCerrar: () => void
  alGuardar: (codigo: string) => void
}) => {
  const formulario = useFormulario<PedidoForm>(pedidoVacio())
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [termino, setTermino] = useState('')
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const busquedaClienteRetrasada = useRetraso(busquedaCliente, 350)
  /**
   * El cliente elegido se guarda aparte en vez de buscarlo dentro de
   * `candidatos.datos`. Al elegir se vacía el campo de búsqueda, y si la ficha
   * dependiera del resultado de esa consulta, limpiar el campo borraría la
   * selección de la pantalla.
   */
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteRapido | null>(null)

  const catalogo = usePeticion<ProductoFormulario[]>(() => productos.activos(), [])

  // El backend exige al menos dos caracteres: con menos, la ruta devolvería
  // una lista vacía y la pantalla no dejaría claro por qué. La condición va
  // dentro de `cargar` y no solo en las dependencias porque `usePeticion`
  // ejecuta su efecto al montarse: de lo contrario, abrir la pantalla lanzaba
  // una consulta sin `termino`, que el esquema del backend rechaza.
  const terminoCliente = busquedaClienteRetrasada.trim()
  const candidatos = usePeticion<ClienteRapido[]>(
    (senal) =>
      terminoCliente.length < 2
        ? Promise.resolve([])
        : clientes.buscar(terminoCliente, 8, { signal: senal }),
    [terminoCliente],
  )

  useEffect(() => {
    if (!abierto) {
      formulario.reiniciar(pedidoVacio())
      setLineas([])
      setTermino('')
      setBusquedaCliente('')
      setClienteSeleccionado(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const productosFiltrados = useMemo(() => {
    const lista = catalogo.datos ?? []
    const texto = termino.trim().toLowerCase()
    if (!texto) return []
    return lista
      .filter((producto) =>
        producto.nombre.toLowerCase().includes(texto) || producto.codigo.toLowerCase().includes(texto),
      )
      .slice(0, 8)
  }, [catalogo.datos, termino])

  const agregarLinea = (productoId: number) => {
    setLineas((previas) => {
      const existente = previas.find((linea) => linea.productoId === productoId)
      if (existente) {
        return previas.map((linea) =>
          linea.productoId === productoId ? { ...linea, cantidad: linea.cantidad + 1 } : linea,
        )
      }
      return [...previas, { productoId, cantidad: 1 }]
    })
    setTermino('')
  }

  const cambiarCantidad = (productoId: number, cantidad: number) => {
    setLineas((previas) =>
      // Cantidad cero equivale a quitar la línea: el backend rechaza un
      // detalle con cantidad 0 y no tiene sentido dejarlo en el formulario.
      cantidad <= 0
        ? previas.filter((linea) => linea.productoId !== productoId)
        : previas.map((linea) => (linea.productoId === productoId ? { ...linea, cantidad } : linea)),
    )
  }

  const estimacion = useMemo(() => {
    const lista = catalogo.datos ?? []
    const subtotal = lineas.reduce((suma, linea) => {
      const producto = lista.find((item) => item.id === linea.productoId)
      return suma + (producto?.precioVenta ?? 0) * linea.cantidad
    }, 0)
    return { subtotal, total: Math.max(0, subtotal - formulario.valores.descuento) }
  }, [lineas, catalogo.datos, formulario.valores.descuento])

  const clienteElegido = clienteSeleccionado

  const guardar = () => {
    void formulario.enviar(async () => {
      const valores = formulario.valores
      const detalles: DetallePedidoInput[] = lineas.map((linea) => ({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
      }))

      const cuerpo: DatosPedido = {
        clienteId: valores.clienteId,
        recibidoEn: new Date(valores.recibidoEn).toISOString(),
        canal: valores.canal,
        modalidadEntrega: valores.modalidadEntrega,
        direccionEntrega: valores.direccionEntrega,
        referenciaEntrega: valores.referenciaEntrega || null,
        fechaEntregaProgramada: valores.fechaEntregaProgramada
          ? new Date(valores.fechaEntregaProgramada).toISOString()
          : null,
        detalles,
        descuento: valores.descuento,
        observaciones: valores.observaciones || null,
        incidencias: valores.incidencias || null,
        requiereCorreccion: valores.requiereCorreccion,
        confirmar: valores.confirmar,
      }

      const creado = await pedidos.crear(cuerpo)
      alGuardar(creado.codigo)
    })
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar pedido"
      descripcion="Los precios y el total los calcula el sistema; aquí solo se capturan los datos del pedido."
      ancho="xl"
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={formulario.enviando}>
            Registrar pedido
          </Boton>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(evento) => {
          evento.preventDefault()
          guardar()
        }}
        noValidate
      >
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Cliente</h3>
          <Entrada
            etiqueta="Buscar cliente"
            ayuda="Escriba el nombre, documento o teléfono. Mínimo dos caracteres."
            value={busquedaCliente}
            onChange={(evento) => setBusquedaCliente(evento.target.value)}
            placeholder="Ana Quispe, 45678912, 987…"
          />
          {clienteElegido ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-marca-50 px-3 py-2 ring-1 ring-marca-200">
              <div className="text-sm">
                <p className="font-medium text-marca-900">{clienteElegido.nombre}</p>
                <p className="text-xs text-marca-800">
                  {clienteElegido.documento} · {clienteElegido.telefono} · {clienteElegido.direccion}
                </p>
              </div>
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() => {
                  formulario.cambiar('clienteId', 0)
                  setClienteSeleccionado(null)
                }}
              >
                Cambiar
              </Boton>
            </div>
          ) : (
            terminoCliente.length >= 2 && (
              <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {(candidatos.datos ?? []).length === 0 && (
                  <li className="px-3 py-3 text-sm text-slate-500">No se encontraron clientes.</li>
                )}
                {(candidatos.datos ?? []).map((cliente) => (
                  <li key={cliente.id}>
                    <button
                      type="button"
                      onClick={() => {
                        formulario.cambiarVarios({
                          clienteId: cliente.id,
                          direccionEntrega: cliente.direccion,
                          referenciaEntrega: cliente.referencia ?? '',
                        })
                        setClienteSeleccionado(cliente)
                        setBusquedaCliente('')
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{cliente.nombre}</span>
                      <span className="text-xs text-slate-500">
                        {cliente.documento} · {cliente.telefono} · {cliente.direccion}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
          {formulario.errores.clienteId && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {formulario.errores.clienteId}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Productos</h3>
          <Entrada
            etiqueta="Buscar producto"
            ayuda="Escriba para agregar al pedido."
            value={termino}
            onChange={(evento) => setTermino(evento.target.value)}
            placeholder="Bidón 20 L, Agua…"
          />
          {productosFiltrados.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {productosFiltrados.map((producto) => (
                <li key={producto.id}>
                  <button
                    type="button"
                    onClick={() => agregarLinea(producto.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>
                      <span className="font-medium text-slate-800">{producto.nombre}</span>
                      <span className="ml-2 text-xs text-slate-500">{producto.codigo}</span>
                    </span>
                    <span className="text-sm text-slate-600">{dinero(producto.precioVenta)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lineas.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              Agregue al menos un producto: un pedido sin productos no puede registrarse.
            </p>
          ) : (
            <Tabla
              columnas={[
                { clave: 'producto', encabezado: 'Producto' },
                { clave: 'cantidad', encabezado: 'Cantidad', clase: 'w-32' },
                { clave: 'subtotal', encabezado: 'Subtotal', clase: 'text-right' },
              ]}
              filas={lineas}
              claveFila={(linea) => linea.productoId}
              renderFila={(linea) => {
                const producto = (catalogo.datos ?? []).find((item) => item.id === linea.productoId)
                // El aviso de stock se muestra aunque el producto no esté en el
                // catálogo cargado: la ausencia también impide calcular el
                // subtotal, así que el nombre cae al identificador.
                const sinStock = producto !== undefined && linea.cantidad > producto.stock
                return (
                  <>
                    <Celda>
                      <span className="block max-w-[16rem] truncate" title={producto?.nombre}>
                        {producto?.nombre ?? `Producto ${linea.productoId}`}
                      </span>
                      {producto?.esRetornable && (
                        <span className="text-xs text-slate-500">Retornable</span>
                      )}
                      {sinStock && (
                        <span className="text-xs font-medium text-amber-700">
                          Stock actual: {producto?.stock}. Puede registrarse más de lo disponible.
                        </span>
                      )}
                    </Celda>
                    <Celda>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Quitar uno"
                          onClick={() => cambiarCantidad(linea.productoId, linea.cantidad - 1)}
                          className="h-7 w-7 rounded border border-slate-300 text-sm leading-none hover:bg-slate-50"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          aria-label={`Cantidad de ${producto?.nombre ?? 'producto'}`}
                          value={linea.cantidad}
                          onChange={(evento) =>
                            cambiarCantidad(linea.productoId, Number(evento.target.value))
                          }
                          className="w-16 rounded-lg border-0 py-1 text-center text-sm shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-marca-500"
                        />
                        <button
                          type="button"
                          aria-label="Agregar uno"
                          onClick={() => cambiarCantidad(linea.productoId, linea.cantidad + 1)}
                          className="h-7 w-7 rounded border border-slate-300 text-sm leading-none hover:bg-slate-50"
                        >
                          +
                        </button>
                      </div>
                    </Celda>
                    <Celda numerica>
                      {dinero((producto?.precioVenta ?? 0) * linea.cantidad)}
                    </Celda>
                  </>
                )
              }}
            />
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Entrega</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              etiqueta="Recibido el (fecha y hora)"
              requerido
              type="datetime-local"
              ayuda="Momento en que el cliente solicitó el pedido."
              value={formulario.valores.recibidoEn}
              error={formulario.errores.recibidoEn}
              onChange={(evento) => formulario.cambiar('recibidoEn', evento.target.value)}
            />
            <Seleccion
              etiqueta="Canal de recepción"
              value={formulario.valores.canal}
              onChange={(evento) => formulario.cambiar('canal', evento.target.value as Canal)}
              opciones={CANALES}
            />
            <Seleccion
              etiqueta="Modalidad de entrega"
              value={formulario.valores.modalidadEntrega}
              onChange={(evento) =>
                formulario.cambiar('modalidadEntrega', evento.target.value as ModalidadEntrega)
              }
              opciones={[
                { valor: 'DOMICILIO', texto: 'A domicilio' },
                { valor: 'RECOJO', texto: 'Recojo en tienda' },
              ]}
            />
            <Entrada
              etiqueta="Fecha de entrega programada"
              type="date"
              ayuda="Opcional. Se usa para planificar la ruta."
              value={formulario.valores.fechaEntregaProgramada}
              error={formulario.errores.fechaEntregaProgramada}
              onChange={(evento) => formulario.cambiar('fechaEntregaProgramada', evento.target.value)}
            />
          </div>

          {formulario.valores.modalidadEntrega === 'DOMICILIO' && (
            <>
              <Entrada
                etiqueta="Dirección de entrega"
                requerido
                autoComplete="street-address"
                value={formulario.valores.direccionEntrega}
                error={formulario.errores.direccionEntrega}
                onChange={(evento) => formulario.cambiar('direccionEntrega', evento.target.value)}
              />
              <Entrada
                etiqueta="Referencia"
                ayuda="Punto de referencia para el repartidor."
                autoComplete="address-line2"
                value={formulario.valores.referenciaEntrega}
                error={formulario.errores.referenciaEntrega}
                onChange={(evento) => formulario.cambiar('referenciaEntrega', evento.target.value)}
              />
            </>
          )}

          <Entrada
            etiqueta="Descuento (S/)"
            type="number"
            min="0"
            step="0.01"
            ayuda="Se aplica al total del pedido."
            value={String(formulario.valores.descuento)}
            error={formulario.errores.descuento}
            onChange={(evento) => formulario.cambiar('descuento', Number(evento.target.value))}
          />
        </section>

        <Tarjeta titulo="Incidencias del pedido">
          <div className="space-y-3">
            <AreaTexto
              etiqueta="Detalle la incidencia"
              ayuda="Se registra tal como se detectó. Alimenta el indicador de errores de registro."
              value={formulario.valores.incidencias}
              error={formulario.errores.incidencias}
              onChange={(evento) => formulario.cambiar('incidencias', evento.target.value)}
            />
            <AreaTexto
              etiqueta="Observaciones"
              value={formulario.valores.observaciones}
              error={formulario.errores.observaciones}
              onChange={(evento) => formulario.cambiar('observaciones', evento.target.value)}
            />
            <Casilla
              etiqueta="Este pedido requiere corrección antes de procesarse"
              checked={formulario.valores.requiereCorreccion}
              error={formulario.errores.requiereCorreccion}
              onChange={(evento) => formulario.cambiar('requiereCorreccion', evento.target.checked)}
            />
            <Casilla
              etiqueta="Confirmar el pedido ahora (recomendado: ahorra un paso y reduce el tiempo de proceso)"
              checked={formulario.valores.confirmar}
              error={formulario.errores.confirmar}
              onChange={(evento) => formulario.cambiar('confirmar', evento.target.checked)}
            />
          </div>
        </Tarjeta>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <div className="text-sm text-slate-600">
            <p>
              Subtotal estimado: <span className="font-medium text-slate-800">{dinero(estimacion.subtotal)}</span>
            </p>
            <p>El importe definitivo lo calcula el servidor.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total estimado</p>
            <p className="text-xl font-semibold text-slate-900">{dinero(estimacion.total)}</p>
          </div>
        </div>

        {formulario.errores.general && (
          <p role="alert" className="text-sm font-medium text-rose-600">
            {formulario.errores.general}
          </p>
        )}
      </form>
    </Modal>
  )
}

/** Ficha de un pedido: detalle, venta asociada e historial de estados. */
const ModalDetallePedido = ({
  abierto,
  pedido,
  alCerrar,
}: {
  abierto: boolean
  pedido: PedidoDetalle | null
  alCerrar: () => void
}) => {
  // El backend rechaza `ENTREGADO` desde aquí a propósito: la hora de entrega
  // la registra el repartidor. Sin este filtro, el botón se leería como
  // disponible y fallaría al pulsarlo.
  const estilo = pedido ? presentacionPedido(pedido.estado) : null

  return (
    <Modal
      abierto={abierto}
      titulo={pedido ? `Pedido ${pedido.codigo}` : 'Pedido'}
      descripcion={pedido?.cliente?.nombre}
      ancho="xl"
      alCerrar={alCerrar}
      pie={
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      }
    >
      {!pedido ? (
        <p className="py-8 text-center text-sm text-slate-500">Cargando la información del pedido…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Estado" valor={estilo?.etiqueta ?? pedido.estado} />
            <Dato etiqueta="Total" valor={dinero(pedido.total)} />
            <Dato etiqueta="Recibido" valor={fechaHora(pedido.recibidoEn)} />
            <Dato etiqueta="Registrado" valor={fechaHora(pedido.registradoEn)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Entrega">
              <dl className="space-y-1.5 text-sm">
                <Fila termino="Modalidad" valor={pedido.modalidadEntrega} />
                <Fila termino="Dirección" valor={pedido.direccionEntrega} />
                {pedido.referenciaEntrega && (
                  <Fila termino="Referencia" valor={pedido.referenciaEntrega} />
                )}
                {pedido.fechaEntregaProgramada && (
                  <Fila termino="Programada" valor={fechaHora(pedido.fechaEntregaProgramada)} />
                )}
                {pedido.entrega?.repartidor && (
                  <Fila termino="Repartidor" valor={pedido.entrega.repartidor.nombre} />
                )}
                {pedido.entrega?.horaEntrega && (
                  <Fila termino="Entregado" valor={fechaHora(pedido.entrega.horaEntrega)} />
                )}
              </dl>
            </Tarjeta>

            <Tarjeta titulo="Registro">
              <dl className="space-y-1.5 text-sm">
                <Fila termino="Usuario" valor={pedido.usuario?.nombreCompleto ?? '—'} />
                <Fila termino="Canal" valor={pedido.canal} />
                {pedido.incidencias && <Fila termino="Incidencia" valor={pedido.incidencias} />}
                {pedido.observaciones && <Fila termino="Observaciones" valor={pedido.observaciones} />}
              </dl>
            </Tarjeta>
          </div>

          <Tarjeta titulo="Productos" sinRelleno>
            <Tabla
              columnas={[
                { clave: 'producto', encabezado: 'Producto' },
                { clave: 'cantidad', encabezado: 'Cantidad', clase: 'text-right' },
                { clave: 'precio', encabezado: 'Precio', clase: 'text-right' },
                { clave: 'subtotal', encabezado: 'Subtotal', clase: 'text-right' },
              ]}
              filas={pedido.detalles}
              claveFila={(detalle) => detalle.id}
              renderFila={(detalle) => (
                <>
                  <Celda>{detalle.producto?.nombre ?? `Producto ${detalle.productoId}`}</Celda>
                  <Celda numerica>{detalle.cantidad}</Celda>
                  <Celda numerica>{dinero(detalle.precioUnitario)}</Celda>
                  <Celda numerica>{dinero(detalle.subtotal)}</Celda>
                </>
              )}
            />
            <div className="space-y-1 border-t border-slate-200 px-4 py-3 text-right text-sm">
              <p className="text-slate-600">
                Subtotal: <span className="font-medium text-slate-800">{dinero(pedido.subtotal)}</span>
              </p>
              {pedido.descuento > 0 && (
                <p className="text-slate-600">
                  Descuento: −<span className="font-medium text-slate-800">{dinero(pedido.descuento)}</span>
                </p>
              )}
              <p className="text-base text-slate-900">
                Total: <span className="font-semibold">{dinero(pedido.total)}</span>
              </p>
            </div>
          </Tarjeta>

          {pedido.venta && (
            <Tarjeta
              titulo={`Venta ${pedido.venta.numero}`}
              descripcion={`Total ${dinero(pedido.venta.total)} · pagado ${dinero(pedido.venta.totalPagado)} · saldo ${dinero(pedido.venta.saldo)}`}
            >
              {pedido.venta.pagos.length === 0 ? (
                <p className="text-sm text-slate-500">Esta venta aún no tiene pagos registrados.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {pedido.venta.pagos.map((pago) => (
                    <li key={pago.id} className="flex items-center justify-between gap-3">
                      <span className="text-slate-700">
                        {pago.metodo} · {fechaHora(pago.fecha)}
                        {pago.referencia && <span className="text-slate-500"> · {pago.referencia}</span>}
                      </span>
                      <span className="font-medium text-slate-900">{dinero(pago.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          <Tarjeta titulo="Historial del pedido" sinRelleno>
            {pedido.historial.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Sin cambios de estado registrados.</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {pedido.historial.map((movimiento) => (
                  <li key={movimiento.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{movimiento.descripcion}</span>
                      <span className="text-xs text-slate-500">{fechaHora(movimiento.fecha)}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {movimiento.usuario?.nombreCompleto ?? 'Sistema'}
                      {movimiento.usuario?.rol && ` · ${movimiento.usuario.rol.nombre}`}
                      {movimiento.observaciones && ` · ${movimiento.observaciones}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>
        </div>
      )}
    </Modal>
  )
}

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor: string }) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
    <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
    <p className="mt-0.5 text-sm font-medium text-slate-900">{valor}</p>
  </div>
)

const Fila = ({ termino, valor }: { termino: string; valor: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{termino}</dt>
    <dd className="text-right font-medium text-slate-800">{valor}</dd>
  </div>
)
