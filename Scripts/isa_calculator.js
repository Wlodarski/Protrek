/**
 * @file Implémente les fonctions basées sur le modèle d'Atmosphère Standard Internationale (ISA) 
 * corrigé pour éviter les erreurs de calcul et retourner des résultats stables.
 */

// --- Constantes ISA standard ---
const CONSTANTS = {
    P0_HPA: 1013.25,      // Pression au niveau de la mer en hPa
    T0_K: 288.15         // Température standard au niveau de la mer (Kelvin)
};

/**
 * Calcule l'altitude théorique en mètres basé sur le modèle ISA standard.
 */
function calculateAltitudeFromPressure(pressure_hpa) {
    if (typeof pressure_hpa !== 'number' || pressure_hpa <= 0) return null;

    try {
        // Constantes physiques standards de l'ISA (Troposphère)
        const L_LAPSE = 0.0065; // Taux de baisse thermique standard : 0.0065 K/m
        const EXPOSANT = 0.190284; // Équivalent à (R * L) / g

        // Formule de nivellement barométrique internationale
        const ratio_p_p0 = pressure_hpa / CONSTANTS.P0_HPA;
        let altitude_m = (CONSTANTS.T0_K / L_LAPSE) * (1 - (ratio_p_p0 ** EXPOSANT));

        if (!isFinite(altitude_m)) { return null; } 

        return Math.round(altitude_m);
    } catch (error) {
        console.error("Erreur critique lors du calcul ISA:", error.message);
        return null;
    }
}



/**
 * Calcule l'altitude réelle en tenant compte d'un décalage de référence initial.
 */
function calculateTrueAltitude(H_ref, P_initial_hpa, P_pred_hpa) {
    if (typeof H_ref !== 'number' || typeof P_initial_hpa !== 'number') {
        return { error: "Données d'entrée invalides." };
    }

    try {
        // 1. Calcul de l'altitude théorique basée sur la pression prévue
        const H_theoretical = calculateAltitudeFromPressure(P_pred_hpa);
        if (H_theoretical === null) return { error: "Calcul de pression impossible avec le modèle ISA." };

        // 2. Détermination du décalage dû à la référence initiale
        const H_at_initial_pression = calculateAltitudeFromPressure(P_initial_hpa);
        if (H_at_initial_pression === null) return { error: "Calcul initial impossible pour le calibrage." };

        // Décalage = Référence réelle - Altitude théorique attendue par ISA au point de calibration.
        const offset = H_ref - H_at_initial_pression; 

        // Application du décalage à l'altitude calculée avec la pression actuelle.
        const H_true_corrected = H_theoretical + offset;

        return { 
            H_true: Math.round(Math.max(-99, H_true_corrected)), // Limite pour éviter les valeurs irréalistes
            error: null 
        };
    } catch (error) {
         console.error("Erreur inattendue dans calculateTrueAltitude:", error);
         return { error: "Échec interne du calcul." };
    }
}

/**
 * Calcule la pression théorique en hPa basée sur l'altitude ISA standard (Formule inverse).
 */
function calculatePressureFromAltitude(altitude_m) {
    if (typeof altitude_m !== 'number') return null;
    const L_LAPSE = 0.0065;
    const EXPOSANT = 0.190284;
    
    // Formule inverse de l'ISA
    const ratio = 1 - (altitude_m * L_LAPSE / CONSTANTS.T0_K);
    const pressure_hpa = CONSTANTS.P0_HPA * (ratio ** (1 / EXPOSANT));
    
    return pressure_hpa;
}

// Mettez à jour vos exports pour inclure la nouvelle fonction
module.exports = { calculateTrueAltitude, calculateAltitudeFromPressure, calculatePressureFromAltitude };

