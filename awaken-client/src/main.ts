import { app, BrowserWindow, globalShortcut, session } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false,
      contextIsolation: false,
    },
  });

  // ✅ CORRECT PLACE
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:3002");
  }

  mainWindow.on("close", (e) => {
    if (app.isPackaged) e.preventDefault();
  });
}

app.whenReady().then(() => {
  // 🔥 CSP fix
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src * http://localhost:4000 ws://localhost:4000 https://cdn.socket.io;"
        ],
      },
    });
  });

  createWindow();

  // 🔥 shortcuts (only production)
  if (app.isPackaged) {
    globalShortcut.register("Alt+F4", () => {});
    globalShortcut.register("Control+W", () => {});
    globalShortcut.register("Control+Shift+I", () => {});
    globalShortcut.register("F11", () => {});
  }
});

// ✅ correct handler
app.on("window-all-closed", () => {
  if (!app.isPackaged) {
    app.quit();
  }
});