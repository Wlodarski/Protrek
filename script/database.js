// database.js
const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
export const STORE_NAME = 'settings';

/**
 * Ouvre la base IndexedDB du projet et crée le magasin si nécessaire.
 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    
    request.onupgradeneeded = () => {
      // Crée le store de manière sécurisée s'il n'existe pas encore
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
