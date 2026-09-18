import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Sparkles, X, Send, Trash2, LayoutGrid, Loader2 } from 'lucide-react';
import { llamarFuncion } from '../lib/supabase';
import { markdown } from '../lib/markdown';
import { useAuth } from '../lib/auth';

interface Mensaje {
  rol: 'user' | 'assistant';
  texto: string;
  tarjetas?: string[];
  error?: boolean;
}

const SUGERENCIAS = [
  '¿Cuáles son los 5 SIDs con más usuarios pendientes en PRODUCTIVO?',
  '¿Qué usuarios con SAP_ALL siguen abiertos y quién es su responsable?',
  '¿Cuántos usuarios activos tienen la vigencia vencida, por sistema?',
  'Dame el avance por tipo de usuario (Diálogo, System, Service)',
  '¿Qué administrador tiene más KITs pendientes de aprobación?',
];

const PASOS = ['Leyendo el inventario…', 'Consultando los datos…', 'Cruzando dimensiones…', 'Redactando la respuesta…'];

export function Asistente({ abierto, preguntaInicial, onCerrar }: { abierto: boolean; preguntaInicial?: string; onCerrar: () => void }) {
  const { perfil } = useAuth();
  const clave = `asistente:${perfil?.id}`;
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(clave) ?? '[]');
    } catch {
      return [];
    }
  });
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [paso, setPaso] = useState(0);
  const fin = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const enviada = useRef<string | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(mensajes.slice(-40)));
    } catch {
      /* sin almacenamiento */
    }
    fin.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, clave]);

  useEffect(() => {
    if (!pensando) return;
    setPaso(0);
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 2500);
    return () => clearInterval(t);
  }, [pensando]);

  useEffect(() => {
    if (abierto) setTimeout(() => input.current?.focus(), 150);
    if (abierto && preguntaInicial && enviada.current !== preguntaInicial) {
      enviada.current = preguntaInicial;
      enviar(preguntaInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, preguntaInicial]);

  async function enviar(q: string) {
    const pregunta = q.trim();
    if (!pregunta || pensando) return;
    const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { rol: 'user', texto: pregunta }];
    setMensajes((m) => [...m, { rol: 'user', texto: pregunta }]);
    setTexto('');
    setPensando(true);
    try {
      const r = await llamarFuncion<{ texto: string; tarjetas: string[] }>('asistente', {
        mensajes: historial.slice(-12).map(({ rol, texto }) => ({ rol, texto })),
      });
      setMensajes((m) => [...m, { rol: 'assistant', texto: r.texto, tarjetas: r.tarjetas }]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'assistant', texto: (e as Error).message, error: true }]);
    } finally {
      setPensando(false);
    }
  }

  return (
    <>
      {abierto && <div className="no-print fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden" onClick={onCerrar} />}
      <aside
        aria-label="Asistente IA"
        className={clsx(
          'no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-2xl transition-transform duration-300',
          abierto ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl bg-navy text-[#ffae41]">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-ink">Asistente de remediación</p>
            <p className="text-xs text-muted">Responde con los datos en vivo · crea tarjetas en el dashboard</p>
          </div>
          {mensajes.length > 0 && (
            <button onClick={() => setMensajes([])} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title="Nueva conversación" aria-label="Nueva conversación">
              <Trash2 className="size-4" />
            </button>
          )}
          <button onClick={onCerrar} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Cerrar asistente">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto scroll-thin px-5 py-5">
          {mensajes.length === 0 && (
            <div className="fade-up">
              <p className="text-sm text-ink-2">
                Pregunta lo que necesites sobre el inventario del mandante 000. Si la respuesta no está en el dashboard, la agrego como tarjeta en <b>Insights IA</b> para que quede visible y se actualice sola.
              </p>
              <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted uppercase">Prueba con</p>
              <div className="space-y-2">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="block w-full rounded-xl border border-line px-3.5 py-2.5 text-left text-sm text-ink-2 transition hover:border-accent hover:bg-surface-2">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mensajes.map((m, i) =>
            m.rol === 'user' ? (
              <div key={i} className="ml-10 rounded-2xl rounded-tr-md bg-navy px-4 py-2.5 text-sm text-white dark:bg-[#2a2f4d]">
                {m.texto}
              </div>
            ) : (
              <div key={i} className={clsx('mr-4 rounded-2xl rounded-tl-md border px-4 py-3 text-sm fade-up', m.error ? 'border-crit/30 bg-crit/5 text-crit' : 'border-line bg-surface-2 text-ink')}>
                {m.error ? m.texto : <div className="md" dangerouslySetInnerHTML={{ __html: markdown(m.texto) }} />}
                {!!m.tarjetas?.length && (
                  <button
                    onClick={() => {
                      onCerrar();
                      navigate(`/?tarjeta=${m.tarjetas![m.tarjetas!.length - 1]}`);
                    }}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-accent/25"
                  >
                    <LayoutGrid className="size-3.5" />
                    {m.tarjetas.length === 1 ? 'Tarjeta agregada al dashboard · ver' : `${m.tarjetas.length} tarjetas agregadas · ver`}
                  </button>
                )}
              </div>
            ),
          )}
          {pensando && (
            <div className="mr-4 flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> {PASOS[paso]}
            </div>
          )}
          <div ref={fin} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
          className="border-t border-line p-4"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-2 p-2 focus-within:border-accent">
            <textarea
              ref={input}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              placeholder="Escribe tu pregunta…"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none"
            />
            <button type="submit" disabled={!texto.trim() || pensando} className="grid size-9 place-items-center rounded-xl bg-navy text-white disabled:opacity-40 dark:bg-accent dark:text-navy" aria-label="Enviar">
              <Send className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Respuestas generadas con Claude a partir del inventario vivo. Verifica decisiones críticas.</p>
        </form>
      </aside>
    </>
  );
}
