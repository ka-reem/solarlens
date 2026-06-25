import { KM_TO_MI, MAX_DISTANCE_MI } from './constants';

export function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scoreFromDistance(km: number): number {
  if (km / KM_TO_MI >= MAX_DISTANCE_MI / KM_TO_MI) return 0;
  return Math.round(1000 * Math.exp(-km / 1200));
}

export function scoreFromYear(diff: number): number {
  if (diff === 0) return 200;
  if (diff === 1) return 150;
  if (diff <= 2) return 100;
  if (diff <= 4) return 50;
  return 0;
}

export function scoreFromGap(diff: number): number {
  if (diff === 0) return 1000;
  if (diff === 1) return 700;
  if (diff <= 2) return 450;
  if (diff <= 3) return 250;
  return Math.max(0, 120 - diff * 25);
}

export function imageYear(capturedAt: string | number): number {
  const ms = typeof capturedAt === 'number' ? capturedAt : Date.parse(capturedAt);
  return new Date(ms).getFullYear();
}

export function thumbUrl(img: {
  thumb_2048_url?: string;
  thumb_1024_url?: string;
  thumb_512_url?: string;
}): string | null {
  return img.thumb_2048_url || img.thumb_1024_url || img.thumb_512_url || null;
}

export function formatMiles(km: number): string {
  const mi = km * KM_TO_MI;
  if (mi < 0.1) return `${Math.round(mi * 5280)} ft`;
  if (mi < 100) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi).toLocaleString()} mi`;
}

export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}
