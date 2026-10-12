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
| [Auditoría de consistencia](auditoria-consistencia.md) | Defectos encontrados al contrastar la interfaz con la base y qué se corrigió. |
| [Datos de demostración](datos-de-demostracion.md) | Cómo se generó el conjunto simulado, con qué parámetros y por qué no puede citarse como resultado. |
| [Brief técnico: ajustes](brief-tecnico-ajustes.md) | Qué pide el brief técnico, qué estado tiene cada punto y cómo se verifica. |

## Estructura del proyecto

```
sistema-web/
├── backend/            API REST (Express + TypeScript + Prisma + MariaDB)
├── frontend/           Interfaz web (React + Vite + Tailwind)
├── docs/               Esta documentación
├── demo-simulado/      Conjunto de datos inventados por el simulador (NO es evidencia)
└── evidencias-reales/  Resultados del postest sobre la operación real (aún vacío)
```

## Dos carpetas de datos que no se mezclan

| Carpeta | Qué contiene | ¿Se cita en la tesis? |
|---|---|---|
| `demo-simulado/` | Histórico que generó el simulador para demostrar el sistema. Cada fila lleva `origen = SIMULADO`. | No. Sirve para ensayos y demostraciones. |
| `evidencias-reales/` | Salidas de los reportes sobre la operación real de la empresa. | Sí. Es la única fuente autorizada. |

Los indicadores y los reportes leen `REAL` por omisión, así que un conjunto
simulado no aparece en una medición real ni por error. El simulador, además, no
arranca con `ENTORNO="prod"`.

## Documentación de cada parte

- `backend/README.md` — referencia técnica del backend.
- El detalle de los endpoints y el modelo de datos están en
  [arquitectura-y-api.md](arquitectura-y-api.md).

## Estado

Suites de pruebas automatizadas, todas en verde:

- **Backend:** 113 pruebas en 8 archivos (`cd backend && npm test`).
- **Frontend:** 246 pruebas en 14 archivos (`cd frontend && npx vitest run`).

Pendiente de datos que el sistema no puede inventar: la medición del pretest en
la empresa, la ejecución de los 18 casos de prueba y el uso del sistema durante
un periodo definido antes de citar los indicadores de eficiencia y fiabilidad.
