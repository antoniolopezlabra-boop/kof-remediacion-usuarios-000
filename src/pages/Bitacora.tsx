import { useEffect, useMemo, useState } from 'react';
import { Download, History, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDatos, type EventoBitacora } from '../lib/datos';
import { ETIQUETAS_CAMPO, fechaHora, fmt } from '../lib/ui';
import { Boton, Cargando, PildoraEstatus } from '../components/ui';

export default function Bitacora() {
  const { catalogo, actividad } = useDatos();
  const [eventos, setEventos] = useState<EventoBitacora[] | null>(null);
  const [texto, setTexto] = useState('');
  const [actor, setActor] = useState('');

  useEffect(() => {
    supabase
      .from('bitacora')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data }) => setEventos((data ?? []) as EventoBitacora[]));
  }, [actividad[0]?.id]);

  const actores = useMemo(() => [...new Set((eventos ?? []).map((e) => e.actor_email ?? 'sistema'))].sort(), [eventos]);
  const vista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (eventos ?? []).filter(
      (e) =>
        (!actor || (e.actor_email ?? 'sistema') === actor) &&
        (!t || `${e.usuario} ${e.sid} ${JSON.stringify(e.cambios)}`.toLowerCase().includes(t)),
    );
  }, [eventos, texto, actor]);

  const cierres = vista.filter((e) => {
    const c = e.cambios.remediacion?.[1] as string | undefined;
    return c && catalogo.find((x) => x.nombre === c)?.tipo === 'Cerrado';
  }).length;

  async function exportar() {
    const XLSX = await import('xlsx');
    const filas = vista.flatMap((e) =>
      Object.entries(e.cambios).map(([k, [a, b]]) => ({
        Fecha: new Date(e.created_at).toLocaleString('es-MX'),
        Responsable: e.actor_email ?? 'sistema',
        Acción: e.accion,
        SID: e.sid,
        Usuario: e.usuario,
        Campo: ETIQUETAS_CAMPO[k] ?? k,
        Antes: a == null ? '' : String(a),
        Después: b == null ? '' : String(b),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Bitácora');
    XLSX.writeFile(wb, `Bitacora remediacion 000 - ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (!eventos) return <Cargando />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">Auditoría</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Bitácora de cambios</h1>
          <p className="mt-1 text-sm text-muted">Trazabilidad completa: quién cambió qué, cuándo y el valor anterior. Registro automático, no editable.</p>
        </div>
        <Boton onClick={exportar} disabled={!vista.length}>
          <Download className="size-4" /> Exportar
        </Boton>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Cambios registrados', fmt(vista.length)],
          ['Casos cerrados en bitácora', fmt(cierres)],
          ['Personas que actualizan', fmt(new Set(vista.map((e) => e.actor_email)).size)],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <p className="text-xs text-muted uppercase">{k}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink tabular">{v}</p>
          </div>
        ))}
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3">
          <Search className="size-4 text-muted" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar usuario, SID, KIT…" className="h-9 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm" aria-label="Responsable">
          <option value="">Todos los responsables</option>
          {actores.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>

      {vista.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-sm text-muted">
          <History className="size-6" /> Sin cambios registrados todavía.
        </div>
      ) : (
        <ol className="card divide-y divide-line">
          {vista.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="w-36 shrink-0 text-xs text-muted">
                {fechaHora(e.created_at)}
                <br />
                <span className="text-ink-2">{e.actor_email ?? 'sistema'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-ink">
                  <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{e.accion}</span>
                  <b className="font-mono">{e.usuario}</b> <span className="text-muted">· {e.sid}</span>
                </p>
                <div className="mt-1 space-y-1">
                  {Object.entries(e.cambios).map(([k, [a, b]]) => (
                    <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                      <span className="font-medium">{ETIQUETAS_CAMPO[k] ?? k}:</span>
                      {k === 'remediacion' ? (
                        <>
                          <PildoraEstatus nombre={(a as string) ?? null} catalogo={catalogo} compacta /> → <PildoraEstatus nombre={(b as string) ?? null} catalogo={catalogo} compacta />
                        </>
                      ) : (
                        <>
                          <span className="line-through opacity-60">{String(a ?? '—')}</span> → <span className="text-ink">{String(b ?? '—')}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
