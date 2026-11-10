import { useState } from 'react'
import { BarraListado, Listado } from '@/components/Listado'
import {
  AreaTexto,
  Aviso,
  Boton,
  Celda,
  Entrada,
  Etiqueta,
  Modal,
  Pagina,
  Seleccion,
  Tarjeta,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { bidones, clientes, productos } from '@/services/api'
import type { MovimientoBidonInput } from '@/services/api'
import type { MovimientoBidon, SaldoBidon, TipoMovimientoBidon } from '@/types/dominio'
import { fechaHora, numero } from '@/utils/formato'

type Vista = 'saldos' | 'movimientos'

const TIPOS: TipoMovimientoBidon[] = ['ENTREGA', 'DEVOLUCION', 'PERDIDA', 'AJUSTE']

const NOMBRE_TIPO: Record<TipoMovimientoBidon, string> = {
  ENTREGA: 'Entrega no registrada',
  DEVOLUCION: 'Devolución recibida',
  PERDIDA: 'Pérdida en almacén',
  AJUSTE: 'Corregir saldo de un cliente',
}

const AYUDA_TIPO: Record<TipoMovimientoBidon, string> = {
  ENTREGA:
    'Usa esta opción solo si la entrega al cliente no se registró al cerrar el reparto. Si ya se cerró, no la repitas.',
  DEVOLUCION: 'Registra aquí los envases vacíos que el cliente devuelve. Su saldo pendiente disminuirá.',
  PERDIDA: 'Registra un envase perdido en el almacén. Esta opción descuenta existencias y no cambia la deuda de un cliente.',
  AJUSTE:
    'Corrige la cantidad pendiente de un cliente. Elige al cliente y explica el motivo; no modifica las existencias del almacén.',
}

export const PaginaBidones = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [vista, setVista] = useState<Vista>('saldos')
  const [tipo, setTipo] = useState<'todos' | TipoMovimientoBidon>('todos')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [soloConSaldo, setSoloConSaldo] = useState(true)

  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const saldos = useListado<SaldoBidon>('/bidones/saldos', {
    soloConSaldo: soloConSaldo ? 'true' : undefined,
  })
  const movimientos = useListado<MovimientoBidon>('/bidones/movimientos', {
    tipo,
    fechaInicio: fechaInicio || undefined,
    fechaFin: fechaFin || undefined,
  })
  const total = usePeticion(() => bidones.saldoTotal(), [])

  const recargar = () => {
    saldos.recargar()
    movimientos.recargar()
    total.recargar()
  }

  return (
    <Pagina
      titulo="Control de envases retornables"
      descripcion="Consulta cuántos envases debe devolver cada cliente y registra devoluciones o correcciones."
      acciones={
        <>
          <Boton variante="secundario" onClick={() => setRegistrando(true)}>
            Registrar devolución o corrección
          </Boton>
          {esAdmin && <Boton variante="secundario" onClick={recargar}>Actualizar saldos</Boton>}
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-950 ring-1 ring-sky-200">
        <p className="font-semibold">¿Cómo usar esta pantalla?</p>
        <p className="mt-1">
          El saldo indica los envases que el cliente tiene pendientes de devolver. Las entregas se
          suman automáticamente al cerrar el reparto; registra aquí las devoluciones recibidas y
          corrige el saldo solo si detectas un error.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pendientes de devolución</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {numero(total.datos?.totalBidones ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Envases que los clientes tienen en su poder</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs uppercase tracking-wide text-slate-500">Clientes con envases pendientes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {numero(saldos.paginacion.total)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Clientes que aún deben devolver envases</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs uppercase tracking-wide text-slate-500">Registros en el historial</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {numero(movimientos.paginacion.total)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Entregas, devoluciones y correcciones guardadas</p>
        </Tarjeta>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            ['saldos', 'Pendientes por cliente'],
            ['movimientos', 'Historial de cambios'],
          ] as [Vista, string][]
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVista(valor)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              vista === valor
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {vista === 'saldos' ? (
        <Listado<SaldoBidon>
          {...saldos}
          claveFila={(fila) => `${fila.clienteId}-${fila.productoId}`}
          barra={
            <BarraListado
              busqueda={saldos.consulta.busqueda}
              alBuscar={saldos.buscar}
              marcador="Buscar cliente, documento o producto…"
              alRecargar={saldos.recargar}
            />
          }
          filtros={
            <div className="border-b border-slate-200 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={soloConSaldo}
                  onChange={(evento) => setSoloConSaldo(evento.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                />
                Mostrar solo clientes que deben devolver envases
              </label>
            </div>
          }
          columnas={[
            { clave: 'cliente', encabezado: 'Cliente' },
            { clave: 'documento', encabezado: 'Documento' },
            { clave: 'producto', encabezado: 'Producto' },
            { clave: 'saldo', encabezado: 'Envases por devolver', clase: 'text-right' },
          ]}
          vacio={{
            titulo: 'No se encontraron envases pendientes',
            descripcion: 'Prueba otra búsqueda o desactiva el filtro de clientes con envases pendientes.',
          }}
          renderFila={(fila) => (
            <>
              <Celda className="font-medium text-slate-900">{fila.cliente?.nombre ?? '—'}</Celda>
              <Celda>{fila.cliente?.documento ?? '—'}</Celda>
              <Celda>{fila.producto?.nombre ?? '—'}</Celda>
              <Celda numerica>
                <span
                  className={
                    fila.saldo > 0 ? 'font-semibold text-amber-700' : 'font-medium text-slate-600'
                  }
                >
                  {numero(fila.saldo)}
                </span>
                {fila.saldo < 0 && (
                  <span className="ml-1 text-xs text-rose-600">a favor de la empresa</span>
                )}
              </Celda>
            </>
          )}
        />
      ) : (
        <Listado<MovimientoBidon>
          {...movimientos}
          claveFila={(movimiento) => movimiento.id}
          barra={
            <BarraListado
              busqueda={movimientos.consulta.busqueda}
              alBuscar={movimientos.buscar}
              marcador="Buscar cliente, producto o pedido…"
              alRecargar={movimientos.recargar}
            >
              <Seleccion
                etiqueta=""
                aria-label="Filtrar por tipo"
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
                opciones={[
                  { valor: 'todos', texto: 'Todos los registros' },
                  ...TIPOS.map((valor) => ({ valor, texto: NOMBRE_TIPO[valor] })),
                ]}
                className="w-full sm:w-44"
              />
              <Entrada
                etiqueta=""
                aria-label="Desde"
                type="date"
                value={fechaInicio}
                onChange={(evento) => setFechaInicio(evento.target.value)}
                className="w-full sm:w-40"
              />
              <Entrada
                etiqueta=""
                aria-label="Hasta"
                type="date"
                value={fechaFin}
                onChange={(evento) => setFechaFin(evento.target.value)}
                className="w-full sm:w-40"
              />
            </BarraListado>
          }
          columnas={[
            { clave: 'fecha', encabezado: 'Fecha' },
            { clave: 'tipo', encabezado: 'Tipo' },
            { clave: 'cliente', encabezado: 'Cliente' },
            { clave: 'producto', encabezado: 'Producto' },
            { clave: 'cantidad', encabezado: 'Envases', clase: 'text-right' },
            { clave: 'saldo', encabezado: 'Pendientes después', clase: 'text-right' },
            { clave: 'origen', encabezado: 'Registrado por' },
          ]}
          vacio={{
            titulo: 'No hay registros para mostrar',
            descripcion: 'Cambia los filtros o registra una devolución si el cliente acaba de entregar envases.',
          }}
          renderFila={(movimiento) => (
            <>
              <Celda>{fechaHora(movimiento.fecha)}</Celda>
              <Celda>
                <Etiqueta tono={tonoMovimiento(movimiento.tipo)}>{NOMBRE_TIPO[movimiento.tipo]}</Etiqueta>
              </Celda>
              <Celda>{movimiento.cliente?.nombre ?? '—'}</Celda>
              <Celda>{movimiento.producto?.nombre ?? '—'}</Celda>
              <Celda numerica className="font-medium">
                {signo(movimiento.tipo, movimiento.cantidad)}
              </Celda>
              <Celda numerica>{numero(movimiento.saldoResultante)}</Celda>
              <Celda>
                {movimiento.pedido?.codigo ? (
                  <span className="text-xs text-slate-600">Pedido {movimiento.pedido.codigo}</span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {movimiento.usuario?.nombreCompleto ?? 'Registro manual'}
                  </span>
                )}
              </Celda>
            </>
          )}
        />
      )}

      <ModalMovimiento
        abierto={registrando}
        alCerrar={() => setRegistrando(false)}
        alRegistrar={(movimiento) => {
          setRegistrando(false)
          setAviso({
            tipo: 'exito',
            mensaje: `${NOMBRE_TIPO[movimiento.tipo]}: ${signo(movimiento.tipo, movimiento.cantidad)} envases registrados.`,
          })
          recargar()
        }}
      />
    </Pagina>
  )
}

/**
 * El signo se muestra en la columna de cantidad porque es la lectura rápida de
 * si el envase salió de la empresa o volvió a ella.
 */
const signo = (tipo: TipoMovimientoBidon, cantidad: number): string => {
  if (tipo === 'ENTREGA') return `+${cantidad}`
  if (tipo === 'DEVOLUCION' || tipo === 'PERDIDA') return `−${cantidad}`
  return `${cantidad > 0 ? '+' : ''}${cantidad}`
}

const tonoMovimiento = (tipo: TipoMovimientoBidon) => {
  if (tipo === 'ENTREGA') return 'aviso' as const
  if (tipo === 'DEVOLUCION') return 'exito' as const
  if (tipo === 'PERDIDA') return 'error' as const
  return 'info' as const
}

interface MovimientoForm {
  tipo: TipoMovimientoBidon
  clienteId: string
  productoId: string
  cantidad: string
  observaciones: string
}

const ModalMovimiento = ({
  abierto,
  alCerrar,
  alRegistrar,
}: {
  abierto: boolean
  alCerrar: () => void
  alRegistrar: (movimiento: MovimientoBidon) => void
}) => {
  const formulario = useFormulario<MovimientoForm>({
    tipo: 'DEVOLUCION',
    clienteId: '',
    productoId: '',
    cantidad: '',
    observaciones: '',
  })
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const requiereCliente = formulario.valores.tipo !== 'PERDIDA'
  const clienteBuscado = useRetraso(busquedaCliente)
  const productoBuscado = useRetraso(busquedaProducto)

  const clientesEncontrados = usePeticion(
    (senal) =>
      clienteBuscado.length < 2 ? Promise.resolve([]) : clientes.buscar(clienteBuscado, 8, { signal: senal }),
    [clienteBuscado],
  )
  const productosEncontrados = usePeticion(
    (senal) =>
      productoBuscado.length < 2
        ? Promise.resolve([])
        : productos
            .listar(
              {
                busqueda: productoBuscado,
                esRetornable: 'true',
                activo: 'true',
                limite: 20,
              },
              senal,
            )
            .then((pagina) => pagina.datos),
    [productoBuscado],
  )

  const clienteElegido = formulario.valores.clienteId
    ? ((clientesEncontrados.datos ?? []).find(
        (persona) => String(persona.id) === formulario.valores.clienteId,
      ) ?? null)
    : null

  const productoElegido = formulario.valores.productoId
    ? ((productosEncontrados.datos ?? []).find(
        (producto) => String(producto.id) === formulario.valores.productoId,
      ) ?? null)
    : null

  const cerrar = () => {
    formulario.reiniciar()
    setBusquedaCliente('')
    setBusquedaProducto('')
    alCerrar()
  }

  const registrar = () => {
    const cantidad = Number(formulario.valores.cantidad) || 0
    const productoId = Number(formulario.valores.productoId)
    const clienteId = Number(formulario.valores.clienteId)
    const { tipo, observaciones } = formulario.valores
    if (!productoId || cantidad <= 0 || (requiereCliente && !clienteId)) return

    void formulario.enviar(async () => {
      const cuerpo: MovimientoBidonInput =
        tipo === 'PERDIDA'
          ? { tipo, productoId, cantidad, observaciones }
          : tipo === 'AJUSTE'
            ? { tipo, clienteId, productoId, cantidad, observaciones }
            : { tipo, clienteId, productoId, cantidad, observaciones: observaciones || null }

      const movimiento = await bidones.registrar(cuerpo)
      formulario.reiniciar()
      setBusquedaCliente('')
      setBusquedaProducto('')
      alRegistrar(movimiento)
    })
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar un cambio de envases"
      descripcion="Registra lo que ocurrió. El sistema actualizará automáticamente los envases pendientes."
      ancho="lg"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton
            onClick={registrar}
            cargando={formulario.enviando}
            disabled={
              !formulario.valores.productoId ||
              !formulario.valores.cantidad ||
              (requiereCliente && !formulario.valores.clienteId)
            }
          >
            Registrar movimiento
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Seleccion
          etiqueta="Tipo de movimiento"
          value={formulario.valores.tipo}
          onChange={(evento) => {
            formulario.cambiar('tipo', evento.target.value as TipoMovimientoBidon)
            formulario.cambiar('clienteId', '')
            setBusquedaCliente('')
          }}
          opciones={TIPOS.map((valor) => ({ valor, texto: NOMBRE_TIPO[valor] }))}
        />

        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          {AYUDA_TIPO[formulario.valores.tipo]}
        </p>

        {requiereCliente ? (
          <div>
            <Entrada
              etiqueta="Cliente"
              requerido
              placeholder="Escribe al menos 2 letras del nombre o documento"
              value={busquedaCliente}
              onChange={(evento) => {
                setBusquedaCliente(evento.target.value)
                formulario.cambiar('clienteId', '')
              }}
            />
            {clienteBuscado.length >= 2 && (
              <div className="mt-2 max-h-36 overflow-y-auto rounded-lg ring-1 ring-slate-200">
              {(clientesEncontrados.datos ?? []).map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => formulario.cambiar('clienteId', String(persona.id))}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{persona.nombre}</span>
                  <span className="text-xs text-slate-500">{persona.documento}</span>
                </button>
              ))}
                {(clientesEncontrados.datos ?? []).length === 0 && !clientesEncontrados.cargando && (
                  <p className="p-3 text-sm text-slate-500">No se encontraron clientes.</p>
                )}
              </div>
            )}
            {!clienteElegido && !formulario.errores.clienteId && (
              <p className="mt-1 text-xs text-slate-500">
                Busca y selecciona al cliente para continuar.
              </p>
            )}
            {clienteElegido && (
              <p className="mt-1 text-xs text-slate-500">
                Cliente seleccionado: {clienteElegido.nombre}
              </p>
            )}
            {formulario.errores.clienteId && (
              <p className="mt-1 text-sm text-rose-600">{formulario.errores.clienteId}</p>
            )}
          </div>
        ) : null}

        <div>
          <Entrada
            etiqueta="Tipo de envase"
            requerido
            placeholder="Escribe al menos 2 letras del nombre o código"
            value={busquedaProducto}
            onChange={(evento) => {
              setBusquedaProducto(evento.target.value)
              formulario.cambiar('productoId', '')
            }}
            error={formulario.errores.productoId}
          />
          {productoBuscado.length >= 2 && (
            <div className="mt-2 max-h-36 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {(productosEncontrados.datos ?? []).map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => formulario.cambiar('productoId', String(producto.id))}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{producto.nombre}</span>
                <span className="text-xs text-slate-500">{producto.unidadMedida}</span>
              </button>
            ))}
              {(productosEncontrados.datos ?? []).length === 0 && !productosEncontrados.cargando && (
                <p className="p-3 text-sm text-slate-500">No se encontraron envases retornables.</p>
              )}
            </div>
          )}
          {!productoElegido && (
            <p className="mt-1 text-xs text-slate-500">
              Busca y selecciona el envase para continuar.
            </p>
          )}
          {productoElegido && (
            <p className="mt-1 text-xs text-slate-500">
              Producto seleccionado: {productoElegido.nombre}
            </p>
          )}
        </div>

        <Entrada
          etiqueta="Cantidad"
          type="number"
          min={1}
          step={1}
          requerido
          value={formulario.valores.cantidad}
          onChange={(evento) => formulario.cambiar('cantidad', evento.target.value)}
          error={formulario.errores.cantidad}
        />

        <AreaTexto
          etiqueta="Observaciones"
          requerido={
            formulario.valores.tipo === 'PERDIDA' || formulario.valores.tipo === 'AJUSTE'
          }
          filas={2}
          ayuda="Obligatoria en pérdidas y ajustes: es lo que permite auditar el saldo después."
          value={formulario.valores.observaciones}
          onChange={(evento) => formulario.cambiar('observaciones', evento.target.value)}
          error={formulario.errores.observaciones}
        />

        {formulario.errores.general && (
          <p className="text-sm text-rose-600">{formulario.errores.general}</p>
        )}
      </div>
    </Modal>
  )
}
