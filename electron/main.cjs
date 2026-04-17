const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const isDev = !app.isPackaged;
const DEFAULT_PORT = Number(process.env.PORT || 41777);
let mainWindow = null;
let nextProcess = null;
let isStartingServer = false;
let hasLoadedUi = false;
let startupLogPath = null;
let activePort = DEFAULT_PORT;

function appendStartupLog(message) {
  try {
    if (!startupLogPath) {
      startupLogPath = path.join(app.getPath("userData"), "startup.log");
    }
    fs.appendFileSync(startupLogPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging should never block startup.
  }
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    let triedFallback = false;

    server.unref();
    server.on("error", (error) => {
      if (!triedFallback && error && error.code === "EADDRINUSE") {
        triedFallback = true;
        server.listen(0, "127.0.0.1");
        return;
      }
      reject(error);
    });

    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function showStartupError(message) {
  const targetWindow = mainWindow ?? new BrowserWindow({
    width: 860,
    height: 620,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!mainWindow) {
    mainWindow = targetWindow;
  }

  targetWindow.once("ready-to-show", () => {
    targetWindow.show();
  });

  const escapedMessage = escapeHtml(message);
  const escapedLogPath = startupLogPath ? escapeHtml(startupLogPath) : "Unavailable";
  const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f8fafc;color:#0f172a"><h1 style="margin:0 0 12px;font-size:22px">US Webcam Monitor could not start</h1><p style="font-size:14px;line-height:1.5">The desktop app was prevented from starting its local server.</p><pre style="white-space:pre-wrap;background:#e2e8f0;padding:12px;border-radius:8px">${escapedMessage}</pre><p style="font-size:13px;color:#475569">Startup log: ${escapedLogPath}</p><p style="font-size:13px;color:#475569">Please close the app and reopen it. If the problem continues, we can inspect the packaged logs together.</p></body></html>`;
  targetWindow.loadURL(`data:text/html,${encodeURIComponent(html)}`).catch(() => {
    dialog.showErrorBox("US Webcam Monitor startup error", message);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for server at ${url}`));
          return;
        }
        setTimeout(attempt, 350);
      });

      request.setTimeout(2500, () => {
        request.destroy();
      });
    };

    attempt();
  });
}

function toPrismaSqliteUrl(filePath) {
  return `file:${filePath.replaceAll("\\", "/")}`;
}

function ensurePackagedDatabase() {
  const bundledDatabasePath = path.join(process.resourcesPath, "database", "dev.db");
  const userDatabaseDir = path.join(app.getPath("userData"), "database");
  const userDatabasePath = path.join(userDatabaseDir, "webcam-monitor.db");

  appendStartupLog(`Checking bundled database at ${bundledDatabasePath}`);

  if (!fs.existsSync(bundledDatabasePath)) {
    throw new Error(`Bundled database not found at ${bundledDatabasePath}`);
  }

  fs.mkdirSync(userDatabaseDir, { recursive: true });

  if (!fs.existsSync(userDatabasePath)) {
    fs.copyFileSync(bundledDatabasePath, userDatabasePath);
    appendStartupLog(`Copied bundled database to ${userDatabasePath}`);
  }

  return userDatabasePath;
}

async function startPackagedServer() {
  if (nextProcess || isStartingServer) {
    return;
  }

  const serverScript = path.join(process.resourcesPath, "app", "server.js");
  const serverCwd = path.join(process.resourcesPath, "app");
  const databasePath = ensurePackagedDatabase();
  activePort = await findAvailablePort(DEFAULT_PORT);
  isStartingServer = true;

  appendStartupLog(`Starting embedded server from ${serverScript}`);
  appendStartupLog(`Using database ${databasePath}`);
  appendStartupLog(`Selected port ${activePort}`);

  nextProcess = spawn(process.execPath, [serverScript], {
    cwd: serverCwd,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(activePort),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: toPrismaSqliteUrl(databasePath)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  nextProcess.stdout.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line.length > 0) {
      appendStartupLog(`[next:stdout] ${line}`);
      console.log(`[next] ${line}`);
    }
  });

  nextProcess.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line.length > 0) {
      appendStartupLog(`[next:stderr] ${line}`);
      console.error(`[next:error] ${line}`);
    }
  });

  nextProcess.on("exit", (code, signal) => {
    isStartingServer = false;
    nextProcess = null;
    appendStartupLog(`Embedded server exited with code=${code ?? "null"} signal=${signal ?? "none"}`);
    if (!app.isQuiting) {
      const message = `Local server exited unexpectedly (code=${code}, signal=${signal ?? "none"}).`;
      console.error(message);
      if (!hasLoadedUi) {
        showStartupError(message);
      }
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    appendStartupLog(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    appendStartupLog(
      `Window failed to load url=${validatedURL} errorCode=${errorCode} description=${errorDescription}`
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    appendStartupLog(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
});

async function loadUi() {
  const targetUrl = isDev
    ? process.env.NEXT_DEV_SERVER_URL || "http://127.0.0.1:3000"
    : `http://127.0.0.1:${activePort}`;

  appendStartupLog(`Loading UI from ${targetUrl}`);

  if (!isDev) {
    await startPackagedServer();
  }

  const resolvedUrl = isDev ? targetUrl : `http://127.0.0.1:${activePort}`;
  await waitForServer(resolvedUrl);
  appendStartupLog(`Server responded successfully at ${resolvedUrl}`);

  if (!mainWindow) {
    return;
  }

  await mainWindow.loadURL(resolvedUrl);
  hasLoadedUi = true;
  appendStartupLog(`Window loaded ${resolvedUrl}`);
}

app.on("before-quit", () => {
  app.isQuiting = true;

  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});

app.whenReady().then(async () => {
  appendStartupLog("App is ready");
  createWindow();

  try {
    await loadUi();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    appendStartupLog(`Startup failed: ${message}`);
    showStartupError(message);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      loadUi().catch((error) => {
        console.error(error);
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
