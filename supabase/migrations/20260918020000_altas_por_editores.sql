-- Gestión abierta tipo Excel: el equipo técnico (editor) puede dar de alta filas.
-- Las bajas siguen reservadas al administrador. Todo queda en la bitácora (trigger).
drop policy if exists usuarios_insert on public.usuarios_sap;
create policy usuarios_insert on public.usuarios_sap
  for insert to authenticated with check (public.puede_editar());

-- «No.» consecutivo automático para las filas nuevas (la importación de Excel lo trae explícito)
create or replace function public.usuarios_sap_numerar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.no is null then
    perform pg_advisory_xact_lock(hashtext('usuarios_sap_no'));
    new.no := coalesce((select max(no) from public.usuarios_sap), 0) + 1;
  end if;
  return new;
end $$;

create trigger usuarios_sap_numerar
  before insert on public.usuarios_sap
  for each row execute function public.usuarios_sap_numerar();
