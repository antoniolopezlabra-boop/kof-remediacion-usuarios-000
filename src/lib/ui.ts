// Colores y formatos compartidos por las gráficas y la UI.

// Paleta de estatus validada (CVD + contraste) para superficie clara y oscura.
const OSCURO: Record<string, string> = {
  '#2a78d6': '#3987e5',
  '#eda100': '#c98500',
  '#e87ba4': '#d55181',
  '#4a3aa7': '#9085e9',
  '#1baf7a': '#199e70',
};

export const SIN_CLASIFICAR_COLOR = { light: '#a3a3a0', dark: '#6b6f80' };

export function colorSerie(hexLight: string, oscuro: boolean) {
  return oscuro ? (OSCURO[hexLight.toLowerCase()] ?? hexLight) : hexLight;
}

// Dos series fijas: cerrado vs. abierto
export const CERRADO = { light: '#2a78d6', dark: '#3987e5' };
export const ABIERTO = { light: '#eb6834', dark: '#d95926' };

// Rampa secuencial (azul) para mapas de calor
export const SECUENCIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const SECUENCIAL_OSCURO = ['#1c2440', '#1f3764', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'];

// Orden canónico de ambientes (criticidad descendente)
export const ORDEN_AMBIENTES = ['PRODUCTIVO', 'PRE-PRODUCTIVO', 'CALIDAD', 'DESARROLLO', 'SANDBOX'];

export const nf = new Intl.NumberFormat('es-MX');
export const fmt = (n: number) => nf.format(n);
export const pct = (n: number, dec = 1) => `${(n * 100).toFixed(dec)}%`;

export function fechaLarga(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fechaHora(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function haceCuanto(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export const ETIQUETAS_CAMPO: Record<string, string> = {
  no: 'No.',
  plataforma: 'Plataforma',
  administrador: 'Administrador',
  sistema: 'Sistema',
  sid: 'SID',
  ambiente: 'Ambiente',
  area: 'Área',
  usuario: 'Usuario',
  tipo_usuario: 'Tipo',
  nombre: 'Nombre',
  puesto: 'Puesto',
  vigencia: 'Vigencia',
  vigencia_raw: 'Vigencia (original)',
  vigencia_tipo: 'Tipo de vigencia',
  status_sap: 'Status SAP',
  remediacion: 'Remediación',
  privilegio: 'Marca privilegios',
  observaciones: 'Observaciones',
  kit: 'No. KIT',
};
