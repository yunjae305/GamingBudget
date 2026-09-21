/* 통계 탭 AI 도우미 — 키 없음/입력/호출/캐시/백업 제외/오류 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  const { d, $, w, errors } = boot({ android: { saveFile: () => {}, setBars: () => {} } });

  d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(/AI 키를 넣으면/.test($("aiBubble").textContent), "키 없을 때 안내 문구가 떠야 함");

  // 설정에서 이름·키 입력
  $("themeBtn").click();
  await wait(50);
  const setVal = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new w.Event("change")); };
  setVal("aiNameInput", "테스트루나");
  setVal("aiKeyInput", "test-key-123");
  $("tDone").click();
  await wait(50);

  assert(!/AI 키를 넣으면/.test($("aiBubble").textContent), "키를 넣은 뒤엔 안내가 사라져야 함");
  assert(/테스트루나/.test($("aiBubble").textContent), "설정한 이름이 보여야 함");
  assert($("aiGoBtn"), "생성하기 버튼이 있어야 함");

  // Gemini 응답을 흉내 낸다
  let called = null;
  w.fetch = async (url, opts) => {
    called = { url, body: JSON.parse(opts.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        comment: "이번 달은 카페 지출이 많았어요.",
        advice: "다음 달엔 도시락을 싸보는 건 어때요.",
      }) }] } }] }),
    };
  };
  $("aiGoBtn").click();
  await wait(50);

  assert(called && /generativelanguage\.googleapis\.com/.test(called.url), "Gemini 엔드포인트를 호출해야 함");
  assert(called.url.includes("test-key-123"), "쿼리 파라미터에 키가 담겨야 함 — 실제: " + called.url);
  const sentText = JSON.stringify(called.body);
  assert(!/스타벅스|GS25|배달의민족/.test(sentText), "가게 이름 같은 개별 거래 내용은 보내지 않아야 함");
  assert(/카페 지출이 많았어요/.test($("aiBubble").textContent), "결과 코멘트가 보여야 함");
  assert(/도시락/.test($("aiBubble").textContent), "다음 달 조언이 보여야 함");
  assert($("aiRegenBtn"), "다시 생성 버튼이 있어야 함");

  // 다른 탭 갔다 와도 캐시로 바로 뜨고, 다시 fetch 하지 않는다
  called = null;
  d.querySelector('[data-tab="budget"]').click();
  d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(/카페 지출이 많았어요/.test($("aiBubble").textContent), "캐시된 결과가 다시 보여야 함");
  assert(called === null, "캐시가 있으면 다시 요청하지 않아야 함");

  // 백업 파일에는 키가 빠지고, 생성된 조언 텍스트는 남는다
  let saved = null;
  w.Android.saveFile = (name, json) => { saved = JSON.parse(json); };
  $("themeBtn").click();
  await wait(30);
  $("bkExport").click();
  assert(saved && !("gb:ai/key" in saved.data), "백업 파일에 AI 키가 없어야 함");
  assert(saved && Object.keys(saved.data).some((k) => k.startsWith("gb:ai/note/")), "생성된 조언은 백업에 남아야 함");
  $("tDone").click();

  // 실패 응답: 403 → 키 확인 안내
  w.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  $("aiRegenBtn").click();
  await wait(50);
  assert(/키를 확인/.test($("aiBubble").textContent), "403이면 키 확인 안내 — 실제: " + $("aiBubble").textContent);
  assert($("aiRetryBtn"), "다시 시도 버튼이 있어야 함");

  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));

  /* 빌드 때 박아 넣은 키(.env → BuildConfig → Android.builtinAiKey): 설정에 안 넣어도 바로 생성 가능,
     설정 칸에는 값이 보이지 않고 "내장된 키 사용 중" 안내만 */
  const b = boot({ android: { builtinAiKey: () => "builtin-key-xyz", setBars: () => {} } });
  b.d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(b.$("aiGoBtn"), "내장 키가 있으면 설정 없이 생성 버튼이 떠야 함");
  let url2 = null;
  b.w.fetch = async (url) => { url2 = url; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ comment: "c", advice: "a" }) }] } }] }) }; };
  b.$("aiGoBtn").click();
  await wait(50);
  assert(url2 && url2.includes("builtin-key-xyz"), "내장 키로 호출해야 함");
  b.$("themeBtn").click();
  await wait(30);
  assert(b.$("aiKeyInput").value === "", "내장 키는 설정 칸에 보이면 안 됨");
  assert(/내장된 키/.test(b.$("aiKeyInput").placeholder), "내장 키 사용 중 안내");
  let saved2 = null;
  b.w.Android.saveFile = (n, j) => { saved2 = j; };
  b.$("bkExport").click();
  assert(saved2 && !saved2.includes("builtin-key-xyz"), "백업에 내장 키가 새면 안 됨");
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));
};
