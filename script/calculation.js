export function calculateAltitudeFromPressure(pressure_hpa) {
    if (typeof pressure_hpa !== 'number' || pressure_hpa <= 0) return null;
    const L_LAPSE = 0.0065;
    const EXPOSANT = 0.190284;
    const T0_K = 288.15;
    const P0_HPA = 1013.25;
    const ratio_p_p0 = pressure_hpa / P0_HPA;
    const altitude_m = (T0_K / L_LAPSE) * (1 - (ratio_p_p0 ** EXPOSANT));
    return Number.isFinite(altitude_m) ? Math.round(altitude_m) : null;
  }
function parseLocalToMinutes(dateStr) {
    if (!dateStr || dateStr.length < 16) return 0;
    const portionLocale = dateStr.slice(0, 16);
    const dateNeutre = new Date(`${portionLocale}:00Z`);
    return Math.floor(dateNeutre.getTime() / 60000);
  }

export function getValueAtTime(rawData, targetLocalTimeString, fieldName) {
    if (!rawData || !Array.isArray(rawData.validTimeLocal) || !Array.isArray(rawData[fieldName])) {
      return null;
    }

    // 1. Copie locale des données pour éviter de modifier l'objet original par référence
    let localTimes = [...rawData.validTimeLocal];
    let values = [...rawData[fieldName]];
    const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
    let timesMinutes = localTimes.map((timeStr) => parseLocalToMinutes(timeStr));

    // 2. Récupération de la valeur 'current' et de son heure exacte
    const currentFieldValue = rawData.current && rawData.current[fieldName] !== undefined
      ? rawData.current[fieldName]
      : null;
    const currentValidTime = rawData.current && rawData.current.validTimeLocal;

    // 3. Injection de 'current' au tout début si elle existe et possède un horodatage valide
    if (currentFieldValue !== null && currentValidTime) {
      const currentTimeMinutes = parseLocalToMinutes(currentValidTime);

      // Sécurité : On s'assure que la donnée actuelle est bien chronologiquement 
      // antérieure à la première prévision avant de l'insérer au début
      if (timesMinutes.length === 0 || currentTimeMinutes < timesMinutes[0]) {
        timesMinutes.unshift(currentTimeMinutes);
        values.unshift(currentFieldValue);
      }
    }

    // 4. Gestion des limites après injection
    if (timesMinutes.length === 0) return null;
    if (targetMinutes <= timesMinutes[0]) {
      return values[0];
    }
    if (targetMinutes >= timesMinutes[timesMinutes.length - 1]) {
      return values[values.length - 1];
    }

    // 5. Recherche de l'intervalle pour l'interpolation
    let i = 0;
    while (i < timesMinutes.length - 1 && timesMinutes[i + 1] <= targetMinutes) {
      i += 1;
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

    // Cas particulier de la pression (Interpolation logarithmique)
    if (fieldName === 'pressureMeanSeaLevel') {
      const logV0 = Math.log(Math.max(v0, 1e-6));
      const logV1 = Math.log(Math.max(v1, 1e-6));
      const logInterpolated = logV0 + fraction * (logV1 - logV0);
      return Math.exp(logInterpolated);
    }

    // Interpolation d'Hermite (bénéficie maintenant d'une pente de départ ultra-précise)
    const slope0 = (v1 - vPrev) / (tDelta + (timesMinutes[i] - timesMinutes[i - 1] || tDelta));
    const slope1 = (vNext - v0) / (tDelta + (timesMinutes[i + 2] - t1 || tDelta));
    const h00 = 2 * fraction * fraction * fraction - 3 * fraction * fraction + 1;
    const h10 = fraction * fraction * fraction - 2 * fraction * fraction + fraction;
    const h01 = -2 * fraction * fraction * fraction + 3 * fraction * fraction;
    const h11 = fraction * fraction * fraction - fraction * fraction;

    return h00 * v0 + h10 * (tDelta * slope0) + h01 * v1 + h11 * (tDelta * slope1);
  }


export function usesCurrentConditionsForTime(rawData, targetLocalTimeString) {
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
  }

export function calculatePressureDrift(hTheoreticalCal, hTheoreticalCurrent) {
    return hTheoreticalCurrent - hTheoreticalCal;
  }

export function calculateThermalDrift(tempWeatherCal, tempWeatherCurrent, hTheoreticalCal, hTheoreticalCurrent) {
    const isaTempCal = 15 - 0.0065 * hTheoreticalCal;
    const isaTempCurrent = 15 - 0.0065 * hTheoreticalCurrent;
    const tempBiasCal = tempWeatherCal - isaTempCal;
    const tempBiasCurrent = tempWeatherCurrent - isaTempCurrent;
    return 0.5 * ((tempBiasCurrent - tempBiasCal) * (hTheoreticalCurrent / 288.15));
  }

export function calculateHumidityDrift(humidityCal, humidityCurrent, hTheoreticalCurrent) {
    const humidityTermCal = (humidityCal - 50) * 0.01;
    const humidityTermCurrent = (humidityCurrent - 50) * 0.01;
    return 0.25 * (humidityTermCurrent - humidityTermCal) * (hTheoreticalCurrent / 1000);
  }

