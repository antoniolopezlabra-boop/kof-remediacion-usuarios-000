import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local');

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

/** Llama una Edge Function con la sesión actual y devuelve el JSON (o lanza el error del servidor). */
export async function llamarFuncion<T>(nombre: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const txt = await ctx.text();
        try {
          msg = JSON.parse(txt).error ?? msg;
        } catch {
          msg = ctx.status === 404 ? 'El servicio de IA no está disponible (función no desplegada).' : txt || msg;
        }
      }
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
