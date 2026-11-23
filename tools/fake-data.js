/* 개발·체험용 가상 데이터 (실제 환자·직원 정보가 아님) — dev-server.js 와 체험용 빌드가 함께 사용 */
function scFakeData(today) {
  // 접속한 기기(브라우저)의 오늘 날짜와 같게 (한국 시간대 고정이면 서버·시험 환경의 시간대에 따라 하루씩 어긋남)
  if (!today) { var _d = new Date(), _p = function (n) { return String(n).padStart(2, '0'); }; today = _d.getFullYear() + '-' + _p(_d.getMonth() + 1) + '-' + _p(_d.getDate()); }
  var addDay = function (n) { return new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10); };
  var roster = [
    { id: 99, name: '시스템 관리자', type: '본사', roles: ['시스템관리자'], role: '시스템관리자', status: '활성', revokedAt: '', org: '*', empNo: 'admin', email: '', pw: 'demo1234' },
    { id: 1, name: '김체험', type: '사회복지사', dept: '사회사업실', roles: ['관리자'], role: '관리자', status: '활성', revokedAt: '', org: 'ORG1', empNo: '100101', email: 'staff1@example.test', notify: true, pw: '1234' },
    { id: 2, name: '박체험', type: '사회복지사', dept: '사회사업실', roles: ['담당자'], role: '담당자', status: '활성', revokedAt: '', org: 'ORG1', empNo: '100102', email: 'staff2@example.test', notify: true, pw: '1234' },
    { id: 3, name: '최보조', type: '보조', dept: '사회사업실', roles: ['보조'], role: '보조', status: '활성', revokedAt: '', org: 'ORG1', empNo: '100103', email: '', pw: '1234' }
  ];
  var P = function (id, room, name, sex, birth, age, consent, face, stay) {
    return { id: id, room: room, name: name, sex: sex, birth: birth, age: age, consent: consent, face: face, stay: stay, faceId: '—', last: '참여 이력 없음', photo: false,
      guardians: [{ type: '주보호자', name: '가상보호자', rel: '자녀', phone: '010-0000-0000' }] };
  };
  var patients = [
    P('PT-D001', '3병동 301호', '가상환자1', '여', '1942-03-11', 84, '동의', '동의', '재원'),
    P('PT-D002', '3병동 302호', '가상환자2', '남', '1948-07-02', 78, '동의', '동의', '재원'),
    P('PT-D003', '3병동 305호', '가상환자3', '여', '1939-12-24', 86, '보류', '미동의', '재원'),
    P('PT-D004', '4병동 401호', '가상환자4', '남', '1951-05-19', 75, '동의', '동의', '재원'),
    P('PT-D005', '4병동 403호', '가상환자5', '여', '1945-09-30', 81, '동의', '미동의', '재원'),
    P('PT-D006', '4병동 405호', '가상환자6', '남', '1937-01-08', 89, '동의', '동의', '퇴원')
  ];
  var pl = function (id, date, start, end, program, place, staff) { return { id: id, date: date, start: start, end: end, program: program, place: place, staff: staff, status: '예정', capacity: 10, repeat: '없음', until: '', memo: '' }; };
  var plans = [
    pl('pl-d1', today, '10:00', '11:00', '미술치료', '3층 프로그램실', ['박체험']),
    pl('pl-d2', today, '14:00', '15:00', '음악치료', '4층 휴게실', ['김체험']),
    pl('pl-d3', addDay(1), '10:30', '11:30', '원예치료', '옥상정원', ['박체험']),
    pl('pl-d4', addDay(3), '15:00', '16:00', '회상치료', '3층 프로그램실', ['김체험'])
  ];
  return {
    'smartcare:smartcare.roster.v1': JSON.stringify(roster),
    'smartcare:smartcare.patients.v1': JSON.stringify(patients),
    'smartcare:smartcare.plans.v1': JSON.stringify(plans)
  };
}
if (typeof module !== 'undefined') module.exports = scFakeData;
