/**
 * Réglages du son, propres à ce navigateur : son coupé ou non, volume de la musique et des ponctuations (0 à 1).
 * Mémorisés dans le localStorage ; sans stockage (navigation privée…), ils valent pour la visite.
 */
import { useSyncExternalStore } from 'react';

export interface AudioSettings {
  muted: boolean;
  /** Volume de la musique de fond, 0 à 1. */
  music: number;
  /** Volume des ponctuations et jingles, 0 à 1. */
  sfx: number;
}

export const AUDIO_KEY = 'casholoco.audio';
export const DEFAULT_AUDIO: AudioSettings = { muted: false, music: 0.6, sfx: 0.8 };

const unit = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback);

/** Réglages lus d'une valeur mémorisée, bornés ; les valeurs par défaut pour tout le reste. */
export function parseAudioSettings(raw: string | null): AudioSettings {
  if (raw === null) return { ...DEFAULT_AUDIO };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return { ...DEFAULT_AUDIO };
    const o = v as Record<string, unknown>;
    return {
      muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_AUDIO.muted,
      music: unit(o.music, DEFAULT_AUDIO.music),
      sfx: unit(o.sfx, DEFAULT_AUDIO.sfx),
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

function load(): AudioSettings {
  try {
    return parseAudioSettings(typeof localStorage !== 'undefined' ? localStorage.getItem(AUDIO_KEY) : null);
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

let current: AudioSettings = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const next = parseAudioSettings(JSON.stringify({ ...current, ...patch }));
  if (next.muted === current.muted && next.music === current.music && next.sfx === current.sfx) return;
  current = next;
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(current));
  } catch {
    // Stockage indisponible : le réglage vaut pour cette visite.
  }
  for (const l of listeners) l();
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
}
