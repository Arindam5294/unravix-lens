# Headless screenshots of the UI states (hero, both modes: Ask a doubt + Check my working) at 390x844 and 1440x900.
# pip install playwright && python -m playwright install chromium
# Run: PORT=8765 OUT=screens python3 scripts/screens.py [shot-name ...]
# Serves public/ locally, mocks /api/health, proxies Google Fonts, blocks everything else.
import asyncio, sys, urllib.request, threading, http.server, functools, os
from playwright.async_api import async_playwright
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public')
OUT=os.environ.get('OUT','screens'); os.makedirs(OUT,exist_ok=True)
PORT=int(os.environ.get("PORT","8791"))
cache={}
def fetch_ext(url):
    if url not in cache:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/126 Safari/537.36'})
        with urllib.request.urlopen(req,timeout=20) as r: cache[url]=(r.read(),r.headers.get('content-type','text/css'))
    return cache[url]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',PORT),functools.partial(H,directory=ROOT))
threading.Thread(target=srv.serve_forever,daemon=True).start()
async def route(r):
    u=r.request.url
    if u.startswith(f'http://127.0.0.1:{PORT}/api/health'):
        return await r.fulfill(status=200,content_type='application/json',body='{"ok":true,"configured":true,"version":"0.4.0-doubt"}')
    if u.startswith(f'http://127.0.0.1:{PORT}'):
        return await r.continue_()
    if 'fonts.g' in u:
        try:
            body,ct=await asyncio.to_thread(fetch_ext,u); return await r.fulfill(status=200,body=body,content_type=ct,headers={'access-control-allow-origin':'*'})
        except Exception as e:
            print('font fail',u,e); return await r.abort()
    return await r.abort()
SHOTS=sys.argv[1:] or ["all"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        async def shot(name,w,h,query='',full=False,theme=None,wait=2600,mobile=False,scroll_to=None,reduce=False):
            ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=1,has_touch=mobile,is_mobile=mobile,reduced_motion='reduce' if reduce else 'no-preference')
            if theme: await ctx.add_init_script(f"localStorage.setItem('lens-theme','{theme}')")
            pg=await ctx.new_page()
            errs=[]
            pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
            pg.on('pageerror',lambda e: errs.append(str(e)))
            await pg.route('**/*',route)
            await pg.goto(f'http://127.0.0.1:{PORT}/{query}',wait_until='load')
            await pg.wait_for_timeout(wait)
            if scroll_to: await pg.evaluate(f"window.scrollTo({{top: document.querySelector('{scroll_to}').getBoundingClientRect().top + scrollY - 76, behavior: 'instant'}})"); await pg.wait_for_timeout(500)
            if full:
                await pg.evaluate("(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,60))} scrollTo({top:0,behavior:'instant'})})()"); await pg.wait_for_timeout(1500)
            ov=await pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            await pg.screenshot(path=f'{OUT}/{name}.png',full_page=full)
            print(name,'overflowX=',ov,'errors=',errs[:3])
            await ctx.close()
        plan=[
          ('hero-390',390,844,'',False,None,2600,True,None),
          ('hero-1440',1440,900,'',False,None,2600,False,None),
          ('doubt-idle-390',390,844,'?mode=doubt',False,None,1800,True,'#scan'),
          ('doubt-idle-1440',1440,900,'?mode=doubt',False,None,1800,False,'#scan'),
          ('doubt-scanning-390',390,844,'?mode=doubt&state=scanning',False,None,1500,True,'#scan'),
          ('doubt-result-390',390,844,'?mode=doubt&state=result',False,None,3000,True,'#scan'),
          ('doubt-result-390-full',390,844,'?mode=doubt&state=result',True,None,3000,True,None),
          ('doubt-result-1440',1440,900,'?mode=doubt&state=result',False,None,3000,False,'#scan'),
          ('doubt-result-1440-light',1440,900,'?mode=doubt&state=result',False,'light',3000,False,'#scan'),
          ('check-idle-390',390,844,'?mode=check',False,None,1800,True,'#scan'),
          ('check-idle-1440',1440,900,'?mode=check',False,None,1800,False,'#scan'),
          ('check-scanning-390',390,844,'?mode=check&state=scanning',False,None,1500,True,'#scan'),
          ('check-result-390',390,844,'?mode=check&state=result',False,None,3200,True,'#scan'),
          ('check-result-1440',1440,900,'?mode=check&state=result',False,None,3200,False,'#scan'),
          ('check-notcheckable-1440',1440,900,'?mode=check&state=nc',False,None,3200,False,'#scan'),
          ('error-390',390,844,'?mode=doubt&state=error&code=daily_limit',False,None,1500,True,'#scan'),
          ('idle-1440-full',1440,900,'',True,None,2600,False,None),
        ]
        for a in plan:
            if SHOTS!=['all'] and a[0] not in SHOTS: continue
            await shot(*a)
        await b.close()
if __name__=="__main__": asyncio.run(main())
