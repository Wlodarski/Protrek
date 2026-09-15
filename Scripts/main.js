import './app.js';

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js')
			.catch((error) => console.error('Échec de l’enregistrement du service worker:', error));
	});
}
