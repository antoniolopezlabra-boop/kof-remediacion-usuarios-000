-- Nuevo estatus del catálogo solicitado por KOF: el KIT ya fue aprobado y queda
-- pendiente que DXC ejecute la acción. Es un estatus «En proceso» (no cierra el caso).
-- Solo se agrega la opción: ningún usuario cambia de estatus.
update public.catalogo_estatus set orden = orden + 1 where orden >= 4;

insert into public.catalogo_estatus (nombre, tipo, orden, color, definicion) values
  ('KIT Aprobado Pen. Implement', 'En proceso', 4, '#008300',
   'KOF aprobó el KIT; falta que el equipo técnico implemente la acción solicitada.');
