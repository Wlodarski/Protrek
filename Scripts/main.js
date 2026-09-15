/**
 * @file Orchestrateur du système de correction d'altitude (Main Entry Point). 
 * Calcule l'altitude réelle en compensant la dérive barométrique météo d'une Pro Trek.
 */

const fs = require('fs').promises;
const path = require('path');
const { calculateAltitudeFromPressure } = require('./isa_calculator');
const { fetchCombinedForecast, hasCoverageForTime, usesCurrentConditionsForTime, getPressureAtTime, getTemperatureAtTime, getRelativeHumidityAtTime } = require('./weather_service');

// --- PARAMÈTRES DE L'APPLICATION ---
const FORECAST_FILENAME = 'protrek_forecast.json';

/**
 * Télécharge et sauvegarde les prévisions locales en mode connecté.
 */
async function downloadAndSaveForecast() {
    console.log("\n=============================================");
    console.log("🚀 TENTATIVE DE TÉLÉCHARGEMENT (ONLINE)");
    try {
        const rawData = await fetchCombinedForecast();
        const absolutePath = path.join(__dirname, FORECAST_FILENAME);
        await fs.writeFile(absolutePath, JSON.stringify(rawData));
        console.log(`✅ Données météo rafraîchies et sauvegardées localement.`);
        return true;
    } catch (err) {
        console.error(`⚠️ Échec du téléchargement en ligne : ${err.message}`);
        return false;
    }
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

/**
 * Calcule l'altitude réelle corrigée en fonction des données de la ProTrek.
 * @param {string} targetTimeStr - Date/Heure actuelle au format ISO local
 * @param {string} calTimeStr - Date/Heure de calibration au format ISO local
 * @param {number} calAltitude - Altitude réelle connue lors de la calibration (mètres)
 * @param {number} protrekCurrentAlt - L'altitude affichée présentement par la Pro Trek (mètres)
 */
async function calculateCorrection(targetTimeStr, calTimeStr, calAltitude, protrekCurrentAlt) {
    console.log("\n=============================================");
    console.log("🚶 DÉMARRAGE DU CALCUL DE CORRECTION (OFFLINE)");

    const forecastPath = path.join(__dirname, FORECAST_FILENAME);

    let rawData;
    try {
        const localData = await fs.readFile(forecastPath, 'utf8');
        rawData = JSON.parse(localData);
        console.log("✅ Fichier de prévision chargé depuis :", forecastPath);
    } catch (err) {
        console.error("\n❌ Erreur : Aucun fichier protrek_forecast.json trouvé.");
        return null;
    }

    const pWeatherCal = await getPressureAtTime(rawData, calTimeStr);
    const pWeatherCurrent = await getPressureAtTime(rawData, targetTimeStr);
    const tempWeatherCal = await getTemperatureAtTime(rawData, calTimeStr);
    const tempWeatherCurrent = await getTemperatureAtTime(rawData, targetTimeStr);
    const humidityCal = await getRelativeHumidityAtTime(rawData, calTimeStr);
    const humidityCurrent = await getRelativeHumidityAtTime(rawData, targetTimeStr);

    if (usesCurrentConditionsForTime(rawData, calTimeStr)) {
        console.log("ℹ️ Données actuelles utilisées : la calibration est avant la première prévision disponible.");
    }

    if (pWeatherCal === null || pWeatherCurrent === null || tempWeatherCal === null || tempWeatherCurrent === null || humidityCal === null || humidityCurrent === null) {
        console.error(`❌ Données météo introuvables pour les plages horaires fournies.`);
        return null;
    }

    const hTheoreticalCal = calculateAltitudeFromPressure(pWeatherCal);
    const hTheoreticalCurrent = calculateAltitudeFromPressure(pWeatherCurrent);
    const weatherDrift = calculatePressureDrift(hTheoreticalCal, hTheoreticalCurrent);
    const thermalDrift = calculateThermalDrift(tempWeatherCal, tempWeatherCurrent, hTheoreticalCal, hTheoreticalCurrent);
    const humidityDrift = calculateHumidityDrift(humidityCal, humidityCurrent, hTheoreticalCurrent);

    const trueAltitude = protrekCurrentAlt - weatherDrift + thermalDrift + humidityDrift;

    console.log("\n=============================================");
    console.log("📊 ANALYSE DE LA DÉRIVE BAROMÉTRIQUE, THERMIQUE ET HYGROMÉTRIQUE :");
    console.log(`⏱️ ${calAltitude}m @ ${calTimeStr} → ${protrekCurrentAlt}m @ ${targetTimeStr} `);
    console.log(`⏱️ Pression météo au moment de la calibration : ${pWeatherCal.toFixed(2)} hPa`);
    console.log(`⏱️ Pression météo actuelle                    : ${pWeatherCurrent.toFixed(2)} hPa`);
    console.log(`🌡️ Température météo au moment de la calibration : ${tempWeatherCal.toFixed(1)} °C`);
    console.log(`🌡️ Température météo actuelle                    : ${tempWeatherCurrent.toFixed(1)} °C`);
    console.log(`💧 Humidité relative au moment de la calibration : ${humidityCal.toFixed(0)} %`);
    console.log(`💧 Humidité relative actuelle                    : ${humidityCurrent.toFixed(0)} %`);
    console.log(`⚠️ Impact météo sur l'altimètre               : ${weatherDrift > 0 ? '+' : ''}${Math.round(weatherDrift)} mètres`);
    console.log(`🌤️ Correction thermique approx.              : ${thermalDrift > 0 ? '+' : ''}${thermalDrift.toFixed(1)} mètres`);
    console.log(`🌫️ Correction hygrométrique approx.          : ${humidityDrift > 0 ? '+' : ''}${humidityDrift.toFixed(1)} mètres`);
    console.log("\n=============================================");
    console.log("🏁 RÉSULTAT DU SCRIPT :");
    console.log(`⌚ Affichage actuel Pro Trek : ${protrekCurrentAlt} m`);
    console.log(`✅ Altitude réelle estimée   : ${Math.round(trueAltitude)} mètres.`);

    return {
        trueAltitude: Math.round(trueAltitude),
        weatherDrift: weatherDrift,
        thermalDrift: thermalDrift,
        humidityDrift: humidityDrift
    };
}

/**
 * Point d'entrée principal de l'application
 */
async function main() {
    const maintenant = new Date();

    // Formatage strict en ISO Local (AAAA-MM-JJTHH:MM:SS) pour contourner les fuseaux horaires machine
    const pad = (n) => n.toString().padStart(2, '0');
    const dateDuJourStr = `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;

    const targetTimeISO = `${dateDuJourStr}T${pad(maintenant.getHours())}:${pad(maintenant.getMinutes())}:${pad(maintenant.getSeconds())}`;

    // =====================================================================
    // ✍️ CONFIGURATION DE VOTRE RANDONNÉE / CALIBRATION ICI
    // =====================================================================

    // Entrez simplement l'heure locale de calibration (Exemple : 22h10 pour correspondre aux données du fichier)
    const heureCalibrationSimple = "9:04";

    const calAltitude = 32;        // Altitude réelle au point de départ (mètres)
    const protrekCurrentAlt = -21;  // Ce que la Pro Trek affiche en ce moment (mètres)

    // =====================================================================

    // Construction automatique de la chaîne ISO locale pour la calibration
    const [heures, minutes] = heureCalibrationSimple.split(':').map(Number);
    const dateCalibration = new Date(maintenant.getTime());
    dateCalibration.setHours(heures, minutes, 0, 0);

    // Sécurité : Si l'heure entrée est supérieure à l'heure actuelle, le relevé date d'hier
    if (dateCalibration > maintenant) {
        dateCalibration.setDate(dateCalibration.getDate() - 1);
    }

    const calTimeISO = `${dateCalibration.getFullYear()}-${pad(dateCalibration.getMonth() + 1)}-${pad(dateCalibration.getDate())}T${pad(heures)}:${pad(minutes)}:00`;

    // Vérification locale : si le fichier manque ou ne couvre pas l'heure de calibration, on le rafraîchit.
    let data_exists = false;
    let localData = null;
    try {
        const raw = await fs.readFile(path.join(__dirname, FORECAST_FILENAME), 'utf8');
        localData = JSON.parse(raw);
        data_exists = !!localData;
    } catch (error) {
        data_exists = false;
    }

    if (!data_exists || !hasCoverageForTime(localData, calTimeISO)) {
        const success = await downloadAndSaveForecast();
        if (success) {
            try {
                const refreshed = await fs.readFile(path.join(__dirname, FORECAST_FILENAME), 'utf8');
                localData = JSON.parse(refreshed);
                data_exists = !!localData;
            } catch (error) {
                data_exists = false;
            }
        }
    }

    // Lancement de l'analyse barométrique
    if (data_exists) {
        await calculateCorrection(targetTimeISO, calTimeISO, calAltitude, protrekCurrentAlt);
    } else {
        console.error("\n!!! Impossible d'exécuter le script : Aucune donnée météo disponible !!!");
    }
}

// Lancement sécurisé du programme global
main().catch(err => console.error("FATAL ERROR dans l'exécution principale:", err));
