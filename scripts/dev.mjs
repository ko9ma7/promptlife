import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res)=>{
  let path = decodeURIComponent((req.url||'/').split('?')[0]);
  if(path==='/') path='/index.html';
  let file=normalize(join(root,path));
  if(!file.startsWith(root)){res.writeHead(403).end('Forbidden');return;}
  try{ const s=await stat(file); if(s.isDirectory())file=join(file,'index.html'); }
  catch{ file=normalize(join(root,'public',path)); }
  try{ const body=await readFile(file); res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body); }
  catch{ res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(join(root,'public','404.html'))); }
}).listen(port,()=>console.log(`PromptLife dev server: http://localhost:${port}`));
