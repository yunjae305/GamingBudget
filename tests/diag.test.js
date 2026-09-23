/* 알림 감지 진단 — 화면 파서가 버린 알림이 기록에 남고, 진단 화면이 상태를 보여 준다 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const t0 = new Date(2026, 8, 21, 13, 5).getTime();
  const dropped = [];
  const log = [
    { pkg: "com.shcard.smartpay", time: t0, text: "신한카드 승인\n12,000원 일시불\n스타벅스 강남점", res: "대기열" },
    { pkg: "com.shcard.smartpay", time: t0, text: "(광고)신한카드 5,000원 캐시백 결제 이벤트", res: "광고·안내" },
  ];
  const { d, $, errors } = boot({
    pending: [
      { pkg: "com.shcard.smartpay", time: t0, text: "신한카드 승인\n12,000원 일시불\n스타벅스 강남점" },
      { pkg: "com.shcard.smartpay", time: t0, text: "신한카드 승인취소 12,000원 스타벅스" },
    ],
    android: {
      notifLog: () => JSON.stringify(log),
      notifStats: () => JSON.stringify({ sawAt: t0, sawN: 42, queued: 0 }),
      notifConnected: () => true,
      clearNotifLog: () => { log.length = 0; },
      rescanNotifs: () => {},
      noteDropped: (pkg, text, time, why) => { dropped.push({ pkg, text, time, why }); },
    },
  });
  await wait(1200);

  // 승인취소는 대기열에 넣지 않지만, 조용히 사라지지 않고 기록으로 남아야 한다
  assert(dropped.length === 1, "버린 알림 1건이 기록돼야 함 — 실제: " + dropped.length);
  assert(/승인취소/.test(dropped[0].text), "버린 알림의 원문이 그대로 넘어가야 함");
  assert(dropped[0].why === "취소·실패·안내 문구", "버린 이유 — 실제: " + dropped[0].why);

  $("themeBtn").click();
  await wait(100);
  assert($("setDiagRow"), "설정에 감지 기록 보기 줄이 있어야 함");

  $("setDiagRow").click();
  await wait(100);
  assert($("diagScreen").classList.contains("open"), "진단 화면이 열려야 함");

  const rows = [...d.querySelectorAll("#dgList .dgrow")];
  assert(rows.length === 2, "기록 2건이 보여야 함 — 실제: " + rows.length);
  assert(/광고·안내/.test(rows[0].textContent), "최근 것이 위로 와야 함");
  assert(rows[0].querySelector(".res").classList.contains("no"), "걸러진 건 경고 배지");
  assert(rows[1].querySelector(".res").classList.contains("ok"), "대기열에 들어간 건 정상 배지");
  assert(/연결됨/.test($("dgBody").textContent), "감지 서비스 상태가 보여야 함");

  $("dgClose").click();
  await wait(100);
  assert(!$("diagScreen").classList.contains("open"), "닫기로 진단 화면이 닫혀야 함");

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
