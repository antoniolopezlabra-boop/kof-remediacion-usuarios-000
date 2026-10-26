-- Nuevo estatus del catálogo: con el KIT aprobado por KOF, el equipo BASIS primero
-- bloquea al usuario y después lo elimina. Es «En proceso» (aún no cierra el caso).
-- Solo se agrega la opción: ningún usuario cambia de estatus.
update public.catalogo_estatus set orden = orden + 1 where orden >= 5;

insert into public.catalogo_estatus (nombre, tipo, orden, color, definicion) values
  ('Bloqueado Pen. Eliminación', 'En proceso', 5, '#e34948',
   'KIT aprobado por KOF; el usuario ya fue bloqueado y está pendiente de eliminarse.');
