const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const envPath = path.join(__dirname, '.env');

function getConfiguredAccount() {
  return {
    username: process.env.FOREST_ADMIN_USERNAME || '',
    password: process.env.FOREST_ADMIN_PASSWORD || ''
  };
}

function escapeEnvValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function writeConfiguredAccount(username, password) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const nextLines = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      nextLines.push(line);
      continue;
    }

    if (trimmed.startsWith('FOREST_ADMIN_USERNAME=')) {
      if (!seen.has('FOREST_ADMIN_USERNAME')) {
        seen.add('FOREST_ADMIN_USERNAME');
      }
      continue;
    }

    if (trimmed.startsWith('FOREST_ADMIN_PASSWORD=')) {
      if (!seen.has('FOREST_ADMIN_PASSWORD')) {
        seen.add('FOREST_ADMIN_PASSWORD');
      }
      continue;
    }

    nextLines.push(line);
  }

  if (!seen.has('FOREST_ADMIN_USERNAME')) {
    nextLines.push(`FOREST_ADMIN_USERNAME=${escapeEnvValue(username)}`);
  }
  if (!seen.has('FOREST_ADMIN_PASSWORD')) {
    nextLines.push(`FOREST_ADMIN_PASSWORD=${escapeEnvValue(password)}`);
  }

  const normalized = [];
  for (const line of nextLines) {
    if (line.trim().startsWith('FOREST_ADMIN_USERNAME=')) {
      normalized.push(`FOREST_ADMIN_USERNAME=${escapeEnvValue(username)}`);
      continue;
    }
    if (line.trim().startsWith('FOREST_ADMIN_PASSWORD=')) {
      normalized.push(`FOREST_ADMIN_PASSWORD=${escapeEnvValue(password)}`);
      continue;
    }
    normalized.push(line);
  }

  const output = [...normalized.filter((line) => line !== ''), ''].join('\n');
  fs.writeFileSync(envPath, output, 'utf8');
  process.env.FOREST_ADMIN_USERNAME = username;
  process.env.FOREST_ADMIN_PASSWORD = password;
}

app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/admin', (_request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/admin/login', (request, response) => {
  const { username, password } = request.body || {};
  const { username: configuredUsername, password: configuredPassword } = getConfiguredAccount();

  if (!configuredUsername || !configuredPassword) {
    response.status(503).json({ error: 'Admin credentials are not configured on the server. Finish setup first.' });
    return;
  }

  if (username !== configuredUsername || password !== configuredPassword) {
    response.status(401).json({ error: 'Invalid admin credentials.' });
    return;
  }

  response.json({ username: configuredUsername, mode: 'admin' });
});

app.post('/api/admin/change-password', (request, response) => {
  const { username, currentPassword, newPassword } = request.body || {};
  const { username: configuredUsername, password: configuredPassword } = getConfiguredAccount();
  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const trimmedCurrent = typeof currentPassword === 'string' ? currentPassword : '';
  const trimmedNew = typeof newPassword === 'string' ? newPassword : '';

  if (!configuredUsername || !configuredPassword) {
    response.status(503).json({ error: 'Admin credentials are not configured on the server.' });
    return;
  }

  if (!trimmedUsername || !trimmedCurrent || !trimmedNew) {
    response.status(400).json({ error: 'Current password and a new password are required.' });
    return;
  }

  if (trimmedUsername !== configuredUsername || trimmedCurrent !== configuredPassword) {
    response.status(401).json({ error: 'Current admin password is incorrect.' });
    return;
  }

  if (trimmedNew.length < 4) {
    response.status(400).json({ error: 'The new password must be at least 4 characters long.' });
    return;
  }

  writeConfiguredAccount(trimmedUsername, trimmedNew);
  response.json({ username: trimmedUsername, configured: true, mode: 'admin' });
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
