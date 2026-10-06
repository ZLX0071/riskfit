"use client";

interface HeatmapProps {
  symbols: string[];
  matrix: number[][];
}

/** 相关性热力图：正相关偏红、负相关偏蓝，对角线灰色。 */
export default function Heatmap({ symbols, matrix }: HeatmapProps) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {symbols.map((s) => (
              <th key={s} className="px-2 pb-1 font-medium text-slate-500">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={symbols[i]}>
              <th className="px-2 text-right font-medium text-slate-500">{symbols[i]}</th>
              {row.map((v, j) => {
                const diag = i === j;
                const alpha = diag ? 1 : Math.min(0.85, Math.abs(v));
                const style: React.CSSProperties = diag
                  ? {}
                  : v >= 0
                    ? { backgroundColor: `rgba(225, 29, 72, ${alpha})` }
                    : { backgroundColor: `rgba(37, 99, 235, ${alpha})` };
                return (
                  <td
                    key={j}
                    style={style}
                    title={`corr(${symbols[i]}, ${symbols[j]}) = ${v.toFixed(2)}`}
                    className={`rounded-md px-3 py-2 text-center font-mono ${diag ? "bg-slate-100 text-slate-400" : v > 0.55 || v < -0.55 ? "text-white" : "text-slate-700"}`}
                  >
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">红＝同涨同跌（高相关），蓝＝负相关。数值为皮尔逊相关系数（对齐日收益）。</p>
    </div>
  );
}
