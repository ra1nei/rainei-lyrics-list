import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { slug } from 'github-slugger';
const root = process.cwd();
const entries = [];
const seriesRoot = path.join(root, 'src/content/series');
for (const file of await fs.readdir(seriesRoot)) {
  if (!file.endsWith('.yaml')) continue;
  const data = yaml.load(await fs.readFile(path.join(seriesRoot,file),'utf8'));
  const id = file.replace(/\.yaml$/,'');
  const anilistId=Number(data.cover?.match(/\/b[xs](\d+)-/)?.[1])||undefined;
  entries.push({ id,kind:'series',parent_id:null,data:{title:data.romaji,vietnamese:data.vietnamese,year:data.year,cover:data.cover,titles:{romaji:data.romaji},legacyId:id,anilistId} });
}
async function walk(dir) {
  for (const item of await fs.readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()){await walk(file);continue;}
    if(!file.endsWith('.mdx'))continue;
    const raw=await fs.readFile(file,'utf8');const match=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if(!match)throw new Error(`Invalid frontmatter: ${file}`);
    const data=yaml.load(match[1]);const relative=path.relative(path.join(root,'src/content/songs'),file).replaceAll('\\','/');
    // Match Astro's glob loader: GitHub slug each path segment independently.
    const id=relative.replace(/\.mdx$/,'').split('/').map(s=>slug(s)).join('/');
    const parts=id.split('/');const parent_id=parts[0];
    let poster='';
    if(data.poster){
      const source=path.resolve(path.dirname(file),data.poster);
      const destination=`imported-posters/${parent_id}/${path.basename(source).replace(/\s+/g,'-')}`;
      await fs.mkdir(path.join(root,'public',path.dirname(destination)),{recursive:true});
      await fs.copyFile(source,path.join(root,'public',destination));
      poster=`/rainei-lyrics-list/${destination}`;
    }
    entries.push({id,kind:'song',parent_id,data:{title:data.title,artist:data.artist||'',type:data.type||'MISC',group:parts[1]||'99_misc',order:data.order??Number(parts.at(-1).match(/^(\d+)_/)?.[1]||999),video:data.video||'',poster,body:match[2],date:data.date||null}});
  }
}
await walk(path.join(root,'src/content/songs'));
await fs.mkdir(path.join(root,'migration'),{recursive:true});
await fs.writeFile(path.join(root,'migration/legacy.json'),JSON.stringify(entries,null,2));
console.log(`Exported ${entries.filter(e=>e.kind==='series').length} anime and ${entries.filter(e=>e.kind==='song').length} songs to migration/legacy.json. Not publicly published.`);
