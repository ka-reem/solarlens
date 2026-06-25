import type { GameMode, GameModeKey, Role, SeedLocation } from './types';

export const TOTAL_ROUNDS = 5;
export const MAX_DISTANCE_MI = 3107;
export const KM_TO_MI = 0.621371;
export const MAPILLARY_ACCESS_TOKEN =
  'MLY|27161735263497111|94f5b8335de93bb8b885df69e22623bd';

export const MIN_TIME_DRIFT_GAP = 3;
export const CLASSIC_NEWER_POINTS = 300;

export const SEED_LOCATIONS: SeedLocation[] = [
  [48.8566, 2.3522, 'Western Europe'],
  [35.6762, 139.6503, 'East Asia'],
  [-23.5505, -46.6333, 'South America'],
  [40.7128, -74.006, 'North America'],
  [-33.8688, 151.2093, 'Oceania'],
  [51.5074, -0.1278, 'Northern Europe'],
  [19.4326, -99.1332, 'Central America'],
  [1.3521, 103.8198, 'Southeast Asia'],
  [55.7558, 37.6176, 'Eastern Europe'],
  [30.0444, 31.2357, 'North Africa'],
  [41.9028, 12.4964, 'Southern Europe'],
  [37.5665, 126.978, 'East Asia'],
  [-1.2921, 36.8219, 'Sub-Saharan Africa'],
  [53.3498, -6.2603, 'Northern Europe'],
  [34.0522, -118.2437, 'North America'],
  [13.7563, 100.5018, 'Southeast Asia'],
  [60.1699, 24.9384, 'Northern Europe'],
  [-34.6037, -58.3816, 'South America'],
];

export const CLASSIC_CITY_SEEDS: SeedLocation[] = [
  [51.5007, -0.1246, 'London'],
  [48.8566, 2.3522, 'Paris'],
  [52.52, 13.405, 'Berlin'],
  [35.6895, 139.6917, 'Tokyo'],
  [37.7749, -122.4194, 'San Francisco'],
  [-33.8688, 151.2093, 'Sydney'],
  [-23.5505, -46.6333, 'São Paulo'],
  [-1.2921, 36.8219, 'Nairobi'],
  [30.0444, 31.2357, 'Cairo'],
  [41.8781, -87.6298, 'Chicago'],
  [55.6761, 12.5683, 'Copenhagen'],
  [40.758, -73.9855, 'New York'],
];

export const GAME_MODES: Record<GameModeKey, GameMode> = {
  classic: {
    num: 1,
    label: 'Classic',
    short: 'Two photos, same spot — pick the newer one, guess the year gap, then pin the location.',
    intro:
      'Classic is the full challenge: identify the newer photo, guess how many years the older one goes back, then place the newer shot on the map.',
  },
  geo: {
    num: 2,
    label: 'Geo',
    short: 'One photo — pin the location and guess the year.',
    intro: 'Geo mode is quick and focused: one street photo, one pin, one year guess.',
  },
};

export const ROLES: Role[] = [
  {
    min: 4500,
    name: 'The Cartographer',
    desc: 'You see the world with extraordinary clarity. Every street is a map you have already memorized.',
  },
  {
    min: 3500,
    name: 'The Navigator',
    desc: 'Skilled at reading clues in architecture, landscape, and light — you find your way with quiet confidence.',
  },
  {
    min: 2500,
    name: 'The Wayfarer',
    desc: 'You wander with purpose. Not always sure where you are, but certain of where you are going.',
  },
  {
    min: 1500,
    name: 'The Scout',
    desc: 'Still learning the lay of the land. Your curiosity will take you far — keep exploring.',
  },
  {
    min: 0,
    name: 'The Dreamer',
    desc: 'Less sure about geography, more sure about possibility. Every place is new when you see it for the first time.',
  },
];

export const AVATARS = {
  excellent: `<svg class="result-avatar" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="52" height="52" rx="14" fill="#1d2a1b"/>
    <circle cx="26" cy="20" r="9" stroke="#7ec85a" stroke-width="1.8"/>
    <path d="M26 31c-7.18 0-13 3.13-13 7v1h26v-1c0-3.87-5.82-7-13-7z" fill="none" stroke="#7ec85a" stroke-width="1.8"/>
    <polyline points="21,21 24,24 31,17" stroke="#7ec85a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  close: `<svg class="result-avatar" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="52" height="52" rx="14" fill="#2a2618"/>
    <circle cx="26" cy="20" r="9" stroke="#d9b053" stroke-width="1.8"/>
    <path d="M26 31c-7.18 0-13 3.13-13 7v1h26v-1c0-3.87-5.82-7-13-7z" fill="none" stroke="#d9b053" stroke-width="1.8"/>
    <line x1="26" y1="17" x2="26" y2="22" stroke="#d9b053" stroke-width="2" stroke-linecap="round"/>
    <circle cx="26" cy="24.5" r="1.2" fill="#d9b053"/>
  </svg>`,
  far: `<svg class="result-avatar" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="52" height="52" rx="14" fill="#2a1a16"/>
    <circle cx="26" cy="20" r="9" stroke="#cf7550" stroke-width="1.8"/>
    <path d="M26 31c-7.18 0-13 3.13-13 7v1h26v-1c0-3.87-5.82-7-13-7z" fill="none" stroke="#cf7550" stroke-width="1.8"/>
    <line x1="22" y1="17" x2="30" y2="25" stroke="#cf7550" stroke-width="2" stroke-linecap="round"/>
    <line x1="30" y1="17" x2="22" y2="25" stroke="#cf7550" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
} as const;
