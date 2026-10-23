/**
 * Convertit une pression atmosphérique en altitude théorique selon la formule barométrique standard.
 */
export function calculateAltitudeFromPressure(pressure_hpa) {
  if (typeof pressure_hpa !== 'number' || pressure_hpa <= 0) return null;
  const L_LAPSE = 0.0065;
  const EXPOSANT = 0.190284;
  const T0_K = 288.15;
  const P0_HPA = 1013.25;
  const ratio_p_p0 = pressure_hpa / P0_HPA;
  const altitude_m = (T0_K / L_LAPSE) * (1 - (ratio_p_p0 ** EXPOSANT));
  return Number.isFinite(altitude_m) ? altitude_m : null;
}

/**
 * Transforme une date locale au format ISO en minutes écoulées pour faciliter les calculs temporels.
 */
function parseLocalToMinutes(dateStr) {
  if (!dateStr || dateStr.length < 16) return 0;
  const portionLocale = dateStr.slice(0, 16);
  const dateNeutre = new Date(`${portionLocale}:00Z`);
  return Math.floor(dateNeutre.getTime() / 60000);
}

/**
 * Vérifie que les données météo contiennent les séries nécessaires à l'interpolation.
 */
function hasInterpolationData(rawData, fieldName) {
  return Boolean(rawData)
    && Array.isArray(rawData.validTimeLocal)
    && Array.isArray(rawData[fieldName]);
}

function getCurrentValidTime(current) {
  if (!current) return null;
  return current.validTimeLocal;
}

function getCurrentFieldValue(current, fieldName) {
  if (!current || current[fieldName] === undefined) return null;
  return current[fieldName];
}

function shouldInsertCurrentPoint(currentTimeMinutes, timesMinutes) {
  return timesMinutes.length === 0 || currentTimeMinutes < timesMinutes[0];
}

function insertCurrentPoint(current, fieldName, timesMinutes, values) {
  const currentFieldValue = getCurrentFieldValue(current, fieldName);
  const currentValidTime = getCurrentValidTime(current);
  if (currentFieldValue === null || !currentValidTime) return;

  const currentTimeMinutes = parseLocalToMinutes(currentValidTime);
  if (!shouldInsertCurrentPoint(currentTimeMinutes, timesMinutes)) return;
  timesMinutes.unshift(currentTimeMinutes);
  values.unshift(currentFieldValue);
}

/**
 * Prépare les points d'interpolation et ajoute la mesure actuelle si elle précède les prévisions.
 */
function getInterpolationPoints(rawData, fieldName) {
  if (!hasInterpolationData(rawData, fieldName)) return null;

  const values = [...rawData[fieldName]];
  const timesMinutes = rawData.validTimeLocal.map((timeStr) => parseLocalToMinutes(timeStr));
  insertCurrentPoint(rawData.current, fieldName, timesMinutes, values);
  return { timesMinutes, values };
}

function findInterpolationInterval(timesMinutes, targetMinutes) {
  let i = 0;
  while (i < timesMinutes.length - 1 && timesMinutes[i + 1] <= targetMinutes) {
    i += 1;
  }
  return i;
}

function interpolateLogarithmically(v0, v1, fraction) {
  const logV0 = Math.log(Math.max(v0, 1e-6));
  const logV1 = Math.log(Math.max(v1, 1e-6));
  return Math.exp(logV0 + fraction * (logV1 - logV0));
}

function getPreviousValue(values, i) {
  return i > 0 ? values[i - 1] : values[i];
}

function getNextValue(values, i) {
  return i < values.length - 2 ? values[i + 2] : values[i + 1];
}

function interpolateHermite(timesMinutes, values, i, fraction, tDelta) {
  const t0 = timesMinutes[i];
  const t1 = timesMinutes[i + 1];
  const v0 = values[i];
  const v1 = values[i + 1];
  const vPrev = getPreviousValue(values, i);
  const vNext = getNextValue(values, i);
  const slope0 = (v1 - vPrev) / (tDelta + (timesMinutes[i] - timesMinutes[i - 1] || tDelta));
  const slope1 = (vNext - v0) / (tDelta + (timesMinutes[i + 2] - t1 || tDelta));
  const h00 = 2 * fraction * fraction * fraction - 3 * fraction * fraction + 1;
  const h10 = fraction * fraction * fraction - 2 * fraction * fraction + fraction;
  const h01 = -2 * fraction * fraction * fraction + 3 * fraction * fraction;
  const h11 = fraction * fraction * fraction - fraction * fraction;

  return h00 * v0 + h10 * (tDelta * slope0) + h01 * v1 + h11 * (tDelta * slope1);
}

/**
 * Renvoie la valeur d'un champ météo interpolée à une heure locale donnée.
 */
export function getValueAtTime(rawData, targetLocalTimeString, fieldName) {
  const points = getInterpolationPoints(rawData, fieldName);
  if (!points) return null;

  const { timesMinutes, values } = points;
  const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
  return getValueFromPoints(timesMinutes, values, targetMinutes, fieldName);
}

function getValueFromPoints(timesMinutes, values, targetMinutes, fieldName) {
  const boundary = getBoundaryValue(timesMinutes, values, targetMinutes);
  if (boundary.found) return boundary.value;

  const i = findInterpolationInterval(timesMinutes, targetMinutes);

  const t0 = timesMinutes[i];
  const t1 = timesMinutes[i + 1];
  const v0 = values[i];
  if (t1 === t0) return v0;

  const fraction = (targetMinutes - t0) / (t1 - t0);
  const tDelta = t1 - t0;
  if (fieldName === 'pressureMeanSeaLevel') {
    return interpolateLogarithmically(v0, values[i + 1], fraction);
  }
  return interpolateHermite(timesMinutes, values, i, fraction, tDelta);
}

function getBoundaryValue(timesMinutes, values, targetMinutes) {
  if (timesMinutes.length === 0) return { found: true, value: null };
  if (targetMinutes <= timesMinutes[0]) return { found: true, value: values[0] };
  if (targetMinutes >= timesMinutes[timesMinutes.length - 1]) {
    return { found: true, value: values[values.length - 1] };
  }
  return { found: false, value: null };
}

/**
 * Détermine si la situation actuelle doit être utilisée au lieu des prévisions pour une heure cible.
 */
/* export function usesCurrentConditionsForTime(rawData, targetLocalTimeString) {
  if (!rawData || !Array.isArray(rawData.validTimeLocal) || rawData.validTimeLocal.length === 0) {
    return false;
  }

  const current = rawData.current;
  const currentExists = current
    && current.temperature !== undefined
    && current.pressureMeanSeaLevel !== undefined
    && current.relativeHumidity !== undefined;
  const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
  const firstForecastMinutes = parseLocalToMinutes(rawData.validTimeLocal[0]);

  return Boolean(currentExists && targetMinutes <= firstForecastMinutes);
} */

/**
 * Calcule la dérive de pression entre l'heure de calibration et l'instant courant.
 */
export function calculatePressureDrift(hTheoreticalCal, hTheoreticalCurrent) {
  return hTheoreticalCurrent - hTheoreticalCal;
}

/**
 * Estime le décalage d'altitude lié aux variations thermiques par rapport à la température ISA.
 */
export function calculateThermalDrift(tempWeatherCal, tempWeatherCurrent, hTheoreticalCal, hTheoreticalCurrent) {
  const isaTempCal = 15 - 0.0065 * hTheoreticalCal;
  const isaTempCurrent = 15 - 0.0065 * hTheoreticalCurrent;
  const tempBiasCal = tempWeatherCal - isaTempCal;
  const tempBiasCurrent = tempWeatherCurrent - isaTempCurrent;
  return 0.5 * ((tempBiasCurrent - tempBiasCal) * (hTheoreticalCurrent / 288.15));
}

/**
 * Calcule l'influence de l'humidité sur la correction d'altitude.
 */
export function calculateHumidityDrift(humidityCal, humidityCurrent, hTheoreticalCurrent) {
  const humidityTermCal = (humidityCal - 50) * 0.01;
  const humidityTermCurrent = (humidityCurrent - 50) * 0.01;
  return 0.25 * (humidityTermCurrent - humidityTermCal) * (hTheoreticalCurrent / 1000);
}

/**
 * Calcule la pression locale attendue à une altitude donnée à partir de la pression au niveau de la mer.
 */
export function calculatePressureAtAltitude(pSeaLevel_hpa, altitude_m) {
  if (pSeaLevel_hpa <= 0 || altitude_m === null) return null;
  const L_LAPSE = 0.0065;
  const EXPOSANT = 0.190284;
  const T0_K = 288.15;

  const ratio = (1 - (altitude_m * L_LAPSE) / T0_K) ** (1 / EXPOSANT);
  const pLocal_hpa = pSeaLevel_hpa * ratio;

  return Number.isFinite(pLocal_hpa) ? pLocal_hpa : null;
}
