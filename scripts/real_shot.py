# Render a saved /api/analyze response over the real photo, headless, no API call (Phase 3a).
# The photo goes through the real client prep (file input -> resize -> JPEG); /api/analyze is answered
# from the saved JSON. Run: RESP=eval/x.json PHOTO=photo.jpg OUT=screens/x.png [W=390] python3 scripts/real_shot.py
import asyncio, os, json, threading, http.server, functools, urllib.request
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
RESP, PHOTO, OUT = os.environ['RESP'], os.environ['PHOTO'], os.environ['OUT']
W = int(os.environ.get('W', '390')); H = int(os.environ.get('H', '844')); PORT = int(os.environ.get('PORT', '8793'))
FULL = os.environ.get('FULL') == '1'
body = open(RESP, 'rb').read()
cache = {}
def fetch_ext(url):
    if url not in cache:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Chrome/126'})
        with urllib.request.urlopen(req, timeout=20) as r: cache[url] = (r.read(), r.headers.get('content-type', 'text/css'))
    return cache[url]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
async def route(r):
    u = r.request.url
    if '/api/health' in u: return await r.fulfill(status=200, content_type='application/json', body='{"ok":true,"configured":true}')
    if '/api/analyze' in u: return await r.fulfill(status=200, content_type='application/json', body=body)
    if u.startswith(f'http://127.0.0.1:{PORT}'): return await r.continue_()
    if 'fonts.g' in u:
        try:
            b, ct = await asyncio.to_thread(fetch_ext, u); return await r.fulfill(status=200, body=b, content_type=ct, headers={'access-control-allow-origin': '*'})
        except Exception: return await r.abort()
    return await r.abort()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, is_mobile=W < 700, has_touch=W < 700)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.route('**/*', route)
        await pg.goto(f'http://127.0.0.1:{PORT}/', wait_until='load')
        await pg.wait_for_timeout(800)
        await pg.set_input_files('#file-any', PHOTO)
        await pg.wait_for_selector('#scan-panel[data-state="result"]', timeout=20000)
        await pg.wait_for_timeout(4500)
        await pg.evaluate("window.scrollTo({top: document.querySelector('#scan-panel').getBoundingClientRect().top + scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-offset')), behavior:'instant'})")
        await pg.wait_for_timeout(600)
        geo = await pg.evaluate("""() => {
          const img = document.querySelector('#photo'), ov = document.querySelector('#overlay'), fr = document.querySelector('.stage__frame');
          const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
          const lbl = [...document.querySelectorAll('.lbl')].map((e) => ({ s: e.dataset.step, side: e.dataset.side, r: r(e) }));
          const bx = [...document.querySelectorAll('.bx')].map((e) => { const b = e.getBoundingClientRect(); return [e.dataset.step, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; });
          return { frame: r(fr), img: r(img), overlay: r(ov), natural: [img.naturalWidth, img.naturalHeight], lbl, bx,
                   cap: document.querySelector('#stage-cap').innerText, nav: getComputedStyle(document.documentElement).getPropertyValue('--nav-offset') };
        }""")
        print(json.dumps(geo))
        await pg.screenshot(path=OUT, full_page=FULL)
        print('saved', OUT, 'errors', errs[:3])
        await b.close()
asyncio.run(main())
