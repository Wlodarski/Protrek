(function createCalculationApi(global) {
  function calculateAltitudeFromPressure(pressure_hpa) {
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

  function getValueAtTime(rawData, targetLocalTimeString, fieldName) {
    if (!rawData || !Array.isArray(rawData.validTimeLocal) || !Array.isArray(rawData[fieldName])) {
      return null;
    }

    const localTimes = rawData.validTimeLocal;
    const values = rawData[fieldName];
    const currentFieldValue = rawData.current && rawData.current[fieldName] !== undefined
      ? rawData.current[fieldName]
      : null;
    const targetMinutes = parseLocalToMinutes(targetLocalTimeString);
    const timesMinutes = localTimes.map((timeStr) => parseLocalToMinutes(timeStr));

    if (targetMinutes <= timesMinutes[0]) {
      return currentFieldValue !== null ? currentFieldValue : values[0];
    }
    if (targetMinutes >= timesMinutes[timesMinutes.length - 1]) return values[values.length - 1];

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

    if (fieldName === 'pressureMeanSeaLevel') {
      const logV0 = Math.log(Math.max(v0, 1e-6));
      const logV1 = Math.log(Math.max(v1, 1e-6));
      const logInterpolated = logV0 + fraction * (logV1 - logV0);
      return Math.exp(logInterpolated);
    }

    const slope0 = (v1 - vPrev) / (tDelta + (timesMinutes[i] - timesMinutes[i - 1] || tDelta));
    const slope1 = (vNext - v0) / (tDelta + (timesMinutes[i + 2] - t1 || tDelta));
    const h00 = 2 * fraction * fraction * fraction - 3 * fraction * fraction + 1;
    const h10 = fraction * fraction * fraction - 2 * fraction * fraction + fraction;
    const h01 = -2 * fraction * fraction * fraction + 3 * fraction * fraction;
    const h11 = fraction * fraction * fraction - fraction * fraction;

    return h00 * v0 + h10 * (tDelta * slope0) + h01 * v1 + h11 * (tDelta * slope1);
  }

  function usesCurrentConditionsForTime(rawData, targetLocalTimeString) {
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

  function calculatePressureDrift(hTheoreticalCal, hTheoreticalCurrent) {
    return hTheoreticalCurrent - hTheoreticalCal;
  }

  function calculateThermalDrift(tempWeatherCal, tempWeatherCurrent, hTheoreticalCal, hTheoreticalCurrent) {
    const isaTempCal = 15 - 0.0065 * hTheoreticalCal;
    const isaTempCurrent = 15 - 0.0065 * hTheoreticalCurrent;
    const tempBiasCal = tempWeatherCal - isaTempCal;
    const tempBiasCurrent = tempWeatherCurrent - isaTempCurrent;
    return 0.5 * ((tempBiasCurrent - tempBiasCal) * (hTheoreticalCurrent / 288.15));
  }

  function calculateHumidityDrift(humidityCal, humidityCurrent, hTheoreticalCurrent) {
    const humidityTermCal = (humidityCal - 50) * 0.01;
    const humidityTermCurrent = (humidityCurrent - 50) * 0.01;
    return 0.25 * (humidityTermCurrent - humidityTermCal) * (hTheoreticalCurrent / 1000);
  }

  global.ProtrekCalculation = {
    calculateAltitudeFromPressure,
    getValueAtTime,
    usesCurrentConditionsForTime,
    calculatePressureDrift,
    calculateThermalDrift,
    calculateHumidityDrift
  };
}(window));
