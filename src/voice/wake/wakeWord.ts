import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getPref, setPref } from '../../memory/preferences/profileRepo';
import { core } from '../../interface/components/coreState';

/**
 * Palavra de ativação ("MASON"), como o "Ok Google" (decisão D13).
 * Roda no plugin nativo mason-wakeword: serviço em primeiro plano com Vosk, offline.
 */
export interface WakeStatus {
  running: boolean;
  listening: boolean;
  modelReady: boolean;
  error: string | null;
  canDrawOverlays: boolean;
  userStopped: boolean;
}

interface WakePlugin {
  start(o: { triggers: string[]; grammar: boolean }): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  calibrate(): Promise<void>;
  status(): Promise<WakeStatus>;
  consumeLaunchWake(): Promise<{ wake: boolean }>;
  openOverlaySettings(): Promise<void>;
  requestPermissions(o?: { permissions: string[] }): Promise<Record<string, string>>;
  addListener(event: 'wake', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'heard', cb: (d: { text: string }) => void): Promise<PluginListenerHandle>;
}

const Wake = registerPlugin<WakePlugin>('MasonWakeWord');

export interface WakePrefs {
  enabled: boolean;
  /** Como o reconhecedor escreve "MASON" na sua voz (aprendido na calibração). */
  triggers: string[];
  calibrated: boolean;
}

/** Antes da calibração: formas prováveis de o reconhecedor em português escrever "MASON". */
export const DEFAULT_TRIGGERS = ['mason', 'meison', 'meyson', 'maison', 'meisson', 'mei son', 'mais som', 'mei som', 'maicon'];

export const wakeSupported = () => Capacitor.isNativePlatform();

export async function loadWakePrefs(): Promise<WakePrefs> {
  const raw = await getPref('wake');
  const base: WakePrefs = { enabled: false, triggers: DEFAULT_TRIGGERS, calibrated: false };
  return raw ? { ...base, ...JSON.parse(raw) } : base;
}

export async function saveWakePrefs(p: WakePrefs): Promise<void> {
  await setPref('wake', JSON.stringify(p));
}

export async function wakeStatus(): Promise<WakeStatus | null> {
  if (!wakeSupported()) return null;
  return Wake.status();
}

async function startService(p: WakePrefs) {
  await Wake.start({ triggers: p.triggers, grammar: p.calibrated });
}

export async function enableWake(): Promise<void> {
  if (!wakeSupported()) throw new Error('A ativação por voz só funciona no app Android.');
  const perms = await Wake.requestPermissions({ permissions: ['microphone', 'notifications'] });
  if (perms.microphone !== 'granted') throw new Error('Sem permissão de microfone. Libere nas configurações do Android.');
  const p = { ...(await loadWakePrefs()), enabled: true };
  await saveWakePrefs(p);
  await startService(p);
}

export async function disableWake(): Promise<void> {
  await saveWakePrefs({ ...(await loadWakePrefs()), enabled: false });
  if (wakeSupported()) await Wake.stop();
}

export async function openOverlaySettings() {
  if (wakeSupported()) await Wake.openOverlaySettings();
}

let paused = false;

/** Solta o microfone antes de a conversa usar o reconhecimento de fala. */
export async function pauseWake(): Promise<boolean> {
  if (!wakeSupported()) return false;
  const st = await Wake.status().catch(() => null);
  if (!st?.running) return false;
  if (!paused) {
    paused = true;
    await Wake.pause();
    await new Promise((r) => setTimeout(r, 350)); // dá tempo de o serviço liberar o microfone
  }
  return true;
}

export async function resumeWake() {
  if (!wakeSupported() || !paused) return;
  paused = false;
  await Wake.resume().catch(() => undefined);
}

/** Calibração: o Gabriel diz "MASON" algumas vezes; cada coisa que o reconhecedor ouvir chega em onHeard. */
export async function startCalibration(onHeard: (text: string) => void): Promise<() => Promise<void>> {
  const handle = await Wake.addListener('heard', (d) => onHeard(d.text));
  paused = false;
  await Wake.calibrate();
  return async () => {
    await handle.remove();
  };
}

/** Escolhe como gatilhos as transcrições curtas que se repetiram na calibração. */
export function triggersFromCalibration(heard: string[]): string[] {
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const counts = new Map<string, number>();
  for (const h of heard.map(fold).filter(Boolean)) {
    if (h.split(' ').length > 3) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 4);
}

export async function saveCalibration(triggers: string[]) {
  const p: WakePrefs = { ...(await loadWakePrefs()), triggers, calibrated: true };
  await saveWakePrefs(p);
  if (p.enabled) await startService(p);
}

export async function resetCalibration() {
  const p: WakePrefs = { ...(await loadWakePrefs()), triggers: DEFAULT_TRIGGERS, calibrated: false };
  await saveWakePrefs(p);
  if (p.enabled) await startService(p);
}

/** Liga tudo ao abrir o app: escuta (se ativada), chamadas por voz e pausa automática durante a conversa. */
export async function initWake(): Promise<void> {
  if (!wakeSupported()) return;
  const fire = () => window.dispatchEvent(new CustomEvent('mason:wake'));
  await Wake.addListener('wake', () => { paused = true; fire(); });
  const launched = await Wake.consumeLaunchWake().catch(() => ({ wake: false }));
  if (launched.wake) { paused = true; setTimeout(fire, 600); }

  const st = await Wake.status().catch(() => null);
  const prefs = await loadWakePrefs();
  if (st?.userStopped && prefs.enabled) await saveWakePrefs({ ...prefs, enabled: false });
  else if (prefs.enabled && !st?.running) await startService(prefs).catch(() => undefined);

  // Enquanto o MASON ouve, pensa ou fala, a palavra de ativação fica em pausa; 3 s em espera e ela volta.
  let timer: ReturnType<typeof setTimeout> | undefined;
  core.subscribe(() => {
    if (timer) clearTimeout(timer);
    if (core.mode() !== 'idle') { void pauseWake(); return; }
    timer = setTimeout(() => { if (core.mode() === 'idle') void resumeWake(); }, 3000);
  });
}
