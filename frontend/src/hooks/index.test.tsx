import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorApi } from '@/services/http'
import { useFormulario } from '@/hooks'

interface FormularioContacto {
  nombre: string
  telefono: string
  activo: boolean
}

const inicial: FormularioContacto = { nombre: '', telefono: '', activo: true }

/**
 * El hook es el punto donde el error del backend se convierte en el mensaje
 * que aparece bajo el campo correspondiente. Esa traducción es lo que se
 * comprueba aquí: un error general "los datos no son válidos" obliga al
 * usuario a adivinar qué campo corregir.
 */
describe('valores del formulario', () => {
  it('parte de los valores iniciales', () => {
    const { result } = renderHook(() => useFormulario(inicial))
    expect(result.current.valores).toEqual(inicial)
  })

  it('actualiza un campo sin tocar los demás', () => {
    const { result } = renderHook(() => useFormulario(inicial))
    act(() => result.current.cambiar('nombre', 'Ana'))
    expect(result.current.valores).toEqual({ ...inicial, nombre: 'Ana' })
  })

  it('actualiza varios campos a la vez', () => {
    const { result } = renderHook(() => useFormulario(inicial))
    act(() => result.current.cambiarVarios({ nombre: 'Ana', telefono: '999888777' }))
    expect(result.current.valores.nombre).toBe('Ana')
    expect(result.current.valores.telefono).toBe('999888777')
  })

  it('reiniciar devuelve el formulario a su estado inicial', () => {
    const { result } = renderHook(() => useFormulario(inicial))
    act(() => result.current.cambiar('nombre', 'Ana'))
    act(() => result.current.reiniciar())
    expect(result.current.valores).toEqual(inicial)
  })

  it('reiniciar acepta valores parciales para editar un registro', () => {
    const { result } = renderHook(() => useFormulario(inicial))
    act(() => result.current.reiniciar({ nombre: 'Empresa X' }))
    expect(result.current.valores).toEqual({ ...inicial, nombre: 'Empresa X' })
  })
})

describe('envío correcto', () => {
  it('marca enviando durante la operación y lo desmarca al terminar', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    let resolver: () => void = () => undefined
    const accion = () => new Promise<void>((r) => (resolver = r))

    let promesa: Promise<boolean>
    act(() => {
      promesa = result.current.enviar(accion)
    })
    expect(result.current.enviando).toBe(true)

    await act(async () => {
      resolver()
      await promesa
    })
    expect(result.current.enviando).toBe(false)
  })

  it('devuelve true si la acción termina bien', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    let exito = false
    await act(async () => {
      exito = await result.current.enviar(async () => undefined)
    })
    expect(exito).toBe(true)
  })
})

describe('mapeo de errores del backend a los campos', () => {
  it('coloca el mensaje bajo el campo que reporta el backend', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Datos inválidos', 422, 'VALIDACION', [
          { campo: 'telefono', mensaje: 'El teléfono debe tener 9 dígitos' },
        ])
      })
    })

    expect(result.current.errores.telefono).toBe('El teléfono debe tener 9 dígitos')
    expect(result.current.errores.general).toBeUndefined()
  })

  it('reduce un campo anidado a su último segmento', async () => {
    // El backend nombra los detalles anidados como `detalles.0.cantidad`.
    // Sin reducirlo, `cantidad` nunca coincidiría con un campo del formulario.
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [
          { campo: 'detalles.0.telefono', mensaje: 'Requerido' },
        ])
      })
    })
    expect(result.current.errores.telefono).toBe('Requerido')
  })

  it('un error de un campo inexistente cae en general', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [
          { campo: 'campoQueNoExiste', mensaje: 'Raro' },
        ])
      })
    })
    expect(result.current.errores.general).toBe('Raro')
  })

  it('un error sin detalles se muestra como mensaje general', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('El pago supera el saldo', 409, 'PAGO_EXCEDE_SALDO', [])
      })
    })
    expect(result.current.errores.general).toBe('El pago supera el saldo')
  })

  it('conserva el primer error cuando dos detalles señalan el mismo campo', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [
          { campo: 'nombre', mensaje: 'Es obligatorio' },
          { campo: 'nombre', mensaje: 'Mensaje menos específico' },
        ])
      })
    })
    expect(result.current.errores.nombre).toBe('Es obligatorio')
  })

  it('un fallo que no es de la API muestra un mensaje neutro', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new Error('fallo de red')
      })
    })
    expect(result.current.errores.general).toBe('Ocurrió un error inesperado. Intente nuevamente.')
  })

  it('devuelve false y no deja enviando en true tras un fallo', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    let exito = true
    await act(async () => {
      exito = await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [])
      })
    })
    expect(exito).toBe(false)
    expect(result.current.enviando).toBe(false)
  })

  it('al corregir un campo, su error desaparece', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [{ campo: 'nombre', mensaje: 'Requerido' }])
      })
    })
    expect(result.current.errores.nombre).toBe('Requerido')

    act(() => result.current.cambiar('nombre', 'Ana'))
    expect(result.current.errores.nombre).toBeUndefined()
  })

  it('un envío nuevo limpia los errores del anterior', async () => {
    const { result } = renderHook(() => useFormulario(inicial))
    await act(async () => {
      await result.current.enviar(async () => {
        throw new ErrorApi('Inválido', 422, null, [{ campo: 'nombre', mensaje: 'Requerido' }])
      })
    })

    await act(async () => {
      await result.current.enviar(async () => undefined)
    })
    expect(result.current.errores).toEqual({})
  })
})
