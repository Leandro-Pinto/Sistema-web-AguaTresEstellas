import { useMemo, useState } from 'react'
import { reportes } from '@/services/api'
import { usePeticion } from '@/hooks'
import { useAutenticacion } from '@/context/autenticacion'
import type { ComparacionIndicador, IndicadoresProceso, IndicadoresSistema, ParametrosPretest } from '@/types/dominio'
import { Aviso, Boton, Cargador, Entrada, Error_, Etiqueta, Pagina, Tarjeta } from '@/components/ui'
import { clases, duracion, fechaHora, numero, paraCampoFecha, porcentaje } from '@/utils/formato'

/** Una celda de la matriz: valor único con su unidad y una nota de lectura. */
interface Indicador {
  clave: string
  nombre: string
  valor: number
  unidad: 'minutos' | 'segundos' | 'porcentaje' | 'ms' | 'numero' | 'conteo'
  lectura: string
}

/**
 * Los tres bloques de la matriz de operacionalización. Cada tarjeta muestra el
 * valor y, debajo, qué significa: en un capítulo de resultados el número solo
 * sirve acompañado de su interpretación.
 */
const dimension = (indicadores: Indicador[]) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {indicadores.map((i) => (
      <div key={i.clave} className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.nombre}</p>
        <p className={clases('mt-1 text-lg font-semibold text-slate-900', i.unidad === 'porcentaje' && 'text-emerald-700')}>
          {i.unidad === 'porcentaje'
            ? porcentaje(i.valor, 2)
            : i.unidad === 'minutos'
              ? duracion(i.valor)
              : i.unidad === 'segundos'
                ? `${numero(i.valor, 2)} s`
                : i.unidad === 'ms'
                  ? `${numero(i.valor, 0)} ms`
                  : numero(i.valor)}
        </p>
        <p className="mt-1 text-xs text-slate-500">{i.lectura}</p>
      </div>
    ))}
  </div>
)

const indicadoresProceso = (d: IndicadoresProceso): Indicador[] => [
  {
    clave: 'registro',
    nombre: 'Tiempo de registro de pedido',
    valor: d.recepcionYRegistro.tiempoPromedioRegistroMin,
    unidad: 'minutos',
    lectura: 'Desde que el pedido se recibe hasta que queda registrado.',
  },
  {
    clave: 'pedidosCorrectos',
    nombre: 'Pedidos registrados correctamente',
    valor: d.recepcionYRegistro.porcentajePedidosRegistradosCorrectamente,
    unidad: 'porcentaje',
    lectura: 'Cumple cliente, producto, importe, fecha y modalidad de entrega.',
  },
  {
    clave: 'pedidosError',
    nombre: 'Pedidos con error de registro',
    valor: d.recepcionYRegistro.porcentajePedidosConErrores,
    unidad: 'porcentaje',
    lectura: 'Marcados con `requiereCorreccion` en el proceso.',
  },
  {
    clave: 'procesoVenta',
    nombre: 'Tiempo de procesamiento de venta',
    valor: d.procesamientoYControl.tiempoPromedioProcesamientoVentaMin,
    unidad: 'minutos',
    lectura: 'Desde el registro del pedido hasta el cobro completo.',
  },
  {
    clave: 'ventasCorrectas',
    nombre: 'Ventas procesadas correctamente',
    valor: d.procesamientoYControl.porcentajeVentasProcesadasCorrectamente,
    unidad: 'porcentaje',
    lectura: 'Ventas no anuladas en el periodo.',
  },
  {
    clave: 'ventasError',
    nombre: 'Ventas con error',
    valor: d.procesamientoYControl.porcentajeVentasConErrores,
    unidad: 'porcentaje',
    lectura: 'Ventas anuladas en el periodo.',
  },
  {
    clave: 'pagoRegistrado',
    nombre: 'Ventas con pago registrado',
    valor: d.procesamientoYControl.porcentajeVentasConPagoRegistrado,
    unidad: 'porcentaje',
    lectura: 'Control de caja: no toda venta queda al crédito.',
  },
  {
    clave: 'stockCorrecto',
    nombre: 'Actualización correcta de stock',
    valor: d.procesamientoYControl.porcentajeActualizacionCorrectaStock,
    unidad: 'porcentaje',
    lectura: 'Movimientos de inventario consistentes con el stock calculado.',
  },
  {
    clave: 'confirmacionAsignacion',
    nombre: 'Confirmación y asignación',
    valor: d.atencionYSeguimiento.tiempoPromedioConfirmacionYAsignacionMin,
    unidad: 'minutos',
    lectura: 'Desde el registro hasta que la entrega tiene repartidor.',
  },
  {
    clave: 'cicloCompleto',
    nombre: 'Ciclo completo del pedido',
    valor: d.atencionYSeguimiento.tiempoPromedioCicloCompletoMin,
    unidad: 'minutos',
    lectura: 'Desde el registro hasta la entrega al cliente.',
  },
  {
    clave: 'atendidos',
    nombre: 'Pedidos atendidos correctamente',
    valor: d.atencionYSeguimiento.porcentajePedidosAtendidosCorrectamente,
    unidad: 'porcentaje',
    lectura: 'Pedidos que llegaron a estado entregado.',
  },
  {
    clave: 'trazabilidad',
    nombre: 'Trazabilidad completa',
    valor: d.atencionYSeguimiento.porcentajePedidosConTrazabilidadCompleta,
    unidad: 'porcentaje',
    lectura: 'Historial de estados con usuario y fecha en cada transición.',
  },
  {
    clave: 'clientesCompletos',
    nombre: 'Clientes con datos completos',
    valor: d.complementarios.porcentajeClientesConDatosCompletos,
    unidad: 'porcentaje',
    lectura: 'Indicador complementario de calidad de datos.',
  },
  {
    clave: 'envasesCompletos',
    nombre: 'Envases con información completa',
    valor: d.complementarios.porcentajeEnvasesConInformacionCompleta,
    unidad: 'porcentaje',
    lectura: 'Control del ciclo de loaned envases.',
  },
  {
    clave: 'consultaEnvases',
    nombre: 'Consulta de historial de envases',
    valor: d.complementarios.tiempoPromedioConsultaEnvasesSegundos,
    unidad: 'segundos',
    lectura: 'Tiempo de respuesta de la consulta que reemplaza el cuaderno.',
  },
  {
    clave: 'consolidadoDiario',
    nombre: 'Consolidado diario',
    valor: d.complementarios.tiempoPromedioConsolidadoDiarioSegundos,
    unidad: 'segundos',
    lectura: 'Tiempo de respuesta del reporte de ventas del día.',
  },
]

const indicadoresSistema = (d: IndicadoresSistema): Indicador[] => [
  {
    clave: 'requisitos',
    nombre: 'Requisitos implementados y aprobados',
    valor: d.adecuacionFuncional.porcentajeRequisitosImplementadosYApruebados,
    unidad: 'porcentaje',
    lectura: `${d.adecuacionFuncional.requisitosAprobados} de ${d.adecuacionFuncional.totalRequisitos} requisitos.`,
  },
  {
    clave: 'casos',
    nombre: 'Casos de prueba superados',
    valor: d.adecuacionFuncional.porcentajeCasosDePruebaSuperados,
    unidad: 'porcentaje',
    lectura: `${d.adecuacionFuncional.casosAprobados} de ${d.adecuacionFuncional.totalCasosEjecutados} casos ejecutados.`,
  },
  {
    clave: 'transacciones',
    nombre: 'Transacciones con resultado esperado',
    valor: d.adecuacionFuncional.porcentajeTransaccionesConResultadoEsperado,
    unidad: 'porcentaje',
    lectura: 'Mismo universo de casos de prueba, leído como resultado de negocio y no técnico.',
  },
  {
    clave: 'mediana',
    nombre: 'Tiempo de respuesta (mediana)',
    valor: d.eficienciaDesempeno.tiempoRespuestaMedianaMs,
    unidad: 'ms',
    lectura: 'Mediana de las peticiones registradas en la bitácora.',
  },
  {
    clave: 'p95',
    nombre: 'Tiempo de respuesta (p95)',
    valor: d.eficienciaDesempeno.tiempoRespuestaP95Ms,
    unidad: 'ms',
    lectura: 'El 95 % de las peticiones responde más rápido que este valor.',
  },
  {
    clave: 'rendimiento',
    nombre: 'Transacciones por minuto',
    valor: d.eficienciaDesempeno.rendimientoTransaccionesPorMinuto,
    unidad: 'numero',
    lectura: `Pico registrado: ${d.eficienciaDesempeno.picoTransaccionesPorMinuto} por minuto.`,
  },
  {
    clave: 'fallidas',
    nombre: 'Solicitudes fallidas (5xx)',
    valor: d.fiabilidad.porcentajeSolicitudesFallidas,
    unidad: 'porcentaje',
    lectura: `${d.fiabilidad.solicitudesFallidas} errores de servidor en el periodo.`,
  },
  {
    clave: 'disponibilidad',
    nombre: 'Disponibilidad observada',
    valor: d.fiabilidad.porcentajeDisponibilidadObservado,
    unidad: 'porcentaje',
    lectura: `Indisponibilidad registrada: ${d.fiabilidad.minutosTotalesDeIndisponibilidad} min.`,
  },
  {
    clave: 'mttr',
    nombre: 'Tiempo medio de recuperación',
    valor: d.fiabilidad.tiempoMedioRecuperacionMin,
    unidad: 'minutos',
    lectura: `${d.fiabilidad.incidenciasResueltas} de ${d.fiabilidad.incidenciasRegistradas} incidencias resueltas.`,
  },
]

/** Fila de la tabla pretest/postest. */
const etiquetaComparacion: Record<string, string> = {
  tiempoPromedioRegistro: 'Tiempo de registro del pedido',
  tiempoPromedioProcesamientoVenta: 'Tiempo de procesamiento de la venta',
  tiempoPromedioConfirmacionYAsignacion: 'Confirmación y asignación',
  porcentajePedidosRegistradosCorrectamente: 'Pedidos registrados correctamente',
  porcentajeVentasProcesadasCorrectamente: 'Ventas procesadas correctamente',
  porcentajePedidosAtendidosCorrectamente: 'Pedidos atendidos correctamente',
  porcentajePedidosConTrazabilidadCompleta: 'Pedidos con trazabilidad completa',
}

const celdaComparacion = (c: ComparacionIndicador) => {
  if (c.antes === null) {
    return (
      <span className="text-slate-400" title="La ficha del pretest no tiene el conteo observado">
        sin dato
      </span>
    )
  }
  return c.unidad === '%' ? porcentaje(c.antes, 2) : duracion(c.antes)
}

const Indicadores = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const hoy = paraCampoFecha()
  const [desde, setDesde] = useState(() => {
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 29)
    return paraCampoFecha(inicio)
  })
  const [hasta, setHasta] = useState(hoy)

  const [descargando, setDescargando] = useState(false)
  const [calculadoEn, setCalculadoEn] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  /**
   * La ficha del pretest se puede editar porque los porcentajes observados se
   * cargan a mano desde la ficha de observación de la tesis. Se mantiene solo
   * en esta sesión: es un dato de la investigación, no del sistema.
   *
   * `ficha` es el ajuste aplicado a la petición y `borrador` lo que se está
   * escribiendo. Se guardan por separado para que abrir el editor no cambie
   * nada hasta que el usuario confirme.
   */
  const [ficha, setFicha] = useState<ParametrosPretest | null>(null)
  const [editandoPretest, setEditandoPretest] = useState(false)
  const [borrador, setBorrador] = useState<ParametrosPretest | null>(null)

  const rango = useMemo(
    () => (desde > hasta ? { fechaInicio: hasta, fechaFin: desde } : { fechaInicio: desde, fechaFin: hasta }),
    [desde, hasta],
  )

  const { cargando, error, datos, recargar } = usePeticion<{
    postest: IndicadoresProceso
    sistema: IndicadoresSistema
    pretest: ParametrosPretest
    comparacion: Record<string, ComparacionIndicador>
  }>(
    async () => {
      // Sin `ficha` el servidor usa su línea base, que es la fuente de verdad.
      const respuesta = await reportes.comparativo(rango.fechaInicio, rango.fechaFin, ficha ?? undefined)
      // Se registra el momento de la lectura, no el del render: una pantalla
      // abierta debe seguir mostrando la hora del postest realmente calculado.
      setCalculadoEn(new Date().toISOString())
      return {
        postest: respuesta.postest,
        sistema: respuesta.sistema,
        pretest: respuesta.pretest,
        comparacion: respuesta.comparacion,
      }
    },
    [rango, ficha],
  )

  const exportar = async () => {
    setDescargando(true)
    try {
      await reportes.descargarIndicadores(rango.fechaInicio, rango.fechaFin)
      setAviso({ tipo: 'exito', mensaje: 'Los indicadores se exportaron en CSV.' })
    } catch {
      setAviso({ tipo: 'error', mensaje: 'No se pudo exportar. Verifique sus permisos e intente nuevamente.' })
    } finally {
      setDescargando(false)
    }
  }

  const camposPorcentaje: { clave: keyof ParametrosPretest; nombre: string }[] = [
    { clave: 'porcentajePedidosCorrectos', nombre: 'Pedidos correctos (%)' },
    { clave: 'porcentajeVentasCorrectas', nombre: 'Ventas correctas (%)' },
    { clave: 'porcentajePedidosAtendidos', nombre: 'Pedidos atendidos (%)' },
    { clave: 'porcentajeTrazabilidadCompleta', nombre: 'Trazabilidad completa (%)' },
  ]

  return (
    <Pagina
      titulo="Indicadores"
      descripcion="Postest calculado por el sistema sobre los datos reales registrados, y comparación con la línea base del pretest."
      acciones={
        esAdmin && (
          <Boton variante="secundario" onClick={exportar} cargando={descargando}>
            Exportar CSV
          </Boton>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <Tarjeta titulo="Periodo del postest" descripcion="Los tres bloques se calculan sobre el mismo rango.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Entrada etiqueta="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
          <div className="flex items-end">
            <Etiqueta>
              Muestra: {datos?.postest.muestra.pedidos ?? '—'} pedidos, {datos?.postest.muestra.ventas ?? '—'} ventas,{' '}
              {datos?.postest.muestra.pagos ?? '—'} pagos, {datos?.postest.muestra.entregas ?? '—'} entregas.
            </Etiqueta>
          </div>
        </div>
      </Tarjeta>

      {error && <Error_ error={error} reintentar={recargar} />}
      {cargando && <Cargador texto="Calculando indicadores." />}

      {!cargando && !error && datos && (
        <>
          <Tarjeta
            titulo="Variable dependiente: proceso de ventas"
            descripcion="Recepción, procesamiento y atención de pedidos en el sistema web."
          >
            {dimension(indicadoresProceso(datos.postest))}
          </Tarjeta>

          <Tarjeta
            titulo="Variable independiente: sistema web"
            descripcion="Adecuación funcional, eficiencia del desempeño y fiabilidad."
          >
            {dimension(indicadoresSistema(datos.sistema))}
          </Tarjeta>

          <Tarjeta
            titulo="Comparación pretest / postest"
            descripcion="El pretest proviene de la ficha de observación del proceso manual; el postest, de los datos del sistema."
            acciones={
              <Boton
                variante="fantasma"
                onClick={() => {
                  if (editandoPretest && borrador) {
                    setFicha(borrador)
                    setEditandoPretest(false)
                  } else {
                    setBorrador(datos.pretest)
                    setEditandoPretest(true)
                  }
                }}
              >
                {editandoPretest ? 'Aplicar ficha' : 'Editar ficha'}
              </Boton>
            }
          >
            {editandoPretest && borrador && (
              <div className="mb-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
                <Entrada
                  etiqueta="Registro (min)"
                  type="number"
                  step="0.1"
                  value={String(borrador.tiempoRegistroMin ?? '')}
                  onChange={(e) => setBorrador({ ...borrador, tiempoRegistroMin: Number(e.target.value) })}
                />
                <Entrada
                  etiqueta="Procesamiento venta (min)"
                  type="number"
                  step="0.1"
                  value={String(borrador.tiempoProcesamientoVentaMin ?? '')}
                  onChange={(e) => setBorrador({ ...borrador, tiempoProcesamientoVentaMin: Number(e.target.value) })}
                />
                <Entrada
                  etiqueta="Confirmación y asignación (min)"
                  type="number"
                  step="0.1"
                  value={String(borrador.tiempoConfirmacionAsignacionMin ?? '')}
                  onChange={(e) => setBorrador({ ...borrador, tiempoConfirmacionAsignacionMin: Number(e.target.value) })}
                />
                {camposPorcentaje.map((campo) => (
                  <Entrada
                    key={campo.clave}
                    etiqueta={campo.nombre}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    ayuda="Vacío si el conteo observado aún no está cargado."
                    value={borrador[campo.clave] === null ? '' : String(borrador[campo.clave] ?? '')}
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        [campo.clave]: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Indicador</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Pretest</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Postest</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Diferencia</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(datos.comparacion).map(([clave, c]) => (
                    <tr key={clave} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 text-slate-800">{etiquetaComparacion[clave] ?? clave}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{celdaComparacion(c)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                        {c.unidad === '%' ? porcentaje(c.despues, 2) : duracion(c.despues)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {c.diferencia === null
                          ? '—'
                          : c.unidad === '%'
                            ? `${c.diferencia > 0 ? '+' : ''}${numero(c.diferencia, 2)} pp`
                            : `${c.diferencia > 0 ? '+' : ''}${numero(c.diferencia, 2)} min`}
                      </td>
                      <td
                        className={clases(
                          'px-3 py-2.5 text-right',
                          c.variacionPorcentual === null && 'text-slate-400',
                          c.variacionPorcentual !== null && c.variacionPorcentual < 0 && 'text-emerald-700',
                        )}
                      >
                        {c.variacionPorcentual === null
                          ? '—'
                          : `${c.variacionPorcentual > 0 ? '+' : ''}${numero(c.variacionPorcentual, 1)} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Un porcentaje de variación negativo en tiempos significa que el sistema es más rápido que el proceso
              manual. En porcentajes de cumplimiento, negativo significa que el proceso manual era más alto.
            </p>
          </Tarjeta>

          {datos.sistema.eficienciaDesempeno.duracionPromedioPorRuta.length > 0 && (
            <Tarjeta titulo="Rutas más lentas" descripcion="Quince rutas con mayor tiempo de respuesta promedio.">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Ruta</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Peticiones</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Promedio</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Máximo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.sistema.eficienciaDesempeno.duracionPromedioPorRuta.map((ruta) => (
                      <tr key={ruta.ruta} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{ruta.ruta}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{numero(ruta.peticiones)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-800">{numero(ruta.promedioMs)} ms</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{numero(ruta.maximoMs)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {datos.sistema.fiabilidad.incidenciasRegistradas === 0 && (
            <p className="text-xs text-slate-500">
              Sin incidencias registradas en el periodo: el tiempo medio de recuperación se muestra en cero porque no
              hay caídas que promediar. Registre las incidencias en la pantalla de Evidencia.
            </p>
          )}

          <p className="text-xs text-slate-500">
            {calculadoEn && <>Postest calculado el {fechaHora(calculadoEn)}. </>}
            {`Periodo ${rango.fechaInicio} a ${rango.fechaFin}. `}
            Los valores del pretest no se calculan: se transcriben de la ficha de observación del proceso manual.
          </p>
        </>
      )}
    </Pagina>
  )
}

export default Indicadores
