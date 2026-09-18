import { useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Boton } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    setEnviando(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,#ffae4133,transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-52 -left-32 size-[560px] rounded-full bg-[radial-gradient(circle,#4995ff2e,transparent_65%)]" />
        <div className="relative flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="size-10" />
          <div>
            <p className="font-display text-lg font-semibold">Remediación SAP</p>
            <p className="text-xs text-white/60">DXC Technology · Coca-Cola FEMSA</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="font-display text-xs font-semibold tracking-[0.2em] text-[#ffae41] uppercase">Mandante 000</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] font-semibold tracking-tight">Remediación de usuarios SAP</h1>
          <p className="mt-5 text-base text-white/70">
            Visibilidad ejecutiva en tiempo real del avance, el riesgo y la carga de trabajo sobre el universo completo de usuarios del mandante 000.
          </p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} DXC Technology Company · Uso interno y del cliente</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={entrar} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="./favicon.svg" alt="" className="mb-4 size-10" />
            <h1 className="font-display text-2xl font-semibold">Remediación de usuarios SAP · 000</h1>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-muted">Acceso para el cliente KOF y el equipo técnico DXC.</p>

          <label className="mt-8 block text-xs font-medium text-ink-2">Correo</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
            <Mail className="size-4 text-muted" />
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder="nombre@empresa.com" />
          </div>

          <label className="mt-4 block text-xs font-medium text-ink-2">Contraseña</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
            <Lock className="size-4 text-muted" />
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 flex-1 bg-transparent text-sm outline-none" />
          </div>

          {error && <p className="mt-4 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}

          <Boton type="submit" variante="primario" disabled={enviando} className="mt-6 h-11 w-full">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Boton>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4" /> Los accesos los otorga el administrador del proyecto.
          </p>
        </form>
      </main>
    </div>
  );
}
