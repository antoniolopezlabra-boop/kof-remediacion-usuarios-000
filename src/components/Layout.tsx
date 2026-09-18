import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, TableProperties, History, Settings, Moon, Sun, Presentation, Printer, LogOut, Sparkles, Menu, X, KeyRound } from 'lucide-react';
import { useAuth, NOMBRE_ROL } from '../lib/auth';
import { useDatos } from '../lib/datos';
import { useTema } from '../lib/tema';
import { fechaLarga, haceCuanto } from '../lib/ui';
import { Asistente } from './Asistente';
import { CambiarPassword } from './CambiarPassword';
import { Cargando } from './ui';

export interface LayoutCtx {
  presentacion: boolean;
  abrirAsistente: (pregunta?: string) => void;
}

export function Layout() {
  const { perfil, esAdmin, salir } = useAuth();
  const { conectado, config, ultimoCambio, cargando, error } = useDatos();
  const { oscuro, alternar, fijar } = useTema();
  const [presentacion, setPresentacion] = useState(false);
  const [asistente, setAsistente] = useState<{ abierto: boolean; pregunta?: string }>({ abierto: false });
  const [menu, setMenu] = useState(false);
  const [password, setPassword] = useState(false);
  const loc = useLocation();
  const [, forzar] = useState(0);

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setMenu(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);
  useEffect(() => {
    const t = setInterval(() => forzar((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && presentacion) salirPresentacion();
    };
    const onFs = () => {
      if (!document.fullscreenElement && presentacion) setPresentacion(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  });

  function entrarPresentacion() {
    setPresentacion(true);
    fijar(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  function salirPresentacion() {
    setPresentacion(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard ejecutivo', end: true },
    { to: '/gestion', icon: TableProperties, label: 'Gestión de usuarios' },
    { to: '/bitacora', icon: History, label: 'Bitácora de cambios' },
    ...(esAdmin ? [{ to: '/admin', icon: Settings, label: 'Administración' }] : []),
  ];

  const ctx: LayoutCtx = { presentacion, abrirAsistente: (pregunta) => setAsistente({ abierto: true, pregunta }) };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Barra lateral */}
      {!presentacion && (
        <>
          <aside
            className={clsx(
              'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy text-white transition-transform lg:static lg:translate-x-0',
              menu ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <div className="flex items-center gap-3 px-5 pt-6 pb-8">
              <img src="./favicon.svg" alt="" className="size-9" />
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-semibold">Remediación SAP</p>
                <p className="truncate text-[11px] text-white/55">Mandante 000 · KOF</p>
              </div>
              <button className="ml-auto lg:hidden" onClick={() => setMenu(false)} aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                      isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#FFAE41]' : 'text-white/65 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <n.icon className="size-[18px]" />
                  {n.label}
                </NavLink>
              ))}
              <button
                onClick={() => setAsistente({ abierto: true })}
                className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#ffae41]/30 bg-[#ffae41]/10 px-3 py-2.5 text-sm font-medium text-[#ffc982] transition hover:bg-[#ffae41]/20"
              >
                <Sparkles className="size-[18px]" />
                Asistente IA
              </button>
            </nav>
            <div className="border-t border-white/10 p-4">
              <p className="truncate text-sm font-medium">{perfil?.nombre ?? perfil?.email}</p>
              <p className="truncate text-xs text-white/55">{perfil && NOMBRE_ROL[perfil.rol]}</p>
              <div className="mt-3 flex flex-col items-start gap-2">
                <button onClick={() => setPassword(true)} className="flex items-center gap-2 text-xs text-white/60 hover:text-white">
                  <KeyRound className="size-3.5" /> Cambiar contraseña
                </button>
                <button onClick={salir} className="flex items-center gap-2 text-xs text-white/60 hover:text-white">
                  <LogOut className="size-3.5" /> Cerrar sesión
                </button>
              </div>
            </div>
          </aside>
          {menu && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenu(false)} />}
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        {!presentacion && (
          <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
            <button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
              <Menu className="size-5 text-ink" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className={clsx('size-2 shrink-0 rounded-full', conectado ? 'live-dot bg-good' : 'bg-muted')} />
              <span className="hidden truncate sm:inline">
                {conectado ? 'En vivo' : 'Reconectando…'} · Corte {fechaLarga(config.fecha_corte)}
                {ultimoCambio && ` · último cambio ${haceCuanto(ultimoCambio)}`}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {loc.pathname === '/' && (
                <>
                  <button onClick={entrarPresentacion} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2" title="Modo presentación">
                    <Presentation className="size-4" />
                    <span className="hidden md:inline">Presentar</span>
                  </button>
                  <button onClick={() => window.print()} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" title="Exportar a PDF / imprimir" aria-label="Imprimir">
                    <Printer className="size-4" />
                  </button>
                </>
              )}
              <button onClick={alternar} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label="Cambiar tema" title={oscuro ? 'Tema claro' : 'Tema oscuro'}>
                {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </div>
          </header>
        )}

        <main ref={mainRef} className={clsx('flex-1 overflow-y-auto scroll-thin', presentacion && 'presentacion')}>
          {presentacion && (
            <button
              onClick={salirPresentacion}
              className="no-print fixed top-3 right-3 z-50 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs text-muted backdrop-blur hover:text-ink"
            >
              Salir de presentación (Esc)
            </button>
          )}
          {cargando ? <Cargando texto="Cargando inventario…" /> : error ? <p className="p-8 text-crit">Error al cargar datos: {error}</p> : <Outlet context={ctx} />}
        </main>
      </div>

      {!asistente.abierto && !presentacion && (
        <button
          onClick={() => setAsistente({ abierto: true })}
          className="no-print fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-medium text-white shadow-xl ring-1 ring-white/10 transition hover:-translate-y-0.5 dark:bg-accent dark:text-navy"
        >
          <Sparkles className="size-4" /> Pregúntale a la IA
        </button>
      )}
      <CambiarPassword abierto={password} onCerrar={() => setPassword(false)} />
      <Asistente abierto={asistente.abierto} preguntaInicial={asistente.pregunta} onCerrar={() => setAsistente({ abierto: false })} />
    </div>
  );
}
