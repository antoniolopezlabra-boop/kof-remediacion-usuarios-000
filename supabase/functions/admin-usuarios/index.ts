// Alta, edición y baja de accesos a la plataforma. Solo rol admin.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROLES = ['lector', 'editor', 'admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: 'Sesión inválida' }, 401);
  const { data: yo } = await admin.from('perfiles').select('rol').eq('id', auth.user.id).single();
  if (yo?.rol !== 'admin') return json({ error: 'Solo un administrador puede gestionar accesos' }, 403);

  const body = await req.json().catch(() => ({}));
  try {
    switch (body.accion) {
      case 'crear': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const rol = ROLES.includes(body.rol) ? body.rol : 'lector';
        if (!email.includes('@')) return json({ error: 'Correo inválido' }, 400);
        if (String(body.password ?? '').length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { nombre: body.nombre ?? email.split('@')[0] },
          app_metadata: { rol },
        });
        if (error) throw error;
        return json({ ok: true, id: data.user.id });
      }
      case 'actualizar': {
        const cambios: Record<string, string> = {};
        if (body.rol && ROLES.includes(body.rol)) cambios.rol = body.rol;
        if (typeof body.nombre === 'string') cambios.nombre = body.nombre;
        if (body.id === auth.user.id && cambios.rol && cambios.rol !== 'admin')
          return json({ error: 'No puedes quitarte a ti mismo el rol de administrador' }, 400);
        const { error } = await admin.from('perfiles').update(cambios).eq('id', body.id);
        if (error) throw error;
        if (body.password) {
          if (String(body.password).length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
          const { error: e2 } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
          if (e2) throw e2;
        }
        return json({ ok: true });
      }
      case 'eliminar': {
        if (body.id === auth.user.id) return json({ error: 'No puedes eliminar tu propio acceso' }, 400);
        const { error } = await admin.auth.admin.deleteUser(body.id);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: 'Acción desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
