# rutas_dir

Aplicación React para planificar rutas de entregas y mostrarlas en mapa, priorizando un orden de paradas más rápido.

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
3. Aplica heurística **nearest neighbor** para sugerir orden de paradas.
4. Solicita la geometría de la ruta final para dibujarla en el mapa.

> Nota: nearest neighbor es rápido y práctico, pero no siempre da la solución global óptima (TSP exacto).

## Próximos pasos recomendados

- Soportar múltiples vehículos.
- Ventanas de tiempo por entrega.
- Persistencia de rutas históricas.
- Migrar cálculo sensible a un backend propio (para ocultar API key).
