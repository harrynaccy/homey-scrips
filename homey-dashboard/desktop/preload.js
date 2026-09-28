'use strict';
// Kleine brug tussen de pagina's en het programma (alleen wat nodig is).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  testUrl: url => ipcRenderer.invoke('cfg:test', url),
  saveUrl: url => ipcRenderer.invoke('cfg:save', url),
  retry: () => ipcRenderer.invoke('app:retry'),
  openSettings: () => ipcRenderer.invoke('app:settings'),
});
