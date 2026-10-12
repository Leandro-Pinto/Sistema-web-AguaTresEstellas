import { useMemo, useState } from 'react'
import { reportes } from '@/services/api'
import { usePeticion } from '@/hooks'
import { useAutenticacion } from '@/context/autenticacion'
import type {
  ComparacionIndicador,
  IndicadoresProceso,
  IndicadoresSistema,
  ParametrosPretest,
  RegistroLineaBase,
} from '@/types/dominio'
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

/**
 * Etiqueta de cada fila del comparativo.
 *
 * Son los nueve indicadores del proceso de ventas, en el orden en que aparecen
 * en la matriz de la tesis. Cada clave es el nombre exacto que devuelve el
 * backend; una clave que no esté aquí se muestra con su nombre crudo para que
 * el desajuste sea visible en lugar de silencioso.
 */
const etiquetaComparacion: Record<string, string> = {
  tiempoPromedioRegistro: 'Tiempo de registro del pedido',
  porcentajePedidosRegistradosCorrectamente: 'Pedidos registrados correctamente',
  porcentajePedidosConErroresDeRegistro: 'Pedidos con errores de registro',
  tiempoPromedioProcesamientoVenta: 'Tiempo de procesamiento de la venta',
  porcentajeVentasProcesadasCorrectamente: 'Ventas procesadas correctamente',
  porcentajeVentasConErrores: 'Ventas con errores de registro',
  tiempoPromedioConfirmacionYAsignacion: 'Confirmación y asignación',
  porcentajePedidosAtendidosCorrectamente: 'Pedidos atendidos correctamente',
  porcentajePedidosConTrazabilidadCompleta: 'Pedidos con trazabilidad completa',
}

/**
 * Convierte lo que escribe el usuario en un número, o en `null` si dejó el
 * campo vacío.
 *
 * `Number('')` es 0, no «sin dato». Si se usara tal cual, borrar un campo para
 * escribir «no medido» acabaría registrando un cero, que el comparativo leería
 * como un tiempo de proceso manual igual a cero.
 */
const numeroODatoVacio = (bruto: string): number | null => (bruto.trim() === '' ? null : Number(bruto))

/**
 * Los nueve valores de la ficha, sin la procedencia.
 *
 * El registro guardado trae además autor y fechas. Esa información se
 * muestra y no se reenvía: al guardar solo se manda la medición, porque
 * registrar quién lo hizo es tarea del servidor y no de esta pantalla.
 */
const comoBorrador = (registro: RegistroLineaBase): ParametrosPretest => ({
  tiempoRegistroMin: registro.tiempoRegistroMin ?? null,
  tiempoProcesamientoVentaMin: registro.tiempoProcesamientoVentaMin ?? null,
  tiempoConfirmacionAsignacionMin: registro.tiempoConfirmacionAsignacionMin ?? null,
  porcentajePedidosCorrectos: registro.porcentajePedidosCorrectos ?? null,
  porcentajeVentasCorrectas: registro.porcentajeVentasCorrectas ?? null,
  porcentajeVentasConErrores: registro.porcentajeVentasConErrores ?? null,
  porcentajePedidosAtendidos: registro.porcentajePedidosAtendidos ?? null,
  porcentajePedidosConErrores: registro.porcentajePedidosConErrores ?? null,
  porcentajeTrazabilidadCompleta: registro.porcentajeTrazabilidadCompleta ?? null,
})

/**
 * Contenido de la columna "pretest".
 *
 * `antes === null` significa que no se transcribió ese dato de la ficha de
 * observación. Se escribe "sin dato" y no 0: un cero afirmaría que el proceso
 * manual tomó cero minutos, que es una medición distinta de no haber medido.
 */
const celdaComparacion = (c: ComparacionIndicador) => {
  if (c.antes === null) {
    return (
      <span className="text-slate-400" title="Este valor no se transcribió de la ficha de observación del pretest">
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
   * Edición de la línea base del pretest.
   *
   * Lo guardado vive en el servidor y se trae con el comparativo; `borrador`
   * es lo que se está escribiendo ahora. Estar separados permite que abrir el
   * editor no cambie la tabla hasta que el administrador pulse «Guardar» y
   * el servidor confirme, con su nombre y su fecha, que quedó registrado.
   */
  const [editandoPretest, setEditandoPretest] = useState(false)
  const [borrador, setBorrador] = useState<ParametrosPretest | null>(null)
  const [guardando, setGuardando] = useState(false)

  const rango = useMemo(
    () => (desde > hasta ? { fechaInicio: hasta, fechaFin: desde } : { fechaInicio: desde, fechaFin: hasta }),
    [desde, hasta],
  )

  const { cargando, error, datos, recargar } = usePeticion<{
    postest: IndicadoresProceso
    sistema: IndicadoresSistema
    comparacion: Record<string, ComparacionIndicador>
    registro: RegistroLineaBase
  }>(
    async () => {
      // El comparativo y la línea base se piden juntos y en el mismo orden:
      // una pantalla que muestre la tabla de un valor y el registro de otro
      // estaría presentando como única verdad dos lecturas distintas.
      const [respuesta, registro] = await Promise.all([
        reportes.comparativo(rango.fechaInicio, rango.fechaFin),
        reportes.pretest(),
      ])
      // Se registra el momento de la lectura, no el del render: una pantalla
      // abierta debe seguir mostrando la hora del postest realmente calculado.
      setCalculadoEn(new Date().toISOString())
      return {
        postest: respuesta.postest,
        sistema: respuesta.sistema,
        comparacion: respuesta.comparacion,
        registro,
      }
    },
    [rango],
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

  /**
   * Guarda la línea base.
   *
   * Se envían solo los nueve valores: el servidor es quien decide quién figura
   * como autor y cuándo se registró, que es precisamente lo que hace auditable
   * la comparación. Hasta que la respuesta no llega, la pantalla sigue
   * mostrando lo anterior.
   */
  const guardarLineaBase = async () => {
    if (!borrador) return
    setGuardando(true)
    try {
      await reportes.guardarPretest(borrador)
      setEditandoPretest(false)
      setBorrador(null)
      setAviso({ tipo: 'exito', mensaje: 'La línea base quedó guardada con su nombre y fecha.' })
      recargar()
    } catch {
      setAviso({
        tipo: 'error',
        mensaje: 'No se pudo guardar la línea base. Verifique los valores e intente nuevamente.',
      })
    } finally {
      setGuardando(false)
    }
  }

  const camposPorcentaje: { clave: keyof ParametrosPretest; nombre: string }[] = [
    { clave: 'porcentajePedidosCorrectos', nombre: 'Pedidos correctos (%)' },
    { clave: 'porcentajePedidosConErrores', nombre: 'Pedidos con errores (%)' },
    { clave: 'porcentajeVentasCorrectas', nombre: 'Ventas correctas (%)' },
    { clave: 'porcentajeVentasConErrores', nombre: 'Ventas con errores (%)' },
    { clave: 'porcentajePedidosAtendidos', nombre: 'Pedidos atendidos (%)' },
    { clave: 'porcentajeTrazabilidadCompleta', nombre: 'Trazabilidad completa (%)' },
  ]

  return (
    <Pagina
      titulo="Indicadores"
      descripcion="Postest calculado por el sistema sobre los datos reales registrados. La columna del pretest sale de la línea base que el administrador transcribe de la ficha de observación del proceso manual."
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
            descripcion="El postest sale de los datos del sistema. La línea base se transcribe una sola vez desde la ficha de observación del proceso manual y queda guardada con autor y fecha."
            acciones={
              esAdmin ? (
                <div className="flex items-center gap-2">
                  {editandoPretest ? (
                    <>
                      <Boton
                        variante="fantasma"
                        disabled={guardando}
                        onClick={() => {
                          setEditandoPretest(false)
                          setBorrador(null)
                        }}
                      >
                        Cancelar
                      </Boton>
                      <Boton variante="primario" cargando={guardando} onClick={guardarLineaBase}>
                        Guardar línea base
                      </Boton>
                    </>
                  ) : (
                    <Boton
                      variante="secundario"
                      onClick={() => {
                        setBorrador(comoBorrador(datos.registro))
                        setEditandoPretest(true)
                      }}
                    >
                      Transcribir ficha
                    </Boton>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500">Solo el administrador puede modificarla.</span>
              )
            }
          >
            <p className="mb-3 text-xs text-slate-500" data-testid="procedencia-linea-base">
              {datos.registro.registrada ? (
                <>
                  Línea base transcrita por {datos.registro.creadoPor} el {fechaHora(datos.registro.creadoEn)}.
                  {datos.registro.actualizadoEn !== datos.registro.creadoEn && (
                    <>
                      {' '}
                      Corregida por {datos.registro.actualizadoPor} el {fechaHora(datos.registro.actualizadoEn)}.
                    </>
                  )}
                </>
              ) : (
                <>
                  Sin línea base registrada. El pretest todavía no se ha transcribido de la ficha de observación,
                  por eso la columna «Pretest» muestra «sin dato» y no un cero.
                </>
              )}
            </p>

            {editandoPretest && borrador && (
              <div className="mb-4 rounded-lg bg-slate-50 p-4">
                <p className="mb-3 text-xs text-slate-600">
                  Transcriba aquí los valores de la ficha de observación del pretest. Lo que quede vacío se
                  guardará como «no medido» y se mostrará como «sin dato». Al guardar quedará asociado a su
                  nombre y a la fecha de hoy.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Entrada
                    etiqueta="Registro (min)"
                    type="number"
                    step="0.1"
                    ayuda="Vacío si no se midió."
                    value={String(borrador.tiempoRegistroMin ?? '')}
                    onChange={(e) => setBorrador({ ...borrador, tiempoRegistroMin: numeroODatoVacio(e.target.value) })}
                  />
                  <Entrada
                    etiqueta="Procesamiento venta (min)"
                    type="number"
                    step="0.1"
                    ayuda="Vacío si no se midió."
                    value={String(borrador.tiempoProcesamientoVentaMin ?? '')}
                    onChange={(e) =>
                      setBorrador({ ...borrador, tiempoProcesamientoVentaMin: numeroODatoVacio(e.target.value) })
                    }
                  />
                  <Entrada
                    etiqueta="Confirmación y asignación (min)"
                    type="number"
                    step="0.1"
                    ayuda="Vacío si no se midió."
                    value={String(borrador.tiempoConfirmacionAsignacionMin ?? '')}
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        tiempoConfirmacionAsignacionMin: numeroODatoVacio(e.target.value),
                      })
                    }
                  />
                  {camposPorcentaje.map((campo) => (
                    <Entrada
                      key={campo.clave}
                      etiqueta={campo.nombre}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      ayuda="Vacío si no se hizo el conteo observado."
                      value={borrador[campo.clave] === null || borrador[campo.clave] === undefined ? '' : String(borrador[campo.clave])}
                      onChange={(e) =>
                        setBorrador({
                          ...borrador,
                          [campo.clave]: numeroODatoVacio(e.target.value),
                        })
                      }
                    />
                  ))}
                </div>
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
            La línea base del pretest no se mide en el sistema: se transcribe de la ficha de observación del
            proceso manual y se guarda con autor y fecha.
          </p>
        </>
      )}
    </Pagina>
  )
}

export default Indicadores
