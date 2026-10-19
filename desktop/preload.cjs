'use strict';
const { contextBridge } = require('electron');
const argument = process.argv.find((value) => value.startsWith('--woof-public-config='));
if (argument) {
  const config = JSON.parse(decodeURIComponent(argument.slice('--woof-public-config='.length)));
  contextBridge.exposeInMainWorld('woofDesktop', Object.freeze({
    apiUrl: config.apiUrl,
    uploadApiUrl: config.uploadApiUrl,
    realtimeUrl: config.realtimeUrl,
  }));
}
