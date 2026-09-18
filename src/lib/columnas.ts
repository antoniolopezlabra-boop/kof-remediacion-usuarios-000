// Definición de las columnas editables del inventario (hoja «Consolidado»).
// Una sola fuente para la tabla, el panel de detalle, el alta de filas y la edición masiva.
import {
  normalizarPrivilegio,
  normalizarStatus,
  normalizarVigencia,
  limpiar,
  type UsuarioSap,
} from '../../supabase/functions/_shared/datos.ts';

export type TipoColumna = 'texto' | 'lista' | 'estatus' | 'vigencia' | 'largo';

export interface Columna {
  campo: keyof UsuarioSap;
  etiqueta: string;
  tipo: TipoColumna;
  ancho: string; // clase Tailwind de ancho mínimo
  requerido?: boolean;
  mayusculas?: boolean;
  mono?: boolean;
}

export const COLUMNAS: Columna[] = [
  { campo: 'plataforma', etiqueta: 'Plataforma', tipo: 'lista', ancho: 'min-w-28', requerido: true, mayusculas: true },
  { campo: 'administrador', etiqueta: 'Administrador', tipo: 'lista', ancho: 'min-w-36', requerido: true },
  { campo: 'sistema', etiqueta: 'Sistema', tipo: 'lista', ancho: 'min-w-28', requerido: true },
  { campo: 'sid', etiqueta: 'SID', tipo: 'lista', ancho: 'min-w-16', requerido: true, mayusculas: true },
  { campo: 'ambiente', etiqueta: 'Ambiente', tipo: 'lista', ancho: 'min-w-32', requerido: true, mayusculas: true },
  { campo: 'area', etiqueta: 'Área', tipo: 'lista', ancho: 'min-w-32', mayusculas: true },
  { campo: 'usuario', etiqueta: 'Usuario', tipo: 'texto', ancho: 'min-w-36', requerido: true, mono: true },
  { campo: 'tipo_usuario', etiqueta: 'Tipo', tipo: 'lista', ancho: 'min-w-28', mayusculas: true },
  { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', ancho: 'min-w-44' },
  { campo: 'puesto', etiqueta: 'Puesto', tipo: 'lista', ancho: 'min-w-32', mayusculas: true },
  { campo: 'vigencia', etiqueta: 'Vigencia', tipo: 'vigencia', ancho: 'min-w-32' },
  { campo: 'status_sap', etiqueta: 'Status SAP', tipo: 'lista', ancho: 'min-w-28', mayusculas: true },
  { campo: 'remediacion', etiqueta: 'Remediación', tipo: 'estatus', ancho: 'min-w-52' },
  { campo: 'privilegio', etiqueta: 'Privilegios', tipo: 'lista', ancho: 'min-w-36', mayusculas: true },
  { campo: 'kit', etiqueta: 'No. KIT', tipo: 'texto', ancho: 'min-w-32', mayusculas: true, mono: true },
  { campo: 'observaciones', etiqueta: 'Observaciones', tipo: 'largo', ancho: 'min-w-64' },
];

export const columna = (campo: keyof UsuarioSap) => COLUMNAS.find((c) => c.campo === campo)!;

/** Valor que se muestra / edita en la celda. */
export function textoCelda(u: Partial<UsuarioSap>, c: Columna): string {
  if (c.tipo === 'vigencia') {
    if (u.vigencia) return u.vigencia;
    if (u.vigencia_tipo === 'INDEFINIDA') return 'Indefinida';
    return '';
  }
  const v = u[c.campo];
  return v === null || v === undefined ? '' : String(v);
}

/** Convierte lo que escribió el usuario en los campos de BD ya normalizados. */
export function cambioDesdeTexto(c: Columna, texto: string): Partial<UsuarioSap> {
  const v = limpiar(texto);
  switch (c.campo) {
    case 'vigencia': {
      if (!v) return { vigencia: null, vigencia_tipo: 'NO DOCUMENTADA', vigencia_raw: null };
      const n = /^indefinid/i.test(v) ? normalizarVigencia('SIN VIGENCIA') : normalizarVigencia(v);
      return { vigencia: n.fecha, vigencia_tipo: n.tipo, vigencia_raw: v };
    }
    case 'status_sap':
      return { status_sap: normalizarStatus(v) };
    case 'privilegio':
      return { privilegio: normalizarPrivilegio(v) };
    case 'remediacion':
      return { remediacion: v };
    default:
      return { [c.campo]: v && c.mayusculas ? v.toUpperCase() : v } as Partial<UsuarioSap>;
  }
}
