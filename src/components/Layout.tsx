import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { extrairAtividades } from '../lib/atividades';
import { supabase } from '../lib/supabaseClient';
import { AlertaConexaoExpirada } from './AlertaConexaoExpirada';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `topbar-nav-link${isActive ? ' active' : ''}`;
}

function ContadorAtividadesPendentes() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    let cancelado = false;

    supabase
      .from('atas_reuniao')
      .select('id,cliente,cliente_id,assunto,data_reuniao,status,acoes')
      .in('status', ['revisao', 'concluida'])
      .then(({ data }) => {
        if (cancelado) return;
        const total = extrairAtividades(data ?? []).filter((a) => !a.concluida).length;
        setPendentes(total);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (pendentes === 0) return null;
  return <span className="topbar-nav-badge">{pendentes}</span>;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          />
        </svg>
      )}
    </button>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <NavLink to="/" end className="topbar-brand">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            Ata IA
          </NavLink>
          <nav className="topbar-nav">
            <NavLink to="/" end className={navLinkClass}>
              Clientes
            </NavLink>
            <NavLink to="/atas" className={navLinkClass}>
              Todas as atas
            </NavLink>
            <NavLink to="/atividades" className={navLinkClass}>
              Atividades <ContadorAtividadesPendentes />
            </NavLink>
            <NavLink to="/reunioes-detectadas" className={navLinkClass}>
              Reuniões detectadas
            </NavLink>
            <NavLink to="/integracoes" className={navLinkClass}>
              Integrações
            </NavLink>
          </nav>
        </div>
        <div className="topbar-user">
          <span className="topbar-email">{user?.email}</span>
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <AlertaConexaoExpirada />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
