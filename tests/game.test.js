/* 게임: 제품 선택 → 할인 결제 기록 → 직접 입력 → 새 제품 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const { d, $, w, errors } = boot();
  await wait(500);
  const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input")); };
  const btn = (root, text) => [...root.querySelectorAll("button.btn")].find((b) => b.textContent === text);

  d.querySelector('[data-tab="game"]').click();
  await wait(50);
  const games = [...d.querySelectorAll("#glist .card > button.row")];
  assert(games.length >= 2, "명조·젠레스 존 제로가 기본으로 있어야 함");
  games[0].click();
  await wait(50);
  assert($("gdTitle").textContent === "명조", "첫 게임은 명조");

  btn($("gdBody"), "결제 기록 추가").click();
  await wait(50);
  assert($("pickScreen").classList.contains("open"), "제품 선택 화면");
  const groups = [...$("pkBody").querySelectorAll(".hdr")].map((h) => h.textContent);
  assert(groups.join(",") === "월정액,패스,패키지,달빛 충전", "명조 카테고리 순서 — 실제: " + groups.join(","));

  $("pkBody").querySelectorAll(".ibrow .body")[1].click(); // 유니버스 채널 12,000
  await wait(50);
  assert($("gAmt").value === "12,000원", "정가로 채워져야 함 — 실제: " + $("gAmt").value);
  input($("gAmt"), "9600");
  assert($("gHint").textContent.includes("2,400원 할인"), "할인액 표시 — 실제: " + $("gHint").textContent);
  $("gSave").click();
  await wait(600);

  /* 새 기록을 저장하면 게임 탭으로 돌아온다 — 상세 화면으로 가지 않는다 (사용자 요청 2026-09-30) */
  assert(!$("gDetail").classList.contains("open") && !$("pickScreen").classList.contains("open"), "저장 후 상세·제품 화면은 닫혀야 함");
  const openGame = async (name) => {
    [...d.querySelectorAll("#glist .card > button.row")].find((r) => r.textContent.includes(name)).click();
    await wait(80);
  };
  await openGame("명조");
  const row = $("gdBody").querySelector(".txrow");
  assert(row && row.textContent.includes("9,600원") && row.textContent.includes("할인"), "할인 기록 표시");
  assert(!/게임 이름|이 게임 한도/.test($("gdBody").textContent), "상세 화면에 설정(이름·한도)은 없어야 함");

  btn($("gdBody"), "결제 기록 추가").click();
  await wait(30);
  $("pkBody").querySelector(".card .row").click(); // 직접 입력
  await wait(30);
  $("gCancel").click();
  await wait(30);
  assert($("pickScreen").classList.contains("open"), "새 기록 취소는 제품 선택으로 돌아감");
  $("pkBody").querySelector(".card .row").click();
  await wait(30);
  input($("gAmt"), "3000");
  $("gName").value = "이벤트 패키지";
  $("gSave").click();
  await wait(600);
  await openGame("명조");
  assert($("gdAll").textContent === "12,600원" && $("gdMonth").textContent === "12,600원", "총액·이번 달 12,600원 — 실제: " + $("gdAll").textContent + " / " + $("gdMonth").textContent);

  btn($("gdBody"), "결제 기록 추가").click();
  await wait(30);
  $("pkNew").click();
  await wait(30);
  input($("pAmt"), "4400");
  $("pName").value = "테스트 상자";
  $("pSave").click();
  await wait(600);
  assert($("pkBody").textContent.includes("테스트 상자"), "새 제품이 목록에 보여야 함");

  /* 지난달 기록: 게임 탭 총액과 상세 총액에 합쳐지고, 상세에서 지난달로 이동해 금액·기록을 본다 */
  $("pkBody").querySelector(".card .row").click(); // 직접 입력
  await wait(30);
  input($("gAmt"), "5000");
  $("gName").value = "지난달 패키지";
  const cur = $("gDate").value.slice(0, 7);
  const prev = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 2, 1);
  $("gDate").value = prev.getFullYear() + "-" + String(prev.getMonth() + 1).padStart(2, "0") + "-15";
  $("gSave").click();
  await wait(600);
  assert($("gAllTotal").textContent === "17,600원", "게임 탭 지금까지 총액 = 12,600 + 5,000 — 실제: " + $("gAllTotal").textContent);
  assert($("gMonthTotal").textContent === "12,600원", "게임 탭 이번 달 금액 — 실제: " + $("gMonthTotal").textContent);
  assert(!/지난달 대비/.test(d.body.textContent), "지난달 대비 % 지표는 없어야 함");
  const mzRow = [...d.querySelectorAll("#glist .card")].find((c) => c.textContent.includes("명조"));
  assert(mzRow.querySelector(".gAllOf").textContent === "17,600원" && /3건/.test(mzRow.textContent) && /이번 달 12,600원/.test(mzRow.textContent), "게임별 목록은 지금까지 총액·건수, 이번 달은 아래 줄 — 실제: " + mzRow.textContent);
  await openGame("명조");
  assert($("gdAll").textContent === "17,600원", "상세 총액은 모든 달 — 실제: " + $("gdAll").textContent);
  assert($("gdNext").disabled, "이번 달에서 다음 달로는 못 감");
  $("gdPrev").click();
  await wait(80);
  assert($("gdMonth").textContent === "5,000원" && $("gdBody").textContent.includes("지난달 패키지"), "지난달 금액·기록 — 실제: " + $("gdMonth").textContent);

  /* 지난달 기록 수정 → 금액 바꾸면 그 달에 반영, 중복되지 않음. 수정은 상세로 돌아온다 */
  $("gdBody").querySelector(".txrow").click();
  await wait(30);
  input($("gAmt"), "7000");
  $("gSave").click();
  await wait(600);
  assert($("gDetail").classList.contains("open"), "수정 후엔 상세로 돌아옴");
  assert($("gdMonth").textContent === "7,000원" && $("gdBody").querySelectorAll(".txrow").length === 1, "지난달 기록이 고쳐지고 1건 — 실제: " + $("gdMonth").textContent);
  assert($("gdAll").textContent === "19,600원", "총액 갱신 — 실제: " + $("gdAll").textContent);
  $("gdBody").querySelector(".txrow").click();
  await wait(30);
  $("gDel").click();
  await wait(600);
  assert($("gdMonth").textContent === "0원" && $("gdAll").textContent === "12,600원", "지난달 기록 삭제 — 실제: " + $("gdMonth").textContent + " / " + $("gdAll").textContent);
  $("gdClose").click();
  await wait(50);
  assert($("gAllTotal").textContent === "12,600원", "게임 탭 총액도 갱신 — 실제: " + $("gAllTotal").textContent);

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
