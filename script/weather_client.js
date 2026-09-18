import { getApiKey } from './api_key_storage.js';

const BASE_API_URL = 'https://weather.com';
const CURRENT_API_URL = 'https://weather.com';
const DEFAULT_GEOCODE = '45.58,-73.54,0';
const USER_LOCATION_STORAGE_KEY = 'protrek.user.location';

/**
 * Valide la structure et les coordonnées de la position.
 * Les champs altitude et altitudeAccuracy sont facultatifs et acceptent la valeur null.
 */
function isValidLocation(location) {
  return location
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
    && Number.isFinite(location.accuracy)
    && (location.altitude === null || Number.isFinite(location.altitude)) 
    && (location.altitudeAccuracy === null || Number.isFinite(location.altitudeAccuracy))
    && location.latitude >= -90
    && location.latitude <= 90
    && location.longitude >= -180
    && location.longitude <= 180;
}

/**
 * Récupère la position stockée en cache local si elle est valide.
 */
function getStoredLocation() {
  try {
    const location = JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY));
    return isValidLocation(location) ? location : null;
  } catch (error) {
    return null;
  }
}

/**
 * Génère la position géographique par défaut.
 */
function getDefaultLocation() {
  const [latitude, longitude, altitude] = DEFAULT_GEOCODE.split(',').map(Number);
  return { latitude, longitude, altitude, accuracy: 0, altitudeAccuracy: null };
}

/**
 * API de secours : Interroge les données topographiques d'Open-Meteo
 * lorsque la puce GPS de l'appareil ne fournit pas l'élévation.
 */
async function fetchFallbackAltitude(lat, lon) {
  try {
    const response = await fetch(`https://open-meteo.com{lat}&longitude=${lon}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data && data.elevation !== undefined && Array.isArray(data.elevation)) {
      console.log(`Altitude estimée via API tierce : ${data.elevation[0]}m`);
      return data.elevation[0];
    }
    return null;
  } catch (err) {
    console.warn("Échec de la récupération de l'altitude de secours :", err.message);
    return null;
  }
}

/**
 * Récupère la géolocalisation de l'utilisateur de manière asynchrone.
 */
function getUserGeocode() {
  const storedLocation = getStoredLocation();
  if (!navigator.geolocation) {
    return Promise.resolve(storedLocation || getDefaultLocation());
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          altitude: coords.altitude,
          accuracy: coords.accuracy,
          altitudeAccuracy: coords.altitudeAccuracy
        };

        // Si l'altitude est absente, on tente de la récupérer via l'API de secours
        if (location.altitude === null || location.altitude === undefined) {
          console.info("Altitude GPS indisponible. Interrogation de l'API de secours...");
          const estimatedAltitude = await fetchFallbackAltitude(location.latitude, location.longitude);
          
          if (estimatedAltitude !== null) {
            location.altitude = estimatedAltitude;
            // On applique une précision théorique standard pour les modèles numériques de terrain (~30m)
            location.altitudeAccuracy = 30; 
          }
        }

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
      // maximumAge: 0 force le matériel à chercher une nouvelle coordonnée plutôt qu'un vieux cache réseau
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  });
}

/**
 * Construit l'URL d'appel pour l'API Weather.com avec les paramètres requis.
 */
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

/**
 * Effectue la requête HTTP fetch et valide la réponse JSON.
 */
async function fetchJson(baseUrl, label, geocode) {
  const response = await fetch(await buildApiUrl(baseUrl, geocode));
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Récupère et combine les prévisions météo et les conditions actuelles basées sur la position.
 */
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
