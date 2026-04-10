const upstreamUrl = process.env.LLM_UPSTREAM_URL;

if (!upstreamUrl) {
  console.error('ERROR: LLM_UPSTREAM_URL is not set.');
  console.error('Please set it before starting the proxy, e.g.:');
  console.error('  set LLM_UPSTREAM_URL=https://api.anthropic.com');
  process.exit(1);
}

export const UPSTREAM_URL: string = upstreamUrl;

export const API_SERVER_PORT = 3001;

export interface AgentConfig {
  name: string;
  displayName: string;
  port: number;
  protocol: 'anthropic' | 'openai';
}

export const AGENTS: AgentConfig[] = [
  { name: 'claude_code', displayName: 'Claude Code', port: 7878, protocol: 'anthropic' },
  { name: 'free_code',   displayName: 'Free Code',   port: 7879, protocol: 'anthropic' },
  { name: 'test_code',  displayName: 'Test Code',   port: 7880, protocol: 'openai'    },
];
