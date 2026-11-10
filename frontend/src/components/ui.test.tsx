import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AreaTexto, Aviso, Boton, Entrada, Etiqueta, Seleccion } from '@/components/ui'

/**
 * Estos componentes se repiten en las dieciséis pantallas. Un fallo aquí no
 * rompe una pantalla concreta: rompe el formulario entero y, en el caso del
 * botón en vuelo, puede crear un pedido duplicado.
 */
describe('Boton', () => {
  it('declara su propio tipo para no heredar el del formulario', () => {
    // Sin `type` explícito el navegador lo pone en "submit" dentro de un
    // `<form>`, y un "Cancelar" cerraría y enviaría a la vez. Las pantallas
    // que sí relied del envío llaman a `guardar` desde el `onSubmit`.
    render(<Boton>Guardar</Boton>)
    expect(screen.getByRole('button', { name: /guardar/i })).toHaveAttribute('type', 'button')
  })

  it('se deshabilita mientras la operación está en vuelo', async () => {
    const accion = vi.fn()
    render(
      <Boton cargando onClick={accion}>
        Guardar
      </Boton>,
    )
    const boton = screen.getByRole('button', { name: /guardar/i })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')

    await userEvent.click(boton)
    expect(accion).not.toHaveBeenCalled()
  })

  it('la protección contra el doble envío depende de que se marque cargando', async () => {
    // El botón no se autoprotege: se deshabilita cuando quien lo usa le pasa
    // `cargando`. Por eso `guardar` de cada pantalla lo enlaza al estado de
    // envío del formulario. La prueba deja constancia de ese contrato: sin
    // `cargando`, dos clics en el mismo turno sí disparan dos veces.
    const accion = vi.fn()
    render(
      <Boton onClick={accion}>Registrar</Boton>,
    )
    await userEvent.dblClick(screen.getByRole('button', { name: /registrar/i }))
    expect(accion).toHaveBeenCalledTimes(2)

    // En cuanto el padre marca la operación en vuelo, el segundo clic ya no
    // llega al manejador. Es lo que evita registrar dos pedidos.
    const conCarga = vi.fn()
    render(
      <Boton cargando onClick={conCarga}>
        Registrar
      </Boton>,
    )
    await userEvent.dblClick(screen.getAllByRole('button', { name: /registrar/i })[1])
    expect(conCarga).not.toHaveBeenCalled()
  })

  it('respeta un disabled explícito', () => {
    render(
      <Boton disabled>Guardar</Boton>,
    )
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
  })
})

describe('Campo de formulario', () => {
  it('enlaza la etiqueta con su input', () => {
    // Sin `htmlFor`/`id`, un lector de pantalla no anuncia el nombre del
    // campo y el clic en la etiqueta no lo enfoca.
    render(<Entrada etiqueta="Teléfono" />)
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument()
  })

  it('anuncia el error y lo asocia al campo', () => {
    render(<Entrada etiqueta="Teléfono" error="El teléfono debe tener 9 dígitos" />)
    const campo = screen.getByLabelText(/teléfono/i)
    expect(campo).toHaveAttribute('aria-invalid', 'true')

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('El teléfono debe tener 9 dígitos')
    expect(campo).toHaveAttribute('aria-describedby', alerta.getAttribute('id'))
  })

  it('muestra el texto de ayuda cuando no hay error', () => {
    render(<Entrada etiqueta="Documento" ayuda="DNI o CE con el que registra la compra" />)
    expect(screen.getByText('DNI o CE con el que registra la compra')).toBeInTheDocument()
  })

  it('el error sustituye a la ayuda, no se muestran ambos', () => {
    // Mostrar los dos deja al usuario leyendo el texto que ya no aplica.
    render(<Entrada etiqueta="Documento" ayuda="AYUDA" error="ERROR" />)
    expect(screen.queryByText('AYUDA')).not.toBeInTheDocument()
    expect(screen.getByText('ERROR')).toBeInTheDocument()
  })

  it('marca el campo como requerido en el HTML', () => {
    render(<Entrada etiqueta="Teléfono" requerido />)
    expect(screen.getByLabelText(/teléfono/i)).toBeRequired()
  })

  it('el área de texto se comporta igual que la entrada', () => {
    render(<AreaTexto etiqueta="Notas" error="Notas demasiado largas" />)
    const area = screen.getByLabelText('Notas')
    expect(area.tagName).toBe('TEXTAREA')
    expect(screen.getByRole('alert')).toHaveTextContent('Notas demasiado largas')
  })
})

describe('Seleccion', () => {
  it('lista las opciones con su texto legible', () => {
    render(
      <Seleccion
        etiqueta="Tipo de cliente"
        opciones={[
          { valor: 'PERSONA', texto: 'Persona natural' },
          { valor: 'EMPRESA', texto: 'Empresa' },
        ]}
      />,
    )
    expect(screen.getByRole('option', { name: 'Persona natural' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Empresa' })).toBeInTheDocument()
  })

  it('el marcador es la primera opción vacía', () => {
    render(
      <Seleccion
        etiqueta="Estado"
        marcador="Todos los estados"
        opciones={[{ valor: 'true', texto: 'Solo activos' }]}
      />,
    )
    expect(screen.getByRole('option', { name: 'Todos los estados' })).toHaveValue('')
  })
})

describe('Aviso', () => {
  it('un error se anuncia como alerta y un éxito no', () => {
    // Solo lo que exige atención debe interrumpir al lector de pantalla.
    const { rerender } = render(
      <Aviso tipo="error" mensaje="No se pudo guardar el cliente" alCerrar={vi.fn()} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el cliente')

    rerender(<Aviso tipo="exito" mensaje="Cliente registrado" alCerrar={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Cliente registrado')
  })

  it('permite cerrar el aviso', async () => {
    const alCerrar = vi.fn()
    render(<Aviso tipo="exito" mensaje="Cliente registrado" alCerrar={alCerrar} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar|descartar/i }))
    expect(alCerrar).toHaveBeenCalled()
  })
})

describe('Etiqueta', () => {
  it('refleja el texto del estado', () => {
    render(<Etiqueta tono="exito">Activo</Etiqueta>)
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })
})
