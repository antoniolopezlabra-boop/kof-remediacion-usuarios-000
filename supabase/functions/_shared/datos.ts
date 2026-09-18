// Lógica de datos compartida entre el frontend (Vite), el script de carga y
// las Edge Functions (Deno). TypeScript puro: sin imports de plataforma.

export interface UsuarioSap {
  id: number;
  no: number | null;
  plataforma: string | null;
  administrador: string | null;
  sistema: string | null;
  sid: string | null;
  ambiente: string | null;
  area: string | null;
  usuario: string;
  tipo_usuario: string | null;
  nombre: string | null;
  puesto: string | null;
  vigencia_raw: string | null;
  vigencia: string | null; // YYYY-MM-DD
  vigencia_tipo: 'FECHA' | 'INDEFINIDA' | 'NO DOCUMENTADA' | null;
  status_sap: string | null;
  remediacion: string | null;
  privilegio: string | null;
  privilegiado: boolean;
  observaciones: string | null;
  kit: string | null;
  cerrado_at: string | null;
  updated_at: string;
  updated_by_email: string | null;
}

export interface Estatus {
  nombre: string;
  tipo: 'En proceso' | 'Cerrado';
  orden: number;
  color: string;
  definicion: string;
}

export const SIN_CLASIFICAR = 'Sin clasificar';

// ---------------------------------------------------------------------
// Dimensiones (campos por los que se puede agrupar o filtrar)
// ---------------------------------------------------------------------
export const DIMENSIONES = {
  remediacion: 'Estatus de remediación',
  grupo_estatus: 'Grupo (En proceso / Cerrado)',
  ambiente: 'Ambiente',
  plataforma: 'Plataforma',
  administrador: 'Administrador responsable',
  sistema: 'Sistema',
  sid: 'SID',
  area: 'Área responsable',
  tipo_usuario: 'Tipo de usuario',
  puesto: 'Puesto',
  status_sap: 'Status SAP (Activo/Bloqueado…)',
  privilegio: 'Marca de privilegios (valor original de la columna: SAP_ALL, SAP_ALL & SAP_NEW, SI, X, NO)',
  vigencia_tipo: 'Tipo de vigencia',
  estado_vigencia: 'Estado de vigencia (vigente/vencida/indefinida)',
  usuario: 'Usuario (ID SAP)',
  tiene_kit: 'Tiene No. de KIT registrado',
} as const;

export type Dimension = keyof typeof DIMENSIONES;

export const ESPECIALES = {
  privilegiado: 'Solo usuarios privilegiados (marca SAP_ALL o SAP_NEW)',
  abierto: 'Solo casos abiertos (En proceso o sin clasificar)',
  cerrado: 'Solo casos cerrados (Remediado / En Orden)',
  vigencia_vencida: 'Solo usuarios con fecha de vigencia ya vencida',
  activo_vencido: 'Solo usuarios con status ACTIVO y vigencia vencida',
  nativo: 'Solo usuarios nativos de SAP (SAP*, DDIC, TMSADM…)',
  productivo: 'Solo ambiente PRODUCTIVO',
} as const;

export type Especial = keyof typeof ESPECIALES;

export interface Contexto {
  catalogo: Estatus[];
  nativos: string[];
  hoy?: string; // YYYY-MM-DD
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tipoEstatus(u: Pick<UsuarioSap, 'remediacion'>, catalogo: Estatus[]): 'En proceso' | 'Cerrado' | 'Sin clasificar' {
  if (!u.remediacion) return SIN_CLASIFICAR;
  return catalogo.find((e) => e.nombre === u.remediacion)?.tipo ?? 'En proceso';
}

export function estadoVigencia(u: UsuarioSap, hoy = hoyISO()): string {
  if (u.vigencia_tipo === 'INDEFINIDA') return 'Indefinida';
  if (u.vigencia_tipo !== 'FECHA' || !u.vigencia) return 'No documentada';
  return u.vigencia < hoy ? 'Vencida' : 'Vigente';
}

export function valorDimension(u: UsuarioSap, dim: Dimension, ctx: Contexto): string {
  switch (dim) {
    case 'remediacion':
      return u.remediacion ?? SIN_CLASIFICAR;
    case 'grupo_estatus':
      return tipoEstatus(u, ctx.catalogo);
    case 'estado_vigencia':
      return estadoVigencia(u, ctx.hoy);
    case 'tiene_kit':
      return u.kit ? 'Con KIT' : 'Sin KIT';
    default: {
      const v = u[dim as keyof UsuarioSap];
      return v === null || v === undefined || v === '' ? '(vacío)' : String(v);
    }
  }
}

export function cumpleEspecial(u: UsuarioSap, esp: Especial, ctx: Contexto): boolean {
  const hoy = ctx.hoy ?? hoyISO();
  switch (esp) {
    case 'privilegiado':
      return u.privilegiado;
    case 'abierto':
      return tipoEstatus(u, ctx.catalogo) !== 'Cerrado';
    case 'cerrado':
      return tipoEstatus(u, ctx.catalogo) === 'Cerrado';
    case 'vigencia_vencida':
      return estadoVigencia(u, hoy) === 'Vencida';
    case 'activo_vencido':
      return u.status_sap === 'ACTIVO' && estadoVigencia(u, hoy) === 'Vencida';
    case 'nativo':
      return ctx.nativos.includes((u.usuario ?? '').toUpperCase());
    case 'productivo':
      return u.ambiente === 'PRODUCTIVO';
  }
}

export interface Consulta {
  filtros?: Partial<Record<Dimension, string[]>>;
  especiales?: Especial[];
  texto?: string;
}

export function filtrar(rows: UsuarioSap[], q: Consulta, ctx: Contexto): UsuarioSap[] {
  const filtros = Object.entries(q.filtros ?? {}).filter(([, v]) => Array.isArray(v) && v.length > 0) as [Dimension, string[]][];
  const texto = q.texto?.trim().toLowerCase();
  return rows.filter((u) => {
    for (const [dim, vals] of filtros) {
      const val = valorDimension(u, dim, ctx).toLowerCase();
      if (!vals.some((v) => v.toLowerCase() === val)) return false;
    }
    for (const e of q.especiales ?? []) if (!cumpleEspecial(u, e, ctx)) return false;
    if (texto) {
      const hay = [u.usuario, u.nombre, u.sid, u.sistema, u.observaciones, u.kit, u.puesto, u.administrador]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(texto)) return false;
    }
    return true;
  });
}

export interface FilaAgregada {
  clave: string;
  total: number;
  cerrados: number;
  abiertos: number;
  avance: number; // 0..1
  series?: Record<string, number>;
}

export function agregar(rows: UsuarioSap[], dim: Dimension, ctx: Contexto, serie?: Dimension): FilaAgregada[] {
  const m = new Map<string, FilaAgregada>();
  for (const u of rows) {
    const k = valorDimension(u, dim, ctx);
    let f = m.get(k);
    if (!f) {
      f = { clave: k, total: 0, cerrados: 0, abiertos: 0, avance: 0, series: serie ? {} : undefined };
      m.set(k, f);
    }
    f.total++;
    if (tipoEstatus(u, ctx.catalogo) === 'Cerrado') f.cerrados++;
    else f.abiertos++;
    if (serie && f.series) {
      const s = valorDimension(u, serie, ctx);
      f.series[s] = (f.series[s] ?? 0) + 1;
    }
  }
  const out = [...m.values()];
  for (const f of out) f.avance = f.total ? f.cerrados / f.total : 0;
  return out.sort((a, b) => b.total - a.total);
}

export interface Resumen {
  total: number;
  cerrados: number;
  abiertos: number;
  avance: number;
  por_estatus: Record<string, number>;
  privilegiados: number;
  privilegiados_abiertos: number;
  privilegiados_abiertos_productivo: number;
  activos_vencidos: number;
  nativos: number;
  sin_kit_pendiente: number;
}

export function resumen(rows: UsuarioSap[], ctx: Contexto): Resumen {
  const por_estatus: Record<string, number> = {};
  for (const e of ctx.catalogo) por_estatus[e.nombre] = 0;
  let cerrados = 0;
  let privilegiados = 0;
  let privAb = 0;
  let privAbPrd = 0;
  let actVenc = 0;
  let nativos = 0;
  let sinKit = 0;
  for (const u of rows) {
    const e = u.remediacion ?? SIN_CLASIFICAR;
    por_estatus[e] = (por_estatus[e] ?? 0) + 1;
    const cerrado = tipoEstatus(u, ctx.catalogo) === 'Cerrado';
    if (cerrado) cerrados++;
    if (u.privilegiado) {
      privilegiados++;
      if (!cerrado) {
        privAb++;
        if (u.ambiente === 'PRODUCTIVO') privAbPrd++;
      }
    }
    if (cumpleEspecial(u, 'activo_vencido', ctx)) actVenc++;
    if (cumpleEspecial(u, 'nativo', ctx)) nativos++;
    if (u.remediacion === 'KIT pendiente de aprobación' && !u.kit) sinKit++;
  }
  return {
    total: rows.length,
    cerrados,
    abiertos: rows.length - cerrados,
    avance: rows.length ? cerrados / rows.length : 0,
    por_estatus,
    privilegiados,
    privilegiados_abiertos: privAb,
    privilegiados_abiertos_productivo: privAbPrd,
    activos_vencidos: actVenc,
    nativos,
    sin_kit_pendiente: sinKit,
  };
}

// ---------------------------------------------------------------------
// Tarjetas dinámicas (las crea el Asistente IA, se recalculan en vivo)
// ---------------------------------------------------------------------
export const TIPOS_TARJETA = ['kpi', 'barras', 'barras_apiladas', 'dona', 'tabla', 'mapa_calor', 'lista'] as const;
export type TipoTarjeta = (typeof TIPOS_TARJETA)[number];

export interface SpecTarjeta extends Consulta {
  tipo: TipoTarjeta;
  dimension?: Dimension;
  serie?: Dimension;
  top?: number;
  columnas?: (keyof UsuarioSap)[];
  metrica?: 'conteo' | 'avance';
}

export const COLUMNAS_LISTA: (keyof UsuarioSap)[] = [
  'sid', 'sistema', 'ambiente', 'usuario', 'nombre', 'tipo_usuario', 'status_sap', 'remediacion',
  'privilegio', 'administrador', 'vigencia', 'kit', 'observaciones', 'plataforma', 'puesto', 'area',
];

export function validarSpec(s: unknown): { ok: true; spec: SpecTarjeta } | { ok: false; error: string } {
  if (!s || typeof s !== 'object') return { ok: false, error: 'spec vacío' };
  const spec = s as SpecTarjeta;
  if (!TIPOS_TARJETA.includes(spec.tipo)) return { ok: false, error: `tipo inválido: ${spec.tipo}` };
  const dims = Object.keys(DIMENSIONES);
  if (spec.dimension && !dims.includes(spec.dimension)) return { ok: false, error: `dimensión inválida: ${spec.dimension}` };
  if (spec.serie && !dims.includes(spec.serie)) return { ok: false, error: `serie inválida: ${spec.serie}` };
  if (['barras', 'barras_apiladas', 'dona', 'tabla', 'mapa_calor'].includes(spec.tipo) && !spec.dimension)
    return { ok: false, error: `el tipo ${spec.tipo} requiere "dimension"` };
  if (['barras_apiladas', 'mapa_calor'].includes(spec.tipo) && !spec.serie)
    return { ok: false, error: `el tipo ${spec.tipo} requiere "serie"` };
  for (const k of Object.keys(spec.filtros ?? {})) if (!dims.includes(k)) return { ok: false, error: `filtro inválido: ${k}` };
  for (const e of spec.especiales ?? []) if (!(e in ESPECIALES)) return { ok: false, error: `especial inválido: ${e}` };
  for (const c of spec.columnas ?? []) if (!COLUMNAS_LISTA.includes(c)) return { ok: false, error: `columna inválida: ${c}` };
  return { ok: true, spec };
}

export function calcularTarjeta(rows: UsuarioSap[], spec: SpecTarjeta, ctx: Contexto) {
  const base = filtrar(rows, spec, ctx);
  if (spec.tipo === 'kpi') return { tipo: 'kpi' as const, valor: base.length, de: rows.length, avance: resumen(base, ctx).avance };
  if (spec.tipo === 'lista') {
    const cols: (keyof UsuarioSap)[] = spec.columnas?.length ? spec.columnas : ['sid', 'usuario', 'nombre', 'ambiente', 'remediacion', 'administrador'];
    return { tipo: 'lista' as const, total: base.length, columnas: cols, filas: base.slice(0, spec.top ?? 50) };
  }
  let filas = agregar(base, spec.dimension!, ctx, spec.serie);
  if (spec.top) filas = filas.slice(0, spec.top);
  return { tipo: spec.tipo as Exclude<TipoTarjeta, 'kpi' | 'lista'>, total: base.length, filas };
}

// ---------------------------------------------------------------------
// Normalización de la hoja «Consolidado» (importación de Excel)
// ---------------------------------------------------------------------
export function limpiar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

const mayus = (v: unknown) => limpiar(v)?.toUpperCase() ?? null;

function isoDesdeSerialExcel(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function iso(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Interpreta los ~10 formatos de VIGENCIA del Excel. */
export function normalizarVigencia(v: unknown): { raw: string | null; fecha: string | null; tipo: UsuarioSap['vigencia_tipo'] } {
  if (v instanceof Date) {
    const f = v.toISOString().slice(0, 10);
    return { raw: f, ...clasificarFecha(f) };
  }
  if (typeof v === 'number') {
    const f = isoDesdeSerialExcel(v);
    return { raw: String(v), ...clasificarFecha(f) };
  }
  const raw = limpiar(v);
  if (!raw) return { raw: null, fecha: null, tipo: 'NO DOCUMENTADA' };
  const up = raw.toUpperCase();
  if (up.includes('SIN VIGENCIA') || up.includes('ILIMITADA') || up.includes('INLIMITADA') || up === '00.00.0000')
    return { raw, fecha: null, tipo: 'INDEFINIDA' };
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { raw, ...clasificarFecha(iso(+m[1], +m[2], +m[3])) };
  m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return { raw, ...clasificarFecha(iso(+m[3], +m[2], +m[1])) };
  if (/^\d+(\.\d+)?$/.test(raw)) return { raw, ...clasificarFecha(isoDesdeSerialExcel(Number(raw))) };
  return { raw, fecha: null, tipo: 'NO DOCUMENTADA' };
}

function clasificarFecha(f: string | null): { fecha: string | null; tipo: UsuarioSap['vigencia_tipo'] } {
  if (!f) return { fecha: null, tipo: 'NO DOCUMENTADA' };
  // Fechas "infinitas" de SAP (31.12.9999, año ≥ 2100) = sin fecha de expiración
  if (Number(f.slice(0, 4)) >= 2100) return { fecha: null, tipo: 'INDEFINIDA' };
  return { fecha: f, tipo: 'FECHA' };
}

export function normalizarStatus(v: unknown): string | null {
  const s = mayus(v);
  if (!s) return null;
  if (s.startsWith('SIN VALIDE')) return 'SIN VALIDEZ';
  return s;
}

export function normalizarPrivilegio(v: unknown): string | null {
  const s = mayus(v);
  if (!s) return null;
  return s.replace(/\s*&\s*/g, ' & ');
}

export function normalizarRemediacion(v: unknown, catalogo: string[]): string | null {
  const s = limpiar(v);
  if (!s) return null;
  return catalogo.find((c) => c.toLowerCase() === s.toLowerCase()) ?? null;
}

export function extraerKit(obs: string | null): string | null {
  const m = obs?.match(/\b(TASK\d{5,}|RITM\d{5,}|CHG\d{5,}|REQ\d{5,})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Mapea una fila de la hoja «Consolidado» (encabezados originales) al modelo. */
export function normalizarFila(r: Record<string, unknown>, catalogo: string[]) {
  const get = (...keys: string[]) => {
    for (const k of Object.keys(r)) {
      const kk = k.replace(/\s+/g, ' ').trim().toUpperCase();
      if (keys.some((x) => kk === x)) return r[k];
    }
    return undefined;
  };
  const vig = normalizarVigencia(get('VIGENCIA'));
  const obs = limpiar(get('OBERVACIONES', 'OBSERVACIONES'));
  const noRaw = get('NO.', 'NO');
  return {
    no: noRaw === undefined || noRaw === null || noRaw === '' ? null : Number(noRaw),
    plataforma: mayus(get('PLATAFORMA')),
    administrador: limpiar(get('ADMINISTRADOR RESPONSABLE')),
    sistema: limpiar(get('SISTEMA')),
    sid: mayus(get('SID')),
    ambiente: mayus(get('AMBIENTE')),
    area: mayus(get('ÁREA RESPONSABLE', 'AREA RESPONSABLE')),
    usuario: limpiar(get('USUARIO')) ?? '',
    tipo_usuario: mayus(get('TIPO DE USUARIO')),
    nombre: limpiar(get('NOMBRE USUARIO')),
    puesto: mayus(get('PUESTO')),
    vigencia_raw: vig.raw,
    vigencia: vig.fecha,
    vigencia_tipo: vig.tipo,
    status_sap: normalizarStatus(get('STATUS')),
    remediacion: normalizarRemediacion(get('REMEDIACIÓN', 'REMEDIACION'), catalogo),
    privilegio: normalizarPrivilegio(get('PRIVILEGIOS ALTOS')),
    observaciones: obs,
    kit: extraerKit(obs),
  };
}
