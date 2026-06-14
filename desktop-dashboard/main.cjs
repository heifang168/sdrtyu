const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const { execFile } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "outputs", "keyword-desktop");
const CONFIG_PATH = path.join(PROJECT_ROOT, "scripts", "desktop-keyword-system.config.example.json");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: "ALEO 关键词猎手",
    backgroundColor: "#f6f8fc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

async function readLatestData() {
  const latestPath = path.join(OUTPUT_ROOT, "latest.json");
  if (!fssync.existsSync(latestPath)) {
    return { empty: true, message: "还没有关键词运行记录。点击“立即运行”生成第一份报告。" };
  }
  const latest = JSON.parse(await fs.readFile(latestPath, "utf8"));
  const data = JSON.parse(await fs.readFile(latest.files.json, "utf8"));
  const report = await fs.readFile(latest.files.report, "utf8").catch(() => "");
  return { ...data, latest, report };
}

ipcMain.handle("keyword-hunter:latest", async () => readLatestData());

ipcMain.handle("keyword-hunter:run", async () => new Promise((resolve) => {
  execFile(process.execPath, [
    path.join(PROJECT_ROOT, "scripts", "daily-keyword-desktop-workflow.mjs"),
    "--config",
    CONFIG_PATH
  ], { cwd: PROJECT_ROOT, env: process.env, maxBuffer: 1024 * 1024 * 8 }, async (error, stdout, stderr) => {
    if (error) {
      resolve({ ok: false, error: `${error.message}\n${stderr}` });
      return;
    }
    const latest = await readLatestData();
    resolve({ ok: true, stdout, latest });
  });
}));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
