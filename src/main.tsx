import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './interface/App';
import { openDatabase } from './storage/database/db';
import { loadSemanticModel } from './assistant/intent/semantic';
import './interface/styles.css';

const root = createRoot(document.getElementById('root')!);

openDatabase()
  .then(() => {
    root.render(<StrictMode><App /></StrictMode>);
    // O modelo de significados carrega em segundo plano; até lá o núcleo usa só o classificador léxico.
    void loadSemanticModel();
    // Palavra de ativação "MASON" (só no Android)
    void import('./voice/wake/wakeWord').then((m) => m.initWake()).catch(() => undefined);
  })
  .catch((e: Error) => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>MASON não conseguiu abrir o banco de dados</h1>
        <p>{e.message}</p>
      </div>,
    );
  });
