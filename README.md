# Forest

Forest is a local-first phase-1 AI workspace prototype. It provides a plain HTML interface for configuring provider connections, selecting verified free models, managing an agent pool, chatting with an agent, managing sessions, and creating encrypted local backups.

## Main functions

- **Chat:** Sends the current session history to the selected verified provider model and displays the real response. Sessions can be created, loaded, deleted, and ordered with the active session first.
- **Providers:** Supports the built-in Groq and OpenRouter provider profiles, plus custom provider entries. Provider rows load current model catalogs, restrict selection to free models, test model responses, and expose pool and manager controls.
- **Pool:** An agent enters the chat pool only when its provider is enabled, its selected free model is verified by a successful response test, and its provider remains configured. One agent can be the manager.
- **Instruction:** Stores the system prompt used in chat. Responses are requested to end with provider, model, token usage, and thinking-depth metadata.
- **Profile:** Signs in with the current local demo account and signs out. Separate provider, pool, instruction, profile, and session backups can be downloaded or restored.

## Technical design

- **Runtime:** Node.js 18 or newer with Express serving `public/`.
- **Frontend:** Plain HTML and embedded JavaScript in `public/index.html`; `public/styles.css` is intentionally not used for the plain interface design.
- **Provider protocol:** Provider chat requests use the OpenAI-compatible `/chat/completions` endpoint. Model catalogs are loaded from `/v1/models`. OpenRouter catalogs are filtered by zero prompt and completion pricing; returned Groq models are filtered to chat-capable model identifiers.
- **Model verification:** A model must be selected from the loaded catalog and pass a live completion test before it becomes available in the chat pool.
- **State:** Providers, pool state, prompts, current session, and session history are maintained in browser state and persisted in an encrypted local vault.
- **Encryption:** The browser derives an AES-GCM key from the signed-in password using PBKDF2. Separate backup files are also AES-GCM encrypted and can only be restored after signing into the same local account/password.
- **Authentication:** Account validation runs on the server using `FOREST_ADMIN_USERNAME` and `FOREST_ADMIN_PASSWORD` from the ignored `.env` file. The example file uses `admin` / `admin` for local setup; change these before public deployment.
- **Server:** `server.js` serves the static app, exposes `GET /health`, and uses the hosting platform's `PORT` value.

## Local setup

```bash
npm install
npm start
```

Copy `.env.example` to `.env`, set the server credentials, then open `http://localhost:3000` and sign in with those values.

## Deployment

For Plesk, set the Node.js startup file to `server.js`, use Node.js 18 or newer, run `npm install`, and allow Plesk to provide the application port through `process.env.PORT`.

## Current limitations

- Provider API keys are entered in the browser and real provider calls depend on API access and browser CORS permissions.
- The demo login is hardcoded for phase 1 and should be replaced with server-side authentication before production use.
- Encryption protects browser storage and exported backups, but the app does not yet provide a server-side key-management or recovery service.
