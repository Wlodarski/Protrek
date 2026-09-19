const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const API_KEY_NAME = 'weatherApiKey';
const MAP_KEY_NAME = 'mapApiKey';
const URL_PARAMS = {
  [API_KEY_NAME]: 'API',
  [MAP_KEY_NAME]: 'MAP'
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

// Fonction utilitaire pour envoyer les logs au statut global
function dispatchStorageStatus(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('gps-status', {
    detail: { message, type }
  }));
}

export async function saveApiKey(apiKey, keyName = API_KEY_NAME) {
  if (!apiKey || !keyName) return;
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
    }
  } catch (error) {
    dispatchStorageStatus(`Échec de sauvegarde de la clé API : ${error.message}`, "error");
  } finally {
    database?.close();
  }
}

async function getStoredApiKey(keyName, errorLabel) {
  let database;
  try {
    database = await openDatabase();
    const apiKey = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(keyName);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

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
  return getStoredApiKey(MAP_KEY_NAME, 'Map');
}

async function initializeStoredApiKey(keyName, cleanUrl) {
  const urlParameter = URL_PARAMS[keyName];
  const apiKey = new URLSearchParams(window.location.search).get(urlParameter);
  if (!apiKey) return getStoredApiKey(keyName, keyName === MAP_KEY_NAME ? 'Map' : 'API');

  dispatchStorageStatus(`Nouvelle clé ${urlParameter} détectée dans l'URL.`, "info");
  await saveApiKey(apiKey, keyName);
  if (cleanUrl) {
    window.history.replaceState({}, '', window.location.pathname);
  }
  return apiKey;
}

export function initializeApiKey(cleanUrl = false) {
  return initializeStoredApiKey(API_KEY_NAME, cleanUrl);
}

export function initializeMapApiKey(cleanUrl = true) {
  return initializeStoredApiKey(MAP_KEY_NAME, cleanUrl);
}
