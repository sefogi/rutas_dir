# rutas_dir

Aplicación React para planificar rutas peatonales y mostrarlas en mapa, agrupando direcciones cercanas para optimizar recorridos a pie.

## Stack

- React + Vite
- OpenRouteService (geocoding, matriz de tiempos y direcciones)
- Leaflet + OpenStreetMap para visualización

## Requisitos

- Node.js 18+
- Una API key de OpenRouteService: https://openrouteservice.org/dev/#/signup

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Crea `.env` con tu llave:

   ```bash
   cp .env.example .env
   ```

3. Levanta el proyecto:

   ```bash
   npm run dev
   ```

## Flujo peatonal con atajos implementado

1. Geocodifica inicio y paradas.
2. Consulta una matriz de duración para perfil `foot-walking`.
3. Agrupa paradas por cercanía (umbral en minutos configurable).
4. Limita cuántas paradas caben en cada ruta (configurable).
5. Ordena cada grupo con heurística **nearest neighbor**.
6. Solicita rutas con preferencia `shortest` para priorizar trayectos cortos (atajos peatonales viables en el grafo).
7. Dibuja rutas separadas por color sobre el mapa.

> Nota: el agrupamiento y nearest neighbor son heurísticos rápidos; no garantizan la solución global óptima.

## Próximos pasos recomendados

- Soportar múltiples repartidores caminando en paralelo.
- Añadir restricciones de horario por parada.
- Evitar segmentos con pendientes pronunciadas (si el proveedor lo soporta).
- Migrar cálculo sensible a un backend propio (para ocultar API key).
