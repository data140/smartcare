#!/usr/bin/env python3
"""만든 .hwpx 파일의 구조를 점검 (한글 프로그램 없이 할 수 있는 범위): 압축 형식·XML 문법·번호 참조·표 칸 주소·그림 연결"""
import sys, zipfile, re
import xml.etree.ElementTree as ET
f = sys.argv[1]; z = zipfile.ZipFile(f); n = z.namelist(); errs = []
assert z.testzip() is None
if n[0] != 'mimetype' or z.read('mimetype') != b'application/hwp+zip': errs.append('mimetype')
if z.getinfo('mimetype').compress_type != 0: errs.append('mimetype 압축됨')
trees = {}
for x in n:
    if x.endswith(('.xml', '.hpf', '.rdf')): trees[x] = ET.fromstring(z.read(x))
hd = z.read('Contents/header.xml').decode(); sec = z.read('Contents/section0.xml').decode()
NS = {'hh': 'http://www.hancom.co.kr/hwpml/2011/head', 'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph', 'hc': 'http://www.hancom.co.kr/hwpml/2011/core', 'opf': 'http://www.idpf.org/2007/opf/'}
H = trees['Contents/header.xml']; S = trees['Contents/section0.xml']
def ids(tag):
    return [int(e.get('id')) for e in H.iter('{%s}%s' % (NS['hh'], tag))]
bf, cp, pp = ids('borderFill'), ids('charPr'), ids('paraPr')
for tag, lst in (('borderFills', bf), ('charProperties', cp), ('paraProperties', pp)):
    el = next(H.iter('{%s}%s' % (NS['hh'], tag)))
    if int(el.get('itemCnt')) != len(lst): errs.append(tag + ' itemCnt 불일치')
    if len(set(lst)) != len(lst): errs.append(tag + ' id 중복')
for e in S.iter():
    t = e.tag.split('}')[1]
    if t == 'p' and int(e.get('paraPrIDRef')) not in pp: errs.append('없는 paraPr ' + e.get('paraPrIDRef'))
    if t == 'run' and int(e.get('charPrIDRef')) not in cp: errs.append('없는 charPr')
    if e.get('borderFillIDRef') and int(e.get('borderFillIDRef')) not in bf and t != 'pageBorderFill': errs.append('없는 borderFill ' + e.get('borderFillIDRef'))
pids = [e.get('id') for e in S.iter('{%s}p' % NS['hp'])]
if len(set(pids)) != len(pids): errs.append('문단 id 중복')
for tbl in S.iter('{%s}tbl' % NS['hp']):
    rc, cc = int(tbl.get('rowCnt')), int(tbl.get('colCnt')); grid = set()
    for tc in tbl.iter('{%s}tc' % NS['hp']):
        a = tc.find('hp:cellAddr', NS); sp = tc.find('hp:cellSpan', NS)
        c, r, cs, rs = int(a.get('colAddr')), int(a.get('rowAddr')), int(sp.get('colSpan')), int(sp.get('rowSpan'))
        for rr in range(r, r + rs):
            for ccx in range(c, c + cs):
                if (rr, ccx) in grid: errs.append('칸 겹침 %d,%d' % (rr, ccx))
                grid.add((rr, ccx))
    if len(grid) != rc * cc: errs.append('표 칸 수 불일치 %d != %d' % (len(grid), rc * cc))
man = {i.get('id'): i for i in trees['Contents/content.hpf'].iter('{%s}item' % NS['opf'])}
for im in S.iter('{%s}img' % NS['hc']):
    ref = im.get('binaryItemIDRef'); it = man.get(ref)
    if it is None or it.get('href') not in n: errs.append('그림 연결 끊김 ' + str(ref))
bi = list(H.iter('{%s}binItem' % NS['hh']))
if len(bi) != sum(1 for k in man.values() if k.get('isEmbeded') == '1'): errs.append('binItem 수 불일치')
print('pics', len(list(S.iter('{%s}pic' % NS['hp']))), 'tables', len(list(S.iter('{%s}tbl' % NS['hp']))), 'errors', errs)
sys.exit(1 if errs else 0)
