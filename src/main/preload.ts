import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  exportProject: (payload: string) => ipcRenderer.invoke('export-project', payload),
});
