#!/usr/bin/env python3
"""HWPX 문서 틀(한글이 직접 저장한 빈 문서)을 src/app.js 안에 넣는 도구.
   사용: python3 tools/make-hwpx-template.py <Skeleton.hwpx 경로>
   Skeleton.hwpx 는 python-hwpx(Apache-2.0)의 hwpx/data/Skeleton.hwpx — 한/글이 만든 빈 문서라 header.xml 등 필수 구조가 정확합니다.
   app.js 의 /* HWPX-TEMPLATE-START */ ~ /* HWPX-TEMPLATE-END */ 사이를 새로 씁니다. """
import sys, zipfile, json, re, os
z = zipfile.ZipFile(sys.argv[1])
rd = lambda n: z.read(n).decode('utf-8')
sec = rd('Contents/section0.xml')
root_open = sec[:sec.index('<hp:p ')]
p0 = sec[sec.index('<hp:p '):]
secpr = re.search(r'<hp:secPr .*?</hp:secPr>', p0, re.S).group(0)
colpr = re.search(r'<hp:ctrl><hp:colPr .*?</hp:ctrl>', p0, re.S).group(0)
T = {
  'header': rd('Contents/header.xml'), 'hpf': rd('Contents/content.hpf'), 'version': rd('version.xml'), 'settings': rd('settings.xml'),
  'container': rd('META-INF/container.xml'), 'rdf': rd('META-INF/container.rdf'), 'manifest': rd('META-INF/manifest.xml'),
  'secRoot': root_open, 'secPr': secpr, 'colPr': colpr,
}
blk = '/* HWPX-TEMPLATE-START */\n  // 한/글이 직접 저장한 빈 문서(python-hwpx Skeleton.hwpx, Apache-2.0)의 구조. tools/make-hwpx-template.py 로 생성\n  static HWPX_T = ' + json.dumps(T, ensure_ascii=False) + ';\n  /* HWPX-TEMPLATE-END */'
app = os.path.join(os.path.dirname(__file__), '..', 'src', 'app.js')
s = open(app, encoding='utf-8').read()
if '/* HWPX-TEMPLATE-START */' in s:
    s = re.sub(r'/\* HWPX-TEMPLATE-START \*/.*?/\* HWPX-TEMPLATE-END \*/', lambda m: blk, s, flags=re.S)
else:
    a = '  static xmlEsc(v)'
    s = s.replace(a, '  ' + blk + '\n' + a, 1)
open(app, 'w', encoding='utf-8').write(s)
print('ok', len(blk))
