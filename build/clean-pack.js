'use strict';
// 打包后清理：备份目录属于运行时数据，绝不能进入发行包
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) process.exit(0);

for (const name of fs.readdirSync(dist)) {
  const base = path.join(dist, name);
  if (!fs.statSync(base).isDirectory()) continue;
  for (const rel of [
    'PortraitBackups',
    '原游戏头像备份',
    path.join('resources', 'app', 'PortraitBackups'),
    path.join('resources', 'app', '原游戏头像备份'),
  ]) {
    fs.rmSync(path.join(base, rel), { recursive: true, force: true });
  }
}
console.log('pack cleanup: backup dirs removed from dist');
