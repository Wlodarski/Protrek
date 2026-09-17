import {
  calculateAltitudeFromPressure,
  getValueAtTime,
  usesCurrentConditionsForTime,
  calculatePressureDrift,
  calculateThermalDrift,
  calculateHumidityDrift
} from './calculation.js';
import { initializeApiKey } from './api_key_storage.js';
import { initializeTheme } from './theme.js';

await initializeTheme();
await initializeApiKey();

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
  if (!location) return;
  forecastCoverageTextEl.prepend(
    document.createTextNode('Prévisions centrées sur '),
    Object.assign(document.createElement('strong'), {
      textContent: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    }),
    document.createElement('br')
  );
}

function updateForecastCoverage(rawData) {
  const forecastTimes = rawData && Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
  const currentTime = rawData && rawData.current ? rawData.current.validTimeLocal : null;
  const location = rawData?.location || getStoredLocation();
  if (forecastTimes.length === 0 && !currentTime) {
    forecastCoverageTextEl.textContent = 'Horaires des prévisions indisponibles.';
    prependForecastLocation(location);
    return;
  }
  forecastCoverageTextEl.replaceChildren(
    document.createTextNode('Conditions initiales du '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(currentTime) }),
    document.createElement('br'),
    document.createTextNode('Prévisions du '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(forecastTimes[0]) }),
    document.createTextNode(' au '),
    Object.assign(document.createElement('strong'), { textContent: formatForecastTime(forecastTimes[forecastTimes.length - 1]) })
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
  const warnings = [];
  const calibrationKey = calibrationTime.slice(0, 16);
  const currentKey = currentTime.slice(0, 16);
  if (calibrationKey > currentKey) {
    warnings.push('Avertissement : la date de calibration est dans le futur par rapport à l’heure actuelle.');
  }

  const forecastTimes = rawData && Array.isArray(rawData.validTimeLocal)
    ? rawData.validTimeLocal
    : [];
  if (forecastTimes.length === 0) return warnings.join('<br><br>');

  const firstForecastKey = forecastTimes[0].slice(0, 16);
  const lastForecastKey = forecastTimes[forecastTimes.length - 1].slice(0, 16);

  if (calibrationKey < firstForecastKey) {
    warnings.push('Avertissement : la calibration précède les prévisions téléchargées. Les conditions actuelles sont utilisées.');
  }
  if (calibrationKey > lastForecastKey) {
    warnings.push('Avertissement : la calibration dépasse les prévisions téléchargées. La dernière prévision disponible est utilisée.');
  }
  return warnings.join('<br><br>');
}

async function computeResult() {
  const timeValue = timeInput.value;
  const calibrationAltitude = Number(altitudeInput.value);
  const currentAltitude = Number(currentAltitudeInput.value);
  if (!timeValue || !Number.isFinite(calibrationAltitude) || !Number.isFinite(currentAltitude)) {
    statusEl.textContent = 'Veuillez remplir tous les champs.';
    statusEl.style.color = 'var(--status-error)';
    resultValueEl.textContent = '-- m';
    resultDetailsEl.textContent = 'Aucune correction calculée.';
    return;
  }

  try {
    const rawData = await loadForecast();
    updateForecastCoverage(rawData);
    const targetTimeStr = buildCurrentTimeString();
    const calTimeStr = buildTimeStringFromInput(timeValue);
    const calibrationCoverageWarning = getCalibrationCoverageWarning(rawData, calTimeStr, targetTimeStr);
    const pWeatherCal = getValueAtTime(rawData, calTimeStr, 'pressureMeanSeaLevel');
    const pWeatherCurrent = getValueAtTime(rawData, targetTimeStr, 'pressureMeanSeaLevel');
    const tempWeatherCal = getValueAtTime(rawData, calTimeStr, 'temperature');
    const tempWeatherCurrent = getValueAtTime(rawData, targetTimeStr, 'temperature');
    const humidityCal = getValueAtTime(rawData, calTimeStr, 'relativeHumidity');
    const humidityCurrent = getValueAtTime(rawData, targetTimeStr, 'relativeHumidity');
    const usesCurrentConditions = usesCurrentConditionsForTime(rawData, calTimeStr);
    if ([pWeatherCal, pWeatherCurrent, tempWeatherCal, tempWeatherCurrent, humidityCal, humidityCurrent]
      .some((value) => value === null || value === undefined)) {
      throw new Error('La météo n’est pas disponible pour les heures demandées.');
    }

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

    resultValueEl.textContent = `${Math.round(trueAltitude)} m`;
    pressureMetricEl.textContent = formatSignedMetric(pressureContribution, 1);
    thermalMetricEl.textContent = formatSignedMetric(thermalContribution, 1);
    humidityMetricEl.textContent = formatSignedMetric(humidityContribution, 1);
    const detailsText = document.createElement('small');
    detailsText.append(
      'La correction totale estimée est de ',
      Object.assign(document.createElement('strong'), { textContent: `${(trueAltitude - currentAltitude).toFixed(1)} m` }),
      ' par rapport à l’affichage actuel. La pression atmosphérique estimée au niveau de la mer est de ',
      Object.assign(document.createElement('strong'), { textContent: `${pWeatherCurrent.toFixed(1)} hPa` }),
      '.'
    );
    resultDetailsEl.replaceChildren(detailsText);
    if (usesCurrentConditions) {
      forecastCoverageTextEl.append(
        document.createElement('br'),
        document.createElement('br'),
        'La calibration précède les prévisions alors la correction se fonde aussi sur les conditions initiales.'
      );
    }
    if (calibrationCoverageWarning) {
      statusEl.innerHTML = calibrationCoverageWarning;
    } else {
      statusEl.textContent = `Correction calculée à ${formatForecastTime(targetTimeStr, true)}`;
    }
    statusEl.style.color = calibrationCoverageWarning ? 'var(--status-info)' : 'var(--status-success)';
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Erreur: ${error.message}`;
    statusEl.style.color = 'var(--status-error)';
    resultValueEl.textContent = '-- m';
    pressureMetricEl.textContent = '-- m';
    thermalMetricEl.textContent = '-- m';
    humidityMetricEl.textContent = '-- m';
    resultDetailsEl.textContent = 'Le calcul n’a pas pu être effectué.';
  }
}

function loadSavedValues() {
  const savedTime = localStorage.getItem(STORAGE_KEYS.time);
  const calibrationTime = savedTime
    ? buildTimeStringFromInput(savedTime).slice(0, 16)
    : buildTimeStringFromInput('09:04').slice(0, 16);
  timeInput.value = calibrationTime;
  altitudeInput.value = localStorage.getItem(STORAGE_KEYS.altitude) || '32';
  currentAltitudeInput.value = localStorage.getItem(STORAGE_KEYS.currentAltitude) || '0';
}

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

refreshBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Rafraîchissement des prévisions...';
  statusEl.style.color = 'var(--status-info)';
  try {
    const { fetchCombinedForecast } = await import('./weather_client.js');
    const forecast = await fetchCombinedForecast();
    localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(forecast));
    updateForecastCoverage(forecast);
    statusEl.textContent = 'Prévisions actualisées. Vous pouvez recalculer.';
    statusEl.style.color = 'var(--status-success)';
  } catch (error) {
    statusEl.textContent = error.message || 'Impossible de rafraîchir les prévisions.';
    statusEl.style.color = 'var(--status-error)';
  }
});

loadSavedValues();
