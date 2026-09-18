import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import type { Estatus } from '../../supabase/functions/_shared/datos.ts';
import { colorSerie, SIN_CLASIFICAR_COLOR } from '../lib/ui';
import { useTema } from '../lib/tema';

export function Seccion({
  id,
  numero,
  titulo,
  descripcion,
  acciones,
  children,
}: {
  id?: string;
  numero?: string;
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="seccion scroll-mt-20 fade-up">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {numero && <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">{numero}</p>}
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">{titulo}</h2>
          {descripcion && <p className="mt-1 max-w-3xl text-sm text-muted">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      {children}
    </section>
  );
}

export function Tarjeta({ titulo, subtitulo, acciones, children, className }: { titulo?: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('card min-w-0 p-4 sm:p-5', className)}>
      {(titulo || acciones) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h3 className="text-sm font-semibold text-ink">{titulo}</h3>}
            {subtitulo && <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>}
          </div>
          {acciones}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({
  etiqueta,
  valor,
  detalle,
  acento,
  icono,
  onClick,
  activo,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  acento?: string;
  icono?: ReactNode;
  onClick?: () => void;
  activo?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'card relative overflow-hidden p-4 text-left transition',
        onClick && 'hover:-translate-y-0.5 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent',
        activo && 'ring-2 ring-accent',
      )}
    >
      {acento && <span className="absolute inset-y-0 left-0 w-1" style={{ background: acento }} />}
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        {icono}
        <span>{etiqueta}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink tabular">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-muted">{detalle}</div>}
    </Comp>
  );
}

export function PildoraEstatus({ nombre, catalogo, compacta, conteo }: { nombre: string | null; catalogo: Estatus[]; compacta?: boolean; conteo?: number }) {
  const { oscuro } = useTema();
  const e = catalogo.find((c) => c.nombre === nombre);
  const color = e ? colorSerie(e.color, oscuro) : oscuro ? SIN_CLASIFICAR_COLOR.dark : SIN_CLASIFICAR_COLOR.light;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 font-medium whitespace-nowrap text-ink-2', compacta ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      {nombre ?? 'Sin clasificar'}
      {conteo !== undefined && <span className="text-muted tabular">· {conteo.toLocaleString('es-MX')}</span>}
    </span>
  );
}

export function Boton({
  children,
  variante = 'secundario',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro' }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variante === 'primario' && 'bg-navy text-white hover:bg-[#1b1f3a] dark:bg-accent dark:text-navy dark:hover:bg-[#ffc06a]',
        variante === 'secundario' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variante === 'fantasma' && 'text-ink-2 hover:bg-surface-2',
        variante === 'peligro' && 'border border-crit/30 text-crit hover:bg-crit/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Barra({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, valor * 100)}%`, background: color ?? 'var(--brand)' }} />
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center gap-3 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {texto}
    </div>
  );
}

// ---------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------
type TipoAviso = 'ok' | 'error' | 'info';
interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}
const AvisosCtx = createContext<(texto: string, tipo?: TipoAviso) => void>(() => {});

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: TipoAviso = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 3500);
  }, []);
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className="card pointer-events-auto flex items-start gap-2.5 px-4 py-3 text-sm fade-up">
            {a.tipo === 'ok' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />}
            {a.tipo === 'error' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-crit" />}
            {a.tipo === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-brand" />}
            <span className="flex-1 text-ink">{a.texto}</span>
            <button onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))} aria-label="Cerrar" className="text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

export const useAvisos = () => useContext(AvisosCtx);
