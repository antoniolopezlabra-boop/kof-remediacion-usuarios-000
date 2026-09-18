// Constructores de opciones ECharts con el mismo lenguaje visual en todo el tablero:
// marcas delgadas, esquinas de 4px en el extremo de datos, 2px de separación entre
// segmentos, rejilla recesiva, texto siempre en tokens de tinta (nunca en color de serie).
import type { EChartsOption } from 'echarts';
import type { Estatus, FilaAgregada } from '../../supabase/functions/_shared/datos.ts';
import { tokensGrafica } from '../components/Grafica';
import { ABIERTO, CERRADO, colorSerie, fmt, pct, SECUENCIAL, SECUENCIAL_OSCURO, SIN_CLASIFICAR_COLOR } from './ui';

const RADIO_H: [number, number, number, number] = [0, 4, 4, 0];

const ABREVIA: Record<string, string> = {
  'En Validación': 'En\nValidación',
  'Pendiente KIT': 'Pendiente\nKIT',
  'KIT pendiente de aprobación': 'KIT pend.\naprobación',
  'Sin clasificar': 'Sin\nclasificar',
};

function colorEstatus(nombre: string, catalogo: Estatus[], oscuro: boolean) {
  const e = catalogo.find((c) => c.nombre === nombre);
  return e ? colorSerie(e.color, oscuro) : oscuro ? SIN_CLASIFICAR_COLOR.dark : SIN_CLASIFICAR_COLOR.light;
}

/** Dona de estatus con el total al centro. */
export function opcionDona(conteos: { nombre: string; valor: number }[], catalogo: Estatus[], oscuro: boolean, centro: string, subcentro: string): EChartsOption {
  const t = tokensGrafica(oscuro);
  return {
    tooltip: { trigger: 'item', formatter: (p: any) => `<b>${p.name}</b><br/>${fmt(p.value)} usuarios · ${p.percent}%` },
    series: [
      {
        type: 'pie',
        radius: ['62%', '86%'],
        center: ['50%', '50%'],
        padAngle: 1.2,
        itemStyle: { borderRadius: 4, borderColor: t.superficie, borderWidth: 2 },
        label: { show: false },
        emphasis: { scale: true, scaleSize: 4 },
        data: conteos.filter((c) => c.valor > 0).map((c) => ({ name: c.nombre, value: c.valor, itemStyle: { color: colorEstatus(c.nombre, catalogo, oscuro) } })),
      },
    ],
    graphic: [
      { type: 'text', left: 'center', top: '40%', style: { text: centro, fill: t.texto, font: '600 30px "Space Grotesk", Inter, sans-serif' } },
      { type: 'text', left: 'center', top: '56%', style: { text: subcentro, fill: t.texto2, font: '12px Inter, sans-serif' } },
    ],
  } as EChartsOption;
}

/** Barras horizontales apiladas por estatus (100% o absolutas) — una fila por categoría. */
export function opcionApiladaEstatus(
  filas: FilaAgregada[],
  catalogo: Estatus[],
  oscuro: boolean,
  { porcentaje = false, orden }: { porcentaje?: boolean; orden?: string[] } = {},
): EChartsOption {
  const t = tokensGrafica(oscuro);
  const cats = orden ? orden.filter((o) => filas.some((f) => f.clave === o)) : filas.map((f) => f.clave);
  const byClave = new Map(filas.map((f) => [f.clave, f]));
  const estatus = [...catalogo.map((c) => c.nombre), 'Sin clasificar'].filter((e) => filas.some((f) => (f.series?.[e] ?? 0) > 0));
  const catsR = [...cats].reverse();
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const f = byClave.get(ps[0].name)!;
        const lineas = ps
          .filter((p: any) => p.value > 0)
          .map((p: any) => `${p.marker} ${p.seriesName}: <b>${fmt(porcentaje ? Math.round((p.value / 100) * f.total) : p.value)}</b>`)
          .join('<br/>');
        return `<b>${ps[0].name}</b> · ${fmt(f.total)} usuarios · avance ${pct(f.avance)}<br/>${lineas}`;
      },
    },
    legend: { bottom: 0, data: estatus, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.texto2 } },
    grid: { left: 8, right: 56, top: 4, bottom: 36, containLabel: true },
    xAxis: {
      type: 'value',
      max: porcentaje ? 100 : undefined,
      axisLabel: { color: t.texto2, formatter: porcentaje ? '{value}%' : undefined },
      splitLine: { lineStyle: { color: t.grid } },
    },
    yAxis: { type: 'category', data: catsR, axisLine: { lineStyle: { color: t.eje } }, axisTick: { show: false }, axisLabel: { color: t.texto, fontWeight: 500 } },
    series: [
      ...estatus.map((e, i) => ({
        name: e,
        type: 'bar' as const,
        stack: 'total',
        barWidth: 16,
        itemStyle: {
          color: colorEstatus(e, catalogo, oscuro),
          borderColor: t.superficie,
          borderWidth: 1,
          borderRadius: i === estatus.length - 1 ? RADIO_H : 0,
        },
        emphasis: { focus: 'series' as const },
        data: catsR.map((c) => {
          const f = byClave.get(c)!;
          const v = f.series?.[e] ?? 0;
          return porcentaje ? +((v / f.total) * 100).toFixed(2) : v;
        }),
      })),
      {
        name: 'avance',
        type: 'bar' as const,
        stack: 'total',
        silent: true,
        itemStyle: { color: 'transparent' },
        label: {
          show: true,
          position: 'insideLeft',
          color: t.texto,
          fontWeight: 600,
          formatter: (p: any) => pct(byClave.get(p.name)!.avance, 0),
        },
        data: catsR.map(() => 0.0001),
        tooltip: { show: false },
      },
    ],
  } as EChartsOption;
}

/** Cerrados vs. abiertos por categoría, horizontal, con % de avance como etiqueta. */
export function opcionCerradoAbierto(filas: FilaAgregada[], oscuro: boolean, { soloAbiertos = false }: { soloAbiertos?: boolean } = {}): EChartsOption {
  const t = tokensGrafica(oscuro);
  const f = [...filas].reverse();
  const cC = oscuro ? CERRADO.dark : CERRADO.light;
  const cA = oscuro ? ABIERTO.dark : ABIERTO.light;
  const series: any[] = [];
  if (!soloAbiertos)
    series.push({
      name: 'Cerrados',
      type: 'bar',
      stack: 't',
      barWidth: 14,
      itemStyle: { color: cC, borderColor: t.superficie, borderWidth: 1 },
      data: f.map((x) => x.cerrados),
    });
  series.push({
    name: 'Abiertos',
    type: 'bar',
    stack: 't',
    barWidth: 14,
    itemStyle: { color: cA, borderRadius: RADIO_H, borderColor: t.superficie, borderWidth: 1 },
    label: {
      show: true,
      position: 'right',
      color: t.texto2,
      fontSize: 11,
      formatter: (p: any) => (soloAbiertos ? `${fmt(f[p.dataIndex].abiertos)}` : `${pct(f[p.dataIndex].avance, 0)}`),
    },
    data: f.map((x) => x.abiertos),
  });
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const x = f[ps[0].dataIndex];
        return `<b>${x.clave}</b><br/>Total: <b>${fmt(x.total)}</b><br/>Cerrados: <b>${fmt(x.cerrados)}</b> · Abiertos: <b>${fmt(x.abiertos)}</b><br/>Avance: <b>${pct(x.avance)}</b>`;
      },
    },
    legend: soloAbiertos ? undefined : { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.texto2 } },
    grid: { left: 8, right: 44, top: 4, bottom: soloAbiertos ? 4 : 32, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: t.texto2 }, splitLine: { lineStyle: { color: t.grid } } },
    yAxis: { type: 'category', data: f.map((x) => x.clave), axisTick: { show: false }, axisLine: { lineStyle: { color: t.eje } }, axisLabel: { color: t.texto, fontWeight: 500 } },
    series,
  } as EChartsOption;
}

/** Mapa de calor categoría × estatus (rampa secuencial azul). */
export function opcionMapaCalor(filas: FilaAgregada[], columnas: string[], oscuro: boolean, orden?: string[]): EChartsOption {
  const t = tokensGrafica(oscuro);
  const cats = (orden ? orden.filter((o) => filas.some((f) => f.clave === o)) : filas.map((f) => f.clave)).slice().reverse();
  const byClave = new Map(filas.map((f) => [f.clave, f]));
  const crudo: [number, number, number][] = [];
  let max = 0;
  cats.forEach((c, y) =>
    columnas.forEach((col, x) => {
      const v = byClave.get(c)?.series?.[col] ?? 0;
      max = Math.max(max, v);
      crudo.push([x, y, v]);
    }),
  );
  // Tinta según la luminosidad de la celda: claro → texto oscuro, oscuro → texto claro
  const data = crudo.map((d) => {
    const n = d[2] / Math.max(1, max);
    const celdaClara = oscuro ? n > 0.55 : n < 0.45;
    return { value: d, label: { color: celdaClara ? '#0e1020' : '#ffffff' } };
  });
  return {
    tooltip: { formatter: (p: any) => `<b>${cats[p.value[1]]}</b> · ${columnas[p.value[0]]}<br/><b>${fmt(p.value[2])}</b> usuarios` },
    grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
    xAxis: { type: 'category', data: columnas, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: t.texto2, interval: 0, fontSize: 10, lineHeight: 12, formatter: (v: string) => ABREVIA[v] ?? (v.length > 12 ? `${v.slice(0, 11)}…` : v) } },
    yAxis: { type: 'category', data: cats, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: t.texto, fontWeight: 500 } },
    visualMap: { min: 0, max: Math.max(1, max), show: false, inRange: { color: oscuro ? SECUENCIAL_OSCURO : SECUENCIAL } },
    series: [
      {
        type: 'heatmap',
        data,
        itemStyle: { borderColor: t.superficie, borderWidth: 3, borderRadius: 6 },
        label: {
          show: true,
          fontSize: 12,
          fontWeight: 600,
          formatter: (p: any) => (p.value[2] ? fmt(p.value[2]) : '·'),
        },
        emphasis: { itemStyle: { borderColor: t.texto, borderWidth: 1 } },
      },
    ],
  } as EChartsOption;
}

/** Tendencia de avance a partir de los snapshots diarios. */
export function opcionTendencia(snap: { fecha: string; total: number; por_estatus: Record<string, number> }[], catalogo: Estatus[], oscuro: boolean): EChartsOption {
  const t = tokensGrafica(oscuro);
  const cerr = catalogo.filter((c) => c.tipo === 'Cerrado').map((c) => c.nombre);
  const fechas = snap.map((s) => new Date(`${s.fecha}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }));
  const avance = snap.map((s) => +((cerr.reduce((a, e) => a + (s.por_estatus[e] ?? 0), 0) / Math.max(1, s.total)) * 100).toFixed(1));
  const c = oscuro ? CERRADO.dark : CERRADO.light;
  return {
    tooltip: { trigger: 'axis', formatter: (ps: any) => `<b>${ps[0].name}</b><br/>Avance: <b>${ps[0].value}%</b><br/>Cerrados: <b>${fmt(cerr.reduce((a, e) => a + (snap[ps[0].dataIndex].por_estatus[e] ?? 0), 0))}</b> de ${fmt(snap[ps[0].dataIndex].total)}` },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: fechas, boundaryGap: false, axisLine: { lineStyle: { color: t.eje } }, axisTick: { show: false }, axisLabel: { color: t.texto2 } },
    yAxis: { type: 'value', min: (v: { min: number }) => Math.max(0, Math.floor(v.min / 10) * 10 - 10), max: 100, axisLabel: { color: t.texto2, formatter: '{value}%' }, splitLine: { lineStyle: { color: t.grid } } },
    series: [
      {
        type: 'line',
        data: avance,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, color: c },
        itemStyle: { color: c, borderColor: t.superficie, borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${c}40` }, { offset: 1, color: `${c}00` }] } },
        label: { show: true, position: 'top', color: t.texto, fontWeight: 600, formatter: (p: any) => (p.dataIndex === avance.length - 1 ? `${p.value}%` : '') },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: t.texto2, type: 'dashed', width: 1 }, label: { color: t.texto2, formatter: 'Meta 100%' }, data: [{ yAxis: 100 }] },
      },
    ],
  } as EChartsOption;
}

/** Barras verticales simples (una serie) para tarjetas IA. */
export function opcionBarras(filas: FilaAgregada[], oscuro: boolean, dimensionEsEstatus: boolean, catalogo: Estatus[]): EChartsOption {
  const t = tokensGrafica(oscuro);
  const base = oscuro ? CERRADO.dark : CERRADO.light;
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any) => { const f = filas[ps[0].dataIndex]; return `<b>${f.clave}</b><br/>${fmt(f.total)} usuarios · avance ${pct(f.avance)}`; } },
    grid: { left: 8, right: 8, top: 20, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: filas.map((f) => f.clave), axisTick: { show: false }, axisLine: { lineStyle: { color: t.eje } }, axisLabel: { color: t.texto2, interval: 0, rotate: filas.length > 6 ? 35 : 0, fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { color: t.texto2 }, splitLine: { lineStyle: { color: t.grid } } },
    series: [
      {
        type: 'bar',
        barMaxWidth: 28,
        data: filas.map((f) => ({ value: f.total, itemStyle: { color: dimensionEsEstatus ? colorEstatus(f.clave, catalogo, oscuro) : base, borderRadius: [4, 4, 0, 0] } })),
        label: { show: filas.length <= 12, position: 'top', color: t.texto2, fontSize: 11, formatter: (p: any) => fmt(p.value) },
      },
    ],
  } as EChartsOption;
}

/** Barras apiladas genéricas (dimensión × serie) para tarjetas IA. */
export function opcionApiladaGenerica(filas: FilaAgregada[], oscuro: boolean, catalogo: Estatus[], serieEsEstatus: boolean): EChartsOption {
  const t = tokensGrafica(oscuro);
  const CATEG = oscuro
    ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
    : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const totales = new Map<string, number>();
  for (const f of filas) for (const [k, v] of Object.entries(f.series ?? {})) totales.set(k, (totales.get(k) ?? 0) + v);
  let series = [...totales.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (serieEsEstatus) series = [...catalogo.map((c) => c.nombre), 'Sin clasificar'].filter((e) => totales.has(e));
  const visibles = series.slice(0, 7);
  const otros = series.slice(7);
  const nombres = otros.length ? [...visibles, 'Otros'] : visibles;
  const f = [...filas].reverse();
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.texto2 } },
    grid: { left: 8, right: 16, top: 4, bottom: 36, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: t.texto2 }, splitLine: { lineStyle: { color: t.grid } } },
    yAxis: { type: 'category', data: f.map((x) => x.clave), axisTick: { show: false }, axisLine: { lineStyle: { color: t.eje } }, axisLabel: { color: t.texto, fontWeight: 500 } },
    series: nombres.map((n, i) => ({
      name: n,
      type: 'bar',
      stack: 's',
      barWidth: 14,
      itemStyle: {
        color: serieEsEstatus ? colorEstatus(n, catalogo, oscuro) : n === 'Otros' ? (oscuro ? '#6b6f80' : '#a3a3a0') : CATEG[i],
        borderColor: t.superficie,
        borderWidth: 1,
        borderRadius: i === nombres.length - 1 ? RADIO_H : 0,
      },
      data: f.map((x) => (n === 'Otros' ? otros.reduce((a, o) => a + (x.series?.[o] ?? 0), 0) : (x.series?.[n] ?? 0))),
    })),
  } as EChartsOption;
}

/** Dona genérica (cualquier dimensión) para tarjetas IA. */
export function opcionDonaGenerica(filas: FilaAgregada[], oscuro: boolean, catalogo: Estatus[], esEstatus: boolean): EChartsOption {
  const CATEG = oscuro
    ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
    : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const top = filas.slice(0, 7);
  const resto = filas.slice(7).reduce((a, f) => a + f.total, 0);
  const datos = top.map((f, i) => ({ nombre: f.clave, valor: f.total, color: esEstatus ? colorEstatus(f.clave, catalogo, oscuro) : CATEG[i] }));
  if (resto) datos.push({ nombre: 'Otros', valor: resto, color: oscuro ? '#6b6f80' : '#a3a3a0' });
  const total = filas.reduce((a, f) => a + f.total, 0);
  const t = tokensGrafica(oscuro);
  return {
    tooltip: { trigger: 'item', formatter: (p: any) => `<b>${p.name}</b><br/>${fmt(p.value)} · ${p.percent}%` },
    legend: { orient: 'vertical', right: 0, top: 'middle', icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: t.texto2 } },
    series: [
      {
        type: 'pie',
        radius: ['55%', '82%'],
        center: ['32%', '50%'],
        padAngle: 1.2,
        itemStyle: { borderRadius: 4, borderColor: t.superficie, borderWidth: 2 },
        label: { show: false },
        data: datos.map((d) => ({ name: d.nombre, value: d.valor, itemStyle: { color: d.color } })),
      },
    ],
    graphic: [{ type: 'text', left: '32%', top: 'middle', style: { text: fmt(total), fill: t.texto, font: '600 22px "Space Grotesk", Inter', textAlign: 'center' } }],
  } as EChartsOption;
}
