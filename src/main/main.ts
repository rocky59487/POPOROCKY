import { app, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1920, height: 1080, minWidth: 1280, minHeight: 720,
    backgroundColor: '#0a0a0f', titleBarStyle: 'default',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function send(action: string) { mainWindow?.webContents.send('menu-action', action); }

function buildMenu(): void {
  const t: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [
      { label: '新建專案', accelerator: 'CmdOrCtrl+N', click: () => send('file:new') },
      { label: '開啟專案', accelerator: 'CmdOrCtrl+O', click: () => send('file:open') },
      { type: 'separator' },
      { label: '儲存', accelerator: 'CmdOrCtrl+S', click: () => send('file:save') },
      { label: '另存新檔', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('file:save-as') },
      { type: 'separator' },
      { label: '匯入...', accelerator: 'CmdOrCtrl+I', click: () => send('file:import') },
      { label: '匯出 .3dm (Rhino)', click: () => send('file:export-3dm') },
      { label: '匯出 .step', click: () => send('file:export-step') },
      { label: '匯出 .iges', click: () => send('file:export-iges') },
      { label: '匯出 .obj', click: () => send('file:export-obj') },
      { type: 'separator' },
      { label: '匯出 Minecraft .schem (WorldEdit)', click: () => send('file:export-mc-schem') },
      { label: '匯出 Minecraft .litematic (Litematica)', click: () => send('file:export-mc-litematic') },
      { label: '匯出 Minecraft .schematic (Legacy)', click: () => send('file:export-mc-schematic') },
      { type: 'separator' },
      { label: '結束', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
    ]},
    { label: 'Edit', submenu: [
      { label: '復原', accelerator: 'CmdOrCtrl+Z', click: () => send('edit:undo') },
      { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('edit:redo') },
      { type: 'separator' },
      { label: '全選', accelerator: 'CmdOrCtrl+A', click: () => send('edit:select-all') },
      { label: '取消選取', accelerator: 'Escape', click: () => send('edit:deselect') },
      { label: '反轉選取', accelerator: 'CmdOrCtrl+Shift+A', click: () => send('edit:invert-selection') },
      { type: 'separator' },
      { label: '複製', accelerator: 'CmdOrCtrl+C', click: () => send('edit:copy') },
      { label: '貼上', accelerator: 'CmdOrCtrl+V', click: () => send('edit:paste') },
      { label: '刪除', accelerator: 'Delete', click: () => send('edit:delete') },
      { type: 'separator' },
      { label: '偏好設定', accelerator: 'CmdOrCtrl+,', click: () => send('edit:preferences') },
    ]},
    { label: 'View', submenu: [
      { label: '單視口', accelerator: 'Alt+1', click: () => send('view:single') },
      { label: '四視口', accelerator: 'Alt+4', click: () => send('view:quad') },
      { type: 'separator' },
      { label: '透視模式', accelerator: 'Numpad5', click: () => send('view:perspective') },
      { label: '正交模式', click: () => send('view:orthographic') },
      { type: 'separator' },
      { label: '線框模式', accelerator: 'Z', click: () => send('view:wireframe') },
      { label: '實體模式', click: () => send('view:solid') },
      { label: '渲染模式', click: () => send('view:rendered') },
      { type: 'separator' },
      { label: '顯示網格', accelerator: 'G', click: () => send('view:toggle-grid') },
      { label: '顯示座標軸', click: () => send('view:toggle-axes') },
      { type: 'separator' },
      { label: '全螢幕', accelerator: 'F11', role: 'togglefullscreen' },
      { label: '開發者工具', accelerator: 'F12', role: 'toggleDevTools' },
    ]},
    { label: 'Engine', submenu: [
      { label: '體素引擎', click: () => send('engine:voxel') },
      { label: '語意引擎', click: () => send('engine:semantic') },
      { label: '負載引擎', click: () => send('engine:load') },
      { label: '圖層引擎', click: () => send('engine:layer') },
      { label: '多人引擎', click: () => send('engine:multiplayer') },
      { label: '貼圖引擎', click: () => send('engine:texture') },
      { label: 'LOD 引擎', click: () => send('engine:lod') },
      { type: 'separator' },
      { label: '執行 NURBS 轉換', accelerator: 'CmdOrCtrl+R', click: () => send('engine:run-pipeline') },
      { label: '管線參數設定', click: () => send('engine:pipeline-settings') },
    ]},
    { label: 'Tools', submenu: [
      { label: '選取工具', accelerator: 'V', click: () => send('tool:select') },
      { label: '放置體素', accelerator: 'B', click: () => send('tool:place') },
      { label: '刪除體素', accelerator: 'E', click: () => send('tool:erase') },
      { label: '上色工具', accelerator: 'P', click: () => send('tool:paint') },
      { type: 'separator' },
      { label: '體素刷', accelerator: 'Shift+B', click: () => send('tool:brush') },
      { label: '體素平滑', accelerator: 'Shift+S', click: () => send('tool:smooth') },
      { label: '體素填充', accelerator: 'Shift+F', click: () => send('tool:fill') },
      { label: '雕刻模式', accelerator: 'Shift+C', click: () => send('tool:sculpt') },
      { type: 'separator' },
      { label: '測量工具', accelerator: 'M', click: () => send('tool:measure') },
      { label: '語意: Sharp', accelerator: '1', click: () => send('tool:tag-sharp') },
      { label: '語意: Smooth', accelerator: '2', click: () => send('tool:tag-smooth') },
      { label: '語意: Fillet', accelerator: '3', click: () => send('tool:tag-fillet') },
      { type: 'separator' },
      { label: '設定支撐點', click: () => send('tool:set-support') },
      { label: '施加負載', click: () => send('tool:set-load') },
    ]},
    { label: 'Help', submenu: [
      { label: '關於 FastDesign', click: () => send('help:about') },
      { label: '快捷鍵一覽', accelerator: 'CmdOrCtrl+/', click: () => send('help:shortcuts') },
      { label: '文件', click: () => send('help:docs') },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!mainWindow) createWindow(); });
