'use client';

import { useRef, useEffect, useState } from 'react';
import type { TraceSummary } from '@/lib/types';

interface Props {
  traces: TraceSummary[];
  selectedId: string | null;
  pinnedId: string | null;
  onSelect: (id: string) => void;
}

const HEIGHT = 52;
const PAD_X = 6;
const PAD_Y = 6;
const DOT_R_MAX = 3;   // normal dot radius when spacing is generous
const DOT_R_MIN = 1.5; // minimum dot radius when crowded

export default function Sparkline({ traces, selectedId, pinnedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(200);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only successful main_agent traces with token data.
  // Exclude failed requests (status >= 300) to avoid false compression detection.
  const pts = traces.filter(
    t => t.agent_type === 'main_agent' && t.response_status < 300 && t.tokens_input > 0
  );
  if (pts.length === 0) return null;

  const n = pts.length;
  const tokens = pts.map(t => t.tokens_input);
  const maxTok = Math.max(...tokens, 1);
  const minTok = Math.min(...tokens);
  const range = maxTok - minTok || 1;

  const plotW = width - PAD_X * 2;
  const plotH = HEIGHT - PAD_Y * 2;

  // Pixel spacing between adjacent points
  const spacing = n > 1 ? plotW / (n - 1) : plotW;

  // Adaptive dot radius and visibility
  const dotR = spacing >= 10 ? DOT_R_MAX : Math.max(DOT_R_MIN, spacing / 4);
  // Hide normal dots when very crowded; always show selected/pinned/hovered
  const showNormalDots = spacing >= 5;

  function cx(i: number) {
    return PAD_X + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  }
  function cy(v: number) {
    return PAD_Y + plotH - ((v - minTok) / range) * plotH;
  }

  const hoveredTrace = hoveredId ? pts.find(t => t.id === hoveredId) ?? null : null;

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height: HEIGHT }}>
      <svg width={width} height={HEIGHT} className="absolute inset-0 overflow-visible">
        {/* Line segments */}
        {pts.slice(0, -1).map((t, i) => {
          const isDrop = pts[i + 1].tokens_input < t.tokens_input;
          return (
            <line
              key={`seg-${i}`}
              x1={cx(i)}     y1={cy(t.tokens_input)}
              x2={cx(i + 1)} y2={cy(pts[i + 1].tokens_input)}
              stroke={isDrop ? '#f59e0b' : '#3b82f6'}
              strokeWidth={1.5}
              strokeDasharray={isDrop ? '4 2' : undefined}
              opacity={0.65}
            />
          );
        })}

        {/* Dots + hit areas */}
        {pts.map((t, i) => {
          const x = cx(i);
          const y = cy(t.tokens_input);
          const isSelected = t.id === selectedId;
          const isPinned   = t.id === pinnedId;
          const isHovered  = t.id === hoveredId;
          const isDrop     = i > 0 && t.tokens_input < pts[i - 1].tokens_input;
          const isSpecial  = isSelected || isPinned || isHovered;

          return (
            <g
              key={t.id}
              onClick={() => onSelect(t.id)}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Transparent wider hit target for dense charts */}
              <rect
                x={x - Math.max(8, spacing / 2)}
                y={0}
                width={Math.max(16, spacing)}
                height={HEIGHT}
                fill="transparent"
              />

              {isPinned && (
                <circle cx={x} cy={y} r={DOT_R_MAX + 5} fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.8} />
              )}
              {isSelected && (
                <circle cx={x} cy={y} r={DOT_R_MAX + 3} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
              )}

              {/* Dot — always show for special states; hide for normal in crowded charts */}
              {(showNormalDots || isSpecial) && (
                <circle
                  cx={x} cy={y}
                  r={isSpecial ? DOT_R_MAX : dotR}
                  fill={isDrop ? '#f59e0b' : isSelected ? '#3b82f6' : '#60a5fa'}
                  opacity={0.9}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredTrace && (() => {
        const i = pts.indexOf(hoveredTrace);
        const x = cx(i);
        const y = cy(hoveredTrace.tokens_input);
        const isDrop = i > 0 && hoveredTrace.tokens_input < pts[i - 1].tokens_input;
        const tipLeft = Math.min(x + 10, width - 160);
        const tipTop  = Math.max(y - 30, 0);
        return (
          <div
            className="absolute z-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 pointer-events-none whitespace-nowrap"
            style={{ left: tipLeft, top: tipTop }}
          >
            <span className="text-yellow-300 font-medium">{hoveredTrace.tokens_input.toLocaleString()}</span>
            <span className="text-gray-500"> tok</span>
            {isDrop && <span className="text-amber-400 ml-1">↓ compress</span>}
            {hoveredTrace.model && (
              <span className="text-gray-500 ml-1 text-[10px]">
                {hoveredTrace.model.replace(/^(claude|gpt)-/, '')}
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}
