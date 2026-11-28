import { useState } from 'react';
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

const PAGES: Record<string, () => JSX.Element> = {
  'work-dashboard': WorkDashboard,
  ideas: IdeasPage,
  development: DevelopmentPage,
  projects: ProjectsPage,
  memory: MemoryPage,
  settings: SettingsPage,
};

export function App() {
  const { section } = useNav();
  const [menu, setMenu] = useState(false);
  const Page = PAGES[section] ?? (sectionById(section) ? PlannedPage : WorkDashboard);
  return (
    <div className="app">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="main">
        <Header onMenu={() => setMenu(true)} />
        <main className="content"><Page /></main>
      </div>
      <ChatPanel />
    </div>
  );
}
