import { useState } from 'react'
import { Listado } from '@/components/Listado'
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
import { useFormulario } from '@/hooks'
import { entregas } from '@/services/api'
import type { EstadoEntregaFiltro } from '@/services/api'
import type { Entrega } from '@/types/dominio'
import { TRANSICIONES_ENTREGA } from '@/types/dominio'
import { dinero, fechaHora, presentacionEntrega } from '@/utils/formato'

const ESTADOS: EstadoEntregaFiltro[] = [
  'PENDIENTE',
  'ASIGNADA',
  'EN_RUTA',
  'ENTREGADA',
  'NO_ENTREGADO',
  'CANCELADA',
]

/**
 * Marca de tiempo del momento en que ocurre la acción, no del renderizado.
 *
 * Se declara fuera del componente a propósito: leer el reloj durante el
 * renderizado hace que el valor cambie sola y el linter lo rechaza, porque en
 * un formulario la hora capturada debe ser la de la confirmación.
 */
const ahora = (): string => new Date().toISOString()

interface CierreForm {
  horaEntrega: string
  minutosDemora: string
  montoRecibido: string
  recibeFirma: boolean
  observaciones: string
  motivoNoEntrega: string
  /** Devoluciones por producto: índice igual al del producto retornable. */
  devoluciones: Record<number, string>
}

export const PaginaMiRuta = () => {
  const [estado, setEstado] = useState<EstadoEntregaFiltro>('todos')
  const [cerrando, setCerrando] = useState<Entrega | null>(null)
  const [noEntregada, setNoEntregada] = useState<Entrega | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Entrega>('/entregas/mis-entregas', { estado })

  const salir = (entrega: Entrega) => {
    setProcesando(true)
    void entregas
      .actualizar(entrega.id, { estado: 'EN_RUTA', horaSalida: ahora() })
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Salida registrada para el pedido ${entrega.pedido?.codigo ?? ''}.`,
        })
        tabla.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo registrar la salida.',
        })
      })
      .finally(() => setProcesando(false))
  }

  const pendientes = tabla.filas.filter(
    (entrega) => entrega.estado === 'ASIGNADA' || entrega.estado === 'EN_RUTA',
  ).length

  return (
    <Pagina
      titulo="Mi ruta"
      descripcion="Entregas asignadas a tu nombre, con la salida a ruta y el cierre de cada entrega."
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Entrega>
        {...tabla}
        claveFila={(entrega) => entrega.id}
        filtros={
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">En la ruta</p>
              <p className="text-lg font-semibold text-slate-900">
                {pendientes} {pendientes === 1 ? 'entrega abierta' : 'entregas abiertas'}
              </p>
            </div>
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as EstadoEntregaFiltro)}
              opciones={[
                { valor: 'todos', texto: 'Todas' },
                ...ESTADOS.map((valor) => ({ valor, texto: valor })),
              ]}
              className="w-full sm:w-44"
            />
          </div>
        }
        columnas={[
          { clave: 'pedido', encabezado: 'Pedido' },
          { clave: 'cliente', encabezado: 'Cliente' },
          { clave: 'destino', encabezado: 'Destino' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay entregas en tu ruta',
          descripcion: 'Cuando el administrador te asigne un pedido confirmado aparecerá aquí.',
        }}
        renderFila={(entrega) => (
          <FilaEntrega
            entrega={entrega}
            procesando={procesando}
            alSalir={() => salir(entrega)}
            alCerrar={() => setCerrando(entrega)}
            alNoEntregar={() => setNoEntregada(entrega)}
          />
        )}
      />

      <ModalCerrarEntrega
        entrega={cerrando}
        alCerrar={() => setCerrando(null)}
        alConfirmar={() => {
          setCerrando(null)
          tabla.recargar()
        }}
      />

      <ModalNoEntregada
        entrega={noEntregada}
        alCerrar={() => setNoEntregada(null)}
        alConfirmar={() => {
          setNoEntregada(null)
          tabla.recargar()
        }}
      />
    </Pagina>
  )
}

const FilaEntrega = ({
  entrega,
  procesando,
  alSalir,
  alCerrar,
  alNoEntregar,
}: {
  entrega: Entrega
  procesando: boolean
  alSalir: () => void
  alCerrar: () => void
  alNoEntregar: () => void
}) => {
  const estilo = presentacionEntrega(entrega.estado)
  const permitidos = TRANSICIONES_ENTREGA[entrega.estado]

  return (
    <>
      <Celda>{entrega.pedido?.codigo ?? '—'}</Celda>
      <Celda>
        <span className="block max-w-[12rem] truncate" title={entrega.pedido?.cliente?.nombre}>
          {entrega.pedido?.cliente?.nombre ?? '—'}
        </span>
        <span className="text-xs text-slate-500">{entrega.pedido?.cliente?.telefono}</span>
      </Celda>
      <Celda>
        <span className="block max-w-[14rem] truncate">
          {entrega.pedido?.direccionEntrega || 'Recoger en tienda'}
        </span>
        <span className="text-xs text-slate-500">{dinero(entrega.pedido?.total)}</span>
      </Celda>
      <Celda>
        <Etiqueta tono={estilo.estilo}>{estilo.etiqueta}</Etiqueta>
        {entrega.horaEntrega && (
          <span className="block text-xs text-slate-500">{fechaHora(entrega.horaEntrega)}</span>
        )}
      </Celda>
      <Celda className="text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {permitidos.includes('EN_RUTA') && (
            <Boton variante="secundario" tamano="sm" onClick={alSalir} cargando={procesando}>
              {entrega.estado === 'NO_ENTREGADO' ? 'Reanudar ruta' : 'Salir a ruta'}
            </Boton>
          )}
          {permitidos.includes('ENTREGADA') && (
            <Boton tamano="sm" onClick={alCerrar}>
              Registrar entrega
            </Boton>
          )}
          {permitidos.includes('NO_ENTREGADO') && (
            <Boton variante="secundario" tamano="sm" onClick={alNoEntregar}>
              No entregado
            </Boton>
          )}
          {permitidos.length === 0 && <span className="text-xs text-slate-400">Cerrada</span>}
        </div>
      </Celda>
    </>
  )
}

/** Cierre exitoso: hora real, demora, cobrado y bidones devueltos. */
const ModalCerrarEntrega = ({
  entrega,
  alCerrar,
  alConfirmar,
}: {
  entrega: Entrega | null
  alCerrar: () => void
  alConfirmar: () => void
}) => {
  const formulario = useFormulario<CierreForm>({
    horaEntrega: '',
    minutosDemora: '',
    montoRecibido: '',
    recibeFirma: false,
    observaciones: '',
    motivoNoEntrega: '',
    devoluciones: {},
  })

  if (!entrega) return null

  const clienteId = entrega.pedido?.cliente?.id ?? 0
  // Solo los productos retornables pueden volver al almacén: los consignados
  // no se devuelven y por eso no se ofrecen aquí.
  const retornables = (entrega.pedido?.detalles ?? []).filter(
    (detalle) => detalle.producto?.esRetornable,
  )

  const devolver = (productoId: number, cantidad: string) => {
    formulario.cambiar('devoluciones', { ...formulario.valores.devoluciones, [productoId]: cantidad })
  }

  const confirmar = () => {
    void formulario.enviar(async () => {
      const devoluciones = retornables
        .map((detalle) => ({
          clienteId,
          productoId: detalle.productoId,
          cantidad: Number(formulario.valores.devoluciones[detalle.productoId] ?? 0) || 0,
        }))
        .filter((devolucion) => devolucion.cantidad > 0)

      await entregas.actualizar(entrega.id, {
        estado: 'ENTREGADA',
        horaEntrega: formulario.valores.horaEntrega
          ? new Date(formulario.valores.horaEntrega).toISOString()
          : ahora(),
        minutosDemora: formulario.valores.minutosDemora
          ? Number(formulario.valores.minutosDemora)
          : null,
        montoRecibido: Number(formulario.valores.montoRecibido) || 0,
        recibeFirma: formulario.valores.recibeFirma,
        observaciones: formulario.valores.observaciones || null,
        devoluciones: devoluciones.length > 0 ? devoluciones : undefined,
      })
      formulario.reiniciar()
      alConfirmar()
    })
  }

  return (
    <Modal
      abierto
      titulo={`Registrar entrega del pedido ${entrega.pedido?.codigo ?? ''}`}
      descripcion="La hora registrada es la real de la entrega; con ella se calcula la demora."
      ancho="lg"
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={formulario.enviando}>
            Volver
          </Boton>
          <Boton variante="exito" onClick={confirmar} cargando={formulario.enviando}>
            Confirmar entrega
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Tarjeta titulo="Productos">
          <ul className="space-y-1.5 text-sm">
            {(entrega.pedido?.detalles ?? []).map((detalle) => (
              <li key={detalle.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  {detalle.producto?.nombre}
                  {detalle.producto?.esRetornable && (
                    <span className="ml-2 text-xs text-slate-500">retornable</span>
                  )}
                </span>
                <span className="tabular-nums font-medium text-slate-900">
                  {detalle.cantidad} {detalle.producto?.unidadMedida ?? 'und'}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>

        <div className="grid gap-4 sm:grid-cols-3">
          <Entrada
            etiqueta="Hora de entrega"
            type="datetime-local"
            ayuda="Por defecto, ahora."
            value={formulario.valores.horaEntrega}
            onChange={(evento) => formulario.cambiar('horaEntrega', evento.target.value)}
            error={formulario.errores.horaEntrega}
          />
          <Entrada
            etiqueta="Minutos de demora"
            type="number"
            min={0}
            max={1440}
            ayuda="Opcional."
            value={formulario.valores.minutosDemora}
            onChange={(evento) => formulario.cambiar('minutosDemora', evento.target.value)}
            error={formulario.errores.minutosDemora}
          />
          <Entrada
            etiqueta="Monto recibido"
            type="number"
            min={0}
            step="0.01"
            ayuda="Efectivo cobrado en la ruta."
            value={formulario.valores.montoRecibido}
            onChange={(evento) => formulario.cambiar('montoRecibido', evento.target.value)}
            error={formulario.errores.montoRecibido}
          />
        </div>

        {retornables.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">Bidones devueltos</p>
            <div className="space-y-2">
              {retornables.map((detalle) => (
                <div key={detalle.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-700">{detalle.producto?.nombre}</span>
                  <Entrada
                    etiqueta=""
                    aria-label={`Bidones devueltos de ${detalle.producto?.nombre}`}
                    type="number"
                    min={0}
                    value={formulario.valores.devoluciones[detalle.productoId] ?? ''}
                    onChange={(evento) => devolver(detalle.productoId, evento.target.value)}
                    className="w-28"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Cada devolución genera el movimiento de bidones correspondiente.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={formulario.valores.recibeFirma}
            onChange={(evento) => formulario.cambiar('recibeFirma', evento.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
          />
          El cliente firmó la recepción
        </label>

        <AreaTexto
          etiqueta="Observaciones"
          filas={2}
          ayuda="Opcional."
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

/** Cierre por no entrega: exige el motivo, porque es el dato que se reporta. */
const ModalNoEntregada = ({
  entrega,
  alCerrar,
  alConfirmar,
}: {
  entrega: Entrega | null
  alCerrar: () => void
  alConfirmar: () => void
}) => {
  const formulario = useFormulario<{ motivoNoEntrega: string }>({ motivoNoEntrega: '' })

  if (!entrega) return null

  const confirmar = () => {
    void formulario.enviar(async () => {
      await entregas.actualizar(entrega.id, {
        estado: 'NO_ENTREGADO',
        motivoNoEntrega: formulario.valores.motivoNoEntrega,
        horaEntrega: ahora(),
      })
      formulario.reiniciar()
      alConfirmar()
    })
  }

  return (
    <Modal
      abierto
      titulo="Registrar entrega fallida"
      descripcion={`Pedido ${entrega.pedido?.codigo ?? ''} · ${entrega.pedido?.cliente?.nombre ?? ''}`}
      ancho="sm"
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={formulario.enviando}>
            Volver
          </Boton>
          <Boton variante="peligro" onClick={confirmar} cargando={formulario.enviando}>
            Marcar no entregado
          </Boton>
        </>
      }
    >
      <AreaTexto
        etiqueta="Motivo"
        requerido
        filas={3}
        ayuda="Por ejemplo: el cliente no se encontraba, dirección incorrecta,closed."
        value={formulario.valores.motivoNoEntrega}
        onChange={(evento) => formulario.cambiar('motivoNoEntrega', evento.target.value)}
        error={formulario.errores.motivoNoEntrega}
      />
      {formulario.errores.general && (
        <p className="mt-2 text-sm text-rose-600">{formulario.errores.general}</p>
      )}
    </Modal>
  )
}
