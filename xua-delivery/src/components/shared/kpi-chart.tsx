"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface KpiChartProps {
  data: { date: string; value: number }[];
  target: number;
  label: string;
  color?: string;
}

export function KpiChart({ data, target, label, color = "#2563eb" }: KpiChartProps) {
  return (
    <div className="w-full">
      <p className="text-sm font-medium text-gray-600 mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip labelStyle={{ fontWeight: 600 }} />
          <ReferenceLine
            y={target}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: `Meta ${target}%`, position: "right", fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
