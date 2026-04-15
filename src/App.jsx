import { useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';

const ORS_BASE = 'https://api.openrouteservice.org';
const DEFAULT_PROFILE = 'foot-walking';
const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

const normalizeDestinations = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const toLatLng = (coord) => [coord[1], coord[0]];

const nearestNeighbor = (matrix, startIndex, destinationIndexes) => {
  const remaining = new Set(destinationIndexes);
  const order = [startIndex];
  let current = startIndex;

  while (remaining.size > 0) {
    let bestNext = null;
    let bestTime = Number.POSITIVE_INFINITY;

    for (const idx of remaining) {
      const value = matrix[current][idx];
      if (typeof value === 'number' && value < bestTime) {
        bestTime = value;
        bestNext = idx;
      }
    }

    if (bestNext === null) {
      break;
    }

    order.push(bestNext);
    remaining.delete(bestNext);
    current = bestNext;
  }

  return order;
};

const createProximityGroups = (durations, originIndex, destinationIndexes, maxStopsPerRoute, proximitySeconds) => {
  const unassigned = new Set(destinationIndexes);
  const groups = [];

  while (unassigned.size > 0) {
    let seed = null;
    let bestFromOrigin = Number.POSITIVE_INFINITY;

    for (const idx of unassigned) {
      const fromOrigin = durations[originIndex][idx];
      if (typeof fromOrigin === 'number' && fromOrigin < bestFromOrigin) {
        bestFromOrigin = fromOrigin;
        seed = idx;
      }
    }

    if (seed === null) {
      break;
    }

    const group = [seed];
    unassigned.delete(seed);

    while (group.length < maxStopsPerRoute && unassigned.size > 0) {
      let candidate = null;
      let bestCandidateTime = Number.POSITIVE_INFINITY;

      for (const idx of unassigned) {
        let minToGroup = Number.POSITIVE_INFINITY;

        for (const current of group) {
          const hop = durations[current][idx];
          if (typeof hop === 'number' && hop < minToGroup) {
            minToGroup = hop;
          }
        }

        if (minToGroup <= proximitySeconds && minToGroup < bestCandidateTime) {
          bestCandidateTime = minToGroup;
          candidate = idx;
        }
      }

      if (candidate === null) {
        break;
      }

      group.push(candidate);
      unassigned.delete(candidate);
    }

    groups.push(group);
  }

  return groups;
};

async function geocodeAddress(apiKey, address) {
  const url = `${ORS_BASE}/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&size=1`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo geocodificar "${address}". Código: ${response.status}`);
  }

  const data = await response.json();
  const first = data.features?.[0];

  if (!first?.geometry?.coordinates) {
    throw new Error(`No se encontraron coordenadas para "${address}".`);
  }

  return {
    address,
    coordinates: first.geometry.coordinates
  };
}

async function getDurationMatrix(apiKey, profile, coordinates) {
  const response = await fetch(`${ORS_BASE}/v2/matrix/${profile}`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      locations: coordinates,
      metrics: ['duration']
    })
  });

  if (!response.ok) {
    throw new Error(`No se pudo calcular la matriz de tiempos. Código: ${response.status}`);
  }

  const data = await response.json();
  if (!data.durations) {
    throw new Error('La respuesta de la matriz no contiene duraciones.');
  }

  return data.durations;
}

async function getRouteGeometry(apiKey, profile, orderedCoordinates) {
  const response = await fetch(`${ORS_BASE}/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      coordinates: orderedCoordinates,
      preference: 'shortest'
    })
  });

  if (!response.ok) {
    throw new Error(`No se pudo calcular la ruta peatonal. Código: ${response.status}`);
  }

  const data = await response.json();
  const coords = data.features?.[0]?.geometry?.coordinates;

  if (!coords) {
    throw new Error('La ruta no contiene geometría.');
  }

  return {
    geometry: coords,
    summary: data.features?.[0]?.properties?.summary
  };
}

function App() {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ORS_API_KEY ?? '');
  const [origin, setOrigin] = useState('Zócalo, Ciudad de México');
  const [destinationsText, setDestinationsText] = useState(
    'Palacio de Bellas Artes, Ciudad de México\nAlameda Central, Ciudad de México\nTorre Latinoamericana, Ciudad de México\nTemplo Mayor, Ciudad de México'
  );
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState(5);
  const [proximityMinutes, setProximityMinutes] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plannedRoutes, setPlannedRoutes] = useState([]);

  const mapCenter = useMemo(() => {
    if (plannedRoutes.length > 0 && plannedRoutes[0].orderedStops.length > 0) {
      return toLatLng(plannedRoutes[0].orderedStops[0].coordinates);
    }
    return [19.4326, -99.1332];
  }, [plannedRoutes]);

  const planRoutes = async () => {
    setLoading(true);
    setError('');

    try {
      const normalizedStops = normalizeDestinations(destinationsText);
      if (!apiKey.trim()) {
        throw new Error('Agrega tu API key de OpenRouteService para calcular rutas.');
      }

      if (!origin.trim() || normalizedStops.length === 0) {
        throw new Error('Debes indicar un origen y al menos una dirección de entrega.');
      }

      const parsedMaxStops = Number(maxStopsPerRoute);
      if (!Number.isInteger(parsedMaxStops) || parsedMaxStops < 1) {
        throw new Error('El máximo de paradas por ruta debe ser un entero mayor a 0.');
      }

      const parsedProximityMinutes = Number(proximityMinutes);
      if (Number.isNaN(parsedProximityMinutes) || parsedProximityMinutes <= 0) {
        throw new Error('La cercanía máxima debe ser mayor a 0 minutos.');
      }

      const allAddresses = [origin, ...normalizedStops];
      const geocoded = await Promise.all(allAddresses.map((address) => geocodeAddress(apiKey, address)));
      const coordinates = geocoded.map((item) => item.coordinates);

      const durations = await getDurationMatrix(apiKey, DEFAULT_PROFILE, coordinates);
      const destinationIndexes = Array.from({ length: coordinates.length - 1 }, (_, i) => i + 1);
      const groups = createProximityGroups(durations, 0, destinationIndexes, parsedMaxStops, parsedProximityMinutes * 60);

      const resolvedRoutes = await Promise.all(
        groups.map(async (group, routeIndex) => {
          const orderedIndexes = nearestNeighbor(durations, 0, group);
          const orderedStops = orderedIndexes.map((idx) => geocoded[idx]);
          const orderedCoordinates = orderedIndexes.map((idx) => coordinates[idx]);
          const route = await getRouteGeometry(apiKey, DEFAULT_PROFILE, orderedCoordinates);

          return {
            id: routeIndex + 1,
            color: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
            orderedStops,
            routePath: route.geometry.map(toLatLng),
            summary: route.summary ?? null
          };
        })
      );

      setPlannedRoutes(resolvedRoutes);
    } catch (err) {
      setError(err.message || 'Ocurrió un error inesperado al construir la ruta.');
      setPlannedRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  const totalKm = plannedRoutes.reduce((acc, route) => acc + (route.summary?.distance ?? 0), 0) / 1000;
  const totalMinutes = Math.round(plannedRoutes.reduce((acc, route) => acc + (route.summary?.duration ?? 0), 0) / 60);

  return (
    <main className="app">
      <section className="panel">
        <h1>Rutas peatonales con atajos</h1>
        <p>
          Genera rutas para una persona de a pie, agrupando puntos cercanos y priorizando trayectos cortos.
        </p>

        <label htmlFor="apiKey">API key (OpenRouteService)</label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Tu API key"
        />

        <label htmlFor="origin">Punto de inicio</label>
        <input
          id="origin"
          type="text"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          placeholder="Inicio del recorrido"
        />

        <label htmlFor="destinations">Paradas (una por línea)</label>
        <textarea
          id="destinations"
          value={destinationsText}
          onChange={(event) => setDestinationsText(event.target.value)}
          rows={8}
        />

        <div className="grid-options">
          <div>
            <label htmlFor="maxStops">Máximo paradas por ruta</label>
            <input
              id="maxStops"
              type="number"
              min="1"
              value={maxStopsPerRoute}
              onChange={(event) => setMaxStopsPerRoute(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="proximity">Cercanía entre paradas (min)</label>
            <input
              id="proximity"
              type="number"
              min="1"
              value={proximityMinutes}
              onChange={(event) => setProximityMinutes(event.target.value)}
            />
          </div>
        </div>

        <button onClick={planRoutes} disabled={loading}>
          {loading ? 'Calculando...' : 'Crear rutas a pie con atajos'}
        </button>

        {error && <p className="error">{error}</p>}

        {plannedRoutes.length > 0 && (
          <>
            <h2>Rutas peatonales sugeridas</h2>
            {plannedRoutes.map((route) => (
              <div key={route.id} className="route-card" style={{ borderLeftColor: route.color }}>
                <h3>Ruta {route.id}</h3>
                <ol>
                  {route.orderedStops.map((stop, index) => (
                    <li key={`${stop.address}-${route.id}-${index}`}>{stop.address}</li>
                  ))}
                </ol>
                {route.summary && (
                  <p>
                    {(route.summary.distance / 1000).toFixed(2)} km · {Math.round(route.summary.duration / 60)} min
                  </p>
                )}
              </div>
            ))}

            <p className="summary">
              Total consolidado: <strong>{totalKm.toFixed(2)} km</strong> · <strong>{totalMinutes} min</strong>
            </p>
          </>
        )}
      </section>

      <section className="map-wrapper">
        <MapContainer center={mapCenter} zoom={14} scrollWheelZoom className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {plannedRoutes.map((route) =>
            route.orderedStops.map((stop, index) => (
              <Marker key={`${stop.address}-${route.id}-${index}`} position={toLatLng(stop.coordinates)}>
                <Popup>
                  Ruta {route.id} · {index === 0 ? 'Inicio' : `Parada ${index}`}: {stop.address}
                </Popup>
              </Marker>
            ))
          )}

          {plannedRoutes.map((route) =>
            route.routePath.length > 1 ? (
              <Polyline
                key={`poly-${route.id}`}
                positions={route.routePath}
                pathOptions={{ color: route.color, weight: 5 }}
              />
            ) : null
          )}
        </MapContainer>
      </section>
    </main>
  );
}

export default App;
