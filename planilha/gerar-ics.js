// Gera assets/agenda-rbcuiaba26.ics e planilha/programacao.csv a partir de data.js
const fs=require('fs'); const vm=require('vm');
const ctx={}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data.js','utf8')+';this.SITE_CONFIG=SITE_CONFIG;this.EVENT_INFO=EVENT_INFO;this.LOCATIONS=LOCATIONS;this.SCHEDULE=SCHEDULE;',ctx);
const {SITE_CONFIG,EVENT_INFO,LOCATIONS,SCHEDULE}=ctx;
const ts=(d,hm)=>Date.parse(`${d}T${hm}:00${EVENT_INFO.utcOffset}`);
const p=n=>String(n).padStart(2,'0');
const icsDate=ms=>{const d=new Date(ms);return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;};
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
const fold=l=>{const o=[];while(l.length>73){o.push(l.slice(0,73));l=' '+l.slice(73);}o.push(l);return o.join('\r\n');};
const plain=t=>String(t).replace(/\*\*/g,'').replace(/^- /mg,'• ');
const L=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN','METHOD:PUBLISH','PRODID:-//Rito Brasileiro Cuiaba 2026//Jornada dos Graus Filosoficos//PT','X-WR-CALNAME:Jornada dos Graus Filosóficos — Rito Brasileiro · Cuiabá 2026','X-WR-TIMEZONE:'+EVENT_INFO.tz];
const stamp=icsDate(Date.now()); let n=0;
const csv=[['id','data','inicio','fim','local','rito','tipo','titulo_pt','restricao_pt','nota_pt']];
const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
SCHEDULE.forEach(day=>day.sessions.forEach(s=>{
  const st=ts(day.date,s.start), en=s.end?ts(day.date,s.end):st+3600000;
  const loc=s.loc?`${LOCATIONS[s.loc].name}, ${LOCATIONS[s.loc].address}`:'';
  const desc=[s.restriction?'Atenção: '+plain(s.restriction.pt):'', s.note?plain(s.note.pt):'', SITE_CONFIG.shortUrl].filter(Boolean).join('\n');
  L.push('BEGIN:VEVENT',`UID:${s.id}@rbcuiaba26`,`DTSTAMP:${stamp}`,`DTSTART:${icsDate(st)}`,`DTEND:${icsDate(en)}`,fold('SUMMARY:'+esc(s.t.pt)));
  if(loc) L.push(fold('LOCATION:'+esc(loc)));
  L.push(fold('DESCRIPTION:'+esc(desc)),fold('URL:'+SITE_CONFIG.siteUrl),'END:VEVENT'); n++;
  csv.push([s.id,day.date,s.start,s.end||'',s.loc||'',s.body||'geral',s.kind||'',s.t.pt,s.restriction?s.restriction.pt:'',s.note?s.note.pt:'']);
}));
L.push('END:VCALENDAR');
fs.writeFileSync('assets/agenda-rbcuiaba26.ics',L.join('\r\n')+'\r\n');
fs.writeFileSync('planilha/programacao.csv','\ufeff'+csv.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n');
console.log('eventos:',n);
