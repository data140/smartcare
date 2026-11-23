#!/usr/bin/env python3
"""스마트케어 빌드 도구 — src/ 의 원본 파일을 하나의 배포 파일(index.html)로 묶습니다.

사용법
  python3 tools/build.py            운영용   → index.html
  python3 tools/build.py test       시험용   → test/index.html   (config/test.json 필요)
  python3 tools/build.py local      개발용   → dist/local.html   (tools/dev-server.js 로 실행)
  python3 tools/build.py demo       체험용   → dist/demo.html    (서버 없이 가상 데이터로 동작)
  python3 tools/build.py --check    index.html 이 src/ 와 일치하는지 확인 (CI용)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
read = lambda p: open(P(p), encoding='utf-8', newline='').read()

INCLUDE = re.compile(r'<!--#include (style|script) (\S+)(?: attrs=(\S+))? -->')


def page_html():
    """src/page.html 의 include 지시문을 실제 <style>/<script> 블록으로 바꿈"""
    def sub(m):
        tag, path, attrs = m.group(1), m.group(2), m.group(3)
        attr_txt = json.loads(read(attrs)) if attrs else ''
        return '<%s%s>%s</%s>' % (tag, attr_txt, read(path), tag)
    return INCLUDE.sub(sub, read('src/page.html'))


def config(env):
    name = 'prod' if env in ('prod', 'demo') else env
    path = P('config', name + '.json')
    if env == 'local':
        return {'url': None, 'key': 'local-dev-key', 'ws': 'smartcare'}
    if not os.path.exists(path):
        sys.exit('config/%s.json 이 없습니다 — config/%s.example.json 을 복사해 값을 넣으세요' % (name, name))
    return json.load(open(path, encoding='utf-8'))


def inject_head(html, snippet):
    anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    assert html.count(anchor) >= 1, 'head anchor not found'
    return html.replace(anchor, anchor + snippet, 1)


def template(env):
    html = page_html()
    cfg = config(env)
    url_js = 'location.origin' if cfg['url'] is None else json.dumps(cfg['url']).replace('"', "'")
    for ph, val in (("'__SC_CLOUD_URL__'", url_js), ("'__SC_CLOUD_KEY__'", json.dumps(cfg['key']).replace('"', "'")),
                    ("'__SC_CLOUD_WS__'", json.dumps(cfg.get('ws', 'smartcare')).replace('"', "'"))):
        if html.count(ph) != 1:
            sys.exit('placeholder %s: %d개 (1개여야 함)' % (ph, html.count(ph)))
        html = html.replace(ph, val)
    if env == 'test':
        html = inject_head(html, '<script>' + read('tools/test-badge.js') + '</script>\n')
    if env == 'demo':
        mock = read('tools/fake-data.js') + '\n' + read('tools/demo-mock.js').replace('__SC_CLOUD_URL__', cfg['url'])
        html = inject_head(html, '<script>' + mock + '</script>\n')
    return html


def bundle(env):
    t = template(env)
    enc = json.dumps(t, ensure_ascii=False).replace('</', '<\\u002F')
    out = (read('src/bundle/shell-1.html') + read('src/bundle/manifest.json') + read('src/bundle/shell-2.html')
           + '\n' + enc + '\n  ' + read('src/bundle/shell-3.html'))
    if env == 'test':
        out = out.replace('<title>Bundled Page</title>', '<title>[시험] 스마트케어</title>', 1)
    elif env == 'demo':
        out = out.replace('<title>Bundled Page</title>', '<title>스마트케어 체험용 화면</title>', 1)
    return out


OUT = {'prod': 'index.html', 'test': 'test/index.html', 'local': 'dist/local.html', 'demo': 'dist/demo.html'}

if __name__ == '__main__':
    args = sys.argv[1:]
    if args == ['--check']:
        ok = bundle('prod') == read('index.html')
        print('index.html 이 src/ 와 일치합니다' if ok else 'index.html 이 src/ 와 다릅니다 — python3 tools/build.py 를 실행해 다시 만드세요')
        sys.exit(0 if ok else 1)
    env = args[0] if args else 'prod'
    if env not in OUT:
        sys.exit(__doc__)
    out = P(OUT[env])
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    open(out, 'w', encoding='utf-8', newline='').write(bundle(env))
    print('%s → %s' % (env, OUT[env]))
