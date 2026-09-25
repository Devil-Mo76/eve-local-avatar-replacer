'use strict';
/**
 * main.js —— Electron 主进程
 *
 * 职责：定位各服的缓存目录、读取本机角色、读写头像文件、备份与恢复、监控 EVE 运行状态。
 * 全部在本地完成，不访问任何网络接口。
 */

const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const paths = require('./core/paths');
const launcher = require('./core/launcher');
const { listCharacterIds } = require('./core/characters');
const { resolveNames } = require('./core/names');
const logindex = require('./core/logindex');
const { checkEveRunning, isWritableDir } = require('./core/system');
const { BackupStore } = require('./core/store');
const portrait = require('./core/portrait');

const APP_NAME = 'EVE Online本地头像替换工具';
app.setName(APP_NAME);

/** 应用图标：项目根目录下的 icon.ico，打包后位于 resources/app/icon.ico */
const ICON_PATH = path.join(__dirname, '..', 'icon.ico');

/** 效果预览用的参考图目录（游戏界面截图，程序会把用户头像贴合上去） */
const REFERENCE_DIR = path.join(__dirname, '..', 'img');

/**
 * 原图备份目录 = 程序根目录下的「原游戏头像备份」。
 * 放在软件旁边，用户能直接看到自己对哪个角色动过手、原图长什么样；
 * 软件目录不可写时（比如装在 Program Files）退回 Electron 的 userData。
 */
function appRootDir() {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
}

let backupsDirCache = null;
function backupsDir() {
  if (backupsDirCache) return backupsDirCache;
  const primary = path.join(appRootDir(), '原游戏头像备份');
  try {
    fs.mkdirSync(primary, { recursive: true });
  } catch {
    /* 目录建不出来就直接走回退 */
  }
  if (isWritableDir(primary)) {
    backupsDirCache = primary;
    return backupsDirCache;
  }
  const fallback = path.join(app.getPath('userData'), 'backups');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {
    /* ignore */
  }
  backupsDirCache = fallback;
  return backupsDirCache;
}

/**
 * 开发自检模式。这种模式下不申请单实例锁 ——
 * 自动化测试经常在上一轮进程还没完全退出时就启动下一轮，
 * 被锁挡掉的实例会退出，导致截到的是另一个窗口的画面。
 */
const IS_DEV = !!(process.env.EVEPS_EXEC || process.env.EVEPS_SHOT);

/**
 * 自检时可以用 EVEPS_HIDDEN=1 让窗口不显示。
 * 否则自检窗口会弹到用户桌面上，用户顺手点一下就会干扰测试结果
 * （实测踩过：免责声明被手动确认、服务器被手动切走）。
 */
const HIDDEN = !!process.env.EVEPS_HIDDEN;

if (!IS_DEV && !app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let store = null;

/** 当前环境 */
const ctx = {
  ok: false,
  root: null,
  picturesDir: null,
  settingsDir: null,
  server: null,
  serverLabel: null,
  candidates: [],
  source: null,
  manualRoot: null,
  error: null,
};

function getStore() {
  if (!store) store = new BackupStore(backupsDir());
  return store;
}

// ─────────────────────────────────────────────── 偏好设置

function prefsPath() {
  return path.join(app.getPath('userData'), 'prefs.json');
}

function readPrefs() {
  try {
    const o = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  try {
    const next = { ...readPrefs(), ...patch };
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch {
    return readPrefs();
  }
}

// ─────────────────────────────────────────────── 环境

function eveStatus() {
  return checkEveRunning();
}

async function scanEnvironment({ manualRoot } = {}) {
  const prefs = readPrefs();
  const manual = manualRoot !== undefined ? manualRoot : ctx.manualRoot;
  const r = paths.resolve(manual, prefs.selectedServer || null);
  logindex.invalidate();

  if (r.ok) {
    ctx.ok = true;
    ctx.root = r.root;
    ctx.picturesDir = r.picturesDir;
    ctx.settingsDir = r.settingsDir;
    ctx.server = r.server;
    ctx.serverLabel = r.label;
    ctx.error = null;
    // 记住这次用的服，下次启动直接用它
    if (prefs.selectedServer !== r.root) writePrefs({ selectedServer: r.root });
  } else {
    ctx.ok = false;
    ctx.root = null;
    ctx.picturesDir = null;
    ctx.settingsDir = null;
    ctx.server = null;
    ctx.serverLabel = null;
    ctx.error = r.error || '没有找到头像缓存目录';
  }
  ctx.source = r.source;
  ctx.candidates = r.candidates || [];

  const [eve, launcherInfo] = await Promise.all([
    eveStatus(),
    Promise.resolve(launcher.listLauncherCharacterIds()),
  ]);

  // 候选列表：如果当前用的目录（例如手动指定的）不在自动扫描结果里，补到最前面
  const list = ctx.candidates.map((c) => ({ ...c, current: c.root === ctx.root }));
  if (ctx.ok && !list.some((c) => c.root === ctx.root)) {
    const info = paths.describe(ctx.root);
    list.unshift({ ...info, current: true });
  }

  return {
    ctx: {
      ok: ctx.ok,
      root: ctx.root,
      picturesDir: ctx.picturesDir,
      server: ctx.server,
      serverLabel: ctx.serverLabel,
      source: ctx.source,
      error: ctx.error,
    },
    candidates: list.map((c) => ({
      root: c.root,
      server: c.server,
      label: c.label,
      knownServer: c.knownServer,
      current: !!c.current,
    })),
    /**
     * 服务器下拉项：本地没有的服也会出现，只是置灰不可选。
     * 用合并后的 list —— 手动指定的目录（例如 --cache-dir）不在自动扫描结果里，
     * 直接拿 ctx.candidates 会把它漏掉，下拉框就选不中当前这个服。
     */
    serverOptions: paths.serverOptions(list, ctx.root),
    backupDir: backupsDir(),
    writable: ctx.picturesDir ? isWritableDir(ctx.picturesDir) : false,
    sizes: paths.SIZES,
    eve,
    launcher: {
      ok: launcherInfo.ok,
      count: launcherInfo.ids.size,
      dir: launcherInfo.dir,
    },
    prefs: {
      disclaimerAccepted: prefs.disclaimerAccepted === true,
    },
  };
}

// ─────────────────────────────────────────────── 角色

/**
 * 角色列表
 *
 * 只保留「还在 EVE 启动器里」的角色：本机的 core_char_<ID>.dat 会永久保留，
 * 角色转手或删除后文件仍在，不按启动器数据过滤就会混进一堆已经不属于你的角色。
 * 手动查找过的角色 ID 不受此过滤影响。
 */
function buildCharacterList() {
  if (!ctx.ok) return { ok: false, error: ctx.error || '尚未定位到缓存目录', characters: [] };

  const local = listCharacterIds(ctx.root);
  const localCount = local.size;

  const extra = (readPrefs().extraCharIds || []).map(String);
  for (const id of extra) {
    if (!local.has(id)) local.set(id, { id, mtimeMs: 0, sources: ['manual'] });
  }

  const launcherInfo = launcher.listLauncherCharacterIds();
  const ids = [...local.keys()].filter(
    (id) => extra.includes(id) || !launcherInfo.ok || launcherInfo.ids.has(id)
  );

  const names = resolveNames(ids);
  const backup = getStore();

  const characters = ids.map((id) => {
    const meta = local.get(id);
    return {
      id,
      name: names[id] || null,
      lastSeenMs: meta.mtimeMs || 0,
      fromManual: extra.includes(id),
      sizes: portrait.sizesFor(ctx.picturesDir, id),
      files: portrait.listPortraits(ctx.picturesDir, id),
      customized: backup.has(id),
      // 界面「裁剪结果」下方的落点说明需要真实路径
      dirs: {
        root: ctx.picturesDir,
        chat: paths.chatDir(ctx.picturesDir, id),
      },
    };
  });
  characters.sort((a, b) => (b.lastSeenMs || 0) - (a.lastSeenMs || 0));

  return {
    ok: true,
    characters,
    total: characters.length,
    server: ctx.serverLabel,
    launcher: { ok: launcherInfo.ok, count: launcherInfo.ids.size, dir: launcherInfo.dir },
    hiddenCount: launcherInfo.ok ? localCount - (ids.length - extra.length) : 0,
  };
}

function characterThumb(charId, size) {
  if (!ctx.ok) return null;
  const id = String(charId);
  const want = Number(size) || 128;
  const order = [...new Set([want, 128, 256, 512, 64, 32, 1024])];

  for (const s of order) {
    const buf = portrait.readPortrait(ctx.picturesDir, id, s);
    if (!buf) continue;
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) continue;
    const size0 = img.getSize();
    const out = size0.width === want ? img : img.resize({ width: want, height: want, quality: 'good' });
    return out.toDataURL();
  }
  return null;
}

/**
 * 按角色 ID 查找
 * 本机有记录（缓存头像 / 设置文件 / 聊天日志）或出现在启动器数据里，才算找到。
 */
function findCharacter(query) {
  const id = String(query == null ? '' : query).replace(/\D/g, '');
  if (!/^\d{6,}$/.test(id)) return { ok: false, error: '请输入纯数字的角色 ID' };
  if (!ctx.ok) return { ok: false, error: '还没有定位到缓存目录' };

  const local = listCharacterIds(ctx.root);
  const launcherInfo = launcher.listLauncherCharacterIds();
  const inLauncher = launcherInfo.ok && launcherInfo.ids.has(id);
  const hasLocal = local.has(id);

  if (!hasLocal && !inLauncher) {
    return { ok: false, error: `本机没有 ${id} 的任何记录，请确认 ID 是否正确` };
  }

  const extra = (readPrefs().extraCharIds || []).map(String);
  if (!extra.includes(id)) writePrefs({ extraCharIds: [...extra, id] });

  const names = resolveNames([id]);
  return { ok: true, id, name: names[id] || null, inLauncher, hasLocal };
}

// ─────────────────────────────────────────────── EVE 运行状态轮询

let eveTimer = null;
let lastEveClient = null;

/**
 * 每 2.5 秒看一次进程。
 * 界面上的提示只跟**游戏客户端**（exefile.exe）走 —— 启动器常驻后台是常态，
 * 拿它当"EVE 正在运行"会让提示永远挂着。启动器状态仍然一并推给渲染层记录日志。
 */
function startEveWatch() {
  if (eveTimer) clearInterval(eveTimer);
  eveTimer = setInterval(async () => {
    if (!win || win.isDestroyed()) return;
    let s;
    try {
      s = await eveStatus();
    } catch {
      return;
    }
    if (lastEveClient === s.client) return;
    lastEveClient = s.client;
    win.webContents.send('eve:status', {
      running: s.running,
      client: s.client,
      launcher: s.launcher,
      processes: s.matches,
    });
  }, 2500);
}

function stopEveWatch() {
  if (eveTimer) {
    clearInterval(eveTimer);
    eveTimer = null;
  }
}

// ─────────────────────────────────────────────── 窗口

function createWindow() {
  // 窗口自适应：按屏幕工作区尺寸缩放，四周留一点边，不超过 1240×900，居中显示。
  let width = 1240;
  let height = 900;
  try {
    const wa = screen.getPrimaryDisplay().workAreaSize;
    width = Math.min(1240, Math.max(940, Math.round(wa.width - 120)));
    height = Math.min(900, Math.max(620, Math.round(wa.height - 120)));
  } catch {
    /* 取不到屏幕信息就退回默认尺寸 */
  }

  win = new BrowserWindow({
    width,
    height,
    minWidth: 940,
    minHeight: 620,
    title: APP_NAME,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    center: true,
    show: false,
    backgroundColor: '#080c14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!HIDDEN) win.show();
  });
  win.on('closed', () => {
    win = null;
    stopEveWatch();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 把渲染层的报错转发到主进程输出，界面出问题时终端能看到原因
  win.webContents.on('console-message', (event, level, message) => {
    const text = typeof message === 'string' && message ? message : (event && event.message) || '';
    const lv = typeof level === 'number' ? level : (event && event.level);
    if (!text) return;
    const tag = lv === 3 ? 'ERROR' : lv === 2 ? 'WARN' : 'LOG';
    console.log(`[renderer/${tag}] ${text}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] 进程崩溃：', JSON.stringify(details));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] 加载失败 ${code} ${desc} ${url}`);
  });

  startEveWatch();
  setupDevHooks(win);
}

/** 开发自检：EVEPS_EXEC 指向一个 js 文件，在渲染层执行；EVEPS_SHOT 输出截图。正式运行不生效。 */
function setupDevHooks(w) {
  if (!process.env.EVEPS_EXEC && !process.env.EVEPS_SHOT) return;

  w.webContents.once('did-finish-load', async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(Number(process.env.EVEPS_EXEC_DELAY || 4000));

    if (process.env.EVEPS_EXEC) {
      try {
        const code = fs.readFileSync(process.env.EVEPS_EXEC, 'utf8');
        const r = await w.webContents.executeJavaScript(code, true);
        console.log('[exec] 结果:', typeof r === 'string' ? r : JSON.stringify(r));
      } catch (e) {
        console.error('[exec] 执行失败:', e && e.message ? e.message : e);
      }
    }

    await sleep(Number(process.env.EVEPS_SHOT_DELAY || 1500));
    if (process.env.EVEPS_SHOT) {
      try {
        // --disable-gpu + swiftshader 下 capturePage 偶尔会拿到过期的合成帧，
        // 先强制重绘再截，保证截到的是当前画面
        w.webContents.invalidate();
        w.focus();
        await sleep(600);
        const img = await w.webContents.capturePage();
        fs.writeFileSync(process.env.EVEPS_SHOT, img.toPNG());
        console.log(`[shot] 已保存 ${process.env.EVEPS_SHOT}（窗口数 ${BrowserWindow.getAllWindows().length}）`);
      } catch (e) {
        console.error('[shot] 截图失败', e);
      }
    }
    // 用 exit 而不是 quit：quit 要走关闭流程，自动化场景下偶尔会留下残留进程
    app.exit(0);
  });
}

// ─────────────────────────────────────────────── IPC

function registerIpc() {
  ipcMain.handle('env:scan', (_e, opts) => scanEnvironment(opts || {}));

  ipcMain.handle('env:selectServer', async (_e, root) => {
    writePrefs({ selectedServer: String(root) });
    ctx.manualRoot = null; // 从列表里选了，就不再粘着手动指定的目录
    return scanEnvironment();
  });

  ipcMain.handle('env:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择 EVE 缓存目录（选到 EVE 安装目录那一层也可以）',
      properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    return { canceled: false, dir: r.filePaths[0] };
  });

  ipcMain.handle('env:openFolder', async (_e, which) => {
    let target = null;
    if (which === 'backups') target = backupsDir();
    else target = ctx.picturesDir || ctx.root;
    if (!target) return { ok: false };
    if (!fs.existsSync(target)) {
      try {
        fs.mkdirSync(target, { recursive: true });
      } catch {
        return { ok: false };
      }
    }
    const err = await shell.openPath(target);
    return { ok: !err, error: err || null, path: target };
  });

  ipcMain.handle('prefs:get', () => {
    const p = readPrefs();
    return {
      disclaimerAccepted: p.disclaimerAccepted === true,
      selectedServer: p.selectedServer || null,
      lang: p.lang === 'en' ? 'en' : 'zh',
    };
  });

  ipcMain.handle('prefs:setLang', (_e, lang) => {
    writePrefs({ lang: String(lang) === 'en' ? 'en' : 'zh' });
    return { ok: true };
  });

  ipcMain.handle('prefs:acceptDisclaimer', (_e, neverShowAgain) => {
    if (neverShowAgain) writePrefs({ disclaimerAccepted: true });
    return { ok: true };
  });

  ipcMain.handle('chars:list', () => {
    try {
      return buildCharacterList();
    } catch (e) {
      return { ok: false, error: e.message, characters: [] };
    }
  });

  ipcMain.handle('chars:thumb', (_e, { charId, size }) => {
    try {
      return characterThumb(charId, size);
    } catch {
      return null;
    }
  });

  ipcMain.handle('chars:find', (_e, query) => {
    try {
      return findCharacter(query);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('portrait:apply', async (_e, { charId, images }) => {
    if (!ctx.ok) return { ok: false, error: '缓存目录不可用' };
    try {
      const res = portrait.apply({
        picturesDir: ctx.picturesDir,
        store: getStore(),
        charId: String(charId),
        images: Array.isArray(images) ? images : [],
      });
      const eve = await eveStatus();
      return { ok: true, ...res, eveRunning: eve.client };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('portrait:restoreDefault', (_e, { charId }) => {
    if (!ctx.ok) return { ok: false, error: '缓存目录不可用' };
    try {
      const res = portrait.restoreDefault({
        picturesDir: ctx.picturesDir,
        store: getStore(),
        charId: String(charId),
      });
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('eve:check', () => eveStatus());

  /** 效果预览参考图：把 img 目录下的界面截图原样发给渲染层（走 Blob，避免 canvas 被污染） */
  ipcMain.handle('file:referenceImages', () => {
    try {
      if (!fs.existsSync(REFERENCE_DIR)) return { ok: true, images: [] };
      const names = fs
        .readdirSync(REFERENCE_DIR)
        .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
        .sort();
      const images = [];
      for (const name of names) {
        try {
          const buffer = fs.readFileSync(path.join(REFERENCE_DIR, name));
          if (buffer.length <= 20 * 1024 * 1024) images.push({ name, buffer });
        } catch {
          /* 单张读不了就跳过，不影响其余 */
        }
      }
      return { ok: true, images };
    } catch (e) {
      return { ok: false, error: e.message, images: [] };
    }
  });

  ipcMain.handle('file:pickImage', async () => {    const r = await dialog.showOpenDialog(win, {
      title: '选择头像图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const file = r.filePaths[0];
    try {
      const st = fs.statSync(file);
      if (st.size > 40 * 1024 * 1024) return { ok: false, error: '图片超过 40MB，请先压缩' };
      const buffer = fs.readFileSync(file);
      return {
        ok: true,
        name: path.basename(file),
        ext: (path.extname(file).slice(1) || '').toLowerCase(),
        bytes: st.size,
        buffer,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(() => {
  const cli = process.argv.find((a) => a.startsWith('--cache-dir='));
  if (cli) {
    ctx.manualRoot = cli.slice('--cache-dir='.length).replace(/^"|"$/g, '');
    console.log(`[启动] 命令行指定的缓存目录：${ctx.manualRoot}`);
  }
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
