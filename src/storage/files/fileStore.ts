/**
 * Armazenamento de arquivos importados.
 * Android: diretório privado do app (Directory.Data) via @capacitor/filesystem.
 * Navegador: apenas o texto fica no SQLite (suficiente para desenvolvimento).
 */
export interface FileStore {
  save(name: string, data: ArrayBuffer): Promise<string | null>;
  remove(ref: string): Promise<void>;
}

function toBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function getFileStore(): Promise<FileStore> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    return { save: async () => null, remove: async () => undefined };
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  return {
    async save(name, data) {
      const path = `imports/${Date.now()}-${name.replace(/[^\w.\-]/g, '_')}`;
      await Filesystem.writeFile({ path, data: toBase64(data), directory: Directory.Data, recursive: true });
      return path;
    },
    async remove(ref) {
      await Filesystem.deleteFile({ path: ref, directory: Directory.Data }).catch(() => undefined);
    },
  };
}
