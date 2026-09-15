/**
 * @file Module gérant les appels aux API météo externes et l'extraction précise de données.
 */

require('dotenv').config();

const WEATHER_CONFIG = {
    API_KEY: process.env.WEATHER_API_KEY,
    GEOCODE: '45.5818441%2C-73.5440191' 
};

const BASE_API_URL = "https://api.weather.com/v3/wx/forecast/hourly/3day";
const CURRENT_API_URL = "https://api.weather.com/v3/wx/observations/current";

/**
 * Récupère les observations météo du moment.
 */
async function fetchCurrentConditions() {
    const url = `${CURRENT_API_URL}?apiKey=${WEATHER_CONFIG.API_KEY}&units=m&language=en-US&format=json&geocode=${WEATHER_CONFIG.GEOCODE}`;
    try {
        console.log("Tentative de récupération des conditions actuelles...");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Échec du service météo actuel:", error.message);
        throw error;
    }
}

/**
 * Récupère les prévisions météo horaires depuis l'API.
 */
async function fetchHourlyForecast() {
    const url = `${BASE_API_URL}?apiKey=${WEATHER_CONFIG.API_KEY}&units=m&language=en-US&format=json&geocode=${WEATHER_CONFIG.GEOCODE}`;
    try {
        console.log("Tentative de récupération des prévisions météo...");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Échec du service météo:", error.message);
        throw error; 
    }
}

async function fetchCombinedForecast() {
    const [forecast, current] = await Promise.all([
        fetchHourlyForecast(),
        fetchCurrentConditions()
    ]);

    return {
        generatedAt: new Date().toISOString(),
        current: current ? {
            validTimeLocal: current.validTimeLocal || current.validTimeUtc || null,
            pressureMeanSeaLevel: current.pressureMeanSeaLevel,
            temperature: current.temperature,
            relativeHumidity: current.relativeHumidity
        } : null,
        ...forecast
    };
}

/**
 * Convertit une chaîne de date locale en minutes absolues de façon neutre.
 */
function parseLocalToMinutes(dateStr) {
    if (!dateStr) return 0;

    const normalized = String(dateStr).replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
        return Math.floor(parsed.getTime() / 60000);
    }

    if (normalized.length < 16) return 0;
    const portionLocale = normalized.slice(0, 16);
    const dateNeutre = new Date(`${portionLocale}:00Z`);
    return Math.floor(dateNeutre.getTime() / 60000);
}

function hasCoverageForTime(rawData, targetLocalTimeString) {
    if (!rawData) {
        return false;
    }

    const forecastTimes = Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
    const currentExists = !!(rawData.current && rawData.current.temperature !== undefined && rawData.current.pressureMeanSeaLevel !== undefined && rawData.current.relativeHumidity !== undefined);

    if (forecastTimes.length === 0) {
        return currentExists;
    }

    const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
    const firstForecastMinutes = parseLocalToMinutes(forecastTimes[0]);
    const lastForecastMinutes = parseLocalToMinutes(forecastTimes[forecastTimes.length - 1]);

    if (targetMinutes <= firstForecastMinutes) {
        return currentExists;
    }

    return targetMinutes <= lastForecastMinutes;
}

function usesCurrentConditionsForTime(rawData, targetLocalTimeString) {
    if (!rawData) {
        return false;
    }

    const forecastTimes = Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
    const currentExists = !!(rawData.current && rawData.current.temperature !== undefined && rawData.current.pressureMeanSeaLevel !== undefined && rawData.current.relativeHumidity !== undefined);

    if (forecastTimes.length === 0) {
        return currentExists;
    }

    const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
    const firstForecastMinutes = parseLocalToMinutes(forecastTimes[0]);

    return currentExists && targetMinutes <= firstForecastMinutes;
}

/**
 * Interpole une valeur météo entre deux points horaires.
 * Pour la pression, on privilégie l'interpolation du logarithme pour refléter la physique
 * atmosphérique, qui est exponentielle avec l'altitude. Pour les autres champs, on utilise
 * une approximation de type Hermite (pente locale) pour limiter les cassures brusques.
 */
function getValueAtTime(rawData, targetLocalTimeString, fieldName) {
    if (!rawData) {
        return null;
    }

    const localTimes = Array.isArray(rawData.validTimeLocal) ? rawData.validTimeLocal : [];
    const values = Array.isArray(rawData[fieldName]) ? rawData[fieldName] : [];
    const currentFieldValue = rawData.current && rawData.current[fieldName] !== undefined ? rawData.current[fieldName] : null;

    if (localTimes.length === 0 || values.length === 0) {
        return currentFieldValue;
    }

    const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
    const timesMinutes = localTimes.map(timeStr => parseLocalToMinutes(timeStr));

    if (currentFieldValue !== null && targetMinutes <= timesMinutes[0]) {
        return currentFieldValue;
    }
    if (targetMinutes <= timesMinutes[0]) return values[0];
    if (targetMinutes >= timesMinutes[timesMinutes.length - 1]) return values[values.length - 1];

    let i = 0;
    while (i < timesMinutes.length - 1 && timesMinutes[i + 1] <= targetMinutes) {
        i++;
    }

    const t0 = timesMinutes[i];
    const t1 = timesMinutes[i + 1];
    const v0 = values[i];
    const v1 = values[i + 1];
    const vPrev = i > 0 ? values[i - 1] : v0;
    const vNext = i < values.length - 2 ? values[i + 2] : v1;

    if (t1 === t0) return v0;

    const fraction = (targetMinutes - t0) / (t1 - t0);
    const tDelta = t1 - t0;

    if (fieldName === 'pressureMeanSeaLevel') {
        const logV0 = Math.log(Math.max(v0, 1e-6));
        const logV1 = Math.log(Math.max(v1, 1e-6));
        const logInterpolated = logV0 + fraction * (logV1 - logV0);
        return Math.exp(logInterpolated);
    }

    const slope0 = (v1 - vPrev) / (tDelta + (timesMinutes[i] - timesMinutes[i - 1] || tDelta));
    const slope1 = (vNext - v0) / (tDelta + (timesMinutes[i + 2] - t1 || tDelta));
    const m0 = slope0;
    const m1 = slope1;
    const h00 = 2 * fraction * fraction * fraction - 3 * fraction * fraction + 1;
    const h10 = fraction * fraction * fraction - 2 * fraction * fraction + fraction;
    const h01 = -2 * fraction * fraction * fraction + 3 * fraction * fraction;
    const h11 = fraction * fraction * fraction - fraction * fraction;

    const interpolatedValue = h00 * v0 + h10 * (tDelta * m0) + h01 * v1 + h11 * (tDelta * m1);
    return interpolatedValue;
}

/**
 * Calcule la pression interpolée en utilisant une comparaison brute des heures locales textuelles.
 */
async function getPressureAtTime(rawData, targetLocalTimeString) {
    return getValueAtTime(rawData, targetLocalTimeString, 'pressureMeanSeaLevel');
}

/**
 * Calcule la température interpolée à un instant donné.
 */
async function getTemperatureAtTime(rawData, targetLocalTimeString) {
    return getValueAtTime(rawData, targetLocalTimeString, 'temperature');
}

/**
 * Calcule l'humidité relative interpolée à un instant donné.
 */
async function getRelativeHumidityAtTime(rawData, targetLocalTimeString) {
    return getValueAtTime(rawData, targetLocalTimeString, 'relativeHumidity');
}

module.exports = { fetchHourlyForecast, fetchCurrentConditions, fetchCombinedForecast, hasCoverageForTime, usesCurrentConditionsForTime, getPressureAtTime, getTemperatureAtTime, getRelativeHumidityAtTime };
