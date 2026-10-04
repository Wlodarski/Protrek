/**
 * ============================================================================
 * CONSTANTES & UTILS
 * ============================================================================
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Ajoute un nombre de jours à une date donnée.
 * @param {Date} date - La date d'origine.
 * @param {number} days - Le nombre de jours à ajouter (ou soustraire).
 * @returns {Date} Une nouvelle instance de Date ajustée.
 */
function addDays(date, days) {
    const res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
}

/**
 * Formate un timestamp Unix en chaîne de caractères heure:minute locale.
 * @param {number} timestampMs - Le timestamp en millisecondes.
 * @returns {string} L'heure formatée au format HH:MM ou "Inconnue".
 */
function formatTime(timestampMs) {
    if (!timestampMs || isNaN(timestampMs)) return "Inconnue";
    const date = new Date(timestampMs);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}


/**
 * ============================================================================
 * CORE LOGIC : CALCUL ASTRONOMIQUE DE LEVER/COUCHER (ALGORITHME NOAA STRICT)
 * ============================================================================
 */
function calculateEventTime(lat, lon, date, isSunset = false) {
    const latRad = lat * DEG_TO_RAD;
    
    // 1. CALCUL DU SIÈCLE JULIEN (Époque J2000.0)
    // On convertit le temps Unix de la machine en Date Julienne astronomique.
    // 2440587.5 correspond au point de départ de l'époque Unix (1er janvier 1970).
    const julianDate = (date.getTime() / 86400000) + 2440587.5;
    // t représente le nombre de siècles juliens (36525 jours) écoulés depuis le repère J2000.0 (1er janvier 2000 à 12h00 UT).
    const t = (julianDate - 2451545.0) / 36525.0;

    // 2. GÉOMÉTRIE ORBITALE DU SOLEIL (Modèle NOAA)
    // Longitude moyenne du soleil (position théorique sur une orbite circulaire parfaite)
    let geoMeanLongSun = (280.46646 + t * 36000.76983) % 360;
    if (geoMeanLongSun < 0) geoMeanLongSun += 360;

    // Anomalie moyenne du soleil (angle mesurant la distance par rapport au point le plus proche de son orbite elliptique)
    let geoMeanAnomSun = (357.52911 + t * 35999.05029) % 360;
    if (geoMeanAnomSun < 0) geoMeanAnomSun += 360;
    const geoMeanAnomSunRad = geoMeanAnomSun * DEG_TO_RAD;

    // Équation du centre du soleil (correction géométrique pour passer de l'orbite circulaire à l'orbite elliptique réelle)
    const sunEqCenter = Math.sin(geoMeanAnomSunRad) * (1.914602 - t * 0.004817) + 
                        Math.sin(2 * geoMeanAnomSunRad) * (0.019993 - t * 0.000101) + 
                        Math.sin(3 * geoMeanAnomSunRad) * 0.000289;
    
    // Longitude vraie du soleil (sa position angulaire réelle sur l'écliptique)
    const sunTrueLong = geoMeanLongSun + sunEqCenter;
    
    // Obliquité moyenne et corrigée de l'écliptique (inclinaison naturelle de l'axe de rotation de la Terre)
    const meanObliqEcliptic = 23.439291 - t * (46.815 / 3600);
    const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos((125.04 - 1934.136 * t) * DEG_TO_RAD);
    const obliqCorrRad = obliqCorr * DEG_TO_RAD;

    // 3. DÉCLINAISON SOLAIRE EXACTE
    // Hauteur angulaire du soleil par rapport au plan de l'équateur terrestre (détermine les saisons).
    const sunTrueLongRad = sunTrueLong * DEG_TO_RAD;
    const declinationRad = Math.asin(Math.sin(obliqCorrRad) * Math.sin(sunTrueLongRad));

    // 4. CALCUL DE L'ÉQUATION DU TEMPS (En minutes)
    // Corrige l'écart quotidien entre l'heure de nos montres (temps uniforme) et le soleil (temps solaire vrai).
    const varY = Math.pow(Math.tan(obliqCorrRad / 2), 2);
    const geoMeanLongSunRad = geoMeanLongSun * DEG_TO_RAD;
    
    const equationOfTimeMinutes = 4 * RAD_TO_DEG * (
        varY * Math.sin(2 * geoMeanLongSunRad) - 
        2 * 0.016708 * Math.sin(geoMeanAnomSunRad) + 
        4 * 0.016708 * varY * Math.sin(geoMeanAnomSunRad) * Math.cos(2 * geoMeanLongSunRad) - 
        0.5 * Math.pow(varY, 2) * Math.sin(4 * geoMeanLongSunRad) - 
        1.25 * Math.pow(0.016708, 2) * Math.sin(2 * geoMeanAnomSunRad)
    );

    // 5. CALCUL DE L'ANGLE HORAIRE UNIVERSEL cos(H)
    // Angle d'horizon aéronautique standard de -0.833° (prend en compte la réfraction de l'air et le rayon du disque solaire).
    const altRad = -0.833 * DEG_TO_RAD;
    const cosH = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(declinationRad)) / 
                  (Math.cos(latRad) * Math.cos(declinationRad));

    // Si |cosH| > 1, le soleil ne franchit jamais l'horizon (phénomène de jour ou nuit polaire continue).
    if (Math.abs(cosH) > 1) {
        return null; 
    }

    // Angle horaire converti en minutes de temps (la Terre tourne de 1° toutes les 4 minutes).
    const H_minutes = Math.acos(cosH) * RAD_TO_DEG * 4; 

    // 6. CALCUL DU MIDI SOLAIRE EN HEURE LOCALE
    // 720 minutes = 12h00. On soustrait (4 * lon) car à l'Ouest de Greenwich (longitude négative en JS), 
    // le soleil passe plus tard. On ajoute le décalage politique (timezoneOffsetMinutes) de la machine.
    const timezoneOffsetMinutes = -date.getTimezoneOffset();
    const localNoonMinutes = 720 - (4 * lon) - equationOfTimeMinutes + timezoneOffsetMinutes;

    // 7. CALAGE DE L'ÉVÉNEMENT (Avant ou après midi)
    // Pour le coucher, on ajoute l'angle horaire à midi; pour le lever, on le soustrait.
    const eventOffsetMinutes = isSunset ? (localNoonMinutes + H_minutes) : (localNoonMinutes - H_minutes);

    // 8. CRÉATION DU TIMESTAMP LOCAL STRICT
    const resultDate = new Date(date);
    resultDate.setHours(0, 0, 0, 0); // On se positionne à minuit local
    
    // On ajoute le décalage calculé en millisecondes pour obtenir le timestamp exact de l'événement
    return resultDate.getTime() + (eventOffsetMinutes * 60000);
}


// ============================================================================
// EXPORTATION OPTIMISÉE POUR LE CANVAS (Avec mise en cache journalière)
// ============================================================================

// Variables persistantes servant de mémoire tampon (évite de saturer le processeur à 60 fps)
let cachedAngles = null;
let lastCalculatedDay = null; 

/**
 * Calcule et extrait la position angulaire en radians pour le lever et le coucher.
 * Intègre un système de cache pour ne s'exécuter qu'une seule fois par jour.
 * @param {Date} currentDate - La date actuelle fournie par la boucle de rendu de l'horloge.
 * @returns {Object|null} Un objet contenant les deux angles { sunriseAngleRad, sunsetAngleRad } ou null.
 */
function getSunEventAngles(currentDate) {
    // Identifiant unique du jour (format court "AAAA-MM-JJ")
    const currentDayStr = currentDate.getFullYear() + "-" + currentDate.getMonth() + "-" + currentDate.getDate();

    // SÉCURITÉ DE PERFORMANCE : Si le jour n'a pas changé, on renvoie immédiatement les angles en mémoire
    if (cachedAngles !== null && lastCalculatedDay === currentDayStr) {
        return cachedAngles;
    }

    const STORAGE_KEY = "protrek.user.location";
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return null;

    try {
        const location = JSON.parse(rawData);
        if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') return null;

        // Arrondi à une seule décimale (Précision physique d'un écran de montre Casio Pro Trek)
        const proTrekLat = parseFloat(location.latitude.toFixed(1));
        const proTrekLon = parseFloat(location.longitude.toFixed(1));

        // Calcul astronomique des timestamps locaux
        const sunriseMs = calculateEventTime(proTrekLat, proTrekLon, currentDate, false);
        const sunsetMs = calculateEventTime(proTrekLat, proTrekLon, currentDate, true);

        if (!sunriseMs || !sunsetMs) return null;

        const sunriseDate = new Date(sunriseMs);
        const sunsetDate = new Date(sunsetMs);

        // Conversion des heures, minutes et secondes des événements en heures décimales (ex: 6h30 -> 6.5)
        const sunriseHours = sunriseDate.getHours() + sunriseDate.getMinutes() / 60 + sunriseDate.getSeconds() / 3600;
        const sunsetHours = sunsetDate.getHours() + sunsetDate.getMinutes() / 60 + sunsetDate.getSeconds() / 3600;

        // Traduction en angles pour un cadran 24 heures (360° / 24h = 15° par heure).
        // On ajoute 180° car la structure de votre cadran positionne le 12 en haut et le 24 en bas.
        const sunriseAngleRad = ((sunriseHours * 15) + 180) * Math.PI / 180;
        const sunsetAngleRad = ((sunsetHours * 15) + 180) * Math.PI / 180;

        // Sauvegarde dans le cache global pour le reste de la journée
        cachedAngles = { sunriseAngleRad, sunsetAngleRad };
        lastCalculatedDay = currentDayStr;

        return cachedAngles;
    } catch (e) {
        console.warn(`[Calcul Solaire Interface] Erreur lors de l'extraction des angles : ${e.message}`);
        return null;
    }
}

// Liaison de la fonction d'export à l'objet global window pour qu'elle soit lue par horloge.js
window.getSunEventAngles = getSunEventAngles;
