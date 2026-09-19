const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const API_KEY_NAME = 'weatherApiKey';
const MAP_KEY_NAME = 'mapApiKey';
const URL_PARAMS = {API_KEY_NAME: 'API', MAP_KEY_NAME: 'MAP'};

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
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(apiKey, keyName);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    if (keyName === API_KEY_NAME) {
      dispatchStorageStatus("Clé API Weather sauvegardée avec succès.", "success");
    } else if (keyName === MAP_KEY_NAME) {
      dispatchStorageStatus("Clé API Map sauvegardée avec succès.", "success");
    }
  } catch (error) {
    dispatchStorageStatus(`Échec de sauvegarde de la clé API : ${error.message}`, "error");
  }
}

export async function getApiKey() {
  try {
    const database = await openDatabase();
    const apiKey = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(API_KEY_NAME);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    return apiKey;
  } catch (error) {
    dispatchStorageStatus(`Impossible de lire la clé API en mémoire : ${error.message}`, "error");
    return null;
  }
}

export async function getMapApiKey() {
  try {
    const database = await openDatabase();
    const mapKey = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(MAP_KEY_NAME);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    return mapKey;
  } catch (error) {
    dispatchStorageStatus(`Impossible de lire la clé Map en mémoire : ${error.message}`, "error");
    return null;
  }
}

export async function initializeApiKey() {
  const apiKey = new URLSearchParams(window.location.search).get(URL_PARAMS.API_KEY_NAME);
  if (!apiKey) return getApiKey();

  dispatchStorageStatus("Nouvelle clé API détectée dans l'URL. Configuration...", "info");
  await saveApiKey(apiKey);
  window.history.replaceState({}, '', window.location.pathname);
  return apiKey;
}

export async function initializeMapApiKey() {
  const mapKey = new URLSearchParams(window.location.search).get(URL_PARAMS.MAP_KEY_NAME);
  if (!mapKey) return getMapApiKey();

  dispatchStorageStatus("Nouvelle clé MAP détectée dans l'URL. Configuration...", "info");
  await saveApiKey(mapKey, MAP_KEY_NAME);
  window.history.replaceState({}, '', window.location.pathname);
  return mapKey;
}
