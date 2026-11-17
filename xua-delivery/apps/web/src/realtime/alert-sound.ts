"use client";

import { useSyncExternalStore } from "react";

/**
 * Som de pedido novo (T4.2): dois tons curtos gerados por Web Audio, sem
 * arquivo de áudio. O navegador só libera áudio depois de uma interação, então
 * o contexto é criado/retomado no primeiro clique ou tecla da sessão.
 */

type AudioCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;
let unlockInstalled = false;

function getAudioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
    null
  );
}

function ensureContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const Ctor = getAudioCtor();
  if (!Ctor) return null;
  try {
    audioContext = new Ctor();
  } catch {
    audioContext = null;
  }
  return audioContext;
}

/** Instala (uma vez) o desbloqueio do áudio no primeiro gesto do usuário. */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const ctx = ensureContext();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  // Envelope curto para não "estalar" no início e no fim.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Toca o alerta. Devolve false se o navegador ainda não liberou o áudio. */
export function playNewOrderSound(): boolean {
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
    return false;
  }
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.16);
  tone(ctx, 1320, now + 0.2, 0.2);
  return true;
}

export function vibrateNewOrder(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Alguns navegadores lançam fora de gesto do usuário; vibração é opcional.
  }
}

// --- Preferência "Som de novos pedidos" (localStorage, por aparelho) ---

const STORAGE_KEY = "xua:new-order-sound";
const listeners = new Set<() => void>();

export function isNewOrderSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNewOrderSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Sem storage (aba privada): vale só para esta página.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNewOrderSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isNewOrderSoundEnabled, () => true);
}
