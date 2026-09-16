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

export async function saveApiKey(apiKey) {
  if (!apiKey) return;
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(apiKey, API_KEY_NAME);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function getApiKey() {
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
}

export async function initializeApiKey() {
  const apiKey = new URLSearchParams(window.location.search).get('API');
  if (!apiKey) return getApiKey();

  await saveApiKey(apiKey);
  window.history.replaceState({}, '', window.location.pathname);
  return apiKey;
}
