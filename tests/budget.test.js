/* 하루 예산 · 예산 계산기 · 내역 검색 · 통계(일별·히트맵·요일별) · 영수증 스캔 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const { d, $, w, errors } = boot({ android: { setBars: () => {}, saveFile: () => {}, builtinAiKey: () => "test-key" } });
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
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  assert(num($("sToday").textContent) === rest || (rest < 0 && num($("sToday").textContent) === -rest), "내역 탭 상단 카드에도 같은 금액 — 실제: " + $("sToday").textContent);
  d.querySelector('[data-tab="budget"]').click(); await wait(20);

  /* 배분 탭: 실수령액을 적고 봉투마다 % 또는 원으로 기입 → 막대·남은 돈, 봉투 금액을 총 예산으로 */
  d.querySelector('[data-tab="plan"]').click(); await wait(30);
  assert(!d.querySelector("#envs input[type=range]"), "슬라이더는 없어야 함");
  type("pi", "2000000"); await wait(20);
  const envCards = () => d.querySelectorAll("#envs .card");
  assert(envCards().length === 4, "기본 봉투 4개 — 실제: " + envCards().length);
  assert(envCards()[0].querySelector(".out").textContent === "800,000원", "고정지출 40% → 800,000원 — 실제: " + envCards()[0].querySelector(".out").textContent);
  /* 고정지출을 30% 로 줄인 뒤, 생활비(25%)를 원 모드로 바꿔 600,000 기입 → 30% */
  const fixed = envCards()[0];
  fixed.querySelector(".vpct").value = "30"; fixed.querySelector(".vpct").dispatchEvent(new w.Event("input")); await wait(10);
  assert(fixed.querySelector(".out").textContent === "600,000원", "30% → 600,000원 — 실제: " + fixed.querySelector(".out").textContent);
  const life = envCards()[1];
  life.querySelector('[data-m="amt"]').click(); await wait(10);
  assert(!life.querySelector(".vamt").hidden && life.querySelector(".vpct").hidden, "원 모드면 원 칸만 보여야 함");
  assert(num(life.querySelector(".vamt").value) === 500000, "원 모드로 바꾸면 25% → 500,000원 — 실제: " + life.querySelector(".vamt").value);
  life.querySelector(".vamt").value = "600000"; life.querySelector(".vamt").dispatchEvent(new w.Event("input")); await wait(10);
  assert(life.querySelector(".out").textContent === "30%", "600,000원 → 30% — 실제: " + life.querySelector(".out").textContent);
  assert(/아직 안 나눈 돈/.test($("restLbl").textContent) && /5%/.test($("restVal").textContent), "30+30+25+10=95 → 남은 5% — 실제: " + $("restVal").textContent);
  /* 100% 넘게 기입하면 남은 몫까지만 */
  fixed.querySelector(".vpct").value = "90"; fixed.querySelector(".vpct").dispatchEvent(new w.Event("input")); await wait(10);
  assert(fixed.querySelector(".vpct").value === "35%", "남은 몫(35%)까지만 — 실제: " + fixed.querySelector(".vpct").value);
  /* 소수점 비율은 그대로 읽힌다 (33.3% 가 333 이 되면 안 됨) */
  fixed.querySelector(".vpct").value = "33.3%"; fixed.querySelector(".vpct").dispatchEvent(new w.Event("input")); await wait(10);
  assert(fixed.querySelector(".vpct").value === "33.3%", "33.3% 유지 — 실제: " + fixed.querySelector(".vpct").value);
  fixed.querySelector(".vpct").value = "35"; fixed.querySelector(".vpct").dispatchEvent(new w.Event("input")); await wait(10);
  assert(/모두 나눴습니다/.test($("restLbl").textContent), "합계 100% 면 모두 나눴습니다");
  /* 생활비 봉투 금액이 곧 총 예산 (버튼 없이 자동) */
  assert(/생활비.*600,000원.*총 예산/.test($("pbNote").textContent), "안내: 생활비 600,000 이 총 예산 — 실제: " + $("pbNote").textContent);
  d.querySelector('[data-tab="budget"]').click(); await wait(20);
  assert(!$("bt") && num($("btVal").textContent) === 600000, "총 예산이 배분 탭 생활비 600,000 으로 자동 — 실제: " + ($("btVal") && $("btVal").textContent));
  $("btRow").click(); await wait(20);
  assert(d.querySelector('[data-tab="plan"]').getAttribute("aria-selected") === "true", "총 예산 줄을 누르면 배분 탭");
  d.querySelector('[data-tab="budget"]').click(); await wait(20);
  assert(!$("bcIncome"), "예산 탭의 예산 계산 카드는 없어야 함");
  const allow2 = Math.floor((600000 - before) / left);
  assert($("todayCard").textContent.includes(new Intl.NumberFormat("ko-KR").format(allow2) + "원"), "오늘 카드가 새 예산으로 다시 계산 — 실제: " + $("todayCard").textContent);
  /* 저축 목표는 자산 탭에 */
  d.querySelector('[data-tab="asset"]').click(); await wait(20);
  assert($("gt") && $("gl"), "자산 탭에 저축 목표가 있어야 함");
  type("gt", "3000000"); await wait(10);
  assert(/남음/.test($("gl").textContent), "목표를 넣으면 남은 금액이 보여야 함 — 실제: " + $("gl").textContent);

  /* 상단 카드 누르면 예산 탭 */
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  $("todayRow").click(); await wait(20);
  assert(d.querySelector('[data-tab="budget"]').getAttribute("aria-selected") === "true", "오늘 카드 → 예산 탭");
  assert(!$("largeTitle"), "탭 위 큰 제목은 없어야 함");

  /* 상단 카드는 내역·통계 탭에만. 통계는 수입/지출/저축만(오늘 줄 없음), 배분은 카드 자체가 없음 */
  d.querySelector('[data-tab="stat"]').click(); await wait(20);
  assert($("todayRow").style.display === "none", "통계 탭에는 오늘 카드가 없어야 함");
  assert($("summaryCard").style.display !== "none", "통계 탭에 수입/지출/저축 카드는 있어야 함");
  d.querySelector('[data-tab="plan"]').click(); await wait(20);
  assert($("summaryCard").style.display === "none", "배분 탭에는 상단 카드가 없어야 함");
  d.querySelector('[data-tab="budget"]').click(); await wait(20);
  assert($("summaryCard").style.display === "none", "예산 탭에는 상단 카드(오늘·수입/지출/저축)가 없어야 함");
  /* 자산 탭: 상단 카드 대신 항목별 비율 원그래프 */
  d.querySelector('[data-tab="asset"]').click(); await wait(20);
  assert($("summaryCard").style.display === "none", "자산 탭에는 상단 카드가 없어야 함");
  assert(/등록하면/.test($("adonut").textContent), "항목이 없으면 안내");
  $("aadd").click(); await wait(20); $("aadd").click(); await wait(20);
  const cards = d.querySelectorAll("#alist .card");
  cards[0].querySelector(".nm").value = "주거래 통장"; cards[0].querySelector(".nm").dispatchEvent(new w.Event("input"));
  cards[0].querySelector(".am").value = "3000000"; cards[0].querySelector(".am").dispatchEvent(new w.Event("input"));
  cards[1].querySelector(".nm").value = "적금"; cards[1].querySelector(".nm").dispatchEvent(new w.Event("input"));
  cards[1].querySelector(".am").value = "1000000"; cards[1].querySelector(".am").dispatchEvent(new w.Event("input"));
  await wait(20);
  assert($("adonut").querySelector("svg"), "자산 원그래프가 있어야 함");
  assert(/주거래 통장.*75\.0%/.test($("adonut").textContent.replace(/\s+/g, " ")), "비율 75% — 실제: " + $("adonut").textContent);
  assert(/4,000,000/.test($("adonut").textContent), "가운데는 순자산 합계");
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  assert($("todayRow").style.display !== "none", "내역 탭에는 오늘 카드가 보여야 함");

  /* 달 선택 휠: 위쪽 "년 월" → 휠에서 고르고 완료 → 그 달 화면 */
  $("ym").click(); await wait(30);
  assert($("ymSheet").classList.contains("open"), "년월을 누르면 달 선택 시트");
  assert($("wYear").querySelector(".on") && $("wMonth").querySelector(".on").textContent === (now.getMonth() + 1) + "월", "현재 달이 선택돼 있어야 함");
  const prevM = now.getMonth() === 0 ? 12 : now.getMonth(), prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  [...$("wYear").children].find((c) => c.textContent === prevY + "년").click();
  [...$("wMonth").children].find((c) => c.textContent === prevM + "월").click();
  $("ymOk").click(); await wait(80);
  assert(!$("ymSheet").classList.contains("open"), "완료 후 시트가 닫혀야 함");
  assert($("ym").textContent === prevY + "년 " + prevM + "월", "지난달로 바뀌어야 함 — 실제: " + $("ym").textContent);
  assert($("todayRow").style.display === "none", "지난달 화면엔 오늘 카드가 없어야 함");
  d.querySelector('[data-tab="budget"]').click(); await wait(20);
  assert(num($("btVal").textContent) === 600000, "지난달을 봐도 총 예산은 그대로 600,000 — 실제: " + $("btVal").textContent);
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  $("ym").click(); await wait(30);
  assert(w.__back() === true && !$("ymSheet").classList.contains("open"), "뒤로가기로 달 선택 시트가 닫혀야 함");
  $("ym").click(); await wait(30);
  $("ymToday").click(); await wait(80);
  assert($("ym").textContent === now.getFullYear() + "년 " + (now.getMonth() + 1) + "월", "'이번 달' 로 돌아와야 함");
  assert(!$("calScreen"), "전체 화면 달력은 없어야 함");

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
  $("prev").click(); await wait(80); $("next").click(); await wait(80);
  assert($("txCatSel").value === "" && rows() === total, "달을 갔다 오면 없던 카테고리 필터는 풀려야 함 — 실제: " + $("txCatSel").value + "/" + rows());

  /* 통계: 일별·히트맵·요일별 */
  d.querySelector('[data-tab="stat"]').click(); await wait(30);
  const st = $("view").textContent;
  assert(/일별 지출/.test(st) && /지출 히트맵/.test(st) && /요일별 평균 지출/.test(st), "통계에 일별·히트맵·요일별 섹션");
  assert(d.querySelectorAll(".heat").length === n, "히트맵 칸이 이달 날짜 수만큼 — 실제: " + d.querySelectorAll(".heat").length);
  assert(d.querySelectorAll(".bars.dense div").length === n, "일별 막대가 날짜 수만큼");
  assert(/가장 많이 쓴 날/.test(st), "가장 많이 쓴 날 표시");

  /* 영수증 스캔: 내장 키로 사진 → Gemini → 대기열 */
  d.querySelector('[data-tab="tx"]').click(); await wait(20);
  $("qfab").click(); await wait(30);
  assert($("ibScan"), "대기열 화면에 영수증 스캔 버튼");

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

  /* 메뉴(바 3개) → 글씨 크기: 루트 zoom 으로 적용되고 저장된다 */
  assert(b.$("themeBtn").getAttribute("aria-label") === "메뉴", "왼쪽 위 버튼은 메뉴");
  b.$("themeBtn").click(); await wait(20);
  b.$("fontSeg").querySelector('[data-v="1.2"]').click();
  assert(b.d.documentElement.style.zoom === "1.2", "더 크게 → zoom 1.2 — 실제: " + b.d.documentElement.style.zoom);
  assert(b.d.documentElement.style.getPropertyValue("--zoom") === "1.2", "인셋 보정용 --zoom 도 같이");
  assert(b.w.localStorage.getItem("gb:fontScale") === "1.2", "글씨 크기가 저장돼야 함");
  b.$("fontSeg").querySelector('[data-v="1"]').click();
  assert(b.d.documentElement.style.zoom === "" && !b.w.localStorage.getItem("gb:fontScale"), "기본으로 돌리면 저장값 삭제");
  b.$("tDone").click();

  /* 옛 APK(브리지에 reminders 없음)에서는 안내만 */
  const c = boot({ android: { setBars: () => {} } });
  await wait(300);
  c.$("themeBtn").click(); await wait(30);
  assert(/새 APK 설치 필요/.test(c.$("setRemind").textContent), "브리지가 없으면 새 APK 안내");
  c.$("tDone").click(); await wait(20);
  c.$("qfab").click(); await wait(30);
  c.$("ibScan").click(); await wait(30);
  assert(/AI 키가 없습니다/.test(c.$("toast").textContent), "키 없는 빌드에서 영수증 스캔은 안내만 — 실제: " + c.$("toast").textContent);
  assert(!c.$("themeSheet").classList.contains("open"), "설정 시트를 열지 않아야 함");
};
