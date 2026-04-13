import { PROXY_PORT, API_SERVER_PORT, UPSTREAM_URL } from './config';
import { createProxyApp } from './proxyHandler';
import { createApiApp } from './apiServer';

console.log(`[Config] Forwarding to: ${UPSTREAM_URL}`);
console.log('');

const proxyApp = createProxyApp();
proxyApp.listen(PROXY_PORT, () => {
  console.log(`[Proxy]  http://localhost:${PROXY_PORT}  (Anthropic /v1/messages + OpenAI /v1/chat/completions)`);
});

const apiApp = createApiApp();
apiApp.listen(API_SERVER_PORT, () => {
  console.log(`[API]    http://localhost:${API_SERVER_PORT}`);
  console.log('');
  console.log('Web UI:  http://localhost:3000  (run "npm run dev" in web/ directory)');
});
