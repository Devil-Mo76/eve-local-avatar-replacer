'use strict';
/**
 * launcher.js —— 从 EVE 启动器的本地数据里读出"账号下当前有哪些角色"
 *
 * 为什么要这个：本机的 core_char_<ID>.dat 会永久保留，角色转手或删除后文件还在，
 * 于是列表里会混进一堆已经不属于你的角色。启动器才是"现在还拥有谁"的权威来源。
 *
 * 两个本地来源，取并集：
 *
 * 1. 启动器日志（主来源，纯文本，最准）
 *    启动器为每个已添加账号拉取角色详情时会写日志：
 *      [esi] Fetching details for 3 character(s)  { characterIds: [ 1234567890, ... ] }
 *    这就是该账号当前的角色列表。
 *
 * 2. pulsar 缓存库（兜底，日志被清理时仍可用）
 *    <启动器数据目录>\pulsar\cache.db 是启动器的 HTTP 响应缓存（SQLite）。
 *    其中缓存了 https://pulsar.evetech.net//characters/<角色ID> 的响应，
 *    也就是它渲染过的角色。这里不引入 SQLite 依赖，直接在文件字节里扫这个 URL 形态
 *    —— 路径足够特异，不会误伤。
 *
 * 两者都读不到时（比如换了个启动器），调用方应当退化成"不过滤"。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR_NAME = 'EVE Online';
const LOG_SUBDIR = 'logs';
const MAX_LOGS = 6; // 最近几个会话的日志，单个会话可能只刷新部分账号

/** 启动器的 Electron userData 目录 */
function launcherDataDir() {
  const appData =
    process.env.APPDATA ||
    (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : path.join(os.homedir(), '.config'));
  return path.join(appData, LOG_DIR_NAME);
}

function readText(p, limit) {
  try {
    const st = fs.statSync(p);
    if (limit && st.size > limit) {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(limit);
      const n = fs.readSync(fd, buf, 0, limit, 0);
      fs.closeSync(fd);
      return buf.subarray(0, n).toString('utf8');
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/** 日志：characterIds: [ 1, 2, 3 ] */
const CHARACTER_IDS_RE = /characterIds:\s*\[([0-9,\s]+)\]/g;

function idsFromLogs(dir) {
  const ids = new Set();
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /\.log$/i.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        let mt = 0;
        try {
          mt = fs.statSync(full).mtimeMs;
        } catch {
          /* ignore */
        }
        return { full, mt };
      })
      .sort((a, b) => b.mt - a.mt)
      .slice(0, MAX_LOGS);
  } catch {
    return ids;
  }

  for (const { full } of files) {
    const text = readText(full);
    if (!text) continue;
    CHARACTER_IDS_RE.lastIndex = 0;
    let m;
    while ((m = CHARACTER_IDS_RE.exec(text)) !== null) {
      for (const raw of m[1].split(',')) {
        const id = raw.trim();
        if (/^\d{6,}$/.test(id)) ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * pulsar 缓存库：直接在字节里扫 /characters/<id>
 * 不引 SQLite 依赖，因为只要这一种形态的 URL，扫字节足够且没有副作用。
 */
const CACHE_URL_RE = /\/characters\/(\d{6,})/g;

function idsFromPulsarCache(launcherDir) {
  const ids = new Set();
  const dir = path.join(launcherDir, 'pulsar');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^cache\.db/.test(f));
  } catch {
    return ids;
  }
  for (const f of files) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(dir, f));
    } catch {
      continue;
    }
    const text = buf.toString('latin1'); // 只做形态匹配，不做解码
    CACHE_URL_RE.lastIndex = 0;
    let m;
    while ((m = CACHE_URL_RE.exec(text)) !== null) {
      ids.add(m[1]);
    }
  }
  return ids;
}

/**
 * @returns {{ok:boolean, ids:Set<string>, fromLogs:number, fromCache:number, dir:string}}
 *          ok 为 false 表示本机没有启动器数据，调用方不要据此过滤
 */
function listLauncherCharacterIds() {
  const dir = launcherDataDir();
  const logIds = idsFromLogs(path.join(dir, LOG_SUBDIR));
  const cacheIds = idsFromPulsarCache(dir);
  const ids = new Set([...logIds, ...cacheIds]);
  return {
    ok: ids.size > 0,
    ids,
    fromLogs: logIds.size,
    fromCache: cacheIds.size,
    dir,
  };
}

module.exports = { listLauncherCharacterIds, launcherDataDir };
