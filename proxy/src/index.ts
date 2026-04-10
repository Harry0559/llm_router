import { AGENTS, API_SERVER_PORT, UPSTREAM_URL } from './config';
import { createProxyApp } from './proxyHandler';
import { createApiApp } from './apiServer';

console.log(`[Config] Forwarding to: ${UPSTREAM_URL}`);
console.log('');

// Start one proxy server per agent
for (const agent of AGENTS) {
  const app = createProxyApp(agent);
  app.listen(agent.port, () => {
    console.log(`[${agent.displayName}] proxy  → http://localhost:${agent.port}  (${agent.protocol})`);
  });
}

// Start API server for Web UI
const apiApp = createApiApp();
apiApp.listen(API_SERVER_PORT, () => {
  console.log(`[API]              server → http://localhost:${API_SERVER_PORT}`);
  console.log('');
  console.log('Web UI: http://localhost:3000  (run "npm run dev" in web/ directory)');
});
