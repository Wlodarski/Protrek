const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const API_KEY_NAME = 'weatherApiKey';
const MAP_KEY_NAME = 'mapApiKey';
const MAP_BLOB_NAME = 'mapBlob';
const CAL_ERROR_NAME = 'cal_error';

const URL_PARAMS = {
  [API_KEY_NAME]: 'API',
  [MAP_KEY_NAME]: 'MAP',
  [CAL_ERROR_NAME]: 'CAL'
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dispatchStorageStatus(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('gps-status', {
    detail: { message, type }
  }));
}

export async function saveApiKey(apiKey, keyName = API_KEY_NAME) {
  if (apiKey === undefined || apiKey === null || !keyName) return;
  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put(apiKey, keyName);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    const savedApiKey = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(keyName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (savedApiKey !== apiKey) {
      throw new Error('La clé relue ne correspond pas à la clé écrite.');
    }

    if (keyName === API_KEY_NAME) {
      dispatchStorageStatus("Clé API Weather sauvegardée avec succès.", "success");
    } else if (keyName === MAP_KEY_NAME) {
      dispatchStorageStatus("Clé API Map sauvegardée avec succès.", "success");
    } else if (keyName === CAL_ERROR_NAME) {
      dispatchStorageStatus("Erreur de calibration sauvegardée avec succès.", "success");
    }
  } catch (error) {
    dispatchStorageStatus(`Échec de sauvegarde du paramètre : ${error.message}`, "error");
  } finally {
    database?.close();
  }
}

async function getStoredApiKey(keyName, errorLabel) {
  let database;
  try {
    database = await openDatabase();
    let apiKey = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(keyName);
      request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
      request.onerror = () => reject(request.error);
    });

    // AJOUT : S'assure que CAL reste un nombre lors de la lecture depuis IndexedDB
    if (keyName === CAL_ERROR_NAME && apiKey !== null) {
      const parsed = parseFloat(apiKey);
      return isNaN(parsed) ? null : parsed;
    }

    return apiKey;
  } catch (error) {
    dispatchStorageStatus(`Impossible de lire la clé ${errorLabel} en mémoire : ${error.message}`, "error");
    return null;
  } finally {
    database?.close();
  }
}

export function getApiKey() {
  return getStoredApiKey(API_KEY_NAME, 'API');
}

export function getMapApiKey() {
  return getStoredApiKey(MAP_KEY_NAME, 'MAP');
}

export function getCalError() {
  return getStoredApiKey(CAL_ERROR_NAME, 'CAL')
}

// Interne : gère l'initialisation et applique le bon type de données
async function processStoredApiKey(keyName, urlParamsInstance) {
  const urlParameter = URL_PARAMS[keyName];
  let apiKey = urlParamsInstance.get(urlParameter);

  if (!apiKey) return getStoredApiKey(keyName, urlParameter || 'Paramètre');

  // MODIFICATION : Conversion unique de CAL en nombre décimal si trouvé dans l'URL
  if (keyName === CAL_ERROR_NAME) {
    const parsedCal = parseFloat(apiKey);
    if (isNaN(parsedCal)) {
      dispatchStorageStatus(`Le paramètre CAL dans l'URL n'est pas un nombre valide.`, "error");
      return getStoredApiKey(keyName, urlParameter);
    }
    apiKey = parsedCal;
  }

  dispatchStorageStatus(`Nouvelle clé ${urlParameter} détectée dans l'URL.`, "info");
  await saveApiKey(apiKey, keyName);
  return apiKey;
}

/**
 * Initialise l'intégralité des configurations d'un seul coup.
 * @param {boolean} cleanUrl - Supprime tous les paramètres de tracking de l'URL.
 * @returns {Promise<{weatherApiKey: string|null, mapApiKey: string|null, cal_error: number|null}>}
 */
export async function initializeAllSettings(cleanUrl = true) {
  const urlParams = new URLSearchParams(window.location.search);
  const hasParamsInUrl = Object.values(URL_PARAMS).some(param => urlParams.has(param));

  const [weatherApiKey, mapApiKey, calError] = await Promise.all([
    processStoredApiKey(API_KEY_NAME, urlParams),
    processStoredApiKey(MAP_KEY_NAME, urlParams),
    processStoredApiKey(CAL_ERROR_NAME, urlParams)
  ]);

  if (cleanUrl && hasParamsInUrl) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  return {
    weatherApiKey,
    mapApiKey,
    cal_error: calError // Retournera un Float (ex: 1.25) ou null
  };
}

/* export function initializeApiKey(cleanUrl = false) {
  const urlParams = new URLSearchParams(window.location.search);
  return initializeStoredApiKey(API_KEY_NAME, cleanUrl);
}

export function initializeMapApiKey(cleanUrl = false) {
  const urlParams = new URLSearchParams(window.location.search);
  return initializeStoredApiKey(MAP_KEY_NAME, cleanUrl);
}

export function initializeCalError(cleanUrl = true) {
  const urlParams = new URLSearchParams(window.location.search);
  return initializeStoredApiKey(CAL_ERROR_NAME, cleanUrl);
} */

async function initializeStoredApiKey(keyName, cleanUrl) {
  const urlParams = new URLSearchParams(window.location.search);
  const result = await processStoredApiKey(keyName, urlParams);
  if (cleanUrl && urlParams.has(URL_PARAMS[keyName])) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  return result;
}

// Sauvegarde le Blob de l'image directement dans IndexedDB
export async function saveMapBlob(blob) {
  if (!(blob instanceof Blob)) return;
  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put(blob, MAP_BLOB_NAME);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
    });
    dispatchStorageStatus("Carte enregistrée dans le cache IndexedDB.", "info");
  } catch (error) {
    console.error("Erreur de stockage du Blob carte:", error);
  } finally {
    database?.close();
  }
}

// Récupère le Blob de la carte et génère une URL locale éphémère (ObjectURL)
export async function getStoredMapUrl() {
  let database;
  try {
    database = await openDatabase();
    const blob = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(MAP_BLOB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  } catch (error) {
    return null;
  } finally {
    database?.close();
  }
}
