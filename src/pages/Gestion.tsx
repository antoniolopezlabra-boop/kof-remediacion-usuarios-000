import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Search, Download, ChevronLeft, ChevronRight, X, PanelRightOpen, Save, ShieldAlert, ArrowUpDown, CheckSquare, History } from 'lucide-react';
import { filtrar, estadoVigencia, type Consulta, type Dimension, type Especial, type UsuarioSap } from '../../supabase/functions/_shared/datos.ts';
import { useDatos, type CambiosUsuario, type EventoBitacora } from '../lib/datos';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ETIQUETAS_CAMPO, fechaHora, fmt, ORDEN_AMBIENTES } from '../lib/ui';
import { Boton, PildoraEstatus, useAvisos } from '../components/ui';

const POR_PAGINA = 50;
type Orden = { campo: keyof UsuarioSap; dir: 1 | -1 };

const FILTROS_SELECT: { dim: Dimension; etiqueta: string }[] = [
  { dim: 'remediacion', etiqueta: 'Estatus' },
  { dim: 'sistema', etiqueta: 'Sistema' },
  { dim: 'sid', etiqueta: 'SID' },
  { dim: 'ambiente', etiqueta: 'Ambiente' },
  { dim: 'administrador', etiqueta: 'Administrador' },
  { dim: 'plataforma', etiqueta: 'Plataforma' },
  { dim: 'tipo_usuario', etiqueta: 'Tipo' },
];

const TOGGLES: { esp: Especial; etiqueta: string }[] = [
  { esp: 'abierto', etiqueta: 'Solo abiertos' },
  { esp: 'privilegiado', etiqueta: 'SAP_ALL / SAP_NEW' },
  { esp: 'activo_vencido', etiqueta: 'Activo + vigencia vencida' },
  { esp: 'nativo', etiqueta: 'Nativos SAP' },
];

export default function Gestion() {
  const { usuarios, catalogo, ctx, actualizar, recientes } = useDatos();
  const { puedeEditar } = useAuth();
  const avisar = useAvisos();
  const [params] = useSearchParams();

  const [texto, setTexto] = useState('');
  const [sel, setSel] = useState<Partial<Record<Dimension, string>>>({});
  const [esp, setEsp] = useState<Especial[]>(() => TOGGLES.map((t) => t.esp).filter((e) => params.get(e) === '1'));
  const [pagina, setPagina] = useState(0);
  const [orden, setOrden] = useState<Orden>({ campo: 'no', dir: 1 });
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [detalle, setDetalle] = useState<number | null>(null);
  const [masivo, setMasivo] = useState<{ remediacion: string; kit: string }>({ remediacion: '', kit: '' });

  const consulta: Consulta = useMemo(
    () => ({ texto, especiales: esp, filtros: Object.fromEntries(Object.entries(sel).filter(([, v]) => v).map(([k, v]) => [k, [v!]])) }),
    [texto, esp, sel],
  );
  const filas = useMemo(() => {
    const f = filtrar(usuarios, consulta, ctx);
    return f.sort((a, b) => {
      const x = a[orden.campo] ?? '';
      const y = b[orden.campo] ?? '';
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * orden.dir;
    });
  }, [usuarios, consulta, ctx, orden]);

  useEffect(() => setPagina(0), [consulta]);

  const opciones = useMemo(() => {
    const o: Partial<Record<Dimension, string[]>> = {};
    for (const { dim } of FILTROS_SELECT) {
      // opciones dependientes del resto de filtros (p. ej. SIDs del sistema elegido)
      const otros = { ...consulta, filtros: Object.fromEntries(Object.entries(consulta.filtros ?? {}).filter(([k]) => k !== dim)) };
      const base = filtrar(usuarios, { ...otros, texto: undefined }, ctx);
      const vals = [...new Set(base.map((u) => (dim === 'remediacion' ? (u.remediacion ?? 'Sin clasificar') : String(u[dim as keyof UsuarioSap] ?? '(vacío)'))))];
      if (dim === 'remediacion') vals.sort((a, b) => (catalogo.find((c) => c.nombre === a)?.orden ?? 99) - (catalogo.find((c) => c.nombre === b)?.orden ?? 99));
      else if (dim === 'ambiente') vals.sort((a, b) => ORDEN_AMBIENTES.indexOf(a) - ORDEN_AMBIENTES.indexOf(b));
      else vals.sort((a, b) => a.localeCompare(b, 'es'));
      o[dim] = vals;
    }
    return o;
  }, [usuarios, consulta, ctx, catalogo]);

  const conteo = useMemo(() => {
    const m: Record<string, number> = {};
    const { remediacion: _r, ...resto } = consulta.filtros ?? {};
    for (const u of filtrar(usuarios, { ...consulta, filtros: resto }, ctx)) m[u.remediacion ?? 'Sin clasificar'] = (m[u.remediacion ?? 'Sin clasificar'] ?? 0) + 1;
    return m;
  }, [usuarios, consulta, ctx]);

  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const vista = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const todosVista = vista.length > 0 && vista.every((u) => marcados.has(u.id));

  async function guardar(ids: number[], cambios: CambiosUsuario, msg?: string) {
    try {
      await actualizar(ids, cambios);
      avisar(msg ?? (ids.length === 1 ? 'Cambio guardado · el dashboard ya se actualizó' : `${fmt(ids.length)} usuarios actualizados`));
    } catch (e) {
      avisar(`No se pudo guardar: ${(e as Error).message}`, 'error');
    }
  }

  async function aplicarMasivo() {
    const cambios: CambiosUsuario = {};
    if (masivo.remediacion) cambios.remediacion = masivo.remediacion;
    if (masivo.kit.trim()) cambios.kit = masivo.kit.trim().toUpperCase();
    if (!Object.keys(cambios).length) return;
    await guardar([...marcados], cambios);
    setMarcados(new Set());
    setMasivo({ remediacion: '', kit: '' });
  }

  async function exportar() {
    const XLSX = await import('xlsx');
    const datos = filas.map((u) => ({
      'No.': u.no, PLATAFORMA: u.plataforma, 'ADMINISTRADOR RESPONSABLE': u.administrador, SISTEMA: u.sistema, SID: u.sid, AMBIENTE: u.ambiente,
      'ÁREA RESPONSABLE': u.area, USUARIO: u.usuario, 'TIPO DE USUARIO': u.tipo_usuario, 'NOMBRE USUARIO': u.nombre, PUESTO: u.puesto,
      VIGENCIA: u.vigencia ?? (u.vigencia_tipo === 'INDEFINIDA' ? 'SIN VIGENCIA' : u.vigencia_raw), STATUS: u.status_sap, 'Remediación': u.remediacion,
      'PRIVILEGIOS ALTOS': u.privilegio, 'No. KIT': u.kit, OBSERVACIONES: u.observaciones, 'Última actualización': u.updated_at ? new Date(u.updated_at).toLocaleString('es-MX') : '',
      'Actualizado por': u.updated_by_email,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = Object.keys(datos[0] ?? {}).map((k) => ({ wch: Math.min(40, Math.max(8, k.length + 2)) }));
    ws['!autofilter'] = { ref: ws['!ref']! };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
    XLSX.writeFile(wb, `Usuarios SAP 000 - ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const encabezado = (campo: keyof UsuarioSap, etiqueta: string, className?: string) => (
    <th className={clsx('px-3 py-2.5 font-medium whitespace-nowrap', className)}>
      <button onClick={() => setOrden((o) => ({ campo, dir: o.campo === campo ? ((-o.dir) as 1 | -1) : 1 }))} className="inline-flex items-center gap-1 hover:text-ink">
        {etiqueta}
        <ArrowUpDown className={clsx('size-3', orden.campo === campo ? 'text-accent-ink' : 'opacity-40')} />
      </button>
    </th>
  );

  const usuarioDetalle = usuarios.find((u) => u.id === detalle) ?? null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">Operación</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Gestión de usuarios · Mandante 000</h1>
          <p className="mt-1 text-sm text-muted">
            {puedeEditar
              ? 'Actualiza el estatus conforme avancen los KITs. Cada cambio queda en la bitácora y los dashboards se recalculan al instante.'
              : 'Vista de consulta del inventario. Solo el equipo técnico puede modificar estatus.'}
          </p>
        </div>
        <Boton onClick={exportar}>
          <Download className="size-4" /> Exportar a Excel ({fmt(filas.length)})
        </Boton>
      </header>

      {/* Chips de estatus */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSel((s) => ({ ...s, remediacion: undefined }))} className={clsx('rounded-full border px-3 py-1.5 text-xs font-medium', !sel.remediacion ? 'border-navy bg-navy text-white dark:border-accent dark:bg-accent dark:text-navy' : 'border-line bg-surface text-ink-2')}>
          Todos · {fmt(Object.values(conteo).reduce((a, b) => a + b, 0))}
        </button>
        {[...catalogo.map((c) => c.nombre), ...(conteo['Sin clasificar'] ? ['Sin clasificar'] : [])].map((n) => (
          <button key={n} onClick={() => setSel((s) => ({ ...s, remediacion: s.remediacion === n ? undefined : n }))} className={clsx('rounded-full transition', sel.remediacion === n && 'ring-2 ring-accent')}>
            <PildoraEstatus nombre={n === 'Sin clasificar' ? null : n} catalogo={catalogo} conteo={conteo[n] ?? 0} />
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3">
          <Search className="size-4 text-muted" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar usuario, nombre, KIT, observación…" className="h-9 flex-1 bg-transparent text-sm outline-none" />
          {texto && (
            <button onClick={() => setTexto('')} aria-label="Limpiar búsqueda">
              <X className="size-4 text-muted" />
            </button>
          )}
        </div>
        {FILTROS_SELECT.filter((f) => f.dim !== 'remediacion').map(({ dim, etiqueta }) => (
          <select
            key={dim}
            value={sel[dim] ?? ''}
            onChange={(e) => setSel((s) => ({ ...s, [dim]: e.target.value || undefined }))}
            className={clsx('h-9 max-w-44 rounded-xl border bg-surface px-2.5 text-sm text-ink outline-none', sel[dim] ? 'border-accent' : 'border-line')}
            aria-label={etiqueta}
          >
            <option value="">{etiqueta}: todos</option>
            {opciones[dim]?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {TOGGLES.map((t) => (
            <button
              key={t.esp}
              onClick={() => setEsp((e) => (e.includes(t.esp) ? e.filter((x) => x !== t.esp) : [...e, t.esp]))}
              className={clsx('h-9 rounded-xl border px-3 text-xs font-medium', esp.includes(t.esp) ? 'border-accent bg-accent/15 text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2')}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
        {(texto || esp.length || Object.values(sel).some(Boolean)) && (
          <button onClick={() => { setTexto(''); setEsp([]); setSel({}); }} className="text-xs text-muted hover:text-ink">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Barra de edición masiva */}
      {puedeEditar && marcados.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/50 bg-surface p-3 shadow-lg fade-up">
          <CheckSquare className="size-4 text-accent-ink" />
          <span className="text-sm font-medium text-ink">{fmt(marcados.size)} seleccionados</span>
          <select value={masivo.remediacion} onChange={(e) => setMasivo((m) => ({ ...m, remediacion: e.target.value }))} className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm" aria-label="Nuevo estatus">
            <option value="">Cambiar estatus a…</option>
            {catalogo.map((c) => <option key={c.nombre}>{c.nombre}</option>)}
          </select>
          <input value={masivo.kit} onChange={(e) => setMasivo((m) => ({ ...m, kit: e.target.value }))} placeholder="No. KIT (opcional)" className="h-9 w-44 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" />
          <Boton variante="primario" onClick={aplicarMasivo} disabled={!masivo.remediacion && !masivo.kit.trim()}>
            Aplicar
          </Boton>
          <Boton variante="fantasma" onClick={() => setMarcados(new Set())}>
            Cancelar
          </Boton>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {puedeEditar && (
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar página"
                      checked={todosVista}
                      onChange={() =>
                        setMarcados((m) => {
                          const n = new Set(m);
                          vista.forEach((u) => (todosVista ? n.delete(u.id) : n.add(u.id)));
                          return n;
                        })
                      }
                    />
                  </th>
                )}
                {encabezado('no', 'No.')}
                {encabezado('sid', 'SID')}
                {encabezado('sistema', 'Sistema')}
                {encabezado('ambiente', 'Ambiente')}
                {encabezado('usuario', 'Usuario')}
                {encabezado('remediacion', 'Remediación', 'min-w-52')}
                {encabezado('kit', 'No. KIT')}
                {encabezado('nombre', 'Nombre')}
                {encabezado('tipo_usuario', 'Tipo')}
                {encabezado('status_sap', 'Status SAP')}
                {encabezado('vigencia', 'Vigencia')}
                {encabezado('administrador', 'Administrador')}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {vista.map((u) => {
                const venc = estadoVigencia(u);
                return (
                  <tr key={u.id} className={clsx('border-t border-line hover:bg-surface-2/60', recientes.has(u.id) && 'flash', marcados.has(u.id) && 'bg-accent/5')}>
                    {puedeEditar && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${u.usuario}`}
                          checked={marcados.has(u.id)}
                          onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted tabular">{u.no}</td>
                    <td className="px-3 py-2 font-medium text-ink">{u.sid}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-2">{u.sistema}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{u.ambiente}</td>
                    <td className="px-3 py-2 font-mono text-[13px] whitespace-nowrap text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {u.privilegiado && <ShieldAlert className="size-3.5 text-crit" aria-label={`Privilegiado: ${u.privilegio}`} />}
                        {u.usuario}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {puedeEditar ? (
                        <select
                          value={u.remediacion ?? ''}
                          onChange={(e) => guardar([u.id], { remediacion: e.target.value || null })}
                          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink outline-none focus:border-accent"
                          aria-label={`Estatus de ${u.usuario}`}
                        >
                          <option value="">Sin clasificar</option>
                          {catalogo.map((c) => <option key={c.nombre}>{c.nombre}</option>)}
                        </select>
                      ) : (
                        <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} compacta />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {puedeEditar ? (
                        <CeldaKit valor={u.kit} onGuardar={(v) => guardar([u.id], { kit: v })} />
                      ) : (
                        <span className="font-mono text-xs text-ink-2">{u.kit ?? '—'}</span>
                      )}
                    </td>
                    <td className="max-w-48 truncate px-3 py-2 text-ink-2" title={u.nombre ?? ''}>{u.nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{u.tipo_usuario}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{u.status_sap ?? '—'}</td>
                    <td className={clsx('px-3 py-2 text-xs whitespace-nowrap', venc === 'Vencida' ? 'font-medium text-crit' : 'text-ink-2')}>
                      {u.vigencia ?? (u.vigencia_tipo === 'INDEFINIDA' ? 'Indefinida' : '—')}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-2">{u.administrador}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => setDetalle(u.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Ver detalle de ${u.usuario}`} title="Detalle e historial">
                        <PanelRightOpen className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {vista.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-sm text-muted">
                    Ningún usuario coincide con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
          <span>
            {fmt(filas.length)} usuarios · página {pagina + 1} de {paginas}
          </span>
          <div className="flex gap-1">
            <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </button>
            <button disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Página siguiente">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </footer>
      </div>

      {usuarioDetalle && <Detalle u={usuarioDetalle} onCerrar={() => setDetalle(null)} onGuardar={(c) => guardar([usuarioDetalle.id], c)} />}
    </div>
  );
}

function CeldaKit({ valor, onGuardar }: { valor: string | null; onGuardar: (v: string | null) => void }) {
  const [v, setV] = useState(valor ?? '');
  useEffect(() => setV(valor ?? ''), [valor]);
  const confirmar = () => {
    const limpio = v.trim().toUpperCase() || null;
    if (limpio !== (valor ?? null)) onGuardar(limpio);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="—"
      className="h-8 w-32 rounded-lg border border-transparent bg-transparent px-2 font-mono text-xs text-ink outline-none hover:border-line focus:border-accent focus:bg-surface"
      aria-label="Número de KIT"
    />
  );
}

const CAMPOS_EDITABLES: { campo: keyof CambiosUsuario; tipo?: 'textarea' | 'estatus' }[] = [
  { campo: 'remediacion', tipo: 'estatus' },
  { campo: 'kit' },
  { campo: 'observaciones', tipo: 'textarea' },
  { campo: 'status_sap' },
  { campo: 'privilegio' },
  { campo: 'administrador' },
  { campo: 'nombre' },
  { campo: 'puesto' },
  { campo: 'area' },
];

function Detalle({ u, onCerrar, onGuardar }: { u: UsuarioSap; onCerrar: () => void; onGuardar: (c: CambiosUsuario) => Promise<void> }) {
  const { catalogo } = useDatos();
  const { puedeEditar } = useAuth();
  const [form, setForm] = useState<CambiosUsuario>({});
  const [historial, setHistorial] = useState<EventoBitacora[] | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setForm({});
    supabase
      .from('bitacora')
      .select('*')
      .eq('usuario_sap_id', u.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistorial((data ?? []) as EventoBitacora[]));
  }, [u.id, u.updated_at]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);

  const valor = (c: keyof CambiosUsuario) => (c in form ? form[c] : u[c]) ?? '';
  const sucio = Object.keys(form).length > 0;

  async function guardar() {
    setGuardando(true);
    const limpio = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : k === 'kit' ? v.trim().toUpperCase() : v.trim()) : v]));
    await onGuardar(limpio as CambiosUsuario);
    setForm({});
    setGuardando(false);
  }

  const info: [string, string | number | null][] = [
    ['No.', u.no], ['Plataforma', u.plataforma], ['Sistema', u.sistema], ['SID', u.sid], ['Ambiente', u.ambiente], ['Tipo de usuario', u.tipo_usuario],
    ['Vigencia', u.vigencia ?? u.vigencia_tipo], ['Vigencia (dato original)', u.vigencia_raw], ['Última actualización', `${fechaHora(u.updated_at)}${u.updated_by_email ? ` · ${u.updated_by_email}` : ''}`],
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCerrar} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface shadow-2xl fade-up" aria-label={`Detalle de ${u.usuario}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{u.sid} · {u.sistema} · {u.ambiente}</p>
            <h2 className="font-mono text-lg font-semibold text-ink">{u.usuario}</h2>
            <p className="truncate text-sm text-ink-2">{u.nombre ?? 'Sin nombre registrado'}</p>
          </div>
          <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} />
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto scroll-thin p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {info.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-muted uppercase">{k}</dt>
                <dd className="text-ink">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{puedeEditar ? 'Actualizar' : 'Datos de remediación'}</h3>
            {CAMPOS_EDITABLES.map(({ campo, tipo }) => (
              <label key={campo} className="block">
                <span className="text-xs font-medium text-ink-2">{ETIQUETAS_CAMPO[campo]}</span>
                {tipo === 'estatus' ? (
                  <select disabled={!puedeEditar} value={valor(campo) as string} onChange={(e) => setForm((f) => ({ ...f, remediacion: e.target.value || null }))} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm disabled:opacity-70">
                    <option value="">Sin clasificar</option>
                    {catalogo.map((c) => <option key={c.nombre}>{c.nombre}</option>)}
                  </select>
                ) : tipo === 'textarea' ? (
                  <textarea disabled={!puedeEditar} rows={3} value={valor(campo) as string} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-70" />
                ) : (
                  <input disabled={!puedeEditar} value={valor(campo) as string} onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-70" />
                )}
              </label>
            ))}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
              <History className="size-3.5" /> Historial de cambios
            </h3>
            {historial === null ? (
              <p className="text-xs text-muted">Cargando…</p>
            ) : historial.length === 0 ? (
              <p className="text-xs text-muted">Sin cambios desde la carga inicial del reporte.</p>
            ) : (
              <ol className="space-y-3 border-l border-line pl-4">
                {historial.map((h) => (
                  <li key={h.id} className="relative text-xs">
                    <span className="absolute top-1 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent" />
                    <p className="text-muted">{fechaHora(h.created_at)} · {h.actor_email ?? 'sistema'}</p>
                    {Object.entries(h.cambios).map(([k, [a, b]]) => (
                      <p key={k} className="text-ink-2">
                        <b>{ETIQUETAS_CAMPO[k] ?? k}:</b> <span className="line-through opacity-60">{String(a ?? '—')}</span> → <span className="text-ink">{String(b ?? '—')}</span>
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        {puedeEditar && (
          <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Boton variante="fantasma" onClick={() => setForm({})} disabled={!sucio}>
              Descartar
            </Boton>
            <Boton variante="primario" onClick={guardar} disabled={!sucio || guardando}>
              <Save className="size-4" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
          </footer>
        )}
      </aside>
    </>
  );
}
