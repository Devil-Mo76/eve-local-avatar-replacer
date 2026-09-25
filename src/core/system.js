'use strict';
/**
 * system.js —— 环境探测（EVE 是否在运行、目录是否可写）
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * EVE 相关进程名
 *
 * 实测（Steam / Squirrel 版，2026-09）：
 *   exefile.exe      游戏客户端本体（<EVE安装目录>\tq\bin64\exefile.exe）
 *   eve-online.exe   新版启动器（Steam 版由 Squirrel 升级到 app-<版本>\ 下）
 *   evelauncher.exe  旧版启动器
 *
 * 客户端会占用缓存文件，替换前应当关闭。
 */
const CLIENT_PROCESSES = ['exefile.exe'];
const LAUNCHER_PROCESSES = ['eve-online.exe', 'evelauncher.exe'];

function listProcessNames() {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FO', 'CSV', '/NH'],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve([]);
        const names = [];
        for (const line of String(stdout).split(/\r?\n/)) {
          const m = /^"([^"]+)"/.exec(line.trim());
          if (m) names.push(m[1].toLowerCase());
        }
        resolve(names);
      }
    );
  });
}

/**
 * @returns {Promise<{running:boolean, client:boolean, launcher:boolean, matches:string[]}>}
 */
async function checkEveRunning() {
  const names = await listProcessNames();
  const has = (list) => list.filter((p) => names.includes(p));
  const client = has(CLIENT_PROCESSES);
  const launcher = has(LAUNCHER_PROCESSES);
  return {
    running: client.length > 0 || launcher.length > 0,
    client: client.length > 0,
    launcher: launcher.length > 0,
    matches: [...client, ...launcher],
  };
}

/** 目录可写性检测（真的写一个临时文件再删掉） */
function isWritableDir(dir) {
  const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    try {
      fs.unlinkSync(probe);
    } catch {
      /* ignore */
    }
    return false;
  }
}

module.exports = { checkEveRunning, isWritableDir, CLIENT_PROCESSES, LAUNCHER_PROCESSES };
