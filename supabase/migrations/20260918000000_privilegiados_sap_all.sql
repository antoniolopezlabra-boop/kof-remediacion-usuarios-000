-- Definición de negocio (KOF): privilegiado = SOLO marcas SAP_ALL o SAP_NEW
-- (antes también contaban SI y X). Las marcas originales se conservan en «privilegio».
alter table public.usuarios_sap drop column privilegiado;
alter table public.usuarios_sap
  add column privilegiado boolean generated always as (
    coalesce(privilegio ~ 'SAP_(ALL|NEW)', false)
  ) stored;
