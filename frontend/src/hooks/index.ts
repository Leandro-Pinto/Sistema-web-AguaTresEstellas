import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorApi } from '@/services/http'

export interface EstadoPeticion<T> {
  datos: T | null
  cargando: boolean
  error: ErrorApi | null
  recargar: () => void
  /** Permite inserciones/actualizaciones optimistas sin recargar todo. */
  fijar: (datos: T | null) => void
}

/**
 * Carga datos de la API y los mantiene fuera de la pantalla de carga.
 *
 * Se usa `cargandoInicial` y no `cargando` para decidir si se muestra el
 * bloqueador: en un recargado por filtro, vaciar la tabla y volver a poner el
 * esqueleto hace parpadear la pantalla y pierde la posición de scroll. Solo
 * la primera carga warranta ese tratamiento.
 *
 * Las peticiones se abortan al desmontar o al cambiar de dependencia, para que
 * una respuesta lenta de un filtro anterior no pise los datos del actual.
 */
export const usePeticion = <T,>(
  cargar: (senal: AbortSignal) => Promise<T>,
  dependencias: unknown[],
): EstadoPeticion<T> => {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<ErrorApi | null>(null)
  const [contador, setContador] = useState(0)

  // Guarda la función de carga en una ref para poder usarla como dependencia
  // de `useEffect` sin provocar un efecto infinito por recrearse en cada
  // renderizado.
  const refCargar = useRef(cargar)
  refCargar.current = cargar

  useEffect(() => {
    const controlador = new AbortController()
    let vigente = true

    setCargando(true)
    setError(null)

    refCargar
      .current(controlador.signal)
      .then((resultado) => {
        if (vigente) setDatos(resultado)
      })
      .catch((fallo: unknown) => {
        if (!vigente || controlador.signal.aborted) return
        setError(
          fallo instanceof ErrorApi
            ? fallo
            : new ErrorApi('No se pudo cargar la información.', 0, null),
        )
      })
      .finally(() => {
        if (vigente && !controlador.signal.aborted) setCargando(false)
      })

    return () => {
      vigente = false
      controlador.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, contador])

  const recargar = useCallback(() => setContador((n) => n + 1), [])
  const fijar = useCallback((nuevo: T | null) => setDatos(nuevo), [])

  return { datos, cargando, error, recargar, fijar }
}

/** Retrasa la propagación de un valor; evita una petición por pulsación. */
export const useRetraso = <T,>(valor: T, milisegundos = 350): T => {
  const [diferido, setDiferido] = useState(valor)

  useEffect(() => {
    const temporizador = setTimeout(() => setDiferido(valor), milisegundos)
    return () => clearTimeout(temporizador)
  }, [valor, milisegundos])

  return diferido
}

/** Estado de un formulario con errores por campo. */
export interface Formulario<T> {
  valores: T
  cambiar: <K extends keyof T>(campo: K, valor: T[K]) => void
  cambiarVarios: (parcial: Partial<T>) => void
  errores: Partial<Record<keyof T | 'general', string>>
  enviando: boolean
  enviar: (accion: () => Promise<void>) => Promise<boolean>
  reiniciar: (inicial?: Partial<T>) => void
}

/**
 * Formulario controlado con mapeo de los errores de validación del backend.
 *
 * El backend responde con `detalles: [{ campo, mensaje }]`. Se usan esas
 * claves para señalar el input exacto: obligar a leer un aviso general
 * "los datos no son válidos" y adivinar qué campo falla es la forma más rápida
 * de que un usuario abandone el formulario.
 *
 * El límite es `object` y no `Record<string, unknown>` porque una `interface`
 * —que es como se declaran los cuerpos de la API— no tiene firma de índice y
 * no cumpliría la restricción, sin que el formulario necesite nada de ella.
 */
export const useFormulario = <T extends object>(inicial: T): Formulario<T> => {
  const [valores, setValores] = useState<T>(inicial)
  const [errores, setErrores] = useState<Partial<Record<keyof T | 'general', string>>>({})
  const [enviando, setEnviando] = useState(false)

  const cambiar = useCallback(<K extends keyof T>(campo: K, valor: T[K]) => {
    setValores((previos) => ({ ...previos, [campo]: valor }))
    // Al corregir un campo, su error deja de ser relevante.
    setErrores((previos) => {
      if (!(campo in previos)) return previos
      const siguiente = { ...previos }
      delete siguiente[campo]
      return siguiente
    })
  }, [])

  const cambiarVarios = useCallback((parcial: Partial<T>) => {
    setValores((previos) => ({ ...previos, ...parcial }))
  }, [])

  const reiniciar = useCallback(
    (nuevo?: Partial<T>) => {
      setValores({ ...inicial, ...nuevo })
      setErrores({})
    },
    // Solo se necesita re-crear cuando cambian los valores iniciales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(inicial)],
  )

  const enviar = useCallback(
    async (accion: () => Promise<void>): Promise<boolean> => {
      setEnviando(true)
      setErrores({})
      try {
        await accion()
        return true
      } catch (fallo) {
        const mapeados: Partial<Record<keyof T | 'general', string>> = {}

        if (fallo instanceof ErrorApi) {
          for (const detalle of fallo.detalles) {
            // El backend nombra los campos anidados con puntos
            // (`detalles.0.cantidad`); solo interesa el último segmento.
            const campo = detalle.campo.split('.').pop() ?? ''
            const clave = (campo in valores ? campo : 'general') as keyof T | 'general'
            // El primer error de un campo es el más específico; no se pisa.
            if (!mapeados[clave]) mapeados[clave] = detalle.mensaje
          }
          if (Object.keys(mapeados).length === 0) mapeados.general = fallo.message
        } else {
          mapeados.general = 'Ocurrió un error inesperado. Intente nuevamente.'
        }

        setErrores(mapeados)
        return false
      } finally {
        setEnviando(false)
      }
    },
    [valores],
  )

  return { valores, cambiar, cambiarVarios, errores, enviando, enviar, reiniciar }
}
