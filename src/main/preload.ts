import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
  onMenuAction: (cb: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_e, action) => cb(action));
  },
  send: (channel: string, data: any) => ipcRenderer.send(channel, data),
});
