# rutas_dir

Aplicación React para planificar rutas de entregas y mostrarlas en mapa, agrupando direcciones cercanas para optimizar tiempo.

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

## Flujo de optimización implementado

1. Geocodifica origen y entregas.
2. Consulta una matriz de duración (segundos) entre todos los puntos.
3. Agrupa paradas por cercanía (umbral en minutos configurable).
4. Limita cuántas paradas caben en cada ruta (configurable).
5. Ordena cada grupo con heurística **nearest neighbor**.
6. Dibuja rutas separadas por color sobre el mapa.

> Nota: nearest neighbor y el agrupamiento por proximidad son heurísticos rápidos; no garantizan la solución global óptima.

## Próximos pasos recomendados

- Soportar múltiples vehículos con capacidad.
- Ventanas de tiempo por entrega.
- Restricciones por prioridad de cliente.
- Migrar cálculo sensible a un backend propio (para ocultar API key).
