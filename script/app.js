import {
  calculateAltitudeFromPressure,
  getValueAtTime,
  calculatePressureAtAltitude,
  calculatePressureDrift,
  calculateThermalDrift,
  calculateHumidityDrift
} from './calculation.js';
import { getCalError, initializeAllSettings, getStoredMapUrl, clearMapCache } from './api_key_storage.js';
import { initializeTheme } from './theme.js';


const STORAGE_KEYS = {
  time: 'protrek.calibration.time',
  altitude: 'protrek.calibration.altitude',
  currentAltitude: 'protrek.current.altitude'
};
const FORECAST_STORAGE_KEY = 'protrek_forecast';
const USER_LOCATION_STORAGE_KEY = 'protrek.user.location';

const form = document.getElementById('calibrationForm');
const timeInput = document.getElementById('calibrationTime');
const altitudeInput = document.getElementById('calibrationAltitude');
const currentAltitudeInput = document.getElementById('currentAltitude');
const statusEl = document.getElementById('status');
const resultValueEl = document.getElementById('resultValue');
const resultDetailsEl = document.getElementById('resultDetails');
const pressureMetricEl = document.getElementById('pressureMetric');
const thermalMetricEl = document.getElementById('thermalMetric');
const humidityMetricEl = document.getElementById('humidityMetric');
const refreshBtn = document.getElementById('refreshBtn');
const forecastCoverageTextEl = document.getElementById('forecastCoverageText');
const carteEl = document.getElementById("carte");

/* 
*   
*   INITIALISATION DE L'INTERFACE -----------------------------------------------------
*
*/
await checkCacheValidity(); // Exécution immédiate du nettoyage avant d'afficher les éléments
await initializeTheme(); // light, dark, ou system
await initializeAllSettings();      // ?API=xxxxx ?MAP=yyyyy ?CAL=123.45
loadSavedValues(); // les input
updateForecastCoverage(await loadForecast()); // détails des prévisions
afficheCarte(); // la carte
turnOnOffbtn(navigator.onLine); // Vérification internet

/* 
* ÉCOUTEURS DES ÉVENEMENTS -------------------------------------------------------------
* 
*/

// BOUTON CALCULER
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!timeInput.value || !altitudeInput.value || !currentAltitudeInput.value) {
    statusEl.textContent = 'Veuillez remplir tous les champs.';
    statusEl.style.color = 'var(--status-error)';
    return;
  }
  localStorage.setItem(STORAGE_KEYS.time, timeInput.value);
  localStorage.setItem(STORAGE_KEYS.altitude, altitudeInput.value);
  localStorage.setItem(STORAGE_KEYS.currentAltitude, currentAltitudeInput.value);
  await computeResult();
});

// BOUTON RAFRAICHÎR PRÉVISIONS
refreshBtn.addEventListener('click', async () => {
  // On vide les anciens logs avant de lancer le nouveau cycle
  if (statusEl) statusEl.replaceChildren();

  try {
    const { fetchCombinedForecast, fetchMap } = await import('./weather_client.js');
    const forecast = await fetchCombinedForecast();
    localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(forecast));
    updateForecastCoverage(forecast);

    // Valeurs par défaut pour la calibration
    const location = getStoredLocation();
    if (location && Number.isFinite(location.altitude)) {
      // CORRIGÉ : Utilisation du bon pointeur d'élément de formulaire (altitudeInput)
      altitudeInput.value = location.altitude;
      window.dispatchEvent(new CustomEvent('gps-status', {
        detail: { message: `Altitude de calibration actualisée à ${location.altitude} m.`, type: 'info' }
      }));
    }
    timeInput.value = buildCurrentTimeString().slice(0, 16);

    // Met à jour la carte
    const nouvelleCarteURL = await fetchMap(forecast.location);

    // CORRIGÉ : Utilisation de carteEl déjà déclaré ou récupération sécurisée
    if (nouvelleCarteURL && carteEl) {
      if (carteEl.src.startsWith('blob:')) {
        URL.revokeObjectURL(carteEl.src);
      }
      carteEl.src = nouvelleCarteURL;
    } else if (carteEl && !carteEl.src) {
      carteEl.src = "img\\cartevide.webp";
    }


    // Message final de validation
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'Prévisions actualisées. Veuillez calibrer la montre.', type: 'success' }
    }));
  } catch (error) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: error.message || 'Impossible de rafraîchir les prévisions.', type: 'error' }
    }));
  }
});

// STATUT en journal de bord défillant
window.addEventListener('gps-status', (event) => {
  if (!statusEl) return;
  const { message, type } = event.detail;

  // 1. Alignement du conteneur sur vos variables de surface et d'ombrage
  statusEl.style.maxHeight = '10rem';
  statusEl.style.overflowY = 'auto';
  statusEl.style.display = 'flex';
  statusEl.style.flexDirection = 'column';
  statusEl.style.gap = '4px';
  statusEl.style.padding = '10px';
  statusEl.style.fontSize = '0.85rem';
  statusEl.style.textAlign = 'left';

  // 2. Création de la ligne textuelle
  const logLine = document.createElement('div');
  logLine.textContent = message;
  logLine.style.lineHeight = '1.4';
  logLine.style.marginBottom = '0.5rem';

  // 3. Attribution dynamique des couleurs de texte selon vos jetons de statut :root
  if (type === 'error') {
    logLine.style.color = 'var(--status-error)';
  } else if (type === 'warn') {
    logLine.style.color = 'var(--status-warning, #f39c12)'; // Fallback si non déclarée
  } else if (type === 'success') {
    // Équilibre entre --status-success (light) et --success (dark)
    logLine.style.color = 'var(--status-success, var(--success))';
    logLine.style.fontWeight = '600';
  } else {
    // Couleur d'information ou textuelle par défaut
    logLine.style.color = 'var(--status-info, var(--text))';
  }

  // 4. Injection et défilement
  statusEl.appendChild(logLine);
  statusEl.scrollTop = statusEl.scrollHeight;
});

// INTERNET ON
window.addEventListener('online', async () => {
  console.log('On a une connexion réseau...');

  try {
    // Utilisation de await pour attendre la vraie réponse du réseau
    // icanhazip.com accepte le CORS et répond ultra-rapidement
    const response = await fetch("https://icanhazip.com", {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (response.ok) {
      console.log('🟢 On a Internet !');
      turnOnOffbtn(true);
    } else {
      // Cas où le serveur répond mais avec une erreur (ex: portail captif)
      console.log('🔴 Réseau connecté mais pas de réponse Internet...');
      turnOnOffbtn(false);
    }

  } catch (error) {
    // Tombe ici si la requête échoue complètement (pas d'Internet, DNS en panne...)
    console.log('🔴 Pas d\'Internet...');
    turnOnOffbtn(false);
  }
});

// INTERNET OFF
window.addEventListener('offline', () => {
  console.log('🔴 Pas d\'Internet...');
  turnOnOffbtn(false);
});


//FIXME: pourquoi double téléchargement ??


// ------------------------------------------------------------------------------------------


// --- MÉCANISME DE NETTOYAGE AUTOMATIQUE ---
async function checkCacheValidity() {
  const storedForecast = localStorage.getItem(FORECAST_STORAGE_KEY);
  if (!storedForecast) return;

  try {
    const forecastData = JSON.parse(storedForecast);

    if (forecastData && forecastData.generatedAt) {
      const dateGeneration = new Date(forecastData.generatedAt);
      const maintenant = new Date();

      // Calcul de la différence en heures
      const differenceHeures = (maintenant - dateGeneration) / (1000 * 60 * 60);

      // Si les données ont plus de 72 heures (3 jours), on purge le cache
      if (differenceHeures >= 72) {
        localStorage.removeItem(FORECAST_STORAGE_KEY);
        await clearMapCache();
        window.dispatchEvent(new CustomEvent('gps-status', {
          detail: { message: 'Données météo et carte expirées. Cache réinitialisé.', type: 'warn' }
        }));
      }
    }
  } catch (e) {
    // En cas de JSON corrompu en mémoire, on applique une sécurité
    localStorage.removeItem(FORECAST_STORAGE_KEY);
    await clearMapCache();
  }
}

// Charge la carte stockée en mémoire IndexedDB s'il y en a une
async function afficheCarte() {
  if (carteEl) {
    const cachedMapUrl = await getStoredMapUrl();
    if (cachedMapUrl) {
      carteEl.src = cachedMapUrl;
    } else {
      carteEl.src = "img\\cartevide.webp";
    }
  }
}


async function loadForecast() {
  const storedForecast = localStorage.getItem(FORECAST_STORAGE_KEY);
  if (storedForecast) {
    try {
      return JSON.parse(storedForecast);
    } catch (error) {
      localStorage.removeItem(FORECAST_STORAGE_KEY);
    }
  }

  const { fetchCombinedForecast } = await import('./weather_client.js');
  const forecast = await fetchCombinedForecast();
  localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(forecast));
  return forecast;
}

function formatForecastTime(timeString, onlyHour = false) {
  if (!timeString) return 'indisponible';
  const date = new Date(timeString);
  if (Number.isNaN(date.getTime())) return timeString;
  return new Intl.DateTimeFormat('fr-CA', onlyHour
    ? { timeStyle: 'short' }
    : { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

function formatSignedMetric(value, decimals = 0) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  return `${sign}${magnitude.toFixed(decimals)} m`;
}

function getStoredLocation() {
  try {
    const location = JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY));
    if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      return location;
    }
  } catch (error) {
  }
  return null;
}

function prependForecastLocation(location) {
  // 1. Validation de sécurité initiale
  if (!location || !forecastCoverageTextEl) return;

  // 2. Extraction et normalisation des données (Fallback si null/undefined)
  const hasLatLon = Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
  const latLonText = hasLatLon
    ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    : 'Coordonnées indisponibles';

  const accuracyText = Number.isFinite(location.accuracy)
    ? `${Math.round(location.accuracy)} m`
    : 'indéterminée';

  const altitudeText = Number.isFinite(location.altitude)
    ? `${Math.round(location.altitude)} m`
    : 'indisponible';

  const altitudeAccuracyText = Number.isFinite(location.altitudeAccuracy)
    ? `${Math.round(location.altitudeAccuracy)} m`
    : 'indéterminée';

  // 3. Nettoyage du conteneur pour éviter les duplications lors des rafraîchissements
  // On ne garde que les éléments de prévisions textuels s'il y en a (gestion dynamique)
  const existingPrefix = forecastCoverageTextEl.querySelector('.location-prefix');
  if (existingPrefix) {
    existingPrefix.remove();
  }

  // 4. Construction sécurisée du fragment DOM
  const containerSpan = document.createElement('span');
  containerSpan.classList.add('location-prefix');

  containerSpan.append(
    document.createTextNode('Prévisions centrées sur '),
    Object.assign(document.createElement('strong'), { textContent: latLonText }),
    document.createTextNode(' avec une précision de '),
    Object.assign(document.createElement('strong'), { textContent: accuracyText }),
    document.createTextNode(' et '),
    Object.assign(document.createElement('strong'), { textContent: altitudeAccuracyText }),
    document.createTextNode(' à '),
    Object.assign(document.createElement('strong'), { textContent: altitudeText }),
    document.createTextNode(' d’élévation.'),
    document.createElement('br'),
    document.createElement('br')
  );

  // 5. Insertion propre en tête du conteneur cible
  forecastCoverageTextEl.prepend(containerSpan);
}

function updateForecastCoverage(rawData) {
  const forecastTimes = rawData && Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
  const currentTime = rawData && rawData.current ? rawData.current.validTimeLocal : null;
  const location = rawData?.location || getStoredLocation();
  if (forecastTimes.length === 0 && !currentTime) {
    forecastCoverageTextEl.textContent = 'Prévisions indisponibles.';
    prependForecastLocation(location);
    return;
  }
  forecastCoverageTextEl.replaceChildren(
    document.createTextNode('Conditions initiales en date du '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(currentTime) }),
    document.createTextNode('. '),
    document.createTextNode('Prévisions à partir du '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(forecastTimes[0]) }),
    document.createTextNode(' jusqu’au '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(forecastTimes[forecastTimes.length - 1]) }),
    document.createTextNode('.')
  );
  prependForecastLocation(location);
}

function buildTimeStringFromInput(timeValue, referenceDate = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(timeValue)) {
    return `${timeValue}:00`;
  }

  const [hours, minutes] = timeValue.split(':').map(Number);
  const date = new Date(referenceDate.getTime());
  date.setHours(hours, minutes, 0, 0);
  if (date > referenceDate) date.setDate(date.getDate() - 1);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}:00`;
}

function buildCurrentTimeString() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getCalibrationCoverageWarning(rawData, calibrationTime, currentTime) {
  const calibrationKey = calibrationTime.slice(0, 16);
  const currentKey = currentTime.slice(0, 16);

  // Cas 1 : Temps dans le futur
  if (calibrationKey > currentKey) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'La date de calibration est dans le futur par rapport à l’heure actuelle.', type: 'warn' }
    }));
    return; // On stoppe ici pour éviter de cumuler les messages
  }

  const forecastTimes = rawData && Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
  if (forecastTimes.length === 0) return;

  const firstForecastKey = forecastTimes[0].slice(0, 16);
  const initialTimeKey = rawData.current && rawData.current.validTimeLocal
    ? rawData.current.validTimeLocal.slice(0, 16)
    : firstForecastKey;
  const lastForecastKey = forecastTimes[forecastTimes.length - 1].slice(0, 16);

  // Cas 2 : Avant l'observation 'current' (Zone fixe passée)
  if (calibrationKey < initialTimeKey) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'Attention : La calibration précède l’observation en direct. Valeur fixe appliquée.', type: 'error' }
    }));
  }
  // Cas 3 : Entre 'current' et la première prévision (Zone interpolée)
  else if (calibrationKey < firstForecastKey) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'La calibration précède les prévisions. Transition fluide calculée par interpolation d’Hermite vers l’observation en direct.', type: 'info' }
    }));
  }
  // Cas 4 : Après la dernière prévision (Zone fixe future)
  else if (calibrationKey > lastForecastKey) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'La calibration dépasse les prévisions téléchargées. La dernière prévision disponible est figée.', type: 'warn' }
    }));
  }
}

function loadSavedValues() {
  const savedTime = localStorage.getItem(STORAGE_KEYS.time);
  const calibrationTime = savedTime
    ? buildTimeStringFromInput(savedTime).slice(0, 16)
    : null; // Rien pour refléter la situation réelle
  timeInput.value = calibrationTime;
  altitudeInput.value = localStorage.getItem(STORAGE_KEYS.altitude) || null; // Rien pour refléter la situation réelle
  currentAltitudeInput.value = localStorage.getItem(STORAGE_KEYS.currentAltitude) || null; // Rien pour refléter la situation réelle
}

// Rafraîchir prévisions <-> Hors ligne
function turnOnOffbtn(isOn = false) {
  if (isOn) {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('nowifi');
    refreshBtn.textContent = 'Rafraîchir prévisions';
  } else {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('nowifi');
    refreshBtn.textContent = 'Hors ligne';
  }
}


async function computeResult() {
  const timeValue = timeInput.value;
  const calibrationAltitude = Number(altitudeInput.value);
  const currentAltitude = Number(currentAltitudeInput.value);


  const SEVERITY_QUALIFIERS = {
    0: "Indicateur de sévérité météo indisponible.",
    1: "Les conditions météo sont stables et calmes.",
    2: "Une perturbation météo mineure est en cours.",
    3: "Instabilité barométrique détectée (risque d'orage) ; les lectures peuvent fluctuer.",
    4: "Dépression sévère ou tempête en cours ; attention aux fausses variations d'altitude.",
    5: "Conditions météo extrêmes ; l'altimètre barométrique est fortement perturbé."
  };


  // 1. Validation initiale des champs via le journal de bord
  if (!timeValue || !Number.isFinite(calibrationAltitude) || !Number.isFinite(currentAltitude)) {
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: 'Calcul impossible : Veuillez remplir tous les champs du formulaire.', type: 'warn' }
    }));
    resultValueEl.textContent = '-- m';
    resultDetailsEl.textContent = 'Aucune correction calculée.';
    return;
  }

  try {
    const rawData = await loadForecast();
    updateForecastCoverage(rawData);

    const targetTimeStr = buildCurrentTimeString();
    const calTimeStr = buildTimeStringFromInput(timeValue);

    // Récupération des données interpolées (Logarithmique pour MSL, Hermite pour le reste)
    const pWeatherCal = getValueAtTime(rawData, calTimeStr, 'pressureMeanSeaLevel');
    const pWeatherCurrent = getValueAtTime(rawData, targetTimeStr, 'pressureMeanSeaLevel');
    const tempWeatherCal = getValueAtTime(rawData, calTimeStr, 'temperature');
    const tempWeatherCurrent = getValueAtTime(rawData, targetTimeStr, 'temperature');
    const humidityCal = getValueAtTime(rawData, calTimeStr, 'relativeHumidity');
    const humidityCurrent = getValueAtTime(rawData, targetTimeStr, 'relativeHumidity');

    // Récupération du niveau de sévérité météo (0 par défaut si absent ou indisponible)
    const severityValue = getValueAtTime(rawData, targetTimeStr, 'wxSeverity');
    const severityCurrent = severityValue ?? 0;
    const severityText = SEVERITY_QUALIFIERS[severityCurrent] || SEVERITY_QUALIFIERS;


    if ([pWeatherCal, pWeatherCurrent, tempWeatherCal, tempWeatherCurrent, humidityCal, humidityCurrent]
      .some((value) => value === null || value === undefined)) {
      throw new Error('Données météo manquantes ou indisponibles pour les heures demandées.');
    }

    // Calculs d'altimétrie et de dérives barométriques
    const hTheoreticalCal = calculateAltitudeFromPressure(pWeatherCal);
    const hTheoreticalCurrent = calculateAltitudeFromPressure(pWeatherCurrent);
    const pressureDrift = calculatePressureDrift(hTheoreticalCal, hTheoreticalCurrent);
    const thermalDrift = calculateThermalDrift(tempWeatherCal, tempWeatherCurrent, hTheoreticalCal, hTheoreticalCurrent);
    const humidityDrift = calculateHumidityDrift(humidityCal, humidityCurrent, hTheoreticalCurrent);

    // Pressure drift is subtracted because a higher pressure corresponds to a lower altitude.
    // Thermal and humidity drifts are then added as corrective offsets.
    const pressureContribution = -pressureDrift;
    const thermalContribution = thermalDrift;
    const humidityContribution = humidityDrift;
    const totalAltitudeCorrection = pressureContribution + thermalContribution + humidityContribution;
    const trueAltitude = currentAltitude + totalAltitudeCorrection;
    const deltaAlt = trueAltitude - calibrationAltitude;
    const décalage_hPa = await getCalError();
    const expectedLocalPressure = calculatePressureAtAltitude(pWeatherCurrent, currentAltitude) + décalage_hPa;
    //TODO: test et ~ wxSeverity
    // selon mon test : ±0.4 hPa (~3.4 m) par temps calme
    const expectedLocalPressureMIN = Math.trunc(calculatePressureAtAltitude(pWeatherCurrent, currentAltitude + 3.4) + décalage_hPa);
    const expectedLocalPressureMAX = Math.trunc(calculatePressureAtAltitude(pWeatherCurrent, currentAltitude - 3.4) + décalage_hPa);
    const messageExpectedLocalPressure = expectedLocalPressureMIN == expectedLocalPressureMAX ?
      `de ${expectedLocalPressureMIN} hPa` :
      `entre ${expectedLocalPressureMIN} hPa et ${expectedLocalPressureMAX} hPa`;


    // 2. Calcul de la différence de temps absolue totale en minutes
    const calTimeMs = new Date(calTimeStr).getTime();
    const nowTimeMs = Date.now();
    const totalMinutes = Math.abs(Math.round((nowTimeMs - calTimeMs) / 60000));

    // 3. Initialisation des API internationales de formatage
    const rtf = new Intl.RelativeTimeFormat('fr-CA', { numeric: 'always' });
    const listFormatter = new Intl.ListFormat('fr-CA', { style: 'long', type: 'conjunction' });

    // 4. Extraction des composants (Jours, Heures, Minutes)
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const timeSegments = [];

    // Formatage de chaque unité via l'API (en retirant le préfixe "dans ")
    if (days > 0) {
      timeSegments.push(rtf.format(days, 'day').replace(/^dans\s+/, ''));
    }
    if (hours > 0) {
      timeSegments.push(rtf.format(hours, 'hour').replace(/^dans\s+/, ''));
    }
    // On affiche les minutes si elles sont présentes, ou si le delta total est de 0
    if (minutes > 0 || timeSegments.length === 0) {
      timeSegments.push(rtf.format(minutes, 'minute').replace(/^dans\s+/, ''));
    }

    // 5. Union des segments avec l'API internationale
    const timeText = listFormatter.format(timeSegments);

    // 5. Mise à jour de l'affichage des résultats graphiques principaux
    resultValueEl.innerHTML = `${Math.round(trueAltitude)} m`;
    pressureMetricEl.textContent = formatSignedMetric(pressureContribution, 1);
    thermalMetricEl.textContent = formatSignedMetric(thermalContribution, 1);
    humidityMetricEl.textContent = formatSignedMetric(humidityContribution, 1);

    // 6. Construction et injection du paragraphe de détails qualifié
    const detailsText = document.createElement('small');
    detailsText.append(
      'La correction totale estimée est de ',
      Object.assign(document.createElement('strong'), { textContent: `${(trueAltitude - currentAltitude).toFixed(1)} m` }),
      ' par rapport à l’affichage actuel. ',

      'L’élévation a changé de ',
      Object.assign(document.createElement('strong'), { textContent: `${deltaAlt.toFixed(1)} m en ${timeText}` }),
      '. ',

      'La pression atmosphérique estimée au niveau de la mer est de ',
      Object.assign(document.createElement('strong'), { textContent: `${pWeatherCurrent.toFixed(1)} hPa` }),
      '. ',

      'Votre montre devrait indiquer une pression locale ',
      messageExpectedLocalPressure,
      `, idéalement ${expectedLocalPressure.toFixed(1)} hPa. `,

      // Style dynamique appliqué selon la dangerosité ou l'absence de la donnée
      Object.assign(document.createElement('span'), {
        textContent: severityText,
        style: severityCurrent === 0
          ? 'color: var(--text-muted, #7f8c8d); font-style: italic;'
          : (severityCurrent === 3
            ? 'color: var(--status-warning, #f39c12); font-weight: 500;'
            : (severityCurrent >= 4 ? 'color: var(--status-error, #e74c3c); font-weight: 600;' : ''))
      })
    );
    resultDetailsEl.replaceChildren(detailsText);

    // 7. Nettoyage et confirmation des métriques de logs
    if (statusEl) statusEl.replaceChildren();

    // Lance l'analyse réécrite de couverture temporelle
    getCalibrationCoverageWarning(rawData, calTimeStr, targetTimeStr);

    // Notification finale de succès dans le journal de bord
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: {
        message: `Correction calculée à ${formatForecastTime(targetTimeStr, true)}`,
        type: 'success'
      }
    }));
  } catch (error) {
    console.error(error);

    // En cas d'échec, on ajoute la description de l'erreur dans les logs pour guider l'utilisateur
    window.dispatchEvent(new CustomEvent('gps-status', {
      detail: { message: `Échec du calcul : ${error.message}`, type: 'error' }
    }));

    resultValueEl.textContent = '-- m';
    pressureMetricEl.textContent = '-- m';
    thermalMetricEl.textContent = '-- m';
    humidityMetricEl.textContent = '-- m';
    resultDetailsEl.textContent = 'Le calcul n’a pas pu être effectué en raison d’une erreur technique.';
  }
}
