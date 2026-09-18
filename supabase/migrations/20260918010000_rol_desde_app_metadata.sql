-- Seguridad: el rol inicial se toma de app_metadata (solo lo escribe el servidor con la
-- service role), nunca de user_metadata (editable por el propio usuario).
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
    case when new.raw_app_meta_data ->> 'rol' in ('lector', 'editor', 'admin')
         then new.raw_app_meta_data ->> 'rol' else 'lector' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
