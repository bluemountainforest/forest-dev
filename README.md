# Forest

Local-first AI workspace with provider management, agent selection, chat sessions, encrypted browser storage, encrypted backups, and an initial multi-agent cycle workspace.

## Admin: development and deployment

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Create `.env` from `.env.example` and set:

```env
FOREST_ADMIN_USERNAME=your-admin-name
FOREST_ADMIN_PASSWORD=your-admin-password
```

Open `http://localhost:3000`. Check **admin login** and use the configured credentials to access the admin tab and admin account controls. For deployment, run `server.js` with `npm start`; the server uses the hosting platform's `PORT` value.

## Local user app

Leave **admin login** unchecked. On first use, enter a local username and password. The account and encrypted app vault are stored in that browser. Use the profile tab to change the local password, reset the local vault, and download or restore encrypted backups.

Configure providers and verified models in the providers tab before chatting. The local account password is required to unlock the encrypted vault and restore backups.

Backups use a separate generated backup key. Password changes do not invalidate the key. Store it securely; renewing it makes older backups unreadable.

The **cycle** tab is the Phase 3 starting point for group chat. Select multiple verified agents, enter a seed message, and prepare the agent turn order. Multi-agent responses will be added in the next cycle step.

## Security warning

Do not share sensitive or confidential data in chat unless both the selected provider/model and the network connection are trusted. Provider API requests may send conversation content outside the local device.
