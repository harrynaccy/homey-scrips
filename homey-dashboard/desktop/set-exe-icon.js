'use strict';
// Zet het pictogram en de programma-informatie in Homey Dashboard.exe.
// (Zonder Windows of Wine: met de JavaScript-bibliotheek "resedit".)
const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const data = fs.readFileSync(exe);
  const nt = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const rs = ResEdit.NtExecutableResource.from(nt);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(rs.entries);
  const id = groups.length ? groups[0].id : 1; const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(rs.entries, id, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(rs.entries)[0];
  if (vi) {
    const v = context.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1], v[2], 0, 1033); vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Homey Dashboard', FileDescription: 'Homey Dashboard', CompanyName: 'Ramon', InternalName: 'Homey Dashboard', OriginalFilename: 'Homey Dashboard.exe', LegalCopyright: 'Ramon' });
    vi.outputToResourceEntries(rs.entries);
  }
  rs.outputResource(nt);
  fs.writeFileSync(exe, Buffer.from(nt.generate()));
  console.log('  • pictogram en info gezet in', path.basename(exe));
};
