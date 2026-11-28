// Ajusta o projeto Android gerado por "npx cap add android" (usado no GitHub Actions a cada build).
import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let m = await readFile(manifestPath, 'utf8');
if (!m.includes('RECORD_AUDIO')) {
  m = m.replace('</manifest>', `    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
    </queries>
</manifest>`);
}
// Dados só no aparelho: sem backup automático para a nuvem.
m = m.replace(/android:allowBackup="true"/, 'android:allowBackup="false" android:fullBackupContent="false"');
await writeFile(manifestPath, m);

const gradlePath = 'android/app/build.gradle';
let g = await readFile(gradlePath, 'utf8');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const code = Number(process.env.VERSION_CODE || 1);
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
await writeFile(gradlePath, g);
console.log(`Android ajustado: versão ${pkg.version} (build ${code}), microfone liberado, backup desligado.`);
