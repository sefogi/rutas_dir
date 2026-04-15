import { useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';

const ORS_BASE = 'https://api.openrouteservice.org';

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

async function getDurationMatrix(apiKey, coordinates) {
  const response = await fetch(`${ORS_BASE}/v2/matrix/driving-car`, {
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

async function getRouteGeometry(apiKey, orderedCoordinates) {
  const response = await fetch(`${ORS_BASE}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      coordinates: orderedCoordinates
    })
  });

  if (!response.ok) {
    throw new Error(`No se pudo calcular la ruta. Código: ${response.status}`);
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
  const [origin, setOrigin] = useState('Av. Paseo de la Reforma 222, Ciudad de México');
  const [destinationsText, setDestinationsText] = useState(
    'Parque España, Ciudad de México\nAeropuerto Internacional Benito Juárez, Ciudad de México\nBasílica de Guadalupe, Ciudad de México'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [orderedStops, setOrderedStops] = useState([]);
  const [summary, setSummary] = useState(null);

  const mapCenter = useMemo(() => {
    if (orderedStops.length > 0) {
      return toLatLng(orderedStops[0].coordinates);
    }
    return [19.4326, -99.1332];
  }, [orderedStops]);

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

      const allAddresses = [origin, ...normalizedStops];
      const geocoded = await Promise.all(allAddresses.map((address) => geocodeAddress(apiKey, address)));
      const coordinates = geocoded.map((item) => item.coordinates);

      const durations = await getDurationMatrix(apiKey, coordinates);
      const destinationIndexes = Array.from({ length: coordinates.length - 1 }, (_, i) => i + 1);
      const orderIndexes = nearestNeighbor(durations, 0, destinationIndexes);
      const orderedCoordinates = orderIndexes.map((idx) => coordinates[idx]);
      const orderedAddresses = orderIndexes.map((idx) => geocoded[idx]);

      const route = await getRouteGeometry(apiKey, orderedCoordinates);

      setOrderedStops(orderedAddresses);
      setRoutePath(route.geometry.map(toLatLng));
      setSummary(route.summary ?? null);
    } catch (err) {
      setError(err.message || 'Ocurrió un error inesperado al construir la ruta.');
      setRoutePath([]);
      setOrderedStops([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app">
      <section className="panel">
        <h1>Optimizador de entregas</h1>
        <p>
          Carga direcciones y obtén una secuencia sugerida para minimizar tiempo de traslado usando
          OpenRouteService.
        </p>

        <label htmlFor="apiKey">API key (OpenRouteService)</label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Tu API key"
        />

        <label htmlFor="origin">Dirección de origen</label>
        <input
          id="origin"
          type="text"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          placeholder="Centro de distribución"
        />

        <label htmlFor="destinations">Direcciones de entrega (una por línea)</label>
        <textarea
          id="destinations"
          value={destinationsText}
          onChange={(event) => setDestinationsText(event.target.value)}
          rows={8}
        />

        <button onClick={planRoutes} disabled={loading}>
          {loading ? 'Calculando...' : 'Optimizar ruta'}
        </button>

        {error && <p className="error">{error}</p>}

        {orderedStops.length > 0 && (
          <>
            <h2>Orden sugerido de paradas</h2>
            <ol>
              {orderedStops.map((stop, index) => (
                <li key={`${stop.address}-${index}`}>{stop.address}</li>
              ))}
            </ol>
          </>
        )}

        {summary && (
          <p className="summary">
            Distancia total estimada: <strong>{(summary.distance / 1000).toFixed(1)} km</strong> ·
            Duración estimada: <strong>{Math.round(summary.duration / 60)} min</strong>
          </p>
        )}
      </section>

      <section className="map-wrapper">
        <MapContainer center={mapCenter} zoom={11} scrollWheelZoom className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {orderedStops.map((stop, index) => (
            <Marker key={`${stop.address}-${index}`} position={toLatLng(stop.coordinates)}>
              <Popup>
                {index === 0 ? 'Origen' : `Entrega ${index}`}: {stop.address}
              </Popup>
            </Marker>
          ))}

          {routePath.length > 1 && <Polyline positions={routePath} pathOptions={{ color: '#2563eb', weight: 5 }} />}
        </MapContainer>
      </section>
    </main>
  );
}

export default App;
