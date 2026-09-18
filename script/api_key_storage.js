const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const API_KEY_NAME = 'weatherApiKey';

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

export async function saveApiKey(apiKey) {
  if (!apiKey) return;
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(apiKey, API_KEY_NAME);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    dispatchStorageStatus("Clé API Weather sauvegardée avec succès.", "success");
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
    database.close();
    return apiKey;
  } catch (error) {
    dispatchStorageStatus(`Impossible de lire la clé API en mémoire : ${error.message}`, "error");
    return null;
  }
}

export async function initializeApiKey() {
  const apiKey = new URLSearchParams(window.location.search).get('API');
  if (!apiKey) return getApiKey();

  dispatchStorageStatus("Nouvelle clé API détectée dans l'URL. Configuration...", "info");
  await saveApiKey(apiKey);
  window.history.replaceState({}, '', window.location.pathname);
  return apiKey;
}
