// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelWindow {
  pattern: string; // matched via model.toLowerCase().includes(pattern.toLowerCase())
  tokens: number;
}

export interface Settings {
  /** percentage at which bar turns yellow (inclusive) */
  thresholdYellow: number;
  /** percentage at which bar turns orange (inclusive) */
  thresholdOrange: number;
  /** percentage at which bar turns red (inclusive) */
  thresholdRed: number;
  /** model → context window size mapping, evaluated top-to-bottom */
  modelWindows: ModelWindow[];
  /** show sparkline in TraceList header area */
  sparklineEnabled: boolean;
}

export type ThresholdLevelName = 'green' | 'yellow' | 'orange' | 'red';

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL_WINDOWS: ModelWindow[] = [
  { pattern: 'claude-opus-4',   tokens: 200_000 },
  { pattern: 'claude-sonnet-4', tokens: 200_000 },
  { pattern: 'claude-haiku-4',  tokens: 200_000 },
  { pattern: 'claude-3-5',      tokens: 200_000 },
  { pattern: 'claude-3',        tokens: 200_000 },
  { pattern: 'gpt-4o',          tokens: 128_000 },
  { pattern: 'gpt-4',           tokens: 128_000 },
  { pattern: 'gpt-3.5',         tokens:  16_385 },
];

export const DEFAULT_SETTINGS: Settings = {
  thresholdYellow: 50,
  thresholdOrange: 75,
  thresholdRed:    90,
  modelWindows:    DEFAULT_MODEL_WINDOWS,
  sparklineEnabled: true,
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Return context window size for a model name. Falls back to 200 000. */
export function getContextWindow(model: string, windows: ModelWindow[]): number {
  const lower = model.toLowerCase();
  for (const w of windows) {
    if (lower.includes(w.pattern.toLowerCase())) return w.tokens;
  }
  return 200_000;
}

/** Return color level given usage percentage and current settings. */
export function getThresholdLevel(pct: number, s: Settings): ThresholdLevelName {
  if (pct >= s.thresholdRed)    return 'red';
  if (pct >= s.thresholdOrange) return 'orange';
  if (pct >= s.thresholdYellow) return 'yellow';
  return 'green';
}

// ─── CSS class maps ───────────────────────────────────────────────────────────

/** Tailwind class for the progress bar fill colour. */
export const LEVEL_BAR_CLS: Record<ThresholdLevelName, string> = {
  green:  'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  red:    'bg-red-500',
};

/** Tailwind class for the input-token text colour in TraceList rows. */
export const LEVEL_TOKEN_CLS: Record<ThresholdLevelName, string> = {
  green:  'text-yellow-700',
  yellow: 'text-yellow-500',
  orange: 'text-orange-400',
  red:    'text-red-400',
};

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'llm-router-settings';

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const stored = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
