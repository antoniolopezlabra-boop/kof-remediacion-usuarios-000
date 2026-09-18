-- =====================================================================
-- KOF · Remediación de Usuarios SAP · Mandante 000
-- Esquema inicial: catálogo, inventario, bitácora, snapshots, IA, roles
-- =====================================================================

-- ---------- Perfiles y roles ----------
create table public.perfiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  nombre      text,
  rol         text not null default 'lector' check (rol in ('lector', 'editor', 'admin')),
  created_at  timestamptz not null default now()
);

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.perfiles where id = auth.uid() $$;

create or replace function public.puede_editar()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select rol in ('editor', 'admin') from public.perfiles where id = auth.uid()), false) $$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid()), false) $$;

-- Alta automática del perfil al crear un usuario de Auth
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'lector')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- Configuración general ----------
create table public.app_config (
  clave       text primary key,
  valor       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_config (clave, valor) values
  ('fecha_corte', '"2026-08-31"'),
  ('titulo', '"Revisión de Usuarios SAP — Mandante 000"'),
  ('cliente', '"Coca-Cola FEMSA (KOF)"'),
  ('usuarios_nativos', '["SAP*", "DDIC", "TMSADM", "SAPCPIC", "EARLYWATCH"]');

-- ---------- Catálogo de estatus (gobierno de la columna «Remediación») ----------
create table public.catalogo_estatus (
  nombre      text primary key,
  tipo        text not null check (tipo in ('En proceso', 'Cerrado')),
  orden       int  not null,
  color       text not null,
  definicion  text not null
);

insert into public.catalogo_estatus (nombre, tipo, orden, color, definicion) values
  ('En Validación',               'En proceso', 1, '#2a78d6', 'El equipo técnico está analizando al usuario; aún no hay conclusión.'),
  ('Pendiente KIT',               'En proceso', 2, '#eda100', 'Se determinó que requiere remediación; falta levantar el KIT correspondiente.'),
  ('KIT pendiente de aprobación', 'En proceso', 3, '#e87ba4', 'El KIT fue levantado y está en espera de aprobación.'),
  ('Remediado',                   'Cerrado',    4, '#4a3aa7', 'La remediación se ejecutó y quedó cerrada. No requiere más acción.'),
  ('En Orden',                    'Cerrado',    5, '#1baf7a', 'Usuario revisado y correcto: NO requiere remediación alguna. Cierra el caso.');

-- ---------- Inventario de usuarios SAP (hoja «Consolidado») ----------
create table public.usuarios_sap (
  id               bigint generated always as identity primary key,
  no               int unique,
  plataforma       text,
  administrador    text,
  sistema          text,
  sid              text,
  ambiente         text,
  area             text,
  usuario          text not null,
  tipo_usuario     text,
  nombre           text,
  puesto           text,
  vigencia_raw     text,
  vigencia         date,
  vigencia_tipo    text check (vigencia_tipo in ('FECHA', 'INDEFINIDA', 'NO DOCUMENTADA')),
  status_sap       text,
  remediacion      text references public.catalogo_estatus (nombre) on update cascade,
  privilegio       text,
  privilegiado     boolean generated always as (
                     coalesce(privilegio in ('SI', 'X', 'SAP_ALL', 'SAP_ALL & SAP_NEW'), false)
                   ) stored,
  observaciones    text,
  kit              text,
  cerrado_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  updated_by_email text
);

create index usuarios_sap_remediacion_idx on public.usuarios_sap (remediacion);
create index usuarios_sap_sid_idx on public.usuarios_sap (sid);

-- ---------- Bitácora de cambios (auditoría) ----------
create table public.bitacora (
  id             bigint generated always as identity primary key,
  usuario_sap_id bigint,
  sid            text,
  usuario        text,
  accion         text not null check (accion in ('ALTA', 'CAMBIO', 'BAJA')),
  cambios        jsonb not null default '{}'::jsonb,
  actor_id       uuid,
  actor_email    text,
  created_at     timestamptz not null default now()
);

create index bitacora_usuario_idx on public.bitacora (usuario_sap_id, created_at desc);
create index bitacora_fecha_idx on public.bitacora (created_at desc);

-- Metadatos de auditoría y fecha de cierre
create or replace function public.usuarios_sap_before()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tipo_nuevo text;
  v_tipo_viejo text;
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    new.updated_by_email := (select email from public.perfiles where id = auth.uid());
  end if;

  select tipo into v_tipo_nuevo from public.catalogo_estatus where nombre = new.remediacion;
  if tg_op = 'UPDATE' then
    select tipo into v_tipo_viejo from public.catalogo_estatus where nombre = old.remediacion;
  end if;

  if v_tipo_nuevo = 'Cerrado' and (tg_op = 'INSERT' or v_tipo_viejo is distinct from 'Cerrado') then
    new.cerrado_at := coalesce(new.cerrado_at, now());
  elsif v_tipo_nuevo is distinct from 'Cerrado' then
    new.cerrado_at := null;
  end if;
  return new;
end $$;

create trigger usuarios_sap_before
  before insert or update on public.usuarios_sap
  for each row execute function public.usuarios_sap_before();

-- Registro en bitácora (solo campos que realmente cambian)
create or replace function public.usuarios_sap_bitacora()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_cambios jsonb := '{}'::jsonb;
  k text;
  v_ignorar text[] := array['updated_at', 'updated_by', 'updated_by_email', 'cerrado_at', 'created_at', 'privilegiado', 'id'];
  v_email text := (select email from public.perfiles where id = auth.uid());
begin
  -- La carga inicial (sin usuario autenticado) no se registra renglón por renglón
  if auth.uid() is null and tg_op = 'INSERT' then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_ignorar)) and (v_old -> k) is distinct from (v_new -> k) then
        v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_cambios = '{}'::jsonb then
      return null;
    end if;
    insert into public.bitacora (usuario_sap_id, sid, usuario, accion, cambios, actor_id, actor_email)
    values (new.id, new.sid, new.usuario, 'CAMBIO', v_cambios, auth.uid(), v_email);
  elsif tg_op = 'INSERT' then
    insert into public.bitacora (usuario_sap_id, sid, usuario, accion, cambios, actor_id, actor_email)
    values (new.id, new.sid, new.usuario, 'ALTA', jsonb_build_object('remediacion', jsonb_build_array(null, new.remediacion)), auth.uid(), v_email);
  elsif tg_op = 'DELETE' then
    insert into public.bitacora (usuario_sap_id, sid, usuario, accion, cambios, actor_id, actor_email)
    values (old.id, old.sid, old.usuario, 'BAJA', jsonb_build_object('remediacion', jsonb_build_array(old.remediacion, null)), auth.uid(), v_email);
  end if;
  return null;
end $$;

create trigger usuarios_sap_bitacora
  after insert or update or delete on public.usuarios_sap
  for each row execute function public.usuarios_sap_bitacora();

-- ---------- Snapshots diarios (tendencia / burndown) ----------
create table public.snapshots (
  fecha        date primary key,
  total        int not null,
  por_estatus  jsonb not null,
  updated_at   timestamptz not null default now()
);

create or replace function public.tomar_snapshot(p_fecha date default (now() at time zone 'America/Mexico_City')::date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.snapshots (fecha, total, por_estatus, updated_at)
  values (
    p_fecha,
    (select count(*) from public.usuarios_sap),
    coalesce((
      select jsonb_object_agg(e, n) from (
        select coalesce(remediacion, 'Sin clasificar') as e, count(*) as n
        from public.usuarios_sap group by 1
      ) t
    ), '{}'::jsonb),
    now()
  )
  on conflict (fecha) do update
    set total = excluded.total, por_estatus = excluded.por_estatus, updated_at = now();
end $$;

create or replace function public.usuarios_sap_snapshot()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.tomar_snapshot();
  return null;
end $$;

create trigger usuarios_sap_snapshot
  after insert or update or delete on public.usuarios_sap
  for each statement execute function public.usuarios_sap_snapshot();

-- ---------- Tarjetas creadas por el Asistente IA ----------
create table public.widgets_ia (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  descripcion      text,
  pregunta         text,
  spec             jsonb not null,
  orden            int not null default 0,
  created_by       uuid default auth.uid(),
  created_by_email text,
  created_at       timestamptz not null default now()
);

-- =====================================================================
-- Seguridad: RLS
-- =====================================================================
alter table public.perfiles          enable row level security;
alter table public.app_config        enable row level security;
alter table public.catalogo_estatus  enable row level security;
alter table public.usuarios_sap      enable row level security;
alter table public.bitacora          enable row level security;
alter table public.snapshots         enable row level security;
alter table public.widgets_ia        enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.mi_rol(), public.puede_editar(), public.es_admin() to authenticated;
revoke execute on function public.tomar_snapshot(date) from anon, authenticated, public;
grant execute on function public.tomar_snapshot(date) to service_role;

-- perfiles
create policy perfiles_select on public.perfiles for select to authenticated using (true);
create policy perfiles_admin  on public.perfiles for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- configuración
create policy config_select on public.app_config for select to authenticated using (true);
create policy config_admin  on public.app_config for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- catálogo
create policy catalogo_select on public.catalogo_estatus for select to authenticated using (true);
create policy catalogo_admin  on public.catalogo_estatus for all    to authenticated using (public.es_admin()) with check (public.es_admin());

-- inventario
create policy usuarios_select on public.usuarios_sap for select to authenticated using (true);
create policy usuarios_update on public.usuarios_sap for update to authenticated using (public.puede_editar()) with check (public.puede_editar());
create policy usuarios_insert on public.usuarios_sap for insert to authenticated with check (public.es_admin());
create policy usuarios_delete on public.usuarios_sap for delete to authenticated using (public.es_admin());

-- bitácora: solo lectura (se escribe por trigger)
create policy bitacora_select on public.bitacora for select to authenticated using (true);

-- snapshots: solo lectura (se escribe por trigger)
create policy snapshots_select on public.snapshots for select to authenticated using (true);

-- tarjetas IA: cualquiera autenticado puede crear; borra el autor, editor o admin
create policy widgets_select on public.widgets_ia for select to authenticated using (true);
create policy widgets_insert on public.widgets_ia for insert to authenticated with check (created_by = auth.uid());
create policy widgets_update on public.widgets_ia for update to authenticated using (public.puede_editar() or created_by = auth.uid());
create policy widgets_delete on public.widgets_ia for delete to authenticated using (public.puede_editar() or created_by = auth.uid());

-- =====================================================================
-- Realtime: los dashboards se actualizan solos
-- =====================================================================
alter publication supabase_realtime add table public.usuarios_sap, public.widgets_ia, public.snapshots, public.bitacora, public.app_config;
alter table public.usuarios_sap replica identity full;
