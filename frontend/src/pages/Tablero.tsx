import { usePeticion } from '@/hooks'
import { tablero } from '@/services/api'
import type { ResumenTablero } from '@/types/dominio'
import { Boton, Cargador, Etiqueta, Error_, Pagina, Tarjeta } from '@/components/ui'
import {
  clases,
  dinero,
  desdeHace,
  nombreMetodoPago,
  presentacionPedido,
  presentacionVenta,
} from '@/utils/formato'

/**
 * Tablero principal.
 *
 * `GET /tablero` no exige rol: el backend entrega el mismo resumen a los tres.
 * Se muestra igual a todos para que el vendedor y el repartidor compartan una
 * única lectura de la situación del negocio.
 */
export const PaginaTablero = () => {
  const { datos, cargando, error, recargar } = usePeticion<ResumenTablero>(
    () => tablero.resumen(),
    [],
  )

  if (cargando) return <Cargador texto="Cargando el tablero…" />
  if (error) return <Error_ error={error} reintentar={recargar} />
  if (!datos) return null

  const { ventas, pedidos, ingresos, inventario, pagosPorMetodo } = datos
  const conAlerta = inventario.productosAgotados + inventario.productosStockBajo

  return (
    <Pagina
      titulo="Tablero"
      descripcion={`Resumen del ${new Date(datos.fecha).toLocaleDateString('es-PE', { dateStyle: 'full' })}`}
      acciones={
        <Boton variante="secundario" onClick={recargar}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Actualizar
        </Boton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          titulo="Ventas de hoy"
          valor={dinero(ventas.hoy.total)}
          pie={`${ventas.hoy.cantidad} venta${ventas.hoy.cantidad === 1 ? '' : 's'}`}
          detalle={`Ayer: ${dinero(ventas.ayer.total)}`}
          variacion={variacion(ventas.hoy.total, ventas.ayer.total)}
          icono={<IcoBolsa />}
          acento="marca"
        />
        <Metrica
          titulo="Cobrado hoy"
          valor={dinero(ingresos.cobradoHoy)}
          pie={`${pagosPorMetodo.reduce((suma, metodo) => suma + metodo.cantidad, 0)} pagos recibidos`}
          detalle={
            ingresos.ventasConSaldo > 0
              ? `${ingresos.ventasConSaldo} venta(s) con saldo pendiente`
              : 'Sin saldos pendientes'
          }
          icono={<IcoMoneda />}
          acento="exito"
        />
        <Metrica
          titulo="Pedidos pendientes"
          valor={String(pedidos.pendientes)}
          pie={`${pedidos.hoy} registrado(s) hoy`}
          detalle={`${pedidos.entregados} entregados · ${pedidos.cancelados} cancelados`}
          icono={<IcoCaja />}
          acento={pedidos.pendientes > 0 ? 'aviso' : 'neutro'}
        />
        <Metrica
          titulo="Alertas de inventario"
          valor={String(conAlerta)}
          pie={
            inventario.productosAgotados > 0
              ? `${inventario.productosAgotados} agotado(s)`
              : `${inventario.productosStockBajo} con stock bajo`
          }
          detalle={`Valor del inventario: ${dinero(inventario.valorTotalCosto)}`}
          icono={<IcoAlerta />}
          acento={inventario.productosAgotados > 0 ? 'error' : conAlerta > 0 ? 'aviso' : 'neutro'}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Tarjeta
          titulo="Alertas de stock"
          descripcion="Productos en o por debajo del mínimo configurado"
          className="lg:col-span-2"
          acciones={
            inventario.alertas.length > 0 ? (
              <Boton variante="fantasma" tamano="sm">
                Ver inventario
              </Boton>
            ) : undefined
          }
        >
          {inventario.alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No hay productos que requieran reposición.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inventario.alertas.map((alerta) => (
                <li key={alerta.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{alerta.nombre}</p>
                    <p className="text-xs text-slate-500">Mínimo configurado: {alerta.stockMinimo}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {alerta.stock}
                    </span>
                    <Etiqueta tono={alerta.stock === 0 ? 'error' : 'aviso'}>
                      {alerta.stock === 0 ? 'Agotado' : 'Stock bajo'}
                    </Etiqueta>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Cobros por método" descripcion="Del día de hoy">
          {pagosPorMetodo.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Todavía no hay cobros registrados.</p>
          ) : (
            <ul className="space-y-3">
              {pagosPorMetodo.map((metodo) => {
                const total = pagosPorMetodo.reduce((suma, m) => suma + m.total, 0)
                const proporcion = total > 0 ? (metodo.total / total) * 100 : 0
                return (
                  <li key={metodo.metodo}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-slate-700">{nombreMetodoPago(metodo.metodo)}</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {dinero(metodo.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-marca-500"
                          style={{ width: `${proporcion}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {metodo.cantidad} pago(s)
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Últimos pedidos" sinRelleno>
          {datos.ultimosPedidos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Aún no hay pedidos registrados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {datos.ultimosPedidos.map((pedido) => {
                const presentacion = presentacionPedido(pedido.estado)
                return (
                  <li key={pedido.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {pedido.codigo}
                        <span className="truncate font-normal text-slate-500">
                          · {pedido.cliente?.nombre ?? 'Cliente'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{desdeHace(pedido.recibidoEn)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {dinero(pedido.total)}
                      </span>
                      <Etiqueta tono={presentacion.estilo}>{presentacion.etiqueta}</Etiqueta>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Últimas ventas" sinRelleno>
          {datos.ultimasVentas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Aún no hay ventas registradas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {datos.ultimasVentas.map((venta) => {
                const presentacion = presentacionVenta(venta.estado)
                return (
                  <li key={venta.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {venta.numero}
                        <span className="truncate font-normal text-slate-500">
                          · {venta.cliente?.nombre ?? 'Cliente'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {desdeHace(venta.fecha)}
                        {venta.saldo > 0 && (
                          <span className="ml-1 font-medium text-amber-700">
                            · saldo {dinero(venta.saldo)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {dinero(venta.total)}
                      </span>
                      <Etiqueta tono={presentacion.estilo}>{presentacion.etiqueta}</Etiqueta>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </Pagina>
  )
}

/** Variación porcentual respecto del día anterior; null si no hay base. */
const variacion = (actual: number, anterior: number): number | null => {
  if (anterior <= 0) return null
  return ((actual - anterior) / anterior) * 100
}

const ACENTOS = {
  marca: 'bg-marca-50 text-marca-700',
  exito: 'bg-emerald-50 text-emerald-700',
  aviso: 'bg-amber-50 text-amber-700',
  error: 'bg-rose-50 text-rose-700',
  neutro: 'bg-slate-100 text-slate-600',
} as const

const Metrica = ({
  titulo,
  valor,
  pie,
  detalle,
  variacion: variacion_,
  icono,
  acento = 'neutro',
}: {
  titulo: string
  valor: string
  pie?: string
  detalle?: string
  variacion?: number | null
  icono: React.ReactNode
  acento?: keyof typeof ACENTOS
}) => (
  <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-slate-600">{titulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      </div>
      <span className={clases('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ACENTOS[acento])}>
        {icono}
      </span>
    </div>
    {pie && <p className="mt-2 text-sm text-slate-600">{pie}</p>}
    {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    {variacion_ !== undefined && variacion_ !== null && (
      <p
        className={clases(
          'mt-2 inline-flex items-center gap-1 text-xs font-medium',
          variacion_ >= 0 ? 'text-emerald-700' : 'text-rose-700',
        )}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path
            d={variacion_ >= 0 ? 'M12 19V5m-6 6l6-6 6 6' : 'M12 5v14m6-6l-6 6-6-6'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {Math.abs(variacion_).toFixed(1)} % frente a ayer
      </p>
    )}
  </div>
)

const IcoBolsa = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IcoMoneda = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9.5c-.6-.9-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.1 1.8 3 2.2 3 .9 3 2.3-1.3 2.5-3 2.5c-1.4 0-2.6-.6-3.2-1.6M12 6v12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IcoCaja = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 21V13" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IcoAlerta = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
