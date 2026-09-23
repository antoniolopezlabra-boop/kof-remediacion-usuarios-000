import { useEffect, useMemo } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  CheckCircle2, Clock, ShieldAlert, CalendarX2, Target, Sparkles, X, ArrowRight, Server, Cloud, FilterX, Activity, Database, ListChecks,
} from 'lucide-react';
import { agregar, resumen, DIMENSIONES, ESPECIALES, type Dimension, type Especial } from '../../supabase/functions/_shared/datos.ts';
import { useDatos } from '../lib/datos';
import { useTema } from '../lib/tema';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colorSerie, fechaLarga, fmt, haceCuanto, ORDEN_AMBIENTES, pct, SIN_CLASIFICAR_COLOR, CERRADO, ABIERTO, ETIQUETAS_CAMPO } from '../lib/ui';
import { opcionApiladaEstatus, opcionCerradoAbierto, opcionDona, opcionMapaCalor, opcionTendencia } from '../lib/graficas';
import { Grafica, type ClickGrafica } from '../components/Grafica';
import { Barra, Kpi, PildoraEstatus, Seccion, Tarjeta, useAvisos } from '../components/ui';
import { TarjetaIA } from '../components/TarjetaIA';
import { DetalleSid } from '../components/DetalleSid';
import type { LayoutCtx } from '../components/Layout';

export default function Dashboard() {
  const { usuarios, filtrados, catalogo, ctx, config, filtros, alternarFiltro, alternarEspecial, limpiarFiltros, widgets, snapshots, actividad } = useDatos();
  const { oscuro } = useTema();
  const { puedeEditar } = useAuth();
  const { presentacion, abrirAsistente } = useOutletContext<LayoutCtx>();
  const avisar = useAvisos();
  const [params, setParams] = useSearchParams();
  const destacada = params.get('tarjeta');

  const r = useMemo(() => resumen(filtrados, ctx), [filtrados, ctx]);
  const hayFiltros = Object.values(filtros.filtros ?? {}).some((v) => v?.length) || (filtros.especiales?.length ?? 0) > 0;

  const porAmbiente = useMemo(() => agregar(filtrados, 'ambiente', ctx, 'remediacion'), [filtrados, ctx]);
  const porPlataforma = useMemo(() => agregar(filtrados, 'plataforma', ctx), [filtrados, ctx]);
  const porAdmin = useMemo(() => agregar(filtrados, 'administrador', ctx).sort((a, b) => b.abiertos - a.abiertos || b.total - a.total), [filtrados, ctx]);
  const porSistema = useMemo(() => agregar(filtrados, 'sistema', ctx).sort((a, b) => b.abiertos - a.abiertos || b.total - a.total), [filtrados, ctx]);
  const privAbiertos = useMemo(
    () =>
      filtrados
        .filter((u) => u.privilegiado && ctx.catalogo.find((c) => c.nombre === u.remediacion)?.tipo !== 'Cerrado')
        .sort((a, b) => ORDEN_AMBIENTES.indexOf(a.ambiente ?? '') - ORDEN_AMBIENTES.indexOf(b.ambiente ?? '')),
    [filtrados, ctx],
  );
  const privPorAmbiente = useMemo(() => agregar(filtrados.filter((u) => u.privilegiado), 'ambiente', ctx), [filtrados, ctx]);

  const conteosEstatus = [...catalogo.map((c) => ({ nombre: c.nombre, valor: r.por_estatus[c.nombre] ?? 0 })), { nombre: 'Sin clasificar', valor: r.por_estatus['Sin clasificar'] ?? 0 }];
  const enProceso = catalogo.filter((c) => c.tipo === 'En proceso').reduce((a, c) => a + (r.por_estatus[c.nombre] ?? 0), 0) + (r.por_estatus['Sin clasificar'] ?? 0);

  // Brechas de información del inventario
  const brechas = useMemo(() => {
    const n = (f: (u: (typeof usuarios)[number]) => boolean) => filtrados.filter(f).length;
    return [
      { etiqueta: 'Status SAP sin documentar', valor: n((u) => !u.status_sap) },
      { etiqueta: 'Vigencia no documentada', valor: n((u) => u.vigencia_tipo === 'NO DOCUMENTADA') },
      { etiqueta: 'Columna de privilegios sin dato', valor: n((u) => !u.privilegio) },
      { etiqueta: 'Sin nombre de usuario', valor: n((u) => !u.nombre) },
      { etiqueta: 'KIT pendiente sin número de KIT', valor: n((u) => u.remediacion === 'KIT pendiente de aprobación' && !u.kit) },
    ];
  }, [filtrados]);

  useEffect(() => {
    if (!destacada) return;
    const el = document.getElementById(`tarjeta-${destacada}`) ?? document.getElementById('insights');
    setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    const t = setTimeout(() => setParams({}, { replace: true }), 6000);
    return () => clearTimeout(t);
  }, [destacada, widgets.length, setParams]);

  const click = (dim: Dimension) => (p: ClickGrafica) => {
    if (p.name) alternarFiltro(dim, p.name);
  };
  const clickSerieEstatus = (p: ClickGrafica) => {
    if (p.seriesName && p.seriesName !== 'avance') alternarFiltro('remediacion', p.seriesName);
    else if (p.name) alternarFiltro('ambiente', p.name);
  };

  async function eliminarTarjeta(id: string) {
    const { error } = await supabase.from('widgets_ia').delete().eq('id', id);
    if (error) avisar(error.message, 'error');
    else avisar('Tarjeta eliminada');
  }

  const estatusCols = [...catalogo.map((c) => c.nombre), ...(r.por_estatus['Sin clasificar'] ? ['Sin clasificar'] : [])];
  const cC = oscuro ? CERRADO.dark : CERRADO.light;
  const cA = oscuro ? ABIERTO.dark : ABIERTO.light;

  return (
    <div className={clsx('mx-auto max-w-[1440px] space-y-10 px-4 py-6 sm:px-6 lg:px-8', presentacion && 'space-y-0 py-4')}>
      {/* Encabezado */}
      <section className="seccion">
        <div className="relative overflow-hidden rounded-3xl bg-navy p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full bg-[radial-gradient(circle,#ffae4126,transparent_65%)]" />
          <div className="pointer-events-none absolute -bottom-40 left-1/3 size-[420px] rounded-full bg-[radial-gradient(circle,#4995ff26,transparent_65%)]" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="font-display text-xs font-semibold tracking-[0.2em] text-[#ffae41] uppercase">{config.cliente ?? 'Coca-Cola FEMSA (KOF)'} · Reporte ejecutivo</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{config.titulo ?? 'Revisión de Usuarios SAP — Mandante 000'}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Avance de la remediación de usuarios en todos los sistemas SAP. Fecha de corte del reporte base: {fechaLarga(config.fecha_corte)}; los cambios del equipo técnico se reflejan en tiempo real.
              </p>
              <div className="mt-6 grid max-w-2xl grid-cols-3 gap-4">
                {[
                  { k: 'Universo', v: fmt(r.total), d: hayFiltros ? `de ${fmt(usuarios.length)} totales` : 'usuarios en alcance' },
                  { k: 'Cerrados', v: fmt(r.cerrados), d: 'Remediado + En Orden' },
                  { k: 'En proceso', v: fmt(r.abiertos), d: 'por atender' },
                ].map((x) => (
                  <div key={x.k} className="border-l border-white/15 pl-4">
                    <p className="text-[11px] tracking-wide text-white/55 uppercase">{x.k}</p>
                    <p className="font-display text-3xl font-semibold tabular">{x.v}</p>
                    <p className="text-[11px] text-white/50">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
            <AnilloAvance valor={r.avance} />
          </div>
        </div>
      </section>

      {/* Filtros activos */}
      {hayFiltros && (
        <div className="no-print sticky top-0 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur">
          <span className="text-xs font-medium text-muted">Filtrando:</span>
          {Object.entries(filtros.filtros ?? {}).flatMap(([dim, vals]) =>
            (vals ?? []).map((v) => (
              <button key={dim + v} onClick={() => alternarFiltro(dim as Dimension, v)} className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-ink hover:bg-accent/25">
                {DIMENSIONES[dim as Dimension]}: {v} <X className="size-3" />
              </button>
            )),
          )}
          {(filtros.especiales ?? []).map((e) => (
            <button key={e} onClick={() => alternarEspecial(e)} className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-ink hover:bg-accent/25">
              {ESPECIALES[e].replace(/^Solo /, '')} <X className="size-3" />
            </button>
          ))}
          <button onClick={limpiarFiltros} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-ink">
            <FilterX className="size-3.5" /> Limpiar
          </button>
        </div>
      )}
      {!hayFiltros && !presentacion && (
        <p className="no-print -mt-6 text-xs text-muted">Tip: haz clic en cualquier barra, segmento o indicador para filtrar todo el tablero.</p>
      )}

      {/* KPIs */}
      <section className="seccion grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi etiqueta="Avance general" icono={<Target className="size-3.5" />} valor={pct(r.avance)} detalle={`${fmt(r.cerrados)} de ${fmt(r.total)} cerrados`} acento={cC} />
        <Kpi etiqueta="Remediados" icono={<CheckCircle2 className="size-3.5" />} valor={fmt(r.por_estatus['Remediado'] ?? 0)} detalle={`${pct((r.por_estatus['Remediado'] ?? 0) / Math.max(1, r.total))} · acción ejecutada`} acento={colorSerie('#4a3aa7', oscuro)} onClick={() => alternarFiltro('remediacion', 'Remediado')} activo={filtros.filtros?.remediacion?.includes('Remediado')} />
        <Kpi etiqueta="En Orden" icono={<ListChecks className="size-3.5" />} valor={fmt(r.por_estatus['En Orden'] ?? 0)} detalle={`${pct((r.por_estatus['En Orden'] ?? 0) / Math.max(1, r.total))} · sin acción requerida`} acento={colorSerie('#1baf7a', oscuro)} onClick={() => alternarFiltro('remediacion', 'En Orden')} activo={filtros.filtros?.remediacion?.includes('En Orden')} />
        <Kpi etiqueta="En proceso" icono={<Clock className="size-3.5" />} valor={fmt(enProceso)} detalle="Validación + KIT" acento={cA} onClick={() => alternarEspecial('abierto')} activo={filtros.especiales?.includes('abierto')} />
        <Kpi etiqueta="Privilegiados abiertos" icono={<ShieldAlert className="size-3.5" />} valor={fmt(r.privilegiados_abiertos)} detalle={`SAP_ALL / SAP_NEW · ${fmt(r.privilegiados_abiertos_productivo)} en PRODUCTIVO de ${fmt(r.privilegiados)}`} acento="var(--crit)" onClick={() => alternarEspecial('privilegiado')} activo={filtros.especiales?.includes('privilegiado')} />
        <Kpi etiqueta="Activos c/ vigencia vencida" icono={<CalendarX2 className="size-3.5" />} valor={fmt(r.activos_vencidos)} detalle="Status ACTIVO con fecha fin pasada" acento="var(--warn)" onClick={() => alternarEspecial('activo_vencido')} activo={filtros.especiales?.includes('activo_vencido')} />
      </section>

      {/* 1. Estatus */}
      <Seccion id="estatus" numero="01 · Estatus" titulo="Estatus de remediación del universo" descripcion="Clasificación de cada usuario según el catálogo de remediación. «Cerrado» = Remediado o En Orden.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-5" titulo="Distribución por estatus" subtitulo="Clic en un segmento para filtrar">
            <Grafica etiqueta="Distribución por estatus" alto={300} opcion={opcionDona(conteosEstatus, catalogo, oscuro, pct(r.avance), 'avance general')} onClick={click('remediacion')} />
          </Tarjeta>
          <Tarjeta className="lg:col-span-7" titulo="Flujo de remediación" subtitulo="Cada usuario avanza de izquierda a derecha hasta quedar cerrado">
            <div className="space-y-2.5">
              {conteosEstatus
                .filter((e) => e.nombre !== 'Sin clasificar' || e.valor > 0)
                .map((e) => {
                  const cat = catalogo.find((c) => c.nombre === e.nombre);
                  const color = cat ? colorSerie(cat.color, oscuro) : oscuro ? SIN_CLASIFICAR_COLOR.dark : SIN_CLASIFICAR_COLOR.light;
                  const activo = filtros.filtros?.remediacion?.includes(e.nombre);
                  return (
                    <button
                      key={e.nombre}
                      onClick={() => alternarFiltro('remediacion', e.nombre)}
                      className={clsx('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-left transition hover:bg-surface-2', activo ? 'border-accent' : 'border-transparent')}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate text-sm font-medium text-ink">{e.nombre}</span>
                        <span className={clsx('hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline', cat?.tipo === 'Cerrado' ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn')}>
                          {cat?.tipo ?? 'Sin estatus'}
                        </span>
                      </div>
                      <div className="text-right text-sm tabular">
                        <b className="text-ink">{fmt(e.valor)}</b> <span className="text-muted">· {pct(e.valor / Math.max(1, r.total))}</span>
                      </div>
                      <div className="col-span-2">
                        <Barra valor={e.valor / Math.max(1, r.total)} color={color} />
                      </div>
                      {cat && <p className="col-span-2 text-xs text-muted">{cat.definicion}</p>}
                    </button>
                  );
                })}
            </div>
          </Tarjeta>
        </div>
      </Seccion>

      {/* 2. Ambiente */}
      <Seccion id="ambiente" numero="02 · Ambientes" titulo="Avance por ambiente — dónde está el riesgo" descripcion="Un usuario no depurado pesa más en PRODUCTIVO. Compara el avance de remediación contra la criticidad del ambiente.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-7" titulo="Composición de estatus por ambiente" subtitulo="100% por ambiente · la etiqueta muestra el % de avance">
            <Grafica etiqueta="Composición de estatus por ambiente" alto={320} opcion={opcionApiladaEstatus(porAmbiente, catalogo, oscuro, { porcentaje: true, orden: ORDEN_AMBIENTES })} onClick={clickSerieEstatus} />
          </Tarjeta>
          <Tarjeta className="lg:col-span-5" titulo="Mapa de calor · usuarios por ambiente y estatus" subtitulo="Mayor intensidad = más usuarios · clic para filtrar">
            <Grafica etiqueta="Mapa de calor ambiente por estatus" alto={320} opcion={opcionMapaCalor(porAmbiente, estatusCols, oscuro, ORDEN_AMBIENTES)} onClick={(p) => { const v = (p.data as { value?: [number, number, number] } | undefined)?.value; if (v) alternarFiltro('remediacion', estatusCols[v[0]]); }} />
          </Tarjeta>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ORDEN_AMBIENTES.map((a) => {
            const f = porAmbiente.find((x) => x.clave === a);
            if (!f) return null;
            return (
              <button key={a} onClick={() => alternarFiltro('ambiente', a)} className={clsx('card p-3.5 text-left transition hover:-translate-y-0.5', filtros.filtros?.ambiente?.includes(a) && 'ring-2 ring-accent')}>
                <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{a}</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink tabular">{pct(f.avance, 0)}</p>
                <p className="mb-2 text-[11px] text-muted">{fmt(f.abiertos)} abiertos de {fmt(f.total)}</p>
                <Barra valor={f.avance} color={cC} />
              </button>
            );
          })}
        </div>
      </Seccion>

      {/* 3. Plataforma y responsables */}
      <Seccion id="responsables" numero="03 · Responsables" titulo="Plataforma y carga por administrador responsable" descripcion="Dónde se concentra el trabajo pendiente para asignar compromisos de cierre.">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="grid gap-4 lg:col-span-4">
            {porPlataforma.map((p) => (
              <button key={p.clave} onClick={() => alternarFiltro('plataforma', p.clave)} className={clsx('card flex items-center gap-4 p-5 text-left transition hover:-translate-y-0.5', filtros.filtros?.plataforma?.includes(p.clave) && 'ring-2 ring-accent')}>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2">
                  {p.clave === 'AZURE' ? <Cloud className="size-6" /> : <Server className="size-6" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display font-semibold text-ink">{p.clave}</p>
                    <p className="font-display text-2xl font-semibold text-ink tabular">{pct(p.avance, 0)}</p>
                  </div>
                  <p className="mb-2 text-xs text-muted">
                    {fmt(p.total)} usuarios · {fmt(p.cerrados)} cerrados · {fmt(p.abiertos)} abiertos
                  </p>
                  <Barra valor={p.avance} color={cC} />
                </div>
              </button>
            ))}
          </div>
          <Tarjeta className="lg:col-span-8" titulo="Avance por administrador responsable" subtitulo="Ordenado por casos abiertos · etiqueta = % de avance">
            <Grafica etiqueta="Avance por administrador" alto={Math.max(260, porAdmin.length * 34 + 50)} opcion={opcionCerradoAbierto(porAdmin, oscuro)} onClick={click('administrador')} />
          </Tarjeta>
        </div>
      </Seccion>

      {/* 4. Sistemas */}
      <Seccion id="sistemas" numero="04 · Sistemas" titulo="Ruta crítica por sistema" descripcion="Sistemas ordenados por usuarios pendientes. Define el orden de ataque de la depuración.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-7" titulo="Cerrados vs. abiertos por sistema" subtitulo="Etiqueta = % de avance · clic para filtrar">
            <Grafica etiqueta="Cerrados y abiertos por sistema" alto={Math.max(300, porSistema.length * 26 + 50)} opcion={opcionCerradoAbierto(porSistema, oscuro)} onClick={click('sistema')} />
          </Tarjeta>
          <Tarjeta className="lg:col-span-5" titulo="Top 10 con mayor pendiente">
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Sistema</th>
                  <th className="pb-2 text-right font-medium">Abiertos</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="w-32 pb-2 pl-3 font-medium">% pendiente</th>
                </tr>
              </thead>
              <tbody>
                {porSistema.filter((s) => s.abiertos > 0).slice(0, 10).map((s) => (
                  <tr key={s.clave} className="cursor-pointer border-t border-line hover:bg-surface-2" onClick={() => alternarFiltro('sistema', s.clave)}>
                    <td className="py-2 font-medium text-ink">{s.clave}</td>
                    <td className="py-2 text-right font-semibold text-ink">{fmt(s.abiertos)}</td>
                    <td className="py-2 text-right text-muted">{fmt(s.total)}</td>
                    <td className="py-2 pl-3">
                      <div className="flex items-center gap-2">
                        <Barra valor={s.abiertos / s.total} color={cA} />
                        <span className="w-10 text-right text-xs text-ink-2">{pct(s.abiertos / s.total, 0)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        </div>
      </Seccion>

      {/* 5. Detalle por SID */}
      <Seccion
        id="detalle-sid"
        numero="05 · Detalle por SID"
        titulo="Detalle por SID"
        descripcion="Elige un ambiente para acotar la lista de SIDs y consulta el avance completo de un sistema: estatus, tipos de usuario y el listado de sus usuarios."
      >
        <DetalleSid />
      </Seccion>

      {/* 6. Riesgo crítico */}
      <Seccion
        id="riesgo"
        numero="06 · Riesgo"
        titulo="Riesgo crítico — usuarios con SAP_ALL / SAP_NEW"
        descripcion="Se consideran privilegiados únicamente los usuarios con perfil SAP_ALL o SAP_NEW. Uno de ellos sin cerrar en PRODUCTIVO es la exposición más alta del inventario."
        acciones={
          <Link to="/gestion?privilegiado=1&abierto=1" className="no-print flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
            Ver en gestión <ArrowRight className="size-4" />
          </Link>
        }
      >
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1">
            <Kpi etiqueta="Con SAP_ALL / SAP_NEW" valor={fmt(r.privilegiados)} detalle={`${pct(r.privilegiados / Math.max(1, r.total))} del universo`} icono={<ShieldAlert className="size-3.5" />} />
            <Kpi etiqueta="Abiertos" valor={fmt(r.privilegiados_abiertos)} detalle="aún sin cerrar" acento="var(--warn)" />
            <Kpi etiqueta="Abiertos en PRODUCTIVO" valor={fmt(r.privilegiados_abiertos_productivo)} detalle="máxima prioridad" acento="var(--crit)" onClick={() => { alternarEspecial('privilegiado'); alternarFiltro('ambiente', 'PRODUCTIVO'); }} />
            <Kpi etiqueta="Nativos SAP" valor={fmt(r.nativos)} detalle={(config.usuarios_nativos ?? []).join(', ')} onClick={() => alternarEspecial('nativo' as Especial)} activo={filtros.especiales?.includes('nativo')} />
          </div>
          <div className="grid min-w-0 gap-4 lg:col-span-8">
            <Tarjeta titulo="Privilegiados por ambiente" subtitulo="Cerrados vs. abiertos">
              <Grafica etiqueta="Privilegiados por ambiente" alto={200} opcion={opcionCerradoAbierto(ORDEN_AMBIENTES.map((a) => privPorAmbiente.find((f) => f.clave === a)).filter((f) => !!f), oscuro)} onClick={click('ambiente')} />
            </Tarjeta>
            <Tarjeta titulo={`Privilegiados abiertos (${fmt(privAbiertos.length)})`} subtitulo="Ordenados por criticidad de ambiente">
              {privAbiertos.length === 0 ? (
                <p className="py-6 text-center text-sm text-good">Sin usuarios privilegiados abiertos en la vista actual.</p>
              ) : (
                <div className="max-h-72 overflow-auto scroll-thin">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface text-left text-muted">
                      <tr>{['sid', 'ambiente', 'usuario', 'nombre', 'privilegio', 'remediacion', 'administrador'].map((c) => <th key={c} className="pb-2 pr-3 font-medium whitespace-nowrap">{ETIQUETAS_CAMPO[c]}</th>)}</tr>
                    </thead>
                    <tbody>
                      {privAbiertos.map((u) => (
                        <tr key={u.id} className="border-t border-line">
                          <td className="py-1.5 pr-3 font-medium text-ink">{u.sid}</td>
                          <td className="py-1.5 pr-3 text-ink-2">{u.ambiente}</td>
                          <td className="py-1.5 pr-3 font-mono text-ink">{u.usuario}</td>
                          <td className="max-w-40 truncate py-1.5 pr-3 text-ink-2">{u.nombre ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-ink-2">{u.privilegio}</td>
                          <td className="py-1.5 pr-3"><PildoraEstatus nombre={u.remediacion} catalogo={catalogo} compacta /></td>
                          <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">{u.administrador}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          </div>
        </div>
      </Seccion>

      {/* 6. Tendencia y actividad */}
      <Seccion id="tendencia" numero="07 · Tendencia" titulo="Evolución del avance y actividad del equipo" descripcion="Cada cambio de estatus queda registrado: la curva muestra el % cerrado por día desde la fecha de corte.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-7" titulo="% de avance por día" subtitulo={snapshots.length < 3 ? 'La curva crece conforme el equipo registra avances diarios' : undefined}>
            <Grafica etiqueta="Tendencia del avance" alto={280} opcion={opcionTendencia(snapshots, catalogo, oscuro)} />
          </Tarjeta>
          <Tarjeta className="lg:col-span-5" titulo="Actividad reciente" subtitulo="Últimos cambios registrados por el equipo técnico" acciones={<Link to="/bitacora" className="no-print text-xs font-medium text-brand hover:underline">Ver bitácora</Link>}>
            {actividad.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
                <Activity className="size-6" />
                Aún no hay cambios registrados desde la carga inicial.
              </div>
            ) : (
              <ul className="max-h-64 space-y-2.5 overflow-auto scroll-thin pr-1">
                {actividad.slice(0, 12).map((a) => {
                  const cambio = a.cambios.remediacion as [string | null, string | null] | undefined;
                  return (
                    <li key={a.id} className="flex gap-3 text-xs">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink">
                          <b className="font-mono">{a.usuario}</b> <span className="text-muted">({a.sid})</span>{' '}
                          {cambio ? (
                            <>
                              → <b>{cambio[1] ?? 'sin estatus'}</b>
                            </>
                          ) : (
                            <span className="text-muted">actualizó {Object.keys(a.cambios).map((k) => ETIQUETAS_CAMPO[k] ?? k).join(', ')}</span>
                          )}
                        </p>
                        <p className="text-muted">
                          {a.actor_email ?? 'sistema'} · {haceCuanto(a.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </div>
      </Seccion>

      {/* 7. Insights IA */}
      <Seccion
        id="insights"
        numero="08 · Insights IA"
        titulo="Insights generados por el Asistente IA"
        descripcion="Cortes que surgieron de preguntas al asistente. Cada tarjeta guarda su consulta y se recalcula en vivo con los datos del equipo."
        acciones={
          <button onClick={() => abrirAsistente()} className="no-print flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent-ink hover:bg-accent/20">
            <Sparkles className="size-4" /> Preguntar algo nuevo
          </button>
        }
      >
        {widgets.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
            <Sparkles className="size-7 text-accent" />
            <p className="max-w-md text-sm text-muted">
              Aún no hay insights. Pregunta al asistente algo que no esté en este tablero —por ejemplo «¿qué usuarios DDIC siguen abiertos por SID?»— y la respuesta aparecerá aquí como tarjeta permanente.
            </p>
            <button onClick={() => abrirAsistente('¿Cuántos usuarios de tipo DIALOGO siguen abiertos por sistema y cuál es su avance?')} className="no-print rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white dark:bg-accent dark:text-navy">
              Probar un ejemplo
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {widgets.map((w) => (
              <div key={w.id} id={`tarjeta-${w.id}`} className={clsx('min-w-0', (w.spec.tipo === 'lista' || w.spec.tipo === 'tabla' || w.spec.tipo === 'mapa_calor') && 'lg:col-span-2')}>
                <TarjetaIA w={w} destacada={w.id === destacada} onEliminar={() => eliminarTarjeta(w.id)} />
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* 8. Calidad del dato */}
      <Seccion id="calidad" numero="09 · Gobierno" titulo="Calidad del dato y catálogo de estatus" descripcion="Brechas de información que conviene cerrar para completar la remediación del inventario.">
        <div className="grid gap-4 lg:grid-cols-12">
          <Tarjeta className="lg:col-span-5" titulo="Brechas de información" subtitulo="Campos sin documentar en la vista actual">
            <ul className="space-y-3">
              {brechas.map((b) => (
                <li key={b.etiqueta}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <Database className="size-3.5 text-muted" /> {b.etiqueta}
                    </span>
                    <span className="font-semibold text-ink tabular">
                      {fmt(b.valor)} <span className="text-xs font-normal text-muted">· {pct(b.valor / Math.max(1, r.total), 0)}</span>
                    </span>
                  </div>
                  <Barra valor={b.valor / Math.max(1, r.total)} color="var(--warn)" />
                </li>
              ))}
            </ul>
          </Tarjeta>
          <Tarjeta className="lg:col-span-7" titulo="Catálogo de estatus — gobierno de la columna «Remediación»" subtitulo={puedeEditar ? 'Única fuente válida: la plataforma solo admite estos valores.' : undefined}>
            <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <tbody>
                {catalogo.map((c) => (
                  <tr key={c.nombre} className="border-t border-line first:border-0">
                    <td className="py-2.5 pr-3 align-top"><PildoraEstatus nombre={c.nombre} catalogo={catalogo} /></td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', c.tipo === 'Cerrado' ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn')}>{c.tipo}</span>
                    </td>
                    <td className="py-2.5 text-xs text-muted">{c.definicion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Tarjeta>
        </div>
        <p className="mt-6 text-center text-[11px] text-muted">
          DXC Technology · Servicios administrados SAP para Coca-Cola FEMSA · Actualizado {new Date().toLocaleString('es-MX')} · Usuarios en vista: {fmt(r.total)}
        </p>
      </Seccion>
    </div>
  );
}

function AnilloAvance({ valor }: { valor: number }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto size-44 shrink-0 lg:mx-0" role="img" aria-label={`Avance general ${pct(valor)}`}>
      <svg viewBox="0 0 160 160" className="size-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="14" />
        <circle cx="80" cy="80" r={R} fill="none" stroke="#FFAE41" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * valor} ${C}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-semibold tabular">{pct(valor)}</span>
        <span className="text-[11px] tracking-wide text-white/60 uppercase">avance general</span>
      </div>
    </div>
  );
}
