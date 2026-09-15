import { getApiKey } from './api_key_storage.js';

const BASE_API_URL = 'https://api.weather.com/v3/wx/forecast/hourly/3day';
const CURRENT_API_URL = 'https://api.weather.com/v3/wx/observations/current';
const DEFAULT_GEOCODE = '45.5818441,-73.5440191';

function getUserGeocode() {
  if (!navigator.geolocation) return Promise.resolve(DEFAULT_GEOCODE);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve(DEFAULT_GEOCODE);
          return;
        }
        resolve(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
      },
      (error) => {
        console.warn('Position utilisateur indisponible, position par défaut utilisée:', error.message);
        resolve(DEFAULT_GEOCODE);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  });
}

async function buildApiUrl(baseUrl, geocode) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Aucune clé API météo configurée. Utilisez ?API=votre_clé.');
  }

  const params = new URLSearchParams({
    apiKey,
    units: 'm',
    language: 'en-US',
    format: 'json',
    geocode
  });
  return `${baseUrl}?${params}`;
}

async function fetchJson(baseUrl, label, geocode) {
  const response = await fetch(await buildApiUrl(baseUrl, geocode));
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

export async function fetchCombinedForecast() {
  const geocode = await getUserGeocode();
  const [forecast, current] = await Promise.all([
    fetchJson(BASE_API_URL, 'Prévisions météo', geocode),
    fetchJson(CURRENT_API_URL, 'Conditions actuelles', geocode)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    current: {
      validTimeLocal: current.validTimeLocal || current.validTimeUtc || null,
      pressureMeanSeaLevel: current.pressureMeanSeaLevel,
      temperature: current.temperature,
      relativeHumidity: current.relativeHumidity
    },
    ...forecast
  };
}
