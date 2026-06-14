const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("keywordHunter", {
  latest: () => ipcRenderer.invoke("keyword-hunter:latest"),
  run: () => ipcRenderer.invoke("keyword-hunter:run")
});
