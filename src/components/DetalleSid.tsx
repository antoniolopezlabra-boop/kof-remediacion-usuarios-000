import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Server, Download, ArrowRight, ShieldAlert, CalendarX2, Users, Target, CheckCircle2, ListChecks, Clock } from 'lucide-react';
import { agregar, cumpleEspecial, resumen, tipoEstatus, type UsuarioSap } from '../../supabase/functions/_shared/datos.ts';
import { useDatos } from '../lib/datos';
import { useAuth } from '../lib/auth';
import { useTema } from '../lib/tema';
import { colorSerie, fmt, ORDEN_AMBIENTES, pct, CERRADO, SIN_CLASIFICAR_COLOR } from '../lib/ui';
import { textoCelda, columna } from '../lib/columnas';
import { descargarCSV, nombreArchivo } from '../lib/csv';
import { Barra, Kpi, PildoraEstatus, Tarjeta } from './ui';
import { Th, useOrden } from './Ordenable';

const COLS: { campo: keyof UsuarioSap; etiqueta: string }[] = [
  { campo: 'usuario', etiqueta: 'Usuario' },
  { campo: 'nombre', etiqueta: 'Nombre' },
  { campo: 'tipo_usuario', etiqueta: 'Tipo' },
  { campo: 'status_sap', etiqueta: 'Status SAP' },
  { campo: 'vigencia', etiqueta: 'Vigencia' },
  { campo: 'remediacion', etiqueta: 'Remediación' },
  { campo: 'kit', etiqueta: 'No. KIT' },
  { campo: 'administrador', etiqueta: 'Administrador' },
  { campo: 'observaciones', etiqueta: 'Observaciones' },
];

/** Panel del dashboard: elegir ambiente → SID y ver su detalle completo. */
export function DetalleSid() {
  const { usuarios, catalogo, ctx } = useDatos();
  const { oscuro } = useTema();
  const { puedeEditar } = useAuth();
  const [ambiente, setAmbiente] = useState<string>('PRODUCTIVO');
  const [sistema, setSistema] = useState<string>('');
  const [sid, setSid] = useState<string>('');
  const [estatus, setEstatus] = useState<string | null>(null);
  const [soloAbiertos, setSoloAbiertos] = useState(false);
  const { orden, setOrden, ordenar } = useOrden(catalogo);

  const ambientes = useMemo(() => ORDEN_AMBIENTES.filter((a) => usuarios.some((u) => u.ambiente === a)), [usuarios]);

  // Universo acotado por los filtros de ambiente y sistema
  const base = useMemo(
    () => usuarios.filter((u) => (!ambiente || u.ambiente === ambiente) && (!sistema || u.sistema === sistema)),
    [usuarios, ambiente, sistema],
  );
  const sistemas = useMemo(
    () => [...new Set(usuarios.filter((u) => !ambiente || u.ambiente === ambiente).map((u) => u.sistema).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'es')),
    [usuarios, ambiente],
  );
  const opciones = useMemo(
    () =>
      agregar(base, 'sid', ctx)
        .map((f) => ({
          ...f,
          ambiente: base.find((u) => u.sid === f.clave)?.ambiente ?? '',
          sistemas: [...new Set(base.filter((u) => u.sid === f.clave).map((u) => u.sistema))].join(' / '),
        }))
        .sort((a, b) => a.clave.localeCompare(b.clave, 'es')),
    [base, ctx],
  );

  // Si el SID elegido ya no está en las opciones (cambió el filtro), se toma el de más pendientes
  useEffect(() => {
    if (!opciones.some((o) => o.clave === sid)) {
      const top = [...opciones].sort((a, b) => b.abiertos - a.abiertos || b.total - a.total)[0];
      setSid(top?.clave ?? '');
    }
  }, [opciones, sid]);
  useEffect(() => {
    setEstatus(null);
    setSoloAbiertos(false);
  }, [sid]);
  useEffect(() => {
    if (sistema && !sistemas.includes(sistema)) setSistema('');
  }, [sistemas, sistema]);

  const filasSid = useMemo(() => usuarios.filter((u) => u.sid === sid), [usuarios, sid]);
  const r = useMemo(() => resumen(filasSid, ctx), [filasSid, ctx]);
  const porTipo = useMemo(() => agregar(filasSid, 'tipo_usuario', ctx), [filasSid, ctx]);
  const info = useMemo(() => {
    const uniq = (k: keyof UsuarioSap) => [...new Set(filasSid.map((u) => u[k]).filter(Boolean) as string[])];
    return { ambiente: uniq('ambiente')[0], sistemas: uniq('sistema'), plataformas: uniq('plataforma'), administradores: uniq('administrador') };
  }, [filasSid]);

  const visibles = useMemo(() => {
    const f = filasSid.filter(
      (u) =>
        (!estatus || (u.remediacion ?? 'Sin clasificar') === estatus) &&
        (!soloAbiertos || tipoEstatus(u, catalogo) !== 'Cerrado'),
    );
    return ordenar(f, (u, c) => (c === 'vigencia' ? u.vigencia ?? (u.vigencia_tipo === 'INDEFINIDA' ? 'Indefinida' : null) : u[c as keyof UsuarioSap]));
  }, [filasSid, estatus, soloAbiertos, catalogo, ordenar]);

  const enProceso = r.abiertos;
  const conteos = [...catalogo.map((c) => ({ nombre: c.nombre, valor: r.por_estatus[c.nombre] ?? 0, cat: c })), ...(r.por_estatus['Sin clasificar'] ? [{ nombre: 'Sin clasificar', valor: r.por_estatus['Sin clasificar'], cat: undefined }] : [])];

  function exportar() {
    descargarCSV(
      nombreArchivo(`Detalle SID ${sid}${estatus ? ` ${estatus}` : ''}${soloAbiertos ? ' abiertos' : ''}`),
      ['SID', 'Sistema', 'Ambiente', ...COLS.map((c) => c.etiqueta)],
      visibles.map((u) => [u.sid, u.sistema, u.ambiente, ...COLS.map((c) => textoCelda(u, columna(c.campo)))]),
    );
  }

  const cC = oscuro ? CERRADO.dark : CERRADO.light;

  return (
    <div className="space-y-4">
      {/* Selectores */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Ambiente</p>
          <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Ambiente">
            {[{ v: '', l: 'Todos' }, ...ambientes.map((a) => ({ v: a, l: a }))].map((o) => (
              <button
                key={o.v || 'todos'}
                role="radio"
                aria-checked={ambiente === o.v}
                onClick={() => setAmbiente(o.v)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  ambiente === o.v ? 'bg-navy text-white shadow-sm dark:bg-accent dark:text-navy' : 'text-ink-2 hover:bg-surface',
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Sistema</span>
          <select value={sistema} onChange={(e) => setSistema(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink">
            <option value="">Todos los sistemas</option>
            {sistemas.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="block min-w-64 flex-1">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            SID {ambiente ? `(${opciones.length} en ${ambiente.toLowerCase()})` : `(${opciones.length})`}
          </span>
          <select value={sid} onChange={(e) => setSid(e.target.value)} className="h-9 w-full rounded-xl border border-accent bg-surface px-2.5 text-sm font-medium text-ink">
            {opciones.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.clave} · {o.sistemas} · {ambiente ? '' : `${o.ambiente} · `}{fmt(o.total)} usuarios · {fmt(o.abiertos)} abiertos
              </option>
            ))}
          </select>
        </label>
      </div>

      {!sid ? (
        <div className="card py-12 text-center text-sm text-muted">No hay SIDs para los filtros elegidos.</div>
      ) : (
        <>
          {/* Encabezado del SID */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface-2 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-navy text-[#ffae41]">
                <Server className="size-5" />
              </span>
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight text-ink">{sid}</p>
                <p className="text-xs text-muted">{info.ambiente}</p>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div><dt className="text-[11px] text-muted uppercase">Sistema</dt><dd className="text-ink">{info.sistemas.join(' / ')}</dd></div>
              <div><dt className="text-[11px] text-muted uppercase">Plataforma</dt><dd className="text-ink">{info.plataformas.join(' / ')}</dd></div>
              <div><dt className="text-[11px] text-muted uppercase">Administrador responsable</dt><dd className="text-ink">{info.administradores.join(', ')}</dd></div>
            </dl>
            <Link to={`/gestion?sid=${encodeURIComponent(sid)}`} className="no-print ml-auto flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              {puedeEditar ? 'Editar en Gestión' : 'Ver en Gestión'} <ArrowRight className="size-4" />
            </Link>
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi etiqueta="Usuarios" icono={<Users className="size-3.5" />} valor={fmt(r.total)} detalle={`en ${sid}`} />
            <Kpi etiqueta="Avance" icono={<Target className="size-3.5" />} valor={pct(r.avance)} detalle={`${fmt(r.cerrados)} cerrados`} acento={cC} />
            <Kpi etiqueta="Remediados" icono={<CheckCircle2 className="size-3.5" />} valor={fmt(r.por_estatus['Remediado'] ?? 0)} acento={colorSerie('#4a3aa7', oscuro)} onClick={() => setEstatus((e) => (e === 'Remediado' ? null : 'Remediado'))} activo={estatus === 'Remediado'} />
            <Kpi etiqueta="En Orden" icono={<ListChecks className="size-3.5" />} valor={fmt(r.por_estatus['En Orden'] ?? 0)} acento={colorSerie('#1baf7a', oscuro)} onClick={() => setEstatus((e) => (e === 'En Orden' ? null : 'En Orden'))} activo={estatus === 'En Orden'} />
            <Kpi etiqueta="En proceso" icono={<Clock className="size-3.5" />} valor={fmt(enProceso)} detalle="por atender" acento="var(--warn)" onClick={() => { setEstatus(null); setSoloAbiertos((v) => !v); }} activo={soloAbiertos} />
            <Kpi etiqueta="SAP_ALL / SAP_NEW" icono={<ShieldAlert className="size-3.5" />} valor={fmt(r.privilegiados)} detalle={`${fmt(r.privilegiados_abiertos)} abiertos`} acento="var(--crit)" />
            <Kpi etiqueta="Activos c/ vig. vencida" icono={<CalendarX2 className="size-3.5" />} valor={fmt(filasSid.filter((u) => cumpleEspecial(u, 'activo_vencido', ctx)).length)} acento="var(--warn)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {/* Estatus */}
            <Tarjeta className="lg:col-span-7" titulo={`Estatus de remediación en ${sid}`} subtitulo="Clic en un estatus para ver solo esos usuarios en la lista">
              <div className="space-y-2">
                {conteos.map((e) => {
                  const color = e.cat ? colorSerie(e.cat.color, oscuro) : oscuro ? SIN_CLASIFICAR_COLOR.dark : SIN_CLASIFICAR_COLOR.light;
                  const activo = estatus === e.nombre;
                  return (
                    <button
                      key={e.nombre}
                      onClick={() => { setSoloAbiertos(false); setEstatus(activo ? null : e.nombre); }}
                      disabled={e.valor === 0}
                      className={clsx('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-left transition hover:bg-surface-2 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent', activo ? 'border-accent' : 'border-transparent')}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate text-sm font-medium text-ink">{e.nombre}</span>
                        <span className={clsx('hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline', e.cat?.tipo === 'Cerrado' ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn')}>{e.cat?.tipo ?? 'Sin estatus'}</span>
                      </span>
                      <span className="text-right text-sm tabular">
                        <b className="text-ink">{fmt(e.valor)}</b> <span className="text-muted">· {pct(e.valor / Math.max(1, r.total), 0)}</span>
                      </span>
                      <span className="col-span-2"><Barra valor={e.valor / Math.max(1, r.total)} color={color} /></span>
                    </button>
                  );
                })}
              </div>
            </Tarjeta>

            {/* Por tipo de usuario */}
            <Tarjeta className="lg:col-span-5" titulo="Por tipo de usuario" subtitulo="Cerrados vs. abiertos en este SID">
              <table className="w-full text-sm tabular">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="pb-2 font-medium">Tipo</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                    <th className="pb-2 text-right font-medium">Abiertos</th>
                    <th className="w-32 pb-2 pl-3 font-medium">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {porTipo.map((t) => (
                    <tr key={t.clave} className="border-t border-line">
                      <td className="py-2 font-medium text-ink">{t.clave}</td>
                      <td className="py-2 text-right text-ink-2">{fmt(t.total)}</td>
                      <td className="py-2 text-right font-semibold text-ink">{fmt(t.abiertos)}</td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <Barra valor={t.avance} color={cC} />
                          <span className="w-9 text-right text-xs text-ink-2">{pct(t.avance, 0)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          </div>

          {/* Lista de usuarios del SID */}
          <Tarjeta
            titulo={`Usuarios de ${sid}${estatus ? ` · ${estatus}` : soloAbiertos ? ' · en proceso' : ''} (${fmt(visibles.length)})`}
            subtitulo="Clic en un encabezado para ordenar"
            acciones={
              <div className="no-print flex items-center gap-2">
                {(estatus || soloAbiertos) && (
                  <button onClick={() => { setEstatus(null); setSoloAbiertos(false); }} className="text-xs text-muted hover:text-ink">
                    Ver todos
                  </button>
                )}
                <button onClick={exportar} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink" title="Descargar esta lista en CSV">
                  <Download className="size-4" /> CSV
                </button>
              </div>
            }
          >
            <div className="max-h-[420px] overflow-auto scroll-thin rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-[1] bg-surface-2 text-left text-muted">
                  <tr>{COLS.map((c) => <Th key={c.campo} campo={c.campo} etiqueta={c.etiqueta} orden={orden} setOrden={setOrden} />)}</tr>
                </thead>
                <tbody>
                  {visibles.map((u) => (
                    <tr key={u.id} className="border-t border-line">
                      {COLS.map((c) => (
                        <td key={c.campo} className={clsx('px-2.5 py-1.5 text-ink-2', c.campo === 'observaciones' ? 'max-w-72 truncate' : 'whitespace-nowrap')} title={c.campo === 'observaciones' ? (u.observaciones ?? '') : undefined}>
                          {c.campo === 'remediacion' ? (
                            <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} compacta />
                          ) : c.campo === 'usuario' ? (
                            <span className="font-mono font-medium text-ink">
                              {u.privilegiado && <ShieldAlert className="mr-1 inline size-3 text-crit" aria-label="Privilegiado" />}
                              {u.usuario}
                            </span>
                          ) : (
                            textoCelda(u, columna(c.campo)) || '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={COLS.length} className="py-10 text-center text-muted">Sin usuarios con ese filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
