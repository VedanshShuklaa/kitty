#!/usr/bin/env node
// Deterministic local export. No network requests, account access, or payment calls.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const help = `Kitty motion renderer — run from the repository root
  node docs/demo/render.mjs [options]
  --out PATH       New MP4 path (default output/kitty-motion.mp4; never overwrites)
  --width NUMBER   Even frame width (default 1280)
  --height NUMBER  Even frame height (default 720; taller than width selects portrait)
  --fps NUMBER     Frames per second, 1–60 (default 30)
  --duration SEC   First 1–90 seconds (default 90)
  --help           Print this help without loading dependencies

Install tools separately from the app:
  npm install --prefix /tmp/kitty-motion-tools playwright
  /tmp/kitty-motion-tools/node_modules/.bin/playwright install chromium
FFmpeg must be on PATH. Preview HTML needs no installation.
KITTY_PLAYWRIGHT_ROOT may point to an existing node_modules folder.
KITTY_BROWSER_EXECUTABLE may point to an installed Chrome/Chromium binary.
The exporter writes MP4 plus matching SRT and VTT files beside it.
No audio is generated. Render duration depends on your computer.`;
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(help); process.exit(0); }
const values = { out:'output/kitty-motion.mp4', width:1280, height:720, fps:30, duration:90 };
for (let i=0; i<args.length; i+=2) {
  const key=args[i].replace(/^--/,'');
  if (!Object.hasOwn(values,key) || !args[i].startsWith('--') || !args[i+1]) throw new Error(`Unknown or incomplete option: ${args[i]}. Use --help.`);
  values[key] = key==='out' ? args[i+1] : Number(args[i+1]);
}
const {width,height,fps,duration}=values;
if (![width,height].every(n=>Number.isInteger(n)&&n>=240&&n<=3840&&n%2===0)) throw new Error('Width/height must be even integers between 240 and 3840.');
if (!Number.isInteger(fps)||fps<1||fps>60||!Number.isFinite(duration)||duration<1||duration>90) throw new Error('Use fps 1–60 and duration 1–90 seconds.');
const output=resolve(values.out);
if(extname(output).toLowerCase()!=='.mp4')throw new Error('--out must end in .mp4.');
const stem=output.slice(0,-4);
if([output,`${stem}.srt`,`${stem}.vtt`].some(existsSync))throw new Error('An output file already exists. Choose a new --out name; approved exports are never overwritten.');
if(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0)throw new Error('FFmpeg is missing from PATH. See docs/demo/production.html.');
const localRequire=createRequire(import.meta.url);
let chromium;
try { ({chromium}=localRequire('playwright')); }
catch {
  const root=process.env.KITTY_PLAYWRIGHT_ROOT || (existsSync('/tmp/kitty-motion-tools/node_modules/playwright') ? '/tmp/kitty-motion-tools/node_modules' : '/tmp/kitty-ui-preview/node_modules');
  try { ({chromium}=localRequire(resolve(root,'playwright'))); }
  catch {throw new Error(`Playwright not found. See --help, or set KITTY_PLAYWRIGHT_ROOT to your node_modules folder.`);}
}
const here=dirname(fileURLToPath(import.meta.url));
const target=pathToFileURL(resolve(here,'animatic.html'));
target.search=new URLSearchParams({render:'1',format:height>width?'tall':'wide'}).toString();
const executablePath=process.env.KITTY_BROWSER_EXECUTABLE || (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
let browser,encoder,encoderDone;
let encoderError=null, stderr='';
try {
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'no-preference'});
  await page.route(/^https?:/,route=>route.abort());
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(target.href);
  await page.evaluate(()=>window.kittyReady);
  const scenes=await page.evaluate(()=>window.KITTY_TIMELINE);
  if(pageErrors.length)throw new Error(pageErrors.join('\n'));
  await mkdir(dirname(output),{recursive:true});
  encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe']});
  encoder.stderr.on('data',d=>{stderr=(stderr+d).slice(-6000);});
  encoder.stdin.on('error',e=>{encoderError=e;});
  encoderDone=new Promise(resolve=>{encoder.on('error',e=>{encoderError=e;resolve(-1);});encoder.on('close',resolve);});
  const frames=Math.round(duration*fps), start=Date.now();
  for(let frame=0;frame<frames;frame++){
    if(encoderError || encoder.exitCode!==null)throw new Error(`FFmpeg stopped: ${stderr || encoderError?.message}`);
    await page.evaluate(t=>window.setKittyTime(t),frame/fps);
    const buffer=await page.screenshot({type:'jpeg',quality:94,animations:'disabled'});
    if(!encoder.stdin.write(buffer))await once(encoder.stdin,'drain');
    if(frame%Math.max(1,fps*5)===0)console.log(`Frame ${frame}/${frames} · ${(frame/fps).toFixed(1)}s of film · ${Math.round((Date.now()-start)/1000)}s elapsed`);
  }
  encoder.stdin.end();
  if(await encoderDone!==0)throw new Error(`FFmpeg failed: ${stderr}`);
  if(pageErrors.length)throw new Error(pageErrors.join('\n'));
  const stamp=(sec,sep)=>{const ms=Math.round(sec*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${sep}${String(ms%1000).padStart(3,'0')}`;};
  const cues=[];
  for(const scene of scenes){
    if(scene.start>=duration)break;
    const sentences=scene.caption.match(/[^.!?]+[.!?]+/g)||[scene.caption];
    const weights=sentences.map(s=>s.trim().split(/\s+/).length), total=weights.reduce((a,b)=>a+b,0);
    let time=scene.start;
    sentences.forEach((sentence,i)=>{const end=time+(scene.end-scene.start)*weights[i]/total;if(time<duration)cues.push({start:time,end:Math.min(duration,end),text:sentence.trim()});time=end;});
  }
  const subtitles=sep=>cues.map((c,i)=>`${i+1}\n${stamp(c.start,sep)} --> ${stamp(c.end,sep)}\n${c.text}\n`).join('\n');
  await writeFile(`${stem}.srt`,subtitles(','),{flag:'wx'});
  await writeFile(`${stem}.vtt`,'WEBVTT\n\n'+subtitles('.'),{flag:'wx'});
  console.log(`Saved ${output}\n${frames} frames, ${fps} fps, ${width}×${height}; silent with embedded text. Matching SRT/VTT saved.`);
} finally {
  if(encoder && encoder.exitCode===null)encoder.kill('SIGTERM');
  if(browser)await browser.close();
}
