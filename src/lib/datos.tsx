import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import {
  filtrar,
  type Consulta,
  type Contexto,
  type Dimension,
  type Especial,
  type Estatus,
  type SpecTarjeta,
  type UsuarioSap,
} from '../../supabase/functions/_shared/datos.ts';

export interface Widget {
  id: string;
  titulo: string;
  descripcion: string | null;
  pregunta: string | null;
  spec: SpecTarjeta;
  orden: number;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
}

export interface Snapshot {
  fecha: string;
  total: number;
  por_estatus: Record<string, number>;
}

export interface EventoBitacora {
  id: number;
  usuario_sap_id: number | null;
  sid: string | null;
  usuario: string | null;
  accion: 'ALTA' | 'CAMBIO' | 'BAJA';
  cambios: Record<string, [unknown, unknown]>;
  actor_email: string | null;
  created_at: string;
}

export interface Config {
  fecha_corte?: string;
  titulo?: string;
  cliente?: string;
  usuarios_nativos?: string[];
}

// Cualquier columna editable del inventario (las calculadas por la BD quedan fuera)
export type CambiosUsuario = Partial<Omit<UsuarioSap, 'id' | 'no' | 'privilegiado' | 'cerrado_at' | 'updated_at' | 'updated_by_email'>>;

interface DatosCtx {
  cargando: boolean;
  error: string | null;
  conectado: boolean;
  usuarios: UsuarioSap[];
  catalogo: Estatus[];
  config: Config;
  widgets: Widget[];
  snapshots: Snapshot[];
  actividad: EventoBitacora[];
  ctx: Contexto;
  recientes: Set<number>;
  ultimoCambio: string | null;
  // filtros globales del dashboard (cross-filter)
  filtros: Consulta;
  filtrados: UsuarioSap[];
  alternarFiltro: (dim: Dimension, valor: string) => void;
  alternarEspecial: (e: Especial) => void;
  limpiarFiltros: () => void;
  actualizar: (ids: number[], cambios: CambiosUsuario) => Promise<void>;
  crear: (fila: CambiosUsuario) => Promise<UsuarioSap>;
  eliminar: (ids: number[]) => Promise<void>;
  recargar: () => Promise<void>;
}

const Ctx = createContext<DatosCtx | null>(null);

async function traerUsuarios(): Promise<UsuarioSap[]> {
  const out: UsuarioSap[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('usuarios_sap').select('*').order('no').range(desde, desde + 999);
    if (error) throw error;
    out.push(...(data as UsuarioSap[]));
    if (data.length < 1000) break;
  }
  return out;
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioSap[]>([]);
  const [catalogo, setCatalogo] = useState<Estatus[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [actividad, setActividad] = useState<EventoBitacora[]>([]);
  const [recientes, setRecientes] = useState<Set<number>>(new Set());
  const [ultimoCambio, setUltimoCambio] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Consulta>({ filtros: {}, especiales: [] });
  const timers = useRef(new Map<number, number>());

  const marcarReciente = useCallback((id: number) => {
    setRecientes((s) => new Set(s).add(id));
    window.clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      window.setTimeout(() => setRecientes((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      }), 4000),
    );
  }, []);

  const recargar = useCallback(async () => {
    try {
      const [u, c, cfg, w, s, b] = await Promise.all([
        traerUsuarios(),
        supabase.from('catalogo_estatus').select('*').order('orden'),
        supabase.from('app_config').select('clave, valor'),
        supabase.from('widgets_ia').select('*').order('orden'),
        supabase.from('snapshots').select('fecha, total, por_estatus').order('fecha'),
        supabase.from('bitacora').select('*').order('created_at', { ascending: false }).limit(40),
      ]);
      setUsuarios(u);
      setCatalogo((c.data ?? []) as Estatus[]);
      setConfig(Object.fromEntries((cfg.data ?? []).map((r) => [r.clave, r.valor])) as Config);
      setWidgets((w.data ?? []) as Widget[]);
      setSnapshots((s.data ?? []) as Snapshot[]);
      setActividad((b.data ?? []) as EventoBitacora[]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel('tablero')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_sap' }, (p) => {
        setUltimoCambio(new Date().toISOString());
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id: number }).id;
          setUsuarios((us) => us.filter((u) => u.id !== id));
          return;
        }
        const nuevo = p.new as UsuarioSap;
        setUsuarios((us) => {
          const i = us.findIndex((u) => u.id === nuevo.id);
          if (i === -1) return [...us, nuevo].sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
          const copia = us.slice();
          copia[i] = nuevo;
          return copia;
        });
        marcarReciente(nuevo.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'widgets_ia' }, (p) => {
        if (p.eventType === 'DELETE') setWidgets((ws) => ws.filter((w) => w.id !== (p.old as Widget).id));
        else
          setWidgets((ws) => [...ws.filter((w) => w.id !== (p.new as Widget).id), p.new as Widget].sort((a, b) => a.orden - b.orden));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snapshots' }, (p) => {
        const s = p.new as Snapshot;
        if (!s?.fecha) return;
        setSnapshots((ss) => [...ss.filter((x) => x.fecha !== s.fecha), s].sort((a, b) => a.fecha.localeCompare(b.fecha)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bitacora' }, (p) => {
        setActividad((a) => [p.new as EventoBitacora, ...a].slice(0, 40));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (p) => {
        const r = p.new as { clave: string; valor: unknown };
        if (r?.clave) setConfig((c) => ({ ...c, [r.clave]: r.valor }));
      })
      .subscribe((estado) => setConectado(estado === 'SUBSCRIBED'));
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recargar, marcarReciente]);

  const ctx = useMemo<Contexto>(() => ({ catalogo, nativos: config.usuarios_nativos ?? [] }), [catalogo, config.usuarios_nativos]);

  const filtrados = useMemo(() => filtrar(usuarios, filtros, ctx), [usuarios, filtros, ctx]);

  const alternarFiltro = useCallback((dim: Dimension, valor: string) => {
    setFiltros((f) => {
      const actuales = f.filtros?.[dim] ?? [];
      const sig = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
      return { ...f, filtros: { ...f.filtros, [dim]: sig } };
    });
  }, []);

  const alternarEspecial = useCallback((e: Especial) => {
    setFiltros((f) => {
      const act = f.especiales ?? [];
      return { ...f, especiales: act.includes(e) ? act.filter((x) => x !== e) : [...act, e] };
    });
  }, []);

  const limpiarFiltros = useCallback(() => setFiltros({ filtros: {}, especiales: [] }), []);

  const actualizar = useCallback(async (ids: number[], cambios: CambiosUsuario) => {
    if (!ids.length) return;
    const previos = new Map<number, UsuarioSap>();
    setUsuarios((us) =>
      us.map((u) => {
        if (!ids.includes(u.id)) return u;
        previos.set(u.id, u);
        return { ...u, ...cambios };
      }),
    );
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('usuarios_sap').update(cambios).in('id', ids.slice(i, i + 200));
      if (error) {
        setUsuarios((us) => us.map((u) => previos.get(u.id) ?? u));
        throw new Error(error.message);
      }
    }
  }, []);

  const crear = useCallback(async (fila: CambiosUsuario) => {
    // «No.» lo asigna la BD (consecutivo); la fila llega también por Realtime
    const { data, error } = await supabase.from('usuarios_sap').insert(fila).select('*').single();
    if (error) throw new Error(error.message);
    const nuevo = data as UsuarioSap;
    setUsuarios((us) => (us.some((u) => u.id === nuevo.id) ? us : [...us, nuevo].sort((a, b) => (a.no ?? 0) - (b.no ?? 0))));
    marcarReciente(nuevo.id);
    return nuevo;
  }, [marcarReciente]);

  const eliminar = useCallback(async (ids: number[]) => {
    const { error } = await supabase.from('usuarios_sap').delete().in('id', ids);
    if (error) throw new Error(error.message);
    setUsuarios((us) => us.filter((u) => !ids.includes(u.id)));
  }, []);

  const value: DatosCtx = {
    cargando, error, conectado, usuarios, catalogo, config, widgets, snapshots, actividad, ctx, recientes, ultimoCambio,
    filtros, filtrados, alternarFiltro, alternarEspecial, limpiarFiltros, actualizar, crear, eliminar, recargar,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDatos() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDatos fuera de DatosProvider');
  return c;
}
