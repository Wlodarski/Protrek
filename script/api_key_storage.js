// api_key_storage.js
import { openDatabase, STORE_NAME } from './database.js';

const API_KEY_NAME = 'weatherApiKey';
const MAP_KEY_NAME = 'mapApiKey';
const MAP_BLOB_NAME = 'mapBlob';
const CAL_ERROR_NAME = 'cal_error';

const URL_PARAMS = {
  [API_KEY_NAME]: 'API',
  [MAP_KEY_NAME]: 'MAP',
  [CAL_ERROR_NAME]: 'CAL'
};

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

export function getApiKey() { return getStoredApiKey(API_KEY_NAME, 'API'); }
export function getMapApiKey() { return getStoredApiKey(MAP_KEY_NAME, 'MAP'); }
export function getCalError() { return getStoredApiKey(CAL_ERROR_NAME, 'CAL'); }

async function processStoredApiKey(keyName, urlParamsInstance) {
  const urlParameter = URL_PARAMS[keyName];
  let apiKey = urlParamsInstance.get(urlParameter);

  if (!apiKey) return getStoredApiKey(keyName, urlParameter || 'Paramètre');

  if (keyName === CAL_ERROR_NAME) {
    const parsedCal = parseFloat(apiKey);
    if (isNaN(parsedCal)) {
      dispatchStorageStatus(`Le paramètre CAL dans l’URL n’est pas un nombre valide.`, "error");
      return getStoredApiKey(keyName, urlParameter);
    }
    apiKey = parsedCal;
  }

  dispatchStorageStatus(`Nouvelle clé ${urlParameter} détectée dans l’URL.`, "info");
  await saveApiKey(apiKey, keyName);
  return apiKey;
}

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

  return { weatherApiKey, mapApiKey, cal_error: calError };
}

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

/**
 * Supprime proprement la carte du cache IndexedDB et notifie l'application.
 */
export async function clearMapCache() {
  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).delete(MAP_BLOB_NAME);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
    });
    dispatchStorageStatus("Cache de la carte nettoyé automatiquement (données obsolètes).", "info");
  } catch (error) {
    console.error("Erreur lors du vidage du cache de la carte :", error);
  } finally {
    database?.close();
  }
}
