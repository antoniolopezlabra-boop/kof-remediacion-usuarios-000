-- Los TQS (editor) también pueden eliminar filas del inventario (antes solo admin).
-- El cliente (lector) sigue sin poder. Cada baja queda en la bitácora (trigger).
drop policy if exists usuarios_delete on public.usuarios_sap;
create policy usuarios_delete on public.usuarios_sap
  for delete to authenticated using (public.puede_editar());
