'use strict';
/**
 * paths.js —— 定位 EVE 客户端的本地缓存目录
 *
 * 目录命名规则（`%LOCALAPPDATA%\CCP\EVE\` 下的一级子目录）：
 *     <任意前缀>_<服务器名>
 * 服务器名决定这是哪个服。前缀随安装位置而变，不要硬编码：
 *
 *   c_tranquility                                  —— 新版精简命名
 *   c_serenity                                     —— 国服（网易代理，服务器名 Serenity）
 *   e_eve_online_tq_tranquility                    —— 盘符 + 共享缓存路径 + 服务器名
 *   c_program_files_(x86)_ccp_eve_tranquility      —— 旧版
 *   c_eve_sharedcache_sisi_singularity              —— 测试服
 *
 * 所以判定方式是**看后缀**，而不是看整个名字。
 * EVE Frontier（后缀 nebula）是另一款游戏，明确排除。
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const LOCALAPPDATA =
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const CCP_EVE_DIR = path.join(LOCALAPPDATA, 'CCP', 'EVE');
const DOCS_EVE_DIR = path.join(os.homedir(), 'Documents', 'EVE');
const LOGS_DIR = path.join(DOCS_EVE_DIR, 'logs');

const PICTURES_REL = path.join('cache', 'Pictures', 'Characters');
const SETTINGS_REL = 'settings_Default';
const CHAT_SUBDIR = 'Chat';

/**
 * 头像尺寸，以及它们各自所在的目录 —— 这两组不在同一个地方，别想当然：
 *
 *   32 / 64            <缓存根>\cache\Pictures\Characters\Chat\<角色ID % 100>\
 *   128 / 256 / 512    <缓存根>\cache\Pictures\Characters\
 *   （1024 偶见于根目录，属于历史遗留，备份与还原时会一并处理）
 *
 * Chat 子目录按「角色 ID 对 100 取余」分桶（0 ~ 99），实测正式服 Chat
 * 文件全部吻合，无一例外。
 */
const CHAT_SIZES = [32, 64];
const ROOT_SIZES = [128, 256, 512];
const SIZES = [32, 64, 128, 256, 512];

/** 服务器后缀 -> 界面上显示的名字 */
const SERVER_LABELS = {
  tranquility: 'EVE Online欧服：正式服',
  serenity: 'EVE Online国服：网易服',
  singularity: 'EVE Online欧服：测试服',
};

/**
 * 下拉框里固定展示的服务器顺序。
 * 本机没扫到的也要占一行（置灰不可选），这样用户一眼就知道程序支持哪些服、
 * 以及当前这台机器上装了哪几个。
 */
const SERVER_ORDER = ['tranquility', 'serenity', 'singularity'];

/** 不是 EVE Online 的（EVE Frontier 等） */
const EXCLUDED_SUFFIXES = new Set(['nebula', 'frontier']);

/** 从目录名解析出服务器后缀与显示名 */
function parseServer(folderName) {
  const name = String(folderName || '').toLowerCase();
  const idx = name.lastIndexOf('_');
  const suffix = idx >= 0 ? name.slice(idx + 1) : name;
  const known = Object.prototype.hasOwnProperty.call(SERVER_LABELS, suffix);
  return {
    suffix,
    label: known ? SERVER_LABELS[suffix] : `EVE Online（${suffix}）`,
    known,
    excluded: EXCLUDED_SUFFIXES.has(suffix),
  };
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasPortraitCache(root) {
  return isDir(path.join(root, PICTURES_REL));
}

/** Chat 子目录的分桶名 = 角色 ID 对 100 取余 */
function chatBucket(charId) {
  const n = Number(charId);
  if (!Number.isFinite(n)) return null;
  return String(Math.abs(Math.trunc(n)) % 100);
}

/** 某个角色存放 32 / 64 头像的 Chat 子目录 */
function chatDir(picturesDir, charId) {
  const bucket = chatBucket(charId);
  return bucket === null ? null : path.join(picturesDir, CHAT_SUBDIR, bucket);
}

/** 某个尺寸应该写进哪个目录 */
function dirForSize(picturesDir, charId, size) {
  return CHAT_SIZES.includes(Number(size)) ? chatDir(picturesDir, charId) : picturesDir;
}

/** 缓存里该尺寸头像的完整路径 */
function portraitPath(picturesDir, charId, size) {
  const dir = dirForSize(picturesDir, charId, size);
  return dir ? path.join(dir, `${charId}_${size}.jpg`) : null;
}

/** 把用户手选的任意层级目录归一化成缓存根目录 */
function normalizeRoot(input) {
  if (!input) return null;
  let p = path.resolve(String(input).replace(/^"|"$/g, ''));
  for (let i = 0; i < 5; i++) {
    if (hasPortraitCache(p)) return p;
    const up = path.dirname(p);
    if (up === p) break;
    p = up;
  }
  return null;
}

function mtimeOf(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function describe(root) {
  const server = parseServer(path.basename(root));
  const settingsDir = path.join(root, SETTINGS_REL);
  return {
    root,
    server: server.suffix,
    label: server.label,
    knownServer: server.known,
    picturesDir: path.join(root, PICTURES_REL),
    settingsDir,
    lastUsedMs: mtimeOf(settingsDir) || mtimeOf(path.join(root, 'cache')),
  };
}

/**
 * 扫描所有 EVE Online 的缓存目录（各服各客户端），最近用过的排前面
 * @returns {Array<ReturnType<typeof describe>>}
 */
function discoverCandidates() {
  if (!isDir(CCP_EVE_DIR)) return [];
  let names = [];
  try {
    names = fs.readdirSync(CCP_EVE_DIR);
  } catch {
    return [];
  }

  const out = [];
  for (const n of names) {
    const server = parseServer(n);
    if (server.excluded) continue;
    const full = path.join(CCP_EVE_DIR, n);
    if (!isDir(full) || !hasPortraitCache(full)) continue;
    out.push(describe(full));
  }
  out.sort((a, b) => b.lastUsedMs - a.lastUsedMs);
  return out;
}

/**
 * 服务器下拉选项
 *
 * 已知服务器按 SERVER_ORDER 固定占位：扫到的给实际目录、可选；
 * 没扫到的 root 为 null、available 为 false（界面置灰，但保留这一项）。
 * 最后追加扫到的未知服务器（例如自定义安装位置的目录），它们一律可选。
 *
 * @param {Array<ReturnType<typeof describe>>} candidates
 * @param {string|null} currentRoot 当前正在用的缓存根目录
 */
function serverOptions(candidates, currentRoot) {
  const list = Array.isArray(candidates) ? candidates : [];
  const found = new Map();
  for (const c of list) {
    if (c && c.server && !found.has(c.server)) found.set(c.server, c);
  }

  const out = [];
  for (const suffix of SERVER_ORDER) {
    const c = found.get(suffix);
    found.delete(suffix);
    out.push({
      suffix,
      label: SERVER_LABELS[suffix],
      root: c ? c.root : null,
      available: !!c,
      known: true,
      current: !!(c && currentRoot && c.root === currentRoot),
    });
  }
  for (const c of found.values()) {
    out.push({
      suffix: c.server,
      label: c.label,
      root: c.root,
      available: true,
      known: !!c.knownServer,
      current: !!(currentRoot && c.root === currentRoot),
    });
  }

  // 一个都没选中时（例如偏好里记的目录已经不存在），默认落在第一个可用的上面
  if (!out.some((o) => o.current)) {
    const first = out.find((o) => o.available);
    if (first) first.current = true;
  }
  return out;
}

/**
 * 解析最终使用的缓存目录
 * @param {string|null} manualRoot 用户手动指定的目录
 * @param {string|null} preferredRoot 用户上次选择的那个服
 */
function resolve(manualRoot, preferredRoot) {
  const candidates = discoverCandidates();

  if (manualRoot) {
    const root = normalizeRoot(manualRoot);
    if (root) {
      const info = describe(root);
      return { ok: true, ...info, candidates, source: 'manual', error: null };
    }
    return {
      ok: false,
      candidates,
      source: 'manual',
      error: `所选目录里没有找到头像缓存（缺少 ${PICTURES_REL}）：${manualRoot}`,
    };
  }

  if (candidates.length) {
    const pick =
      (preferredRoot && candidates.find((c) => c.root === preferredRoot)) || candidates[0];
    return { ok: true, ...pick, candidates, source: 'auto', error: null };
  }

  return {
    ok: false,
    candidates,
    source: 'auto',
    error: '没有找到 EVE Online 的头像缓存目录',
  };
}

module.exports = {
  CCP_EVE_DIR,
  DOCS_EVE_DIR,
  LOGS_DIR,
  PICTURES_REL,
  SETTINGS_REL,
  CHAT_SUBDIR,
  CHAT_SIZES,
  ROOT_SIZES,
  SIZES,
  SERVER_LABELS,
  SERVER_ORDER,
  EXCLUDED_SUFFIXES,
  parseServer,
  isDir,
  hasPortraitCache,
  chatBucket,
  chatDir,
  dirForSize,
  portraitPath,
  normalizeRoot,
  discoverCandidates,
  describe,
  serverOptions,
  resolve,
};
