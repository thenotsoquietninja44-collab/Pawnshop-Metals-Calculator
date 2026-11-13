'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  initial: () => ipcRenderer.invoke('initial'), refresh: () => ipcRenderer.invoke('refresh'),
  saveSettings: value => ipcRenderer.invoke('settings', value),
  copyText: text => ipcRenderer.invoke('copy-text',text),
  exportSetup: () => ipcRenderer.invoke('export-setup'), importSetup: () => ipcRenderer.invoke('import-setup'),
  checkUpdate: () => ipcRenderer.invoke('check-update'), installUpdate: session => ipcRenderer.invoke('install-update',session),
  backupNow: session => ipcRenderer.invoke('backup-now',session), restoreBackup: () => ipcRenderer.invoke('restore-backup'), openBackups: () => ipcRenderer.invoke('open-backups'),
  openSource: () => ipcRenderer.invoke('open-source'), openWidget: () => ipcRenderer.invoke('open-widget'),
  onPrices: callback => ipcRenderer.on('prices', (_event, value) => callback(value)),
  onUpdate: callback => ipcRenderer.on('update', (_event, value) => callback(value)),
  onBackup: callback => ipcRenderer.on('backup', (_event,value) => callback(value))
});
