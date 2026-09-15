/**
 * ECharts 5 React 封装：初始化 / option 更新 / ResizeObserver 自适应 / 实例导出。
 * 内置错误边界：单图表渲染异常只降级该卡片，不再拖垮整页。
 */
import { Component, useEffect, useRef, type ReactNode } from "react";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";

class EChartBoundary extends Component<
  { children: ReactNode; height: number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error("[EChart] render failed:", err);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          style={{ height: this.props.height }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 bg-gray-50"
        >
          <span className="text-xs text-gray-400">图表渲染失败，请刷新重试</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function EChartInner({
  option,
  height = 300,
  onClick,
  onReady,
  className,
}: {
  option: EChartsOption;
  height?: number;
  onClick?: (params: unknown) => void;
  onReady?: (chart: ECharts) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    readyRef.current?.(chart);
    const handler = (p: unknown) => clickRef.current?.(p);
    chart.on("click", handler);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.off("click", handler);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ width: "100%", height }} />;
}

export default function EChart(props: {
  option: EChartsOption;
  height?: number;
  onClick?: (params: unknown) => void;
  onReady?: (chart: ECharts) => void;
  className?: string;
}) {
  return (
    <EChartBoundary height={props.height ?? 300}>
      <EChartInner {...props} />
    </EChartBoundary>
  );
}

export type { ECharts, EChartsOption };
