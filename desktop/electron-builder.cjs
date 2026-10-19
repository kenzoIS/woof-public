module.exports = {
  appId: 'com.woof.analytics', productName: 'WOOF',
  directories: { output: 'release', buildResources: 'resources' },
  files: ['main.cjs', 'preload.cjs', 'lib/*.cjs', '!lib/*.test.cjs', 'renderer/**/*', 'desktop-config.json', 'resources/icon.png', 'package.json'],
  asar: true,
  artifactName: 'WOOF-${version}-${os}-${arch}.${ext}',
  mac: { target: ['dmg', 'zip'], category: 'public.app-category.business', icon: 'resources/icon.png', identity: process.env.CSC_LINK ? undefined : null, hardenedRuntime: true },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'resources/icon.png' },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false, createDesktopShortcut: true, createStartMenuShortcut: true, deleteAppDataOnUninstall: false },
};
