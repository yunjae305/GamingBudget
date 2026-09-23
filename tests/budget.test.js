/* 하루 예산 · 예산 계산기 · 내역 검색 · 통계(일별·히트맵·요일별) · 영수증 스캔 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const { d, $, w, errors } = boot({ android: { setBars: () => {}, saveFile: () => {} } });
  await wait(300);
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  const n = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate(), left = n - day + 1;
  const num = (s) => parseInt(String(s).replace(/[^0-9-]/g, ""), 10);
  const type = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };

  /* 지출 두 건: 오늘 10,000 (메모 스타벅스), 어제 20,000 (이달이면) */
  const addTx = async (date, amt, memo) => {
    $("add").click(); await wait(30);
    $("fDate").value = date; $("fAmt").value = String(amt); $("fMemo").value = memo || "";
    $("fSave").click(); await wait(30);
  };
  await addTx(today, 10000, "스타벅스");
  let before = 0;
  if (day > 1) { await addTx(today.slice(0, 8) + pad(day - 1), 20000, "마트"); before = 20000; }
  await wait(500);

  /* 예산 없음 → 상단 카드는 "예산 정하기" */
  assert($("sToday").textContent === "예산 정하기", "예산이 없으면 '예산 정하기' — 실제: " + $("sToday").textContent);

  /* 예산 탭: 총 예산 300,000 → 오늘 쓸 수 있는 돈 */
  d.querySelector('[data-tab="budget"]').click(); await wait(30);
  assert(/총 예산을 정하면/.test($("todayCard").textContent), "예산 없을 때 안내 문구");
  type("bt", "300000"); await wait(30);
  const allow = Math.floor((300000 - before) / left), rest = allow - 10000;
  const tc = $("todayCard").textContent;
  assert(tc.includes(new Intl.NumberFormat("ko-KR").format(Math.abs(rest)) + "원"), "오늘 쓸 수 있는 돈 " + rest + " 기대 — 실제: " + tc);
  assert(tc.includes(new Intl.NumberFormat("ko-KR").format(allow) + "원"), "하루 기준 " + allow + " 기대 — 실제: " + tc);
  assert(tc.includes(left + "일"), "남은 날 " + left + " — 실제: " + tc);
  assert(num($("sToday").textContent) === rest || (rest < 0 && num($("sToday").textContent) === -rest), "상단 카드에도 같은 금액 — 실제: " + $("sToday").textContent);

  /* 예산 계산기: 2,000,000 − 500,000 − 300,000 = 1,200,000 → 총 예산으로 넣기 */
  type("bcIncome", "2000000"); type("bcFixed", "500000"); type("bcSaving", "300000"); await wait(20);
  assert(num($("bcOut").textContent) === 1200000, "계산 결과 1,200,000 — 실제: " + $("bcOut").textContent);
  assert(num($("bcDay").textContent) === Math.floor(1200000 / n), "하루 " + Math.floor(1200000 / n) + " — 실제: " + $("bcDay").textContent);
  $("bcApply").click(); await wait(30);
  assert(num($("bt").value) === 1200000, "총 예산 칸이 1,200,000 으로 바뀌어야 함 — 실제: " + $("bt").value);
  const allow2 = Math.floor((1200000 - before) / left);
  assert($("todayCard").textContent.includes(new Intl.NumberFormat("ko-KR").format(allow2) + "원"), "오늘 카드가 새 예산으로 다시 계산 — 실제: " + $("todayCard").textContent);

  /* 상단 카드 누르면 예산 탭 */
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  $("todayRow").click(); await wait(20);
  assert($("largeTitle").textContent === "예산", "오늘 카드 → 예산 탭");

  /* 내역 목록 검색·필터 */
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  d.querySelector('#mode [data-m="list"]').click(); await wait(20);
  assert($("txQ") && $("txCatSel"), "목록 보기에 검색 칸과 카테고리 선택이 있어야 함");
  const rows = () => d.querySelectorAll("#txList .row.tap").length;
  const total = rows();
  type("txQ", "스타"); await wait(20);
  assert(rows() === 1, "'스타' 검색 → 1건 — 실제: " + rows());
  assert(/1건/.test($("txList").textContent), "검색 중엔 건수·합계가 보여야 함");
  type("txQ", "없는말"); await wait(20);
  assert(/검색 결과가 없습니다/.test($("txList").textContent), "결과 없음 안내");
  type("txQ", ""); await wait(20);
  assert(rows() === total, "검색을 지우면 전체 — 실제: " + rows());
  $("txCatSel").value = "식비"; $("txCatSel").dispatchEvent(new w.Event("change")); await wait(20);
  assert(rows() === total, "기본 카테고리(식비)로 저장됐으니 전부 보여야 함 — 실제: " + rows());

  /* 통계: 일별·히트맵·요일별 */
  d.querySelector('[data-tab="stat"]').click(); await wait(30);
  const st = $("view").textContent;
  assert(/일별 지출/.test(st) && /지출 히트맵/.test(st) && /요일별 평균 지출/.test(st), "통계에 일별·히트맵·요일별 섹션");
  assert(d.querySelectorAll(".heat").length === n, "히트맵 칸이 이달 날짜 수만큼 — 실제: " + d.querySelectorAll(".heat").length);
  assert(d.querySelectorAll(".bars.dense div").length === n, "일별 막대가 날짜 수만큼");
  assert(/가장 많이 쓴 날/.test(st), "가장 많이 쓴 날 표시");

  /* 영수증 스캔: 키 없으면 설정으로, 키 있으면 사진 → Gemini → 대기열 */
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  $("qfab").click(); await wait(30);
  assert($("ibScan"), "대기열 화면에 영수증 스캔 버튼");
  $("ibScan").click(); await wait(30);
  assert($("themeSheet").classList.contains("open"), "키가 없으면 설정 시트가 열려야 함");
  $("aiKeyInput").value = "test-key"; $("aiKeyInput").dispatchEvent(new w.Event("change"));
  $("tDone").click(); await wait(30);
  assert($("inboxSheet").classList.contains("open"), "설정을 닫으면 대기열로 돌아와야 함");

  let sent = null;
  w.fetch = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ amount: "15,400", merchant: "이마트 역삼점", date: today }) }] } }] }) };
  };
  const file = new w.File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "r.jpg", { type: "image/jpeg" });
  Object.defineProperty($("rcFile"), "files", { value: [file], configurable: true });
  $("rcFile").dispatchEvent(new w.Event("change"));
  await wait(200);
  assert(sent && sent.url.includes("test-key"), "사용자 키로 Gemini 를 불러야 함");
  const parts = sent.body.contents[0].parts;
  assert(parts.some((p) => p.inlineData && p.inlineData.data), "사진이 inlineData 로 가야 함");
  const names = [...d.querySelectorAll("#ibList .ibrow .body b")].map((b) => b.textContent);
  assert(names.includes("이마트 역삼점"), "대기열에 영수증 가게가 들어와야 함 — 실제: " + names.join(","));
  const amt = [...d.querySelectorAll("#ibList .ibrow")].find((r) => r.querySelector(".body b").textContent === "이마트 역삼점").querySelector(".amt").textContent;
  assert(num(amt) === 15400 || num(amt) === -15400, "금액 15,400 — 실제: " + amt);

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));

  /* 하루 예산 알림 설정: 브리지 상태를 읽어 스위치·시각을 보여 주고, 바꾸면 setReminders 로 넘긴다 */
  let remState = { on: false, morning: "08:00", evening: "21:00", granted: false, needsPermission: true };
  let setCalls = [], asked = 0;
  const b = boot({ android: {
    setBars: () => {},
    reminders: () => JSON.stringify(remState),
    setReminders: (on, m, e) => { setCalls.push([on, m, e]); remState = Object.assign({}, remState, { on, morning: m, evening: e }); },
    askNotifPermission: () => { asked++; },
    testReminder: () => true,
  } });
  await wait(300);
  b.$("themeBtn").click(); await wait(30);
  assert(b.$("rmOn") && !b.$("rmOn").checked, "알림 스위치가 꺼진 상태로 보여야 함");
  assert(b.$("rmM").disabled, "꺼져 있으면 시각 입력이 비활성");
  b.$("rmOn").checked = true; b.$("rmOn").dispatchEvent(new b.w.Event("change")); await wait(20);
  assert(setCalls.length === 1 && setCalls[0][0] === true && setCalls[0][1] === "08:00", "켜면 setReminders(true, 08:00, 21:00) — 실제: " + JSON.stringify(setCalls));
  assert(asked === 1, "안드로이드 13+ 에서 권한이 없으면 권한을 물어야 함");
  assert(b.$("rmTest"), "켜진 뒤엔 '지금 보내 보기' 가 보여야 함");
  b.$("rmE").value = "20:30"; b.$("rmE").dispatchEvent(new b.w.Event("change")); await wait(20);
  assert(setCalls[setCalls.length - 1][2] === "20:30", "저녁 시각을 바꾸면 다시 넘겨야 함");
  b.w.__notifPerm(true); await wait(20);
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));

  /* 옛 APK(브리지에 reminders 없음)에서는 안내만 */
  const c = boot({ android: { setBars: () => {} } });
  await wait(300);
  c.$("themeBtn").click(); await wait(30);
  assert(/새 APK 설치 필요/.test(c.$("setRemind").textContent), "브리지가 없으면 새 APK 안내");
};
