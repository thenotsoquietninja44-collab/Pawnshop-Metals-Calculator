'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  initial: () => ipcRenderer.invoke('initial'), refresh: () => ipcRenderer.invoke('refresh'),
  saveSettings: value => ipcRenderer.invoke('settings', value),
  exportSetup: () => ipcRenderer.invoke('export-setup'), importSetup: () => ipcRenderer.invoke('import-setup'),
  checkUpdate: () => ipcRenderer.invoke('check-update'), installUpdate: () => ipcRenderer.invoke('install-update'),
  openSource: () => ipcRenderer.invoke('open-source'), openWidget: () => ipcRenderer.invoke('open-widget'),
  onPrices: callback => ipcRenderer.on('prices', (_event, value) => callback(value)),
  onUpdate: callback => ipcRenderer.on('update', (_event, value) => callback(value))
});
