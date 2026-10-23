import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
function run(command, args, cwd = process.cwd()) {
  const r = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
run('npm', ['run', 'build:frontend']);
for (const name of ['assets','scenario-lab','dashboard']) rmSync(`hosting/public/${name}`, {recursive:true,force:true});
mkdirSync('hosting/public/dashboard', {recursive:true});
cpSync('dist/index.html','hosting/public/dashboard/index.html');
cpSync('dist/assets','hosting/public/assets',{recursive:true});
cpSync('dist/scenario-lab','hosting/public/scenario-lab',{recursive:true});
run('npm',['run','build'], `${process.cwd()}/hosting`);
rmSync('dist',{recursive:true,force:true});
cpSync('hosting/dist','dist',{recursive:true});
