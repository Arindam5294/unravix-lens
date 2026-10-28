# Render a saved /api/analyze response over a real photo, headless, with no API call.
# The photo goes through the real client: file input -> resize -> on-device orientation check (0.5.0) ->
# preview (optionally Rotate) -> "Find the knot" -> /api/analyze answered from the saved JSON.
# Run: RESP=eval/x.json PHOTO=photo.jpg OUT=screens/x.png [W=390] [ROTATE=90,90] [PREVIEW_OUT=p.png] python3 scripts/real_shot.py
import asyncio, os, json, threading, http.server, functools, urllib.request
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
RESP, PHOTO, OUT = os.environ['RESP'], os.environ['PHOTO'], os.environ['OUT']
W = int(os.environ.get('W', '390')); H = int(os.environ.get('H', '844')); PORT = int(os.environ.get('PORT', '8793'))
FULL = os.environ.get('FULL') == '1'
ROTATE = [int(x) for x in os.environ.get('ROTATE', '').split(',') if x]
PREVIEW_OUT = os.environ.get('PREVIEW_OUT')
_saved = json.load(open(RESP))
body = json.dumps(_saved['body'] if 'body' in _saved and 'ok' not in _saved else _saved)  # eval runner files wrap the response
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
sent = {}
async def route(r):
    u = r.request.url
    if '/api/health' in u: return await r.fulfill(status=200, content_type='application/json', body='{"ok":true,"configured":true}')
    if '/api/analyze' in u:
        try: sent['image'] = json.loads(r.request.post_data_buffer or b'{}').get('image', '')
        except Exception as e: print('post body unreadable', e)
        return await r.fulfill(status=200, content_type='application/json', body=body)
    if u.startswith(f'http://127.0.0.1:{PORT}'): return await r.continue_()
    if 'fonts.g' in u:
        try:
            b, ct = await asyncio.to_thread(fetch_ext, u); return await r.fulfill(status=200, body=b, content_type=ct, headers={'access-control-allow-origin': '*'})
        except Exception: return await r.abort()
    return await r.abort()
GEO = """() => {
  const img = document.querySelector('#photo'), fr = document.querySelector('.stage__frame');
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const bx = [...document.querySelectorAll('.bx')].map((e) => { const b = e.getBoundingClientRect(); return [e.dataset.step, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; });
  return { state: document.querySelector('#scan-panel').dataset.state, frame: r(fr), img: r(img), natural: [img.naturalWidth, img.naturalHeight], bx,
           cap: document.querySelector('#stage-cap').innerText };
}"""
async def to_panel(pg):
    await pg.evaluate("window.scrollTo({top: document.querySelector('#scan-panel').getBoundingClientRect().top + scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-offset')), behavior:'instant'})")
    await pg.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.route('**/*', route)
        await pg.goto(f'http://127.0.0.1:{PORT}/?mode=check', wait_until='load')
        await pg.wait_for_timeout(600)
        await pg.set_input_files('#file-any', PHOTO)
        await pg.wait_for_selector('#scan-panel[data-state="preview"]', timeout=30000)
        for d in ROTATE:
            await pg.click(f'#preview-card [data-action="rotate"][data-deg="{d}"]')
            await pg.wait_for_timeout(900)
        await pg.wait_for_timeout(500)
        pv = await pg.evaluate(GEO)
        if PREVIEW_OUT:
            await to_panel(pg); await pg.screenshot(path=PREVIEW_OUT)
        await pg.click('#preview-card [data-action="scan-now"]')
        try:
            await pg.wait_for_selector('#scan-panel[data-state="result"]', timeout=20000)
        except Exception:
            print('no result:', await pg.evaluate(GEO), await pg.evaluate('document.querySelector("#err-card").innerText'), errs[:5]); raise
        await pg.wait_for_timeout(4500)
        await to_panel(pg)
        geo = await pg.evaluate(GEO)
        print(json.dumps({'preview_natural': pv['natural'], 'result': geo}))
        if sent.get('image'):
            import base64
            open(OUT + '.sent.jpg', 'wb').write(base64.b64decode(sent['image'].split(',', 1)[1]))
        await pg.screenshot(path=OUT, full_page=FULL)
        print('saved', OUT, 'errors', errs[:3])
        await b.close()
asyncio.run(main())
