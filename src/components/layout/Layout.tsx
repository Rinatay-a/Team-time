import { Clock3, LogIn, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { appConfig } from '../../lib/config';
import { supabase } from '../../services/api';
import { useEffect, useState } from 'react';

export function Layout({ children }: { children: React.ReactNode }) {
  const [signed, setSigned] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSigned(!!data.session));
    return supabase.auth.onAuthStateChange((_, s) => setSigned(!!s)).data.subscription.unsubscribe;
  }, []);

  return <>
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-brand focus-ring">
          <span className="site-brand-mark"><Clock3 size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <span>{appConfig.name}</span>
        </Link>
        <nav className="site-nav" aria-label="Основная навигация">
          <Link className="site-nav-link focus-ring" to="/admin">Мои опросы</Link>
          {signed
            ? <button onClick={async () => { await supabase.auth.signOut(); nav('/'); }} aria-label="Выйти" className="site-auth-link focus-ring"><LogOut size={19} aria-hidden="true" /></button>
            : <Link to="/login" aria-label="Войти" className="site-auth-link focus-ring"><LogIn size={19} aria-hidden="true" /></Link>}
        </nav>
      </div>
    </header>
    <main>{children}</main>
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-name">{appConfig.name}</span>
        <p className="site-footer-description">{appConfig.subtitle}</p>
      </div>
    </footer>
  </>;
}
