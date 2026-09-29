import { useMemo, useState } from 'react'
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
  Tabla,
  Tarjeta,
  Vacio,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { pedidos, ventas } from '@/services/api'
import type { DetalleVenta, EstadoVenta, MetodoPago, Pedido, Venta, VentaDetalle } from '@/types/dominio'
import {
  dinero,
  fechaHora,
  nombreMetodoPago,
  presentacionPedido,
  presentacionVenta,
} from '@/utils/formato'

const METODOS: MetodoPago[] = ['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO']

const ESTADOS: EstadoVenta[] = ['PENDIENTE', 'COMPLETADA', 'ANULADA']

interface VentaForm {
  descuento: string
  observaciones: string
  cobrarAhora: boolean
  monto: string
  metodo: MetodoPago
  referencia: string
}

const ventaVacia: VentaForm = {
  descuento: '0',
  observaciones: '',
  cobrarAhora: true,
  monto: '',
  metodo: 'EFECTIVO',
  referencia: '',
}

export const PaginaVentas = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')
  // Registrar la venta es tarea del vendedor; anularla, del administrador.
  const puedeVender = esAdmin || tieneRol('VENDEDOR')

  const [estado, setEstado] = useState<'todos' | EstadoVenta>('todos')
  const [conSaldo, setConSaldo] = useState(false)

  const [registrando, setRegistrando] = useState(false)
  const [emitiendo, setEmitiendo] = useState<Venta | null>(null)
  const [anulando, setAnulando] = useState<Venta | null>(null)
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Venta>('/ventas', {
    estado,
    soloConSaldo: conSaldo ? 'true' : undefined,
  })

  const abrirDetalle = (venta: Venta) => {
    setDetalle(null)
    setVerDetalle(true)
    void ventas
      .obtener(venta.id)
      .then(setDetalle)
      .catch((fallo: unknown) => {
        setVerDetalle(false)
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo abrir la venta.',
        })
      })
  }

  const confirmarAnulacion = () => {
    if (!anulando) return
    setProcesando(true)
    const objetivo = anulando
    void ventas
      .anular(objetivo.id, motivo, true)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Venta ${objetivo.numero} anulada. Se repuso el inventario.`,
        })
        tabla.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo anular la venta.',
        })
      })
      .finally(() => {
        setProcesando(false)
        setAnulando(null)
        setMotivo('')
      })
  }

  return (
    <Pagina
      titulo="Ventas"
      descripcion="Emisión de ventas a partir de pedidos confirmados y control de saldos."
      acciones={
        puedeVender && (
          <Boton onClick={() => setRegistrando(true)}>Registrar venta</Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Listado<Venta>
        {...tabla}
        claveFila={(venta) => venta.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por número, cliente o pedido…"
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
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={conSaldo}
                onChange={(evento) => setConSaldo(evento.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
              />
              Solo con saldo pendiente
            </label>
          </BarraListado>
        }
        columnas={[
          { clave: 'numero', encabezado: 'Número' },
          { clave: 'cliente', encabezado: 'Cliente' },
          { clave: 'fecha', encabezado: 'Fecha' },
          { clave: 'total', encabezado: 'Total', clase: 'text-right' },
          { clave: 'pagado', encabezado: 'Pagado', clase: 'text-right' },
          { clave: 'saldo', encabezado: 'Saldo', clase: 'text-right' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay ventas que coincidan',
          descripcion: 'Las ventas se generan desde un pedido confirmado.',
        }}
        renderFila={(venta) => {
          const estilo = presentacionVenta(venta.estado)
          return (
            <>
              <Celda className="font-medium text-slate-900">{venta.numero}</Celda>
              <Celda>
                <span className="block max-w-[14rem] truncate" title={venta.cliente?.nombre}>
                  {venta.cliente?.nombre ?? '—'}
                </span>
                <span className="text-xs text-slate-500">Pedido {venta.pedido?.codigo}</span>
              </Celda>
              <Celda>{fechaHora(venta.fecha)}</Celda>
              <Celda numerica className="font-medium">
                {dinero(venta.total)}
              </Celda>
              <Celda numerica>{dinero(venta.totalPagado)}</Celda>
              <Celda numerica className={venta.saldo > 0 ? 'font-medium text-amber-700' : ''}>
                {dinero(venta.saldo)}
              </Celda>
              <Celda>
                <Etiqueta tono={estilo.estilo}>{estilo.etiqueta}</Etiqueta>
              </Celda>
              <Celda className="text-right">
                <div className="flex justify-end gap-1">
                  {!venta.constanciaEmitida && venta.estado !== 'ANULADA' && (
                    <Boton variante="fantasma" tamano="sm" onClick={() => setEmitiendo(venta)}>
                      Constancia
                    </Boton>
                  )}
                  {esAdmin && venta.estado !== 'ANULADA' && (
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      className="text-rose-600"
                      onClick={() => setAnulando(venta)}
                    >
                      Anular
                    </Boton>
                  )}
                  <Boton variante="fantasma" tamano="sm" onClick={() => abrirDetalle(venta)}>
                    Ver
                  </Boton>
                </div>
              </Celda>
            </>
          )
        }}
      />

      <ModalRegistrarVenta
        abierto={registrando}
        alCerrar={() => setRegistrando(false)}
        alCrear={(venta) => {
          setRegistrando(false)
          setAviso({ tipo: 'exito', mensaje: `Venta ${venta.numero} registrada correctamente.` })
          tabla.recargar()
        }}
      />

      <ModalEmitirConstancia
        venta={emitiendo}
        alCerrar={() => setEmitiendo(null)}
        alEmitir={() => {
          setEmitiendo(null)
          tabla.recargar()
        }}
      />

      <Modal
        abierto={anulando !== null}
        titulo={anulando ? `Anular venta ${anulando.numero}` : 'Anular venta'}
        descripcion="La anulación repone el inventario y queda registrada en la bitácora. Exige justificación porque altera el consolidado ya reportado."
        ancho="md"
        alCerrar={() => setAnulando(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAnulando(null)} disabled={procesando}>
              Volver
            </Boton>
            <Boton variante="peligro" onClick={confirmarAnulacion} cargando={procesando}>
              Anular venta
            </Boton>
          </>
        }
      >
        <AreaTexto
          etiqueta="Motivo de la anulación"
          requerido
          filas={3}
          ayuda="Explique por qué se anula. Quedará registrado en la bitácora."
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </Modal>

      <ModalDetalleVenta abierto={verDetalle} venta={detalle} alCerrar={() => setVerDetalle(false)} />
    </Pagina>
  )
}

/** Alta de una venta a partir de un pedido ya confirmado y sin venta. */
const ModalRegistrarVenta = ({
  abierto,
  alCerrar,
  alCrear,
}: {
  abierto: boolean
  alCerrar: () => void
  alCrear: (venta: Venta) => void
}) => {
  const formulario = useFormulario<VentaForm>(ventaVacia)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Pedido | null>(null)
  const retrasada = useRetraso(busqueda)

  const candidatos = usePeticion<Pedido[]>(
    (senal) =>
      pedidos
        .listar({ busqueda: retrasada || undefined, estado: 'todos', limite: 50 }, senal)
        .then((pagina) => pagina.datos)
        // Un pedido ya facturado o aún no confirmado no puede venderse.
        .then((lista) =>
          lista.filter(
            (pedido) =>
              pedido.venta === null &&
              pedido.estado !== 'PENDIENTE' &&
              pedido.estado !== 'CANCELADO',
          ),
        ),
    [retrasada],
  )

  const subtotal = seleccionado?.total ?? 0
  const descuento = Number(formulario.valores.descuento) || 0
  const total = useMemo(() => Math.max(subtotal - descuento, 0), [subtotal, descuento])

  const cerrar = () => {
    formulario.reiniciar()
    setBusqueda('')
    setSeleccionado(null)
    alCerrar()
  }

  const registrar = () => {
    if (!seleccionado) return
    void formulario.enviar(async () => {
      const monto = Number(formulario.valores.monto) || 0
      const venta = await ventas.crear({
        pedidoId: seleccionado.id,
        descuento,
        observaciones: formulario.valores.observaciones || null,
        pagoInicial: formulario.valores.cobrarAhora
          ? {
              monto,
              metodo: formulario.valores.metodo,
              referencia: formulario.valores.referencia || null,
            }
          : null,
      })
      formulario.reiniciar()
      setBusqueda('')
      setSeleccionado(null)
      alCrear(venta)
    })
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar venta"
      descripcion="Elija un pedido confirmado. El servidor copia los precios ya congelados del pedido y recalcula los totales."
      ancho="lg"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton onClick={registrar} cargando={formulario.enviando} disabled={!seleccionado}>
            Registrar venta
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Entrada
            etiqueta="Buscar pedido"
            placeholder="Código, cliente o documento…"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {candidatos.cargando ? (
              <p className="p-4 text-center text-sm text-slate-500">Buscando pedidos…</p>
            ) : (candidatos.datos ?? []).length === 0 ? (
              <Vacio
                titulo="Sin pedidos por facturar"
                descripcion="Confirme un pedido en el módulo de Pedidos y aparecerá aquí."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {(candidatos.datos ?? []).map((pedido) => {
                  const activo = seleccionado?.id === pedido.id
                  const estilo = presentacionPedido(pedido.estado)
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
                        <span className="flex shrink-0 items-center gap-3">
                          <Etiqueta tono={estilo.estilo}>{estilo.etiqueta}</Etiqueta>
                          <span className="tabular-nums font-medium text-slate-800">
                            {dinero(pedido.total)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal del pedido</span>
            <span className="tabular-nums text-slate-800">{dinero(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">Descuento</span>
            <span className="tabular-nums text-slate-800">−{dinero(descuento)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-medium text-slate-900">
            <span>Total a cobrar</span>
            <span className="tabular-nums">{dinero(total)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada
            etiqueta="Descuento"
            type="number"
            min={0}
            step="0.01"
            value={formulario.valores.descuento}
            onChange={(evento) => formulario.cambiar('descuento', evento.target.value)}
            error={formulario.errores.descuento}
          />
          <Entrada
            etiqueta="Observaciones"
            value={formulario.valores.observaciones}
            onChange={(evento) => formulario.cambiar('observaciones', evento.target.value)}
            error={formulario.errores.observaciones}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={formulario.valores.cobrarAhora}
              onChange={(evento) => formulario.cambiar('cobrarAhora', evento.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Registrar el pago inicial ahora
          </label>

          {formulario.valores.cobrarAhora && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Entrada
                etiqueta="Monto"
                type="number"
                min={0}
                step="0.01"
                value={formulario.valores.monto}
                onChange={(evento) => formulario.cambiar('monto', evento.target.value)}
                error={formulario.errores.monto}
                placeholder={total > 0 ? String(total) : '0.00'}
              />
              <Seleccion
                etiqueta="Método"
                value={formulario.valores.metodo}
                onChange={(evento) =>
                  formulario.cambiar('metodo', evento.target.value as MetodoPago)
                }
                opciones={METODOS.map((metodo) => ({
                  valor: metodo,
                  texto: nombreMetodoPago(metodo),
                }))}
              />
              <Entrada
                etiqueta="Referencia"
                ayuda="Opcional"
                value={formulario.valores.referencia}
                onChange={(evento) => formulario.cambiar('referencia', evento.target.value)}
                error={formulario.errores.referencia}
              />
            </div>
          )}
        </div>

        {formulario.errores.general && (
          <p className="text-sm text-rose-600">{formulario.errores.general}</p>
        )}
      </div>
    </Modal>
  )
}

/** Emisión de la constancia de venta. */
const ModalEmitirConstancia = ({
  venta,
  alCerrar,
  alEmitir,
}: {
  venta: Venta | null
  alCerrar: () => void
  alEmitir: () => void
}) => {
  const formulario = useFormulario<{ observaciones: string }>({ observaciones: '' })

  const emitir = () => {
    if (!venta) return
    void formulario.enviar(async () => {
      await ventas.emitirConstancia(venta.id, formulario.valores.observaciones || null)
      formulario.reiniciar()
      alEmitir()
    })
  }

  return (
    <Modal
      abierto={venta !== null}
      titulo={venta ? `Emitir constancia de la venta ${venta.numero}` : 'Emitir constancia'}
      descripcion="Deja constancia de que la venta fue cobrada. Solo puede emitirse una vez."
      ancho="sm"
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton onClick={emitir} cargando={formulario.enviando}>
            Emitir constancia
          </Boton>
        </>
      }
    >
      <AreaTexto
        etiqueta="Observaciones"
        ayuda="Opcional. Se imprime en la constancia."
        value={formulario.valores.observaciones}
        onChange={(evento) => formulario.cambiar('observaciones', evento.target.value)}
      />
    </Modal>
  )
}

const ModalDetalleVenta = ({
  abierto,
  venta,
  alCerrar,
}: {
  abierto: boolean
  venta: VentaDetalle | null
  alCerrar: () => void
}) => {
  if (!venta) {
    return (
      <Modal abierto={abierto} titulo="Venta" ancho="lg" alCerrar={alCerrar}>
        <p className="py-8 text-center text-sm text-slate-500">Cargando la información de la venta…</p>
      </Modal>
    )
  }

  const estilo = presentacionVenta(venta.estado)

  return (
    <Modal
      abierto={abierto}
      titulo={`Venta ${venta.numero}`}
      descripcion={venta.cliente?.nombre}
      ancho="xl"
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
          <Dato etiqueta="Total" valor={dinero(venta.total)} />
          <Dato etiqueta="Pagado" valor={dinero(venta.totalPagado)} />
          <Dato etiqueta="Saldo" valor={dinero(venta.saldo)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Datos">
            <dl className="space-y-1.5 text-sm">
              <Fila termino="Pedido" valor={venta.pedido?.codigo ?? '—'} />
              <Fila termino="Fecha" valor={fechaHora(venta.fecha)} />
              <Fila termino="Usuario" valor={venta.usuario?.nombreCompleto ?? '—'} />
              <Fila
                termino="Constancia"
                valor={venta.constanciaEmitida ? venta.constanciaCodigo ?? 'Emitida' : 'No emitida'}
              />
              {venta.pedido?.entrega && (
                <Fila
                  termino="Repartidor"
                  valor={venta.pedido.entrega.repartidor?.nombre ?? '—'}
                />
              )}
              {venta.observaciones && <Fila termino="Observaciones" valor={venta.observaciones} />}
              {venta.motivoAnulacion && <Fila termino="Anulada por" valor={venta.motivoAnulacion} />}
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Pagos">
            {venta.pagos.length === 0 ? (
              <p className="text-sm text-slate-500">Esta venta no tiene pagos registrados.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {venta.pagos.map((pago) => (
                  <li key={pago.id} className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">
                      {nombreMetodoPago(pago.metodo)} · {fechaHora(pago.fecha)}
                      {pago.referencia && <span className="text-slate-500"> · {pago.referencia}</span>}
                      {pago.estado === 'ANULADO' && (
                        <span className="ml-2 text-xs font-medium text-rose-600">anulado</span>
                      )}
                    </span>
                    <span className="font-medium text-slate-900">{dinero(pago.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
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
            filas={venta.detalles}
            claveFila={(detalle: DetalleVenta) => detalle.id}
            renderFila={(detalle) => (
              <>
                <Celda>{detalle.producto?.nombre ?? `Producto ${detalle.productoId}`}</Celda>
                <Celda numerica>{detalle.cantidad}</Celda>
                <Celda numerica>{dinero(detalle.precioUnitario)}</Celda>
                <Celda numerica>{dinero(detalle.subtotal)}</Celda>
              </>
            )}
          />
        </Tarjeta>

        {venta.movimientosInventario.length > 0 && (
          <Tarjeta titulo="Movimientos de inventario" sinRelleno>
            <Tabla
              columnas={[
                { clave: 'producto', encabezado: 'Producto' },
                { clave: 'tipo', encabezado: 'Tipo' },
                { clave: 'cantidad', encabezado: 'Cantidad', clase: 'text-right' },
                { clave: 'stock', encabezado: 'Stock resultante', clase: 'text-right' },
                { clave: 'fecha', encabezado: 'Fecha' },
              ]}
              filas={venta.movimientosInventario}
              claveFila={(movimiento) => movimiento.id}
              renderFila={(movimiento) => (
                <>
                  <Celda>{movimiento.producto?.nombre ?? '—'}</Celda>
                  <Celda>{movimiento.tipo}</Celda>
                  <Celda numerica>{movimiento.cantidad}</Celda>
                  <Celda numerica>{movimiento.stockResultante}</Celda>
                  <Celda>{fechaHora(movimiento.fecha)}</Celda>
                </>
              )}
            />
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
