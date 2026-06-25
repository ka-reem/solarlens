import type { Role, SeedLocation } from './types';

export const TOTAL_ROUNDS = 2;
export const MAX_DISTANCE_MI = 3107;
export const KM_TO_MI = 0.621371;
export const MAPILLARY_ACCESS_TOKEN =
  'MLY|27161735263497111|94f5b8335de93bb8b885df69e22623bd';

export const MIN_TIME_DRIFT_GAP = 3;
export const CLASSIC_NEWER_POINTS = 300;

export const GAME_INTRO =
  'Built on a solarpunk idea: the shift toward care and better design is already visible at street level — in pavement, paint, and public life. You just have to learn to look.';

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
