
// 환자 명부는 서버(또는 이 기기 브라우저)에서만 불러옴 — 공개되는 코드에 환자 정보를 넣지 않음
const PATIENTS = [];
const DUMMY_IDS = ['PT-0001', 'PT-0002', 'PT-0003', 'PT-0004', 'PT-0005', 'PT-0006', 'PT-0007', 'PT-0008'];

const HISTORY = {};

const ORIG_NAME_ID = {};
PATIENTS.forEach(p => { ORIG_NAME_ID[p.name] = p.id; });

// 더미 출석 데이터 없음 — 출석부는 실제 확정된 일지에서만 만듦
const BASE_ATTENDANCE = [];

const ROLES = ['관리자', '담당자', '보조', '조회'];
const ROLE_HINT = {
  '관리자': '전체 조회·수정, 명부 삭제, 확정 후 수정, 권한 부여',
  '담당자': '환자 등록·동의서·일지 작성·검수 확정, 통계 조회',
  '보조': '배정 프로그램의 사진 업로드만. 명부·동의서 조회 불가',
  '조회': '통계 대시보드 조회 전용 (개인 식별 정보 마스킹)'
};

const REPORTS = [
  { id: 'ST-01', name: '환자별 이용 현황', body: '환자 검색 시 전체 참여 이력', form: '표' },
  { id: 'ST-02', name: '기간별 참여 건수', body: '기간 내 누적 참여 횟수와 순위', form: '순위표' },
  { id: 'ST-03', name: '프로그램별 참여자', body: '특정 일자 참여 명단과 담당자', form: '상세' },
  { id: 'ST-04', name: '프로그램 구성 비중', body: '기간 내 프로그램 시행 비율', form: '파이' },
  { id: 'ST-05', name: '월별·병동별 추이', body: '월별 참여 인원과 병동별 분포', form: '막대' },
  { id: 'ST-06', name: '운영 지표', body: '동의율, AI 인식률, 검수 보정 건수', form: '요약 카드' }
];

const BARS = [
  { label: '4월', h3: '46%', h4: '32%', dim: true },
  { label: '5월', h3: '58%', h4: '40%', dim: true },
  { label: '6월', h3: '52%', h4: '47%', dim: true },
  { label: '7월', h3: '71%', h4: '55%', dim: false },
  { label: '8월', h3: '66%', h4: '61%', dim: false },
  { label: '9월', h3: '88%', h4: '70%', dim: false }
];

class Component extends DCLogic {
  state = {
    logged: false,
    role: '담당자',
    userId: 2,
    device: Component.detectDevice(),
    // 실제 휴대폰·태블릿 기기에서 자동 판별일 때만 전체 화면(기기 틀 없음). PC에서 모드를 골라 보면 기기 틀로 미리보기
    phoneOnly: Component.autoDevice() !== 'pc' && Component.detectDevice() !== 'pc',
    pcView: 'patients',
    mobileView: 'today',
    logTab: 'list',
    setTab: 'ai',
    search: '',
    ward: '전체',
    stayFilter: '전체',
    pendingOnly: false,
    page: 0,
    sel: 'PT-0003',
    fetch: 'ready',
    offline: false,
    upload: 'idle',
    uploadPct: 0,
    idPhoto: null,
    photoUrls: {},
    formName: '',
    formPortrait: '확인전',
    formFace: '확인전',
    formStay: '재원',
    formSex: '여',
    formWard: '',
    formRoom: '',
    formBirth: '',
    formMode: 'new',
    comboOpen: null,
    wards: [
      { id: 1, name: '3병동', rooms: ['301호', '302호', '303호', '304호', '305호'] },
      { id: 2, name: '4병동', rooms: ['401호', '402호', '403호', '404호', '405호'] }
    ],
    wardsSaved: [
      { id: 1, name: '3병동', rooms: ['301호', '302호', '303호', '304호', '305호'] },
      { id: 2, name: '4병동', rooms: ['401호', '402호', '403호', '404호', '405호'] }
    ],
    wardsSavedAt: '',
    editingWard: null,
    dragWard: null,
    dragOverWard: null,
    wardDraft: '',
    roomDrafts: {},
    newWard: '',
    program: '미술치료',
    programs: ['미술치료', '음악치료', '컬러링북', '원예치료'],
    editingProgram: null,
    programDraft: '',
    adding: false,
    newProgram: '',
    analyzeStage: '',
    failCode: 'REKOGNITION_TIMEOUT · 재시도 2/3',
    assignKey: null,
    review: [],
    confirmed: false,
    reviewFailed: false,
    analyzing: false,
    photos: [],
    staff: [],
    calMonth: null, planDay: null, planStatus: '전체', planOpen: false, planForm: null, planErr: '',
    // 예시 일정 없음 — 서버에 저장된 실제 일정만 사용
    plans: [],
    consent: { portrait: false, face: false },
    paperSign: {},
    signed: { '동의인': false, '보호자': false, '촬영자': false },
    threshold: null,
    orgs: [
      { id: 'ORG1', name: '가족사랑요양병원' },
      { id: 'ORG2', name: '효사랑전주요양병원' }
    ],
    orgId: 'ORG1',
    lgOrg: 'ORG1', lgMode: 'emp', lgId: '', lgPw: '', lgShowPw: false, lgErr: '',
    // 개발 중 입력된 계정 목록 (2026-10-06 저장본) — 브라우저 저장본이 없을 때 기본값
    // 처음 설치용 시스템 관리자만 기본으로 둠 (초기 비밀번호 admin1234 → 첫 로그인 후 바로 변경)
    // 실제 직원 명부는 서버에서 불러옴
    roster: [{"id": 99, "name": "시스템 관리자", "type": "본사", "roles": ["시스템관리자"], "role": "시스템관리자", "status": "활성", "revokedAt": "", "org": "*", "empNo": "admin", "email": "", "pw": "p1$4fab8cb8da4b53438fa83c69d384bc7c80bd5bb58beab6d45474ffa816799710", "tempPw": "", "mustChange": true}],
    newStaffName: '',
    newStaffType: '',
    newStaffRole: ['보조'],
    dialog: null,
    addOpen: false,
    pickOpen: false,
    consentMode: 'paper',
    consentFiles: {},
    consentVia: {},
    paperDate: '',
    paperPlace: '',
    zoom: null,
    toast: ''
  };

  persistPatients(photoUrls) {
    if (window.__scOrg === '__SYS') return true;
    const map = photoUrls || this.state.photoUrls || {};
    // 증명사진: 바뀐 환자 사진만 환자별 키로 서버에 올리고, 브라우저에는 목록만 저장
    Object.keys(map).forEach(id => {
      const u = map[id];
      if (!u || this._idphSent[id] === u.length && this._idphCache[id] === u) return;
      this._idphCache[id] = u; this._idphSent[id] = u.length;
      this.blobPut(Component.IDPH_PREFIX + id, u);
    });
    Object.keys(this._idphSent).forEach(id => { if (!map[id]) { delete this._idphSent[id]; delete this._idphCache[id]; this.blobPut(Component.IDPH_PREFIX + id, ''); } });
    const pStr = JSON.stringify(PATIENTS), iStr = this._blobV2 ? this.idphIndexStr(map) : JSON.stringify(map);
    let okP = true, okI = true;
    // 명부(작은 데이터)를 먼저 저장 — 브라우저 저장이 실패해도 서버에는 올림
    try { localStorage.setItem('smartcare.patients.v1', pStr); } catch (e) { okP = false; }
    try { localStorage.setItem('smartcare.idphotos.v1', iStr); } catch (e) { okI = false; }
    const cloud = !!(this.cloudCfg() && window.__scCloudPush);
    if (cloud) {
      // 브라우저 저장이 실패했을 때도 서버 전송은 확실히 (setItem 실패 시 전송이 빠지는 경우 대비)
      if (!okP) window.__scCloudPush('smartcare.patients.v1', pStr);
      if (!okI) window.__scCloudPush('smartcare.idphotos.v1', iStr);
      return true;
    }
    return okP && okI;
  }

  applyTheme(theme, accent) {
    const el = document.documentElement;
    const keys = this._appliedKeys || [];
    keys.forEach(k => el.style.removeProperty(k));
    const set = {};
    const light = theme === 'light';
    if (light) {
      // 라이트용 중립 램프 (100=가장 진함 → 900=가장 옅음) · 500/600 은 흰 배경 위 본문 대비 4.5:1 이상
      // 5a 클린 그레이: 연회색 바탕 · 흰 카드 + 또렷한 테두리 · 진한 회청색 글씨 (모든 글씨 4.5:1 이상)
      const LN = { 100: '#0f1220', 200: '#161924', 300: '#262a36', 400: '#363b49', 500: '#4a5060', 600: '#555b6b', 700: '#a9aebb', 800: '#d0d4dc', 900: '#e9ecf1' };
      for (let i = 100; i <= 900; i += 100) set['--color-neutral-' + i] = LN[i];
      Object.assign(set, {
        // 5d 소프트 엘리베이션: 연회색 바탕 · 흰 카드 · 테두리 대신 부드러운 그림자
        '--color-bg': '#eef1f5', '--color-surface': '#ffffff', '--color-text': '#111827',
        '--color-divider': 'rgba(20,30,50,0.14)',
        '--shadow-sm': '0 1px 2px rgba(20,30,50,0.06), 0 4px 14px rgba(20,30,50,0.08)', '--shadow-md': '0 2px 4px rgba(20,30,50,0.06), 0 10px 24px rgba(20,30,50,0.12)', '--shadow-lg': '0 0 0 1px #a3a9b6, 0 16px 40px rgba(20,22,40,0.18)'
      });
    }
    // 라이트 모드: 고른 강조색을 진한 단계로 바꿔 흰 바탕에서도 글씨가 읽히게 (다크 모드는 원래 색 그대로)
    const A = light ? 'color-mix(in oklab, ' + (accent || '#9184d9') + ' 55%, #0b0b0b)' : (accent || '#9184d9');
    const ground = light ? '#ffffff' : '#161826';
    const hi = light ? '#1c1e2c' : '#ffffff';
    // 100(밝음)→900(어두움) on dark; 반대 on light
    const steps = light
      ? { 100: [hi, 55], 200: [hi, 65], 300: [hi, 78], 400: [hi, 90], 500: null, 600: [ground, 70], 700: [ground, 40], 800: [ground, 22], 900: [ground, 12] }
      : { 100: [hi, 30], 200: [hi, 50], 300: [hi, 68], 400: [hi, 85], 500: null, 600: [ground, 82], 700: [ground, 58], 800: [ground, 36], 900: [ground, 20] };
    const ramp = {};
    Object.keys(steps).forEach(k => {
      const st = steps[k];
      const v = st ? 'color-mix(in oklch, ' + A + ' ' + st[1] + '%, ' + st[0] + ')' : A;
      ramp[k] = v;
    });
    set['--color-accent'] = A; set['--color-accent-2'] = A;
    for (let i = 100; i <= 900; i += 100) { set['--color-accent-' + i] = ramp[i]; set['--color-accent-2-' + i] = ramp[i]; }
    Object.keys(set).forEach(k => el.style.setProperty(k, set[k]));
    el.style.colorScheme = light ? 'light' : 'dark';
    el.setAttribute('data-theme', light ? 'light' : 'dark');
    document.body.style.background = 'var(--color-bg)';
    document.body.style.color = 'var(--color-text)';
    this._appliedKeys = Object.keys(set);
    try { localStorage.setItem('sc.theme', JSON.stringify({ theme: theme, accent: accent || '#9184d9' })); } catch (e) {}
  }

  // ───── AI 비서 ─────
  // 기본: 무료 규칙형 (시스템 데이터로 직접 답함) · AI 연결 주소가 있으면 진짜 AI (환자 이름은 가려서 전송)
  _aiScroll = React.createRef();
  aiCfg() { try { return JSON.parse(localStorage.getItem('smartcare.ai.v1') || '{}') || {}; } catch (e) { return {}; } }
  aiMe() { const s = this.state; return (s.roster || []).find(m => m.id === s.userId) || {}; }
  aiYmd(d) { return this.planIso(d); }
  aiRange(q) {
    const t = this.todayIso(), td = new Date(t + 'T00:00:00'), Y = td.getFullYear(), M = td.getMonth();
    const ymd = (d) => this.aiYmd(d);
    if (/오늘/.test(q)) return { from: t, to: t, label: '오늘' };
    if (/어제/.test(q)) { const d = new Date(td); d.setDate(d.getDate() - 1); return { from: ymd(d), to: ymd(d), label: '어제' }; }
    if (/이번\s*주|금주/.test(q)) { const a = new Date(td); a.setDate(td.getDate() - ((td.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return { from: ymd(a), to: ymd(b), label: '이번 주' }; }
    if (/지난\s*주|저번\s*주/.test(q)) { const a = new Date(td); a.setDate(td.getDate() - ((td.getDay() + 6) % 7) - 7); const b = new Date(a); b.setDate(a.getDate() + 6); return { from: ymd(a), to: ymd(b), label: '지난주' }; }
    if (/지난\s*달|저번\s*달|전월/.test(q)) return { from: ymd(new Date(Y, M - 1, 1)), to: ymd(new Date(Y, M, 0)), label: (M === 0 ? 12 : M) + '월' };
    if (/올해|금년|연간/.test(q)) return { from: Y + '-01-01', to: t, label: Y + '년' };
    const m = /(\d{1,2})\s*월/.exec(q);
    if (m) { const mm = +m[1] - 1; const yy = mm > M ? Y - 1 : Y; return { from: ymd(new Date(yy, mm, 1)), to: ymd(new Date(yy, mm + 1, 0)), label: (mm + 1) + '월' }; }
    return { from: ymd(new Date(Y, M, 1)), to: ymd(new Date(Y, M + 1, 0)), label: '이번 달', def: true };
  }
  // 확정된 일지 → 출석 기록
  aiAttendance() {
    const s = this.state;
    const ss = Object.assign({}, s.sessions || {});
    if (s.activeSession) ss[s.activeSession] = Object.assign({}, ss[s.activeSession] || {}, { review: s.review, confirmed: s.confirmed });
    const rows = [];
    Object.keys(ss).forEach(k => {
      const v = ss[k]; if (!v || !v.confirmed) return;
      const [d, prog] = k.split('|'); if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
      const seen = {};
      (v.review || []).forEach(r => { if (r && r.id && !seen[r.id]) { seen[r.id] = 1; rows.push({ date: d, program: prog, id: r.id }); } });
    });
    return rows;
  }
  aiIssues() {
    const s = this.state, today = this.todayIso();
    const plans = (s.plans || []).filter(p => p.status !== '취소');
    const st = (p) => this.planBadges(p, s).logShort;
    const unwritten = plans.filter(p => p.date <= today && st(p) === '미작성').sort((a, b) => b.date.localeCompare(a.date));
    const review = plans.filter(p => st(p) === '검수').sort((a, b) => b.date.localeCompare(a.date));
    const inpt = PATIENTS.filter(p => (p.stay || '재원') === '재원');
    const noConsent = inpt.filter(p => p.consent !== '동의');
    const noPhoto = inpt.filter(p => !(s.photoUrls || {})[p.id]);
    return { unwritten, review, noConsent, noPhoto, todayPlans: plans.filter(p => p.date === today).sort((a, b) => String(a.start).localeCompare(String(b.start))) };
  }
  aiGo(patch, close) { return () => { this.setState(Object.assign({ aiOpen: close === false }, patch)); }; }
  aiReply(q) {
    const s = this.state, raw = (q || '').trim();
    const today = this.todayIso();
    const fmt = (d) => d.slice(5).replace('-', '/');
    const L = (t, c) => ({ t: t, c: c || '' });
    const goLogs = (tab) => this.aiGo({ pcView: 'logs', logTab: tab });
    const iss = this.aiIssues();
    // 1) 날짜별 할 일 · 일정 (오늘 · 내일 · 모레 · 요일 · 이번/다음 주 · 특정 날짜)
    const WDN = ['일', '월', '화', '수', '목', '금', '토'];
    const dayRange = (q) => {
      const td = new Date(today + 'T00:00:00');
      const ymd = (d) => this.aiYmd(d);
      const add = (n) => { const d = new Date(td); d.setDate(d.getDate() + n); return d; };
      if (/모레/.test(q)) { const d = add(2); return { from: ymd(d), to: ymd(d), label: '모레' }; }
      if (/내일/.test(q)) { const d = add(1); return { from: ymd(d), to: ymd(d), label: '내일' }; }
      if (/어제/.test(q)) { const d = add(-1); return { from: ymd(d), to: ymd(d), label: '어제' }; }
      if (/다음\s*주|담주|차주/.test(q)) { const a = add(7 - ((td.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return { from: ymd(a), to: ymd(b), label: '다음 주' }; }
      if (/이번\s*주|금주/.test(q)) { const a = add(-((td.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return { from: ymd(a), to: ymd(b), label: '이번 주' }; }
      const md = /(\d{1,2})\s*[월\/.\-]\s*(\d{1,2})\s*일?/.exec(q);
      if (md) { let y = td.getFullYear(); const d = new Date(y, +md[1] - 1, +md[2]); if (d < add(-60)) d.setFullYear(y + 1); return { from: ymd(d), to: ymd(d), label: (+md[1]) + '월 ' + (+md[2]) + '일' }; }
      const dOnly = /(\d{1,2})\s*일(?!정)/.exec(q);
      if (dOnly) { const d = new Date(td.getFullYear(), td.getMonth(), +dOnly[1]); if (d < add(-7)) d.setMonth(d.getMonth() + 1); return { from: ymd(d), to: ymd(d), label: (d.getMonth() + 1) + '월 ' + d.getDate() + '일' }; }
      const wd = /(다음\s*주\s*)?([월화수목금토일])요일/.exec(q);
      if (wd) { const target = WDN.indexOf(wd[2]); let diff = (target - td.getDay() + 7) % 7; if (wd[1]) diff += 7; const d = add(diff); return { from: ymd(d), to: ymd(d), label: (wd[1] ? '다음 주 ' : '') + wd[2] + '요일' }; }
      if (/오늘|브리핑/.test(q)) return { from: today, to: today, label: '오늘' };
      return null;
    };
    const askSched = /할\s*일|해야|일정|스케줄|프로그램\s*(있|뭐|무엇)|뭐\s*(있|하)|브리핑|오늘|내일|모레|요일|다음\s*주|이번\s*주/.test(raw)
      && !/통계|몇\s*(명|건|회)|실인원|참여\s*(인원|건수)/.test(raw)
      && !/어떻게|방법|하는\s*법|등록하|만들/.test(raw)
      && !PATIENTS.some(p => p.name && p.name.length >= 2 && raw.indexOf(p.name) >= 0);
    if (askSched) {
      const me = this.aiMe();
      const rg = dayRange(raw) || { from: today, to: today, label: '오늘' };
      const single = rg.from === rg.to;
      const dlab = (d) => fmt(d) + ' ' + WDN[new Date(d + 'T00:00:00').getDay()];
      const span = single ? dlab(rg.from) : dlab(rg.from) + ' ~ ' + dlab(rg.to);
      const list = (s.plans || []).filter(p => p.status !== '취소' && p.date >= rg.from && p.date <= rg.to)
        .sort((a, b) => (a.date + String(a.start)).localeCompare(b.date + String(b.start)));
      const lines = [];
      if (!list.length) {
        lines.push(L(rg.label + '(' + span + ')에는 등록된 프로그램 일정이 없습니다.'));
      } else {
        list.forEach(p => {
          const b = this.planBadges(p, s);
          const future = p.date > today;
          const tail = future ? ' — 예정' : ' — 일지 ' + b.logShort;
          const c = future ? '' : (b.logShort === '미작성' ? 'red' : b.logShort === '검수' ? 'amber' : 'green');
          lines.push(L((single ? '' : dlab(p.date) + ' ') + (p.start || '') + (p.end ? '~' + p.end : '') + ' ' + p.program + (p.place ? ' · ' + p.place : '') + (p.ward && p.ward !== '전체' ? ' · ' + p.ward : '') + tail, c));
        });
      }
      // 오늘이 포함된 질문일 때만 밀린 일지 · 검수 안내
      const incToday = rg.from <= today && rg.to >= today;
      const past = iss.unwritten.filter(p => p.date < today);
      if (incToday) {
        if (past.length) lines.push(L('지난 일정 중 일지 미작성 ' + past.length + '건 (가장 최근 ' + fmt(past[0].date) + ' ' + past[0].program + ')', 'red'));
        if (iss.review.length) lines.push(L('검수 기다리는 일지 ' + iss.review.length + '건', 'amber'));
        if (!past.length && !iss.review.length) lines.push(L('밀린 일지나 검수는 없습니다.', 'green'));
      }
      const actions = [{ label: '캘린더 열기', go: this.aiGo({ pcView: 'logs', logTab: 'calendar', calMonth: rg.from.slice(0, 7), planDay: single ? rg.from : null }) }];
      if (!list.length) actions.push({ label: '일정 등록', go: this.aiGo({ pcView: 'logs', logTab: 'calendar', calMonth: rg.from.slice(0, 7), planDay: single ? rg.from : null }) });
      if (incToday && (past.length || iss.review.length)) actions.push({ label: '일지 목록 · 검수', go: goLogs('list') });
      const head = rg.label === '오늘' ? (me.name ? me.name + '님, ' : '') + '오늘(' + span + ') 할 일' : rg.label + '(' + span + ') 일정';
      return { title: head, lines, actions, note: list.length ? '일정 ' + list.length + '건 · 취소된 일정 제외' : '' };
    }
    // 2) 미비사항 점검
    if (/미비|점검|누락|빠진|확인할|문제|미작성|검수|동의서|증명사진/.test(raw) && !/어떻게|방법|하는\s*법/.test(raw)) {
      const lines = [
        L('일지 미작성 ' + iss.unwritten.length + '건' + (iss.unwritten.length ? ' — ' + iss.unwritten.slice(0, 3).map(p => fmt(p.date) + ' ' + p.program).join(', ') + (iss.unwritten.length > 3 ? ' 외' : '') : ''), iss.unwritten.length ? 'red' : 'green'),
        L('검수 필요 ' + iss.review.length + '건' + (iss.review.length ? ' — ' + iss.review.slice(0, 3).map(p => fmt(p.date) + ' ' + p.program).join(', ') : ''), iss.review.length ? 'amber' : 'green'),
        L('동의 미완료 재원 환자 ' + iss.noConsent.length + '명' + (iss.noConsent.length ? ' — ' + iss.noConsent.slice(0, 4).map(p => p.name).join(', ') + (iss.noConsent.length > 4 ? ' 외' : '') : ''), iss.noConsent.length ? 'amber' : 'green'),
        L('증명사진 없는 재원 환자 ' + iss.noPhoto.length + '명' + (iss.noPhoto.length ? ' — ' + iss.noPhoto.slice(0, 4).map(p => p.name).join(', ') + (iss.noPhoto.length > 4 ? ' 외' : '') : ''), iss.noPhoto.length ? 'amber' : 'green')
      ];
      const actions = [];
      if (iss.unwritten.length || iss.review.length) actions.push({ label: '일지 목록 · 검수', go: goLogs('list') });
      if (iss.noConsent.length) actions.push({ label: '서면 동의서 관리', go: this.aiGo({ pcView: 'consent' }) });
      if (iss.noPhoto.length) actions.push({ label: '환자 등록 관리', go: this.aiGo({ pcView: 'patients' }) });
      return { title: '미비사항 점검', lines, actions };
    }
    // 3) 환자 찾기 · 참여 이력 (이름이 들어 있으면)
    const hit = PATIENTS.filter(p => p.name && p.name.length >= 2 && raw.indexOf(p.name) >= 0);
    if (hit.length || /환자.*(찾|검색|어디|정보)/.test(raw)) {
      if (!hit.length) {
        const tok = (raw.match(/[가-힣]{2,4}/g) || []).filter(w => !/환자|찾아|검색|정보|어디|알려|주세요|참여|이력/.test(w));
        const part = PATIENTS.filter(p => tok.some(w => (p.name || '').indexOf(w) >= 0)).slice(0, 6);
        if (!part.length) return { title: '환자를 찾지 못했습니다', lines: [L('환자 이름을 정확히 넣어 주세요. 예: "홍길동 참여 이력"')] };
        return { title: '비슷한 이름의 환자', lines: part.map(p => L(p.name + ' · ' + (p.room || '병실 미지정') + ' · ' + (p.stay || '재원'))), actions: part.slice(0, 3).map(p => ({ label: p.name + ' 상세', go: this.aiGo({ pcView: 'patients', sel: p.id, pdOpen: true }) })) };
      }
      const att = this.aiAttendance();
      const out = hit.slice(0, 3).map(p => {
        const mine = att.filter(r => r.id === p.id).sort((a, b) => b.date.localeCompare(a.date));
        const byProg = {}; mine.forEach(r => { byProg[r.program] = (byProg[r.program] || 0) + 1; });
        return [
          L(p.name + ' · ' + (p.room || '병실 미지정') + ' · ' + (p.stay || '재원') + (p.admit ? ' · 입원 ' + p.admit : '')),
          L('동의 ' + (p.consent || '확인전') + ' · 안면인식 ' + (p.face || '확인전') + ' · 증명사진 ' + ((s.photoUrls || {})[p.id] ? '있음' : '없음'), p.consent === '동의' ? 'green' : 'amber'),
          L(mine.length ? '참여 ' + mine.length + '회 · 최근 ' + fmt(mine[0].date) + ' ' + mine[0].program + ' · ' + Object.keys(byProg).map(k => k + ' ' + byProg[k]).join(', ') : '확정된 참여 기록이 없습니다', mine.length ? 'green' : '')
        ];
      });
      return { title: hit.length > 1 ? '환자 ' + hit.length + '명' : hit[0].name + '님 정보', lines: [].concat(...out), actions: hit.slice(0, 3).map(p => ({ label: p.name + ' 상세 열기', go: this.aiGo({ pcView: 'patients', sel: p.id, pdOpen: true }) })) };
    }
    // 4) 통계 질문
    if (/통계|몇\s*(명|건|회|번)|참여|실인원|건수|횟수|현황|많이/.test(raw)) {
      const rg = this.aiRange(raw);
      const progs = (s.programs || []).filter(p => raw.indexOf(p) >= 0);
      const wards = (s.wards || []).map(w => w.name).filter(w => raw.indexOf(w) >= 0);
      let att = this.aiAttendance().filter(r => r.date >= rg.from && r.date <= rg.to);
      if (progs.length) att = att.filter(r => progs.indexOf(r.program) >= 0);
      if (wards.length) att = att.filter(r => { const p = PATIENTS.find(x => x.id === r.id); return p && wards.some(w => (p.room || '').indexOf(w + ' ') === 0); });
      const people = new Set(att.map(r => r.id)).size;
      const sess = new Set(att.map(r => r.date + '|' + r.program)).size;
      const scope = rg.label + (wards.length ? ' · ' + wards.join(', ') : '') + (progs.length ? ' · ' + progs.join(', ') : ' · 전체 프로그램');
      const lines = [L('참여 ' + att.length + '건 · 실인원 ' + people + '명 · 진행 ' + sess + '회', 'green')];
      if (!progs.length && att.length) {
        const by = {}; att.forEach(r => { by[r.program] = by[r.program] || { n: 0, ids: new Set() }; by[r.program].n++; by[r.program].ids.add(r.id); });
        Object.keys(by).sort((a, b) => by[b].n - by[a].n).slice(0, 6).forEach(k => lines.push(L(k + ' — ' + by[k].n + '건 · ' + by[k].ids.size + '명')));
      }
      if (!att.length) lines.push(L('이 조건에 확정된 일지 기록이 없습니다. 미확정 일지는 통계에 들어가지 않습니다.'));
      return { title: scope + ' 통계', lines, note: '기간 ' + rg.from + ' ~ ' + rg.to + ' · 확정된 일지 기준', actions: [{ label: '통계 화면 열기', go: this.aiGo({ pcView: 'stats', statSec: 'all' }) }, { label: '출석부 열기', go: goLogs('attendance') }] };
    }
    // 5) 사용법 안내
    const FAQ = [
      { k: /일정.*(등록|추가|만들)/, t: '일정 등록', a: ['프로그램 › 캘린더에서 [＋ 일정 등록]을 누르거나, 날짜 칸을 두 번 누르면 바로 등록 창이 열립니다.', '프로그램·장소·대상 병동, 날짜·시간, 정원·담당자를 넣고 저장합니다. 반복 일정도 만들 수 있습니다.'], go: goLogs('calendar') },
      { k: /일지.*(작성|등록|쓰)/, t: '일지 작성', a: ['캘린더에서 일정을 눌러 [일지 작성하기]를 고르거나, 일지 목록에서 미작성 일지를 엽니다.', '현장사진을 올리면 AI가 얼굴을 찾아 참여자를 자동으로 채웁니다. 확인 후 [확정]하면 출석부에 반영됩니다.'], go: goLogs('list') },
      { k: /검수|확정/, t: '검수 · 확정', a: ['일지 목록 › 검수 필요에서 일지를 열고, 미확인 인물은 [환자 지정]으로 연결하거나 제외합니다.', '모두 확인되면 [확정]을 누릅니다. 확정된 일지만 출석부·통계에 들어갑니다.'], go: goLogs('list') },
      { k: /동의서|서명|동의/, t: '동의서', a: ['서면 동의서는 환자 관리 › 서면 동의서 관리에서 스캔본을 첨부하거나 [캡처해서 넣기]로 넣습니다.', '모바일 전자 동의는 휴대폰·태블릿 화면에서 서명받으면 PC에 자동으로 반영됩니다.'], go: this.aiGo({ pcView: 'consent' }) },
      { k: /증명\s*사진|얼굴\s*사진/, t: '증명사진', a: ['환자 등록 관리에서 환자를 열고 [환자 정보 수정]으로 올립니다.', '일지의 미확인 인물을 [환자 지정]하면 그 얼굴을 증명사진으로 쓸지 물어봅니다.'], go: this.aiGo({ pcView: 'patients' }) },
      { k: /EMR|붙여\s*넣|재원\s*명부/, t: 'EMR 붙여넣기', a: ['환자 등록 관리에서 [EMR 붙여넣기]를 누르고 EMR 재원환자 명부를 복사해 붙여 넣습니다.', '차트번호·입원일이 같으면 같은 환자로 보고 정보만 갱신하며, 명부에서 빠진 환자는 퇴원으로 분류됩니다.'], go: this.aiGo({ pcView: 'patients' }) },
      { k: /환자.*(등록|추가)/, t: '환자 등록', a: ['환자 등록 관리 화면의 [환자 등록]을 누르면 등록 창이 뜹니다. 증명사진 없이도 저장할 수 있습니다.'], go: this.aiGo({ pcView: 'patients' }) },
      { k: /인쇄|PDF|JPG|출력/, t: '인쇄 · 내려받기', a: ['통계 화면 위쪽의 [인쇄] [PDF] [JPG]로 통계마다 한 페이지씩 출력합니다.', '출석부도 같은 방식으로 인쇄할 수 있습니다.'], go: this.aiGo({ pcView: 'stats', statSec: 'all' }) },
      { k: /앨범|사진.*(모아|보기|다운)/, t: '앨범', a: ['프로그램 › 앨범에서 날짜·프로그램별로 현장사진을 모아 보고 원본으로 내려받습니다.'], go: goLogs('album') },
      { k: /비밀번호|계정|권한|담당자/, t: '계정 · 권한', a: ['설정 › 계정 · 권한에서 사용자 추가, 기능별 뷰/사용 권한, 비밀번호 지정·초기화를 합니다. (기관 관리자 이상)'], go: this.aiGo({ pcView: 'settings', setTab: 'staff' }) },
      { k: /병동|호실/, t: '병동 · 호실', a: ['설정 › 병동 · 호실에서 병동과 호실을 추가·수정하고 끌어서 순서를 바꿉니다.'], go: this.aiGo({ pcView: 'settings', setTab: 'ward' }) },
      { k: /라이트|다크|테마|색상|글씨\s*크기|화면\s*크기/, t: '화면 설정', a: ['위쪽 바의 화면 설정에서 라이트/다크 모드, 강조색, 화면 배율을 바꿀 수 있습니다. 설정은 기기마다 저장됩니다.'] }
    ];
    const f = FAQ.find(x => x.k.test(raw));
    if (f) return { title: f.t + ' 방법', lines: f.a.map(t => L(t)), actions: f.go ? [{ label: f.t + ' 화면 열기', go: f.go }] : [] };
    // 6) 모르는 질문
    return {
      title: '이렇게 물어보세요',
      lines: [L('"오늘 할 일" · "미비사항 점검"'), L('"이번 달 미술치료 참여 몇 명?" · "지난달 3병동 통계"'), L('"홍길동 참여 이력" (환자 이름)'), L('"일지 작성 방법" · "동의서 어떻게 받아?"')],
      note: this.aiCfg().url ? '' : '지금은 무료 규칙형이라 정해진 질문 위주로 답합니다. 시스템 관리자가 AI를 연결하면 자유롭게 물어볼 수 있습니다.'
    };
  }
  // 진짜 AI용 요약 (환자 이름은 '환자A'로 가림)
  aiContext(q) {
    const s = this.state, today = this.todayIso();
    const map = {}, back = {}; let n = 0;
    const tag = (name) => { if (!name) return ''; if (!map[name]) { const i = n++; const t = '환자' + (i < 26 ? String.fromCharCode(65 + i) : 'Z' + (i - 25)); map[name] = t; back[t] = name; } return map[name]; };
    const att = this.aiAttendance();
    const iss = this.aiIssues();
    const lines = ['오늘: ' + today, '기관: ' + (((s.orgs || []).find(o => o.id === (s.orgId || 'ORG1')) || {}).name || '')];
    lines.push('오늘 일정: ' + (iss.todayPlans.map(p => p.start + ' ' + p.program + ' 일지 ' + this.planBadges(p, s).logShort).join(' / ') || '없음'));
    lines.push('일지 미작성 ' + iss.unwritten.length + '건, 검수 필요 ' + iss.review.length + '건, 동의 미완료 ' + iss.noConsent.length + '명, 증명사진 없음 ' + iss.noPhoto.length + '명');
    lines.push('일정(최근·예정 40건): ' + (s.plans || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map(p => p.date + ' ' + p.start + ' ' + p.program + ' ' + p.status + ' 일지' + this.planBadges(p, s).logShort).join(' | '));
    const pts = PATIENTS.slice(0, 200).map(p => { const mine = att.filter(r => r.id === p.id); return tag(p.name) + '(' + (p.room || '') + ',' + (p.stay || '재원') + ',동의' + (p.consent || '확인전') + ',사진' + ((s.photoUrls || {})[p.id] ? 'O' : 'X') + ',참여' + mine.length + (mine.length ? ',최근' + mine.map(r => r.date).sort().pop() : '') + ')'; });
    lines.push('환자: ' + pts.join(' '));
    lines.push('출석(확정): ' + att.slice(-400).map(r => r.date + ' ' + r.program + ' ' + tag((PATIENTS.find(x => x.id === r.id) || {}).name)).join(' | '));
    let aq = q; Object.keys(map).sort((a, b) => b.length - a.length).forEach(nm => { aq = aq.split(nm).join(map[nm]); });
    return { context: lines.join('\n'), question: aq, back: back };
  }
  async aiAsk(q) {
    const text = (q || '').trim();
    if (!text) return;
    const msgs = (this.state.aiMsgs || []).concat([{ role: 'user', text: text }]);
    this.setState({ aiMsgs: msgs, aiInput: '', aiOpen: true }, () => this.aiScrollEnd());
    const cfg = this.aiCfg();
    const rule = this.aiReply(text);
    // 규칙형으로 확실히 답할 수 있는 질문(오늘·점검·통계·환자·사용법)은 바로 답함
    const known = rule.title !== '이렇게 물어보세요';
    if (!cfg.url || known) {
      this.setState({ aiMsgs: msgs.concat([Object.assign({ role: 'bot' }, rule)]) }, () => this.aiScrollEnd());
      return;
    }
    this.setState({ aiBusy: true });
    try {
      const ctx = this.aiContext(text);
      const c = this.cloudCfg && this.cloudCfg();
      const headers = c ? this.cloudHeaders(c, { 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      const r = await fetch(cfg.url, { method: 'POST', headers: headers, body: JSON.stringify({ question: ctx.question, context: ctx.context, history: msgs.slice(-6).map(m => ({ role: m.role, text: m.text || [m.title].concat((m.lines || []).map(l => l.t)).join('\n') })) }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      let ans = String(j.answer || j.text || '').trim();
      Object.keys(ctx.back).sort((a, b) => b.length - a.length).forEach(t => { ans = ans.split(t).join(ctx.back[t]); });
      if (!ans) throw new Error('빈 답변');
      this.setState({ aiBusy: false, aiMsgs: (this.state.aiMsgs || []).concat([{ role: 'bot', title: '', lines: ans.split('\n').filter(x => x.trim()).map(t => ({ t: t, c: '' })), note: 'AI 답변 · 환자 이름은 가려서 보냈습니다' }]) }, () => this.aiScrollEnd());
    } catch (e) {
      this.setState({ aiBusy: false, aiMsgs: (this.state.aiMsgs || []).concat([Object.assign({ role: 'bot' }, rule, { note: 'AI 연결에 실패해 규칙형으로 답했습니다 (' + (e.message || '오류') + ')' })]) }, () => this.aiScrollEnd());
    }
  }
  aiScrollEnd() { setTimeout(() => { const el = this._aiScroll.current; if (el) el.scrollTop = el.scrollHeight; }, 30); }
  aiVals(s) {
    if (!s.logged) return { aiShow: false };
    const iss = this.aiIssues();
    const past = iss.unwritten.filter(p => p.date < this.todayIso());
    const badge = past.length + iss.review.length;
    const uid = s.userId || 'u';
    const bKey = 'sc.aiBrief.' + uid;
    let seen = ''; try { seen = localStorage.getItem(bKey) || ''; } catch (e) {}
    const today = this.todayIso();
    const markSeen = () => { try { localStorage.setItem(bKey, today); } catch (e) {} };
    const cfg = this.aiCfg();
    const me = this.aiMe();
    const isSys = (Array.isArray(me.roles) ? me.roles : [me.role]).indexOf('시스템관리자') >= 0;
    const narrow = (s.vw || 1600) < 700;
    const dotC = { red: '#e03131', amber: '#e8890c', green: '#2b8a3e' };
    const welcome = { role: 'bot', title: '무엇을 도와드릴까요?', lines: [{ t: '오늘 할 일, 미비사항 점검, 통계, 환자 참여 이력, 사용법을 물어보세요.', c: '' }] };
    const msgs = (s.aiMsgs && s.aiMsgs.length) ? s.aiMsgs : [welcome];
    const chipQ = ['오늘 할 일', '내일 일정', '이번 주 일정', '미비사항 점검', '이번 달 통계', '일지 작성 방법'];
    return {
      aiShow: true,
      aiOpen: !!s.aiOpen,
      aiFabIcon: s.aiOpen ? 'ph ph-x' : 'ph-fill ph-sparkle',
      aiHasBadge: !s.aiOpen && badge > 0, aiBadge: badge > 99 ? '99+' : String(badge),
      aiToggle: () => { const o = !this.state.aiOpen; this.setState({ aiOpen: o }); if (o) this.aiScrollEnd(); },
      aiBriefShow: !s.aiOpen && !s.aiBriefClosed && seen !== today,
      aiBriefText: '오늘 일정 ' + iss.todayPlans.length + '건 · 밀린 일지 ' + past.length + '건 · 검수 ' + iss.review.length + '건',
      aiBriefOpen: () => { markSeen(); this.setState({ aiBriefClosed: true }); this.aiAsk('오늘 할 일'); },
      aiBriefClose: () => { markSeen(); this.setState({ aiBriefClosed: true }); },
      aiModeLabel: cfg.url ? 'AI 연결됨 · 환자 이름은 가려서 전송' : '무료 규칙형 · 시스템 데이터로 답변',
      aiCanSetup: isSys,
      aiSetupOpen: !!s.aiSetupOpen && isSys,
      aiSetupToggle: () => this.setState({ aiSetupOpen: !this.state.aiSetupOpen, aiUrlDraft: cfg.url || '' }),
      aiUrlDraft: s.aiUrlDraft != null ? s.aiUrlDraft : (cfg.url || ''),
      onAiUrl: (e) => this.setState({ aiUrlDraft: e.target.value }),
      aiUrlSave: () => {
        const u = (this.state.aiUrlDraft || '').trim();
        if (u && !/^https:\/\//.test(u)) { this.flash('https:// 로 시작하는 주소를 넣어 주세요'); return; }
        try { localStorage.setItem('smartcare.ai.v1', JSON.stringify({ url: u })); } catch (e) {}
        this.setState({ aiSetupOpen: false });
        this.flash(u ? 'AI 연결 주소 저장 — 모든 기기에 적용됩니다' : 'AI 연결을 해제했습니다 — 규칙형으로 동작');
      },
      aiUrlClear: () => { try { localStorage.setItem('smartcare.ai.v1', JSON.stringify({ url: '' })); } catch (e) {} this.setState({ aiSetupOpen: false, aiUrlDraft: '' }); this.flash('AI 연결을 해제했습니다 — 규칙형으로 동작'); },
      // 화면 배율(zoom)이 걸려 있어도 대화창이 위로 잘리지 않게, 배율을 나눈 실제 높이로 계산
      ...(() => {
        const z = (s.logged && s.device === 'pc') ? this.uiZoom() : 1;
        const vh = (typeof window !== 'undefined' ? window.innerHeight : 800) / z;
        const vw = (typeof window !== 'undefined' ? window.innerWidth : 1200) / z;
        const maxH = Math.max(260, Math.floor(vh - 94 - 16));
        const maxW = Math.max(280, Math.floor(vw - (narrow ? 24 : 44)));
        // 사용자가 조절한 크기 (기기마다 기억) — 화면 밖으로 넘치지 않게 제한
        let size = s.aiSize;
        if (size === undefined) { try { size = JSON.parse(localStorage.getItem('sc.aiSize') || 'null'); } catch (e) { size = null; } }
        const defW = narrow ? maxW : Math.min(400, maxW), defH = narrow ? maxH : Math.min(620, maxH);
        const W = size && size.w ? Math.max(300, Math.min(maxW, size.w)) : defW;
        const H = size && size.h ? Math.max(320, Math.min(maxH, size.h)) : defH;
        const start = (mode) => (e) => {
          if (e.button != null && e.button !== 0) return;
          e.preventDefault(); e.stopPropagation();
          const sx = e.clientX, sy = e.clientY, w0 = W, h0 = H;
          let last = { w: w0, h: h0 };
          const mv = (ev) => {
            const w = mode !== 'h' ? Math.max(300, Math.min(maxW, Math.round(w0 + (sx - ev.clientX) / z))) : w0;
            const h = mode !== 'w' ? Math.max(320, Math.min(maxH, Math.round(h0 + (sy - ev.clientY) / z))) : h0;
            last = { w, h };
            this.setState({ aiSize: last });
          };
          const up = () => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            document.body.style.userSelect = '';
            try { localStorage.setItem('sc.aiSize', JSON.stringify(last)); } catch (err) {}
          };
          document.body.style.userSelect = 'none';
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        };
        return {
          aiW: W + 'px', aiH: H + 'px',
          aiRight: narrow ? '12px' : '22px',
          aiRsW: start('w'), aiRsH: start('h'), aiRsWH: start('wh'),
          aiRsReset: () => { try { localStorage.removeItem('sc.aiSize'); } catch (e) {} this.setState({ aiSize: null }); }
        };
      })(),
      aiScrollRef: this._aiScroll,
      aiMsgs: msgs.map(m => m.role === 'user'
        ? { isUser: true, isBot: false, text: m.text }
        : { isUser: false, isBot: true, title: m.title || '', hasTitle: !!m.title,
            lines: (m.lines || []).map(l => ({ t: l.t, dotShow: l.c ? 'inline' : 'none', dotColor: dotC[l.c] || '#9aa3b2' })),
            note: m.note || '', hasNote: !!m.note,
            actions: m.actions || [], hasActions: !!(m.actions && m.actions.length) }),
      aiBusy: !!s.aiBusy,
      aiChips: chipQ.map(t => ({ label: t, go: () => this.aiAsk(t) })),
      aiInput: s.aiInput || '',
      onAiInput: (e) => this.setState({ aiInput: e.target.value }),
      aiKey: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.aiAsk(this.state.aiInput); } },
      aiSend: () => this.aiAsk(this.state.aiInput),
      aiClear: () => this.setState({ aiMsgs: [] })
    };
  }

  // ───── 화면 이동 기록 (뒤로가기) ─────
  static NAV_KEYS = ['pcView', 'logTab', 'setTab', 'mobileView', 'statTab'];
  navSnap(st) { const o = {}; Component.NAV_KEYS.forEach(k => { if (st[k] !== undefined) o[k] = st[k]; }); return o; }
  navSig(st) { return Component.NAV_KEYS.map(k => st[k] == null ? '' : st[k]).join('|'); }
  navTrack(prevState) {
    if (!prevState || !this.state.logged) return;
    if (this._navBacking) { this._navBacking = false; return; }
    this._navStack = this._navStack || [];
    this._navStack.push(prevState);
    if (this._navStack.length > 40) this._navStack.shift();
    // 브라우저 뒤로가기 · 마우스 뒤로 버튼도 같은 동작
    try { history.pushState({ sc: this._navStack.length }, ''); } catch (e) {}
    this.setState({ navDepth: this._navStack.length });
  }
  navGoBack() {
    const st = this._navStack || [];
    if (!st.length) return false;
    const prev = st.pop();
    this._navBacking = true;
    this.setState(Object.assign({}, prev, { navDepth: st.length, dialog: null, pdOpen: false, npOpen: false }));
    return true;
  }

  // 앨범 확대 보기: 아래 사진 목록에서 지금 보는 사진을 항상 가운데로
  centerAlStrip() {
    const st = this._alStripRef && this._alStripRef.current;
    if (!st) { this._alCentered = null; return; }
    const key = (this.state.alZoom || '') + '|' + (this.state.alThumbSize || '');
    if (key === this._alCentered) return;
    const el = st.querySelector('[data-zsel="1"]');
    if (!el) return;
    const first = this._alCentered == null;
    this._alCentered = key;
    st.scrollTo({ left: el.offsetLeft - (st.clientWidth - el.offsetWidth) / 2, behavior: first ? 'auto' : 'smooth' });
  }

  componentDidUpdate(prevProps, prevStateArg) {
    this.applyUiScale();
    this.centerAlStrip();

    // 실행 환경이 이전 상태를 넘겨주지 않으므로 직접 보관해 비교 (없으면 '변경 시 저장'이 전혀 동작하지 않음)
    const prevState = prevStateArg || this._prevState;
    // 뒤로가기 기록은 화면 위치만 따로 보관해 비교 (_prevState 갱신 시점과 무관하게 동작)
    const navNow = this.navSig(this.state);
    if (this._navLastSig != null && this._navLastSig !== navNow) this.navTrack(this._navLastSnap);
    this._navLastSig = navNow; this._navLastSnap = this.navSnap(this.state);
    // 화면이 다시 그려질 때마다 메뉴 높이 재확인 (위쪽 바·안내 띠가 늦게 생겨 메뉴가 밀리는 경우) — 값이 같으면 아무것도 안 함
    if (this._onSbScroll) this._onSbScroll();
    this._prevState = this.state;
    this.syncSigns();
    if (prevState && (prevState.logged !== this.state.logged || prevState.device !== this.state.device || prevState.cloudWarnHidden !== this.state.cloudWarnHidden || prevState.offline !== this.state.offline)) setTimeout(() => this.fitSidebar(), 50);
    // 사용자가 직접 바꾼 일지 표시 (서버·다른 기기에서 받은 변경, 첫 동기화 전 불러오기는 제외)
    if (prevState && this._workLoaded && !this._workApplying && (!this.cloudCfg() || this._cloudReady)) {
      this._sessDirty = this._sessDirty || {};
      const ck = this.curKey(this.state);
      if (this.curKey(prevState) === ck && (prevState.review !== this.state.review || prevState.confirmed !== this.state.confirmed || prevState.photos !== this.state.photos)) this._sessDirty[ck] = true;
      const ps = prevState.sessions || {}, ns = this.state.sessions || {};
      if (ps !== ns) Object.keys(ns).forEach(k => { if (ps[k] !== ns[k] && ps[k] && JSON.stringify(ps[k]) !== JSON.stringify(ns[k])) this._sessDirty[k] = true; else if (!ps[k] && ns[k] && ((ns[k].review || []).length || ns[k].confirmed || (ns[k].photos || []).length)) this._sessDirty[k] = true; });
    }
    if (prevState && Component.WORK_KEYS.some(k => prevState[k] !== this.state[k])) this.saveWork();
    if (prevState && prevState.review !== this.state.review && (this.state.review || []).some(r => r && r.crop && !Array.isArray(r.desc))) setTimeout(() => this.ensureReviewDescs(), 300);
    if (prevState && this._viewRestored && Component.VIEW_KEYS.some(k => prevState[k] !== this.state[k])) this.saveView();
    if (prevState && !this._cfApplying && this._cfLoaded && (prevState.consentFiles !== this.state.consentFiles || prevState.consentVia !== this.state.consentVia || prevState.cfDeleted !== this.state.cfDeleted)) this.saveCF();
    if (prevState && (prevState.roster !== this.state.roster || prevState.orgs !== this.state.orgs) && this.state.logged && !this._rosterT) {
      this.saveRoster(this.state.roster);
    }
    const el = this._planSplit.current;
    if (el === this._roEl) return;
    if (this._ro) this._ro.disconnect();
    this._roEl = el;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this._ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      const narrow = w > 0 && w < 820;
      if (narrow !== !!this.state.planNarrow) this.setState({ planNarrow: narrow });
      if (w > 0 && Math.abs(w - (this.state.planW || 0)) > 8) this.setState({ planW: Math.round(w) });
    });
    this._ro.observe(el);
  }

  // ───── 기관별 별도 저장 ─────
  // 가족사랑요양병원(ORG1)은 기존 저장 위치 그대로. 다른 기관은 'smartcare.o.<기관코드>.' 아래에 따로 저장.
  // 계정 · 기관 목록 · 화면 설정 같은 공용 항목만 모든 기관이 함께 씀.
  static GLOBAL_KEYS = ['roster.v1', 'orgs.v1', 'cloud.v1', 'viewMode.v1', 'menu.v1', 'menuCollapsed.v1', 'menuMini.v1', 'kpiView.v1', 'sbW.v1', 'flowView.v1', 'ptCols.v1', 'emrCols.v1', 'cformLib.v1', 'approval.v1', 'theme.v1', 'cformMargin.v1'];
  static sysOrg(orgs) {
    let v = null;
    try { v = window.localStorage.getItem('sc.sysOrg.v1'); } catch (e) {}
    const list = orgs || [];
    return (v && list.some(o => o.id === v)) ? v : ((list[0] || {}).id || 'ORG1');
  }
  static isGlobalKey(rest) { return Component.GLOBAL_KEYS.indexOf(rest) >= 0 || rest.indexOf('chart.') === 0; }
  static nsKey(k) {
    const org = window.__scOrg || 'ORG1';
    if (typeof k !== 'string' || k.indexOf('smartcare.') !== 0 || k.indexOf('smartcare.o.') === 0 || org === 'ORG1') return k;
    const rest = k.slice(10);
    return Component.isGlobalKey(rest) ? k : 'smartcare.o.' + org + '.' + rest;
  }
  // 저장 키 → 이 기관 화면에서 쓰는 키 (다른 기관 키면 null)
  static unKey(k) {
    const org = window.__scOrg || 'ORG1';
    if (typeof k !== 'string' || k.indexOf('smartcare.') !== 0) return k;
    if (k.indexOf('smartcare.o.') === 0) {
      const pre = 'smartcare.o.' + org + '.';
      return k.indexOf(pre) === 0 ? 'smartcare.' + k.slice(pre.length) : null;
    }
    if (org === 'ORG1') return k;
    return Component.isGlobalKey(k.slice(10)) ? k : null;
  }
  static installOrgNs() {
    // 로그인한 기관을 데이터를 읽기 전에 정함 (마지막 로그인 화면 기록 기준)
    try {
      const v = JSON.parse(window.localStorage.getItem('sc.lastView.v1') || 'null');
      window.__scOrg = (v && v.logged && v.orgId && Date.now() - (v.at || 0) < 12 * 3600 * 1000) ? v.orgId : (window.__scOrg || 'ORG1');
    } catch (e) { window.__scOrg = window.__scOrg || 'ORG1'; }
    const proto = Storage.prototype;
    if (proto.__scNs) return;
    proto.__scNs = true;
    const g = proto.getItem, r = proto.removeItem;
    proto.__scGet = g;
    proto.getItem = function (k) { return g.call(this, this === window.localStorage ? Component.nsKey(k) : k); };
    proto.removeItem = function (k) { return r.call(this, this === window.localStorage ? Component.nsKey(k) : k); };
    // 이 기관의 키 목록 (화면에서 쓰는 이름으로)
    window.__scKeys = () => Object.keys(window.localStorage).map(k => Component.unKey(k)).filter(Boolean);
  }

  componentDidMount() {
    this._onPop = () => { if (!this.navGoBack()) { /* 기록이 없으면 그대로 */ } };
    window.addEventListener('popstate', this._onPop);
    this._onNavKey = (e) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this.navGoBack(); }
      else if (e.key === 'Backspace' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) { if (this.navGoBack()) e.preventDefault(); }
    };
    window.addEventListener('keydown', this._onNavKey);
    Component.installOrgNs();
    if (this.state.orgId !== window.__scOrg) this.setState({ orgId: window.__scOrg });
    setTimeout(() => this.componentDidUpdate(), 0);
    try {
      const w = JSON.parse(localStorage.getItem('smartcare.work.v1') || 'null');
      if (w) { this._workLast = JSON.stringify(w); this.setState(this.workPatch(w)); }
      // 서면 첨부: 별도 키 + (예전 버전) 업무 데이터 안에 있던 첨부를 합쳐서 불러옴
      const legacy = w && w.consentFiles ? { files: w.consentFiles, via: w.consentVia || {} } : {};
      const cf = this.mergeCF(this.loadCF(), legacy);
      this.setState({ consentFiles: cf.files, consentVia: cf.via, cfDeleted: cf.deleted }, () => { this._cfLoaded = true; if (w && w.consentFiles) this.saveCF(); });
    } catch (e) { this._cfLoaded = true; }
    // 일지별로 따로 저장된 값 불러오기 (일지 목록에 합침)
    try {
      this._sessSaved = this._sessSaved || {};
      const add = {};
      (window.__scKeys ? window.__scKeys() : Object.keys(localStorage)).filter(k => k.indexOf(Component.WSESS_PREFIX) === 0).forEach(k => {
        const raw = localStorage.getItem(k);
        try { const key = decodeURIComponent(k.slice(Component.WSESS_PREFIX.length)); const pv = JSON.parse(raw); this._sessSaved[key] = raw; if (pv && pv.deleted) { this._sessDel = this._sessDel || {}; this._sessDel[key] = true; } else add[key] = pv; } catch (e) {}
      });
      if (Object.keys(add).length) {
        const h = this.hydratePhotos({ sessions: add });
        const sessions = Object.assign({}, this.state.sessions || {}, h.sessions);
        const cur = sessions[this.curKey(this.state)];
        this.setState(Object.assign({ sessions }, cur ? { review: cur.review || [], confirmed: !!cur.confirmed, photos: cur.photos || [] } : {}));
      }
    } catch (e) {}
    setTimeout(() => { this._workLoaded = true; this.compactWork(); }, 0);
    try {
      const ro = JSON.parse(localStorage.getItem('smartcare.roster.v1') || 'null');
      if (Array.isArray(ro) && ro.length && ro.some(x => x.org === '*')) this.setState({ roster: ro });
      const og = JSON.parse(localStorage.getItem('smartcare.orgs.v1') || 'null');
      if (Array.isArray(og) && og.length) this.setState({ orgs: og });
    } catch (e) {}
    // 계정 목록을 불러온 뒤 마지막 화면 복원
    setTimeout(() => { this.restoreView(); this._viewRestored = true; this.writeView(); }, 0);
    this._onUnloadView = () => { if (this._viewRestored) this.writeView(); };
    window.addEventListener('beforeunload', this._onUnloadView);
    window.addEventListener('pagehide', this._onUnloadView);
    try {
      const t = JSON.parse(localStorage.getItem('sc.theme') || 'null');
      const theme = t && t.theme === 'light' ? 'light' : 'dark';
      const accent = t && /^#[0-9a-f]{6}$/i.test(t.accent) ? t.accent : '#9184d9';
      this.setState({ theme: theme, accent: accent });
      this.applyTheme(theme, accent);
    } catch (e) {}
    try { const v = parseInt(localStorage.getItem('sc.calPct'), 10); if (v >= 30 && v <= 92) this.setState({ calPct: v }); } catch (e) {}
    try { const v = parseInt(localStorage.getItem('sc.cpPct'), 10); if (v >= 30 && v <= 70) this.setState({ cpPct: v }); } catch (e) {}
    try { const b = parseInt(localStorage.getItem('smartcare.calBg.v1'), 10); if (b >= 0 && b < 6) this.setState({ calBgi: b }); } catch (e) {}
    try {
      const pl = JSON.parse(localStorage.getItem('smartcare.plans.v1') || 'null');
      if (Array.isArray(pl)) this.setState({ plans: pl });
    } catch (e) {}
    try {
      let list = JSON.parse(localStorage.getItem('smartcare.patients.v1') || 'null');
      // 가상 환자 1회 정리: 저장된 명부에서 데모 환자(PT-0001~0008) 제거
      if (Array.isArray(list) && !localStorage.getItem('smartcare.dummyPurged.v1')) {
        list = list.filter(p => DUMMY_IDS.indexOf(p.id) < 0);
        localStorage.setItem('smartcare.patients.v1', JSON.stringify(list));
        localStorage.setItem('smartcare.dummyPurged.v1', '2026-10-12');
      }
      if (Array.isArray(list) && list.length) { PATIENTS.length = 0; list.forEach(p => PATIENTS.push(p)); }
      const phRaw = JSON.parse(localStorage.getItem('smartcare.idphotos.v1') || 'null');
      if (phRaw && phRaw.__idx) this._blobV2 = true;
      const ph = this.idphFromStored(phRaw);
      if (ph && typeof ph === 'object') { Object.keys(ph).forEach(id => { this._idphCache[id] = ph[id]; }); this.setState({ photoUrls: ph }); }
      if (Array.isArray(list) && list.length) { this.syncToRoster(); this.forceUpdate(); }
    } catch (e) {}
    // 실시간 연동: 다른 창(PC ↔ 현장 앱)에서 저장하면 즉시 반영
    this._onStorage = (e0) => {
      // 저장 키를 이 기관 화면의 키로 바꿈 — 다른 기관 데이터는 무시
      const uk = e0 && e0.key ? Component.unKey(e0.key) : null;
      if (!uk) return;
      const e = { key: uk, newValue: e0.newValue };
      if (e.key.indexOf('smartcare.') !== 0) return;
      // 현장사진은 사진마다 별도 키로 저장 (업무 데이터가 커져 서버 전송이 실패하지 않게)
      if (e.key.indexOf(Component.WPH_PREFIX) === 0) {
        const id = e.key.slice(Component.WPH_PREFIX.length);
        if (e.newValue) { this._wphCache[id] = e.newValue; this._wphSaved[id] = true; }
        const hp = this.hydratePhotos({ photos: this.state.photos, sessions: this.state.sessions });
        if (hp.changed) { this._workApplying = true; this.setState({ photos: hp.photos, sessions: hp.sessions }); setTimeout(() => { this._workApplying = false; }, 50); }
        return;
      }
      if (e.key.indexOf(Component.WSESS_PREFIX) === 0) {
        if (e.newValue) this.applyRemoteSession(decodeURIComponent(e.key.slice(Component.WSESS_PREFIX.length)), e.newValue);
        return;
      }
      if (e.key === Component.CFLIB_KEY) { this.setState({ cformRev: (this.state.cformRev || 0) + 1 }); return; }
      try {
        const v = e.newValue ? JSON.parse(e.newValue) : null;
        if (e.key === Component.CF_KEY && v) {
          this.applyCF(v);
          if (!this._cloudQuiet) this.flash('서면 동의서 첨부가 다른 기기와 동기화되었습니다');
        } else if (e.key === 'smartcare.work.v1' && v) {
          this._workApplying = true;
          this._workLast = e.newValue;
          this.setState(this.workPatchRemote(v));
          setTimeout(() => { this._workApplying = false; this.compactWork(); }, 50);
          if (v.consentFiles) this.applyCF({ files: v.consentFiles, via: v.consentVia || {} });
        } else if (e.key === 'smartcare.consentForm.v1' || e.key === 'smartcare.notify.v1') {
          this.forceUpdate();
        } else if (e.key === 'smartcare.patients.v1' && Array.isArray(v)) {
          PATIENTS.length = 0; v.forEach(p => PATIENTS.push(p));
          this.syncToRoster();
          this.setState({ ptTick: (this.state.ptTick || 0) + 1, mcTick: (this.state.mcTick || 0) + 1 });
          if (!this._cloudQuiet) this.flash('다른 화면에서 환자 명부가 변경되어 반영했습니다');
        } else if (e.key === 'smartcare.idphotos.v1' && v) {
          if (v.__idx) this._blobV2 = true;
          const m = this.idphFromStored(v);
          if (m) { Object.keys(m).forEach(id => { this._idphCache[id] = m[id]; this._idphSent[id] = (m[id] || '').length; }); this.setState({ photoUrls: m }); }
        } else if (e.key === 'smartcare.roster.v1' && Array.isArray(v)) {
          this.setState({ roster: v });
        } else if (e.key === 'smartcare.orgs.v1' && Array.isArray(v)) {
          this.setState({ orgs: v });
        } else if (e.key === 'smartcare.emrCols.v1' && Array.isArray(v)) {
          this.setState({ emrCols: v });
        } else if (e.key === 'smartcare.emrLast.v1' && v && v.at) {
          this.setState({ emrLast: v });
        } else if (e.key === 'smartcare.emrUndo.v1' && Array.isArray(v)) {
          this._emrUndoList = v;
          this.setState({ emrUndo: v.map(x => ({ at: x.at, by: x.by, reason: x.reason, n: (x.patients || []).length })) });
        } else if (e.key === 'smartcare.wards.v1' && Array.isArray(v)) {
          this.setState({ wards: JSON.parse(JSON.stringify(v)), wardsSaved: v });
        } else if (e.key === 'smartcare.plans.v1' && Array.isArray(v)) {
          this.setState({ plans: v });
        } else if (e.key === 'smartcare.signs.v1') {
          this.setState({ signImgsFor: null, mcTick: (this.state.mcTick || 0) + 1 });
        } else if (e.key === 'smartcare.menu.v1') {
          this.setState({ menuOrder: v || {} });
        } else if (e.key === 'smartcare.mconsent.v1') {
          // 전자 동의가 들어오면 해당 환자의 동의 상태(명부)도 함께 맞춤
          try {
            Object.keys(v || {}).forEach(pid => {
              const rec = v[pid], p = PATIENTS.find(x => x.id === pid);
              if (!rec || !p) return;
              if (rec.portrait !== undefined) p.consent = rec.portrait ? '동의' : '미동의';
              if (rec.face !== undefined) p.face = rec.face ? '동의' : '미동의';
            });
          } catch (er) {}
          this.setState({ mcTick: (this.state.mcTick || 0) + 1, ptTick: (this.state.ptTick || 0) + 1 });
          if (!this._cloudQuiet) this.flash('현장 앱에서 받은 전자 동의가 반영되었습니다');
        }
        this.forceUpdate();
      } catch (err) {}
    };
    window.addEventListener('storage', this._onStorage);
    try {
      const mo = JSON.parse(localStorage.getItem('smartcare.menu.v1') || 'null');
      const mc = JSON.parse(localStorage.getItem('smartcare.menuCollapsed.v1') || 'null');
      const mm = localStorage.getItem('smartcare.menuMini.v1') === '1';
      const kvSaved = localStorage.getItem('smartcare.kpiView.v1');
      if (kvSaved === 'ring' || kvSaved === 'trend' || kvSaved === 'panel') this.setState({ kpiView: kvSaved });
      const sw = parseInt(localStorage.getItem('smartcare.sbW.v1') || '', 10);
      this.setState({ menuOrder: mo || {}, menuCollapsed: mc || {}, menuMini: mm, sbW: sw >= 190 && sw <= 440 ? sw : 248 });
    } catch (e) {}
    // 서면 동의서 화면: Ctrl+V 붙여넣기 / 캡처 도구에서 돌아오면 자동 첨부
    this._onPaste = (e) => {
      if (e.__scHandled) return; e.__scHandled = true;
      // 얼굴 오려내기 창이 열려 있으면 붙여넣은 이미지 = 오려낼 단체 사진
      if (this.state.faceCrop) {
        const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.type && x.type.indexOf('image/') === 0);
        const f = it && it.getAsFile();
        if (f) {
          e.preventDefault();
          const rd = new FileReader();
          rd.onload = () => this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { src: rd.result, box: null, zoom: 0, nw: 0, nh: 0 }) });
          rd.readAsDataURL(f);
        }
        return;
      }
      // 환자 등록 창이 열려 있으면 붙여넣은 이미지 = 증명사진
      // 증명사진 확인 창(미확인 얼굴 → 환자 지정)이 열려 있으면 붙여넣은 이미지를 그 환자 증명사진으로
      if (this.state.idPrompt) {
        const img = Array.from((e.clipboardData && e.clipboardData.files) || []).find(f => /^image\/(png|jpeg|gif)$/.test(f.type));
        if (!img) return;
        e.preventDefault();
        this._lastCapSig = img.size + '|' + img.type; this._lastCapAt = Date.now();
        clearInterval(this._capPoll);
        this.setState({ capWaiting: false, capFor: null });
        this.acceptIdpFile(img, '캡처한 사진');
        return;
      }
      if (this.state.npOpen) {
        const img = Array.from((e.clipboardData && e.clipboardData.files) || []).find(f => /^image\/(png|jpeg|gif)$/.test(f.type));
        if (!img) return;
        e.preventDefault();
        this._lastCapSig = img.size + '|' + img.type; this._lastCapAt = Date.now();
        clearInterval(this._capPoll);
        this.setState({ capWaiting: false, capFor: null });
        if (this._acceptIdPhoto) this._acceptIdPhoto(img.name && img.name !== 'image.png' ? img : new File([img], this.capName(img.type), { type: img.type }));
        return;
      }
      if (this.state.pcView !== 'consent' || !this.state.cpPicked) return;
      const tag = (e.target && e.target.tagName) || '';
      const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => /^image\/(png|jpeg|gif)$/.test(f.type) || f.type === 'application/pdf');
      if (!files.length) return;
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && !files.length) return;
      e.preventDefault();
      // Ctrl+V로 넣은 이미지는 이후 포커스 자동첨부에서 다시 들어오지 않게 기록
      if (files[0]) { this._lastCapSig = files[0].size + '|' + files[0].type; this._lastCapAt = Date.now(); }
      clearInterval(this._capPoll);
      const named = files.map(f => f.name && f.name !== 'image.png' ? f : new File([f], this.capName(f.type), { type: f.type }));
      this.setState({ capWaiting: false });
      if (this._addConsentFiles) this._addConsentFiles(named);
    };
    // 캡처 도구에서 이 창으로 돌아오는 순간 바로 클립보드를 읽어 자동으로 넣음
    this._onCapFocus = () => {
      if (!this.state.capWaiting) return;
      [150, 600, 1500].forEach(ms => setTimeout(async () => {
        if (!this.state.capWaiting || this._capReading) return;
        this._capReading = true;
        try { await this.readClipboardCapture(false); } finally { this._capReading = false; }
      }, ms));
    };
    if (window.__scVis) document.removeEventListener('visibilitychange', window.__scVis);
    this._onVis = () => { if (document.visibilityState === 'visible') this._onCapFocus(); };
    window.__scVis = this._onVis;
    document.addEventListener('visibilitychange', this._onVis);
    // 이전에 등록된 리스너가 남아 있으면 제거 (중복 첨부 방지)
    if (window.__scPaste) window.removeEventListener('paste', window.__scPaste);
    if (window.__scCapFocus) window.removeEventListener('focus', window.__scCapFocus);
    window.__scPaste = this._onPaste; window.__scCapFocus = this._onCapFocus;
    window.addEventListener('paste', this._onPaste);
    window.addEventListener('focus', this._onCapFocus);
    this._onResize = () => {
      this._uiVh = null;
      if (this.state.uiScale === 'auto') this._uiZ = null;
      this.applyUiScale();
      const z = (this.state.logged && this.state.device === 'pc') ? this.uiZoom() : 1;
      const w = Math.round(window.innerWidth / z); if (w !== this.state.vw) this.setState({ vw: w }); this.fitSidebar();
    };
    window.addEventListener('resize', this._onResize);
    this._onSbScroll = () => { if (this._sbRaf) return; this._sbRaf = requestAnimationFrame(() => { this._sbRaf = 0; this.fitSidebar(); }); };
    window.addEventListener('scroll', this._onSbScroll, { passive: true });
    setTimeout(() => this.fitSidebar(), 300);
    this.startVersionWatch();
    this.initUiScale();
    // 메뉴 위쪽(상단 바·안내 띠 등) 높이가 바뀌면 메뉴 높이도 다시 맞춤
    if (window.ResizeObserver && !this._sbRo) {
      this._sbRo = new ResizeObserver(() => this._onSbScroll && this._onSbScroll());
      this._sbRo.observe(document.body);
    }
    this._onResize();
    this.cloudInit();
    // 파일을 화면에 끌어다 놓아도 편집 모드로 넘어가지 않도록 가로채고, 업로드 영역으로만 전달
    this._dropGuard = (e) => {
      const dt = e.dataTransfer;
      const types = dt && dt.types ? Array.from(dt.types) : [];
      if (types.indexOf('Files') < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const zone = e.target && e.target.closest ? e.target.closest('[data-drop]') : null;
      if (e.type !== 'drop') {
        try { dt.dropEffect = zone ? 'copy' : 'none'; } catch (err) {}
        return;
      }
      if (!zone) { this.flash('사진은 업로드 영역에 놓아 주세요'); return; }
      const fn = this._dropHandlers && this._dropHandlers[zone.getAttribute('data-drop')];
      if (fn) fn(Array.from(dt.files || []));
    };
    ['dragenter', 'dragover', 'drop'].forEach(t => {
      window.addEventListener(t, this._dropGuard, true);
      document.addEventListener(t, this._dropGuard, true);
    });
    try { const ec = JSON.parse(localStorage.getItem('smartcare.emrCols.v1') || 'null'); if (Array.isArray(ec) && ec.length) this.setState({ emrCols: ec }); } catch (e) {}
    try { const el = JSON.parse(localStorage.getItem('smartcare.emrLast.v1') || 'null'); if (el && el.at) this.setState({ emrLast: el }); } catch (e) {}
    try { const eu = JSON.parse(localStorage.getItem('smartcare.emrUndo.v1') || 'null'); if (Array.isArray(eu)) this.setState({ emrUndo: eu.map(x => ({ at: x.at, by: x.by, reason: x.reason, n: (x.patients || []).length })) }); } catch (e) {}
    try { const fv = localStorage.getItem('smartcare.flowView.v1'); if (fv) this.setState({ flowView: fv }); } catch (e) {}
    try { const pc = JSON.parse(localStorage.getItem('smartcare.ptCols.v1') || 'null'); if (Array.isArray(pc)) this.setState({ ptCols: pc }); } catch (e) {}
    try {
      const saved = JSON.parse(localStorage.getItem('smartcare.wards.v1') || 'null');
      if (Array.isArray(saved) && saved.length) this.setState({ wards: JSON.parse(JSON.stringify(saved)), wardsSaved: saved });
    } catch (e) {}
    this._esc = (e) => { if (e.key === 'Escape' && this.state.zoom) this.setState({ zoom: null }); };
    window.addEventListener('keydown', this._esc);
  }

  _idInput = React.createRef();
  _siteInput = React.createRef();
  _consentInput = React.createRef();
  _statsRef = React.createRef();
  _sbRef = React.createRef();
  _fcStage = React.createRef();
  _fcFile = React.createRef();

  // ───── 앨범 (프로그램 사진 아카이브) ─────
  albumVals(s) {
    const today = this.todayIso();
    const iso = (d) => this.planIso(d);
    const td = new Date(today + 'T00:00:00');
    const m0 = new Date(td.getFullYear(), td.getMonth(), 1), m1 = new Date(td.getFullYear(), td.getMonth() + 1, 0);
    const lm0 = new Date(td.getFullYear(), td.getMonth() - 1, 1), lm1 = new Date(td.getFullYear(), td.getMonth(), 0);
    const q3 = new Date(td.getFullYear(), td.getMonth() - 2, 1);
    const from = s.alFrom || iso(q3), to = s.alTo || today;
    const prog = s.alProg || '전체', ward = s.alWard || '전체', st = s.alState || '전체', q = (s.alQ || '').trim();
    const sess = Object.assign({}, s.sessions || {});
    if (s.activeSession) sess[s.activeSession] = Object.assign({}, sess[s.activeSession] || {}, { review: s.review, confirmed: s.confirmed, photos: s.photos });
    const COLORS = ['oklch(0.72 0.14 285)', 'oklch(0.74 0.11 200)', 'oklch(0.76 0.13 150)', 'oklch(0.80 0.12 85)', 'oklch(0.72 0.14 30)', 'oklch(0.74 0.13 335)'];
    const progs = (s.programs || []).slice();
    const colorOf = (p) => COLORS[Math.max(0, progs.indexOf(p)) % COLORS.length];
    const wardOfPlan = (d, p) => { const pl = (s.plans || []).find(x => x.date === d && x.program === p); return pl ? (pl.ward || '전체') : ''; };
    const pName = (id) => (PATIENTS.find(x => x.id === id) || {}).name || '';
    const sel = s.alSel || {};
    const groups = [];
    Object.keys(sess).forEach(k => {
      const v = sess[k] || {};
      const [d, p] = k.split('|');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || d < from || d > to) return;
      if (prog !== '전체' && p !== prog) return;
      const photos = (v.photos || []).filter(x => x && x.url);
      if (!photos.length) return;
      const rv = (v.review || []).filter(r => r && r.id);
      const stt = v.confirmed && rv.length ? '확정' : '검수 필요';
      if (st !== '전체' && st !== stt) return;
      const wd = wardOfPlan(d, p);
      if (ward !== '전체') {
        const roomsOk = rv.some(r => ((PATIENTS.find(x => x.id === r.id) || {}).room || '').indexOf(ward + ' ') === 0);
        if (!(String(wd).split(',').map(x => x.trim()).indexOf(ward) >= 0 || roomsOk)) return;
      }
      const names = rv.map(r => pName(r.id)).filter(Boolean);
      if (q && !names.some(n => n.indexOf(q) >= 0)) return;
      groups.push({ key: k, d: d, p: p, photos: photos, names: names, state: stt, ward: wd });
    });
    groups.sort((a, b) => (b.d + b.p).localeCompare(a.d + a.p));
    const fileName = (g, i, url) => {
      const ext = /^data:image\/png/.test(url) ? 'png' : /^data:image\/gif/.test(url) ? 'gif' : 'jpg';
      return g.d + '_' + g.p.replace(/[\\/:*?"<>|\s]+/g, '') + '_' + String(i + 1).padStart(2, '0') + '.' + ext;
    };
    const all = [];
    groups.forEach(g => g.photos.forEach((ph, i) => all.push({ g: g, i: i, ph: ph, id: g.key + '#' + (ph.id || i), name: fileName(g, i, ph.url || '') })));
    const real = (u) => u && u.indexOf('wph:') !== 0;
    const selList = all.filter(x => sel[x.id]);
    const busy = !!s.alBusy;
    const dl = (items, zipName) => this.albumDownload(items, zipName);
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    const zi = s.alZoom != null ? all.findIndex(x => x.id === s.alZoom) : -1;
    const zx = zi >= 0 ? all[zi] : null;
    const presets = [
      { label: '이번 달', f: iso(m0), t: iso(m1) },
      { label: '지난 달', f: iso(lm0), t: iso(lm1) },
      { label: '최근 3개월', f: iso(q3), t: today },
      { label: '전체', f: '2000-01-01', t: today }
    ];
    // ── 2b: 왼쪽 그룹 목록(프로그램별 / 일자별) + 오른쪽 사진판 ──
    const mode = s.alMode || 'prog';
    const fmtD = (d) => { const dt = new Date(d + 'T00:00:00'); return (dt.getMonth() + 1) + '/' + dt.getDate() + ' (' + WD[dt.getDay()] + ')'; };
    // 3단 폴더: 프로그램별 = 프로그램 › 월 › 날짜 / 일자별 = 월 › 날짜 › 프로그램
    const ymLabel = (ym) => ym.slice(0, 4) + '년 ' + (+ym.slice(5, 7)) + '월';
    const dayLabel = (d) => { const dt = new Date(d + 'T00:00:00'); return dt.getDate() + '일 (' + WD[dt.getDay()] + ')'; };
    const uniqBy = (arr, f) => [...new Set(arr.map(f))];
    const heads = [];
    if (mode === 'prog') {
      uniqBy(groups, g => g.p).sort((a, b) => progs.indexOf(a) - progs.indexOf(b)).forEach(p => {
        const gp = groups.filter(g => g.p === p);
        heads.push({ key: 'P:' + p, label: p, color: colorOf(p), icon: 'folder', groups: gp,
          kids: uniqBy(gp, g => g.d.slice(0, 7)).map(ym => {
            const gm = gp.filter(g => g.d.slice(0, 7) === ym);
            return { key: 'M:' + p + '|' + ym, label: ymLabel(ym), icon: 'cal', groups: gm, kids: gm.map(g => ({ key: 'S:' + g.key, label: dayLabel(g.d), groups: [g], kids: [] })) };
          }) });
      });
    } else {
      uniqBy(groups, g => g.d.slice(0, 7)).forEach(ym => {
        const gm = groups.filter(g => g.d.slice(0, 7) === ym);
        heads.push({ key: 'Y:' + ym, label: ymLabel(ym), color: 'var(--color-accent)', icon: 'cal', groups: gm,
          kids: uniqBy(gm, g => g.d).map(d => {
            const gd = gm.filter(g => g.d === d);
            return { key: 'D:' + d, label: dayLabel(d), icon: 'day', groups: gd, kids: gd.map(g => ({ key: 'S:' + g.key, label: g.p, color: colorOf(g.p), groups: [g], kids: [] })) };
          }) });
      });
    }
    const cnt = (gs) => gs.reduce((n, g) => n + g.photos.length, 0);
    const flatAll = []; const walk = (n, lv, parents) => { flatAll.push({ n: n, lv: lv, parents: parents }); (n.kids || []).forEach(k => walk(k, lv + 1, parents.concat([n.key]))); };
    heads.forEach(h => walk(h, 0, []));
    const curEntry = flatAll.find(x => x.n.key === s.alCur) || flatAll[0];
    const cur = curEntry ? curEntry.n.key : '';
    const curHead = curEntry ? curEntry.n : null;
    const open = s.alOpen || {};
    // 처음엔 맨 위 폴더와 첫 월만 펼침, 고른 항목의 상위 폴더는 항상 펼침
    const isOpen = (key, lv, idx) => open[key] != null ? open[key] : (lv === 0 || (curEntry && curEntry.parents.indexOf(key) >= 0) || idx === 0);
    const secGroups = curHead ? curHead.groups : [];
    const curItems = all.filter(x => secGroups.indexOf(x.g) >= 0);
    const tile = (x, list) => {
      const on = !!sel[x.id], ok = real(x.ph.url);
      return {
        n: (x.i + 1) + ' / ' + x.g.photos.length, name: x.name, on: on,
        el: ok ? this.img(x.ph.url, x.name) : (this.phMissing(x.ph.url) ? this.missingEl() : null), loading: !ok && !this.phMissing(x.ph.url),
        ring: on ? '0 0 0 3px var(--color-accent)' : 'var(--shadow-sm)',
        chk: on ? 'ph-fill ph-check-circle' : 'ph ph-circle', chkColor: on ? 'var(--color-accent-300)' : '#e9e9ed',
        toggle: () => { const n = Object.assign({}, this.state.alSel || {}); if (n[x.id]) delete n[x.id]; else n[x.id] = true; this.setState({ alSel: n }); },
        down: () => dl([x], null),
        zoom: () => { clearTimeout(this._alHvT); this.setState({ alHv: null, alZoom: x.id, alZList: list.map(y => y.id), alZScale: 1 }); },
        // 마우스를 올리면 이 사진의 참여자 명단 팝업 (사진 옆에 표시)
        hvIn: (e) => {
          clearTimeout(this._alHvT);
          const el = e.currentTarget, r = el.getBoundingClientRect();
          // 화면 배율(html zoom) 보정: 고정 위치 팝업은 배율이 곱해지므로 미리 나눠 둠
          let z = el.offsetHeight ? r.height / el.offsetHeight : 1;
          if (!(z > 0.3 && z < 3)) z = 1;
          this._alHvT = setTimeout(() => this.setState({ alHv: { z: z, id: x.id, top: r.top / z, bottom: r.bottom / z, left: r.left / z, right: r.right / z, d: x.g.d, p: x.g.p, names: x.g.names.slice(), state: x.g.state, n: x.i + 1, of: x.g.photos.length } }), 180);
        },
        hvOut: () => { clearTimeout(this._alHvT); this._alHvT = setTimeout(() => this.setState({ alHv: null }), 120); }
      };
    };
    const curAllOn = curItems.length && curItems.every(x => sel[x.id]);
    const curTitle = !curHead ? '' : cur.indexOf('S:') === 0 ? (secGroups[0] ? fmtD(secGroups[0].d) + ' · ' + secGroups[0].p : '')
      : cur.indexOf('M:') === 0 ? cur.slice(2).split('|')[0] + ' · ' + curHead.label
      : cur.indexOf('D:') === 0 ? fmtD(cur.slice(2)) : curHead.label;
    // 확대 보기: 지금 오른쪽에 보이는 사진들 안에서 넘김 + 아래 사진 목록
    const zList = (s.alZList || []).map(id => all.find(x => x.id === id)).filter(Boolean);
    const zIdx = zList.findIndex(x => x.id === s.alZoom);
    const zCur = zIdx >= 0 ? zList[zIdx] : null;
    const zScale = s.alZScale || 1;
    const twoB = {
      alModes: [{ k: 'prog', label: '프로그램별', icon: 'ph ph-squares-four' }, { k: 'date', label: '일자별', icon: 'ph ph-calendar-blank' }].map(m => ({ label: m.label, icon: m.icon, on: mode === m.k, off: mode !== m.k, go: () => this.setState({ alMode: m.k, alCur: '', alFolderOpen: false }) })),
      // ── 보기 방식: 4a 폴더 바둑판 / 3a 목록 + 타일 (사용자 선택, 기기에 기억) ──
      ...(() => {
        const lay = s.alLayout || (() => { try { return localStorage.getItem('sc.albumLayout') || 'folder'; } catch (e) { return 'folder'; } })();
        const setLay = (v) => { try { localStorage.setItem('sc.albumLayout', v); } catch (e) {} this.setState({ alLayout: v, alFolderOpen: false }); };
        const folder = lay === 'folder';
        const opened = folder && !!s.alFolderOpen && !!curHead;
        const tsz = s.alTileSize || (() => { try { return localStorage.getItem('sc.alTileSize') || 'm'; } catch (e) { return 'm'; } })();
        const TS = { s: '120px', m: '170px', l: '260px' };
        return {
          alLayouts: [{ k: 'folder', label: '폴더', icon: 'ph ph-folders' }, { k: 'tile', label: '목록 + 타일', icon: 'ph ph-squares-four' }].map(m => ({
            label: m.label, icon: m.icon, on: lay === m.k, off: lay !== m.k, go: () => setLay(m.k)
          })),
          // 폴더 보기도 왼쪽 폴더 목록을 유지 — 오른쪽에 하위 폴더를 겹친 카드(바둑판)로 보여 주고, 맨 아래 날짜를 고르면 사진
          alFolderGrid: false,
          alTwoPane: true,
          alTreeDisp: 'flex',
          alGridCols: 'minmax(220px, 270px) minmax(0, 1fr)',
          ...(() => {
            const nodes = !folder ? null : (!opened ? heads : ((curHead && curHead.kids && curHead.kids.length) ? curHead.kids : null));
            const parentKey = opened && curEntry && curEntry.parents.length ? curEntry.parents[curEntry.parents.length - 1] : null;
            return {
              alShowCards: !!nodes, alNotCards: !nodes,
              alCardsTitle: !opened ? '전체 앨범' : null,
              alCards: (nodes || []).map(h => {
                const gs = h.groups.slice().sort((a, b) => b.d.localeCompare(a.d));
                const coverG = gs[0];
                const cx = coverG ? all.find(x => x.g === coverG) : null;
                const ok = cx && real(cx.ph.url);
                const n = cnt(h.groups);
                // 2a: 폴더 안의 다른 사진 2장을 뒤에 부채꼴로 (불러온 사진만)
                const backs = all.filter(x => h.groups.indexOf(x.g) >= 0 && x !== cx && real(x.ph.url)).slice(0, 2);
                const backEl = (x, dim) => x ? React.createElement('img', { src: x.ph.url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(' + dim + ') saturate(0.75)' } }) : null;
                const leafNode = !(h.kids && h.kids.length);
                return {
                  label: h.label, color: h.color || (coverG ? colorOf(coverG.p) : 'var(--color-accent)'),
                  count: n + '장',
                  sub: leafNode ? (h.groups[0] ? '참여 ' + h.groups[0].names.length + '명' : '') : (mode === 'prog' || h.key.indexOf('M:') === 0 ? h.groups.length + '회 진행' : uniqBy(h.groups, g => g.p).length + '개 프로그램'),
                  last: coverG ? '최근 ' + fmtD(coverG.d) : '',
                  coverEl: ok ? this.img(cx.ph.url, h.label) : (this.phMissing(cx.ph.url) ? this.missingEl() : null), coverLoading: !ok && !this.phMissing(cx.ph.url),
                  stack2: n > 1, stack3: n > 2,
                  back1El: backEl(backs[0], 0.7), back2El: backEl(backs[1], 0.55),
                  // 마우스를 올리면 폴더 안 사진 미리보기 (최대 8장, 누르면 확대 보기)
                  ...(() => {
                    const items = all.filter(x => h.groups.indexOf(x.g) >= 0);
                    const hov = s.alHoverCard === h.key;
                    return {
                      hoverOn: hov,
                      hoverEnter: (e) => {
                        clearTimeout(this._alHovT);
                        // 오른쪽 끝 카드는 미리보기를 오른쪽에 붙여 펼침 (화면 밖으로 잘리지 않게)
                        let align = 'left';
                        try {
                          const r = e.currentTarget.getBoundingClientRect();
                          const grid = e.currentTarget.parentElement.getBoundingClientRect();
                          if (r.left + 340 > grid.right) align = 'right';
                        } catch (er) {}
                        this._alHovT = setTimeout(() => this.setState({ alHoverCard: h.key, alHoverAlign: align }), 280);
                      },
                      pvLeft: s.alHoverAlign === 'right' ? 'auto' : '0',
                      pvRight: s.alHoverAlign === 'right' ? '0' : 'auto',
                      hoverLeave: () => { clearTimeout(this._alHovT); this._alHovT = setTimeout(() => { if (this.state.alHoverCard === h.key) this.setState({ alHoverCard: null }); }, 160); },
                      pvTitle: h.label + ' · 사진 ' + items.length + '장',
                      pvMore: items.length > 8, pvMoreN: '+' + (items.length - 8) + '장 더 · 눌러서 열기',
                      previews: hov ? items.slice(0, 8).map(x => {
                        const okp = real(x.ph.url);
                        return {
                          el: okp ? this.img(x.ph.url, x.name) : (this.phMissing(x.ph.url) ? this.missingEl() : null), loading: !okp && !this.phMissing(x.ph.url),
                          cap: fmtD(x.g.d) + (mode === 'prog' ? '' : ' · ' + x.g.p),
                          // 확대 보기는 '넘겨 볼 사진 목록(alZList)'이 있어야 열림 — 이 묶음의 사진 전체를 목록으로 넘김
                          zoom: (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (e && e.preventDefault) e.preventDefault(); this.setState({ alZList: items.map(y => y.id), alZoom: x.id, alZScale: 1, alHoverCard: null }); }
                        };
                      }) : []
                    };
                  })(),
                  open: () => { this.setState({ alCur: h.key, alFolderOpen: true, alOpen: Object.assign({}, this.state.alOpen || {}, { [h.key]: true }) }); }
                };
              }),
              alFolderUp: () => this.setState(parentKey ? { alCur: parentKey, alFolderOpen: true } : { alFolderOpen: false })
            };
          })(),
          alFolderBack: opened,
          alCloseFolder: () => {
            const pk = curEntry && curEntry.parents.length ? curEntry.parents[curEntry.parents.length - 1] : null;
            this.setState(pk ? { alCur: pk, alFolderOpen: true } : { alFolderOpen: false });
          },
          alTileMin: TS[tsz] || TS.m,
          // 폴더 바둑판도 같은 크기 설정을 따름
          alFolderMin: ({ s: '150px', m: '200px', l: '290px' })[tsz] || '200px',
          // 작게·보통·크게는 모든 보기(폴더·목록+타일·사진만 보기)에 함께 적용, 기기에 기억
          alTileSizes: [{ k: 's', label: '작게', icon: 'ph ph-dots-nine' }, { k: 'm', label: '보통', icon: 'ph ph-grid-four' }, { k: 'l', label: '크게', icon: 'ph ph-square' }].map(z => ({ label: z.label, icon: z.icon, on: tsz === z.k, off: tsz !== z.k, go: () => { try { localStorage.setItem('sc.alTileSize', z.k); } catch (e) {} this.setState({ alTileSize: z.k, alOnlySize: z.k }); } })),
          alFolders: heads.map(h => {
            const gs = h.groups.slice().sort((a, b) => b.d.localeCompare(a.d));
            const coverG = gs[0];
            const cx = coverG ? all.find(x => x.g === coverG) : null;
            const ok = cx && real(cx.ph.url);
            const n = cnt(h.groups);
            return {
              label: h.label, color: h.color || 'var(--color-accent)',
              count: n + '장', sub: (mode === 'prog' ? h.groups.length + '회 진행' : uniqBy(h.groups, g => g.p).length + '개 프로그램'),
              last: coverG ? '최근 ' + fmtD(coverG.d) : '',
              coverEl: ok ? this.img(cx.ph.url, h.label) : (this.phMissing(cx.ph.url) ? this.missingEl() : null), coverLoading: !ok && !this.phMissing(cx.ph.url),
              stack2: n > 1, stack3: n > 2,
              open: () => this.setState({ alCur: h.key, alFolderOpen: true })
            };
          })
        };
      })(),
      alNotEmpty: heads.length > 0,
      alTree: (() => {
        const arr = [];
        const push = (n, lv, color, idx) => {
          const leaf = !(n.kids && n.kids.length);
          const op = !leaf && isOpen(n.key, lv, idx);
          const setOpen = (v) => this.setState({ alOpen: Object.assign({}, this.state.alOpen || {}, { [n.key]: v }) });
          const ic = n.icon === 'folder' ? (op ? 'ph-fill ph-folder-open' : 'ph-fill ph-folder') : n.icon === 'cal' ? 'ph ph-calendar-blank' : n.icon === 'day' ? 'ph ph-calendar-dot' : (lv === 2 && mode === 'date' ? 'ph-fill ph-folder' : 'ph ph-images');
          arr.push({
            head: true, kid: false, label: n.label, count: cnt(n.groups), on: cur === n.key,
            color: n.color || color, icon: ic, iconColor: n.icon === 'folder' || (lv === 2 && mode === 'date') ? (n.color || color) : 'var(--color-neutral-400)',
            pad: (lv * 22) + 'px', fs: lv === 0 ? '14.5px' : '13.5px',
            caret: leaf ? '' : (op ? 'ph ph-caret-down' : 'ph ph-caret-right'), caretOp: leaf ? '0' : '1',
            go: () => { this.setState({ alCur: n.key, alFolderOpen: true }); if (!leaf && !op) setOpen(true); },
            tog: (e) => { e.stopPropagation(); if (!leaf) setOpen(!op); }
          });
          if (op) n.kids.forEach((k, i) => push(k, lv + 1, n.color || color, i));
        };
        heads.forEach((h, i) => push(h, 0, h.color, i));
        return arr;
      })().map(t => Object.assign(t, {
        bg: t.on ? 'var(--color-accent-900)' : 'transparent',
        shadow: t.on ? 'inset 3px 0 0 var(--color-accent)' : 'none',
        fg: t.on ? 'var(--color-accent-200)' : (t.head ? 'var(--color-text)' : 'var(--color-neutral-300)')
      })),
      alCurTitle: ((s.alLayout || (() => { try { return localStorage.getItem('sc.albumLayout') || 'folder'; } catch (e) { return 'folder'; } })()) === 'folder' && !s.alFolderOpen) ? '전체 앨범' : curTitle,
      alCurMeta: ((s.alLayout || (() => { try { return localStorage.getItem('sc.albumLayout') || 'folder'; } catch (e) { return 'folder'; } })()) === 'folder' && !s.alFolderOpen) ? '폴더 ' + heads.length + '개 · 사진 ' + all.length + '장' : secGroups.length ? '사진 ' + curItems.length + '장 · ' + (secGroups.length > 1 ? secGroups.length + '회 진행' : '참여 ' + secGroups[0].names.length + '명 · 사진에 마우스를 올리면 명단') : '',
      ...(() => {
        const h = s.alHv;
        if (!h) return { alHvOpen: false };
        const z = h.z || 1;
        const W = 300, vw = window.innerWidth / z, vh = window.innerHeight / z;
        const right = h.right + 10 + W < vw;
        const left = right ? h.right + 10 : Math.max(8, h.left - 10 - W);
        const top = Math.max(8, Math.min(h.top, vh - 60 - Math.min(h.names.length, 12) * 26 - 80));
        return {
          alHvOpen: true, alHvLeft: left + 'px', alHvTop: top + 'px', alHvW: W + 'px',
          alHvTitle: fmtD(h.d) + ' · ' + h.p,
          alHvSub: '사진 ' + h.n + ' / ' + h.of + ' · ' + h.state,
          alHvCount: '참여 ' + h.names.length + '명',
          alHvNames: h.names.map((n, i) => ({ n: n, i: i + 1 })),
          alHvEmpty: h.names.length === 0,
          alHvKeep: () => clearTimeout(this._alHvT),
          alHvLeave: () => { clearTimeout(this._alHvT); this._alHvT = setTimeout(() => this.setState({ alHv: null }), 120); }
        };
      })(),
      alCurSelIcon: curAllOn ? 'ph-fill ph-check-square' : 'ph ph-square', alCurSelLabel: curAllOn ? '전체 해제' : '전체 선택',
      alCurToggleAll: () => { const n = Object.assign({}, this.state.alSel || {}); curItems.forEach(x => { if (curAllOn) delete n[x.id]; else n[x.id] = true; }); this.setState({ alSel: n }); },
      alCurDown: () => dl(curItems, null),
      // 6a [받기 ▾]: 사진을 고르면 '선택한 사진 받기'가 기본, 아니면 '이 그룹 받기'
      ...(() => {
        const hasSel = selList.length > 0;
        const close = () => this.setState({ alDlOpen: false });
        return {
          alDlMainLabel: hasSel ? '선택 ' + selList.length + '장 받기' : '그룹 받기',
          alDlMainTitle: hasSel ? '선택한 사진을 원본으로 다운로드' : '이 그룹 사진을 원본으로 다운로드',
          alDlMain: () => { close(); if (hasSel) dl(selList, null); else dl(curItems, null); },
          alDlOpen: !!s.alDlOpen, alDlOpenStr: s.alDlOpen ? 'true' : 'false',
          alDlToggle: () => this.setState({ alDlOpen: !s.alDlOpen }),
          alDlClose: close,
          alDlItems: [
            { icon: 'ph ph-images', label: '이 그룹 받기', n: curItems.length + '장', dis: busy || !curItems.length, go: () => { close(); dl(curItems, null); } },
            { icon: 'ph ph-check-square', label: '선택한 사진 받기', n: selList.length + '장', dis: busy || !hasSel, go: () => { close(); dl(selList, null); } },
            { icon: 'ph ph-stack', label: '조회된 전체 받기', n: all.length + '장', dis: busy || !all.length, go: () => { close(); dl(all, null); } }
          ]
        };
      })(),
      // 사진만 보기: 왼쪽 목록·제목·선택 표시를 숨기고 조회된 사진 전체를 한 판에 크게
      ...(() => {
        const only = !!s.alOnly;
        // 사진만 보기도 툴바의 작게·보통·크게와 같은 설정을 사용
        const sz = s.alTileSize || s.alOnlySize || (() => { try { return localStorage.getItem('sc.alTileSize') || 'm'; } catch (e) { return 'm'; } })();
        const MIN = { s: '140px', m: '220px', l: '320px' };
        return {
          alOnly: only, alNotOnly: !only,
          // 폴더 보기(사진 있음)에서는 요약·다운로드를 사진판 머리글로 옮김 → 위쪽 별도 줄은 사진만 보기 · 결과 없음일 때만
          alBarStandalone: only || !groups.length,
          alOnlyToggle: () => this.setState({ alOnly: !only }),
          alOnlyLabel: only ? '목록과 함께 보기' : '사진만 보기',
          alOnlyIcon: only ? 'ph ph-sidebar-simple' : 'ph ph-frame-corners',
          alOnlyMin: MIN[sz] || MIN.m,
          alOnlySizes: [{ k: 's', label: '작게' }, { k: 'm', label: '보통' }, { k: 'l', label: '크게' }].map(o => ({ label: o.label, on: sz === o.k, off: sz !== o.k, go: () => { try { localStorage.setItem('sc.alTileSize', o.k); } catch (e) {} this.setState({ alTileSize: o.k }); }, _old: () => this.setState({ alOnlySize: o.k }) })),
          alOnlyTiles: only ? all.map(x => Object.assign(tile(x, all), { cap: fmtD(x.g.d) + ' · ' + x.g.p })) : []
        };
      })(),
      alSections: secGroups.map(g => {
        const its = all.filter(x => x.g === g);
        return { label: mode === 'prog' ? fmtD(g.d) + ' · ' + g.p : g.p + ' · ' + fmtD(g.d), color: colorOf(g.p), state: g.state, meta: '사진 ' + g.photos.length + '장 · 참여 ' + g.names.length + '명', photos: its.map(x => tile(x, curItems)) };
      }),
      alZoomOpen: !!zCur,
      alZoomEl: zCur && real(zCur.ph.url) ? React.createElement('img', { src: zCur.ph.url, alt: zCur.name, draggable: false, style: { display: 'block', maxWidth: zScale === 1 ? '100%' : 'none', maxHeight: zScale === 1 ? '100%' : 'none', width: zScale === 1 ? 'auto' : (zScale * 100) + '%', objectFit: 'contain', margin: 'auto', borderRadius: 6, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } }) : null,
      alZoomCap: zCur ? zCur.g.d + ' · ' + zCur.g.p + ' · ' + (zIdx + 1) + ' / ' + zList.length + '   ' + zCur.name : '',
      alZoomPct: Math.round(zScale * 100) + '%',
      alZoomIn: () => this.setState({ alZScale: Math.min(4, Math.round(((this.state.alZScale || 1) + 0.5) * 10) / 10) }),
      alZoomOut: () => this.setState({ alZScale: Math.max(1, Math.round(((this.state.alZScale || 1) - 0.5) * 10) / 10) }),
      alZoomFit: () => this.setState({ alZScale: 1 }),
      alZoomClose: () => this.setState({ alZoom: null, alZScale: 1, alZSel: {} }),
      alStop: (e) => e.stopPropagation(),
      alZoomPrev: () => { if (zIdx > 0) this.setState({ alZoom: zList[zIdx - 1].id, alZScale: 1 }); },
      alZoomNext: () => { if (zIdx >= 0 && zIdx < zList.length - 1) this.setState({ alZoom: zList[zIdx + 1].id, alZScale: 1 }); },
      alZoomDown: () => { if (zCur) dl([zCur], null); },
      alZoomOverflow: zScale > 1 ? 'auto' : 'hidden',
      // 아래 사진 목록: 크기 선택 + 사진별 선택 → 선택한 사진 원본 다운로드
      ...(() => {
        const TS = { '작게': [72, 54], '보통': [104, 78], '크게': [150, 112], '아주 크게': [210, 158] };
        const tsKey = TS[s.alThumbSize] ? s.alThumbSize : (() => { try { const v = localStorage.getItem('sc.alThumbSize'); return TS[v] ? v : '보통'; } catch (e) { return '보통'; } })();
        const [tw, thh] = TS[tsKey];
        const zsel = s.alZSel || {};
        const selItems = zList.filter(x => zsel[x.id]);
        const allOn = zList.length > 0 && selItems.length === zList.length;
        return {
          alThumbW: tw + 'px', alThumbH: thh + 'px', alThumbHalf: Math.round(tw / 2) + 'px',
          alStripRef: this._alStripRef || (this._alStripRef = React.createRef()),
          alThumbSizes: Object.keys(TS).map(k => ({ label: k, on: k === tsKey, off: k !== tsKey, go: () => { try { localStorage.setItem('sc.alThumbSize', k); } catch (e) {} this.setState({ alThumbSize: k }); } })),
          alZSelN: selItems.length, alZHasSel: selItems.length > 0, alZNoSel: selItems.length === 0,
          alZSelAllLabel: allOn ? '선택 해제' : '전체 선택',
          alZSelAllIcon: allOn ? 'ph-fill ph-check-square' : 'ph ph-square',
          alZSelAll: () => { const n = {}; if (!allOn) zList.forEach(x => { n[x.id] = true; }); this.setState({ alZSel: n }); },
          alZDownSel: () => { if (selItems.length) dl(selItems, null); },
          alZSelTotal: zList.length
        };
      })(),
      alThumbs: zList.map((x, i) => {
        const on = !!(s.alZSel || {})[x.id];
        return {
          el: real(x.ph.url) ? this.img(x.ph.url, x.name) : null,
          ring: i === zIdx ? '0 0 0 3px var(--color-accent), 0 6px 16px rgba(0,0,0,0.5)' : on ? '0 0 0 2px #8fb0ff' : '0 0 0 1px var(--color-neutral-700)',
          op: i === zIdx || on ? '1' : '0.6',
          selStr: i === zIdx ? '1' : '0', tf: i === zIdx ? 'scale(1.06)' : 'none',
          go: () => this.setState({ alZoom: x.id, alZScale: 1 }),
          on: on, chkIcon: on ? 'ph-fill ph-check-circle' : 'ph ph-circle', chkColor: on ? '#8fb0ff' : '#e9e9ed',
          toggle: (e) => { if (e && e.stopPropagation) e.stopPropagation(); const n = Object.assign({}, this.state.alZSel || {}); if (n[x.id]) delete n[x.id]; else n[x.id] = true; this.setState({ alZSel: n }); },
          down: (e) => { if (e && e.stopPropagation) e.stopPropagation(); dl([x], null); }
        };
      })
    };
    return {
      ...twoB,
      alFrom: from, alTo: to,
      onAlFrom: (e) => { const v = e.target.value; if (v) this.setState({ alFrom: v, alTo: v > to ? v : to }); },
      onAlTo: (e) => { const v = e.target.value; if (v) this.setState({ alTo: v, alFrom: v < from ? v : from }); },
      alPresets: presets.map(p => { const on = p.f === from && p.t === to; return { label: p.label, bg: on ? 'var(--color-accent-900)' : 'transparent', fg: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)', sh: on ? '0 0 0 1px var(--color-accent)' : 'none', go: () => this.setState({ alFrom: p.f, alTo: p.t }) }; }),
      alProg: prog, alProgOpts: [{ v: '전체', label: '프로그램 전체' }].concat(progs.map(p => ({ v: p, label: p }))),
      onAlProg: (e) => this.setState({ alProg: e.target.value }),
      alWard: ward, alWardOpts: [{ v: '전체', label: '병동 전체' }].concat((s.wards || []).map(w => ({ v: w.name, label: w.name }))),
      onAlWard: (e) => this.setState({ alWard: e.target.value }),
      alState: st, onAlState: (e) => this.setState({ alState: e.target.value }),
      alSelNone: !selList.length || busy,
      alSelBd: selList.length ? 'var(--color-accent)' : 'var(--color-neutral-800)',
      alSelBg: selList.length ? 'var(--color-accent-900)' : 'transparent',
      alSelFg: selList.length ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
      alStateOpts: ['전체', '확정', '검수 필요'].map(k => { const on = st === k; return { label: k, on: on, bg: on ? 'var(--color-accent-900)' : 'transparent', fg: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)', sh: on ? 'inset 0 0 0 1px var(--color-accent)' : 'none', go: () => this.setState({ alState: k }) }; }),
      // 적용 중인 조건 (기본값과 다른 것만) — 눌러서 하나씩 지움
      ...(() => {
        const chips = [];
        if (q) chips.push({ label: '이름: ' + q, clear: () => this.setState({ alQ: '' }) });
        if (prog !== '전체') chips.push({ label: prog, clear: () => this.setState({ alProg: '전체' }) });
        if (ward !== '전체') chips.push({ label: ward, clear: () => this.setState({ alWard: '전체' }) });
        if (st !== '전체') chips.push({ label: st, clear: () => this.setState({ alState: '전체' }) });
        return {
          alChips: chips, alHasChips: chips.length > 0,
          alResetFilters: () => this.setState({ alQ: '', alProg: '전체', alWard: '전체', alState: '전체' })
        };
      })(),
      alQ: s.alQ || '', onAlQ: (e) => this.setState({ alQ: e.target.value }),
      alSummary: groups.length ? '프로그램 ' + groups.length + '회 · 사진 ' + all.length + '장' : '조회된 사진 없음',
      alEmpty: groups.length === 0,
      alEmptyText: '선택한 조건에 맞는 현장사진이 없습니다. 기간을 넓히거나 필터를 바꿔 보세요. 일지에 현장사진을 올리면 여기에 날짜·프로그램별로 모입니다.',
      alHasSel: selList.length > 0, alSelN: selList.length,
      alBusy: busy, alBusyOrEmpty: busy || !all.length,
      alClearSel: () => this.setState({ alSel: {} }),
      alDownSel: () => dl(selList, '앨범_선택_' + today + '.zip'),
      alDownAll: () => dl(all, '앨범_' + from + '_' + to + '.zip'),
      alGroups: groups.map(g => {
        const items = all.filter(x => x.g === g);
        const allOn = items.length && items.every(x => sel[x.id]);
        const dt = new Date(g.d + 'T00:00:00');
        return {
          md: (dt.getMonth() + 1) + '월', dd: dt.getDate() + '', program: g.p, state: g.state, color: colorOf(g.p),
          meta: g.d + ' (' + WD[dt.getDay()] + ') · 사진 ' + g.photos.length + '장 · 참여 ' + g.names.length + '명' + (g.ward ? ' · ' + g.ward : '') + (g.names.length ? ' · ' + g.names.slice(0, 6).join(', ') + (g.names.length > 6 ? ' 외 ' + (g.names.length - 6) + '명' : '') : ''),
          selIcon: allOn ? 'ph-fill ph-check-square' : 'ph ph-square', selLabel: allOn ? '선택 해제' : '전체 선택',
          toggleAll: () => { const n = Object.assign({}, this.state.alSel || {}); items.forEach(x => { if (allOn) delete n[x.id]; else n[x.id] = true; }); this.setState({ alSel: n }); },
          down: () => dl(items, g.d + '_' + g.p.replace(/[\\/:*?"<>|\s]+/g, '') + '.zip'),
          photos: items.map(x => {
            const on = !!sel[x.id], ok = real(x.ph.url);
            return {
              n: (x.i + 1) + ' / ' + g.photos.length, name: x.name, on: on,
              el: ok ? this.img(x.ph.url, x.name) : null, loading: !ok,
              ring: on ? '0 0 0 3px var(--color-accent)' : 'var(--shadow-sm)',
              chk: on ? 'ph-fill ph-check-circle' : 'ph ph-circle', chkColor: on ? 'var(--color-accent-300)' : '#e9e9ed',
              toggle: () => { const n = Object.assign({}, this.state.alSel || {}); if (n[x.id]) delete n[x.id]; else n[x.id] = true; this.setState({ alSel: n }); },
              down: () => dl([x], null),
              zoom: () => this.setState({ alZoom: x.id })
            };
          })
        };
      }),
      _zx: zx
    };
  }

  // 한 장 = 바로 저장, 여러 장 = ZIP (일자_프로그램 폴더로 묶음)
  async albumDownload(items, zipName) {
    const list = (items || []).filter(x => x.ph && x.ph.url && x.ph.url.indexOf('wph:') !== 0);
    if (!list.length) { this.flash('사진을 아직 불러오는 중입니다 — 잠시 뒤 다시 눌러 주세요'); return; }
    const save = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    void zipName;
    if (list.length === 1) { save(list[0].ph.url, list[0].name); this.flash('다운로드 — ' + list[0].name); return; }
    // 여러 장도 압축하지 않고 원본 사진 파일 그대로 한 장씩 저장 (파일명: 날짜_프로그램_번호)
    this.setState({ alBusy: true });
    this.flash('사진 ' + list.length + '장을 원본 파일로 내려받는 중… (브라우저가 "여러 파일 다운로드"를 물으면 [허용]을 눌러 주세요)');
    try {
      for (let i = 0; i < list.length; i++) {
        save(list[i].ph.url, list[i].name);
        await new Promise(r => setTimeout(r, 350));
      }
      this.flash('다운로드 완료 — 원본 사진 ' + list.length + '장');
    } finally { this.setState({ alBusy: false }); }
  }

  // 증명사진에서 실제로 얼굴 수를 셈 (가장 큰 얼굴 위치도 기억)
  async checkIdFaces(url) {
    try {
      const fa = await this.loadFaceApi();
      const cv = await this.toCanvas(url, 1200);
      const dets = await fa.detectAllFaces(cv, new fa.SsdMobilenetv1Options({ minConfidence: 0.45 }));
      if ((this.state.idPhoto || {}).url !== url) return;
      const big = dets.map(d => d.box).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      this.setState({ idFace: { url: url, n: dets.length, main: big ? { x: big.x / cv.width, y: big.y / cv.height, w: big.width / cv.width, h: big.height / cv.height } : null } });
    } catch (e) {
      if ((this.state.idPhoto || {}).url === url) this.setState({ idFace: { url: url, n: 1, main: null } });
    }
  }
  // 현재 증명사진을 자르기 창에서 편집 (main=true면 가장 큰 얼굴 주변을 증명사진 비율로 미리 잡아 둠)
  openIdEdit(main) {
    const url = (this.state.idPhoto || {}).url;
    if (!url) return;
    let box = null;
    const m = (this.state.idFace || {}).main;
    if (main && m) {
      // 얼굴 폭의 약 2배, 세로 3:4 · 얼굴이 위쪽 40% 지점에 오도록
      const w = Math.min(1, m.w * 2.1), h = Math.min(1, w * 4 / 3 * (m.w ? m.h / m.w : 1) * 0.92 + m.h * 0.6);
      const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      box = { x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h * 0.42)), w: w, h: h };
    }
    this.setState({ faceCrop: { sources: [{ label: '현재 증명사진', url: url }], src: url, box: box, editMode: true } });
  }

  // 작은 얼굴을 크게 키울 때: 단계적으로 키우고(계단 현상 줄임) 살짝 선명하게 보정
  upscaleSharp(im, sx, sy, sw, sh, minLong, maxLong) {
    const long = Math.max(sw, sh);
    const k = Math.min(maxLong / long, Math.max(1, minLong / long));
    const tw = Math.max(1, Math.round(sw * k)), th = Math.max(1, Math.round(sh * k));
    // 1) 원본 영역을 그대로 꺼냄
    let cur = document.createElement('canvas'); cur.width = Math.max(1, Math.round(sw)); cur.height = Math.max(1, Math.round(sh));
    cur.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, cur.width, cur.height);
    // 2) 2배씩 단계적으로 키움
    while (cur.width * 2 < tw) {
      const n = document.createElement('canvas'); n.width = cur.width * 2; n.height = cur.height * 2;
      const g = n.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    const out = document.createElement('canvas'); out.width = tw; out.height = th;
    const g2 = out.getContext('2d'); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high';
    g2.drawImage(cur, 0, 0, tw, th);
    // 3) 키운 배율에 맞춰 약하게 선명 보정 (언샤프 마스크)
    if (k > 1.2) {
      try {
        const amt = Math.min(0.6, 0.25 + (k - 1) * 0.08);
        const src = g2.getImageData(0, 0, tw, th), d = src.data, o = new Uint8ClampedArray(d.length);
        const W = tw * 4;
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
          const i = y * W + x * 4;
          if (x === 0 || y === 0 || x === tw - 1 || y === th - 1) { o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3]; continue; }
          for (let ch = 0; ch < 3; ch++) {
            const c0 = d[i + ch];
            const blur = (d[i - 4 + ch] + d[i + 4 + ch] + d[i - W + ch] + d[i + W + ch] + c0 * 4) / 8;
            o[i + ch] = c0 + (c0 - blur) * amt * 2;
          }
          o[i + 3] = d[i + 3];
        }
        src.data.set(o); g2.putImageData(src, 0, 0);
      } catch (e) {}
    }
    return out;
  }

  // ───── 단체 사진에서 얼굴 오려내기 ─────
  _fcScroll = React.createRef();
  fcSources(pid) {
    const s = this.state, out = [], seen = {};
    const add = (url, label) => { if (url && typeof url === 'string' && url.indexOf('wph:') !== 0 && !seen[url]) { seen[url] = 1; out.push({ url: url, label: label }); } };
    const sess = Object.assign({}, s.sessions || {});
    if (s.activeSession) sess[s.activeSession] = { review: s.review, photos: s.photos };
    Object.keys(sess).sort().reverse().forEach(k => {
      const v = sess[k] || {};
      if (pid && !(v.review || []).some(r => r && r.id === pid)) return;
      (v.photos || []).forEach((p, i) => add(p && p.url, k.replace('|', ' ') + ' · 사진 ' + (i + 1)));
    });
    return out;
  }
  fcVals(s, sel) {
    const fc = s.faceCrop;
    if (!fc) return { fcOpen: false };
    const src = fc.src || '';
    const b = fc.box;
    const pc = (v) => (v * 100).toFixed(2) + '%';
    const srcs = fc.sources || [];
    return {
      fcOpen: true,
      fcWho: (sel && sel.name ? sel.name + ' ' : '') + (fc.editMode ? '증명사진 편집 — 본인 얼굴만 남도록 네모를 조절하세요' : '증명사진'),
      fcSources: srcs.map(p => ({ label: p.label, ring: p.url === src ? 'var(--color-accent)' : 'transparent', el: this.img(p.url, p.label), pick: () => this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { src: p.url, box: null, zoom: 0, nw: 0, nh: 0 }) }) })),
      fcNoSources: srcs.length === 0,
      fcHasImg: !!src, fcNoImg: !src,
      // 이미지 크기 = 감싸는 박스 크기 (오려낼 좌표가 맞도록 원래 비율로만 줄임)
      // zoom: 0 = 화면 맞춤, 그 외 = 원본 화소 대비 배율 (1 = 원본 크기)
      fcImgEl: src ? React.createElement('img', {
        src: src, alt: '단체 사진', draggable: false,
        onLoad: (e) => { const t = e.currentTarget; if (!this.state.faceCrop || this.state.faceCrop.nw === t.naturalWidth) return; this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { nw: t.naturalWidth, nh: t.naturalHeight }) }); },
        style: (fc.zoom || 0) > 0 && fc.nw
          ? { display: 'block', width: Math.round(fc.nw * fc.zoom) + 'px', height: 'auto', maxWidth: 'none', maxHeight: 'none' }
          : { display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 360px)', width: 'auto', height: 'auto' }
      }) : null,
      ...(() => {
        const z = fc.zoom || 0;
        const fitZ = () => { const el = this._fcStage.current; return el && fc.nw ? el.getBoundingClientRect().width / fc.nw : 0.5; };
        const STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
        const cur = z || fitZ();
        const setZ = (nz, anchor) => {
          const sc = this._fcScroll.current;
          const old = cur;
          let ax = 0.5, ay = 0.5;
          if (sc && anchor) { const r = sc.getBoundingClientRect(); ax = (anchor.x - r.left) / r.width; ay = (anchor.y - r.top) / r.height; }
          const keepX = sc ? (sc.scrollLeft + sc.clientWidth * ax) / old : 0, keepY = sc ? (sc.scrollTop + sc.clientHeight * ay) / old : 0;
          this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { zoom: nz }) }, () => {
            const s2 = this._fcScroll.current; if (!s2 || !nz) return;
            s2.scrollLeft = keepX * nz - s2.clientWidth * ax; s2.scrollTop = keepY * nz - s2.clientHeight * ay;
          });
        };
        const step = (dir, anchor) => {
          const c = cur;
          const nz = dir > 0 ? (STEPS.find(v => v > c + 0.001) || 4) : (STEPS.slice().reverse().find(v => v < c - 0.001) || 0.1);
          if (dir < 0 && nz <= fitZ() + 0.001) setZ(0); else setZ(nz, anchor);
        };
        return {
          fcScrollRef: this._fcScroll,
          fcZoomLabel: z ? Math.round(z * 100) + '%' : '맞춤',
          fcZoomMin: !z, fcZoomMax: z >= 4,
          fcZoomIn: () => step(1), fcZoomOut: () => step(-1),
          fcZoomFit: () => setZ(0), fcZoomOrig: () => setZ(1),
          fcFitCls: !z ? 'btn btn-primary' : 'btn btn-secondary',
          fcOrigCls: z === 1 ? 'btn btn-primary' : 'btn btn-secondary',
          fcJustify: z ? 'flex-start' : 'center', fcAlign: z ? 'flex-start' : 'center',
          fcStageMax: z ? 'none' : '100%',
          fcWheel: (e) => { if (!e.ctrlKey) return; e.preventDefault(); step(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY }); }
        };
      })(),
      fcHasBox: !!(b && b.w > 0.005), fcBoxL: b ? pc(b.x) : '0', fcBoxT: b ? pc(b.y) : '0', fcBoxW: b ? pc(b.w) : '0', fcBoxH: b ? pc(b.h) : '0',
      fcCantApply: !(src && b && b.w > 0.01 && b.h > 0.01),
      fcHint: !src ? '이 환자가 참여한 일지의 현장사진이 먼저 나옵니다'
        : (b && b.w > 0.01
          ? (() => {
              // 고른 영역의 실제 화소 수 → 저장 크기와 화질 안내
              const nw = fc.nw || 0, nh = nw && fc.nh ? fc.nh : 0;
              const pw = nw ? Math.round(b.w * nw) : 0, ph = nh ? Math.round(b.h * nh) : 0;
              if (!pw) return '네모 안 부분을 증명사진 크기(긴 변 800px 이상)로 크게 저장합니다';
              const long = Math.max(pw, ph);
              const q = long >= 400 ? '선명' : long >= 200 ? '보통 (조금 흐릴 수 있음)' : '흐림 — 얼굴이 작게 찍힌 사진입니다. 가까이서 찍은 사진을 권장';
              return '고른 부분 원본 ' + pw + '×' + ph + 'px → 긴 변 ' + Math.max(800, Math.min(1200, long)) + 'px로 크게 저장 · 화질: ' + q;
            })()
          : '얼굴 주변을 끌어서 네모를 그리세요 · Ctrl + 마우스 휠로 확대/축소'),
      fcStageRef: this._fcStage, fcFileRef: this._fcFile,
      fcClose: () => this.setState({ faceCrop: null }),
      fcPickFile: () => { if (this._fcFile.current) this._fcFile.current.click(); },
      fcOnFile: (e) => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { src: rd.result, box: null, zoom: 0, nw: 0, nh: 0 }) });
        rd.readAsDataURL(f);
      },
      fcDown: (e) => {
        const el = this._fcStage.current; if (!el) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const rel = (ev) => ({ x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) });
        const p0 = rel(e), cur = (this.state.faceCrop || {}).box;
        const inside = cur && p0.x >= cur.x && p0.x <= cur.x + cur.w && p0.y >= cur.y && p0.y <= cur.y + cur.h;
        const move = (ev) => {
          const p = rel(ev);
          let box;
          if (inside) {
            const nx = Math.max(0, Math.min(1 - cur.w, cur.x + p.x - p0.x)), ny = Math.max(0, Math.min(1 - cur.h, cur.y + p.y - p0.y));
            box = { x: nx, y: ny, w: cur.w, h: cur.h };
          } else {
            box = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
          }
          this.setState({ faceCrop: Object.assign({}, this.state.faceCrop, { box: box }) });
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      },
      fcApply: () => {
        const fc2 = this.state.faceCrop; if (!fc2 || !fc2.src || !fc2.box) return;
        const im = new Image();
        im.onload = () => {
          const bx = fc2.box;
          const sx = bx.x * im.naturalWidth, sy = bx.y * im.naturalHeight, sw = bx.w * im.naturalWidth, sh = bx.h * im.naturalHeight;
          // 증명사진 크기로 크게: 긴 변 최소 800px · 최대 1200px (작은 얼굴도 크게 보이게)
          const c = this.upscaleSharp(im, sx, sy, sw, sh, 800, 1200);
          c.toBlob((blob) => {
            if (!blob) { this.flash('잘라내지 못했습니다 — 다른 사진으로 다시 시도하세요'); return; }
            const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
            const f = new File([blob], (fc2.editMode ? '증명사진_편집_' : '단체사진_얼굴_') + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.jpg', { type: 'image/jpeg' });
            this.setState({ faceCrop: null, upload: 'idle', idPhoto: null });
            setTimeout(() => { if (this._acceptIdPhoto) this._acceptIdPhoto(f); }, 30);
          }, 'image/jpeg', 0.9);
        };
        im.onerror = () => this.flash('사진을 읽지 못했습니다');
        im.src = fc2.src;
      }
    };
  }

  // 왼쪽 메뉴 높이 = 화면에 보이는 높이 (위쪽 바가 보일 때도 하단 로그아웃이 화면 안에 들어오게)
  fitSidebar() {
    const el = this._sbRef.current;
    if (!el) return;
    const parentTop = el.parentElement ? el.parentElement.getBoundingClientRect().top : 0;
    // 화면 크기(확대·축소) 적용 시: 화면에 보이는 높이를 확대 비율로 나눠 메뉴 높이를 맞춤
    const zr = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1;
    const z = zr > 0.3 && zr < 3 ? zr : 1;
    const h = Math.max(320, Math.round((window.innerHeight - Math.max(0, parentTop)) / z));
    if (h !== this.state.sbH) this.setState({ sbH: h });
  }

  // ───── 화면 크기 (모니터 해상도에 맞춰 PC 화면 전체를 확대·축소) ─────
  // 이 PC(브라우저)에만 저장 — 모니터마다 맞는 크기가 다르므로 다른 기기에는 영향 없음
  static UI_SCALES = [0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.15, 1.25, 1.35, 1.5];
  autoUiScale() {
    const w = window.innerWidth || 1600;
    const z = Math.round((w / 1680) * 20) / 20;
    return Math.max(0.8, Math.min(1.3, z));
  }
  uiZoom() {
    const v = this.state.uiScale;
    if (v === 'auto' || v == null) return this.autoUiScale();
    return Math.max(0.6, Math.min(1.6, Number(v) || 1));
  }
  initUiScale() {
    let v = null;
    try { v = localStorage.getItem('sc.uiScale'); } catch (e) {}
    this.setState({ uiScale: v == null ? 1 : (v === 'auto' ? 'auto' : parseFloat(v) || 1) });
  }
  setUiScale(v) {
    this.setState({ uiScale: v });
    try { localStorage.setItem('sc.uiScale', String(v)); } catch (e) {}
    setTimeout(() => this.fitSidebar(), 80);
  }
  applyUiScale() {
    const on = this.state.logged && this.state.device === 'pc';
    const z = on ? this.uiZoom() : 1;
    const val = z === 1 ? '' : String(z);
    // 화면 크기를 키우면 100vh가 실제 화면보다 커져 팝업 아래가 잘림 → 실제 보이는 높이를 변수로 전달
    const vh = Math.round(window.innerHeight / (z || 1)) + 'px';
    if (this._uiVh !== vh) { this._uiVh = vh; document.documentElement.style.setProperty('--sc-vh', vh); }
    if (this._uiZ === val) return;
    this._uiZ = val;
    document.documentElement.style.zoom = val;
    const w = Math.round((window.innerWidth || 1600) / z);
    if (w !== this.state.vw) this.setState({ vw: w });
    setTimeout(() => this.fitSidebar(), 80);
  }

  capName(type) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const ext = (type || 'image/png').split('/')[1].replace('jpeg', 'jpg');
    return '화면캡처_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
  }

  // 기관 서면 동의서 양식 (설정 › 동의서 문구에서 수정, {기관}은 기관명으로 치환)
  CFORM_DEFAULT = {
    title: '초상권 및 개인정보 사용 동의서',
    subtitle: '(사진·영상 촬영 및 배포 동의서)',
    body: '"{기관}"에서 홍보 및 영리, 비영리의 목적으로 촬영하는 사진과 영상 이미지를 다음과 같이 사용하는 데에 동의합니다. (본 동의는 입원(이용) 기간 동안 유효하며, 병원 홍보물 제작·배포를 위해 사용된 사진 및 영상은 퇴원 후에도 사용할 수 있습니다. 단, 이미 제작·배포된 홍보물에 대해서는 삭제 및 회수가 어려울 수 있습니다)',
    purpose: '{기관}의 사회공헌 활동 및 홍보 관련 등의 영리·비영리 목적',
    media: '{기관} 홈페이지, SNS, 소식지, 홍보용 매체 등',
    form: '인터넷 홈페이지, 각 전단 내지 또는 표지에 게재'
  };

  // ───── 기관별 동의 서식 라이브러리 ─────
  // { [기관ID]: { activeId, forms: [{ id, name, ver, updatedAt, by, data }] } }
  static CFLIB_KEY = 'smartcare.cformLib.v1';
  cfLibAll() {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(Component.CFLIB_KEY) || '{}') || {}; } catch (e) {}
    return all;
  }
  cfLib(orgId) {
    const all = this.cfLibAll();
    let lib = all[orgId];
    if (!lib || !Array.isArray(lib.forms) || !lib.forms.length) {
      // 처음: 예전에 저장한 단일 양식(또는 기본 양식)을 첫 서식으로
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem('smartcare.consentForm.v1') || 'null'); } catch (e) {}
      const data = Object.assign({}, this.CFORM_DEFAULT, orgId === 'ORG1' && legacy && legacy.title ? legacy : {});
      lib = { activeId: 'f1', forms: [{ id: 'f1', name: '기본 동의서', ver: 1, updatedAt: '', by: '', data: data }] };
    }
    return lib;
  }
  cfLibSave(orgId, lib) {
    const all = this.cfLibAll(); all[orgId] = lib;
    try { localStorage.setItem(Component.CFLIB_KEY, JSON.stringify(all)); } catch (e) { this.flash('저장 공간이 부족합니다'); }
    this.setState({ cformRev: (this.state.cformRev || 0) + 1 });
  }

  consentFormRaw(orgId) {
    const lib = this.cfLib(orgId || this.state.orgId || 'ORG1');
    const f = lib.forms.find(x => x.id === lib.activeId) || lib.forms[0];
    return Object.assign({}, this.CFORM_DEFAULT, f ? f.data : {});
  }

  consentForm(org) {
    const raw = this.consentFormRaw(), out = {};
    Object.keys(raw).forEach(k => { out[k] = String(raw[k] || '').split('{기관}').join(org || '기관'); });
    return out;
  }

  clipReadAllowed() {
    if (!(navigator.clipboard && navigator.clipboard.read)) return false;
    const fp = document.permissionsPolicy || document.featurePolicy;
    try { if (fp && fp.allowsFeature && !fp.allowsFeature('clipboard-read')) return false; } catch (e) {}
    return true;
  }

  // 클립보드의 캡처 이미지를 서면 동의서로 첨부
  async readClipboardCapture(manual) {
    if (!this.clipReadAllowed()) {
      if (manual) this.flash('이 화면(미리보기 창)에서는 브라우저 보안상 버튼으로 붙여넣을 수 없습니다 — Ctrl+V를 누르세요');
      return false;
    }
    if (!(navigator.clipboard && navigator.clipboard.read)) {
      if (manual) this.flash('이 브라우저는 버튼 붙여넣기를 지원하지 않습니다 — Ctrl+V로 붙여넣으세요');
      return false;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const t = it.types.find(x => /^image\/(png|jpeg|gif)$/.test(x));
        if (t) {
          const blob = await it.getType(t);
          const sig = blob.size + '|' + t;
          if (!manual && sig === this._capBaseline) return false;
          if (sig === this._lastCapSig && (!manual || Date.now() - (this._lastCapAt || 0) < 3000)) return false;
          this._lastCapSig = sig; this._lastCapAt = Date.now();
          const file = new File([blob], this.capName(t), { type: t });
          const forId = this.state.capFor === 'id';
          const forIdp = this.state.capFor === 'idp';
          this.setState({ capWaiting: false, capFor: null });
          if (forIdp) { this.acceptIdpFile(file, '캡처한 사진'); }
          else if (forId) { if (this._acceptIdPhoto) await this._acceptIdPhoto(file); }
          else if (this._addConsentFiles) await this._addConsentFiles([file]);
          return true;
        }
      }
      if (manual) this.flash('클립보드에 캡처 이미지가 없습니다 — 먼저 화면을 캡처하세요');
    } catch (e) {
      if (manual) this.flash('클립보드 접근이 허용되지 않았습니다 — Ctrl+V로 붙여넣으세요');
    }
    return false;
  }

  loadLib(url, globalName) {
    this._libs = this._libs || {};
    if (this._libs[url]) return this._libs[url];
    this._libs[url] = new Promise((resolve, reject) => {
      const get = () => globalName.split('.').reduce((o, k) => o && o[k], window);
      if (get()) { resolve(get()); return; }
      const sc = document.createElement('script');
      sc.src = url;
      sc.onload = () => get() ? resolve(get()) : reject(new Error(globalName + ' 없음'));
      sc.onerror = () => reject(new Error('라이브러리 로드 실패'));
      document.head.appendChild(sc);
    });
    this._libs[url].catch(() => { delete this._libs[url]; });
    return this._libs[url];
  }

  // 통계 화면 → 흰 배경 A4 보고서용 캔버스
  async captureStats() {
    const el = this._statsRef.current;
    if (!el) throw new Error('통계 화면을 찾을 수 없습니다');
    const hti = await this.loadLib('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js', 'htmlToImage');
    const bgRaw = getComputedStyle(document.body).backgroundColor;
    const bg = (!bgRaw || bgRaw === 'rgba(0, 0, 0, 0)' || bgRaw === 'transparent') ? '#161826' : bgRaw;
    const shot = await hti.toCanvas(el, {
      backgroundColor: bg, pixelRatio: 2, cacheBust: true, skipFonts: true,
      filter: (n) => !(n.getAttribute && n.getAttribute('data-export-hide') === '1')
    });
    const pad = 48, headH = 96;
    const out = document.createElement('canvas');
    out.width = shot.width + pad * 2; out.height = shot.height + pad * 2 + headH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#161826'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = '#e9e9ed'; ctx.font = '500 34px Inter, "Malgun Gothic", sans-serif';
    ctx.fillText('사회사업실 · 스마트케어 프로그램 통계', pad, pad + 34);
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    ctx.fillStyle = '#9a9cab'; ctx.font = '22px Inter, "Malgun Gothic", sans-serif';
    ctx.fillText('출력 ' + stamp + ' · ' + (this._userName || '') + ' · 개인정보 포함 — 열람 후 파기', pad, pad + 74);
    ctx.drawImage(shot, pad, pad + headH);
    return { canvas: out, stamp: stamp.slice(0, 10) };
  }

  // 화이트 모드: 어두운 램프를 뒤집어 통계 영역에만 적용
  applyLightMode(el) {
    if (this.state.theme === 'light') return () => {};
    const root = getComputedStyle(document.documentElement);
    const props = {};
    ['neutral', 'accent', 'accent-2'].forEach(r => {
      for (let i = 100; i <= 900; i += 100) {
        const v = root.getPropertyValue('--color-' + r + '-' + (1000 - i)).trim();
        if (v) props['--color-' + r + '-' + i] = v;
      }
    });
    Object.assign(props, {
      '--color-bg': '#fbfbfc', '--color-surface': '#fbfbfc',
      '--color-text': root.getPropertyValue('--color-neutral-900').trim() || '#1c1e2c',
      '--shadow-sm': '0 0 0 1px #d9dae0', '--shadow-md': '0 0 0 1px #d9dae0', '--shadow-lg': '0 0 0 1px #d9dae0'
    });
    const prev = {};
    Object.keys(props).forEach(k => { prev[k] = el.style.getPropertyValue(k); el.style.setProperty(k, props[k]); });
    const prevColor = el.style.color; el.style.color = props['--color-text'];
    return () => { Object.keys(prev).forEach(k => prev[k] ? el.style.setProperty(k, prev[k]) : el.style.removeProperty(k)); el.style.color = prevColor; };
  }

  // 통계 카드 단위로 분리
  findStatBlocks(root) {
    const surface = (el) => { const c = getComputedStyle(el); return c.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(c.paddingTop) > 8; };
    const cards = [];
    root.querySelectorAll('div').forEach(d => {
      if (d.children.length === 0 && /^ST-\d+$/.test(d.textContent.trim())) {
        let p = d.parentElement;
        while (p && p !== root && !surface(p)) p = p.parentElement;
        if (p && p !== root && cards.indexOf(p) < 0 && p.offsetHeight > 0) cards.push(p);
      }
    });
    const extra = [...root.children].slice(1).filter(ch => !cards.some(c => ch.contains(c) || c.contains(ch)) && ch.offsetHeight > 0 && ch.getAttribute('data-export-hide') !== '1');
    const all = cards.concat(extra);
    all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    return all.map(el => {
      const lab = [...el.querySelectorAll('div')].find(d => d.children.length === 0 && /^ST-\d+$/.test(d.textContent.trim()));
      const title = lab && lab.nextElementSibling ? lab.textContent.trim() + ' · ' + lab.nextElementSibling.textContent.trim() : '';
      return { el: el, title: title };
    });
  }

  async runStatsReport(kind) {
    if (this.state.exportBusy) return;
    const root = this._statsRef.current;
    if (!root) { this.flash('통계 화면을 찾을 수 없습니다'); return; }
    this.setState({ exportBusy: true });
    this.flash('화이트 모드 인쇄용 문서를 만드는 중…');
    let restore = null;
    try {
      const hti = await this.loadLib('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js', 'htmlToImage');
      restore = this.applyLightMode(root);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blocks = this.findStatBlocks(root);
      const shots = [];
      for (const b of blocks) {
        // 스크롤 영역을 펼쳐 전체 내용을 담고, 스크롤바가 캡처되지 않게 함
        const undo = [];
        const setS = (el, k, v) => { undo.push([el, k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]); el.style.setProperty(k, v, 'important'); };
        [b.el].concat([...b.el.querySelectorAll('*')]).forEach(n => {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) {
            setS(n, 'overflow', 'visible');
            setS(n, 'scrollbar-width', 'none');
            if (n.style.maxHeight || cs.maxHeight !== 'none') setS(n, 'max-height', 'none');
          }
        });
        await new Promise(r => requestAnimationFrame(r));
        const fullW = Math.max(b.el.scrollWidth, b.el.offsetWidth);
        [...b.el.querySelectorAll('*')].forEach(n => { if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) setS(n, 'width', n.scrollWidth + 'px'); });
        if (fullW > b.el.offsetWidth) setS(b.el, 'width', fullW + 'px');
        await new Promise(r => requestAnimationFrame(r));
        let c;
        try {
          c = await hti.toCanvas(b.el, {
            backgroundColor: '#fbfbfc', pixelRatio: 2, cacheBust: true, skipFonts: true,
            width: b.el.scrollWidth, height: b.el.scrollHeight,
            filter: (n) => !(n.getAttribute && n.getAttribute('data-export-hide') === '1')
          });
        } finally {
          undo.reverse().forEach(([el, k, v, p]) => v ? el.style.setProperty(k, v, p) : el.style.removeProperty(k));
        }
        shots.push({ canvas: c, title: b.title, land: c.width >= c.height });
      }
      restore(); restore = null;
      if (!shots.length) throw new Error('인쇄할 통계가 없습니다');
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
      const name = '프로그램통계_' + stamp.slice(0, 10);
      const user = this._userName || '';
      const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

      if (kind === 'print') {
        const pages = shots.map((s, i) => '<section class="pg ' + (s.land ? 'land' : 'port') + '"><header><div><div class="k">사회사업실 · 스마트케어 프로그램 통계</div><h1>' + esc(s.title || '통계') + '</h1></div><div class="m">' + (i + 1) + ' / ' + shots.length + '<br>출력 ' + stamp + (user ? ' · ' + esc(user) : '') + '</div></header><div class="fig"><img src="' + s.canvas.toDataURL('image/png') + '"></div><footer>확정 데이터만 집계 · 개인정보 포함 문서이므로 열람 후 파기하세요</footer></section>').join('');
        const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + name + '</title><style>'
          + '@page{margin:10mm}@page land{size:landscape;margin:10mm}@page port{size:portrait;margin:10mm}'
          + '*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#1c1e2c;font-family:Inter,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden;scrollbar-width:none}'
          + '::-webkit-scrollbar{display:none;width:0;height:0}'
          + '.pg{width:100%;height:100vh;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}.pg:last-child{page-break-after:auto;break-after:auto}'
          + '.pg.land{page:land}.pg.port{page:port}'
          + 'header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1pt solid #1c1e2c;padding-bottom:5pt;margin-bottom:8pt}'
          + '.k{font-size:8.5pt;color:#666}h1{font-size:15pt;font-weight:500;margin:2pt 0 0}.m{font-size:8.5pt;color:#666;text-align:right;line-height:1.5}'
          + '.fig{flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center}.fig img{max-width:100%;max-height:100%;object-fit:contain;display:block}'
          + 'footer{font-size:7.5pt;color:#888;margin-top:6pt}</style></head><body>' + pages + '</body></html>';
        const fr = document.createElement('iframe');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        const imgs = [...doc.images];
        await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
        setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { this.flash('인쇄 창을 열 수 없습니다'); } setTimeout(() => fr.remove(), 60000); }, 150);
        this.flash('인쇄 창을 엽니다 — 통계 ' + shots.length + '개, 1통계 1페이지');
      } else if (kind === 'pdf') {
        const lib = await this.loadLib('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf.jsPDF');
        const pdf = new lib({ orientation: shots[0].land ? 'l' : 'p', unit: 'mm', format: 'a4' });
        const m = 10, headH = 16, footH = 8;
        shots.forEach((s, i) => {
          if (i) pdf.addPage('a4', s.land ? 'l' : 'p');
          const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
          // 제목은 캔버스로 그려 한글 깨짐 방지
          const t = document.createElement('canvas'); t.width = 2400; t.height = 120;
          const tc = t.getContext('2d'); tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, t.width, t.height);
          tc.fillStyle = '#666'; tc.font = '26px Inter, "Malgun Gothic", sans-serif'; tc.fillText('사회사업실 · 스마트케어 프로그램 통계', 0, 30);
          tc.fillStyle = '#1c1e2c'; tc.font = '500 46px Inter, "Malgun Gothic", sans-serif'; tc.fillText(s.title || '통계', 0, 90);
          tc.fillStyle = '#666'; tc.font = '24px Inter, "Malgun Gothic", sans-serif'; tc.textAlign = 'right';
          tc.fillText((i + 1) + ' / ' + shots.length + '   출력 ' + stamp + (user ? ' · ' + user : ''), t.width, 90);
          pdf.addImage(t.toDataURL('image/png'), 'PNG', m, m, pw - m * 2, (pw - m * 2) * 120 / 2400);
          pdf.setDrawColor(28, 30, 44); pdf.setLineWidth(0.3); pdf.line(m, m + headH - 2, pw - m, m + headH - 2);
          const aw = pw - m * 2, ah = ph - m * 2 - headH - footH;
          const k = Math.min(aw / s.canvas.width, ah / s.canvas.height);
          const w = s.canvas.width * k, h = s.canvas.height * k;
          pdf.addImage(s.canvas.toDataURL('image/jpeg', 0.95), 'JPEG', m + (aw - w) / 2, m + headH, w, h);
        });
        pdf.save(name + '.pdf');
        this.flash('PDF 다운로드 — 통계 ' + shots.length + '페이지');
      } else {
        const gap = 48, pad = 60, headH = 110;
        const W = Math.max(...shots.map(s => s.canvas.width)) + pad * 2;
        const H = pad * 2 + headH + shots.reduce((n, s) => n + s.canvas.height, 0) + gap * (shots.length - 1);
        const out = document.createElement('canvas'); out.width = W; out.height = H;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#fbfbfc'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1c1e2c'; ctx.font = '500 40px Inter, "Malgun Gothic", sans-serif'; ctx.fillText('사회사업실 · 스마트케어 프로그램 통계', pad, pad + 40);
        ctx.fillStyle = '#666'; ctx.font = '24px Inter, "Malgun Gothic", sans-serif'; ctx.fillText('출력 ' + stamp + (user ? ' · ' + user : '') + ' · 개인정보 포함 — 열람 후 파기', pad, pad + 84);
        let y = pad + headH;
        shots.forEach(s => { ctx.drawImage(s.canvas, pad, y); y += s.canvas.height + gap; });
        const a = document.createElement('a'); a.href = out.toDataURL('image/jpeg', 0.92); a.download = name + '.jpg';
        document.body.appendChild(a); a.click(); a.remove();
        this.flash('JPG 다운로드 — ' + name + '.jpg');
      }
    } catch (e) {
      this.flash('내보내기 실패 — ' + (e && e.message ? e.message : '네트워크를 확인하세요'));
    } finally {
      if (restore) restore();
      this.setState({ exportBusy: false });
    }
  }

  printCanvas(canvas, name) {
    const url = canvas.toDataURL('image/jpeg', 0.95);
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}img{width:100%;display:block}</style></head><body><img src="' + url + '"></body></html>');
    doc.close();
    const img = doc.querySelector('img');
    const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { this.flash('인쇄 창을 열 수 없습니다'); } setTimeout(() => fr.remove(), 60000); };
    if (img.complete) setTimeout(go, 150); else img.onload = () => setTimeout(go, 150);
  }

  async runStatsExport(kind) {
    if (this.state.exportBusy) return;
    this.setState({ exportBusy: true });
    this.flash(kind === 'jpg' ? 'JPG 만드는 중…' : kind === 'pdf' ? 'PDF 만드는 중…' : '인쇄 준비 중…');
    try {
      const { canvas, stamp } = await this.captureStats();
      const name = '프로그램통계_' + stamp;
      if (kind === 'jpg') {
        const url = canvas.toDataURL('image/jpeg', 0.92);
        const a = document.createElement('a'); a.href = url; a.download = name + '.jpg';
        document.body.appendChild(a); a.click(); a.remove();
        this.flash('JPG 다운로드 — ' + name + '.jpg');
      } else if (kind === 'pdf') {
        let lib;
        try { lib = await this.loadLib('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf.jsPDF'); }
        catch (e) {
          this.flash('PDF 도구를 불러오지 못해 인쇄 창을 엽니다 — 대상에서 "PDF로 저장"을 고르세요');
          this.printCanvas(canvas, name);
          return;
        }
        const landscape = canvas.width > canvas.height * 0.9;
        const pdf = new lib({ orientation: landscape ? 'l' : 'p', unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 8;
        const iw = pw - m * 2, scale = iw / canvas.width;
        const sliceH = Math.floor((ph - m * 2) / scale);
        for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
          const h = Math.min(sliceH, canvas.height - y);
          const c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
          c.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (page) pdf.addPage();
          pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, iw, h * scale);
        }
        pdf.save(name + '.pdf');
        this.flash('PDF 다운로드 — ' + name + '.pdf');
      } else {
        this.printCanvas(canvas, name);
        this.flash('인쇄 창을 엽니다');
      }
    } catch (e) {
      this.flash('내보내기 실패 — ' + (e && e.message ? e.message : '네트워크를 확인하세요'));
    } finally {
      this.setState({ exportBusy: false });
    }
  }

  img(url, alt, fit) {
    // 서버에서 아직 받는 중인 사진(wph: 참조)은 그리지 않음
    if (!url || (typeof url === 'string' && url.indexOf('wph:') === 0)) return null;
    const style = fit === 'contain'
      ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', borderRadius: 4 }
      : { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
    return React.createElement('img', { src: url, alt: alt, style: style });
  }

  flash(msg) {
    this.setState({ toast: msg });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setState({ toast: '' }), 2600);
  }

  _refDesc = {};

  loadFaceApi() {
    if (this._faceApiP) return this._faceApiP;
    const BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/';
    this._faceApiP = new Promise((resolve, reject) => {
      if (window.faceapi) { resolve(window.faceapi); return; }
      const sc = document.createElement('script');
      sc.src = BASE + 'dist/face-api.js';
      sc.onload = () => window.faceapi ? resolve(window.faceapi) : reject(new Error('no faceapi'));
      sc.onerror = () => reject(new Error('script load failed'));
      document.head.appendChild(sc);
    }).then(async (fa) => {
      const M = BASE + 'model/';
      await fa.nets.ssdMobilenetv1.loadFromUri(M);
      await fa.nets.faceLandmark68Net.loadFromUri(M);
      await fa.nets.faceRecognitionNet.loadFromUri(M);
      // 보조 검출기 (기울어진·작은 얼굴 보완) — 실패해도 판독은 계속
      try { await fa.nets.tinyFaceDetector.loadFromUri(M); } catch (e) {}
      return fa;
    });
    this._faceApiP.catch(() => { this._faceApiP = null; });
    return this._faceApiP;
  }

  toCanvas(url, max) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        resolve(cv);
      };
      im.onerror = reject;
      im.src = url;
    });
  }

  // 얼굴 영역을 여유 있게 잘라 320px로 확대 → 재검출 → 좌우반전 descriptor와 평균 (작은 얼굴·각도 보정)
  async refineFace(fa, cv, box, opts) {
    const side = Math.max(box.width, box.height) * 1.8;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const S = 320;
    const mk = (flip) => {
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
      if (flip) { ctx.translate(S, 0); ctx.scale(-1, 1); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cv, cx - side / 2, cy - side / 2, side, side, 0, 0, S, S);
      return c;
    };
    const descs = [];
    for (const flip of [false, true]) {
      const d = await fa.detectSingleFace(mk(flip), opts).withFaceLandmarks().withFaceDescriptor();
      if (d) descs.push(d.descriptor);
    }
    if (!descs.length) return null;
    const out = new Float32Array(descs[0].length);
    descs.forEach(d => { for (let i = 0; i < d.length; i++) out[i] += d[i] / descs.length; });
    return out;
  }

  cropFace(cv, box) {
    const side = Math.max(box.width, box.height) * 1.5;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const c = document.createElement('canvas');
    c.width = 112; c.height = 112;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1e2c';
    ctx.fillRect(0, 0, 112, 112);
    ctx.drawImage(cv, cx - side / 2, cy - side / 2, side, side, 0, 0, 112, 112);
    return c.toDataURL('image/jpeg', 0.85);
  }

  async analyzePhotos(opts) {
    opts = opts || {};
    // 판독을 시작한 일지 (판독 중 다른 일지로 이동해도 결과는 이 일지에만 저장)
    const runKey = this.state.activeSession;
    // 재판독 시 유지할 수기 참여자: 사진 없이 직접 추가한 사람 + 지금 첨부된 사진에서 지정한 얼굴만
    // (삭제·교체된 예전 사진에서 지정한 얼굴은 지금 사진에 없는 사람이므로 빼서 인원이 부풀지 않게 함)
    const curPhotoIds = new Set((this.state.photos || []).filter(p => p && p.url).map(p => p.id));
    const prevManualAll = opts.keepManual ? (this.state.review || []).filter(r => r.id && r.sim === 0) : [];
    const prevManual = prevManualAll.filter(r => !(r.src && r.src.pid) || curPhotoIds.has(r.src.pid));
    const droppedManual = prevManualAll.length - prevManual.length;
    const photos = this.state.photos.filter(p => p.url && (!opts.only || opts.only.indexOf(p) >= 0));
    if (photos.length === 0) { this.flash('현장사진을 먼저 올려주세요'); return; }
    if (this.state.fetch === 'error') {
      this.setState({ analyzing: false, ...this.reviewNav(), reviewFailed: true, failCode: 'REKOGNITION_TIMEOUT · 재시도 2/3' });
      return;
    }
    this.setState({ analyzing: true, reviewFailed: false, analyzeStage: 'AI 모델을 불러오는 중… (처음 한 번만 걸립니다)' });
    let fa;
    try { fa = await this.loadFaceApi(); }
    catch (e) {
      if (runKey && this.state.activeSession !== runKey) { this.flash('AI 모델을 불러오지 못해 판독하지 못했습니다'); return; }
      this.setState({ analyzing: false, ...this.reviewNav(), reviewFailed: true, failCode: 'MODEL_LOAD_FAILED · 네트워크 연결을 확인하세요' });
      return;
    }
    try {
      const opts = new fa.SsdMobilenetv1Options({ minConfidence: 0.5 });
      const faces = [];
      for (let i = 0; i < photos.length; i++) {
        this.setState({ analyzeStage: '사진 ' + (i + 1) + ' / ' + photos.length + ' — 얼굴을 찾는 중…' });
        const cv = await this.toCanvas(photos[i].url, 3000);
        // 1차(기본) + 2차(민감) 검출 — 고개를 돌리거나 기울인 얼굴, 그늘진 얼굴까지 찾음
        const det1 = await fa.detectAllFaces(cv, opts);
        const det2 = await fa.detectAllFaces(cv, new fa.SsdMobilenetv1Options({ minConfidence: 0.28, maxResults: 100 }));
        let det3 = [];
        try { if (fa.nets.tinyFaceDetector && fa.nets.tinyFaceDetector.isLoaded) det3 = await fa.detectAllFaces(cv, new fa.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.35 })); } catch (e) {}
        // 단체사진: 사진을 겹치는 조각(2×2, 3×3)으로 나눠 확대 검출 — 작게 찍힌 뒷줄·가장자리 얼굴까지 찾음
        const tileDets = [];
        for (const n of [2, 3]) {
          const tw = cv.width / n, th = cv.height / n, ov = 0.25;
          for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
            this.setState({ analyzeStage: '사진 ' + (i + 1) + ' / ' + photos.length + ' — 단체사진 세밀 검출 (' + n + '×' + n + ' 중 ' + (ty * n + tx + 1) + ')…' });
            const sx = Math.max(0, tx * tw - tw * ov), sy = Math.max(0, ty * th - th * ov);
            const sw = Math.min(cv.width - sx, tw * (1 + ov * 2)), sh = Math.min(cv.height - sy, th * (1 + ov * 2));
            const k = Math.min(2.5, 1400 / Math.max(sw, sh));
            const tc = document.createElement('canvas');
            tc.width = Math.round(sw * k); tc.height = Math.round(sh * k);
            tc.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, tc.width, tc.height);
            let td = [];
            try { td = await fa.detectAllFaces(tc, new fa.SsdMobilenetv1Options({ minConfidence: 0.35, maxResults: 100 })); } catch (e) {}
            td.forEach(d => tileDets.push({ score: d.score, box: { x: sx + d.box.x / k, y: sy + d.box.y / k, width: d.box.width / k, height: d.box.height / k } }));
          }
        }
        det3 = det3.concat(tileDets);
        const iou = (a, b) => { const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height); const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return inter / (a.width * a.height + b.width * b.height - inter || 1); };
        const dets = [];
        // 같은 얼굴이 여러 검출에서 겹쳐 나오면 1개만 (겹침 비율 또는 중심이 다른 얼굴 상자 안에 있으면 같은 얼굴)
        const inside = (a, b) => { const cx = b.x + b.width / 2, cy = b.y + b.height / 2; return cx > a.x && cx < a.x + a.width && cy > a.y && cy < a.y + a.height; };
        det1.concat(det2, det3).sort((a, b) => b.score - a.score).forEach(d => { if (!dets.some(x => iou(x.box, d.box) > 0.3 || inside(x.box, d.box) || inside(d.box, x.box))) dets.push(d); });
        for (let j = 0; j < dets.length; j++) {
          const box = dets[j].box;
          if (box.width < 16) continue; // 아주 작은 점 수준은 오인식 위험이 커서 제외
          this.setState({ analyzeStage: '사진 ' + (i + 1) + ' / ' + photos.length + ' — 얼굴 ' + (j + 1) + ' / ' + dets.length + ' 정밀 분석 중…' });
          let desc = await this.refineFace(fa, cv, box, opts);
          // 정밀 분석이 실패한 얼굴도 버리지 않음 — 민감 설정으로 다시 시도, 그래도 안 되면 '얼굴 확인 필요'로 남김
          if (!desc) desc = await this.refineFace(fa, cv, box, new fa.SsdMobilenetv1Options({ minConfidence: 0.15 }));
          // src: 원본 사진에서 이 얼굴의 위치 (증명사진으로 쓸 때 고화질로 다시 오려냄)
          const kx = 1 / (cv.__k || 1);
          faces.push({ desc: desc || null, photo: i, score: dets[j].score, crop: this.cropFace(cv, box), weak: !desc,
            src: { pid: photos[i].id, w: cv.width, h: cv.height, x: Math.round(box.x), y: Math.round(box.y), bw: Math.round(box.width), bh: Math.round(box.height) } });
        }
      }

      this.setState({ analyzeStage: '얼굴 ' + faces.length + '개 — 같은 사람끼리 묶는 중…' });
      const SAME = 0.5;
      const clusters = [];
      faces.forEach(f => {
        if (!f.desc) { const ph = {}; ph[f.photo] = true; clusters.push({ members: [], photos: ph, rep: f, weak: true }); return; }
        let best = null, bestD = 9;
        // 한 사진에 같은 사람이 두 번 찍힐 수 없음 — 같은 사진의 얼굴이 이미 들어 있는 묶음과는 합치지 않음
        clusters.forEach(c => {
          if (c.photos[f.photo]) return;
          c.members.forEach(m => {
            const d = fa.euclideanDistance(f.desc, m.desc);
            if (d < bestD) { bestD = d; best = c; }
          });
        });
        if (best && bestD < SAME) {
          best.members.push(f); best.photos[f.photo] = true;
          if (f.score > best.rep.score) best.rep = f;
        } else {
          const ph = {}; ph[f.photo] = true;
          clusters.push({ members: [f], photos: ph, rep: f });
        }
      });

      this.setState({ analyzeStage: '환자 명부 증명사진과 대조하는 중…' });
      const urls = this.state.photoUrls;
      const refs = [];
      // 명부에 실제로 있는 환자의 증명사진만 대조 (삭제·변경된 환자의 옛 사진 제외)
      const ids = Object.keys(urls).filter(id => PATIENTS.some(p => p.id === id));
      for (let i = 0; i < ids.length; i++) {
        const u = urls[ids[i]];
        if (this._refDesc2 === undefined) this._refDesc2 = {};
        if (this._refDesc2[u] === undefined) {
          try {
            const cv = await this.toCanvas(u, 1280);
            const dets = await fa.detectAllFaces(cv, opts);
            // 증명사진에 얼굴이 여럿이면 가장 큰 얼굴(본인)을 기준으로
            const big = dets.sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))[0];
            this._refDesc2[u] = big ? await this.refineFace(fa, cv, big.box, opts) : null;
          } catch (e) { this._refDesc2[u] = null; }
        }
        this._refDesc[u] = this._refDesc2[u];
        if (this._refDesc[u]) refs.push({ id: ids[i], desc: this._refDesc[u], url: u });
      }
      // 증명사진이 없는(또는 얼굴을 못 읽은) 환자: 이전 일지에서 직접 [환자 지정]한 얼굴로 학습해 대조
      const learned = {};
      const cropDesc = async (crop) => {
        try {
          const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = crop; });
          const cv = document.createElement('canvas'); cv.width = 336; cv.height = 336;
          cv.getContext('2d').drawImage(im, 0, 0, 336, 336);
          const d = await fa.detectSingleFace(cv, new fa.SsdMobilenetv1Options({ minConfidence: 0.25 })).withFaceLandmarks().withFaceDescriptor();
          return d ? Array.from(d.descriptor) : null;
        } catch (e) { return null; }
      };
      const learnRows = [];
      Object.keys(this.state.sessions || {}).forEach(k => ((this.state.sessions[k] || {}).review || []).forEach(r => learnRows.push(r)));
      (this.state.review || []).forEach(r => learnRows.push(r));
      for (const r of learnRows) {
        if (!r || !r.id || refs.some(x => x.id === r.id && !x.learned)) continue;
        if (!PATIENTS.some(p => p.id === r.id)) continue;
        if ((learned[r.id] || []).length >= 5) continue;
        let d = Array.isArray(r.desc) ? r.desc : (r.crop ? await cropDesc(r.crop) : null);
        if (!d) continue;
        (learned[r.id] = learned[r.id] || []).push(new Float32Array(d));
      }
      Object.keys(learned).forEach(id => learned[id].forEach(d => refs.push({ id: id, desc: d, learned: true })));
      const learnedN = Object.keys(learned).length;
      // 각 얼굴묶음 ↔ 증명사진 거리 (묶음 평균 거리 사용: 한 장의 우연한 근접 방지)
      const pairs = [];
      clusters.forEach((c, ci) => !c.members.length ? null : refs.forEach(r => {
        let sum = 0, md = 9;
        c.members.forEach(m => { const d = fa.euclideanDistance(m.desc, r.desc); sum += d; if (d < md) md = d; });
        pairs.push({ ci: ci, id: r.id, d: (sum / c.members.length + md) / 2 });
      }));
      // 등록 환자끼리도 0.53~0.64 거리까지 가까워질 수 있어, 자동 매칭은 0.45 미만 + 2순위와 0.08 이상 차이일 때만
      const AUTO = 0.45, MARGIN = 0.08;
      const bestOf = {};
      clusters.forEach((c, ci) => {
        const list = pairs.filter(p => p.ci === ci).sort((a, b) => a.d - b.d);
        bestOf[ci] = { first: list[0], second: list[1] };
      });
      pairs.sort((a, b) => a.d - b.d);
      const usedC = {}, usedP = {}, match = {};
      pairs.forEach(p => {
        if (usedC[p.ci] || usedP[p.id] || p.d >= AUTO) return;
        // 2순위 후보와 차이가 작으면 오인식 위험 → 자동 매칭하지 않고 수동 확인
        const b = bestOf[p.ci];
        const others = pairs.filter(x => x.ci === p.ci && x.id !== p.id && !usedP[x.id]).sort((a, c) => a.d - c.d)[0];
        if (others && others.d - p.d < MARGIN) return;
        usedC[p.ci] = true; usedP[p.id] = true; match[p.ci] = p;
      });
      const refUrl = (id) => (refs.find(r => r.id === id) || {}).url;

      // 수기로 지정·추가한 참여자의 얼굴 특징 (저장된 값 → 없으면 얼굴 사진에서 계산)
      const descOfCrop = async (crop) => {
        try {
          const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = crop; });
          const cv = document.createElement('canvas'); cv.width = 336; cv.height = 336;
          cv.getContext('2d').drawImage(im, 0, 0, 336, 336);
          const d = await fa.detectSingleFace(cv, new fa.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor();
          return d ? d.descriptor : null;
        } catch (e) { return null; }
      };
      const manualDesc = [];
      for (const m of prevManual) {
        let d = Array.isArray(m.desc) ? new Float32Array(m.desc) : null;
        if (!d && m.crop) d = await descOfCrop(m.crop);
        if (!d && refs.find(r => r.id === m.id)) d = refs.find(r => r.id === m.id).desc;
        if (d) manualDesc.push({ id: m.id, desc: d });
      }
      const packDesc = (d) => d ? Array.from(d).map(x => Math.round(x * 1000) / 1000) : undefined;
      // 새로 찾은 얼굴이 이미 수기로 지정된 사람이면 미확인으로 만들지 않고 그 사람으로 처리
      const manualOf = {}, manualBest = {};
      clusters.forEach((c, ci) => {
        if (match[ci]) return;
        let best = null, bd = 9;
        manualDesc.forEach(md => c.members.forEach(mm => { const d = fa.euclideanDistance(mm.desc, md.desc); if (d < bd) { bd = d; best = md; } }));
        if (best && bd < SAME && (!manualBest[best.id] || bd < manualBest[best.id].d)) manualBest[best.id] = { ci: ci, d: bd };
      });
      // 수기 지정 환자 1명당 가장 닮은 얼굴 1개만 합침 (나머지는 다른 사람으로 남김)
      Object.keys(manualBest).forEach(id => { manualOf[manualBest[id].ci] = id; });

      let n = 0;
      const stamp = Date.now();
      const review = clusters.map((c, ci) => {
        const m = match[ci];
        const count = Object.keys(c.photos).length;
        const where = count > 1 ? '사진 ' + count + '장에서 동일인 병합' : '사진 1장에서 검출';
        if (m) {
          return { key: 'f' + stamp + ci, id: m.id, sim: Math.round(Math.max(60, Math.min(99, 100 - m.d * 22))), method: 'AI자동 · ' + where, crop: c.rep.crop, desc: packDesc(c.rep.desc), src: c.rep.src };
        }
        if (manualOf[ci]) return null;
        n++;
        const cand = bestOf[ci] && bestOf[ci].first;
        const candP = cand && cand.d < 0.55 && !usedP[cand.id] ? PATIENTS.find(p => p.id === cand.id) : null;
        return { key: 'f' + stamp + ci, id: null, n: n, sim: null, weak: !!c.weak, method: (c.weak ? '얼굴이 기울거나 가려져 자동 대조 불가 · ' : candP ? '후보 ' + candP.name + '? 확인 필요 · ' : '명부 미매칭 · ') + where, crop: c.rep.crop, desc: packDesc(c.rep.desc), src: c.rep.src };
      }).filter(Boolean).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1));

      prevManual.forEach(m => {
        if (review.some(r => r.id === m.id)) return;
        const md = manualDesc.find(x => x.id === m.id);
        review.push(md && !m.desc ? Object.assign({}, m, { desc: packDesc(md.desc) }) : m);
      });
      const mergedN = Object.keys(manualOf).length;
      if (mergedN) setTimeout(() => this.flash('재판독: 이미 수기 지정된 사람과 같은 얼굴 ' + mergedN + '명은 중복으로 보고 합쳤습니다'), 1800);
      const matched = review.filter(r => r.id).length;
      // 판독하는 동안 다른 일지로 옮겨 갔다면, 지금 열린 일지가 아니라 판독을 시작한 일지에 저장
      if (runKey && this.state.activeSession !== runKey) {
        const ss = Object.assign({}, this.state.sessions || {});
        ss[runKey] = Object.assign({}, ss[runKey] || {}, { review: review, confirmed: false });
        this.setState({ analyzing: false, sessions: ss });
        this.flash('판독 완료 — ' + runKey.replace('|', ' ') + ' 일지에 저장했습니다 (판독 중 다른 일지로 이동함)');
        return;
      }
      this.setState({ analyzing: false, review: review, confirmed: false, reviewFailed: false, reSel: null, ...this.reviewNav() });
      if (opts.only) this.flash('재판독 완료 — 사진 ' + photos.length + '장 · 얼굴 ' + faces.length + '개 → ' + review.length + '명' + (prevManual.length ? ' (수기 ' + prevManual.length + '명 유지)' : '') + (droppedManual ? ' · 지금 사진에 없는 예전 지정 ' + droppedManual + '명 제외' : ''));
      else
      if (faces.length === 0) this.flash('사진에서 얼굴을 찾지 못했습니다 — 참여자를 직접 추가하세요');
      else {
        const dmR = this.dupInfo(review);
        const unkN = review.filter(r => !r.id && !dmR[r.key]).length;
        this.flash(unkN ? '⚠ 미확인 환자가 발견되었습니다 — ' + unkN + '명 · 명부 매칭 ' + matched + '명' : '판독 완료 — 얼굴 ' + faces.length + '개 → ' + review.length + '명 (중복 제거) · 명부 매칭 ' + matched + '명');
      }
    } catch (e) {
      if (runKey && this.state.activeSession !== runKey) { this.flash(runKey.replace('|', ' ') + ' 일지 판독 실패 — 그 일지를 열어 다시 판독하세요'); return; }
      this.setState({ analyzing: false, ...this.reviewNav(), reviewFailed: true, failCode: 'FACE_ANALYSIS_ERROR · ' + (e && e.message ? e.message : '알 수 없음') });
    }
  }

  componentWillUnmount() {
    if (this._onUnloadView) { window.removeEventListener('beforeunload', this._onUnloadView); window.removeEventListener('pagehide', this._onUnloadView); }
    clearTimeout(this._t); clearTimeout(this._a); clearInterval(this._u); clearInterval(this._p);
    if (this._onStorage) window.removeEventListener('storage', this._onStorage);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._onPop) window.removeEventListener('popstate', this._onPop);
    if (this._onNavKey) window.removeEventListener('keydown', this._onNavKey);
    if (this._onSbScroll) window.removeEventListener('scroll', this._onSbScroll);
    if (this._verT) { clearInterval(this._verT); this._verT = null; }
    try { document.documentElement.style.zoom = ''; } catch (e) {}
    if (this._onVerFocus) window.removeEventListener('focus', this._onVerFocus);
    if (this._sbRo) { this._sbRo.disconnect(); this._sbRo = null; }
    if (this._onPaste) window.removeEventListener('paste', this._onPaste);
    if (this._onCapFocus) window.removeEventListener('focus', this._onCapFocus);
    if (window.__scPaste === this._onPaste) window.__scPaste = null;
    if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); if (window.__scVis === this._onVis) window.__scVis = null; }
    if (window.__scCapFocus === this._onCapFocus) window.__scCapFocus = null;
    clearInterval(this._cloudPoll); clearTimeout(this._cloudT);
    if (this._cloudWake) { document.removeEventListener('visibilitychange', this._cloudWake); window.removeEventListener('focus', this._cloudWake); this._cloudWake = null; }
    if (window.__scCloudPush) window.__scCloudPush = null;
    if (this._ro) this._ro.disconnect();
    window.removeEventListener('keydown', this._esc);
    ['dragenter', 'dragover', 'drop'].forEach(t => {
      window.removeEventListener(t, this._dropGuard, true);
      document.removeEventListener(t, this._dropGuard, true);
    });
  }

  patient(id) {
    return PATIENTS.find(p => p.id === id) || (id == null ? PATIENTS[0] : null) || PATIENTS[0]
      || { id: '—', room: '—', name: '등록된 환자 없음', sex: '', age: '', consent: '보류', face: '미동의', faceId: '—', last: '', photo: false };
  }

  // ───── 프로그램 일정 계획 ─────
  planIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  savePlans(plans) {
    this.setState({ plans: plans });
    try { localStorage.setItem('smartcare.plans.v1', JSON.stringify(plans)); } catch (e) {}
  }

  _planSplit = React.createRef();

  // ── 프로그램(일자+프로그램)별 참여자 세션 ──
  rangePickerVals(s, cur) {
    const rp = s.rp;
    const p2 = (n) => String(n).padStart(2, '0');
    const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    const open = (target) => () => {
      const [f, t] = cur[target];
      const base = new Date((f || this.todayIso()) + 'T00:00:00');
      this.setState({ rp: { target: target, from: f, to: t, y: base.getFullYear(), m: base.getMonth(), step: 'from' } });
    };
    const out = {
      openRpAtt: open('att'), openRpWs: open('ws'),
      // 모든 날짜칸 공용: 옆의 달력 버튼 → 휴일 색이 적용된 달력 → 값 입력
      openDateCal: (e) => {
        const inp = e.currentTarget.parentElement.querySelector('input[type="date"]');
        if (!inp || inp.disabled) return;
        this._calInput = inp;
        const v = inp.value || this.todayIso();
        const b = new Date(v + 'T00:00:00');
        this.setState({ rp: { target: 'input', single: true, min: inp.min || '', max: inp.max || '', from: inp.value || v, to: inp.value || v, y: b.getFullYear(), m: b.getMonth(), step: 'from' } });
      },
      openRpPlan: () => {
        const [f, t] = cur.plan;
        const base = new Date((f || this.todayIso()) + 'T00:00:00');
        this.setState({ rp: { target: 'plan', from: f, to: t, y: base.getFullYear(), m: base.getMonth(), step: 'from' } });
      },
      openRpPfDate: () => {
        const v = (this.state.planForm || {}).date || this.todayIso();
        const b = new Date(v + 'T00:00:00');
        this.setState({ rp: { target: 'pfDate', single: true, from: v, to: v, y: b.getFullYear(), m: b.getMonth(), step: 'from' } });
      },
      openRpPfUntil: () => {
        const pfm = this.state.planForm || {};
        const v = pfm.until || pfm.date || this.todayIso();
        const b = new Date(v + 'T00:00:00');
        this.setState({ rp: { target: 'pfUntil', single: true, min: pfm.date || '', from: v, to: v, y: b.getFullYear(), m: b.getMonth(), step: 'from' } });
      },
      rpSingle: !!(rp && rp.single),
      rpRange: !(rp && rp.single),
      rpOpen: !!rp,
      rpClose: () => this.setState({ rp: null })
    };
    if (!rp) return Object.assign(out, { rpTitle: '', rpHint: '', rpWeekdays: [], rpDays: [], rpRangeLabel: '' });
    const first = new Date(rp.y, rp.m, 1);
    const startDay = first.getDay();
    const daysIn = new Date(rp.y, rp.m + 1, 0).getDate();
    const cells = Math.ceil((startDay + daysIn) / 7) * 7;
    const today = this.todayIso();
    const days = [];
    for (let i = 0; i < cells; i++) {
      const d = new Date(rp.y, rp.m, i - startDay + 1);
      const k = iso(d), inMonth = d.getMonth() === rp.m;
      const isFrom = k === rp.from, isTo = k === rp.to;
      const inRange = rp.from && rp.to && k > rp.from && k < rp.to;
      const edge = isFrom || isTo;
      const wd = d.getDay();
      const tone = this.dayTone(k, wd);
      days.push({
        num: d.getDate(),
        title: tone.name || '',
        mark: tone.name && tone.kind !== '' ? (edge ? '#14161f' : (tone.color || 'var(--cal-red)')) : 'transparent',
        bg: edge ? 'var(--color-accent)' : inRange ? 'var(--color-accent-900)' : 'transparent',
        color: edge ? '#14161f' : (tone.color || (inRange ? 'var(--color-accent-200)' : 'var(--color-text)')),
        radius: isFrom && isTo ? '8px' : isFrom ? '8px 0 0 8px' : isTo ? '0 8px 8px 0' : inRange ? '0' : '8px',
        ring: k === today && !edge ? 'inset 0 0 0 1px var(--color-accent-600)' : 'none',
        opacity: inMonth ? '1' : '0.35',
        pick: () => {
          const r = this.state.rp;
          if (r.single && r.target === 'input') {
            if (r.min && k < r.min) { this.flash(r.min.replace(/-/g, '.') + ' 이후 날짜를 선택하세요'); return; }
            if (r.max && k > r.max) { this.flash(r.max.replace(/-/g, '.') + ' 이전 날짜를 선택하세요'); return; }
            const inp = this._calInput;
            this.setState({ rp: null });
            if (inp && inp.isConnected) {
              const setV = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setV.call(inp, k);
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
          }
          if (r.single) {
            if (r.min && k < r.min) { this.flash('일정 날짜(' + r.min.replace(/-/g, '.') + ') 이후로 선택하세요'); return; }
            const key = r.target === 'pfUntil' ? 'until' : 'date';
            const pfm = Object.assign({}, this.state.planForm || {}); pfm[key] = k;
            if (key === 'date' && pfm.until && pfm.until < k) pfm.until = k;
            this.setState({ planForm: pfm, rp: null });
            return;
          }
          if (r.step === 'from' || (r.from && k < r.from)) this.setState({ rp: Object.assign({}, r, { from: k, to: null, step: 'to' }) });
          else this.setState({ rp: Object.assign({}, r, { to: k, step: 'from' }) });
        }
      });
    }
    const shiftM = (n) => () => { const r = this.state.rp; const d = new Date(r.y, r.m + n, 1); this.setState({ rp: Object.assign({}, r, { y: d.getFullYear(), m: d.getMonth() }) }); };
    const fmt = (v) => v ? v.replace(/-/g, '.') : '—';
    return Object.assign(out, {
      rpTitle: rp.y + '년 ' + (rp.m + 1) + '월',
      rpHint: rp.single ? (rp.target === 'pfUntil' ? '반복 종료일을 누르세요' : rp.target === 'input' ? '날짜를 누르세요' : '일정 날짜를 누르세요') : rp.step === 'to' ? '종료일을 선택하세요' : '시작일을 선택하세요',
      rpToday: () => {
        const r = this.state.rp, t = this.todayIso(), b = new Date(t + 'T00:00:00');
        this.setState({ rp: Object.assign({}, r, { y: b.getFullYear(), m: b.getMonth() }) });
      },
      rpWeekdays: ['일', '월', '화', '수', '목', '금', '토'].map((l, i) => ({ label: l, color: i === 0 ? 'var(--cal-red)' : i === 6 ? 'var(--cal-blue)' : 'var(--color-neutral-500)' })),
      rpHolis: days.filter(d => d.opacity === '1' && d.title).map(d => ({ label: d.num + '일 ' + d.title, color: d.color === '#14161f' ? 'var(--cal-red)' : d.color })),
      rpHasHolis: days.some(d => d.opacity === '1' && d.title),
      rpDays: days,
      rpPrev: shiftM(-1), rpNext: shiftM(1),
      rpRangeLabel: rp.single ? '선택: ' + fmt(rp.from) : fmt(rp.from) + ' ~ ' + fmt(rp.to || rp.from),
      rpApply: () => {
        const r = this.state.rp;
        if (!r.from) { this.flash('시작일을 선택하세요'); return; }
        const to = r.to || r.from;
        if (r.target === 'plan') this.setState({ planRange: { from: r.from, to: to }, planDay: null, rp: null, plDraftFrom: null, plDraftTo: null, plRangeErr: '', calMonth: r.from.slice(0, 7) });
        else if (r.target === 'att') this.setState({ attFrom: r.from, attTo: to, rp: null });
        else this.setState({ wsFrom: r.from, wsTo: to, rp: null });
        this.flash('기간 적용 — ' + fmt(r.from) + ' ~ ' + fmt(to));
      }
    });
  }

  todayStr() {
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  validState(m) {
    const t = this.todayStr();
    if (m.validFrom && t < m.validFrom) return 'pending';
    if (m.validTo && t > m.validTo) return 'expired';
    return 'active';
  }

  // 팝업창: 이동 · 크기 조절 · 최소화 · 최대화
  winVals(key, defW, minH) {
    const w = (this.state.win || {})[key] || {};
    const set = (patch) => this.setState(st => {
      const all = Object.assign({}, st.win || {});
      all[key] = Object.assign({}, all[key] || {}, patch);
      return { win: all };
    });
    const track = (onMove) => {
      const mv = (ev) => { ev.preventDefault(); this._winDragged = true; onMove(ev); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.style.userSelect = ''; setTimeout(() => { this._winDragged = false; }, 0); };
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    };
    const max = !!w.max, min = !!w.min;
    return {
      dragStart: (e) => {
        if (max || e.button !== 0) return;
        if (e.target.closest && e.target.closest('button, input, select, textarea, a')) return;
        const sx = e.clientX, sy = e.clientY, ox = w.x || 0, oy = w.y || 0;
        track((ev) => set({ x: ox + ev.clientX - sx, y: Math.max(-40, oy + ev.clientY - sy) }));
      },
      handles: (() => {
        const E = 8, C = 16, o = '-4px', oc = '-6px', inset = '12px';
        const defs = [
          { d: 'n', top: o, left: inset, right: inset, w: 'auto', h: E + 'px', cur: 'ns-resize' },
          { d: 's', bottom: o, left: inset, right: inset, w: 'auto', h: E + 'px', cur: 'ns-resize' },
          { d: 'e', right: o, top: inset, bottom: inset, w: E + 'px', h: 'auto', cur: 'ew-resize' },
          { d: 'w', left: o, top: inset, bottom: inset, w: E + 'px', h: 'auto', cur: 'ew-resize' },
          { d: 'ne', top: oc, right: oc, w: C + 'px', h: C + 'px', cur: 'nesw-resize' },
          { d: 'nw', top: oc, left: oc, w: C + 'px', h: C + 'px', cur: 'nwse-resize' },
          { d: 'se', bottom: oc, right: oc, w: C + 'px', h: C + 'px', cur: 'nwse-resize' },
          { d: 'sw', bottom: oc, left: oc, w: C + 'px', h: C + 'px', cur: 'nesw-resize' }
        ];
        return defs.map(h => ({
          top: h.top || 'auto', bottom: h.bottom || 'auto', left: h.left || 'auto', right: h.right || 'auto',
          w: h.w, h: h.h, cursor: h.cur, isSe: h.d === 'se',
          down: (e) => {
            if (max || min || e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            const box = e.currentTarget.parentElement.getBoundingClientRect();
            const sx = e.clientX, sy = e.clientY, x0 = w.x || 0, y0 = w.y || 0;
            const maxW = window.innerWidth - 32, maxHt = window.innerHeight - 32;
            track((ev) => {
              const dx = ev.clientX - sx, dy = ev.clientY - sy, patch = {};
              if (h.d.indexOf('e') >= 0) { const nw = Math.min(maxW, Math.max(480, box.width + dx)); patch.w = Math.round(nw); patch.x = x0 + (nw - box.width) / 2; }
              if (h.d.indexOf('w') >= 0) { const nw = Math.min(maxW, Math.max(480, box.width - dx)); patch.w = Math.round(nw); patch.x = x0 - (nw - box.width) / 2; }
              if (h.d.indexOf('s') >= 0) { patch.h = Math.round(Math.min(maxHt, Math.max(240, box.height + dy))); }
              if (h.d.indexOf('n') >= 0) { const nh = Math.min(maxHt, Math.max(240, box.height - dy)); patch.h = Math.round(nh); patch.y = y0 + (box.height - nh); }
              set(patch);
            });
          }
        }));
      })(),
      tf: max ? 'none' : 'translate(' + (w.x || 0) + 'px, ' + (w.y || 0) + 'px)',
      width: max ? 'calc(100vw - 32px)' : (w.w ? w.w + 'px' : '100%'),
      maxW: max || w.w ? 'none' : defW,
      height: min ? (minH || 'calc(44px + var(--space-8) * 2.4)') : (max ? 'calc(100vh - 32px)' : (w.h ? w.h + 'px' : 'auto')),
      innerH: (min || max || w.h) ? '100%' : 'auto',
      innerMaxH: max ? 'none' : 'calc(100vh - var(--space-8) * 3)',
      bodyDisplay: min ? 'none' : 'contents',
      overflow: min ? 'hidden' : 'auto',
      cursor: max ? 'default' : 'move',
      isMax: max, notMax: !max,
      minIcon: min ? 'ph ph-arrows-out-simple' : 'ph ph-minus',
      minLabel: min ? '펼치기' : '최소화',
      maxIcon: max ? 'ph ph-corners-in' : 'ph ph-corners-out',
      maxLabel: max ? '원래 크기' : '최대화',
      toggleMin: () => set({ min: !min }),
      toggleMax: () => set({ max: !max, min: false }),
      reset: () => set({ x: 0, y: 0, w: 0, h: 0, max: false, min: false }),
      isMin: min
    };
  }

  // 접속 기기 판별: PC → PC 웹, 스마트폰 → 현장 앱, 태블릿 → 현장 앱(태블릿 배치)
  // 주소에 ?app=pc / ?app=mobile / ?app=tablet 을 붙이면 강제 지정 (개발 확인용)
  static detectDevice() {
    if (typeof window === 'undefined') return 'pc';
    const m = /[?&]app=(pc|mobile|1|tablet)\b/.exec(window.location.search);
    if (m) return m[1] === 'pc' ? 'pc' : (m[1] === 'tablet' ? 'tablet' : 'mobile');
    try { const saved = localStorage.getItem('smartcare.viewMode.v1'); if (saved === 'pc' || saved === 'tablet' || saved === 'mobile') return saved; } catch (e) {}
    return Component.autoDevice();
  }

  static autoDevice() {
    if (typeof window === 'undefined') return 'pc';
    const ua = navigator.userAgent || '';
    const touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1;
    const w = Math.min(window.screen ? window.screen.width : window.innerWidth, window.innerWidth);
    if (/iPhone|iPod|Android.+Mobile|Mobile Safari/i.test(ua) || (touch && w < 600)) return 'mobile';
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua) || (touch && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (touch && w < 1400)) return 'tablet';
    return 'pc';
  }

  // 선택 환자가 바뀌면 저장된 서명 불러오기
  syncSigns() {
    const pid = this.state.sel;
    if (!pid || this.state.signImgsFor === pid) return;
    const saved = this.loadSigns(pid);
    this.setState({
      signImgsFor: pid,
      signImgs: saved,
      signed: { '동의인': !!saved['동의인'], '보호자': !!saved['보호자'], '촬영자': !!saved['촬영자'] }
    });
  }

  // 저장된 명부 기준으로 예시 데이터 정리 — PC·모바일이 같은 환자만 보이도록
  syncToRoster() {
    const ids = {}; PATIENTS.forEach(p => { ids[p.id] = true; });
    const names = {}; PATIENTS.forEach(p => { names[p.name] = true; });
    for (let i = BASE_ATTENDANCE.length - 1; i >= 0; i--) if (!names[BASE_ATTENDANCE[i].name]) BASE_ATTENDANCE.splice(i, 1);
    const keep = (list) => (list || []).filter(r => !r.id || ids[r.id]);
    const s = this.state;
    const sessions = {};
    Object.keys(s.sessions || {}).forEach(k => {
      const v = s.sessions[k];
      sessions[k] = v && v.review ? Object.assign({}, v, { review: keep(v.review) }) : v;
    });
    this.setState({
      review: keep(s.review),
      sessions: sessions,
      sel: ids[s.sel] ? s.sel : (PATIENTS[0] ? PATIENTS[0].id : null)
    });
  }

  // ───── 서버 저장 (Supabase) — 모든 PC·기기에서 같은 데이터 ─────
  // 운영 배포 시 아래 기본값에 URL·키를 넣으면 모든 PC에 자동 적용됩니다.
  static CLOUD_DEFAULT = { url: '__SC_CLOUD_URL__', key: '__SC_CLOUD_KEY__', ws: '__SC_CLOUD_WS__' };

  // 서버 설정(주소·공개 키·작업공간) — 로그인 여부와 관계없이
  cloudBase() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem('smartcare.cloud.v1') || '{}'); } catch (e) {}
    const d = Component.CLOUD_DEFAULT;
    const url = (c.url || d.url || '').trim().replace(/\/+$/, '');
    const key = (c.key || d.key || '').trim();
    const ws = (c.ws || d.ws || 'smartcare').trim();
    return url && key ? { url: url, key: key, ws: ws } : null;
  }
  // 서버 사용 설정 — 이 서버에 로그인한 기기에서만 (로그인 전에는 서버에 읽기·쓰기 안 함)
  cloudCfg() {
    const b = this.cloudBase();
    return b && this._auth && this._auth.url === b.url ? b : null;
  }
  // ───── 업무 데이터 저장: 일지·판독·확정, 서면 동의서 첨부, 프로그램 항목 ─────
  // 서면 동의서 첨부(consentFiles·consentVia)는 별도 키로 분리 — 현장 앱이 업무 데이터를 저장해도 첨부가 덮어써지지 않게 함
  static WORK_KEYS = ['sessions', 'activeSession', 'sessionMeta', 'programs', 'review', 'confirmed', 'photos', 'program'];
  static CF_KEY = 'smartcare.cfiles.v1';
  static WPH_PREFIX = 'smartcare.wph.';
  // 증명사진·서명은 환자마다 별도 키로 서버에만 저장 (이 기기 브라우저에는 목록만 보관)
  static IDPH_PREFIX = 'smartcare.idph.';
  static SIGN_PREFIX = 'smartcare.sign.';
  _idphCache = {};
  _idphSent = {};
  _signCache = {};
  // 서버에만 올림 · 서버 미연결이면 브라우저에 저장
  blobPut(key, val) {
    if (window.__scCloudPush && this.cloudCfg && this.cloudCfg()) window.__scCloudPush(key, val);
    else { try { localStorage.setItem(key, val); } catch (e) {} }
  }
  idphIndexStr(map) { return JSON.stringify({ __idx: 2, ids: Object.keys(map || {}).filter(id => map[id]) }); }
  // 저장된 목록(새 형식) 또는 예전 통째 묶음을 사진 지도로 바꿈
  idphFromStored(v) {
    if (!v || typeof v !== 'object') return null;
    if (!v.__idx) return v; // 예전 형식: { id: dataURL }
    const out = {};
    (v.ids || []).forEach(id => {
      let u = this._idphCache[id];
      if (!u) { try { u = localStorage.getItem(Component.IDPH_PREFIX + id); } catch (e) {} if (u) this._idphCache[id] = u; }
      if (u) out[id] = u; else if ((this.state.photoUrls || {})[id]) out[id] = this.state.photoUrls[id];
    });
    return out;
  }
  // 예전 통째 묶음 → 환자별 키로 옮김 (서버에 들어간 것을 확인한 뒤에만 목록 형식으로 바꿈)
  async migrateBlobs() {
    if (this._blobMigrating || (this.state.orgId || 'ORG1') !== 'ORG1') return;
    // 실제 배포 주소에서만 실행 — 새 버전 번호가 서버에 기록돼 예전 기기가 저장을 멈춘 뒤에만 구조를 바꿈
    if (!/github\.io$/.test(location.hostname) && !window.__scForceMigrate) return;
    const c = this.cloudCfg && this.cloudCfg();
    if (!c || !this._cloudReady) return;
    this._blobMigrating = true;
    try {
      const want = {};
      let legacyIdph = null, legacySigns = null;
      try { const v = JSON.parse(localStorage.getItem('smartcare.idphotos.v1') || 'null'); if (v && typeof v === 'object' && !v.__idx) legacyIdph = v; } catch (e) {}
      try { const v = JSON.parse(localStorage.getItem('smartcare.signs.v1') || 'null'); if (v && typeof v === 'object' && !v.__moved && Object.keys(v).length) legacySigns = v; } catch (e) {}
      if (!legacyIdph && !legacySigns) return;
      const alive = {}; PATIENTS.forEach(p => { alive[p.id] = true; });
      const idMap = {};
      if (legacyIdph) Object.keys(legacyIdph).forEach(id => { if (alive[id] && legacyIdph[id]) { idMap[id] = legacyIdph[id]; want[Component.IDPH_PREFIX + id] = legacyIdph[id]; } });
      if (legacySigns) Object.keys(legacySigns).forEach(pid => { if (legacySigns[pid] && Object.keys(legacySigns[pid]).length) want[Component.SIGN_PREFIX + pid] = JSON.stringify(legacySigns[pid]); });
      const keys = Object.keys(want);
      const now = new Date().toISOString();
      for (const k of keys) {
        const r = await fetch(c.url + '/rest/v1/smartcare_kv?on_conflict=k', { method: 'POST', headers: this.cloudHeaders(c, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify([{ k: c.ws + ':' + k, v: want[k], updated_at: now }]) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }
      // 서버 확인: 올린 키가 모두 같은 내용으로 있는지
      const r2 = await fetch(c.url + '/rest/v1/smartcare_kv?select=k,v&or=(k.like.' + encodeURIComponent(c.ws + ':' + Component.IDPH_PREFIX + '*') + ',k.like.' + encodeURIComponent(c.ws + ':' + Component.SIGN_PREFIX + '*') + ')', { headers: this.cloudHeaders(c) });
      if (!r2.ok) throw new Error('확인 실패 HTTP ' + r2.status);
      const got = {}; (await r2.json()).forEach(row => { got[row.k.slice(c.ws.length + 1)] = row.v; });
      const bad = keys.filter(k => got[k] !== want[k]);
      if (bad.length) throw new Error('서버 확인 불일치 ' + bad.length + '건');
      // 확인 완료 → 브라우저의 큰 묶음을 작은 목록으로 교체
      Object.keys(idMap).forEach(id => { this._idphCache[id] = idMap[id]; this._idphSent[id] = idMap[id].length; });
      if (legacySigns) Object.keys(legacySigns).forEach(pid => { this._signCache[pid] = legacySigns[pid]; });
      if (legacyIdph) { this._blobV2 = true; try { localStorage.setItem('smartcare.idphotos.v1', this.idphIndexStr(idMap)); } catch (e) {} this.setState({ photoUrls: idMap }); }
      if (legacySigns) { try { localStorage.setItem('smartcare.signs.v1', JSON.stringify({ __moved: 2 })); } catch (e) {} }
      const removed = legacyIdph ? Object.keys(legacyIdph).length - Object.keys(idMap).length : 0;
      this.flash('저장 구조 정리 완료 — 증명사진 ' + Object.keys(idMap).length + '장 · 서명 ' + (legacySigns ? Object.keys(legacySigns).length : 0) + '명을 환자별로 서버에 저장' + (removed ? ' · 삭제된 환자 사진 ' + removed + '장 정리' : ''));
    } catch (e) {
      this.flash('저장 구조 정리를 미뤘습니다 (' + (e.message || '오류') + ') — 기존 데이터는 그대로입니다');
    } finally { this._blobMigrating = false; }
  }
  static WSESS_PREFIX = 'smartcare.wsess.';
  _wphCache = {};
  _wphSaved = {};

  // ───── 새로고침해도 마지막 화면 유지 ─────
  // 로그인 정보와 보던 화면은 이 브라우저 탭에만 저장 (탭을 닫거나 로그아웃하면 지워짐 · 다른 기기와 공유 안 함)
  static VIEW_KEY = 'sc.lastView.v1';
  static VIEW_KEYS = ['logged', 'userId', 'role', 'orgId', 'pcView', 'mobileView', 'setTab', 'logTab', 'statSec', 'sel', 'pdOpen', 'ward', 'stayFilter', 'search', 'calMonth', 'planDay', 'program', 'activeSession', 'mDay', 'mLogFilter', 'logFilter', 'acctOrg'];
  // 미리보기 창·배포 주소 모두에서 확실히 남도록 localStorage 사용 (로그아웃 시 삭제, 12시간 후 만료)
  writeView() {
    try {
      if (!this.state.logged) { localStorage.removeItem(Component.VIEW_KEY); return; }
      const o = {}; Component.VIEW_KEYS.forEach(k => { if (this.state[k] !== undefined) o[k] = this.state[k]; });
      o.at = Date.now();
      localStorage.setItem(Component.VIEW_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  saveView() {
    clearTimeout(this._viewT);
    this._viewT = setTimeout(() => this.writeView(), 150);
  }
  restoreView() {
    try {
      const v = JSON.parse(localStorage.getItem(Component.VIEW_KEY) || sessionStorage.getItem(Component.VIEW_KEY) || 'null');
      if (!v || !v.logged) return;
      if (Date.now() - (v.at || 0) > 12 * 3600 * 1000) { localStorage.removeItem(Component.VIEW_KEY); return; }
      const m = this.state.roster.find(x => x.id === v.userId);
      if (!m || m.status !== '활성') return;
      const patch = {}; Component.VIEW_KEYS.forEach(k => { if (v[k] !== undefined) patch[k] = v[k]; });
      patch.device = Component.detectDevice();
      // 기관은 계정으로 정함: 시스템 관리자 = '__SYS'(업무 데이터 없음), 그 외 = 소속 기관
      const roles = Array.isArray(m.roles) ? m.roles : [m.role];
      const sys = roles.indexOf('시스템관리자') >= 0;
      const want = sys ? Component.sysOrg(this.state.orgs) : m.org;
      patch.orgId = want;
      if (want !== (window.__scOrg || 'ORG1')) {
        try { const o = {}; Component.VIEW_KEYS.forEach(k => { if (patch[k] !== undefined) o[k] = patch[k]; }); o.at = Date.now(); window.localStorage.setItem(Component.VIEW_KEY, JSON.stringify(o)); } catch (e) {}
        window.location.reload(); return;
      }
      this.setState(patch);
    } catch (e) {}
  }

  // 두 기기의 첨부를 파일 단위로 합침 (삭제 표시된 파일은 제외)
  mergeCF(a, b) {
    a = a || {}; b = b || {};
    const del = Object.assign({}, a.deleted || {}, b.deleted || {});
    const files = {};
    const pids = Object.keys(Object.assign({}, a.files || {}, b.files || {}));
    pids.forEach(pid => {
      const seen = {}, out = [];
      ((a.files || {})[pid] || []).concat(((b.files || {})[pid] || [])).forEach(f => {
        const id = f.id || (f.name + '|' + f.size);
        if (seen[id] || del[id]) return;
        seen[id] = true; out.push(f);
      });
      if (out.length) files[pid] = out;
    });
    return { files: files, via: Object.assign({}, b.via || {}, a.via || {}), deleted: del };
  }
  loadCF() {
    try { return JSON.parse(localStorage.getItem(Component.CF_KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  saveCF() {
    if (window.__scOrg === '__SYS') return;
    const mine = { files: this.state.consentFiles || {}, via: this.state.consentVia || {}, deleted: this.state.cfDeleted || {} };
    const merged = this.mergeCF(mine, this.loadCF());
    const str = JSON.stringify(merged);
    if (str === this._cfLast) return;
    this._cfLast = str;
    try { localStorage.setItem(Component.CF_KEY, str); } catch (e) { this.flash('저장 공간이 부족합니다 — 데이터 서버 연결을 확인하세요'); }
    if (JSON.stringify(merged.files) !== JSON.stringify(mine.files)) this.setState({ consentFiles: merged.files, consentVia: merged.via, cfDeleted: merged.deleted });
  }
  applyCF(v) {
    const mine = { files: this.state.consentFiles || {}, via: this.state.consentVia || {}, deleted: this.state.cfDeleted || {} };
    const merged = this.mergeCF(v, mine);
    this._cfApplying = true;
    this.setState({ consentFiles: merged.files, consentVia: merged.via, cfDeleted: merged.deleted }, () => { this._cfApplying = false; });
  }
  workSnapshot() {
    const s = this.state, o = {};
    Component.WORK_KEYS.forEach(k => { if (s[k] !== undefined) o[k] = s[k]; });
    // 지금 열려 있는 일지도 날짜|프로그램 키로 일지 목록에 함께 저장 (기기마다 열린 일지가 달라도 섞이지 않게)
    o.sessions = Object.assign({}, s.sessions || {});
    o.sessions[this.curKey(s)] = { review: s.review, confirmed: s.confirmed, photos: s.photos };
    // 안전장치: 사진에 적힌 소속 일지(sk)와 다른 일지에는 절대 저장하지 않음
    Object.keys(o.sessions).forEach(k => {
      const v = o.sessions[k];
      if (v && Array.isArray(v.photos) && v.photos.some(p => p && p.sk && p.sk !== k)) o.sessions[k] = Object.assign({}, v, { photos: v.photos.filter(p => !p || !p.sk || p.sk === k) });
    });
    // 판독 행마다 복사돼 있던 증명사진(ref)은 저장하지 않음 — 화면은 등록된 증명사진을 그대로 사용
    const strip = (arr) => Array.isArray(arr) ? arr.map(r => (r && r.ref) ? Object.assign({}, r, { ref: undefined }) : r) : arr;
    // 현장사진 원본은 'wph:<id>' 참조로 바꾸고 사진마다 별도 키로 저장
    const refPhotos = (arr) => Array.isArray(arr) ? arr.map(p => {
      if (!p || !p.url || p.url.indexOf('data:') !== 0) return p;
      const id = p.id || ('ph-' + p.url.length);
      this._wphCache[id] = p.url;
      if (!this._wphSaved[id]) {
        this._wphSaved[id] = true;
        // 서버에만 올림 (브라우저 저장 공간 절약). 서버 미연결이면 브라우저에 저장
        if (window.__scCloudPush && this.cloudCfg()) window.__scCloudPush(Component.WPH_PREFIX + id, p.url);
        else { try { localStorage.setItem(Component.WPH_PREFIX + id, p.url); } catch (e) {} }
      }
      return Object.assign({}, p, { id: id, url: 'wph:' + id });
    }) : arr;
    if (o.review) o.review = strip(o.review);
    if (o.photos) o.photos = refPhotos(o.photos);
    if (o.sessions) {
      const ss = {};
      Object.keys(o.sessions).forEach(k => { const v = o.sessions[k]; ss[k] = v ? Object.assign({}, v, { review: strip(v.review), photos: refPhotos(v.photos) }) : v; });
      o.sessions = ss;
    }
    return o;
  }
  // 'wph:<id>' 참조를 실제 사진으로 되돌림 (브라우저 저장 → 서버에서 받은 사진 순)
  hydratePhotos(o) {
    let changed = false;
    const fix = (arr) => Array.isArray(arr) ? arr.map(p => {
      if (!p || typeof p.url !== 'string' || p.url.indexOf('wph:') !== 0) return p;
      const id = p.url.slice(4);
      let u = this._wphCache[id];
      if (!u) { try { u = localStorage.getItem(Component.WPH_PREFIX + id); } catch (e) {} if (u) { this._wphCache[id] = u; this._wphSaved[id] = true; } }
      if (!u) return p;
      changed = true;
      return Object.assign({}, p, { url: u });
    }) : arr;
    const out = Object.assign({}, o);
    if (o.photos) out.photos = fix(o.photos);
    if (o.sessions) {
      const ss = {};
      Object.keys(o.sessions).forEach(k => { const v = o.sessions[k]; ss[k] = v && v.photos ? Object.assign({}, v, { photos: fix(v.photos) }) : v; });
      out.sessions = ss;
    }
    out.changed = changed;
    return out;
  }
  workPatch(v) {
    const o = {};
    Component.WORK_KEYS.forEach(k => { if (v && v[k] !== undefined) o[k] = v[k]; });
    const h = this.hydratePhotos(o);
    delete h.changed;
    return h;
  }
  // 다른 기기에서 받은 업무 데이터: 일지 목록만 합치고, 이 기기에서 열어 둔 일지는 그대로 유지
  // (예전에는 다른 기기의 '열린 일지'로 바꿔치기돼, 작성 중이던 일지가 엉뚱한 날짜로 저장되던 문제)
  workPatchRemote(v) {
    const s = this.state;
    const myKey = this.curKey(s);
    // 일지는 일지별 키(wsess)로만 받음 — 예전 버전 기기가 올린 묶음 데이터의 일지는 오래된 값일 수 있어 무시
    const inc = (this._sessSaved && Object.keys(this._sessSaved).length) ? {} : ((v && v.sessions) || {});
    const sessions = Object.assign({}, s.sessions || {}, inc);
    // 이 기기에서 지금 작성 중인 일지는 내 화면 값을 우선 (아직 서버에 안 올라갔을 수 있음)
    const mine = { review: s.review, confirmed: s.confirmed, photos: s.photos };
    const theirs = inc[myKey];
    const useTheirs = theirs && JSON.stringify(theirs) !== JSON.stringify(mine) && !this._workDirty;
    if (!useTheirs) sessions[myKey] = mine;
    const cur = sessions[myKey] || this.defaultSession(myKey);
    const out = {
      sessions: sessions,
      sessionMeta: Object.assign({}, s.sessionMeta || {}, (v && v.sessionMeta) || {}),
      programs: (v && v.programs) || s.programs,
      review: cur.review || [], confirmed: !!cur.confirmed, photos: cur.photos || []
    };
    const h = this.hydratePhotos(out);
    delete h.changed;
    return h;
  }
  // 현장사진 축소: 긴 변 1600px · JPEG 0.82 (약 200~400KB) — 서버·브라우저 저장 용량 안에 들어가게
  shrinkPhoto(url, max, force, q) {
    max = max || 1600;
    return new Promise((resolve) => {
      if (!url || url.indexOf('data:image') !== 0 || (!force && url.length < 600000) || (force && url.length < 90000)) { resolve(url); return; }
      setTimeout(() => resolve(url), 8000);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const cx2 = c.getContext('2d'); cx2.imageSmoothingEnabled = true; cx2.imageSmoothingQuality = 'high';
        cx2.drawImage(im, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', q || 0.82);
        resolve(out.length < url.length ? out : url);
      };
      im.onerror = () => resolve(url);
      im.src = url;
    });
  }
  // 이미 저장된 큰 사진(일지별 현장사진 · 판독 얼굴)을 한 번 축소
  async compactWork() {
    if (this._compacting) return;
    this._compacting = true;
    try {
      const s = this.state;
      const fixList = async (arr) => {
        let ch = false;
        const out = [];
        for (const p of (arr || [])) {
          if (p && p.url && p.url.length >= 600000) { const u = await this.shrinkPhoto(p.url); if (u !== p.url) ch = true; out.push(Object.assign({}, p, { url: u })); }
          else out.push(p);
        }
        return { out, ch };
      };
      const fixReview = async (arr) => {
        let ch = false;
        const out = [];
        for (const r of (arr || [])) {
          if (r && r.crop && r.crop.length >= 600000) { const u = await this.shrinkPhoto(r.crop, 160); if (u !== r.crop) ch = true; out.push(Object.assign({}, r, { crop: u })); }
          else out.push(r);
        }
        return { out, ch };
      };
      let changed = false;
      const top = await fixList(s.photos); changed = changed || top.ch;
      const sessions = {};
      for (const k of Object.keys(s.sessions || {})) {
        const v = s.sessions[k] || {};
        const a = await fixList(v.photos), b = await fixReview(v.review);
        sessions[k] = Object.assign({}, v, { photos: a.out, review: b.out });
        changed = changed || a.ch || b.ch;
      }
      if (changed) {
        // 정리하는 동안 일지를 옮겼거나 사진·일지가 바뀌었으면, 예전 내용으로 덮어쓰지 않음
        const now = this.state;
        const samePhotos = now.activeSession === s.activeSession && now.photos === s.photos;
        const merged = Object.assign({}, now.sessions || {});
        Object.keys(sessions).forEach(k => { if ((now.sessions || {})[k] === (s.sessions || {})[k]) merged[k] = sessions[k]; });
        this.setState(samePhotos ? { photos: top.out, sessions: merged } : { sessions: merged });
        this.flash('저장 공간 정리 — 현장사진을 축소해 서버에 저장합니다');
      }
    } finally { this._compacting = false; }
  }

  // ───── 미확인 얼굴 → 증명사진 등록 ─────
  // 원본 단체사진에서 그 얼굴을 고화질로 다시 오려냄 (목록용 작은 얼굴 사진이 아니라 원본 화소 그대로)
  async hqFaceFromRow(row) {
    const src = row && row.src;
    let url = null;
    if (src && src.pid) {
      const all = (this.state.photos || []).concat(...Object.values(this.state.sessions || {}).map(v => v.photos || []));
      const ph = all.find(x => x && x.id === src.pid);
      url = ph && ph.url;
      if (url && url.indexOf('wph:') === 0) url = (this._wphCache || {})[url.slice(4)] || null;
    }
    if (!url) return row && row.crop ? { url: row.crop, px: 112 } : null;
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = im.width / (src.w || im.width);
    let bw = src.bw * k, bh = src.bh * k;
    let cx = (src.x + src.bw / 2) * k, cy = (src.y + src.bh / 2) * k;
    // 저장된 위치는 검출 방식에 따라 어긋날 수 있음 → 원본 사진에서 얼굴을 다시 찾아 같은 사람(얼굴 특징)을 고름
    let others = [];
    try {
      const fa0 = await this.loadFaceApi();
      const sc = Math.min(1, 2400 / Math.max(im.width, im.height));
      const cv0 = document.createElement('canvas'); cv0.width = Math.round(im.width * sc); cv0.height = Math.round(im.height * sc);
      cv0.getContext('2d').drawImage(im, 0, 0, cv0.width, cv0.height);
      const hasDesc = Array.isArray(row.desc) && row.desc.length === 128;
      const opt0 = new fa0.SsdMobilenetv1Options({ minConfidence: 0.3, maxResults: 200 });
      const found = hasDesc
        ? await fa0.detectAllFaces(cv0, opt0).withFaceLandmarks().withFaceDescriptors()
        : (await fa0.detectAllFaces(cv0, opt0)).map(d => ({ detection: d }));
      if (found.length) {
        const ref = hasDesc ? new Float32Array(row.desc) : null;
        let bi = -1, bs = 1e9;
        found.forEach((f, i) => {
          const b = f.detection.box;
          const score = ref ? fa0.euclideanDistance(f.descriptor, ref) : Math.hypot((b.x + b.width / 2) / sc - cx, (b.y + b.height / 2) / sc - cy);
          if (score < bs) { bs = score; bi = i; }
        });
        if (bi >= 0 && (!ref || bs < 0.6)) {
          const b = found[bi].detection.box;
          bw = b.width / sc; bh = b.height / sc; cx = (b.x + b.width / 2) / sc; cy = (b.y + b.height / 2) / sc;
        }
        others = found.filter((_, i) => i !== bi).map(f => { const b = f.detection.box; return { x: b.x / sc, y: b.y / sc, w: b.width / sc, h: b.height / sc }; });
      }
    } catch (e) {}
    const fs = Math.max(bw, bh);
    // 다른 얼굴과 겹치지 않는 가장 큰 여백 배율
    const hits = (sx, sy, w, h) => others.some(o => o.x < sx + w && o.x + o.w > sx && o.y < sy + h && o.y + o.h > sy);
    // 증명사진 비율 3:4 · 얼굴 한 사람만 (주변 사람이 들어오지 않게 여백을 줄여 가며 확인)
    const build = (mul) => {
      const w = fs * mul, h = w * 4 / 3;
      let sx = cx - w / 2, sy = cy - h * 0.45;
      sx = Math.max(0, Math.min(im.width - w, sx)); sy = Math.max(0, Math.min(im.height - h, sy));
      const sw = Math.min(im.width - sx, w), sh = Math.min(im.height - sy, h);
      const c = this.upscaleSharp(im, sx, sy, sw, sh, 800, 1200);
      return { c: c, sw: sw };
    };
    let mulPick = 1.05;
    for (const mul of [1.7, 1.55, 1.4, 1.28, 1.16, 1.05]) {
      const w = fs * mul, h = w * 4 / 3;
      let sx = Math.max(0, Math.min(im.width - w, cx - w / 2)), sy = Math.max(0, Math.min(im.height - h, cy - h * 0.45));
      if (!hits(sx, sy, w, h)) { mulPick = mul; break; }
    }
    const best = build(mulPick);
    return { url: best.c.toDataURL('image/jpeg', 0.95), px: Math.round(best.sw) };
  }
  async openIdPrompt(p, row) {
    const had = !!(this.state.photoUrls || {})[p.id];
    let face = null;
    try { face = await this.hqFaceFromRow(row); } catch (e) {}
    this.setState({ idPrompt: { pid: p.id, name: p.name, had: had, face: face ? face.url : null, srcPx: face ? face.px : 0 } });
  }
  // ───── 증명사진 자르기 (확인 창 안) ─────
  // 자르기 상자는 사진 표시 크기 대비 비율(0~1)로 보관 → 화면 크기와 무관
  _cropBoxRef = React.createRef();
  cropVals(s, ip) {
    const c = s.crop;
    if (!c || !ip || !ip.face) return { cropOpen: false, idpCropOpen: () => this.cropStart(ip) };
    const pct = (v) => (v * 100).toFixed(2) + '%';
    const RATIOS = [{ k: 0.75, label: '증명사진 3:4' }, { k: 1, label: '정사각 1:1' }, { k: 0, label: '자유' }];
    return {
      cropOpen: true,
      idpCropOpen: () => {},
      cropBoxRef: this._cropBoxRef,
      cropImgEl: React.createElement('img', { src: ip.face, alt: '자를 사진', draggable: false, style: { display: 'block', maxWidth: '100%', maxHeight: '46vh', width: 'auto', height: 'auto', pointerEvents: 'none' } }),
      cropL: pct(c.x), cropT: pct(c.y), cropW: pct(c.w), cropH: pct(c.h),
      cropRatios: RATIOS.map(r => ({ label: r.label, cls: c.ratio === r.k ? 'btn btn-primary' : 'btn btn-secondary', go: () => this.cropSetRatio(r.k) })),
      cropDragStart: (e) => this.cropPointer(e, 'move'),
      // 테두리 4개 + 모서리 4개 — 위·아래·좌·우 어느 쪽이든 자유롭게 자르기
      cropHandles: [
        { m: 'n', l: '50%', t: '0%', w: '34px', h: '10px', r: '5px', cur: 'ns-resize', label: '위쪽 자르기' },
        { m: 's', l: '50%', t: '100%', w: '34px', h: '10px', r: '5px', cur: 'ns-resize', label: '아래쪽 자르기' },
        { m: 'w', l: '0%', t: '50%', w: '10px', h: '34px', r: '5px', cur: 'ew-resize', label: '왼쪽 자르기' },
        { m: 'e', l: '100%', t: '50%', w: '10px', h: '34px', r: '5px', cur: 'ew-resize', label: '오른쪽 자르기' },
        { m: 'nw', l: '0%', t: '0%', w: '16px', h: '16px', r: '50%', cur: 'nwse-resize', label: '왼쪽 위 모서리' },
        { m: 'ne', l: '100%', t: '0%', w: '16px', h: '16px', r: '50%', cur: 'nesw-resize', label: '오른쪽 위 모서리' },
        { m: 'sw', l: '0%', t: '100%', w: '16px', h: '16px', r: '50%', cur: 'nesw-resize', label: '왼쪽 아래 모서리' },
        { m: 'se', l: '100%', t: '100%', w: '16px', h: '16px', r: '50%', cur: 'nwse-resize', label: '오른쪽 아래 모서리' }
      ].map(hd => Object.assign({}, hd, { down: (e) => { e.stopPropagation(); this.cropPointer(e, hd.m); } })),
      cropCancel: () => this.setState({ crop: null }),
      cropApply: () => this.cropApply(ip)
    };
  }
  cropStart(ip) {
    if (!ip || !ip.face) return;
    const im = new Image();
    im.onload = () => {
      const iw = im.naturalWidth, ih = im.naturalHeight;
      // 3:4 상자를 사진 가운데 · 최대 크기로
      let w = 0.9, h = (w * iw / 0.75) / ih;
      if (h > 0.9) { h = 0.9; w = (h * ih * 0.75) / iw; }
      this.setState({ crop: { x: (1 - w) / 2, y: (1 - h) / 2, w: w, h: h, ratio: 0, iw: iw, ih: ih } });
    };
    im.src = ip.face;
  }
  cropSetRatio(k) {
    const c = this.state.crop; if (!c) return;
    let w = c.w, h = c.h;
    if (k) { h = (w * c.iw / k) / c.ih; if (h > 1) { h = 1; w = (h * c.ih * k) / c.iw; } }
    const x = Math.min(c.x, 1 - w), y = Math.min(c.y, 1 - h);
    this.setState({ crop: Object.assign({}, c, { w: w, h: h, x: Math.max(0, x), y: Math.max(0, y), ratio: k }) });
  }
  cropPointer(e, mode) {
    const box = this._cropBoxRef.current; const c0 = this.state.crop;
    if (!box || !c0) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      const c = Object.assign({}, c0);
      if (mode === 'move') {
        c.x = Math.max(0, Math.min(1 - c.w, c0.x + dx));
        c.y = Math.max(0, Math.min(1 - c.h, c0.y + dy));
      } else {
        const MIN = 0.06;
        let l = c0.x, t = c0.y, r = c0.x + c0.w, b = c0.y + c0.h;
        if (mode.indexOf('w') >= 0) l = Math.max(0, Math.min(r - MIN, l + dx));
        if (mode.indexOf('e') >= 0) r = Math.min(1, Math.max(l + MIN, r + dx));
        if (mode.indexOf('n') >= 0) t = Math.max(0, Math.min(b - MIN, t + dy));
        if (mode.indexOf('s') >= 0) b = Math.min(1, Math.max(t + MIN, b + dy));
        // 테두리(한 방향)를 끌면 비율 고정을 풀고 자유롭게 · 모서리는 고른 비율 유지
        const corner = mode.length === 2;
        if (corner && c0.ratio) {
          const w = r - l; let h = (w * c0.iw / c0.ratio) / c0.ih;
          if (mode.indexOf('n') >= 0) { t = Math.max(0, b - h); h = b - t; } else { b = Math.min(1, t + h); h = b - t; }
          const w2 = (h * c0.ih * c0.ratio) / c0.iw;
          if (mode.indexOf('w') >= 0) l = r - w2; else r = l + w2;
        } else if (!corner) c.ratio = 0;
        c.x = l; c.y = t; c.w = r - l; c.h = b - t;
      }
      this.setState({ crop: c });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  cropApply(ip) {
    const c = this.state.crop; if (!c || !ip || !ip.face) return;
    const im = new Image();
    im.onload = () => {
      const sx = c.x * im.naturalWidth, sy = c.y * im.naturalHeight, sw = c.w * im.naturalWidth, sh = c.h * im.naturalHeight;
      // 증명사진 크기로 크게 (긴 변 800~1200px) + 선명 보정
      const cv = this.upscaleSharp(im, sx, sy, sw, sh, 800, 1200);
      const url = cv.toDataURL('image/jpeg', 0.95);
      this.setState({ crop: null, idPrompt: Object.assign({}, this.state.idPrompt, { face: url, srcPx: Math.round(sw), how: ip.how || '' , cropped: true }) });
      this.flash('자르기 적용 — 확인 후 [증명사진 등록]을 누르세요');
    };
    im.src = ip.face;
  }

  // 증명사진 확인 창에서 받은 파일(첨부·캡처) → 미리보기로 바꿔 보여 주고, [이 사진으로 등록]으로 저장
  acceptIdpFile(f, how) {
    const ip = this.state.idPrompt;
    if (!ip || !f) return;
    if (!/^image\//.test(f.type)) { this.flash('이미지 파일만 등록할 수 있습니다'); return; }
    const fr = new FileReader();
    fr.onload = async () => {
      const u = await this.shrinkPhoto(fr.result, 1024, true, 0.92);
      const cur = this.state.idPrompt;
      if (!cur || cur.pid !== ip.pid) return;
      this.setState({ idPrompt: Object.assign({}, cur, { face: u, srcPx: 0, how: how }) });
      this.flash(how + '을 불러왔습니다 — 확인 후 [이 사진으로 증명사진 등록]을 누르세요');
    };
    fr.readAsDataURL(f);
  }

  async saveIdPhoto(pid, url, how) {
    const map = Object.assign({}, this.state.photoUrls || {}); map[pid] = url;
    const pt = PATIENTS.find(x => x.id === pid);
    if (pt) pt.photo = true;
    this.setState({ photoUrls: map, idPrompt: null, crop: null });
    this.persistPatients(map);
    this.flash((pt ? pt.name : '') + ' 증명사진 등록 — ' + how);
  }

  // 증명사진 크기 정리 (긴 변 1024px · 고화질) — 너무 큰 원본만 줄이고 화질은 유지
  async compactIdPhotos() {
    if (this._idCompacting) return;
    this._idCompacting = true;
    try {
      const cur = this.state.photoUrls || {};
      const next = {}; let ch = false;
      for (const id of Object.keys(cur)) {
        const u = (cur[id] || '').length > 1400000 ? await this.shrinkPhoto(cur[id], 1024, true, 0.92) : cur[id];
        if (u !== cur[id]) ch = true;
        next[id] = u;
      }
      if (ch) { this.setState({ photoUrls: next }); this.persistPatients(next); }
    } finally { this._idCompacting = false; }
  }

  // 같은 얼굴이 2행 이상이면 뒤쪽 행을 '중복 인물'로 표시 (미확인 행을 우선 중복 처리)
  dupInfo(review) {
    const rows = (review || []).filter(r => r && (Array.isArray(r.desc) || r.crop));
    const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
    const out = {};
    const ordered = rows.slice().sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1));
    ordered.forEach((r, i) => {
      if (out[r.key]) return;
      for (let j = 0; j < i; j++) {
        const o = ordered[j];
        if (out[o.key]) continue;
        // 같은 판독에서 나온 얼굴끼리는 이미 서로 다른 사람으로 나뉘었으므로 중복으로 보지 않음
        const batch = (k) => { const m = /^f(\d{13})/.exec(k || ''); return m ? m[1] : null; };
        const sameBatch = batch(r.key) && batch(r.key) === batch(o.key);
        const same = !sameBatch && ((r.crop && o.crop && r.crop === o.crop) || (Array.isArray(r.desc) && Array.isArray(o.desc) && r.desc.length === o.desc.length && dist(r.desc, o.desc) < 0.4));
        if (same) { out[r.key] = o; break; }
      }
    });
    return out;
  }
  // 얼굴 특징이 없는 행(예전 데이터)은 얼굴 사진에서 계산해 둠 — 중복 판별용
  async ensureReviewDescs() {
    const need = (this.state.review || []).filter(r => r && r.crop && !Array.isArray(r.desc) && !(this._descTried || {})[r.key]);
    if (!need.length || this._descBusy) return;
    this._descBusy = true; this._descTried = this._descTried || {};
    try {
      const fa = await this.loadFaceApi();
      const got = {};
      for (const r of need) {
        this._descTried[r.key] = true;
        try {
          const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = r.crop; });
          const cv = document.createElement('canvas'); cv.width = 336; cv.height = 336;
          cv.getContext('2d').drawImage(im, 0, 0, 336, 336);
          const d = await fa.detectSingleFace(cv, new fa.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor();
          if (d) got[r.key] = Array.from(d.descriptor).map(x => Math.round(x * 1000) / 1000);
        } catch (e) {}
      }
      if (Object.keys(got).length) this.setState({ review: this.state.review.map(r => got[r.key] ? Object.assign({}, r, { desc: got[r.key] }) : r) });
    } catch (e) {} finally { this._descBusy = false; }
  }

  // 결재라인 (기관별) — 인쇄 문서 하단 결재란
  static APPROVAL_KEY = 'smartcare.approval.v1';
  approvalAll() { try { return JSON.parse(localStorage.getItem(Component.APPROVAL_KEY) || '{}') || {}; } catch (e) { return {}; } }
  approvalLine(org) {
    const o = org || this.state.orgId || 'ORG1';
    const v = this.approvalAll()[o];
    return Array.isArray(v) ? v : ['담당', '팀장', '실장'];
  }
  saveApproval(list, org) {
    const o = org || this.state.orgId || 'ORG1';
    const all = this.approvalAll(); all[o] = list;
    try { localStorage.setItem(Component.APPROVAL_KEY, JSON.stringify(all)); } catch (e) {}
    this.setState({ apRev: (this.state.apRev || 0) + 1 });
  }

  saveWork() {
    if (window.__scOrg === '__SYS' || this._workApplying || !this._workLoaded) return;
    clearTimeout(this._workT);
    this._workDirty = true;
    this._workT = setTimeout(() => {
      this._workDirty = false;
      const snap = this.workSnapshot();
      // 일지는 일지마다 별도 키로 저장 — 이 기기에서 실제로 바뀐 일지만 서버에 올림
      // (예전에는 전체 일지를 한 덩어리로 올려, 나중에 저장한 기기가 다른 기기의 수정을 덮어썼음)
      this._sessSaved = this._sessSaved || {};
      this._sessDirty = this._sessDirty || {};
      const sess = snap.sessions || {};
      // 서버와 첫 동기화가 끝나기 전에는 일지를 올리지 않음 (이 기기의 오래된 값이 서버의 최신 일지를 덮어쓰지 않게)
      const canPush = !this.cloudCfg() || this._cloudReady;
      Object.keys(sess).forEach(k => {
        // 이 기기에서 사용자가 직접 바꾼 일지만 올림
        if (!this._sessDirty[k] || !canPush) return;
        const v = JSON.stringify(sess[k]);
        delete this._sessDirty[k];
        if (this._sessSaved[k] === v) return;
        // 안전장치: 확정 일지의 참여자가 줄어드는 저장이면 직전 내용을 백업 키로 보관 (실수·오래된 기기 덮어쓰기 복구용)
        try {
          const prevRaw = this._sessSaved[k] || localStorage.getItem(Component.WSESS_PREFIX + encodeURIComponent(k));
          if (prevRaw) {
            const pv = JSON.parse(prevRaw), nv = sess[k] || {};
            const pn = (pv.review || []).filter(r => r && r.id).length, nn = (nv.review || []).filter(r => r && r.id).length;
            if (pn > nn) localStorage.setItem('smartcare.wsessbak.' + encodeURIComponent(k) + '.' + Date.now(), prevRaw);
          }
        } catch (e) {}
        this._sessSaved[k] = v;
        try { localStorage.setItem(Component.WSESS_PREFIX + encodeURIComponent(k), v); } catch (e) {}
      });
      const core = Object.assign({}, snap);
      delete core.sessions;
      core.sessKeys = Object.keys(sess);
      const str = JSON.stringify(core);
      if (str === this._workLast) return;
      this._workLast = str;
      try { localStorage.setItem('smartcare.work.v1', str); }
      catch (e) { if (!this.cloudCfg()) this.flash('브라우저 저장 공간이 가득 찼습니다 — 설정 › 데이터 서버를 연결하면 모든 PC에 저장됩니다'); }
    }, 500);
  }
  // 다른 기기가 올린 일지 1건 반영 (이 기기에서 작성 중이 아닐 때만 화면도 갱신)
  applyRemoteSession(key, raw) {
    let v; try { v = JSON.parse(raw); } catch (e) { return; }
    this._sessSaved = this._sessSaved || {};
    if (this._sessSaved[key] === raw) return;
    const prevRaw = this._sessSaved[key];
    this._sessSaved[key] = raw;
    // 지금 열려 있는 일지에 아직 서버에 안 올라간 변경(사진 업로드 중 등)이 있으면 덮어쓰지 않고 합침
    if (this.curKey(this.state) === key && !v.deleted && (this._uploading || this._workDirty || (this._sessDirty || {})[key])) {
      const s0 = this.state;
      const mineRaw = JSON.stringify({ review: s0.review, confirmed: s0.confirmed, photos: s0.photos });
      try { v = JSON.parse(Component.merge3(Component.WSESS_PREFIX + key, prevRaw, raw, mineRaw)); } catch (e) {}
      this._sessDirty = this._sessDirty || {}; this._sessDirty[key] = true;
    }
    // 삭제 표시된 빈 일지는 목록에서 제거
    if (v && v.deleted) {
      const ss = Object.assign({}, this.state.sessions || {}); delete ss[key];
      const mm = Object.assign({}, this.state.sessionMeta || {}); delete mm[key];
      this._workApplying = true;
      this.setState({ sessions: ss, sessionMeta: mm });
      setTimeout(() => { this._workApplying = false; }, 50);
      return;
    }
    const h = this.hydratePhotos({ sessions: { [key]: v } });
    const sv = h.sessions[key];
    const patch = { sessions: Object.assign({}, this.state.sessions || {}, { [key]: sv }) };
    const mine = this.curKey(this.state) === key;
    if (mine) Object.assign(patch, { review: sv.review || [], confirmed: !!sv.confirmed, photos: sv.photos || [] });
    this._workApplying = true;
    this.setState(patch);
    setTimeout(() => { this._workApplying = false; }, 50);
    if (mine && !this._cloudQuiet) this.flash('다른 기기에서 이 일지가 수정되어 반영했습니다');
  }

  // ───── 서버 로그인 (Supabase Auth · 기관 공용 계정) ─────
  // 서버 데이터는 작업공간에 등록된 계정으로 로그인해야만 읽고 쓸 수 있음 (RLS)
  // 로그인 토큰은 이 기기에만 보관 ('smartcare.' 접두어가 아니라 서버로 동기화되지 않음)
  static AUTH_KEY = 'sc.auth.v1';
  _auth = (() => { try { const a = JSON.parse(window.localStorage.getItem('sc.auth.v1') || 'null'); return a && a.refresh_token && a.url ? a : null; } catch (e) { return null; } })();
  authStore(a) {
    this._auth = a;
    try { if (a) localStorage.setItem(Component.AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(Component.AUTH_KEY); } catch (e) {}
  }
  authFrom(j, url, email) {
    return { url: url, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, email: (j.user && j.user.email) || email || '' };
  }
  async authSignIn(email, password) {
    const b = this.cloudBase();
    if (!b) throw new Error('데이터 서버 설정이 없습니다');
    let r;
    try {
      r = await fetch(b.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: b.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) });
    } catch (e) { throw new Error('서버에 연결할 수 없습니다 — 인터넷 연결을 확인하세요'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? '서버 계정 이메일 또는 비밀번호가 맞지 않습니다' : '서버 로그인 실패 (HTTP ' + r.status + ')');
    const a = this.authFrom(j, b.url, email);
    // 작업공간 구성원인지 확인 (등록 안 된 계정은 데이터가 비어 보이므로 미리 막음)
    const rm = await fetch(b.url + '/rest/v1/rpc/smartcare_is_member', { method: 'POST', headers: { apikey: b.key, Authorization: 'Bearer ' + a.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ws: b.ws }) }).catch(() => null);
    if (!rm || !rm.ok) throw new Error(rm && rm.status === 404 ? '서버 보안 설정(SQL)이 아직 적용되지 않았습니다 — 관리자에게 문의하세요' : '작업공간 확인 실패' + (rm ? ' (HTTP ' + rm.status + ')' : ''));
    if ((await rm.json().catch(() => false)) !== true) throw new Error('이 서버 계정은 작업공간 "' + b.ws + '"에 등록되지 않았습니다 — 관리자에게 문의하세요');
    this.authStore(a);
  }
  // 토큰 만료 5분 전이면 새로 받음 (동시에 여러 번 불러도 한 번만 요청)
  authEnsure(force) {
    const a = this._auth, b = this.cloudBase();
    if (!a || !b) return Promise.resolve(false);
    if (!force && a.expires_at - Date.now() > 5 * 60 * 1000) return Promise.resolve(true);
    if (this._authP) return this._authP;
    this._authP = (async () => {
      try {
        const r = await fetch(b.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: b.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: a.refresh_token }) });
        if (r.ok) { const j = await r.json(); if (this._auth === a) this.authStore(this.authFrom(j, b.url, a.email)); return true; }
        if (r.status === 400 || r.status === 401 || r.status === 403) { if (this._auth === a) this.authExpired(); return false; }
        return a.expires_at > Date.now();
      } catch (e) {
        return a.expires_at > Date.now(); // 네트워크 오류: 기존 토큰이 살아 있으면 계속 사용
      } finally { this._authP = null; }
    })();
    return this._authP;
  }
  authStopSync() {
    clearInterval(this._cloudPoll); clearTimeout(this._cloudT);
    this._cloudReady = false; window.__scCloudReady = false;
  }
  authExpired() {
    const email = (this._auth && this._auth.email) || '';
    this.authStore(null);
    this.authStopSync();
    this.setState({ cloudStatus: 'off', srvEmail: email, srvPw: '', srvErr: '서버 로그인이 만료되었습니다 — 다시 로그인하세요' });
  }
  async authSignOut() {
    const a = this._auth, b = this.cloudBase();
    if (this._cloudReady && this._cloudPending && Object.keys(this._cloudPending).length) { try { await this.cloudFlush(); } catch (e) {} }
    if (a && b) { try { await fetch(b.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: b.key, Authorization: 'Bearer ' + a.access_token } }); } catch (e) {} }
    this.authStore(null);
    this.authStopSync();
    try { localStorage.removeItem(Component.VIEW_KEY); sessionStorage.removeItem(Component.VIEW_KEY); } catch (e) {}
    this.setState({ logged: false, cloudStatus: 'off', srvEmail: (a && a.email) || '', srvPw: '', srvErr: '' });
    this.flash('서버 로그아웃 — 이 기기에서 서버 데이터 사용을 멈췄습니다');
  }
  async _srvLogin() {
    const email = (this.state.srvEmail || '').trim(), pw = this.state.srvPw || '';
    if (!email || !pw) { this.setState({ srvErr: '서버 계정 이메일과 비밀번호를 입력하세요' }); return; }
    if (this.state.srvBusy) return;
    this.setState({ srvBusy: true, srvErr: '' });
    try { await this.authSignIn(email, pw); }
    catch (e) { this.setState({ srvBusy: false, srvErr: e.message || '서버 로그인 실패' }); return; }
    this.setState({ srvBusy: false, srvPw: '', srvErr: '' });
    this.flash('서버 로그인 — 데이터를 불러옵니다');
    this.cloudInit();
  }

  cloudHeaders(c, extra) {
    const a = this._auth;
    if (a && a.expires_at - Date.now() < 5 * 60 * 1000) this.authEnsure();
    const tok = a && a.url === c.url && a.access_token ? a.access_token : c.key;
    return Object.assign({ apikey: c.key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, extra || {});
  }
  cloudInit() {
    const proto = Storage.prototype;
    if (!proto.__scPatched) {
      const orig = proto.setItem;
      proto.__scOrig = orig;
      proto.setItem = function (k0, v) {
        let err = null;
        const k = this === window.localStorage ? Component.nsKey(k0) : k0;
        try { orig.call(this, k, v); } catch (e) { err = e; }
        // 브라우저 저장 공간이 가득 차도 서버에는 올림 (사진·첨부가 큰 경우)
        if (this === window.localStorage && typeof k === 'string' && k.indexOf('smartcare.') === 0 && k !== 'smartcare.cloud.v1' && window.__scCloudPush) window.__scCloudPush(k, v);
        // 서버가 연결·동기화 준비된 경우에만 로컬 저장 실패를 삼킴 (그 외에는 기존처럼 오류 → 각 화면의 경고 표시)
        if (err && !(this === window.localStorage && window.__scCloudPush && window.__scCloudReady)) throw err;
      };
      proto.__scPatched = true;
    }
    window.__scCloudPush = (k, v) => this.cloudQueue(k, v);
    clearInterval(this._cloudPoll);
    this._cloudReady = false; this._cloudSince = null;
    window.__scCloudReady = false;
    const c = this.cloudCfg();
    if (!c) { this.setState({ cloudStatus: 'off' }); return; }
    this.setState({ cloudStatus: 'syncing', cloudErr: '' });
    this.cloudPull(true);
    // 첫 동기화가 실패했으면 성공할 때까지 첫 동기화를 다시 시도 (실패한 채로 남으면 이 기기의 변경이 서버에 안 올라감)
    this._cloudPoll = setInterval(() => {
      if (document.hidden) return;
      if (this._cloudNextTry && Date.now() < this._cloudNextTry) return;
      this.cloudPull(!this._cloudReady);
    }, 15000); // 15초마다 (5초 → 15초: 서버 디스크 사용량(Disk IO) 절약 · 저장은 즉시 올라감)
    // 탭으로 돌아오거나 창을 다시 누르면 즉시 최신 데이터 가져오기
    if (!this._cloudWake) {
      this._cloudWake = () => { if (!document.hidden && this._cloudReady) this.cloudPull(false); };
      document.addEventListener('visibilitychange', this._cloudWake);
      window.addEventListener('focus', this._cloudWake);
    }
  }
  orgFilterQ(c) {
    const org = window.__scOrg || 'ORG1';
    if (org === 'ORG1') return '&k=not.like.' + encodeURIComponent(c.ws + ':smartcare.o.*');
    const globals = Component.GLOBAL_KEYS.map(g => '"' + c.ws + ':smartcare.' + g + '"').join(',');
    return '&or=' + encodeURIComponent('(k.like.' + c.ws + ':smartcare.o.' + org + '.*,k.like.' + c.ws + ':smartcare.chart.*,k.in.(' + globals + '))');
  }
  // ───── 버전 보호: 예전 파일로 열린 기기가 서버 데이터를 덮어쓰지 않게 ─────
  // 배포할 때마다 BUILD 숫자를 올림. 서버에 더 높은 번호가 있으면 이 기기는 저장을 멈추고 새로고침을 요구함
  static BUILD = 2026111801;
  // 동시 수정 시 합쳐서 저장하는 항목: 일지(일자·프로그램별), 환자 명부
  static isMergeKey(uk) {
    return !!uk && (uk.indexOf(Component.WSESS_PREFIX) === 0 || uk === 'smartcare.patients.v1');
  }
  // 3-way 합치기: base(마지막으로 받은 서버) · srv(지금 서버) · mine(내 변경)
  // 목록은 항목 id 단위로: 내가 고친 항목은 내 것, 안 고친 항목은 서버 것, 추가·삭제는 양쪽 모두 반영
  static merge3(uk, baseRaw, srvRaw, mineRaw) {
    let base, srv, mine;
    try { srv = JSON.parse(srvRaw); mine = JSON.parse(mineRaw); base = baseRaw ? JSON.parse(baseRaw) : null; } catch (e) { return mineRaw; }
    const S = (x) => JSON.stringify(x === undefined ? null : x);
    const mergeList = (b, s, m, idOf) => {
      const bm = {}, sm = {}, mm = {}, order = [];
      (b || []).forEach(x => { const id = idOf(x); if (id != null) bm[id] = x; });
      (s || []).forEach(x => { const id = idOf(x); if (id != null) { sm[id] = x; order.push(id); } });
      (m || []).forEach(x => { const id = idOf(x); if (id != null) { mm[id] = x; if (!(id in sm)) order.push(id); } });
      const out = [];
      order.forEach(id => {
        const inB = id in bm, inS = id in sm, inM = id in mm;
        if (inS && inM) out.push(S(mm[id]) !== S(bm[id]) ? mm[id] : sm[id]);
        else if (inM && !inS) { if (!inB || S(mm[id]) !== S(bm[id])) out.push(mm[id]); }       // 내가 추가 (서버가 지운 건 내가 안 고쳤으면 삭제 유지)
        else if (inS && !inM) { if (!inB || S(sm[id]) !== S(bm[id])) out.push(sm[id]); }       // 다른 사람이 추가 (내가 지운 건 상대가 안 고쳤으면 삭제 유지)
      });
      return out;
    };
    if (uk === 'smartcare.patients.v1') {
      if (!Array.isArray(srv) || !Array.isArray(mine)) return mineRaw;
      return JSON.stringify(mergeList(Array.isArray(base) ? base : [], srv, mine, x => x && x.id));
    }
    if (!srv || !mine || typeof srv !== 'object' || typeof mine !== 'object') return mineRaw;
    if (mine.deleted || srv.deleted) return mine.deleted ? mineRaw : srvRaw;
    const b = base && typeof base === 'object' ? base : {};
    const out = {};
    Object.keys(Object.assign({}, srv, mine)).forEach(f => {
      if (f === 'review' || f === 'photos') return;
      out[f] = S(mine[f]) !== S(b[f]) ? mine[f] : srv[f];
    });
    out.review = mergeList(b.review, srv.review, mine.review, x => x && (x.key || x.id));
    out.photos = mergeList(b.photos, srv.photos, mine.photos, x => x && (x.id || x.url));
    // 같은 환자가 두 번 들어가지 않게 (두 사람이 같은 환자를 각각 추가한 경우)
    const seen = {};
    out.review = out.review.filter(r => { if (!r || !r.id) return true; if (seen[r.id]) return false; seen[r.id] = 1; return true; });
    return JSON.stringify(out);
  }
  async checkVersion() {
    const c = this.cloudCfg();
    if (!c) return;
    try {
      const k = c.ws + ':smartcare.appver.v1';
      const r = await fetch(c.url + '/rest/v1/smartcare_kv?select=v&k=eq.' + encodeURIComponent(k), { headers: this.cloudHeaders(c) });
      const j = r.ok ? await r.json() : [];
      const srv = j[0] ? parseInt(j[0].v, 10) || 0 : 0;
      // 버전 번호는 실제 배포된 화면(GitHub 주소)만 서버에 기록 — 개발 중인 화면이 기록하면 배포된 화면이 '예전 버전'으로 막힘
      const deployed = /github\.io$/.test(location.hostname);
      if (srv > Component.BUILD) { if (deployed && !this.state.outdated) this.setState({ outdated: true, outdatedWhy: 'server' }); return; }
      if (srv < Component.BUILD && deployed) {
        await fetch(c.url + '/rest/v1/smartcare_kv?on_conflict=k', {
          method: 'POST', headers: this.cloudHeaders(c, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify([{ k: k, v: String(Component.BUILD), updated_at: new Date().toISOString() }])
        });
      }
    } catch (e) {}
    // GitHub 주소로 열린 경우: 배포 파일이 바뀌었는지도 확인
    try {
      if (/github\.io$/.test(location.hostname)) {
        const t = await (await fetch(location.pathname + '?_v=' + Date.now(), { cache: 'no-store' })).text();
        const sig = t.length;
        if (!this._deploySig) this._deploySig = sig;
        else if (sig !== this._deploySig && !this.state.outdated) this.setState({ outdated: true, outdatedWhy: 'deploy' });
      }
    } catch (e) {}
  }
  startVersionWatch() {
    if (this._verT) return;
    const run = () => this.checkVersion();
    setTimeout(run, 1500);
    this._verT = setInterval(run, 60000);
    this._onVerFocus = () => run();
    window.addEventListener('focus', this._onVerFocus);
  }

  cloudQueue(k0, v) {
    const k = Component.nsKey(k0);
    if (this._cloudApplying || !this.cloudCfg()) return;
    // 첫 동기화 전 변경은 버리지 않고 보관했다가 동기화 직후 올림 (등록한 환자가 사라지지 않게)
    if (!this._cloudReady) { this._cloudEarly = this._cloudEarly || {}; this._cloudEarly[k] = v; return; }
    this._cloudPending = this._cloudPending || {};
    this._cloudPending[k] = v;
    clearTimeout(this._cloudT);
    this._cloudT = setTimeout(() => this.cloudFlush(), 600);
  }
  async cloudFlush() {
    // 예전 버전으로 열린 기기는 서버에 쓰지 않음 (보관만 하고 새로고침 후 최신 버전이 처리)
    if (this.state.outdated) return;
    if (this.cloudCfg() && !(await this.authEnsure())) return;
    const c = this.cloudCfg(); const p = this._cloudPending || {};
    const keys = Object.keys(p);
    if (!c || !keys.length) return;
    this._cloudPending = {};
    const now = new Date().toISOString();
    // 작은 항목 먼저, 큰 항목(사진)은 한 건씩 — 한 번에 너무 큰 요청을 보내 실패하지 않게
    const order = keys.slice().sort((a, b) => (p[a] || '').length - (p[b] || '').length);
    const batches = []; let cur = [], curSz = 0;
    order.forEach(k => {
      const n = (p[k] || '').length;
      if (cur.length && curSz + n > 600000) { batches.push(cur); cur = []; curSz = 0; }
      cur.push(k); curSz += n;
    });
    if (cur.length) batches.push(cur);
    this.setState({ cloudStatus: 'syncing' });
    const done = {};
    this._cloudInflight = this._cloudInflight || {};
    this._kvSeen = this._kvSeen || {};
    // ── 동시 수정 보호: 내가 마지막으로 본 뒤 다른 사람이 같은 항목을 저장했으면, 덮어쓰지 않고 합쳐서 저장 ──
    const merged = {};
    for (const k of keys) {
      const uk = Component.unKey(k);
      if (!Component.isMergeKey(uk)) continue;
      try {
        const r0 = await fetch(c.url + '/rest/v1/smartcare_kv?select=v,updated_at&k=eq.' + encodeURIComponent(c.ws + ':' + k), { headers: this.cloudHeaders(c) });
        const j = r0.ok ? (await r0.json())[0] : null;
        if (!j || !j.v || j.v === p[k]) continue;
        if (this._kvSeen[k] && j.updated_at <= this._kvSeen[k]) continue; // 그 뒤로 바뀐 게 없음
        const out = Component.merge3(uk, (this._kvBase || {})[k], j.v, p[k]);
        if (out && out !== p[k]) { p[k] = out; merged[k] = out; }
      } catch (e) {}
    }
    keys.forEach(k => { this._cloudInflight[k] = true; });
    try {
      for (const b of batches) {
        const rows = b.map(k => ({ k: c.ws + ':' + k, v: p[k], updated_at: now }));
        const r = await fetch(c.url + '/rest/v1/smartcare_kv?on_conflict=k', {
          method: 'POST', headers: this.cloudHeaders(c, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
        b.forEach(k => { done[k] = true; this._kvSeen[k] = now; delete this._cloudInflight[k]; if (Component.isMergeKey(Component.unKey(k))) { this._kvBase = this._kvBase || {}; this._kvBase[k] = p[k]; } });
      }
      // 합친 결과를 이 화면에도 반영 (다른 사람이 넣은 참여자·환자가 보이게)
      const mk = Object.keys(merged);
      if (mk.length) {
        mk.forEach(k => {
          this._cloudApplying = true;
          try { (Storage.prototype.__scOrig || Storage.prototype.setItem).call(localStorage, k, merged[k]); } catch (e) {}
          this._cloudApplying = false;
          if (this._onStorage) this._onStorage({ key: k, newValue: merged[k] });
        });
        this.flash('다른 사용자가 같은 항목을 동시에 수정해 두 내용을 합쳐 저장했습니다');
      }
      this.setState({ cloudStatus: 'ok', cloudAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), cloudErr: '' });
    } catch (e) {
      keys.forEach(k => { delete this._cloudInflight[k]; if (!done[k] && !(k in this._cloudPending)) this._cloudPending[k] = p[k]; });
      this.setState({ cloudStatus: 'error', cloudErr: e.message || '네트워크 오류' });
      clearTimeout(this._cloudT);
      this._cloudT = setTimeout(() => this.cloudFlush(), 5000);
    }
  }
  async cloudPull(initial) {
    const c = this.cloudCfg(); if (!c) return;
    if (!(await this.authEnsure())) return;
    try {
      if (this._pullBusy) return;
      this._pullBusy = true;
      let q = c.url + '/rest/v1/smartcare_kv?select=k,v,updated_at&k=like.' + encodeURIComponent(c.ws + ':*') + '&order=updated_at.asc';
      // 이 기관 데이터 + 공용 항목만 받음 (다른 기관 데이터는 받지 않음)
      q += this.orgFilterQ(c);
      // 첫 동기화는 현장사진(용량 큼)을 빼고 가볍게 — 사진은 준비 후 따로 받음
      if (initial) q += '&k=not.like.' + encodeURIComponent(c.ws + ':' + Component.WPH_PREFIX + '*') + '&k=not.like.' + encodeURIComponent(c.ws + ':' + Component.nsKey(Component.WPH_PREFIX) + '*');
      // 기기마다 시계가 조금씩 달라 늦게 찍힌 변경이 빠지지 않도록 10분 겹쳐서 조회 (같은 값은 아래에서 건너뜀)
      if (!initial && this._cloudSince) {
        const since = new Date(new Date(this._cloudSince).getTime() - 10 * 60 * 1000).toISOString();
        q += '&updated_at=gt.' + encodeURIComponent(since);
      }
      let rows;
      // 첫 동기화도 '이름·시각 목록 → 내용 나눠 받기' 방식 (한 번에 전체를 받으면 서버 시간 초과(HTTP 500 57014)로 계속 실패함)
      if (true) {
        // 전송량 절약: 먼저 '어떤 항목이 바뀌었는지'(이름·시각)만 받고, 이 기기에 없는 새 값만 내용을 받음
        // (예전에는 3초마다 최근 10분 내 바뀐 사진·데이터 전체를 반복해서 받아 무료 전송 한도를 초과함)
        const rm = await fetch(q.replace('select=k,v,updated_at', 'select=k,updated_at'), { headers: this.cloudHeaders(c) });
        if (!rm.ok) throw new Error('HTTP ' + rm.status + ' ' + (await rm.text()).slice(0, 120));
        const meta = await rm.json();
        // 이전에 받은 항목 기록을 기기에 보관 → 새로고침해도 바뀐 것만 받음 (예전에는 열 때마다 전체를 다시 받아 느렸음)
        if (!this._kvSeen) { try { this._kvSeen = JSON.parse((Storage.prototype.__scGet || Storage.prototype.getItem).call(localStorage, 'sc.kvSeen.v1') || '{}') || {}; } catch (e) { this._kvSeen = {}; } }
        const seen = this._kvSeen;
        const getL = Storage.prototype.__scGet || Storage.prototype.getItem;
        const need = meta.filter(m => {
          const key = m.k.slice(c.ws.length + 1);
          if (!(seen[key] && m.updated_at && m.updated_at <= seen[key])) return true;
          // 받은 기록은 있어도 실제 값이 이 기기에 없으면 다시 받음
          const uk = Component.unKey(key);
          if (uk && uk.indexOf(Component.WPH_PREFIX) === 0) return !this._wphCache[uk.slice(Component.WPH_PREFIX.length)];
          // 증명사진·서명도 메모리에만 두므로, 메모리에 없으면 다시 받음
          if (uk && uk.indexOf(Component.IDPH_PREFIX) === 0) return !this._idphCache[uk.slice(Component.IDPH_PREFIX.length)];
          if (uk && uk.indexOf(Component.SIGN_PREFIX) === 0) return !this._signCache[uk.slice(Component.SIGN_PREFIX.length)];
          return getL.call(localStorage, key) == null;
        }).map(m => m.k);
        rows = [];
        if (initial) this.setState({ cloudErr: '서버 데이터 받는 중… (' + need.length + '개 항목)' });
        // 작은 데이터 먼저, 사진은 뒤로 · 4개 요청을 동시에 (한 줄로 기다리지 않게)
        const isPh = (k) => k.indexOf(Component.WPH_PREFIX) >= 0;
        const ordered = need.filter(k => !isPh(k)).concat(need.filter(isPh));
        const parts = [];
        for (let i = 0; i < ordered.length; i += 8) parts.push(ordered.slice(i, i + 8));
        let pi = 0, failed = null;
        const worker = async () => {
          while (pi < parts.length && !failed) {
            const my = parts[pi++];
            const part = my.map(k => encodeURIComponent('"' + k.replace(/"/g, '\\"') + '"')).join(',');
            const ri = await fetch(c.url + '/rest/v1/smartcare_kv?select=k,v,updated_at&k=in.(' + part + ')', { headers: this.cloudHeaders(c) });
            if (!ri.ok) { failed = new Error('HTTP ' + ri.status + ' ' + (await ri.text()).slice(0, 120)); return; }
            rows = rows.concat(await ri.json());
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (failed) throw failed;
      } else {
        const r = await fetch(q, { headers: this.cloudHeaders(c) });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
        rows = await r.json();
      }
      this._cloudBackoff = 0;
      const orig = Storage.prototype.__scOrig || Storage.prototype.setItem;
      let changed = 0;
      this._cloudQuiet = initial;
      this._kvSeen = this._kvSeen || {};
      rows.forEach(row => {
        const key = row.k.slice(c.ws.length + 1);
        if (row.updated_at && (!this._cloudSince || row.updated_at > this._cloudSince)) this._cloudSince = row.updated_at;
        // 이 기기에서 아직 올리는 중이거나, 이미 받은(또는 올린) 것보다 오래된 서버 값은 적용하지 않음
        // — 10분 겹침 조회 때 예전 값이 방금 고친 내용을 덮어써 '미작성'으로 되돌아가던 문제 방지
        if ((this._cloudPending && key in this._cloudPending) || (this._cloudInflight && this._cloudInflight[key])) return;
        // 첫 동기화 전에 이 기기에서 바꾼 값(환자 등록·삭제 등)은 서버 값으로 덮지 않음 — 곧 서버로 올림
        const uk = Component.unKey(key);
        if (!uk) return; // 다른 기관 데이터
        if (initial && this._cloudEarly && key in this._cloudEarly && uk !== 'smartcare.work.v1' && uk.indexOf(Component.WSESS_PREFIX) !== 0) return;
        const memOnly = (uk.indexOf(Component.IDPH_PREFIX) === 0 && !this._idphCache[uk.slice(Component.IDPH_PREFIX.length)]) || (uk.indexOf(Component.SIGN_PREFIX) === 0 && !this._signCache[uk.slice(Component.SIGN_PREFIX.length)]);
        if (!memOnly && this._kvSeen[key] && row.updated_at && row.updated_at <= this._kvSeen[key]) return;
        if (row.updated_at) this._kvSeen[key] = row.updated_at;
        // 동시 수정 합치기의 기준점 (마지막으로 받은 서버 내용)
        if (Component.isMergeKey(uk)) { this._kvBase = this._kvBase || {}; this._kvBase[key] = row.v; }
        // 증명사진·서명(환자별 키)도 메모리로만 받음
        if (uk.indexOf(Component.IDPH_PREFIX) === 0) {
          const id = uk.slice(Component.IDPH_PREFIX.length);
          if (this._idphCache[id] === row.v) return;
          changed++;
          if (row.v) { this._idphCache[id] = row.v; this._idphSent[id] = row.v.length; } else delete this._idphCache[id];
          this._idphDirty = true;
          return;
        }
        if (uk.indexOf(Component.SIGN_PREFIX) === 0) {
          const pid = uk.slice(Component.SIGN_PREFIX.length);
          try { this._signCache[pid] = row.v ? JSON.parse(row.v) : {}; } catch (e) { this._signCache[pid] = {}; }
          changed++;
          this._signDirty = true;
          return;
        }
        // 현장사진(wph)은 브라우저에 저장하지 않고 메모리로만 받음 — 저장 공간을 환자·일지 같은 작은 데이터에 남겨 둠
        if (uk.indexOf(Component.WPH_PREFIX) === 0) {
          const id = uk.slice(Component.WPH_PREFIX.length);
          if (this._wphCache[id] === row.v) return;
          changed++;
          if (this._onStorage) this._onStorage({ key: key, newValue: row.v });
          return;
        }
        if ((Storage.prototype.__scGet || Storage.prototype.getItem).call(localStorage, key) === row.v) return;
        this._cloudApplying = true;
        try { orig.call(localStorage, key, row.v); } catch (e) {}
        this._cloudApplying = false;
        changed++;
        if (this._onStorage) this._onStorage({ key: key, newValue: row.v });
      });
      this._cloudQuiet = false;
      // 받은 항목 기록 저장 (사진 제외 — 사진은 메모리에만 있으므로 새로고침 후 다시 받아야 함)
      try {
        const keep = {};
        Object.keys(this._kvSeen || {}).forEach(k => { const uk = Component.unKey(k); if (uk && uk.indexOf(Component.WPH_PREFIX) !== 0) keep[k] = this._kvSeen[k]; });
        (Storage.prototype.__scOrig || Storage.prototype.setItem).call(localStorage, 'sc.kvSeen.v1', JSON.stringify(keep));
      } catch (e) {}
      if (initial) setTimeout(() => this.checkWphMissing(), 6000);
      // 서버에서 받은 증명사진·서명 반영
      if (this._idphDirty) {
        this._idphDirty = false;
        let idx = null; try { idx = JSON.parse(localStorage.getItem('smartcare.idphotos.v1') || 'null'); } catch (e) {}
        const m = idx && idx.__idx ? this.idphFromStored(idx) : Object.assign({}, this.state.photoUrls || {}, this._idphCache);
        if (m) this.setState({ photoUrls: m });
      }
      if (this._signDirty) { this._signDirty = false; this.setState({ signImgsFor: null, mcTick: (this.state.mcTick || 0) + 1 }); }
      if (initial) setTimeout(() => this.migrateBlobs(), 2500);
      if (initial) {
        this._cloudReady = true;
        window.__scCloudReady = true;
        if (!rows.length) {
          // 서버가 비어 있으면 이 PC의 데이터를 처음으로 올림
          this._cloudPending = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('smartcare.') === 0 && k !== 'smartcare.cloud.v1' && Component.unKey(k)) this._cloudPending[k] = (Storage.prototype.__scGet || Storage.prototype.getItem).call(localStorage, k);
          }
          await this.cloudFlush();
          this.flash('서버에 처음 연결 — 이 PC의 데이터를 서버에 올렸습니다');
        } else this.flash('서버 데이터를 불러왔습니다 (' + rows.length + '개 항목)');
        // 동기화 전에 저장된 변경(환자 등록 등)을 이제 서버에 올림
        const early = this._cloudEarly || {};
        this._cloudEarly = {};
        // 일지·업무 묶음은 제외 — 동기화 전 값은 오래된 값일 수 있음 (사용자가 바꾸면 그때 다시 올라감)
        Object.keys(early).forEach(k => { const uk = Component.unKey(k) || ''; if (uk === 'smartcare.work.v1' || uk.indexOf(Component.WSESS_PREFIX) === 0) return; this.cloudQueue(k, early[k]); });
        this.compactIdPhotos();
        // 현장사진은 따로, 실패해도 다른 데이터 동기화에는 영향 없음
        setTimeout(() => this.cloudPullPhotos(), 300);
      } else if (changed) this.flash('다른 PC·기기의 변경 내용 ' + changed + '건을 반영했습니다');
      this._pullBusy = false;
      this.setState({ cloudStatus: this._cloudReady ? 'ok' : 'syncing', cloudErr: '', cloudAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    } catch (e) {
      this._pullBusy = false;
      this._cloudQuiet = false;
      // 실패가 이어지면 재시도 간격을 늘림 (3초 → 최대 5분). 한도 초과(402)는 바로 5분 간격
      const quota = /HTTP 402|exceed_/.test(e.message || '');
      this._cloudBackoff = quota ? 300000 : Math.min(300000, Math.max(6000, (this._cloudBackoff || 3000) * 2));
      this._cloudNextTry = Date.now() + this._cloudBackoff;
      this.setState({ cloudStatus: 'error', cloudErr: quota
        ? '데이터 서버 무료 사용량(전송 한도)이 초과되어 서버가 일시 차단되었습니다 — 관리자에게 문의하세요. 입력한 내용은 이 기기에 보관되며, 서버가 풀리면 자동으로 올라갑니다.'
        : (this._cloudReady ? '' : '첫 동기화 재시도 중 — ') + (e.message || '네트워크 오류') });
    }
  }
  // 현장사진만 받기 (사진마다 한 건씩 — 큰 요청 한 번에 실패하지 않게)
  async cloudPullPhotos() {
    const c = this.cloudCfg(); if (!c || this._photoPulling) return;
    this._photoPulling = true;
    try {
      const wphNs = Component.nsKey(Component.WPH_PREFIX);
      const pre = c.ws + ':' + wphNs;
      const r = await fetch(c.url + '/rest/v1/smartcare_kv?select=k,updated_at&k=like.' + encodeURIComponent(pre + '*'), { headers: this.cloudHeaders(c) });
      if (!r.ok) return;
      const list = await r.json();
      this._kvSeen = this._kvSeen || {};
      for (const row of list) {
        const key = row.k.slice(c.ws.length + 1), id = key.slice(wphNs.length);
        if (this._wphCache[id]) { this._kvSeen[key] = row.updated_at; continue; }
        try {
          const one = await fetch(c.url + '/rest/v1/smartcare_kv?select=v,updated_at&k=eq.' + encodeURIComponent(row.k), { headers: this.cloudHeaders(c) });
          const j = (await one.json())[0];
          if (j && j.v) { this._kvSeen[key] = j.updated_at; if (this._onStorage) this._onStorage({ key: key, newValue: j.v }); }
        } catch (e) {}
      }
      // 서버에 있는 현장사진은 브라우저 저장 공간에서 정리
      list.forEach(row => { const key = row.k.slice(c.ws.length + 1); try { if (localStorage.getItem(key) != null) localStorage.removeItem(key); } catch (e) {} });
    } catch (e) {} finally { this._photoPulling = false; }
  }

  // data: URL → blob: URL (브라우저가 data: PDF 미리보기를 막는 문제 회피)
  blobUrl(url) {
    if (!url || url.indexOf('data:') !== 0) return url;
    this._blobCache = this._blobCache || {};
    if (this._blobCache[url]) return this._blobCache[url];
    try {
      const comma = url.indexOf(',');
      const mime = (url.slice(5, comma).split(';')[0]) || 'application/octet-stream';
      const bin = atob(url.slice(comma + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const b = URL.createObjectURL(new Blob([arr], { type: mime }));
      this._blobCache[url] = b;
      return b;
    } catch (e) { return url; }
  }
  // PDF는 브라우저 내장 뷰어 대신 pdf.js로 직접 그려서 표시 (크롬 차단 회피)
  loadPdfJs() {
    if (this._pdfjsP) return this._pdfjsP;
    const V = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
    this._pdfjsP = this.loadLib(V + 'pdf.min.js', 'pdfjsLib').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = V + 'pdf.worker.min.js';
      return lib;
    });
    this._pdfjsP.catch(() => { this._pdfjsP = null; });
    return this._pdfjsP;
  }
  dataToBytes(url) {
    const comma = url.indexOf(',');
    const bin = atob(url.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  async pdfPages(url, width) {
    const lib = await this.loadPdfJs();
    const src = url.indexOf('data:') === 0 ? { data: this.dataToBytes(url) } : { url: url };
    const doc = await lib.getDocument(src).promise;
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const v1 = page.getViewport({ scale: 1 });
      const scale = (width / v1.width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.push(c);
    }
    return out;
  }
  async mountPdf(el, url) {
    if (!el || el.dataset.src === String(url.length) + url.slice(-32)) return;
    el.dataset.src = String(url.length) + url.slice(-32);
    try {
      const w = Math.min(820, el.clientWidth - 24);
      const pages = await this.pdfPages(url, w);
      if (!el.isConnected) return;
      el.textContent = '';
      pages.forEach((c, i) => {
        c.style.cssText = 'width:' + w + 'px;height:auto;display:block;background:#fff;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.35);flex:none';
        c.setAttribute('aria-label', (i + 1) + ' / ' + pages.length + ' 페이지');
        el.appendChild(c);
      });
      const tag = document.createElement('div');
      tag.textContent = '총 ' + pages.length + '페이지';
      tag.style.cssText = 'font-size:12.5px;color:var(--color-neutral-500);flex:none';
      el.appendChild(tag);
    } catch (e) {
      el.textContent = 'PDF를 표시하지 못했습니다 — [다운로드]로 내려받아 확인하세요 (' + (e && e.message ? e.message : '오류') + ')';
    }
  }

  fileDownload(url, name) {
    const a = document.createElement('a');
    a.href = this.blobUrl(url); a.download = name || '서면동의서';
    document.body.appendChild(a); a.click(); a.remove();
    this.flash('다운로드 — ' + (name || '서면동의서'));
  }
  async filePrint(url, name, isPdf) {
    let imgs;
    if (isPdf) {
      this.flash('PDF 인쇄 준비 중…');
      try { imgs = (await this.pdfPages(url, 1100)).map(c => c.toDataURL('image/jpeg', 0.92)); }
      catch (e) { this.flash('PDF를 인쇄용으로 변환하지 못했습니다 — 다운로드 후 인쇄하세요'); return; }
    } else imgs = [url];
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + String(name || '').replace(/</g, '&lt;') + '</title><style>@page{margin:8mm}html,body{margin:0}img{max-width:100%;max-height:calc(100vh - 2mm);display:block;margin:0 auto;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>'
      + imgs.map(u => '<img src="' + u + '">').join('') + '</body></html>');
    doc.close();
    await Promise.all([...doc.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { this.flash('인쇄 창을 열 수 없습니다'); } setTimeout(() => fr.remove(), 60000); }, 150);
    this.flash('인쇄 창을 엽니다 — ' + (name || '') + (isPdf ? ' (' + imgs.length + '페이지)' : ''));
  }

  loadMobileConsent(pid) {
    try { const all = JSON.parse(localStorage.getItem('smartcare.mconsent.v1') || '{}'); return all[pid] || null; } catch (e) { return null; }
  }
  persistMobileConsent(pid, rec) {
    try {
      const all = JSON.parse(localStorage.getItem('smartcare.mconsent.v1') || '{}');
      all[pid] = rec;
      localStorage.setItem('smartcare.mconsent.v1', JSON.stringify(all));
    } catch (e) { this.flash('저장 공간이 부족해 전자 동의 기록을 보관하지 못했습니다'); }
  }

  loadSigns(pid) {
    if (this._signCache[pid]) return this._signCache[pid];
    try { const one = localStorage.getItem(Component.SIGN_PREFIX + pid); if (one) return (this._signCache[pid] = JSON.parse(one)); } catch (e) {}
    try { const all = JSON.parse(localStorage.getItem('smartcare.signs.v1') || '{}'); return (all && !all.__moved && all[pid]) || {}; } catch (e) { return {}; }
  }
  // 서명은 환자별 키로 서버에만 저장 (서버 미연결이면 브라우저에)
  persistSigns(pid, imgs) {
    this._signCache[pid] = imgs || {};
    this.blobPut(Component.SIGN_PREFIX + pid, JSON.stringify(imgs || {}));
    // 아직 전환 전이면 예전 묶음에도 기록 (예전 버전 기기가 읽을 수 있게)
    if (!this._blobV2) {
      try { const all = JSON.parse(localStorage.getItem('smartcare.signs.v1') || '{}'); if (!all.__moved) { all[pid] = imgs; localStorage.setItem('smartcare.signs.v1', JSON.stringify(all)); } } catch (e) {}
    }
  }

  // 지표 카드 시각화 공용 (링 · 추세 · 한 줄 패널)
  buildKpiCards(list) {
    const C = 276.46;
    const series = (arr) => {
      const vals = arr.map(v => v == null ? 0 : v);
      const mx = Math.max(1, ...vals), W = 330, H = 64, top = 8;
      const pt = vals.map((v, i) => [Math.round(i * W / Math.max(1, vals.length - 1)), Math.round(H - 4 - (v / mx) * (H - top - 4))]);
      const line = 'M' + pt.map(p => p[0] + ' ' + p[1]).join(' L');
      return { line: line, area: line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', bars: vals.slice(-11).map((v, i, a) => ({ h: Math.max(8, Math.round(v / mx * 100)) + '%', last: i === a.length - 1, notLast: i !== a.length - 1 })) };
    };
    const delta = (arr, unit, digits) => {
      const a = arr.filter(v => v != null); if (a.length < 2) return { txt: '주간 비교 데이터 부족', color: 'var(--color-neutral-500)' };
      const r = Math.round((a[a.length - 1] - a[a.length - 2]) * Math.pow(10, digits)) / Math.pow(10, digits);
      if (r === 0) return { txt: '– 변동 없음', color: 'var(--color-neutral-500)' };
      return { txt: (r > 0 ? '▲ ' : '▼ ') + Math.abs(r) + unit, color: r > 0 ? 'oklch(0.76 0.14 145)' : 'oklch(0.70 0.17 25)' };
    };
    return list.map(c => {
      const p = Math.max(0, Math.min(100, c.pct || 0));
      const sr = series(c.arr || []), dl = delta(c.arr || [], c.dUnit || '', c.dDig || 0);
      return {
        key: c.key, label: c.label, icon: c.icon, color: c.color, val: c.val, unit: c.unit, sub: c.sub,
        dash: (C * p / 100).toFixed(1) + ' ' + C, cap: p > 0 ? 'round' : 'butt',
        barW: p + '%', hasTarget: c.target != null, targetLeft: (c.target || 0) + '%',
        line: sr.line, area: sr.area, bars: sr.bars,
        deltaTxt: dl.txt, deltaColor: dl.color,
        glow: 'drop-shadow(0 0 6px color-mix(in oklch, ' + c.color + ' 50%, transparent))',
        grad: 'linear-gradient(90deg, color-mix(in oklch, ' + c.color + ' 70%, black), ' + c.color + ')',
        barGlow: '0 0 8px color-mix(in oklch, ' + c.color + ' 45%, transparent)',
        gid: 'kg-' + c.key, gfill: 'url(#kg-' + c.key + ')'
      };
    });
  }

  // ───── 서버에 파일이 없는 현장사진 찾기 (끝없이 '불러오는 중'만 보이지 않게) ─────
  phMissing(url) { return !!(url && url.indexOf('wph:') === 0 && this._wphMissing && this._wphMissing[url.slice(4)]); }
  missingEl() {
    return React.createElement('span', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'oklch(0.78 0.11 30)', fontSize: 12.5, textAlign: 'center', padding: 6, background: 'var(--color-neutral-900)' } },
      React.createElement('i', { className: 'ph ph-image-broken', style: { fontSize: 22 } }), '서버에 사진 파일 없음');
  }
  async checkWphMissing() {
    const c = this.cloudCfg && this.cloudCfg();
    if (!c || this._wphChecking) return;
    this._wphChecking = true;
    try {
      const s = this.state;
      const refs = {};
      const col = (arr) => (arr || []).forEach(p => { if (p && typeof p.url === 'string' && p.url.indexOf('wph:') === 0) refs[p.url.slice(4)] = true; });
      col(s.photos); Object.values(s.sessions || {}).forEach(v => col(v && v.photos));
      const ids = Object.keys(refs).filter(id => !this._wphCache[id]);
      if (!ids.length) { if (this._wphMissing && Object.keys(this._wphMissing).length) { this._wphMissing = {}; this.forceUpdate(); } return; }
      const r = await fetch(c.url + '/rest/v1/smartcare_kv?select=k&k=like.' + encodeURIComponent(c.ws + ':*' + Component.WPH_PREFIX + '*'), { headers: this.cloudHeaders(c) });
      if (!r.ok) return;
      const have = {};
      (await r.json()).forEach(row => { const i = row.k.indexOf(Component.WPH_PREFIX); if (i >= 0) have[row.k.slice(i + Component.WPH_PREFIX.length)] = true; });
      const miss = {};
      ids.forEach(id => { if (!have[id]) miss[id] = true; });
      this._wphMissing = miss;
      this.forceUpdate();
    } catch (e) {} finally { this._wphChecking = false; }
  }

  // ───── 직원 비밀번호: 원문 대신 해시(PBKDF2)로 저장 ─────
  static PW_PREFIX = 'p1$';
  static async pwHash(id, pw) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('smartcare.pw:' + id), iterations: 120000 }, base, 256);
    return Component.PW_PREFIX + Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  static async pwMatch(m, pw) {
    const st = String((m && m.pw) || '');
    if (!st || !pw) return false;
    if (st.indexOf(Component.PW_PREFIX) !== 0) return st === pw; // 예전 형식(원문) — 저장할 때 해시로 바뀜
    try { return (await Component.pwHash(m.id, pw)) === st; } catch (e) { return false; }
  }
  // 원문 비밀번호가 남은 계정만 해시로 바꿈 (바뀐 게 없으면 같은 배열 반환)
  static async hashRoster(list) {
    if (!Array.isArray(list) || !(window.crypto && crypto.subtle)) return list;
    let changed = false;
    const out = await Promise.all(list.map(async m => {
      if (!m || !m.pw || String(m.pw).indexOf(Component.PW_PREFIX) === 0) return m;
      changed = true;
      return Object.assign({}, m, { pw: await Component.pwHash(m.id, String(m.pw)) });
    }));
    return changed ? out : list;
  }
  saveRoster(list) {
    this.setState({ acctSaving: true });
    clearTimeout(this._rosterT);
    this._rosterT = setTimeout(async () => {
      this._rosterT = null;
      let ok = true;
      const src = list || this.state.roster;
      let out = src;
      try { out = await Component.hashRoster(src); } catch (e) { out = src; }
      if (out !== src && this.state.roster === src) this.setState({ roster: out });
      try {
        localStorage.setItem('smartcare.roster.v1', JSON.stringify(out));
        localStorage.setItem('smartcare.orgs.v1', JSON.stringify(this.state.orgs));
      } catch (e) { ok = false; }
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      this.setState({ acctSaving: false, acctSaveOk: ok, acctSavedAt: p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) });
    }, 350);
  }



  // 환자 지정 팝업에서 등록으로 넘어온 경우, 닫힐 때 지정 팝업을 다시 연다
  backToAssign() {
    const k = this._returnToAssign;
    if (!k) return {};
    this._returnToAssign = null;
    return { addOpen: true, assignKey: k === '__add__' ? null : k };
  }

  async _doLogin() {
    const s = this.state;
    const id = (s.lgId || '').trim(), pw = s.lgPw || '';
    if (!id || !pw) { this.setState({ lgErr: (s.lgMode === 'gmail' ? 'Gmail 주소' : s.lgMode === 'sys' ? '관리자 ID' : '사번') + '와 비밀번호를 입력하세요' }); return; }
    const rl = (m) => Array.isArray(m.roles) ? m.roles : [m.role];
    let m;
    if (s.lgMode === 'sys') m = s.roster.find(x => x.org === '*' && x.empNo === id);
    else if (s.lgMode === 'gmail') m = s.roster.find(x => x.org === s.lgOrg && x.email && x.email.toLowerCase() === id.toLowerCase());
    else m = s.roster.find(x => x.org === s.lgOrg && x.empNo === id);
    if (!m || !(await Component.pwMatch(m, pw))) { this.setState({ lgErr: '계정 정보가 일치하지 않습니다. 소속기관과 ' + (s.lgMode === 'gmail' ? 'Gmail' : '사번') + '을 확인하세요.' }); return; }
    if (m.status !== '활성') { this.setState({ lgErr: '사용이 ' + m.status + '된 계정입니다. 기관 관리자에게 문의하세요.' }); return; }
    const vst = this.validState(m);
    if (vst === 'pending') { this.setState({ lgErr: m.validFrom + '부터 사용할 수 있는 계정입니다 (활성 예약).' }); return; }
    if (vst === 'expired') { this.setState({ lgErr: '사용 기간이 ' + m.validTo + '에 만료된 계정입니다. 기관 관리자에게 문의하세요.' }); return; }
    const nowD = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const stampL = nowD.getFullYear() + '-' + p2(nowD.getMonth() + 1) + '-' + p2(nowD.getDate()) + ' ' + p2(nowD.getHours()) + ':' + p2(nowD.getMinutes());
    const rosterL = s.roster.map(x => x.id === m.id ? Object.assign({}, x, { lastLogin: stampL }) : x);
    this.setState({ roster: rosterL }); this.saveRoster(rosterL);
    if (m.mustChange) setTimeout(() => this.flash('임시 비밀번호로 로그인했습니다 — 비밀번호를 변경하세요'), 1800);
    const roles = rl(m);
    const sys = roles.indexOf('시스템관리자') >= 0;
    // 기관마다 별도 운영: 시스템 관리자(전체 권한)는 마지막으로 고른 기관, 그 외는 소속 기관 데이터만
    const org = sys ? Component.sysOrg(s.orgs) : m.org;
    const onlyAssist = !sys && roles.every(r => r === '보조');
    const onlyView = !sys && roles.every(r => r === '조회');
    void onlyAssist;
    const view = { logged: true, userId: m.id, role: roles[0], orgId: org, device: Component.detectDevice(), pcView: onlyView ? 'stats' : 'patients', setTab: s.setTab || 'ai', mobileView: 'today', lgPw: '', lgErr: '' };
    if (org !== (window.__scOrg || 'ORG1')) {
      // 다른 기관(또는 시스템 관리자)으로 로그인: 그 기관 데이터만 새로 불러오도록 화면을 다시 엶
      try { const o = {}; Component.VIEW_KEYS.forEach(k => { if (view[k] !== undefined) o[k] = view[k]; }); o.at = Date.now(); window.localStorage.setItem(Component.VIEW_KEY, JSON.stringify(o)); } catch (e) {}
      this.flash('로그인 — 기관 데이터를 불러오는 중…');
      setTimeout(() => window.location.reload(), 300);
      return;
    }
    this.setState(view);
    const on = (s.orgs.find(o => o.id === org) || {}).name || '';
    this.flash(m.name + '님 로그인 · ' + (sys ? '시스템 관리자 (전체 기관)' : on + ' · ' + roles.map(r => r === '관리자' ? '기관 관리자' : r).join('·')));
  }

  // 기관 전환: 기관별 데이터 분리 보관
  switchOrg(next, silent) {
    const s = this.state;
    const cur = s.orgId || 'ORG1';
    if (next === cur) return;
    const KEYS = ['wards', 'wardsSaved', 'programs', 'plans', 'sessions', 'review', 'confirmed', 'photos', 'activeSession', 'sessionMeta', 'photoUrls', 'sel', 'ward'];
    this._orgStore = this._orgStore || {};
    const snap = { patients: PATIENTS.slice() };
    KEYS.forEach(k => { snap[k] = s[k]; });
    this._orgStore[cur] = snap;
    const nx = this._orgStore[next] || {
      patients: [], wards: [], wardsSaved: [], programs: (s.programs || []).slice(), plans: [], sessions: {}, review: [], confirmed: false,
      photos: [], activeSession: null, sessionMeta: {}, photoUrls: {}, sel: null, ward: '전체'
    };
    PATIENTS.length = 0; nx.patients.forEach(p => PATIENTS.push(p));
    const patch = { orgId: next, page: 0, pcView: s.pcView === 'patient' ? 'patients' : s.pcView };
    KEYS.forEach(k => { patch[k] = nx[k]; });
    this.setState(patch);
    if (!silent) this.flash('기관 전환 — ' + ((s.orgs.find(o => o.id === next) || {}).name || next));
  }

  reviewNav() {
    return this.state.device === 'pc' ? { pcView: 'review', mobileView: 'review', nlOpen: false } : { mobileView: 'review' };
  }

  // 일정 배지: 진행 상태(예정·완료·취소) + 일지 상태(미작성·검수 필요·확정)
  planBadges(p, s) {
    s = s || this.state;
    const k = p.date + '|' + p.program;
    const ss = (s.activeSession === k) ? { review: s.review, confirmed: s.confirmed, photos: s.photos } : ((s.sessions || {})[k] || {});
    const rv = ss.review || [];
    const log = ss.confirmed && rv.length ? '확정' : (rv.length || (ss.photos || []).length) ? '검수' : '미작성';
    const today = this.todayIso();
    const prog = p.status === '취소' ? '취소' : p.status === '완료' || log === '확정' ? '완료' : '예정';
    const PB = {
      '예정': { bg: 'oklch(0.36 0.07 240)', fg: 'oklch(0.90 0.05 240)' },
      '완료': { bg: 'oklch(0.36 0.07 150)', fg: 'oklch(0.90 0.07 150)' },
      '취소': { bg: 'var(--color-neutral-800)', fg: 'var(--color-neutral-400)' }
    };
    const LB = {
      '미작성': { bg: 'oklch(0.36 0.10 25)', fg: 'oklch(0.90 0.06 25)' },
      '검수': { bg: 'oklch(0.38 0.08 80)', fg: 'oklch(0.92 0.07 85)' },
      '확정': { bg: 'oklch(0.36 0.07 150)', fg: 'oklch(0.90 0.07 150)' }
    };
    // 지나지 않은 일정의 미작성은 아직 정상이므로 표시하지 않음
    const showLog = p.status !== '취소' && !(log === '미작성' && p.date > today);
    return {
      progLabel: prog, progBg: PB[prog].bg, progFg: PB[prog].fg,
      logLabel: log === '검수' ? '검수 필요' : log === '확정' ? '일지 확정' : '일지 미작성',
      logShort: log === '검수' ? '검수' : log === '확정' ? '확정' : '미작성',
      logBg: LB[log].bg, logFg: LB[log].fg,
      showLog: showLog, hideLog: !showLog
    };
  }

  // 일정 카드의 [일지 작성 / 검수 계속 / 일지 수정] — 설명창 버튼과 같은 동작
  planLogInfo(p, s) {
    const k = p.date + '|' + p.program;
    const ss = (s.activeSession === k) ? { review: s.review, confirmed: s.confirmed, photos: s.photos } : ((s.sessions || {})[k] || {});
    const rv = ss.review || [], photos = (ss.photos || []).filter(x => x && x.url).length;
    const confirmed = !!ss.confirmed && rv.length > 0, started = photos || rv.length;
    return {
      label: confirmed ? '일지 수정' : started ? '검수 계속' : '일지 작성',
      icon: confirmed ? 'ph ph-pencil-simple' : started ? 'ph ph-user-check' : 'ph ph-note-pencil',
      cls: confirmed ? 'btn btn-secondary' : 'btn btn-primary',
      go: () => {
        if (started || confirmed) {
          const meta = p.start + (p.end ? '~' + p.end : '') + ' · ' + (p.place || '') + ' · ' + (p.staff || []).join(', ');
          this.switchSession(k, Object.assign({ program: p.program, logDate: p.date, logPlace: p.place }, this.reviewNav()), meta);
        } else {
          if (this.state.device === 'pc') this.setState({ nlOpen: true, logManual: false });
          this.openLogFromPlan(p);
        }
      }
    };
  }

  // 일정 마우스 오버 요약 (요약 카드 · 단계 · 진행률 · 참여자 얼굴 · 다음 할 일)
  hoverVals(s) {
    const h = s.calHover;
    const p = h && (s.plans || []).find(x => x.id === h.id);
    if (!p) return { hvOpen: false };
    const k = p.date + '|' + p.program;
    const ss = (s.activeSession === k) ? { review: s.review, confirmed: s.confirmed, photos: s.photos } : ((s.sessions || {})[k] || {});
    const rv = ss.review || [];
    const dup = this.dupInfo(rv);
    const live = rv.filter(r => !dup[r.key]);
    const known = live.filter(r => r.id), unknown = live.filter(r => !r.id);
    const photos = (ss.photos || []).filter(x => x && x.url).length;
    const confirmed = !!ss.confirmed && rv.length > 0;
    const b = this.planBadges(p, s);
    const today = this.todayIso(), future = p.date > today, cancelled = p.status === '취소';
    const G = 'oklch(0.80 0.13 150)', Y = 'oklch(0.85 0.13 85)', R = 'oklch(0.80 0.13 25)', N = 'var(--color-neutral-500)';
    const steps = [
      { label: '현장사진 첨부', done: photos > 0, note: photos ? photos + '장' : '없음' },
      { label: 'AI 판독', done: rv.length > 0, note: rv.length ? '완료' : (photos ? '실행 전' : '—') },
      { label: '참여자 검수', done: known.length > 0 && unknown.length === 0, warn: rv.length > 0 && (unknown.length > 0 || known.length === 0), note: rv.length ? (unknown.length ? '미확인 ' + unknown.length + '명' : known.length + '명 확인') : '—' },
      { label: '일지 확정', done: confirmed, note: confirmed ? '확정' : '—' },
      { label: '출석부 · 통계 반영', done: confirmed && known.length > 0, note: confirmed ? (known.length ? known.length + '명 반영' : '참여자 없음') : '—' }
    ];
    const doneN = steps.filter(x => x.done).length;
    const pct = cancelled ? 0 : Math.round(doneN / steps.length * 100);
    let next, tone;
    if (cancelled) { next = '취소된 일정입니다'; tone = 'n'; }
    else if (confirmed && known.length) { next = '완료 — 출석부·통계에 반영되었습니다'; tone = 'g'; }
    else if (confirmed) { next = '확정됐지만 참여자가 없습니다 — 참여자를 지정하세요'; tone = 'r'; }
    else if (future && !photos && !rv.length) { next = '진행 예정 — 당일 현장사진을 올려 주세요'; tone = 'b'; }
    else if (!photos && !rv.length) { next = '일지 미작성 — 현장사진을 올려 주세요'; tone = 'r'; }
    else if (!rv.length) { next = 'AI 판독을 실행하세요'; tone = 'y'; }
    else if (unknown.length) { next = '미확인 인물 ' + unknown.length + '명 — 환자 지정 또는 제외'; tone = 'y'; }
    else if (!known.length) { next = '참여자를 지정하세요'; tone = 'y'; }
    else { next = '검수 끝 — 확정하면 출석부에 반영됩니다'; tone = 'y'; }
    const TONE = {
      g: { bg: 'oklch(0.30 0.06 150)', fg: 'oklch(0.92 0.06 150)', i: 'ph-fill ph-check-circle' },
      y: { bg: 'oklch(0.32 0.07 85)', fg: 'oklch(0.94 0.06 85)', i: 'ph-fill ph-warning-circle' },
      r: { bg: 'oklch(0.30 0.08 25)', fg: 'oklch(0.92 0.05 25)', i: 'ph-fill ph-warning-circle' },
      b: { bg: 'oklch(0.30 0.06 240)', fg: 'oklch(0.92 0.04 240)', i: 'ph ph-calendar-check' },
      n: { bg: 'var(--color-neutral-800)', fg: 'var(--color-neutral-300)', i: 'ph ph-prohibit' }
    }[tone];
    const d = new Date(p.date + 'T00:00:00');
    const pu = s.photoUrls || {};
    const faces = live.slice(0, 7).map(r => {
      const pt = r.id ? PATIENTS.find(x => x.id === r.id) : null;
      const url = r.crop || (r.id ? pu[r.id] : '') || '';
      const name = pt ? pt.name : '미확인 인물' + (r.n ? ' ' + r.n : '');
      return { name: name, el: url ? this.img(url, name) : null, hasUrl: !!url, noUrl: !url, initial: pt ? pt.name.slice(0, 1) : '?',
        ring: r.id ? '0 0 0 2px oklch(0.70 0.12 150)' : 'none', border: r.id ? '0' : '1.5px dashed oklch(0.72 0.14 25)' };
    });
    return {
      hvOpen: true, hvLeft: h.left + 'px',
      hvTop: h.top != null ? h.top + 'px' : 'auto',
      hvBottom: h.bottom != null ? h.bottom + 'px' : 'auto',
      // 붙은 쪽에서 화면 끝까지 남은 공간만큼만 — 넘치면 창 안에서 스크롤
      hvMaxH: (window.innerHeight - (h.top != null ? h.top : h.bottom) - 8) + 'px',
      hvKeep: () => clearTimeout(this._hvT),
      hvLeave: () => { clearTimeout(this._hvT); this._hvT = setTimeout(() => this.setState({ calHover: null }), 200); },
      hvProgram: p.program,
      // 우측 상단 버튼: 미작성 → 일지 작성하기 · 작성 중 → 검수 계속 · 확정 → 일지 수정
      hvActShow: !cancelled,
      hvActLabel: confirmed ? '일지 수정' : (photos || rv.length) ? '검수 계속' : '일지 작성하기',
      hvActIcon: confirmed ? 'ph ph-pencil-simple' : (photos || rv.length) ? 'ph ph-user-check' : 'ph ph-note-pencil',
      hvActCls: confirmed ? 'btn btn-secondary' : 'btn btn-primary',
      hvAct: () => {
        clearTimeout(this._hvT);
        this.setState({ calHover: null });
        if (photos || rv.length || confirmed) {
          // 기존 일지 열기 (사진·참여자·확정 상태 그대로)
          const meta = p.start + (p.end ? '~' + p.end : '') + ' · ' + (p.place || '') + ' · ' + (p.staff || []).join(', ');
          this.switchSession(k, Object.assign({ program: p.program, logDate: p.date, logPlace: p.place }, this.reviewNav()), meta);
          if (confirmed) this.flash(p.date.slice(5).replace('-', '/') + ' ' + p.program + ' 일지 — 수정 후 다시 확정하면 출석부가 갱신됩니다');
        } else {
          if (this.state.device === 'pc') this.setState({ nlOpen: true, logManual: false });
          this.openLogFromPlan(p);
        }
      },
      hvWhen: (d.getMonth() + 1) + '/' + d.getDate() + ' (' + '일월화수목금토'[d.getDay()] + ') ' + p.start + (p.end ? '–' + p.end : ''),
      hvWhere: [p.place, p.ward && p.ward !== '전체' ? p.ward : '', (p.staff || []).length ? '담당 ' + p.staff.join('·') : ''].filter(Boolean).join(' · ') || '장소·담당 미지정',
      hvProgLabel: b.progLabel, hvProgBg: b.progBg, hvProgFg: b.progFg,
      hvShowLog: b.showLog, hvLogLabel: b.logLabel, hvLogBg: b.logBg, hvLogFg: b.logFg,
      hvNext: next, hvNextBg: TONE.bg, hvNextFg: TONE.fg, hvNextIcon: TONE.i,
      hvStats: [
        { k: '참여', v: known.length + '명', color: 'var(--color-text)', size: '16px' },
        { k: '사진', v: photos + '장', color: 'var(--color-text)', size: '16px' },
        { k: '미확인', v: unknown.length + '명', color: unknown.length ? Y : 'var(--color-text)', size: '16px' },
        { k: '출석부', v: confirmed && known.length ? '반영' : '미반영', color: confirmed && known.length ? G : R, size: '14px' }
      ],
      hvPct: pct + '%', hvPctColor: pct === 100 ? G : pct === 0 ? R : Y,
      hvSteps: steps.map(x => ({
        label: x.label, note: x.note,
        icon: x.done ? 'ph-fill ph-check-circle' : x.warn ? 'ph-fill ph-warning-circle' : 'ph ph-circle',
        iconColor: x.done ? G : x.warn ? Y : N,
        color: x.done || x.warn ? 'var(--color-text)' : N,
        noteColor: x.warn ? Y : N
      })),
      hvHasFaces: faces.length > 0, hvFaces: faces,
      hvMoreFaces: live.length > 7 ? '+' + (live.length - 7) + '명' : ''
    };
  }

  // ───── EMR 재원환자 명부 붙여넣기 ─────
  // 한 줄: 병동-호실-침대 · 코드 · (빈칸) · 주치의 · 이름 · 등록번호 · 보험 · 나이 · 성별 · 입원일
  // 열 순서가 바뀌거나 빈 열이 끼어도 읽음:
  // ① 머리글(병실·의사·수진자·차트번호·유형·나이·성·입원일자)이 있으면 그 위치로 읽고
  // ② 머리글이 없으면 칸 내용(병실 형식·날짜·F/M·보험유형·한글 이름·숫자)으로 판별
  // 사용자가 정의한 EMR 열 구성 (서버 저장) — 없으면 기본 구성
  static EMR_FIELDS = [
    { k: 'loc', t: '병실 (병동-호실-침대)' }, { k: 'doctor', t: '의사 (주치의)' }, { k: 'name', t: '수진자 (환자 이름)' },
    { k: 'chart', t: '차트번호 (등록번호)' }, { k: 'ins', t: '유형 (보험)' }, { k: 'age', t: '나이' }, { k: 'sex', t: '성별' },
    { k: 'admit', t: '입원일자' }, { k: 'extra', t: '추가 항목 (그대로 저장)' }, { k: 'skip', t: '사용 안 함 (빈 열)' }
  ];
  static EMR_DEFAULT_COLS = [
    { label: '병실', field: 'loc' }, { label: '', field: 'skip' }, { label: '', field: 'skip' }, { label: '의사', field: 'doctor' },
    { label: '수진자', field: 'name' }, { label: '차트번호', field: 'chart' }, { label: '유형', field: 'ins' },
    { label: '나이', field: 'age' }, { label: '성', field: 'sex' }, { label: '입원일자', field: 'admit' }
  ];
  emrCols(s) { const c = (s || this.state).emrCols; return Array.isArray(c) && c.length ? c : Component.EMR_DEFAULT_COLS; }
  saveEmrCols(cols) {
    this.setState({ emrCols: cols });
    try { localStorage.setItem('smartcare.emrCols.v1', JSON.stringify(cols)); } catch (e) {}
  }

  parseEmr(text, userCols) {
    const rows = [], seen = {};
    let vacant = 0, bad = 0, map = null, sample = null;
    // 사용자 열 구성 → 열 위치 맵
    const uMap = {}, uExtra = [];
    (userCols || []).forEach((c, i) => {
      if (c.field === 'extra') uExtra.push({ i: i, label: (c.label || '').trim() || ('추가' + (uExtra.length + 1)) });
      else if (c.field !== 'skip' && uMap[c.field] == null) uMap[c.field] = i;
    });
    const useUser = uMap.loc != null && uMap.name != null;
    const ALIAS = {
      loc: ['병실', '병상', '병동', '병실번호'], doctor: ['의사', '주치의', '담당의', '진료의'],
      name: ['수진자', '환자명', '이름', '성명', '환자', '수진자명'], chart: ['차트번호', '등록번호', '차트', '환자번호', '병록번호'],
      ins: ['유형', '보험', '보험유형', '급여유형', '자격'], age: ['나이', '연령', '만나이'], sex: ['성', '성별'],
      admit: ['입원일자', '입원일', '입원날짜', '입원']
    };
    const LOC = /^(\d+)\s*병동\s*-\s*0*(\d+)\s*-\s*(\d+)$/;
    const DATE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/;
    const SEX = /^(F|M|남|여)$/i;
    const INS = /^(보험|의급|의보|자보|산재|일반|보호|차상위|건보|급여|비급여|\d종|의료급여\d?종?)$/;
    const HAN = /^[가-힣]{2,}[A-Za-z]?\d?$/;
    const normDate = (v) => { const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(v || ''); return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : ''; };
    const normSex = (v) => /^(F|여)$/i.test(v || '') ? '여' : /^(M|남)$/i.test(v || '') ? '남' : '';
    (text || '').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const cells = (line.indexOf('\t') >= 0 ? line.split('\t') : line.trim().split(/\s+/)).map(c => c.trim());
      // 머리글 줄
      const hits = {};
      cells.forEach((c, i) => { Object.keys(ALIAS).forEach(f => { if (hits[f] == null && ALIAS[f].indexOf(c.replace(/\s/g, '')) >= 0) hits[f] = i; }); });
      if (Object.keys(hits).length >= 3 && hits.name != null) { map = hits; return; }
      const tabbed = line.indexOf('\t') >= 0;
      const locIdx = (!map && useUser && tabbed && LOC.test(cells[uMap.loc] || '')) ? uMap.loc : cells.findIndex(c => LOC.test(c));
      if (locIdx < 0) { bad++; return; }
      if (!sample && tabbed) sample = cells;
      const loc = LOC.exec(cells[locIdx]);
      let name = '', doctor = '', chart = '', ins = '', age = null, sex = '', admit = '';
      const extra = {};
      if ((map || useUser) && tabbed) {
        const M = map || uMap;
        const at = (f) => M[f] != null ? (cells[M[f]] || '').trim() : '';
        name = at('name'); doctor = at('doctor'); chart = at('chart'); ins = at('ins');
        age = parseInt(at('age'), 10); sex = normSex(at('sex')); admit = normDate(at('admit'));
        if (!map) uExtra.forEach(x => { const v = (cells[x.i] || '').trim(); if (v) extra[x.label] = v; });
      } else {
        const tk = cells.map((c, i) => ({ c, i })).filter(x => x.c && x.i !== locIdx);
        const used = {};
        const take = (fn) => { const x = tk.find(t => !used[t.i] && fn(t.c)); if (x) used[x.i] = true; return x; };
        const d = take(c => DATE.test(c)); admit = d ? normDate(d.c) : '';
        const sx = take(c => SEX.test(c)); sex = sx ? normSex(sx.c) : '';
        const it = take(c => INS.test(c)); ins = it ? it.c : '';
        const hans = tk.filter(t => !used[t.i] && HAN.test(t.c));
        if (hans.length) { const nm = hans[hans.length - 1]; name = nm.c; used[nm.i] = true; if (hans.length > 1) doctor = hans[hans.length - 2].c; }
        // 이름 뒤 숫자: 성별 바로 옆 숫자 = 나이, 나머지 = 차트번호
        const nameI = hans.length ? hans[hans.length - 1].i : -1;
        // 머리글 없이 읽을 때는 기본 순서(… 의사 · 이름 · 숫자 · 유형 · 나이 · 성 · 입원일)만 믿음 — 순서가 다르면 추측하지 않고 '읽지 못한 줄'
        if (nameI >= 0 && ((sx && sx.i < nameI) || (d && d.i < nameI) || (it && it.i < nameI) || locIdx > nameI)) { bad++; return; }
        const nums = tk.filter(t => !used[t.i] && /^\d+$/.test(t.c) && t.i > nameI);
        if (nums.length === 1) { const v = parseInt(nums[0].c, 10); if (v <= 120 && sx) age = v; else chart = nums[0].c; }
        else if (nums.length >= 2) {
          const ag = sx ? nums.slice().sort((a, b) => Math.abs(a.i - sx.i) - Math.abs(b.i - sx.i))[0] : nums[nums.length - 1];
          age = parseInt(ag.c, 10);
          chart = (nums.find(n => n !== ag) || {}).c || '';
        }
      }
      if (!name) { vacant++; return; }
      if (!sex) { bad++; return; }
      const key = chart || name;
      // 같은 차트번호가 두 번 나오면 뒤쪽(최신) 줄을 사용
      if (seen[key] != null) rows.splice(seen[key], 1);
      Object.keys(seen).forEach(k => { if (seen[k] > (seen[key] != null ? seen[key] : Infinity)) seen[k]--; });
      seen[key] = rows.length;
      rows.push({
        ward: loc[1] + '병동', room: parseInt(loc[2], 10) + '호', bed: loc[3],
        doctor: /^\d+$/.test(doctor) ? '' : doctor, name: name, chart: chart, ins: ins, age: isNaN(age) || age == null ? null : age,
        sex: sex, admit: admit, extra: extra
      });
    });
    return { rows, vacant, bad, sample, mode: map ? 'header' : (useUser ? 'user' : 'content') };
  }

  emrPlan(s) {
    const pr = this.parseEmr(s.emrText, this.emrCols(s));
    const used = {};
    // 차트번호 비교는 숫자만 · 앞자리 0 무시 ("188" = "00000188")
    const normC = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
    const byChart = {};
    PATIENTS.forEach(x => { const k = normC(x.chartNo); if (!k) return; const cur = byChart[k]; if (!cur || ((cur.stay || '재원') !== '재원' && (x.stay || '재원') === '재원')) byChart[k] = x; });
    const items = pr.rows.map(r => {
      const room = r.ward + ' ' + r.room;
      let p = r.chart ? byChart[normC(r.chart)] || null : null;
      if (!p) p = PATIENTS.find(x => !x.chartNo && !used[x.id] && x.name === r.name && (x.sex || r.sex) === r.sex);
      if (p) used[p.id] = true;
      // 차트번호(등록번호)가 키 — 같은 차트번호면 동일인, 나머지 정보는 최신 붙여넣기 값으로 갱신
      const changed = [];
      if (p) {
        if (p.name !== r.name) changed.push('이름');
        if ((p.sex || '') !== r.sex) changed.push('성별');
        if (!p.birth && r.age != null && p.age !== r.age) changed.push('나이');
        if ((p.doctor || '') !== (r.doctor || '')) changed.push('주치의');
        if ((p.insurance || '') !== (r.ins || '')) changed.push('보험');
        if ((p.admitDate || '') !== (r.admit || '')) changed.push('입원일');
        if ((p.bed || '') !== (r.bed || '')) changed.push('침대');
        if (!p.chartNo && r.chart) changed.push('등록번호 연결');
        else if (p.chartNo && r.chart && p.chartNo !== r.chart) changed.push('등록번호 표기');
      }
      // 같은 차트번호인데 입원일이 다르면 재입원 → 기존 동의서 사용 여부를 사용자가 선택
      const readmit = !!(p && p.admitDate && r.admit && p.admitDate !== r.admit);
      const kind = !p ? 'new' : readmit ? 'readmit' : (p.room !== room || (p.stay || '재원') !== '재원') ? 'move' : changed.length ? 'update' : 'same';
      return Object.assign({}, r, { roomFull: room, p: p, kind: kind, changed: changed, readmit: readmit });
    });
    const wardsNow = s.wards || [];
    const missing = {};
    items.forEach(it => {
      const w = wardsNow.find(x => x.name === it.ward);
      if (!w || (w.rooms || []).indexOf(it.room) < 0) (missing[it.ward] = missing[it.ward] || {})[it.room] = true;
    });
    const missRooms = Object.keys(missing).reduce((n, k) => n + Object.keys(missing[k]).length, 0);
    const wardSet = {}; items.forEach(it => { wardSet[it.ward] = true; });
    // 이전 명부에 있던(차트번호가 있는) 재원 환자가 이번 명부에 없으면 퇴원 후보 — 붙여넣은 병동 안에서만
    const discharge = PATIENTS.filter(p => p.chartNo && (p.stay || '재원') === '재원' && !used[p.id] && Object.keys(wardSet).some(w => (p.room || '').indexOf(w + ' ') === 0));
    return { items, vacant: pr.vacant, bad: pr.bad, mode: pr.mode, sample: pr.sample, missing, missRooms, discharge };
  }

  // ───── EMR 붙여넣기 되돌리기: 반영 직전 명부를 보관 (최근 3회, 서버 저장) ─────
  // 보관 목록 읽기: 메모리 → 브라우저 → 서버 순 (브라우저 저장 공간이 가득 차도 되돌리기가 동작하게)
  emrUndoListLocal() {
    if (Array.isArray(this._emrUndoList)) return this._emrUndoList;
    try { const v = JSON.parse(localStorage.getItem('smartcare.emrUndo.v1') || 'null'); if (Array.isArray(v)) return (this._emrUndoList = v); } catch (e) {}
    return [];
  }
  async emrUndoListAsync() {
    const l = this.emrUndoListLocal();
    if (l.length) return l;
    const c = this.cloudCfg();
    if (!c) return [];
    try {
      const r = await fetch(c.url + '/rest/v1/smartcare_kv?select=v&k=eq.' + encodeURIComponent(c.ws + ':smartcare.emrUndo.v1'), { headers: this.cloudHeaders(c) });
      const j = await r.json();
      const v = j && j[0] ? JSON.parse(j[0].v) : [];
      if (Array.isArray(v)) this._emrUndoList = v;
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  emrUndoSave(list) {
    this._emrUndoList = list;
    const str = JSON.stringify(list);
    let ok = true;
    try { localStorage.setItem('smartcare.emrUndo.v1', str); if (localStorage.getItem('smartcare.emrUndo.v1') !== str) ok = false; } catch (e) { ok = false; }
    // 브라우저 저장이 실패해도 서버에는 반드시 올림
    if (!ok && window.__scCloudPush && this.cloudCfg()) window.__scCloudPush('smartcare.emrUndo.v1', str);
    this.setState({ emrUndo: list.map(x => ({ at: x.at, by: x.by, reason: x.reason, n: (x.patients || []).length })) });
  }
  emrBackup(reason) {
    const s = this.state;
    const who = ((s.roster || []).find(m => m.id === s.userId) || {}).name || '';
    // 용량 절약: 사진 등 큰 값 없이 명부 필드만 보관
    const lite = PATIENTS.map(p => { const o = Object.assign({}, p); delete o.photoUrl; return o; });
    const list = [{ at: new Date().toISOString(), by: who, reason: reason, patients: lite, wards: JSON.parse(JSON.stringify(s.wards || [])), emrLast: s.emrLast || null }].concat(this.emrUndoListLocal()).slice(0, 3);
    this.emrUndoSave(list);
  }
  async emrUndoNow() {
    const list = await this.emrUndoListAsync();
    const b = list[0];
    if (!b) { this.setState({ dialog: null }); this.flash('되돌릴 기록이 없습니다'); return; }
    PATIENTS.length = 0; b.patients.forEach(p => PATIENTS.push(p));
    this.persistPatients();
    this.emrUndoSave(list.slice(1));
    const patch = { dialog: null, ptTick: (this.state.ptTick || 0) + 1, page: 0, emrLast: b.emrLast };
    if (b.wards && b.wards.length) {
      patch.wards = b.wards; patch.wardsSaved = JSON.parse(JSON.stringify(b.wards));
      try { localStorage.setItem('smartcare.wards.v1', JSON.stringify(b.wards)); } catch (e) {}
    }
    try { localStorage.setItem('smartcare.emrLast.v1', JSON.stringify(b.emrLast || {})); } catch (e) {}
    this.setState(patch);
    this.flash('되돌리기 완료 — ' + b.reason + ' 이전 명부(' + b.patients.length + '명)로 복원했습니다');
  }
  // 차트번호 표기 차이(앞자리 0)로 같은 환자가 2번 등록된 경우 하나로 합침
  // 남기는 쪽 = 먼저 등록된 기록(프로그램 참여·동의서·사진 연결 유지), 정보는 최신 재원 기록으로 갱신
  chartDupGroups() {
    const normC = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
    const by = {};
    PATIENTS.forEach(p => { const k = normC(p.chartNo); if (k) (by[k] = by[k] || []).push(p); });
    return Object.keys(by).filter(k => by[k].length > 1).map(k => by[k]);
  }
  mergeChartDups() {
    const groups = this.chartDupGroups();
    if (!groups.length) { this.flash('합칠 중복 환자가 없습니다'); return; }
    this.emrBackup('중복 환자 정리');
    const num = (id) => parseInt(String(id).replace(/\D/g, ''), 10) || 0;
    const remap = {};
    groups.forEach(g => {
      const sorted = g.slice().sort((a, b) => num(a.id) - num(b.id));
      const keep = sorted[0];
      const latest = sorted.slice().reverse().find(p => (p.stay || '재원') === '재원') || sorted[sorted.length - 1];
      const sameAdmit = (keep.admitDate || '') === (latest.admitDate || '');
      if (latest !== keep) {
        ['name', 'sex', 'room', 'doctor', 'insurance', 'admitDate', 'bed', 'emrExtra'].forEach(k => { if (latest[k] !== undefined && latest[k] !== '') keep[k] = latest[k]; });
        if (!keep.birth && latest.age != null) keep.age = latest.age;
        keep.chartNo = latest.chartNo || keep.chartNo;
        if ((latest.stay || '재원') === '재원') { keep.stay = '재원'; keep.dischargeDate = ''; keep.dischargeBy = ''; }
        if (!sameAdmit) keep.admitHistory = (keep.admitHistory || []).concat([{ prevAdmit: '', admit: latest.admitDate || '', at: new Date().toISOString(), consent: '기존 사용', by: '중복 정리' }]);
        else if (keep.admitHistory && keep.admitHistory.length && keep.admitHistory[keep.admitHistory.length - 1].by === 'EMR 명부 자동 퇴원') keep.admitHistory = keep.admitHistory.slice(0, -1);
      }
      sorted.slice(1).forEach(d => {
        remap[d.id] = keep.id;
        if ((!keep.consent || keep.consent === '확인전') && d.consent && d.consent !== '확인전') keep.consent = d.consent;
        if ((!keep.face || keep.face === '확인전') && d.face && d.face !== '확인전') keep.face = d.face;
        if ((!keep.guardians || !keep.guardians.length) && d.guardians && d.guardians.length) keep.guardians = d.guardians;
      });
    });
    const drop = new Set(Object.keys(remap));
    const kept = PATIENTS.filter(p => !drop.has(p.id));
    PATIENTS.length = 0; kept.forEach(p => PATIENTS.push(p));
    const s = this.state;
    const mapObj = (o) => { const n = Object.assign({}, o || {}); Object.keys(remap).forEach(id => { if (n[id] !== undefined) { if (n[remap[id]] === undefined) n[remap[id]] = n[id]; delete n[id]; } }); return n; };
    const fixRv = (rv) => (rv || []).map(r => r && remap[r.id] ? Object.assign({}, r, { id: remap[r.id] }) : r);
    const sessions = {};
    Object.keys(s.sessions || {}).forEach(k => { const v = s.sessions[k]; sessions[k] = v ? Object.assign({}, v, { review: fixRv(v.review) }) : v; });
    const photoUrls = mapObj(s.photoUrls);
    this.setState({ sessions: sessions, review: fixRv(s.review), photoUrls: photoUrls, consentFiles: mapObj(s.consentFiles), consentVia: mapObj(s.consentVia), dialog: null, ptTick: (s.ptTick || 0) + 1, page: 0, sel: remap[s.sel] || s.sel });
    this.persistPatients(photoUrls);
    this.flash('중복 정리 완료 — ' + groups.length + '명을 하나로 합쳤습니다 (명부 ' + PATIENTS.length + '명)');
  }

  emrApplyNow() {
    const s = this.state;
    const plan = this.emrPlan(s);
    if (!plan.items.length) { this.flash('붙여넣은 명부에서 환자를 찾지 못했습니다'); return; }
    const choice = s.emrReadmit || {};
    const undecided = plan.items.filter(it => it.kind === 'readmit' && !choice[it.p.id]);
    if (undecided.length) { this.flash('재입원 환자 ' + undecided.length + '명의 동의서 처리(기존 사용 / 다시 받기)를 선택하세요'); return; }
    this.emrBackup('EMR 붙여넣기');
    // 병동·호실 자동 추가
    let wards = JSON.parse(JSON.stringify(s.wards || []));
    let addedRooms = 0;
    if (s.emrAddWards !== false && plan.missRooms) {
      Object.keys(plan.missing).forEach(wn => {
        let w = wards.find(x => x.name === wn);
        if (!w) { w = { id: wards.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1, name: wn, rooms: [] }; wards.push(w); }
        Object.keys(plan.missing[wn]).forEach(rm => { if (w.rooms.indexOf(rm) < 0) { w.rooms.push(rm); addedRooms++; } });
        w.rooms.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      });
      wards.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    }
    let nextN = PATIENTS.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0);
    let nNew = 0, nMove = 0, nOut = 0, nUpd = 0, nRe = 0, nRenew = 0;
    plan.items.forEach(it => {
      const emr = { chartNo: it.chart, doctor: it.doctor, insurance: it.ins, admitDate: it.admit, bed: it.bed };
      if (it.extra && Object.keys(it.extra).length) emr.emrExtra = Object.assign({}, (it.p && it.p.emrExtra) || {}, it.extra);
      if (it.p) {
        const t = PATIENTS.find(x => x.id === it.p.id);
        if (!t) return;
        if (it.kind === 'move') nMove++;
        if (it.kind === 'update') nUpd++;
        if (it.kind === 'readmit') {
          nRe++;
          const ch = choice[t.id];
          const hist = (t.admitHistory || []).concat([{ prevAdmit: t.admitDate || '', admit: it.admit, at: new Date().toISOString(), consent: ch === 'renew' ? '다시 받기' : '기존 사용', prevConsent: t.consent || '확인전', prevFace: t.face || '확인전' }]);
          t.admitHistory = hist;
          if (ch === 'renew') {
            // 이전 동의 기록·첨부 파일은 지우지 않고 보관 — 상태만 '확인전'으로 되돌려 새로 받게 함
            t.consent = '확인전'; t.face = '확인전'; t.consentRenew = true; nRenew++;
          } else t.consentRenew = false;
        }
        // 내부 번호(id)는 그대로 → 프로그램 참여·일지·출석·사진·동의서 연결 유지
        if ((t.stay || '재원') !== '재원') { t.dischargeDate = ''; t.dischargeBy = ''; }
        Object.assign(t, emr, {
          name: it.name, sex: it.sex, room: it.roomFull, stay: '재원',
          age: t.birth ? t.age : (it.age != null ? it.age : t.age),
          chartNo: t.chartNo || it.chart
        });
      } else {
        nextN++; nNew++;
        PATIENTS.push(Object.assign({
          id: 'PT-' + String(nextN).padStart(4, '0'), name: it.name, sex: it.sex, birth: '', age: it.age,
          room: it.roomFull, consent: '확인전', face: '확인전', stay: '재원', guardians: [],
          faceId: '—', last: '참여 이력 없음', photo: false, source: 'EMR'
        }, emr));
      }
    });
    if (s.emrDischarge !== false) {
      const skip = s.emrOutSkip || {};
      const today = this.todayIso();
      plan.discharge.forEach(p => {
        if (skip[p.id]) return;
        const t = PATIENTS.find(x => x.id === p.id);
        if (!t) return;
        t.stay = '퇴원'; t.dischargeDate = today; t.dischargeBy = 'EMR 명부';
        t.admitHistory = (t.admitHistory || []).concat([{ admit: t.admitDate || '', discharge: today, room: t.room, at: new Date().toISOString(), by: 'EMR 명부 자동 퇴원' }]);
        nOut++;
      });
    }
    this.persistPatients();
    const patch = { emrOpenNow: false, emrText: '', ptTick: (s.ptTick || 0) + 1, page: 0 };
    if (addedRooms) {
      patch.wards = wards; patch.wardsSaved = JSON.parse(JSON.stringify(wards));
      try { localStorage.setItem('smartcare.wards.v1', JSON.stringify(wards)); } catch (e) {}
    }
    // 붙여넣기 시각 기록 (서버 저장 → 모든 기기에 표시)
    const who = ((s.roster || []).find(m => m.id === s.userId) || {}).name || '';
    const last = { at: new Date().toISOString(), by: who, total: plan.items.length, nNew: nNew, nMove: nMove, nUpd: nUpd, nOut: nOut, nRe: nRe, nRenew: nRenew };
    patch.emrLast = last;
    patch.emrReadmit = {};
    try { localStorage.setItem('smartcare.emrLast.v1', JSON.stringify(last)); } catch (e) {}
    this.setState(patch);
    this.flash('EMR 명부 반영 — 신규 ' + nNew + '명 · 병실 변경 ' + nMove + '명 · 정보 갱신 ' + nUpd + '명' + (nRe ? ' · 재입원 ' + nRe + '명(동의 다시 받기 ' + nRenew + ')' : '') + (nOut ? ' · 퇴원 ' + nOut + '명' : '') + (addedRooms ? ' · 호실 ' + addedRooms + '개 추가' : ''));
  }

  emrVals(s) {
    if (!s.emrOpenNow) return { emrIsOpen: false };
    const plan = this.emrPlan(s);
    const K = {
      new: { t: '신규', bg: 'oklch(0.34 0.07 240)', fg: 'oklch(0.92 0.05 240)' },
      move: { t: '병실 변경', bg: 'oklch(0.36 0.08 80)', fg: 'oklch(0.93 0.07 85)' },
      update: { t: '정보 갱신', bg: 'oklch(0.34 0.07 300)', fg: 'oklch(0.92 0.05 300)' },
      readmit: { t: '재입원', bg: 'oklch(0.34 0.09 25)', fg: 'oklch(0.92 0.06 25)' },
      same: { t: '변경 없음', bg: 'var(--color-neutral-800)', fg: 'var(--color-neutral-400)' }
    };
    const cnt = (k) => plan.items.filter(x => x.kind === k).length;
    const nNew = cnt('new'), nMove = cnt('move'), nUpd = cnt('update'), nSame = cnt('same'), nRe = cnt('readmit');
    const choice = s.emrReadmit || {};
    const reItems = plan.items.filter(x => x.kind === 'readmit');
    const undecided = reItems.filter(x => !choice[x.p.id]).length;
    const setAll = (v) => { const c = {}; reItems.forEach(x => { c[x.p.id] = v; }); this.setState({ emrReadmit: c }); };
    const outSkip = s.emrOutSkip || {};
    const outOn = s.emrDischarge !== false;
    const outN = outOn ? plan.discharge.filter(p => !outSkip[p.id]).length : 0;
    const applyN = nNew + nMove + nUpd + nRe + outN;
    return {
      emrIsOpen: true,
      emrText: s.emrText || '',
      onEmrText: (e) => this.setState({ emrText: e.target.value }),
      emrClose: () => this.setState({ emrOpenNow: false }),
      emrHasRows: plan.items.length > 0, emrNoRows: plan.items.length === 0,
      emrEmptyMsg: (s.emrText || '').trim() ? '읽을 수 있는 환자 줄이 없습니다 — EMR 재원환자 목록 형식인지 확인하세요' : '붙여넣기 전입니다',
      emrChips: [
        { label: '신규', n: nNew, bg: K.new.bg, fg: K.new.fg },
        { label: '병실 변경', n: nMove, bg: K.move.bg, fg: K.move.fg },
        { label: '정보 갱신', n: nUpd, bg: K.update.bg, fg: K.update.fg },
        { label: '재입원', n: nRe, bg: K.readmit.bg, fg: K.readmit.fg },
        { label: '변경 없음', n: nSame, bg: K.same.bg, fg: K.same.fg },
        { label: '빈 병상 건너뜀', n: plan.vacant, bg: 'var(--color-neutral-900)', fg: 'var(--color-neutral-500)' }
      ].concat(plan.bad ? [{ label: '읽지 못한 줄', n: plan.bad, bg: 'oklch(0.30 0.08 25)', fg: 'oklch(0.90 0.06 25)' }] : [])
        .concat([{ label: plan.mode === 'header' ? '붙여넣은 머리글 기준으로 열 인식' : plan.mode === 'user' ? '설정한 열 구성으로 인식' : '내용으로 열 자동 인식 — 머리글 줄을 함께 복사하면 열 순서가 달라도 정확히 읽습니다', n: '', bg: 'var(--color-neutral-900)', fg: plan.mode === 'content' ? 'oklch(0.86 0.12 85)' : 'var(--color-accent-300)' }]),
      ...(() => {
        const cols = this.emrCols(s);
        const sm = plan.sample || [];
        const F = Component.EMR_FIELDS;
        const set = (next) => this.saveEmrCols(next);
        const hasLoc = cols.some(c => c.field === 'loc'), hasName = cols.some(c => c.field === 'name');
        return {
          emrColsOpen: !!s.emrColsOpen,
          toggleEmrCols: () => this.setState({ emrColsOpen: !s.emrColsOpen }),
          emrColsBtn: s.emrColsOpen ? '열 구성 닫기' : 'EMR 열 구성 편집 (' + cols.length + '열)',
          emrColsWarn: !hasLoc || !hasName ? '"병실"과 "수진자" 항목은 꼭 지정해야 합니다' : '',
          emrColCards: cols.map((c, i) => ({
            no: i + 1, label: c.label || '', fieldOpts: F.map(f => ({ k: f.k, t: f.t })), field: c.field,
            sample: sm[i] != null && sm[i] !== '' ? sm[i] : (sm.length ? '(빈 칸)' : '붙여넣으면 예시가 보입니다'),
            sampleColor: sm[i] ? 'var(--color-text)' : 'var(--color-neutral-600)',
            border: c.field === 'skip' ? 'var(--color-neutral-800)' : 'var(--color-accent-700)',
            opacity: c.field === 'skip' ? '0.7' : '1',
            isFirst: i === 0, isLast: i === cols.length - 1,
            onLabel: (e) => { const n = cols.slice(); n[i] = Object.assign({}, c, { label: e.target.value }); set(n); },
            onField: (e) => { const n = cols.slice(); n[i] = Object.assign({}, c, { field: e.target.value }); set(n); },
            left: () => { if (!i) return; const n = cols.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); },
            right: () => { if (i === cols.length - 1) return; const n = cols.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); },
            del: () => { const n = cols.filter((_, j) => j !== i); set(n.length ? n : [{ label: '병실', field: 'loc' }]); }
          })),
          emrColAdd: () => set(cols.concat([{ label: '새 열', field: 'extra' }])),
          emrColReset: () => this.setState({ dialog: { title: 'EMR 열 구성을 기본값으로 되돌릴까요?', body: '병실 · 빈 열 2개 · 의사 · 수진자 · 차트번호 · 유형 · 나이 · 성 · 입원일자 순서로 돌아갑니다.', cta: '되돌리기', confirm: () => { this.saveEmrCols(Component.EMR_DEFAULT_COLS.slice()); this.setState({ dialog: null }); } } })
        };
      })(),
      emrAddWards: s.emrAddWards !== false,
      toggleEmrWards: () => this.setState({ emrAddWards: s.emrAddWards === false }),
      emrNewRoomsNote: plan.missRooms ? '(호실 ' + plan.missRooms + '개 추가 예정)' : '(추가할 호실 없음)',
      emrDischarge: outOn,
      toggleEmrDischarge: () => this.setState({ emrDischarge: !outOn }),
      emrDischargeNote: '(' + plan.discharge.length + '명 해당 · 붙여넣은 병동만)',
      emrHasOut: outOn && plan.discharge.length > 0,
      emrOutTitle: '이전 명부에는 있었지만 이번 명부에 없는 재원 환자 ' + plan.discharge.length + '명 → 퇴원 처리 (' + outN + '명 선택)',
      emrOutOpen: !!s.emrOutOpen,
      emrOutOpenStr: s.emrOutOpen ? 'true' : 'false',
      emrOutOpenLabel: s.emrOutOpen ? '목록 접기' : '목록 보기 (' + plan.discharge.length + '명)',
      emrOutChevron: s.emrOutOpen ? 'ph ph-caret-up' : 'ph ph-caret-down',
      emrOutToggleOpen: () => this.setState({ emrOutOpen: !this.state.emrOutOpen }),
      emrOutAllOn: () => this.setState({ emrOutSkip: {} }),
      emrOutAllOff: () => { const k = {}; plan.discharge.forEach(p => { k[p.id] = true; }); this.setState({ emrOutSkip: k }); },
      emrOutList: plan.discharge.map(p => {
        const on = !outSkip[p.id];
        return {
          name: p.name || '—', room: p.room || '—', chart: p.chartNo || '—',
          sexAge: (p.sex || '') + (p.age ? ' ' + p.age + '세' : ''), admit: p.admitDate || '—',
          stateLabel: on ? '퇴원' : '제외', rowOp: on ? '1' : '0.55',
          label: p.name + ' · ' + p.room + (p.chartNo ? ' · ' + p.chartNo : ''),
          bd: on ? 'oklch(0.62 0.12 25)' : 'var(--color-neutral-700)', bg: on ? 'oklch(0.30 0.07 25)' : 'var(--color-neutral-900)',
          fg: on ? 'oklch(0.92 0.05 25)' : 'var(--color-neutral-500)', icon: on ? 'ph-fill ph-check-square' : 'ph ph-square',
          toggle: () => { const k = Object.assign({}, this.state.emrOutSkip || {}); if (k[p.id]) delete k[p.id]; else k[p.id] = true; this.setState({ emrOutSkip: k }); }
        };
      }),
      emrRows: plan.items.map(it => ({
        status: K[it.kind].t, bg: K[it.kind].bg, fg: K[it.kind].fg, opacity: it.kind === 'same' ? '0.65' : '1',
        isRe: it.kind === 'readmit', notRe: it.kind !== 'readmit',
        reInfo: it.kind === 'readmit' ? '입원 ' + (it.p.admitDate || '—') + ' → ' + it.admit + ' · 현재 초상권 ' + (it.p.consent || '확인전') + '·안면 ' + (it.p.face || '확인전') : '',
        keepBd: choice[it.p && it.p.id] === 'keep' ? 'var(--color-accent)' : 'var(--color-neutral-700)',
        keepBg: choice[it.p && it.p.id] === 'keep' ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
        keepFg: choice[it.p && it.p.id] === 'keep' ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
        renewBd: choice[it.p && it.p.id] === 'renew' ? 'oklch(0.70 0.14 25)' : 'var(--color-neutral-700)',
        renewBg: choice[it.p && it.p.id] === 'renew' ? 'oklch(0.32 0.09 25)' : 'var(--color-neutral-900)',
        renewFg: choice[it.p && it.p.id] === 'renew' ? 'oklch(0.92 0.06 25)' : 'var(--color-neutral-400)',
        reKeep: () => { const c = Object.assign({}, this.state.emrReadmit || {}); c[it.p.id] = 'keep'; this.setState({ emrReadmit: c }); },
        reRenew: () => { const c = Object.assign({}, this.state.emrReadmit || {}); c[it.p.id] = 'renew'; this.setState({ emrReadmit: c }); },
        room: it.roomFull,
        roomNote: (it.kind === 'move' && it.p ? ' ← ' + it.p.room : '') + (it.changed && it.changed.length && it.kind !== 'new' ? ' · ' + it.changed.join('·') + ' 갱신' : ''),
        extra: it.extra && Object.keys(it.extra).length ? Object.keys(it.extra).map(k => k + ': ' + it.extra[k]).join(' · ') : '',
        name: it.name, sexAge: it.sex + (it.age != null ? ' ' + it.age + '세' : ''), chart: it.chart || '—', ins: it.ins, doctor: it.doctor, admit: it.admit
      })),
      emrHasReadmit: nRe > 0,
      emrReadmitNote: undecided ? '재입원 ' + nRe + '명 중 ' + undecided + '명의 동의서 처리를 선택하세요' : '재입원 ' + nRe + '명 동의서 처리 선택 완료',
      emrReadmitColor: undecided ? 'oklch(0.86 0.12 25)' : 'oklch(0.85 0.12 150)',
      emrReKeepAll: () => setAll('keep'),
      emrReRenewAll: () => setAll('renew'),
      emrCantApply: applyN === 0 || undecided > 0,
      emrApplyLabel: undecided ? '재입원 동의서 처리를 선택하세요' : applyN ? applyN + '명 반영하기' : '반영할 변경 없음',
      emrApply: () => this.emrApplyNow()
    };
  }

  // 환자 목록 표 열 순서 (사용자가 끌어서 변경 · 저장)
  static PT_COLS = ['room', 'id', 'name', 'age', 'admit', 'stay', 'recent', 'consent'];
  ptColOrder(s) {
    const c = (s || this.state).ptCols;
    if (!Array.isArray(c)) return Component.PT_COLS.slice();
    const ok = c.filter(k => Component.PT_COLS.indexOf(k) >= 0);
    return ok.concat(Component.PT_COLS.filter(k => ok.indexOf(k) < 0));
  }

  demoKey() { return this.todayIso() + '|미술치료'; }

  // ───── 일지별 사진 다루기 (열린 일지 / 닫힌 일지 구분 없이 정확한 일지에만) ─────
  sessPhotos(key) {
    const s = this.state;
    if (this.curKey(s) === key) return s.photos || [];
    return ((s.sessions || {})[key] || {}).photos || [];
  }
  patchSessPhotos(key, fn) {
    const s = this.state;
    if (this.curKey(s) === key) { this.setState({ photos: fn(s.photos || []) }); return; }
    const ss = Object.assign({}, s.sessions || {});
    const v = Object.assign({ review: [], confirmed: false, photos: [] }, ss[key] || {});
    v.photos = fn(v.photos || []);
    ss[key] = v;
    this._sessDirty = this._sessDirty || {}; this._sessDirty[key] = true;
    this.setState({ sessions: ss });
  }
  allSessionsNow() {
    const s = this.state;
    const sess = Object.assign({}, s.sessions || {});
    sess[this.curKey(s)] = { review: s.review, confirmed: s.confirmed, photos: s.photos };
    return sess;
  }
  // 사진 연결 점검: 서버에 있는데 어느 일지에도 없는 사진 · 여러 일지에 동시에 들어간 사진
  async scanPhotoLinks() {
    const c = this.cloudCfg();
    if (!c) { this.flash('서버 연결이 필요합니다'); return; }
    this.setState({ plScan: 'loading' });
    try {
      const pre = c.ws + ':' + Component.nsKey(Component.WPH_PREFIX);
      const rows = await (await fetch(c.url + '/rest/v1/smartcare_kv?select=k,updated_at&k=like.' + encodeURIComponent(pre + '*'), { headers: this.cloudHeaders(c) })).json();
      const sess = this.allSessionsNow();
      const used = {};
      Object.keys(sess).forEach(k => (sess[k] && sess[k].photos || []).forEach(p => {
        if (!p) return;
        const id = p.id || (typeof p.url === 'string' && p.url.indexOf('wph:') === 0 ? p.url.slice(4) : null);
        if (id) { used[id] = used[id] || []; if (used[id].indexOf(k) < 0) used[id].push(k); }
      }));
      const orphans = (rows || []).map(r => ({ id: r.k.slice(pre.length), at: r.updated_at })).filter(x => !used[x.id]);
      const dups = Object.keys(used).filter(id => used[id].length > 1).map(id => ({ id: id, keys: used[id] }));
      for (const o of orphans.concat(dups)) {
        if (this._wphCache[o.id]) continue;
        try {
          const j = (await (await fetch(c.url + '/rest/v1/smartcare_kv?select=v&k=eq.' + encodeURIComponent(pre + o.id), { headers: this.cloudHeaders(c) })).json())[0];
          if (j && j.v) this._wphCache[o.id] = j.v;
        } catch (e) {}
      }
      this.setState({ plScan: 'done', plOrphans: orphans, plDups: dups, plAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) });
    } catch (e) { this.setState({ plScan: 'error' }); this.flash('사진 점검 실패 — 네트워크를 확인하세요'); }
  }
  // 사진 영구 삭제: 일지에서 뺀 사진 파일을 서버·이 기기에서도 지움 (다른 일지가 같은 사진을 쓰고 있으면 남김)
  async purgePhoto(p, fromKey) {
    const id = p && (p.id || (typeof p.url === 'string' && p.url.indexOf('wph:') === 0 ? p.url.slice(4) : null));
    if (!id) return;
    // 상태 반영 뒤 다른 일지에서 쓰는지 확인
    await new Promise(r => setTimeout(r, 300));
    const sess = this.allSessionsNow();
    const still = Object.keys(sess).some(k => k !== fromKey && (sess[k] && sess[k].photos || []).some(x => x && (x.id === id || x.url === 'wph:' + id)));
    if (still) return;
    await this.deletePhotoFile(id);
  }
  async deletePhotoFile(id) {
    const key = Component.nsKey(Component.WPH_PREFIX + id);
    if (this._wphCache) delete this._wphCache[id];
    if (this._wphSaved) this._wphSaved[id] = true; // 다시 올리지 않음
    if (this._cloudPending) delete this._cloudPending[key];
    try { localStorage.removeItem(key); } catch (e) {}
    const c = this.cloudCfg();
    if (!c) return true;
    try {
      const r = await fetch(c.url + '/rest/v1/smartcare_kv?k=eq.' + encodeURIComponent(c.ws + ':' + key), { method: 'DELETE', headers: this.cloudHeaders(c) });
      return r.ok;
    } catch (e) { return false; }
  }
  // 사진 연결 점검에서 영구 삭제 (사용자가 지운 사진)
  deleteOrphan(id) {
    this.setState({ dialog: {
      title: '이 사진을 영구 삭제할까요?',
      body: '어느 일지에도 연결되지 않은 사진입니다. 서버에서 완전히 지워지며 되돌릴 수 없습니다.',
      cta: '영구 삭제',
      confirm: async () => {
        this.setState({ dialog: null });
        const ok = await this.deletePhotoFile(id);
        this.setState({ plOrphans: (this.state.plOrphans || []).filter(o => o.id !== id) });
        this.flash(ok ? '사진을 영구 삭제했습니다' : '삭제 실패 — 네트워크를 확인하세요');
      }
    } });
  }
  deleteAllOrphans() {
    const list = (this.state.plOrphans || []).slice();
    if (!list.length) return;
    this.setState({ dialog: {
      title: '연결 끊긴 사진 ' + list.length + '장을 모두 영구 삭제할까요?',
      body: '어느 일지에도 연결되지 않은 사진만 지웁니다. 일지에 들어 있는 사진은 건드리지 않습니다. 되돌릴 수 없습니다.',
      cta: '모두 영구 삭제',
      confirm: async () => {
        this.setState({ dialog: null });
        let n = 0;
        for (const o of list) { if (await this.deletePhotoFile(o.id)) n++; }
        this.setState({ plOrphans: [] });
        this.flash('연결 끊긴 사진 ' + n + '장을 영구 삭제했습니다');
      }
    } });
  }

  attachOrphan(id, key) {
    if (!key) { this.flash('연결할 일지를 먼저 고르세요'); return; }
    const url = this._wphCache[id] || ('wph:' + id);
    this._wphSaved[id] = true; // 이미 서버에 있음
    this.patchSessPhotos(key, arr => arr.some(p => p && p.id === id) ? arr : arr.concat([{ id: id, label: '단체사진 ' + (arr.length + 1), pct: 100, url: url, name: '복구한 사진', sk: key }]));
    this.setState({ plOrphans: (this.state.plOrphans || []).filter(o => o.id !== id) });
    const [d, p] = key.split('|');
    this.flash('사진을 ' + d.slice(5).replace('-', '/') + ' ' + p + ' 일지에 연결했습니다');
  }
  detachPhoto(id, key) {
    this.patchSessPhotos(key, arr => arr.filter(p => !(p && (p.id === id || p.url === 'wph:' + id))));
    this.setState({ plDups: (this.state.plDups || []).map(d => d.id === id ? Object.assign({}, d, { keys: d.keys.filter(k => k !== key) }) : d).filter(d => d.keys.length > 1) });
    const [d, p] = key.split('|');
    this.flash(d.slice(5).replace('-', '/') + ' ' + p + ' 일지에서 사진을 뺐습니다 (사진 자체는 다른 일지에 남아 있음)');
  }
  curKey(s) { s = s || this.state; return s.activeSession || this.demoKey(); }

  defaultSession(key) {
    const [date, prog] = key.split('|');
    const md = date.slice(5);
    const rows = (this.state.orgId || 'ORG1') !== 'ORG1' ? [] : BASE_ATTENDANCE.filter(a => a.program === prog && (a.date === md || a.date === date));
    const review = rows.map((a, i) => {
      const id = ORIG_NAME_ID[a.name] || (PATIENTS.find(x => x.name === a.name) || {}).id;
      return id ? { key: 'b' + i + '-' + id, id: id, sim: parseInt(a.sim, 10) || 0, method: a.method } : null;
    }).filter(Boolean);
    return { review: review, confirmed: review.length > 0, photos: [] };
  }

  getSession(key, s) {
    s = s || this.state;
    if (key === this.curKey(s)) return { review: s.review, confirmed: s.confirmed, photos: s.photos };
    return (s.sessions || {})[key] || this.defaultSession(key);
  }

  sessionMetaOf(key, s) {
    s = s || this.state;
    const m = (s.sessionMeta || {})[key];
    if (m) return m;
    return '';
  }

  switchSession(key, extra, meta) {
    const s = this.state;
    const cur = this.curKey(s);
    const patch = Object.assign({}, extra || {});
    if (meta) { const sm = Object.assign({}, s.sessionMeta || {}); sm[key] = meta; patch.sessionMeta = sm; }
    if (key !== cur) {
      // 판독 중에 다른 일지를 열면: 판독 결과는 판독을 시작한 일지에만 저장됨을 안내 (새 일지에는 섞이지 않음)
      if (s.analyzing) { patch.analyzing = false; setTimeout(() => this.flash('판독은 계속됩니다 — 결과는 ' + cur.replace('|', ' ') + ' 일지에만 저장됩니다'), 50); }
      const sessions = Object.assign({}, s.sessions || {});
      sessions[cur] = { review: s.review, confirmed: s.confirmed, photos: s.photos };
      const next = sessions[key] || this.defaultSession(key);
      Object.assign(patch, { sessions: sessions, activeSession: key, review: next.review, confirmed: next.confirmed, photos: next.photos, reviewFailed: false });
    }
    this.setState(patch);
  }

  // 대한민국 공휴일·대체공휴일·법정휴일 (2025~2027)
  holiday(iso) {
    if (!this._holi) {
      const H = {}, add = (t, name, ds) => ds.forEach(d => { H[d] = H[d] ? { t: H[d].t === '대체' ? t : H[d].t, name: H[d].name + '·' + name } : { t: t, name: name }; });
      add('공휴일', '신정', ['2025-01-01', '2026-01-01', '2027-01-01']);
      add('공휴일', '설날', ['2025-01-28', '2025-01-29', '2025-01-30', '2026-02-16', '2026-02-17', '2026-02-18', '2027-02-06', '2027-02-07', '2027-02-08']);
      add('공휴일', '임시공휴일', ['2025-01-27']);
      add('공휴일', '삼일절', ['2025-03-01', '2026-03-01', '2027-03-01']);
      add('법정', '근로자의 날', ['2025-05-01', '2026-05-01', '2027-05-01']);
      add('공휴일', '어린이날', ['2025-05-05', '2026-05-05', '2027-05-05']);
      add('공휴일', '부처님오신날', ['2025-05-05', '2026-05-24', '2027-05-13']);
      add('공휴일', '대통령선거', ['2025-06-03']);
      add('공휴일', '지방선거', ['2026-06-03']);
      add('공휴일', '현충일', ['2025-06-06', '2026-06-06', '2027-06-06']);
      add('공휴일', '광복절', ['2025-08-15', '2026-08-15', '2027-08-15']);
      add('공휴일', '추석', ['2025-10-05', '2025-10-06', '2025-10-07', '2026-09-24', '2026-09-25', '2026-09-26', '2027-09-14', '2027-09-15', '2027-09-16']);
      add('공휴일', '개천절', ['2025-10-03', '2026-10-03', '2027-10-03']);
      add('공휴일', '한글날', ['2025-10-09', '2026-10-09', '2027-10-09']);
      add('공휴일', '성탄절', ['2025-12-25', '2026-12-25', '2027-12-25']);
      add('대체', '대체공휴일', ['2025-03-03', '2025-05-06', '2025-10-08', '2026-03-02', '2026-05-25', '2026-08-17', '2026-10-05', '2027-02-09', '2027-08-16', '2027-10-04', '2027-10-11', '2027-12-27']);
      this._holi = H;
    }
    return this._holi[iso] || null;
  }

  // 날짜 색 규칙: 공휴일·대체·일요일 = 빨강, 토요일 = 파랑, 법정휴일 = 주황
  dayTone(iso, wd) {
    const h = this.holiday(iso);
    if (h && h.t !== '법정') return { color: 'var(--cal-red)', bg: 'var(--cal-red-bg)', name: h.name, kind: h.t };
    if (wd === 0) return { color: 'var(--cal-red)', bg: '', name: h ? h.name : '', kind: h ? '법정' : '' };
    if (h) return { color: 'var(--cal-orange)', bg: '', name: h.name, kind: '법정' };
    if (wd === 6) return { color: 'var(--cal-blue)', bg: '', name: '', kind: '' };
    return { color: '', bg: '', name: '', kind: '' };
  }

  todayIso() {
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  openLogFromPlan(p) {
    const progs = this.state.programs.indexOf(p.program) >= 0 ? null : this.state.programs.concat([p.program]);
    const st = { program: p.program, logDate: p.date, logPlace: p.place, staff: (p.staff || []).slice(), logManual: false };
    if (!(this.state.nlOpen && this.state.device === 'pc')) st.mobileView = 'newLog';
    if (progs) st.programs = progs;
    this.switchSession(p.date + '|' + p.program, st, p.start + (p.end ? '~' + p.end : '') + ' · ' + p.place + ' · ' + (p.staff || []).join(', '));
    this.flash(p.date.slice(5).replace('-', '/') + ' ' + p.program + ' 일정을 불러왔습니다');
  }

  mobileDayVals(s, userName) {
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    const p2 = (n) => String(n).padStart(2, '0');
    const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    const TODAY = this.todayIso();
    const mDay = s.mDay || TODAY;
    const cur = new Date(mDay + 'T00:00:00');
    const start = new Date(cur); start.setDate(cur.getDate() - cur.getDay());
    const plansOn = (d) => (s.plans || []).filter(p => p.date === d && p.status !== '취소');
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    const shift = (n) => { const d = new Date(cur); d.setDate(cur.getDate() + n); this.setState({ mDay: iso(d), logDate: null }); };
    const isToday = mDay === TODAY;
    const n = plansOn(mDay).length;
    const end = days[6];
    return {
      mDay: mDay,
      mDayLabel: (cur.getMonth() + 1) + '월 ' + cur.getDate() + '일 ' + WD[cur.getDay()] + '요일' + (isToday ? ' · 오늘' : ''),
      mDayShort: isToday ? '오늘' : (cur.getMonth() + 1) + '/' + cur.getDate(),
      greeting: userName + '님,\n' + (n ? (isToday ? '오늘 ' : '이 날 ') + n + '건이 있어요' : (isToday ? '오늘은 일정이 없어요' : '이 날은 일정이 없어요')),
      mNotToday: !isToday,
      mGoToday: () => this.setState({ mDay: TODAY, logDate: null }),
      mWeekLabel: (start.getMonth() + 1) + '/' + start.getDate() + ' – ' + (end.getMonth() + 1) + '/' + end.getDate(),
      mWeekPrev: () => shift(-7),
      mWeekNext: () => shift(7),
      onMDay: (e) => { if (e.target.value) this.setState({ mDay: e.target.value, logDate: null }); },
      mWeekDays: days.map((d, i) => {
        const k = iso(d), on = k === mDay, has = plansOn(k).length > 0;
        const t = k === TODAY;
        const tone = this.dayTone(k, d.getDay());
        return {
          wd: t ? '오늘' : (tone.name ? tone.name.split('·')[0].slice(0, 4) : WD[i]), num: d.getDate(), on: on, off: !on,
          numColor: tone.color || 'var(--color-neutral-300)',
          offBorder: t ? 'var(--color-accent)' : 'var(--color-neutral-700)',
          wdColor: t ? 'var(--color-accent-300)' : (tone.color || 'var(--color-neutral-500)'),
          dot: has ? (on ? 'var(--color-accent-200)' : 'var(--color-accent)') : 'transparent',
          pick: () => this.setState({ mDay: k, logDate: null })
        };
      }),
      mDayEmpty: n === 0
    };
  }

  planVals(s) {
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    const wdColor = (i) => i === 0 ? 'var(--cal-red)' : i === 6 ? 'var(--cal-blue)' : 'var(--color-neutral-500)';
    const today = this.planIso(new Date());
    const ym = s.calMonth || today.slice(0, 7);
    const [Y, M] = ym.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(Y, M, 0);
    const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
    const plans = (s.plans || []).slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const byDate = {};
    plans.forEach(p => { (byDate[p.date] = byDate[p.date] || []).push(p); });
    const chipStyle = (st) => st === '완료'
      ? { bg: 'var(--color-neutral-700)', color: 'var(--color-neutral-300)' }
      : st === '취소'
        ? { bg: 'transparent', color: 'var(--color-neutral-600)' }
        : { bg: 'var(--color-accent-800)', color: 'var(--color-accent-100)' };
    const openNew = (date) => this.setState({
      planOpen: true, planErr: '',
      planForm: { id: null, program: s.programs[0] || '', date: date || s.planDay || today, start: '14:00', end: '15:00', place: '프로그램실', ward: '전체', capacity: 12, status: '예정', staff: [this.state.userName || ((s.roster || []).find(m => m.id === s.userId) || {}).name || ''], repeat: '없음', until: '', memo: '' }
    });
    // 캘린더 배경색 (사용자 선택 · 기기별 기억)
    // 캘린더 색조 (4e 톤 그라데이션) — 사용자는 색조만 고르고, 밝기는 라이트/다크 모드에 맞춰 자동
    const CAL_PAL = [
      { name: '기본', h: 280, c: 1 }, { name: '블루', h: 245, c: 1 }, { name: '그린', h: 160, c: 1 },
      { name: '플럼', h: 325, c: 1 }, { name: '웜', h: 65, c: 1 }, { name: '뉴트럴', h: 260, c: 0 }
    ];
    const calBgi = Math.max(0, Math.min(CAL_PAL.length - 1, s.calBgi || 0));
    const CT = CAL_PAL[calBgi];
    const LT = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');
    const ok = (l, c, h) => 'oklch(' + l + ' ' + c + ' ' + h + ')';
    const CBpanel = LT
      ? 'linear-gradient(180deg, ' + ok(0.94, 0.035 * CT.c, CT.h) + ', ' + ok(0.99, 0.006 * CT.c, CT.h) + ' 55%)'
      : 'linear-gradient(180deg, ' + ok(0.30, 0.06 * CT.c, CT.h) + ', ' + ok(0.18, 0.02 * CT.c, CT.h) + ' 55%)';
    const CAL = LT ? {
      text: ok(0.24, 0.03, CT.h), line: 'rgba(20,22,40,0.10)',
      cell: 'rgba(255,255,255,0.78)', weekend: ok(0.955, 0.02 * CT.c, CT.h),
      cellSh: '0 1px 3px rgba(20,22,40,0.10), inset 0 0 0 1px rgba(255,255,255,0.9)',
      sel: ok(0.93, 0.05, 280), ring: ok(0.52, 0.18, 280),
      holiCell: ok(0.965, 0.03, 25), holiBg: ok(0.90, 0.07, 25), holiFg: ok(0.42, 0.16, 25),
      sun: ok(0.52, 0.20, 25), sat: ok(0.48, 0.16, 255),
      todayBg: ok(0.50, 0.18, 280), todayFg: ok(0.99, 0, 0),
      frame: 'linear-gradient(180deg, rgba(255,255,255,0.9), ' + ok(0.86, 0.02, CT.h) + ')', frameSh: '0 14px 34px rgba(20,22,40,0.18)'
    } : {
      text: ok(0.94, 0.01, CT.h), line: 'rgba(0,0,0,0.35)',
      cell: 'rgba(10,12,20,0.35)', weekend: 'rgba(10,12,20,0.5)',
      cellSh: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 2px 5px rgba(0,0,0,0.35)',
      sel: 'rgba(145,132,217,0.18)', ring: 'var(--color-accent)',
      holiCell: ok(0.24, 0.04, 25), holiBg: ok(0.38, 0.10, 25), holiFg: ok(0.92, 0.06, 25),
      sun: ok(0.74, 0.15, 25), sat: ok(0.76, 0.11, 240),
      todayBg: 'var(--color-accent)', todayFg: 'var(--color-bg)',
      frame: 'linear-gradient(180deg, rgba(233,233,237,0.10), rgba(0,0,0,0.25))', frameSh: '0 20px 44px rgba(0,0,0,0.45)'
    };
    const CB = CBpanel, CBhi = 'transparent';
    // 프로그램별 칩 색조 (등록된 프로그램 순서대로)
    const PROG_H = [285, 175, 95, 145, 35, 335, 240];
    const chipHue = (prog) => { const i = (s.programs || []).indexOf(prog); return PROG_H[(i < 0 ? 0 : i) % PROG_H.length]; };
    const BADGE = LT
      ? { '완료': [ok(0.90, 0.07, 150), ok(0.34, 0.10, 150)], '예정': [ok(0.91, 0.05, 245), ok(0.36, 0.11, 250)], '취소': [ok(0.92, 0.01, 260), ok(0.45, 0.02, 260)], '확정': [ok(0.90, 0.07, 150), ok(0.34, 0.10, 150)], '검수': [ok(0.92, 0.09, 85), ok(0.40, 0.10, 70)], '미작성': [ok(0.92, 0.06, 25), ok(0.45, 0.17, 25)] }
      : null;
    const calCells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = this.planIso(d);
      const inMonth = d.getMonth() === M - 1;
      const list = byDate[iso] || [];
      const isSel = s.planDay === iso, isToday = iso === today;
      const tone = this.dayTone(iso, d.getDay());
      calCells.push({
        day: d.getDate(),
        holi: tone.name, hasHoli: !!tone.name,
        holiColor: tone.name ? CAL.holiFg : CAL.text,
        holiBg: tone.name ? CAL.holiBg : 'transparent',
        // 4e: 반투명 칸 · 주말 한 톤 · 공휴일 붉은 톤 (라이트/다크 자동)
        bg: isSel ? CAL.sel : tone.name ? CAL.holiCell : (d.getDay() === 0 || d.getDay() === 6) ? CAL.weekend : CAL.cell,
        ring: (isSel || isToday) ? CAL.cellSh + ', inset 0 0 0 2px ' + CAL.ring : CAL.cellSh,
        color: CAL.text,
        isToday: isToday,
        numBg: isToday ? CAL.todayBg : 'transparent',
        numColor: isToday ? CAL.todayFg : (d.getDay() === 0 || tone.name) ? CAL.sun : d.getDay() === 6 ? CAL.sat : CAL.text,
        numLift: isToday ? 'inset 0 1px 0 rgba(233,233,237,0.35), 0 3px 8px color-mix(in oklch, var(--color-accent) 45%, transparent)' : 'none',
        opacity: inMonth ? '1' : '0.4',
        // 그날 일정을 모두 표시 (숨김 없음 — 칸 높이가 일정 수만큼 늘어남)
        chips: list.slice().sort((a, b) => String(a.start).localeCompare(String(b.start))).map(p => Object.assign({ label: p.program, tip: p.start + '~' + (p.end || '') + ' ' + p.program + (p.place ? ' · ' + p.place : '') }, this.planBadges(p, s), (() => {
          const hh = chipHue(p.program), cancel = p.status === '취소';
          const hov = s.calHover && s.calHover.id === p.id;
          const bd = this.planBadges(p, s);
          const lb = bd.logShort === '확정' ? '확정' : bd.logShort === '검수' ? '검수' : '미작성';
          // 라이트 모드 4a: 프로그램 색으로 진하게 채움 + 흰 굵은 글씨 (흰 글씨 대비 4.5:1 이상 되는 밝기 0.50)
          return Object.assign({
            bg: LT ? 'linear-gradient(180deg, ' + ok(0.54, 0.15, hh) + ', ' + ok(0.48, 0.15, hh) + ')' : 'linear-gradient(180deg, ' + ok(0.40, 0.08, hh) + ', ' + ok(0.31, 0.06, hh) + ')',
            color: LT ? '#ffffff' : ok(0.94, 0.05, hh),
            weight: LT ? '700' : '400',
            op: cancel ? '0.5' : '1', strike: cancel ? 'line-through' : 'none',
            lift: (hov ? '0 0 0 2px ' + CAL.ring + ', ' : '') + (LT ? 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 4px rgba(20,22,40,0.22)' : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 5px rgba(0,0,0,0.4)')
          }, BADGE ? {
            // 배지는 흰 바탕 + 상태 색 글씨 (미작성·검수는 연한 색 바탕으로 더 눈에 띄게)
            progBg: '#ffffff', progFg: BADGE[bd.progLabel][1],
            logBg: lb === '확정' ? '#ffffff' : BADGE[lb][0], logFg: BADGE[lb][1]
          } : {});
        })(), {
          hoverRing: s.calHover && s.calHover.id === p.id ? '0 0 0 1.5px var(--color-accent)' : 'none',
          hoverIn: (e) => {
            clearTimeout(this._hvT);
            // 화면 크기(확대) 적용 중이면 화면 좌표를 페이지 좌표로 환산 — 안 하면 설명창이 엉뚱한 곳에 뜸
            const el = e.currentTarget;
            const z0 = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
            const z = z0 > 0.3 && z0 < 3 ? z0 : 1;
            const rr = el.getBoundingClientRect();
            const r = { left: rr.left / z, right: rr.right / z, top: rr.top / z, bottom: rr.bottom / z };
            const W = 340, H = 470, vw = window.innerWidth / z, vh = window.innerHeight / z;
            // 일정 칸에 거의 붙여 띄워 마우스를 설명창으로 옮기기 쉽게
            const left = r.right + 4 + W <= vw ? r.right + 4 : Math.max(8, r.left - W - 4);
            // 화면 아래쪽 일정은 창의 아래 끝을 일정에 맞춰 띄움 — 창이 항상 일정과 같은 높이에 걸치게
            const low = r.top > vh / 2;
            this.setState({ calHover: { id: p.id, left: left, top: low ? null : Math.max(8, r.top - 8), bottom: low ? Math.max(8, vh - r.bottom - 8) : null } });
          },
          // 바로 닫지 않고 잠시 기다림 — 그 사이 설명창으로 들어가면 유지
          hoverOut: () => {
            clearTimeout(this._hvT);
            this._hvT = setTimeout(() => { if (this.state.calHover && this.state.calHover.id === p.id) this.setState({ calHover: null }); }, 250);
          }
        })),
        hasMore: false, more: '',
        pick: () => this.setState({ planDay: isSel ? null : iso, calMonth: iso.slice(0, 7) }),
        add: () => { this.setState({ planDay: iso }); openNew(iso); }
      });
    }
    const shift = (n) => { const d = new Date(Y, M - 1 + n, 1); this.setState({ calMonth: this.planIso(d).slice(0, 7), planDay: null, planRange: null, plDraftFrom: null, plDraftTo: null, plRangeErr: '' }); };
    const statusF = s.planStatus || '전체';
    const pr = s.planRange;
    // 기간 지정 중 달력 날짜를 누르면 그 기간 안에서 하루만 좁혀 보기 (기간 입력값은 유지)
    const listSrc = plans.filter(p => (s.planDay ? p.date === s.planDay : pr ? (p.date >= pr.from && p.date <= pr.to) : p.date.slice(0, 7) === ym) && (statusF === '전체' || p.status === statusF))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const fmtR = (v) => v.slice(5).replace('-', '.');
    const staffAll = s.roster.filter(m => m.status === '활성' && this.validState(m) === 'active' && m.org === (s.orgId || 'ORG1'));
    const f = s.planForm || {};
    const setF = (k) => (e) => this.setState({ planForm: Object.assign({}, this.state.planForm, { [k]: e.target.value }), planErr: '' });
    const savedW = (s.wardsSaved || s.wards || []).map(w => w.name);
    // 반복 일정 날짜 계산
    const repeatDates = (() => {
      if (!f.date || f.repeat === '없음' || !f.repeat || !f.until || f.until < f.date) return [f.date];
      const out = []; const [y, m, d] = f.date.split('-').map(Number);
      const daily = f.repeat === '매일' || f.repeat === '평일';
      for (let k = 0; k < (daily ? 400 : 60); k++) {
        const dt = f.repeat === '매월' ? new Date(y, m - 1 + k, d) : new Date(y, m - 1, d + k * (daily ? 1 : f.repeat === '격주' ? 14 : 7));
        if (f.repeat === '매월' && dt.getDate() !== d) continue;
        if (f.repeat === '평일' && (dt.getDay() === 0 || dt.getDay() === 6)) continue;
        const iso = this.planIso(dt);
        if (iso > f.until) break;
        out.push(iso);
      }
      return out;
    })();
    const overlap = (date, id) => plans.filter(p => p.id !== id && p.date === date && p.status !== '취소' && p.place === f.place && !(f.end <= p.start || f.start >= p.end));
    const savePlan = () => {
      if (!f.program) { this.setState({ planErr: '프로그램을 선택하세요' }); return; }
      if (!f.date) { this.setState({ planErr: '날짜를 입력하세요' }); return; }
      if (!f.start || !f.end || f.end <= f.start) { this.setState({ planErr: '종료 시간은 시작 시간보다 늦어야 합니다' }); return; }
      if (!f.staff || !f.staff.length) { this.setState({ planErr: '담당자를 1명 이상 선택하세요' }); return; }
      if (f.repeat && f.repeat !== '없음' && (!f.until || f.until <= f.date)) { this.setState({ planErr: '반복 종료일을 시작 날짜 이후로 지정하세요' }); return; }
      // 수정 중 반복을 고르면: 이 일정은 수정하고, 이후 날짜에 같은 일정을 추가로 만듦 (이미 같은 날·같은 프로그램이 있으면 건너뜀)
      const extra = f.id && f.repeat && f.repeat !== '없음' ? repeatDates.filter(d => d !== f.date && !plans.some(p => p.date === d && p.program === f.program && p.status !== '취소')) : [];
      const dates = f.id ? [f.date].concat(extra) : repeatDates;
      const clash = dates.map(d => overlap(d, f.id)).find(x => x.length);
      if (clash) { this.setState({ planErr: clash[0].date + ' ' + clash[0].start + '~' + clash[0].end + ' ' + f.place + '에 "' + clash[0].program + '" 일정이 겹칩니다' }); return; }
      const base = { program: f.program, start: f.start, end: f.end, place: (f.place || '').trim(), ward: f.ward, capacity: Math.max(1, parseInt(f.capacity, 10) || 1), status: f.status, staff: f.staff.slice(), memo: (f.memo || '').trim() };
      let next;
      if (f.id) {
        const series = extra.length ? 'S' + Date.now() : '';
        next = plans.map(p => p.id === f.id ? Object.assign({}, p, base, { date: f.date }, series ? { series: series, repeat: f.repeat } : {}) : p)
          .concat(extra.map((d, i) => Object.assign({ id: 'PL' + Date.now() + '-r' + i, date: d, series: series, repeat: f.repeat }, base, { status: '예정' })));
      } else {
        const series = dates.length > 1 ? 'S' + Date.now() : '';
        next = plans.concat(dates.map((d, i) => Object.assign({ id: 'PL' + Date.now() + '-' + i, date: d, series: series, repeat: dates.length > 1 ? f.repeat : '' }, base)));
      }
      this.savePlans(next);
      this.setState({ planOpen: false, planForm: null, calMonth: f.date.slice(0, 7), planDay: dates.length > 1 ? null : f.date });
      this.flash(f.id ? '일정 수정 저장 — ' + f.date + ' ' + f.program + (extra.length ? ' · ' + f.repeat + ' 반복 ' + extra.length + '건 추가' : '') : (dates.length > 1 ? f.program + ' ' + f.repeat + ' 반복 일정 ' + dates.length + '건 등록' : '일정 등록 — ' + f.date + ' ' + f.start + ' ' + f.program));
    };
    return {
      calTitle: Y + '년 ' + M + '월',
      calPrev: () => shift(-1), calNext: () => shift(1),
      calToday: () => this.setState({ calMonth: today.slice(0, 7), planDay: today }),
      calCells: calCells,
      calBgBase: CB, calBgHi: CBhi,
      calFrame: CAL.frame, calFrameShadow: CAL.frameSh, calText: CAL.text, calLine: CAL.line,
      calWeekdays: WD.map((w, i) => ({ label: w, color: i === 0 ? CAL.sun : i === 6 ? CAL.sat : (LT ? ok(0.45, 0.02, CT.h) : ok(0.72, 0.02, CT.h)) })),
      calPalOpen: !!s.calPalOpen,
      calPalToggle: () => this.setState({ calPalOpen: !s.calPalOpen }),
      calPalette: CAL_PAL.map((p, i) => ({
        name: p.name, sw: 'linear-gradient(90deg, ' + ok(0.92, 0.05 * p.c, p.h) + ' 50%, ' + ok(0.30, 0.06 * p.c, p.h) + ' 50%)', on: i === calBgi,
        bd: i === calBgi ? 'var(--color-accent)' : 'var(--color-neutral-700)',
        go: () => { this.setState({ calBgi: i, calPalOpen: false }); try { localStorage.setItem('smartcare.calBg.v1', String(i)); } catch (e) {} }
      })),
      openPlanNew: () => openNew(),
      planListTitle: s.planDay ? s.planDay.slice(5).replace('-', '월 ') + '일 (' + WD[new Date(s.planDay + 'T00:00').getDay()] + ') 일정' : pr ? (pr.from === pr.to ? fmtR(pr.from) + ' 일정' : fmtR(pr.from) + ' ~ ' + fmtR(pr.to) + ' 일정') : M + '월 일정 계획',
      ...(() => {
        const mFrom = ym + '-01';
        const mTo = ym + '-' + String(new Date(Y, M, 0).getDate()).padStart(2, '0');
        const curF = pr ? pr.from : mFrom, curT = pr ? pr.to : mTo;
        const dF = s.plDraftFrom != null ? s.plDraftFrom : curF;
        const dT = s.plDraftTo != null ? s.plDraftTo : curT;
        const okDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v.slice(0, 4) >= '2000' && v.slice(0, 4) <= '2100';
        const today = this.todayIso();
        const td = new Date(today + 'T00:00:00');
        const iso = (d) => this.planIso(d);
        const wk0 = new Date(td); wk0.setDate(td.getDate() - ((td.getDay() + 6) % 7));
        const wk1 = new Date(wk0); wk1.setDate(wk0.getDate() + 6);
        const tm0 = new Date(td.getFullYear(), td.getMonth(), 1), tm1 = new Date(td.getFullYear(), td.getMonth() + 1, 0);
        const nm0 = new Date(td.getFullYear(), td.getMonth() + 1, 1), nm1 = new Date(td.getFullYear(), td.getMonth() + 2, 0);
        const lm0 = new Date(td.getFullYear(), td.getMonth() - 1, 1), lm1 = new Date(td.getFullYear(), td.getMonth(), 0);
        const r30 = new Date(td); r30.setDate(td.getDate() + 29);
        const apply = (f, t) => this.setState({ planRange: { from: f, to: t }, planDay: null, calMonth: f.slice(0, 7), plDraftFrom: null, plDraftTo: null, plRangeErr: '' });
        // 입력 중(연도 타이핑 등)에는 초안만 바꾸고, 두 날짜가 모두 완성·순서가 맞을 때만 적용
        const tryCommit = (f, t) => {
          if (!okDate(f) || !okDate(t)) { this.setState({ plDraftFrom: f, plDraftTo: t, plRangeErr: '' }); return; }
          if (f > t) { this.setState({ plDraftFrom: f, plDraftTo: t, plRangeErr: '종료일이 시작일보다 빠릅니다 — 날짜를 확인하세요' }); return; }
          apply(f, t);
        };
        const presets = [
          { label: '오늘', f: today, t: today },
          { label: '이번 주', f: iso(wk0), t: iso(wk1) },
          { label: '지난 달', f: iso(lm0), t: iso(lm1) },
          { label: '이번 달', f: iso(tm0), t: iso(tm1) },
          { label: '다음 달', f: iso(nm0), t: iso(nm1) },
          { label: '향후 30일', f: today, t: iso(r30) }
        ];
        return {
          plFrom: dF, plTo: dT,
          onPlFrom: (e) => tryCommit(e.target.value, dT),
          onPlTo: (e) => tryCommit(dF, e.target.value),
          plRangeErr: s.plRangeErr || '',
          plRangeDays: okDate(curF) && okDate(curT) ? Math.round((new Date(curT + 'T00:00:00') - new Date(curF + 'T00:00:00')) / 86400000) + 1 + '일간' : '',
          plPresets: presets.map(p => ({
            label: p.label,
            cls: p.f === curF && p.t === curT && !s.planDay ? 'btn btn-primary' : 'btn btn-secondary',
            go: () => apply(p.f, p.t)
          }))
        };
      })(),
      planRangeSet: !!pr && !s.planDay,
      clearPlanRange: () => this.setState({ planRange: null, planDay: null }),
      planRangeBtn: pr ? pr.from.replace(/-/g, '.') + ' ~ ' + pr.to.replace(/-/g, '.') : '기간 지정',
      planListMeta: listSrc.length + '건 · 예정 ' + listSrc.filter(p => p.status === '예정').length + ' · 완료 ' + listSrc.filter(p => p.status === '완료').length,
      planDaySelected: !!s.planDay,
      clearPlanDay: () => this.setState({ planDay: null }),
      planStatusOpts: ['전체', '예정', '완료', '취소'].map(k => ({ label: k, active: statusF === k, inactive: statusF !== k, go: () => this.setState({ planStatus: k }) })),
      // 3b: 하루 / 기간 전환 — 둘 중 하나만 화면에 보임
      ...(() => {
        const base = plans.filter(p => s.planDay ? p.date === s.planDay : pr ? (p.date >= pr.from && p.date <= pr.to) : p.date.slice(0, 7) === ym);
        const cnt = (k) => k === '전체' ? base.length : base.filter(p => p.status === k).length;
        const dayMode = !!s.planDay;
        const shiftDay = (n) => {
          const d = new Date((s.planDay || today) + 'T00:00:00'); d.setDate(d.getDate() + n);
          const v = this.planIso(d); this.setState({ planDay: v, calMonth: v.slice(0, 7) });
        };
        const dd = new Date((s.planDay || today) + 'T00:00:00');
        const hol = this.holiday(s.planDay || today);
        return {
          plDayMode: dayMode, plRangeMode: !dayMode,
          plCardCols: dayMode ? 'minmax(0, 1fr) auto' : '64px minmax(0, 1fr) auto',
          plModeDayCls: dayMode ? 'on' : 'off', plModeRangeCls: dayMode ? 'off' : 'on',
          plModeDayBg: dayMode ? 'var(--color-accent-900)' : 'transparent', plModeDayBd: dayMode ? 'var(--color-accent)' : 'transparent', plModeDayFg: dayMode ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
          plModeRangeBg: !dayMode ? 'var(--color-accent-900)' : 'transparent', plModeRangeBd: !dayMode ? 'var(--color-accent)' : 'transparent', plModeRangeFg: !dayMode ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
          plGoDay: () => { if (!s.planDay) this.setState({ planDay: today, calMonth: today.slice(0, 7) }); },
          plGoRange: () => { if (s.planDay) this.setState({ planDay: null }); },
          plDayLabel: (dd.getMonth() + 1) + '월 ' + dd.getDate() + '일 (' + WD[dd.getDay()] + ')',
          plDayHoli: hol ? hol.name.split('·')[0] : '', plDayHasHoli: !!hol,
          plDayColor: this.dayTone(s.planDay || today, dd.getDay()).color || 'var(--color-text)',
          plDayPrev: () => shiftDay(-1), plDayNext: () => shiftDay(1),
          plDayToday: () => this.setState({ planDay: today, calMonth: today.slice(0, 7) }),
          plDayIsToday: (s.planDay || today) === today,
          plStatusChips: ['전체', '예정', '완료', '취소'].map(k => ({
            label: k + ' ' + cnt(k), on: statusF === k,
            bg: statusF === k ? 'var(--color-accent-900)' : 'transparent',
            bd: statusF === k ? 'var(--color-accent)' : 'var(--color-neutral-700)',
            fg: statusF === k ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
            go: () => this.setState({ planStatus: k })
          }))
        };
      })(),
      planEmpty: listSrc.length === 0,
      planRows: listSrc.map(p => {
        const dt = new Date(p.date + 'T00:00');
        const bd = this.planBadges(p, s);
        return {
          ...bd,
          md: (dt.getMonth() + 1) + '월', dd: dt.getDate(),
          wd: (() => { const h = this.holiday(p.date); return h ? WD[dt.getDay()] + ' · ' + h.name.split('·')[0] : WD[dt.getDay()]; })(),
          wdColor: this.dayTone(p.date, dt.getDay()).color || wdColor(dt.getDay()),
          program: p.program, status: p.status,
          tagClass: p.status === '예정' ? 'tag tag-accent' : p.status === '완료' ? 'tag tag-neutral' : 'tag tag-outline',
          strike: p.status === '취소' ? 'line-through' : 'none',
          opacity: p.status === '취소' ? '0.6' : '1',
          hasRepeat: !!p.repeat, repeat: p.repeat,
          meta: p.start + '~' + p.end + ' · ' + (p.place || '장소 미정') + ' · ' + (p.ward === '전체' ? '전 병동' : p.ward) + ' · 정원 ' + p.capacity + '명 · 담당 ' + p.staff.join(', '),
          hasMemo: !!p.memo, memo: p.memo,
          canDone: p.status === '예정',
          ...(() => { const li = this.planLogInfo(p, s); return { logActShow: p.status !== '취소', logActLabel: li.label, logActIcon: li.icon, logActCls: li.cls, logAct: li.go }; })(),
          time: p.start, rest: '~' + p.end + ' · ' + (p.place || '장소 미정') + ' · ' + (p.ward === '전체' ? '전 병동' : p.ward) + ' · 정원 ' + p.capacity + '명 · ' + p.staff.join(', '),
          barColor: (() => { const PH = ['oklch(0.72 0.14 285)', 'oklch(0.74 0.12 175)', 'oklch(0.80 0.13 95)', 'oklch(0.76 0.13 145)', 'oklch(0.74 0.14 35)', 'oklch(0.74 0.13 335)', 'oklch(0.74 0.11 240)']; const i = (s.programs || []).indexOf(p.program); return PH[(i < 0 ? 0 : i) % PH.length]; })(),
          done: () => { this.savePlans((this.state.plans || []).map(x => x.id === p.id ? Object.assign({}, x, { status: '완료' }) : x)); this.flash(p.program + ' 완료 처리'); },
          edit: () => this.setState({ planOpen: true, planErr: '', planForm: Object.assign({}, p, { staff: p.staff.slice(), repeat: '없음', until: '' }) })
        };
      }),
      planOpen: !!s.planOpen,
      planWin: this.winVals('plan', '620px'),
      // 창을 끌다가 바탕에서 놓아도 닫히지 않게
      closePlan: () => { if (this._winDragged) return; this.setState({ planOpen: false, planForm: null }); },
      planDlgTitle: f.id ? '일정 수정' : '프로그램 일정 등록',
      pf: {
        program: f.program, date: f.date, start: f.start, end: f.end, place: f.place, ward: f.ward, capacity: f.capacity, status: f.status, repeat: f.repeat, until: f.until, memo: f.memo,
        onProgram: setF('program'), onDate: setF('date'), onStart: setF('start'), onEnd: setF('end'), onPlace: setF('place'),
        onWard: setF('ward'), onCapacity: setF('capacity'), onStatus: setF('status'), onRepeat: setF('repeat'), onUntil: setF('until'), onMemo: setF('memo'),
        programOpts: s.programs.indexOf(f.program) >= 0 || !f.program ? s.programs : s.programs.concat([f.program]),
        wardOpts: ['전체'].concat(savedW),
        staffOpts: staffAll.map(m => {
          const on = (f.staff || []).indexOf(m.name) >= 0;
          return {
            name: m.name, type: m.type, icon: on ? 'ph ph-check-circle' : 'ph ph-circle',
            bg: on ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
            color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
            shadow: on ? '0 0 0 1px var(--color-accent), 0 2px 6px rgba(0,0,0,0.35)' : '0 0 0 1px var(--color-neutral-700), 0 1px 2px rgba(0,0,0,0.3)',
            toggle: () => {
              const cur = (this.state.planForm.staff || []);
              const nx = on ? cur.filter(x => x !== m.name) : cur.concat([m.name]);
              this.setState({ planForm: Object.assign({}, this.state.planForm, { staff: nx }), planErr: '' });
            }
          };
        }),
        isNew: !f.id, isEdit: !!f.id,
        repeating: !!(f.repeat && f.repeat !== '없음'),
        showRepeat: true,
        repeatLabel: f.id ? '반복 (이 날짜 이후로 같은 일정 추가)' : '반복',
        repeatPreview: f.until && f.until >= f.date ? f.repeat + ' 반복 · 총 ' + repeatDates.length + '건 (' + repeatDates[0] + ' ~ ' + repeatDates[repeatDates.length - 1] + ')' : '반복 종료일을 지정하세요',
        hasError: !!s.planErr, error: s.planErr,
        saveLabel: f.id ? '수정 저장' : '일정 등록',
        save: savePlan,
        canLog: !!f.id && f.status !== '취소',
        logLabel: (() => {
          if (!f.id) return '';
          const ss = this.getSession(f.date + '|' + f.program, s);
          if (ss && ss.confirmed) return '일지 보기';
          if (ss && ((ss.photos || []).some(p => p.url) || (ss.review || []).length)) return '일지 이어서 작성';
          return '일지 등록';
        })(),
        writeLog: () => {
          if (!f.id) return;
          if (f.status === '취소') { this.flash('취소된 일정은 일지를 등록할 수 없습니다'); return; }
          const orig = (this.state.plans || []).find(p => p.id === f.id) || f;
          const changed = ['program', 'date', 'start', 'end', 'place'].some(k => (orig[k] || '') !== (f[k] || ''));
          const p = changed ? orig : f;
          this.setState({ planOpen: false, planForm: null, planErr: '', nlOpen: true, logManual: false });
          this.openLogFromPlan(p);
          this.flash((changed ? '저장 전 변경 내용은 반영되지 않았습니다 — ' : '') + p.date.slice(5).replace('-', '/') + ' ' + p.start + ' ' + p.program + ' 일지 등록');
        },
        remove: () => {
          const sameSeries = f.series ? (this.state.plans || []).filter(p => p.series === f.series && p.date >= f.date && p.id !== f.id).length : 0;
          this.setState({
            planOpen: false,
            dialog: {
              title: f.program + ' 일정을 삭제할까요?',
              body: f.date + ' ' + f.start + '~' + f.end + (sameSeries ? ' · 같은 반복 일정의 이후 ' + sameSeries + '건은 유지됩니다. 하루만 빠지는 경우 상태를 "취소"로 바꾸는 것을 권장합니다.' : ' · 삭제한 일정은 복구할 수 없습니다. 기록을 남기려면 상태를 "취소"로 바꾸세요.'),
              cta: '삭제',
              confirm: () => { this.savePlans((this.state.plans || []).filter(p => p.id !== f.id)); this.setState({ dialog: null, planForm: null }); this.flash('일정 삭제 — ' + f.date + ' ' + f.program); }
            }
          });
        }
      }
    };
  }

  allowedPc(role) {
    if (role === '보조') return null;
    if (role === '조회') return 'stats';
    return 'patients';
  }

  renderVals() {
    const s = this.state;
    const threshold = s.threshold == null ? (this.props.threshold ?? 90) : s.threshold;
    const roleOfId = { '관리자': 1, '담당자': 2, '보조': 3, '조회': 5 };
    const me = s.roster.find(m => m.id === s.userId)
      || s.roster.find(m => (Array.isArray(m.roles) ? m.roles : [m.role]).indexOf(s.role) >= 0)
      || s.roster[1] || { name: '사용자', roles: ['조회'] };
    const userName = me.name;
    const myRoles = Array.isArray(me.roles) ? me.roles : [me.role];
    const isSys = myRoles.indexOf('시스템관리자') >= 0;
    const hasRole = (r) => myRoles.indexOf(r) >= 0 || (isSys && (r === '관리자' || r === '담당자'));
    const orgIdCur = s.orgId || 'ORG1';
    const homeOrg = orgIdCur === 'ORG1';
    const orgName = (s.orgs.find(o => o.id === orgIdCur) || {}).name || '';
    const staffOrg = isSys ? (s.staffOrg && s.orgs.some(o => o.id === s.staffOrg) ? s.staffOrg : orgIdCur) : (me.org && me.org !== '*' ? me.org : orgIdCur);
    const staffOrgName = (s.orgs.find(o => o.id === staffOrg) || {}).name || '';
    const canManageStaff = isSys || (myRoles.indexOf('관리자') >= 0 && me.org === staffOrg);
    const orgRoster = s.roster.filter(m => m.org === staffOrg);

    // 명부 필터
    const filtered = PATIENTS.filter(p =>
      (s.search === '' || p.name.indexOf(s.search) >= 0 || (p.chartNo && String(p.chartNo).indexOf(s.search.trim()) >= 0)) &&
      (!(s.wardSel || []).length || (s.wardSel || []).some(w => p.room.indexOf(w + ' ') === 0)) &&
      ((s.stayFilter || '전체') === '전체' || (p.stay || '재원') === s.stayFilter) &&
      (!s.pendingOnly || p.consent !== '동의') &&
      (!s.noPhotoOnly || !(s.photoUrls[p.id] || p.photo))
    );
    const sortKey = s.sortKey || 'room';
    const sortDir = s.sortDir === 'desc' ? -1 : 1;
    const lastOf = (p) => { const m = String(p.last || '').match(/(\d{2})-(\d{2})/); return m ? m[1] + m[2] : '0000'; };
    const cmp = {
      room: (a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko'),
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      // 등록번호 = EMR 차트번호 (없는 환자는 뒤로)
      id: (a, b) => (a.chartNo ? 0 : 1) - (b.chartNo ? 0 : 1) || String(a.chartNo || '').localeCompare(String(b.chartNo || ''), 'ko', { numeric: true }),
      age: (a, b) => (a.age || 0) - (b.age || 0),
      // 입원일 없는 환자는 뒤로
      admit: (a, b) => (a.admitDate ? 0 : 1) - (b.admitDate ? 0 : 1) || String(a.admitDate || '').localeCompare(String(b.admitDate || '')),
      recent: (a, b) => lastOf(b).localeCompare(lastOf(a)),
      stay: (a, b) => (a.stay || '재원').localeCompare(b.stay || '재원', 'ko')
    }[sortKey] || ((a, b) => 0);
    // 값이 없는 환자(입원일·등록번호 없음)는 오름차순·내림차순 모두 맨 뒤
    const missingOf = { admit: (p) => !p.admitDate, id: (p) => !p.chartNo }[sortKey];
    filtered.sort((a, b) => {
      if (missingOf) { const ma = missingOf(a), mb = missingOf(b); if (ma !== mb) return ma ? 1 : -1; }
      return cmp(a, b) * sortDir;
    });
    const per = [10, 20, 50, 100].indexOf(s.perPage) >= 0 ? s.perPage : 20;
    const pageCount = Math.max(1, Math.ceil(filtered.length / per));
    const page = Math.min(s.page, pageCount - 1);
    const pageItems = filtered.slice(page * per, page * per + per);

    const sel = this.patient(s.sel);
    // 참여 이력 = 확정된 모든 일지에서 이 환자가 들어 있는 기록 (서버에 저장된 실제 일지 기준)
    const history = (() => {
      if (!sel || !sel.id) return [];
      const all = this.allSessionsNow();
      const out = [];
      Object.keys(all).forEach(k => {
        const v = all[k];
        if (!v || !v.confirmed) return;
        const [d, prog] = k.split('|');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
        const dup = this.dupInfo(v.review || []);
        const r = (v.review || []).find(x => x && x.id === sel.id && !dup[x.key]);
        if (!r) return;
        const meta = (s.sessionMeta || {})[k] || {};
        out.push({
          program: prog, date: d.replace(/-/g, '.'), sortKey: d,
          by: (r.method || '').indexOf('수기') >= 0 ? '수기' : 'AI 인식' + (r.sim ? ' ' + r.sim + '%' : ''),
          staff: meta.staff || ''
        });
      });
      // 예전 데이터(HISTORY)가 있으면 함께 표시
      (HISTORY[sel.id] || []).forEach(h => { if (!out.some(o => o.program === h.program && o.date === h.date)) out.push(h); });
      return out.sort((a, b) => String(b.sortKey || b.date).localeCompare(String(a.sortKey || a.date)));
    })();

    // 생년월일 → 만 나이
    const now = new Date();
    const pad2 = (n) => (n < 10 ? '0' : '') + n;
    const todayIso = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    const birthAge = (() => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.formBirth || '');
      if (!m) return null;
      const y = +m[1], mo = +m[2], d = +m[3];
      const b = new Date(y, mo - 1, d);
      if (b.getFullYear() !== y || b.getMonth() !== mo - 1 || b > now || y < 1900) return null;
      let age = now.getFullYear() - y;
      if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
      return age;
    })();

    // 병동 · 호실 검색 추천
    const norm = (t) => (t || '').replace(/\s/g, '').toLowerCase();
    const score = (label, q) => {
      const L = norm(label), Q = norm(q);
      if (!Q) return 3;
      if (L === Q) return 0;
      if (L.indexOf(Q) === 0) return 1;
      if (L.indexOf(Q) > 0) return 2;
      return -1;
    };
    // 설정에 등록된 전체 목록을 항상 보여주고, 검색어와 관련된 항목을 위로 정렬
    const ranked = (items, q, labelOf) => items
      .map((it, i) => { const sc = score(labelOf(it), q); return { it: it, sc: sc < 0 ? 9 : sc, i: i }; })
      .sort((a, b) => a.sc - b.sc || a.i - b.i)
      .map(x => Object.assign({ _match: x.sc < 9 }, x.it));
    const savedWards = s.wardsSaved || s.wards;
    const selWard = savedWards.find(w => norm(w.name) === norm(s.formWard));
    const selWardRoom = selWard ? selWard.rooms.find(r => norm(r) === norm(s.formRoom) && ((selWard.off || []).indexOf(r) < 0 || (s.formMode === 'edit' && (this.patient(s.sel) || {}).room === selWard.name + ' ' + r))) : null;
    const wardMatches = ranked(savedWards, s.formWard, w => w.name);
    const isOn = (w, r) => (w.off || []).indexOf(r) < 0;
    const roomPool = selWard
      ? selWard.rooms.filter(r => isOn(selWard, r)).map(r => ({ ward: selWard.name, room: r }))
      : [].concat.apply([], savedWards.map(w => w.rooms.filter(r => isOn(w, r)).map(r => ({ ward: w.name, room: r }))));
    const roomMatches = ranked(roomPool, s.formRoom, x => x.room + x.ward);
    const occupants = (label) => PATIENTS.filter(p => p.room === label).length;
    const pickWard = (w) => (e) => {
      if (e && e.preventDefault) e.preventDefault();
      const keepRoom = w.rooms.some(r => norm(r) === norm(s.formRoom));
      this.setState({ formWard: w.name, formRoom: keepRoom ? s.formRoom : '', comboOpen: keepRoom ? null : 'room' });
    };
    const pickRoom = (x) => (e) => {
      if (e && e.preventDefault) e.preventDefault();
      this.setState({ formWard: x.ward, formRoom: x.room, comboOpen: null });
    };

    // 설정: 병동 관리
    const fixWard = (t) => { const v = (t || '').trim(); return /^\d+$/.test(v) ? v + '병동' : v; };
    const fixRoom = (t) => { const v = (t || '').trim(); return /^\d+$/.test(v) ? v + '호' : v; };
    const savedNameOf = (w) => { const o = savedWards.find(x => x.id === w.id); return o ? o.name : w.name; };
    const wardInUseRaw = (name) => PATIENTS.filter(p => p.room.indexOf(name + ' ') === 0).length;
    const wardInUse = (name) => { const w = s.wards.find(x => x.name === name); return wardInUseRaw(w ? savedNameOf(w) : name); };
    const wardsDirty = JSON.stringify(s.wards) !== JSON.stringify(savedWards);
    const changeCount = (() => {
      let n = 0;
      s.wards.forEach((w, i) => {
        const o = savedWards.find(x => x.id === w.id);
        if (!o) { n++; return; }
        if (o.name !== w.name) n++;
        if (savedWards.indexOf(o) !== i) n++;
        n += w.rooms.filter(r => o.rooms.indexOf(r) < 0).length + o.rooms.filter(r => w.rooms.indexOf(r) < 0).length;
        const a = w.off || [], b = o.off || [];
        n += a.filter(r => b.indexOf(r) < 0).length + b.filter(r => a.indexOf(r) < 0).length;
      });
      n += savedWards.filter(o => !s.wards.some(w => w.id === o.id)).length;
      return n;
    })();
    const saveWards = () => {
      const renames = [];
      s.wards.forEach(w => { const o = savedWards.find(x => x.id === w.id); if (o && o.name !== w.name) renames.push({ from: o.name, to: w.name }); });
      PATIENTS.forEach(p => renames.forEach(r => { if (p.room.indexOf(r.from + ' ') === 0) p.room = r.to + p.room.slice(r.from.length); }));
      const snap = JSON.parse(JSON.stringify(s.wards));
      const fix = (v) => { const r = renames.find(x => x.from === v); return r ? r.to : v; };
      this.setState({ wardsSaved: snap, ward: fix(s.ward), formWard: fix(s.formWard), dialog: null });
      try { localStorage.setItem('smartcare.wards.v1', JSON.stringify(snap)); } catch (e) {}
      this.flash('병동 · 호실 저장 완료 — 변경 ' + changeCount + '건이 환자 등록·명부에 반영되었습니다');
    };
    const revertWards = () => {
      this.setState({ wards: JSON.parse(JSON.stringify(savedWards)), editingWard: null, wardDraft: '', roomDrafts: {}, dialog: null });
      this.flash('저장하지 않은 변경을 되돌렸습니다');
    };
    const guardLeave = (go) => {
      if (s.pcView === 'settings' && s.setTab === 'ward' && wardsDirty) {
        this.setState({
          dialog: {
            title: '저장하지 않은 변경이 있습니다',
            body: '병동 · 호실 변경 ' + changeCount + '건이 아직 저장되지 않았습니다. 저장하지 않고 나가면 변경 내용이 사라집니다.',
            cta: '저장 안 하고 나가기',
            confirm: () => { this.setState({ wards: JSON.parse(JSON.stringify(savedWards)), editingWard: null, dialog: null }); go(); }
          }
        });
        return;
      }
      go();
    };
    const setWards = (wards) => this.setState({ wards: wards });
    const moveWard = (from, to) => {
      if (to < 0 || to >= this.state.wards.length || from === to) return;
      const list = this.state.wards.slice();
      const item = list.splice(from, 1)[0];
      list.splice(to, 0, item);
      this.setState({ wards: list, dragWard: null, dragOverWard: null });
      this.flash(item.name + ' 위치 이동 — ' + (to + 1) + '번째');
    };
    const wardRows = s.wards.map((w, idx) => {
      const used = wardInUse(w.name);
      const dragging = s.dragWard === w.id;
      const over = s.dragOverWard === w.id && s.dragWard !== null && !dragging;
      const posMeta = {
        order: idx + 1,
        isFirst: idx === 0, isLast: idx === s.wards.length - 1,
        up: () => moveWard(idx, idx - 1),
        down: () => moveWard(idx, idx + 1),
        shadow: over ? '0 0 0 2px var(--color-accent), var(--shadow-md)' : 'var(--shadow-sm)',
        opacity: dragging ? '0.45' : '1',
        dragStart: (e) => {
          const tag = e.target && e.target.tagName;
          if (tag === 'INPUT' || tag === 'BUTTON') { e.preventDefault(); return; }
          if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(w.id)); }
          this.setState({ dragWard: w.id });
        },
        dragOver: (e) => {
          if (this.state.dragWard === null) return;
          e.preventDefault();
          if (this.state.dragOverWard !== w.id) this.setState({ dragOverWard: w.id });
        },
        drop: (e) => {
          e.preventDefault();
          const from = this.state.wards.findIndex(x => x.id === this.state.dragWard);
          if (from >= 0) moveWard(from, idx);
          else this.setState({ dragWard: null, dragOverWard: null });
        },
        dragEnd: () => this.setState({ dragWard: null, dragOverWard: null })
      };
      const addRoom = () => {
        const v = fixRoom(s.roomDrafts[w.id]);
        if (!v) { this.flash('호실을 입력하세요'); return; }
        if (w.rooms.indexOf(v) >= 0) { this.flash(w.name + '에 ' + v + '가 이미 있습니다'); return; }
        const rooms = w.rooms.concat([v]).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
        const d = Object.assign({}, s.roomDrafts); d[w.id] = '';
        this.setState({ wards: s.wards.map(x => x.id === w.id ? Object.assign({}, x, { rooms: rooms }) : x), roomDrafts: d });
        this.flash(w.name + ' ' + v + ' 추가');
      };
      const rename = () => {
        const next = fixWard(s.wardDraft);
        if (!next) { this.flash('병동 이름을 입력하세요'); return; }
        if (next !== w.name && s.wards.some(x => x.name === next)) { this.flash('이미 있는 병동입니다'); return; }
        this.setState({
          wards: s.wards.map(x => x.id === w.id ? Object.assign({}, x, { name: next }) : x),
          editingWard: null, wardDraft: ''
        });
        if (next !== w.name) this.flash('"' + w.name + '" → "' + next + '" — [저장]을 누르면 환자 병실 정보 ' + used + '건도 함께 바뀝니다');
      };
      return {
        ...posMeta,
        name: w.name,
        meta: '호실 ' + w.rooms.length + '개 · 환자 ' + used + '명',
        editing: s.editingWard === w.id, viewing: s.editingWard !== w.id,
        draft: s.wardDraft,
        onDraft: (e) => this.setState({ wardDraft: e.target.value }),
        renameKey: (e) => { if (e.key === 'Enter') rename(); },
        edit: () => this.setState({ editingWard: w.id, wardDraft: w.name }),
        cancel: () => this.setState({ editingWard: null, wardDraft: '' }),
        save: rename,
        remove: () => {
          if (used > 0) { this.flash(w.name + '에 환자 ' + used + '명이 배정되어 있어 삭제할 수 없습니다'); return; }
          this.setState({
            dialog: {
              title: w.name + '을(를) 삭제할까요?',
              body: '호실 ' + w.rooms.length + '개가 함께 삭제됩니다. 배정된 환자는 없습니다.',
              cta: '삭제',
              confirm: () => { setWards(this.state.wards.filter(x => x.id !== w.id)); this.setState({ dialog: null }); this.flash(w.name + ' 삭제'); }
            }
          });
        },
        rooms: w.rooms.map(r => {
          const n = occupants(savedNameOf(w) + ' ' + r);
          const off = (w.off || []).indexOf(r) >= 0;
          return {
            label: r, meta: n > 0 ? n + '명' : '',
            bg: off ? 'transparent' : 'var(--color-neutral-900)',
            ring: off ? '0 0 0 1px var(--color-neutral-800)' : '0 0 0 1px var(--color-neutral-700)',
            color: off ? 'var(--color-neutral-600)' : 'var(--color-text)',
            deco: off ? 'line-through' : 'none',
            toggleLabel: off ? '비활성' : '활성',
            toggleIcon: off ? 'ph ph-toggle-left' : 'ph-fill ph-toggle-right',
            toggleTip: off ? '비활성 상태 — 눌러서 활성으로' : '활성 상태 — 눌러서 비활성으로',
            toggleBg: off ? 'var(--color-neutral-800)' : 'var(--color-accent-800)',
            toggleColor: off ? 'var(--color-neutral-500)' : 'var(--color-accent-200)',
            toggle: () => {
              this.setState({ wards: this.state.wards.map(x => {
                if (x.id !== w.id) return x;
                const cur = x.off || [];
                return Object.assign({}, x, { off: off ? cur.filter(y => y !== r) : cur.concat([r]) });
              }) });
              this.flash(w.name + ' ' + r + (off ? ' 활성화' : ' 비활성화 — 신규 배정 목록에서 제외') + ' · 저장을 눌러 반영하세요');
            },
            remove: () => {
              if (n > 0) { this.flash(w.name + ' ' + r + '에 환자 ' + n + '명이 있어 삭제할 수 없습니다'); return; }
              this.setState({ wards: this.state.wards.map(x => x.id === w.id ? Object.assign({}, x, { rooms: x.rooms.filter(y => y !== r) }) : x) });
              this.flash(w.name + ' ' + r + ' 삭제');
            }
          };
        }),
        roomDraft: s.roomDrafts[w.id] || '',
        onRoomDraft: (e) => { const d = Object.assign({}, s.roomDrafts); d[w.id] = e.target.value; this.setState({ roomDrafts: d }); },
        roomKey: (e) => { if (e.key === 'Enter') addRoom(); },
        addRoom: addRoom
      };
    });
    const addWard = () => {
      const v = fixWard(s.newWard);
      if (!v) { this.flash('병동 이름을 입력하세요'); return; }
      if (s.wards.some(w => w.name === v)) { this.flash('이미 있는 병동입니다'); return; }
      const id = s.wards.reduce((m, w) => Math.max(m, w.id), 0) + 1;
      this.setState({ wards: s.wards.concat([{ id: id, name: v, rooms: [] }]), newWard: '' });
      this.flash(v + ' 추가 — 호실을 등록하세요');
    };

    const mToday = this.todayIso();
    const mDay = s.mDay || mToday;
    const mIsDemoDay = mDay === mToday;
    const mDayPlans = (s.plans || []).filter(p => p.date === mDay && p.status !== '취소').sort((a, b) => a.start.localeCompare(b.start));
    const logDayPlans = (s.plans || []).filter(p => p.date === (s.logDate || mDay) && p.status !== '취소').sort((a, b) => a.start.localeCompare(b.start));
    const dupMap = this.dupInfo(s.review);
    const dupName = (o) => o.id ? this.patient(o.id).name : '미확인 인물 ' + o.n;
    const reviewRows = s.review.map(r => {
      const unknown = !r.id;
      const p = unknown ? null : this.patient(r.id);
      const name = unknown ? '미확인 인물 ' + r.n : p.name;
      const low = !unknown && r.sim !== 0 && r.sim < threshold;
      const dupOf = dupMap[r.key];
      const lkOn = s.lkKey === r.key;
      return {
        pickLink: (e) => {
          // 버튼(환자 지정 · 제외 등)을 누른 경우는 선택하지 않음
          if (e && e.target && e.target.closest && e.target.closest('button')) return;
          this.setState({ lkKey: this.state.lkKey === r.key ? null : r.key });
        },
        linkBg: lkOn ? 'color-mix(in oklab, #ffd43b 14%, var(--color-surface))' : 'var(--color-surface)',
        linkShadow: lkOn ? '0 0 0 2px #e0b400, var(--shadow-sm)' : ((low || unknown) ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)'),
        isDup: !!dupOf, notDup: !dupOf,
        dupNote: dupOf ? '중복 인물 — ' + dupName(dupOf) + '님과 같은 얼굴 · 출석부에 반영되지 않음' : '',
        dupRemove: () => {
          this.setState({ review: this.state.review.filter(x => x.key !== r.key), confirmed: false });
          this.flash('중복 인물 제외 — ' + name);
        },
        name: name, room: unknown ? '' : p.room, method: r.method,
        simLabel: r.sim === 0 ? '수기' : r.sim + '%',
        isUnknown: unknown, isKnown: !unknown,
        low: low, high: !unknown && !low,
        hasFace: !!r.crop || (!unknown && !!s.photoUrls[r.id]),
        noFace: !r.crop && (unknown || !s.photoUrls[r.id]),
        faceEl: (!r.crop && !unknown && s.photoUrls[r.id]) ? React.createElement('button', {
          onClick: () => this.setState({ zoom: { url: s.photoUrls[r.id], title: name + ' — 등록된 증명사진', meta: r.method + ' · 현장사진 얼굴 없이 수기 추가됨' } }),
          title: '등록된 증명사진 크게 보기',
          style: { width: '100%', height: '100%', padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block' }
        }, this.img(s.photoUrls[r.id], name + ' 증명사진')) : r.crop ? React.createElement('button', {
          onClick: () => this.setState({ zoom: { url: r.crop, title: name + ' — 업로드 사진에서 검출된 얼굴', meta: r.method + (unknown ? ' · [환자 지정]으로 명부와 연결하세요' : ' · 오른쪽 아래 작은 사진이 등록된 증명사진입니다') } }),
          title: '크게 보기',
          style: { position: 'relative', width: '100%', height: '100%', padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block' }
        }, this.img(r.crop, name + ' 얼굴'),
          (!unknown && (r.ref || s.photoUrls[r.id])) ? React.createElement('span', {
            title: '등록된 증명사진',
            style: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 2px var(--color-surface)' }
          }, this.img(r.ref || s.photoUrls[r.id], name + ' 증명사진')) : null
        ) : null,
        shadow: (low || unknown) ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
        assign: () => this.setState({ addOpen: true, assignKey: r.key }),
        ask: () => this.setState({
          dialog: {
            title: name + '을(를) 참여자에서 제외할까요?',
            body: unknown
              ? '프로그램 참여자가 아닌 사람(직원·보호자 등)이면 제외하세요.'
              : 'AI가 잘못 인식한 경우에만 제외하세요. 제외 내역은 이력에 기록되며, 확정 전까지 다시 추가할 수 있습니다.',
            cta: '제외',
            confirm: () => {
              this.setState({ review: this.state.review.filter(x => x.key !== r.key), confirmed: false, dialog: null });
              this.flash(name + ' 제외 — 실인원수 재계산');
            }
          }
        })
      };
    });

    // 확정된 일지의 실제 날짜 (세션 키 '날짜|프로그램' → 없으면 일지 날짜 → 오늘)
    const sessKeyDate = (s.activeSession || '').split('|')[0];
    const confirmedDate = /^\d{4}-\d{2}-\d{2}$/.test(sessKeyDate) ? sessKeyDate : (s.logDate || this.todayIso());
    // 출석부 = 확정된 모든 일지 (현재 열린 일지는 최신 화면 상태로 대체)
    const allSess = Object.assign({}, s.sessions || {});
    if (s.activeSession) allSess[s.activeSession] = Object.assign({}, allSess[s.activeSession] || {}, { review: s.review, confirmed: s.confirmed });
    const sessAttendance = [];
    Object.keys(allSess).forEach(key => {
      const ss = allSess[key];
      if (!ss || !ss.confirmed) return;
      const [d, prog] = key.split('|');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
      const dupK = this.dupInfo(ss.review), seenId = {};
      (ss.review || []).filter(r => r.id && !dupK[r.key] && !(seenId[r.id] = seenId[r.id] ? 2 : 0)).forEach(r => {
        seenId[r.id] = 1;
        const p = PATIENTS.find(x => x.id === r.id);
        if (!p) return;
        sessAttendance.push({ name: p.name, room: p.room, sexAge: p.sex + ' ' + p.age, program: prog || s.program, date: d, method: (r.method || '').indexOf('수기') >= 0 ? '수기추가' : 'AI자동', sim: r.sim === 0 ? '—' : r.sim + '%' });
      });
    });
    const attendance = sessAttendance.length || !s.confirmed
      ? sessAttendance.concat((s.orgId || 'ORG1') === 'ORG1' ? BASE_ATTENDANCE : [])
      : s.review.filter(r => r.id).map(r => {
          const p = this.patient(r.id);
          return { name: p.name, room: p.room, sexAge: p.sex + ' ' + p.age, program: s.program, date: confirmedDate.slice(5), method: r.method.indexOf('수기') >= 0 ? '수기추가' : 'AI자동', sim: r.sim === 0 ? '—' : r.sim + '%' };
        }).concat((s.orgId || 'ORG1') === 'ORG1' ? BASE_ATTENDANCE : []);

    // 출석부 기간 · 프로그램 필터
    const _t0 = new Date(), _iso0 = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const ATT_DEF_FROM = _iso0(new Date(_t0.getFullYear(), _t0.getMonth(), 1)), ATT_DEF_TO = _iso0(new Date(_t0.getFullYear(), _t0.getMonth() + 1, 0));
    const attFrom = s.attFrom || ATT_DEF_FROM, attTo = s.attTo || ATT_DEF_TO;
    const attProgram = s.attProgram || '전체';
    const fullDate = (d) => (/^\d{4}-/.test(d) ? d.slice(0, 10) : '2026-' + d);
    const attPrograms = s.programs.concat(attendance.map(a => a.program).filter(p => s.programs.indexOf(p) < 0))
      .filter((p, i, arr) => arr.indexOf(p) === i);
    const attPatient = s.attPatient || '전체';
    const attMode = attPatient !== '전체' ? 'row' : (s.attMode || 'row');
    const attBase = attendance.filter(a => {
      const d = fullDate(a.date);
      return d >= attFrom && d <= attTo && (attProgram === '전체' || a.program === attProgram)
        && ((s.attWard || '전체') === '전체' || String(a.room || '').indexOf(s.attWard + ' ') === 0);
    });
    const wardOfRoom = (r) => String(r || '').split(' ')[0] || '미지정';
    const attWardGroupsRaw = [];
    attBase.forEach(a => {
      const w = wardOfRoom(a.room);
      let g = attWardGroupsRaw.find(x => x.ward === w);
      if (!g) { g = { ward: w, rows: [] }; attWardGroupsRaw.push(g); }
      g.rows.push(a);
    });
    const wardOrder = (s.wards || []).map(w => w.name);
    attWardGroupsRaw.sort((a, b) => { const ia = wardOrder.indexOf(a.ward), ib = wardOrder.indexOf(b.ward); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.ward.localeCompare(b.ward, 'ko', { numeric: true }); });
    const attView = attBase.filter(a => attPatient === '전체' || a.name === attPatient);
    const attGroupsRaw = [];
    attBase.forEach(a => {
      let g = attGroupsRaw.find(x => x.name === a.name);
      if (!g) { g = { name: a.name, room: a.room, sexAge: a.sexAge, rows: [] }; attGroupsRaw.push(g); }
      g.rows.push(a);
    });
    attGroupsRaw.sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'ko'));
    const progCount = (rows) => {
      const m = {};
      rows.forEach(r => { m[r.program] = (m[r.program] || 0) + 1; });
      return Object.keys(m).map(k => ({ name: k, count: m[k] })).sort((a, b) => b.count - a.count);
    };
    const attPtRec = attPatient !== '전체' ? PATIENTS.find(p => p.name === attPatient) : null;

    // 병동별 프로그램 참여 통계 (확정 출석 기록 기반)
    if (!this._statHist) {
      let seed = 20260401;
      const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const progs = s.programs.length ? s.programs : ['음악치료'];
      const hist = [];
      for (let d = new Date(2026, 3, 1); d < new Date(2026, 8, 1); d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (wd === 0 || wd === 6) continue;
        const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const nProg = rnd() < 0.35 ? 2 : 1;
        for (let k = 0; k < nProg; k++) {
          const prog = progs[Math.floor(rnd() * progs.length)];
          PATIENTS.forEach(p => { if (rnd() < 0.42) hist.push({ name: p.name, pid: p.id, program: prog, date: iso, method: rnd() < 0.9 ? 'AI자동' : '수기추가' }); });
        }
      }
      this._statHist = hist;
    }
    const roomOfName = (nm) => { const p = PATIENTS.find(x => x.name === nm); return p ? p.room : ''; };
    const statRecs = this._statHist.map(h => {
      const p = PATIENTS.find(x => x.id === h.pid) || {};
      return { name: h.pid, room: p.room || '', program: h.program, date: h.date, method: h.method || 'AI자동' };
    }).concat(attendance.map(a => {
      const p = PATIENTS.find(x => x.name === a.name);
      return { name: p ? p.id : a.name, room: p ? p.room : a.room, program: a.program, date: fullDate(a.date), method: a.method || '' };
    }));
    const WS_DEF_FROM = ATT_DEF_FROM, WS_DEF_TO = ATT_DEF_TO;
    const wsFrom = s.wsFrom || WS_DEF_FROM, wsTo = s.wsTo || WS_DEF_TO;
    const wsWard = s.wsWard || '전체';
    const wardNameOf = (room) => (room || '').split(' ')[0];
    const wsWardList = savedWards.map(w => w.name);
    const inPeriod = statRecs.filter(r => r.date >= wsFrom && r.date <= wsTo && wsWardList.indexOf(wardNameOf(r.room)) >= 0);
    const wsScope = wsWard === '전체' ? inPeriod : inPeriod.filter(r => wardNameOf(r.room) === wsWard);
    // 통계 '데이터 목록' 보기용 원자료 (기간 · 병동 필터가 적용된 확정 참여 기록)
    const statList = {
      listCols: ['일자', '프로그램', '병동', '병실', '이름', '성별 · 나이', '식별방식'],
      // r.name 은 실인원 집계용 환자번호 — 표시는 명부에서 이름·성별·나이를 찾아 씀
      listRows: wsScope.map(r => {
        const p = PATIENTS.find(x => x.id === r.name);
        const room = (p && p.room) || r.room || '';
        return [r.date, r.program, wardNameOf(room), room.split(' ').slice(1).join(' '), p ? p.name : r.name, p ? ((p.sex || '') + ' ' + (p.age || '')).trim() : '', r.method || ''];
      }),
      listSort: 0, listDir: 'desc'
    };
    const uniq = (arr) => arr.filter((v, i, a) => a.indexOf(v) === i);
    const groupKeys = wsWard === '전체' ? wsWardList : uniq(s.programs.concat(wsScope.map(r => r.program)));
    const groups = groupKeys.map(k => {
      const rs = wsScope.filter(r => (wsWard === '전체' ? wardNameOf(r.room) : r.program) === k);
      const people = uniq(rs.map(r => r.name)).length;
      const sub = wsWard === '전체'
        ? (rs.length ? '프로그램 ' + uniq(rs.map(r => r.program)).length + '종' : '참여 없음')
        : (rs.length ? '진행 ' + uniq(rs.map(r => r.date)).length + '회' : '진행 없음');
      return { label: k, sub: sub, people: people, count: rs.length };
    }).filter(g => wsWard === '전체' || g.count > 0)
      .sort((a, b) => wsWard === '전체' ? 0 : b.count - a.count);
    const maxP = Math.max(1, ...groups.map(g => g.people)), maxC = Math.max(1, ...groups.map(g => g.count));
    const wsPeople = uniq(wsScope.map(r => r.name)).length;
    const ST06_PAL = ['oklch(0.76 0.14 145)', 'oklch(0.74 0.12 230)', 'oklch(0.80 0.13 85)', 'oklch(0.72 0.14 30)', 'oklch(0.72 0.13 300)', 'oklch(0.76 0.11 190)'];
    // ST-06 오른쪽 카드: 병동(또는 프로그램)별 건수 · 실인원 · 1인당 · 참여율 (progColor 정의 뒤에 계산)
    const st06CardsOf = (progColor) => (() => {
      const byWard = wsWard === '전체';
      const totP = groups.reduce((a, g) => a + g.people, 0);
      const order = groups.map((g, i) => ({ g, i })).slice().sort((a, b) => b.g.people - a.g.people || b.g.count - a.g.count);
      const rankOf = {}; order.forEach((x, r) => { rankOf[x.i] = r + 1; });
      const ICON = { '미술치료': 'ph ph-palette', '컬러링북': 'ph ph-paint-brush', '음악치료': 'ph ph-music-notes', '원예치료': 'ph ph-plant', '암센터힐링프로그램': 'ph ph-heart' };
      return groups.map((g, i) => {
        const col = byWard ? ST06_PAL[i % ST06_PAL.length] : progColor(g.label);
        let den = 0, denTxt = '';
        if (byWard) {
          den = PATIENTS.filter(p => (p.stay || '재원') === '재원' && wardNameOf(p.room) === g.label).length;
          denTxt = den ? '재원 ' + den + '명 중 ' + g.people + '명 참여' : '재원 환자 없음';
        } else {
          const pl = (s.plans || []).filter(p => p.program === g.label && p.status !== '취소' && p.date >= wsFrom && p.date <= wsTo);
          den = pl.reduce((a, p) => a + (+p.capacity || 0), 0);
          denTxt = den ? '일정 ' + pl.length + '회 · 정원 합계 ' + den + '명' : '일정에 정원을 입력하면 표시됩니다';
        }
        const num = byWard ? g.people : g.count;
        const rate = den ? Math.min(100, Math.round(num / den * 100)) : null;
        return {
          name: g.label, color: col, icon: byWard ? 'ph ph-buildings' : (ICON[g.label] || 'ph ph-squares-four'),
          tint: 'color-mix(in oklch, ' + col + ' 24%, transparent)',
          meta: '구성 비중 ' + (totP ? Math.round(g.people / totP * 100) : 0) + '% · ' + rankOf[i] + '위',
          kpis: [{ label: '참여 건수', v: g.count, u: '건' }, { label: '실인원', v: g.people, u: '명' }, { label: '1인당', v: g.people ? (g.count / g.people).toFixed(1) : '0', u: '회' }],
          rateLabel: byWard ? '재원 환자 대비 참여율' : '정원 대비 참여율',
          fillTxt: rate == null ? (byWard ? '—' : '정원 미입력') : rate + '%', fillW: (rate || 0) + '%', capTxt: denTxt
        };
      });
    })();
    const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
    const ym = (y, m) => y + '-' + String(m + 1).padStart(2, '0');
    const wsPresetDefs = [
      { label: '오늘', from: _iso0(_t0), to: _iso0(_t0) },
      { label: '이번 달', from: ATT_DEF_FROM, to: ATT_DEF_TO },
      { label: '지난 달', from: _iso0(new Date(_t0.getFullYear(), _t0.getMonth() - 1, 1)), to: _iso0(new Date(_t0.getFullYear(), _t0.getMonth(), 0)) },
      { label: '최근 3개월', from: _iso0(new Date(_t0.getFullYear(), _t0.getMonth() - 2, 1)), to: ATT_DEF_TO },
      { label: '상반기', from: _t0.getFullYear() + '-01-01', to: _t0.getFullYear() + '-06-30' },
      { label: '올해 누적', from: _t0.getFullYear() + '-01-01', to: _t0.getFullYear() + '-12-31' }
    ];
    const fmtK = (d) => { const p = d.split('-'); return p[0] + '.' + p[1] + '.' + p[2]; };

    // ST-05 월별 · 병동별 실인원
    const CHART_PAL = ['oklch(0.72 0.14 285)', 'oklch(0.74 0.11 200)', 'oklch(0.76 0.13 150)', 'oklch(0.80 0.12 85)', 'oklch(0.72 0.14 30)', 'oklch(0.74 0.13 335)', 'oklch(0.72 0.10 245)'];
    const WARD_COLORS = CHART_PAL;
    const barMonths = [4, 5, 6, 7, 8, 9];
    const monthData = barMonths.map(m => {
      const pre = '2026-' + String(m).padStart(2, '0');
      const recs = statRecs.filter(r => r.date.indexOf(pre) === 0);
      return {
        m: m,
        total: uniq(recs.map(r => r.name)).length,
        wards: wsWardList.map(w => uniq(recs.filter(r => wardNameOf(r.room) === w).map(r => r.name)).length)
      };
    });
    const barMaxVal = Math.max(1, ...monthData.map(d => Math.max(...d.wards, 0)));
    const monthBars = monthData.map(d => ({
      label: d.m + '월',
      total: '계 ' + d.total + '명',
      cols: d.wards.map((v, i) => ({
        h: Math.max(2, Math.round(v / barMaxVal * 100)) + '%',
        c: WARD_COLORS[i % WARD_COLORS.length],
        v: v,
        tip: wsWardList[i] + ' ' + d.m + '월 · ' + v + '명'
      }))
    }));
    const PROG_COLORS = CHART_PAL.slice(2).concat(CHART_PAL.slice(0, 2));
    const shareProgs = uniq(s.programs.concat(inPeriod.map(r => r.program)));
    const progColor = (p) => PROG_COLORS[shareProgs.indexOf(p) % PROG_COLORS.length];
    const shareTotal = inPeriod.length;
    const wardShare = wsWardList.map(w => {
      const rs = inPeriod.filter(r => wardNameOf(r.room) === w);
      const byProg = shareProgs.map(p => ({ p: p, n: rs.filter(r => r.program === p).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
      return {
        label: w, count: rs.length,
        pct: shareTotal ? Math.round(rs.length / shareTotal * 1000) / 10 + '%' : '0%',
        cells: shareProgs.map(p => { const n = rs.filter(r => r.program === p).length; return { n: n, p: rs.length ? Math.round(n / rs.length * 100) + '%' : '—' }; }),
        segs: byProg.map(x => ({ w: (x.n / rs.length * 100) + '%', c: progColor(x.p), tip: w + ' · ' + x.p + ' ' + x.n + '건 (' + Math.round(x.n / rs.length * 100) + '%)' })),
        detail: byProg.length ? byProg.map(x => x.p + ' ' + x.n + '건 ' + Math.round(x.n / rs.length * 100) + '%').join(' · ') : '참여 없음'
      };
    });
    const pieStats = shareProgs.map(p => {
      const rs = inPeriod.filter(r => r.program === p);
      return { p: p, n: rs.length, people: uniq(rs.map(r => r.name)).length };
    }).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    let acc = 0;
    const pieStops = pieStats.map(x => {
      const a = acc / shareTotal * 100; acc += x.n; const b = acc / shareTotal * 100;
      return progColor(x.p) + ' ' + a.toFixed(2) + '% ' + b.toFixed(2) + '%';
    });
    const barLegend = wsWardList.map((w, i) => {
      const sum = uniq(statRecs.filter(r => r.date >= wsFrom && r.date <= wsTo && wardNameOf(r.room) === w).map(r => r.name)).length;
      return { label: w, color: WARD_COLORS[i % WARD_COLORS.length], sum: sum + '명' };
    });
    const isoOf = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const REF = new Date(); REF.setHours(0, 0, 0, 0); // 시스템 날짜 기준
    const minus = (n) => { const d = new Date(REF); d.setDate(d.getDate() - n); return isoOf(d); };
    const attPresets = [
      { label: '오늘', from: isoOf(REF), to: isoOf(REF) },
      { label: '최근 7일', from: minus(6), to: isoOf(REF) },
      { label: '이번 달', from: isoOf(new Date(REF.getFullYear(), REF.getMonth(), 1)), to: isoOf(new Date(REF.getFullYear(), REF.getMonth() + 1, 0)) },
      { label: '지난달', from: isoOf(new Date(REF.getFullYear(), REF.getMonth() - 1, 1)), to: isoOf(new Date(REF.getFullYear(), REF.getMonth(), 0)) }
    ];

    const todayIsoV = this.todayIso();
    // 일지 목록 = 실제 데이터만: 저장된 일지 + 오늘까지 일정이 잡혔는데 아직 일지가 없는 프로그램(미작성)
    const logSrc = (() => {
      const out = {}, metaAll = s.sessionMeta || {};
      const staffTxt = (v) => Array.isArray(v) ? v.join(', ') : (v || '');
      const sessAll = Object.assign({}, s.sessions || {});
      if (s.activeSession) sessAll[s.activeSession] = { review: s.review, confirmed: s.confirmed, photos: s.photos };
      (s.plans || []).forEach(p => {
        // 일정이 '예정'인 채로 지났거나 오늘인 프로그램만 (일정에서 '완료'·'취소' 처리한 것은 제외)
        if (!p || p.status !== '예정' || !p.date || p.date > todayIsoV) return;
        const k = p.date + '|' + p.program;
        if (!out[k]) out[k] = { id: 'LOG-' + p.date.replace(/-/g, '') + '-' + p.program, program: p.program, date: p.date + ' ' + (p.start || ''), place: p.place || '', staff: staffTxt(p.staff) };
      });
      Object.keys(sessAll).forEach(k => {
        const v = sessAll[k] || {};
        const has = (v.review || []).length || v.confirmed || (v.photos || []).length;
        if (!has && !out[k]) return;
        const [d, prog] = k.split('|');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || !prog) return;
        const m = metaAll[k] || {};
        out[k] = Object.assign({ id: 'LOG-' + d.replace(/-/g, '') + '-' + prog, program: prog, date: d + ' ' + (m.start || m.time || ''), place: m.place || '', staff: staffTxt(m.staff) }, out[k] || {});
      });
      return Object.keys(out).map(k => out[k]).sort((a, b) => b.date.localeCompare(a.date));
    })();
    const logData = logSrc.map(l => {
      const ss = this.getSession(l.date.slice(0, 10) + '|' + l.program, s);
      const rv = ss.review || [];
      const thr = this.props.threshold ?? 90;
      return Object.assign(l, {
        status: ss.confirmed && rv.length ? '확정' : rv.length ? '검수 필요' : '미작성', count: rv.filter(r => r.id).length,
        photoN: (ss.photos || []).filter(p => p.url).length,
        analyzed: rv.length > 0,
        // 이 일지 사진 목록에 없는 사진에서 나온 결과 수 (사진 불일치)
        strayN: (() => { const ids = new Set((ss.photos || []).map(p => p && p.id).filter(Boolean)); return rv.filter(r => r && r.src && r.src.pid && !ids.has(r.src.pid)).length; })(),
        unknownN: rv.filter(r => !r.id).length,
        lowN: rv.filter(r => r.id && r.sim && r.sim < thr).length,
        manualN: rv.filter(r => r.id && r.sim === 0).length,
        confirmedFlag: !!ss.confirmed
      });
    });
    const logF = s.logFilter || '전체';
    const logPendingN = logData.filter(l => l.status === '검수 필요').length;
    const logDoneN = logData.filter(l => l.status === '확정').length;
    const logDraftN = logData.filter(l => l.status === '미작성').length;
    const logRowsAll = logData.map(l => {
      const attention = l.status === '검수 필요';
      const key = l.date.slice(0, 10) + '|' + l.program;
      const meta = l.date.slice(11) + ' · ' + l.place + ' · ' + l.staff;
      return {
        program: l.program, status: l.status,
        meta: l.date + ' · ' + l.place + ' · ' + l.staff,
        countLabel: l.status === '미작성' ? '사진 첨부 전' : (attention ? 'AI 인식 ' : '확정 ') + l.count + '명',
        attention: attention, settled: !attention,
        shadow: attention ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
        open: () => this.switchSession(key, { pcView: 'review', program: l.program }, meta),
        openMobile: () => this.switchSession(key, { ...this.reviewNav(), program: l.program }, meta),
        _pending: attention, _st: l.status,
        // 상태 배지: tone = warn(조치 필요) / ok(완료) / info(참고)
        badges: (() => {
          const B = [];
          const T = {
            warn: { bd: 'var(--cal-red)', fg: 'var(--cal-red)', bg: 'var(--cal-red-bg)' },
            ok: { bd: 'var(--color-accent-600)', fg: 'var(--color-accent-200)', bg: 'var(--color-accent-900)' },
            info: { bd: 'var(--color-neutral-700)', fg: 'var(--color-neutral-300)', bg: 'var(--color-neutral-900)' }
          };
          const add = (tone, icon, label) => B.push(Object.assign({ icon: 'ph ' + icon, label: label }, T[tone]));
          if (!l.photoN) add('warn', 'ph-image-broken', '사진 없음');
          else add('info', 'ph-images', '사진 ' + l.photoN + '장');
          if (!l.analyzed) add('warn', 'ph-scan', '판독 전');
          else if (l.strayN) add('warn', 'ph-link-break', '사진 불일치 ' + l.strayN + '명');
          else add('ok', 'ph-scan-smiley', '판독 완료');
          if (l.unknownN) add('warn', 'ph-user-focus', '미확인 ' + l.unknownN + '명');
          if (l.lowN) add('warn', 'ph-gauge', '유사도 낮음 ' + l.lowN + '명');
          if (l.manualN) add('info', 'ph-hand-pointing', '수기 ' + l.manualN + '명');
          if (l.confirmedFlag) add('ok', 'ph-check-circle', '출석부·통계 반영');
          else add('warn', 'ph-clock-countdown', '출석부·통계 미반영');
          return B;
        })(),
        nextStep: l.confirmedFlag ? '' : !l.photoN ? '다음: 현장사진 첨부' : !l.analyzed ? '다음: AI 판독 실행' : l.unknownN ? '다음: 미확인 인물 지정·제외' : l.lowN ? '다음: 유사도 낮은 참여자 확인' : '다음: [확정]'
      };
    });
    const logRows = logRowsAll.filter(r => logF === '전체' || (logF === '검수 필요' ? r._st === '검수 필요' : logF === '검수 완료' ? r._st === '확정' : r._st === '미작성'));
    const logFilterVals = {
      logFilterOpts: [
        { k: '전체', label: '전체', n: logData.length, icon: 'ph ph-list' },
        { k: '미작성', label: '미작성', n: logDraftN, icon: 'ph ph-image-broken' },
        { k: '검수 필요', label: '검수 필요', n: logPendingN, icon: 'ph ph-warning-circle' },
        { k: '검수 완료', label: '검수 완료', n: logDoneN, icon: 'ph ph-check-circle' }
      ].map(o => ({ label: o.label, count: o.n, icon: o.icon, on: logF === o.k, off: logF !== o.k, go: () => this.setState({ logFilter: o.k }) })),
      logFilterEmpty: logRows.length === 0,
      logFilterEmptyMsg: logF === '미작성' ? '사진을 기다리는 일지가 없습니다.' : logF === '검수 필요' ? '검수가 필요한 일지가 없습니다. 판독된 일지는 모두 확정되었습니다.' : logF === '검수 완료' ? '아직 확정된 일지가 없습니다.' : '등록된 일지가 없습니다.'
    };

    // 프로그램 항목
    const usage = (name) => logData.filter(l => l.program === name).length;
    const renameProgram = (from, to) => {
      const next = (to || '').trim();
      if (!next) { this.flash('프로그램명을 입력하세요'); return; }
      if (next !== from && s.programs.indexOf(next) >= 0) { this.flash('이미 등록된 항목입니다'); return; }
      this.setState({
        programs: s.programs.map(p => p === from ? next : p),
        program: s.program === from ? next : s.program,
        editingProgram: null, programDraft: ''
      });
      if (next !== from) this.flash('"' + from + '" → "' + next + '" 수정 — 일지·출석부·통계에 반영');
    };
    const programRows = s.programs.map(name => {
      const used = usage(name);
      return {
        name: name,
        editing: s.editingProgram === name, viewing: s.editingProgram !== name,
        draft: s.editingProgram === name ? s.programDraft : name,
        usageLabel: used > 0 ? '일지 ' + used + '건에서 사용 중' : '미사용',
        onDraft: (e) => this.setState({ programDraft: e.target.value }),
        edit: () => this.setState({ editingProgram: name, programDraft: name }),
        cancel: () => this.setState({ editingProgram: null, programDraft: '' }),
        save: () => renameProgram(name, s.programDraft),
        remove: () => {
          if (used > 0) { this.flash('"' + name + '"은 사용 중이라 삭제할 수 없습니다'); return; }
          this.setState({ programs: s.programs.filter(p => p !== name) });
          this.flash('"' + name + '" 삭제');
        }
      };
    });

    // 담당자 명단
    const setRoster = (id, patch, msg) => {
      this.setState({ roster: this.state.roster.map(m => m.id === id ? Object.assign({}, m, patch) : m), dialog: null });
      if (msg) this.flash(msg);
    };
    const rolesOf = (m) => Array.isArray(m.roles) ? m.roles : [m.role];
    // ── 계정 목록 (기관별 권한 관리) ──
    const FEATS = [{ k: 'pt', n: '환자 관리' }, { k: 'lg', n: '프로그램 일지' }, { k: 'st', n: '통계 · 출력' }];
    const permsOf = (m) => {
      if (m.perms) return m.perms;
      const r = rolesOf(m);
      if (r.indexOf('시스템관리자') >= 0 || r.indexOf('관리자') >= 0 || r.indexOf('담당자') >= 0) return { pt: { v: true, u: true }, lg: { v: true, u: true }, st: { v: true, u: true } };
      if (r.indexOf('보조') >= 0) return { pt: { v: true, u: false }, lg: { v: true, u: true }, st: { v: false, u: false } };
      return { pt: { v: true, u: false }, lg: { v: true, u: false }, st: { v: true, u: false } };
    };
    const isAdminOf = (m) => rolesOf(m).indexOf('관리자') >= 0;
    const rolesFrom = (p, admin) => {
      const r = [];
      if (admin) r.push('관리자');
      if (p.pt.u) r.push('담당자');
      else if (p.lg.u) r.push('보조');
      if (!r.length || (!p.pt.u && !p.lg.u && (p.pt.v || p.lg.v || p.st.v))) { if (r.indexOf('조회') < 0) r.push('조회'); }
      return r;
    };
    const tg = (on) => on
      ? { Bd: 'var(--color-accent)', Bg: 'var(--color-accent-900)', Fg: 'var(--color-accent-100)' }
      : { Bd: 'var(--color-neutral-700)', Bg: 'var(--color-neutral-900)', Fg: 'var(--color-neutral-500)' };
    const meIsAdmin = myRoles.indexOf('관리자') >= 0;
    const canEditAcct = (m) => m.id !== me.id && m.org !== '*' && (isSys || (meIsAdmin && m.org === me.org));
    const acctOrg = isSys ? (s.acctOrg || 'ALL') : me.org;
    const setAcct = (id, patch, msg) => {
      const list = this.state.roster.map(x => x.id === id ? Object.assign({}, x, patch) : x);
      this.setState({ roster: list, dialog: null });
      this.saveRoster(list);
      if (msg) this.flash(msg);
    };
    const DEPTS = ['사회사업실', '원무과', '간호부', '임상병리실', '감염관리실', '재활치료실', '영양팀', '행정팀', '본사'];
    const q = (s.acctQ || '').trim().toLowerCase();
    const orgNm = (id) => (s.orgs.find(o => o.id === id) || {}).name || '';
    const acctPool = s.roster.filter(m => m.org !== '*' && (acctOrg === 'ALL' || m.org === acctOrg));
    const acctList = acctPool.filter(m => !q || [m.empNo, m.name, m.dept, m.type, m.email, orgNm(m.org)].some(v => (v || '').toLowerCase().indexOf(q) >= 0));
    const accounts = acctList.map(m => {
      const p = permsOf(m);
      const admin = isAdminOf(m);
      const locked = !canEditAcct(m);
      // 본인 계정: 권한은 잠그되 알림 Gmail·수신은 직접 설정 가능
      const mailLocked = locked && !(m.id === me.id && m.org !== '*');
      const savePerm = (np, ad, msg) => setAcct(m.id, { perms: np, roles: rolesFrom(np, ad), role: rolesFrom(np, ad)[0] }, msg);
      const deptOpts = DEPTS.concat((s.wards || []).map(w => w.name)).concat(m.dept ? [m.dept] : []).filter((v, i, a) => a.indexOf(v) === i);
      const tN = tg(!!m.notify), tA = tg(m.status === '활성'), tAd = tg(admin);
      const vs = this.validState(m);
      const fmtMD = (d) => d ? d.slice(5).replace('-', '/') : '';
      const validLabel = vs === 'pending' ? fmtMD(m.validFrom) + '부터 활성 예약'
        : vs === 'expired' ? fmtMD(m.validTo) + ' 만료'
        : (m.validFrom || m.validTo) ? (m.validTo ? fmtMD(m.validTo) + '까지 사용' : '사용 중') : '기간 제한 없음';
      const canDrag = isSys || meIsAdmin;
      const dragging = s.acctDrag === m.id;
      const over = s.acctOver === m.id && s.acctDrag != null && !dragging;
      return {
        canDrag: canDrag, gripCursor: canDrag ? 'grab' : 'default',
        dragOpacity: dragging ? '0.45' : '1',
        dropRing: over ? 'inset 0 3px 0 var(--color-accent)' : 'none',
        dragStart: (e) => {
          if (!canDrag) { e.preventDefault(); return; }
          if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(m.id)); }
          this.setState({ acctDrag: m.id });
        },
        dragOver: (e) => {
          if (this.state.acctDrag == null) return;
          e.preventDefault();
          if (this.state.acctOver !== m.id) this.setState({ acctOver: m.id });
        },
        drop: (e) => {
          e.preventDefault();
          const from = this.state.acctDrag;
          this.setState({ acctDrag: null, acctOver: null });
          if (from == null || from === m.id) return;
          const list = this.state.roster.slice();
          const fi = list.findIndex(x => x.id === from);
          if (fi < 0) return;
          const item = list.splice(fi, 1)[0];
          const ti = list.findIndex(x => x.id === m.id);
          list.splice(ti, 0, item);
          this.setState({ roster: list });
          this.saveRoster(list);
          this.flash((item.name || '계정') + ' → ' + (m.name || '') + ' 위로 이동');
        },
        dragEnd: () => this.setState({ acctDrag: null, acctOver: null }),
        validFrom: m.validFrom || '', validTo: m.validTo || '',
        hasValid: !!(m.validFrom || m.validTo),
        validLabel: validLabel,
        validTagCls: vs === 'active' ? 'tag-accent' : (vs === 'pending' ? 'tag-outline' : 'tag-neutral'),
        validRing: vs === 'pending' ? 'var(--color-accent-600)' : (vs === 'expired' ? 'var(--color-neutral-600)' : 'var(--color-neutral-800)'),
        onValidFrom: (e) => {
          const v = e.target.value;
          if (v && m.validTo && v > m.validTo) { this.flash('시작일이 종료일보다 늦습니다'); return; }
          setAcct(m.id, { validFrom: v }, v ? (m.name || '계정') + ' · ' + v + '부터 사용 가능' + (v > this.todayStr() ? ' (활성 예약)' : '') : null);
        },
        onValidTo: (e) => {
          const v = e.target.value;
          if (v && m.validFrom && v < m.validFrom) { this.flash('종료일이 시작일보다 빠릅니다'); return; }
          setAcct(m.id, { validTo: v }, v ? (m.name || '계정') + ' · ' + v + '까지 사용 후 자동 만료' : null);
        },
        clearValid: () => setAcct(m.id, { validFrom: '', validTo: '' }, (m.name || '계정') + ' · 기간 제한 해제'),
        empNo: m.empNo || '', name: m.name || '', org: m.org, dept: m.dept || deptOpts[0], type: m.type || '기타', email: m.email || '',
        deptOpts: deptOpts, locked: locked, mailLocked: mailLocked, orgLocked: locked || !isSys,
        isMe: m.id === me.id,
        rowBg: m.status === '활성' ? 'transparent' : 'var(--color-neutral-900)',
        opacity: m.status === '활성' ? '1' : '0.6',
        onEmp: (e) => setAcct(m.id, { empNo: e.target.value.trim() }),
        checkEmp: () => {
          const v = (this.state.roster.find(x => x.id === m.id) || {}).empNo || '';
          if (!v) { this.flash('사번을 입력하세요 — 사번이 없으면 로그인할 수 없습니다'); return; }
          if (this.state.roster.some(x => x.id !== m.id && x.org === m.org && x.empNo === v)) this.flash(orgNm(m.org) + '에 같은 사번(' + v + ')이 이미 있습니다');
        },
        onName: (e) => setAcct(m.id, { name: e.target.value }),
        onOrg: (e) => { if (!isSys) return; setAcct(m.id, { org: e.target.value }, m.name + ' → ' + orgNm(e.target.value) + ' 소속으로 변경'); },
        onDept: (e) => setAcct(m.id, { dept: e.target.value }),
        onType: (e) => setAcct(m.id, { type: e.target.value }),
        onEmail: (e) => setAcct(m.id, { email: e.target.value.trim() }),
        checkEmail: () => {
          const v = (this.state.roster.find(x => x.id === m.id) || {}).email || '';
          if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) this.flash('Gmail 주소 형식을 확인하세요');
        },
        notify: !!m.notify, notifyBd: tN.Bd, notifyBg: tN.Bg, notifyFg: tN.Fg,
        notifyT: () => {
          if (!m.notify && !m.email) { this.flash('알림을 받을 Gmail 주소를 먼저 입력하세요'); return; }
          setAcct(m.id, { notify: !m.notify }, m.name + ' 알림 메일 ' + (m.notify ? '수신 해제' : '수신'));
        },
        feats: FEATS.map(f => {
          const tv = tg(p[f.k].v), tu = tg(p[f.k].u);
          return {
            name: f.n, fname: f.n, v: p[f.k].v, u: p[f.k].u, vTitle: f.n + ' 보기', uTitle: f.n + ' 사용(등록·수정)',
            vBd: tv.Bd, vBg: tv.Bg, vFg: tv.Fg, uBd: tu.Bd, uBg: tu.Bg, uFg: tu.Fg,
            vT: () => {
              const np = JSON.parse(JSON.stringify(p));
              np[f.k].v = !p[f.k].v; if (!np[f.k].v) np[f.k].u = false;
              savePerm(np, admin, m.name + ' · ' + f.n + ' 뷰 ' + (np[f.k].v ? '부여' : '해제'));
            },
            uT: () => {
              const np = JSON.parse(JSON.stringify(p));
              np[f.k].u = !p[f.k].u; if (np[f.k].u) np[f.k].v = true;
              savePerm(np, admin, m.name + ' · ' + f.n + ' 사용 ' + (np[f.k].u ? '부여 (뷰 포함)' : '해제'));
            }
          };
        }),
        active: m.status === '활성', activeBd: tA.Bd, activeBg: tA.Bg, activeFg: tA.Fg,
        statusLabel: m.status !== '활성' ? '중지' : (vs === 'pending' ? '예약' : (vs === 'expired' ? '만료' : '활성')),
        activeT: () => setAcct(m.id, { status: m.status === '활성' ? '중지' : '활성', revokedAt: '' }, m.name + ' 계정 ' + (m.status === '활성' ? '중지 — 로그인 차단' : '활성')),
        admin: admin, adminBd: tAd.Bd, adminBg: tAd.Bg, adminFg: tAd.Fg,
        adminLabel: admin ? '기관 관리자 ✓' : '기관 관리자 지정',
        adminT: () => {
          if (!admin && !m.empNo) { this.flash('사번을 먼저 입력하세요'); return; }
          savePerm(p, !admin, m.name + (admin ? ' 기관 관리자 해제' : ' → ' + orgNm(m.org) + ' 기관 관리자 지정'));
        },
        pwEditing: s.pwEditId === m.id, pwNotEditing: s.pwEditId !== m.id,
        pwDraft: s.pwEditId === m.id ? (s.pwDraft || '') : '',
        pwOpen: () => this.setState({ pwEditId: m.id, pwDraft: '' }),
        pwCancel: () => this.setState({ pwEditId: null, pwDraft: '' }),
        onPwDraft: (e) => this.setState({ pwDraft: e.target.value }),
        pwKey: (e) => { if (e.key === 'Enter') e.currentTarget.parentElement.querySelector('.btn-primary').click(); if (e.key === 'Escape') this.setState({ pwEditId: null, pwDraft: '' }); },
        pwSave: () => {
          const v = (this.state.pwDraft || '').trim();
          if (!v) { this.flash('비밀번호를 입력하세요'); return; }
          setAcct(m.id, { pw: v, tempPw: '', mustChange: false }, (m.name || '사용자') + ' 비밀번호를 "' + v + '"(으)로 지정했습니다 — 본인에게 전달하세요');
          this.setState({ pwEditId: null, pwDraft: '' });
        },
        resetPw: () => {
          const t = String(100000 + Math.floor(Math.random() * 900000));
          setAcct(m.id, { pw: t, tempPw: t, mustChange: true }, m.name + ' 비밀번호 초기화 — 임시 비밀번호 ' + t);
        },
        hasTemp: !!m.tempPw, tempPw: m.tempPw || '',
        lastLogin: m.lastLogin || '기록 없음',
        mailNote: !m.email ? 'Gmail 주소 필요' : (m.notify ? '알림 메일 수신' : '알림 메일 미수신'),
        mailColor: !m.email ? 'var(--color-accent-300)' : 'var(--color-neutral-400)',
        del: () => this.setState({ dialog: {
          title: (m.name || '이름 없음') + ' 계정을 삭제할까요?',
          body: orgNm(m.org) + ' · 사번 ' + (m.empNo || '—') + '\n로그인과 담당자 선택 목록에서 즉시 제외됩니다. 과거 일지·출석 기록의 이름은 그대로 보존됩니다.',
          cta: '삭제',
          confirm: () => {
            const list = this.state.roster.filter(x => x.id !== m.id);
            this.setState({ roster: list, dialog: null }); this.saveRoster(list);
            this.flash((m.name || '계정') + ' 삭제');
          }
        } })
      };
    });
    const guard = (m, fn) => () => {
      if (!canManageStaff) { this.flash('권한 관리는 기관 관리자 또는 시스템 관리자만 할 수 있습니다'); return; }
      if (m.id === me.id) { this.flash('본인 계정의 권한·상태는 변경할 수 없습니다'); return; }
      fn();
    };
    const roster = orgRoster.map(m => ({
      name: m.name, type: m.type,
      idLabel: '사번 ' + (m.empNo || '—') + (m.email ? ' · ' + m.email : ''),
      isMe: m.id === me.id,
      actVis: canManageStaff && m.id !== me.id ? 'visible' : 'hidden',
      roleLabel: rolesOf(m).join(' · '),
      isActive: m.status === '활성', isSuspended: m.status === '중지', isRevoked: m.status === '해제',
      revokedAt: m.revokedAt,
      shadow: m.status === '활성' ? 'var(--shadow-sm)' : '0 0 0 1px var(--color-neutral-800)',
      canSuspend: m.status === '활성', canResume: m.status === '중지', canRevoke: m.status !== '해제',
      roleOpts: ROLES.map(r => {
        const on = rolesOf(m).indexOf(r) >= 0;
        return {
          label: r === '관리자' ? '기관 관리자' : r, active: on, inactive: !on,
          go: guard(m, () => {
            const cur = rolesOf(m);
            if (on && cur.length === 1) { this.flash('권한은 최소 1개 이상이어야 합니다'); return; }
            const next = on ? cur.filter(x => x !== r) : cur.concat([r]);
            const ordered = ROLES.filter(x => next.indexOf(x) >= 0);
            setRoster(m.id, { roles: ordered, role: ordered[0] }, staffOrgName + ' · ' + m.name + ' 권한 — ' + ordered.map(x => x === '관리자' ? '기관 관리자' : x).join(' · '));
          })
        };
      }),
      suspend: guard(m, () => setRoster(m.id, { status: '중지' }, m.name + ' 일시 중지 — 앱 로그인 및 담당자 선택에서 제외')),
      resume: guard(m, () => setRoster(m.id, { status: '활성', revokedAt: '' }, m.name + ' 권한 복구')),
      askRevoke: guard(m, () => this.setState({
        dialog: {
          title: m.name + '님의 권한을 해제할까요?',
          body: '퇴사·결격 사유로 계정 접근을 차단합니다. 과거 일지·출석 기록은 그대로 보존되며, 필요하면 재등록할 수 있습니다.',
          cta: '권한 해제',
          confirm: () => setRoster(m.id, { status: '해제', revokedAt: this.todayIso() }, m.name + ' 권한 해제 — 계정 접근 차단')
        }
      }))
    }));
    const activeStaff = orgRoster.filter(m => m.status === '활성' && this.validState(m) === 'active' && rolesOf(m).some(r => r !== '조회'));

    // 업로드
    const readFileUrl = (file) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    const kb = (bytes) => bytes > 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + 'MB'
      : Math.round(bytes / 1024) + 'KB';

    const acceptIdPhoto = async (file) => {
      if (!file) return;
      if (file.type.indexOf('image/') !== 0) { this.flash('이미지 파일만 등록할 수 있습니다'); return; }
      if (file.size > 10 * 1024 * 1024) { this.flash('10MB 이하 파일만 등록할 수 있습니다'); return; }
      clearInterval(this._u);
      this.setState({ upload: 'uploading', uploadPct: 0 });
      let url;
      // 증명사진은 고화질로 저장 (긴 변 1200px · JPEG 품질 0.92)
      try { url = await this.shrinkPhoto(await readFileUrl(file), 1200, true, 0.92); }
      catch (e) { this.setState({ upload: 'idle', uploadPct: 0 }); this.flash('사진을 읽지 못했습니다. 다시 시도하세요'); return; }
      this._u = setInterval(() => {
        const next = this.state.uploadPct + 14;
        if (next >= 100) {
          clearInterval(this._u);
          this.setState({
            upload: 'done', uploadPct: 100,
            idPhoto: { url: url, name: file.name, size: kb(file.size) }
          });
          this.flash('증명사진 등록 — 얼굴 1개 검출, Collection 등록 준비 완료');
        } else {
          this.setState({ uploadPct: next });
        }
      }, 150);
    };

    const addConsentFiles = async (files) => {
      const OK_EXT = /\.(jpe?g|png|gif|pdf)$/i, OK_TYPE = /^(image\/(jpeg|png|gif)|application\/pdf)$/;
      // 같은 파일이 짧은 시간에 여러 번 들어오는 것 방지 (붙여넣기·포커스 자동첨부·드롭 중복)
      const now = Date.now();
      // 캡처·붙여넣기 이미지는 경로마다 다시 인코딩되어 크기가 달라질 수 있으므로, 2.5초 안의 재진입은 무조건 1회만 허용
      const incoming = Array.from(files || []);
      const isCapLike = incoming.length > 0 && incoming.every(f => /^화면캡처_/.test(f.name || '') || f.name === 'image.png' || !f.name);
      if (isCapLike) {
        if (window.__scLastCapAdd && now - window.__scLastCapAdd < 2500) return;
        window.__scLastCapAdd = now;
      }
      this._recentAdds = (this._recentAdds || []).filter(x => now - x.t < 3000);
      const seen = new Set();
      const all = Array.from(files || []).filter(f => {
        const sig = f.size + '|' + f.type + '|' + (/^화면캡처_/.test(f.name || '') ? 'cap' : f.name);
        if (seen.has(sig) || this._recentAdds.some(x => x.sig === sig)) return false;
        seen.add(sig); this._recentAdds.push({ sig: sig, t: now });
        return true;
      });
      if (!all.length) return;
      const list = all.filter(f => OK_TYPE.test(f.type) || OK_EXT.test(f.name || ''));
      if (all.length > list.length) this.flash('JPG · PNG · GIF · PDF 파일만 첨부할 수 있습니다' + (list.length ? ' — 지원 형식만 첨부합니다' : ''));
      if (list.length === 0) return;
      const ok = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        if (file.size > 10 * 1024 * 1024) { this.flash(file.name + ' 은 10MB를 초과합니다'); continue; }
        let url = '';
        try { url = await readFileUrl(file); }
        catch (e) { this.flash(file.name + ' 을 읽지 못했습니다'); continue; }
        ok.push({
          id: 'cf-' + Date.now() + '-' + i,
          name: file.name, size: kb(file.size),
          isPdf: file.type === 'application/pdf', url: url
        });
      }
      if (ok.length === 0) return;
      const map = Object.assign({}, this.state.consentFiles);
      map[sel.id] = (map[sel.id] || []).concat(ok);
      const via = Object.assign({}, this.state.consentVia);
      via[sel.id] = '서면 첨부';
      this.setState({ consentFiles: map, consentVia: via });
      this.flash(ok.length + '개 첨부 완료 — ' + sel.name + ' 명부에 연결되었습니다');
    };

    this._dropHandlers = {
      id: (files) => acceptIdPhoto(files[0]),
      consent: (files) => addConsentFiles(files),
      site: (files) => addSitePhotos(files)
    };

    const addSitePhotos = async (files) => {
      const list = Array.from(files || []).filter(f => f.type.indexOf('image/') === 0);
      if (list.length === 0) { this.flash('이미지 파일을 선택하세요'); return; }
      const room = 6 - this.state.photos.length;
      if (room <= 0) { this.flash('한 일지에 최대 6장까지 올릴 수 있습니다'); return; }
      const take = list.slice(0, room);
      if (list.length > room) this.flash('최대 6장까지만 등록됩니다');
      // 업로드를 시작한 일지를 고정 — 업로드 도중 다른 일지를 열어도 사진은 시작한 일지에만 들어감
      const target = this.curKey();
      this._uploading = (this._uploading || 0) + 1;
      try {
        for (let i = 0; i < take.length; i++) {
          const file = take[i];
          const id = 'ph-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 6);
          const label = '단체사진 ' + (this.sessPhotos(target).length + 1);
          this.patchSessPhotos(target, arr => arr.concat([{ id: id, label: label, pct: 0, sk: target }]));
          let url;
          // 현장사진은 긴 변 2400px · 품질 0.88로 보관 — 단체사진 속 얼굴을 증명사진으로 오려도 선명하게
          try { url = await this.shrinkPhoto(await readFileUrl(file), 2400, false, 0.88); }
          catch (e) {
            this.patchSessPhotos(target, arr => arr.filter(p => p.id !== id));
            this.flash(file.name + ' 을 읽지 못했습니다');
            continue;
          }
          await new Promise(done => {
            let pct = 0;
            const timer = setInterval(() => {
              pct += 25;
              const finished = pct >= 100;
              this.patchSessPhotos(target, arr => arr.map(p => p.id === id
                ? { id: id, label: label, pct: finished ? 100 : pct, url: finished ? url : undefined, name: file.name, sk: target }
                : p));
              if (finished) { clearInterval(timer); done(); }
            }, 140);
          });
        }
      } finally { this._uploading = Math.max(0, (this._uploading || 1) - 1); }
      this.flash(take.length + '장 업로드 완료 — 저장하면 AI 판독이 시작됩니다');
    };

    const submitLog = () => {
      if (s.offline) {
        this.flash('오프라인 — 기기에 저장했습니다. 연결되면 자동 전송됩니다');
        this.setState({ mobileView: 'today' });
        return;
      }
      this.analyzePhotos();
    };

    const askConfirm = () => this.setState({
      dialog: {
        title: '출석을 확정할까요?',
        body: '확정하면 [자동_출석부]에 ' + s.review.length + '행이 기록되고 통계에 반영됩니다. 확정 이후 수정은 관리자만 가능합니다.',
        cta: '확정',
        confirm: () => {
          this.setState({ confirmed: true, dialog: null });
          this.flash('확정 완료 — 출석부 ' + this.state.review.filter(r => r.id).length + '행 기록');
        }
      }
    });

    const canManage = hasRole('관리자') || hasRole('담당자');
    const canViewStats = canManage || hasRole('조회');
    // 시스템 관리자 = 전체 권한 (선택한 기관의 모든 화면)
    const pcAllowedViews = canManage
      ? ['patients', 'patient', 'newPatient', 'consent', 'logs', 'review', 'newLogPc', 'attendance', 'stats', 'settings']
      : (hasRole('조회') ? ['stats'] : []);
    const pcDenied = s.device === 'pc' && pcAllowedViews.indexOf(s.pcView) < 0;

    const navItems = [
      { key: 'patients', label: '환자', icon: 'ph ph-users', views: ['patients', 'patient', 'newPatient', 'consent'] },
      { key: 'logs', label: '프로그램', icon: 'ph ph-note-pencil', views: ['logs', 'review', 'newLogPc'] },
      { key: 'stats', label: '통계', icon: 'ph ph-chart-bar', views: ['stats'] },
      { key: 'settings', label: '설정', icon: 'ph ph-gear', views: ['settings'] }
    ];

    const signedCount = ['동의인', '보호자', '촬영자'].filter(r => s.signed[r]).length;

    return {
      // 셸
      ...(() => {
        let saved = null; try { saved = localStorage.getItem('smartcare.viewMode.v1'); } catch (e) {}
        const auto = Component.autoDevice();
        const NAME = { pc: 'PC', tablet: '태블릿', mobile: '휴대폰' };
        const sel = saved || 'auto';
        const pick = (k) => {
          try { if (k === 'auto') localStorage.removeItem('smartcare.viewMode.v1'); else localStorage.setItem('smartcare.viewMode.v1', k); } catch (e) {}
          const dev = k === 'auto' ? auto : k;
          this.setState({ device: dev, phoneOnly: auto !== 'pc' && dev !== 'pc', mobileView: 'today' });
          this.flash((k === 'auto' ? '자동 (' + NAME[auto] + ')' : NAME[k]) + ' 모드로 전환했습니다');
        };
        return {
          deviceOpts: [
            { key: 'auto', label: '자동', icon: 'ph ph-magic-wand', title: '접속 기기에 맞춰 자동 선택 (지금: ' + NAME[auto] + ')' },
            { key: 'pc', label: 'PC', icon: 'ph ph-desktop', title: 'PC 웹 (관리)' },
            { key: 'tablet', label: '태블릿', icon: 'ph ph-device-tablet', title: '태블릿 (현장 앱)' },
            { key: 'mobile', label: '휴대폰', icon: 'ph ph-device-mobile', title: '휴대폰 (현장 앱)' }
          ].map(d => ({
            label: d.label, icon: d.icon, title: d.title,
            active: sel === d.key, inactive: sel !== d.key,
            bd: sel === d.key ? 'var(--color-accent)' : 'var(--color-neutral-800)',
            bg: sel === d.key ? 'var(--color-accent-900)' : 'transparent',
            go: () => { this.setState({ mModeOpen: false }); pick(d.key); }
          })),
          mModeOpen: !!s.mModeOpen,
          toggleMModes: () => this.setState({ mModeOpen: !s.mModeOpen }),
          deviceNote: sel === 'auto' ? '이 기기는 ' + NAME[auto] + '로 인식됨' : NAME[sel] + ' 모드로 고정 · [자동]을 누르면 기기에 맞춰짐',
          mExitMode: () => pick('auto'),
          mShowExit: auto === 'pc' || !!saved
        };
      })(),
      offline: s.offline,
      offlineLabel: s.offline ? '오프라인' : '온라인',
      offlineIcon: s.offline ? 'ph ph-wifi-slash' : 'ph ph-wifi-high',
      toggleOffline: () => this.setState({ offline: !s.offline }),
      fetchLabel: s.fetch === 'ready' ? '정상' : (s.fetch === 'loading' ? '로딩' : (s.fetch === 'error' ? '오류' : '없음')),
      cycleFetch: () => {
        const order = ['ready', 'loading', 'error', 'empty'];
        const next = order[(order.indexOf(s.fetch) + 1) % order.length];
        this.setState({ fetch: next, reviewFailed: false });
      },

      showLogin: !s.logged,
      showPc: s.logged && s.device === 'pc',
      showApp: s.logged && (s.device === 'tablet' || s.device === 'mobile'),
      isTablet: s.device === 'tablet',
      phoneOnly: !!s.phoneOnly, notPhoneOnly: !s.phoneOnly,
      rootPad: s.phoneOnly ? '0' : 'var(--space-3) 0 0',
      appMargin: s.phoneOnly ? '0' : 'var(--space-6) auto calc(var(--space-8) * 2)',
      appShadow: s.phoneOnly ? 'none' : 'var(--shadow-md)',
      appMaxWidth: s.phoneOnly ? 'none' : (s.device === 'tablet' ? '980px' : '372px'),
      appHeight: s.phoneOnly ? '100dvh' : (s.device === 'tablet' ? '780px' : '760px'),
      appBezel: s.phoneOnly ? '0' : (s.device === 'tablet' ? '14px' : '11px'),
      appOuterRadius: s.phoneOnly ? '0' : (s.device === 'tablet' ? '28px' : '38px'),
      appInnerRadius: s.phoneOnly ? '0' : (s.device === 'tablet' ? '20px' : '29px'),
      appPad: s.device === 'tablet' ? 'calc(var(--space-8) * 1.5) calc(var(--space-8) * 1.25)' : 'var(--space-8) var(--space-6)',

      roleOpts: [
        { key: '담당자', label: '담당자 (사회복지사)', note: '명부·동의서·일지·검수 전부' },
        { key: '관리자', label: '관리자 (실장)', note: '담당자 권한 + 설정·권한 부여' },
        { key: '보조', label: '보조 (자원봉사·실습생)', note: '현장 앱 사진 업로드만' },
        { key: '조회', label: '조회 (원무·행정)', note: '통계 대시보드만' }
      ].map(r => ({
        label: r.label, note: r.note,
        active: s.role === r.key, inactive: s.role !== r.key,
        go: () => this.setState({ role: r.key })
      })),
      lgNotSys: s.lgMode !== 'sys',
      lgOrg: s.lgOrg,
      onLgOrg: (e) => this.setState({ lgOrg: e.target.value, lgErr: '', lgAutoOrg: '' }),
      orgOpts: s.orgs,
      lgModes: [{ k: 'emp', label: '사번', icon: 'ph ph-identification-badge' }, { k: 'gmail', label: 'Gmail', icon: 'ph ph-envelope-simple' }, { k: 'sys', label: '시스템 관리자', icon: 'ph ph-shield-star' }].map(m => ({
        label: m.label, icon: m.icon, on: s.lgMode === m.k, off: s.lgMode !== m.k,
        go: () => this.setState({ lgMode: m.k, lgErr: '', lgId: '', lgPw: '', lgAutoOrg: '' })
      })),
      lgIdLabel: s.lgMode === 'gmail' ? 'Gmail 주소' : s.lgMode === 'sys' ? '관리자 ID' : '사번',
      lgIdPh: s.lgMode === 'gmail' ? '예: name@gmail.com' : s.lgMode === 'sys' ? '예: admin' : '예: 201804',
      lgId: s.lgId, lgPw: s.lgPw,
      onLgId: (e) => {
        const v = e.target.value;
        const key = v.trim().toLowerCase();
        const patch = { lgId: v, lgErr: '', lgAutoOrg: '' };
        if (key && s.lgMode !== 'sys') {
          const isMail = key.indexOf('@') >= 0;
          const hits = s.roster.filter(m => m.org !== '*' && (isMail ? (m.email || '').toLowerCase() === key : (m.empNo || '').toLowerCase() === key));
          const orgs = hits.map(m => m.org).filter((o, i, a) => a.indexOf(o) === i);
          if (orgs.length === 1) {
            patch.lgOrg = orgs[0];
            patch.lgAutoOrg = orgs[0];
            if (isMail && s.lgMode !== 'gmail') patch.lgMode = 'gmail';
            if (!isMail && s.lgMode !== 'emp') patch.lgMode = 'emp';
          }
        }
        this.setState(patch);
      },
      lgAutoOrgOn: !!s.lgAutoOrg && s.lgAutoOrg === s.lgOrg && s.lgMode !== 'sys',
      lgAutoOrgName: ((s.orgs.find(o => o.id === s.lgAutoOrg) || {}).name) || '',
      onLgPw: (e) => this.setState({ lgPw: e.target.value, lgErr: '' }),
      lgKey: (e) => { if (e.key === 'Enter') this._doLogin(); },
      lgPwType: s.lgShowPw ? 'text' : 'password',
      lgPwIcon: s.lgShowPw ? 'ph ph-eye-slash' : 'ph ph-eye',
      lgPwToggleLabel: s.lgShowPw ? '비밀번호 숨기기' : '비밀번호 보기',
      toggleLgPw: () => this.setState({ lgShowPw: !s.lgShowPw }),
      lgErr: s.lgErr,
      // 서버 로그인 (기관 공용 계정)
      srvGate: !!this.cloudBase() && !this.cloudCfg(),
      srvEmail: s.srvEmail || '',
      srvPw: s.srvPw || '',
      onSrvEmail: (e) => this.setState({ srvEmail: e.target.value, srvErr: '' }),
      onSrvPw: (e) => this.setState({ srvPw: e.target.value, srvErr: '' }),
      srvKey: (e) => { if (e.key === 'Enter') this._srvLogin(); },
      srvLogin: () => this._srvLogin(),
      srvBusy: !!s.srvBusy,
      srvBtnLabel: s.srvBusy ? '로그인 중…' : '서버 로그인',
      srvErr: s.srvErr || '',
      srvWho: (this._auth && this._auth.email) || '',
      srvLogout: () => this.setState({ dialog: {
        title: '이 기기의 서버 로그인을 해제할까요?',
        body: '서버의 데이터는 그대로 남습니다. 다시 쓰려면 기관 공용 서버 계정으로 로그인해야 합니다.',
        cta: '서버 로그아웃',
        confirm: () => { this.setState({ dialog: null }); this.authSignOut(); }
      } }),
      login: () => this._doLogin(),
      _legacyLogin: () => {
        const dev = s.role === '보조' ? 'mobile' : 'pc';
        const view = s.role === '조회' ? 'stats' : 'patients';
        this.setState({ logged: true, userId: roleOfId[s.role] || 2, device: dev, pcView: view, mobileView: 'today' });
        this.flash(s.role + ' 권한으로 로그인했습니다');
      },
      logout: () => { try { localStorage.removeItem(Component.VIEW_KEY); sessionStorage.removeItem(Component.VIEW_KEY); } catch (e) {} this.setState({ logged: false, device: Component.detectDevice() }); },

      role: myRoles.join(' · '), userName: userName, userInitial: userName.slice(0, 1),
      pcUrl: 'smartcare.hospital.kr/' + s.pcView,
      pcNav: navItems.filter(n => pcAllowedViews.indexOf(n.key) >= 0).map(n => ({
        label: n.label, icon: n.icon,
        active: n.views.indexOf(s.pcView) >= 0, inactive: n.views.indexOf(s.pcView) < 0,
        go: () => guardLeave(() => this.setState({ pcView: n.key, page: 0 }))
      })),

      ...(() => {
        // ── 좌측 메뉴 ──
        const can = (v) => pcAllowedViews.indexOf(v) >= 0;
        const adm = isSys || hasRole('관리자');
        const pend = logData.filter(l => l.status !== '확정').length;
        const consentPend = PATIENTS.filter(p => p.consent !== '동의' || p.face !== '동의').length;
        const v = s.pcView, lt = s.logTab, st = s.setTab;
        const goView = (view, extra) => () => guardLeave(() => this.setState(Object.assign({ pcView: view, page: 0, pdOpen: false, npOpen: false, nlOpen: false }, extra || {})));
        const DEF = [
          { k: 'patient', label: '환자 관리', icon: 'ph ph-users', items: [
            { k: 'roster', label: '환자 등록 관리', icon: 'ph ph-address-book', show: can('patients'), on: ['patients', 'patient', 'newPatient'].indexOf(v) >= 0, go: goView('patients') },
            { k: 'consent', label: '서면 동의서 관리', icon: 'ph ph-file-text', show: can('consent'), on: v === 'consent', go: () => guardLeave(() => this.setState({ pcView: 'consent', pdOpen: false, cpPicked: false, cpQ: '' })), badge: consentPend ? String(consentPend) : '' }
          ] },
          { k: 'program', label: '프로그램', icon: 'ph ph-note-pencil', items: [
            { k: 'calendar', label: '캘린더', icon: 'ph ph-calendar-blank', show: can('logs'), on: v === 'logs' && lt === 'calendar', go: goView('logs', { logTab: 'calendar' }) },
            { k: 'logList', label: '일지 목록 · 검수', icon: 'ph ph-notebook', show: can('logs'), on: (v === 'logs' && lt === 'list') || v === 'review', go: goView('logs', { logTab: 'list' }), badge: pend ? String(pend) : '' },
            { k: 'attendance', label: '출석부', icon: 'ph ph-user-list', show: can('logs'), on: v === 'logs' && lt === 'attendance', go: goView('logs', { logTab: 'attendance' }) },
            { k: 'album', label: '앨범', icon: 'ph ph-images', show: can('logs'), on: v === 'logs' && lt === 'album', go: goView('logs', { logTab: 'album' }) }
          ] },
          { k: 'stats', label: '통계', icon: 'ph ph-chart-bar', items: [
            { k: 'st-all', label: '전체 보기', icon: 'ph ph-squares-four', sec: 'all' },
            { k: 'st-kpi', label: '운영 지표', icon: 'ph ph-gauge', sec: 'kpi' },
            { k: 'st-06', label: '병동별 프로그램 참여', icon: 'ph ph-buildings', sec: '06' },
            { k: 'st-05', label: '월별 · 병동별 추이', icon: 'ph ph-chart-bar', sec: '05' },
            { k: 'st-04', label: '프로그램 구성 비중', icon: 'ph ph-chart-pie-slice', sec: '04' },
            { k: 'st-08', label: '프로그램 진행 상태', icon: 'ph ph-calendar-check', sec: '08' },
            { k: 'st-07', label: '병동별 건수 · 비율', icon: 'ph ph-table', sec: '07' }
          ].map(x => Object.assign(x, { show: can('stats'), on: v === 'stats' && (s.statSec || 'all') === x.sec, go: goView('stats', { fetch: 'ready', statSec: x.sec }) })) },
          { k: 'settings', label: '설정', icon: 'ph ph-gear', items: [
            { k: 'set-ai', label: 'AI 판독 파라미터', icon: 'ph ph-scan-smiley', show: can('settings'), on: v === 'settings' && st === 'ai', go: goView('settings', { setTab: 'ai' }) },
            { k: 'set-consent', label: '동의서식 관리', icon: 'ph ph-article', show: can('settings'), on: v === 'settings' && st === 'consent', go: goView('settings', { setTab: 'consent' }) },
            { k: 'set-program', label: '프로그램 관리', icon: 'ph ph-squares-four', show: can('settings'), on: v === 'settings' && st === 'program', go: goView('settings', { setTab: 'program' }) },
            { k: 'set-ward', label: '병동 · 호실', icon: 'ph ph-bed', show: can('settings'), on: v === 'settings' && st === 'ward', go: goView('settings', { setTab: 'ward' }) },
            { k: 'set-staff', label: '계정 · 권한', icon: 'ph ph-identification-badge', show: can('settings'), on: v === 'settings' && st === 'staff', go: goView('settings', { setTab: 'staff' }) },
            { k: 'set-org', label: '기관 관리', icon: 'ph ph-buildings', show: can('settings') && isSys, on: v === 'settings' && st === 'org', go: goView('settings', { setTab: 'org' }) },
            { k: 'set-cloud', label: '데이터 서버', icon: 'ph ph-cloud', show: can('settings') && isSys, on: v === 'settings' && st === 'cloud', go: goView('settings', { setTab: 'cloud' }) }
          ] }
        ];
        // 메뉴 순서는 사용자(계정)별로 저장 — 다른 PC에서 같은 계정으로 로그인해도 유지
        const myMenu = me && me.menuOrder;
        const ord = myMenu || s.menuOrder || {};
        const sortBy = (list, keys) => {
          if (!keys || !keys.length) return list;
          return list.slice().sort((a, b) => {
            const ia = keys.indexOf(a.k), ib = keys.indexOf(b.k);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
          });
        };
        const narrow = (s.vw || 1600) < 1100;
        const editing = !!s.menuEdit, mini = narrow ? !s.menuExpandNarrow : !!s.menuMini;
        const col = s.menuCollapsed || {};
        const saveOrder = (next) => {
          const list = this.state.roster.map(x => x.id === me.id ? Object.assign({}, x, { menuOrder: next }) : x);
          this.setState({ roster: list, menuOrder: next, menuDrag: null, menuOver: null });
          this.saveRoster(list);
        };
        const groupsSorted = sortBy(DEF, ord.groups).map(g => Object.assign({}, g, { items: sortBy(g.items, (ord.items || {})[g.k]).filter(i => i.show) })).filter(g => g.items.length);
        const dr = s.menuDrag, ov = s.menuOver;
        const moveIn = (arr, from, to) => { const a = arr.slice(); const fi = a.indexOf(from); const ti = a.indexOf(to); if (fi < 0 || ti < 0 || fi === ti) return a; a.splice(fi, 1); a.splice(ti, 0, from); return a; };
        const sbGroups = groupsSorted.map(g => {
          const isDragG = dr && dr.t === 'g' && dr.k === g.k;
          const isOverG = dr && dr.t === 'g' && ov === 'g:' + g.k && !isDragG;
          const open = mini || editing || !col[g.k];
          const gOn = g.items.some(i => i.on);
          const gCount = g.items.reduce((n, i) => n + (parseInt(i.badge, 10) || 0), 0);
          return {
            label: g.label, icon: g.icon, open: open, openStr: open ? '1' : '0', key: g.k,
            headBg: gOn ? 'linear-gradient(180deg, var(--color-neutral-800), var(--color-neutral-900))' : 'linear-gradient(180deg, var(--color-neutral-800), var(--color-surface))',
            headBd: gOn ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
            headFg: gOn ? 'var(--color-text)' : 'var(--color-neutral-200)',
            iconBg: gOn ? 'var(--color-accent-800)' : 'var(--color-neutral-900)',
            iconFg: gOn ? 'var(--color-accent-100)' : 'var(--color-accent-400)',
            hasCount: !open && gCount > 0, count: String(gCount),
            caret: col[g.k] ? 'ph ph-caret-right' : 'ph ph-caret-down',
            cursor: 'pointer',
            showGrip: !mini,
            draggable: true,
            ring: isOverG ? '0 0 0 2px var(--color-accent)' : 'none',
            opacity: isDragG ? '0.45' : '1',
            toggle: () => { if (mini) return; const c = Object.assign({}, col); c[g.k] = !c[g.k]; this.setState({ menuCollapsed: c }); try { localStorage.setItem('smartcare.menuCollapsed.v1', JSON.stringify(c)); } catch (e) {} },
            dragStart: (e) => { e.stopPropagation(); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'g:' + g.k); } this.setState({ menuDrag: { t: 'g', k: g.k } }); },
            dragOver: (e) => { const d = this.state.menuDrag; if (!d || d.t !== 'g') return; e.preventDefault(); if (this.state.menuOver !== 'g:' + g.k) this.setState({ menuOver: 'g:' + g.k }); },
            drop: (e) => {
              const d = this.state.menuDrag; if (!d || d.t !== 'g') return;
              e.preventDefault(); e.stopPropagation();
              const keys = groupsSorted.map(x => x.k);
              const next = Object.assign({}, ord, { groups: moveIn(keys, d.k, g.k) });
              saveOrder(next); this.flash(DEF.find(x => x.k === d.k).label + ' 메뉴 위치 변경 — ' + userName + '님 계정에 저장');
            },
            items: g.items.map(it => {
              const isDrag = dr && dr.t === 'i' && dr.g === g.k && dr.k === it.k;
              const isOver = dr && dr.t === 'i' && dr.g === g.k && ov === 'i:' + it.k && !isDrag;
              return {
                label: it.label, icon: it.icon, current: it.on ? 'page' : 'false',
                hasBadge: !!it.badge, badge: it.badge || '',
                bg: it.on ? 'var(--color-accent-900)' : 'transparent',
                fg: it.on ? 'var(--color-accent-100)' : 'var(--color-neutral-300)',
                bd: it.on ? 'var(--color-accent)' : 'transparent',
                shadow: it.on ? 'inset 0 1px 0 rgba(233,233,237,0.08), 0 0 10px color-mix(in oklch, var(--color-accent) 22%, transparent)' : 'none',
                iconColor: it.on ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
                cursor: 'pointer',
                showGrip: !mini,
                draggable: true,
                ring: isOver ? '0 0 0 2px var(--color-accent)' : 'none',
                opacity: isDrag ? '0.45' : '1',
                go: () => it.go(),
                dragStart: (e) => { e.stopPropagation(); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'i:' + it.k); } this.setState({ menuDrag: { t: 'i', g: g.k, k: it.k } }); },
                dragOver: (e) => { const d = this.state.menuDrag; if (!d || d.t !== 'i' || d.g !== g.k) return; e.preventDefault(); e.stopPropagation(); if (this.state.menuOver !== 'i:' + it.k) this.setState({ menuOver: 'i:' + it.k }); },
                drop: (e) => {
                  const d = this.state.menuDrag; if (!d || d.t !== 'i' || d.g !== g.k) return;
                  e.preventDefault(); e.stopPropagation();
                  const all = sortBy(DEF.find(x => x.k === g.k).items, (ord.items || {})[g.k]).map(x => x.k);
                  const items = Object.assign({}, ord.items || {}); items[g.k] = moveIn(all, d.k, it.k);
                  saveOrder(Object.assign({}, ord, { items: items }));
                  this.flash(it.label + ' 위치로 이동');
                }
              };
            })
          };
        });
        // 현재 위치 (상단 고정 바: 메뉴 › 화면)
        let crumbG = '', crumbI = '';
        DEF.forEach(gg => (gg.items || []).forEach(it => { if (it.on && it.show !== false && !crumbI) { crumbG = gg.label || ''; crumbI = it.label || ''; } }));
        return {
          crumbGroup: crumbG, crumbItem: crumbI, crumbHasGroup: !!crumbG && crumbG !== crumbI,
          sbGroups: sbGroups,
          sbRef: this._sbRef,
          sbH: (s.sbH ? s.sbH + 'px' : '100vh'),
          sbFull: !mini, sbMini: mini, sbEditing: editing && !mini, sbNotEditing: !editing,
          sbWidth: mini ? '64px' : (s.sbW || 248) + 'px',
          sbResizable: !mini,
          sbResizeStart: (e) => {
            e.preventDefault();
            const x0 = e.clientX, w0 = this.state.sbW || 248;
            const move = (ev) => { const w = Math.max(190, Math.min(440, w0 + ev.clientX - x0)); if (w !== this.state.sbW) this.setState({ sbW: w }); };
            const up = () => {
              window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
              document.body.style.cursor = ''; document.body.style.userSelect = '';
              try { localStorage.setItem('smartcare.sbW.v1', String(this.state.sbW || 248)); } catch (err) {}
            };
            document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
          },
          sbResizeReset: () => { this.setState({ sbW: 248 }); try { localStorage.removeItem('smartcare.sbW.v1'); } catch (e) {} },
          sbJustify: mini ? 'center' : 'flex-start',
          sbItemPad: mini ? 'var(--space-3)' : 'var(--space-3)',
          sbSubIndent: mini ? '0' : '17px',
          sbSubPad: mini ? '0' : '10px',
          sbSubLine: mini ? 'none' : '1px solid var(--color-neutral-700)',
          sbMiniIcon: mini ? 'ph ph-sidebar-simple' : 'ph ph-caret-double-left',
          sbMiniLabel: mini ? '메뉴 펼치기' : '메뉴 접기',
          sbToggleMini: () => {
            if (narrow) { this.setState({ menuExpandNarrow: mini, menuEdit: false }); return; }
            const m = !mini; this.setState({ menuMini: m, menuEdit: false }); try { localStorage.setItem('smartcare.menuMini.v1', m ? '1' : '0'); } catch (e) {}
          },
          sbToggleEdit: () => { this.setState({ menuEdit: !editing, menuDrag: null, menuOver: null }); if (editing) this.flash('메뉴 순서를 저장했습니다'); },
          sbReset: () => { saveOrder(null); this.flash(userName + '님 메뉴를 기본 순서로 되돌렸습니다'); },
          sbDragEnd: () => this.setState({ menuDrag: null, menuOver: null })
        };
      })(),
      // 계정 목록은 표가 넓어 창 너비 전체 사용
      ...(() => {
        const sec = (s.statSec === 'reports' ? 'all' : s.statSec) || 'all';
        const all = sec === 'all';
        const NAMES = { kpi: '운영 지표', '06': 'ST-06 병동별 프로그램 참여', '05': 'ST-05 월별 · 병동별 추이', '04': 'ST-04 프로그램 구성 비중', '08': 'ST-08 프로그램 진행 상태', '07': 'ST-07 병동별 건수 · 비율', reports: '리포트 목록' };
        const f = (on, d) => on ? (d || 'flex') : 'none';
        return {
          stTitle: all ? '통계' : '통계 · ' + (NAMES[sec] || ''),
          stSub: '위에서 기간과 병동을 고르면 모든 통계에 바로 반영됩니다 · 확정 데이터만 집계',
          stShowPeriod: 'flex',
          stShowKpi: f(all || sec === 'kpi', 'grid'),
          stShow06: f(all || sec === '06'),
          stShow05: f(all || sec === '05'),
          stShow04: f(all || sec === '04'),
          stShow08: f(all || sec === '08'),
          stShow07: f(all || sec === '07')
        };
      })(),
      pcPadX: (s.vw || 1600) < 900 ? 'var(--space-4)' : 'var(--space-8)',
      // 모든 메뉴 같은 화면 폭 (계정 목록 한 줄 표가 들어가는 폭으로 통일)
      pcMaxW: '1640px',
      pcDenied: pcDenied,
      deniedReason: !canViewStats
        ? '보조 계정(자원봉사자·실습생)은 배정된 프로그램의 사진 업로드만 가능합니다. 환자 명부와 동의서는 열 수 없습니다.'
        : '조회 계정(원무·행정)은 통계 대시보드만 볼 수 있습니다. 개인 식별 정보는 마스킹됩니다.',
      deniedCta: canViewStats ? '통계로 이동' : '로그아웃',
      goAllowed: () => {
        if (canViewStats) this.setState({ pcView: 'stats' });
        else { this.setState({ logged: false }); this.flash('이 계정은 스마트폰 현장 앱에서 사용하세요'); }
      },

      viewPatients: !pcDenied && s.pcView === 'patients',
      viewPatient: !pcDenied && (s.pcView === 'patient' || (!!s.pdOpen && s.pcView === 'patients')),
      viewNewPatient: !pcDenied && (s.pcView === 'newPatient' || !!s.npOpen),
      npModal: !!s.npOpen, npInline: !s.npOpen,
      npResizable: !!s.npOpen && !((s.win || {}).np || {}).max && !((s.win || {}).np || {}).min,
      npDragCursor: s.npOpen && !((s.win || {}).np || {}).max ? 'move' : 'default',
      pdResizable: !!s.pdOpen && !((s.win || {}).pd || {}).max && !((s.win || {}).pd || {}).min,
      pdDragCursor: s.pdOpen && !((s.win || {}).pd || {}).max ? 'move' : 'default',
      pdDragTitle: s.pdOpen ? '끌어서 이동 · 더블클릭으로 최대화' : '',
      npSub: s.formMode === 'edit' ? '수정 내용은 저장 즉시 명부와 안면인식 Collection에 반영됩니다.' : '저장하면 증명사진이 안면인식 Collection에 등록되고, 명부에 바로 추가됩니다.',
      npBackdropClass: s.npOpen ? 'dialog-backdrop' : '',
      npRole: s.npOpen ? 'dialog' : 'region',
      npPos: s.npOpen ? 'fixed' : 'static',
      npPad: s.npOpen ? (((s.win || {}).np || {}).max ? '16px' : 'calc(var(--space-8) * 1.5) var(--space-6)') : '0',
      npMaxW: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').maxW : 'none',
      npW: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').width : '100%',
      npH: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').height : 'auto',
      npTf: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').tf : 'none',
      npOv: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').overflow : 'visible',
      npInH: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').innerH : 'auto',
      npInMaxH: s.npOpen ? this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)').innerMaxH : 'none',
      npInnerPad: s.npOpen ? 'calc(var(--space-8) * 1.2)' : '0',
      npBg: s.npOpen ? 'var(--color-bg)' : 'transparent',
      npShadow: s.npOpen ? 'var(--shadow-lg)' : 'none',
      npKey: (e) => { if (e.key === 'Escape' && s.npOpen) this.setState({ npOpen: false, comboOpen: null, ...this.backToAssign() }); },
      closeNewPatient: () => s.npOpen ? this.setState({ npOpen: false, comboOpen: null, ...this.backToAssign() }) : this.setState({ pcView: s.formMode === 'edit' ? 'patient' : 'patients' }),
      viewConsentPc: !pcDenied && s.pcView === 'consent',
      viewLogs: !pcDenied && (s.pcView === 'logs' || s.pcView === 'attendance'),
      viewReviewPc: !pcDenied && s.pcView === 'review',
      viewNewLogPc: !pcDenied && (s.pcView === 'newLogPc' || (!!s.nlOpen && s.device === 'pc')),
      goNewLogPc: () => { const d = this.todayIso(); this.switchSession(d + '|' + this.state.program, { nlOpen: true, pcView: this.state.pcView === 'newLogPc' ? 'logs' : this.state.pcView, logDate: d, logPlace: this.state.logPlace || '프로그램실' }); },
      nlWin: this.winVals('nl', '1180px', 'calc(100px + var(--space-8) * 2.4)'),
      nlPad: ((s.win || {}).nl || {}).max ? '16px' : 'calc(var(--space-8) * 1.5) var(--space-6)',
      nlResizable: !((s.win || {}).nl || {}).max && !((s.win || {}).nl || {}).min,
      closeNewLogPc: () => this.setState({ nlOpen: false, pcView: this.state.pcView === 'newLogPc' ? 'logs' : this.state.pcView }),
      nlKey: (e) => { if (e.key === 'Escape' && !this.state.dialog) this.setState({ nlOpen: false, pcView: this.state.pcView === 'newLogPc' ? 'logs' : this.state.pcView }); },
      hasPendingReview: logData.some(l => l.status === '검수 필요'),
      pendingReviewCount: logData.filter(l => l.status === '검수 필요').length,
      ...logFilterVals,
      goPendingReview: () => {
        const idx = logData.map((l, i) => ({ l, i })).filter(x => x.l.status === '검수 필요')
          .sort((a, b) => String(a.l.date || '').localeCompare(String(b.l.date || '')))[0];
        const r = idx ? logRowsAll[idx.i] : null;
        if (r) r.open();
      },
      reviewHelpOpen: !!s.reviewHelpOpen,
      toggleReviewHelp: () => this.setState({ reviewHelpOpen: !s.reviewHelpOpen }),
      thresholdLabel: (this.props.threshold ?? 90) + '%',
      viewStats: !pcDenied && s.pcView === 'stats',
      viewSettings: !pcDenied && s.pcView === 'settings',

      // 명부
      rosterLine: '전체 ' + PATIENTS.length + '명 (재원 ' + PATIENTS.filter(p => (p.stay || '재원') === '재원').length + ' · 퇴원 ' + PATIENTS.filter(p => p.stay === '퇴원').length + ' · 임종 ' + PATIENTS.filter(p => p.stay === '임종').length + ') · 동의 미완료 ' + PATIENTS.filter(p => p.consent !== '동의').length + '명 · 증명사진 미확보 ' + PATIENTS.filter(p => !p.photo).length + '명',
      // 8a 요약 칩: 누르면 바로 해당 조건으로 목록 필터
      rosterChips: (() => {
        const stayF = s.stayFilter || '전체';
        const on = (k) => (k === 'all' && stayF === '전체' && !s.pendingOnly && !s.noPhotoOnly) || (k === stayF && !s.pendingOnly && !s.noPhotoOnly) || (k === 'pend' && s.pendingOnly) || (k === 'nophoto' && s.noPhotoOnly);
        const mk = (k, label, n, title, patch) => {
          const a = on(k);
          return { label: label, n: n, title: title,
            bd: a ? 'var(--color-accent)' : 'var(--color-neutral-700)', bg: a ? 'var(--color-accent-900)' : 'var(--color-neutral-900)', fg: a ? 'var(--color-accent-100)' : 'var(--color-neutral-300)',
            go: () => this.setState(Object.assign({ page: 0, pendingOnly: false, noPhotoOnly: false, stayFilter: '전체' }, patch)) };
        };
        return [
          mk('all', '전체', PATIENTS.length, '전체 환자 보기', {}),
          mk('재원', '재원', PATIENTS.filter(p => (p.stay || '재원') === '재원').length, '재원 환자만', { stayFilter: '재원' }),
          mk('퇴원', '퇴원', PATIENTS.filter(p => p.stay === '퇴원').length, '퇴원 환자만', { stayFilter: '퇴원' }),
          mk('pend', '동의 미완료', PATIENTS.filter(p => p.consent !== '동의').length, '동의 미완료 환자만', { pendingOnly: true }),
          mk('nophoto', '사진 미확보', PATIENTS.filter(p => !(s.photoUrls[p.id] || p.photo)).length, '증명사진 없는 환자만', { noPhotoOnly: true })
        ].concat(PATIENTS.some(p => p.stay === '임종') ? [mk('임종', '임종', PATIENTS.filter(p => p.stay === '임종').length, '임종 환자만', { stayFilter: '임종' })] : []);
      })(),
      // 업무 진행 현황 (재원 환자 · 이번 달 일지 · 검수) — 표현 방식 선택
      ...(() => {
        const inStay = PATIENTS.filter(p => (p.stay || '재원') === '재원');
        const T = inStay.length;
        const photoN = inStay.filter(p => s.photoUrls[p.id] || p.photo).length;
        const fc = (v) => inStay.filter(p => (p.face || '확인전') === v).length;
        const faceY = fc('동의'), faceN = fc('미동의'), faceQ = T - faceY - faceN;
        const today = this.todayIso(), ym = today.slice(0, 7);
        const all = Object.assign({}, s.sessions || {});
        if (s.activeSession) all[s.activeSession] = { review: s.review, confirmed: s.confirmed, photos: s.photos };
        const keys = Object.keys(all).filter(k => all[k] && ((all[k].review || []).length || (all[k].photos || []).length));
        const monthLogs = keys.filter(k => k.slice(0, 7) === ym);
        const monthPlans = (s.plans || []).filter(p => p.date.slice(0, 7) === ym && p.date <= today && p.status !== '취소');
        const planKeys = monthPlans.map(p => p.date + '|' + p.program);
        const missing = planKeys.filter(k => !keys.includes(k)).length;
        const logDen = Math.max(monthLogs.length + missing, monthLogs.length);
        const waiting = keys.filter(k => !all[k].confirmed).length, confN = keys.filter(k => all[k].confirmed).length;
        const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
        const C = 276.46;
        const G = 'oklch(0.76 0.14 145)', B = 'oklch(0.74 0.12 230)', Y = 'oklch(0.82 0.13 85)', R = 'oklch(0.70 0.17 25)', N = 'var(--color-neutral-600)';
        const st = (p) => p >= 90 ? { t: '양호', bg: 'oklch(0.32 0.06 150)', fg: 'oklch(0.90 0.07 150)' } : p >= 50 ? { t: '진행 중', bg: 'oklch(0.33 0.07 85)', fg: 'oklch(0.93 0.07 85)' } : { t: '확인 필요', bg: 'oklch(0.32 0.08 25)', fg: 'oklch(0.92 0.05 25)' };
        const go = {
          photo: () => this.setState({ pcView: 'patients', noPhotoOnly: true, stayFilter: '재원', page: 0 }),
          face: () => this.setState({ pcView: 'consent' }),
          logs: () => this.setState({ pcView: 'logs', logTab: 'list', logFilter: '미작성' }),
          review: () => this.setState({ pcView: 'logs', logTab: 'list', logFilter: '검수 필요' })
        };
        const cards = [
          { k: 'photo', kicker: '1 · 등록', title: '증명사진 확보', icon: 'ph ph-identification-card', color: B, a: photoN, b: T, unit: '명',
            sub: T - photoN ? '사진 없음 ' + (T - photoN) + '명' : '모두 확보', segs: [{ label: '확보', n: photoN, c: B }, { label: '없음', n: T - photoN, c: N }] },
          { k: 'face', kicker: '2 · 동의', title: '생체정보 동의', icon: 'ph ph-scan-smiley', color: G, a: faceY, b: T, unit: '명',
            sub: faceQ ? '확인전 ' + faceQ + '명 · 미동의 ' + faceN + '명' : '미동의 ' + faceN + '명', segs: [{ label: '동의', n: faceY, c: G }, { label: '미동의', n: faceN, c: R }, { label: '확인전', n: faceQ, c: N }] },
          { k: 'logs', kicker: '3 · 기록', title: (Number(ym.slice(5))) + '월 일지', icon: 'ph ph-notebook', color: Y, a: monthLogs.length, b: logDen, unit: '건',
            sub: missing ? '미작성 ' + missing + '건' : (logDen ? '빠짐없이 작성' : '이번 달 일정 없음'), segs: [{ label: '작성', n: monthLogs.length, c: Y }, { label: '미작성', n: missing, c: R }] },
          { k: 'review', kicker: '4 · 검수', title: '확정 대기', icon: 'ph ph-seal-check', color: waiting ? R : G, a: confN, b: confN + waiting, unit: '건', mainOverride: waiting + '건', ofOverride: '대기',
            sub: waiting ? '확정 ' + confN + '건 · 대기 ' + waiting + '건' : '대기 없음 · 확정 ' + confN + '건', segs: [{ label: '확정', n: confN, c: G }, { label: '대기', n: waiting, c: R }] }
        ].map(c => {
          const p = pct(c.a, c.b), sv = st(p);
          const tot = c.segs.reduce((n, g) => n + g.n, 0) || 1;
          return {
            kicker: c.kicker, title: c.title, icon: c.icon, color: c.color,
            main: c.mainOverride || c.a, of: c.ofOverride || ('/ ' + c.b + c.unit),
            pctLabel: c.b ? p + '%' : '—', dash: (C * p / 100).toFixed(1) + ' ' + C, barW: p + '%',
            glow: 'drop-shadow(0 0 6px color-mix(in oklch, ' + c.color + ' 50%, transparent))',
            sub: c.sub, subColor: p >= 90 || !c.b ? 'var(--color-neutral-400)' : 'oklch(0.86 0.10 60)',
            state: c.b ? sv.t : '해당 없음', stateBg: c.b ? sv.bg : 'var(--color-neutral-800)', stateFg: c.b ? sv.fg : 'var(--color-neutral-400)',
            segs: c.segs.map(g => ({ label: g.label, n: g.n, c: g.c, w: (g.n / tot * 100) + '%', tip: g.label + ' ' + g.n })),
            go: go[c.k]
          };
        });
        const fv = s.flowView || 'ring';
        return {
          flowCards: cards,
          flowRing: fv === 'ring' ? 'grid' : 'none', flowBars: fv === 'bars' ? 'flex' : 'none', flowSteps: fv === 'steps' ? 'grid' : 'none',
          flowViewOpts: [{ k: 'ring', label: '게이지', icon: 'ph ph-circle-notch' }, { k: 'bars', label: '구성 막대', icon: 'ph ph-chart-bar-horizontal' }, { k: 'steps', label: '단계 흐름', icon: 'ph ph-flow-arrow' }].map(o => ({
            label: o.label, icon: o.icon, on: fv === o.k, off: fv !== o.k,
            go: () => { this.setState({ flowView: o.k }); try { localStorage.setItem('smartcare.flowView.v1', o.k); } catch (e) {} }
          }))
        };
      })(),
      search: s.search,
      onSearch: (e) => this.setState({ search: e.target.value, page: 0 }),
      stayOpts: ['전체', '재원', '퇴원', '임종'].map(k => {
        const cur = s.stayFilter || '전체';
        const pool = PATIENTS.filter(p => !(s.wardSel || []).length || (s.wardSel || []).some(w => p.room.indexOf(w + ' ') === 0));
        return {
          label: k, active: cur === k, inactive: cur !== k,
          count: k === '전체' ? pool.length : pool.filter(p => (p.stay || '재원') === k).length,
          dot: k === '재원' ? 'var(--color-accent)' : k === '임종' ? 'var(--color-neutral-300)' : k === '퇴원' ? 'var(--color-neutral-600)' : 'transparent',
          go: () => this.setState({ stayFilter: k, page: 0 })
        };
      }),
      wardOpts: ['전체'].concat(savedWards.map(w => w.name)).map(w => {
        const sel = (s.wardSel || []).filter(x => savedWards.some(v => v.name === x));
        const on = w === '전체' ? sel.length === 0 : sel.indexOf(w) >= 0;
        const cnt = w === '전체' ? PATIENTS.length : PATIENTS.filter(p => (p.room || '').indexOf(w + ' ') === 0).length;
        return {
          label: w, active: on, inactive: !on, count: cnt,
          go: () => {
            if (w === '전체') { this.setState({ wardSel: [], ward: '전체', page: 0 }); return; }
            let next = on ? sel.filter(x => x !== w) : sel.concat([w]);
            if (next.length === savedWards.length) next = [];
            this.setState({ wardSel: next, ward: next.length === 1 ? next[0] : '전체', page: 0 });
          }
        };
      }),
      wardOptsHidden: [],
      wardTabHint: (() => { const sel = (s.wardSel || []).filter(x => savedWards.some(v => v.name === x)); return sel.length > 1 ? sel.length + '개 병동 선택 · 다시 누르면 해제' : '여러 병동을 함께 고를 수 있습니다'; })(),
      wardSelNote: (() => { const sel = (s.wardSel || []).filter(x => savedWards.some(v => v.name === x)); return sel.length > 1 ? sel.length + '개 병동 선택' : ''; })(),
      hasWardSelNote: (s.wardSel || []).filter(x => savedWards.some(v => v.name === x)).length > 1,
      pendingOnly: s.pendingOnly, notPendingOnly: !s.pendingOnly,
      togglePending: () => this.setState({ pendingOnly: !s.pendingOnly, page: 0 }),
      canDeletePatient: hasRole('관리자') || hasRole('담당자'),
      askDeletePatient: () => {
        if (!(hasRole('관리자') || hasRole('담당자'))) { this.flash('삭제 권한이 없습니다 (관리자 · 담당자 전용)'); return; }
        const target = sel;
        this.setState({
          dialog: {
            title: target.name + ' 환자 정보를 삭제할까요?',
            body: target.room + ' · ' + target.id + '\n명부, 증명사진, 안면인식 등록, 동의서 첨부가 삭제되며 되돌릴 수 없습니다. 삭제 내역은 ' + userName + ' 이름으로 이력에 기록됩니다.',
            cta: '삭제',
            confirm: () => {
              const idx = PATIENTS.findIndex(p => p.id === target.id);
              if (idx >= 0) PATIENTS.splice(idx, 1);
              const map = Object.assign({}, this.state.photoUrls); delete map[target.id];
              const strip = (list) => (list || []).filter(r => r.id !== target.id);
              const sessions = {};
              Object.keys(this.state.sessions || {}).forEach(k => { const v = this.state.sessions[k]; sessions[k] = Object.assign({}, v, { review: strip(v.review) }); });
              this.persistPatients(map);
              const next = PATIENTS[0];
              this.setState({ photoUrls: map, review: strip(this.state.review), sessions: sessions, sel: next ? next.id : null, dialog: null, pcView: 'patients', pdOpen: false, page: 0 });
              this.flash(target.name + ' (' + target.id + ') 삭제 완료');
            }
          }
        });
      },
      noPhotoOnly: !!s.noPhotoOnly, notNoPhotoOnly: !s.noPhotoOnly,
      noPhotoCount: PATIENTS.filter(p => !(s.photoUrls[p.id] || p.photo)).length,
      toggleNoPhoto: () => this.setState({ noPhotoOnly: !s.noPhotoOnly, page: 0 }),

      isLoading: s.fetch === 'loading',
      isError: s.fetch === 'error',
      isEmpty: s.fetch === 'empty' || (s.fetch === 'ready' && filtered.length === 0),
      isReady: s.fetch === 'ready' && filtered.length > 0,
      skeletons: [1, 2, 3, 4],
      emptyTitle: s.fetch === 'empty' ? '아직 등록된 환자가 없습니다' : '조건에 맞는 환자가 없습니다',
      emptyBody: s.fetch === 'empty'
        ? '환자를 등록하면 증명사진이 안면인식 Collection에 등록되고, 다음 프로그램부터 자동 출석이 시작됩니다.'
        : '검색어나 병동·재원상태·동의 필터를 바꿔보세요.',
      resetFilters: () => this.setState({ search: '', ward: '전체', wardSel: [], stayFilter: '전체', pendingOnly: false, noPhotoOnly: false, page: 0, fetch: 'ready' }),
      retry: () => { this.setState({ fetch: 'loading' }); clearTimeout(this._a); this._a = setTimeout(() => this.setState({ fetch: 'ready' }), 1200); },

      pagePatients: pageItems.map(p => ({
        name: p.name, sexAge: p.sex + ' · 만 ' + p.age + '세',
        meta: p.room + ' · ' + (p.chartNo ? '등록번호 ' + p.chartNo : '등록번호 없음') + (p.admitDate ? ' · 입원 ' + p.admitDate : '') + ' · ' + p.last,
        consentOk: p.consent === '동의', consentNo: p.consent !== '동의',
        consentLabel: '동의 ' + p.consent,
        stay: p.stay || '재원',
        stayBg: (p.stay || '재원') === '재원' ? 'var(--color-accent-900)' : 'var(--color-neutral-900)',
        stayColor: (p.stay || '재원') === '재원' ? 'var(--color-accent-200)' : ((p.stay === '임종') ? 'var(--color-neutral-300)' : 'var(--color-neutral-400)'),
        stayRing: (p.stay || '재원') === '재원' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
        stayDot: (p.stay || '재원') === '재원' ? 'var(--color-accent)' : ((p.stay === '임종') ? 'var(--color-neutral-300)' : 'var(--color-neutral-600)'),
        needsGuardian: !!p.guardian, noPhoto: !p.photo,
        photoUrl: s.photoUrls[p.id] || '',
        thumb: this.img(s.photoUrls[p.id], p.name + ' 증명사진'),
        hasPhoto: !!s.photoUrls[p.id], blankPhoto: !s.photoUrls[p.id],
        selected: p.id === s.sel, unselected: p.id !== s.sel,
        room: p.room, pid: p.chartNo || '—', sexAgeShort: p.sex + ' ' + p.age, consentShort: p.consent,
        cells: this.ptColOrder(s).map(k => {
          const st = p.stay || '재원';
          const days = (() => { if (!p.admitDate || st !== '재원') return ''; const d = Math.floor((new Date(this.todayIso() + 'T00:00:00') - new Date(p.admitDate + 'T00:00:00')) / 86400000); return d >= 0 ? ' · ' + (d + 1) + '일째' : ''; })();
          const T = (txt, color, sub) => ({ isText: true, isStay: false, isConsentOk: false, isConsentNo: false, txt: txt, color: color || 'var(--color-text)', sub: sub || '' });
          if (k === 'stay') return { isText: false, isStay: true, isConsentOk: false, isConsentNo: false, txt: st, color: 'var(--color-text)', dot: st === '재원' ? 'var(--color-accent)' : st === '임종' ? 'var(--color-neutral-300)' : 'var(--color-neutral-600)', sub: '' };
          if (k === 'consent') { const ok = p.consent === '동의'; return { isText: false, isStay: false, isConsentOk: ok, isConsentNo: !ok, txt: p.consent || '확인전', color: 'var(--color-text)', sub: '' }; }
          if (k === 'room') return T(p.room);
          if (k === 'id') return T(p.chartNo || '—', 'var(--color-neutral-400)');
          if (k === 'name') return T(p.name);
          if (k === 'age') return T(p.sex + ' ' + p.age, 'var(--color-neutral-400)');
          if (k === 'admit') return T(p.admitDate || '—', 'var(--color-neutral-300)', p.dischargeDate && st !== '재원' ? ' → 퇴원 ' + p.dischargeDate : days);
          if (k === 'recent') return T(String(p.last || '').replace('최근 참여 ', ''), 'var(--color-neutral-400)');
          return T('');
        }),
        admit: p.admitDate || '—',
        admitDays: (() => {
          if (!p.admitDate || (p.stay || '재원') !== '재원') return '';
          const d = Math.floor((new Date(this.todayIso() + 'T00:00:00') - new Date(p.admitDate + 'T00:00:00')) / 86400000);
          return d >= 0 ? ' · ' + (d + 1) + '일째' : '';
        })(),
        lastShort: String(p.last || '').replace('최근 참여 ', ''),
        rowBg: p.id === s.sel ? 'var(--color-accent-900)' : 'transparent',
        open: () => this.setState({ sel: p.id, pdOpen: true })
      })),
      pdWin: this.winVals('pd', '1180px'),
      npWin: this.winVals('np', '1080px', 'calc(100px + var(--space-8) * 2.4)'),
      pdModal: !!s.pdOpen, pdInline: !s.pdOpen,
      pdBackdropClass: s.pdOpen ? 'dialog-backdrop' : '',
      pdRole: s.pdOpen ? 'dialog' : 'region',
      pdPos: s.pdOpen ? 'fixed' : 'static',
      pdPad: s.pdOpen ? (((s.win || {}).pd || {}).max ? '16px' : 'calc(var(--space-8) * 1.5) var(--space-6)') : '0',
      pdMaxW: s.pdOpen ? this.winVals('pd', '1180px').maxW : 'none',
      pdW: s.pdOpen ? this.winVals('pd', '1180px').width : '100%',
      pdH: s.pdOpen ? this.winVals('pd', '1180px').height : 'auto',
      pdTf: s.pdOpen ? this.winVals('pd', '1180px').tf : 'none',
      pdOv: s.pdOpen ? this.winVals('pd', '1180px').overflow : 'visible',
      pdInH: s.pdOpen ? this.winVals('pd', '1180px').innerH : 'auto',
      pdInMaxH: s.pdOpen ? this.winVals('pd', '1180px').innerMaxH : 'none',
      pdInnerPad: s.pdOpen ? 'calc(var(--space-8) * 1.2)' : '0',
      pdBg: s.pdOpen ? 'var(--color-bg)' : 'transparent',
      pdShadow: s.pdOpen ? 'var(--shadow-lg)' : 'none',
      pdBackdropDown: (e) => { this._pdDownOnBackdrop = e.target === e.currentTarget; },
      pdBackdropClick: (e) => {
        const ok = this._pdDownOnBackdrop && e.target === e.currentTarget && !this._winDragged;
        this._pdDownOnBackdrop = false;
        // 바탕 클릭으로는 닫지 않음 — ✕ 버튼 또는 Esc로만 닫기
        void ok;
      },
      pdStop: (e) => e.stopPropagation(),
      pdKey: (e) => { if (e.key === 'Escape' && this.state.pdOpen && !this.state.npOpen && !this.state.dialog) this.setState({ pdOpen: false }); },
      closePatientPopup: () => this.setState({ pdOpen: false }),
      pdPos2: (() => { const i = filtered.findIndex(p => p.id === s.sel); return i >= 0 ? (i + 1) + ' / ' + filtered.length : ''; })(),
      pdIsFirst: filtered.findIndex(p => p.id === s.sel) <= 0,
      pdIsLast: (() => { const i = filtered.findIndex(p => p.id === s.sel); return i < 0 || i >= filtered.length - 1; })(),
      pdPrev: () => { const i = filtered.findIndex(p => p.id === this.state.sel); if (i > 0) this.setState({ sel: filtered[i - 1].id }); },
      pdNext: () => { const i = filtered.findIndex(p => p.id === this.state.sel); if (i >= 0 && i < filtered.length - 1) this.setState({ sel: filtered[i + 1].id }); },
      filteredCount: filtered.length,
      sortKey: sortKey,
      onSortKey: (e) => this.setState({ sortKey: e.target.value, sortDir: 'asc', page: 0 }),
      toggleSortDir: () => this.setState({ sortDir: sortDir === 1 ? 'desc' : 'asc', page: 0 }),
      sortDirIcon: sortDir === 1 ? 'ph ph-sort-ascending' : 'ph ph-sort-descending',
      sortDirLabel: sortDir === 1 ? '오름차순 (누르면 내림차순)' : '내림차순 (누르면 오름차순)',
      perPage: String(per),
      onPerPage: (e) => this.setState({ perPage: parseInt(e.target.value, 10), page: 0 }),
      viewModes: [{ k: 'table', label: '표', icon: 'ph ph-rows' }, { k: 'card', label: '카드', icon: 'ph ph-cards' }].map(v => {
        const cur = s.listView || 'table';
        return { label: v.label, icon: v.icon, on: cur === v.k, off: cur !== v.k, go: () => this.setState({ listView: v.k }) };
      }),
      tableView: (s.listView || 'table') === 'table',
      cardDisplay: (s.listView || 'table') === 'card' ? 'flex' : 'none',
      ptHeads: this.ptColOrder(s).map((k, i, arr) => {
        const LBL = { room: '병실', id: '등록번호', name: '이름', age: '성별·나이', admit: '입원일', stay: '재원상태', recent: '최근 참여', consent: '동의' };
        const sortable = k !== 'consent';
        const over = s.ptColOver === k && s.ptColDrag && s.ptColDrag !== k;
        return {
          label: LBL[k], sortable: sortable, plain: !sortable,
          icon: sortKey === k ? (sortDir === 1 ? 'ph ph-caret-up' : 'ph ph-caret-down') : 'ph ph-caret-up-down',
          go: () => this.setState({ sortKey: k, sortDir: sortKey === k && sortDir === 1 ? 'desc' : 'asc', page: 0 }),
          ring: over ? 'inset 3px 0 0 var(--color-accent)' : 'none',
          opacity: s.ptColDrag === k ? '0.45' : '1',
          dragStart: (e) => { if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); } this.setState({ ptColDrag: k }); },
          dragOver: (e) => { if (!this.state.ptColDrag) return; e.preventDefault(); if (this.state.ptColOver !== k) this.setState({ ptColOver: k }); },
          drop: (e) => {
            e.preventDefault();
            const from = this.state.ptColDrag;
            this.setState({ ptColDrag: null, ptColOver: null });
            if (!from || from === k) return;
            const cur = this.ptColOrder(this.state).filter(x => x !== from);
            cur.splice(cur.indexOf(k), 0, from);
            this.setState({ ptCols: cur });
            try { localStorage.setItem('smartcare.ptCols.v1', JSON.stringify(cur)); } catch (er) {}
          },
          dragEnd: () => this.setState({ ptColDrag: null, ptColOver: null })
        };
      }),
      ptColsCustom: JSON.stringify(this.ptColOrder(s)) !== JSON.stringify(Component.PT_COLS),
      resetPtCols: () => { this.setState({ ptCols: null }); try { localStorage.removeItem('smartcare.ptCols.v1'); } catch (e) {} },
      sortHeads: [['name', '이름'], ['age', '성별·나이'], ['room', '병실'], ['stay', '재원상태'], ['admit', '입원일'], ['recent', '최근 참여'], ['id', '등록번호']].map(([k, label]) => ({
        label: label,
        icon: sortKey === k ? (sortDir === 1 ? 'ph ph-caret-up' : 'ph ph-caret-down') : 'ph ph-caret-up-down',
        go: () => this.setState({ sortKey: k, sortDir: sortKey === k && sortDir === 1 ? 'desc' : 'asc', page: 0 })
      })),
      firstPage: () => this.setState({ page: 0 }),
      lastPage: () => this.setState({ page: pageCount - 1 }),
      pageNums: (() => {
        const out = [], lo = Math.max(0, Math.min(page - 2, pageCount - 5)), hi = Math.min(pageCount - 1, lo + 4);
        for (let i = lo; i <= hi; i++) out.push({ n: i + 1, on: i === page, off: i !== page, go: () => this.setState({ page: i }) });
        return out;
      })(),
      pageLabel: (page * per + 1) + '–' + (page * per + pageItems.length) + ' / ' + filtered.length,
      prevPage: () => this.setState({ page: Math.max(0, page - 1) }),
      nextPage: () => this.setState({ page: Math.min(pageCount - 1, page + 1) }),

      sel: {
        id: sel.id, regNo: sel.chartNo ? '등록번호 ' + sel.chartNo : '등록번호 없음', chartNo: sel.chartNo || '—', name: sel.name, room: sel.room, sexAge: sel.sex + ' · 만 ' + sel.age + '세',
        stay: sel.stay || '재원', face: sel.face, faceId: sel.faceId,
        consentOk: sel.consent === '동의', consentNo: sel.consent !== '동의',
        consentLabel: '동의 ' + sel.consent,
        consentDoc: sel.consent === '동의' ? 'PDF 보관됨' : '미작성',
        photoUrl: s.photoUrls[sel.id] || '',
        photoEl: this.img(s.photoUrls[sel.id], sel.name + ' 증명사진'),
        hasPhoto: !!s.photoUrls[sel.id], noPhoto: !s.photoUrls[sel.id],
        consentVia: s.consentVia[sel.id] || (sel.consent === '동의' ? '모바일 전자서명' : '미취득'),
        files: (s.consentFiles[sel.id] || []).map(f => ({
          name: f.name, url: f.url,
          thumb: f.isPdf ? null : this.img(f.url, f.name, 'contain'),
          meta: f.size + ' · ' + (f.isPdf ? 'PDF' : '이미지'),
          isPdf: f.isPdf, isImage: !f.isPdf,
          zoom: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ zoom: { url: f.url, title: f.name, meta: f.size + ' · 서면 동의서 스캔본', pdf: f.isPdf, file: true } }); },
          download: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.fileDownload(f.url, f.name); },
          print: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.filePrint(f.url, f.name, f.isPdf); },
          remove: (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            this.setState({ dialog: {
              title: '첨부한 서면 동의서를 삭제할까요?',
              body: f.name + ' (' + f.size + ')\n' + sel.name + ' 환자의 원본 증빙 파일이 삭제되며 되돌릴 수 없습니다. 필요하면 먼저 다운로드해 보관하세요.',
              cta: '삭제',
              confirm: () => {
                const map = Object.assign({}, this.state.consentFiles);
                map[sel.id] = (map[sel.id] || []).filter(x => x.id !== f.id);
                const del = Object.assign({}, this.state.cfDeleted || {}); del[f.id || (f.name + '|' + f.size)] = true;
                this.setState({ consentFiles: map, cfDeleted: del, dialog: null, zoom: this.state.zoom && this.state.zoom.url === f.url ? null : this.state.zoom });
                this.flash(f.name + ' 첨부 삭제');
              }
            } });
          }
        })),
        hasFiles: (s.consentFiles[sel.id] || []).length > 0,
        noFiles: (s.consentFiles[sel.id] || []).length === 0,
        fileCountLabel: (s.consentFiles[sel.id] || []).length > 0 ? (s.consentFiles[sel.id] || []).length + '개 첨부됨' : '첨부 없음',
        history: history, hasHistory: history.length > 0, noHistory: history.length === 0,
        historyCount: history.length > 0 ? '총 ' + history.length + '회' : ''
      },
      goPatients: () => this.setState({ pcView: 'patients', npOpen: false, pdOpen: false }),
      goPatient: () => this.setState({ pcView: 'patients', pdOpen: true }),
      goNewPatient: () => this.setState({ npOpen: true, pcView: s.pcView === 'newPatient' ? 'patients' : s.pcView, formMode: 'new', formGuardians: { g1: {}, g2: {} }, formName: '', formSex: '여', formWard: '', formRoom: '', formBirth: '', formChart: '', formAge: '', formPortrait: '확인전', formFace: '확인전', formStay: '재원', upload: 'idle', uploadPct: 0, idPhoto: null }),
      goEditPatient: () => {
        const parts = sel.room.split(' ');
        const url = s.photoUrls[sel.id];
        this.setState({
          npOpen: true, formMode: 'edit', formName: sel.name, formSex: sel.sex || '여',
          formPortrait: ['동의', '미동의'].indexOf(sel.consent) >= 0 ? sel.consent : '확인전',
          formFace: ['동의', '미동의'].indexOf(sel.face) >= 0 ? sel.face : '확인전',
          formStay: sel.stay || '재원',
          formGuardians: (() => { const gs = (PATIENTS.find(p => p.id === sel.id) || {}).guardians || []; return { g1: Object.assign({}, gs[0] || {}), g2: Object.assign({}, gs[1] || {}) }; })(),
          formWard: parts[0] || '', formRoom: parts[1] || '',
          formBirth: (PATIENTS.find(p => p.id === sel.id) || {}).birth || '',
          formChart: (PATIENTS.find(p => p.id === sel.id) || {}).chartNo || '',
          formAge: (() => { const a = (PATIENTS.find(p => p.id === sel.id) || {}).age; return a != null && a !== '' ? String(a) : ''; })(),
          upload: url ? 'done' : 'idle', uploadPct: url ? 100 : 0,
          idPhoto: url ? { url: url, name: '등록된 증명사진', size: '' } : null
        });
      },
      formTitle: s.formMode === 'edit' ? '환자 정보 수정' : '환자 등록',
      formBirth: s.formBirth,
      onFormBirth: (e) => this.setState({ formBirth: e.target.value }),
      // 차트번호(EMR 등록번호) = 환자 고유 키
      formChart: s.formChart || '',
      onFormChart: (e) => this.setState({ formChart: e.target.value.replace(/\s/g, '') }),
      formAge: s.formAge || '',
      onFormAge: (e) => this.setState({ formAge: e.target.value.replace(/\D/g, '').slice(0, 3) }),
      ...(() => {
        const n = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
        const k = n(s.formChart);
        const other = k ? PATIENTS.find(p => n(p.chartNo) === k && !(s.formMode === 'edit' && p.id === sel.id)) : null;
        return { chartDup: !!other, chartDupMsg: other ? '이미 등록된 차트번호입니다 — ' + other.name + ' · ' + (other.room || '') + ' (' + (other.stay || '재원') + ')' : '' };
      })(),
      todayIso: todayIso,
      formAgeLabel: birthAge == null ? '생년월일을 입력하세요' : '만 ' + birthAge + '세',
      birthInvalid: !!s.formBirth && birthAge == null,
      birthMsg: '올바른 생년월일을 입력하세요 (오늘 이전 날짜)',
      goConsent: () => this.setState({ pcView: 'consent', pdOpen: false, cpPicked: true, cpQ: '' }),
      // 일지 상세 화면에서 이 일지의 일정(캘린더) 바로 수정
      ...(() => {
        const [kd, kp] = (s.activeSession || '').split('|');
        const plan = kd && kp ? (s.plans || []).find(x => x.date === kd && x.program === kp) : null;
        return {
          rvHasPlan: !!plan, rvNoPlan: !plan && !!kd && !!kp,
          rvEditPlan: () => { if (plan) this.setState({ planOpen: true, planErr: '', planForm: Object.assign({}, plan, { staff: (plan.staff || []).slice(), repeat: '없음', until: '' }) }); },
          rvNewPlan: () => this.setState({ planOpen: true, planErr: '', planForm: { id: null, program: kp, date: kd, start: '14:00', end: '15:00', place: s.logPlace || '프로그램실', ward: '전체', capacity: 12, status: '예정', staff: [userName], repeat: '없음', until: '', memo: '' } })
        };
      })(),
      ...(() => {
        const q = (s.cpQ || '').trim().toLowerCase().replace(/\s/g, '');
        const hit = PATIENTS.filter(p => !q || [p.name, p.room, p.chartNo].some(v => (v || '').toLowerCase().replace(/\s/g, '').indexOf(q) >= 0));
        const picked = !!s.cpPicked && PATIENTS.some(p => p.id === s.sel);
        const pick = (p) => (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ sel: p.id, cpPicked: true, cpQ: '', cpOpen: false }); this.flash(p.name + ' 환자 정보를 불러왔습니다'); };
        // 동의 미완료 환자 목록: 모바일 전자 동의도, 서면 동의서 첨부도 없는 재원 환자 등
        const mcAll = (() => { try { return JSON.parse(localStorage.getItem('smartcare.mconsent.v1') || '{}') || {}; } catch (e) { return {}; } })();
        // 기준: 재원 환자 전체. 모바일 동의가 없거나, 서면 파일이 없거나, 동의 항목이 미완료면 목록에 포함
        const base = PATIENTS.filter(p => (p.stay || '재원') === '재원').map(p => ({
          p: p,
          hasMobile: !!mcAll[p.id],
          hasPaper: (s.consentFiles[p.id] || []).length > 0,
          agreed: p.consent === '동의' && p.face === '동의'
        }));
        const MATCH = {
          '전체': r => !r.hasMobile || !r.hasPaper || !r.agreed,
          '동의 없음': r => !r.hasMobile && !r.hasPaper,
          '서면 파일 없음': r => !r.hasPaper,
          '동의 항목 미완료': r => (r.hasMobile || r.hasPaper) && !r.agreed
        };
        const pendRows = base.filter(MATCH['전체']);
        const pf = MATCH[s.cpPendF] ? s.cpPendF : '전체';
        // 정렬 · 페이지 (환자 명부와 같은 방식)
        const SORTS = ['병실순', '이름순', '등록번호순', '입원일순', '동의 상태순'];
        const sk = SORTS.indexOf(s.cpSort) >= 0 ? s.cpSort : '병실순';
        const dir = s.cpSortDir === 'desc' ? -1 : 1;
        const roomKey = (r) => String(r || '').replace(/\d+/g, n => n.padStart(5, '0'));
        const stScore = (r) => (r.hasMobile ? 1 : 0) + (r.hasPaper ? 1 : 0) + (r.agreed ? 2 : 0);
        const cmp = {
          '병실순': (a, b) => roomKey(a.p.room).localeCompare(roomKey(b.p.room), 'ko'),
          '이름순': (a, b) => String(a.p.name || '').localeCompare(String(b.p.name || ''), 'ko'),
          '등록번호순': (a, b) => String(a.p.chartNo || '').localeCompare(String(b.p.chartNo || ''), 'ko', { numeric: true }),
          '입원일순': (a, b) => String(a.p.admit || '').localeCompare(String(b.p.admit || '')),
          '동의 상태순': (a, b) => stScore(a) - stScore(b)
        }[sk];
        const sorted = base.filter(MATCH[pf]).sort((a, b) => dir * cmp(a, b) || String(a.p.name || '').localeCompare(String(b.p.name || ''), 'ko'));
        const per = s.cpPer === 0 ? 0 : (s.cpPer || 20);
        const pages = per ? Math.max(1, Math.ceil(sorted.length / per)) : 1;
        const pg = Math.min(Math.max(0, s.cpPg || 0), pages - 1);
        const pendShown = per ? sorted.slice(pg * per, pg * per + per) : sorted;
        const cntF = (k) => base.filter(MATCH[k]).length;
        // 7a 좌우 배치: 넓은 화면은 왼쪽 목록 | 오른쪽 등록(고정), 좁은 화면은 위아래
        const wide = (s.vw || 1600) >= 1180;
        const curIdx = sorted.findIndex(r => r.p.id === s.sel);
        const goPt = (r) => { if (!r) return; this.setState({ sel: r.p.id, cpPicked: true, cpQ: '', cpOpen: false }); };
        // 가운데 손잡이로 너비 조절 (왼쪽 목록 비율 30~70%, 기기별로 기억)
        const pct = s.cpPct || 48;
        const setPct = (v) => { v = Math.max(30, Math.min(70, Math.round(v))); this.setState({ cpPct: v }); try { localStorage.setItem('sc.cpPct', String(v)); } catch (e) {} };
        this._cpSplitRef = this._cpSplitRef || React.createRef();
        return {
          cpSplitRef: this._cpSplitRef,
          cpWide: wide,
          cpGap: wide ? '0px' : 'var(--space-6)',
          cpCols: wide ? 'minmax(0, ' + pct + 'fr) 18px minmax(0, ' + (100 - pct) + 'fr)' : 'minmax(0, 1fr)',
          cpSplitDown: (e) => {
            e.preventDefault();
            const box = this._cpSplitRef.current; if (!box) return;
            const r = box.getBoundingClientRect();
            const move = (ev) => setPct((ev.clientX - r.left) / r.width * 100);
            const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
            document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
          },
          cpSplitKey: (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPct(pct + (e.key === 'ArrowLeft' ? -3 : 3)); } },
          cpSplitReset: () => setPct(48),
          cpRightPos: wide ? 'sticky' : 'static',
          // 상단 고정 [뒤로] 바(약 49px) 아래에서 멈추도록
          cpRightMaxH: wide ? 'calc(100vh - 72px)' : 'none',
          cpNoPrev: !picked || curIdx <= 0,
          cpNoNext: !picked || curIdx < 0 || curIdx >= sorted.length - 1,
          cpPrevPt: () => goPt(sorted[curIdx - 1]),
          cpNextPt: () => goPt(curIdx < 0 ? sorted[0] : sorted[curIdx + 1]),
          cpPgTotal: sorted.length,
          cpSort: sk, cpSortOpts: SORTS,
          onCpSort: (e) => this.setState({ cpSort: e.target.value, cpPg: 0 }),
          cpSortDirToggle: () => this.setState({ cpSortDir: s.cpSortDir === 'desc' ? 'asc' : 'desc', cpPg: 0 }),
          cpSortDirIcon: dir === 1 ? 'ph ph-sort-ascending' : 'ph ph-sort-descending',
          cpSortDirTitle: dir === 1 ? '오름차순 (누르면 내림차순)' : '내림차순 (누르면 오름차순)',
          cpPerStr: String(per),
          onCpPer: (e) => this.setState({ cpPer: parseInt(e.target.value, 10), cpPg: 0 }),
          cpPgLabel: (pg + 1) + ' / ' + pages,
          cpPgFirst: pg <= 0, cpPgLast: pg >= pages - 1,
          cpPgPrev: () => this.setState({ cpPg: Math.max(0, pg - 1) }),
          cpPgNext: () => this.setState({ cpPg: Math.min(pages - 1, pg + 1) }),
          // 목록은 항상 자체 스크롤 상자 — 스크롤해도 이름·병실·모바일 동의 머리글이 위에 고정됨
          cpListMaxH: 'max(360px, calc(100vh - 300px))',
          cpPendCount: pendRows.length,
          cpPendOpen: s.cpPendOpen !== false,
          cpPendClosed: s.cpPendOpen === false,
          toggleCpPend: () => this.setState({ cpPendOpen: s.cpPendOpen === false }),
          cpPendNone: pendRows.length === 0,
          cpPendFilters: ['전체', '동의 없음', '서면 파일 없음', '동의 항목 미완료'].map(k => ({
            label: k, n: cntF(k), on: pf === k, off: pf !== k,
            go: () => this.setState({ cpPendF: k, cpPg: 0 })
          })),
          cpPendEmpty: pendRows.length > 0 && pendShown.length === 0,
          cpPendList: pendShown.map(r => ({
            name: r.p.name, id: r.p.chartNo || '', room: r.p.room || '—',
            mobileKind: r.hasMobile ? 'yes' : 'no', paperKind: r.hasPaper ? 'yes' : 'no',
            onStr: picked && r.p.id === s.sel ? '1' : '0',
            mobileTxt: r.hasMobile ? '받음' : '없음', mobileCls: r.hasMobile ? 'tag tag-accent' : 'tag tag-neutral',
            paperTxt: r.hasPaper ? (s.consentFiles[r.p.id] || []).length + '개' : '없음', paperCls: r.hasPaper ? 'tag tag-accent' : 'tag tag-neutral',
            mobileRed: r.hasMobile ? 'inherit' : 'oklch(0.70 0.17 25)',
            paperRed: r.hasPaper ? 'inherit' : 'oklch(0.70 0.17 25)',
            statusTxt: '초상권 ' + (r.p.consent || '확인전') + ' · 안면 ' + (r.p.face || '확인전'),
            sel: s.sel === r.p.id && picked,
            rowBg: s.sel === r.p.id && picked ? 'var(--color-accent-900)' : 'transparent',
            pick: pick(r.p)
          })),
          cpTotal: PATIENTS.length,
          cpQ: s.cpQ || '',
          onCpQ: (e) => this.setState({ cpQ: e.target.value, cpOpen: true }),
          openCp: () => this.setState({ cpOpen: true }),
          closeCp: () => this.setState({ cpOpen: false }),
          cpKey: (e) => { if (e.key === 'Enter' && hit.length) { e.preventDefault(); pick(hit[0])(); } if (e.key === 'Escape') this.setState({ cpOpen: false }); },
          cpOpen: !!s.cpOpen,
          cpEmpty: hit.length === 0,
          cpList: hit.slice(0, 30).map(p => ({
            name: p.name, id: p.chartNo || '',
            meta: [p.room, (p.sex || '') + ' ' + (p.age != null ? p.age + '세' : ''), p.stay || '재원'].filter(x => x && x.trim()).join(' · '),
            consent: '초상권 ' + (p.consent || '확인전') + ' · 안면 ' + (p.face || '확인전'),
            tagCls: p.consent === '동의' && p.face === '동의' ? 'tag tag-accent' : 'tag tag-neutral',
            pick: pick(p)
          })),
          cpPicked: picked, cpNotPicked: !picked,
          cpBodyDisp: picked ? 'flex' : 'none',
          cpSelMeta: picked ? [sel.id, sel.room, (sel.sex || '') + ' ' + (sel.age != null ? sel.age + '세' : ''), '초상권 ' + (sel.consent || '확인전') + ' · 안면 ' + (sel.face || '확인전')].filter(x => x && x.trim()).join(' · ') : '',
          cpClear: () => this.setState({ cpPicked: false, cpQ: '', cpOpen: true }),
          cpBackLabel: picked ? '환자 상세' : '환자 등록 관리',
          cpBack: () => picked ? this.setState({ pcView: 'patient', pdOpen: true }) : this.setState({ pcView: 'patients' })
        };
      })(),
      goLogs: () => this.setState({ pcView: 'logs', logTab: 'list', nlOpen: false }),
      goAttendance: () => this.setState({ pcView: 'logs', logTab: 'attendance' }),
      goStats: () => this.setState({ pcView: 'stats', fetch: 'ready' }),
      askRevoke: () => this.setState({
        dialog: {
          title: sel.name + '님의 동의를 철회할까요?',
          body: '안면인식 Collection에서 얼굴 데이터가 삭제되고 이후 AI 매칭 대상에서 제외됩니다. 과거 출석 기록은 보존되며, 출석은 수기 기록으로 대체됩니다.',
          cta: '동의 철회',
          confirm: () => { this.setState({ dialog: null }); this.flash(sel.name + ' 동의 철회 — 얼굴 데이터 삭제 완료'); }
        }
      }),

      // 등록
      formName: s.formName,
      onFormName: (e) => this.setState({ formName: e.target.value }),
      formPortrait: s.formPortrait,
      onFormPortrait: (e) => this.setState({ formPortrait: e.target.value }),
      formFace: s.formFace,
      onFormFace: (e) => this.setState({ formFace: e.target.value }),
      formStay: s.formStay,
      onFormStay: (e) => this.setState({ formStay: e.target.value }),
      selGuardians: ((PATIENTS.find(p => p.id === sel.id) || {}).guardians || []).map(g => ({ type: g.type, name: g.name, rel: g.rel, phone: g.phone, tel: 'tel:' + (g.phone || '').replace(/\D/g, '') })),
      selNoGuardian: !((PATIENTS.find(p => p.id === sel.id) || {}).guardians || []).length,
      selGuardianCount: ((PATIENTS.find(p => p.id === sel.id) || {}).guardians || []).length + '명',
      // 1a 상태판: 비어 있거나 미완료면 빨간 표시
      selTiles: (() => {
        const bad = (v) => !v || v === '—' || /미작성|미취득|없음|미동의|확인전/.test(String(v));
        const W = { line: 'oklch(0.70 0.15 25)', fg: 'oklch(0.86 0.08 25)' }, OK = { line: 'oklch(0.76 0.14 145)', fg: 'var(--color-text)' }, NA = { line: 'var(--color-neutral-700)', fg: 'var(--color-text)' };
        // 템플릿용 sel 객체와 같은 계산 (날 데이터에는 이 두 값이 없음)
        const doc = sel.consent === '동의' ? 'PDF 보관됨' : '미작성';
        const via = s.consentVia[sel.id] || (sel.consent === '동의' ? '모바일 전자서명' : '미취득');
        return [
          { label: '동의서', v: doc, c: bad(doc) ? W : OK },
          { label: '취득 방식', v: via, c: bad(via) ? W : OK },
          { label: 'FaceId', v: sel.faceId || '—', c: NA, mono: 'ui-monospace, monospace' },
          { label: '보유 기간', v: '재원 기간', c: NA, mono: 'inherit' }
        ].map(t => ({ label: t.label, v: t.v || '—', line: t.c.line, fg: t.c.fg, font: t.mono || 'inherit' }));
      })(),
      grdRelOpts: [{ v: '', label: '선택' }].concat(['배우자', '아들', '딸', '며느리', '사위', '손자녀', '형제자매', '부모', '친척', '후견인', '기타'].map(x => ({ v: x, label: x }))),
      grdRows: [{ k: 'g1', label: '주보호자', icon: 'ph ph-user-circle', req: ' *' }, { k: 'g2', label: '부보호자', icon: 'ph ph-user', req: '' }].map(g => {
        const v = (s.formGuardians || {})[g.k] || {};
        const upd = (f, val) => this.setState(st => {
          const all = Object.assign({}, st.formGuardians || {});
          all[g.k] = Object.assign({}, all[g.k] || {}, { [f]: val });
          return { formGuardians: all };
        });
        const fmt = (t) => {
          const d = t.replace(/\D/g, '').slice(0, 11);
          if (d.length < 4) return d;
          if (d.indexOf('02') === 0) return d.length <= 5 ? d.slice(0, 2) + '-' + d.slice(2) : d.length <= 9 ? d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5) : d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
          return d.length <= 7 ? d.slice(0, 3) + '-' + d.slice(3) : d.length <= 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
        };
        return {
          label: g.label, icon: g.icon, req: g.req,
          name: v.name || '', rel: v.rel || '', phone: v.phone || '',
          onName: (e) => upd('name', e.target.value),
          onRel: (e) => upd('rel', e.target.value),
          onPhone: (e) => upd('phone', fmt(e.target.value))
        };
      }),
      uploadIdle: s.upload === 'idle', uploading: s.upload === 'uploading', uploadDone: s.upload === 'done',
      uploadPct: s.uploadPct + '%',
      uploadStage: s.uploadPct < 60 ? '사진 업로드 중…' : '얼굴 검출 중…',
      idPhotoRef: this._idInput,
      ...this.fcVals(s, s.formMode === 'edit' ? sel : null),
      // 증명사진 얼굴 검사 결과 (실제 검출) · 편집
      ...(() => {
        const url = s.idPhoto && s.idPhoto.url;
        if (url && this._idFaceUrl !== url) { this._idFaceUrl = url; this.checkIdFaces(url); }
        const r = (s.idFace && s.idFace.url === url) ? s.idFace : null;
        const n = r ? r.n : -1;
        return {
          idFaceText: n < 0 ? '얼굴 확인 중…' : n === 0 ? '얼굴이 검출되지 않았습니다 — 정면 사진을 권장합니다' : n === 1 ? '얼굴 1개 검출 · 품질 양호' : '얼굴 ' + n + '개 검출 — 다른 사람이 함께 있습니다',
          idFaceIcon: n === 1 ? 'ph ph-check-circle' : n < 0 ? 'ph ph-circle-notch' : 'ph-fill ph-warning-circle',
          idFaceColor: n === 1 ? 'var(--color-accent-300)' : n < 0 ? 'var(--color-neutral-400)' : 'oklch(0.82 0.12 60)',
          idFaceMulti: n > 1,
          editIdPhoto: () => this.openIdEdit(false),
          editIdPhotoMain: () => this.openIdEdit(true)
        };
      })(),
      openFaceCrop: () => {
        const pid = s.formMode === 'edit' ? sel.id : null;
        let list = this.fcSources(pid);
        if (!list.length && pid) list = this.fcSources(null).slice(0, 12);
        this.setState({ faceCrop: { sources: list, src: (list[0] || {}).url || '', box: null } });
      },
      idPhotoUrl: s.idPhoto ? s.idPhoto.url : '',
      idPhotoEl: this.img(s.idPhoto ? s.idPhoto.url : '', '증명사진 미리보기', 'contain'),
      idPhotoMeta: s.idPhoto ? s.idPhoto.name + ' · ' + s.idPhoto.size : '',
      startUpload: () => { if (this._idInput.current) this._idInput.current.click(); },
      onIdPhoto: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; acceptIdPhoto(f); },
      _idHook: (this._acceptIdPhoto = acceptIdPhoto, null),
      onDragOver: (e) => { e.preventDefault(); },
      onDropIdPhoto: (e) => {
        e.preventDefault();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        acceptIdPhoto(f);
      },
      resetUpload: () => { clearInterval(this._u); this.setState({ upload: 'idle', uploadPct: 0, idPhoto: null }); },
      // 잘못 올린 증명사진 삭제 — 수정 중인 환자면 서버의 증명사진도 바로 지움
      askDeleteIdPhoto: () => {
        const isEdit = this.state.formMode === 'edit';
        const pid = isEdit ? this.state.sel : null;
        const saved = pid && (this.state.photoUrls || {})[pid];
        const pt = pid ? PATIENTS.find(p => p.id === pid) : null;
        this.setState({ dialog: {
          title: '증명사진을 삭제할까요?',
          body: saved
            ? (pt ? pt.name : '') + '님의 등록된 증명사진이 서버에서 삭제됩니다. 증명사진이 없으면 AI 판독에서 이 환자는 자동으로 찾지 못하며, 나중에 다시 등록할 수 있습니다.'
            : '방금 올린 사진을 지웁니다. 아직 저장 전이라 등록된 정보는 바뀌지 않습니다.',
          cta: '삭제',
          confirm: () => {
            clearInterval(this._u);
            const patch = { upload: 'idle', uploadPct: 0, idPhoto: null, dialog: null };
            if (saved) {
              const map = Object.assign({}, this.state.photoUrls || {}); delete map[pid];
              if (pt) pt.photo = false;
              patch.photoUrls = map;
              this.setState(patch);
              this.persistPatients(map);
              this.flash((pt ? pt.name : '') + ' 증명사진 삭제 — 서버에 반영했습니다');
            } else {
              this.setState(patch);
              this.flash('올린 사진을 지웠습니다');
            }
          }
        } });
      },
      openZoom: () => {
        if (!s.idPhoto) return;
        this.setState({ zoom: { url: s.idPhoto.url, title: '증명사진 확대보기', meta: s.idPhoto.name + ' · ' + s.idPhoto.size } });
      },
      // 사진이 있으면 기본으로 미리보기 표시 (사용자가 접은 경우만 숨김), 없으면 영역 자체를 숨김
      ...(() => {
        const has = s.photos.some(p => p.url);
        const open = has && s.sitePhotosOpen !== false;
        return {
          sitePhotosOpen: open,
          sitePhotosOpenStr: open ? 'true' : 'false',
          sitePhotosHasAny: has,
          toggleSitePhotos: () => this.setState({ sitePhotosOpen: !open }),
          sitePhotosToggleLabel: open ? '접기' : '보기',
          sitePhotosChevron: open ? 'ph ph-caret-up' : 'ph ph-caret-down'
        };
      })(),
      sitePhotoCount: s.photos.filter(p => p.url).length,
      canReanalyze: s.photos.some(p => p.url) && !s.analyzing,
      sitePhotosClosedCanRe: s.sitePhotosOpen === false && s.photos.some(p => p.url) && !s.analyzing,
      sitePhotosOpenCanRe: s.sitePhotosOpen !== false && s.photos.some(p => p.url) && !s.analyzing,
      reanalyze: () => {
        const all = this.state.photos.filter(p => p.url);
        const pick = this.state.reSel ? all.filter((p, i) => this.state.reSel[i]) : all;
        if (!pick.length) { this.flash('재판독할 사진을 1장 이상 선택하세요'); return; }
        const run = () => this.analyzePhotos({ only: pick, keepManual: true });
        if (this.state.confirmed) {
          this.setState({ dialog: {
            title: '확정된 일지를 다시 판독할까요?',
            body: '재판독하면 확정이 해제되고 검수 대기 상태로 돌아갑니다. 수기로 추가한 참여자는 유지됩니다.',
            cta: '재판독',
            confirm: () => { this.setState({ dialog: null }); run(); }
          } });
          return;
        }
        run();
      },
      reanalyzeLabel: (() => {
        const n = s.photos.filter(p => p.url).length;
        const k = s.reSel ? Object.keys(s.reSel).filter(i => s.reSel[i] && i < n).length : n;
        return k === n ? '전체 ' + n + '장 재판독' : '선택한 ' + k + '장 재판독';
      })(),
      hasSitePhotos: s.photos.some(p => p.url),
      noSitePhotos: !s.photos.some(p => p.url),
      sitePhotoThumbs: s.photos.filter(p => p.url).map((p, i, arr) => ({
        n: i + 1, label: p.label || ('현장사진 ' + (i + 1)),
        picked: !s.reSel || !!s.reSel[i],
        pickRing: (!s.reSel || s.reSel[i]) ? '0 0 0 2px var(--color-accent)' : 'var(--shadow-sm)',
        pickIcon: (!s.reSel || s.reSel[i]) ? 'ph ph-check-circle' : 'ph ph-circle',
        pickBg: (!s.reSel || s.reSel[i]) ? 'var(--color-accent)' : 'rgba(22, 24, 38, 0.78)',
        pickOpacity: (!s.reSel || s.reSel[i]) ? '1' : '0.5',
        remove: (e) => {
          e.stopPropagation();
          const nm = p.label || ('현장사진 ' + (i + 1));
          this.setState({ dialog: {
            title: '현장사진 ' + (i + 1) + '을(를) 삭제할까요?',
            body: nm + '\n삭제한 사진은 되돌릴 수 없습니다. 이미 판독된 참여자 명단은 그대로 남으며, 필요하면 남은 사진으로 다시 판독하세요.',
            cta: '삭제',
            confirm: () => {
              const target = p;
              this.setState({
                photos: this.state.photos.filter(x => x !== target),
                reSel: null, dialog: null, photoView: null
              });
              this.purgePhoto(target, this.curKey());
              this.flash('현장사진 ' + (i + 1) + ' 영구 삭제 — 남은 사진 ' + (arr.length - 1) + '장');
            }
          } });
        },
        togglePick: (e) => {
          e.stopPropagation();
          const base = this.state.reSel || arr.reduce((o, _, j) => { o[j] = true; return o; }, {});
          const next = Object.assign({}, base); next[i] = !base[i];
          this.setState({ reSel: next });
        },
        el: this.img(p.url, p.label || '현장사진'),
        open: () => this.setState({ zoom: { url: p.url, title: '현장사진 ' + (i + 1) + ' / ' + arr.length, meta: p.label || '' } })
      })),
      zoom: s.zoom,
      zoomEl: s.zoom
        ? (s.zoom.pdf
            ? React.createElement('div', {
                key: 'pdf-' + s.zoom.url.length + '-' + s.zoom.title,
                ref: (el) => this.mountPdf(el, s.zoom.url),
                onClick: (e) => e.stopPropagation(),
                style: { width: 'min(860px, 100%)', height: '74vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '12px', boxSizing: 'border-box', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', background: 'var(--color-neutral-900)', cursor: 'default', color: 'var(--color-neutral-400)', fontSize: '14px' }
              }, 'PDF를 불러오는 중…')
            : (() => {
                const sc = s.zoomScale || 1;
                const fitW = this._zoomFitW || 0;
                const imgStyle = sc === 1 || !fitW
                  ? { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', margin: 'auto' }
                  : { width: Math.round(fitW * sc) + 'px', maxWidth: 'none', maxHeight: 'none', height: 'auto', display: 'block', margin: '0 auto' };
                return React.createElement('div', {
                  key: 'imgv',
                  onClick: (e) => e.stopPropagation(),
                  onDoubleClick: (e) => { e.stopPropagation(); this.setState({ zoomScale: sc === 1 ? 2 : 1 }); },
                  onWheel: (e) => { if (!e.ctrlKey) return; e.preventDefault(); const L = [1, 1.5, 2, 3, 4]; const i = L.indexOf(sc); this.setState({ zoomScale: L[Math.max(0, Math.min(L.length - 1, i + (e.deltaY < 0 ? 1 : -1)))] }); },
                  style: { width: 'min(900px, 100%)', height: '72vh', overflow: sc === 1 ? 'hidden' : 'auto', display: sc === 1 ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box', borderRadius: 'var(--radius-md)', background: 'var(--color-neutral-900)', boxShadow: 'var(--shadow-lg)', cursor: sc === 1 ? 'zoom-in' : 'zoom-out' }
                }, React.createElement('img', {
                  src: s.zoom.url, alt: s.zoom.title,
                  onLoad: (e) => {
                    const im = e.currentTarget, box = im.parentElement;
                    if (!box || !im.naturalWidth) return;
                    const bw = box.clientWidth - 24, bh = box.clientHeight - 24;
                    this._zoomFitW = Math.min(bw, bh * im.naturalWidth / im.naturalHeight);
                  },
                  style: Object.assign({ borderRadius: 3, background: '#f4f4f6', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }, imgStyle)
                }));
              })())
        : null,
      zoomIsImg: !!(s.zoom && !s.zoom.pdf && s.zoom.file),
      zoomPct: Math.round((s.zoomScale || 1) * 100) + '%',
      zoomFitLabel: (s.zoomScale || 1) === 1 ? '화면 맞춤' : '맞춤으로',
      zoomIn: (e) => { e.stopPropagation(); const L = [1, 1.5, 2, 3, 4]; const i = L.indexOf(s.zoomScale || 1); this.setState({ zoomScale: L[Math.min(L.length - 1, i + 1)] }); },
      zoomOut: (e) => { e.stopPropagation(); const L = [1, 1.5, 2, 3, 4]; const i = L.indexOf(s.zoomScale || 1); this.setState({ zoomScale: L[Math.max(0, i - 1)] }); },
      zoomFit: (e) => { e.stopPropagation(); this.setState({ zoomScale: 1 }); },
      closeZoom: () => this.setState({ zoom: null, zoomScale: 1 }),
      zoomFile: !!(s.zoom && s.zoom.file),
      zoomDownload: (e) => { e.stopPropagation(); if (s.zoom) this.fileDownload(s.zoom.url, s.zoom.title); },
      zoomPrint: (e) => { e.stopPropagation(); if (s.zoom) this.filePrint(s.zoom.url, s.zoom.title, s.zoom.pdf); },
      stopClose: (e) => e.stopPropagation(),
      formSex: s.formSex,
      sexM: s.formSex === '남', sexF: s.formSex === '여',
      onSexM: () => this.setState({ formSex: '남' }),
      onSexF: () => this.setState({ formSex: '여' }),
      saveLabel: s.formMode === 'edit' ? '수정 내용 저장' : '저장 · Collection 등록',
      savePatient: () => {
        const name = (s.formName || '').trim();
        if (!name) { this.flash('이름을 입력하세요'); return; }
        const isEditC = s.formMode === 'edit';
        const chart = (s.formChart || '').trim();
        if (!chart) { this.flash('차트번호를 입력하세요'); return; }
        {
          const n = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
          const dupP = PATIENTS.find(p => n(p.chartNo) === n(chart) && !(isEditC && p.id === sel.id));
          if (dupP) { this.flash('이미 등록된 차트번호입니다 — ' + dupP.name + ' · ' + (dupP.room || '')); return; }
        }
        const ageNum = s.formAge !== '' && s.formAge != null ? parseInt(s.formAge, 10) : (birthAge != null ? birthAge : (isEditC ? (PATIENTS.find(p => p.id === sel.id) || {}).age : null));
        if (!selWard) { this.flash('병동을 목록에서 선택하세요'); return; }
        if (!selWardRoom) { this.flash('호실을 목록에서 선택하세요'); return; }
        const isEdit = s.formMode === 'edit';
        if (s.upload === 'uploading') { this.flash('증명사진 업로드가 끝난 뒤 저장하세요'); return; }
        const hasPhoto = !!(s.idPhoto && s.idPhoto.url) || (isEdit && !!s.photoUrls[sel.id]);
        const gd = s.formGuardians || {};
        const clean = (g) => ({ name: ((g || {}).name || '').trim(), rel: (g || {}).rel || '', phone: ((g || {}).phone || '').trim() });
        const g1 = clean(gd.g1), g2 = clean(gd.g2);
        const phoneOk = (p) => /^0\d{1,2}-\d{3,4}-\d{4}$/.test(p);
        if (!g1.name || !g1.rel || !g1.phone) { this.flash('주보호자의 이름·관계·연락처를 모두 입력하세요'); return; }
        if (!phoneOk(g1.phone)) { this.flash('주보호자 연락처 형식을 확인하세요 (예: 010-1234-5678)'); return; }
        const g2Any = g2.name || g2.rel || g2.phone;
        if (g2Any && (!g2.name || !g2.rel || !g2.phone)) { this.flash('부보호자는 이름·관계·연락처를 모두 입력하거나 모두 비워 두세요'); return; }
        if (g2Any && !phoneOk(g2.phone)) { this.flash('부보호자 연락처 형식을 확인하세요 (예: 010-1234-5678)'); return; }
        const fields = {
          name: name, sex: s.formSex, chartNo: chart, age: ageNum != null && !isNaN(ageNum) ? ageNum : '',
          ...(s.formBirth ? { birth: s.formBirth } : {}),
          room: selWard.name + ' ' + selWardRoom,
          consent: s.formPortrait, face: s.formFace, stay: s.formStay,
          guardians: g2Any ? [Object.assign({ type: '주보호자' }, g1), Object.assign({ type: '부보호자' }, g2)] : [Object.assign({ type: '주보호자' }, g1)]
        };
        let id;
        if (isEdit) {
          id = sel.id;
          const target = PATIENTS.find(p => p.id === id);
          if (!target) { this.flash('수정할 환자를 찾을 수 없습니다'); return; }
          Object.assign(target, fields);
          if (s.idPhoto) target.photo = true;
        } else {
          const next = PATIENTS.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
          id = 'PT-' + String(next).padStart(4, '0');
          PATIENTS.push(Object.assign({ id: id, faceId: '—', last: '참여 이력 없음', photo: hasPhoto }, fields));
        }
        const map = Object.assign({}, s.photoUrls);
        if (s.idPhoto && s.idPhoto.url) map[id] = s.idPhoto.url;
        const tgt = PATIENTS.find(p => p.id === id);
        if (tgt) tgt.photo = !!map[id];
        const ok = this.persistPatients(map);
        if (this.state.npOpen && this._returnToAssign && !isEdit) this.setState({ photoUrls: map, sel: id, npOpen: false, comboOpen: null, ...this.backToAssign() });
        else if (this.state.npOpen) this.setState({ photoUrls: map, sel: id, npOpen: false, comboOpen: null, pcView: isEdit && !this.state.pdOpen ? 'patient' : 'patients' });
        else this.setState({ photoUrls: map, sel: id, pcView: isEdit ? 'patient' : 'consent' });
        this.flash((isEdit ? '수정 저장 완료 — ' : '신규 등록 완료 — ') + name + ' (' + id + ') · ' + fields.room + (hasPhoto ? '' : ' · 증명사진 미등록 (AI 판독 제외, 나중에 추가 가능)') + (ok ? '' : ' · 사진 용량이 커서 사진은 새로고침 시 유지되지 않습니다'));
      },

      // 동의서
      consentDocId: 'CS-0009',
      consentModePaper: true,
      consentFileRef: this._consentInput,
      pickConsentFile: () => { if (this._consentInput.current) this._consentInput.current.click(); },
      onConsentFiles: (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; addConsentFiles(fs); },
      ...(() => {
        this._addConsentFiles = addConsentFiles;
        return {
          capWaiting: !!s.capWaiting,
          capIsWin: /Windows/i.test(navigator.userAgent),
          capBlocked: !!s.capBlocked,
          capAuto: !s.capBlocked,
          startCapture: () => this._startCap && this._startCap('consent'),
          // 환자 등록 증명사진: Windows 캡처 도구 → 증명사진 칸에 자동으로 들어감
          startIdCapture: () => this._startCap && this._startCap('id'),
          idCapWaiting: !!s.capWaiting && s.capFor === 'id',
          idCapMsg: s.capBlocked
            ? '이 화면에서는 브라우저 보안 때문에 캡처를 자동으로 가져올 수 없습니다 — 캡처 후 아래 칸을 클릭하고 Ctrl + V를 누르세요'
            : '캡처 기다리는 중 — 얼굴 영역을 드래그하면 증명사진 칸에 자동으로 들어갑니다 (안 들어오면 화면을 한 번 클릭하세요)',
          focusPaste: (e) => { try { window.focus(); e.currentTarget.focus(); } catch (er) {} this.flash('이제 Ctrl + V를 누르세요'); },
          idCapIdle: !(s.capWaiting && s.capFor === 'id'),
          _capInit: (this._startCap = async (capFor) => {
            const allowed = this.clipReadAllowed();
            this._capBaseline = null;
            const launch = () => {
              if (/Windows/i.test(navigator.userAgent)) {
                const a = document.createElement('a'); a.href = 'ms-screenclip:'; a.style.display = 'none';
                document.body.appendChild(a); a.click(); a.remove();
              }
            };
            const readBase = async () => {
              try {
                const items = await navigator.clipboard.read();
                for (const it of (items || [])) { const t = it.types.find(x => /^image\//.test(x)); if (t) { const b = await it.getType(t); this._capBaseline = b.size + '|' + t; } }
                return true;
              } catch (e) { return !(e && /denied|NotAllowed/i.test(e.name + ' ' + e.message)); }
            };
            // 1) 클립보드 읽기 권한 확인 — 처음이면 허용 창을 먼저 띄우고, 허용된 뒤에 캡처 도구를 엶
            //    (캡처 도구를 같이 열면 허용 창이 가려져 거부되고, 그러면 자동 붙여넣기가 영영 안 됨)
            let perm = 'unknown';
            try { if (allowed && navigator.permissions) perm = (await navigator.permissions.query({ name: 'clipboard-read' })).state; } catch (e) {}
            if (allowed && perm === 'denied') {
              this.setState({ capWaiting: true, capBlocked: true, capFor: capFor || 'consent' });
              this.flash('브라우저에서 클립보드 읽기가 차단되어 있습니다 — 주소창 왼쪽 자물쇠 › 사이트 설정 › 클립보드를 "허용"으로 바꾸면 자동으로 들어갑니다. 지금은 캡처 후 Ctrl+V를 누르세요');
              launch();
              return;
            }
            const tClick = Date.now();
            if (allowed && perm !== 'granted') {
              this.flash('브라우저 위쪽에 뜨는 "클립보드 보기 허용"에서 [허용]을 눌러 주세요 — 한 번만 하면 됩니다');
              const ok = await readBase();
              // 허용을 누르느라 시간이 지나면 브라우저가 캡처 도구 열기를 막음 → [캡처 도구 열기] 버튼으로 다시 누르게 함
              if (ok && Date.now() - tClick > 3000) {
                this.setState({ capWaiting: true, capBlocked: false, capNeedLaunch: true, capFor: capFor || 'consent' });
                this.flash('허용되었습니다 — [캡처 도구 열기]를 눌러 캡처하세요');
                this._capLaunch = launch;
                return this._capWatch && this._capWatch(capFor);
              }
              if (!ok) {
                this.setState({ capWaiting: true, capBlocked: true, capFor: capFor || 'consent' });
                this.flash('클립보드 허용이 거부되어 자동으로 넣을 수 없습니다 — 캡처 후 Ctrl+V를 누르세요');
                launch();
                return;
              }
            } else if (allowed) {
              await readBase();
            }
            launch();
            this.setState({ capWaiting: true, capBlocked: !allowed, capNeedLaunch: false, capFor: capFor || 'consent' });
            return this._capWatch && this._capWatch(capFor);
          }, null),
          // 캡처 결과 감시 (클립보드에 새 이미지가 들어오면 바로 넣음)
          _capWatchInit: (this._capWatch = (capFor) => {
            const allowed = this.clipReadAllowed();
            // 3) 캡처 결과가 클립보드에 들어오면 바로 첨부 (최대 2분 감시)
            clearInterval(this._capPoll);
            if (allowed) {
              const t0 = Date.now();
              this._capPoll = setInterval(async () => {
                if (!this.state.capWaiting || Date.now() - t0 > 180000) { clearInterval(this._capPoll); this._capPoll = null; return; }
                // 캡처 도구가 떠 있는 동안은 이 창이 포커스를 잃어 읽을 수 없음 — 돌아오면 바로 읽음
                if (!document.hasFocus()) return;
                if (this._capReading) return;
                this._capReading = true;
                const done = await this.readClipboardCapture(false);
                this._capReading = false;
                if (done) { clearInterval(this._capPoll); this._capPoll = null; }
              }, 700);
              this.flash(capFor === 'id' ? '증명사진으로 쓸 얼굴 영역을 드래그하세요 — 캡처하면 증명사진 칸에 바로 들어갑니다' : '캡처할 영역을 드래그하세요 — 캡처하면 바로 첨부됩니다');
            } else {
              this.flash('캡처 후 이 화면을 한 번 클릭하고 Ctrl+V를 누르세요');
            }
          }, null),
          pasteCapture: () => this.readClipboardCapture(true),
          capNeedLaunch: !!s.capNeedLaunch,
          launchCapTool: () => { if (this._capLaunch) this._capLaunch(); this.setState({ capNeedLaunch: false }); this.flash(s.capFor === 'id' ? '얼굴 영역을 드래그하세요 — 캡처하면 증명사진 칸에 바로 들어갑니다' : '캡처할 영역을 드래그하세요 — 캡처하면 바로 첨부됩니다'); },
          cancelCapture: () => { clearInterval(this._capPoll); this.setState({ capWaiting: false, capFor: null, capNeedLaunch: false }); }
        };
      })(),
      onDropConsentFiles: (e) => {
        e.preventDefault();
        addConsentFiles(e.dataTransfer && e.dataTransfer.files);
      },
      paperDate: s.paperDate || this.todayIso(),
      onPaperDate: (e) => this.setState({ paperDate: e.target.value }),
      ...(() => {
        void s.mcTick;
        const mc = this.loadMobileConsent(sel.id);
        const ok = 'var(--color-accent-300)', no = 'var(--color-neutral-400)';
        const roles = ['동의인', '보호자', '촬영자'];
        const imgOf = (url, alt) => React.createElement('img', { src: url, alt: alt, style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' } });
        // 현재 동의 상태에 반영된 동의서를 위로: 서면 첨부가 최근 반영이면 서면, 아니면 모바일 전자 동의
        const hasPaper = (s.consentFiles[sel.id] || []).length > 0;
        const via = s.consentVia[sel.id] || '';
        const active = hasPaper && (via === '서면 첨부' || !mc) ? 'paper' : mc ? 'mobile' : '';
        return {
          paperOrder: active === 'mobile' ? 3 : 2,
          mcOrder: active === 'mobile' ? 2 : 3,
          paperActive: active === 'paper', mcActive: active === 'mobile',
          paperShadow: active === 'paper' ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
          mcHas: !!mc, mcNone: !mc,
          mcStatus: mc ? '전자 동의 완료' : '기록 없음',
          mcTagClass: mc ? 'tag tag-accent' : 'tag tag-neutral',
          mcShadow: active === 'mobile' ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
          mcAt: mc ? mc.at : '', mcDevice: mc ? mc.device : '', mcStaff: mc ? mc.staff : '',
          mcPortrait: mc ? (mc.portrait ? '동의' : '미동의') : '', mcPortraitColor: mc && mc.portrait ? ok : no,
          mcFace: mc ? (mc.face ? '동의' : '미동의') : '', mcFaceColor: mc && mc.face ? ok : no,
          mcSigns: roles.map(r => {
            const url = mc && mc.signs ? mc.signs[r] : null;
            return {
              role: r, name: r === '촬영자' ? (mc ? mc.staff : '') : sel.name,
              has: !!url, none: !url,
              imgEl: url ? imgOf(url, r + ' 서명') : null,
              open: () => { if (url) this.setState({ zoom: { url: url, title: sel.name + ' · ' + r + ' 서명', meta: '모바일 전자 동의 · ' + mc.at + ' · ' + mc.device } }); }
            };
          }),
          mcPrint: () => {
            if (!mc) return;
            const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
            // 기관 서면 동의서 양식 그대로 출력 (서명란: 동의인 · 보호자 · 촬영자)
            const cf = this.consentForm(orgName);
            const g1 = ((sel.guardians || []).find(g => g.type === '주보호자') || {}).name || '';
            const m = /(\d{4})[-.](\d{1,2})[-.](\d{1,2})/.exec(mc.at || '') || [];
            const dateTxt = m[1] ? m[1] + '년 ' + Number(m[2]) + '월 ' + Number(m[3]) + '일' : esc(mc.at);
            const nm = (r) => r === '촬영자' ? mc.staff : r === '보호자' ? g1 : sel.name;
            // 서명은 이름이 아니라 (인) 위에 겹쳐 찍음
            const signRow = (r) => '<div class="sr"><span class="sl">' + esc(r) + ' :</span><span class="sv">' + esc(nm(r) || '') + '</span><span class="in">(인)' + (mc.signs && mc.signs[r] ? '<img src="' + mc.signs[r] + '" alt="' + esc(r) + ' 서명">' : '') + '</span></div>';
            const item = (l, v) => '<div class="it"><b>_ ' + esc(l) + ' :</b><div>' + esc(v) + '</div></div>';
            const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(cf.title) + ' · ' + esc(sel.name) + '</title><style>'
              + '@page{size:A4;margin:22mm 20mm}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1a1a1a;font-size:12pt;margin:0}'
              + 'h1{font-size:24pt;font-weight:700;text-align:center;letter-spacing:.12em;margin:10mm 0 2mm}.sub{text-align:center;font-size:15pt;font-weight:700;margin-bottom:16mm}'
              + '.u{display:inline-block;min-width:38mm;border-bottom:.6pt solid #333;text-align:center}p{line-height:2;margin:0 0 2mm;text-align:justify}'
              + '.it{margin:4mm 0 0 4mm}.it b{font-size:12.5pt}.it div{margin:1mm 0 0 8mm;line-height:1.8}'
              + '.dt{text-align:center;font-weight:700;font-size:14pt;margin:16mm 0 14mm;letter-spacing:.1em}'
              + '.sr{display:flex;align-items:center;justify-content:flex-end;gap:6mm;margin:7mm 0;font-size:13pt;font-weight:700}.sl{width:22mm}'
              + '.sv{position:relative;display:inline-flex;align-items:center;justify-content:center;width:42mm;height:12mm;border-bottom:.6pt solid #333;font-weight:400}'
              + '.in{position:relative;display:inline-block;min-width:12mm;text-align:center}'
              + '.in img{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-height:15mm;max-width:28mm;pointer-events:none}.org{text-align:center;font-size:18pt;font-weight:700;margin-top:14mm}'
              + '.meta{font-size:8.5pt;color:#777;margin-top:6mm;text-align:center}</style></head><body>'
              + '<h1>' + esc(cf.title) + '</h1><div class="sub">' + esc(cf.subtitle) + '</div>'
              + '<p>　본인 <span class="u">' + esc(sel.name) + '</span> 는 ( 또는 보호자 <span class="u">' + esc(g1) + '</span> 는 )</p>'
              + '<p>' + esc(cf.body) + '</p>'
              + item('사용목적', cf.purpose) + item('사용매체', cf.media) + item('사용형식', cf.form)
              + '<div class="dt">' + dateTxt + '</div>'
              + signRow('동의인') + signRow('보호자') + signRow('촬영자')
              + '<div class="org">' + esc(orgName) + '</div>'
              + '<div class="meta">전자 동의 · ' + esc(sel.id) + ' · ' + esc(sel.room) + ' · ' + esc(mc.at) + ' · ' + esc(mc.device) + ' · 초상권 ' + (mc.portrait ? '동의' : '미동의') + ' / 안면인식 ' + (mc.face ? '동의' : '미동의') + '</div>'
              + '</body></html>';
            const fr = document.createElement('iframe');
            fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
            document.body.appendChild(fr);
            const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
            setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { this.flash('인쇄 창을 열 수 없습니다'); } setTimeout(() => fr.remove(), 60000); }, 300);
          }
        };
      })(),
      paperPlace: s.paperPlace,
      onPaperPlace: (e) => this.setState({ paperPlace: e.target.value }),
      savePaperConsent: () => {
        if ((s.consentFiles[sel.id] || []).length === 0) { this.flash('서면 동의서 스캔본을 먼저 첨부하세요'); return; }
        if (!s.consent.portrait && !s.consent.face) { this.flash('서면으로 받은 동의 항목을 표시하세요'); return; }
        this.flash('서면 동의 저장 — ' + sel.name + ' 명부에 원본 첨부가 연결되었습니다');
        this.setState({ pcView: 'patients', pdOpen: true });
      },
      ...(() => {
        const cf = this.consentForm(orgName);
        const g1 = ((sel.guardians || []).find(g => g.type === '주보호자') || {}).name || '';
        const d = new Date();
        // 서식 관리 대상 기관: 시스템 관리자는 선택, 기관 관리자는 소속 기관
        const cfOrg = isSys ? (s.cfOrgSel || orgIdCur) : orgIdCur;
        const lib = this.cfLib(cfOrg);
        const editId = lib.forms.some(f => f.id === s.cfEditId) ? s.cfEditId : lib.activeId;
        const editForm = lib.forms.find(f => f.id === editId) || lib.forms[0];
        const draft = s.cformDraft || Object.assign({}, this.CFORM_DEFAULT, editForm.data);
        const setD = (k) => (e) => this.setState({ cformDraft: Object.assign({}, draft, { [k]: e.target.value }) });
        const canManage = isSys || hasRole('관리자');
        const nowStamp = () => { const t = new Date(), p2 = (n) => String(n).padStart(2, '0'); return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()) + ' ' + p2(t.getHours()) + ':' + p2(t.getMinutes()); };
        const newId = () => 'f' + Date.now().toString(36);
        const orgNm = (id) => ((s.orgs || []).find(o => o.id === id) || {}).name || id;
        const guardDirty = (fn) => () => {
          if (s.cformDraft) {
            this.setState({ dialog: { title: '저장하지 않은 수정이 있습니다', body: '편집 중인 "' + editForm.name + '" 서식의 변경 내용이 사라집니다. 계속할까요?', cta: '계속', confirm: () => { this.setState({ dialog: null, cformDraft: null }); fn(); } } });
            return;
          }
          fn();
        };
        return {
          cfCanManage: canManage, cfReadOnly: !canManage,
          cfIsSys: isSys, cfNotSysOrg: !isSys,
          cfAddOpacity: canManage ? '1' : '0.5',
          cfOrgSel: cfOrg,
          cfOrgName: orgNm(cfOrg),
          onCfOrgSel: (e) => { const v = e.target.value; guardDirty(() => this.setState({ cfOrgSel: v, cfEditId: null }))(); },
          cfEditName: editForm.name,
          cfEditVer: 'v' + editForm.ver,
          cfEditIsActive: editForm.id === lib.activeId,
          cfEditNotActive: editForm.id !== lib.activeId,
          cfForms: lib.forms.map(f => {
            const active = f.id === lib.activeId, editing = f.id === editForm.id;
            return {
              name: f.name, ver: 'v' + f.ver,
              meta: f.updatedAt ? '수정 ' + f.updatedAt + (f.by ? ' · ' + f.by : '') : '기본 서식',
              active: active, notActive: !active, editing: editing,
              ring: editing ? '0 0 0 2px var(--color-accent)' : (active ? '0 0 0 1px var(--color-accent-700)' : '0 0 0 1px var(--color-neutral-800)'),
              bg: active ? 'linear-gradient(180deg, var(--color-accent-900), var(--color-neutral-900))' : 'var(--color-neutral-900)',
              edit: guardDirty(() => this.setState({ cfEditId: f.id, cformDraft: null })),
              apply: () => {
                if (!canManage) { this.flash('서식 적용은 기관 관리자 또는 시스템 관리자만 할 수 있습니다'); return; }
                this.setState({ dialog: {
                  title: '"' + f.name + '" 서식을 적용할까요?',
                  body: orgNm(cfOrg) + '의 현장 앱 전자 동의서와 인쇄 서식이 이 서식으로 바뀝니다.\n이미 받은 동의서는 받을 당시 서식 그대로 보관됩니다.',
                  cta: '적용',
                  confirm: () => { const l = this.cfLib(cfOrg); l.activeId = f.id; this.cfLibSave(cfOrg, l); this.setState({ dialog: null }); this.flash(orgNm(cfOrg) + ' — "' + f.name + '" 서식 적용'); }
                } });
              },
              dup: () => {
                if (!canManage) return;
                const l = this.cfLib(cfOrg), id = newId();
                l.forms.push({ id: id, name: f.name + ' (복사본)', ver: 1, updatedAt: nowStamp(), by: userName, data: Object.assign({}, f.data) });
                this.cfLibSave(cfOrg, l); this.setState({ cfEditId: id, cformDraft: null });
                this.flash('"' + f.name + '" 서식을 복제했습니다 — 수정 후 저장하세요');
              },
              del: () => {
                if (!canManage) return;
                if (active) { this.flash('적용 중인 서식은 삭제할 수 없습니다 — 다른 서식을 먼저 적용하세요'); return; }
                this.setState({ dialog: { title: '"' + f.name + '" 서식을 삭제할까요?', body: '삭제한 서식은 되돌릴 수 없습니다. 이미 받은 동의서에는 영향이 없습니다.', cta: '삭제',
                  confirm: () => { const l = this.cfLib(cfOrg); l.forms = l.forms.filter(x => x.id !== f.id); this.cfLibSave(cfOrg, l); this.setState({ dialog: null, cfEditId: null, cformDraft: null }); this.flash('"' + f.name + '" 서식 삭제'); } } });
              }
            };
          }),
          cfNewName: s.cfNewName || '',
          onCfNewName: (e) => this.setState({ cfNewName: e.target.value }),
          cfAddNew: guardDirty(() => {
            if (!canManage) return;
            const nm = (this.state.cfNewName || '').trim() || '새 동의서 ' + (lib.forms.length + 1);
            const l = this.cfLib(cfOrg), id = newId();
            l.forms.push({ id: id, name: nm, ver: 1, updatedAt: nowStamp(), by: userName, data: Object.assign({}, this.CFORM_DEFAULT) });
            this.cfLibSave(cfOrg, l); this.setState({ cfEditId: id, cformDraft: null, cfNewName: '' });
            this.flash('"' + nm + '" 서식을 만들었습니다 — 내용을 입력하고 저장하세요');
          }),
          onCfEditName: (e) => {
            const v = e.target.value; const l = this.cfLib(cfOrg);
            l.forms = l.forms.map(x => x.id === editForm.id ? Object.assign({}, x, { name: v }) : x);
            this.cfLibSave(cfOrg, l);
          },
          cfCopyOpts: (s.orgs || []).filter(o => o.id !== cfOrg).map(o => ({ id: o.id, name: o.name })),
          cfHasCopyTargets: isSys && (s.orgs || []).length > 1,
          cfCopyTo: s.cfCopyTo || '',
          onCfCopyTo: (e) => this.setState({ cfCopyTo: e.target.value }),
          cfCopyGo: () => {
            const to = this.state.cfCopyTo;
            if (!to) { this.flash('복사할 기관을 고르세요'); return; }
            const l = this.cfLib(to), id = newId();
            l.forms.push({ id: id, name: editForm.name + ' (' + orgNm(cfOrg) + '에서 복사)', ver: 1, updatedAt: nowStamp(), by: userName, data: Object.assign({}, draft) });
            this.cfLibSave(to, l); this.setState({ cfCopyTo: '' });
            this.flash(orgNm(to) + '에 "' + editForm.name + '" 서식을 복사했습니다 — 그 기관에서 [적용]을 눌러야 사용됩니다');
          },
          cfTitle: cf.title, cfSubtitle: cf.subtitle, cfBody: cf.body,
          cfSelfName: sel.name || '', cfGuardName: g1 || '　',
          cfDate: d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일',
          cfOrg: orgName,
          noticeRows: [
            { label: '사용목적', value: cf.purpose },
            { label: '사용매체', value: cf.media },
            { label: '사용형식', value: cf.form }
          ],
          cfd: draft,
          onCfTitle: setD('title'), onCfSubtitle: setD('subtitle'), onCfBody: setD('body'),
          onCfPurpose: setD('purpose'), onCfMedia: setD('media'), onCfForm: setD('form'),
          cfPreviewBody: cf.body,
          ...(() => {
            const sub = (v) => String(v || '').split('{기관}').join(orgName || '기관');
            return {
              cfpTitle: sub(draft.title), cfpSubtitle: sub(draft.subtitle), cfpBody: sub(draft.body),
              cfpItems: [['사용목적', draft.purpose], ['사용매체', draft.media], ['사용형식', draft.form]].map(([l, v]) => ({ label: l, value: sub(v) })),
              cfpDirty: !!s.cformDraft,
              cfpYear: new Date().getFullYear(),
              cfpZoom: () => {
                const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
                let mg = { t: 22, b: 22, l: 20, r: 20 };
                try { mg = Object.assign(mg, JSON.parse(localStorage.getItem('smartcare.cformMargin.v1') || '{}')); } catch (e) {}
                const ctl = (k, label) => '<label>' + label + ' <input type="number" min="0" max="60" step="1" data-k="' + k + '" value="' + mg[k] + '"> mm</label>';
                const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>동의서 미리보기 · A4</title><style>'
                  + '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}'
                  + 'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1a1a1a;font-size:12pt;background:#5b5e6a}'
                  + '.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:10px 16px;background:#22242f;color:#e9e9ed;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.4)}'
                  + '.bar b{font-size:14px;font-weight:600;margin-right:6px}.bar label{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}'
                  + '.bar input{width:56px;padding:5px 6px;border-radius:6px;border:1px solid #555a6b;background:#161826;color:#e9e9ed;font:inherit}'
                  + '.bar button{padding:7px 14px;border-radius:8px;border:1px solid #9184d9;background:#2a2550;color:#e9e9ed;font:inherit;cursor:pointer;white-space:nowrap;box-shadow:0 2px 0 rgba(0,0,0,.4)}'
                  + '.bar button.g{border-color:#555a6b;background:transparent}.bar .sp{flex:1}'
                  + '.wrap{padding:24px 0 48px;display:flex;justify-content:center}'
                  + '.sheet{width:210mm;height:297mm;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.45);overflow:hidden;position:relative}'
                  + '.guide{position:absolute;border:1px dashed rgba(145,132,217,.6);pointer-events:none}'
                  + '@media print{body{background:#fff}.bar,.guide{display:none}.wrap{padding:0}.sheet{box-shadow:none}}'
                  + '#doc>:first-child{margin-top:0!important}#doc{transform-origin:top center}.fit{color:#ffd27a}'
                  + 'h1{font-size:24pt;font-weight:700;text-align:center;letter-spacing:.12em;margin:10mm 0 2mm}.sub{text-align:center;font-size:15pt;font-weight:700;margin-bottom:16mm}'
                  + '.u{display:inline-block;min-width:38mm;border-bottom:.6pt solid #333}p{line-height:2;margin:0 0 2mm;text-align:justify}'
                  + '.it{margin:4mm 0 0 4mm}.it div{margin:1mm 0 0 8mm;line-height:1.8}.dt{text-align:center;font-weight:700;font-size:14pt;margin:16mm 0 14mm;letter-spacing:.1em}'
                  + '.sr{display:flex;justify-content:flex-end;gap:6mm;margin:7mm 0;font-size:13pt;font-weight:700}.sv{display:inline-block;width:42mm;border-bottom:.6pt solid #333}.org{text-align:center;font-size:18pt;font-weight:700;margin-top:14mm}'
                  + '</style></head><body>'
                  + '<div class="bar"><b>A4 미리보기</b><span>여백</span>' + ctl('t', '위') + ctl('b', '아래') + ctl('l', '왼쪽') + ctl('r', '오른쪽')
                  + '<button class="g" id="rst">기본값</button><span class="fit" id="fit"></span><span class="sp"></span><button id="prt">🖨 인쇄</button></div>'
                  + '<div class="wrap"><div class="sheet" id="sheet"><div class="guide" id="guide"></div><div id="doc">'
                  + '<h1>' + esc(sub(draft.title)) + '</h1><div class="sub">' + esc(sub(draft.subtitle)) + '</div>'
                  + '<p>　본인 <span class="u"></span> 는 ( 또는 보호자 <span class="u"></span> 는 )</p><p>' + esc(sub(draft.body)) + '</p>'
                  + [['사용목적', draft.purpose], ['사용매체', draft.media], ['사용형식', draft.form]].map(([l, v]) => '<div class="it"><b>_ ' + l + ' :</b><div>' + esc(sub(v)) + '</div></div>').join('')
                  + '<div class="dt">' + new Date().getFullYear() + '년 　　월 　　일</div>'
                  + ['동의인', '보호자', '촬영자'].map(r => '<div class="sr"><span>' + r + ' :</span><span class="sv"></span><span>(인)</span></div>').join('')
                  + '<div class="org">' + esc(orgName) + '</div></div></div></div></body></html>';
                const w = window.open('', '_blank');
                if (!w) { this.flash('팝업이 차단되었습니다 — 브라우저 주소창 오른쪽에서 팝업을 허용하세요'); return; }
                w.document.open(); w.document.write(html); w.document.close();
                // 여백 조절: 새 창의 입력값으로 용지 안쪽 여백과 안내선을 갱신 (인쇄 시 그대로 적용)
                const D = { t: 22, b: 22, l: 20, r: 20 };
                const doc = w.document, sheet = doc.getElementById('sheet'), guide = doc.getElementById('guide');
                const ins = Array.from(doc.querySelectorAll('.bar input'));
                const apply = () => {
                  const m = {};
                  ins.forEach(i => { m[i.dataset.k] = Math.max(0, Math.min(60, Number(i.value) || 0)); });
                  sheet.style.padding = m.t + 'mm ' + m.r + 'mm ' + m.b + 'mm ' + m.l + 'mm';
                  guide.style.top = m.t + 'mm'; guide.style.bottom = m.b + 'mm'; guide.style.left = m.l + 'mm'; guide.style.right = m.r + 'mm';
                  // 여백 안에 다 들어가지 않으면 내용을 비율대로 줄여 한 장에 맞춤
                  const docEl = doc.getElementById('doc'), fit = doc.getElementById('fit');
                  docEl.style.transform = 'none';
                  const mm = sheet.clientHeight / 297;
                  const avail = sheet.clientHeight - (m.t + m.b) * mm;
                  const need = docEl.scrollHeight;
                  const k = need > avail ? Math.max(0.5, avail / need) : 1;
                  docEl.style.transform = k < 1 ? 'scale(' + k.toFixed(3) + ')' : 'none';
                  fit.textContent = k < 1 ? '여백이 커서 내용을 ' + Math.round(k * 100) + '%로 줄여 맞췄습니다' : '';
                  try { localStorage.setItem('smartcare.cformMargin.v1', JSON.stringify(m)); } catch (e) {}
                };
                ins.forEach(i => i.addEventListener('input', apply));
                doc.getElementById('rst').addEventListener('click', () => { ins.forEach(i => { i.value = D[i.dataset.k]; }); apply(); });
                doc.getElementById('prt').addEventListener('click', () => w.print());
                apply();
              }
            };
          })(),
          saveCform: () => {
            if (!canManage) { this.flash('서식 저장은 기관 관리자 또는 시스템 관리자만 할 수 있습니다'); return; }
            const l = this.cfLib(cfOrg);
            l.forms = l.forms.map(x => x.id === editForm.id ? Object.assign({}, x, { data: Object.assign({}, draft), ver: (x.ver || 1) + (s.cformDraft ? 1 : 0), updatedAt: nowStamp(), by: userName }) : x);
            this.cfLibSave(cfOrg, l);
            if (orgIdCur === 'ORG1' && editForm.id === l.activeId) { try { localStorage.setItem('smartcare.consentForm.v1', JSON.stringify(draft)); } catch (e) {} }
            this.setState({ cformDraft: null });
            this.flash('"' + editForm.name + '" 저장' + (editForm.id === l.activeId ? ' — 적용 중인 서식이라 현장 앱·인쇄에 바로 반영됩니다' : ' — [적용]을 눌러야 현장 앱에 사용됩니다'));
          },
          resetCform: () => this.setState({ cformDraft: Object.assign({}, this.CFORM_DEFAULT) })
        };
      })(),
      ...(() => {
        // 서면 동의: 스캔본 첨부 + 첨부 파일에 동의인·보호자 서명 확인 시에만 동의 체크 가능
        const pid = sel.id;
        const hasFile = (s.consentFiles[pid] || []).length > 0;
        const ps = (s.paperSign || {})[pid] || {};
        const gate = hasFile && !!ps['동의인'] && !!ps['보호자'];
        const setSign = (r) => () => {
          if (!hasFile) { this.flash('서면 동의서 스캔본을 먼저 첨부하세요'); return; }
          const all = Object.assign({}, this.state.paperSign || {});
          const cur = Object.assign({}, all[pid] || {}); cur[r] = !cur[r]; all[pid] = cur;
          const patch = { paperSign: all };
          if (!(cur['동의인'] && cur['보호자'])) patch.consent = { portrait: false, face: false };
          // 동의인·보호자 서명이 모두 확인되면 서면 동의 항목 2개를 자동 체크 (필요하면 직접 해제 가능)
          else { patch.consent = Object.assign({}, this.state.consent, { portrait: true, face: true }); setTimeout(() => this.flash('서명 확인 완료 — 초상권·생체정보 동의를 자동으로 체크했습니다 (동의하지 않은 항목은 눌러서 해제)'), 30); }
          this.setState(patch);
        };
        const mk = (key, label, note) => {
          const on = gate && !!s.consent[key];
          return {
            label: label, note: gate ? note : (hasFile ? '첨부 파일의 동의인·보호자 서명을 먼저 확인하세요' : '서면 동의서 스캔본을 먼저 첨부하세요'),
            pOn: on, pOff: !on,
            pOpacity: gate ? '1' : '0.55', pCursor: gate ? 'pointer' : 'not-allowed',
            pShadow: on ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
            pToggle: () => {
              if (!gate) { this.flash(hasFile ? '동의인·보호자 서명 확인 후 체크할 수 있습니다' : '서면 동의서 스캔본을 먼저 첨부하세요'); return; }
              const c = Object.assign({}, this.state.consent); c[key] = !c[key]; this.setState({ consent: c });
            }
          };
        };
        return {
          paperGate: gate, paperNoGate: !gate,
          paperSignRows: ['동의인', '보호자'].map(r => ({
            label: '첨부 파일에 ' + r + ' 서명 있음', on: !!ps[r], off: !ps[r],
            opacity: hasFile ? '1' : '0.55', go: setSign(r)
          })),
          paperItems: [
            mk('portrait', '초상권 및 개인정보 사용 동의', '위 내용(사진·영상 촬영 및 배포)에 대한 동의'),
            mk('face', '생체정보(안면인식) 처리 동의', '얼굴 특징 정보를 출석 확인에 사용하는 데 대한 동의')
          ]
        };
      })(),
      consentItems: [
        {
          label: '초상권 및 개인정보 사용 동의', note: '위 내용(사진·영상 촬영 및 배포)에 대한 동의',
          on: s.consent.portrait, off: !s.consent.portrait,
          shadow: s.consent.portrait ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
          toggle: () => this.setState({ consent: { portrait: !s.consent.portrait, face: s.consent.face } }),
          agree: () => this.setState({ consent: { portrait: true, face: s.consent.face } }),
          refuse: () => this.setState({ consent: { portrait: false, face: s.consent.face } })
        },
        {
          label: '안면인식(생체정보) 동의', note: '출석 자동화 목적 · 거부 시 수기 기록으로 대체',
          on: s.consent.face, off: !s.consent.face,
          shadow: s.consent.face ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
          toggle: () => this.setState({ consent: { portrait: s.consent.portrait, face: !s.consent.face } }),
          agree: () => this.setState({ consent: { portrait: s.consent.portrait, face: true } }),
          refuse: () => this.setState({ consent: { portrait: s.consent.portrait, face: false } })
        }
      ],
      signRows: ['동의인', '보호자', '촬영자'].map(role => ({
        role: role, name: role === '촬영자' ? userName : sel.name,
        hint: role === '보호자' ? '(대리 동의 시)' : (role === '촬영자' ? '(담당자)' : '(본인)'),
        signed: !!s.signed[role] && !!(s.signImgs || {})[role], unsigned: !(s.signed[role] && (s.signImgs || {})[role]),
        imgEl: (s.signImgs || {})[role] ? React.createElement('img', { src: s.signImgs[role], alt: role + ' 서명', style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' } }) : null,
        sign: () => { this._sigDirty = false; this.setState({ sigRole: role, sigEmpty: true }); }
      })),
      sigOpen: !!s.sigRole,
      sigTitle: s.sigRole ? s.sigRole + ' 서명 · ' + (s.sigRole === '촬영자' ? userName : sel.name) : '',
      sigEmpty: s.sigEmpty !== false,
      sigHasPrev: !!(s.sigRole && (s.signImgs || {})[s.sigRole]),
      sigCanvasRef: this._sigRefCb || (this._sigRefCb = (el) => {
        this._sigEl = el;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr);
        const ctx = el.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14161f'; ctx.lineWidth = 2.6;
      }),
      sigDown: (e) => {
        const el = this._sigEl; if (!el) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const r = el.getBoundingClientRect();
        this._sigPt = { x: e.clientX - r.left, y: e.clientY - r.top };
        const ctx = el.getContext('2d');
        ctx.beginPath(); ctx.arc(this._sigPt.x, this._sigPt.y, 1.3, 0, Math.PI * 2); ctx.fillStyle = '#14161f'; ctx.fill();
        if (this.state.sigEmpty !== false) this.setState({ sigEmpty: false });
      },
      sigMove: (e) => {
        const el = this._sigEl; if (!el || !this._sigPt) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const p = { x: e.clientX - r.left, y: e.clientY - r.top };
        const ctx = el.getContext('2d');
        const w = e.pressure && e.pointerType === 'pen' ? 1.4 + e.pressure * 2.6 : 2.6;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(this._sigPt.x, this._sigPt.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        this._sigPt = p;
      },
      sigUp: () => { this._sigPt = null; },
      sigClear: () => {
        const el = this._sigEl;
        if (el) { const ctx = el.getContext('2d'); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.width, el.height); ctx.restore(); }
        this.setState({ sigEmpty: true });
      },
      sigCancel: () => this.setState({ sigRole: null, sigEmpty: true }),
      sigRemove: () => {
        const role = s.sigRole;
        const imgs = Object.assign({}, s.signImgs || {}); delete imgs[role];
        this.setState({ signImgs: imgs, signed: Object.assign({}, s.signed, { [role]: false }), sigRole: null, sigEmpty: true });
        this.persistSigns(sel.id, imgs);
        this.flash(role + ' 서명을 지웠습니다');
      },
      sigSave: () => {
        const el = this._sigEl, role = s.sigRole;
        if (!el || s.sigEmpty !== false) { this.flash('서명을 먼저 해주세요'); return; }
        // 서명 영역만 잘라 저장
        const ctx = el.getContext('2d');
        const d = ctx.getImageData(0, 0, el.width, el.height).data;
        let x0 = el.width, y0 = el.height, x1 = 0, y1 = 0;
        for (let y = 0; y < el.height; y += 2) for (let x = 0; x < el.width; x += 2) {
          if (d[(y * el.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        }
        const pad = 16;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(el.width, x1 + pad); y1 = Math.min(el.height, y1 + pad);
        const out = document.createElement('canvas');
        out.width = Math.max(1, x1 - x0); out.height = Math.max(1, y1 - y0);
        out.getContext('2d').drawImage(el, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
        const url = out.toDataURL('image/png');
        const imgs = Object.assign({}, s.signImgs || {}, { [role]: url });
        this.setState({ signImgs: imgs, signed: Object.assign({}, s.signed, { [role]: true }), sigRole: null, sigEmpty: true });
        this.persistSigns(sel.id, imgs);
        this.flash(role + ' 서명 저장 완료');
      },
      consentPendingCount: PATIENTS.filter(p => p.consent !== '동의').length,
      pickOpen: s.pickOpen,
      openPick: () => this.setState({ pickOpen: true, pickQ: '' }),
      closePick: () => this.setState({ pickOpen: false }),
      ...(() => {
        const q = (s.pickQ || '').trim().replace(/\s+/g, '').toLowerCase();
        const pf = s.pickF || '미완료';
        const all = PATIENTS.filter(p => (p.stay || '재원') === '재원');
        const hit = all.filter(p => {
          if (pf === '미완료' && p.consent === '동의' && p.face === '동의') return false;
          if (pf === '완료' && !(p.consent === '동의' && p.face === '동의')) return false;
          if (!q) return true;
          return [p.name, p.room, p.id, p.chartNo].some(v => String(v || '').replace(/\s+/g, '').toLowerCase().indexOf(q) >= 0);
        });
        this._pickHit = hit;
        const nPend = all.filter(p => !(p.consent === '동의' && p.face === '동의')).length;
        return {
          pickQ: s.pickQ || '',
          onPickQ: (e) => this.setState({ pickQ: e.target.value }),
          pickFilters: [{ k: '미완료', n: nPend }, { k: '완료', n: all.length - nPend }, { k: '전체', n: all.length }].map(f => ({
            label: f.k + ' ' + f.n, cls: pf === f.k ? 'btn btn-primary' : 'btn btn-secondary',
            go: () => this.setState({ pickF: f.k })
          })),
          pickCount: hit.length + '명',
          pickEmpty: hit.length === 0
        };
      })(),
      pickCandidates: (this._pickHit || PATIENTS).map(p => ({
        name: p.name, room: p.room, sexAge: p.sex + ' ' + p.age,
        done: p.consent === '동의', pending: p.consent !== '동의',
        pick: () => {
          const saved = this.loadSigns(p.id);
          this.setState({
            sel: p.id, pickOpen: false,
            consent: { portrait: p.consent === '동의', face: p.face === '동의' },
            signImgs: saved,
            signed: { '동의인': !!saved['동의인'], '보호자': !!saved['보호자'], '촬영자': !!saved['촬영자'] }
          });
          this.flash(p.name + ' 동의서 양식을 불러왔습니다');
        }
      })),
      signStatus: signedCount + ' / 3 서명 완료' + (s.signed['보호자'] ? '' : ' · 보호자 서명은 의사결정 능력 저하 시 필수'),
      saveConsent: () => {
        if (!s.signed['동의인'] && !s.signed['보호자']) {
          this.flash('본인 또는 보호자 서명이 필요합니다');
          return;
        }
        if (!s.signed['촬영자']) { this.flash('담당자(촬영자) 서명이 필요합니다'); return; }
        // 전자 동의 기록 저장 → PC 동의서 관리에서 조회
        const nowD = new Date(), p2 = (n) => String(n).padStart(2, '0');
        const rec = {
          at: nowD.getFullYear() + '-' + p2(nowD.getMonth() + 1) + '-' + p2(nowD.getDate()) + ' ' + p2(nowD.getHours()) + ':' + p2(nowD.getMinutes()),
          device: s.device === 'tablet' ? '태블릿 현장 앱' : (s.device === 'pc' ? 'PC' : '스마트폰 현장 앱'),
          portrait: !!s.consent.portrait, face: !!s.consent.face,
          staff: userName, patientName: sel.name,
          signs: Object.assign({}, s.signImgs || {})
        };
        this.persistMobileConsent(sel.id, rec);
        const tgt = PATIENTS.find(p => p.id === sel.id);
        if (tgt) {
          tgt.consent = rec.portrait ? '동의' : '미동의';
          tgt.face = rec.face ? '동의' : '미동의';
          tgt.consentVia = '모바일';
          this.persistPatients(this.state.photoUrls);
        }
        this.setState({ mcTick: (s.mcTick || 0) + 1 });
        if (!s.consent.face) this.flash('안면인식 미동의로 저장 — 출석은 수기 기록으로 대체됩니다');
        else this.flash('동의서 저장 — PDF 생성 후 명부에 연결되었습니다');
        if (s.device === 'pc') this.setState({ pcView: 'patients', pdOpen: true });
        else this.setState({ mobileView: 'today' });
      },

      // 일지 · 검수
      logTabs: [
        { key: 'calendar', label: '캘린더', icon: 'ph ph-calendar-blank' },
        { key: 'list', label: '일지 목록', icon: 'ph ph-notebook', badge: logPendingN ? '검수 ' + logPendingN : '' },
        { key: 'attendance', label: '출석부', icon: 'ph ph-user-list' },
        { key: 'album', label: '앨범', icon: 'ph ph-images' }
      ].map(t => ({
        label: t.label, icon: t.icon, active: s.logTab === t.key, inactive: s.logTab !== t.key,
        hasBadge: !!t.badge, badge: t.badge || '',
        go: () => this.setState({ logTab: t.key })
      })),
      logTabList: s.logTab === 'list', logTabAttendance: s.logTab === 'attendance',
      logTabAlbum: s.logTab === 'album',
      // 데이터 서버가 응답하지 않아 사진을 못 받는 경우 안내 (끝없이 '불러오는 중'만 보이지 않게)
      // 오류일 때만 안내 띠 표시 (정상적으로 받는 중일 때는 띠 없이 사진 칸에 '불러오는 중'만)
      alSrvSlow: s.logTab === 'album' && !!this.cloudCfg() && s.cloudStatus === 'error',
      alSrvMsg: /504|500|57014|timeout/i.test(s.cloudErr || '')
        ? '데이터 서버가 응답하지 않아 사진을 불러오지 못하고 있습니다 (서버 시간 초과). 서버 쪽 문제로, 사진은 지워지지 않았습니다. 잠시 뒤 [다시 시도]를 누르세요.'
        : s.cloudStatus === 'error' ? '데이터 서버 연결 오류로 사진을 불러오지 못했습니다 — ' + (s.cloudErr || '') : '서버에서 사진을 받는 중입니다…',
      alSrvRetry: () => { this._pullBusy = false; this.flash('서버에 다시 연결합니다…'); this.cloudPull(!this._cloudReady); },
      ...(() => {
        const miss = this._wphMissing || {};
        // 앨범을 열 때 아직 점검 안 했으면 한 번 점검
        if (s.logTab === 'album' && this._cloudReady && !this._wphCheckedAt) { this._wphCheckedAt = Date.now(); setTimeout(() => this.checkWphMissing(), 0); }
        const where = [];
        Object.keys(s.sessions || {}).forEach(k => { const n = ((s.sessions[k] || {}).photos || []).filter(p => p && typeof p.url === 'string' && miss[p.url.slice(4)]).length; if (n) where.push({ k, n }); });
        const total = where.reduce((a, w) => a + w.n, 0);
        return {
          alMissingHas: s.logTab === 'album' && total > 0,
          alMissingMsg: '서버에 파일이 없는 사진 ' + total + '장 — ' + where.map(w => w.k.replace('|', ' ')).join(', ') + '. 사진을 올리는 중 연결이 끊겨 저장되지 않은 것으로 보입니다. 원본이 있으면 그 일지에 다시 올려 주세요.',
          alMissingFix: () => this.setState({ dialog: {
            title: '서버에 없는 사진 ' + total + '장을 목록에서 뺄까요?',
            body: where.map(w => w.k.replace('|', ' ') + ' · ' + w.n + '장').join('\n') + '\n\n파일이 없는 빈 자리만 빠지고, 일지의 참여자·확정 상태는 그대로입니다.',
            cta: '목록에서 빼기',
            confirm: () => {
              const st = this.state;
              const ss = Object.assign({}, st.sessions || {});
              where.forEach(w => { const v = ss[w.k]; if (v) ss[w.k] = Object.assign({}, v, { photos: (v.photos || []).filter(p => !(p && typeof p.url === 'string' && miss[p.url.slice(4)])) }); });
              const patch = { sessions: ss, dialog: null };
              if (st.activeSession && where.some(w => w.k === st.activeSession)) patch.photos = (st.photos || []).filter(p => !(p && typeof p.url === 'string' && miss[p.url.slice(4)]));
              this.setState(patch);
              this._wphMissing = {};
              this.flash('서버에 없는 사진 ' + total + '장을 목록에서 뺐습니다');
            }
          } })
        };
      })(),
      ...(() => {
        const st = s.plScan, orph = s.plOrphans || [], dups = s.plDups || [];
        const WD = ['일', '월', '화', '수', '목', '금', '토'];
        const lab = (k) => { const [d, p] = k.split('|'); const dt = new Date(d + 'T00:00:00'); return (dt.getMonth() + 1) + '/' + dt.getDate() + '(' + WD[dt.getDay()] + ') ' + p; };
        const upAt = (id, at) => {
          const t = parseInt(String(id).split('-')[1], 10);
          const d = t > 1e12 ? new Date(t) : (at ? new Date(at) : null);
          return d ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '—';
        };
        const pic = (id) => { const u = (this._wphCache || {})[id]; return u ? this.img(u, '사진') : null; };
        const keys = Object.keys(this.allSessionsNow()).filter(k => /^\d{4}-\d{2}-\d{2}\|/.test(k)).sort().reverse();
        const tgt = s.plTarget || {};
        const bad = orph.length + dups.length;
        return {
          plLoading: st === 'loading',
          plBtn: st === 'loading' ? '점검 중…' : (st === 'done' ? '다시 점검' : '점검하기'),
          plScanGo: () => this.scanPhotoLinks(),
          plSummary: st === 'loading' ? '서버의 사진과 일지를 대조하는 중…'
            : st === 'done' ? (bad ? '연결 끊긴 사진 ' + orph.length + '장 · 중복 연결 ' + dups.length + '장 발견 (' + s.plAt + ' 점검)' : '모든 사진이 정상적으로 연결되어 있습니다 (' + s.plAt + ' 점검)')
            : st === 'error' ? '점검 실패 — 다시 눌러 주세요' : '사진이 다른 일지에 들어갔거나 빠진 것이 없는지 확인합니다',
          plSumColor: st === 'done' && bad ? 'oklch(0.80 0.12 40)' : 'var(--color-neutral-500)',
          plShadow: st === 'done' && bad ? '0 0 0 1px oklch(0.50 0.12 40)' : 'var(--shadow-sm)',
          plHasOrphans: orph.length > 0, plHasDups: dups.length > 0,
          // 문제가 있을 때만 넓은 상자로, 평소에는 한 줄 작은 띠로
          plCompact: !(st === 'done' && bad),
          plHasIssue: st === 'done' && bad,
          plNeverTrue: false,
          // 제목 줄에서 점검: 문제가 나오면 앨범 화면으로 이동해 목록을 보여 줌
          plScanGoAlbum: async () => { await this.scanPhotoLinks(); const o = (this.state.plOrphans || []).length + (this.state.plDups || []).length; if (o > 0) this.setState({ logTab: 'album' }); },
          plBoxPad: st === 'done' && bad ? 'var(--space-4) var(--space-6)' : '6px 8px 6px 12px',
          plBoxBg: st === 'done' && bad ? 'var(--color-surface)' : 'transparent',
          plBoxRadius: st === 'done' && bad ? 'var(--radius-md)' : '999px',
          plBoxAlign: st === 'done' && bad ? 'stretch' : 'flex-end',
          plBoxSh: st === 'done' && bad ? '0 0 0 1px oklch(0.50 0.12 40)' : '0 0 0 1px var(--color-neutral-800)',
          plHelpOpen: !!s.plHelpOpen,
          plHelpToggle: () => this.setState({ plHelpOpen: !this.state.plHelpOpen }),
          plChipText: st === 'loading' ? '점검 중…' : st === 'done' ? (bad ? '문제 ' + (orph.length + dups.length) + '건' : '정상 · ' + s.plAt) : st === 'error' ? '점검 실패' : '점검 전',
          plChipColor: st === 'done' && !bad ? 'oklch(0.76 0.14 150)' : st === 'error' || (st === 'done' && bad) ? 'oklch(0.80 0.12 40)' : 'var(--color-neutral-500)',
          plDelAll: () => this.deleteAllOrphans(), plOrphanN: orph.length,
          plLogOpts: keys.map(k => ({ v: k, label: lab(k) + ' · 사진 ' + this.sessPhotos(k).length + '장' })),
          plOrphanRows: orph.map(o => ({
            el: pic(o.id), at: upAt(o.id, o.at), target: tgt[o.id] || '',
            onTarget: (e) => this.setState({ plTarget: Object.assign({}, this.state.plTarget || {}, { [o.id]: e.target.value }) }),
            attach: () => this.attachOrphan(o.id, (this.state.plTarget || {})[o.id]),
            del: () => this.deleteOrphan(o.id),
            zoom: () => { const u = (this._wphCache || {})[o.id]; if (u) this.setState({ zoom: { url: u, title: '연결 끊긴 사진', meta: '올린 시간 ' + upAt(o.id, o.at) } }); }
          })),
          plDupRows: dups.map(d => ({
            el: pic(d.id), at: upAt(d.id), n: d.keys.length,
            logs: d.keys.slice().sort().map(k => ({ label: lab(k), detach: () => this.detachPhoto(d.id, k) })),
            zoom: () => { const u = (this._wphCache || {})[d.id]; if (u) this.setState({ zoom: { url: u, title: '여러 일지에 들어간 사진', meta: '올린 시간 ' + upAt(d.id) } }); }
          }))
        };
      })(),
      ...(s.logTab === 'album' ? this.albumVals(s) : { alZoomOpen: false }),
      logTabPlan: s.logTab === 'plan' || s.logTab === 'calendar',
      calDisplay: (s.logTab === 'calendar' || s.logTab === 'plan') ? 'flex' : 'none',
      planTabOnly: s.logTab === 'plan',
      themeOpts: [{ k: 'light', label: '라이트', icon: 'ph ph-sun' }, { k: 'dark', label: '다크', icon: 'ph ph-moon' }].map(o => {
        const cur = s.theme || 'dark';
        return { label: o.label, icon: o.icon, on: cur === o.k, off: cur !== o.k,
          go: () => { this.setState({ theme: o.k }); this.applyTheme(o.k, s.accent || '#9184d9'); this.flash(o.label + ' 모드'); } };
      }),
      accentOpts: [
        { name: '보라 (기본)', hex: '#9184d9' }, { name: '파랑', hex: '#4f8fe0' }, { name: '청록', hex: '#2fa59a' },
        { name: '초록', hex: '#5aa55a' }, { name: '주황', hex: '#e08a3c' }, { name: '분홍', hex: '#d9668f' }
      ].map(c => {
        const on = (s.accent || '#9184d9').toLowerCase() === c.hex;
        return { name: c.name, hex: c.hex, on: on ? 'true' : 'false',
          ring: on ? '0 0 0 2px var(--color-bg), 0 0 0 4px ' + c.hex : 'inset 0 0 0 1px rgba(0,0,0,0.2)',
          go: () => { this.setState({ accent: c.hex }); this.applyTheme(s.theme || 'dark', c.hex); } };
      }),
      accentHex: s.accent || '#9184d9',
      customRing: ['#9184d9', '#4f8fe0', '#2fa59a', '#5aa55a', '#e08a3c', '#d9668f'].indexOf((s.accent || '#9184d9').toLowerCase()) < 0 ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)' : 'none',
      onAccentPick: (e) => { const v = e.target.value; this.setState({ accent: v }); this.applyTheme(this.state.theme || 'dark', v); },
      planSplitRef: this._planSplit,
      // 캘린더를 넓혀 오른쪽 목록 폭이 380px보다 좁아지면 목록을 캘린더 아래로 자동 이동
      ...(() => {
        const side = s.logTab === 'calendar' && !s.planNarrow;
        const pct = s.calPct || 55;
        const listW = (s.planW || 1200) * (100 - pct) / 100 - 18;
        const stacked = side && (pct >= 80 || listW < 380);
        return {
          planCols: side ? (stacked ? 'minmax(0, 1fr) 18px' : pct + '% 18px minmax(0, 1fr)') : 'minmax(0, 1fr)',
          planListCol: stacked ? '1 / -1' : 'auto',
          planListTop: stacked ? 'var(--space-8)' : '0px',
          planStacked: stacked
        };
      })(),
      planGap: s.planNarrow ? 'var(--space-8)' : '0px',
      splitDisplay: s.logTab === 'calendar' && !s.planNarrow ? 'flex' : 'none',
      splitColor: s.splitDrag ? 'var(--color-accent)' : 'var(--color-neutral-600)',
      splitReset: () => { this.setState({ calPct: 55 }); try { localStorage.setItem('sc.calPct', '55'); } catch (e) {} },
      splitKey: (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const v = Math.max(30, Math.min(92, (this.state.calPct || 55) + (e.key === 'ArrowLeft' ? -3 : 3)));
        this.setState({ calPct: v }); try { localStorage.setItem('sc.calPct', String(v)); } catch (er) {}
      },
      splitDown: (e) => {
        const box = this._planSplit.current;
        if (!box) return;
        e.preventDefault();
        const rect = box.getBoundingClientRect();
        this.setState({ splitDrag: true });
        const move = (ev) => {
          const v = Math.max(30, Math.min(92, Math.round((ev.clientX - rect.left) / rect.width * 100)));
          if (v !== this.state.calPct) this.setState({ calPct: v });
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          this.setState({ splitDrag: false });
          try { localStorage.setItem('sc.calPct', String(this.state.calPct || 55)); } catch (er) {}
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      },
      ...this.planVals(s),
      logSummary: '전체 ' + logData.length + '건 · 미작성 ' + logData.filter(l => l.status === '미작성').length + '건 · 검수 필요 ' + logData.filter(l => l.status === '검수 필요').length + '건 · 검수 완료 ' + logData.filter(l => l.status === '확정').length + '건',
      logRows: logRows,
      attendance: attView,
      attendanceSummary: (attPatient === '전체' && attMode === 'ward'
        ? '병동 ' + attWardGroupsRaw.length + '개 · 출석 ' + attBase.length + '건'
        : attPatient === '전체' && attMode === 'patient'
        ? '환자 ' + attGroupsRaw.length + '명 · 출석 ' + attBase.length + '건'
        : (attView.length ? '총 ' + attView.length + '행' : '조건에 맞는 출석 기록이 없습니다')) + ' · ' + (attProgram === '전체' ? '전체 프로그램' : attProgram) + ' · 확정 데이터만',
      ...this.hoverVals(s),
      ...this.emrVals(s),
      emrOpen: () => this.setState({ emrOpenNow: true, emrText: '', emrAddWards: true, emrDischarge: true, emrReadmit: {}, emrOutSkip: {} }),
      ...(() => {
        const u = (s.emrUndo || [])[0];
        const fmt = (iso) => { const d = new Date(iso); const p2 = (n) => String(n).padStart(2, '0'); const h = d.getHours(); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + p2(d.getMinutes()); };
        const dupN = this.chartDupGroups().length;
        return {
          emrCanUndo: !!u,
          emrUndoLabel: u ? '되돌리기 (' + fmt(u.at) + ' ' + u.reason + ' 이전)' : '',
          askEmrUndo: () => {
            if (!u) return;
            this.setState({ dialog: {
              title: '명부를 ' + fmt(u.at) + ' ' + u.reason + ' 이전으로 되돌릴까요?',
              body: '환자 명부를 그때의 상태(' + u.n + '명)로 복원합니다. 그 뒤에 붙여넣기로 추가·변경·퇴원 처리된 내용이 취소됩니다. 프로그램 일지·출석·동의서·사진은 지워지지 않습니다. 다른 PC에도 바로 반영됩니다.',
              cta: '되돌리기', confirm: () => this.emrUndoNow()
            } });
          },
          emrDupHas: dupN > 0,
          emrDupText: '차트번호 표기 차이(예: 188 / 00000188)로 같은 환자가 2번 등록된 경우가 ' + dupN + '명 있습니다.',
          askMergeDups: () => this.setState({ dialog: {
            title: '중복 등록된 환자 ' + dupN + '명을 하나로 합칠까요?',
            body: '같은 차트번호(앞자리 0 무시)의 환자를 1명으로 합칩니다. 먼저 등록된 기록을 남겨 프로그램 참여·동의서·사진 연결을 유지하고, 병실·입원일 등은 최신 명부 값으로 바꿉니다. 잘못 퇴원 처리된 경우 재원으로 되돌립니다. 합치기 전 명부는 보관되어 [되돌리기]로 복원할 수 있습니다.',
            cta: '합치기', confirm: () => this.mergeChartDups()
          } })
        };
      })(),
      ...(() => {
        const L = s.emrLast;
        if (!L || !L.at) return { emrLastHas: false, emrLastNone: true, emrLastText: '', emrLastSub: '' };
        const d = new Date(L.at);
        const p2 = (n) => String(n).padStart(2, '0');
        const h = d.getHours(), ap = h < 12 ? '오전' : '오후', h12 = h % 12 === 0 ? 12 : h % 12;
        const when = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + ap + ' ' + h12 + '시 ' + d.getMinutes() + '분';
        const days = Math.floor((new Date(this.todayIso() + 'T00:00:00') - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
        const ago = days <= 0 ? '오늘' : days === 1 ? '어제' : days + '일 전';
        return {
          emrLastHas: true, emrLastNone: false,
          emrLastShort: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ap + ' ' + h12 + ':' + p2(d.getMinutes()),
          emrDetailOpen: !!s.emrDetailOpen,
          emrDetailLabel: s.emrDetailOpen ? '접기' : '자세히',
          emrDetailToggle: () => this.setState({ emrDetailOpen: !this.state.emrDetailOpen }),
          emrLastText: when + '에 재원환자 명부를 붙여넣기를 했습니다.',
          emrLastSub: [ago, L.by ? L.by : '', '명부 ' + (L.total || 0) + '명', '신규 ' + (L.nNew || 0), '병실 변경 ' + (L.nMove || 0), '정보 갱신 ' + (L.nUpd || 0)].concat(L.nOut ? ['퇴원 ' + L.nOut] : []).filter(Boolean).join(' · '),
          emrLastStale: days >= 7
        };
      })(),
      ...this.rangePickerVals(s, { att: [attFrom, attTo], ws: [wsFrom, wsTo], plan: s.planRange ? [s.planRange.from, s.planRange.to] : (() => { const ym2 = s.calMonth || this.todayIso().slice(0, 7); const [yy, mm] = ym2.split('-').map(Number); return [ym2 + '-01', ym2 + '-' + String(new Date(yy, mm, 0).getDate()).padStart(2, '0')]; })() }),
      wsFrom: wsFrom, wsTo: wsTo,
      onWsFrom: (e) => { const v = e.target.value; if (!v) return; this.setState({ wsFrom: v, wsTo: v > wsTo ? v : wsTo }); },
      onWsTo: (e) => { const v = e.target.value; if (!v) return; this.setState({ wsTo: v, wsFrom: v < wsFrom ? v : wsFrom }); },
      wsPresets: wsPresetDefs.map(p => ({
        label: p.label,
        cls: p.from === wsFrom && p.to === wsTo ? 'btn btn-primary' : 'btn btn-secondary',
        ...(p.from === wsFrom && p.to === wsTo ? { bg: 'var(--color-accent-900)', fg: 'var(--color-accent-200)', sh: '0 0 0 1px var(--color-accent)' } : { bg: 'transparent', fg: 'var(--color-neutral-400)', sh: 'none' }),
        go: () => this.setState({ wsFrom: p.from, wsTo: p.to })
      })),
      wsWardOpts: ['전체'].concat(wsWardList).map(w => ({
        label: w === '전체' ? '전체 병동' : w,
        cls: w === wsWard ? 'btn btn-primary' : 'btn btn-secondary',
        ...(w === wsWard ? { bg: 'var(--color-accent-900)', fg: 'var(--color-accent-200)', sh: '0 0 0 1px var(--color-accent)' } : { bg: 'transparent', fg: 'var(--color-neutral-400)', sh: 'none' }),
        go: () => this.setState({ wsWard: w })
      })),
      wsPeriodLabel: fmtK(wsFrom) + ' ~ ' + fmtK(wsTo) + ' · ' + (wsWard === '전체' ? '전체 병동 비교' : wsWard + ' 프로그램별') + ' · 확정 데이터',
      wsColLabel: wsWard === '전체' ? '병동' : '프로그램',
      wsRows: groups.map(g => ({
        label: g.label, sub: g.sub, people: g.people, count: g.count,
        avg: g.people ? (g.count / g.people).toFixed(1) + '회' : '—',
        pw: Math.round(g.people / maxP * 100) + '%', cw: Math.round(g.count / maxC * 100) + '%'
      })),
      wsEmpty: wsScope.length === 0,
      wsTotalPeople: wsPeople,
      wsTotalCount: wsScope.length,
      wsAvg: wsPeople ? (wsScope.length / wsPeople).toFixed(1) : '0',
      wsSessions: uniq(wsScope.map(r => r.date + '|' + r.program)).length,
      ...(() => {
        const DAY = 86400000, toD = new Date(wsTo + 'T00:00:00').getTime();
        const wk = Array.from({ length: 12 }, (_, i) => {
          const end = toD - (11 - i) * 7 * DAY, start = end - 6 * DAY;
          const rs = wsScope.filter(r => { const t = new Date(fullDate(r.date) + 'T00:00:00').getTime(); return t >= start && t <= end; });
          const pp = uniq(rs.map(r => r.name)).length;
          return { pp: pp, n: rs.length, avg: pp ? rs.length / pp : 0, ss: uniq(rs.map(r => r.date + '|' + r.program)).length };
        });
        const wardSel6 = wsWard === '전체' ? (s.wards || []).map(w => w.name) : [wsWard];
        const inWard = PATIENTS.filter(p => (p.stay || '재원') === '재원' && wardSel6.some(w => (p.room || '').indexOf(w + ' ') === 0)).length;
        const peakPct = (arr) => { const mx = Math.max(0, ...arr); return mx ? arr[arr.length - 1] / mx * 100 : 0; };
        const pp = wsPeople, n = wsScope.length, ss = uniq(wsScope.map(r => r.date + '|' + r.program)).length;
        const kv = s.kpiView || 'ring';
        return {
          ws06Cards: this.buildKpiCards([
            { key: 'w6p', label: '실인원', icon: 'ph ph-users-three', color: 'oklch(0.74 0.12 230)', val: String(pp), unit: '명', sub: inWard ? '재원 ' + inWard + '명 중 ' + Math.round(pp / inWard * 100) + '% · 중복 제외' : '중복 제외 환자 수', pct: inWard ? pp / inWard * 100 : 0, arr: wk.map(w => w.pp), dUnit: '명' },
            { key: 'w6n', label: '참여 건수', icon: 'ph ph-list-checks', color: 'oklch(0.76 0.14 145)', val: String(n), unit: '건', sub: '연인원 · 최근 주 / 최고 주 ' + Math.round(peakPct(wk.map(w => w.n))) + '%', pct: peakPct(wk.map(w => w.n)), arr: wk.map(w => w.n), dUnit: '건' },
            { key: 'w6a', label: '1인당 평균', icon: 'ph ph-user-circle-plus', color: 'var(--color-accent)', val: pp ? (n / pp).toFixed(1) : '0', unit: '회', sub: '참여 건수 ÷ 실인원 · 기준 4회', pct: pp ? Math.min(100, n / pp / 4 * 100) : 0, target: null, arr: wk.map(w => w.avg), dUnit: '회', dDig: 1 },
            { key: 'w6s', label: '진행 회차', icon: 'ph ph-calendar-check', color: 'oklch(0.80 0.12 85)', val: String(ss), unit: '회', sub: '일자 × 프로그램 · 최근 주 / 최고 주 ' + Math.round(peakPct(wk.map(w => w.ss))) + '%', pct: peakPct(wk.map(w => w.ss)), arr: wk.map(w => w.ss), dUnit: '회' }
          ]),
          ws06Ring: kv === 'ring' ? 'grid' : 'none',
          ws06Trend: kv === 'trend' ? 'grid' : 'none',
          ws06Panel: kv === 'panel' ? 'flex' : 'none'
        };
      })(),
      wsNote: wsWard === '전체' ? '병동을 누르면 해당 병동의 프로그램별 통계로 바뀝니다' : '실인원은 같은 환자가 여러 번 참여해도 1명으로 셉니다',
      attFrom: attFrom, attTo: attTo, attProgram: attProgram,
      onAttFrom: (e) => { const v = e.target.value; if (!v) return; this.setState({ attFrom: v, attTo: v > attTo ? v : attTo }); },
      onAttTo: (e) => { const v = e.target.value; if (!v) return; this.setState({ attTo: v, attFrom: v < attFrom ? v : attFrom }); },
      onAttProgram: (e) => this.setState({ attProgram: e.target.value }),
      attProgramOpts: ['전체'].concat(attPrograms).map(p => ({ value: p, label: p === '전체' ? '전체 프로그램' : p })),
      attPresets: attPresets.map(pr => ({
        label: pr.label,
        active: pr.from === attFrom && pr.to === attTo, inactive: !(pr.from === attFrom && pr.to === attTo),
        go: () => this.setState({ attFrom: pr.from, attTo: pr.to })
      })),
      attFiltered: attFrom !== ATT_DEF_FROM || attTo !== ATT_DEF_TO || attProgram !== '전체' || attPatient !== '전체',
      resetAtt: () => this.setState({ attFrom: ATT_DEF_FROM, attTo: ATT_DEF_TO, attProgram: '전체', attPatient: '전체', attWard: '전체' }),
      attModes: [
        { key: 'row', label: '전체 출석 기록', icon: 'ph ph-list-bullets' },
        { key: 'patient', label: '환자별 출석부', icon: 'ph ph-users' },
        { key: 'ward', label: '병동별 출석부', icon: 'ph ph-buildings' }
      ].map(m => {
        const on = attPatient === '전체' ? attMode === m.key : m.key === 'patient';
        return { label: m.label, icon: m.icon, active: on, inactive: !on, go: () => this.setState({ attMode: m.key, attPatient: '전체' }) };
      }),
      attPatient: attPatient,
      onAttPatient: (e) => this.setState({ attPatient: e.target.value }),
      attPatientOpts: (() => {
        const names = PATIENTS.map(p => p.name)
          .concat(attendance.map(a => a.name))
          .concat(attPatient !== '전체' ? [attPatient] : [])
          .filter((n, i, arr) => n && arr.indexOf(n) === i)
          .sort((a, b) => a.localeCompare(b, 'ko'));
        return [{ value: '전체', label: '전체 환자' }].concat(names.map(n => {
          const rec = PATIENTS.find(p => p.name === n);
          const row = attendance.find(a => a.name === n);
          const room = rec ? rec.room : (row ? row.room : '');
          return { value: n, label: n + (room ? ' · ' + room : '') + ' (' + attBase.filter(a => a.name === n).length + '회)' };
        }));
      })(),
      attByPatient: attPatient === '전체' && attMode === 'patient',
      attByWard: attPatient === '전체' && attMode === 'ward',
      attWardEmpty: attWardGroupsRaw.length === 0,
      attWard: s.attWard || '전체',
      onAttWard: (e) => this.setState({ attWard: e.target.value }),
      attWardOpts: ['전체'].concat(wardOrder.filter(w => attendance.some(a => wardOfRoom(a.room) === w)), attendance.map(a => wardOfRoom(a.room)).filter(w => wardOrder.indexOf(w) < 0))
        .filter((w, i, arr) => arr.indexOf(w) === i)
        .map(w => ({ value: w, label: w === '전체' ? '전체 병동' : w })),
      attWardGroups: attWardGroupsRaw.map(g => {
        const people = [];
        g.rows.forEach(r => { let p = people.find(x => x.name === r.name); if (!p) { p = { name: r.name, room: r.room, rows: [] }; people.push(p); } p.rows.push(r); });
        people.sort((a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko'));
        const open = (s.attWardOpen || {})[g.ward] !== false;
        return {
          ward: g.ward, count: g.rows.length, people: people.length,
          programs: progCount(g.rows).map(x => ({ name: x.name, count: x.count + '건' })),
          open: open, toggleLabel: open ? '접기' : '명단 보기', chevron: open ? 'ph ph-caret-up' : 'ph ph-caret-down',
          toggle: () => { const m = Object.assign({}, this.state.attWardOpen || {}); m[g.ward] = !open; this.setState({ attWardOpen: m }); },
          rows: people.map(p => ({
            name: p.name, room: p.room, count: p.rows.length,
            programs: progCount(p.rows).map(x => x.name + ' ' + x.count).join(' · '),
            last: p.rows.map(r => fullDate(r.date)).sort().slice(-1)[0],
            open: () => this.setState({ attPatient: p.name })
          }))
        };
      }),
      attByRow: attPatient !== '전체' || attMode === 'row',
      attOnePatient: attPatient !== '전체',
      attGroups: attGroupsRaw.map(g => ({
        name: g.name, room: g.room, sexAge: g.sexAge,
        count: g.rows.length + '회',
        programs: progCount(g.rows).map(x => x.name + ' ' + x.count).join(' · '),
        last: g.rows.map(r => fullDate(r.date)).sort().slice(-1)[0].slice(5),
        open: () => this.setState({ attPatient: g.name })
      })),
      attPt: (() => {
        const rec = attPtRec;
        const url = rec ? s.photoUrls[rec.id] : null;
        const row = attendance.find(a => a.name === attPatient);
        return {
          name: attPatient,
          meta: rec ? rec.room + ' · ' + rec.sex + ' ' + rec.age + ' · ' + (rec.stay || '재원') : (row ? row.room + ' · ' + row.sexAge + ' · 명부 미등록' : ''),
          total: attFrom + ' ~ ' + attTo + ' · 총 ' + attView.length + '회 참여',
          programs: progCount(attView),
          hasPhoto: !!url, noPhoto: !url,
          photoEl: url ? this.img(url, attPatient + ' 증명사진') : null
        };
      })(),
      statsRef: this._statsRef,
      exportBusy: !!s.exportBusy,
      statsPrint: () => { this._userName = userName; this.runStatsReport('print'); },
      statsPdf: () => { this._userName = userName; this.runStatsReport('pdf'); },
      statsJpg: () => { this._userName = userName; this.runStatsReport('jpg'); },
      printAtt: () => {
        const byPatient = attPatient === '전체' && attMode === 'patient';
        if (byPatient ? !attGroupsRaw.length : !attView.length) { this.flash('인쇄할 출석 기록이 없습니다'); return; }
        const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
        const progLabel = attProgram === '전체' ? '전체 프로그램' : attProgram;
        let title, sub, head, rows, extra = '';
        if (attPatient === '전체' && attMode === 'ward') {
          title = '병동별 출석부' + ((s.attWard || '전체') !== '전체' ? ' · ' + s.attWard : '');
          sub = '병동 ' + attWardGroupsRaw.length + '개 · 출석 ' + attBase.length + '건';
          head = ['No', '병동', '이름', '병실', '참여 횟수', '참여 프로그램', '최근 참여'];
          rows = [];
          attWardGroupsRaw.forEach(g => {
            const people = [];
            g.rows.forEach(r => { let p = people.find(x => x.name === r.name); if (!p) { p = { name: r.name, room: r.room, rows: [] }; people.push(p); } p.rows.push(r); });
            people.sort((a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }));
            people.forEach(p => rows.push([rows.length + 1, g.ward, p.name, p.room, p.rows.length + '회', progCount(p.rows).map(x => x.name + ' ' + x.count).join(' · '), p.rows.map(r => fullDate(r.date)).sort().slice(-1)[0]]));
            rows.push(['', g.ward + ' 소계', '실인원 ' + people.length + '명', '', g.rows.length + '건', progCount(g.rows).map(x => x.name + ' ' + x.count).join(' · '), '']);
          });
        } else if (byPatient) {
          title = '환자별 출석부';
          sub = '환자 ' + attGroupsRaw.length + '명 · 출석 ' + attBase.length + '건';
          head = ['No', '이름', '병실', '성별·나이', '참여 횟수', '참여 프로그램', '최근 참여'];
          rows = attGroupsRaw.map((g, i) => [i + 1, g.name, g.room, g.sexAge, g.rows.length + '회', progCount(g.rows).map(x => x.name + ' ' + x.count).join(' · '), g.rows.map(r => fullDate(r.date)).sort().slice(-1)[0]]);
        } else if (attPatient !== '전체') {
          const rec = attPtRec, row0 = attendance.find(a => a.name === attPatient);
          title = attPatient + ' 출석부';
          sub = '총 ' + attView.length + '회 참여';
          extra = '<table class="info"><tr><th>이름</th><td>' + esc(attPatient) + '</td><th>병실</th><td>' + esc(rec ? rec.room : (row0 ? row0.room : '')) + '</td></tr>'
            + '<tr><th>성별·나이</th><td>' + esc(rec ? rec.sex + ' ' + rec.age + '세' : (row0 ? row0.sexAge : '')) + '</td><th>재원상태</th><td>' + esc(rec ? (rec.stay || '재원') : '—') + '</td></tr>'
            + '<tr><th>프로그램별</th><td colspan="3">' + esc(progCount(attView).map(x => x.name + ' ' + x.count + '회').join(' · ')) + '</td></tr></table>';
          head = ['No', '일자', '프로그램', '식별방식', '유사도', '확인'];
          rows = attView.map((a, i) => [i + 1, fullDate(a.date), a.program, a.method, a.sim, '']);
        } else {
          title = '프로그램 출석부';
          sub = '총 ' + attView.length + '행';
          head = ['No', '이름', '병실', '성별·나이', '프로그램', '일자', '식별방식', '유사도'];
          rows = attView.map((a, i) => [i + 1, a.name, a.room, a.sexAge, a.program, fullDate(a.date), a.method, a.sim]);
        }
        const now = new Date();
        const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>'
          + '@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1a1a1a;font-size:10.5pt;margin:0}'
          + 'header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5pt solid #1a1a1a;padding-bottom:6pt;margin-bottom:8pt}'
          + 'h1{font-size:17pt;font-weight:600;margin:0}.meta{font-size:9pt;color:#555;line-height:1.6;text-align:right}'
          + 'table{width:100%;border-collapse:collapse}th,td{border:0.6pt solid #999;padding:4.5pt 6pt;text-align:left;vertical-align:top}'
          + 'thead th{background:#eee;font-weight:600;font-size:9.5pt}thead{display:table-header-group}tr{page-break-inside:avoid}'
          + 'td:first-child{text-align:center;width:28pt;color:#666}.info{margin-bottom:10pt}.info th{background:#f3f3f3;width:70pt;font-weight:600}'
          + '.sign{display:flex;justify-content:flex-end;gap:0;margin-top:14pt}.sign div{border:0.6pt solid #999;width:70pt;text-align:center;font-size:9pt}.sign div span{display:block;border-bottom:0.6pt solid #999;padding:3pt;background:#f3f3f3}.sign div i{display:block;height:36pt}'
          + 'footer{margin-top:10pt;font-size:8.5pt;color:#777}'
          + '</style></head><body>'
          // 결재란은 문서 상단 우측 (제목 오른쪽)
          + '<header style="align-items:flex-start"><div><div style="font-size:9pt;color:#555">사회사업실 · 스마트케어</div><h1>' + esc(title) + '</h1>'
          + '<div class="meta" style="text-align:left;margin-top:4pt">기간 ' + esc(attFrom) + ' ~ ' + esc(attTo) + ' · ' + esc(progLabel) + ' · ' + esc(sub) + '<br>출력 ' + esc(stamp) + ' · ' + esc(userName) + '</div></div>'
          + (this.approvalLine().length ? '<div class="sign" style="margin-top:0;flex:none">' + this.approvalLine().map(t => '<div><span>' + esc(t) + '</span><i></i></div>').join('') + '</div>' : '')
          + '</header>'
          + extra
          + '<table><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
          + rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('')
          + '</tbody></table>'
          + '<footer>확정 데이터만 집계 · 이름·성별·나이는 환자 명부 기준 · 개인정보 포함 문서이므로 열람 후 파기하세요</footer>'
          + '</body></html>';
        const fr = document.createElement('iframe');
        fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(fr);
        const doc = fr.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        setTimeout(() => {
          try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { this.flash('인쇄 창을 열 수 없습니다'); }
          setTimeout(() => fr.remove(), 1500);
        }, 250);
        this.flash('인쇄 준비 — ' + title + ' (' + (byPatient ? attGroupsRaw.length + '명' : attView.length + '행') + ')');
      },
      exportCsv: () => {
        if (!attView.length) { this.flash('내보낼 출석 기록이 없습니다'); return; }
        const head = ['이름', '병실', '성별·나이', '프로그램', '일자', '식별방식', '유사도'];
        const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const csv = '\ufeff' + [head].concat(attView.map(a => [a.name, a.room, a.sexAge, a.program, '2026-' + a.date, a.method, a.sim])).map(r => r.map(esc).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = '출석부_' + attFrom + '_' + attTo + (attProgram === '전체' ? '' : '_' + attProgram) + (attPatient === '전체' ? '' : '_' + attPatient) + '.csv';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.flash('CSV 내려받기 — ' + attView.length + '행');
      },

      program: s.program,
      reviewRows: reviewRows, reviewCount: s.review.length,
      // 사진 불일치: 이 일지의 사진 목록에 없는 사진에서 나온 결과 (다른 일지 사진으로 판독된 결과가 섞인 경우)
      ...(() => {
        const cur = new Set((s.photos || []).map(p => p && p.id).filter(Boolean));
        const stray = (s.review || []).filter(r => r && r.src && r.src.pid && !cur.has(r.src.pid));
        if (!stray.length) return { strayHas: false };
        const pid = stray[0].src.pid;
        const owner = Object.keys(s.sessions || {}).find(k => k !== s.activeSession && ((s.sessions[k] || {}).photos || []).some(p => p && p.id === pid));
        const ownerLabel = owner ? owner.replace('|', ' ') : '';
        return {
          strayHas: true, strayN: stray.length,
          strayText: (cur.size ? '이 일지에 첨부된 사진이 아닌 ' : '이 일지에는 첨부된 현장사진이 없는데, ') + '다른 사진에서 찾은 얼굴 ' + stray.length + '명이 인식 결과에 들어 있습니다.' + (owner ? ' 이 사진은 [' + ownerLabel + '] 일지에 있습니다. 판독 중 일지를 옮기면서 결과가 잘못 저장된 것으로 보입니다.' : ' 사진이 삭제되었거나 다른 일지로 옮겨졌을 수 있습니다.') + ' 비우면 이 일지의 해당 결과만 지워지고, 원래 일지는 그대로입니다.',
          strayHasOwner: !!owner, strayOwner: ownerLabel,
          strayClear: () => this.setState({ dialog: {
            title: '맞지 않는 인식 결과 ' + stray.length + '명을 비울까요?',
            body: '이 일지(' + (s.activeSession || '').replace('|', ' ') + ')에서만 지워집니다.' + (owner ? ' [' + ownerLabel + '] 일지의 사진과 결과는 그대로 남습니다.' : '') + ' 수기로 추가한 참여자는 유지됩니다.',
            cta: '비우기',
            confirm: () => {
              const keys = new Set(stray.map(r => r.key));
              const left = this.state.review.filter(r => !keys.has(r.key));
              this.setState({ review: left, confirmed: false, dialog: null, lkKey: null });
              this.flash('맞지 않는 결과 ' + stray.length + '명을 비웠습니다' + (left.length ? ' — 남은 참여자 ' + left.length + '명' : ' — 현장사진을 올려 다시 판독하세요'));
            }
          } }),
          strayGoOwner: () => { if (owner) this.switchSession(owner, Object.assign({ program: owner.split('|')[1], logDate: owner.split('|')[0] }, this.reviewNav())); }
        };
      })(),
      // 선택한 참여자 ↔ 단체사진 연결 표시 (확정 버튼 아래)
      ...(() => {
        const photos = (s.photos || []).filter(p => p && p.url && p.url.indexOf('wph:') !== 0);
        if (!photos.length) return { lkHasPhoto: false };
        const sel = (s.review || []).find(r => r.key === s.lkKey);
        const pid = sel && sel.src && sel.src.pid;
        const photo = (pid && photos.find(p => p.id === pid)) || photos[0];
        const pi = photos.indexOf(photo);
        const nameOf = (r) => r.id ? (this.patient(r.id).name || '') : '미확인 인물 ' + (r.n || '');
        const pct = (v, t) => (Math.max(0, v) / (t || 1) * 100).toFixed(2) + '%';
        // 같은 사진에서 찾은 모든 얼굴은 옅은 테두리, 선택한 사람은 노란 강조
        const inPhoto = (s.review || []).filter(r => r.src && r.src.pid === photo.id && r.src.w);
        const box = (r) => { const sc = r.src; const pad = 0.25; return { l: pct(sc.x - sc.bw * pad, sc.w), t: pct(sc.y - sc.bh * pad, sc.h), w: pct(sc.bw * (1 + pad * 2), sc.w), h: pct(sc.bh * (1 + pad * 2), sc.h) }; };
        const selIn = sel && sel.src && sel.src.pid === photo.id && sel.src.w;
        const sb = selIn ? box(sel) : null;
        const ar = inPhoto[0] ? inPhoto[0].src.w + ' / ' + inPhoto[0].src.h : (sel && sel.src && sel.src.w ? sel.src.w + ' / ' + sel.src.h : '4 / 3');
        return {
          lkHasPhoto: true,
          lkImgEl: React.createElement('img', { src: photo.url, alt: '단체사진', draggable: false, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' } }),
          lkAspect: ar,
          lkPhotoLabel: photos.length > 1 ? '현장사진 ' + (pi + 1) + ' / ' + photos.length : '현장사진',
          lkBoxes: inPhoto.filter(r => !sel || r.key !== sel.key).map(r => Object.assign(box(r), { ring: r.id ? '0 0 0 2px rgba(143, 176, 255, 0.85)' : '0 0 0 2px rgba(255, 160, 120, 0.85)' })),
          lkHasSel: !!selIn,
          lkSelL: sb ? sb.l : '0', lkSelT: sb ? sb.t : '0', lkSelW: sb ? sb.w : '0', lkSelH: sb ? sb.h : '0',
          lkTagTop: sb ? 'calc(' + sb.t + ' - 4px)' : '0',
          lkSelName: sel ? nameOf(sel) : '',
          lkTitle: sel ? nameOf(sel) + ' — 단체사진 연결' : '단체사진 · 참여자 위치',
          lkNote: !sel ? '왼쪽 인식 결과에서 참여자를 누르면 이 사진에서 그 사람의 얼굴 위치가 노란 테두리로 표시됩니다. (파랑 = 명부 매칭 · 주황 = 미확인)'
            : selIn ? nameOf(sel) + '님은 이 단체사진의 노란 테두리 위치에서 인식되었습니다. 다시 누르면 선택이 풀립니다.'
            : '이 참여자는 사진 없이 직접 추가했거나, 위치 정보가 없는 예전 판독 결과입니다.',
          lkZoom: () => this.setState({ zoom: { url: photo.url, title: (sel ? nameOf(sel) + ' — ' : '') + '단체사진', meta: '인식 결과에서 고른 참여자의 위치를 확인하세요' } })
        };
      })(),
      matchedCount: s.review.filter(r => r.id && r.sim !== 0).length,
      unknownCount: s.review.filter(r => !r.id).length,
      ...(() => {
        const dm = this.dupInfo(s.review);
        const unk = s.review.filter(r => !r.id && !dm[r.key]);
        const weak = unk.filter(r => r.weak).length;
        const noIdPhoto = PATIENTS.filter(p => (p.stay || '재원') === '재원' && !s.photoUrls[p.id]).map(p => p.name);
        return {
          hasUnknownAlert: unk.length > 0 && !s.confirmed,
          unknownAlertCount: unk.length,
          unknownAlertSub: '사진에서 찾았지만 명부와 맞지 않은 얼굴입니다' + (weak ? ' (고개를 돌리거나 가려진 얼굴 ' + weak + '명 포함)' : '') + '. [환자 지정]으로 이름을 연결하거나 직원·보호자면 제외하세요.' + (noIdPhoto.length ? ' ※ 증명사진이 없는 재원 환자 ' + noIdPhoto.length + '명은 자동 인식되지 않습니다.' : ''),
          hasNoIdPhoto: noIdPhoto.length > 0,
          goFixIdPhoto: () => { const p = PATIENTS.find(x => (x.stay || '재원') === '재원' && !s.photoUrls[x.id]); if (p) this.setState({ pcView: 'patients', sel: p.id }); },
          assignFirstUnknown: () => { if (unk[0]) this.setState({ addOpen: true, assignKey: unk[0].key }); }
        };
      })(),
      analyzeStage: s.analyzeStage || 'AI 판독 중…',
      failCode: s.failCode,
      thresholdLabel: threshold + '%',
      threshold: threshold,
      confirmed: s.confirmed, notConfirmed: !s.confirmed,
      askConfirm: askConfirm,
      reviewFailed: s.reviewFailed, reviewOk: !s.reviewFailed,
      retryAnalyze: () => {
        this.setState({ reviewFailed: false, fetch: 'ready' }, () => this.analyzePhotos());
      },
      openAdd: () => this.setState({ addOpen: true, assignKey: null, addQ: '', addWard: '전체' }),
      closeAdd: () => this.setState({ addOpen: false, assignKey: null, addQ: '' }),
      ...(() => {
        const q = (s.addQ || '').trim().toLowerCase().replace(/\s/g, '');
        const wardF = s.addWard || '전체';
        const pool = PATIENTS.filter(p => !s.review.some(r => r.id === p.id) && (p.stay || '재원') === '재원');
        const wards = [...new Set(pool.map(p => (p.room || '').split(' ')[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
        const hit = pool.filter(p => (wardF === '전체' || (p.room || '').indexOf(wardF + ' ') === 0) &&
          (!q || [p.name, p.room, p.chartNo].some(v => String(v || '').toLowerCase().replace(/\s/g, '').indexOf(q) >= 0)))
          .sort((a, b) => {
            // 이름이 검색어로 시작하면 먼저
            const sa = q && a.name.indexOf(s.addQ.trim()) === 0 ? 0 : 1, sb = q && b.name.indexOf(s.addQ.trim()) === 0 ? 0 : 1;
            return sa - sb || (a.room || '').localeCompare(b.room || '', 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko');
          });
        this._addHit = hit;
        return {
          addQ: s.addQ || '', addQHas: !!q,
          onAddQ: (e) => this.setState({ addQ: e.target.value }),
          clearAddQ: () => this.setState({ addQ: '' }),
          // 검색 결과가 1명이면 Enter로 바로 선택
          addQKey: (e) => {
            if (e.key === 'Enter' && this._addHit && this._addHit.length === 1) {
              e.preventDefault();
              const btn = e.target.closest('[role="dialog"], .dialog') && e.target.closest('[role="dialog"], .dialog').querySelector('button[data-add-first]');
              if (btn) btn.click();
            }
            if (e.key === 'Escape') this.setState({ addQ: '' });
          },
          addWardChips: ['전체'].concat(wards).map(w => ({ label: w, cls: wardF === w ? 'btn btn-primary' : 'btn btn-secondary', go: () => this.setState({ addWard: w }) })),
          addCountLabel: hit.length + '명' + (q || wardF !== '전체' ? ' / 재원 ' + pool.length + '명' : ' (재원)'),
          addNoHit: hit.length === 0,
          addHitIds: hit.map(p => p.id)
        };
      })(),
      // 참여자 지정 팝업 → 환자 등록 팝업 (등록 후 다시 지정 팝업으로 복귀)
      addNewPatient: () => {
        this._returnToAssign = this.state.assignKey || '__add__';
        this.setState({ addOpen: false, npOpen: true, formMode: 'new', formGuardians: { g1: {}, g2: {} }, formName: '', formSex: '여', formBirth: '', formChart: '', formAge: '', formWard: '', formRoom: '', formStay: '재원', formConsent: '확인전', formFace: '확인전', upload: 'idle', uploadPct: 0, idPhoto: null });
      },
      addOpen: s.addOpen,
      ...(() => {
        const row = s.assignKey ? s.review.find(r => r.key === s.assignKey) : null;
        const curName = row && row.id ? (PATIENTS.find(x => x.id === row.id) || {}).name : null;
        return {
          addDlgTitle: curName ? '환자 변경 — 현재 ' + curName : row ? '환자 지정 — 명부 검색' : '참여자 추가 — 명부 검색',
          addDlgBody: curName ? '사진의 얼굴과 ' + curName + '님 정보가 다르면 바른 환자를 선택하세요. 식별방식은 수기변경으로 기록되고, 다시 확정하면 출석부에 반영됩니다.' : row ? '사진의 얼굴과 같은 환자를 명부에서 선택합니다. 식별방식은 수기지정으로 기록됩니다.' : 'AI가 찾지 못한 환자를 명부에서 선택합니다. 추가한 사람은 식별방식 수기추가로 기록됩니다.',
          addDlgHasFace: !!(row && row.crop),
          addDlgFace: row && row.crop ? this.img(row.crop, '사진 속 얼굴') : null
        };
      })(),
      ...(() => {
        const ip = s.idPrompt;
        if (!ip) return { idpOpen: false };
        const pick = (e) => {
          const f = e.target.files && e.target.files[0]; e.target.value = '';
          if (f) this.acceptIdpFile(f, '첨부한 사진');
        };
        const fromFace = !ip.how;
        const capW = !!s.capWaiting && s.capFor === 'idp';
        return {
          idpOpen: true, idpName: ip.name,
          idpTitle: ip.had ? ip.name + '님 증명사진을 이 ' + (ip.how ? '사진' : '얼굴') + '로 바꿀까요?' : ip.name + '님 증명사진이 없습니다 — 이 ' + (ip.how ? '사진' : '얼굴') + '로 등록할까요?',
          idpHasFace: !!ip.face, idpNoFace: !ip.face,
          idpFaceEl: ip.face ? this.img(ip.face, ip.name + ' 얼굴', 'contain') : null,
          idpCurEl: ip.had ? this.img((s.photoUrls || {})[ip.pid], '현재 증명사진', 'contain') : null, idpHad: ip.had,
          idpNote: !fromFace ? ip.how + '을 증명사진으로 등록합니다. 다른 사진으로 바꾸려면 다시 [파일 첨부]나 [화면 캡처]를 누르세요.'
            : ip.srcPx && ip.srcPx < 160 ? '단체사진 속 얼굴이 작게 찍혀(원본 약 ' + ip.srcPx + 'px) 화질이 낮을 수 있습니다. 선명한 증명사진이 있으면 [파일 첨부]나 [화면 캡처]를 권장합니다.' : '원본 단체사진에서 고화질로 다시 오려낸 얼굴입니다.',
          idpFaceCap: fromFace ? '단체사진의 얼굴' : ip.how,
          idpUseLabel: fromFace ? '이 얼굴로 증명사진 등록' : '이 사진으로 증명사진 등록',
          idpUse: () => { if (ip.face) this.saveIdPhoto(ip.pid, ip.face, fromFace ? '단체사진에서 오려낸 얼굴' : ip.how); },
          ...this.cropVals(s, ip),
          idpAttach: () => { if (this._idpInput && this._idpInput.current) this._idpInput.current.click(); },
          idpCapture: () => this._startCap && this._startCap('idp'),
          idpCapWaiting: capW, idpCapIdle: !capW,
          idpCapMsg: s.capBlocked
            ? '브라우저 보안 때문에 캡처를 자동으로 가져올 수 없습니다 — 캡처 후 이 창을 한 번 클릭하고 Ctrl + V를 누르세요'
            : '캡처 기다리는 중 — 얼굴 영역을 드래그하면 바로 이 창에 들어옵니다 (안 들어오면 이 창을 한 번 클릭하세요)',
          idpCapNeedLaunch: capW && !!s.capNeedLaunch,
          idpCapLaunch: () => { if (this._capLaunch) this._capLaunch(); this.setState({ capNeedLaunch: false }); },
          idpCapCancel: () => { clearInterval(this._capPoll); this.setState({ capWaiting: false, capFor: null, capNeedLaunch: false }); },
          idpInputRef: this._idpInput || (this._idpInput = React.createRef()),
          onIdpFile: pick,
          idpSkip: () => { clearInterval(this._capPoll); this.setState({ idPrompt: null, crop: null, capWaiting: false, capFor: null, capNeedLaunch: false }); this.flash('증명사진은 그대로 두었습니다'); }
        };
      })(),
      ...(() => {
        const L = Component.UI_SCALES;
        const isAuto = s.uiScale === 'auto';
        const z = this.uiZoom();
        const cur = isAuto ? 'auto' : String(z);
        const step = (d) => () => {
          const i = L.findIndex(x => x >= z - 0.001);
          const base = i < 0 ? L.length - 1 : (L[i] > z + 0.001 && d > 0 ? i - 1 : i);
          const ni = Math.max(0, Math.min(L.length - 1, base + d));
          this.setUiScale(L[ni]);
        };
        return {
          uiScaleLabel: Math.round(z * 100) + '%' + (isAuto ? ' (자동)' : ''),
          uiScaleCur: cur,
          uiScaleOpts: [{ v: 'auto', label: '자동 · 모니터에 맞춤 (' + Math.round(this.autoUiScale() * 100) + '%)' }].concat(L.map(x => ({ v: String(x), label: Math.round(x * 100) + '%' + (x === 1 ? ' · 기본' : '') }))),
          onUiScale: (e) => { const v = e.target.value; this.setUiScale(v === 'auto' ? 'auto' : parseFloat(v)); },
          uiScaleDown: step(-1), uiScaleUp: step(1),
          uiScaleReset: () => this.setUiScale(1),
          uiScaleMinDis: z <= L[0] + 0.001, uiScaleMaxDis: z >= L[L.length - 1] - 0.001
        };
      })(),
      outdated: !!s.outdated,
      outdatedMsg: s.outdatedWhy === 'deploy'
        ? '새 버전이 배포되었습니다. 데이터가 섞이지 않도록 이 화면은 저장을 멈췄습니다.'
        : '이 화면은 예전 버전입니다. 데이터가 섞이지 않도록 저장을 멈췄습니다.',
      reloadNow: () => { try { location.reload(); } catch (e) {} },
      addCandidates: (this._addHit || []).slice(0, 200).map((p, i) => ({
        pid: p.id, first: i === 0 ? '1' : undefined,
        name: p.name, room: p.room, sexAge: p.sex + ' ' + p.age + (p.chartNo ? ' · ' + p.chartNo : ''),
        add: () => {
          const key = this.state.assignKey;
          if (key) {
            // 이미 목록에 있는 환자로 지정하면 같은 사람이 2번 들어가지 않게 합침
            if (this.state.review.some(r => r.id === p.id && r.key !== key)) {
              this.setState({ review: this.state.review.filter(r => r.key !== key), addOpen: false, assignKey: null, confirmed: false });
              this.flash(p.name + '님은 이미 참여자 목록에 있습니다 — 중복 인물로 보고 합쳤습니다');
              return;
            }
            const prevRow = this.state.review.find(r => r.key === key);
            const prevName = prevRow && prevRow.id ? (PATIENTS.find(x => x.id === prevRow.id) || {}).name : null;
            this.setState({
              review: this.state.review.map(r => r.key === key ? Object.assign({}, r, { id: p.id, sim: 0, method: prevName ? '수기변경 (' + prevName + ' → ' + p.name + ') · 사진 얼굴 확인' : '수기지정 · 사진 얼굴 확인' }) : r),
              addOpen: false, assignKey: null, confirmed: false
            });
            this.flash(prevName ? prevName + ' → ' + p.name + '(으)로 변경했습니다 — 다시 확정하면 출석부에 반영됩니다' : '미확인 인물을 ' + p.name + '(으)로 지정했습니다');
            // 지정한 얼굴을 증명사진으로 쓸지 물어봄
            if (prevRow) this.openIdPrompt(p, prevRow);
          } else {
            this.setState({ review: this.state.review.concat([{ key: 'm' + Date.now(), id: p.id, sim: 0, method: '수기추가' }]), addOpen: false, confirmed: false, reviewFailed: false });
            this.flash(p.name + ' 추가 — 식별방식 수기추가로 기록');
          }
          this.setState({ addQ: '' });
        }
      })),


      // 통계 차트 (유형 선택형)
      st06Cards: st06CardsOf(progColor),
      chart06: {
        id: 'st06', types: ['bar', 'hbar', 'line', 'donut', 'table'], defaultType: 'bar', independent: true,
        ...statList,
        donutCallouts: true,
        cats: groups.map(g => g.label), catSubs: groups.map(g => g.sub),
        catColors: groups.map((g, i) => wsWard === '전체' ? ST06_PAL[i % ST06_PAL.length] : progColor(g.label)),
        series: [
          { name: '실인원', unit: '명', values: groups.map(g => g.people), noSum: wsWard !== '전체' },
          { name: '참여 건수', unit: '건', values: groups.map(g => g.count) }
        ],
        footFor: [wsPeople + '명', null],
        extraCols: [{ name: '1인당', values: groups.map(g => g.people ? (g.count / g.people).toFixed(1) + '회' : '—'), foot: wsPeople ? (wsScope.length / wsPeople).toFixed(1) + '회' : '—' }],
        catHead: wsWard === '전체' ? '병동' : '프로그램', donutCaption: '실인원 합계', height: 280,
        emptyText: '선택한 기간에 확정된 참여 기록이 없습니다'
      },
      ...(() => {
        // 공통 필터: 기간(wsFrom~wsTo) + 병동(wsWard) → 모든 통계에 적용
        const wardSel = wsWard === '전체' ? wsWardList : [wsWard];
        const scope = wsScope;
        const wardLabel = wsWard === '전체' ? '전체 병동' : wsWard;
        const periodTxt = fmtK(wsFrom) + ' ~ ' + fmtK(wsTo) + ' · ' + wardLabel;
        // 월 목록 (기간 내, 최대 12개월)
        const months = [];
        let y = +wsFrom.slice(0, 4), mo = +wsFrom.slice(5, 7);
        const ey = +wsTo.slice(0, 4), em = +wsTo.slice(5, 7);
        while ((y < ey || (y === ey && mo <= em)) && months.length < 24) { months.push(y + '-' + String(mo).padStart(2, '0')); mo++; if (mo > 12) { mo = 1; y++; } }
        const mList = months.slice(-12);
        const mRecs = mList.map(ym => scope.filter(r => r.date.indexOf(ym) === 0));
        const progs = uniq(s.programs.concat(scope.map(r => r.program)));
        const pStats = progs.map(p => { const rs = scope.filter(r => r.program === p); return { p: p, n: rs.length, people: uniq(rs.map(r => r.name)).length }; }).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
        return {
          ...(() => {
            const pp = uniq(scope.map(r => r.name)).length;
            const pts = PATIENTS.filter(p => wardSel.some(w => (p.room || '').indexOf(w + ' ') === 0) && (p.stay || '재원') === '재원');
            const ok = pts.filter(p => p.consent === '동의' && p.face === '동의').length;
            const ai = scope.filter(r => (r.method || '').indexOf('AI') === 0).length;
            const manual = scope.length - ai;
            const sess = uniq(scope.map(r => r.date + '|' + r.program)).length;
            // 회차당 수기 출석 대비 약 20분 절감 가정
            const hrs = sess * 20 / 60;
            // ── 시각화용: 주별 12구간 추세 + 진행률 ──
            const DAY = 86400000;
            const toD = new Date(wsTo + 'T00:00:00').getTime();
            const weeks = Array.from({ length: 12 }, (_, i) => {
              const end = toD - (11 - i) * 7 * DAY, start = end - 6 * DAY;
              const rs = scope.filter(r => { const t = new Date(fullDate(r.date) + 'T00:00:00').getTime(); return t >= start && t <= end; });
              return {
                people: uniq(rs.map(r => r.name)).length,
                ai: rs.length ? rs.filter(r => (r.method || '').indexOf('AI') === 0).length / rs.length * 100 : null,
                hrs: uniq(rs.map(r => r.date + '|' + r.program)).length * 20 / 60
              };
            });
            const consentPct = pts.length ? ok / pts.length * 100 : 0;
            const days = Math.max(1, Math.round((toD - new Date(wsFrom + 'T00:00:00').getTime()) / DAY) + 1);
            const timeGoal = 20 * Math.max(1, Math.round(days / 30));
            const series = (arr) => {
              const vals = arr.map(v => v == null ? 0 : v);
              const mx = Math.max(1, ...vals), W = 330, H = 64, top = 8;
              const pt = vals.map((v, i) => [Math.round(i * W / (vals.length - 1)), Math.round(H - 4 - (v / mx) * (H - top - 4))]);
              const line = 'M' + pt.map(p => p[0] + ' ' + p[1]).join(' L');
              return { line: line, area: line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', bars: vals.slice(-11).map((v, i, a) => ({ h: Math.max(8, Math.round(v / mx * 100)) + '%', last: i === a.length - 1, notLast: i !== a.length - 1 })) };
            };
            const delta = (arr, unit, digits) => {
              const a = arr.filter(v => v != null); if (a.length < 2) return { txt: '', color: 'var(--color-neutral-500)' };
              const d = a[a.length - 1] - a[a.length - 2];
              const r = Math.round(d * Math.pow(10, digits)) / Math.pow(10, digits);
              if (r === 0) return { txt: '– 변동 없음', color: 'var(--color-neutral-500)' };
              return { txt: (r > 0 ? '▲ ' : '▼ ') + Math.abs(r) + unit, color: r > 0 ? 'oklch(0.76 0.14 145)' : 'oklch(0.70 0.17 25)' };
            };
            const C = 276.46;
            const mk = (key, label, icon, color, val, unit, sub, pct, target, arr, dUnit, dDig) => {
              const p = Math.max(0, Math.min(100, pct || 0));
              const sr = series(arr), dl = delta(arr, dUnit, dDig);
              return {
                key: key, label: label, icon: icon, color: color, val: val, unit: unit, sub: sub,
                dash: (C * p / 100).toFixed(1) + ' ' + C, cap: p > 0 ? 'round' : 'butt',
                barW: p + '%', hasTarget: target != null, targetLeft: (target || 0) + '%',
                line: sr.line, area: sr.area, bars: sr.bars,
                deltaTxt: dl.txt || '주간 비교 데이터 부족', deltaColor: dl.color,
                glow: 'drop-shadow(0 0 6px color-mix(in oklch, ' + color + ' 50%, transparent))',
                grad: 'linear-gradient(90deg, color-mix(in oklch, ' + color + ' 70%, black), ' + color + ')',
                barGlow: '0 0 8px color-mix(in oklch, ' + color + ' 45%, transparent)',
                gid: 'kg-' + key, gfill: 'url(#kg-' + key + ')'
              };
            };
            const kpiCards = [
              mk('people', '실인원', 'ph ph-users-three', 'oklch(0.74 0.12 230)', String(pp), '명', pts.length ? '재원 ' + pts.length + '명 중 ' + Math.round(pp / pts.length * 100) + '% 참여' : '참여 ' + scope.length + '건', pts.length ? pp / pts.length * 100 : 0, null, weeks.map(w => w.people), '명', 0),
              mk('consent', '동의율', 'ph ph-signature', 'oklch(0.76 0.14 145)', pts.length ? String(Math.round(consentPct)) : '—', pts.length ? '%' : '', pts.length ? '목표 90% · 미완료 ' + (pts.length - ok) + '명' : '해당 병동 재원 환자 없음', consentPct, 90, weeks.map(() => consentPct), '%p', 0),
              mk('ai', 'AI 자동 인식률', 'ph ph-scan-smiley', 'var(--color-accent)', scope.length ? String(Math.round(ai / scope.length * 100)) : '—', scope.length ? '%' : '', scope.length ? '수기 추가·보정 ' + manual + '건' : '기간 내 기록 없음', scope.length ? ai / scope.length * 100 : 0, null, weeks.map(w => w.ai), '%p', 0),
              mk('time', '행정 시간 절감', 'ph ph-clock-countdown', 'oklch(0.80 0.12 85)', String(Math.round(hrs * 10) / 10), 'h', '목표 ' + timeGoal + 'h · 진행 ' + sess + '회 × 약 20분', hrs / timeGoal * 100, null, weeks.map(w => w.hrs), 'h', 1)
            ];
            // 지표별 인포그래픽 (링 게이지 아래)
            {
              const G = 'oklch(0.76 0.14 145)', R = 'oklch(0.70 0.15 25)', Y = 'oklch(0.80 0.12 85)', N = 'var(--color-neutral-700)';
              const seg = (label, n, tot, color) => ({ label: label, n: n, w: tot ? (n / tot * 100) + '%' : '0%', color: color, show: n > 0 ? 'block' : 'none' });
              const cnt3 = (key) => {
                const a = pts.filter(p => p[key] === '동의').length, b = pts.filter(p => p[key] === '미동의').length;
                return [seg('동의', a, pts.length, G), seg('미동의', b, pts.length, R), seg('확인전', pts.length - a - b, pts.length, Y)];
              };
              const pctPeople = pts.length ? pp / pts.length : 0;
              const filled = Math.round(pctPeople * 10);
              const wkH = weeks.slice(-8).map(w => w.hrs || 0), mxH = Math.max(0.01, ...wkH);
              const info = {
                people: {
                  hasPict: true, pict: Array.from({ length: 10 }, (_, i) => ({ color: i < filled ? 'oklch(0.74 0.12 230)' : 'var(--color-neutral-700)', icon: i < filled ? 'ph-fill ph-user' : 'ph ph-user' })),
                  pictNote: '1칸 = 재원 환자 10% · 참여 ' + pp + '명 / 미참여 ' + Math.max(0, pts.length - pp) + '명',
                  rows: [{ label: '참여 구성', segs: [seg('AI 인식', ai, scope.length, 'var(--color-accent)'), seg('수기', manual, scope.length, Y)], tot: scope.length + '건' }]
                },
                consent: { rows: [{ label: '초상권', segs: cnt3('consent'), tot: pts.length + '명' }, { label: '안면인식', segs: cnt3('face'), tot: pts.length + '명' }] },
                ai: { rows: [{ label: '식별 방식', segs: [seg('AI 자동', ai, scope.length, 'var(--color-accent)'), seg('수기 추가·보정', manual, scope.length, Y)], tot: scope.length + '건' }] },
                time: { hasCols: true, cols: wkH.map((v, i, a) => ({ h: Math.max(4, Math.round(v / mxH * 100)) + '%', v: (Math.round(v * 10) / 10) + 'h', color: i === a.length - 1 ? 'oklch(0.80 0.12 85)' : 'var(--color-neutral-700)' })), colNote: '최근 8주 주별 절감 시간 · 진행 1회 ≈ 20분' }
              };
              kpiCards.forEach(k => {
                const x = info[k.key] || {};
                Object.assign(k, {
                  hasPict: !!x.hasPict, pict: x.pict || [], pictNote: x.pictNote || '',
                  infoRows: (x.rows || []).map(r => Object.assign({}, r, { legend: r.segs.filter(g => g.n > 0).map(g => g.label + ' ' + g.n).join(' · ') || '기록 없음' })),
                  hasCols: !!x.hasCols, cols: x.cols || [], colNote: x.colNote || ''
                });
              });
            }
            const kv = s.kpiView || 'ring';
            return {
              kpiCards: kpiCards,
              kpiViewOpts: [{ k: 'ring', label: '링 게이지', icon: 'ph ph-circle-notch' }, { k: 'trend', label: '추세 차트', icon: 'ph ph-chart-line-up' }, { k: 'panel', label: '한 줄 패널', icon: 'ph ph-rows' }].map(o => ({
                label: o.label, icon: o.icon, on: kv === o.k, off: kv !== o.k,
                go: () => { this.setState({ kpiView: o.k }); try { localStorage.setItem('smartcare.kpiView.v1', o.k); } catch (e) {} }
              })),
              kpiRingDisp: kv === 'ring' ? 'grid' : 'none',
              kpiTrendDisp: kv === 'trend' ? 'grid' : 'none',
              kpiPanelDisp: kv === 'panel' ? 'flex' : 'none',
              kpiPeople: pp + '명', kpiPeopleSub: '참여 ' + scope.length + '건 · ' + wardLabel,
              kpiConsent: pts.length ? Math.round(ok / pts.length * 100) + '%' : '—',
              kpiConsentSub: pts.length ? '재원 ' + pts.length + '명 중 미완료 ' + (pts.length - ok) + '명' : '해당 병동 재원 환자 없음',
              kpiAi: scope.length ? Math.round(ai / scope.length * 100) + '%' : '—',
              kpiAiSub: scope.length ? '수기 추가·보정 ' + manual + '건' : '기간 내 기록 없음',
              kpiTime: (Math.round(hrs * 10) / 10) + 'h',
              kpiTimeSub: '진행 ' + sess + '회 × 회당 약 20분'
            };
          })(),
          st05Sub: periodTxt + ' · 월별 병동별 실인원(명)' + (mList.length < months.length ? ' · 최근 12개월만 표시' : ''),
          chart05: {
            id: 'st05', types: ['stack', 'bar', 'line', 'table'], defaultType: 'stack',
            ...statList,
            cats: mList.map(ym => (mList[0].slice(0, 4) !== mList[mList.length - 1].slice(0, 4) ? ym.slice(2, 4) + '.' : '') + (+ym.slice(5, 7)) + '월'),
            catSubs: mRecs.map(rs => '계 ' + uniq(rs.map(r => r.name)).length + '명'),
            series: wardSel.map(w => ({ name: w, unit: '명', color: WARD_COLORS[wsWardList.indexOf(w) % WARD_COLORS.length], values: mRecs.map(rs => uniq(rs.filter(r => wardNameOf(r.room) === w).map(r => r.name)).length) })),
            unit: '명', catHead: '월', height: 300, emptyText: '선택한 기간·병동에 확정된 참여 기록이 없습니다'
          },
          chart04: {
            id: 'st04', types: ['donut', 'hbar', 'bar', 'table'], defaultType: 'donut',
            ...statList,
            cats: pStats.map(x => x.p), catColors: pStats.map(x => progColor(x.p)),
            series: [
              { name: '참여 건수', unit: '건', values: pStats.map(x => x.n) },
              { name: '실인원', unit: '명', values: pStats.map(x => x.people), noSum: true }
            ],
            footFor: [null, uniq(scope.map(r => r.name)).length + '명'],
            donutCaption: '전체 참여 건수', catHead: '프로그램', height: 260, note: periodTxt,
            donutCallouts: true,
            emptyText: '선택한 기간·병동에 확정된 참여 기록이 없습니다'
          },
          // ST-04 오른쪽: 프로그램 카드 (건수 · 실인원 · 1인당 · 정원 대비 참여율)
          st04Cards: (() => {
            const wardOk = (w) => wsWard === '전체' || !w || w === '전체' || String(w).split(',').map(x => x.trim()).indexOf(wsWard) >= 0;
            const tot = pStats.reduce((a, x) => a + x.n, 0);
            const ICON = { '미술치료': 'ph ph-palette', '컬러링북': 'ph ph-paint-brush', '음악치료': 'ph ph-music-notes', '원예치료': 'ph ph-plant', '암센터힐링프로그램': 'ph ph-heart' };
            return pStats.map((x, i) => {
              const pl = (s.plans || []).filter(p => p.program === x.p && p.status !== '취소' && p.date >= wsFrom && p.date <= wsTo && wardOk(p.ward));
              const cap = pl.reduce((a, p) => a + (+p.capacity || 0), 0);
              const fill = cap ? Math.min(100, Math.round(x.n / cap * 100)) : null;
              const col = progColor(x.p);
              return {
                name: x.p, color: col, icon: ICON[x.p] || 'ph ph-squares-four',
                tint: 'color-mix(in oklch, ' + col + ' 24%, transparent)',
                meta: '구성 비중 ' + (tot ? Math.round(x.n / tot * 100) : 0) + '% · ' + (i + 1) + '위',
                kpis: [{ label: '참여 건수', v: x.n, u: '건' }, { label: '실인원', v: x.people, u: '명' }, { label: '1인당', v: x.people ? (x.n / x.people).toFixed(1) : '0', u: '회' }],
                fillTxt: fill == null ? '정원 미입력' : fill + '%', fillW: (fill || 0) + '%',
                capTxt: cap ? '일정 ' + pl.length + '회 · 정원 합계 ' + cap + '명' : '일정에 정원을 입력하면 표시됩니다'
              };
            });
          })(),
          // ST-04 진행 상태: 캘린더 일정 기준 (기간 · 병동 필터 동일 적용, 일지 확정 = 완료)
          ...(() => {
            const wardOk = (w) => wsWard === '전체' || !w || w === '전체' || String(w).split(',').map(x => x.trim()).indexOf(wsWard) >= 0;
            const pl = (s.plans || []).filter(p => p.date >= wsFrom && p.date <= wsTo && wardOk(p.ward));
            const stOf = (p) => this.planBadges(p, s).progLabel;
            const progs = uniq(pl.map(p => p.program));
            const cnt = (prog, st) => pl.filter(p => (!prog || p.program === prog) && stOf(p) === st).length;
            const tot = { 완료: cnt(null, '완료'), 예정: cnt(null, '예정'), 취소: cnt(null, '취소') };
            const all = pl.length;
            const pctOf = (n) => all ? Math.round(n / all * 100) + '%' : '—';
            const C = { 완료: 'oklch(0.76 0.14 145)', 예정: 'oklch(0.74 0.12 230)', 취소: 'var(--color-neutral-600)' };
            return {
              chart04s: {
                id: 'st04s', types: ['stack', 'hbar', 'table'], defaultType: 'stack',
                cats: progs, catColors: progs.map(p => progColor(p)),
                series: ['완료', '예정', '취소'].map(st => ({ name: st, unit: '건', color: C[st], values: progs.map(p => cnt(p, st)) })),
                catHead: '프로그램', height: 240, note: periodTxt + ' · 캘린더 일정 기준',
                emptyText: '선택한 기간·병동에 등록된 일정이 없습니다',
                // 데이터 목록: 일정 원자료 (진행 상태 · 일지 상태)
                listCols: ['일자', '시간', '프로그램', '장소', '대상 병동', '진행 상태', '일지 상태', '정원', '담당자'],
                listRows: pl.map(p => { const b = this.planBadges(p, s); return [p.date, (p.start || '') + (p.end ? '~' + p.end : ''), p.program, p.place || '', p.ward || '전체', b.progLabel, p.status === '취소' ? '' : b.logLabel, p.capacity ? p.capacity + '명' : '', (p.staff || []).join(', ')]; }),
                listSort: 0, listDir: 'desc', listDotCol: 5, listDotColors: C
              },
              st04sCards: ['완료', '예정', '취소'].map(st => ({ label: st, n: tot[st], pct: pctOf(tot[st]), color: C[st], w: all ? (tot[st] / all * 100) + '%' : '0%' })),
              st04sTotal: all + '건',
              st04sRate: all - tot['취소'] ? Math.round(tot['완료'] / (all - tot['취소']) * 100) + '%' : '—'
            };
          })(),
          chart07: {
            id: 'st07', types: ['pct', 'stack', 'bar', 'table'], defaultType: 'pct',
            ...statList,
            cats: wardSel,
            series: progs.map(p => ({ name: p, unit: '건', color: progColor(p), values: wardSel.map(w => scope.filter(r => wardNameOf(r.room) === w && r.program === p).length) })).filter(sr => sr.values.some(v => v > 0)),
            unit: '건', rowTotal: true, catHead: '병동', height: 260,
            note: periodTxt + ' · 막대 안 % = 병동 내 프로그램 비율 · 오른쪽 % = 전체 대비 병동 비율',
            emptyText: '선택한 기간·병동에 확정된 참여 기록이 없습니다'
          }
        };
      })(),
      bars: monthBars,
      barLegend: barLegend,
      wardShare: wardShare,
      shareTotals: shareProgs.map(p => { const n = inPeriod.filter(r => r.program === p).length; return { n: n, p: shareTotal ? Math.round(n / shareTotal * 100) + '%' : '—' }; }),
      shareTotalLabel: shareTotal + '건',
      pieBg: shareTotal ? 'conic-gradient(' + pieStops.join(', ') + ')' : 'var(--color-neutral-900)',
      pieTotal: shareTotal,
      piePeople: uniq(inPeriod.map(r => r.name)).length,
      pieNote: fmtK(wsFrom) + ' ~ ' + fmtK(wsTo) + ' · 전체 병동 · 기간은 ST-06과 연동',
      pieLegend: pieStats.map(x => ({
        label: x.p, color: progColor(x.p), count: x.n, people: x.people,
        pct: (Math.round(x.n / shareTotal * 1000) / 10) + '%'
      })),
      shareEmpty: shareTotal === 0,
      shareLegend: shareProgs.map(p => ({ label: p, c: progColor(p) })),
      shareNote: '병동별 프로그램 참여 건수와 비율',
      barMax: barMaxVal + '명',
      reports: REPORTS,

      // 설정
      setTabs: ([
        { key: 'ai', label: 'AI 판독 파라미터' },
        { key: 'consent', label: '동의서식 관리' },
        { key: 'program', label: '프로그램 관리' },
        { key: 'ward', label: '병동 · 호실' },
        { key: 'staff', label: '담당자 명단 및 권한' }
      ]).concat((isSys || hasRole('관리자')) ? [{ key: 'notify', label: '일정 알림' }, { key: 'approval', label: '결재라인' }] : []).concat(isSys ? [{ key: 'org', label: '기관 관리' }] : []).concat(isSys ? [{ key: 'cloud', label: '데이터 서버' }] : []).map(t => ({
        label: t.label, active: s.setTab === t.key, inactive: s.setTab !== t.key,
        go: () => { if (t.key === s.setTab) return; guardLeave(() => this.setState({ setTab: t.key })); }
      })),
      setAi: s.setTab === 'ai', setConsentTab: s.setTab === 'consent',
      setProgramTab: s.setTab === 'program', setStaffTab: s.setTab === 'staff',
      setWardTab: s.setTab === 'ward',
      setOrgTab: isSys && s.setTab === 'org',
      setCloudTab: isSys && s.setTab === 'cloud',
      setNotifyTab: (isSys || hasRole('관리자')) && s.setTab === 'notify',
      setApprovalTab: (isSys || hasRole('관리자')) && s.setTab === 'approval',
      ...(() => {
        const line = this.approvalLine();
        const set = (l) => this.saveApproval(l);
        const presets = [['담당', '팀장', '실장'], ['담당', '팀장', '부장', '원장'], ['담당', '수간호사', '간호부장'], ['작성', '검토', '승인']];
        return {
          apOrgName: orgName,
          apEmpty: line.length === 0,
          apHas: line.length > 0,
          apCount: line.length,
          apRows: line.map((t, i) => ({
            n: i + 1, title: t,
            onTitle: (e) => { const l = line.slice(); l[i] = e.target.value; set(l); },
            up: () => { if (i === 0) return; const l = line.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; set(l); },
            down: () => { if (i === line.length - 1) return; const l = line.slice(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; set(l); },
            isFirst: i === 0, isLast: i === line.length - 1,
            remove: () => { set(line.filter((_, j) => j !== i)); this.flash('"' + t + '" 결재란 삭제'); }
          })),
          apPreview: line.map(t => ({ title: t || '—' })),
          apAdd: () => { if (line.length >= 6) { this.flash('결재란은 최대 6칸까지 둘 수 있습니다'); return; } set(line.concat(['결재'])); },
          apPresets: presets.map(p => ({ label: p.join(' → '), go: () => { set(p.slice()); this.flash('결재라인 적용 — ' + p.join(' · ')); } })),
          apClear: () => { set([]); this.flash('결재란을 표시하지 않습니다'); },
          apReset: () => { set(['담당', '팀장', '실장']); this.flash('기본 결재라인으로 되돌렸습니다'); }
        };
      })(),
      cloudWarn: s.device === 'pc' && isSys && !this.cloudCfg() && !s.cloudWarnHidden && !(s.pcView === 'settings' && s.setTab === 'cloud'),
      goCloudTab: () => this.setState({ pcView: 'settings', setTab: 'cloud' }),
      hideCloudWarn: () => this.setState({ cloudWarnHidden: true }),
      ...(() => {
        let nt = { time: '08:30', sender: orgName + ' 사회사업실', admin: true };
        try { nt = Object.assign(nt, JSON.parse(localStorage.getItem('smartcare.notify.v1') || '{}')); } catch (e) {}
        const saveNt = (patch) => { const v = Object.assign({}, nt, patch); try { localStorage.setItem('smartcare.notify.v1', JSON.stringify(v)); } catch (e) {} this.setState({ ntRev: (s.ntRev || 0) + 1 }); };
        const today = this.todayIso();
        const plansToday = (s.plans || []).filter(p => p.date === today && p.status !== '취소').sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const roster = (s.roster || []).filter(m => m.org === orgIdCur && m.status === '활성');
        const reach = (n) => roster.find(m => m.name === n && m.email && m.notify);
        const admins = roster.filter(m => m.email && m.notify && rolesOf(m).indexOf('관리자') >= 0);
        const recv = {};
        plansToday.forEach(p => (p.staff || []).forEach(n => { const m = reach(n); if (m) recv[m.email] = true; }));
        if (nt.admin && plansToday.length) admins.forEach(m => { recv[m.email] = true; });
        const cfg = this.cloudCfg();
        const base0 = this.cloudBase() || { url: '', key: '', ws: 'smartcare' };
        const [hh, mm] = (nt.time || '08:30').split(':').map(Number);
        const d = new Date(today + 'T00:00:00');
        const dayTxt = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ')';
        const code = [
          '// 스마트케어 — 오늘 프로그램 일정 알림 (Gmail 무료 발송)',
          '// 1) 저장  2) 프로젝트 설정(⚙) › 스크립트 속성에 SB_EMAIL, SB_PASSWORD(데이터 서버 공용 계정) 추가',
          '// 3) 함수 setup 실행 → 권한 허용  (이후 매일 자동 발송)',
          '// 비밀번호는 이 코드에 넣지 말고 스크립트 속성에만 넣으세요.',
          'const CFG = ' + JSON.stringify({ url: cfg ? cfg.url : base0.url, key: cfg ? cfg.key : base0.key, ws: (cfg || base0).ws || 'smartcare', org: orgIdCur, plansKey: orgIdCur === 'ORG1' ? 'smartcare.plans.v1' : 'smartcare.o.' + orgIdCur + '.plans.v1', hour: hh, minute: mm, sender: nt.sender, adminSummary: !!nt.admin, orgName: orgName }, null, 2) + ';',
          '',
          '// 데이터 서버 로그인 (공용 계정 · 실행할 때마다 새 토큰)',
          'let TOKEN_ = null;',
          'function token_() {',
          '  if (TOKEN_) return TOKEN_;',
          '  const p = PropertiesService.getScriptProperties();',
          "  const email = p.getProperty('SB_EMAIL'), password = p.getProperty('SB_PASSWORD');",
          "  if (!email || !password) throw new Error('프로젝트 설정 › 스크립트 속성에 SB_EMAIL, SB_PASSWORD를 넣으세요');",
          "  const r = UrlFetchApp.fetch(CFG.url + '/auth/v1/token?grant_type=password', { method: 'post', contentType: 'application/json', headers: { apikey: CFG.key }, payload: JSON.stringify({ email: email, password: password }), muteHttpExceptions: true });",
          "  if (r.getResponseCode() !== 200) throw new Error('데이터 서버 로그인 실패 (HTTP ' + r.getResponseCode() + ') — SB_EMAIL·SB_PASSWORD를 확인하세요');",
          '  TOKEN_ = JSON.parse(r.getContentText()).access_token;',
          '  return TOKEN_;',
          '}',
          '',
          'function setup() {',
          '  token_(); // 로그인 정보부터 확인',
          "  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));",
          "  ScriptApp.newTrigger('sendToday').timeBased().atHour(CFG.hour).nearMinute(CFG.minute).everyDays(1).inTimezone('Asia/Seoul').create();",
          "  Logger.log('매일 ' + CFG.hour + ':' + String(CFG.minute).padStart(2, '0') + ' 경 알림이 예약되었습니다.');",
          '}',
          '',
          'function kv(k) {',
          "  const r = UrlFetchApp.fetch(CFG.url + '/rest/v1/smartcare_kv?select=v&k=eq.' + encodeURIComponent(CFG.ws + ':' + k), { headers: { apikey: CFG.key, Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true });",
          "  if (r.getResponseCode() !== 200) throw new Error('데이터를 읽지 못했습니다 (HTTP ' + r.getResponseCode() + ') — 공용 계정이 작업공간에 등록됐는지 확인하세요');",
          '  const a = JSON.parse(r.getContentText() || "[]");',
          '  if (!a.length) return null;',
          "  return typeof a[0].v === 'string' ? JSON.parse(a[0].v) : a[0].v;",
          '}',
          '',
          'function sendToday() {',
          "  const tz = 'Asia/Seoul', today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');",
          "  const plans = (kv(CFG.plansKey || 'smartcare.plans.v1') || []).filter(p => p.date === today && p.status !== '취소').sort((a, b) => (a.start || '').localeCompare(b.start || ''));",
          '  if (!plans.length) return; // 프로그램 없는 날은 발송 안 함',
          "  const roster = (kv('smartcare.roster.v1') || []).filter(m => m.org === CFG.org && m.status === '활성' && m.email && m.notify);",
          "  const isAdmin = m => (m.roles || [m.role]).indexOf('관리자') >= 0;",
          "  const day = Utilities.formatDate(new Date(), tz, 'M월 d일') + ' (' + '일월화수목금토'[Number(Utilities.formatDate(new Date(), tz, 'u')) % 7] + ')';",
          "  const row = p => '<tr><td style=\"padding:6px 10px;border-bottom:1px solid #ddd;white-space:nowrap\"><b>' + p.start + (p.end ? ' ~ ' + p.end : '') + '</b></td><td style=\"padding:6px 10px;border-bottom:1px solid #ddd\">' + p.program + '<br><span style=\"color:#666;font-size:12px\">' + [p.place, p.ward && p.ward !== '전체' ? p.ward : '', (p.staff || []).join(', ')].filter(Boolean).join(' · ') + '</span></td></tr>';",
          "  const mail = (m, list, title) => MailApp.sendEmail({ to: m.email, name: CFG.sender, subject: '[' + CFG.orgName + '] ' + day + ' ' + title, htmlBody: '<div style=\"font-family:sans-serif\"><p>' + m.name + '님, ' + day + ' 프로그램 일정입니다.</p><table style=\"border-collapse:collapse;font-size:14px\">' + list.map(row).join('') + '</table><p style=\"color:#888;font-size:12px\">스마트케어 자동 알림 · 회신하지 마세요</p></div>' });",
          '  const sent = {};',
          '  roster.forEach(m => {',
          '    const mine = plans.filter(p => (p.staff || []).indexOf(m.name) >= 0);',
          "    if (CFG.adminSummary && isAdmin(m)) { mail(m, plans, '전체 프로그램 ' + plans.length + '건'); sent[m.email] = 1; }",
          "    else if (mine.length && !sent[m.email]) { mail(m, mine, '담당 프로그램 ' + mine.length + '건'); sent[m.email] = 1; }",
          '  });',
          '}'
        ].join('\n');
        return {
          ntTime: nt.time, ntTimeLabel: nt.time, ntSender: nt.sender,
          onNtTime: (e) => saveNt({ time: e.target.value || '08:30' }),
          onNtSender: (e) => saveNt({ sender: e.target.value }),
          ntAdmin: !!nt.admin, ntAdminCls: nt.admin ? 'btn btn-primary' : 'btn btn-secondary',
          ntAdminIcon: nt.admin ? 'ph-fill ph-check-square' : 'ph ph-square',
          ntAdminLabel: nt.admin ? '받음' : '받지 않음',
          toggleNtAdmin: () => saveNt({ admin: !nt.admin }),
          ntNoCloud: !cfg,
          ntGoCloud: () => this.setState({ setTab: 'cloud' }),
          ntTodayLabel: dayTxt + ' · ' + plansToday.length + '건',
          ntHasPlans: plansToday.length > 0, ntNoPlans: plansToday.length === 0,
          ntRows: plansToday.map(p => {
            const ok = (p.staff || []).filter(n => reach(n));
            const miss = (p.staff || []).filter(n => !reach(n));
            return {
              time: p.start + (p.end ? ' ~ ' + p.end : ''), program: p.program, place: p.place || '—',
              to: ok.length ? '→ ' + ok.join(', ') + (miss.length ? ' · 미수신: ' + miss.join(', ') + ' (Gmail·수신 설정 필요)' : '') : '받을 담당자 없음 — 계정 목록에서 Gmail·수신을 설정하세요',
              toColor: ok.length && !miss.length ? 'var(--color-accent-300)' : 'var(--cal-red)'
            };
          }),
          ntRecvCount: Object.keys(recv).length,
          ntCompose: () => {
            if (!plansToday.length) { this.flash('오늘 예정된 프로그램이 없습니다'); return; }
            const to = Object.keys(recv);
            if (!to.length) { this.flash('받을 사람이 없습니다 — 계정 목록에서 Gmail과 수신을 설정하세요'); return; }
            const body = dayTxt + ' 프로그램 일정입니다.\n\n' + plansToday.map(p => '· ' + p.start + (p.end ? '~' + p.end : '') + '  ' + p.program + ' (' + [p.place, (p.staff || []).join(', ')].filter(Boolean).join(' · ') + ')').join('\n') + '\n\n— ' + nt.sender;
            const url = 'https://mail.google.com/mail/?view=cm&fs=1&bcc=' + encodeURIComponent(to.join(',')) + '&su=' + encodeURIComponent('[' + orgName + '] ' + dayTxt + ' 프로그램 일정') + '&body=' + encodeURIComponent(body);
            window.open(url, '_blank', 'noopener');
          },
          ntCode: code,
          ntCodeOpen: !!s.ntCodeOpen,
          ntCodeLabel: s.ntCodeOpen ? '스크립트 닫기' : '스크립트 보기',
          toggleNtCode: () => this.setState({ ntCodeOpen: !s.ntCodeOpen }),
          ntCopy: async () => {
            if (!cfg) this.flash('주의: 데이터 서버가 연결되지 않아 스크립트가 일정을 읽을 수 없습니다');
            try { await navigator.clipboard.writeText(code); this.flash('스크립트를 복사했습니다 — Apps Script 편집기에 붙여넣으세요'); }
            catch (e) { this.setState({ ntCodeOpen: true }); this.flash('자동 복사가 막혀 있습니다 — 아래 스크립트를 전체 선택(Ctrl+A) 후 복사하세요'); }
          }
        };
      })(),
      ...(() => {
        const cfg = this.cloudCfg();
        const st = s.cloudStatus || 'off';
        let saved = {}; try { saved = JSON.parse(localStorage.getItem('smartcare.cloud.v1') || '{}'); } catch (e) {}
        const SQL = "-- 스마트케어 데이터 서버 (Supabase) — 보안 구성\n-- 서버 데이터는 \"작업공간에 등록된 서버 계정\"으로 로그인한 기기만 읽고 쓸 수 있습니다 (RLS).\n-- SQL Editor에 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.\n\n-- 1) 데이터 테이블\ncreate table if not exists smartcare_kv (\n  k text primary key,\n  v text,\n  updated_at timestamptz default now()\n);\nalter table smartcare_kv enable row level security;\n\n-- 2) 예전 \"누구나 읽기·쓰기\" 정책 제거\ndrop policy if exists \"smartcare test access\" on smartcare_kv;\n\n-- 3) 작업공간 구성원: 어떤 서버 계정이 어떤 작업공간 데이터에 접근하는지\ncreate table if not exists smartcare_members (\n  ws text not null,\n  user_id uuid not null references auth.users(id) on delete cascade,\n  created_at timestamptz default now(),\n  primary key (ws, user_id)\n);\nalter table smartcare_members enable row level security;\ndrop policy if exists \"members read own\" on smartcare_members;\ncreate policy \"members read own\" on smartcare_members\n  for select to authenticated using (user_id = auth.uid());\n\n-- 4) 로그인한 계정이 작업공간 구성원인지 확인\ncreate or replace function smartcare_is_member(p_ws text)\nreturns boolean language sql stable security definer set search_path = public as $$\n  select exists (select 1 from smartcare_members where ws = p_ws and user_id = auth.uid());\n$$;\nrevoke all on function smartcare_is_member(text) from public, anon;\ngrant execute on function smartcare_is_member(text) to authenticated;\n\n-- 5) 키 앞부분(작업공간 코드)이 내 작업공간일 때만 읽기·쓰기·삭제\ndrop policy if exists \"kv members only\" on smartcare_kv;\ncreate policy \"kv members only\" on smartcare_kv\n  for all to authenticated\n  using (smartcare_is_member(split_part(k, ':', 1)))\n  with check (smartcare_is_member(split_part(k, ':', 1)));\n\n-- 6) 로그인하지 않은 요청(공개 키만 가진 요청)은 차단\nrevoke all on smartcare_kv from anon;\nrevoke all on smartcare_members from anon;\ngrant select, insert, update, delete on smartcare_kv to authenticated;\ngrant select on smartcare_members to authenticated;\n\n-- 7) 공용 서버 계정 등록\n--    먼저 Authentication › Users › Add user 로 계정을 만드세요 (Auto Confirm User 체크).\n--    아래 이메일을 그 계정 이메일로 바꿔 실행합니다.\ninsert into smartcare_members (ws, user_id)\nselect '{ws}', id from auth.users where email = 'shared-account@example.com'\non conflict do nothing;\n".split('{ws}').join(((s.cfWs != null ? s.cfWs : saved.ws) || Component.CLOUD_DEFAULT.ws || 'smartcare').trim());
        return {
          cloudOn: !!cfg, cloudOff: !cfg,
          cloudStatusLabel: !cfg ? '연결 안 됨 — 이 PC에만 저장 중' : st === 'ok' ? '연결됨 · 마지막 동기화 ' + (s.cloudAt || '') : st === 'syncing' ? '동기화 중…' : '연결 오류 — ' + (s.cloudErr || ''),
          cloudStatusClass: !cfg ? 'tag tag-neutral' : st === 'ok' ? 'tag tag-accent' : st === 'syncing' ? 'tag tag-outline' : 'tag tag-neutral',
          cloudStatusIcon: !cfg ? 'ph ph-hard-drives' : st === 'ok' ? 'ph ph-cloud-check' : st === 'syncing' ? 'ph ph-arrows-clockwise' : 'ph ph-cloud-warning',
          cfUrl: s.cfUrl != null ? s.cfUrl : (saved.url || Component.CLOUD_DEFAULT.url || ''),
          cfKey: s.cfKey != null ? s.cfKey : (saved.key || Component.CLOUD_DEFAULT.key || ''),
          cfWs: s.cfWs != null ? s.cfWs : (saved.ws || Component.CLOUD_DEFAULT.ws || 'smartcare'),
          onCfUrl: (e) => this.setState({ cfUrl: e.target.value }),
          onCfKey: (e) => this.setState({ cfKey: e.target.value }),
          onCfWs: (e) => this.setState({ cfWs: e.target.value }),
          cloudSql: SQL,
          copySql: () => { try { navigator.clipboard.writeText(SQL); this.flash('SQL을 복사했습니다'); } catch (e) { this.flash('복사하지 못했습니다 — 직접 선택해 복사하세요'); } },
          cloudConnect: async () => {
            let url = ((s.cfUrl != null ? s.cfUrl : saved.url) || '').trim().replace(/\/+$/, '');
            const key = ((s.cfKey != null ? s.cfKey : saved.key) || '').trim();
            const ws = ((s.cfWs != null ? s.cfWs : saved.ws) || 'smartcare').trim();
            // Project ID(영문 20자)만 넣어도 URL로 바꿔 줌
            if (/^[a-z0-9]{15,30}$/.test(url)) { url = 'https://' + url + '.supabase.co'; this.setState({ cfUrl: url }); }
            if (!/^https:\/\/.+/.test(url) || !key) { this.flash('Project URL(https://…)과 Publishable key를 입력하세요'); return; }
            if (/^sb_secret_/.test(key) || /service_role/.test(key)) { this.flash('Secret key는 쓰면 안 됩니다 — Publishable key(sb_publishable_…)를 넣으세요'); return; }
            this.setState({ cloudStatus: 'syncing', cloudErr: '' });
            try {
              // 공개 키 확인 (데이터는 서버 로그인 후에만 읽을 수 있음)
              const r = await fetch(url + '/auth/v1/settings', { headers: { apikey: key } });
              if (!r.ok) throw new Error(r.status === 401 ? 'Publishable key가 맞지 않습니다' : 'HTTP ' + r.status);
            } catch (e) { this.setState({ cloudStatus: 'error', cloudErr: e.message }); this.flash('연결 실패 — ' + e.message); return; }
            const orig = Storage.prototype.__scOrig || Storage.prototype.setItem;
            orig.call(localStorage, 'smartcare.cloud.v1', JSON.stringify({ url: url, key: key, ws: ws }));
            this.setState({ cfUrl: null, cfKey: null, cfWs: null });
            // 다른 서버로 바꾸면 이전 서버 로그인은 쓰지 않음 → 서버 로그인 화면이 열림
            if (this._auth && this._auth.url !== url) this.authStore(null);
            this.flash(this._auth ? '서버 연결 성공 — 동기화를 시작합니다' : '서버 설정 저장 — 기관 공용 서버 계정으로 로그인하세요');
            this.cloudInit();
          },
          cloudSyncNow: () => { this.cloudFlush(); this.cloudPull(false); },
          cloudDisconnect: () => this.setState({ dialog: {
            title: '이 PC의 서버 연결을 해제할까요?',
            body: '서버의 데이터는 그대로 남습니다. 해제하면 이 PC에서 바꾼 내용은 다른 PC에 반영되지 않습니다.',
            cta: '연결 해제',
            confirm: () => { localStorage.removeItem('smartcare.cloud.v1'); clearInterval(this._cloudPoll); this._cloudReady = false; window.__scCloudReady = false; this.setState({ dialog: null, cloudStatus: 'off' }); this.flash('서버 연결을 해제했습니다'); }
          } })
        };
      })(),
      isSysUser: isSys, notSysUser: !isSys,
      orgIdCur: orgIdCur, orgName: orgName,
      // 시스템 관리자: 작업할 기관 선택 → 그 기관 데이터로 다시 엶 (기관 데이터는 서로 섞이지 않음)
      onSwitchOrg: (e) => {
        const v = e.target.value;
        if (!v || v === (window.__scOrg || 'ORG1')) return;
        try { window.localStorage.setItem('sc.sysOrg.v1', v); } catch (er) {}
        this.saveWork && this.saveWork();
        this.flash((s.orgs.find(o => o.id === v) || {}).name + ' 데이터로 전환합니다…');
        setTimeout(() => window.location.reload(), 600);
      },
      orgCount: s.orgs.length,
      orgRows: s.orgs.map((o, oi) => {
        const isCur = o.id === orgIdCur;
        const dragging = s.orgDrag === o.id;
        const over = s.orgOver === o.id && s.orgDrag != null && !dragging;
        const dnd = {
          order: oi + 1,
          opacity: dragging ? '0.45' : '1',
          dragStart: (e) => { if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.id); } this.setState({ orgDrag: o.id }); },
          dragOver: (e) => { if (this.state.orgDrag == null) return; e.preventDefault(); if (this.state.orgOver !== o.id) this.setState({ orgOver: o.id }); },
          drop: (e) => {
            e.preventDefault();
            const from = this.state.orgDrag;
            this.setState({ orgDrag: null, orgOver: null });
            if (!from || from === o.id) return;
            const list = this.state.orgs.slice();
            const fi = list.findIndex(x => x.id === from);
            const item = list.splice(fi, 1)[0];
            list.splice(list.findIndex(x => x.id === o.id) + (fi <= oi ? 1 : 0), 0, item);
            this.setState({ orgs: list });
            this.saveRoster(this.state.roster);
            this.flash(item.name + ' 위치 이동 — ' + (list.indexOf(item) + 1) + '번째');
          },
          dragEnd: () => this.setState({ orgDrag: null, orgOver: null })
        };
        const staffN = s.roster.filter(m => m.org === o.id && m.status === '활성').length;
        const ptN = isCur ? PATIENTS.length : ((this._orgStore || {})[o.id] ? this._orgStore[o.id].patients.length : (o.id === 'ORG1' ? PATIENTS.length : 0));
        return {
          ...dnd,
          name: o.name, isCur: isCur, notCur: !isCur, neverShow: false,
          meta: '기관 코드 ' + o.id + ' · 활성 계정 ' + staffN + '명 · 기관 관리자 ' + s.roster.filter(m => m.org === o.id && m.status === '활성' && (Array.isArray(m.roles) ? m.roles : [m.role]).indexOf('관리자') >= 0).length + '명',
          goAccounts: () => this.setState({ setTab: 'staff', acctOrg: o.id }),
          goOpen: () => { if (o.id === (window.__scOrg || 'ORG1')) { this.setState({ pcView: 'patients' }); return; } try { window.localStorage.setItem('sc.sysOrg.v1', o.id); } catch (e) {} this.flash(o.name + ' 데이터로 전환합니다…'); setTimeout(() => window.location.reload(), 600); },
          shadow: over ? '0 0 0 2px var(--color-accent), var(--shadow-md)' : (isCur ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)'),
          onName: (e) => { const v = e.target.value; this.setState({ orgs: this.state.orgs.map(x => x.id === o.id ? Object.assign({}, x, { name: v }) : x) }); },
          go: () => this.switchOrg(o.id)
        };
      }),
      newOrgName: s.newOrgName || '',
      onNewOrgName: (e) => this.setState({ newOrgName: e.target.value }),
      addOrg: () => {
        const v = (s.newOrgName || '').trim();
        if (!v) { this.flash('기관명을 입력하세요'); return; }
        if (s.orgs.some(o => o.name === v)) { this.flash('이미 등록된 기관입니다'); return; }
        const id = 'ORG' + (s.orgs.reduce((m, o) => Math.max(m, parseInt(o.id.slice(3), 10) || 0), 0) + 1);
        this.setState({ orgs: s.orgs.concat([{ id: id, name: v }]), newOrgName: '' });
        this.flash(v + ' 등록 — 전환 후 기관 관리자를 추가하세요');
      },
      wardRows: wardRows,
      wardSummary: '병동 ' + s.wards.length + '개 · 호실 ' + s.wards.reduce((n, w) => n + w.rooms.length, 0) + '개',
      wardsDirty: wardsDirty, wardsClean: !wardsDirty,
      wardChangeLabel: '저장하지 않은 변경 ' + changeCount + '건',
      wardSavedLabel: s.wardsSavedAt ? '모든 변경 저장됨 · ' + s.wardsSavedAt : '모든 변경 저장됨',
      saveWards: () => { saveWards(); const d = new Date(); this.setState({ wardsSavedAt: (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() }); },
      revertWards: () => this.setState({
        dialog: { title: '변경을 되돌릴까요?', body: '마지막 저장 이후의 병동 · 호실 변경 ' + changeCount + '건이 취소됩니다.', cta: '되돌리기', confirm: revertWards }
      }),
      newWard: s.newWard,
      onNewWard: (e) => this.setState({ newWard: e.target.value }),
      newWardKey: (e) => { if (e.key === 'Enter') addWard(); },
      addWard: addWard,

      formWard: s.formWard,
      formRoom: s.formRoom,
      onFormWard: (e) => this.setState({ formWard: e.target.value, comboOpen: 'ward' }),
      onFormRoom: (e) => this.setState({ formRoom: e.target.value, comboOpen: 'room' }),
      openWard: () => this.setState({ comboOpen: 'ward' }),
      openRoom: () => this.setState({ comboOpen: 'room' }),
      closeCombo: () => this.setState({ comboOpen: null }),
      blurWard: () => {
        const hits = s.wards.filter(w => score(w.name, s.formWard) >= 0 && score(w.name, s.formWard) <= 1);
        if (!selWard && s.formWard && hits.length === 1) {
          const keep = hits[0].rooms.some(r => norm(r) === norm(s.formRoom));
          this.setState({ comboOpen: null, formWard: hits[0].name, formRoom: keep ? s.formRoom : s.formRoom });
        } else this.setState({ comboOpen: null });
      },
      blurRoom: () => {
        if (selWard && !selWardRoom && s.formRoom) {
          const hits = selWard.rooms.filter(r => score(r, s.formRoom) >= 0 && score(r, s.formRoom) <= 1);
          if (hits.length === 1) { this.setState({ comboOpen: null, formRoom: hits[0] }); return; }
        }
        this.setState({ comboOpen: null });
      },
      wardKey: (e) => {
        if (e.key === 'Enter' && wardMatches.length && wardMatches[0]._match) { e.preventDefault(); pickWard(s.wards.find(x => x.id === wardMatches[0].id))(); }
        if (e.key === 'Escape') this.setState({ comboOpen: null });
      },
      roomKey: (e) => {
        if (e.key === 'Enter' && roomMatches.length && roomMatches[0]._match) { e.preventDefault(); pickRoom({ ward: roomMatches[0].ward, room: roomMatches[0].room })(); }
        if (e.key === 'Escape') this.setState({ comboOpen: null });
      },
      wardOpen: s.comboOpen === 'ward',
      roomOpen: s.comboOpen === 'room',
      wardSuggest: wardMatches.map((w, i) => {
        const top = i === 0 && !!s.formWard && w._match;
        const current = norm(w.name) === norm(s.formWard);
        return {
          label: w.name,
          meta: (current ? '선택됨 · ' : (top ? '추천 · ' : '')) + '호실 ' + w.rooms.length + '개',
          bg: (top || current) ? 'var(--color-accent-900)' : 'transparent',
          pick: pickWard(s.wards.find(x => x.id === w.id))
        };
      }),
      wardNoMatch: s.wards.length === 0,
      roomSuggest: roomMatches.slice(0, 40).map((x, i) => {
        const n = occupants(x.ward + ' ' + x.room);
        const top = i === 0 && !!s.formRoom && x._match;
        const current = selWard && norm(x.room) === norm(s.formRoom);
        return {
          label: selWard ? x.room : x.ward + ' ' + x.room,
          meta: (current ? '선택됨 · ' : (top ? '추천 · ' : '')) + (n > 0 ? '환자 ' + n + '명' : '비어 있음'),
          bg: (top || current) ? 'var(--color-accent-900)' : 'transparent',
          pick: pickRoom({ ward: x.ward, room: x.room })
        };
      }),
      roomNoMatch: roomMatches.length === 0,
      wardInvalid: !!s.formWard && !selWard && s.comboOpen !== 'ward',
      roomInvalid: !!s.formRoom && !selWardRoom && s.comboOpen !== 'room',
      roomInvalidMsg: selWard ? selWard.name + '에 등록되지 않은 호실입니다 — 목록에서 선택하세요' : '병동을 먼저 선택하거나 목록에서 호실을 고르세요',
      onThreshold: (e) => this.setState({ threshold: Number(e.target.value) }),
      saveText: () => this.flash('동의서 문구 저장 — 동의서 화면에 반영됩니다'),

      programSummary: '항목 ' + s.programs.length + '개',
      programRows: programRows,
      adding: s.adding, notAdding: !s.adding,
      newProgram: s.newProgram,
      onNewProgram: (e) => this.setState({ newProgram: e.target.value }),
      startAdd: () => this.setState({ adding: true, newProgram: '' }),
      cancelAdd: () => this.setState({ adding: false, newProgram: '' }),
      saveProgram: () => {
        const name = (s.newProgram || '').trim();
        if (!name) { this.flash('프로그램명을 입력하세요'); return; }
        if (s.programs.indexOf(name) >= 0) { this.flash('이미 등록된 항목입니다'); return; }
        this.setState({ programs: s.programs.concat([name]), adding: false, newProgram: '' });
        this.flash('"' + name + '" 추가 — 현장 앱 선택 항목에 반영');
      },

      roster: roster,
      rosterSummary: staffOrgName + ' · 활성 ' + orgRoster.filter(m => m.status === '활성').length + '명 · 중지 ' + orgRoster.filter(m => m.status === '중지').length + '명 · 해제 ' + orgRoster.filter(m => m.status === '해제').length + '명',
      newStaffName: s.newStaffName, newStaffType: s.newStaffType,
      onNewStaffName: (e) => this.setState({ newStaffName: e.target.value }),
      onNewStaffType: (e) => this.setState({ newStaffType: e.target.value }),
      newRoleOpts: ROLES.map(r => {
        const picked = Array.isArray(s.newStaffRole) ? s.newStaffRole : [s.newStaffRole];
        const on = picked.indexOf(r) >= 0;
        return {
          label: r === '관리자' ? '기관 관리자' : r, active: on, inactive: !on,
          go: () => {
            const next = on ? picked.filter(x => x !== r) : picked.concat([r]);
            this.setState({ newStaffRole: ROLES.filter(x => next.indexOf(x) >= 0) });
          }
        };
      }),
      roleHint: (Array.isArray(s.newStaffRole) ? s.newStaffRole : [s.newStaffRole])
        .map(r => ROLE_HINT[r]).join('\n') || '부여할 권한을 하나 이상 선택하세요 (중복 선택 가능)',
      accounts: accounts,
      ...(() => {
        const vw = Math.min(s.vw || 1600, 1640);
        const sbW = vw < 1100 ? (s.menuExpandNarrow ? (s.sbW || 248) : 64) : (s.menuMini ? 64 : (s.sbW || 248));
        const wide = vw - sbW - 48 >= 1310;
        return {
          acctCols: wide ? '28px minmax(76px, 0.7fr) minmax(84px, 0.8fr) minmax(140px, 1.3fr) minmax(108px, 1fr) minmax(104px, 1fr) minmax(220px, 2fr) 112px 112px 112px 70px 56px' : 'repeat(auto-fill, minmax(min(100%, 168px), 1fr))',
          acctMinW: wide ? '1180px' : '0',
          acctHeadDisp: wide ? 'grid' : 'none',
          acctLblDisp: wide ? 'none' : 'block',
          acctMailSpan: wide ? 'auto' : '1 / -1',
          acctCellAlign: wide ? 'center' : 'flex-start',
          acctDelAlign: wide ? 'flex-end' : 'flex-start',
          acctGripSpan: wide ? 'auto' : '1 / -1',
          acctGripW: wide ? '28px' : '100%',
          acctGripH: wide ? '38px' : '22px'
        };
      })(),
      // 설정 하위 메뉴 모두 같은 폭 (화면 전체 폭 사용)
      setMaxW: 'none',
      acctSaveIcon: s.acctSaving ? 'ph ph-circle-notch' : (s.acctSaveOk === false ? 'ph ph-warning' : 'ph-fill ph-check-circle'),
      acctSaveText: s.acctSaving ? '저장 중…' : (s.acctSaveOk === false ? '저장 실패 — 브라우저 저장공간을 확인하세요' : (s.acctSavedAt ? '자동 저장됨 · ' + s.acctSavedAt : '자동 저장 켜짐')),
      acctSaveColor: s.acctSaveOk === false ? 'var(--color-accent-300)' : (s.acctSaving ? 'var(--color-neutral-400)' : 'var(--color-accent-400)'),
      acctEmpty: accounts.length === 0,
      acctQ: s.acctQ || '',
      onAcctQ: (e) => this.setState({ acctQ: e.target.value }),
      acctScopeNote: isSys ? '시스템 관리자 · 전체 기관의 계정과 기능별 뷰/사용 권한 관리' : (meIsAdmin ? orgName + ' 기관 관리자 · 소속 기관 계정만 관리' : '조회 전용'),
      acctAddDisplay: (isSys || meIsAdmin) ? 'inline-flex' : 'none',
      posOpts: ['실장', '팀장', '병동장', '수간호사', '주임간호사', '간호사', '사회복지사', '물리치료사', '임상병리사', '행정', '자원봉사자', '실습생', '본사', '기타'],
      acctOrgChips: (isSys ? [{ id: 'ALL', name: '전체' }].concat(s.orgs) : s.orgs.filter(o => o.id === me.org)).map(o => ({
        name: o.name,
        count: s.roster.filter(m => m.org !== '*' && (o.id === 'ALL' || m.org === o.id)).length,
        on: acctOrg === o.id, off: acctOrg !== o.id,
        go: () => { if (isSys) this.setState({ acctOrg: o.id }); }
      })),
      acctAdd: () => {
        if (!(isSys || meIsAdmin)) { this.flash('계정 추가는 기관 관리자 또는 시스템 관리자만 할 수 있습니다'); return; }
        const org = acctOrg !== 'ALL' ? acctOrg : (isSys ? ((s.orgs[0] || {}).id || 'ORG1') : orgIdCur);
        const id = Math.max.apply(null, s.roster.map(m => m.id)) + 1;
        const t = String(100000 + Math.floor(Math.random() * 900000));
        const perms = { pt: { v: true, u: false }, lg: { v: true, u: true }, st: { v: true, u: false } };
        const row = { id: id, name: '', type: '사회복지사', dept: '사회사업실', org: org, empNo: '', email: '', notify: false, perms: perms, roles: rolesFrom(perms, false), role: rolesFrom(perms, false)[0], status: '활성', revokedAt: '', pw: t, tempPw: t, mustChange: true };
        const list = [row].concat(s.roster);
        this.setState({ roster: list, acctQ: '' }); this.saveRoster(list);
        this.flash(orgNm(org) + ' 계정 추가 — 맨 위 행에 사번·이름을 입력하세요 (임시 비밀번호 ' + t + ')');
      },
      staffOrgOpts: s.orgs.map(o => ({
        name: o.name, on: o.id === staffOrg, off: o.id !== staffOrg,
        count: s.roster.filter(m => m.org === o.id && m.status === '활성').length + '명',
        go: () => this.setState({ staffOrg: o.id })
      })),
      staffOrgName: staffOrgName,
      staffReadOnly: !canManageStaff,
      staffAddDisplay: canManageStaff ? 'flex' : 'none',
      newStaffEmp: s.newStaffEmp || '',
      newStaffEmail: s.newStaffEmail || '',
      onNewStaffEmp: (e) => this.setState({ newStaffEmp: e.target.value }),
      onNewStaffEmail: (e) => this.setState({ newStaffEmail: e.target.value }),
      addStaff: () => {
        if (!canManageStaff) { this.flash('담당자 추가는 기관 관리자 또는 시스템 관리자만 할 수 있습니다'); return; }
        const name = (s.newStaffName || '').trim();
        if (!name) { this.flash('이름을 입력하세요'); return; }
        const emp = (s.newStaffEmp || '').trim();
        if (!emp) { this.flash('사번을 입력하세요'); return; }
        if (s.roster.some(m => m.org === staffOrg && m.empNo === emp)) { this.flash(staffOrgName + '에 이미 사용 중인 사번입니다'); return; }
        const email = (s.newStaffEmail || '').trim();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { this.flash('Gmail 주소 형식을 확인하세요'); return; }
        if (email && s.roster.some(m => m.org === staffOrg && (m.email || '').toLowerCase() === email.toLowerCase())) { this.flash('이미 등록된 Gmail입니다'); return; }
        const picked = Array.isArray(s.newStaffRole) ? s.newStaffRole : [s.newStaffRole];
        if (picked.length === 0) { this.flash('권한을 하나 이상 선택하세요'); return; }
        const id = Math.max.apply(null, s.roster.map(m => m.id)) + 1;
        this.setState({
          roster: s.roster.concat([{ id: id, name: name, type: (s.newStaffType || '').trim() || '기타', roles: picked, role: picked[0], status: '활성', revokedAt: '', org: staffOrg, empNo: emp, email: email, pw: '1234' }]),
          newStaffName: '', newStaffType: '', newStaffEmp: '', newStaffEmail: ''
        });
        this.flash(staffOrgName + ' · ' + name + ' 추가 — ' + picked.map(x => x === '관리자' ? '기관 관리자' : x).join(' · ') + ' 권한');
      },

      // 모바일
      mToday: s.mobileView === 'today', mNewLog: s.mobileView === 'newLog',
      mReview: s.mobileView === 'review', mLogs: s.mobileView === 'logs',
      mConsent: s.mobileView === 'consent',
      reviewMeta: this.sessionMetaOf(this.curKey(s), s) || (s.logPlace || '프로그램실') + ' · ' + (s.staff || []).join(', '),
      reviewHead: this.curKey(s).split('|')[0] + ' · ' + (this.sessionMetaOf(this.curKey(s), s) || (s.logPlace || '프로그램실') + ' · ' + (s.staff || []).join(', ')),
      mobileBack: s.mobileView !== 'today',
      mobileTitle: s.mobileView === 'newLog' ? '일지 작성'
        : (s.mobileView === 'review' ? '판독 결과 · ' + this.curKey(s).split('|')[1] + ' ' + this.curKey(s).split('|')[0].slice(5).replace('-', '/')
        : (s.mobileView === 'consent' ? '동의서 작성' : '프로그램 일지')),
      goConsentMobile: () => this.setState({ mobileView: 'consent' }),
      // 휴대폰·태블릿: 바로 전 단계로 (기록이 없으면 오늘 화면)
      mobileGoBack: () => { if (!this.navGoBack()) this.setState({ mobileView: 'today' }); },
      ...this.aiVals(s),
      navBack: () => { if (!this.navGoBack()) this.flash('이전 화면이 없습니다'); },
      navNoBack: !(s.navDepth > 0),
      navBackTitle: s.navDepth > 0 ? '이전 화면으로 (Alt + ←)' : '이전 화면이 없습니다',
      ...this.mobileDayVals(s, userName),
      todayCards: mDayPlans.map(p => {
        const key = p.date + '|' + p.program;
        const ss = this.getSession(key, s);
        const has = ss.review.length > 0;
        const unk = ss.review.filter(r => !r.id).length;
        const status = ss.confirmed && has ? '확정' : has ? '검수 대기' : (p.status && p.status !== '예정' ? p.status : '미작성');
        const review = status === '검수 대기' || status === '확정';
        const where = p.start + (p.end ? '~' + p.end : '') + ' · ' + p.place + (p.ward && p.ward !== '전체' ? ' · ' + p.ward : '');
        const smeta = where + ' · ' + (p.staff || []).join(', ');
        // 프로그램별 고유 색 (통계 차트와 같은 순서·색)
        const PAL = ['oklch(0.76 0.13 150)', 'oklch(0.80 0.12 85)', 'oklch(0.72 0.14 30)', 'oklch(0.74 0.13 335)', 'oklch(0.72 0.10 245)', 'oklch(0.72 0.14 285)', 'oklch(0.74 0.11 200)'];
        const ICONS = { '미술치료': 'ph ph-paint-brush', '음악치료': 'ph ph-music-notes', '컬러링북': 'ph ph-palette', '원예치료': 'ph ph-plant', '웃음치료': 'ph ph-smiley', '체조': 'ph ph-person-simple-tai-chi', '레크리에이션': 'ph ph-puzzle-piece' };
        const progs = (s.programs || []).concat([p.program]);
        // 프로그램 성격에 맞춘 고정 색: 미술=따뜻한 코랄, 컬러링=라벤더, 음악=하늘, 원예=초록
        const FIXED = { '미술치료': 'oklch(0.74 0.15 40)', '컬러링북': 'oklch(0.72 0.14 300)', '음악치료': 'oklch(0.74 0.12 230)', '원예치료': 'oklch(0.76 0.14 145)', '웃음치료': 'oklch(0.82 0.13 90)', '체조': 'oklch(0.74 0.12 195)' };
        const pc = FIXED[p.program] || PAL[Math.max(0, progs.indexOf(p.program)) % PAL.length];
        return {
          color: pc,
          tint: 'color-mix(in oklch, ' + pc + ' 30%, var(--color-surface))',
          edge: 'color-mix(in oklch, ' + pc + ' 60%, transparent)',
          icon: ICONS[p.program] || 'ph ph-calendar-check',
          statusColor: status === '미작성' ? 'var(--cal-red, oklch(0.68 0.19 25))' : 'inherit',
          statusWeight: status === '미작성' ? '600' : 'inherit',
          _fk: status === '확정' ? '검수 완료' : status === '검수 대기' ? '검수 필요' : '미작성',
          program: p.program, status: status,
          meta: where + '\n' + (has ? '참여 ' + ss.review.filter(r => r.id).length + '명' + (unk ? ' · 미확인 ' + unk + '명' : '') : '담당 ' + (p.staff || []).join(', ')),
          attention: status === '검수 대기', settled: status !== '검수 대기',
          primary: review, secondary: !review,
          shadow: status === '검수 대기' ? '0 0 0 1px var(--color-accent-700)' : 'var(--shadow-sm)',
          cta: status === '확정' ? '기록 확인하기' : status === '검수 대기' ? '결과 확인하기' : '사진 찍고 기록',
          go: () => review
            ? this.switchSession(key, { ...this.reviewNav(), program: p.program }, smeta)
            : (p.demo ? this.switchSession(key, { mobileView: 'newLog', program: p.program, logDate: p.date, logPlace: p.place }, smeta) : this.openLogFromPlan(p))
        };
      }),
      ...(() => {
        // 현장 앱 일지 필터 — PC 일지 목록과 같은 기준 (미작성 / 검수 필요 / 검수 완료)
        const all = mDayPlans.map(p => {
          const ss = this.getSession(p.date + '|' + p.program, s);
          const has = ss.review.length > 0;
          return ss.confirmed && has ? '검수 완료' : has ? '검수 필요' : '미작성';
        });
        const f = s.mLogFilter || '전체';
        const cnt = (k) => k === '전체' ? all.length : all.filter(x => x === k).length;
        return {
          mHasCards: all.length > 0,
          mFilterOpts: ['전체', '미작성', '검수 필요', '검수 완료'].map(k => ({
            label: k, n: cnt(k), on: f === k, off: f !== k,
            numColor: k === '검수 필요' && cnt(k) > 0 ? 'var(--color-accent-300)' : 'var(--color-text)',
            go: () => this.setState({ mLogFilter: k })
          })),
          _mStates: all, _mFilter: f,
          mFilterEmpty: all.length > 0 && f !== '전체' && cnt(f) === 0,
          mFilterEmptyMsg: f === '검수 필요' ? '검수할 일지가 없습니다 👍' : f === '미작성' ? '작성하지 않은 일지가 없습니다' : '아직 검수 완료된 일지가 없습니다'
        };
      })(),
      get todayCardsShown() {
        const f = s.mLogFilter || '전체';
        return f === '전체' ? this.todayCards : this.todayCards.filter(c => c._fk === f);
      },
      goNewLog: () => this.switchSession(mDay + '|' + s.program, { mobileView: 'newLog', logDate: mDay, logPlace: this.state.logPlace || '프로그램실' }),
      // + 프로그램 추가: 프로그램을 골라 그날 일정(완료)으로 등록하고 일지 작성으로 이동
      mAddIsOpen: !!s.mAddOpen, mAddClosed: !s.mAddOpen,
      mAddOpen: () => this.setState({ mAddOpen: true }),
      mAddClose: () => this.setState({ mAddOpen: false }),
      mAddNoProg: !(s.programs || []).length,
      mAddProgs: (s.programs || []).map((name, i, arr, mDayShortTxt = (mDay === this.todayIso() ? '오늘' : mDay.slice(5).replace('-', '/'))) => {
        const COLORS = ['oklch(0.72 0.14 285)', 'oklch(0.74 0.11 200)', 'oklch(0.76 0.13 150)', 'oklch(0.80 0.12 85)', 'oklch(0.72 0.14 30)', 'oklch(0.74 0.13 335)'];
        const existing = (s.plans || []).find(p => p.date === mDay && p.program === name && p.status !== '취소');
        return {
          name: name, color: COLORS[i % COLORS.length], has: !!existing,
          go: () => {
            const me = ((this.state.roster || []).find(m => m.id === this.state.userId) || {}).name || '';
            if (!existing) {
              const now = new Date(); const p2 = (n) => String(n).padStart(2, '0');
              const st = p2(now.getHours()) + ':' + p2(Math.floor(now.getMinutes() / 10) * 10);
              const endH = Math.min(23, now.getHours() + 1);
              const plan = { id: 'PL' + Date.now() + '-0', date: mDay, series: '', repeat: '', program: name, start: st, end: p2(endH) + ':' + p2(Math.floor(now.getMinutes() / 10) * 10), place: this.state.logPlace || '프로그램실', ward: '전체', capacity: 10, status: '완료', staff: me ? [me] : [], memo: '현장 앱에서 추가 (예정에 없던 진행)' };
              const plans = (this.state.plans || []).concat([plan]);
              this.setState({ plans: plans });
              if (typeof this.savePlans === 'function') this.savePlans(plans);
              else { try { localStorage.setItem('smartcare.plans.v1', JSON.stringify(plans)); } catch (e) {} }
              this.flash(mDayShortTxt + ' ' + name + ' 일정 추가 — 일지를 작성하세요');
            } else this.flash(mDayShortTxt + ' ' + name + ' 일지를 엽니다');
            this.setState({ mAddOpen: false, program: name });
            this.switchSession(mDay + '|' + name, { mobileView: 'newLog', logDate: mDay, logPlace: this.state.logPlace || (existing && existing.place) || '프로그램실', program: name });
          }
        };
      }),
      logDate: s.logDate || mDay,
      logPlace: s.logPlace == null ? '프로그램실' : s.logPlace,
      onLogDate: (e) => { const v = e.target.value; this.switchSession(v + '|' + this.state.program, { logDate: v }); },
      onLogPlace: (e) => this.setState({ logPlace: e.target.value }),
      logDayHasPlans: logDayPlans.length > 0,
      logDayNoPlans: logDayPlans.length === 0,
      logDayTitle: (() => { const d = new Date((s.logDate || mDay) + 'T00:00:00'); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ') 프로그램 ' + logDayPlans.length + '건'; })(),
      logShowChips: logDayPlans.length === 0 || !!s.logManual,
      logManualLabel: s.logManual ? '일정 목록에서 선택' : '일정에 없는 프로그램 직접 선택',
      toggleLogManual: () => this.setState({ logManual: !s.logManual }),
      logDayPlans: logDayPlans.map(p => {
        const on = !s.logManual && s.program === p.program && (s.logDate || mDay) === p.date;
        return {
          time: p.start + (p.end ? ' ~ ' + p.end : ''), program: p.program,
          meta: [p.place, (p.ward && p.ward !== '전체') ? p.ward : '', (p.staff || []).join(', ')].filter(Boolean).join(' · '),
          on: on, off: !on,
          use: () => { this.setState({ logManual: false }); this.openLogFromPlan(p); if (this.state.device === 'pc') this.setState({ mobileView: this.state.mobileView }); }
        };
      }),
      programChips: s.programs.map(p => ({
        label: p, active: s.program === p, inactive: s.program !== p,
        go: () => this.switchSession((s.logDate || mDay) + '|' + p, { program: p, logManual: logDayPlans.length > 0 ? true : s.logManual })
      })),
      staffChips: activeStaff.map(m => ({
        name: m.name, on: s.staff.indexOf(m.name) >= 0, off: s.staff.indexOf(m.name) < 0,
        toggle: () => this.setState({ staff: s.staff.indexOf(m.name) >= 0 ? s.staff.filter(x => x !== m.name) : s.staff.concat([m.name]) })
      })),
      photos: s.photos.map(p => ({
        label: p.label,
        url: p.url || '',
        imgEl: this.img(p.url, p.label),
        hasImage: !!p.url, noImage: !p.url,
        uploading: p.pct !== undefined && p.pct > 0 && p.pct < 100,
        pct: (p.pct || 0) + '%',
        remove: (e) => {
          e.stopPropagation();
          this.setState({ photos: this.state.photos.filter(x => x !== p) });
          this.purgePhoto(p, this.curKey());
          this.flash(p.label + ' 삭제');
        }
      })),
      sitePhotoRef: this._siteInput,
      onSitePhotos: (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) this.setState({ sitePhotosOpen: true }); addSitePhotos(fs); },
      addPhoto: () => { if (this._siteInput.current) this._siteInput.current.click(); },
      photoHint: s.offline
        ? '오프라인 — 사진은 기기에 저장되고, 연결되면 업로드 후 자동 판독됩니다.'
        : '올리기가 끝나면 AI 판독이 자동으로 시작됩니다.',
      analyzing: s.analyzing, notAnalyzing: !s.analyzing,
      submitLabel: s.offline ? '기기에 저장 (연결 시 전송)' : '저장 · AI 판독 요청',
      submitLog: submitLog,

      mobileTabs: [
        { key: 'today', label: '오늘', icon: 'ph ph-house' },
        { key: 'logs', label: '일지', icon: 'ph ph-note-pencil' },
        { key: 'review', label: '검수', icon: 'ph ph-scan-smiley' },
        { key: 'consent', label: '동의서', icon: 'ph ph-signature' }
      ].map(t => ({
        label: t.label, icon: t.icon,
        active: s.mobileView === t.key, inactive: s.mobileView !== t.key,
        go: () => this.setState({ mobileView: t.key })
      })),

      dialog: s.dialog,
      closeDialog: () => this.setState({ dialog: null }),
      toast: s.toast
    };
  }
}

