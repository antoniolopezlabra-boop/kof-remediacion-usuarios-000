import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { UserPlus, Upload, Settings2, KeyRound, Trash2, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { normalizarFila } from '../../supabase/functions/_shared/datos.ts';
import { supabase, llamarFuncion } from '../lib/supabase';
import { useAuth, NOMBRE_ROL, type Perfil, type Rol } from '../lib/auth';
import { useDatos } from '../lib/datos';
import { fmt } from '../lib/ui';
import { Boton, Tarjeta, useAvisos } from '../components/ui';

type Pestana = 'accesos' | 'importar' | 'config';

export default function Admin() {
  const [pestana, setPestana] = useState<Pestana>('accesos');
  const tabs: { id: Pestana; label: string; icon: typeof UserPlus }[] = [
    { id: 'accesos', label: 'Accesos', icon: UserPlus },
    { id: 'importar', label: 'Importar Excel', icon: Upload },
    { id: 'config', label: 'Configuración', icon: Settings2 },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <p className="font-display text-xs font-semibold tracking-[0.18em] text-accent-ink uppercase">Administración</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Accesos, carga de datos y configuración</h1>
      </header>
      <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setPestana(t.id)} className={clsx('flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium', pestana === t.id ? 'bg-navy text-white dark:bg-accent dark:text-navy' : 'text-ink-2 hover:bg-surface-2')}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {pestana === 'accesos' && <Accesos />}
      {pestana === 'importar' && <Importar />}
      {pestana === 'config' && <Configuracion />}
    </div>
  );
}

function Accesos() {
  const { perfil: yo } = useAuth();
  const avisar = useAvisos();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'editor' as Rol, password: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = () => supabase.from('perfiles').select('*').order('created_at').then(({ data }) => setPerfiles((data ?? []) as Perfil[]));
  useEffect(() => {
    cargar();
  }, []);

  async function accion(body: Record<string, unknown>, ok: string) {
    try {
      await llamarFuncion('admin-usuarios', body);
      avisar(ok);
      cargar();
      return true;
    } catch (e) {
      avisar((e as Error).message, 'error');
      return false;
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    if (await accion({ accion: 'crear', ...nuevo }, `Acceso creado para ${nuevo.email}`)) setNuevo({ email: '', nombre: '', rol: 'editor', password: '' });
    setEnviando(false);
  }

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Nuevo acceso" subtitulo="Comparte la contraseña temporal por un canal seguro; el usuario puede pedir que se la cambies.">
        <form onSubmit={crear} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.9fr_1fr_auto]">
          <input required type="email" placeholder="correo@empresa.com" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" />
          <input placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as Rol })} className="h-10 rounded-xl border border-line bg-surface px-2 text-sm" aria-label="Rol">
            {(['lector', 'editor', 'admin'] as Rol[]).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
          </select>
          <input required minLength={8} type="text" placeholder="Contraseña temporal" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" />
          <Boton variante="primario" type="submit" disabled={enviando}>Crear</Boton>
        </form>
      </Tarjeta>

      <div className="card divide-y divide-line">
        {perfiles.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{p.nombre ?? p.email}{p.id === yo?.id && <span className="ml-2 text-xs text-muted">(tú)</span>}</p>
              <p className="truncate text-xs text-muted">{p.email}</p>
            </div>
            <select value={p.rol} disabled={p.id === yo?.id} onChange={(e) => accion({ accion: 'actualizar', id: p.id, rol: e.target.value }, 'Rol actualizado')} className="h-9 rounded-xl border border-line bg-surface px-2 text-sm disabled:opacity-60" aria-label={`Rol de ${p.email}`}>
              {(['lector', 'editor', 'admin'] as Rol[]).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
            </select>
            <button
              onClick={() => {
                const pw = window.prompt(`Nueva contraseña para ${p.email} (mínimo 8 caracteres):`);
                if (pw) accion({ accion: 'actualizar', id: p.id, password: pw }, 'Contraseña actualizada');
              }}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
              title="Cambiar contraseña"
              aria-label={`Cambiar contraseña de ${p.email}`}
            >
              <KeyRound className="size-4" />
            </button>
            {p.id !== yo?.id && (
              <button
                onClick={() => window.confirm(`¿Eliminar el acceso de ${p.email}? Esta acción no se puede deshacer.`) && accion({ accion: 'eliminar', id: p.id }, 'Acceso eliminado')}
                className="rounded-lg p-2 text-muted hover:bg-crit/10 hover:text-crit"
                title="Eliminar acceso"
                aria-label={`Eliminar acceso de ${p.email}`}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type Registro = ReturnType<typeof normalizarFila>;

function Importar() {
  const { usuarios, catalogo, recargar } = useDatos();
  const avisar = useAvisos();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [modo, setModo] = useState<'nuevos' | 'todo'>('nuevos');
  const [aplicando, setAplicando] = useState(false);

  async function leer(f: File) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets['Consolidado'] ?? wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
    const regs = filas.map((r) => normalizarFila(r, catalogo.map((c) => c.nombre))).filter((r) => r.usuario && r.no != null);
    setArchivo(f.name);
    setRegistros(regs);
  }

  const porNo = new Map(usuarios.map((u) => [u.no, u]));
  const nuevos = registros?.filter((r) => !porNo.has(r.no)) ?? [];
  const existentes = registros?.filter((r) => porNo.has(r.no)) ?? [];
  const cambiosEstatus = existentes.filter((r) => porNo.get(r.no)?.remediacion !== r.remediacion);
  const aEnviar = modo === 'nuevos' ? nuevos : (registros ?? []);

  async function aplicar() {
    setAplicando(true);
    try {
      for (let i = 0; i < aEnviar.length; i += 300) {
        const { error } = await supabase.from('usuarios_sap').upsert(aEnviar.slice(i, i + 300), { onConflict: 'no' });
        if (error) throw error;
      }
      avisar(`${fmt(aEnviar.length)} registros cargados`);
      setRegistros(null);
      setArchivo(null);
      await recargar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Cargar hoja «Consolidado»" subtitulo="Mismo formato del reporte de remediación. Los usuarios se identifican por la columna «No.». Los datos se normalizan al cargar (mayúsculas, espacios, formatos de vigencia).">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center hover:border-accent">
          <FileSpreadsheet className="size-8 text-muted" />
          <span className="text-sm font-medium text-ink">{archivo ?? 'Selecciona el archivo .xlsx'}</span>
          <span className="text-xs text-muted">Se procesa en tu navegador; nada se guarda hasta que confirmes.</span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        </label>
      </Tarjeta>

      {registros && (
        <Tarjeta titulo="Vista previa">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Filas válidas', registros.length],
              ['Usuarios nuevos', nuevos.length],
              ['Existentes con otro estatus', cambiosEstatus.length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 p-3">
                <p className="font-display text-2xl font-semibold text-ink tabular">{fmt(v as number)}</p>
                <p className="text-xs text-muted">{k}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" checked={modo === 'nuevos'} onChange={() => setModo('nuevos')} className="mt-1" />
              <span><b>Solo agregar usuarios nuevos</b> <span className="text-muted">— recomendado. Respeta los estatus que el equipo ya actualizó en la plataforma.</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={modo === 'todo'} onChange={() => setModo('todo')} className="mt-1" />
              <span><b>Actualizar todo con el Excel</b> <span className="text-muted">— sobrescribe estatus, KIT y observaciones de los {fmt(existentes.length)} existentes.</span></span>
            </label>
          </div>
          {modo === 'todo' && cambiosEstatus.length > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
              <AlertTriangle className="size-4" /> {fmt(cambiosEstatus.length)} usuarios cambiarán de estatus. Quedará registrado en la bitácora.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => { setRegistros(null); setArchivo(null); }}>Cancelar</Boton>
            <Boton variante="primario" onClick={aplicar} disabled={aplicando || aEnviar.length === 0}>
              {aplicando ? 'Cargando…' : `Cargar ${fmt(aEnviar.length)} registros`}
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function Configuracion() {
  const { config } = useDatos();
  const avisar = useAvisos();
  const [f, setF] = useState({ fecha_corte: '', titulo: '', cliente: '', usuarios_nativos: '' });
  useEffect(() => {
    setF({
      fecha_corte: config.fecha_corte ?? '',
      titulo: config.titulo ?? '',
      cliente: config.cliente ?? '',
      usuarios_nativos: (config.usuarios_nativos ?? []).join(', '),
    });
  }, [config]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const filas = [
      { clave: 'fecha_corte', valor: f.fecha_corte },
      { clave: 'titulo', valor: f.titulo },
      { clave: 'cliente', valor: f.cliente },
      { clave: 'usuarios_nativos', valor: f.usuarios_nativos.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) },
    ];
    const { error } = await supabase.from('app_config').upsert(filas.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) avisar(error.message, 'error');
    else avisar('Configuración guardada');
  }

  const campo = (k: keyof typeof f, etiqueta: string, tipo = 'text', ayuda?: string) => (
    <label className="block">
      <span className="text-xs font-medium text-ink-2">{etiqueta}</span>
      <input type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent" />
      {ayuda && <span className="mt-1 block text-xs text-muted">{ayuda}</span>}
    </label>
  );

  return (
    <Tarjeta titulo="Parámetros del tablero">
      <form onSubmit={guardar} className="space-y-4">
        {campo('titulo', 'Título del reporte')}
        {campo('cliente', 'Cliente')}
        {campo('fecha_corte', 'Fecha de corte del reporte base', 'date')}
        {campo('usuarios_nativos', 'Usuarios nativos SAP', 'text', 'Separados por coma. Se usan para el indicador «Nativos SAP».')}
        <div className="flex justify-end">
          <Boton variante="primario" type="submit">Guardar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
