'use strict';
/**
 * names.js —— 从本地游戏日志里读取角色名
 *
 * Chatlogs 的文件名尾部就是角色 ID，文件头部的 Listener 行记录了当时登录的角色名：
 *
 *   Chatlogs\本地_20260924_111907_1234567890.txt
 *     ...
 *     Listener:        Player Name
 *
 * 全部离线完成，不访问任何网络接口。
 */

const fs = require('fs');

const logindex = require('./logindex');

/**
 * 日志是 UTF-16LE 带 BOM（FF FE），不是 UTF-8。
 * 按 UTF-8 读会得到大量 \x00 交错的内容，Listener 行永远匹配不上。
 */
function decodeHead(buf, n) {
  if (n >= 2 && buf[0] === 0xff && buf[1] === 0xfe && !(n >= 4 && buf[2] === 0x00 && buf[3] === 0x00)) {
    return buf.subarray(2, n).toString('utf16le');
  }
  if (n >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3, n).toString('utf8');
  }
  return buf.subarray(0, n).toString('utf8');
}

const LISTENER_RE = /Listener:[ \t]*([^\r\n\u0000]+)/i;

function readListener(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (!n) return null;
    const text = decodeHead(buf, n);
    const m = LISTENER_RE.exec(text);
    if (m) {
      const name = m[1].replace(/\u0000/g, '').trim();
      if (name && name.length < 64) return name;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 解析角色名
 *
 * Chatlogs 实测有 8 万多个文件，不能逐个 stat 或逐个读。
 * 时间戳直接从文件名取（logindex），每个角色最多试 40 个文件；
 * 同一场次会有几百个频道文件、时间戳完全相同，而私有频道的 Listener 是空的，
 * 所以不能只取最新几条 —— 要按时间倒序往下试，并设全局读取上限。
 *
 * @param {Iterable<string>} ids
 * @returns {Object<string,string>} id -> 角色名
 */
function resolveNames(ids) {
  const names = {};
  const wanted = new Set([...ids].map(String));
  if (!wanted.size) return names;

  const MAX_PER_CHAR = 40;
  const MAX_TOTAL = 3000;
  const tries = new Map();
  let total = 0;

  for (const sub of ['Chatlogs', 'Gamelogs']) {
    const list = logindex
      .entriesFor(sub)
      .filter((e) => wanted.has(e.id) && !names[e.id]);
    list.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.length - b.name.length);

    for (const e of list) {
      if (names[e.id]) continue;
      if (total >= MAX_TOTAL) break;
      const n = tries.get(e.id) || 0;
      if (n >= MAX_PER_CHAR) continue;
      tries.set(e.id, n + 1);
      total++;
      const name = readListener(e.file);
      if (name) names[e.id] = name;
    }
  }
  return names;
}

module.exports = { resolveNames };
