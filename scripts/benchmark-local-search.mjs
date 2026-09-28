import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const base = new URL(process.argv[2] || 'http://localhost:3002');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('This bounded benchmark is for localhost only');
const output = process.argv[3];
if (!output || fs.existsSync(output)) throw new Error('Provide a new output JSON path');
const cases = [
  ['court', {court:'2. Hukuk Dairesi',dateFrom:'2025-01-01',dateTo:'2025-12-31'}],
  ['untagged', {court:'2. Hukuk Dairesi',citationState:'zero'}],
  ['citation', {court:'4. Ceza Dairesi',dateFrom:'2025-01-01',dateTo:'2025-12-31',legalRef:'TCK 125'}],
  ['text-rare', {query:'tarım sigortalılığı'}],
  ['text-common', {query:'sanık'}],
];
const report = {base:base.origin,started_at:new Date().toISOString(),note:'Local exploratory test, 10 requests per level; cache and hardware affect timings. Not a capacity guarantee.',levels:[]};
for (const concurrency of [1,2,4]) {
  const jobs = [...cases,...cases];
  const results = [];
  let cursor = 0;
  const started = performance.now();
  async function worker() {
    while (cursor < jobs.length) {
      const [name,params] = jobs[cursor++];
      const tick = performance.now();
      try {
        const url = new URL('/api/legal-index/search', base);
        url.search = new URLSearchParams({...params,limit:'20'}).toString();
        const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.results) || !body.results.length) throw new Error(body.error || `Unexpected response ${response.status}`);
        results.push({name,ms:Math.round(performance.now()-tick),ok:true,rows:body.results.length});
      } catch (error) {
        results.push({name,ms:Math.round(performance.now()-tick),ok:false,error:error.message});
      }
      console.log(JSON.stringify({concurrency,...results.at(-1)}));
    }
  }
  await Promise.all(Array.from({length:concurrency},worker));
  const sorted = results.map(r=>r.ms).sort((a,b)=>a-b);
  report.levels.push({concurrency,elapsed_ms:Math.round(performance.now()-started),p50_ms:sorted[Math.ceil(sorted.length*.5)-1],p95_ms:sorted[Math.ceil(sorted.length*.95)-1],failures:results.filter(r=>!r.ok).length,results});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  if (results.some(r=>!r.ok)) break;
}
console.log(JSON.stringify(report.levels.map(({results,...stats})=>stats),null,2));
