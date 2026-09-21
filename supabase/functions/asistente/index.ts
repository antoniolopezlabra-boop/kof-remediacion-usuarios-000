// Asistente IA del tablero de remediación (Claude + herramientas sobre los datos vivos).
// Todas las consultas se hacen con el JWT del usuario: RLS aplica igual que en la app.
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  agregar,
  calcularTarjeta,
  COLUMNAS_LISTA,
  DIMENSIONES,
  ESPECIALES,
  filtrar,
  resumen,
  TIPOS_TARJETA,
  validarSpec,
  type Contexto,
  type Consulta,
  type Dimension,
  type Estatus,
  type UsuarioSap,
} from '../_shared/datos.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Haiku 4.5: el modelo más económico ($1 / $5 por millón de tokens de entrada / salida)
const MODELO = 'claude-haiku-4-5';
const MAX_VUELTAS = 8;

// ---------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------
const dimEnum = Object.keys(DIMENSIONES);
const espEnum = Object.keys(ESPECIALES);

const esquemaFiltros = {
  filtros: {
    type: 'object',
    description:
      'Filtros por dimensión: {"ambiente": ["PRODUCTIVO"], "sistema": ["ECC","GRC"]}. Coincidencia exacta sin distinguir mayúsculas. Valores normalizados en MAYÚSCULAS salvo administrador, sistema, remediacion y nombre.',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  },
  especiales: { type: 'array', items: { type: 'string', enum: espEnum }, description: 'Filtros especiales predefinidos.' },
  texto: { type: 'string', description: 'Búsqueda libre en usuario, nombre, SID, sistema, observaciones, KIT, puesto y administrador.' },
};

const herramientas: Anthropic.Tool[] = [
  {
    name: 'resumen_general',
    description:
      'Indicadores generales del universo (o de un subconjunto filtrado): total, cerrados, abiertos, % avance, conteo por estatus, privilegiados, privilegiados abiertos en productivo, activos con vigencia vencida, nativos SAP.',
    input_schema: { type: 'object', properties: { ...esquemaFiltros } },
  },
  {
    name: 'consultar_agregado',
    description:
      'Agrupa y cuenta usuarios por una dimensión (y opcionalmente una segunda "serie" para cruces). Devuelve total, cerrados, abiertos y % avance por grupo. Úsala para cualquier pregunta de distribución, ranking o comparación.',
    input_schema: {
      type: 'object',
      properties: {
        dimension: { type: 'string', enum: dimEnum },
        serie: { type: 'string', enum: dimEnum, description: 'Segunda dimensión para el cruce (opcional).' },
        top: { type: 'integer', minimum: 1, maximum: 100 },
        ...esquemaFiltros,
      },
      required: ['dimension'],
    },
  },
  {
    name: 'buscar_usuarios',
    description: 'Lista usuarios concretos que cumplen los filtros (máximo 50). Úsala para detalle a nivel usuario o para verificar casos.',
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'integer', minimum: 1, maximum: 50 },
        ...esquemaFiltros,
      },
    },
  },
  {
    name: 'listar_tarjetas',
    description: 'Lista las tarjetas que ya existen en la sección «Insights IA» del dashboard.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'crear_tarjeta_dashboard',
    description:
      'Crea una tarjeta permanente en la sección «Insights IA» del dashboard ejecutivo. La tarjeta guarda la DEFINICIÓN de la consulta (no los números), así que se recalcula sola cuando el equipo actualiza estatus. Tipos: kpi (un número), barras, barras_apiladas (dimension+serie), dona, tabla (dimension con total/cerrados/abiertos/%), mapa_calor (dimension+serie), lista (usuarios concretos).',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título ejecutivo corto (máx. 60 caracteres).' },
        descripcion: { type: 'string', description: 'Una línea: qué muestra y por qué importa.' },
        tipo: { type: 'string', enum: [...TIPOS_TARJETA] },
        dimension: { type: 'string', enum: dimEnum },
        serie: { type: 'string', enum: dimEnum },
        top: { type: 'integer', minimum: 1, maximum: 50 },
        columnas: { type: 'array', items: { type: 'string', enum: COLUMNAS_LISTA as string[] } },
        ...esquemaFiltros,
      },
      required: ['titulo', 'descripcion', 'tipo'],
    },
  },
  {
    name: 'eliminar_tarjeta',
    description: 'Elimina una tarjeta de «Insights IA» por su id (solo si el usuario lo pide).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

const SISTEMA = `Eres el Asistente de Remediación del tablero ejecutivo «Revisión de Usuarios SAP — Mandante 000» que DXC Technology opera para Coca-Cola FEMSA (KOF).

Contexto del proceso:
- Se revisa cada usuario del mandante 000 de todos los sistemas SAP (vigencia, estado, si es usuario de operación, responsables, roles/privilegios, clasificación y tipo de usuario).
- Cada usuario tiene un estatus de remediación del catálogo: En Validación (en análisis), Pendiente KIT (requiere levantar KIT), KIT pendiente de aprobación (KIT levantado, esperando visto bueno de KOF), KIT Aprobado Pen. Implement (KOF ya aprobó el KIT y falta que el equipo técnico lo implemente), Remediado (acción ejecutada, cerrado) y En Orden (correcto, no requiere acción, cerrado). Los cuatro primeros son «En proceso»; solo Remediado y En Orden cuentan como cerrados. «Sin clasificar» = sin estatus.
- Avance = (Remediado + En Orden) / Total. El equipo técnico (TQS) actualiza los estatus en la plataforma y todo se recalcula en vivo.
- Un «KIT» es la solicitud/ticket (p. ej. TASK9064213) con la que se ejecuta la remediación.
- Usuario privilegiado = ÚNICAMENTE marca SAP_ALL o SAP_NEW (valores «SAP_ALL» y «SAP_ALL & SAP_NEW»). Las marcas SI y X NO cuentan como privilegio: si preguntan por ellas, aclara que por definición del cliente no se consideran privilegiados. La exposición más alta es un usuario privilegiado sin cerrar en PRODUCTIVO.
- Usuarios nativos SAP = SAP*, DDIC, TMSADM, SAPCPIC, EARLYWATCH.

Dimensiones disponibles: ${Object.entries(DIMENSIONES).map(([k, v]) => `${k} (${v})`).join('; ')}.
Filtros especiales: ${Object.entries(ESPECIALES).map(([k, v]) => `${k} (${v})`).join('; ')}.

El dashboard principal YA muestra: KPIs generales (universo, avance, cerrados, en proceso, privilegiados abiertos, activos con vigencia vencida), distribución por estatus, avance por ambiente, mapa de calor ambiente × estatus, plataforma, carga y avance por administrador, sistemas con más pendientes, riesgo crítico (privilegiados abiertos) y la tendencia histórica.

Cómo trabajas:
1. Nunca inventes cifras: toda cifra sale de una herramienta. Si el dato no existe en el inventario, dilo y sugiere cómo capturarlo.
2. Sé proactivo — regla obligatoria: si para responder usaste consultar_agregado o buscar_usuarios con un corte, filtro o cruce que NO aparece en la lista de lo que el dashboard ya muestra, ANTES de redactar tu respuesta final llama a listar_tarjetas y, si no existe una equivalente, llama a crear_tarjeta_dashboard con la misma consulta (mismos filtros, dimensión y especiales). Hazlo sin pedir permiso. No escribas avisos sobre tarjetas: la plataforma los agrega sola cuando la tarjeta existe. Solo omite la tarjeta si la pregunta ya está cubierta por el dashboard principal o por una tarjeta existente, o si el usuario pide no crearla.
3. Responde en español, estilo ejecutivo: primero la respuesta directa con la cifra clave, luego 2–4 viñetas de detalle y, si aplica, una recomendación accionable (qué atacar primero, a quién asignarlo). Usa Markdown ligero (negritas, viñetas, tablas pequeñas). Nada de relleno.
4. Terminología: usa siempre «remediación»; nunca uses la palabra «certificación».
5. Si la pregunta es ambigua, elige la interpretación más útil para un director y acláralo en una línea.`;

// ---------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------
async function cargarTodo(sb: SupabaseClient): Promise<UsuarioSap[]> {
  const out: UsuarioSap[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('usuarios_sap').select('*').order('id').range(desde, desde + 999);
    if (error) throw error;
    out.push(...(data as UsuarioSap[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function limpiarConsulta(input: Record<string, unknown>): Consulta {
  const filtros: Consulta['filtros'] = {};
  for (const [k, v] of Object.entries((input.filtros as Record<string, unknown>) ?? {})) {
    if (k in DIMENSIONES && Array.isArray(v)) filtros[k as Dimension] = v.map(String);
  }
  const especiales = ((input.especiales as string[]) ?? []).filter((e) => e in ESPECIALES) as Consulta['especiales'];
  return { filtros, especiales, texto: typeof input.texto === 'string' ? input.texto : undefined };
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

interface Entorno {
  sb: SupabaseClient;
  rows: UsuarioSap[];
  ctx: Contexto;
  pregunta: string;
  email: string | null;
  creadas: string[];
  // Última consulta de datos que hizo el modelo: base para la tarjeta automática
  ultimaConsulta: { herramienta: 'consultar_agregado' | 'buscar_usuarios'; input: Record<string, unknown> } | null;
}

// Cortes que el dashboard principal ya muestra (sin filtros): no generan tarjeta
const DIMENSIONES_CUBIERTAS: Dimension[] = ['remediacion', 'grupo_estatus', 'ambiente', 'plataforma', 'administrador', 'sistema'];

async function guardarTarjeta(env: Entorno, titulo: string, descripcion: string | null, specCruda: Record<string, unknown>) {
  const v = validarSpec(specCruda);
  if (!v.ok) throw new Error(v.error);
  const { data: existentes } = await env.sb.from('widgets_ia').select('id, spec, orden').order('orden', { ascending: false });
  const firma = JSON.stringify(v.spec);
  const igual = existentes?.find((w) => JSON.stringify(w.spec) === firma);
  if (igual) return { id: igual.id as string, duplicada: true, spec: v.spec };
  const { data, error } = await env.sb
    .from('widgets_ia')
    .insert({
      titulo: titulo.slice(0, 80),
      descripcion,
      pregunta: env.pregunta.slice(0, 500),
      spec: v.spec,
      orden: (existentes?.[0]?.orden ?? 0) + 1,
      created_by_email: env.email,
    })
    .select('id')
    .single();
  if (error) throw error;
  env.creadas.push(data.id);
  return { id: data.id as string, duplicada: false, spec: v.spec };
}

/** Tarjeta automática a partir de la última consulta, si el corte no está ya en el dashboard. */
async function tarjetaAutomatica(env: Entorno) {
  const q = env.ultimaConsulta;
  if (!q || env.creadas.length) return;
  const consulta = limpiarConsulta(q.input);
  const hayFiltros = Object.keys(consulta.filtros ?? {}).length > 0 || (consulta.especiales?.length ?? 0) > 0 || !!consulta.texto;
  const filtroTxt = [
    ...Object.entries(consulta.filtros ?? {}).map(([k, v]) => `${v!.join(', ')}`),
    ...(consulta.especiales ?? []).map((e) => ESPECIALES[e].replace(/^Solo (usuarios )?/, '')),
  ].join(' · ');

  if (q.herramienta === 'buscar_usuarios') {
    if (!hayFiltros) return;
    await guardarTarjeta(env, `Usuarios: ${filtroTxt}`.slice(0, 80), 'Lista generada a partir de una consulta al asistente.', { tipo: 'lista', ...consulta, top: 50 });
    return;
  }
  const dimension = q.input.dimension as Dimension;
  const serie = q.input.serie && (q.input.serie as string) in DIMENSIONES ? (q.input.serie as Dimension) : undefined;
  if (!(dimension in DIMENSIONES)) return;
  if (!hayFiltros && !serie && DIMENSIONES_CUBIERTAS.includes(dimension)) return;
  const etiqueta = DIMENSIONES[dimension].replace(/ \(.*\)$/, '');
  const titulo = `Avance por ${etiqueta.toLowerCase()}${filtroTxt ? ` · ${filtroTxt}` : ''}`;
  await guardarTarjeta(env, titulo, 'Generada a partir de una consulta al asistente; se recalcula en vivo.', {
    tipo: serie ? 'barras_apiladas' : 'tabla',
    dimension,
    ...(serie ? { serie } : {}),
    ...(Number(q.input.top) ? { top: Number(q.input.top) } : {}),
    ...consulta,
  });
}

async function ejecutar(nombre: string, input: Record<string, unknown>, env: Entorno): Promise<string> {
  const { sb, rows, ctx } = env;
  switch (nombre) {
    case 'resumen_general': {
      const r = resumen(filtrar(rows, limpiarConsulta(input), ctx), ctx);
      return JSON.stringify({ ...r, avance: pct(r.avance) });
    }
    case 'consultar_agregado': {
      env.ultimaConsulta = { herramienta: 'consultar_agregado', input };
      const dim = input.dimension as Dimension;
      if (!(dim in DIMENSIONES)) throw new Error(`Dimensión inválida: ${dim}`);
      const serie = input.serie && (input.serie as string) in DIMENSIONES ? (input.serie as Dimension) : undefined;
      const base = filtrar(rows, limpiarConsulta(input), ctx);
      let filas = agregar(base, dim, ctx, serie);
      const top = Number(input.top) || 0;
      if (top) filas = filas.slice(0, top);
      return JSON.stringify({ total_filtrado: base.length, grupos: filas.map((f) => ({ ...f, avance: pct(f.avance) })) });
    }
    case 'buscar_usuarios': {
      env.ultimaConsulta = { herramienta: 'buscar_usuarios', input };
      const base = filtrar(rows, limpiarConsulta(input), ctx);
      const lim = Math.min(Number(input.limite) || 25, 50);
      return JSON.stringify({
        total: base.length,
        mostrados: Math.min(lim, base.length),
        usuarios: base.slice(0, lim).map((u) => ({
          no: u.no, sid: u.sid, sistema: u.sistema, ambiente: u.ambiente, usuario: u.usuario, nombre: u.nombre,
          tipo: u.tipo_usuario, status_sap: u.status_sap, remediacion: u.remediacion, privilegio: u.privilegio,
          vigencia: u.vigencia ?? u.vigencia_tipo, administrador: u.administrador, kit: u.kit, observaciones: u.observaciones,
        })),
      });
    }
    case 'listar_tarjetas': {
      const { data, error } = await sb.from('widgets_ia').select('id, titulo, descripcion, spec').order('orden');
      if (error) throw error;
      return JSON.stringify(data);
    }
    case 'crear_tarjeta_dashboard': {
      const { titulo, descripcion, ...resto } = input as Record<string, unknown>;
      const r = await guardarTarjeta(env, String(titulo ?? 'Insight'), descripcion ? String(descripcion) : null, { ...resto, ...limpiarConsulta(input) });
      return JSON.stringify({ ok: true, id: r.id, ya_existia: r.duplicada, vista_previa: calcularTarjeta(rows, r.spec, ctx) });
    }
    case 'eliminar_tarjeta': {
      const { error, count } = await sb.from('widgets_ia').delete({ count: 'exact' }).eq('id', String(input.id));
      if (error) throw error;
      return JSON.stringify({ ok: (count ?? 0) > 0 });
    }
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!auth?.user) return json({ error: 'Sesión inválida' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor.' }, 503);

  let body: { mensajes?: { rol: 'user' | 'assistant'; texto: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  const historial = (body.mensajes ?? []).filter((m) => m.texto?.trim()).slice(-20);
  if (!historial.length || historial[historial.length - 1].rol !== 'user') return json({ error: 'Falta la pregunta' }, 400);

  try {
    const [rows, cat, cfg] = await Promise.all([
      cargarTodo(sb),
      sb.from('catalogo_estatus').select('*').order('orden'),
      sb.from('app_config').select('clave, valor'),
    ]);
    const config = Object.fromEntries((cfg.data ?? []).map((c) => [c.clave, c.valor]));
    const ctx: Contexto = { catalogo: (cat.data ?? []) as Estatus[], nativos: (config.usuarios_nativos as string[]) ?? [] };

    const client = new Anthropic({ apiKey });
    const messages: Anthropic.MessageParam[] = historial.map((m) => ({ role: m.rol, content: m.texto }));
    const pregunta = historial[historial.length - 1].texto;
    const env: Entorno = { sb, rows, ctx, pregunta, email: auth.user.email ?? null, creadas: [], ultimaConsulta: null };
    const pasos: string[] = [];

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 8000,
        system: [
          { type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } },
          {
            type: 'text',
            text: `Fecha de hoy: ${new Date().toISOString().slice(0, 10)} · Fecha de corte del reporte: ${config.fecha_corte ?? 's/d'} · Universo cargado: ${rows.length} usuarios · Usuario que pregunta: ${auth.user.email}.`,
          },
        ],
        tools: herramientas,
        messages,
      });

      if (resp.stop_reason === 'refusal') {
        return json({ texto: 'No puedo responder esa solicitud. Reformula la pregunta sobre el inventario de usuarios.', tarjetas: env.creadas, pasos });
      }

      const usos = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || usos.length === 0) {
        const texto = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        try {
          await tarjetaAutomatica(env);
        } catch (e) {
          console.error('tarjeta automática', e);
        }
        // El aviso lo pone el servidor solo si la tarjeta existe de verdad
        let final = (texto || 'Sin respuesta.').replace(/\n*📌[^\n]*$/u, '').trimEnd();
        if (env.creadas.length) final += '\n\n📌 Agregué esta vista al dashboard en **Insights IA**; se recalcula sola.';
        return json({ texto: final, tarjetas: env.creadas, pasos });
      }

      messages.push({ role: 'assistant', content: resp.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const uso of usos) {
        pasos.push(uso.name);
        try {
          const out = await ejecutar(uso.name, (uso.input ?? {}) as Record<string, unknown>, env);
          resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: out });
        } catch (e) {
          resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: `Error: ${(e as Error).message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: resultados });
    }
    return json({ texto: 'La consulta requirió demasiados pasos. Intenta una pregunta más específica.', tarjetas: env.creadas, pasos });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'La IA está saturada, intenta en unos segundos.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'La API key de Anthropic no es válida.' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `Error de la IA (${e.status}): ${e.message}` }, 502);
    console.error(e);
    return json({ error: (e as Error).message ?? 'Error interno' }, 500);
  }
});
