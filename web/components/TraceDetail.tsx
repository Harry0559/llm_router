'use client';

import { useState, useEffect } from 'react';
import type { TraceDetail as TraceDetailType } from '@/lib/types';
import { fetchTrace } from '@/lib/api';
import { AGENT_LABELS } from '@/lib/types';
import MessageViewer from './MessageViewer';
import ResponseViewer from './ResponseViewer';
import JsonViewer from './JsonViewer';
import { buildTraceMessagesExport, downloadJsonFile, traceExportToJson } from '@/lib/exportTraceMessages';

function StatusBadge({ status }: { status: number }) {
  const color = status < 300 ? 'bg-green-600' : status < 400 ? 'bg-yellow-600' : 'bg-red-600';
  return <span className={`${color} text-white text-xs px-1.5 py-0.5 rounded font-semibold`}>{status}</span>;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-xs w-20 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs">{value}</span>
    </div>
  );
}

type TabKey = 'messages' | 'response' | 'raw_req' | 'raw_res' | 'headers';

export default function TraceDetail({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<TraceDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('messages');

  useEffect(() => {
    setLoading(true);
    setTrace(null);
    fetchTrace(traceId)
      .then(setTrace)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading trace…
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        Failed to load trace
      </div>
    );
  }

  const ts = new Date(trace.timestamp).toLocaleString('zh-CN');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'messages',  label: 'Messages' },
    { key: 'response',  label: 'Response' },
    { key: 'raw_req',   label: 'Raw Request' },
    { key: 'raw_res',   label: 'Raw Response' },
    { key: 'headers',   label: 'Headers' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-gray-300">{trace.request_method}</span>
          <span className="text-gray-400 text-xs flex-1 truncate">{trace.request_path}</span>
          <button
            type="button"
            onClick={() => {
              const payload = buildTraceMessagesExport(trace);
              const text = traceExportToJson(payload, true);
              downloadJsonFile(`trace-${trace.id}-messages.json`, text);
            }}
            className="shrink-0 text-xs px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors"
            title="导出为 OpenAI Chat 兼容的 messages + metadata JSON"
          >
            导出 messages
          </button>
          <StatusBadge status={trace.response_status} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <MetaRow label="agent"    value={AGENT_LABELS[trace.agent] ?? trace.agent} />
          <MetaRow label="time"     value={ts} />
          <MetaRow label="model"    value={trace.model} />
          <MetaRow label="duration" value={`${trace.duration_ms} ms`} />
          <MetaRow label="tokens in"  value={<span className="text-yellow-300">{trace.tokens_input ?? '—'}</span>} />
          <MetaRow label="tokens out" value={<span className="text-green-300">{trace.tokens_output ?? '—'}</span>} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-800 shrink-0 bg-gray-900/30">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'messages' && (
          <MessageViewer requestBody={trace.request_body} protocol={trace.protocol} />
        )}
        {tab === 'response' && (
          <ResponseViewer responseBody={trace.response_body} protocol={trace.protocol} />
        )}
        {tab === 'raw_req' && (
          <div className="bg-gray-900/50 rounded-md p-3">
            <JsonViewer data={trace.request_body} defaultExpand={3} />
          </div>
        )}
        {tab === 'raw_res' && (
          <div className="bg-gray-900/50 rounded-md p-3">
            <JsonViewer data={trace.response_body} defaultExpand={3} />
          </div>
        )}
        {tab === 'headers' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Request Headers</h3>
              <div className="bg-gray-900/50 rounded-md p-3">
                <JsonViewer data={trace.request_headers} defaultExpand={2} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Response Headers</h3>
              <div className="bg-gray-900/50 rounded-md p-3">
                <JsonViewer data={trace.response_headers} defaultExpand={2} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
