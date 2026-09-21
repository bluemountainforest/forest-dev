const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/login', (request, response) => {
  const { username, password } = request.body || {};
  const configuredUsername = process.env.FOREST_ADMIN_USERNAME;
  const configuredPassword = process.env.FOREST_ADMIN_PASSWORD;

  if (!configuredUsername || !configuredPassword) {
    response.status(503).json({ error: 'Account credentials are not configured on the server.' });
    return;
  }

  if (username !== configuredUsername || password !== configuredPassword) {
    response.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  response.json({ username: configuredUsername });
});

app.post('/api/providers/zai/chat/completions', async (request, response) => {
  const { apiKey, model, messages, max_tokens: maxTokens, temperature } = request.body || {};

  if (!apiKey || !model || !Array.isArray(messages)) {
    response.status(400).json({ error: { message: 'apiKey, model, and messages are required' } });
    return;
  }

  try {
    const upstream = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept-Language': 'en-US,en',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false })
    });
    const payload = await upstream.text();
    response.status(upstream.status).type('application/json').send(payload);
  } catch (error) {
    response.status(502).json({ error: { message: `Z.AI proxy request failed: ${error.message}` } });
  }
});

app.use((_request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Forest listening on port ${port}`);
});
