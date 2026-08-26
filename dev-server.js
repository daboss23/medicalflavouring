'use strict';

/* Local sandbox for the whole purchase experience.
   Serves the site and routes /api/* to the same handlers Vercel runs, so a test
   purchase here exercises the real checkout and thank-you code paths.

     STRIPE_SECRET_KEY=sk_test_... node dev-server.js
     (or put the key in .env.local, which git ignores)

   Use a TEST key. The server refuses to start with a live one. */

const http=require('http');
const fs=require('fs');
const path=require('path');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||3000);

const TYPES={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.ico':'image/x-icon'
};

/* Minimal .env.local reader — no dependency, only KEY=value lines. */
function loadEnvFile(){
  const file=path.join(ROOT,'.env.local');
  if(!fs.existsSync(file)) return;
  fs.readFileSync(file,'utf8').split(/\r?\n/).forEach(function(line){
    const match=/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if(!match) return;
    const value=match[2].replace(/^['"]|['"]$/g,'');
    if(!process.env[match[1]]) process.env[match[1]]=value;
  });
}

function readBody(req){
  return new Promise(function(resolve){
    let raw='';
    req.on('data',function(chunk){ raw+=chunk; });
    req.on('end',function(){
      if(!raw) return resolve({});
      try{ resolve(JSON.parse(raw)); }catch(error){ resolve(raw); }
    });
  });
}

async function serveApi(req,res,name){
  const file=path.join(ROOT,'api',name+'.js');
  if(!fs.existsSync(file)){
    res.statusCode=404;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({error:'No such endpoint: /api/'+name}));
  }
  /* Re-require each time so edits to the handlers take effect without a restart. */
  delete require.cache[require.resolve(file)];
  const handler=require(file);
  const url=new URL(req.url,'http://localhost');
  req.query=Object.fromEntries(url.searchParams);
  if(req.method==='POST') req.body=await readBody(req);
  try{
    await handler(req,res);
  }catch(error){
    console.error('  ! handler threw:',error&&error.message);
    if(!res.headersSent){
      res.statusCode=500;
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({error:'Handler error: '+(error&&error.message)}));
    }
  }
}

function serveStatic(req,res,pathname){
  let rel=decodeURIComponent(pathname);
  if(rel==='/') rel='/index.html';
  const file=path.join(ROOT,rel);
  /* Never serve outside the project, or the secrets beside it. */
  if(!file.startsWith(ROOT)||/(^|[\\/])\.(env|git)/.test(rel)){
    res.statusCode=403;
    return res.end('Forbidden');
  }
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){
    res.statusCode=404;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<h1>404</h1><p>No file at '+rel+'</p>');
  }
  res.statusCode=200;
  res.setHeader('Content-Type',TYPES[path.extname(file).toLowerCase()]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  fs.createReadStream(file).pipe(res);
}

loadEnvFile();

const key=process.env.STRIPE_SECRET_KEY||'';
if(!key){
  console.error('\n  STRIPE_SECRET_KEY is not set.\n');
  console.error('  Put your Stripe TEST secret key in .env.local:');
  console.error('      STRIPE_SECRET_KEY=sk_test_...\n');
  console.error('  Find it at https://dashboard.stripe.com/test/apikeys\n');
  process.exit(1);
}
if(key.startsWith('sk_live_')){
  console.error('\n  That is a LIVE key. This sandbox refuses to run with it —');
  console.error('  a purchase here would charge a real card.\n');
  console.error('  Use the test key from https://dashboard.stripe.com/test/apikeys\n');
  process.exit(1);
}

http.createServer(function(req,res){
  const url=new URL(req.url,'http://localhost');
  const api=/^\/api\/([A-Za-z0-9-]+)$/.exec(url.pathname);
  console.log(req.method+' '+url.pathname+(url.search||''));
  if(api) return serveApi(req,res,api[1]);
  return serveStatic(req,res,url.pathname);
}).listen(PORT,function(){
  console.log('\n  ORA sandbox running in Stripe TEST mode');
  console.log('  ------------------------------------------------');
  console.log('  Shop            http://localhost:'+PORT+'/');
  console.log('  Thank-you page  reached automatically after paying');
  console.log('');
  console.log('  Test card  4242 4242 4242 4242 — any future expiry, any CVC');
  console.log('  Declined   4000 0000 0000 0002');
  console.log('');
  console.log('  Stop with Ctrl+C\n');
});
