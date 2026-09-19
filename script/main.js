const versionEl = document.getElementById('version');

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('./sw.js')
		.catch((error) => console.error('Échec de l’enregistrement du service worker:', error));
}

import('./version.js')
	.then(({ getVersionLabel }) => {
		if (versionEl) versionEl.textContent = getVersionLabel();
	})
	.catch((error) => {
		console.error('Échec du chargement de version.js:', error);
		if (versionEl) versionEl.textContent = 'version indisponible';
	});

// 1. Désactive la mémoire de défilement par défaut du navigateur
if ('scrollRestoration' in history) {
	history.scrollRestoration = 'manual';
}

// 2. Force le conteneur fixé à remonter tout en haut au chargement
window.addEventListener('DOMContentLoaded', () => {
	const clipper = document.querySelector('.viewport-clipper');
	if (clipper) {
		clipper.scrollTop = 0;
	}
});

import('./app.js').catch((error) => console.error('Échec de l’initialisation de l’application:', error));
