export type GameModeKey = 'classic' | 'geo';

export type ClassicStep = 1 | 2 | 3;
export type PhotoSlot = 'A' | 'B';

export interface GameMode {
  num: number;
  label: string;
  short: string;
  intro: string;
}

export interface Role {
  min: number;
  name: string;
  desc: string;
}

export type SeedLocation = [lat: number, lng: number, region: string];

export interface StreetImage {
  lat: number;
  lng: number;
  year: number | null;
  thumbUrl: string;
  isPano: boolean;
  region: string;
}

export interface TimeDriftImage {
  thumbUrl: string;
  year: number;
}

export interface TimeDriftPair {
  imageA: TimeDriftImage;
  imageB: TimeDriftImage;
  newerIsA: boolean;
  actualGap: number;
  newerLat: number;
  newerLng: number;
  region: string;
}

export interface RoundScore {
  round: number;
  score: number;
  distKm?: number;
  yearDiff?: number;
  guessedYear?: number;
  gapDiff?: number;
  guessedGap?: number;
  actualGap?: number;
  newerCorrect?: boolean;
}

export interface MapillaryImage {
  id?: string;
  geometry?: { coordinates: [number, number] };
  thumb_1024_url?: string;
  thumb_2048_url?: string;
  thumb_512_url?: string;
  captured_at?: string | number;
  is_pano?: boolean;
}

export interface MapillaryResponse {
  data?: MapillaryImage[];
}
