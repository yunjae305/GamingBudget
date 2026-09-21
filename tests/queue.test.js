/* 결제 알림 → 대기열 → 일괄 저장 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const t0 = new Date(2026, 8, 20, 13, 5).getTime();
  const t1 = new Date(2026, 8, 21, 9, 12).getTime();
  const { d, $, w, errors } = boot({
    pending: [
      { pkg: "com.shcard.smartpay", time: t0, text: "신한카드 승인\n신한카드(1234)승인 홍*동\n12,000원 일시불\n09/20 13:05 스타벅스 강남점\n누적 345,000원" },
      { pkg: "com.samsung.android.messaging", time: t1, text: "[Web발신]\nKB국민체크(5678) 출금 4,500원 09/21 09:12 GS25 역삼점 잔액 120,300원" },
      { pkg: "com.kakao.talk", time: t1, text: "카카오페이\n결제 완료 38,900원\n배달의민족" },
      { pkg: "com.nhn.android.search", time: t1, text: "네이버페이 충전 50,000원 출금" },
      { pkg: "com.shcard.smartpay", time: t1, text: "신한카드 승인취소 12,000원 스타벅스" },
    ],
  });
  await wait(1200);

  assert($("qfab").classList.contains("show"), "내역 탭에 대기열 버튼이 보여야 함");
  assert($("qbadge").textContent === "4", "배지 숫자 4 (승인취소 제외) — 실제: " + $("qbadge").textContent);

  $("qfab").click();
  await wait(100);
  assert($("inboxSheet").classList.contains("open"), "대기열 화면이 열려야 함");

  const rows = [...d.querySelectorAll("#ibList .ibrow")].map((r) => ({
    name: r.querySelector(".body b").textContent,
    cat: r.querySelector(".body span").textContent,
    amt: r.querySelector(".amt").textContent,
  }));
  const by = (n) => rows.find((r) => r.name === n);
  assert(by("스타벅스 강남점") && by("스타벅스 강남점").cat === "카페/디저트", "스타벅스 → 카페/디저트");
  assert(by("GS25 역삼점") && by("GS25 역삼점").cat === "생활/편의", "GS25 → 생활/편의");
  assert(by("배달의민족") && by("배달의민족").cat === "식비", "배달의민족 → 식비");
  assert(by("네이버페이 충전"), "한 줄 알림에서도 가게 이름을 뽑아야 함");

  $("ibSave").click();
  await wait(700);
  assert($("qbadge").style.display === "none", "저장 후 배지가 사라져야 함");

  d.querySelector('[data-tab="stat"]').click();
  assert(!$("qfab").classList.contains("show"), "다른 탭에서는 버튼이 숨겨져야 함");

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
