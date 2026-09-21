import { getApiKey, getMapApiKey } from './api_key_storage.js';

const FORECAST_API_URL = 'https://api.weather.com/v3/wx/forecast/hourly/3day';
const CURRENT_API_URL = 'https://api.weather.com/v3/wx/observations/current';
const ALTITUDE_API_URL = 'https://api.open-meteo.com/v1/elevation';
const STATIC_MAP_API_URL = 'https://maps.geoapify.com/v1/staticmap';
const DEFAULT_GEOCODE = '45.58,-73.54,36'; // lat,lon,alt
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
 * Interroge les données topographiques Copernicus DEM 2021 (GLO-90) pour 
 * obtenir l'élévation au point de calibration. La banque de données quadrille 
 * le globe en tuile de 3.0” x 3.0” latitude/longitude, avec une précision 
 * verticale d'au moins 4 m.
 * 
 * Airbus Copernicus Digital Elevation Model 
 * docs\geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf
 */
async function altitudeGLO(lat, lon) {
  try {
    // URL absolue et propre
    const url = ALTITUDE_API_URL + `?latitude=${lat}&longitude=${lon}`;
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
      return elevationValue;
    }

    return null;
  } catch (err) {
    dispatchGpsStatus(`[GLO-90] ${err.message}`, 'error');
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

    dispatchGpsStatus("Lectures multiples du GPS...", 'info');

    const executeAttempt = () => {
      attempts++;
      // dispatchGpsStatus(`[GPS] Tentative de mesure ${attempts}/${maxAttempts}...`, 'info');

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const location = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            accuracy: coords.accuracy,
            altitudeAccuracy: coords.altitudeAccuracy
          };

          dispatchGpsStatus(`[GPS] CEP-95 : ${Math.round(location.accuracy)} m`, 'info');

          if (!bestLocation || location.accuracy < bestLocation.accuracy) {
            bestLocation = location;
          }

          if (location.accuracy <= 23) {  // quart de 92, parce qu'au pire, 3 arc seconde = 92 m à l'équateur
            dispatchGpsStatus("[GPS] Précision suffisante obtenue !", 'success');
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
        dispatchGpsStatus(
          `[GPS] Coordonnées les plus précises : ${bestLocation.latitude}, ${bestLocation.longitude}`,
          'info'
        );
        finalizeLocation(bestLocation);
      }
    };

    const finalizeLocation = async (location) => {
      if (location) {

        dispatchGpsStatus("Récupération de l'élévation GLO-90...", 'info');
        const estimatedAltitude = await altitudeGLO(location.latitude, location.longitude);
        if (estimatedAltitude !== null) {
          location.altitude = estimatedAltitude;
          location.altitudeAccuracy = 4;  // Absolute Vertical Accuracy : < 4m (90% linear error)
          dispatchGpsStatus(`[GLO-90] Élévation obtenue : ${estimatedAltitude} m`, 'info');
        } else {
          dispatchGpsStatus("[GLO-90] Échec de l'obtention de l'élévation", 'error');
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
    throw new Error('[MÉTÉO] Aucune clé API météo configurée. Utilisez ?API=votre_clé.');
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
  let response; // Déclarée ici pour être accessible en dehors du try/catch

  try {
    response = await fetch(url);
  } catch (err) {
    // Intercepte les pannes réseau pures (ex: pas d'internet, DNS en panne)
    dispatchGpsStatus(`[MÉTÉO] ${label} indisponible : ${err.message}`, 'error');
    throw new Error(`[MÉTÉO] ${label} : Échec de la connexion réseau.`);
  }

  // Vérifie si le serveur a répondu par une erreur HTTP (ex: 401 Unauthorized, 404)
  if (!response.ok) {
    dispatchGpsStatus(`[MÉTÉO] ${label} : Erreur serveur (HTTP ${response.status})`, 'error');
    throw new Error(`[MÉTÉO] ${label}: HTTP ${response.status}`);
  }

  return response.json();
}


/**
 * Récupère et combine les prévisions météo et les conditions actuelles basées sur la position.
 */
export async function fetchCombinedForecast() {
  const location = await getUserGeocode();
  const geocode = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;

  dispatchGpsStatus("[MÉTÉO] Téléchargement des prévisions...", 'info');

  const [forecast, current] = await Promise.all([
    fetchJson(FORECAST_API_URL, 'Prévisions météo', geocode),
    fetchJson(CURRENT_API_URL, 'Conditions actuelles', geocode)
  ]);

  dispatchGpsStatus("[MÉTÉO] Conditions actuelles récupérées.", 'info');
  dispatchGpsStatus("[MÉTÉO] Prévisions météo (3 jours) téléchargées.", 'info');

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

/**
 * Construit l'URL d'appel pour l'API geoapify.com avec les paramètres requis.
 */
async function buildMapURL() {
  const mapKey = await getMapApiKey();
  if (!mapKey) {
    throw new Error('[CARTE] Aucune clé MAP configurée. Utilisez ?MAP=votre clé.');
  }
  const mapURL = `${STATIC_MAP_API_URL}?apiKey=${mapKey}`;
  return mapURL;
}

export async function fetchMap() {
  try {
    // 1. Récupère la position (depuis le cache ou le GPS si nécessaire)
    const location = await getStoredLocation();
    if (!location) {
      throw new Error("Impossible d'obtenir une position géographique valide.");
    }

    const url = await buildMapURL();

    const postJSON = {
      "style": "osm-liberty",
      "scaleFactor": 2,
      "width": 800,
      "height": 600,
      "center": {
        "lat": location.latitude,
        "lon": location.longitude
      },
      "zoom": 14,
      "markers": [
        {
          "lat": location.latitude,
          "lon": location.longitude,
          "color": "#ff0000",
          "size": "42"
        }
      ]
    };

    const request = new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postJSON) // <-- CORRIGÉ : Le body est maintenant activé
    });

    dispatchGpsStatus("[CARTE] Téléchargement de la carte statique...", 'info');
    const response = await fetch(request);

    // 2. Vérification standard de la réponse HTTP
    if (!response.ok) { // GESTION DES ERREURS (400, 401, 429, 500, etc.)
      const contentType = response.headers.get("content-type");

      // Si le serveur renvoie du JSON, on extrait les détails de l'erreur (statusCode, error, message)
      if (contentType && contentType.includes("application/json")) {
        const errorJson = await response.json();
        throw {
          isApiError: true,
          statusCode: errorJson.statusCode || response.status,
          error: errorJson.error || "Erreur API",
          message: errorJson.message || "Aucun message fourni"
        };
      } else {
        // Sécurité si le serveur renvoie du texte brut ou du HTML
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status} : ${errorText}`);
      }
    }

    // 3. Extraction de l'image sous forme de Blob
    const imageBlob = await response.blob();
    dispatchGpsStatus("[CARTE] Carte récupérée avec succès.", 'info');

    // AJOUT : Sauvegarde le blob dans IndexedDB en arrière-plan
    const { saveMapBlob } = await import('./api_key_storage.js');
    await saveMapBlob(imageBlob);

    // 4. Retourne une URL locale utilisable directement dans un attribut src="..."
    return URL.createObjectURL(imageBlob);


  } catch (e) {
    dispatchGpsStatus(`[Carte] Échec de la récupération : ${e.message}`, "error");
    return null;
  }
}
