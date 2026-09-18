import { getApiKey } from './api_key_storage.js';

const BASE_API_URL = 'https://api.weather.com/v3/wx/forecast/hourly/3day';
const CURRENT_API_URL = 'https://api.weather.com/v3/wx/observations/current';
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
  return { latitude, longitude, altitude, accuracy: null, altitudeAccuracy: null };
}

/**
 * API de secours : Interroge les données topographiques d'Open-Meteo
 * lorsque la puce GPS de l'appareil ne fournit pas l'élévation.
 */
async function fetchFallbackAltitude(lat, lon) {
  try {
    // URL absolue et propre
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    // Sécurité : On vérifie que le serveur renvoie bien du JSON et non de l'HTML (ex: <!doctype ...)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new TypeError("Le serveur n'a pas renvoyé un format JSON valide.");
    }

    const data = await response.json();

    // Extraction sécurisée du tableau d'élévation
    if (data && Array.isArray(data.elevation) && data.elevation.length > 0) {
      const elevationValue = data.elevation[0];
      console.log(`Altitude estimée via API tierce : ${elevationValue} m`);
      return elevationValue;
    }

    return null;
  } catch (err) {
    console.warn("Échec de la récupération de l'altitude de secours :", err.message);
    return null;
  }
}

/**
 * Émet un événement personnalisé pour notifier l'application de la progression du GPS
 */
function dispatchGpsStatus(message, type = 'info') {
  if (type === 'warn') console.warn(message);
  else if (type === 'error') console.error(message);
  else console.log(message);

  window.dispatchEvent(new CustomEvent('gps-status', {
    detail: { message, type }
  }));
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
    let attempts = 0;
    const maxAttempts = 3;
    let bestLocation = null;

    dispatchGpsStatus("Début de la séquence de stabilisation forcée du GPS...", 'info');

    const executeAttempt = () => {
      attempts++;
      dispatchGpsStatus(`[GPS] Tentative de mesure ${attempts}/${maxAttempts}...`, 'info');

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const location = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            accuracy: coords.accuracy,
            altitudeAccuracy: coords.altitudeAccuracy
          };

          dispatchGpsStatus(`[GPS] Mesure ${attempts} reçue (Précision H: ${Math.round(location.accuracy)}m, V: ${location.altitudeAccuracy !== null ? Math.round(location.altitudeAccuracy) + 'm' : 'indisponible'})`, 'info');

          if (!bestLocation || location.accuracy < bestLocation.accuracy) {
            bestLocation = location;
          }

          if (location.accuracy <= 20 && location.altitude !== null) {
            dispatchGpsStatus("Signal GPS optimal détecté !", 'success');
            finalizeLocation(bestLocation);
            return;
          }

          evaluateNextStep();
        },
        (error) => {
          dispatchGpsStatus(`[GPS] Échec de la tentative ${attempts}: ${error.message}`, 'warn');
          evaluateNextStep();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 3500 }
      );
    };

    const evaluateNextStep = () => {
      if (attempts < maxAttempts) {
        setTimeout(executeAttempt, 1500);
      } else {
        dispatchGpsStatus("Fin du cycle de recherche. Sélection du meilleur profil.", 'info');
        finalizeLocation(bestLocation);
      }
    };

    const finalizeLocation = async (location) => {
      if (location) {
        if (location.altitude === null || location.altitude === undefined) {
          dispatchGpsStatus("Altitude matérielle absente. Interrogation de l'API de secours Open-Meteo...", 'info');
          const estimatedAltitude = await fetchFallbackAltitude(location.latitude, location.longitude);
          if (estimatedAltitude !== null) {
            location.altitude = estimatedAltitude;
            location.altitudeAccuracy = undefined;
            dispatchGpsStatus(`Altitude de secours appliquée avec succès : ${estimatedAltitude} m`, 'info');
          } else {
            dispatchGpsStatus("Échec du calcul d'altitude de secours.", 'warn');
          }
        }

        if (isValidLocation(location)) {
          localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(location));
          resolve(location);
          return;
        }
      }
      resolve(storedLocation || getDefaultLocation());
    };

    executeAttempt();
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
  const url = await buildApiUrl(baseUrl, geocode);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}


/**
 * Récupère et combine les prévisions météo et les conditions actuelles basées sur la position.
 */
export async function fetchCombinedForecast() {
  const location = await getUserGeocode();
  const geocode = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;

  dispatchGpsStatus("Téléchargement des prévisions de Weather.com...", 'info');

  const [forecast, current] = await Promise.all([
    fetchJson(BASE_API_URL, 'Prévisions météo', geocode),
    fetchJson(CURRENT_API_URL, 'Conditions actuelles', geocode)
  ]);

  dispatchGpsStatus("Conditions actuelles récupérées avec succès.", 'info');
  dispatchGpsStatus("Prévisions météo (3 jours) téléchargées.", 'info');

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
