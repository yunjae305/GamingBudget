/* 통계 탭 AI 도우미 — 내장 키 없음/있음, 호출, 캐시, 백업, 오류 */
const { boot, wait, assert } = require("./helpers");

module.exports = async function () {
  /* 키가 없는 빌드: 안내만, 설정에 입력칸 없음 */
  const n = boot({ android: { setBars: () => {} } });
  n.d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(/AI 키가 없습니다/.test(n.$("aiBubble").textContent), "키 없는 빌드 안내 — 실제: " + n.$("aiBubble").textContent);
  assert(!n.$("aiKeyInput"), "설정에 키 입력칸이 없어야 함");
  n.$("themeBtn").click(); await wait(30);
  assert(/AI 키가 없습니다/.test(n.$("aiKeyNote").textContent), "설정 안내문도 키 없음");
  assert(n.errors.length === 0, "스크립트 오류: " + n.errors.join(" / "));

  /* 내장 키(.env → BuildConfig → Android.builtinAiKey): 바로 생성 가능 */
  const { d, $, w, errors } = boot({ android: { builtinAiKey: () => "builtin-key-xyz", saveFile: () => {}, setBars: () => {} } });
  $("themeBtn").click(); await wait(30);
  $("aiNameInput").value = "테스트루나"; $("aiNameInput").dispatchEvent(new w.Event("change"));
  $("tDone").click(); await wait(30);
  d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(/테스트루나/.test($("aiBubble").textContent), "설정한 이름이 보여야 함");
  assert($("aiGoBtn"), "생성하기 버튼이 있어야 함");

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
  assert(called.url.includes("builtin-key-xyz"), "내장 키로 호출해야 함 — 실제: " + called.url);
  assert(!/스타벅스|GS25|배달의민족/.test(JSON.stringify(called.body)), "가게 이름 같은 개별 거래 내용은 보내지 않아야 함");
  assert(/카페 지출이 많았어요/.test($("aiBubble").textContent), "결과 코멘트가 보여야 함");
  assert(/도시락/.test($("aiBubble").textContent), "다음 달 조언이 보여야 함");
  assert($("aiRegenBtn"), "다시 생성 버튼이 있어야 함");

  called = null;
  d.querySelector('[data-tab="budget"]').click();
  d.querySelector('[data-tab="stat"]').click();
  await wait(50);
  assert(/카페 지출이 많았어요/.test($("aiBubble").textContent), "캐시된 결과가 다시 보여야 함");
  assert(called === null, "캐시가 있으면 다시 요청하지 않아야 함");

  /* 백업에 키가 새면 안 되고, 생성된 조언은 남는다 */
  let saved = null;
  w.Android.saveFile = (name, json) => { saved = json; };
  $("themeBtn").click(); await wait(30);
  $("bkExport").click();
  assert(saved && !saved.includes("builtin-key-xyz"), "백업에 내장 키가 새면 안 됨");
  assert(saved && /gb:ai\/note\//.test(saved), "생성된 조언은 백업에 남아야 함");
  $("tDone").click();

  w.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  $("aiRegenBtn").click();
  await wait(50);
  assert(/키를 확인/.test($("aiBubble").textContent), "403이면 키 확인 안내 — 실제: " + $("aiBubble").textContent);
  assert($("aiRetryBtn"), "다시 시도 버튼이 있어야 함");
  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
