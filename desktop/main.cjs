'use strict';
const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createBackendProxy } = require('./lib/backend-proxy.cjs');
const { resolveAsset } = require('./lib/assets.cjs');
const { publicConfig, externalUrl, contentSecurityPolicy } = require('./lib/config.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'woof', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
app.setName('WOOF');
if (!app.isPackaged && process.env.WOOF_PROFILE_DIR) {
  fs.mkdirSync(process.env.WOOF_PROFILE_DIR, { recursive: true });
  app.setPath('userData', process.env.WOOF_PROFILE_DIR);
}
let window;
let config;
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function saveWindowState() {
  if (!window || window.isDestroyed()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() })); } catch { /* Geometry must never prevent shutdown. */ }
}
function ownNavigation(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'woof:' && url.hostname === 'app') return true;
    return !app.isPackaged && process.env.WOOF_DEV_URL && url.origin === new URL(process.env.WOOF_DEV_URL).origin;
  } catch { return false; }
}
async function openExternal(value) {
  if (externalUrl(value)) await shell.openExternal(value);
}
function createWindow() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { /* First launch. */ }
  window = new BrowserWindow({
    width: Math.max(1024, Math.min(Number(state.width) || 1440, 3840)),
    height: Math.max(700, Math.min(Number(state.height) || 960, 2160)),
    minWidth: 900, minHeight: 640, show: false,
    title: 'WOOF', backgroundColor: '#FFF7FB',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, webviewTag: false, allowRunningInsecureContent: false,
      additionalArguments: [`--woof-public-config=${encodeURIComponent(JSON.stringify({ ...config, apiUrl: "/backend-api", uploadApiUrl: "/upload-backend-api" }))}`],
    },
  });
  if (state.maximized) window.maximize();
  window.on('page-title-updated', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('close', saveWindowState);
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (!ownNavigation(url)) { event.preventDefault(); void openExternal(url); }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', () => {
    dialog.showMessageBox({ type: 'error', title: 'WOOF', message: 'The app window stopped responding. Please reopen WOOF.' });
  });
  const url = !app.isPackaged && process.env.WOOF_DEV_URL ? process.env.WOOF_DEV_URL : 'woof://app/';
  window.loadURL(url).catch((error) => {
    dialog.showErrorBox('WOOF could not open', `Please rebuild or reinstall the app.\n${error.message}`);
    app.quit();
  });
}
function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]), { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'About WOOF', click: () => dialog.showMessageBox({ title: 'WOOF', message: 'WOOF Pet Cafe Analytics', detail: `Version ${app.getVersion()}` }) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    config = publicConfig(require('./desktop-config.json'));
    const renderer = path.join(__dirname, 'renderer');
    const proxy = createBackendProxy(config);
    protocol.handle('woof', async (request) => {
      const apiResponse = await proxy(request);
      if (apiResponse) return apiResponse;
      const file = await resolveAsset(renderer, request.url);
      if (!file) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', contentSecurityPolicy(config));
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Save WOOF export', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    createMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch((error) => { dialog.showErrorBox('WOOF startup error', error.message); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
