/**
 * Carga la hoja «Consolidado» del Excel de certificación en Supabase.
 *
 * Uso:
 *   npm run cargar -- "/ruta/al/archivo.xlsx" [--reemplazar] [--corte 2026-08-31]
 *
 * - Sin --reemplazar: inserta o actualiza por la columna «No.» (upsert).
 * - Con --reemplazar: borra el inventario y lo vuelve a cargar completo.
 * - Toma un snapshot en la fecha de corte (línea base para la tendencia).
 * - Con --admin correo@empresa.com crea (si no existe) el primer administrador con una
 *   contraseña aleatoria que se imprime UNA sola vez en consola.
 *
 * Credenciales: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY del entorno; si faltan,
 * se leen de `supabase status -o env` (instancia local).
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizarFila } from '../supabase/functions/_shared/datos.ts';

function credenciales() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const env = execSync('supabase status -o env', { encoding: 'utf8' });
    const get = (k: string) => env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
    url = url ?? get('API_URL');
    key = key ?? get('SERVICE_ROLE_KEY');
  }
  if (!url || !key) throw new Error('No se encontraron credenciales de Supabase');
  return { url, key };
}

async function main() {
  const args = process.argv.slice(2);
  const iCorte = args.indexOf('--corte');
  const corte = iCorte >= 0 ? args[iCorte + 1] : '2026-08-31';
  const valoresDeOpcion = new Set([args.indexOf('--corte') + 1, args.indexOf('--admin') + 1].filter((i) => i > 0));
  const archivo = args.find((a, i) => !a.startsWith('--') && !valoresDeOpcion.has(i));
  const reemplazar = args.includes('--reemplazar');
  const iAdmin = args.indexOf('--admin');
  const adminEmail = iAdmin >= 0 ? args[iAdmin + 1] : undefined;
  if (!archivo) throw new Error('Indica la ruta del Excel');

  const { url, key } = credenciales();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const wb = XLSX.read(readFileSync(archivo), { cellDates: true });
  const ws = wb.Sheets['Consolidado'];
  if (!ws) throw new Error('El archivo no tiene la hoja «Consolidado»');
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });

  const { data: cat, error: e1 } = await sb.from('catalogo_estatus').select('nombre');
  if (e1) throw e1;
  const catalogo = cat!.map((c) => c.nombre as string);

  const registros = filas.map((r) => normalizarFila(r, catalogo)).filter((r) => r.usuario);
  console.log(`Filas leídas: ${filas.length} · válidas: ${registros.length}`);

  if (reemplazar) {
    const { error } = await sb.from('usuarios_sap').delete().gte('id', 0);
    if (error) throw error;
  }
  for (let i = 0; i < registros.length; i += 500) {
    const lote = registros.slice(i, i + 500);
    const { error } = await sb.from('usuarios_sap').upsert(lote, { onConflict: 'no' });
    if (error) throw error;
  }

  const { error: e2 } = await sb.rpc('tomar_snapshot', { p_fecha: corte });
  if (e2) throw e2;
  await sb.from('app_config').upsert({ clave: 'fecha_corte', valor: corte });

  const { count } = await sb.from('usuarios_sap').select('*', { count: 'exact', head: true });
  console.log(`Inventario en base de datos: ${count} usuarios · snapshot de corte ${corte}`);

  // Primer administrador (solo si se pide y no existe). Nunca hay contraseñas en el código.
  if (adminEmail) {
    const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (lista?.users.some((x) => x.email === adminEmail)) {
      console.log(`El administrador ${adminEmail} ya existe.`);
    } else {
      // Cumple la política: mayúscula, minúscula y número
      const password = `Kof-${randomBytes(9).toString('base64url')}a1A`;
      const { error } = await sb.auth.admin.createUser({
        email: adminEmail,
        password,
        email_confirm: true,
        app_metadata: { rol: 'admin' },
      });
      if (error) throw error;
      console.log(`Administrador creado: ${adminEmail}\nContraseña temporal (cámbiala al entrar): ${password}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
