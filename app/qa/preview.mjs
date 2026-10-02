// Isolated visual QA: real screen components with sample data; never sends payments.
// npm install --prefix /tmp/kitty-ui-preview react@19.2.3 react-dom@19.2.3 react-native-web esbuild sharp
// node app/qa/preview.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = '/tmp/kitty-ui-preview';
const require = createRequire(`${temp}/package.json`);
const { context } = require('esbuild');
const out = `${temp}/public`;
mkdirSync(out, { recursive: true });
const mocks = {
  'expo-haptics': `export const ImpactFeedbackStyle={Light:0}; export const NotificationFeedbackType={Success:0,Error:1}; export const impactAsync=async()=>{}; export const notificationAsync=async()=>{}; export const selectionAsync=async()=>{};`,
  'expo-clipboard': `export const setStringAsync=async()=>{}; export const getStringAsync=async()=>'';`,
  '@react-navigation/native': `import {useEffect} from 'react'; export const useFocusEffect=(fn)=>useEffect(fn,[fn]);`,
  'react-native-safe-area-context': `export {View as SafeAreaView} from 'react-native';`,
  'session': `export const useSession=()=>({status:'new',profile:{name:'Ama Mensah'},create:async()=>{},unlock:async()=>{},forget:()=>{},lock:()=>{}}); export const useSigner=()=>({address:'0x1111111111111111111111111111111111111111'});`,
  'config': `export const siteUrl='https://kitty-circle.vercel.app'; export const apiUrl=siteUrl; export const rpId='kitty-circle.vercel.app'; export const contracts={chainId:10143};`,
  'store': `export const refs=[{address:'0x2222222222222222222222222222222222222222',title:'Market women’s circle',names:['Ama','Abena','Efua','Akosua','Yaa'],seat:0,organizer:true},{address:'0x3333333333333333333333333333333333333333',title:'Family savings',names:['Ama','Kofi','Esi'],seat:0}]; export const listCircles=async()=>new URLSearchParams(location.search).has('empty')?[]:refs; export const getCircle=async()=>refs[0]; export const getInviteKeys=async()=>null; export const saveCircle=async()=>{}; export const saveInviteKeys=async()=>{};`,
};
const kittySource=readFileSync(`${app}/src/kitty.ts`,'utf8');
const pure=kittySource.slice(kittySource.indexOf('const MIN ='), kittySource.indexOf('/** FR-JOIN-03'));
mocks.kitty = `${pure}
export const cadenceOf=()=> 'weekly';
export const CREATE_STEPS=[{id:'create',label:'Create circle'},{id:'approve',label:'Approve payment'},{id:'deposit',label:'Put down deposit'}];
export const JOIN_STEPS=CREATE_STEPS;
export const balanceOf=async()=>{ if(new URLSearchParams(location.search).has('offline'))throw Error('offline'); return 75000000n; };
export const getTestDollars=async()=>{};
export const loadSnapshot=async(address)=>{
if(new URLSearchParams(location.search).has('offline'))throw Error('Network unavailable');
const now=Math.floor(Date.now()/1000);const forming=address.includes('3333'); const state=new URLSearchParams(location.search).get('state');
return {address,state:state || (forming?'forming':'active'),rules:{memberCount:5,stakeBps:10000,maxBidBps:3000,poolShareBps:1000,holdbackBps:2000,contribution:10000000n,period:604800,commitWindow:172800,revealWindow:43200,grace:86400,firstDue:BigInt(now+172800),joinDeadline:BigInt(now+86400)},round:2,organizer:'0x1111111111111111111111111111111111111111',pot:30000000n,due:now+172800,chainNow:now,members:Array.from({length:5},(_,seat)=>({seat,address:forming&&seat>1?null:'0x'+String(seat+1).repeat(40),standing:'good',received:seat===1,arrears:0n,credit:0n,paid:seat>0&&seat<4,revealed:false})),recipients:[null,null,null,null,null],me:{seat:0,pay:10000000n,creditUsed:0n,holdbackReleased:0n,commitment:'0x'+'0'.repeat(64),revealedBps:0,withdrawable:0n,balance:75000000n}};
};
export const createCircle=async()=>{};export const joinAsOrganizer=async()=>{};export const joinCircle=async()=>{};
export const cancelCircle=async()=>{};export const closeRound=async()=>{};export const contribute=async()=>{};export const payArrears=async()=>{};export const revealBid=async()=>0;export const withdraw=async()=>{};export const commitBid=async()=>{};
`;
mocks['@react-native-community/slider']=`import React from 'react'; export default function Slider(p){return <input aria-label={p.accessibilityLabel} type="range" min={p.minimumValue} max={p.maximumValue} step={p.step} value={p.value} onChange={e=>p.onValueChange(Number(e.target.value))}/>;}`;
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
${['Home','Welcome','Circle','Create','Me','Paste','Bid','Join'].map(n=>`import {${n}Screen} from '${app}/src/screens/${n}Screen';`).join('\n')}
function Preview(){const [route,setRoute]=useState({name:new URLSearchParams(location.search).get('screen')||'Home',params:{address:'0x2222222222222222222222222222222222222222',round:2}}); const navigation={navigate:(name,params={})=>setRoute({name,params}),replace:(name,params={})=>setRoute({name,params}),goBack:()=>setRoute({name:'Home',params:{}})}; const screens={Home:HomeScreen,Welcome:WelcomeScreen,Circle:CircleScreen,Create:CreateScreen,Me:MeScreen,Paste:PasteScreen,Bid:BidScreen,Join:JoinScreen};const Component=screens[route.name];return <Component navigation={navigation} route={route}/>;}createRoot(document.getElementById('root')).render(<Preview/>);`;
const fonts=[['figtree','400Regular','Figtree_400Regular'],['figtree','500Medium','Figtree_500Medium'],['figtree','700Bold','Figtree_700Bold'],['bricolage-grotesque','700Bold','BricolageGrotesque_700Bold'],['bricolage-grotesque','800ExtraBold','BricolageGrotesque_800ExtraBold']];
let fontCss='';
for(const [pkg,folder,name] of fonts){copyFileSync(`${app}/node_modules/@expo-google-fonts/${pkg}/${folder}/${name}.ttf`,`${out}/${name}.ttf`);fontCss+=`@font-face{font-family:${name};src:url('/${name}.ttf')}`;}
writeFileSync(`${out}/index.html`,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitty · Sample data preview</title><style>${fontCss}*{box-sizing:border-box}body{margin:0;background:#F8F6F7}#root{height:100dvh;display:flex;flex-direction:column}button:focus-visible,[role=button]:focus-visible,[role=radio]:focus-visible{outline:3px solid #AD245F;outline-offset:3px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
const ctx=await context({stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,outfile:`${out}/bundle.js`,jsx:'automatic',nodePaths:[`${temp}/node_modules`,`${app}/node_modules`],loader:{'.png':'file'},define:{'process.env.NODE_ENV':'"development"','process.env.EXPO_PUBLIC_RPC_URL':'undefined','__DEV__':'true'},plugins:[{name:'preview-adapters',setup(build){build.onResolve({filter:/.*/},args=>{const key=Object.keys(mocks).find(k=>args.path===k||args.path.endsWith('/'+k));if(key)return {path:key,namespace:'mock'};if(args.path==='react-native')return {path:require.resolve('react-native-web')};if(args.path==='react'||args.path.startsWith('react/'))return {path:require.resolve(args.path)};});build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:app}));}}]});
await ctx.watch();const server=await ctx.serve({servedir:out,host:'127.0.0.1',port:4174});console.log(`Kitty sample preview: http://127.0.0.1:${server.port}`);
