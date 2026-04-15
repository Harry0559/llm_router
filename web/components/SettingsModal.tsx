'use client';

import { useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_SETTINGS, type Settings, type ModelWindow } from '@/lib/settings';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { settings, updateSettings } = useSettings();

  const [draft, setDraft] = useState<Settings>(() => ({
    ...settings,
    modelWindows: settings.modelWindows.map(w => ({ ...w })),
  }));
  const [errors, setErrors] = useState<string[]>([]);

  function validate(s: Settings): string[] {
    const errs: string[] = [];
    if (s.thresholdYellow < 1 || s.thresholdYellow > 99) errs.push('Yellow 阈值须在 1–99 之间');
    if (s.thresholdOrange < 1 || s.thresholdOrange > 99) errs.push('Orange 阈值须在 1–99 之间');
    if (s.thresholdRed < 1 || s.thresholdRed > 100)      errs.push('Red 阈值须在 1–100 之间');
    if (s.thresholdYellow >= s.thresholdOrange) errs.push('Yellow 阈值须小于 Orange 阈值');
    if (s.thresholdOrange >= s.thresholdRed)    errs.push('Orange 阈值须小于 Red 阈值');
    for (const w of s.modelWindows) {
      if (!w.pattern.trim()) errs.push('模型 pattern 不能为空');
      if (!Number.isFinite(w.tokens) || w.tokens < 1000) errs.push(`"${w.pattern}" 的 token 数须 ≥ 1000`);
    }
    return errs;
  }

  function handleSave() {
    const errs = validate(draft);
    if (errs.length > 0) { setErrors(errs); return; }
    updateSettings(draft);
    onClose();
  }

  function handleReset() {
    setDraft({
      ...DEFAULT_SETTINGS,
      modelWindows: DEFAULT_SETTINGS.modelWindows.map(w => ({ ...w })),
    });
    setErrors([]);
  }

  function setThreshold(key: 'thresholdYellow' | 'thresholdOrange' | 'thresholdRed', raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) setDraft(d => ({ ...d, [key]: n }));
  }

  function setWindowField(i: number, field: keyof ModelWindow, raw: string) {
    setDraft(d => {
      const modelWindows = d.modelWindows.map((w, j) => {
        if (j !== i) return w;
        if (field === 'tokens') {
          const n = parseInt(raw, 10);
          return { ...w, tokens: isNaN(n) ? w.tokens : n };
        }
        return { ...w, pattern: raw };
      });
      return { ...d, modelWindows };
    });
  }

  function addWindow() {
    setDraft(d => ({ ...d, modelWindows: [...d.modelWindows, { pattern: '', tokens: 200_000 }] }));
  }

  function removeWindow(i: number) {
    setDraft(d => ({ ...d, modelWindows: d.modelWindows.filter((_, j) => j !== i) }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg w-[500px] max-h-[85vh] overflow-y-auto p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-100">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* ── Sparkline toggle ── */}
        <section className="mb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Token 趋势图</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.sparklineEnabled}
              onChange={e => setDraft(d => ({ ...d, sparklineEnabled: e.target.checked }))}
              className="accent-blue-500 w-3.5 h-3.5"
            />
            <span className="text-xs text-gray-300">在 Trace 列表上方显示 Sparkline</span>
          </label>
        </section>

        {/* ── Context usage thresholds ── */}
        <section className="mb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">上下文使用率阈值</h3>
          <div className="space-y-2.5">
            {(
              [
                { key: 'thresholdYellow' as const, label: '黄色 ≥', color: 'text-yellow-400', barCls: 'bg-yellow-400' },
                { key: 'thresholdOrange' as const, label: '橙色 ≥', color: 'text-orange-400', barCls: 'bg-orange-400' },
                { key: 'thresholdRed'    as const, label: '红色 ≥', color: 'text-red-400',    barCls: 'bg-red-500'    },
              ]
            ).map(({ key, label, color, barCls }) => (
              <div key={key} className="flex items-center gap-3">
                <span className={`text-xs w-16 shrink-0 ${color}`}>{label}</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft[key]}
                  onChange={e => setThreshold(key, e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-gray-600">%</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barCls}`}
                    style={{ width: `${Math.min(100, draft[key])}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Model windows ── */}
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">模型上下文窗口</h3>
            <button
              type="button"
              onClick={addWindow}
              className="text-xs text-blue-400 hover:text-blue-200 border border-blue-700/60 rounded px-2 py-0.5 transition-colors"
            >
              + 添加
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-2 text-[10px] text-gray-600 px-1 mb-0.5">
              <span className="flex-1">Pattern（模型名称包含此字符串）</span>
              <span className="w-28">Token 数</span>
              <span className="w-5" />
            </div>
            {draft.modelWindows.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={w.pattern}
                  placeholder="e.g. claude-sonnet-4"
                  onChange={e => setWindowField(i, 'pattern', e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={w.tokens}
                  min={1000}
                  onChange={e => setWindowField(i, 'tokens', e.target.value)}
                  className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeWindow(i)}
                  className="w-5 shrink-0 text-gray-600 hover:text-red-400 text-xs text-center transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            按顺序匹配，第一条命中的规则生效。未命中时使用默认值 200 000。
          </p>
        </section>

        {/* ── Errors ── */}
        {errors.length > 0 && (
          <div className="mb-4 p-2.5 bg-red-900/30 border border-red-700/60 rounded text-xs text-red-300 space-y-0.5">
            {errors.map((err, i) => <p key={i}>• {err}</p>)}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-800">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            恢复默认
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
