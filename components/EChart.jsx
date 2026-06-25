'use client';
/* Reusable ECharts wrapper: init once, update on `option` change, resize with
   its container. Keeps chart behaviour identical to the Apps Script dashboard. */
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function EChart({ option, className = '' }) {
  const el = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current);
    const ro = new ResizeObserver(() => chart.current && chart.current.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.current && chart.current.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { if (chart.current && option) chart.current.setOption(option, true); }, [option]);
  return <div ref={el} className={className} />;
}
