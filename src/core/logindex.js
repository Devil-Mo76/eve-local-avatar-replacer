'use strict';
/**
 * logindex.js —— 游戏日志目录索引
 *
 * 为什么要单独做这个：Chatlogs 目录实测有 8 万多个文件。
 * 如果对每个文件都 statSync 一次，Node 主进程会被同步阻塞十几秒到几十秒，
 * 界面直接卡死（IPC 也一并堵住）。
 *
 * 好在日志文件名本身自带时间戳，根本不需要 stat：
 *   Chatlogs\军团_20260924_111907_1234567890.txt
 *   Gamelogs\20260924_111906_1234567890.txt
 *          ^^^^^^^^ ^^^^^^ ^^^^^^^^^^
 *           日期     时间    角色ID
 *
 * 所以这里只解析文件名，并缓存 readdir 结果（TTL 30 秒，避免每次刷新都重扫 8 万个文件名）。
 */

const fs = require('fs');
const path = require('path');

const { LOGS_DIR } = require('./paths');

/** 文件名尾部：日期_时间_角色ID.txt（前面的频道名前缀有下划线，所以开头用 (?:^|_)） */
const LOG_FILENAME_RE = /(?:^|_)(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{9,})\.txt$/;

const TTL_MS = 30 * 1000;
const cache = new Map(); // sub -> { at, entries }

/** 把 日期+时间 解析成本地时间毫秒（不用 stat，纯计算） */
function stampToMs(dateStr, timeStr) {
  const y = +dateStr.slice(0, 4);
  const mo = +dateStr.slice(4, 6) - 1;
  const d = +dateStr.slice(6, 8);
  const h = +timeStr.slice(0, 2);
  const mi = +timeStr.slice(2, 4);
  const s = +timeStr.slice(4, 6);
  return new Date(y, mo, d, h, mi, s).getTime();
}

/**
 * @param {'Chatlogs'|'Gamelogs'} sub
 * @param {boolean} [force]
 * @returns {Array<{id:string, file:string, name:string, mtimeMs:number}>}
 */
function entriesFor(sub, force = false) {
  const hit = cache.get(sub);
  const now = Date.now();
  if (!force && hit && now - hit.at < TTL_MS) return hit.entries;

  const dir = path.join(LOGS_DIR, sub);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }

  const entries = [];
  for (const f of names) {
    const m = LOG_FILENAME_RE.exec(f);
    if (!m) continue;
    entries.push({
      id: m[7],
      file: path.join(dir, f),
      name: f,
      mtimeMs: stampToMs(m[1] + m[2] + m[3], m[4] + m[5] + m[6]),
    });
  }

  cache.set(sub, { at: now, entries });
  return entries;
}

/** 清空缓存（点"重新扫描"时用） */
function invalidate() {
  cache.clear();
}

module.exports = { entriesFor, invalidate, LOG_FILENAME_RE, LOGS_DIR };
