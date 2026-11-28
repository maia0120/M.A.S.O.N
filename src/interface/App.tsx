import { useEffect, useState } from 'react';
import { useNav } from './navigation/navStore';
import { sectionById } from './navigation/sections';
import { Sidebar } from './navigation/Sidebar';
import { Header } from './navigation/Header';
import { WorkDashboard } from './dashboard/WorkDashboard';
import { IdeasPage } from './pages/IdeasPage';
import { DevelopmentPage } from './pages/DevelopmentPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { PlannedPage } from './pages/PlannedPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChatPanel } from './chat/ChatPanel';
import { Particles } from './components/Particles';
import { core } from './components/coreState';
import { getPref } from '../memory/preferences/profileRepo';

const PAGES: Record<string, () => JSX.Element> = {
  'work-dashboard': WorkDashboard,
  ideas: IdeasPage,
  development: DevelopmentPage,
  projects: ProjectsPage,
  memory: MemoryPage,
  settings: SettingsPage,
};

export function App() {
  const { section, recordId } = useNav();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    void getPref('ui.motion').then((v) => core.setReduced(v === 'reduzido'));
    // Efeito de onda ao tocar em botões
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement).closest('.btn, .icon-btn') as HTMLElement | null;
      if (!btn || core.reduced()) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      btn.appendChild(span);
      setTimeout(() => span.remove(), 650);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  const Page = PAGES[section] ?? (sectionById(section) ? PlannedPage : WorkDashboard);
  return (
    <div className="app">
      <Particles />
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="main">
        <Header onMenu={() => setMenu(true)} />
        <main className="content"><div className="page" key={`${section}:${recordId ?? ''}`}><Page /></div></main>
      </div>
      <ChatPanel />
    </div>
  );
}
