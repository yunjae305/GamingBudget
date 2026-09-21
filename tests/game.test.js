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

  assert($("gDetail").classList.contains("open"), "저장 후 게임 상세로 돌아와야 함");
  const row = $("gdBody").querySelector(".txrow");
  assert(row && row.textContent.includes("9,600원") && row.textContent.includes("할인"), "할인 기록 표시");

  btn($("gdBody"), "결제 기록 추가").click();
  await wait(30);
  $("pkBody").querySelector(".card .row").click(); // 직접 입력
  await wait(30);
  input($("gAmt"), "3000");
  $("gName").value = "이벤트 패키지";
  $("gSave").click();
  await wait(600);
  assert($("gdBody").querySelector(".big-amt").textContent === "12,600원", "합계 12,600원");

  btn($("gdBody"), "결제 기록 추가").click();
  await wait(30);
  $("pkNew").click();
  await wait(30);
  input($("pAmt"), "4400");
  $("pName").value = "테스트 상자";
  $("pSave").click();
  await wait(600);
  assert($("pkBody").textContent.includes("테스트 상자"), "새 제품이 목록에 보여야 함");

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
