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
const port = Number(process.env.KITTY_PREVIEW_PORT || 4174);
const out = `${temp}/public${port === 4174 ? '' : `-${port}`}`;
mkdirSync(out, { recursive: true });
const mocks = {
  'expo-haptics': `export const ImpactFeedbackStyle={Light:0}; export const NotificationFeedbackType={Success:0,Error:1}; export const impactAsync=async()=>{}; export const notificationAsync=async()=>{}; export const selectionAsync=async()=>{};`,
  'expo-clipboard': `export const setStringAsync=async()=>{}; export const getStringAsync=async()=>'';`,
  '@react-navigation/native': `import {useEffect,createContext} from 'react'; export const useFocusEffect=(fn)=>useEffect(fn,[fn]); export const NavigationContext=createContext(undefined);`,
  'react-native-safe-area-context': `export {View as SafeAreaView} from 'react-native';`,
  'session': `const restored={indexerDown:false}; const signer={address:'0x1111111111111111111111111111111111111111'}; const q=new URLSearchParams(location.search); export const useSession=()=>({status:q.has('returning')?'locked':'ready',profile:{name:q.has('longName')?'Alexandria Montgomery':'Host',catName:'Mimi'},nameCat:async()=>{},restore:async()=>{},restored,create:async()=>{},unlock:async()=>{},forget:()=>{},lock:()=>{}}); export const useMe=()=>({...signer,signer,need:async()=>signer,confirm:async()=>signer}); export const useSigner=()=>signer;`,
  'config': `export const siteUrl='https://kitty-circle.vercel.app'; export const apiUrl=siteUrl; export const rpId='kitty-circle.vercel.app'; export const contracts={chainId:10143};`,
  'store': `export const refs=[{address:'0x2222222222222222222222222222222222222222',title:'Friday Circle',names:['Host','Friend A','Friend B','Friend C','Friend D'],seat:0,organizer:true},{address:'0x3333333333333333333333333333333333333333',title:'Weekend Circle',names:['Host','Friend A','Friend B'],seat:0}]; export const listCircles=async()=>new URLSearchParams(location.search).has('empty')?[]:refs; export const getCircle=async()=>refs[0]; export const getInviteKeys=async()=>null; export const saveCircle=async()=>{}; export const saveInviteKeys=async()=>{}; let showCat=true; export const getShowCat=async()=>showCat; export const setShowCat=async(on)=>{showCat=on}; export const markFed=async()=>{}; export const takeFed=async()=>new URLSearchParams(location.search).has('fed')?'onTime':null;`,
};
mocks.money=`export const parsePayee=(t)=>/[/]p[/](0x[0-9a-fA-F]{40})/.test(t||'')?{address:t.match(/0x[0-9a-fA-F]{40}/)[0],name:null}:null; export const parseSendLink=(t)=>/[/]s[/]/.test(t||'')?{address:'0x4444444444444444444444444444444444444444',key:'0x'+'22'.repeat(32),from:'Friend A'}:null; export const balances=async()=>{if(new URLSearchParams(location.search).has('offline'))throw Error('offline');return {dollars:75000000n,cashOut:new URLSearchParams(location.search).has('cashOut')?15000000n:0n}};
export class SendFailed extends Error{}; export const payLink=(who,name)=>'https://kitty-circle.vercel.app/p/'+who+'#n='+encodeURIComponent(name);
const settled={hash:'0x'+'ab'.repeat(32),block:1n,ms:1640,afterSigning:820};
export const sendLinks=async()=>new URLSearchParams(location.search).has('links')?[{n:0,key:'0x'+'33'.repeat(32),balance:5000000n},{n:1,key:'0x'+'44'.repeat(32),balance:12500000n}]:[];
export const convert=async()=>settled; export const claimLink=async()=>({amount:5000000n,settled}); export const linkBalance=async()=>{const q=new URLSearchParams(location.search);return q.has('collected')?0n:5000000n};
export const createSendLink=async()=>({url:'https://kitty-circle.vercel.app/s/#k=x',settled}); export const sendMoney=async()=>settled;`;
mocks['expo-camera']=`import React from 'react';import {View} from 'react-native'; export const useCameraPermissions=()=>{const q=new URLSearchParams(location.search);return [q.has('camera')?{granted:true,canAskAgain:true}:q.has('cameraOff')?{granted:false,canAskAgain:false}:{granted:false,canAskAgain:true},async()=>{}]}; export const CameraView=({style})=><View style={[style,{backgroundColor:'#32232D'}]}/>;`;
mocks.chain=`export const explorerTx=(h)=>'https://testnet.monadvision.com/tx/'+h; export const explorerAddress=(a)=>'https://testnet.monadvision.com/address/'+a;`;
mocks.fx=`export const loadRates=async()=>null; export const localEstimate=()=>null;`;
mocks.indexer=`const down=()=>{if(new URLSearchParams(location.search).has('offline'))throw Error('offline')}; export const transfersOf=async()=>[]; export const feedOf=async()=>[]; export const earnRate=async()=>null; export const housePiecesOf=async()=>{down();return 4}; export const recordOf=async()=>null; export const catRecordOf=async()=>{down();return {keepsakes:new Set(['Yarn','Wand','Fish']),streak:3,bestStreak:3}}; export const albumOf=async()=>[]; export const membersOf=async()=>[{circle:'0x2222222222222222222222222222222222222222',seat:1,address:'0x2222222222222222222222222222222222222222'},{circle:'0x2222222222222222222222222222222222222222',seat:2,address:'0x3333333333333333333333333333333333333333'},{circle:'0x2222222222222222222222222222222222222222',seat:3,address:'0x4444444444444444444444444444444444444444'}];`;
mocks.tidy=`export const tidyStep=()=>null; export const tidyCircle=async()=>null;`;
mocks.restore=`export const syncCircle=async()=>{}; export const rosterKeyHex=()=>'';`;
mocks.reminders=`export const remindersFor=()=>[]; export const syncReminders=async()=>{}; export const syncFromSnapshot=async()=>{};`;
mocks['@expo/vector-icons/Ionicons']=`import React from 'react';import {Text} from 'react-native'; import glyphs from '${app}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'; const Ionicons=({name,size,color})=><Text aria-hidden style={{fontFamily:'Ionicons',fontSize:size,color}}>{String.fromCodePoint(glyphs[name]||32)}</Text>; export default Ionicons;`;
const kittySource=readFileSync(`${app}/src/kitty.ts`,'utf8');
const pure=kittySource.slice(kittySource.indexOf('const MIN ='), kittySource.indexOf('/** FR-JOIN-03'));
mocks.kitty = `${pure}
export const readStanding=async()=>{const q=new URLSearchParams(location.search); if(q.has('offline')||q.has('standingError'))throw Error('offline');const stage=q.get('stage')||'Friendly';return {stage,points:{Away:-300,Wary:-100,Shy:0,Friendly:160,AtHome:350,Family:650}[stage],debt:stage==='Away'?6000000n:0n,onTimeBps:10000,people:4,biggestClean:10000000n,open:1}};
export const inviteKeyFor=()=> '0x'+'11'.repeat(32); export const adoptCat=async()=>{}; export const repay=async()=>{}; export const joinTerms=async()=>({depositX100:100,stage:'Shy',offerFrom:1,capRounds:1,maxOpen:2});
export const cadenceOf=()=> 'weekly';
export const CREATE_STEPS=[{id:'create',label:'Create circle'},{id:'approve',label:'Approve payment'},{id:'deposit',label:'Put down deposit'}];
export const JOIN_STEPS=CREATE_STEPS;
export const balanceOf=async()=>{ if(new URLSearchParams(location.search).has('offline'))throw Error('offline'); return 75000000n; };
export const getTestDollars=async()=>{};
export const loadSnapshot=async(address)=>{
if(new URLSearchParams(location.search).has('offline'))throw Error('Network unavailable');
const now=Math.floor(Date.now()/1000); const state=new URLSearchParams(location.search).get('state'); const forming=address.includes('3333')||state==='forming';
return {address,state:state || (forming?'forming':'active'),rules:{memberCount:5,stakeBps:10000,maxBidBps:3000,poolShareBps:1000,holdbackBps:2000,yieldOn:true,contribution:10000000n,period:604800,commitWindow:172800,revealWindow:43200,grace:86400,firstDue:BigInt(now+172800),joinDeadline:BigInt(now+86400)},round:2,organizer:'0x1111111111111111111111111111111111111111',pot:30000000n,due:now+172800,chainNow:now,yield:{earned:41000n},members:Array.from({length:5},(_,seat)=>({seat,address:forming&&seat>1?null:'0x'+String(seat+1).repeat(40),standing:'good',stage:seat===0?(new URLSearchParams(location.search).get('stage')||'Friendly'):['Family','AtHome','Shy','Wary'][seat-1],owed:seat===0&&new URLSearchParams(location.search).get('stage')==='Away'?6000000n:0n,deposit:10000000n,offerFrom:0,capRounds:3,limitMonths:seat===0?3:255,owesElsewhere:false,received:seat===1,arrears:0n,credit:0n,paid:new URLSearchParams(location.search).has('paid')||seat>0&&seat<4,revealed:false})),recipients:[null,null,null,null,null],me:(new URLSearchParams(location.search).get('screen')==='Join'&&!new URLSearchParams(location.search).has('already'))?null:{seat:0,pay:10000000n,creditUsed:0n,holdbackReleased:0n,commitment:'0x'+'0'.repeat(64),revealedBps:0,withdrawable:0n,balance:75000000n,unrecorded:false}};
};
export const createCircle=async()=>{};export const joinAsOrganizer=async()=>{};export const joinCircle=async()=>{};
export const isKittyCircle=async()=>true;export const NOT_A_CIRCLE="This link doesn't lead to a Kitty circle. Nothing was sent.";export const recordFinish=async()=>{};export const serial=(_a,f)=>f();export const cancelCircle=async()=>{};export const closeRound=async()=>{};export const contribute=async()=>{};export const payArrears=async()=>{};export const revealBid=async()=>0;export const withdraw=async()=>{};export const commitBid=async()=>{};
`;
mocks['@react-native-community/slider']=`import React from 'react'; export default function Slider(p){return <input aria-label={p.accessibilityLabel} type="range" min={p.minimumValue} max={p.maximumValue} step={p.step} value={p.value} onChange={e=>p.onValueChange(Number(e.target.value))}/>;}`;
const entry=`import {CatGallery} from '${app}/qa/CatGallery';import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
${['Home','Welcome','Circle','Create','Me','Paste','Bid','Join','MeetCat','Send','Receive','Scan','Claim'].map(n=>`import {${n}Screen} from '${app}/src/screens/${n}Screen';`).join('\n')}
function Preview(){
  const [routes,setRoutes]=useState([{name:new URLSearchParams(location.search).get('screen')||'Home',params:{address:'0x2222222222222222222222222222222222222222',round:2,link:new URLSearchParams(location.search).get('screen')==='Claim'?'https://kitty-circle.vercel.app/s/#k=x':'https://kitty-circle.vercel.app/j/0x3333333333333333333333333333333333333333/2#k=0x'+'ab'.repeat(32)+'&m='+encodeURIComponent(JSON.stringify({t:'Weekend Circle',n:['Host','Friend A','Friend B']}))}}]);
  const route=routes[routes.length-1];
  const navigation={
    navigate:(name,params={})=>setRoutes(previous=>[...previous,{name,params}]),
    replace:(name,params={})=>setRoutes(previous=>[...previous.slice(0,-1),{name,params}]),
    goBack:()=>setRoutes(previous=>previous.length>1?previous.slice(0,-1):[{name:'Home',params:{}}]),
    popTo:(name)=>setRoutes(previous=>{const i=previous.map(r=>r.name).lastIndexOf(name);return i<0?[{name,params:{}}]:previous.slice(0,i+1)}),
  };
  const screens={Cats:CatGallery,Home:HomeScreen,Welcome:WelcomeScreen,Circle:CircleScreen,Create:CreateScreen,Me:MeScreen,Paste:PasteScreen,Bid:BidScreen,Join:JoinScreen,MeetCat:MeetCatScreen,Send:SendScreen,Receive:ReceiveScreen,Scan:ScanScreen,Claim:ClaimScreen};
  const Component=screens[route.name];
  return Component?<Component navigation={navigation} route={route}/>:<div style={{padding:24}}>This screen is outside the sample preview. <button onClick={()=>navigation.goBack()}>Back to Home</button></div>;
}createRoot(document.getElementById('root')).render(<Preview/>);`;
const fonts=[['figtree','400Regular','Figtree_400Regular'],['figtree','500Medium','Figtree_500Medium'],['figtree','700Bold','Figtree_700Bold'],['bricolage-grotesque','700Bold','BricolageGrotesque_700Bold'],['bricolage-grotesque','800ExtraBold','BricolageGrotesque_800ExtraBold']];
copyFileSync(`${app}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf`,`${out}/Ionicons.ttf`);
let fontCss="@font-face{font-family:Ionicons;src:url('/Ionicons.ttf')}";
for(const [pkg,folder,name] of fonts){copyFileSync(`${app}/node_modules/@expo-google-fonts/${pkg}/${folder}/${name}.ttf`,`${out}/${name}.ttf`);fontCss+=`@font-face{font-family:${name};src:url('/${name}.ttf')}`;}
writeFileSync(`${out}/index.html`,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitty · Sample data preview</title><style>${fontCss}*{box-sizing:border-box}body{margin:0;background:#FFFFFF}#root{height:100dvh;display:flex;flex-direction:column}::selection{background:#FCE5EF;color:#AD245F}input,textarea{caret-color:#AD245F}*{scrollbar-color:#E8DEE3 #FFFFFF}button:focus-visible,[role=button]:focus-visible,[role=radio]:focus-visible,[role=tab]:focus-visible,[role=checkbox]:focus-visible{outline:3px solid #AD245F;outline-offset:3px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
const ctx=await context({stdin:{contents:entry,resolveDir:app,loader:'tsx'},bundle:true,resolveExtensions:['.web.tsx','.tsx','.ts','.web.js','.js','.json'],outfile:`${out}/bundle.js`,jsx:'automatic',nodePaths:[`${temp}/node_modules`,`${app}/node_modules`],loader:{'.png':'file','.webp':'file'},define:{'global':'globalThis','process.env.NODE_ENV':'"development"','process.env.EXPO_PUBLIC_RPC_URL':'undefined','__DEV__':'true'},plugins:[{name:'preview-adapters',setup(build){build.onResolve({filter:/.*/},args=>{const key=Object.keys(mocks).find(k=>args.path===k||args.path.endsWith('/'+k));if(key)return {path:key,namespace:'mock'};if(args.path==='./house'||args.path==='../house')return {path:resolve(app,'src/house.ts')};if(args.path==='react-native-svg')return {path:resolve(app,'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js')};if(args.path==='react-native')return {path:require.resolve('react-native-web')};if(args.path==='react'||args.path.startsWith('react/'))return {path:require.resolve(args.path)};});build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:app}));}}]});
await ctx.watch();const server=await ctx.serve({servedir:out,host:'127.0.0.1',port});console.log(`Kitty sample preview: http://127.0.0.1:${server.port}`);
