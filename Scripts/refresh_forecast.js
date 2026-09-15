import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCombinedForecast } from './weather_service.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const forecastPath = path.join(directory, 'protrek_forecast.json');

try {
  const forecast = await fetchCombinedForecast();
  await fs.writeFile(forecastPath, JSON.stringify(forecast));
  console.log('Forecast refreshed successfully');
} catch (error) {
  console.error(`Failed to refresh forecast: ${error.message}`);
  process.exitCode = 1;
}
