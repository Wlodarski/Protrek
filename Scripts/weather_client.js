import { getApiKey } from './api_key_storage.js';

const BASE_API_URL = 'https://api.weather.com/v3/wx/forecast/hourly/3day';
const CURRENT_API_URL = 'https://api.weather.com/v3/wx/observations/current';
const GEOCODE = '45.5818441,-73.5440191';

async function buildApiUrl(baseUrl) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Aucune clé API météo configurée. Utilisez ?API=votre_clé.');
  }

  const params = new URLSearchParams({
    apiKey,
    units: 'm',
    language: 'en-US',
    format: 'json',
    geocode: GEOCODE
  });
  return `${baseUrl}?${params}`;
}

async function fetchJson(baseUrl, label) {
  const response = await fetch(await buildApiUrl(baseUrl));
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

export async function fetchCombinedForecast() {
  const [forecast, current] = await Promise.all([
    fetchJson(BASE_API_URL, 'Prévisions météo'),
    fetchJson(CURRENT_API_URL, 'Conditions actuelles')
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
