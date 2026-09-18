import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { KeyRound, X, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Boton, useAvisos } from './ui';

// Misma política que el servidor (supabase/config.toml → auth.password_requirements)
const REGLAS = [
  { txt: 'Al menos 8 caracteres', ok: (p: string) => p.length >= 8 },
  { txt: 'Una letra mayúscula', ok: (p: string) => /[A-Z]/.test(p) },
  { txt: 'Una letra minúscula', ok: (p: string) => /[a-z]/.test(p) },
  { txt: 'Un número', ok: (p: string) => /\d/.test(p) },
];

export function CambiarPassword({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { perfil } = useAuth();
  const avisar = useAvisos();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  // Solo al abrir: limpiar campos (no en cada render del layout, que borraría lo escrito)
  useEffect(() => {
    if (!abierto) return;
    setActual('');
    setNueva('');
    setConfirma('');
    setError(null);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cerrar.current();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [abierto]);

  if (!abierto || !perfil) return null;

  const cumple = REGLAS.every((r) => r.ok(nueva));
  const coincide = nueva.length > 0 && nueva === confirma;
  const distinta = nueva !== actual;
  const valido = actual.length > 0 && cumple && coincide && distinta;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    setError(null);
    // 1) Confirmar la contraseña actual (evita cambios desde una sesión olvidada abierta)
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: perfil!.email, password: actual });
    if (e1) {
      setError('La contraseña actual no es correcta.');
      setGuardando(false);
      return;
    }
    // 2) Guardar la nueva
    const { error: e2 } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (e2) {
      setError(e2.message.includes('same') ? 'La nueva contraseña debe ser distinta a la actual.' : e2.message);
      return;
    }
    avisar('Contraseña actualizada. Úsala la próxima vez que inicies sesión.');
    onCerrar();
  }

  const tipo = ver ? 'text' : 'password';
  const campo = 'mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent';

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onCerrar} />
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-password" className="fixed top-1/2 left-1/2 z-[61] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 fade-up">
        <form onSubmit={guardar} className="card p-6">
          <header className="mb-5 flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent-ink">
              <KeyRound className="size-5" />
            </span>
            <div className="flex-1">
              <h2 id="titulo-password" className="font-display text-lg font-semibold text-ink">Cambiar contraseña</h2>
              <p className="text-xs text-muted">{perfil.email}</p>
            </div>
            <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </header>

          <label className="block text-xs font-medium text-ink-2">
            Contraseña actual
            <input type={tipo} autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} className={campo} autoFocus />
          </label>
          <label className="mt-3 block text-xs font-medium text-ink-2">
            Nueva contraseña
            <input type={tipo} autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} />
          </label>
          <label className="mt-3 block text-xs font-medium text-ink-2">
            Confirmar nueva contraseña
            <input type={tipo} autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} className={campo} />
          </label>

          <button type="button" onClick={() => setVer((v) => !v)} className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            {ver ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {ver ? 'Ocultar' : 'Mostrar'} contraseñas
          </button>

          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {REGLAS.map((r) => (
              <li key={r.txt} className={clsx('flex items-center gap-1.5', r.ok(nueva) ? 'text-good' : 'text-muted')}>
                <Check className={clsx('size-3.5', !r.ok(nueva) && 'opacity-30')} /> {r.txt}
              </li>
            ))}
            <li className={clsx('col-span-2 flex items-center gap-1.5', coincide ? 'text-good' : 'text-muted')}>
              <Check className={clsx('size-3.5', !coincide && 'opacity-30')} /> Las dos contraseñas coinciden
            </li>
            {!distinta && nueva && <li className="col-span-2 text-crit">Debe ser distinta a la actual.</li>}
          </ul>

          {error && <p className="mt-4 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}

          <div className="mt-6 flex justify-end gap-2">
            <Boton type="button" variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" disabled={!valido || guardando}>
              {guardando ? 'Guardando…' : 'Guardar contraseña'}
            </Boton>
          </div>
        </form>
      </div>
    </>
  );
}
