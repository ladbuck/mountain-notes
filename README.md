# Mountain Notes

Teach from HTML notes and PDFs with S Pen and Apple Pencil. You sign in with Google; your notebooks,
ink and folders are kept in a hidden Mountain Notes folder in your own Google Drive, and under
**Connections** you can browse your Drive and open notes and PDFs from it.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | the app |
| `api/index.mjs` | Google sign-in (one small server function) |
| `vercel.json` | sends `/api/login`, `/api/callback`, `/api/token`, `/api/logout` to that function |
| `sw.js`, `manifest.webmanifest` | home-screen install and offline use |
| `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | the app icon |

---

## Fresh setup, in this order (about 20 minutes)

### Step 1 · GitHub: a new repository
1. github.com → **+** (top right) → **New repository**.
2. Name: `mountain-notes`. Private is fine. Tick nothing else. **Create repository**.
3. On the empty repository page tap **uploading an existing file**.
4. Add every file from this folder **except the `api` folder**, then **Commit changes**.
5. The `api` file: **Add file → Create new file**. In the name box type `api/index.mjs`
   (typing the `/` makes the folder). Paste the whole content of `api/index.mjs`. **Commit changes**.
   *(On a computer you can instead drag the whole folder, `api` included, into the upload page.)*

Check: the repository shows `api/index.mjs`, `index.html`, `vercel.json`, `sw.js`, `manifest.webmanifest`, the icons and `README.md`.

### Step 2 · Vercel: a new project
1. vercel.com → sign in with GitHub → **Add New… → Project**.
2. Find `mountain-notes` → **Import**. (If it isn't listed: **Adjust GitHub App Permissions** and allow the repository.)
3. **Framework Preset: Other**. Leave Build and Output settings empty. **Deploy**.
4. When it finishes, note your address, e.g. `https://mountain-notes.vercel.app`
   (Project → **Domains** shows it). Opening it now shows "Sign-in isn't set up on the server yet" — that's expected.

### Step 3 · Google Cloud: a new project
Go to **console.cloud.google.com**.

**3a. Project**
1. Project picker (top left) → **New project** → Name `Mountain Notes` → **Create**, then select it.

**3b. Turn on Google Drive**
1. ☰ → **APIs & Services → Library** → search **Google Drive API** → **Enable**.

**3c. Sign-in screen** (☰ → **Google Auth Platform**, or *APIs & Services → OAuth consent screen*)
1. **Get started**: App name `Mountain Notes`, your email as support email → **Next**.
2. Audience: **External** → **Next**. Contact email: yours → **Next** → agree → **Create**.
3. **Data Access → Add or remove scopes**: tick `.../auth/drive.appdata` and `.../auth/drive`
   (search "drive" to find them) → **Update** → **Save**.
4. **Audience → Publish app → Confirm**, so the status says **In production**.
   *(In "Testing", Google signs you out every 7 days.)*

**3d. The sign-in key**
1. **Clients → + Create client**. Application type: **Web application**. Name: `Mountain Notes`.
2. **Authorized redirect URIs → + Add URI**: `https://YOUR-ADDRESS.vercel.app/api/callback`
   (your address from Step 2, ending in `/api/callback`). No JavaScript origins are needed.
3. **Create**. Copy the **Client ID** and the **Client secret** somewhere safe now —
   the secret is only shown in full once (use **Download JSON** to keep a copy).

### Step 4 · Vercel: the settings
Vercel → your project → **Settings → Environment Variables**. Add each (all environments):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | the Client secret (starts with `GOCSPX-`) |
| `SESSION_SECRET` | any long random text, 40+ characters (letters and numbers). Keep it private; changing it later signs every device out. |
| `ALLOWED_EMAILS` | your Gmail address. Only these accounts can sign in (comma-separate several). |

Then **Deployments → ⋯ on the newest → Redeploy**. Settings only take effect after a redeploy.

### Step 5 · Open it
1. Open your address on the iPad and on the Samsung tablet (Samsung Internet for the S Pen button).
2. **Sign in with Google**. Google shows **"Google hasn't verified this app"** — tap **Advanced →
   Go to mountain-notes.vercel.app (unsafe)**. It's your own app asking to use your own Drive; Google
   shows this for any personal app with Drive access. Tick the Drive box if Google asks.
3. Add to the home screen — iPad: Share → **Add to Home Screen**. Samsung Internet: menu → **Add page to → Home screen**.

---

## Moving notebooks from Inkleaf
On the old site tap **Backup** (sidebar → More). On Mountain Notes tap **Import**, pick the backup `.json`, then **Sync**.

## Updating later
In GitHub open the file (usually `index.html`) → **⋯ → Upload files** and drop the new version → **Commit**. Vercel redeploys by itself within a minute.

## If something goes wrong
| You see | Fix |
|---|---|
| "Sign-in isn't set up on the server yet. Missing: …" | Add the named setting in Vercel, then Redeploy. |
| Google: **Error 400: redirect_uri_mismatch** | The redirect URI in Google must be exactly `https://YOUR-ADDRESS.vercel.app/api/callback`. |
| "This Google account isn't allowed" | Add that email to `ALLOWED_EMAILS`, Redeploy. |
| Signed out every week | Google Auth Platform → Audience → **Publish app** (In production). |
| Connections says "Allow access" | Tap it and tick the Drive permission at Google's screen. |
