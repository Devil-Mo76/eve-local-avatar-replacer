'use strict';
/**
 * characters.js —— 扫描"本机登录过的角色 ID"
 *
 * 已实测的三个本地来源（取并集，越稳越好）：
 *   1. <tq根>\settings_Default\core_char_<ID>.dat      ← 主来源
 *   2. <tq根>\cache\char_<ID>.unlocks.yaml
 *   3. Documents\EVE\logs\{Chatlogs,Gamelogs}\*_<ID>.txt
 *
 * 注意：cache\Pictures\Characters 里会有近万个"你看过的别人"的头像，
 * 那些不是你的角色，所以不能拿它当来源。
 */

const fs = require('fs');
const path = require('path');

const { SETTINGS_REL } = require('./paths');
const logindex = require('./logindex');

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function mtimeOf(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * @param {string} root TQ 缓存根目录
 * @returns {Map<string, {id:string, mtimeMs:number, sources:string[]}>}
 */
function listCharacterIds(root) {
  const found = new Map();
  const add = (id, mtimeMs, source) => {
    if (!/^\d{4,}$/.test(id)) return;
    const cur = found.get(id);
    if (cur) {
      if (mtimeMs > cur.mtimeMs) cur.mtimeMs = mtimeMs;
      if (!cur.sources.includes(source)) cur.sources.push(source);
    } else {
      found.set(id, { id, mtimeMs, sources: [source] });
    }
  };

  if (root) {
    // 1. settings_Default/core_char_<ID>.dat（只有几十个文件，stat 无所谓）
    const settingsDir = path.join(root, SETTINGS_REL);
    for (const f of safeReaddir(settingsDir)) {
      const m = /^core_char_(\d+)\.dat$/i.exec(f);
      if (m) add(m[1], mtimeOf(path.join(settingsDir, f)), 'settings');
    }

    // 2. cache/char_<ID>.unlocks.yaml
    const cacheDir = path.join(root, 'cache');
    for (const f of safeReaddir(cacheDir)) {
      const m = /^char_(\d+)\.unlocks\.yaml$/i.exec(f);
      if (m) add(m[1], mtimeOf(path.join(cacheDir, f)), 'unlocks');
    }
  }

  // 3. 游戏日志：文件名里直接带角色 ID 和时间，走索引，绝不逐文件 stat
  for (const sub of ['Chatlogs', 'Gamelogs']) {
    for (const e of logindex.entriesFor(sub)) {
      add(e.id, e.mtimeMs, 'log');
    }
  }

  return found;
}

module.exports = { listCharacterIds };
