export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'test' };
export function registerPlugin<T>(_name: string): T {
  return new Proxy({}, { get: () => async () => undefined }) as T;
}
export interface PluginListenerHandle { remove(): Promise<void> }
