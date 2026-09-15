/**
 * 图表白卡：标题 + 图注 + 右上操作（放大全屏 / 导出 PNG），内容即 ECharts 实例。
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import EChart, { type ECharts, type EChartsOption } from "./EChart";
import { EASE } from "./ui";

export default function ChartCard({
  title,
  caption,
  option,
  height = 300,
  onChartClick,
  exportName,
  className,
  footer,
  legend,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  option: EChartsOption;
  height?: number;
  onChartClick?: (params: unknown) => void;
  exportName: string;
  className?: string;
  footer?: React.ReactNode;
  legend?: React.ReactNode;
}) {
  const chartRef = useRef<ECharts | null>(null);
  const [expand, setExpand] = useState(false);

  const download = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.png`;
    a.click();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn("geo-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-h2 text-[#111827]">{title}</h2>
          {caption && <span className="text-caption text-[#9ca3af]">{caption}</span>}
        </div>
        <div className="flex items-center gap-1 print-hidden">
          <button
            type="button"
            onClick={() => setExpand(true)}
            className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-brand"
            title="放大查看"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-brand"
            title="导出 PNG"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className={legend ? "flex items-center gap-4" : undefined}>
          <div className={legend ? "min-w-0 flex-1" : undefined}>
            <EChart
              option={option}
              height={height}
              onClick={onChartClick}
              onReady={(c) => {
                chartRef.current = c;
              }}
            />
          </div>
          {legend && <div className="w-44 shrink-0">{legend}</div>}
        </div>
        {footer}
      </div>

      <AnimatePresence>
        {expand && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-6"
            onClick={() => setExpand(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="w-full max-w-[1100px] rounded-xl bg-white p-5 shadow-card-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-h2 text-[#111827]">{title}</h3>
                <button
                  type="button"
                  onClick={() => setExpand(false)}
                  className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <EChart option={option} height={Math.round(window.innerHeight * 0.66)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
