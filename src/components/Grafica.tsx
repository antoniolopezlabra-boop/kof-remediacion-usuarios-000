import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useTema } from '../lib/tema';

echarts.use([BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent, SVGRenderer]);

export interface ClickGrafica {
  name: string;
  seriesName?: string;
  data?: unknown;
}

/** Tokens de texto/ejes tomados del tema activo (las series nunca colorean el texto). */
export function tokensGrafica(oscuro: boolean) {
  return oscuro
    ? { texto: '#eef0f6', texto2: '#9aa0b4', eje: '#33384f', grid: '#232740', superficie: '#141729', tooltip: '#1f2338' }
    : { texto: '#0e1020', texto2: '#6b7084', eje: '#d9d4cc', grid: '#eeebe6', superficie: '#ffffff', tooltip: '#ffffff' };
}

export function Grafica({
  opcion,
  alto = 280,
  onClick,
  etiqueta,
}: {
  opcion: EChartsOption;
  alto?: number;
  onClick?: (p: ClickGrafica) => void;
  etiqueta: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { oscuro } = useTema();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chart.current = c;
    c.on('click', (p) => clickRef.current?.(p as unknown as ClickGrafica));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const t = tokensGrafica(oscuro);
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: t.texto2 },
        animationDuration: 500,
        ...opcion,
        tooltip: {
          backgroundColor: t.tooltip,
          borderColor: t.eje,
          textStyle: { color: t.texto, fontSize: 12 },
          extraCssText: 'border-radius:10px;box-shadow:0 8px 24px -8px rgba(0,0,0,.25);',
          ...(opcion.tooltip as object),
        },
      },
      { notMerge: true },
    );
  }, [opcion, oscuro]);

  return <div ref={ref} role="img" aria-label={etiqueta} style={{ height: alto, width: '100%', cursor: onClick ? 'pointer' : undefined }} />;
}
