import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProveedorAutenticacion } from './context/ProveedorSesion'
import './index.css'

const contenedor = document.getElementById('root')
if (!contenedor) throw new Error('No se encontró el elemento #root en index.html')

createRoot(contenedor).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorAutenticacion>
        <App />
      </ProveedorAutenticacion>
    </BrowserRouter>
  </StrictMode>,
)
