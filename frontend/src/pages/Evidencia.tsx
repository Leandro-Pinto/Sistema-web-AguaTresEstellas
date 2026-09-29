import { useState } from 'react'
import { evidencia } from '@/services/api'
import type { ModuloIncidencia } from '@/services/api'
import { useFormulario, usePeticion, useRetraso } from '@/hooks'
import { useAutenticacion } from '@/context/autenticacion'
import type { Incidencia } from '@/types/dominio'
import {
  AreaTexto,
  Aviso,
  Boton,
  Entrada,
  EsquemaCarga,
  Etiqueta,
  Modal,
  Pagina,
  Paginador,
  Seleccion,
  Tabla,
  Tarjeta,
  Vacio,
} from '@/components/ui'
import { useListado } from '@/hooks/useListado'
import { clases, fechaHora, numero } from '@/utils/formato'

const MODULOS: { valor: ModuloIncidencia; texto: string }[] = [
  { valor: 'AUTENTICACION', texto: 'Autenticación' },
  { valor: 'PEDIDOS', texto: 'Pedidos' },
  { valor: 'VENTAS', texto: 'Ventas' },
  { valor: 'PAGOS', texto: 'Pagos' },
  { valor: 'ENTREGAS', texto: 'Entregas' },
  { valor: 'BIDONES', texto: 'Bidones' },
  { valor: 'INVENTARIO', texto: 'Inventario' },
  { valor: 'REPORTES', texto: 'Reportes' },
  { valor: 'TABLERO', texto: 'Tablero' },
  { valor: 'OTRO', texto: 'Otro' },
]

const ESTADOS = [
  { valor: 'ABIERTA', texto: 'Abierta' },
  { valor: 'EN_PROCESO', texto: 'En proceso' },
  { valor: 'RESUELTA', texto: 'Resuelta' },
  { valor: 'DESCARTADA', texto: 'Descartada' },
]

const MODULOS_FILTRO = [{ valor: '', texto: 'Todos los módulos' }, ...MODULOS]

/** Presenta el estado con un color estable: es la lectura rápida de la tabla. */
const claseEstado = (estado: Incidencia['estado']) =>
  clases(
    'rounded px-1.5 py-0.5 text-xs font-medium',
    estado === 'ABIERTA' && 'bg-red-100 text-red-700',
    estado === 'EN_PROCESO' && 'bg-amber-100 text-amber-700',
    estado === 'RESUELTA' && 'bg-emerald-100 text-emerald-700',
    estado === 'DESCARTADA' && 'bg-slate-100 text-slate-500',
  )

const claseSeveridad = (severidad: number) =>
  clases(
    'rounded px-1.5 py-0.5 text-xs font-medium',
    severidad >= 4 && 'bg-red-100 text-red-700',
    severidad === 3 && 'bg-orange-100 text-orange-700',
    severidad === 2 && 'bg-amber-100 text-amber-700',
    severidad === 1 && 'bg-slate-100 text-slate-600',
  )

const Evidencia = () => {
  const { tieneRol } = useAutenticacion()
  const esAdmin = tieneRol('ADMINISTRADOR')

  const [modulo, setModulo] = useState('')
  const [estado, setEstado] = useState('')

  const { filas, paginacion, cargando, error, recargar, consulta, buscar, cambiarPagina } = useListado<Incidencia>(
    '/evidencia/incidencias',
    { modulo: modulo || undefined, estado: estado || undefined },
  )

  const [detalle, setDetalle] = useState<Incidencia | null>(null)
  const [creando, setCreando] = useState(false)
  const [resolviendo, setResolviendo] = useState<Incidencia | null>(null)
  const [descartando, setDescartando] = useState<Incidencia | null>(null)
  const [verBitacora, setVerBitacora] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null)

  const formulario = useFormulario({
    titulo: '',
    descripcion: '',
    pasosReproduccion: '',
    modulo: 'OTRO' as ModuloIncidencia,
    severidad: '3',
  })

  const formularioResolucion = useFormulario({ solucion: '', severidadFinal: '' })

  const formularioDescarte = useFormulario({ motivo: '' })

  const { cargando: calculando, datos: fiabilidad } = usePeticion(
    async () => evidencia.fiabilidad(),
    [],
  )

  /**
   * `enviar` devuelve `false` cuando el backend rechaza los datos. No se cierra
   * el modal en ese caso: el usuario tiene que ver el error en el campo y
   * corregirlo, no perder lo que escribió.
   */
  const registrar = async () => {
    const ok = await formulario.enviar(async () => {
      await evidencia.crear({
        titulo: formulario.valores.titulo.trim(),
        descripcion: formulario.valores.descripcion.trim(),
        pasosReproduccion: formulario.valores.pasosReproduccion.trim() || undefined,
        modulo: formulario.valores.modulo,
        severidad: Number(formulario.valores.severidad),
      })
    })
    if (!ok) return

    setCreando(false)
    formulario.reiniciar()
    setAviso({ tipo: 'exito', mensaje: 'Incidencia registrada en la evidencia.' })
    recargar()
  }

  const resolver = async () => {
    if (!resolviendo) return
    const ok = await formularioResolucion.enviar(async () => {
      await evidencia.resolver(resolviendo.id, {
        solucion: formularioResolucion.valores.solucion.trim(),
        ...(formularioResolucion.valores.severidadFinal
          ? { severidadFinal: Number(formularioResolucion.valores.severidadFinal) }
          : {}),
      })
    })
    if (!ok) return

    setResolviendo(null)
    formularioResolucion.reiniciar()
    setAviso({ tipo: 'exito', mensaje: 'Incidencia resuelta. Su tiempo ya cuenta para el MTTR.' })
    recargar()
  }

  /**
   * El motivo no es un detalle: el backend lo guarda en `solucion` y es la
   * justificación que queda registrada en la evidencia. Por eso se pide en
   * lugar de escribir uno fijo.
   */
  const descartar = async () => {
    if (!descartando) return
    const motivo = formularioDescarte.valores.motivo.trim()
    try {
      const ok = await formularioDescarte.enviar(async () => {
        await evidencia.descartar(descartando.id, motivo)
      })
      if (!ok) return

      setAviso({ tipo: 'exito', mensaje: 'Incidencia descartada.' })
      setDescartando(null)
      formularioDescarte.reiniciar()
      recargar()
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo descartar la incidencia.' })
    }
  }

  return (
    <Pagina
      titulo="Evidencia"
      descripcion="Incidencias detectadas durante la evaluación y bitácora de peticiones: el soporte objetivo de los indicadores de fiabilidad."
      acciones={
        <div className="flex gap-2">
          {esAdmin && (
            <Boton variante="secundario" onClick={() => setVerBitacora(true)}>
              Ver bitácora HTTP
            </Boton>
          )}
          <Boton onClick={() => setCreando(true)}>Registrar incidencia</Boton>
        </div>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo} mensaje={aviso.mensaje} alCerrar={() => setAviso(null)} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Registradas" valor={fiabilidad?.totalRegistradas} cargando={calculando} />
        <Indicador titulo="Resueltas" valor={fiabilidad?.resueltas} cargando={calculando} />
        <Indicador
          titulo="Pendientes"
          valor={fiabilidad?.pendientes}
          cargando={calculando}
          alerta={(fiabilidad?.pendientes ?? 0) > 0}
        />
        <Indicador
          titulo="Tasa de resolución"
          valor={fiabilidad?.tasaResolucion}
          cargando={calculando}
          sufijo="%"
          decimales={2}
        />
        <Indicador titulo="MTTR" valor={fiabilidad?.mttrMinutos} cargando={calculando} sufijo=" min" decimales={1} />
      </div>

      <Tarjeta sinRelleno>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Entrada
              etiqueta="Buscar"
              placeholder="Título, código o descripción"
              value={consulta.busqueda}
              onChange={(e) => buscar(e.target.value)}
            />
          </div>
          <div className="sm:w-48">
            <Seleccion
              etiqueta="Módulo"
              value={modulo}
              onChange={(e) => {
                setModulo(e.target.value)
                cambiarPagina(1)
              }}
              opciones={MODULOS_FILTRO}
            />
          </div>
          <div className="sm:w-44">
            <Seleccion
              etiqueta="Estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value)
                cambiarPagina(1)
              }}
              opciones={ESTADOS}
            />
          </div>
        </div>

        <Tabla
          columnas={[
            { clave: 'codigo', encabezado: 'Código' },
            { clave: 'titulo', encabezado: 'Incidencia' },
            { clave: 'modulo', encabezado: 'Módulo' },
            { clave: 'severidad', encabezado: 'Severidad' },
            { clave: 'estado', encabezado: 'Estado' },
            { clave: 'inicio', encabezado: 'Inicio' },
            { clave: 'duracion', encabezado: 'Recuperación' },
          ]}
          filas={filas}
          claveFila={(fila) => fila.id}
          cargando={cargando}
          error={error}
          reintentar={recargar}
          alHacerClic={(fila) => setDetalle(fila)}
          vacio={{ titulo: 'Sin incidencias', descripcion: 'No hay incidencias que coincidan con el filtro.' }}
          renderFila={(fila) => (
            <tr
              key={fila.id}
              onClick={() => setDetalle(fila)}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{fila.codigo}</td>
              <td className="px-4 py-2.5 font-medium text-slate-900">{fila.titulo}</td>
              <td className="px-4 py-2.5 text-slate-600">{fila.modulo ?? '—'}</td>
              <td className="px-4 py-2.5">
                <span className={claseSeveridad(fila.severidad)}>Nivel {fila.severidad}</span>
              </td>
              <td className="px-4 py-2.5">
                <span className={claseEstado(fila.estado)}>{fila.estado.replace('_', ' ')}</span>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{fechaHora(fila.inicio)}</td>
              <td className="px-4 py-2.5 text-slate-600">
                {fila.duracionMinutos === null ? '—' : `${numero(fila.duracionMinutos)} min`}
              </td>
            </tr>
          )}
        />

        <Paginador
          pagina={paginacion.pagina}
          totalPaginas={paginacion.totalPaginas}
          total={paginacion.total}
          limite={paginacion.limite}
          alCambiar={cambiarPagina}
        />
      </Tarjeta>

      <Modal
        abierto={creando}
        titulo="Registrar incidencia"
        descripcion="Cada problema detectado durante la evaluación se registra aquí con su fecha de inicio; esa fecha es la que permite medir la recuperación."
        ancho="lg"
        alCerrar={() => setCreando(false)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setCreando(false)}>
              Cancelar
            </Boton>
            <Boton
              onClick={registrar}
              cargando={formulario.enviando}
              disabled={formulario.enviando}
            >
              Registrar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Entrada
            etiqueta="Título"
            requerido
            ayuda="Mínimo 5 caracteres."
            value={formulario.valores.titulo}
            onChange={(e) => formulario.cambiar('titulo', e.target.value)}
            error={formulario.errores.titulo}
          />
          <AreaTexto
            etiqueta="Descripción"
            requerido
            filas={3}
            ayuda="Mínimo 10 caracteres: qué falla y en qué consiste."
            value={formulario.valores.descripcion}
            onChange={(e) => formulario.cambiar('descripcion', e.target.value)}
            error={formulario.errores.descripcion}
          />
          <AreaTexto
            etiqueta="Pasos para reproducir"
            filas={3}
            ayuda="Opcional. Es lo que permite reproducir el fallo más adelante."
            value={formulario.valores.pasosReproduccion}
            onChange={(e) => formulario.cambiar('pasosReproduccion', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Seleccion
              etiqueta="Módulo"
              value={formulario.valores.modulo}
              onChange={(e) => formulario.cambiar('modulo', e.target.value as ModuloIncidencia)}
              opciones={MODULOS}
            />
            <Seleccion
              etiqueta="Severidad"
              ayuda="1 menor, 4 mayor. Misma escala que la ficha del pretest."
              value={formulario.valores.severidad}
              onChange={(e) => formulario.cambiar('severidad', e.target.value)}
              opciones={[
                { valor: '1', texto: '1 - Menor' },
                { valor: '2', texto: '2 - Moderada' },
                { valor: '3', texto: '3 - Importante' },
                { valor: '4', texto: '4 - Crítica' },
              ]}
            />
          </div>
        </div>
      </Modal>

      <Modal
        abierto={detalle !== null}
        titulo={detalle?.codigo ?? ''}
        descripcion={detalle?.titulo}
        ancho="lg"
        alCerrar={() => setDetalle(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setDetalle(null)}>
              Cerrar
            </Boton>
            {detalle && (detalle.estado === 'ABIERTA' || detalle.estado === 'EN_PROCESO') && (
              <>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setDescartando(detalle)
                    setDetalle(null)
                  }}
                >
                  Descartar
                </Boton>
                <Boton
                  onClick={() => {
                    setResolviendo(detalle)
                    setDetalle(null)
                    formularioResolucion.reiniciar()
                  }}
                >
                  Marcar resuelta
                </Boton>
              </>
            )}
          </>
        }
      >
        {detalle && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={claseEstado(detalle.estado)}>{detalle.estado.replace('_', ' ')}</span>
              <span className={claseSeveridad(detalle.severidad)}>Severidad {detalle.severidad}</span>
              {detalle.modulo && <Etiqueta>{detalle.modulo}</Etiqueta>}
            </div>

            <Bloque titulo="Descripción">{detalle.descripcion ?? '—'}</Bloque>

            {detalle.pasosReproduccion && (
              <Bloque titulo="Pasos para reproducir">{detalle.pasosReproduccion}</Bloque>
            )}

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Dato etiqueta="Inicio" valor={fechaHora(detalle.inicio)} />
              <Dato etiqueta="Resolución" valor={detalle.fin ? fechaHora(detalle.fin) : 'Sin resolver'} />
              <Dato
                etiqueta="Recuperación"
                valor={detalle.duracionMinutos === null ? '—' : `${numero(detalle.duracionMinutos)} min`}
              />
            </dl>

            {detalle.solucion && <Bloque titulo="Solución aplicada">{detalle.solucion}</Bloque>}
          </div>
        )}
      </Modal>

      <Modal
        abierto={resolviendo !== null}
        titulo="Marcar incidencia como resuelta"
        descripcion="El backend calcula los minutos entre el inicio y este momento; ese valor alimenta el tiempo medio de recuperación."
        alCerrar={() => setResolviendo(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setResolviendo(null)}>
              Cancelar
            </Boton>
            <Boton onClick={resolver} cargando={formularioResolucion.enviando}>
              Resolver
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <AreaTexto
            etiqueta="Solución aplicada"
            requerido
            filas={3}
            ayuda="Mínimo 5 caracteres."
            value={formularioResolucion.valores.solucion}
            onChange={(e) => formularioResolucion.cambiar('solucion', e.target.value)}
            error={formularioResolucion.errores.solucion}
          />
          <Seleccion
            etiqueta="Severidad final"
            marcador="Sin cambio"
            ayuda="Opcional: corrige la severidad si al resolver se cambie la valoración."
            value={formularioResolucion.valores.severidadFinal}
            onChange={(e) => formularioResolucion.cambiar('severidadFinal', e.target.value)}
            opciones={[
              { valor: '1', texto: '1 - Menor' },
              { valor: '2', texto: '2 - Moderada' },
              { valor: '3', texto: '3 - Importante' },
              { valor: '4', texto: '4 - Crítica' },
            ]}
          />
        </div>
      </Modal>

      <Modal
        abierto={descartando !== null}
        titulo="Descartar incidencia"
        descripcion={`${descartando?.codigo ?? ''} no contará para el cálculo de fiabilidad. Indique por qué se descarta: queda registrado en la evidencia.`}
        alCerrar={() => setDescartando(null)}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setDescartando(null)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={descartar} cargando={formularioDescarte.enviando}>
              Descartar
            </Boton>
          </>
        }
      >
        <AreaTexto
          etiqueta="Motivo del descarte"
          requerido
          filas={3}
          ayuda="Mínimo 5 caracteres."
          value={formularioDescarte.valores.motivo}
          onChange={(e) => formularioDescarte.cambiar('motivo', e.target.value)}
          error={formularioDescarte.errores.motivo}
        />
      </Modal>

      <Modal
        abierto={verBitacora}
        titulo="Bitácora HTTP"
        descripcion="Registro de cada petición atendida: la trazabilidad técnica que respalda los indicadores de eficiencia y fiabilidad."
        ancho="xl"
        alCerrar={() => setVerBitacora(false)}
        pie={
          <Boton variante="secundario" onClick={() => setVerBitacora(false)}>
            Cerrar
          </Boton>
        }
      >
        <BitacoraModal />
      </Modal>
    </Pagina>
  )
}

function Indicador({
  titulo,
  valor,
  cargando,
  sufijo = '',
  decimales = 0,
  alerta = false,
}: {
  titulo: string
  valor: number | undefined
  cargando: boolean
  sufijo?: string
  decimales?: number
  alerta?: boolean
}) {
  return (
    <div className={clases('rounded-lg border bg-white p-4', alerta ? 'border-amber-300' : 'border-slate-200')}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      {cargando ? (
        <div className="mt-2 h-6 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={clases('mt-1 text-lg font-semibold text-slate-900', alerta && 'text-amber-700')}>
          {valor === undefined ? '—' : `${numero(valor, decimales)}${sufijo}`}
        </p>
      )}
    </div>
  )
}

const Bloque = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
    <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{children}</p>
  </div>
)

const Dato = ({ etiqueta, valor }: { etiqueta: string; valor: string }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</dt>
    <dd className="mt-0.5 text-slate-800">{valor}</dd>
  </div>
)

/** Bitácora paginada; vive aparte porque solo la abre el administrador. */
function BitacoraModal() {
  const [ruta, setRuta] = useState('')
  const [pagina, setPagina] = useState(1)
  // El filtro se aplica después de una pausa: sin esto, cada tecla dispararía
  // una consulta paginada distinta.
  const rutaFiltro = useRetraso(ruta, 400)

  // Cambiar el filtro devuelve a la primera página; de lo contrario, la página
  // 5 de un listado sin resultados se vería como una bitácora vacía. Se ajusta
  // durante el render, que es el patrón que React recomienda para derivar
  // estado de otro valor: un efecto provocaría un render adicional.
  const [filtroPrevio, setFiltroPrevio] = useState(rutaFiltro)
  if (rutaFiltro !== filtroPrevio) {
    setFiltroPrevio(rutaFiltro)
    setPagina(1)
  }

  const { cargando, error, datos } = usePeticion(
    (senal) =>
      evidencia.bitacora(
        { pagina, limite: 50, orden: 'desc', ruta: rutaFiltro || undefined },
        { signal: senal },
      ),
    [pagina, rutaFiltro],
  )

  return cargando ? (
    <EsquemaCarga filas={6} />
  ) : error ? (
    <p className="text-sm text-red-600">{error.message}</p>
  ) : !datos || datos.datos.length === 0 ? (
    <Vacio titulo="Sin registros" descripcion="La bitácora está vacía o el filtro no coincide." />
  ) : (
    <div className="space-y-3">
      <Entrada
        etiqueta="Filtrar por ruta"
        placeholder="/api/ventas"
        value={ruta}
        onChange={(e) => setRuta(e.target.value)}
        ayuda="Se aplica al dejar de escribir."
      />      <Tabla
        columnas={[
          { clave: 'fecha', encabezado: 'Fecha' },
          { clave: 'metodo', encabezado: 'Método' },
          { clave: 'ruta', encabezado: 'Ruta' },
          { clave: 'status', encabezado: 'Estado' },
          { clave: 'duracionMs', encabezado: 'Duración' },
        ]}
        filas={datos.datos}
        claveFila={(fila) => fila.id}
        renderFila={(fila) => (
          <tr key={fila.id} className="border-t border-slate-100">
            <td className="px-3 py-2 text-slate-600">{fechaHora(fila.fecha)}</td>
            <td className="px-3 py-2 font-mono text-xs text-slate-600">{fila.metodo}</td>
            <td className="px-3 py-2 font-mono text-xs text-slate-800">{fila.ruta}</td>
            <td className="px-3 py-2">
              <span
                className={clases(
                  'rounded px-1.5 py-0.5 text-xs font-medium',
                  fila.status < 400 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                )}
              >
                {fila.status}
              </span>
            </td>
            <td className="px-3 py-2 text-slate-600">{numero(fila.duracionMs)} ms</td>
          </tr>
        )}
      />
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Página {datos.paginacion.pagina} de {datos.paginacion.totalPaginas} · {numero(datos.paginacion.total)}{' '}
          registros
        </span>
        <Paginador
          pagina={datos.paginacion.pagina}
          totalPaginas={datos.paginacion.totalPaginas}
          total={datos.paginacion.total}
          limite={datos.paginacion.limite}
          alCambiar={setPagina}
        />
      </div>
    </div>
  )
}

export default Evidencia
