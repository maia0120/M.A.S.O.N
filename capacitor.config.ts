import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.mason.pessoal',
  appName: 'MASON',
  webDir: 'dist',
  android: {
    // Nada de tráfego HTTP sem criptografia.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
