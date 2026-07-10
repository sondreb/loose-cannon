# Deploy Loose Cannon to Azure (beta)

Automated deploy runs on every push to **`main`** via [`.github/workflows/deploy-azure.yml`](./workflows/deploy-azure.yml).

| App | URL | What it runs |
|-----|-----|----------------|
| **Client** | https://loose-cannon-beta.azurewebsites.net | Vite SPA + static Node server |
| **Server** | https://loose-cannon-beta-server.azurewebsites.net | In-memory WebSocket game backend |

## 1. GitHub secrets (publish profiles)

Yes — download each Web App’s **publish profile** from Azure and store it as a repository secret.

### Azure Portal
1. Open the Web App (e.g. `loose-cannon-beta` or `loose-cannon-beta-server`).
2. **Overview** → **Download publish profile**.
3. Open the downloaded `.PublishSettings` file in a text editor (full XML).

### GitHub
1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:

| Secret name | Value |
|-------------|--------|
| `AZURE_WEBAPP_PUBLISH_PROFILE_CLIENT` | Entire XML from `loose-cannon-beta` publish profile |
| `AZURE_WEBAPP_PUBLISH_PROFILE_SERVER` | Entire XML from `loose-cannon-beta-server` publish profile |

Do **not** commit publish profiles to git.

## 2. Azure Web App settings

Recommended for **both** apps (Linux + Node 20):

### Configuration → General settings
- **Stack**: Node
- **Major version**: 20 LTS
- **Startup command**: leave empty (uses `npm start` from deployed `package.json`)  
  or set explicitly:
  - Client: `node static-server.mjs`
  - Server: `node index.js`

### Server only — WebSockets
- **Configuration** → **General settings** → **Web sockets**: **On**  
  Without this, the browser cannot keep a live game connection.

### Application settings (optional)
| Name | App | Notes |
|------|-----|--------|
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | both | Prefer `false` — workflow ships a ready `node_modules` + built files |
| `WEBSITE_NODE_DEFAULT_VERSION` | both | `~20` if using Windows plans |

### CORS
Not required for WebSocket game traffic. Client is built with  
`VITE_WS_URL=wss://loose-cannon-beta-server.azurewebsites.net`.

## 3. Local build (same as CI)

```bash
npm ci
npm run build:azure
# → deploy/server  and  deploy/client
```

Override WebSocket URL:

```bash
# Windows PowerShell
$env:VITE_WS_URL="wss://loose-cannon-beta-server.azurewebsites.net"
npm run build:azure
```

## 4. Manual deploy (optional)

```bash
# After build:azure, using Azure CLI + publish profile zip, or:
# GitHub → Actions → "Deploy Azure (beta)" → Run workflow
```

Or zip and deploy from the portal / `az webapp deploy`.

## 5. Verify

```bash
curl https://loose-cannon-beta-server.azurewebsites.net/health
curl https://loose-cannon-beta.azurewebsites.net/health
```

Then open the client URL, join with a name, and confirm the game connects (no “Disconnected” in the event log).

## 6. Notes

- **In-memory world**: Azure recycle / restart / scale-out clears all players and state. Fine for beta.
- **Scale-out**: multiple instances = separate worlds (no sticky shared RAM). Keep **instance count = 1** for beta.
- **Secrets rotation**: re-download publish profile after resetting publish credentials.
