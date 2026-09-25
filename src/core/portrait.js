'use strict';
/**
 * portrait.js —— 头像缓存文件的读写
 *
 * 写入位置（两组尺寸不在同一个目录，见 paths.js）：
 *   32 / 64         <缓存根>\cache\Pictures\Characters\Chat\<角色ID % 100>\<角色ID>_<尺寸>.jpg
 *   128 / 256 / 512 <缓存根>\cache\Pictures\Characters\<角色ID>_<尺寸>.jpg
 *
 * 核心机制
 * --------
 * EVE 客户端把这个目录当普通磁盘 HTTP 缓存用：启动时本地文件在就直接显示，不会重新下载。
 * 所以替换自己的图之后，必须把文件设为「只读」，否则客户端下一轮会重新下载官方头像把它覆盖掉。
 *
 * 写入流程
 * --------
 *   1. 若该角色还没有备份，先把当前状态完整备份下来（有文件→复制，没这个尺寸→记为 absent）
 *   2. 逐个尺寸：摘掉只读 → 写入新图 → 设回只读
 *   3. 任何一步出错 → 用备份自动还原，再抛出，绝不留下一半新一半旧
 *
 * 关于尺寸：目标尺寸是 SIZES，但缓存里可能存有旧版本留下的其它尺寸（实测出现过 1024），
 * 所以备份与还原按「实际存在的尺寸 ∪ SIZES」处理，不会漏掉它们。
 */

const fs = require('fs');
const path = require('path');

const { SIZES, CHAT_SUBDIR, portraitPath, chatBucket, chatDir } = require('./paths');

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 4 && buf.subarray(0, 3).equals(JPEG_MAGIC);
}

function isReadonly(p) {
  try {
    return (fs.statSync(p).mode & 0o200) === 0;
  } catch {
    return false;
  }
}

function clearReadonly(p) {
  if (!fs.existsSync(p)) return;
  try {
    if (isReadonly(p)) fs.chmodSync(p, 0o666);
  } catch {
    /* ignore */
  }
}

function setReadonly(p, on) {
  if (!fs.existsSync(p)) return;
  try {
    fs.chmodSync(p, on ? 0o444 : 0o666);
  } catch {
    /* ignore */
  }
}

function statOne(p) {
  try {
    const st = fs.statSync(p);
    return { exists: true, bytes: st.size, mtimeMs: st.mtimeMs, readonly: (st.mode & 0o200) === 0 };
  } catch {
    return { exists: false, bytes: 0, mtimeMs: 0, readonly: false };
  }
}

// ─────────────────────────────────────────────── 尺寸索引
//
// Characters 根目录近万个文件，Chat 下 100 个桶各约一千个文件。
// 逐个角色去 readdir 不现实，所以：
//   根目录  整个扫一次
//   Chat    只扫该角色所在的那一桶（角色 ID % 100）
// 两边都做短时缓存。

const INDEX_TTL = 6000;
let rootIndex = { at: 0, dir: null, map: null };
const chatIndex = new Map(); // `${picturesDir}\0${bucket}` -> { at, map }

function invalidateIndex() {
  rootIndex = { at: 0, dir: null, map: null };
  chatIndex.clear();
}

/** 从文件名列表建「角色ID -> 尺寸集合」 */
function parseNames(names) {
  const map = new Map();
  for (const f of names) {
    const m = /^(\d+)_(\d+)\.jpg$/i.exec(f);
    if (!m) continue;
    const id = m[1];
    let set = map.get(id);
    if (!set) {
      set = new Set();
      map.set(id, set);
    }
    set.add(Number(m[2]));
  }
  return map;
}

function rootSizes(picturesDir) {
  const now = Date.now();
  if (rootIndex.map && rootIndex.dir === picturesDir && now - rootIndex.at < INDEX_TTL) {
    return rootIndex.map;
  }
  let names = [];
  try {
    names = fs.readdirSync(picturesDir);
  } catch {
    names = [];
  }
  const map = parseNames(names);
  rootIndex = { at: now, dir: picturesDir, map };
  return map;
}

function chatSizes(picturesDir, charId) {
  const bucket = chatBucket(charId);
  if (bucket === null) return null;
  const key = `${picturesDir}\u0000${bucket}`;
  const now = Date.now();
  const hit = chatIndex.get(key);
  if (hit && now - hit.at < INDEX_TTL) return hit.map;

  let names = [];
  try {
    names = fs.readdirSync(path.join(picturesDir, CHAT_SUBDIR, bucket));
  } catch {
    names = [];
  }
  const map = parseNames(names);
  chatIndex.set(key, { at: now, map });
  return map;
}

/** 缓存目录里实际存在的该角色尺寸（升序），根目录与 Chat 子目录的合并 */
function existingSizes(picturesDir, charId) {
  const id = String(charId);
  const set = new Set();

  const atRoot = rootSizes(picturesDir).get(id);
  if (atRoot) for (const s of atRoot) set.add(s);

  const inChat = chatSizes(picturesDir, id);
  if (inChat) {
    const v = inChat.get(id);
    if (v) for (const s of v) set.add(s);
  }

  return [...set].sort((a, b) => a - b);
}

/** 需要管理的尺寸 = 目标尺寸 ∪ 磁盘上实际存在的尺寸 */
function sizesFor(picturesDir, charId) {
  return [...new Set([...SIZES, ...existingSizes(picturesDir, charId)])].sort((a, b) => a - b);
}

/** 列出某角色在各尺寸上的当前状态 */
function listPortraits(picturesDir, charId, sizes) {
  const list = sizes || sizesFor(picturesDir, charId);
  const out = {};
  for (const size of list) {
    out[size] = { size, ...statOne(portraitPath(picturesDir, charId, size)) };
  }
  return out;
}

/** 读取某尺寸的头像字节（界面缩略图用，只读不改） */
function readPortrait(picturesDir, charId, size) {
  try {
    return fs.readFileSync(portraitPath(picturesDir, charId, size));
  } catch {
    return null;
  }
}

function writeReplacing(target, buf) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  clearReadonly(target);
  fs.writeFileSync(target, buf);
}

/**
 * Chat 子目录是程序为了写 32/64 才可能新建的。
 * 还原后如果它空了，顺手删掉，不留我们造出来的空目录。
 */
function pruneEmptyChatDir(dir) {
  if (!dir) return false;
  try {
    if (path.basename(path.dirname(dir)) !== CHAT_SUBDIR) return false;
    if (fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      return true;
    }
  } catch {
    /* 目录不存在、非空、被占用都无所谓 */
  }
  return false;
}

// ─────────────────────────────────────────────── 备份 / 还原

/**
 * 备份当前状态（已存在备份则不动，保证它始终是官方原版）
 * @returns {object} 备份元数据
 */
function ensureBackup({ picturesDir, store, charId }) {
  if (store.has(charId)) return store.readMeta(charId);

  const files = {};
  for (const size of sizesFor(picturesDir, charId)) {
    const target = portraitPath(picturesDir, charId, size);
    const st = statOne(target);
    if (st.exists) {
      fs.mkdirSync(store.dirFor(charId), { recursive: true });
      const backupPath = store.fileFor(charId, size);
      fs.copyFileSync(target, backupPath);
      // Windows 的 copyFile 会把只读属性一起带过来，备份文件必须可写，否则以后删不掉
      clearReadonly(backupPath);
      files[size] = { state: 'backed', bytes: st.bytes, readonly: st.readonly };
    } else {
      files[size] = { state: 'absent' };
    }
  }

  const meta = { charId: String(charId), createdAt: Date.now(), files };
  store.writeMeta(charId, meta);
  return meta;
}

/** 用备份还原文件内容；keepReadonly 决定还原后是否继续锁只读 */
function restoreFromBackup({ picturesDir, store, charId, keepReadonly }) {
  const meta = store.readMeta(charId);
  const result = { restored: [], removed: [], problems: [] };
  if (!meta || !meta.files) return result;

  const sizes = Object.keys(meta.files)
    .map(Number)
    .sort((a, b) => a - b);

  for (const size of sizes) {
    const record = meta.files[size];
    if (!record) continue;
    const target = portraitPath(picturesDir, charId, size);

    if (record.state === 'backed') {
      const src = store.fileFor(charId, size);
      if (!fs.existsSync(src)) {
        result.problems.push(`${size}px 备份缺失`);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      clearReadonly(target); // 先摘只读，否则 Windows 上 copyFile 会 EPERM
      fs.copyFileSync(src, target);
      setReadonly(target, keepReadonly ? true : Boolean(record.readonly));
      result.restored.push(size);
    } else if (record.state === 'absent') {
      if (fs.existsSync(target)) {
        clearReadonly(target);
        fs.unlinkSync(target);
        result.removed.push(size);
      }
      pruneEmptyChatDir(path.dirname(target));
    }
  }
  return result;
}

// ─────────────────────────────────────────────── 对外操作

/**
 * 替换头像
 * @param {{picturesDir:string, store:import('./store').BackupStore, charId:string,
 *          images:Array<{size:number, buffer:Buffer|Uint8Array}>}} p
 */
function apply({ picturesDir, store, charId, images }) {
  const warnings = [];
  const hadBackupBefore = store.has(charId);

  // 1. 保证原图已备份（第一次替换时才写）
  ensureBackup({ picturesDir, store, charId });

  // 2. 写入
  const written = [];
  try {
    for (const size of SIZES) {
      const img = images.find((i) => Number(i.size) === size);
      const target = portraitPath(picturesDir, charId, size);

      if (img && img.buffer && img.buffer.length) {
        const buf = Buffer.from(img.buffer);
        if (!isJpeg(buf)) throw new Error(`${size}px 的数据不是合法 JPEG`);
        if (buf.length > 3 * 1024 * 1024) {
          warnings.push(`${size}px 体积偏大（${Math.round(buf.length / 1024)}KB）`);
        }
        writeReplacing(target, buf);
        setReadonly(target, true);
        written.push({ size, bytes: buf.length });
      } else {
        throw new Error(`${size}px 缺少图像数据`);
      }
    }
  } catch (e) {
    // 3. 失败即还原到调用前的状态
    try {
      restoreFromBackup({ picturesDir, store, charId, keepReadonly: true });
      if (!hadBackupBefore) store.drop(charId);
    } catch {
      /* ignore */
    }
    invalidateIndex();
    throw new Error(`写入失败，已自动还原：${e.message}`);
  }

  invalidateIndex();
  return { written, warnings };
}

/**
 * 恢复到默认：还原官方原图并解除只读
 * 没有备份时只解除只读（说明从未替换过）
 */
function restoreDefault({ picturesDir, store, charId }) {
  const had = store.has(charId);
  const result = had
    ? restoreFromBackup({ picturesDir, store, charId, keepReadonly: false })
    : { restored: [], removed: [], problems: [] };

  // 兜底：把当前存在的尺寸全部解除只读
  const unlocked = [];
  for (const size of sizesFor(picturesDir, charId)) {
    const p = portraitPath(picturesDir, charId, size);
    if (!fs.existsSync(p)) continue;
    clearReadonly(p);
    unlocked.push(size);
  }

  // Chat 子目录可能是我们建的，还原完空了就删掉
  pruneEmptyChatDir(chatDir(picturesDir, charId));

  if (had) store.drop(charId);
  store.prune();
  invalidateIndex();
  return { ...result, unlocked, hadBackup: had };
}

module.exports = {
  SIZES,
  portraitPath,
  listPortraits,
  readPortrait,
  apply,
  restoreDefault,
  ensureBackup,
  existingSizes,
  sizesFor,
  invalidateIndex,
  isReadonly,
  setReadonly,
  clearReadonly,
  statOne,
};
