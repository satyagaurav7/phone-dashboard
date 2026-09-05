"""Local QA only: runs the real controller with synthetic, local-only Firebase stubs.
No account authentication is bypassed: the SDK and production backend are absent.
Run python tests/preview_server.py, then open http://127.0.0.1:8765/preview.html.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/preview.html'):
            html=(ROOT/'index.html').read_text()
            start=html.index('<script type="module">'); end=html.index('</script>',start)
            controller=html[html.index('async function initApp(){'):end]
            stub='''import * as midnight from './ui/midnight.mjs';
const db={}, doc=()=>({}), VAPID_KEY='', swReady=Promise.resolve(null), motionReady=Promise.resolve(null);
const deleteField=()=>({__delete:true});
const saved=()=>JSON.parse(localStorage.getItem('qa-cloud')||'{"config":{"score":0},"days":{},"checkIns":{}}');
const getDoc=async()=>({exists:()=>true,data:saved});
const updateDoc=async(ref,patch)=>{if(localStorage.getItem('qa-offline')==='yes')throw Error('QA offline');const s=saved();for(const [path,v] of Object.entries(patch)){const keys=path.split('.');let o=s;for(const k of keys.slice(0,-1))o=o[k]??={};if(v?.__delete)delete o[keys.at(-1)];else o[keys.at(-1)]=v;}localStorage.setItem('qa-cloud',JSON.stringify(s));};
const setDoc=async(ref,value)=>localStorage.setItem('qa-cloud',JSON.stringify(value));
document.getElementById('authGate').remove();document.getElementById('appRoot').style.display='block';
'''
            html=html[:start]+'<script type="module">'+stub+controller+'\nawait initApp();</script>'+html[end+9:]
            html=html.replace('<head>', '<head><title>Local synthetic QA</title>')
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(html.encode())
        elif self.path.startswith('/phone.html'):
            html='''<!doctype html><html><head><title>FLOWSTATE phone QA</title><style>body{background:#16272b;color:#fff;font:14px system-ui;margin:20px}iframe{display:block;border:1px solid #566;margin:16px auto;width:375px;height:812px}button{padding:12px;margin-right:8px}</style></head><body><label>Preview width: <select id="size"><option>320</option><option selected>375</option><option>430</option><option>1280</option></select></label><span> Synthetic local data · no Google or Firebase writes</span><iframe id="phone" title="Dashboard preview" src="/preview.html"></iframe><script>document.querySelector('#size').onchange=e=>document.querySelector('iframe').style.width=e.target.value+'px';</script></body></html>'''
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(html.encode())
        else: super().do_GET()
print('Synthetic QA server on http://127.0.0.1:8765/phone.html',flush=True)
ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
