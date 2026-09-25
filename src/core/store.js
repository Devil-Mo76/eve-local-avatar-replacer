'use strict';
/**
 * store.js —— 原图备份
 *
 * 每个角色只保留一份「替换前的原始状态」：
 *   <userData>\backups\<角色ID>\
 *     meta.json     记录每个尺寸当时是"有文件"还是"没有文件"
 *     <尺寸>.jpg     原图副本（仅当时存在的尺寸）
 *
 * 第一次替换时写入。之后再次替换不会覆盖它 —— 它始终代表官方原版。
 * 「恢复到默认」用它还原，然后删除这份备份。
 */

const fs = require('fs');
const path = require('path');

const JSON_NAME = 'meta.json';

/** 递归强删：Windows 上只读文件直接 unlink/rmdir 会 EPERM，必须先摘只读位 */
function forceRemove(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    let names = [];
    try {
      names = fs.readdirSync(p);
    } catch {
      names = [];
    }
    for (const n of names) forceRemove(path.join(p, n));
    try {
      fs.chmodSync(p, 0o777);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(p);
    } catch {
      /* ignore */
    }
  } else {
    try {
      fs.chmodSync(p, 0o666);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

class BackupStore {
  /** @param {string} baseDir 备份根目录 */
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  dirFor(charId) {
    return path.join(this.baseDir, String(charId));
  }

  metaPath(charId) {
    return path.join(this.dirFor(charId), JSON_NAME);
  }

  has(charId) {
    return fs.existsSync(this.metaPath(charId));
  }

  readMeta(charId) {
    try {
      const raw = fs.readFileSync(this.metaPath(charId), 'utf8');
      const meta = JSON.parse(raw);
      return meta && typeof meta === 'object' ? meta : null;
    } catch {
      return null;
    }
  }

  writeMeta(charId, meta) {
    const dir = this.dirFor(charId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.metaPath(charId), JSON.stringify(meta, null, 2), 'utf8');
  }

  fileFor(charId, size) {
    return path.join(this.dirFor(charId), `${size}.jpg`);
  }

  drop(charId) {
    forceRemove(this.dirFor(charId));
  }

  /** 清掉没有任何角色目录的空壳 */
  prune() {
    let names = [];
    try {
      names = fs.readdirSync(this.baseDir);
    } catch {
      return;
    }
    for (const n of names) {
      const dir = path.join(this.baseDir, n);
      if (!fs.existsSync(path.join(dir, JSON_NAME))) forceRemove(dir);
    }
  }
}

module.exports = { BackupStore, forceRemove };
