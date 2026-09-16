import { getApiKey } from './api_key_storage.js';

const BASE_API_URL = 'https://api.weather.com/v3/wx/forecast/hourly/3day';
const CURRENT_API_URL = 'https://api.weather.com/v3/wx/observations/current';
const DEFAULT_GEOCODE = '45.58,-73.54';
const USER_LOCATION_STORAGE_KEY = 'protrek.user.location';

function isValidLocation(location) {
  return location
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
    && location.latitude >= -90
    && location.latitude <= 90
    && location.longitude >= -180
    && location.longitude <= 180;
}

function getStoredLocation() {
  try {
    const location = JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY));
    return isValidLocation(location) ? location : null;
  } catch (error) {
    return null;
  }
}

function getDefaultLocation() {
  const [latitude, longitude] = DEFAULT_GEOCODE.split(',').map(Number);
  return { latitude, longitude };
}

function getUserGeocode() {
  const storedLocation = getStoredLocation();
  if (!navigator.geolocation) {
    return Promise.resolve(storedLocation || getDefaultLocation());
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        if (!isValidLocation(location)) {
          resolve(storedLocation || getDefaultLocation());
          return;
        }
        localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(location));
        resolve(location);
      },
      (error) => {
        console.warn('Position utilisateur indisponible, position par défaut utilisée:', error.message);
        resolve(storedLocation || getDefaultLocation());
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
  const location = await getUserGeocode();
  const geocode = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
  const [forecast, current] = await Promise.all([
    fetchJson(BASE_API_URL, 'Prévisions météo', geocode),
    fetchJson(CURRENT_API_URL, 'Conditions actuelles', geocode)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    location,
    current: {
      validTimeLocal: current.validTimeLocal || current.validTimeUtc || null,
      pressureMeanSeaLevel: current.pressureMeanSeaLevel,
      temperature: current.temperature,
      relativeHumidity: current.relativeHumidity
    },
    ...forecast
  };
}
