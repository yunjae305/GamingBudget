/* 백업: 저장 → 네이티브 미러, 설정에서 파일 내보내기, 새 설치에서 미러 자동 복원 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  let mirrored = null, saved = null;
  const t = new Date(2026, 8, 21, 12, 0).getTime();
  const a = boot({
    pending: [{ pkg: "com.shcard.smartpay", time: t, text: "신한카드 승인\n12,000원 일시불\n09/21 12:00 스타벅스" }],
    android: {
      mirror: (json) => { mirrored = json; },
      saveFile: (name, json) => { saved = { name, json }; },
      setBars: () => {},
    },
  });
  await wait(1200);
  a.$("qfab").click();
  await wait(100);
  a.$("ibSave").click();
  await wait(3500); // save 400ms + mirror 2500ms
  assert(mirrored, "저장 뒤 네이티브 미러가 호출돼야 함");
  const m = JSON.parse(mirrored);
  assert(m.app === "ledger" && Object.keys(m.data).some((k) => k.startsWith("gb:months/")), "미러에 월 기록이 있어야 함");

  a.$("themeBtn").click();
  await wait(50);
  assert(a.$("themeSheet").classList.contains("open"), "설정 시트가 열려야 함");
  assert(/한 적 없음/.test(a.$("bkLast").textContent), "백업 전에는 '한 적 없음' — 실제: " + a.$("bkLast").textContent);
  a.$("bkExport").click();
  assert(saved && /^가계부-백업-\d{4}-\d{2}-\d{2}\.json$/.test(saved.name), "파일 이름 형식 — 실제: " + (saved && saved.name));
  const f = JSON.parse(saved.json);
  assert(f.app === "ledger" && f.data["gb:months/2026-09"], "내보낸 파일에 2026-09 기록이 있어야 함");
  assert(/오늘/.test(a.$("bkLast").textContent), "내보낸 뒤 '오늘' 표시");
  assert(a.errors.length === 0, "스크립트 오류: " + a.errors.join(" / "));

  /* 새 설치: 기록이 비어 있고 미러가 있으면 되살린다 */
  const b = boot({ android: { readMirror: () => mirrored, mirror: () => {}, setBars: () => {} } });
  await wait(300);
  assert(b.w.localStorage.getItem("gb:months/2026-09"), "미러에서 월 기록이 복원돼야 함");
  assert(/되살렸습니다/.test(b.$("toast").textContent), "복원 안내 토스트");
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));

};
