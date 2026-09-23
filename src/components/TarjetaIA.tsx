import { useMemo } from 'react';
import { Sparkles, Trash2, MessageSquareQuote, Download } from 'lucide-react';
import { calcularTarjeta, filtrar, DIMENSIONES, ESPECIALES, type FilaAgregada, type UsuarioSap } from '../../supabase/functions/_shared/datos.ts';
import { useDatos, type Widget } from '../lib/datos';
import { useTema } from '../lib/tema';
import { useAuth } from '../lib/auth';
import { ETIQUETAS_CAMPO, fmt, pct } from '../lib/ui';
import { descargarCSV, nombreArchivo } from '../lib/csv';
import { opcionApiladaGenerica, opcionBarras, opcionDonaGenerica, opcionMapaCalor, opcionCerradoAbierto } from '../lib/graficas';
import { Grafica } from './Grafica';
import { Barra, PildoraEstatus } from './ui';
import { Th, useOrden, type Orden } from './Ordenable';

export function TarjetaIA({ w, onEliminar, destacada }: { w: Widget; onEliminar?: () => void; destacada?: boolean }) {
  const { usuarios, ctx, catalogo } = useDatos();
  const { oscuro } = useTema();
  const { perfil, puedeEditar } = useAuth();
  const r = useMemo(() => calcularTarjeta(usuarios, w.spec, ctx), [usuarios, w.spec, ctx]);
  const { orden, setOrden, ordenar } = useOrden(catalogo);

  // Se ordena el universo completo del filtro y luego se recorta a lo que cabe en la tarjeta
  const filasLista = useMemo(() => {
    if (r.tipo !== 'lista') return [];
    if (!orden) return r.filas as UsuarioSap[];
    return ordenar(filtrar(usuarios, w.spec, ctx), (u, c) => u[c as keyof UsuarioSap]).slice(0, r.filas.length);
  }, [r, ordenar, orden, usuarios, w.spec, ctx]);
  const filasTabla = useMemo(
    () => (r.tipo === 'tabla' ? ordenar(r.filas as FilaAgregada[], (f, c) => f[c as keyof FilaAgregada]) : []),
    [r, ordenar, orden],
  );
  const puedeBorrar = puedeEditar || w.created_by === perfil?.id;

  const filtrosTxt = [
    ...Object.entries(w.spec.filtros ?? {})
      .filter(([, v]) => v?.length)
      .map(([k, v]) => `${DIMENSIONES[k as keyof typeof DIMENSIONES] ?? k}: ${v!.join(', ')}`),
    ...(w.spec.especiales ?? []).map((e) => ESPECIALES[e]?.replace(/^Solo /, '') ?? e),
    ...(w.spec.texto ? [`texto: “${w.spec.texto}”`] : []),
  ];

  function exportarCSV() {
    const archivo = nombreArchivo(w.titulo);
    if (r.tipo === 'kpi') {
      descargarCSV(archivo, ['Indicador', 'Usuarios', 'Universo', '% del universo', 'Avance del grupo'], [
        [w.titulo, r.valor, r.de, pct(r.valor / Math.max(1, r.de)), pct(r.avance)],
      ]);
      return;
    }
    if (r.tipo === 'lista') {
      descargarCSV(
        archivo,
        r.columnas.map((c) => ETIQUETAS_CAMPO[c] ?? c),
        // El CSV lleva TODOS los usuarios del filtro (no solo los que caben en pantalla),
        // en el mismo orden que se ve en la tarjeta
        ordenar(filtrar(usuarios, w.spec, ctx), (u, c) => u[c as keyof UsuarioSap]).map((u) => r.columnas.map((c) => u[c as keyof UsuarioSap])),
      );
      return;
    }
    const series = [...new Set(r.filas.flatMap((f) => Object.keys(f.series ?? {})))];
    const filas = r.tipo === 'tabla' ? filasTabla : r.filas;
    descargarCSV(
      archivo,
      [DIMENSIONES[w.spec.dimension!] ?? 'Grupo', 'Total', 'Cerrados', 'Abiertos', 'Avance', ...series],
      filas.map((f) => [f.clave, f.total, f.cerrados, f.abiertos, pct(f.avance), ...series.map((s) => f.series?.[s] ?? 0)]),
    );
  }

  const ancho = w.spec.tipo === 'lista' || w.spec.tipo === 'tabla' || w.spec.tipo === 'mapa_calor' ? 'lg:col-span-2' : '';

  return (
    <article className={`card flex min-w-0 flex-col p-4 sm:p-5 ${ancho} ${destacada ? 'ring-2 ring-accent' : ''}`}>
      <header className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-ink">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{w.titulo}</h3>
          {w.descripcion && <p className="mt-0.5 text-xs text-muted">{w.descripcion}</p>}
        </div>
        <button onClick={exportarCSV} className="no-print flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Descargar CSV de ${w.titulo}`} title="Descargar los datos de esta tarjeta en CSV">
          <Download className="size-4" /> CSV
        </button>
        {puedeBorrar && onEliminar && (
          <button onClick={onEliminar} className="no-print rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-crit" aria-label="Quitar tarjeta" title="Quitar tarjeta">
            <Trash2 className="size-4" />
          </button>
        )}
      </header>

      <div className="flex-1">
        {r.tipo === 'kpi' && (
          <div className="py-2">
            <div className="font-display text-4xl font-semibold text-ink tabular">{fmt(r.valor)}</div>
            <div className="mt-1 text-xs text-muted">
              {pct(r.valor / Math.max(1, r.de))} del universo · avance del grupo {pct(r.avance)}
            </div>
            <div className="mt-3">
              <Barra valor={r.avance} />
            </div>
          </div>
        )}
        {r.tipo === 'barras' && <Grafica etiqueta={w.titulo} alto={240} opcion={opcionBarras(r.filas!, oscuro, w.spec.dimension === 'remediacion', catalogo)} />}
        {r.tipo === 'dona' && <Grafica etiqueta={w.titulo} alto={220} opcion={opcionDonaGenerica(r.filas!, oscuro, catalogo, w.spec.dimension === 'remediacion')} />}
        {r.tipo === 'barras_apiladas' &&
          (w.spec.serie === 'grupo_estatus' ? (
            <Grafica etiqueta={w.titulo} alto={Math.max(180, r.filas!.length * 30 + 50)} opcion={opcionCerradoAbierto(r.filas!, oscuro)} />
          ) : (
            <Grafica etiqueta={w.titulo} alto={Math.max(180, r.filas!.length * 30 + 50)} opcion={opcionApiladaGenerica(r.filas!, oscuro, catalogo, w.spec.serie === 'remediacion')} />
          ))}
        {r.tipo === 'mapa_calor' && <MapaCalorIA filas={r.filas!} />}
        {r.tipo === 'tabla' && <TablaAgregada filas={filasTabla} etiqueta={DIMENSIONES[w.spec.dimension!]} orden={orden} setOrden={setOrden} />}
        {r.tipo === 'lista' && (
          <div>
            <p className="mb-2 text-xs text-muted">
              {fmt(r.total)} usuarios{r.total > r.filas.length ? ` · se muestran ${r.filas.length}` : ''}
            </p>
            <div className="max-h-72 overflow-auto scroll-thin rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left text-muted">
                  <tr>{r.columnas.map((c) => <Th key={c} campo={c} etiqueta={ETIQUETAS_CAMPO[c] ?? c} orden={orden} setOrden={setOrden} />)}</tr>
                </thead>
                <tbody>
                  {filasLista.map((u: UsuarioSap) => (
                    <tr key={u.id} className="border-t border-line">
                      {r.columnas.map((c) => (
                        <td key={c} className="px-2.5 py-1.5 whitespace-nowrap text-ink-2">
                          {c === 'remediacion' ? <PildoraEstatus nombre={u.remediacion} catalogo={catalogo} compacta /> : String(u[c as keyof UsuarioSap] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-3 space-y-1 border-t border-line pt-2.5 text-[11px] text-muted">
        {filtrosTxt.length > 0 && <p>Filtro: {filtrosTxt.join(' · ')}</p>}
        {w.pregunta && (
          <p className="flex items-start gap-1.5">
            <MessageSquareQuote className="mt-px size-3 shrink-0" />
            <span className="line-clamp-2">“{w.pregunta}”</span>
          </p>
        )}
        <p>Se recalcula en vivo · creada por {w.created_by_email ?? 'IA'}</p>
      </footer>
    </article>
  );
}

function MapaCalorIA({ filas }: { filas: FilaAgregada[] }) {
  const { oscuro } = useTema();
  const cols = [...new Set(filas.flatMap((f) => Object.keys(f.series ?? {})))];
  return <Grafica etiqueta="Mapa de calor" alto={Math.max(200, filas.length * 36 + 70)} opcion={opcionMapaCalor(filas, cols, oscuro)} />;
}

function TablaAgregada({ filas, etiqueta, orden, setOrden }: { filas: FilaAgregada[]; etiqueta: string; orden: Orden; setOrden: (o: Orden) => void }) {
  return (
    <div className="max-h-80 overflow-auto scroll-thin rounded-lg border border-line">
      <table className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-surface-2 text-left text-muted">
          <tr>
            <Th campo="clave" etiqueta={etiqueta} orden={orden} setOrden={setOrden} />
            <Th campo="total" etiqueta="Total" orden={orden} setOrden={setOrden} className="text-right" />
            <Th campo="cerrados" etiqueta="Cerrados" orden={orden} setOrden={setOrden} className="text-right" />
            <Th campo="abiertos" etiqueta="Abiertos" orden={orden} setOrden={setOrden} className="text-right" />
            <Th campo="avance" etiqueta="Avance" orden={orden} setOrden={setOrden} className="w-40" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-t border-line">
              <td className="px-2.5 py-1.5 font-medium text-ink">{f.clave}</td>
              <td className="px-2.5 py-1.5 text-right">{fmt(f.total)}</td>
              <td className="px-2.5 py-1.5 text-right">{fmt(f.cerrados)}</td>
              <td className="px-2.5 py-1.5 text-right">{fmt(f.abiertos)}</td>
              <td className="px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <Barra valor={f.avance} />
                  <span className="w-11 text-right text-ink-2">{pct(f.avance, 0)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
