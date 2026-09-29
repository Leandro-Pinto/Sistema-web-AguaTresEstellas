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
import { useAutenticacion } from '@/context/autenticacion'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { pagos, ventas } from '@/services/api'
import type { MetodoPago, Pago, Venta } from '@/types/dominio'
import { dinero, fechaHora, nombreMetodoPago } from '@/utils/formato'

const METODOS: MetodoPago[] = ['EFECTIVO', 'YAPE', 'TRANSFERENCIA', 'OTRO']

type EstadoFiltro = 'todos' | 'REGISTRADO' | 'ANULADO'

interface PagoForm {
  monto: string
  metodo: MetodoPago
  referencia: string
  observaciones: string
  fecha: string
}

export const PaginaPagos = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')
  const puedeCobrar = esAdmin || tieneRol('VENDEDOR')

  const [metodo, setMetodo] = useState<'todos' | MetodoPago>('todos')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState<Pago | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const tabla = useListado<Pago>('/pagos', {
    metodo,
    estado,
    fechaInicio: fechaInicio || undefined,
    fechaFin: fechaFin || undefined,
  })

  // El resumen por método respeta el rango de fechas, no los demás filtros:
  // es un total de cobranza, no una vista de la tabla.
  const resumen = usePeticion(
    (senal) =>
      pagos.resumenPorMetodo(
        { fechaInicio: fechaInicio || undefined, fechaFin: fechaFin || undefined },
        senal,
      ),
    [fechaInicio, fechaFin],
  )

  const confirmarAnulacion = () => {
    if (!anulando) return
    setProcesando(true)
    const objetivo = anulando
    void pagos
      .anular(objetivo.id, motivo)
      .then(() => {
        setAviso({
          tipo: 'exito',
          mensaje: `Pago de ${dinero(objetivo.monto)} anulado correctamente.`,
        })
        tabla.recargar()
        resumen.recargar()
        setAnulando(null)
        setMotivo('')
      })
      .catch((fallo: unknown) => {
        // El motivo es obligatorio y el servidor puede rechazarlo: cerrar el
        // diálogo aquí borraría la justificación que el usuario acaba de
        // escribir y le obligaría a reconstruirla desde cero.
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo anular el pago.',
        })
      })
      .finally(() => setProcesando(false))
  }

  const totalResumen = (resumen.datos ?? []).reduce((suma, fila) => suma + fila.total, 0)

  return (
    <Pagina
      titulo="Pagos"
      descripcion="Cobros registrados por venta, con su distribución por método de pago."
      acciones={puedeCobrar && <Boton onClick={() => setRegistrando(true)}>Registrar pago</Boton>}
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta className="sm:col-span-2 xl:col-span-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cobrado en el rango</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{dinero(totalResumen)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {fechaInicio || fechaFin ? 'Rango seleccionado' : 'Histórico completo'}
          </p>
        </Tarjeta>
        {(resumen.datos ?? []).map((fila) => (
          <Tarjeta key={fila.metodo}>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {nombreMetodoPago(fila.metodo)}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{dinero(fila.total)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {fila.cantidad} {fila.cantidad === 1 ? 'cobro' : 'cobros'}
            </p>
          </Tarjeta>
        ))}
      </div>

      <Listado<Pago>
        {...tabla}
        claveFila={(pago) => pago.id}
        barra={
          <BarraListado
            busqueda={tabla.consulta.busqueda}
            alBuscar={tabla.buscar}
            marcador="Buscar por venta, cliente o referencia…"
            alRecargar={tabla.recargar}
          >
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por método"
              value={metodo}
              onChange={(evento) => setMetodo(evento.target.value as typeof metodo)}
              opciones={[
                { valor: 'todos', texto: 'Todos los métodos' },
                ...METODOS.map((valor) => ({ valor, texto: nombreMetodoPago(valor) })),
              ]}
              className="w-full sm:w-44"
            />
            <Seleccion
              etiqueta=""
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value as EstadoFiltro)}
              opciones={[
                { valor: 'todos', texto: 'Todos los estados' },
                { valor: 'REGISTRADO', texto: 'Registrado' },
                { valor: 'ANULADO', texto: 'Anulado' },
              ]}
              className="w-full sm:w-40"
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
          { clave: 'venta', encabezado: 'Venta' },
          { clave: 'cliente', encabezado: 'Cliente' },
          { clave: 'metodo', encabezado: 'Método' },
          { clave: 'fecha', encabezado: 'Fecha' },
          { clave: 'monto', encabezado: 'Monto', clase: 'text-right' },
          { clave: 'estado', encabezado: 'Estado' },
          { clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' },
        ]}
        vacio={{
          titulo: 'No hay pagos que coincidan',
          descripcion: 'Registre un pago desde una venta con saldo pendiente.',
        }}
        renderFila={(pago) => (
          <>
            <Celda className="font-medium text-slate-900">{pago.venta?.numero ?? '—'}</Celda>
            <Celda>
              <span className="block max-w-[14rem] truncate" title={pago.venta?.cliente?.nombre}>
                {pago.venta?.cliente?.nombre ?? '—'}
              </span>
            </Celda>
            <Celda>
              {nombreMetodoPago(pago.metodo)}
              {pago.referencia && (
                <span className="block text-xs text-slate-500">{pago.referencia}</span>
              )}
            </Celda>
            <Celda>{fechaHora(pago.fecha)}</Celda>
            <Celda numerica className="font-medium">
              {dinero(pago.monto)}
            </Celda>
            <Celda>
              {pago.estado === 'ANULADO' ? (
                <Etiqueta tono="error">Anulado</Etiqueta>
              ) : (
                <Etiqueta tono="exito">Registrado</Etiqueta>
              )}
              {pago.recibidoPor && (
                <span className="block text-xs text-slate-500">{pago.recibidoPor.nombreCompleto}</span>
              )}
            </Celda>
            <Celda className="text-right">
              {esAdmin && pago.estado === 'REGISTRADO' ? (
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  className="text-rose-600"
                  onClick={() => setAnulando(pago)}
                >
                  Anular
                </Boton>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </Celda>
          </>
        )}
      />

      <ModalRegistrarPago
        abierto={registrando}
        alCerrar={() => setRegistrando(false)}
        alCrear={(pago) => {
          setRegistrando(false)
          setAviso({ tipo: 'exito', mensaje: `Pago de ${dinero(pago.monto)} registrado.` })
          tabla.recargar()
          resumen.recargar()
        }}
      />

      <Modal
        abierto={anulando !== null}
        titulo={anulando ? `Anular pago de ${dinero(anulando.monto)}` : 'Anular pago'}
        descripcion="Anular un cobro revierte el saldo de la venta. Exige justificación porque afecta el arqueo de caja."
        ancho="md"
        alCerrar={() => setAnulando(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAnulando(null)} disabled={procesando}>
              Volver
            </Boton>
            <Boton
              variante="peligro"
              onClick={confirmarAnulacion}
              cargando={procesando}
              disabled={!motivo.trim()}
            >
              Anular pago
            </Boton>
          </>
        }
      >
        {anulando?.venta && (
          <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
            Venta <span className="font-medium text-slate-900">{anulando.venta.numero}</span> ·{' '}
            {anulando.venta.cliente?.nombre ?? 'Sin cliente'}. Saldo actual:{' '}
            <span className="font-medium text-slate-900">{dinero(anulando.venta.saldo)}</span>.
          </p>
        )}
        <AreaTexto
          etiqueta="Motivo de la anulación"
          requerido
          filas={3}
          ayuda="Quedará registrado en la bitácora del pago y de la venta."
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </Modal>
    </Pagina>
  )
}

/** Alta de un pago contra una venta con saldo pendiente. */
const ModalRegistrarPago = ({
  abierto,
  alCerrar,
  alCrear,
}: {
  abierto: boolean
  alCerrar: () => void
  alCrear: (pago: Pago) => void
}) => {
  const formulario = useFormulario<PagoForm>({
    monto: '',
    metodo: 'EFECTIVO',
    referencia: '',
    observaciones: '',
    fecha: '',
  })
  const [busqueda, setBusqueda] = useState('')
  const [seleccionada, setSeleccionada] = useState<Venta | null>(null)
  const retrasada = useRetraso(busqueda)

  const candidatas = usePeticion<Venta[]>(
    (senal) => {
      // El alta vive siempre montada. Sin esta guarda, entrar a la pantalla
      // pediría las ventas con saldo aunque nadie vaya a cobrar nada.
      if (!abierto) return Promise.resolve([])
      return ventas
        .listar(
          { busqueda: retrasada || undefined, soloConSaldo: 'true', estado: 'todos', limite: 50 },
          senal,
        )
        .then((pagina) => pagina.datos)
    },
    [abierto, retrasada],
  )

  const candidatos = candidatas.datos ?? []
  // La venta elegida tiene que seguir a la vista: si una búsqueda nueva la deja
  // fuera de la lista, el cobro apuntaría a una venta que el usuario ya no ve.
  const elegida =
    seleccionada && candidatos.some((venta) => venta.id === seleccionada.id)
      ? seleccionada
      : null

  const cerrar = () => {
    formulario.reiniciar()
    setBusqueda('')
    setSeleccionada(null)
    alCerrar()
  }

  const elegir = (venta: Venta) => {
    setSeleccionada(venta)
    // El caso habitual es cobrar todo el saldo: se precarga para no teclear.
    formulario.cambiarVarios({ monto: String(venta.saldo) })
  }

  const registrar = () => {
    if (!elegida) return
    void formulario.enviar(async () => {
      const pago = await pagos.crear({
        ventaId: elegida.id,
        monto: Number(formulario.valores.monto) || 0,
        metodo: formulario.valores.metodo,
        referencia: formulario.valores.referencia || null,
        observaciones: formulario.valores.observaciones || null,
        fecha: formulario.valores.fecha ? new Date(formulario.valores.fecha).toISOString() : undefined,
      })
      formulario.reiniciar()
      setBusqueda('')
      setSeleccionada(null)
      alCrear(pago)
    })
  }

  const saldo = elegida?.saldo ?? 0

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar pago"
      descripcion="Elija una venta con saldo pendiente. El servidor recalcula el saldo de la venta."
      ancho="lg"
      alCerrar={cerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={formulario.enviando}>
            Cancelar
          </Boton>
          <Boton onClick={registrar} cargando={formulario.enviando} disabled={!elegida}>
            Registrar pago
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Entrada
            etiqueta="Buscar venta con saldo"
            placeholder="Número de venta o cliente…"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {candidatas.cargando ? (
              <p className="p-4 text-center text-sm text-slate-500">Buscando ventas…</p>
            ) : candidatos.length === 0 ? (
              <Vacio
                titulo="Sin ventas con saldo"
                descripcion="Todas las ventas están cobradas o aún no se han registrado."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {candidatos.map((venta) => {
                  const activa = elegida?.id === venta.id
                  return (
                    <li key={venta.id}>
                      <button
                        type="button"
                        onClick={() => elegir(venta)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                          activa ? 'bg-marca-50 ring-1 ring-inset ring-marca-300' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{venta.numero}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {venta.cliente?.nombre ?? 'Sin cliente'}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs text-slate-500">Saldo</span>
                          <span className="tabular-nums font-medium text-amber-700">
                            {dinero(venta.saldo)}
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

        {elegida && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
            Venta <span className="font-medium text-slate-900">{elegida.numero}</span> · total{' '}
            {dinero(elegida.total)} · pagado {dinero(elegida.totalPagado)} · saldo{' '}
            <span className="font-medium text-amber-700">{dinero(saldo)}</span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada
            etiqueta="Monto"
            type="number"
            min={0}
            step="0.01"
            value={formulario.valores.monto}
            onChange={(evento) => formulario.cambiar('monto', evento.target.value)}
            error={formulario.errores.monto}
            ayuda={saldo > 0 ? `Saldo pendiente: ${dinero(saldo)}` : undefined}
          />
          <Seleccion
            etiqueta="Método"
            value={formulario.valores.metodo}
            onChange={(evento) => formulario.cambiar('metodo', evento.target.value as MetodoPago)}
            opciones={METODOS.map((valor) => ({ valor, texto: nombreMetodoPago(valor) }))}
            error={formulario.errores.metodo}
          />
          <Entrada
            etiqueta="Referencia"
            ayuda="Opcional. Número de operación de Yape o transferencia."
            value={formulario.valores.referencia}
            onChange={(evento) => formulario.cambiar('referencia', evento.target.value)}
            error={formulario.errores.referencia}
          />
          <Entrada
            etiqueta="Fecha"
            type="date"
            ayuda="Opcional. Por defecto, ahora."
            value={formulario.valores.fecha}
            onChange={(evento) => formulario.cambiar('fecha', evento.target.value)}
            error={formulario.errores.fecha}
          />
        </div>

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
