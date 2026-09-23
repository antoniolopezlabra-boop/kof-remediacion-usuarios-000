import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { Estatus } from '../../supabase/functions/_shared/datos.ts';

export type Orden = { campo: string; dir: 1 | -1 } | null;

/** Encabezado que ordena: 1er clic ascendente, 2º descendente, 3º vuelve al orden original. */
export function Th({
  campo, etiqueta, orden, setOrden, className,
}: {
  campo: string;
  etiqueta: string;
  orden: Orden;
  setOrden: (o: Orden) => void;
  className?: string;
}) {
  const activo = orden?.campo === campo;
  const siguiente: Orden = !activo ? { campo, dir: 1 } : orden!.dir === 1 ? { campo, dir: -1 } : null;
  return (
    <th className={clsx('px-2.5 py-2 font-medium whitespace-nowrap', className)}>
      <button
        onClick={() => setOrden(siguiente)}
        className="inline-flex items-center gap-1 hover:text-ink"
        title={activo ? (orden!.dir === 1 ? 'Orden ascendente · clic para descendente' : 'Orden descendente · clic para quitar el orden') : 'Ordenar por esta columna'}
      >
        {etiqueta}
        {activo ? (
          orden!.dir === 1 ? <ArrowUp className="size-3 text-accent-ink" /> : <ArrowDown className="size-3 text-accent-ink" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

/**
 * Estado de orden + función para ordenar cualquier arreglo por la columna elegida.
 * Estatus en el orden del catálogo, números numéricos, texto alfabético en español,
 * vacíos siempre al final.
 */
export function useOrden(catalogo: Estatus[]) {
  const [orden, setOrden] = useState<Orden>(null);
  const ordenar = useMemo(() => {
    const posEstatus = new Map(catalogo.map((c) => [c.nombre, c.orden]));
    const vacio = (v: unknown) => v === null || v === undefined || v === '' || v === '(vacío)';
    return <T,>(arr: T[], valor: (x: T, campo: string) => unknown): T[] => {
      if (!orden) return arr;
      const { campo, dir } = orden;
      return [...arr].sort((a, b) => {
        const va = valor(a, campo);
        const vb = valor(b, campo);
        if (vacio(va) || vacio(vb)) return vacio(va) && vacio(vb) ? 0 : vacio(va) ? 1 : -1;
        if (campo === 'remediacion') return ((posEstatus.get(String(va)) ?? 99) - (posEstatus.get(String(vb)) ?? 99)) * dir;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
      });
    };
  }, [orden, catalogo]);
  return { orden, setOrden, ordenar };
}
