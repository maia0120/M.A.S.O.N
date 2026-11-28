import { ENVIRONMENTS, SECTIONS } from './sections';
import { nav, useNav } from './navStore';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { section } = useNav();
  const go = (id: string) => { nav.open(id); onClose(); };
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark">M</span>MASON</div>
        {ENVIRONMENTS.map((env) => (
          <div className="nav-group" key={env.id}>
            <div className="nav-label">{env.title}</div>
            {SECTIONS.filter((s) => s.env === env.id).map((s) => (
              <button key={s.id} className={`nav-item ${s.id !== 'work-dashboard' && env.id === 'work' ? 'sub' : ''} ${section === s.id ? 'active' : ''}`} onClick={() => go(s.id)}>
                <span>{env.id === 'work' ? s.short : 'Painel'}</span>
                {!s.implemented && <span className="soon">em breve</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="nav-group nav-bottom">
          {SECTIONS.filter((s) => s.env === 'system').map((s) => (
            <button key={s.id} className={`nav-item ${section === s.id ? 'active' : ''}`} onClick={() => go(s.id)}>{s.title}</button>
          ))}
        </div>
      </aside>
    </>
  );
}
