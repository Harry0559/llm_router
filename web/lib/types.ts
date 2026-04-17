export interface Session {
  id: string;
  external_id: string;   // session_id from metadata.user_id
  display_name?: string;
  created_at: number;
  updated_at: number;
  run_count: number;
  notes: string | null;
}

export interface Run {
  id: string;
  session_id: string;
  display_name?: string;
  created_at: number;
  updated_at: number;
  trace_count: number;
  notes: string | null;
}

export interface TraceSummary {
  id: string;
  session_id: string;
  run_id: string;
  agent_type: 'main_agent' | 'subagent' | 'title_gen';
  agent: string;
  port: number;
  protocol: string;
  timestamp: number;
  request_method: string;
  request_path: string;
  response_status: number;
  duration_ms: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
  notes: string | null;
}

export interface TraceDetail extends TraceSummary {
  request_headers: string;   // JSON string
  request_body: string;      // JSON string
  response_headers: string;  // JSON string
  response_body: string;     // JSON string
}

export const AGENT_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
};
