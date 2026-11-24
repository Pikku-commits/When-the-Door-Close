import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const client=await build({entryPoints:['src/app.jsx'],bundle:true,write:false,minify:true,define:{'process.env.NODE_ENV':'"production"'},target:'es2021'});
const assets=Object.fromEntries(await Promise.all([['html','src/index.html'],['css','src/journal.css']].map(async ([name,path])=>[name,await readFile(path,'utf8')])));
assets.client=client.outputFiles[0].text;
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',target:'es2022',outfile:'dist/server/index.js',plugins:[{name:'embed-journal-assets',setup(plugin){
 plugin.onResolve({filter:/^\.\/generated\//},args=>({path:args.path.split('/').at(-1).replace('.js',''),namespace:'journal'}));
 plugin.onLoad({filter:/.*/,namespace:'journal'},args=>({contents:JSON.stringify(assets[args.path]),loader:'json'}));
}}]});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
