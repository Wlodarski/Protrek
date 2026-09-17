const DATABASE_NAME = 'protrek';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const THEME_KEY = 'theme';
const THEMES = ['light', 'dark', 'system'];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readTheme() {
  const database = await openDatabase();
  const theme = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(THEME_KEY);
    request.onsuccess = () => resolve(THEMES.includes(request.result) ? request.result : 'system');
    request.onerror = () => reject(request.error);
  });
  database.close();
  return theme;
}

async function saveTheme(theme) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(theme, THEME_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function applyTheme(theme) {
  document.documentElement.toggleAttribute('data-theme', theme !== 'system');
  if (theme !== 'system') document.documentElement.dataset.theme = theme;
  document.getElementById('themeToggle')?.setAttribute('aria-label', `Palette ${theme}`);
  document.getElementById('theme').textContent = theme == 'system' ? '' : theme;
}

export async function initializeTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const status = document.getElementById('status');
  if (!themeToggle) return;

  const updateStatus = (message, color) => {
    if (!status) return;
    status.style.color = color;
    status.textContent = message;
  };

  let theme = 'system';
  try {
    theme = await readTheme();
  } catch (error) {
    const mes = 'Impossible de charger la palette:';
    console.warn(mes, error);
    updateStatus(`${mes} ${error}`, 'var(--status-error)');
  }
  applyTheme(theme);

  const cycleTheme = async () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(theme);
    updateStatus(`Thème « ${theme} » activé`, 'var(--status-info)');
    try {
      await saveTheme(theme);
    } catch (error) {
      const mes = 'Impossible de conserver la palette:';
      console.warn(mes, error);
      updateStatus(`${mes} ${error}`, 'var(--status-error)');
    }
  };

  themeToggle.addEventListener('click', cycleTheme);
  themeToggle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cycleTheme();
    }
  });
}