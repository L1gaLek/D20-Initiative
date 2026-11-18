// Build a local, self-contained Windows folder from pinned external runtimes.
// No credentials, backend files, player data or development caches are copied.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const at=s.indexOf('=');return [s.slice(0,at),s.slice(at+1)];}));
const destination=path.resolve(args['--output']||path.join(ROOT,'..','D20 Studio'));
const electron=path.resolve(args['--electron']||''),blender=path.resolve(args['--blender']||'');
if(!fs.existsSync(path.join(electron,'electron.exe')))throw Error('Specify --electron=/path/to/electron/dist');
if(!fs.existsSync(path.join(blender,'blender.exe')))throw Error('Specify --blender=/path/to/portable-blender');
if(destination===ROOT||ROOT.startsWith(destination+path.sep)||destination.startsWith(ROOT+path.sep))throw Error('Use a separate output folder outside the repository.');
if(fs.existsSync(destination)&&!fs.existsSync(path.join(destination,'D20-Studio-build.json')))throw Error('The destination already exists and is not a D20 Studio build.');
fs.mkdirSync(destination,{recursive:true});
const copy=(from,to)=>fs.cpSync(from,to,{recursive:true,force:true,dereference:false});
const marker=path.join(destination,'D20-Studio-build.json');
fs.writeFileSync(marker,JSON.stringify({product:'D20 Studio',version:'0.2.0',status:'building'},null,2));
copy(electron,destination);
fs.renameSync(path.join(destination,'electron.exe'),path.join(destination,'D20 Studio.exe'));
if(fs.existsSync(path.join(destination,'electron_wer.dll')))fs.renameSync(path.join(destination,'electron_wer.dll'),path.join(destination,'D20 Studio_wer.dll'));
const appRoot=path.join(destination,'resources','app');fs.mkdirSync(appRoot,{recursive:true});
for(const relative of ['studio','vendor/three','assets/models','assets/materials','client/board-3d','client/avatar-data.js','equipment_srd5_ru.json'])copy(path.join(ROOT,relative),path.join(appRoot,relative));
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'studio/package.json')));manifest.main='studio/main.cjs';
fs.writeFileSync(path.join(appRoot,'package.json'),JSON.stringify(manifest,null,2));
copy(blender,path.join(destination,'Tools','Blender'));
if(fs.existsSync(path.join(ROOT,'studio/README.ru.md')))copy(path.join(ROOT,'studio/README.ru.md'),path.join(destination,'НАЧНИТЕ ЗДЕСЬ.md'));
const files={};function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else{const name=path.relative(appRoot,file).replace(/\\/g,'/');files[name]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}}scan(appRoot);
fs.writeFileSync(marker,JSON.stringify({product:'D20 Studio',version:'0.2.0',built:new Date().toISOString(),electron:fs.readFileSync(path.join(electron,'version'),'utf8').trim(),blender:path.basename(blender),files},null,2));
console.log(JSON.stringify({folder:destination,executable:path.join(destination,'D20 Studio.exe'),files:Object.keys(files).length}));
