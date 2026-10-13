// electron-builder's own icon/metadata step needs symlink rights Windows may not grant, so the Windows exe is stamped here with rcedit instead.
const path = require('path');
module.exports = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const { rcedit } = await import('rcedit');
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  await rcedit(exe, {
    icon: path.join(context.packager.projectDir, 'assets', 'icon.ico'),
    'version-string': { ProductName: 'epic AI', FileDescription: 'epic AI', CompanyName: 'oeper', LegalCopyright: 'oeper' },
    'file-version': context.packager.appInfo.version, 'product-version': context.packager.appInfo.version,
  });
};
