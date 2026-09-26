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
  n.$("tDone").click(); await wait(20);
  n.d.querySelector('[data-tab="game"]').click(); await wait(30);
  n.$("gchatBtn").click(); await wait(20);
  assert(!n.$("gameChatScreen").classList.contains("open") && /AI 키가 없습니다/.test(n.$("toast").textContent), "키 없는 빌드에서 과금 상담은 안내만");
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

  /* 게임 탭 과금 상담 채팅: 질문 → 게임 데이터를 붙여 Gemini → 답변 말풍선, 이어지는 대화는 기록을 같이 보냄 */
  d.querySelector('[data-tab="game"]').click(); await wait(30);
  assert($("gchatBtn"), "게임 탭에 물어보기 버튼");
  $("gchatBtn").click(); await wait(30);
  assert($("gameChatScreen").classList.contains("open"), "과금 상담 화면이 열려야 함");
  assert(/과금 계획/.test($("chatBody").textContent), "첫 인사 말풍선");
  let sent2 = null;
  w.fetch = async (url, opts) => {
    sent2 = { url, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "월정액 하나 정도는 한도 안이에요." }] } }] }) };
  };
  $("chatIn").value = "이번 달 월정액 사도 돼?";
  $("chatIn").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter" }));
  await wait(60);
  assert(sent2 && sent2.url.includes("builtin-key-xyz"), "내장 키로 호출");
  const sys = sent2.body.systemInstruction.parts[0].text;
  assert(/게임 지출 합계/.test(sys) && /월 총 한도/.test(sys) && /상품 가격표/.test(sys), "게임 지출·한도·가격표 데이터가 붙어야 함");
  assert(sent2.body.contents.length === 1 && sent2.body.contents[0].role === "user", "첫 질문은 contents 1개");
  assert(/월정액 하나 정도는/.test($("chatBody").textContent), "답변 말풍선 — 실제: " + $("chatBody").textContent);
  assert(d.querySelectorAll("#chatBody .msg.me").length === 1 && $("chatIn").value === "", "내 말풍선 1개, 입력칸 비움");
  $("chatIn").value = "그럼 패스는?"; $("chatSend").click(); await wait(60);
  assert(sent2.body.contents.length === 3 && sent2.body.contents[1].role === "model", "두 번째 질문은 앞 대화까지 같이 — 실제: " + sent2.body.contents.length);
  assert(w.localStorage.getItem("gb:ai/gchat") && JSON.parse(w.localStorage.getItem("gb:ai/gchat")).length === 4, "대화가 저장돼야 함");
  assert(w.__back() === true && !$("gameChatScreen").classList.contains("open"), "뒤로가기로 닫힘");
  $("gchatBtn").click(); await wait(30);
  assert(d.querySelectorAll("#chatBody .msg.me").length === 2, "다시 열면 대화가 남아 있어야 함");
  $("chatClear").click(); await wait(10);
  assert(d.querySelectorAll("#chatBody .msg.me").length === 0, "지우기로 비워짐");
  $("chatClose").click();
  assert(errors.length === 0, "스크립트 오류: " + errors.join(" / "));
};
