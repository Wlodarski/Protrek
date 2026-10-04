// =========================================================================
// 1. INITIALISATION ET CONFIGURATION DU CANVAS
// =========================================================================

const canvas = document.getElementById("canvas");
if (!canvas) {
    console.error("Canvas non trouvé ! Le script ne peut pas fonctionner.");
    throw new Error("Canvas non trouvé !");
}

const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error("Le contexte 2D du Canvas n'a pas pu être récupéré.");
}

// Variables géométriques globales (calculées dynamiquement lors du redimensionnement)
let size = 300;       // Dimension (largeur/hauteur) du canvas carré
let centerX = 150;    // Coordonnée X du centre de l'horloge
let centerY = 150;    // Coordonnée Y du centre de l'horloge
let r = 147;          // Rayon maximal du cadran extérieur

// Configuration des aiguilles (facteurs proportionnels à la taille de l'écran)
const HANDS = {
    minute: { lenFactor: 0.31, color: '#fff', widthFactor: 0.02 }, // S'arrête pile à la piste interne
    hour: { lenFactor: 0.23, color: '#fff', widthFactor: 0.04 },       // Navigue dans la zone centrale
    second: { lenFactor: 0.33, color: '#38bdf8', widthFactor: 0.01 }  // Frôle délicatement la piste interne
};

/**
 * Ajuste dynamiquement la taille du canvas et recalcule les repères géométriques
 * pour s'adapter parfaitement à la taille de la fenêtre du navigateur.
 */
function resizeCanvas() {
    // Prend la plus petite dimension (hauteur ou largeur) pour garantir un cercle parfait
    size = Math.min(window.innerWidth, window.innerHeight) * 0.85; // Occupe 85% de l'espace disponible

    canvas.width = size;
    canvas.height = size;

    centerX = size / 2;
    centerY = size / 2;
    r = (size / 2) - 3; // Rayon proportionnel avec une marge de sécurité de 3px
}

/**
 * Convertit un angle exprimé en degrés en radians.
 * utile pour les fonctions Trigonométriques natives de JavaScript (Math.cos / Math.sin).
 */
function radians(deg) {
    return deg * Math.PI / 180;
}

// =========================================================================
// 2. FONCTIONS DE DESSIN ET DE RENDU
// =========================================================================

/**
 * Dessine une aiguille ou un segment rectiligne mobile à partir du centre.
 * Inclut une gestion d'ombre portée proportionnelle à la taille globale.
 */
function drawHand(angleRad, len, color, width) {
    // Canvas commence son origine 0 à droite (3h). On soustrait PI/2 (90°) pour aligner le 0 en haut (Midi).
    const finalAngle = angleRad - Math.PI / 2;

    // Calcul des coordonnées du point d'arrivée (trigonométrie standard)
    const xEnd = centerX + Math.cos(finalAngle) * len;
    const yEnd = centerY + Math.sin(finalAngle) * len;

    ctx.save(); // Isole le contexte pour appliquer l'ombre sans affecter le reste
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.013;              // Flou d'ombre dynamique
    ctx.shadowOffsetX = size * 0.01;            // Décalage horizontal (simulation lumière haut-gauche)
    ctx.shadowOffsetY = size * 0.01;            // Décalage vertical

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(xEnd, yEnd);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round"; // Extrémités arrondies pour un aspect plus fini
    ctx.stroke();
    ctx.restore(); // Restaure le contexte initial
}

/**
 * Génère l'effet optique de surface vitrée (verre saphir/acrylique bombé).
 * Superpose un reflet linéaire oblique et un assombrissement radial périphérique.
 */
function drawGlass() {
    // --- 1. REFLET LUMINEUX EN DIAGONALE (Effet de brillance) ---
    const glassGrad = ctx.createLinearGradient(size * 0.13, size * 0.13, size * 0.86, size * 0.86);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)'); // Point chaud lumineux
    glassGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.02)');
    glassGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');         // Zone neutre transparente
    glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');       // Zone d'ombre inférieure

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.fillStyle = glassGrad;
    ctx.fill();
    ctx.restore();

    // --- 2. OMBRE DE BORDURE (Épaisseur et biseau du verre) ---
    const edgeGrad = ctx.createRadialGradient(centerX, centerY, r - (size * 0.05), centerX, centerY, r);
    edgeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edgeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)'); // Ombre sur le contour intérieur

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.fillStyle = edgeGrad;
    ctx.fill();
    ctx.restore();
}

/**
 * Dessine l'arrière-plan du cadran complet :
 * - Le cercle de bordure extérieur
 * - Les 48 index extérieurs des heures/demi-heures
 * - La liste des chiffres 24h (01 à 23, le 24 est omis)
 * - La piste des minutes interne (60 graduations uniformes)
 */
function drawDial() {
    // Grand cercle extérieur de délimitation
    ctx.beginPath();
    ctx.arc(centerX, centerY, r - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = size * 0.013;
    ctx.stroke();

    // --- 1. COURONNE DES 48 INDEX BLANCS EXTÉRIEURS (Heures pleines et demies) ---
    ctx.save();
    for (let g = 0; g < 48; g++) {
        const angleRad = radians(g * 7.5) - Math.PI / 2; // 360° / 48 index = pas de 7.5°
        const xStart = centerX + Math.cos(angleRad) * (r - (size * 0.023));
        const yStart = centerY + Math.sin(angleRad) * (r - (size * 0.023));
        const xEnd = centerX + Math.cos(angleRad) * (r - 2);
        const yEnd = centerY + Math.sin(angleRad) * (r - 2);

        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1, size * 0.003);
        ctx.stroke();
    }
    ctx.restore();

    // --- 2. TEXTE DES CHIFFRES DE L'HORLOGE (Format 24h mat teinté Super-LumiNova) ---
    ctx.save();
    ctx.fillStyle = '#e1f7d5'; // Couleur jaune-vert pastel
    ctx.font = `bold ${Math.round(size * 0.068)}px sans-serif`; // Typographie proportionnelle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 1; i <= 24; i++) {
        // Rotation de +180° pour inverser le cadran : place le 12 en haut et le 24/date en bas
        const angleRad = radians((i * 15) + 180) - Math.PI / 2; // 360° / 24 heures = pas de 15°
        const xText = centerX + Math.cos(angleRad) * (r - (size * 0.07));
        const yText = centerY + Math.sin(angleRad) * (r - (size * 0.07));

        if (i !== 24) { // On masque textuellement le 24 pour laisser le champ libre aux guichets
            ctx.fillText(String(i).padStart(2, '0'), xText, yText);
        }
    }
    ctx.restore();

    // --- 3. PISTE DES MINUTES INTERNE (60 index fins réguliers) ---
    const rMinutes = r - (size * 0.14);
    ctx.beginPath();
    ctx.arc(centerX, centerY, rMinutes, 0, Math.PI * 2);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let s = 0; s < 60; s++) {
        const angleRad = radians(s * 6) - Math.PI / 2; // 360° / 60 divisions = pas de 6°
        const isCardinalMinute = (s % 5 === 0);        // Marque un repère plus fort toutes les 5 minutes

        const longueurTrait = isCardinalMinute ? (size * 0.026) : (size * 0.013);
        const couleurTrait = '#fff'; 
        const epaisseurTrait = isCardinalMinute ? Math.max(2, size * 0.006) : 1;

        const xStart = centerX + Math.cos(angleRad) * rMinutes;
        const yStart = centerY + Math.sin(angleRad) * rMinutes;
        const xEnd = centerX + Math.cos(angleRad) * (rMinutes - longueurTrait);
        const yEnd = centerY + Math.sin(angleRad) * (rMinutes - longueurTrait);

        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.strokeStyle = couleurTrait;
        ctx.lineWidth = epaisseurTrait;
        ctx.stroke();
    }
}

// Affichage de la date : Retour à la configuration et aux proportions d'origine
function drawDate() {
    const now = new Date();

    const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
    const dayName = days[now.getDay()];
    const dayNum = String(now.getDate()).padStart(2, '0');

    const angleRad = Math.PI / 2;
    const xBase = centerX + Math.cos(angleRad) * (r - (size * 0.08));
    const yBase = centerY + Math.sin(angleRad) * (r - (size * 0.08));

    // Fonction interne avec l'ombre corrigée en dégradé fluide
    function drawInsetBox(x, y, width, height, radius, strokeColor, fillColor) {
        // 1. Fond du guichet
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // 2. CORRECTION : Ombre douce et progressive (plus de coupure noire brute)
        const shadowGrad = ctx.createLinearGradient(x, y - height / 2, x, y - height / 3);
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.fill();
        ctx.restore();

        // 3. Contour net du guichet
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Les proportions d'origine strictes du script initial
    const wBox = size * 0.126;

    // --- 1. GUICHET DU JOUR (VEN) ---
    const yJour = yBase - (size * 0.133);
    drawInsetBox(xBase, yJour, wBox, size * 0.06, 3, '#526174', '#172033');
    ctx.fillStyle = HANDS.second.color;
    ctx.font = `bold ${Math.round(size * 0.036)}px sans-serif`;
    ctx.fillText(dayName, xBase, yJour + 2);

    // --- 2. GUICHET DU NUMÉRO (02) ---
    const yNum = yBase;
    drawInsetBox(xBase, yNum, wBox, size * 0.093, 4, '#526174', '#172033');
    ctx.fillStyle = HANDS.second.color;
    ctx.font = `bold ${Math.round(size * 0.066)}px sans-serif`;
    ctx.fillText(dayNum, xBase, yNum + 3);
}


// Variable globale pour suivre l'état de l'animation de l'horloge
let clockAnimationId = null;

// Boucle d'animation principale
function updateClock() {
    // MODE ÉCONOMIE D'ÉNERGIE : Si l'onglet est masqué, on stoppe net l'animation
    if (document.hidden || document.visibilityState === 'hidden') {
        clockAnimationId = null;
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save(); drawDial(); ctx.restore();
    ctx.save(); drawDate(); ctx.restore();

    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds() || 0;

    // Seconds et minutes (selon votre logique d'origine)
    const sAngle = ((seconds + ms / 1000) * (Math.PI * 2)) / 60;
    const minuteCinquieme = minutes + Math.floor(seconds / 12) * 0.2;
    const mAngle = (minuteCinquieme * (Math.PI * 2)) / 60;

    // CORRECTION : Sauts stricts toutes les 10 minutes sans aucune avance active
    // Math.floor(minutes / 10) * 10 isole les blocs de 10 minutes passées (0, 10, 20, 30, 40, 50)
    const heureDixMinutes = hour + (Math.floor(minutes / 10) * 10) / 60;

    // Application de l'angle sur le cadran 24h (+ Math.PI gère l'inversion d'origine du cadran)
    const hAngle = (heureDixMinutes * (Math.PI * 2)) / 24 + Math.PI;


    // Calcul des longueurs et épaisseurs dynamiques des aiguilles
    drawHand(mAngle, size * HANDS.minute.lenFactor, HANDS.minute.color, size * HANDS.minute.widthFactor);
    drawHand(mAngle, size * HANDS.minute.lenFactor + (size * 0.03), HANDS.minute.color, size * HANDS.minute.widthFactor / 4);
    drawHand(hAngle, size * HANDS.hour.lenFactor, HANDS.hour.color, size * HANDS.hour.widthFactor);
    drawHand(hAngle, (size * HANDS.hour.lenFactor) + (size * 0.16), HANDS.hour.color, size * HANDS.hour.widthFactor / 9);
    drawHand(sAngle, size * HANDS.second.lenFactor, HANDS.second.color, size * HANDS.second.widthFactor);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.beginPath(); 
    ctx.arc(centerX, centerY, size * 0.02, 0, Math.PI * 2); // bouton au center
    ctx.fillStyle = HANDS.second.color;
    ctx.fill();
    ctx.restore();

    drawGlass();

    // On stocke l'ID pour pouvoir gérer l'arrêt/relance proprement
    clockAnimationId = requestAnimationFrame(updateClock);
}

// GESTIONNAIRE DE VISIBILITÉ (Économiseur d'énergie matériel)
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // L'utilisateur revient sur la page : si la boucle est arrêtée, on la relance
        if (!clockAnimationId) {
            updateClock();
        }
    } else {
        // L'utilisateur quitte l'onglet : on annule la prochaine animation immédiatement
        if (clockAnimationId) {
            cancelAnimationFrame(clockAnimationId);
            clockAnimationId = null;
        }
    }
}

// Écouteur pour détecter le changement d'onglet ou la réduction du navigateur
document.addEventListener('visibilitychange', handleVisibilityChange);

// Lancement et écouteur de redimensionnement de fenêtre
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
updateClock();
