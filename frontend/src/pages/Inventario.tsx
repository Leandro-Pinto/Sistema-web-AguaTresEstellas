import { useEffect, useMemo, useState } from 'react'
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
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { useAutenticacion } from '@/context/autenticacion'
import { usePeticion, useFormulario } from '@/hooks'
import { productos } from '@/services/api'
import type { MovimientoInventarioInput } from '@/services/api'
import type { ProductoFormulario } from '@/types/dominio'
import type { FilaInventario, MovimientoInventario, TipoMovimientoInventario } from '@/types/dominio'
import { dinero, fechaHora, numero } from '@/utils/formato'

/** Campos del modal de movimiento. `cantidad` se ignora en el ajuste. */
interface MovimientoForm {
  tipo: TipoMovimientoInventario
  productoId: number
  cantidad: number
  stockFinal: number
  origen: string
  observaciones: string
}

const movimientoVacio: MovimientoForm = {
  tipo: 'ENTRADA',
  productoId: 0,
  cantidad: 1,
  stockFinal: 0,
  origen: 'COMPRA A PROVEEDOR',
  observaciones: '',
}

export const PaginaInventario = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [busqueda, setBusqueda] = useState('')
  const [soloStockBajo, setSoloStockBajo] = useState(false)

  const [movimientoAbierto, setMovimientoAbierto] = useState(false)
  const [historial, setHistorial] = useState<FilaInventario | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)
  const [procesando, setProcesando] = useState(false)

  // El inventario no se pagina: son decenas de filas y el backend lo devuelve
  // completo para poder calcular los totales en una sola pasada.
  const inventario = usePeticion<FilaInventario[]>(() => productos.verInventario(), [])

  const formulario = useFormulario<MovimientoForm>(movimientoVacio)
  const [catalogo, setCatalogo] = useState<ProductoFormulario[]>([])

  useEffect(() => {
    if (!esAdmin || !movimientoAbierto) return
    let vigente = true
    void productos
      .activos()
      .then((lista) => {
        if (vigente) setCatalogo(lista)
      })
      .catch(() => {
        // Sin catálogo el modal sigue siendo utilizable: el campo de producto
        // queda vacío y el usuario ya no puede elegir nada, pero el resto de la
        // pantalla no se cae.
      })
    return () => {
      vigente = false
    }
  }, [esAdmin, movimientoAbierto])

  const filas = useMemo(() => {
    const todas = inventario.datos ?? []
    const texto = busqueda.trim().toLowerCase()
    return todas.filter((fila) => {
      if (soloStockBajo && !fila.stockBajo) return false
      if (!texto) return true
      return fila.nombre.toLowerCase().includes(texto) || fila.codigo.toLowerCase().includes(texto)
    })
  }, [inventario.datos, busqueda, soloStockBajo])

  const resumen = useMemo(() => {
    const todas = inventario.datos ?? []
    return {
      total: todas.length,
      agotados: todas.filter((fila) => fila.nivelStock === 'AGOTADO').length,
      bajos: todas.filter((fila) => fila.nivelStock === 'BAJO').length,
      valor: todas.reduce((suma, fila) => suma + fila.valorInventarioCosto, 0),
    }
  }, [inventario.datos])

  const abrirMovimiento = (fila?: FilaInventario) => {
    formulario.reiniciar({
      ...movimientoVacio,
      productoId: fila?.id ?? catalogo[0]?.id ?? 0,
      stockFinal: fila?.stock ?? 0,
    })
    setMovimientoAbierto(true)
  }

  const registrar = () => {
    void formulario.enviar(async () => {
      const valores = formulario.valores
      if (!valores.productoId) throw new Error('Seleccione el producto del movimiento.')

      const base: Omit<MovimientoInventarioInput, 'tipo'> & { tipo: TipoMovimientoInventario } = {
        tipo: valores.tipo,
        productoId: valores.productoId,
        cantidad: valores.cantidad,
        origen: valores.origen,
        observaciones: valores.observaciones || null,
      } as Omit<MovimientoInventarioInput, 'tipo'> & { tipo: TipoMovimientoInventario }

      // El ajuste es el único que no manda cantidad: el backend recalcula la
      // diferencia a partir del stock final deseado. Sin esta separación se
      // enviaría un cuerpo que el esquema rechaza con 400.
      const cuerpo: MovimientoInventarioInput =
        valores.tipo === 'AJUSTE'
          ? {
              tipo: 'AJUSTE',
              productoId: valores.productoId,
              stockFinal: valores.stockFinal,
              origen: 'AJUSTE MANUAL',
              observaciones: valores.observaciones,
            }
          : (base as MovimientoInventarioInput)

      await productos.registrarMovimiento(cuerpo)
      setAviso({ tipo: 'exito', mensaje: 'Movimiento registrado. El stock fue actualizado.' })
      setMovimientoAbierto(false)
      inventario.recargar()
    })
  }

  const eliminar = () => {
    if (!historial) return
    setProcesando(true)
    void productos
      .eliminar(historial.id)
      .then(() => {
        setAviso({ tipo: 'exito', mensaje: `Producto ${historial.codigo} eliminado.` })
        inventario.recargar()
      })
      .catch((fallo: unknown) => {
        setAviso({
          tipo: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo eliminar el producto.',
        })
      })
      .finally(() => {
        setProcesando(false)
        setHistorial(null)
      })
  }

  const productoElegido = filas.find((fila) => fila.id === formulario.valores.productoId)

  return (
    <Pagina
      titulo="Inventario"
      descripcion="Stock actual, alertas de reposición y movimientos de entrada, salida y ajuste."
      acciones={
        esAdmin && (
          <Boton onClick={() => abrirMovimiento()}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Registrar movimiento
          </Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Productos</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{numero(resumen.total)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Agotados</p>
          <p className="mt-1 text-2xl font-semibold text-rose-600">{numero(resumen.agotados)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Stock bajo</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{numero(resumen.bajos)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor a costo</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{dinero(resumen.valor)}</p>
        </Tarjeta>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
            className="w-full rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-marca-500 sm:flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={soloStockBajo}
              onChange={(evento) => setSoloStockBajo(evento.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
            />
            Solo productos en alerta
          </label>
        </div>

        <Tabla
          columnas={[
            { clave: 'codigo', encabezado: 'Código' },
            { clave: 'nombre', encabezado: 'Producto' },
            { clave: 'stock', encabezado: 'Stock', clase: 'text-right' },
            { clave: 'minimo', encabezado: 'Mínimo', clase: 'text-right' },
            { clave: 'nivel', encabezado: 'Nivel' },
            { clave: 'costo', encabezado: 'Costo', clase: 'text-right' },
            { clave: 'valor', encabezado: 'Valor', clase: 'text-right' },
            ...(esAdmin ? [{ clave: 'acciones', encabezado: 'Acciones', clase: 'text-right' }] : []),
          ]}
          filas={filas}
          claveFila={(fila) => fila.id}
          cargando={inventario.cargando}
          error={inventario.error}
          reintentar={inventario.recargar}
          vacio={{
            titulo: 'No hay productos que coincidan',
            descripcion: 'Ajuste la búsqueda o desactive el filtro de alerta.',
          }}
          renderFila={(fila) => (
            <>
              <Celda className="font-medium text-slate-900">{fila.codigo}</Celda>
              <Celda>
                <span className="block max-w-[18rem] truncate" title={fila.nombre}>
                  {fila.nombre}
                </span>
                <span className="text-xs text-slate-500">{fila.unidadMedida.toLowerCase()}</span>
              </Celda>
              <Celda numerica className="font-medium">
                {numero(fila.stock)}
              </Celda>
              <Celda numerica>{numero(fila.stockMinimo)}</Celda>
              <Celda>
                <Etiqueta
                  tono={
                    fila.nivelStock === 'AGOTADO' ? 'error' : fila.nivelStock === 'BAJO' ? 'aviso' : 'exito'
                  }
                >
                  {fila.nivelStock === 'AGOTADO' ? 'Agotado' : fila.nivelStock === 'BAJO' ? 'Bajo' : 'Normal'}
                </Etiqueta>
              </Celda>
              <Celda numerica>{dinero(fila.costoUnitario)}</Celda>
              <Celda numerica>{dinero(fila.valorInventarioCosto)}</Celda>
              {esAdmin && (
                <Celda className="text-right">
                  <div className="flex justify-end gap-1">
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      onClick={() => {
                        setHistorial(null)
                        abrirMovimiento(fila)
                      }}
                    >
                      Mover
                    </Boton>
                    <Boton
                      variante="fantasma"
                      tamano="sm"
                      onClick={() => setHistorial(fila)}
                    >
                      Historial
                    </Boton>
                  </div>
                </Celda>
              )}
            </>
          )}
        />
      </div>

      <Modal
        abierto={movimientoAbierto}
        titulo="Registrar movimiento de inventario"
        descripcion="El stock nunca se edita directamente: el sistema recalcula el nuevo stock a partir del movimiento."
        ancho="lg"
        alCerrar={() => setMovimientoAbierto(false)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setMovimientoAbierto(false)} disabled={formulario.enviando}>
              Cancelar
            </Boton>
            <Boton onClick={registrar} cargando={formulario.enviando}>
              Registrar movimiento
            </Boton>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            registrar()
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Seleccion
              etiqueta="Tipo de movimiento"
              requerido
              value={formulario.valores.tipo}
              error={formulario.errores.tipo}
              onChange={(evento) =>
                formulario.cambiar('tipo', evento.target.value as TipoMovimientoInventario)
              }
              opciones={[
                { valor: 'ENTRADA', texto: 'Entrada (compra, devolución)' },
                { valor: 'SALIDA', texto: 'Salida (merma, consumo)' },
                { valor: 'AJUSTE', texto: 'Ajuste a stock contado' },
              ]}
            />
            <Seleccion
              etiqueta="Producto"
              requerido
              value={String(formulario.valores.productoId)}
              error={formulario.errores.productoId}
              onChange={(evento) => formulario.cambiar('productoId', Number(evento.target.value))}
              opciones={catalogo.map((producto) => ({
                valor: producto.id,
                texto: `${producto.codigo} — ${producto.nombre} (stock ${producto.stock})`,
              }))}
              marcador="Seleccione un producto…"
            />
          </div>

          {formulario.valores.tipo === 'AJUSTE' ? (
            <Entrada
              etiqueta="Stock final contado"
              requerido
              type="number"
              min="0"
              step="1"
              ayuda={
                productoElegido
                  ? `Stock registrado: ${productoElegido.stock}. El sistema calculará la diferencia.`
                  : 'Cantidad física contada en almacén.'
              }
              value={String(formulario.valores.stockFinal)}
              error={formulario.errores.stockFinal}
              onChange={(evento) => formulario.cambiar('stockFinal', Number(evento.target.value))}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada
                etiqueta="Cantidad"
                requerido
                type="number"
                min="1"
                step="1"
                ayuda={
                  productoElegido ? `Stock registrado: ${productoElegido.stock}.` : undefined
                }
                value={String(formulario.valores.cantidad)}
                error={formulario.errores.cantidad}
                onChange={(evento) => formulario.cambiar('cantidad', Number(evento.target.value))}
              />
              <Entrada
                etiqueta="Origen"
                requerido
                value={formulario.valores.origen}
                error={formulario.errores.origen}
                onChange={(evento) => formulario.cambiar('origen', evento.target.value)}
              />
            </div>
          )}

          <AreaTexto
            etiqueta="Observaciones"
            requerido={formulario.valores.tipo === 'AJUSTE'}
            ayuda={
              formulario.valores.tipo === 'AJUSTE'
                ? 'El ajuste exige un motivo: queda registrado en la bitácora.'
                : 'Opcional.'
            }
            value={formulario.valores.observaciones}
            error={formulario.errores.observaciones}
            onChange={(evento) => formulario.cambiar('observaciones', evento.target.value)}
          />

          {formulario.errores.general && (
            <p role="alert" className="text-sm font-medium text-rose-600">
              {formulario.errores.general}
            </p>
          )}
        </form>
      </Modal>

      {historial && (
        <ModalHistorial
          fila={historial}
          alCerrar={() => setHistorial(null)}
          alEliminar={esAdmin ? eliminar : undefined}
          procesando={procesando}
        />
      )}
    </Pagina>
  )
}

/**
 * Historial paginado de movimientos de un producto.
 *
 * Solo se monta cuando hay una fila seleccionada. Antes se montaba siempre y
 * pedía los movimientos con `productoId: 0` cuando aún no había fila, lo que
 * hacía que el backend respondiera 422 en cada carga de la página.
 */
const ModalHistorial = ({
  fila,
  alCerrar,
  alEliminar,
  procesando,
}: {
  fila: FilaInventario
  alCerrar: () => void
  alEliminar?: () => void
  procesando: boolean
}) => {
  const movimientos = useListado<MovimientoInventario>('/productos/inventario/movimientos', {
    productoId: fila.id,
    limite: 10,
  })

  return (
    <Modal
      abierto
      titulo={`Historial de ${fila.nombre}`}
      descripcion={`Código ${fila.codigo} · stock actual ${fila.stock}`}
      ancho="xl"
      alCerrar={alCerrar}
      pie={
        <>
          {alEliminar && fila.activo && (
            <Boton variante="peligro" onClick={alEliminar} disabled={procesando}>
              Eliminar producto
            </Boton>
          )}
          <Boton variante="secundario" onClick={alCerrar}>
            Cerrar
          </Boton>
        </>
      }
    >
      <Listado<MovimientoInventario>
        {...movimientos}
        columnas={[
          { clave: 'fecha', encabezado: 'Fecha' },
          { clave: 'tipo', encabezado: 'Tipo' },
          { clave: 'cantidad', encabezado: 'Cantidad', clase: 'text-right' },
          { clave: 'stock', encabezado: 'Stock', clase: 'text-right' },
          { clave: 'origen', encabezado: 'Origen' },
        ]}
        claveFila={(movimiento) => movimiento.id}
        barra={<BarraListado busqueda="" alBuscar={() => undefined} marcador="Sin búsqueda en movimientos" />}
        vacio={{ titulo: 'Este producto todavía no tiene movimientos' }}
        renderFila={(movimiento) => (
          <>
            <Celda>{fechaHora(movimiento.fecha)}</Celda>
            <Celda>
              <Etiqueta
                tono={
                  movimiento.tipo === 'ENTRADA' ? 'exito' : movimiento.tipo === 'SALIDA' ? 'aviso' : 'info'
                }
              >
                {movimiento.tipo}
              </Etiqueta>
            </Celda>
            <Celda numerica>{numero(movimiento.cantidad)}</Celda>
            <Celda numerica>
              {numero(movimiento.stockAnterior)} → {numero(movimiento.stockResultante)}
            </Celda>
            <Celda>{movimiento.origen}</Celda>
          </>
        )}
      />
    </Modal>
  )
}
