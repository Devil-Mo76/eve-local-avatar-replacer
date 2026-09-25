'use strict';
/**
 * app.js —— 渲染层
 *
 * 文件读写全部通过 window.api 交给主进程，这里只负责界面、图片裁剪与指令下发。
 * 整个文件包在 IIFE 里：preload 用 contextBridge 暴露的 window.api 是不可配置属性，
 * 脚本顶层再写 `const api = window.api` 会抛 "Identifier 'api' has already been declared"，
 * 导致整个脚本一行都不执行。
 */
(function () {

const api = window.api;

// ─────────────────────────────────────────────── 多语言
const I18N = {
  zh: {
    appTitle: 'EVE Online本地头像替换工具',
    language: '语言',
    server: '服务器',
    scanningCache: '正在扫描缓存…',
    locatingCache: '正在定位缓存目录…',
    manualSelect: '手动选择',
    rescan: '重新扫描',
    eveRunning: '检测到 EVE Online 客户端正在运行，请先关闭游戏再替换头像',
    noDir: '没有找到头像缓存目录。',
    manualPickDir: '手动指定目录',
    characters: '角色',
    refresh: '刷新角色',
    searchPh: '按角色名或角色 ID 筛选',
    selectChar: '从左侧选择一个角色',
    openCache: '打开缓存目录',
    restoreDefault: '恢复到默认',
    chooseImage: '选择图片',
    effectPreview: '效果预览',
    noImageYet: '尚未选择图片',
    squareBest: '正方形的图片裁剪效果最好',
    uploadImage: '上传图片',
    zoom: '缩放',
    reset: '复位',
    cropHint: '拖动图片调整位置，滚轮可缩放。头像为正方形，四角之外的区域不会被采用。',
    supports: '支持 jpg / png / webp / bmp',
    fxEmpty1: '上传图片后，自动贴合到游戏界面参考图',
    fxEmpty2: '滚轮缩放 · 拖动查看细节',
    fxNextTitle: '查看下一张效果图',
    zoomOutTitle: '缩小',
    zoomInTitle: '放大',
    resetTitle: '复位',
    noteIntro: '替换头像时，程序会同时保存 5 个尺寸，并将这些文件设为只读，以防止被客户端重新下载的官方头像覆盖：',
    noteSizeTo: '尺寸：保存到',
    noteFilename: '文件名：统一沿用',
    noteFilenamePattern: '角色ID_尺寸.jpg',
    apply: '替换头像',
    applying: '正在写入…',
    cancel: '取消',
    ok: '确定',
    logTitle: '运行日志',
    clearLog: '清空',
    disclaimerTitle: '免责声明',
    disclaimerBtnTitle: '查看免责声明',
    serverSelectTitle: '选择要操作的服务器',
    unknownServer: '未识别服务器',
    notFoundCacheDir: '未找到缓存目录',
    noCacheSuffix: '（未检测到本地缓存）',
    noMatch: '没有匹配的角色',
    noChars: '没有读取到角色',
    nameUnknown: '名称未知',
    charId: '角色 ID',
    readonly: '只读',
    writable: '可写',
    roTitle: '文件已设为只读，客户端无法重新下载覆盖',
    noSizeTitle: '缓存里没有这个尺寸',
    chatSubdir: 'Chat 子目录',
    charsDir: 'Characters 目录',
    restoreBtnNoRecord: '该角色没有替换记录',
    restoreBtnCustomized: '还原官方头像并解除只读',
    restoreBtnUnlock: '解除文件只读',
    logStarted: '程序已启动。全程本机运行，不接入网络。',
    logDisclaimerOk: '已确认免责声明',
    logDisclaimerNever: '已确认免责声明，后续不再弹出',
    logCacheDir: '缓存目录',
    logBackupDir: '原图备份目录',
    logManualAuto: '目录由手动指定，已自动向上找到缓存根目录',
    logNotWritable: '缓存目录不可写，替换会失败，请检查权限',
    logNoLauncher: '未找到 EVE 启动器数据，无法判断角色归属，列表将显示全部本机记录',
    logMultiCache: '本机共有 {n} 个缓存：{list}',
    logDetectedEve: '检测到 EVE Online 客户端正在运行，请先关闭游戏再替换',
    logEveClosed: 'EVE Online 客户端已关闭',
    logChars: '角色 {total} 个，其中 {named} 个已识别名称',
    logHidden: '；另有 {n} 个本机残留记录已隐藏',
    logCharsErr: '读取角色列表出错：{err}',
    logImgLoaded: '已载入图片 {name}（{w}×{h}）',
    logImgSmall: '图片小于 {n}px，{n} 尺寸会被放大，建议改用更大的图',
    logImgFail: '图片载入失败：{err}',
    logApplied: '已替换 {name} 的头像：{list} px，共 {size}，文件已设为只读',
    msgApplied: '已写入 {n} 个尺寸并设为只读。重启 EVE 后生效。',
    msgAppliedRunning: '（EVE 正在运行，改动会在下次启动时生效）',
    replaceFail: '替换失败',
    restoreTitle: '恢复到默认',
    restoreCustomized: '将「{name}」的头像还原为官方原版，并解除文件只读。此操作不可撤销。',
    restoreNoRecord: '「{name}」没有替换记录，将只解除文件只读。',
    continue: '继续',
    restoredPart: '还原 {list} px',
    removedPart: '移除 {list} px',
    logRestored: '已恢复到默认头像{parts}，只读已解除',
    msgRestored: '已恢复到官方原版，只读已解除。重启 EVE 后生效。',
    logUnlocked: '已解除只读：{list} px',
    msgUnlocked: '已解除文件只读，客户端可以重新下载官方头像。',
    restoreFail: '恢复失败',
    logSelectedDir: '已选择目录 {dir}',
    logOpenFail: '打开缓存目录失败',
    logRefreshed: '已刷新角色列表',
    popupNoCharTitle: '尚未选择角色',
    popupNoCharText: '请先在左侧列表中选择一个角色。',
    gotIt: '知道了',
    scanFail: '扫描失败',
    scanErr: '扫描环境出错：{err}',
    switchFail: '切换服务器失败：{err}',
    switching: '正在切换服务器…',
  },
  en: {
    appTitle: 'EVE Online Local Portrait Replacer',
    language: 'Language',
    server: 'Server',
    scanningCache: 'Scanning cache…',
    locatingCache: 'Locating cache directory…',
    manualSelect: 'Manual Select',
    rescan: 'Rescan',
    eveRunning: 'EVE Online client is running — close it before replacing portraits',
    noDir: 'No portrait cache directory found.',
    manualPickDir: 'Choose Directory',
    characters: 'Characters',
    refresh: 'Refresh',
    searchPh: 'Filter by name or character ID',
    selectChar: 'Select a character on the left',
    openCache: 'Open Cache',
    restoreDefault: 'Restore Default',
    chooseImage: 'Choose Image',
    effectPreview: 'Effect Preview',
    noImageYet: 'No image selected',
    squareBest: 'Square images crop best',
    uploadImage: 'Upload Image',
    zoom: 'Zoom',
    reset: 'Reset',
    cropHint: 'Drag to position, scroll to zoom. The portrait is square — areas outside the square are discarded.',
    supports: 'Supports jpg / png / webp / bmp',
    fxEmpty1: 'Upload an image to preview it in game UI references',
    fxEmpty2: 'Scroll to zoom · drag to inspect',
    fxNextTitle: 'Next preview',
    zoomOutTitle: 'Zoom out',
    zoomInTitle: 'Zoom in',
    resetTitle: 'Reset',
    noteIntro: 'When applying, 5 sizes are saved and set read-only to prevent the client from re-downloading the official portrait:',
    noteSizeTo: 'sizes: saved to',
    noteFilename: 'Filename: always uses',
    noteFilenamePattern: 'characterID_size.jpg',
    apply: 'Apply Portrait',
    applying: 'Writing…',
    cancel: 'Cancel',
    ok: 'OK',
    logTitle: 'Log',
    clearLog: 'Clear',
    disclaimerTitle: 'Disclaimer',
    disclaimerBtnTitle: 'View Disclaimer',
    serverSelectTitle: 'Select server',
    unknownServer: 'Unknown server',
    notFoundCacheDir: 'No cache directory',
    noCacheSuffix: ' (cache not detected)',
    noMatch: 'No matching characters',
    noChars: 'No characters found',
    nameUnknown: 'Unknown',
    charId: 'Character ID',
    readonly: 'Read-only',
    writable: 'Writable',
    roTitle: 'Read-only — the client cannot overwrite it',
    noSizeTitle: 'Not in cache',
    chatSubdir: 'Chat subdir',
    charsDir: 'Characters dir',
    restoreBtnNoRecord: 'No replace record for this character',
    restoreBtnCustomized: 'Restore the official portrait and clear read-only',
    restoreBtnUnlock: 'Clear read-only',
    logStarted: 'Started. Runs fully offline.',
    logDisclaimerOk: 'Disclaimer confirmed',
    logDisclaimerNever: "Disclaimer confirmed — won't show again",
    logCacheDir: 'Cache directory',
    logBackupDir: 'Backup directory',
    logManualAuto: 'Manually selected — resolved up to the cache root',
    logNotWritable: 'Cache directory is not writable — check permissions',
    logNoLauncher: 'Launcher data not found — showing all local records',
    logMultiCache: '{n} caches found: {list}',
    logDetectedEve: 'EVE Online client detected — close it before replacing',
    logEveClosed: 'EVE Online client closed',
    logChars: '{total} characters, {named} named',
    logHidden: '; {n} stale records hidden',
    logCharsErr: 'Failed to read character list: {err}',
    logImgLoaded: 'Loaded image {name} ({w}×{h})',
    logImgSmall: 'Image is smaller than {n}px — the {n}px size will be upscaled, use a larger image',
    logImgFail: 'Image load failed: {err}',
    logApplied: 'Replaced {name}: {list} px, {size} total, set read-only',
    msgApplied: 'Wrote {n} sizes and set them read-only. Restart EVE to apply.',
    msgAppliedRunning: ' (EVE is running — changes apply on next launch)',
    replaceFail: 'Replace failed',
    restoreTitle: 'Restore Default',
    restoreCustomized: "Restore \"{name}\" to the official portrait and clear read-only. This cannot be undone.",
    restoreNoRecord: "\"{name}\" has no replace record — only read-only will be cleared.",
    continue: 'Continue',
    restoredPart: 'Restored {list} px',
    removedPart: 'Removed {list} px',
    logRestored: 'Restored to default portrait{parts}, read-only cleared',
    msgRestored: 'Restored to official portrait, read-only cleared. Restart EVE to apply.',
    logUnlocked: 'Read-only cleared: {list} px',
    msgUnlocked: 'Read-only cleared — the client can re-download the official portrait.',
    restoreFail: 'Restore failed',
    logSelectedDir: 'Selected directory {dir}',
    logOpenFail: 'Failed to open cache directory',
    logRefreshed: 'Character list refreshed',
    popupNoCharTitle: 'No character selected',
    popupNoCharText: 'Select a character from the left list first.',
    gotIt: 'Got it',
    scanFail: 'Scan failed',
    scanErr: 'Scan error: {err}',
    switchFail: 'Failed to switch server: {err}',
    switching: 'Switching server…',
  },
};
let lang = 'zh';
function tr(key, vars) {
  let s = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.zh[key] !== undefined ? I18N.zh[key] : key);
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
function setLang(l) {
  lang = (l === 'en') ? 'en' : 'zh';
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  applyLanguage();
}

/** 服务器下拉项的多语言名（suffix -> zh/en），未知后缀给兜底名 */
const SERVER_LABELS_I18N = {
  tranquility: { zh: 'EVE Online欧服：正式服', en: 'EVE Online EU: Tranquility' },
  serenity: { zh: 'EVE Online国服：网易服', en: 'EVE Online CN: Serenity' },
  singularity: { zh: 'EVE Online欧服：测试服', en: 'EVE Online EU: Test Server' },
};
function serverLabelOf(suffix) {
  const s = SERVER_LABELS_I18N[suffix];
  if (s) return s[lang] || s.zh;
  return lang === 'en' ? `EVE Online (${suffix})` : `EVE Online（${suffix}）`;
}

/** 把当前语言应用到所有静态文案，并重绘动态文案 */
function applyLanguage() {
  document.title = tr('appTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = tr(el.getAttribute('data-i18n-ph')); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = tr(el.getAttribute('data-i18n-title')); });
  if (state && state.env) renderServer(state.env);
  if (state && state.current) {
    el.curName.textContent = state.current.name || tr('nameUnknown');
    el.curId.textContent = `${tr('charId')}  ${state.current.id}`;
    renderChips(state.current);
    renderNotePaths(state.current);
  }
  if (state) renderCharList();
  renderEffects();
}

let view = 280;                    // 裁剪画布边长（随容器尺寸自适应）
const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif',
};

const state = {
  env: null,
  sizes: [32, 64, 128, 256, 512],
  characters: [],
  current: null,
  eveRunning: false,
  img: null,
  imgURL: null,
  imgName: '',
  imgDims: { w: 0, h: 0 },
  baseScale: 1,
  zoom: 1,
  pan: { x: 0, y: 0 },
  dragging: false,
  dragOrigin: null,
  refs: [],        // 效果预览参考图 [{ name, label, img, rects, canvasEl, thumbEl }]
  refIndex: 0,     // 轮播当前停在第几张
  fxZoom: 1,       // 效果预览缩放
  fxPan: { x: 0, y: 0 },   // 效果预览平移
};

/**
 * 效果预览参考图：img/ 目录下的游戏界面截图，rects 是每张图里「角色头像」的白色矩形
 * （用户已把头像涂白，程序扫描白色区域拿到精确坐标）。程序把用户裁剪出的头像按 cover
 * 方式直接铺进这些白色矩形，生成「替换后长什么样」的参考图。新增参考图时在这里补一条配置。
 */
const FX_BLEED = 0; // 白块就是头像区，直接贴合、无需外扩
const REFERENCE_FRAMES = {
  '人物角色.png': { label: '人物角色', rects: [{ x: 29, y: 60, w: 117, h: 163 }] },
  '登录界面.png': { label: '登录界面', rects: [{ x: 12, y: 42, w: 233, h: 230 }] },
  '击毁报告.png': { label: '击毁报告', rects: [{ x: 19, y: 47, w: 115, h: 115 }] },
  '聊天框.png': {
    label: '聊天框',
    rects: [
      { x: 7, y: 5, w: 29, h: 28 },
      { x: 7, y: 37, w: 29, h: 28 },
      { x: 7, y: 69, w: 29, h: 28 },
      { x: 7, y: 102, w: 29, h: 28 },
      { x: 7, y: 134, w: 29, h: 28 },
      { x: 7, y: 167, w: 29, h: 28 },
      { x: 370, y: 9, w: 29, h: 28 },
    ],
  },
  '人物侧边栏.png': { label: '侧边栏', rects: [{ x: 0, y: 42, w: 45, h: 47 }] },
};

const $ = (id) => document.getElementById(id);
const el = {
  serverChip: $('serverChip'), serverSelect: $('serverSelect'),
  envPath: $('envPath'), btnRescan: $('btnRescan'), btnManualDir: $('btnManualDir'),
  langSelect: $('langSelect'),
  bannerEve: $('bannerEve'), bannerNoDir: $('bannerNoDir'), noDirText: $('noDirText'), btnPickDir: $('btnPickDir'),
  charCount: $('charCount'), charList: $('charList'), search: $('search'), btnFind: $('btnFind'),
  emptyState: $('emptyState'), workArea: $('workArea'),
  curAvatar: $('curAvatar'), curAvatarFallback: $('curAvatarFallback'),
  curName: $('curName'), curId: $('curId'), curChips: $('curChips'),
  btnOpenCache: $('btnOpenCache'), btnRestore: $('btnRestore'),
  cropper: $('cropper'), cropCanvas: $('cropCanvas'), cropEmpty: $('cropEmpty'),
  btnPickImage: $('btnPickImage'), btnPickImage2: $('btnPickImage2'), pickInfo: $('pickInfo'),
  zoom: $('zoom'), btnResetCrop: $('btnResetCrop'),
  fxStage: $('fxStage'), fxEmpty: $('fxEmpty'), fxNext: $('fxNext'), fxCount: $('fxCount'), fxThumbs: $('fxThumbs'),
  fxZoomBar: $('fxZoomBar'), fxZoomVal: $('fxZoomVal'), fxZoomOut: $('fxZoomOut'), fxZoomIn: $('fxZoomIn'), fxReset: $('fxReset'),
  applyMsg: $('applyMsg'), btnApply: $('btnApply'),
  noteChatDir: $('noteChatDir'), noteRootDir: $('noteRootDir'),
  log: $('log'), btnClearLog: $('btnClearLog'),
  modal: $('modal'), modalTitle: $('modalTitle'), modalText: $('modalText'), modalInput: $('modalInput'),
  modalOk: $('modalOk'), modalCancel: $('modalCancel'),
  disclaimer: $('disclaimer'), disclaimerNever: $('disclaimerNever'), disclaimerOk: $('disclaimerOk'),
  btnDisclaimer: $('btnDisclaimer'),
};

// ─────────────────────────────────────────────── 通用

function log(message, level = 'info') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');  const line = document.createElement('div');
  line.className = `l ${level}`;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const m = document.createElement('span');
  m.className = 'm';
  m.textContent = message;
  line.append(t, m);
  el.log.appendChild(line);
  el.log.scrollTop = el.log.scrollHeight;
  while (el.log.childElementCount > 400) el.log.removeChild(el.log.firstChild);
}

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fallbackText(ch) {
  return ch.name ? ch.name.slice(0, 2).toUpperCase() : ch.id.slice(-4);
}

let msgTimer = null;
function showMessage(text, kind) {
  el.applyMsg.className = `msg ${kind}`;
  el.applyMsg.textContent = text;
  el.applyMsg.classList.remove('hidden');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.applyMsg.classList.add('hidden'), 10000);
}

/** 通用弹窗。返回输入值 / true / null（取消） */
function popup({ title, text = '', input = false, placeholder = '', value = '', okText = tr('ok'), cancelText = tr('cancel'), showCancel = true }) {
  return new Promise((resolve) => {
    el.modalTitle.textContent = title;
    el.modalText.textContent = text;
    el.modalText.classList.toggle('hidden', !text);
    el.modalInput.classList.toggle('hidden', !input);
    el.modalInput.value = value;
    el.modalInput.placeholder = placeholder;
    el.modalOk.textContent = okText;
    el.modalCancel.textContent = cancelText;
    el.modalCancel.classList.toggle('hidden', !showCancel);
    el.modal.classList.remove('hidden');

    if (input) setTimeout(() => { el.modalInput.focus(); el.modalInput.select(); }, 0);

    const finish = (v) => {
      el.modal.classList.add('hidden');
      el.modalOk.removeEventListener('click', onOk);
      el.modalCancel.removeEventListener('click', onCancel);
      el.modalInput.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onEsc);
      resolve(v);
    };
    const onOk = () => finish(input ? el.modalInput.value.trim() : true);
    const onCancel = () => finish(null);
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } };
    const onEsc = (e) => { if (e.key === 'Escape') onCancel(); };

    el.modalOk.addEventListener('click', onOk);
    el.modalCancel.addEventListener('click', onCancel);
    el.modalInput.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onEsc);
  });
}

// ─────────────────────────────────────────────── 免责声明

/** 打开免责声明弹窗（幂等，可反复调用）。onDone 在用户确认后触发。 */
function openDisclaimer(onDone) {
  el.disclaimerNever.checked = false;
  el.disclaimer.classList.remove('hidden');
  el.disclaimerOk.onclick = async () => {
    el.disclaimerOk.onclick = null;
    const never = el.disclaimerNever.checked;
    el.disclaimer.classList.add('hidden');
    try {
      await api.acceptDisclaimer(never);
    } catch { /* ignore */ }
    log(never ? tr('logDisclaimerNever') : tr('logDisclaimerOk'));
    if (onDone) onDone();
  };
}

// ─────────────────────────────────────────────── 环境 / 服务器

async function scanEnv(manualRoot) {
  el.envPath.className = 'path-pill';
  el.envPath.textContent = tr('locatingCache');
  try {
    const env = await api.scanEnv(manualRoot !== undefined ? { manualRoot } : {});
    await applyEnv(env);
    return env;
  } catch (e) {
    el.envPath.className = 'path-pill bad';
    el.envPath.textContent = tr('scanFail');
    log(tr('scanErr', { err: e.message }), 'err');
    return null;
  }
}

async function switchServer(root) {
  el.envPath.className = 'path-pill';
  el.envPath.textContent = tr('switching');
  try {
    const env = await api.selectServer(root);
    await applyEnv(env);
  } catch (e) {
    log(tr('switchFail', { err: e.message }), 'err');
  }
}

async function applyEnv(env) {
  state.env = env;
  if (Array.isArray(env.sizes) && env.sizes.length) state.sizes = env.sizes;
  renderServer(env);
  renderEnv(env);
  renderEveBanner(env.eve);

  if (!env.ctx.ok) {
    log(env.ctx.error, 'err');
    return;
  }

  log(`${tr('logCacheDir')} ${env.ctx.picturesDir}`);
  if (env.backupDir) log(`${tr('logBackupDir')} ${env.backupDir}`);
  if (env.ctx.source === 'manual') log(tr('logManualAuto'));
  if (!env.writable) log(tr('logNotWritable'), 'err');
  if (!env.launcher.ok) log(tr('logNoLauncher'), 'warn');
  if (Array.isArray(env.candidates) && env.candidates.length > 1) {
    log(tr('logMultiCache', { n: env.candidates.length, list: env.candidates.map((c) => serverLabelOf(c.server)).join('、') }));
  }

  await loadCharacters();
}

function renderServer(env) {
  const options = Array.isArray(env.serverOptions) ? env.serverOptions : [];
  const usable = options.filter((o) => o.available);

  // 一个能用的服都没有：退回文字标识，说明没识别出来
  if (!usable.length) {
    el.serverSelect.classList.add('hidden');
    el.serverChip.classList.remove('hidden');
    el.serverChip.classList.add('unknown');
    el.serverChip.textContent = tr('unknownServer');
    return;
  }

  // 始终用下拉框：本机没装的服也列出来，只是置灰不可选
  el.serverChip.classList.add('hidden');
  el.serverSelect.classList.remove('hidden');
  el.serverSelect.textContent = '';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.root || '';
    opt.textContent = o.available ? serverLabelOf(o.suffix) : `${serverLabelOf(o.suffix)}${tr('noCacheSuffix')}`;
    opt.disabled = !o.available;
    opt.selected = !!o.current;
    el.serverSelect.appendChild(opt);
  }
}

function renderEnv(env) {
  el.envPath.className = `path-pill ${env.ctx.ok ? 'ok' : 'bad'}`;
  el.envPath.textContent = env.ctx.ok ? env.ctx.root : tr('notFoundCacheDir');
  el.envPath.title = env.ctx.ok ? env.ctx.picturesDir : env.ctx.error || '';

  el.bannerNoDir.classList.toggle('hidden', env.ctx.ok);
  if (!env.ctx.ok) {
    el.noDirText.textContent = tr('noDir');
  }
}

// EVE 运行状态（主进程每 2.5 秒轮询一次后推送）
// 只看游戏客户端：启动器常驻后台是常态，拿它当"EVE 正在运行"提示就永远消不掉。
function renderEveBanner(status) {
  const s = typeof status === 'boolean' ? { client: status } : (status || {});
  const active = !!s.client;
  const was = state.eveRunning;
  state.eveRunning = active;
  el.bannerEve.classList.toggle('hidden', !active);
  if (active && !was) log(tr('logDetectedEve'), 'warn');
  if (!active && was) log(tr('logEveClosed'));
}

// ─────────────────────────────────────────────── 角色列表

async function loadCharacters() {
  if (!state.env || !state.env.ctx.ok) return;
  el.charCount.textContent = '…';
  try {
    const res = await api.listCharacters();
    if (!res.ok) {
      el.charCount.textContent = '0';
      log(res.error, 'err');
      return;
    }

    state.characters = res.characters;
    el.charCount.textContent = String(res.characters.length);
    renderCharList();

    const named = res.characters.filter((c) => c.name).length;
    let line = tr('logChars', { total: res.characters.length, named });
    if (res.hiddenCount > 0) line += tr('logHidden', { n: res.hiddenCount });
    log(line);

    if (state.current) {
      const still = state.characters.find((c) => c.id === state.current.id);
      if (still) await selectCharacter(still.id);
      else {
        state.current = null;
        el.workArea.classList.add('hidden');
        el.emptyState.classList.remove('hidden');
      }
    }
  } catch (e) {
    log(tr('logCharsErr', { err: e.message }), 'err');
  }
}

function visibleCharacters() {
  const q = el.search.value.trim().toLowerCase();
  if (!q) return state.characters;
  return state.characters.filter(
    (c) => (c.name && c.name.toLowerCase().includes(q)) || c.id.includes(q)
  );
}

function renderCharList() {
  const list = visibleCharacters();
  el.charList.textContent = '';

  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.style.padding = '18px 10px';
    li.style.textAlign = 'center';
    li.textContent = state.characters.length ? tr('noMatch') : tr('noChars');
    el.charList.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const ch of list) {
    const li = document.createElement('li');
    li.className = 'char-item' + (state.current && state.current.id === ch.id ? ' active' : '');
    li.dataset.id = ch.id;

    const av = document.createElement('div');
    av.className = 'ci-av';
    const span = document.createElement('span');
    span.className = 'ci-fallback';
    span.textContent = fallbackText(ch);
    av.appendChild(span);

    const main = document.createElement('div');
    main.className = 'ci-main';
    const name = document.createElement('div');
    name.className = 'ci-name' + (ch.name ? '' : ' unknown');
    name.textContent = ch.name || tr('nameUnknown');
    const id = document.createElement('div');
    id.className = 'ci-id';
    id.textContent = ch.id;
    main.append(name, id);

    li.append(av, main);
    li.addEventListener('click', () => selectCharacter(ch.id));
    frag.appendChild(li);

    loadThumb(ch.id, 128).then((url) => {
      if (!url || !av.isConnected) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      span.replaceWith(img);
    });
  }
  el.charList.appendChild(frag);
}

async function loadThumb(charId, size) {
  try {
    return await api.getThumb(charId, size);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────── 选中角色

async function selectCharacter(id) {
  const ch = state.characters.find((c) => c.id === String(id));
  if (!ch) return;
  // 换角色时上一张未替换的图作废，选择图片与效果预览都清空
  if (state.current && state.current.id !== ch.id) clearImage();
  state.current = ch;

  for (const li of el.charList.querySelectorAll('.char-item')) {
    li.classList.toggle('active', li.dataset.id === ch.id);
  }

  el.emptyState.classList.add('hidden');
  el.workArea.classList.remove('hidden');

  el.curName.textContent = ch.name || tr('nameUnknown');
  el.curId.textContent = `${tr('charId')}  ${ch.id}`;

  const url = await loadThumb(ch.id, 256);
  if (url) {
    el.curAvatar.src = url;
    el.curAvatar.classList.remove('hidden');
    el.curAvatarFallback.classList.add('hidden');
  } else {
    el.curAvatar.removeAttribute('src');
    el.curAvatar.classList.add('hidden');
    el.curAvatarFallback.textContent = fallbackText(ch);
    el.curAvatarFallback.classList.remove('hidden');
  }

  renderChips(ch);
  renderNotePaths(ch);
  updateRestoreButton(ch);
  updateApplyButton();
}

function renderChips(ch) {
  el.curChips.textContent = '';
  const sizes = Object.keys(ch.files).map(Number).sort((a, b) => a - b);
  let hasReadonly = false;

  for (const size of sizes) {
    const f = ch.files[size];
    const exists = !!(f && f.exists);
    if (exists && f.readonly) hasReadonly = true;
    const c = document.createElement('span');
    c.className = `chip${exists ? ' on' : ''}`;
    c.textContent = `${size}`;
    const where = size <= 64 ? tr('chatSubdir') : tr('charsDir');
    c.title = exists
      ? `${size}px · ${where} · ${fmtBytes(f.bytes)} · ${f.readonly ? tr('readonly') : tr('writable')}`
      : `${size}px · ${where} · ${tr('noSizeTitle')}`;
    el.curChips.appendChild(c);
  }

  if (hasReadonly) {
    const c = document.createElement('span');
    c.className = 'chip ro';
    c.textContent = tr('readonly');
    c.title = tr('roTitle');
    el.curChips.appendChild(c);
  }
}

/** 裁剪结果下方的落点说明：填当前角色的真实目录 */
function renderNotePaths(ch) {
  const root = (ch.dirs && ch.dirs.root) || '';
  const chat = (ch.dirs && ch.dirs.chat) || '';
  el.noteRootDir.textContent = root || '—';
  el.noteChatDir.textContent = chat || '—';
  el.noteRootDir.title = root;
  el.noteChatDir.title = chat;
}

function updateRestoreButton(ch) {
  const hasReadonly = Object.values(ch.files).some((f) => f && f.exists && f.readonly);
  el.btnRestore.disabled = !(ch.customized || hasReadonly);
  el.btnRestore.title = el.btnRestore.disabled
    ? tr('restoreBtnNoRecord')
    : ch.customized
      ? tr('restoreBtnCustomized')
      : tr('restoreBtnUnlock');
}

function updateApplyButton() {
  el.btnApply.disabled = !(state.current && state.img);
}

// ─────────────────────────────────────────────── 图片与裁剪

function cropRect() {
  const img = state.img;
  const s = state.baseScale * state.zoom;
  const side = view / s;
  const cx = img.naturalWidth / 2 - state.pan.x / s;
  const cy = img.naturalHeight / 2 - state.pan.y / s;
  return { x: cx - side / 2, y: cy - side / 2, side };
}

function drawCropTo(ctx, outSize) {
  const img = state.img;
  const r = cropRect();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outSize, outSize);
  ctx.drawImage(img, r.x, r.y, r.side, r.side, 0, 0, outSize, outSize);
}

function clampPan() {
  const img = state.img;
  if (!img) return;
  const s = state.baseScale * state.zoom;
  const mx = Math.max(0, (img.naturalWidth * s - view) / 2);
  const my = Math.max(0, (img.naturalHeight * s - view) / 2);
  state.pan.x = Math.min(mx, Math.max(-mx, state.pan.x));
  state.pan.y = Math.min(my, Math.max(-my, state.pan.y));
}

let previewTimer = null;
function scheduleEffects() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderEffects, 80);
}

function redrawCrop() {
  if (!state.img) return;
  clampPan();
  drawCropTo(el.cropCanvas.getContext('2d'), view);
  scheduleEffects();
}

/** 裁剪画布跟随容器尺寸自适应：位图尺寸 = 容器边长，保证裁剪预览始终清晰 */
function resizeCrop() {
  const w = el.cropper ? Math.round(el.cropper.clientWidth) : 0;
  if (!w || w === view) return;
  view = w;
  el.cropCanvas.width = view;
  el.cropCanvas.height = view;
  if (state.img) {
    // 基准缩放 = 让图片"包含"适配新的画布边长
    state.baseScale = Math.max(view / state.img.naturalWidth, view / state.img.naturalHeight);
    redrawCrop();
  } else {
    el.cropCanvas.getContext('2d').clearRect(0, 0, view, view);
  }
}

/** 清空已选择的图片，恢复到「尚未选择图片」的空状态 */
function clearImage() {
  if (state.imgURL) {
    URL.revokeObjectURL(state.imgURL);
    state.imgURL = null;
  }
  state.img = null;
  state.imgName = '';
  state.imgDims = { w: 0, h: 0 };
  state.baseScale = 1;
  state.zoom = 1;
  state.pan = { x: 0, y: 0 };

  const ctx = el.cropCanvas.getContext('2d');
  ctx.clearRect(0, 0, view, view);

  el.zoom.value = '100';
  el.zoom.disabled = true;
  el.btnResetCrop.disabled = true;
  el.cropEmpty.classList.remove('hidden');
  el.pickInfo.textContent = tr('supports');

  renderEffects();
  updateApplyButton();
}

async function chooseImage() {
  if (!state.current) {
    await popup({ title: tr('popupNoCharTitle'), text: tr('popupNoCharText'), okText: tr('gotIt'), showCancel: false });
    return;
  }
  const res = await api.pickImage();
  if (!res || res.canceled) return;
  if (!res.ok) {
    log(res.error, 'err');
    return;
  }
  await loadImage(new Blob([res.buffer], MIME_BY_EXT[res.ext] ? { type: MIME_BY_EXT[res.ext] } : undefined), res.name, res.bytes);
}

async function loadImage(blob, name, bytes) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('这个文件不是可识别的图片'));
      i.src = url;
    });

    if (state.imgURL) URL.revokeObjectURL(state.imgURL);
    state.img = img;
    state.imgURL = url;
    state.imgName = name;
    state.imgDims = { w: img.naturalWidth, h: img.naturalHeight };
    state.baseScale = Math.max(view / img.naturalWidth, view / img.naturalHeight);
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };

    el.zoom.value = '100';
    el.zoom.disabled = false;
    el.btnResetCrop.disabled = false;
    el.cropEmpty.classList.add('hidden');
    el.pickInfo.textContent = `${name} · ${img.naturalWidth}×${img.naturalHeight} · ${fmtBytes(bytes || blob.size)}`;

    redrawCrop();
    updateApplyButton();

    const min = Math.min(img.naturalWidth, img.naturalHeight);
    const max = Math.max(...state.sizes);
    log(tr('logImgLoaded', { name, w: img.naturalWidth, h: img.naturalHeight }));
    if (min < max) log(tr('logImgSmall', { n: max }), 'warn');
  } catch (e) {
    URL.revokeObjectURL(url);
    log(tr('logImgFail', { err: e.message }), 'err');
  }
}

// ─────────────────────────────────────────────── 效果预览（参考图贴合轮播）

/**
 * 载入 img/ 下的参考图。
 * 图片字节走 IPC 从主进程拿，再转 Blob 加载 —— 画布全程只碰同源的 Blob 图，
 * 不会被跨源内容污染，toBlob/toDataURL 才可用。
 */
async function loadReferenceImages() {
  let res;
  try {
    res = await api.getReferenceImages();
  } catch {
    return;
  }
  if (!res || !res.ok || !Array.isArray(res.images) || !res.images.length) return;

  const byName = new Map(res.images.map((it) => [it.name, it.buffer]));
  for (const [name, cfg] of Object.entries(REFERENCE_FRAMES)) {
    const buf = byName.get(name);
    if (!buf) continue;
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('参考图解码失败'));
        i.src = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
      });
      state.refs.push(makeRef(name, cfg, img));
    } catch {
      /* 单张加载失败就跳过，不影响其余 */
    }
  }
  renderEffects();
}

/** 一张参考图 = 主画布（贴好头像的完整图）+ 缩略图按钮 */
function makeRef(name, cfg, img) {
  const ref = { name, label: cfg.label, img, rects: cfg.rects };

  ref.canvasEl = document.createElement('canvas');
  ref.canvasEl.width = img.naturalWidth;
  ref.canvasEl.height = img.naturalHeight;
  el.fxStage.appendChild(ref.canvasEl);

  ref.thumbEl = document.createElement('button');
  ref.thumbEl.className = 'fx-thumb';
  ref.thumbEl.title = cfg.label;
  const tc = document.createElement('canvas');
  tc.width = 64;
  tc.height = 48;
  ref.thumbEl.appendChild(tc);
  ref.thumbEl.addEventListener('click', () => {
    const i = state.refs.indexOf(ref);
    if (i >= 0) {
      state.refIndex = i;
      renderEffects();
    }
  });
  el.fxThumbs.appendChild(ref.thumbEl);
  return ref;
}

/** 把当前裁剪区按 cover 方式铺进参考图里的每个头像框（铺满、居中、不变形，外扩一点不留边） */
function compositeEffect(ref) {
  const c = ref.canvasEl;
  const ctx = c.getContext('2d');
  ctx.drawImage(ref.img, 0, 0);

  const src = cropRect();
  for (const rr of ref.rects) {
    const r = { x: rr.x - FX_BLEED, y: rr.y - FX_BLEED, w: rr.w + FX_BLEED * 2, h: rr.h + FX_BLEED * 2 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    const s = Math.max(r.w / src.side, r.h / src.side);
    const dw = src.side * s;
    const dh = src.side * s;
    ctx.drawImage(
      state.img,
      src.x, src.y, src.side, src.side,
      r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh
    );
    ctx.restore();
  }

  // 缩略图：整张参考图 contain 进 64×48
  const t = ref.thumbEl.firstChild;
  const tctx = t.getContext('2d');
  tctx.fillStyle = '#05080d';
  tctx.fillRect(0, 0, t.width, t.height);
  const s2 = Math.min(t.width / c.width, t.height / c.height);
  const w = c.width * s2;
  const h = c.height * s2;
  tctx.drawImage(c, (t.width - w) / 2, (t.height - h) / 2, w, h);
}

/** 把当前缩放/平移应用到当前显示的那张画布上 */
function applyFxTransform() {
  const r = state.refs[state.refIndex];
  if (!r) return;
  const z = state.fxZoom;
  r.canvasEl.style.transform = `translate(${state.fxPan.x}px, ${state.fxPan.y}px) scale(${z})`;
  el.fxZoomVal.textContent = `${Math.round(z * 100)}%`;
}

function resetFxView() {
  state.fxZoom = 1;
  state.fxPan = { x: 0, y: 0 };
  applyFxTransform();
}

/** 轮播：主舞台显示当前一张，缩略图条在下方，右侧按钮切换下一张 */
function renderEffects() {
  const refs = state.refs;
  if (!state.img || !refs.length) {
    for (const r of refs) r.canvasEl.classList.remove('current');
    el.fxEmpty.classList.remove('hidden');
    el.fxNext.classList.add('hidden');
    el.fxCount.classList.add('hidden');
    el.fxThumbs.classList.add('hidden');
    el.fxZoomBar.classList.add('hidden');
    return;
  }

  el.fxEmpty.classList.add('hidden');
  if (state.refIndex >= refs.length) state.refIndex = 0;

  for (const r of refs) compositeEffect(r);
  refs.forEach((r, i) => {
    r.canvasEl.classList.toggle('current', i === state.refIndex);
    r.thumbEl.classList.toggle('current', i === state.refIndex);
  });
  resetFxView();

  el.fxCount.textContent = `${state.refIndex + 1} / ${refs.length} · ${refs[state.refIndex].label}`;
  el.fxCount.classList.remove('hidden');
  el.fxNext.classList.remove('hidden');
  el.fxThumbs.classList.remove('hidden');
  el.fxZoomBar.classList.remove('hidden');
}

// ─────────────────────────────────────────────── 写入

async function canvasToJpeg(size, quality) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  drawCropTo(c.getContext('2d'), size);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('生成图片失败');
  return new Uint8Array(await blob.arrayBuffer());
}

async function applyPortrait() {
  const ch = state.current;
  if (!ch || !state.img) return;

  el.btnApply.disabled = true;
  const label = el.btnApply.textContent;
  el.btnApply.textContent = tr('applying');

  try {
    const images = [];
    for (const size of state.sizes) images.push({ size, buffer: await canvasToJpeg(size, 0.92) });

    const res = await api.applyPortrait({ charId: ch.id, images });
    if (!res.ok) {
      showMessage(res.error, 'err');
      log(res.error, 'err');
      return;
    }

    const list = res.written.map((w) => w.size).join(' / ');
    const total = res.written.reduce((a, b) => a + b.bytes, 0);
    log(tr('logApplied', { name: ch.name || ch.id, list, size: fmtBytes(total) }), 'ok');
    res.warnings.forEach((w) => log(w, 'warn'));

    showMessage(
      tr('msgApplied', { n: res.written.length }) +
      (res.eveRunning ? tr('msgAppliedRunning') : ''),
      res.eveRunning ? 'warn' : 'ok'
    );

    await loadCharacters();
    await selectCharacter(ch.id);
  } catch (e) {
    showMessage(`${tr('replaceFail')}：${e.message}`, 'err');
    log(`${tr('replaceFail')}：${e.message}`, 'err');
  } finally {
    el.btnApply.textContent = label;
    updateApplyButton();
  }
}

async function restoreDefault() {
  const ch = state.current;
  if (!ch) return;

  const answer = await popup({
    title: tr('restoreTitle'),
    text: ch.customized
      ? tr('restoreCustomized', { name: ch.name || ch.id })
      : tr('restoreNoRecord', { name: ch.name || ch.id }),
    okText: tr('continue'),
  });
  if (!answer) return;

  try {
    const res = await api.restoreDefault(ch.id);
    if (!res.ok) {
      showMessage(res.error, 'err');
      log(res.error, 'err');
      return;
    }

    if (res.hadBackup) {
      const parts = [];
      if (res.restored.length) parts.push(tr('restoredPart', { list: res.restored.join(' / ') }));
      if (res.removed.length) parts.push(tr('removedPart', { list: res.removed.join(' / ') }));
      log(tr('logRestored', { parts: parts.length ? `：${parts.join('，')}` : '' }), 'ok');
      showMessage(tr('msgRestored'), 'ok');
    } else {
      log(tr('logUnlocked', { list: res.unlocked.join(' / ') }), 'ok');
      showMessage(tr('msgUnlocked'), 'ok');
    }

    await loadCharacters();
    await selectCharacter(ch.id);
    clearImage();
  } catch (e) {
    showMessage(`${tr('restoreFail')}：${e.message}`, 'err');
    log(`${tr('restoreFail')}：${e.message}`, 'err');
  }
}

// ─────────────────────────────────────────────── 事件

function bind() {
  el.btnRescan.addEventListener('click', () => scanEnv());

  // 手动选择缓存目录
  el.btnManualDir.addEventListener('click', async () => {
    const r = await api.pickFolder();
    if (!r || r.canceled) return;
    log(tr('logSelectedDir', { dir: r.dir }));
    await scanEnv(r.dir);
  });

  el.serverSelect.addEventListener('change', () => switchServer(el.serverSelect.value));

  // 应用图标万一加载不出来就收掉位置，别留一个破图占位
  const logo = document.querySelector('.logo');
  if (logo) logo.addEventListener('error', () => logo.classList.add('hidden'));

  // 三角感叹号：随时打开免责声明
  el.btnDisclaimer.addEventListener('click', () => openDisclaimer());

  // 语言切换
  el.langSelect.addEventListener('change', () => {
    setLang(el.langSelect.value);
    api.setLang(el.langSelect.value).catch(() => {});
  });

  // 裁剪器跟随卡片尺寸自适应（正方形，位图同步缩放）
  if (window.ResizeObserver) {
    new ResizeObserver(() => resizeCrop()).observe(el.cropper);
  } else {
    window.addEventListener('resize', resizeCrop);
  }

  el.btnPickDir.addEventListener('click', async () => {
    const r = await api.pickFolder();
    if (!r || r.canceled) return;
    log(tr('logSelectedDir', { dir: r.dir }));
    await scanEnv(r.dir);
  });

  // 刷新角色：重新读一遍本机角色列表
  el.btnFind.addEventListener('click', async () => {
    await loadCharacters();
    log(tr('logRefreshed'), 'ok');
  });
  el.search.addEventListener('input', renderCharList);

  el.btnOpenCache.addEventListener('click', async () => {
    const r = await api.openFolder('cache');
    if (!r.ok) log(`${tr('logOpenFail')}${r.error ? `：${r.error}` : ''}`, 'err');
  });

  el.btnRestore.addEventListener('click', restoreDefault);

  el.btnPickImage.addEventListener('click', chooseImage);
  el.btnPickImage2.addEventListener('click', chooseImage);

  el.zoom.addEventListener('input', () => {
    state.zoom = Number(el.zoom.value) / 100;
    redrawCrop();
  });

  el.btnResetCrop.addEventListener('click', () => {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    el.zoom.value = '100';
    redrawCrop();
  });

  el.btnApply.addEventListener('click', applyPortrait);
  el.btnClearLog.addEventListener('click', () => { el.log.textContent = ''; });

  // 效果预览：右侧按钮切到下一张，到末尾再回到第一张
  el.fxNext.addEventListener('click', () => {
    if (!state.refs.length) return;
    state.refIndex = (state.refIndex + 1) % state.refs.length;
    renderEffects();
  });

  // 效果预览：自由缩放（按钮 + 滚轮 + 拖动平移）
  el.fxZoomIn.addEventListener('click', () => {
    state.fxZoom = Math.min(6, state.fxZoom * 1.25);
    applyFxTransform();
  });
  el.fxZoomOut.addEventListener('click', () => {
    state.fxZoom = Math.max(1, state.fxZoom / 1.25);
    applyFxTransform();
  });
  el.fxReset.addEventListener('click', resetFxView);

  el.fxStage.addEventListener('wheel', (e) => {
    if (!state.img || !state.refs.length) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    state.fxZoom = Math.min(6, Math.max(1, state.fxZoom * delta));
    applyFxTransform();
  }, { passive: false });

  let fxDragging = false;
  let fxOrigin = null;
  el.fxStage.addEventListener('pointerdown', (e) => {
    if (!state.img || !state.refs.length) return;
    if (e.target.closest('.fx-zbtn, .fx-nav')) return;
    fxDragging = true;
    fxOrigin = { x: e.clientX, y: e.clientY, px: state.fxPan.x, py: state.fxPan.y };
    try { el.fxStage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  el.fxStage.addEventListener('pointermove', (e) => {
    if (!fxDragging) return;
    const o = fxOrigin;
    state.fxPan.x = o.px + (e.clientX - o.x);
    state.fxPan.y = o.py + (e.clientY - o.y);
    applyFxTransform();
  });
  const fxEnd = (e) => {
    if (!fxDragging) return;
    fxDragging = false;
    try { el.fxStage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  el.fxStage.addEventListener('pointerup', fxEnd);
  el.fxStage.addEventListener('pointercancel', fxEnd);

  // 拖动
  const canvas = el.cropCanvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    state.dragging = true;
    state.dragOrigin = { x: e.clientX, y: e.clientY, px: state.pan.x, py: state.pan.y };
    canvas.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging || !state.img) return;
    const o = state.dragOrigin;
    state.pan.x = o.px + (e.clientX - o.x);
    state.pan.y = o.py + (e.clientY - o.y);
    redrawCrop();
  });
  const endDrag = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    canvas.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // 滚轮缩放（选择图片模块）
  canvas.addEventListener('wheel', (e) => {
    if (!state.img) return;
    e.preventDefault();
    state.zoom = Math.min(4, Math.max(1, state.zoom * (1 - e.deltaY * 0.0016)));
    el.zoom.value = String(Math.round(state.zoom * 100));
    redrawCrop();
  }, { passive: false });

  // 拖放图片
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((t) => el.cropper.addEventListener(t, (e) => {
    stop(e);
    el.cropper.style.borderColor = 'rgba(79,209,224,.6)';
  }));
  ['dragleave', 'dragend'].forEach((t) => el.cropper.addEventListener(t, (e) => {
    stop(e);
    el.cropper.style.borderColor = '';
  }));
  el.cropper.addEventListener('drop', async (e) => {
    stop(e);
    el.cropper.style.borderColor = '';
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (!state.current) {
      await popup({ title: tr('popupNoCharTitle'), text: tr('popupNoCharText'), okText: tr('gotIt'), showCancel: false });
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      log('图片超过 40MB，请先压缩', 'err');
      return;
    }
    await loadImage(file, file.name, file.size);
  });

  // 弹窗点背景关闭（免责声明除外，必须点按钮）
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) el.modalCancel.click();
  });

  // 快捷键
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      state.dragging = false;
      el.cropCanvas.classList.remove('dragging');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      chooseImage();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      el.search.focus();
    }
  });
}

// ─────────────────────────────────────────────── 启动

/** 开发自检入口。必须在任何会阻塞的 await 之前挂好，否则会被免责声明卡在后面挂不上。 */
function mountDevBridge() {
  if (!api.isDev) return;
  window.__eveps = {
    state,
    api,
    selectCharacter,
    loadCharacters,
    loadImage,
    applyPortrait,
    restoreDefault,
    clearImage,
    popup,
    logText: () => el.log.textContent,
    chars: () => state.characters.map((c) => ({
      id: c.id,
      name: c.name,
      customized: c.customized,
      sizes: c.sizes,
      existing: Object.keys(c.files).map(Number).filter((s) => c.files[s].exists).sort((a, b) => a - b),
      readonly: Object.keys(c.files).map(Number).filter((s) => c.files[s].exists && c.files[s].readonly).sort((a, b) => a - b),
    })),
    env: () => state.env,
    current: () => (state.current ? state.current.id : null),
    effects: () => ({
      refs: state.refs.length,
      index: state.refIndex,
      current: state.refs[state.refIndex] ? state.refs[state.refIndex].label : null,
      thumbs: el.fxThumbs.querySelectorAll('.fx-thumb').length,
      nextBtnVisible: !el.fxNext.classList.contains('hidden'),
      emptyVisible: !el.fxEmpty.classList.contains('hidden'),
      canvasSizes: state.refs.map((r) => `${r.canvasEl.width}×${r.canvasEl.height}`),
    }),
    fxZoom: () => state.fxZoom,
    chipText: () => el.curChips.textContent,
    noteDirs: () => ({ chat: el.noteChatDir.textContent, root: el.noteRootDir.textContent }),
    serverLabel: () => (state.env && state.env.ctx ? state.env.ctx.serverLabel : null),
    serverOptions: () => Array.from(el.serverSelect.options).map((o) => ({
      text: o.textContent, disabled: o.disabled, selected: o.selected,
    })),
    eveBannerVisible: () => !el.bannerEve.classList.contains('hidden'),
    sideFootExists: () => !!document.querySelector('.side-foot'),
    disclaimerOpen: () => !el.disclaimer.classList.contains('hidden'),
    closeDisclaimer: () => { if (!el.disclaimer.classList.contains('hidden')) el.disclaimerOk.click(); },
    modalOpen: () => !el.modal.classList.contains('hidden'),
    closeModal: () => { if (!el.modal.classList.contains('hidden')) el.modalCancel.click(); },
    ready: true,
  };
  log('已挂载开发自检入口 window.__eveps');
}

async function boot() {
  bind();
  api.onEveStatus((s) => renderEveBanner(s));

  mountDevBridge();

  let prefs = { disclaimerAccepted: false, lang: 'zh' };
  try {
    prefs = await api.getPrefs();
  } catch { /* ignore */ }

  // 应用上次选择的语言
  const l = prefs.lang === 'en' ? 'en' : 'zh';
  el.langSelect.value = l;
  setLang(l);
  log(tr('logStarted'));

  if (!prefs.disclaimerAccepted) await new Promise((r) => openDisclaimer(r));

  loadReferenceImages();
  await scanEnv();
  renderEffects();
  if (!state.current) el.emptyState.classList.remove('hidden');
}

boot();

})();
