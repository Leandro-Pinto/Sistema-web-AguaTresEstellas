# Sistema Web Agua Tres Estrellas Pura

Sistema de información para la gestión de pedidos, ventas, pagos, entregas y
envases retornables de una empresa distribuidora de agua pura. Es el objeto de
estudio de la tesis: antes del sistema el proceso se llevaba en cuaderno y
planillas, y los tiempos de cada etapa no quedaban registrados.

## Documentación

| Documento | Contenido |
|---|---|
| [Instalación y operación](instalacion-y-operacion.md) | Requisitos, puesta en marcha, configuración, comandos y resolución de problemas. |
| [Arquitectura y API](arquitectura-y-api.md) | Módulos, modelo de datos, endpoints, formas de respuesta y control de acceso. |
| [Manual de usuario por rol](manual-de-usuario.md) | Qué puede hacer cada rol, paso a paso, con las rutas de la interfaz. |
| [Postest y evidencias](postest-y-evidencias.md) | Cómo se generó el histórico, con qué parámetros, qué indicadores dio y qué archivos respaldan cada cifra. |

## Estructura del proyecto

```
sistema-web/
├── backend/      API REST (Express + TypeScript + Prisma + MariaDB)
├── frontend/     Interfaz web (React + Vite + Tailwind)
├── docs/         Esta documentación
└── evidencias/   Archivos generados por la medición del postest
```

## Documentación de cada parte

- `backend/README.md` — referencia técnica del backend.
- El detalle de los endpoints y el modelo de datos están en
  [arquitectura-y-api.md](arquitectura-y-api.md).

## Estado

Suite de pruebas automatizadas: **85 pruebas en 6 archivos, todas en verde**
(`cd backend && npm test`).
