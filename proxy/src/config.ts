const upstreamUrl = process.env.LLM_UPSTREAM_URL;

if (!upstreamUrl) {
  console.error('ERROR: LLM_UPSTREAM_URL is not set.');
  console.error('  export LLM_UPSTREAM_URL=https://api.anthropic.com');
  process.exit(1);
}

export const UPSTREAM_URL: string = upstreamUrl;
export const PROXY_PORT = 7878;
export const API_SERVER_PORT = 3001;
