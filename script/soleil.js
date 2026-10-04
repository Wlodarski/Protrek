/**
 * ============================================================================
 * CONSTANTES & UTILS
 * ============================================================================
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI; 

function addDays(date, days) {
    const res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
}

/**
 * Formate un timestamp Unix en chaîne de caractères heure:minute local.
 */
function formatTime(timestampMs) {
     if (!timestampMs || isNaN(timestampMs)) return "Inconnue";
     const date = new Date(timestampMs); 
     return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}


/**
 * ============================================================================
 * CORE LOGIC : CALCUL ASTRONOMIQUE DE LEVER/COUCHER
 * ============================================================================
 */
function calculateEventTime(lat, lon, date, isSunset = false) {
    const latRad = lat * DEG_TO_RAD;
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Déclinaison solaire précise (en radians)
    const declinationRad = 23.45 * DEG_TO_RAD * Math.sin((2 * Math.PI / 365) * (284 + dayOfYear));
    const altRad = -0.833 * DEG_TO_RAD; 

    // Formule exacte de l'angle horaire cos(H)
    const cosH = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(declinationRad)) / 
                  (Math.cos(latRad) * Math.cos(declinationRad));

    // Gestion du jour/nuit polaire
    if (Math.abs(cosH) > 1) {
        console.warn(`[Calcul Solaire] Aucun franchissement d'horizon pour la latitude ${lat} le jour ${dayOfYear} (cosH = ${cosH}).`);
        return null; 
    }

    const H = Math.acos(cosH); 
    const timeOffsetHours = (H * RAD_TO_DEG) / 15; 

    // Calcul du Midi Solaire Vrai en tenant compte de la longitude
    let solarNoon = new Date(date);
    solarNoon.setUTCHours(12, 0, 0, 0); 

    const longitudeOffsetHours = lon / 15; 
    const solarNoonUTC = solarNoon.getTime() - (longitudeOffsetHours * 3600000);

    let eventTimeUTC;
    if (isSunset) {
        eventTimeUTC = solarNoonUTC + (timeOffsetHours * 3600000);
    } else {
        eventTimeUTC = solarNoonUTC - (timeOffsetHours * 3600000);
    }

    return eventTimeUTC;
}


/**
 * ============================================================================
 * LOGIQUE PRINCIPALE : DÉTERMINATION DES ÉVÉNEMENTS PERTINENTS
 * ============================================================================
 */
function determineRelevantSunEventsFromStorage() {
    const STORAGE_KEY = "protrek.user.location";
    const rawData = localStorage.getItem(STORAGE_KEY);

    if (!rawData) {
        console.warn(`[LocalStorage] Impossible de lire la clé "${STORAGE_KEY}". L'historique ou les données de position sont absents.`);
        return { status: "Erreur : LocalStorage non trouvé", result: { sunrise: null, sunset: null } };
    }

    let location;
    try {
        location = JSON.parse(rawData); 
        if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
             throw new Error("Latitude ou longitude manquante ou invalide.");
        }
    } catch (e) {
        console.warn(`[Data Corruption] Problème lors du parsing des coordonnées géographiques : ${e.message}`);
        return { status: `Erreur de lecture des données : ${e.message}`, result: { sunrise: null, sunset: null } };
    }

    const { latitude, longitude } = location;
    const currentTime = new Date();
    const currentMs = currentTime.getTime();

    // --- Calculs des points clés ---
    const todayLocal = new Date(currentTime);
    const sunriseTodayMs = calculateEventTime(latitude, longitude, todayLocal, false);
    const todaySunsetMs = calculateEventTime(latitude, longitude, todayLocal, true);

    const tomorrowLocal = addDays(todayLocal, 1);
    const sunriseTomorrowMs = calculateEventTime(latitude, longitude, tomorrowLocal, false);

    const yesterdayLocal = addDays(todayLocal, -1);
    const sunsetYesterdayMs = calculateEventTime(latitude, longitude, yesterdayLocal, true);

    // --- Détermination du scénario actuel ---
    let result = { sunrise: null, sunset: null };
    let statusMessage = "Le calcul solaire est impossible pour cette latitude/longitude (nuit polaire ou jour polaire).";

    if (sunriseTodayMs && todaySunsetMs) {
        
        // Cas 1 : Avant le lever de ce matin (< SR_T)
        if (currentMs < sunriseTodayMs) {
            result.sunrise = formatTime(sunriseTodayMs);
            result.sunset = formatTime(todaySunsetMs);
            statusMessage = "Avant l'aube : Le soleil va se lever et se coucher ce jour.";
        } 
        // Cas 2 : Entre le lever et le coucher (SR_T <= Current < SS_T)
        else if (currentMs >= sunriseTodayMs && currentMs < todaySunsetMs) {
            result.sunrise = formatTime(sunriseTodayMs);
            result.sunset = formatTime(todaySunsetMs);
            statusMessage = "En pleine journée : Le soleil est actuellement visible.";
        } 
        // Cas 3 : Après le coucher (Current >= SS_T)
        else if (currentMs >= todaySunsetMs) {
            result.sunrise = sunriseTomorrowMs ? formatTime(sunriseTomorrowMs) : null; 
            result.sunset = sunsetYesterdayMs ? formatTime(sunsetYesterdayMs) : null;   
            statusMessage = "Après le crépuscule : Coucher passé, voici l'heure du prochain lever.";
        }
    } else {
        console.warn(`[Zone Polaire] Les coordonnées intégrées (Lat: ${latitude}, Lon: ${longitude}) se situent actuellement dans une zone de jour ou nuit polaire continue.`);
    }

    return { result, status: statusMessage };
}


// ============================================================================
// EXPORTATION OPTIMISÉE POUR LE CANVAS (Avec mise en cache journalière)
// ============================================================================

// Variables de cache internes
let cachedAngles = null;
let lastCalculatedDay = null; // Stocke la chaîne de caractères du jour (ex: "2026-10-04")

function getSunEventAngles(currentDate) {
    const currentDayStr = currentDate.getFullYear() + "-" + currentDate.getMonth() + "-" + currentDate.getDate();

    // Si les angles ont déjà été calculés pour AUJOURD'HUI, on retourne directement le cache
    if (cachedAngles !== null && lastCalculatedDay === currentDayStr) {
        return cachedAngles;
    }

    // Sinon (changement de jour ou premier démarrage), on effectue le calcul lourd une seule fois
    const STORAGE_KEY = "protrek.user.location";
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return null;

    try {
        const location = JSON.parse(rawData);
        if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') return null;

        const sunriseMs = calculateEventTime(location.latitude, location.longitude, currentDate, false);
        const sunsetMs = calculateEventTime(location.latitude, location.longitude, currentDate, true);

        if (!sunriseMs || !sunsetMs) return null;

        const sunriseDate = new Date(sunriseMs);
        const sunsetDate = new Date(sunsetMs);

        const sunriseHours = sunriseDate.getHours() + sunriseDate.getMinutes() / 60 + sunriseDate.getSeconds() / 3600;
        const sunsetHours = sunsetDate.getHours() + sunsetDate.getMinutes() / 60 + sunsetDate.getSeconds() / 3600;

        const sunriseAngleRad = ((sunriseHours * 15) + 180) * Math.PI / 180;
        const sunsetAngleRad = ((sunsetHours * 15) + 180) * Math.PI / 180;

        // Mise à jour du cache mondial
        cachedAngles = { sunriseAngleRad, sunsetAngleRad };
        lastCalculatedDay = currentDayStr;

        return cachedAngles;
    } catch (e) {
        console.warn(`[Calcul Solaire Interface] Erreur lors de l'extraction des angles : ${e.message}`);
        return null;
    }
}

// Rendre la fonction accessible globalement
window.getSunEventAngles = getSunEventAngles;
