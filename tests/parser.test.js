/* 결제 알림 파서 — 카드사·은행·페이별 실제 문구 형식 */
const { boot, wait, assert } = require("./helpers");

/* 새 형식을 만나면 여기에 한 줄 추가하고 npm test.
   want.name 은 화면에 뜨는 가맹점, amt 는 금액, type 은 income 이면 수입. null 이면 대기열에 안 들어와야 함. */
const CASES = [
  { pkg: "com.samsung.android.spay", text: "삼성카드 승인\n홍*동님\n12,000원 일시불\n09/21 12:30\n스타벅스 강남점", want: { name: "스타벅스 강남점", amt: 12000 } },
  { pkg: "com.hyundaicard.appcard", text: "현대카드 승인\n홍*동님 15,800원 일시불\n09/21 12:31 올리브영 강남역점\n누적 512,000원", want: { name: "올리브영 강남역점", amt: 15800 } },
  { pkg: "com.lcacApp", text: "롯데카드 승인\n[홍*동]님 8,900원 일시불\n09/21 08:10 GS25 역삼점", want: { name: "GS25 역삼점", amt: 8900 } },
  { pkg: "com.hanaskcard.paycla", text: "하나(1234) 홍*동님 09/21 12:40 6,500원 일시불 이디야 강남 승인", want: { name: "이디야 강남", amt: 6500 } },
  { pkg: "com.wooricard.wpay", text: "우리카드(9876) 승인\n홍*동님 45,000원 일시불\n09/20 19:02 배달의민족", want: { name: "배달의민족", amt: 45000 } },
  { pkg: "nh.smart.card", text: "NH농협체크승인 홍*동 3,200원 09/21 07:55 지하철 서울교통공사 잔액 220,000원", want: { name: "지하철 서울교통공사", amt: 3200 } },
  { pkg: "com.shcard.smartpay", text: "신한카드 승인\n신한카드(1234)승인 홍*동\n12,000원 일시불\n09/20 13:05 스타벅스 강남점\n누적 345,000원", want: { name: "스타벅스 강남점", amt: 12000 } },
  { pkg: "viva.republica.toss", text: "토스\n스타벅스 역삼점에서 5,600원 결제했어요", want: { name: "스타벅스 역삼점", amt: 5600 } },
  { pkg: "com.nhn.android.search", text: "네이버페이\n쿠팡에서 38,900원 결제 완료", want: { name: "쿠팡", amt: 38900 } },
  { pkg: "com.kakaobank.channel", text: "카카오뱅크\n출금 20,000원\n카카오T 택시\n잔액 1,203,000원", want: { name: "카카오T 택시", amt: 20000 } },
  { pkg: "com.kbstar.kbbank", text: "[Web발신]\nKB국민 입금 2,400,000원 급여 잔액 3,120,000원", want: { name: "KB국민 급여", amt: 2400000, type: "income" } },
  { pkg: "com.kakaobank.channel", text: "카카오뱅크\n입금 1,250원\n이자", want: { amt: 1250, type: "income" } },
  { pkg: "com.samsung.android.messaging", text: "[Web발신]\n[신한카드] 9월 결제 예정 금액 345,000원 (09/25 출금) 안내", want: null },
  { pkg: "com.shcard.smartpay", text: "신한카드 승인취소 12,000원 스타벅스", want: null },
  { pkg: "com.samsung.android.messaging", text: "(광고) 최대 30,000원 할인 쿠폰 지급! 결제 시 사용", want: null },
  /* 2026-09-22 실기기(토스)에서 잘못 들어온 것들. 실제 원문은 설정 › 감지 기록 보기에서 확인해 맞출 것 — 아래는 추정 형식 */
  { pkg: "viva.republica.toss", text: "실패\n토스뱅크 카드 | 12,000원 결제 실패 · 잔액 부족", want: null },
  { pkg: "viva.republica.toss", text: "승인 거절\n스타벅스 5,600원 한도 초과", want: null },
  { pkg: "viva.republica.toss", text: "129원 캐시백 🎉\n토스뱅크 카드 결제 금액의 1%를 돌려받았어요", want: null },
  { pkg: "viva.republica.toss", text: "토스\n어제 결제한 12,900원의 129원을 캐시백으로 받았어요", want: null },
  { pkg: "viva.republica.toss", text: "36원 캐시백 🎉\nSK텔레콤에서 12,000원 결제했어요", want: { name: "SK텔레콤", amt: 12000 } },
  /* 2026-09-26 실기기 원문 (스크린샷) — 삼성 월렛은 ₩ 앞머리, 토스뱅크 카드는 "금액 결제 | 가게" */
  { pkg: "com.samsung.android.spay", text: "₩151,600 결제 완료\n고메스퀘어 발산점", want: { name: "고메스퀘어 발산점", amt: 151600 } },
  { pkg: "viva.republica.toss", text: "454원 캐시백 🎉\n151,600원 결제 | 고메스퀘어 발산점\n잔액 0원(토스뱅크 체크카드)", want: { name: "고메스퀘어 발산점", amt: 151600 } },
  { pkg: "com.samsung.android.messaging", text: "[Web발신]\n[현대카드] 승인 12,000원 일시불 09/22 14:03 스타벅스 M포인트 120P 적립예정", want: { name: "스타벅스", amt: 12000 } },
  /* 적금·투자로 옮긴 돈은 저축으로 (2026-09-30 사용자 요청) — 저축은행 이름·카드 결제는 저축 아님 */
  { pkg: "viva.republica.toss", text: "토스뱅크\n출금 300,000원\n굴비적금\n잔액 1,020,000원", want: { name: "굴비적금", amt: 300000, type: "saving", cat: "적금" } },
  { pkg: "com.kakaobank.channel", text: "카카오뱅크\n출금 250,000원\n토스증권\n잔액 770,000원", want: { name: "토스증권", amt: 250000, type: "saving", cat: "투자" } },
  { pkg: "com.samsung.android.messaging", text: "[Web발신]\n[OK저축은행] 출금 5,000원 GS25 역삼점 잔액 90,000원", want: { amt: 5000 } },
  { pkg: "com.samsung.android.messaging", text: "[Web발신]\n[대신저축은행] 입금 250,000원 김*재 430502-**-****** 잔액 1,250,000원", want: { name: "대신저축은행 김*재", amt: 250000, type: "income" } },
];

module.exports = async function () {
  const t = new Date(2026, 8, 21, 12, 0).getTime();
  const { d, $, errors } = boot({ pending: CASES.map((c) => ({ pkg: c.pkg, text: c.text, time: t })) });
  await wait(1200);
  $("qfab").click();
  await wait(100);

  const rows = [...d.querySelectorAll("#ibList .ibrow")].map((r) => ({
    name: r.querySelector(".body b").textContent,
    amt: r.querySelector(".amt").textContent,
    income: r.querySelector(".amt").textContent.startsWith("+"),
    type: r.querySelector(".tchip").textContent,
    cat: r.querySelector(".body span").textContent,
  }));
  const expectN = CASES.filter((c) => c.want).length;
  assert(rows.length === expectN, "대기열 " + expectN + "건이어야 함 — 실제 " + rows.length + ": " + rows.map((r) => r.name).join(" | "));

  let i = 0;
  for (const c of CASES) {
    if (!c.want) continue;
    const r = rows[i++]; // 같은 시각이라 들어온 순서대로
    const label = c.text.split("\n")[0];
    if (c.want.name) assert(r.name === c.want.name, label + " → 가맹점 '" + c.want.name + "' 기대, 실제 '" + r.name + "'");
    assert(r.amt.replace(/[^0-9]/g, "") === String(c.want.amt), label + " → 금액 " + c.want.amt + " 기대, 실제 " + r.amt);
    assert(r.income === (c.want.type === "income"), label + " → 수입/지출 구분 틀림");
    const tl = { income: "수입", saving: "저축" }[c.want.type] || "지출";
    assert(r.type === tl, label + " → 종류 '" + tl + "' 기대, 실제 '" + r.type + "'");
    if (c.want.cat) assert(r.cat === c.want.cat, label + " → 카테고리 '" + c.want.cat + "' 기대, 실제 '" + r.cat + "'");
  }
  /* 대기열 종류 칩: 누를 때마다 지출 → 저축 → 수입 → 지출, 카테고리도 따라 바뀜. 일괄 저장하면 그 종류로 */
  const chipRow = () => [...d.querySelectorAll("#ibList .ibrow")].find((r) => r.querySelector(".body b").textContent === "카카오T 택시");
  chipRow().querySelector(".tchip").click(); await wait(20);
  assert(chipRow().querySelector(".tchip").textContent === "저축" && chipRow().querySelector(".body span").textContent === "적금", "칩 한 번 → 저축·적금");
  chipRow().querySelector(".tchip").click(); await wait(20);
  assert(chipRow().querySelector(".tchip").textContent === "수입" && chipRow().querySelector(".amt").textContent.startsWith("+"), "두 번 → 수입");
  chipRow().querySelector(".tchip").click(); await wait(20);
  assert(chipRow().querySelector(".tchip").textContent === "지출", "세 번 → 지출");
  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));

  /* 배분 탭에서 "저축으로 계산" 을 켠 봉투 이름이 알림에 있으면 저축 (괄호 속 말은 안 봄) */
  let feed = [];
  const b = boot({ android: { takePending: () => { const x = feed; feed = []; return JSON.stringify(x); }, hasNotifAccess: () => true, setBars: () => {} } });
  await wait(500);
  b.d.querySelector('[data-tab="plan"]').click(); await wait(50);
  const env = [...b.d.querySelectorAll("#envs .card")].find((c) => c.querySelector(".nm").value === "저축·투자");
  env.querySelector(".nm").value = "모임통장(토스)"; env.querySelector(".nm").dispatchEvent(new b.w.Event("input")); await wait(30);
  feed = [
    { pkg: "com.kakaobank.channel", text: "카카오뱅크\n출금 100,000원\n모임통장\n잔액 500,000원", time: t },
    { pkg: "viva.republica.toss", text: "토스\n스타벅스 역삼점에서 5,600원 결제했어요", time: t + 1 },
  ];
  b.w.__pullPending(); await wait(100);
  b.$("qfab").click(); await wait(100);
  const rs = [...b.d.querySelectorAll("#ibList .ibrow")];
  const mo = rs.find((r) => r.querySelector(".body b").textContent === "모임통장");
  const sb = rs.find((r) => r.querySelector(".body b").textContent === "스타벅스 역삼점");
  assert(mo && mo.querySelector(".tchip").textContent === "저축", "저축 봉투 이름이 있는 이체는 저축 — 실제: " + rs.map((r) => r.textContent).join(" | "));
  assert(sb && sb.querySelector(".tchip").textContent === "지출", "괄호 속 '토스' 는 안 봐서 토스 결제는 지출");
  /* 일괄 저장하면 저축으로 기록되어 상단 저축 카드에 잡힌다 */
  b.$("ibSave").click(); await wait(600);
  b.d.querySelector('[data-tab="tx"]').click(); await wait(50);
  assert(/100,000/.test(b.d.querySelector(".sum3, #top, body").textContent), "저축 100,000 이 화면에 잡혀야 함");
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));
};
