'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  notes: string | null;
  onSave: (notes: string) => Promise<void>;
  /** compact=true: 2-row textarea，适合窄列（Session/Run）；false: 3-row，适合宽面板（Trace） */
  compact?: boolean;
  active?: boolean;
}

export default function NotesEditor({ notes, onSave, compact = false, active = true }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 外部 notes 变化时同步（切换 trace/run 时）
  useEffect(() => {
    setValue(notes ?? '');
    setEditing(false);
  }, [notes]);

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(value.trim());
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // 阻止所有按键冒泡到父容器（父容器 role="button" 会拦截空格等键）
    e.stopPropagation();
    if (e.key === 'Escape') {
      setValue(notes ?? '');
      setEditing(false);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }

  function previewText(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const limit = compact ? 80 : 160;
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit)}…`;
  }

  if (!editing) {
    if (!notes && !active) return null;

    const hasNotes = Boolean(notes && notes.trim());
    const canEdit = active;
    const displayText = hasNotes ? (canEdit ? notes! : previewText(notes!)) : '';
    return (
      <div className="w-full text-left group min-w-0">
        {hasNotes ? (
          <div
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
              setEditing(true);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditing(true);
              }
            }}
            className={`block w-full text-left text-[10px] text-yellow-600/80 leading-tight break-all ${canEdit ? 'hover:text-yellow-400 transition-colors cursor-pointer' : 'cursor-default'}`}
            title={canEdit ? '点击编辑备注' : undefined}
          >
            {displayText}
          </div>
        ) : (
          <div
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
              setEditing(true);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditing(true);
              }
            }}
            className={`text-[10px] transition-colors leading-tight ${canEdit ? 'text-gray-700 group-hover:text-gray-500 cursor-pointer' : 'text-gray-700 cursor-default'}`}
            title={canEdit ? '点击添加备注' : undefined}
          >
            添加备注…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={compact ? 2 : 3}
        placeholder="添加备注… (⌘↵ 保存，Esc 取消)"
        className="w-full text-[10px] bg-gray-800/80 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-yellow-600/50 leading-tight"
      />
      <div className="flex gap-1.5 mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleSave();
          }}
          disabled={saving}
          className="text-[10px] px-2 py-0.5 bg-yellow-700/30 text-yellow-400 border border-yellow-700/50 rounded hover:bg-yellow-700/50 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setValue(notes ?? '');
            setEditing(false);
          }}
          className="text-[10px] px-2 py-0.5 text-gray-500 hover:text-gray-300 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
