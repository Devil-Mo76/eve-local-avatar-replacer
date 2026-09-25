'use strict';
/**
 * preload.js —— 渲染层与主进程之间的安全桥
 * 渲染层只能调用这里显式暴露的方法，拿不到 Node 的任何能力。
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  /** 开发自检模式（会额外挂一个 window.__eveps 调试入口） */
  isDev: !!(process.env.EVEPS_EXEC || process.env.EVEPS_SHOT),

  scanEnv: (opts) => invoke('env:scan', opts || {}),
  selectServer: (root) => invoke('env:selectServer', root),
  pickFolder: () => invoke('env:pickFolder'),
  openFolder: (which) => invoke('env:openFolder', which),

  listCharacters: () => invoke('chars:list'),
  getThumb: (charId, size) => invoke('chars:thumb', { charId, size }),
  findCharacter: (query) => invoke('chars:find', query),

  applyPortrait: (payload) => invoke('portrait:apply', payload),
  restoreDefault: (charId) => invoke('portrait:restoreDefault', { charId }),

  getPrefs: () => invoke('prefs:get'),
  acceptDisclaimer: (neverShowAgain) => invoke('prefs:acceptDisclaimer', !!neverShowAgain),
  setLang: (lang) => invoke('prefs:setLang', lang),

  checkEve: () => invoke('eve:check'),

  pickImage: () => invoke('file:pickImage'),
  getReferenceImages: () => invoke('file:referenceImages'),

  /** 主进程轮询 EVE 进程状态后主动推送，返回取消订阅函数 */
  onEveStatus: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('eve:status', handler);
    return () => ipcRenderer.removeListener('eve:status', handler);
  },
});
