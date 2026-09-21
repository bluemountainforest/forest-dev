const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const envPath = path.join(__dirname, '.env');
const adminSessions = new Map();
const ADMIN_SESSION_COOKIE = 'forest_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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

function parseCookies(request) {
  const header = request.headers.cookie || '';
  return header.split(';').reduce((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator === -1) return cookies;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function createAdminSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  adminSessions.set(token, { username, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS });
  return token;
}

function getAdminSession(request) {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  const session = token ? adminSessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  return { token, ...session };
}

function requireAdminSession(request, response, next) {
  const session = getAdminSession(request);
  if (!session) {
    response.status(401).json({ error: 'Admin session expired. Sign in again.' });
    return;
  }
  request.adminSession = session;
  next();
}

function setAdminSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}; HttpOnly; Path=/; SameSite=Strict${secure}`);
}

function clearAdminSessionCookie(response) {
  response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; Max-Age=0; HttpOnly; Path=/; SameSite=Strict`);
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

  const token = createAdminSession(configuredUsername);
  setAdminSessionCookie(response, token);
  response.json({ username: configuredUsername, mode: 'admin' });
});

app.post('/api/admin/logout', (request, response) => {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  if (token) adminSessions.delete(token);
  clearAdminSessionCookie(response);
  response.json({ signedOut: true });
});

app.post('/api/admin/change-password', requireAdminSession, (request, response) => {
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

  if (trimmedUsername !== request.adminSession.username || trimmedUsername !== configuredUsername || trimmedCurrent !== configuredPassword) {
    response.status(401).json({ error: 'Current admin password is incorrect.' });
    return;
  }

  if (trimmedNew.length < 4) {
    response.status(400).json({ error: 'The new password must be at least 4 characters long.' });
    return;
  }

  writeConfiguredAccount(trimmedUsername, trimmedNew);
  adminSessions.clear();
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
