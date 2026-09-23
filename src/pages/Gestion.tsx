import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Search, Download, ChevronLeft, ChevronRight, X, PanelRightOpen, Save, ShieldAlert, ArrowUpDown, CheckSquare, History, Plus, Copy, Trash2,
} from 'lucide-react';
import { filtrar, estadoVigencia, type Consulta, type Dimension, type Especial, type UsuarioSap } from '../../supabase/functions/_shared/datos.ts';
import { useDatos, type CambiosUsuario, type EventoBitacora } from '../lib/datos';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { COLUMNAS, cambioDesdeTexto, textoCelda, type Columna } from '../lib/columnas';
import { ETIQUETAS_CAMPO, fechaHora, fmt, ORDEN_AMBIENTES } from '../lib/ui';
import { Boton, PildoraEstatus, useAvisos } from '../components/ui';

const POR_PAGINA = 50;
const usuariosTxt = (n: number) => `${fmt(n)} ${n === 1 ? 'usuario' : 'usuarios'}`;
type Orden = { campo: keyof UsuarioSap; dir: 1 | -1 };
type Dir = 'derecha' | 'izquierda' | 'abajo' | 'arriba';

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

// Columnas que no tiene sentido cambiar en bloque (identifican a cada usuario)
const NO_MASIVAS: (keyof UsuarioSap)[] = ['usuario', 'nombre'];

export default function Gestion() {
  const { usuarios, catalogo, ctx, actualizar, eliminar, recientes } = useDatos();
  const { puedeEditar, esAdmin } = useAuth();
  const avisar = useAvisos();
  const [params] = useSearchParams();

  const [texto, setTexto] = useState('');
  // Filtros iniciales desde la URL (p. ej. «Editar en Gestión» del Detalle por SID: ?sid=RAP)
  const [sel, setSel] = useState<Partial<Record<Dimension, string>>>(() => {
    const ini: Partial<Record<Dimension, string>> = {};
    for (const d of ['sid', 'sistema', 'ambiente'] as Dimension[]) {
      const v = params.get(d);
      if (v) ini[d] = v;
    }
    return ini;
  });
  const [esp, setEsp] = useState<Especial[]>(() => TOGGLES.map((t) => t.esp).filter((e) => params.get(e) === '1'));
  const [pagina, setPagina] = useState(0);
  const [orden, setOrden] = useState<Orden>({ campo: 'no', dir: 1 });
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [detalle, setDetalle] = useState<number | null>(null);
  const [alta, setAlta] = useState<{ abierto: boolean; base?: Partial<UsuarioSap> }>({ abierto: false });
  const [edit, setEdit] = useState<{ fila: number; col: number } | null>(null);
  const [masivo, setMasivo] = useState<{ campo: keyof UsuarioSap; valor: string }>({ campo: 'remediacion', valor: '' });

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

  useEffect(() => {
    setPagina(0);
    setEdit(null);
  }, [consulta]);

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

  // Sugerencias por columna (valores ya existentes en todo el inventario)
  const sugerencias = useMemo(() => {
    const m: Partial<Record<keyof UsuarioSap, string[]>> = {};
    for (const c of COLUMNAS.filter((c) => c.tipo === 'lista')) {
      m[c.campo] = [...new Set(usuarios.map((u) => u[c.campo]).filter((v): v is string => typeof v === 'string' && v !== ''))].sort((a, b) => a.localeCompare(b, 'es'));
    }
    return m;
  }, [usuarios]);

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
      avisar(msg ?? (ids.length === 1 ? 'Cambio guardado · el dashboard ya se actualizó' : `${usuariosTxt(ids.length)} actualizados`));
    } catch (e) {
      avisar(`No se pudo guardar: ${(e as Error).message}`, 'error');
    }
  }

  async function guardarCelda(u: UsuarioSap, c: Columna, valor: string) {
    if (valor.trim() === textoCelda(u, c)) return;
    if (c.requerido && !valor.trim()) {
      avisar(`«${c.etiqueta}» no puede quedar vacío.`, 'error');
      return;
    }
    await guardar([u.id], cambioDesdeTexto(c, valor));
  }

  // Recorre las celdas de texto como en Excel; Remediación (selector) se salta
  function navegar(dir: Dir) {
    const editables = COLUMNAS.map((c, i) => (c.tipo === 'estatus' ? -1 : i)).filter((i) => i >= 0);
    setEdit((e) => {
      if (!e) return e;
      const pos = editables.indexOf(e.col);
      if (dir === 'derecha') {
        if (pos < editables.length - 1) return { ...e, col: editables[pos + 1] };
        return e.fila < vista.length - 1 ? { fila: e.fila + 1, col: editables[0] } : null;
      }
      if (dir === 'izquierda') return pos > 0 ? { ...e, col: editables[pos - 1] } : e;
      if (dir === 'abajo') return e.fila < vista.length - 1 ? { ...e, fila: e.fila + 1 } : null;
      return e.fila > 0 ? { ...e, fila: e.fila - 1 } : e;
    });
  }

  async function aplicarMasivo() {
    const c = COLUMNAS.find((x) => x.campo === masivo.campo)!;
    if (c.requerido && !masivo.valor.trim()) {
      avisar(`«${c.etiqueta}» no puede quedar vacío.`, 'error');
      return;
    }
    await guardar([...marcados], cambioDesdeTexto(c, masivo.valor), `«${c.etiqueta}» actualizado en ${usuariosTxt(marcados.size)}`);
    setMarcados(new Set());
    setMasivo((m) => ({ ...m, valor: '' }));
  }

  async function eliminarMarcados() {
    if (!window.confirm(`¿Eliminar ${usuariosTxt(marcados.size)} del inventario? Quedará registrado en la bitácora y no se puede deshacer.`)) return;
    try {
      await eliminar([...marcados]);
      avisar(`${usuariosTxt(marcados.size)} eliminado${marcados.size === 1 ? '' : 's'}`);
      setMarcados(new Set());
    } catch (e) {
      avisar(`No se pudo eliminar: ${(e as Error).message}`, 'error');
    }
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
    <th key={campo} className={clsx('px-3 py-2.5 font-medium whitespace-nowrap', className)}>
      <button onClick={() => setOrden((o) => ({ campo, dir: o.campo === campo ? ((-o.dir) as 1 | -1) : 1 }))} className="inline-flex items-center gap-1 hover:text-ink">
        {etiqueta}
        <ArrowUpDown className={clsx('size-3', orden.campo === campo ? 'text-accent-ink' : 'opacity-40')} />
      </button>
    </th>
  );

  const usuarioDetalle = usuarios.find((u) => u.id === detalle) ?? null;
  const colMasiva = COLUMNAS.find((c) => c.campo === masivo.campo)!;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      {/* Sugerencias de valores para las celdas tipo lista */}
      {COLUMNAS.filter((c) => c.tipo === 'lista').map((c) => (
        <datalist key={c.campo} id={`dl-${c.campo}`}>
          {sugerencias[c.campo]?.map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">Operación</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Gestión de usuarios · Mandante 000</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {puedeEditar
              ? 'Haz clic en cualquier celda para editarla (Enter o Tab guarda y avanza, Esc cancela). Cada cambio queda en la bitácora y los dashboards se recalculan al instante.'
              : 'Vista de consulta del inventario. Solo el equipo técnico puede modificar la información.'}
          </p>
        </div>
        <div className="flex gap-2">
          {puedeEditar && (
            <Boton variante="primario" onClick={() => setAlta({ abierto: true })}>
              <Plus className="size-4" /> Agregar usuario
            </Boton>
          )}
          <Boton onClick={exportar}>
            <Download className="size-4" /> Exportar a Excel ({fmt(filas.length)})
          </Boton>
        </div>
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

      {/* Barra de edición masiva: cualquier columna */}
      {puedeEditar && marcados.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/50 bg-surface p-3 shadow-lg fade-up">
          <CheckSquare className="size-4 text-accent-ink" />
          <span className="text-sm font-medium text-ink">{fmt(marcados.size)} seleccionados</span>
          <span className="text-sm text-muted">· cambiar</span>
          <select
            value={masivo.campo}
            onChange={(e) => setMasivo({ campo: e.target.value as keyof UsuarioSap, valor: '' })}
            className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm"
            aria-label="Columna a cambiar"
          >
            {COLUMNAS.filter((c) => !NO_MASIVAS.includes(c.campo)).map((c) => (
              <option key={c.campo} value={c.campo}>
                {c.etiqueta}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">a</span>
          {colMasiva.tipo === 'estatus' ? (
            <select value={masivo.valor} onChange={(e) => setMasivo((m) => ({ ...m, valor: e.target.value }))} className="h-9 rounded-xl border border-line bg-surface px-2.5 text-sm" aria-label="Nuevo valor">
              <option value="">Sin clasificar</option>
              {catalogo.map((c) => <option key={c.nombre}>{c.nombre}</option>)}
            </select>
          ) : (
            <input
              value={masivo.valor}
              onChange={(e) => setMasivo((m) => ({ ...m, valor: e.target.value }))}
              list={colMasiva.tipo === 'lista' ? `dl-${colMasiva.campo}` : undefined}
              placeholder={colMasiva.tipo === 'vigencia' ? 'AAAA-MM-DD o Indefinida' : 'Nuevo valor (vacío = borrar)'}
              className="h-9 w-56 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
              aria-label="Nuevo valor"
            />
          )}
          <Boton variante="primario" onClick={aplicarMasivo}>
            Aplicar
          </Boton>
          <Boton variante="fantasma" onClick={() => setMarcados(new Set())}>
            Cancelar
          </Boton>
          {esAdmin && (
            <Boton variante="peligro" onClick={eliminarMarcados} className="ml-auto">
              <Trash2 className="size-4" /> Eliminar
            </Boton>
          )}
        </div>
      )}

      {/* Tabla tipo hoja de cálculo */}
      <div className="card overflow-hidden">
        <div className="max-h-[70vh] overflow-auto scroll-thin">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
              <tr>
                {puedeEditar && (
                  <th className="sticky left-0 z-20 w-10 bg-surface-2 px-3 py-2.5">
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
                {encabezado('no', 'No.', clsx('sticky z-20 bg-surface-2', puedeEditar ? 'left-10' : 'left-0'))}
                {COLUMNAS.map((c) => encabezado(c.campo, c.etiqueta, c.ancho))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {vista.map((u, fila) => (
                <tr key={u.id} className={clsx('group', recientes.has(u.id) && 'flash', marcados.has(u.id) && 'bg-accent/5')}>
                  {puedeEditar && (
                    <td className="sticky left-0 z-[5] border-t border-line bg-surface px-3 py-1.5 group-hover:bg-surface-2">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${u.usuario}`}
                        checked={marcados.has(u.id)}
                        onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                      />
                    </td>
                  )}
                  <td className={clsx('sticky z-[5] border-t border-line bg-surface px-3 py-1.5 text-muted tabular group-hover:bg-surface-2', puedeEditar ? 'left-10' : 'left-0')}>{u.no}</td>
                  {COLUMNAS.map((c, col) => (
                    <Celda
                      key={c.campo}
                      u={u}
                      c={c}
                      editable={puedeEditar}
                      activa={edit?.fila === fila && edit.col === col}
                      onActivar={() => setEdit({ fila, col })}
                      onGuardar={(v) => guardarCelda(u, c, v)}
                      onSalir={(dir) => (dir ? navegar(dir) : setEdit(null))}
                      onEstatus={(v) => guardar([u.id], { remediacion: v || null })}
                    />
                  ))}
                  <td className="border-t border-line px-2 py-1.5">
                    <button onClick={() => setDetalle(u.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Ver detalle de ${u.usuario}`} title="Detalle e historial">
                      <PanelRightOpen className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {vista.length === 0 && (
                <tr>
                  <td colSpan={COLUMNAS.length + 3} className="py-16 text-center text-sm text-muted">
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
            <button disabled={pagina === 0} onClick={() => { setPagina((p) => p - 1); setEdit(null); }} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </button>
            <button disabled={pagina >= paginas - 1} onClick={() => { setPagina((p) => p + 1); setEdit(null); }} className="rounded-lg border border-line p-1.5 disabled:opacity-40" aria-label="Página siguiente">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </footer>
      </div>

      {usuarioDetalle && (
        <Detalle
          u={usuarioDetalle}
          onCerrar={() => setDetalle(null)}
          onGuardar={(c) => guardar([usuarioDetalle.id], c)}
          onDuplicar={() => {
            const { usuario: _u, nombre: _n, kit: _k, observaciones: _o, ...base } = usuarioDetalle;
            setDetalle(null);
            setAlta({ abierto: true, base });
          }}
        />
      )}
      {alta.abierto && <AltaUsuario base={alta.base} onCerrar={() => setAlta({ abierto: false })} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Celda editable
// ---------------------------------------------------------------------
function Celda({
  u, c, editable, activa, onActivar, onGuardar, onSalir, onEstatus,
}: {
  u: UsuarioSap;
  c: Columna;
  editable: boolean;
  activa: boolean;
  onActivar: () => void;
  onGuardar: (valor: string) => void;
  onSalir: (dir?: Dir) => void;
  onEstatus: (valor: string) => void;
}) {
  const { catalogo } = useDatos();
  const valor = textoCelda(u, c);
  const [borrador, setBorrador] = useState(valor);
  const cancelado = useRef(false);

  useEffect(() => {
    if (activa) {
      setBorrador(valor);
      cancelado.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa]);

  const base = clsx('border-t border-line px-3 py-1.5 align-middle', c.ancho);

  // Remediación: selector directo (flujo principal del TQS)
  if (c.tipo === 'estatus') {
    return (
      <td className={base}>
        {editable ? (
          <select
            value={u.remediacion ?? ''}
            onChange={(e) => onEstatus(e.target.value)}
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink outline-none focus:border-accent"
            aria-label={`Remediación de ${u.usuario}`}
          >
            <option value="">Sin clasificar</option>
            {catalogo.map((e) => <option key={e.nombre}>{e.nombre}</option>)}
          </select>
        ) : (
          <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} compacta />
        )}
      </td>
    );
  }

  if (activa && editable) {
    return (
      <td className={clsx(base, 'bg-accent/10 p-0.5')}>
        <input
          autoFocus
          value={borrador}
          list={c.tipo === 'lista' ? `dl-${c.campo}` : undefined}
          placeholder={c.tipo === 'vigencia' ? 'AAAA-MM-DD o Indefinida' : ''}
          onChange={(e) => setBorrador(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            // Enter/Tab/Esc ya resolvieron la celda (y quizá movieron el foco a la siguiente)
            if (cancelado.current) return;
            onGuardar(borrador);
            onSalir();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelado.current = true;
              onSalir();
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              cancelado.current = true; // se guarda aquí, no en el blur
              onGuardar(borrador);
              onSalir(e.key === 'Tab' ? (e.shiftKey ? 'izquierda' : 'derecha') : e.shiftKey ? 'arriba' : 'abajo');
            }
          }}
          className={clsx('h-8 w-full rounded-md border border-accent bg-surface px-2 text-sm text-ink outline-none', c.mono && 'font-mono text-[13px]')}
          aria-label={`${c.etiqueta} de ${u.usuario}`}
        />
      </td>
    );
  }

  const vencida = c.tipo === 'vigencia' && estadoVigencia(u) === 'Vencida';
  return (
    <td
      className={clsx(base, editable && 'cursor-text hover:bg-accent/5', c.tipo === 'largo' ? 'max-w-80' : 'whitespace-nowrap')}
      onClick={editable ? onActivar : undefined}
      title={c.tipo === 'largo' ? valor : undefined}
    >
      <span
        className={clsx(
          'block truncate',
          c.mono ? 'font-mono text-[13px]' : 'text-[13px]',
          c.campo === 'usuario' || c.campo === 'sid' ? 'font-medium text-ink' : 'text-ink-2',
          vencida && 'font-medium text-crit',
          !valor && 'text-muted/50',
        )}
      >
        {c.campo === 'usuario' && u.privilegiado && <ShieldAlert className="mr-1 inline size-3.5 text-crit" aria-label={`Privilegiado: ${u.privilegio}`} />}
        {valor || '—'}
      </span>
    </td>
  );
}

// ---------------------------------------------------------------------
// Alta de usuario (nueva fila)
// ---------------------------------------------------------------------
function AltaUsuario({ base, onCerrar }: { base?: Partial<UsuarioSap>; onCerrar: () => void }) {
  const { catalogo, crear } = useDatos();
  const avisar = useAvisos();
  const inicial = () =>
    Object.fromEntries(COLUMNAS.map((c) => [c.campo, base ? textoCelda(base, c) : c.campo === 'remediacion' ? 'En Validación' : ''])) as Record<string, string>;
  const [f, setF] = useState<Record<string, string>>(inicial);
  const [guardando, setGuardando] = useState(false);
  const faltan = COLUMNAS.filter((c) => c.requerido && !f[c.campo]?.trim());

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);

  async function enviar(otro: boolean) {
    if (faltan.length) return;
    setGuardando(true);
    try {
      const fila = Object.assign({}, ...COLUMNAS.map((c) => cambioDesdeTexto(c, f[c.campo] ?? ''))) as CambiosUsuario;
      const nuevo = await crear(fila);
      avisar(`Usuario ${nuevo.usuario} agregado con el No. ${nuevo.no}`);
      if (otro) {
        // Conserva el contexto (SID, sistema, ambiente…) para capturar varios seguidos
        setF((x) => ({ ...x, usuario: '', nombre: '', kit: '', observaciones: '' }));
      } else onCerrar();
    } catch (e) {
      avisar(`No se pudo agregar: ${(e as Error).message}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCerrar} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface shadow-2xl fade-up" aria-label="Agregar usuario">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent-ink">
            <Plus className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold text-ink">Agregar usuario al inventario</h2>
            <p className="text-xs text-muted">El «No.» se asigna solo (siguiente consecutivo). Campos con * son obligatorios.</p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>
        <form
          className="flex-1 space-y-3 overflow-y-auto scroll-thin p-5"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {COLUMNAS.map((c) => (
              <label key={c.campo} className={clsx('block', (c.tipo === 'largo' || c.campo === 'nombre') && 'col-span-2')}>
                <span className="text-xs font-medium text-ink-2">
                  {c.etiqueta}
                  {c.requerido && <span className="text-crit"> *</span>}
                </span>
                {c.tipo === 'estatus' ? (
                  <select value={f[c.campo]} onChange={(e) => setF({ ...f, [c.campo]: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm">
                    <option value="">Sin clasificar</option>
                    {catalogo.map((e) => <option key={e.nombre}>{e.nombre}</option>)}
                  </select>
                ) : c.tipo === 'largo' ? (
                  <textarea rows={3} value={f[c.campo]} onChange={(e) => setF({ ...f, [c.campo]: e.target.value })} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
                ) : (
                  <input
                    value={f[c.campo]}
                    list={c.tipo === 'lista' ? `dl-${c.campo}` : undefined}
                    placeholder={c.tipo === 'vigencia' ? 'AAAA-MM-DD o Indefinida' : ''}
                    onChange={(e) => setF({ ...f, [c.campo]: e.target.value })}
                    className={clsx('mt-1 h-10 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus:border-accent', c.requerido && !f[c.campo]?.trim() ? 'border-warn/50' : 'border-line', c.mono && 'font-mono')}
                  />
                )}
              </label>
            ))}
          </div>
          <button type="submit" className="hidden" />
        </form>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          {faltan.length > 0 && <span className="mr-auto text-xs text-warn">Falta: {faltan.map((c) => c.etiqueta).join(', ')}</span>}
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => enviar(true)} disabled={!!faltan.length || guardando}>
            Guardar y agregar otro
          </Boton>
          <Boton variante="primario" onClick={() => enviar(false)} disabled={!!faltan.length || guardando}>
            <Save className="size-4" /> {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </footer>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------
// Panel de detalle: todas las columnas + historial
// ---------------------------------------------------------------------
function Detalle({ u, onCerrar, onGuardar, onDuplicar }: { u: UsuarioSap; onCerrar: () => void; onGuardar: (c: CambiosUsuario) => Promise<void>; onDuplicar: () => void }) {
  const { catalogo, eliminar } = useDatos();
  const { puedeEditar, esAdmin } = useAuth();
  const avisar = useAvisos();
  const [form, setForm] = useState<Record<string, string>>({});
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

  const valor = (c: Columna) => (c.campo in form ? form[c.campo] : textoCelda(u, c));
  const sucio = Object.keys(form).length > 0;
  const vacios = COLUMNAS.filter((c) => c.requerido && c.campo in form && !form[c.campo].trim());

  async function guardar() {
    if (vacios.length) return;
    setGuardando(true);
    const cambios = Object.assign({}, ...COLUMNAS.filter((c) => c.campo in form).map((c) => cambioDesdeTexto(c, form[c.campo]))) as CambiosUsuario;
    await onGuardar(cambios);
    setForm({});
    setGuardando(false);
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar a ${u.usuario} (${u.sid}) del inventario? Quedará en la bitácora y no se puede deshacer.`)) return;
    try {
      await eliminar([u.id]);
      avisar(`${u.usuario} eliminado del inventario`);
      onCerrar();
    } catch (e) {
      avisar(`No se pudo eliminar: ${(e as Error).message}`, 'error');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCerrar} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface shadow-2xl fade-up" aria-label={`Detalle de ${u.usuario}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">No. {u.no} · {u.sid} · {u.sistema} · {u.ambiente}</p>
            <h2 className="font-mono text-lg font-semibold text-ink">{u.usuario}</h2>
            <p className="truncate text-sm text-ink-2">{u.nombre ?? 'Sin nombre registrado'}</p>
          </div>
          <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} />
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto scroll-thin p-5">
          <p className="text-xs text-muted">
            Última actualización: {fechaHora(u.updated_at)}
            {u.updated_by_email ? ` · ${u.updated_by_email}` : ''}
            {u.vigencia_raw ? ` · vigencia original: «${u.vigencia_raw}»` : ''}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {COLUMNAS.map((c) => (
              <label key={c.campo} className={clsx('block', (c.tipo === 'largo' || c.campo === 'nombre') && 'col-span-2')}>
                <span className="text-xs font-medium text-ink-2">
                  {c.etiqueta}
                  {c.requerido && puedeEditar && <span className="text-crit"> *</span>}
                </span>
                {c.tipo === 'estatus' ? (
                  <select disabled={!puedeEditar} value={valor(c)} onChange={(e) => setForm((f) => ({ ...f, [c.campo]: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm disabled:opacity-70">
                    <option value="">Sin clasificar</option>
                    {catalogo.map((e) => <option key={e.nombre}>{e.nombre}</option>)}
                  </select>
                ) : c.tipo === 'largo' ? (
                  <textarea disabled={!puedeEditar} rows={3} value={valor(c)} onChange={(e) => setForm((f) => ({ ...f, [c.campo]: e.target.value }))} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-70" />
                ) : (
                  <input
                    disabled={!puedeEditar}
                    value={valor(c)}
                    list={c.tipo === 'lista' ? `dl-${c.campo}` : undefined}
                    placeholder={c.tipo === 'vigencia' ? 'AAAA-MM-DD o Indefinida' : ''}
                    onChange={(e) => setForm((f) => ({ ...f, [c.campo]: e.target.value }))}
                    className={clsx('mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-70', c.mono && 'font-mono')}
                  />
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
                    <p className="text-muted">{fechaHora(h.created_at)} · {h.actor_email ?? 'sistema'} · {h.accion === 'ALTA' ? 'alta de fila' : h.accion === 'BAJA' ? 'baja' : 'cambio'}</p>
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
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            {esAdmin && (
              <Boton variante="peligro" onClick={borrar} title="Eliminar del inventario">
                <Trash2 className="size-4" />
              </Boton>
            )}
            <Boton variante="fantasma" onClick={onDuplicar} title="Crear una fila nueva con los mismos datos de sistema">
              <Copy className="size-4" /> Duplicar
            </Boton>
            {vacios.length > 0 && <span className="text-xs text-warn">Obligatorio: {vacios.map((c) => c.etiqueta).join(', ')}</span>}
            <div className="ml-auto flex gap-2">
              <Boton variante="fantasma" onClick={() => setForm({})} disabled={!sucio}>
                Descartar
              </Boton>
              <Boton variante="primario" onClick={guardar} disabled={!sucio || guardando || vacios.length > 0}>
                <Save className="size-4" /> {guardando ? 'Guardando…' : 'Guardar'}
              </Boton>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
