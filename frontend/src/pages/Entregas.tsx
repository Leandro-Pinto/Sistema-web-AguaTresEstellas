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
  Vacio,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { entregas, pedidos, repartidores } from '@/services/api'
import type { EstadoEntregaFiltro } from '@/services/api'
import type { Entrega, Pedido } from '@/types/dominio'
import {
  dinero,
  fechaHora,
  presentacionEntrega,
  presentacionPedido,
} from '@/utils/formato'

const ESTADOS: EstadoEntregaFiltro[] = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_RUTA',
  'ENTREGADA',
  'NO_ENTREGADO',
  'CANCELADA',
]

interface AsignarForm {
  repartidorId: string
  observaciones: string
}

export const PaginaEntregas = () => {
  const [estado, setEstado] = useState<EstadoEntregaFiltro>('todos')
  const [repartidorId, setRepartidorId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const [asignando, setAsignando] = useState(false)
  const [detalle, setDetalle] = useState<Entrega | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Entrega>('/entregas/entregas', {
    estado,
    repartidorId: repartidorId || undefined,
    fechaInicio: fechaInicio || undefined,
    fechaFin: fechaFin || undefined,
  })

  const reparto = usePeticion(() => repartidores.activos(), [])

  const abrirDetalle = (entrega: Entrega) => {
    setDetalle(entrega)
    setVerDetalle(true)
  }

  return (
    <Pagina
      titulo="Entregas"
      descripcion="Asignación de repartidores y seguimiento de las entregas."
      acciones={<Boton onClick={() => setAsignando(true)}>Asignar entrega</Boton>}
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Entrega>
        {...tabla}
        claveFila={(entrega) => entrega.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por pedido o cliente…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as EstadoEntregaFiltro)}
              opciones={[
                { valor: 'todos', texto: 'Todos los estados' },
                ...ESTADOS.map((valor) => ({ valor, texto: valor })),
              ]}
              className="w-full sm:w-44"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por repartidor"
              value={repartidorId}
              onChange={(evento) => setRepartidorId(evento.target.value)}
              opciones={[
                { valor: '', texto: 'Todos los repartidores' },
                ...(reparto.datos ?? []).map((persona) => ({
                  valor: String(persona.id),
                  texto: persona.nombre,
                })),
              ]}
              className="w-full sm:w-48"
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
          { clave: 'pedido', encabezado: 'Pedido' },
          { clave: 'cliente', encabezado: 'Cliente' },
          { clave: 'repartidor', encabezado: 'Repartidor' },
          { clave: 'asignacion', encabezado: 'Asignada' },
          { clave: 'entrega', encabezado: 'Entregada' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay entregas que coincidan',
          descripcion: 'Asigne un repartidor a un pedido confirmado para crear su entrega.',
        }}
        renderFila={(entrega) => {
          const estilo = presentacionEntrega(entrega.estado)
          return (
            <>
              <Celda className="font-medium text-slate-900">{entrega.pedido?.codigo ?? '—'}</Celda>
              <Celda>
                <span className="block max-w-[12rem] truncate" title={entrega.pedido?.cliente?.nombre}>
                  {entrega.pedido?.cliente?.nombre ?? '—'}
                </span>
                <span className="text-xs text-slate-500">{entrega.pedido?.cliente?.distrito}</span>
              </Celda>
              <Celda>{entrega.repartidor?.nombre ?? 'Sin asignar'}</Celda>
              <Celda>{fechaHora(entrega.fechaAsignacion)}</Celda>
              <Celda>
                {entrega.horaEntrega ? (
                  fechaHora(entrega.horaEntrega)
                ) : (
                  <span className="text-slate-400">—</span>
                )}
                {entrega.minutosDemora !== null && (
                  <span className="block text-xs text-slate-500">
                    {entrega.minutosDemora} min de demora
                  </span>
                )}
              </Celda>
              <Celda>
                <Etiqueta tono={estilo.estilo}>{estilo.etiqueta}</Etiqueta>
              </Celda>
              <Celda className="text-right">
                <Boton variante="fantasma" tamano="sm" onClick={() => abrirDetalle(entrega)}>
                  Ver
                </Boton>
              </Celda>
            </>
          )
        }}
      />

      <ModalAsignarEntrega
        abierto={asignando}
        repartidoresActivos={(reparto.datos ?? []).map((persona) => ({
          id: persona.id,
          nombre: persona.nombre,
        }))}
        alCerrar={() => setAsignando(false)}
        alAsignar={(pedido, repartidor) => {
          setAsignando(false)
          setAviso({
            tipo: 'exito',
            mensaje: `Entrega del pedido ${pedido.codigo} asignada a ${repartidor}.`,
          })
          tabla.recargar()
        }}
      />

      <ModalDetalleEntrega
        abierto={verDetalle}
        entrega={detalle}
        alCerrar={() => setVerDetalle(false)}
      />
    </Pagina>
  )
}

/** Asigna un repartidor a un pedido confirmado que todavía no tiene entrega. */
const ModalAsignarEntrega = ({
  abierto,
  repartidoresActivos,
  alCerrar,
  alAsignar,
}: {
  abierto: boolean
  repartidoresActivos: { id: number; nombre: string }[]
  alCerrar: () => void
  alAsignar: (pedido: Pedido, repartidor: string) => void
}) => {
  const formulario = useFormulario<AsignarForm>({ repartidorId: '', observaciones: '' })
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Pedido | null>(null)
  const retrasada = useRetraso(busqueda)

  // Solo son candidatos los pedidos confirmados que aún no fueron asignados:
  // un pedido sin entrega o en PENDIENTE no se puede despachar.
  //
  // La consulta se ata a que el diálogo esté abierto. Este componente siempre
  // está montado y `usePeticion` corre su efecto al montar, así que sin el
  // guardia cada visita a la pantalla pediría hasta cincuenta pedidos
  // confirmados que se descartarían sin llegar a mostrarse. El guardia va
  // dentro de `cargar` y no solo en las dependencias, porque es el montaje lo
  // que dispara esa primera consulta.
  const candidatos = usePeticion<Pedido[]>(
    (senal) => {
      if (!abierto) return Promise.resolve([])
      return pedidos
        .listar({ busqueda: retrasada || undefined, estado: 'CONFIRMADO', limite: 50 }, senal)
        .then((pagina) => pagina.datos.filter((pedido) => pedido.entrega === null))
    },
    [abierto, retrasada],
  )

  // La selección pertenece a la lista que se está mirando. Si el pedido elegido
  // deja de estar entre los candidatos —porque la búsqueda cambió— se lo trata
  // como no elegido: asignar el reparto de un pedido que ya no aparece en
  // pantalla es la forma más fácil de mandar a alguien al lugar equivocado.
  //
  // Se deriva en el render y no se corrige con un efecto para que la ficha, el
  // botón y la comprobación de `asignar` consulten siempre la misma lista, sin
  // un turno en el que sigan describiendo la anterior.
  const pedidoElegido =
    seleccionado && (candidatos.datos ?? []).some((pedido) => pedido.id === seleccionado.id)
      ? seleccionado
      : null

  const cerrar = () => {
    formulario.reiniciar()
    setBusqueda('')
    setSeleccionado(null)
    alCerrar()
  }

  const asignar = () => {
    const repartidorId = Number(formulario.valores.repartidorId)
    if (!pedidoElegido || !repartidorId) return
    void formulario.enviar(async () => {
      await entregas.registrar({
        pedidoId: pedidoElegido.id,
        repartidorId,
        observaciones: formulario.valores.observaciones || null,
      })
      const nombre =
        repartidoresActivos.find((persona) => persona.id === repartidorId)?.nombre ??
        'el repartidor'
      formulario.reiniciar()
      setBusqueda('')
      setSeleccionado(null)
      alAsignar(pedidoElegido, nombre)
    })
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Asignar entrega"
      descripcion="El pedido pasará a estado ASIGNADO y quedará en la ruta del repartidor."
      ancho="lg"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton
            onClick={asignar}
            cargando={formulario.enviando}
            disabled={!pedidoElegido || !formulario.valores.repartidorId}
          >
            Asignar entrega
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Entrada
            etiqueta="Buscar pedido confirmado"
            placeholder="Código, cliente o documento…"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {candidatos.cargando ? (
              <p className="p-4 text-center text-sm text-slate-500">Buscando pedidos…</p>
            ) : (candidatos.datos ?? []).length === 0 ? (
              <Vacio
                titulo="Sin pedidos por asignar"
                descripcion="Los pedidos confirmados sin entrega aparecerán aquí."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {(candidatos.datos ?? []).map((pedido) => {
                  const activo = pedidoElegido?.id === pedido.id
                  return (
                    <li key={pedido.id}>
                      <button
                        type="button"
                        onClick={() => setSeleccionado(pedido)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                          activo ? 'bg-marca-50 ring-1 ring-inset ring-marca-300' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{pedido.codigo}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {pedido.cliente?.nombre ?? 'Sin cliente'}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-slate-600">
                          {dinero(pedido.total)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <Seleccion
          etiqueta="Repartidor"
          requerido
          value={formulario.valores.repartidorId}
          onChange={(evento) => formulario.cambiar('repartidorId', evento.target.value)}
          opciones={repartidoresActivos.map((persona) => ({
            valor: String(persona.id),
            texto: persona.nombre,
          }))}
          marcador="Seleccione un repartidor activo"
          error={formulario.errores.repartidorId}
        />

        {pedidoElegido && (
          <Tarjeta titulo="Punto de entrega">
            <p className="text-sm text-slate-700">
              {pedidoElegido.direccionEntrega || 'Sin dirección registrada'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {pedidoElegido.cliente?.telefono ?? 'Sin teléfono'} ·{' '}
              {pedidoElegido.modalidadEntrega === 'RECOJO'
                ? 'Recogida en tienda'
                : 'Entrega a domicilio'}
            </p>
          </Tarjeta>
        )}

        <AreaTexto
          etiqueta="Observaciones para el repartidor"
          filas={2}
          ayuda="Opcional. Referencia de la entrega o indicaciones de acceso."
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

const ModalDetalleEntrega = ({
  abierto,
  entrega,
  alCerrar,
}: {
  abierto: boolean
  entrega: Entrega | null
  alCerrar: () => void
}) => {
  if (!entrega) return null
  const estilo = presentacionEntrega(entrega.estado)
  const pedido = entrega.pedido

  return (
    <Modal
      abierto={abierto}
      titulo={`Entrega del pedido ${pedido?.codigo ?? ''}`}
      descripcion={pedido?.cliente?.nombre}
      ancho="lg"
      alCerrar={alCerrar}
      pie={
        <Boton variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="Estado" valor={estilo.etiqueta} />
          <Dato etiqueta="Salida" valor={entrega.horaSalida ? fechaHora(entrega.horaSalida) : '—'} />
          <Dato etiqueta="Entrega" valor={entrega.horaEntrega ? fechaHora(entrega.horaEntrega) : '—'} />
          <Dato etiqueta="Monto recibido" valor={dinero(entrega.montoRecibido)} />
        </div>

        <Tarjeta titulo="Datos">
          <dl className="space-y-1.5 text-sm">
            <Fila termino="Repartidor" valor={entrega.repartidor?.nombre ?? 'Sin asignar'} />
            <Fila termino="Teléfono" valor={entrega.repartidor?.telefono ?? '—'} />
            <Fila termino="Estado del pedido" valor={pedido ? presentacionPedido(pedido.estado).etiqueta : '—'} />
            <Fila termino="Dirección" valor={pedido?.direccionEntrega || '—'} />
            <Fila
              termino="Bidones"
              valor={`${entrega.bidonesEntregados} entregados / ${entrega.bidonesDevueltos} devueltos`}
            />
            {entrega.minutosDemora !== null && (
              <Fila termino="Demora" valor={`${entrega.minutosDemora} minutos`} />
            )}
            {entrega.recibeFirma && <Fila termino="Firma" valor="Recibida" />}
            {entrega.motivoNoEntrega && (
              <Fila termino="No entregado porque" valor={entrega.motivoNoEntrega} />
            )}
            {entrega.observaciones && <Fila termino="Observaciones" valor={entrega.observaciones} />}
          </dl>
        </Tarjeta>

        {pedido?.detalles && pedido.detalles.length > 0 && (
          <Tarjeta titulo="Productos a entregar">
            <ul className="space-y-1.5 text-sm">
              {pedido.detalles.map((detalle) => (
                <li key={detalle.id} className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">{detalle.producto?.nombre}</span>
                  <span className="tabular-nums font-medium text-slate-900">
                    {detalle.cantidad} {detalle.producto?.unidadMedida ?? 'und'}
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>
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
