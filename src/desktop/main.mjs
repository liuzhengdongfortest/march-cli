import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import { loadDotEnv } from "../config/dotenv.mjs";
import { loadConfig } from "../config/loader.mjs";
import { installNetworkEnvironment } from "../network/environment.mjs";
import { registerSuperGrokOAuthProvider } from "../supergrok/oauth-provider.mjs";
import { startWebUiSession } from "../web-ui/command.mjs";

const DEFAULT_WINDOW = {
  width: 1280,
  height: 860,
  minWidth: 960,
  minHeight: 640,
};

let webSession = null;
let mainWindow = null;
let quitting = false;

app.setName("March");

app.whenReady().then(startDesktop).catch(async (err) => {
  await dialog.showMessageBox({ type: "error", title: "March", message: err?.message ?? String(err) });
  app.exit(1);
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0 && webSession) await createMainWindow(webSession.url);
});

async function startDesktop() {
  const cwd = process.cwd();
  loadDotEnv(cwd);
  registerSuperGrokOAuthProvider();

  const args = parseDesktopArgs(process.argv.slice(2));
  const config = loadConfig(cwd);
  installNetworkEnvironment(config.network);

  webSession = await startWebUiSession({
    args,
    config,
    cwd,
    stateRoot: join(homedir(), ".march"),
  });

  await createMainWindow(webSession.url, { openDevTools: args.openDevTools });
}

async function createMainWindow(url, { openDevTools = false } = {}) {
  mainWindow = new BrowserWindow({
    ...DEFAULT_WINDOW,
    title: "March",
    backgroundColor: "#0f1115",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (openDevTools) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("closed", async () => {
    mainWindow = null;
    if (quitting || process.platform !== "darwin") await disposeWebSession();
  });

  const allowedOrigin = new URL(url).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isMarchRuntimeUrl(targetUrl, allowedOrigin)) return { action: "allow" };
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (isMarchRuntimeUrl(targetUrl, allowedOrigin)) return;
    event.preventDefault();
    shell.openExternal(targetUrl);
  });

  await mainWindow.loadURL(url);
}

async function disposeWebSession() {
  if (!webSession) return;
  const session = webSession;
  webSession = null;
  await session.dispose();
}

function isMarchRuntimeUrl(targetUrl, allowedOrigin) {
  try {
    return new URL(targetUrl).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function parseDesktopArgs(argv) {
  const args = {
    command: { name: "web", args: [] },
    host: "127.0.0.1",
    port: null,
    apiPort: null,
    workspace: null,
    dev: false,
    openDevTools: false,
    shellRuntime: true,
    piSessions: false,
    piRuntimeHost: false,
    extensions: [],
    model: null,
    provider: undefined,
    resume: undefined,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dev") args.dev = true;
    else if (value === "--open-devtools") args.openDevTools = true;
    else if (value === "--no-shell-runtime") args.shellRuntime = false;
    else if (value === "--pi-sessions") args.piSessions = true;
    else if (value === "--pi-runtime-host") args.piRuntimeHost = true;
    else if (value === "--host") args.host = argv[++index] ?? args.host;
    else if (value === "--port") args.port = argv[++index] ?? null;
    else if (value === "--api-port") args.apiPort = argv[++index] ?? null;
    else if (value === "--workspace") args.workspace = argv[++index] ?? null;
    else if (value === "--model" || value === "-m") args.model = argv[++index] ?? null;
    else if (value === "--provider") args.provider = argv[++index] ?? undefined;
    else if (value === "--resume") args.resume = argv[++index] ?? undefined;
    else if (value === "--extension" || value === "-e") args.extensions.push(argv[++index]);
    else if (!value.startsWith("-") && !args.workspace) args.command.args.push(value);
  }

  return args;
}
