import { escapeHtml } from "../utils/format.js";

// WMO weather codes (used by Open-Meteo) collapsed to a small icon+label set.
const WEATHER_CODES = {
  0: { icon: '☀️', label: 'Clear sky' },
  1: { icon: '🌤️', label: 'Mostly clear' },
  2: { icon: '⛅', label: 'Partly cloudy' },
  3: { icon: '☁️', label: 'Overcast' },
  45: { icon: '🌫️', label: 'Fog' },
  48: { icon: '🌫️', label: 'Fog' },
  51: { icon: '🌦️', label: 'Light drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌦️', label: 'Heavy drizzle' },
  56: { icon: '🌧️', label: 'Freezing drizzle' },
  57: { icon: '🌧️', label: 'Freezing drizzle' },
  61: { icon: '🌧️', label: 'Light rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy rain' },
  66: { icon: '🌧️', label: 'Freezing rain' },
  67: { icon: '🌧️', label: 'Freezing rain' },
  71: { icon: '🌨️', label: 'Light snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️', label: 'Heavy snow' },
  77: { icon: '❄️', label: 'Snow grains' },
  80: { icon: '🌦️', label: 'Light showers' },
  81: { icon: '🌦️', label: 'Showers' },
  82: { icon: '⛈️', label: 'Heavy showers' },
  85: { icon: '🌨️', label: 'Snow showers' },
  86: { icon: '🌨️', label: 'Snow showers' },
  95: { icon: '⛈️', label: 'Thunderstorm' },
  96: { icon: '⛈️', label: 'Thunderstorm' },
  99: { icon: '⛈️', label: 'Thunderstorm' },
};

function describeCode(code) {
  return WEATHER_CODES[code] || { icon: '🌡️', label: '' };
}

const CACHE_MS = 20 * 60 * 1000;
let cache = null; // { tempNow, high, low, code, place, fetchedAt }
let inFlight = null;

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
    );
  });
}

// BigDataCloud's "client" reverse-geocode endpoint is free, keyless, and
// CORS-enabled specifically for direct browser calls like this one.
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.city || data.locality || data.principalSubdivision || '';
  } catch {
    return '';
  }
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather request failed');
  return res.json();
}

async function loadWeather() {
  if (cache && (Date.now() - cache.fetchedAt) < CACHE_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { lat, lon } = await getLocation();
    const [data, place] = await Promise.all([fetchWeather(lat, lon), reverseGeocode(lat, lon)]);
    cache = {
      tempNow: Math.round(data.current.temperature_2m),
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      code: data.current.weather_code,
      place,
      fetchedAt: Date.now(),
    };
    return cache;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function renderWeather() {
  const el = document.getElementById('weatherInline');
  if (!el) return;
  el.innerHTML = '<span class="weather-loading">Loading weather…</span>';
  loadWeather().then(w => {
    const { icon, label } = describeCode(w.code);
    el.innerHTML = `
      <span class="weather-icon" title="${escapeHtml(label)}">${icon}</span>
      <span class="weather-temp">${w.tempNow}°C</span>
      <span class="weather-range">H:${w.high}° L:${w.low}°</span>
      ${w.place ? `<span class="weather-place">${escapeHtml(w.place)}</span>` : ''}
    `;
  }).catch(() => {
    el.innerHTML = '<button type="button" class="weather-retry" id="weatherRetryBtn">📍 Enable weather</button>';
    const btn = document.getElementById('weatherRetryBtn');
    if (btn) btn.addEventListener('click', () => { cache = null; renderWeather(); });
  });
}
