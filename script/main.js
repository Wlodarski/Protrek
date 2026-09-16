import './app.js';

const versionEl = document.getElementById('version');

async function updateVersion() {
	if (!versionEl) return;

	try {
		const response = await fetch('https://api.github.com/repos/Wlodarski/Protrek/commits/main', {
			headers: { Accept: 'application/vnd.github+json' },
			cache: 'no-store'
		});
		if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

		const commit = await response.json();
		const commitDate = commit.commit?.committer?.date;
		const date = new Date(commitDate);
		if (Number.isNaN(date.getTime())) throw new Error('Date de commit invalide');

		versionEl.textContent = `version : ${new Intl.DateTimeFormat('fr-CA', {
			dateStyle: 'short',
			timeStyle: 'short'
		}).format(date)}`;
	} catch (error) {
		console.warn('Impossible de charger la date du dernier commit:', error);
		versionEl.textContent = 'Version indisponible';
	}
}

updateVersion();

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js')
			.catch((error) => console.error('Échec de l’enregistrement du service worker:', error));
	});
}
