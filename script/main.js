import './app.js';
import { getVersionLabel } from './version.js';

const versionEl = document.getElementById('version');

function updateVersion() {
	if (!versionEl) return;
	versionEl.textContent = getVersionLabel();
}

updateVersion();

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js')
			.catch((error) => console.error('Échec de l’enregistrement du service worker:', error));
	});
}
