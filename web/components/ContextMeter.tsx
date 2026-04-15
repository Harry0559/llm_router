'use client';

import { useSettings } from '@/contexts/SettingsContext';
import { getContextWindow, getThresholdLevel, LEVEL_BAR_CLS, LEVEL_TOKEN_CLS } from '@/lib/settings';

interface CompactMeterProps {
  tokensInput: number;
  model: string;
}

/**
 * 2 px progress bar pinned to the bottom of its containing element.
 * The container must be `position: relative` (add `relative overflow-hidden`).
 */
export function CompactMeter({ tokensInput, model }: CompactMeterProps) {
  const { settings } = useSettings();
  if (!tokensInput || !model) return null;
  const window = getContextWindow(model, settings.modelWindows);
  const pct = Math.min(100, (tokensInput / window) * 100);
  const level = getThresholdLevel(pct, settings);
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-800/60">
      <div
        className={`h-full ${LEVEL_BAR_CLS[level]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface FullMeterProps {
  tokensInput: number;
  model: string;
}

/** Horizontal bar + percentage label, used in TraceDetail meta area. */
export function FullMeter({ tokensInput, model }: FullMeterProps) {
  const { settings } = useSettings();
  if (!tokensInput || !model) return null;
  const contextWindow = getContextWindow(model, settings.modelWindows);
  const pct = Math.min(100, (tokensInput / contextWindow) * 100);
  const level = getThresholdLevel(pct, settings);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden align-middle">
        <span
          className={`block h-full rounded-full ${LEVEL_BAR_CLS[level]}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </span>
      <span className={`text-xs ${LEVEL_TOKEN_CLS[level]}`}>{pct.toFixed(1)}%</span>
    </span>
  );
}

/** Return dynamic token-colour class for TraceList rows. */
export function useTokenColor(tokensInput: number, model: string): string {
  const { settings } = useSettings();
  if (!tokensInput || !model) return 'text-yellow-700';
  const window = getContextWindow(model, settings.modelWindows);
  const pct = Math.min(100, (tokensInput / window) * 100);
  const level = getThresholdLevel(pct, settings);
  return LEVEL_TOKEN_CLS[level];
}
