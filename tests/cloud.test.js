/* 클라우드 동기화 (Supabase REST 흉내): 첫 실행 Google 로그인 화면 → 올리기/받기/묻기, 저장 뒤 자동 올리기,
   브라우저 딥링크 대체 경로, 로그아웃, 백업 파일에 토큰 없음 */
const { boot, wait, assert } = require("./helpers");

/* Supabase 흉내. row 는 사용자 한 명의 snapshots 행. */
function makeServer() {
  const st = { row: null, calls: [] };
  st.fetch = async (url, opts) => {
    opts = opts || {};
    const u = String(url), body = opts.body ? JSON.parse(opts.body) : null;
    st.calls.push({ url: u, method: opts.method || "GET", body, headers: opts.headers || {} });
    const res = (status, obj) => ({ ok: status < 300, status, text: async () => (obj == null ? "" : JSON.stringify(obj)) });
    if (!u.startsWith("https://jxjmrxusumcbfgwzqdrd.supabase.co/")) return res(404, { msg: "wrong host" });
    if (!opts.headers || opts.headers.apikey !== "sb_publishable_OuQjHw8KcM-KeEqY_Gmq6w_qrhA7XBY") return res(401, { msg: "no apikey" });
    if (u.includes("/auth/v1/token?grant_type=id_token")) {
      if (body.provider !== "google" || !body.id_token) return res(400, { code: 400, error_code: "validation_failed", msg: "bad" });
      if (body.id_token === "bad") return res(400, { code: 400, error_code: "bad_id_token", msg: "Invalid id token" });
      if (!body.nonce) return res(400, { code: 400, error_code: "bad_id_token", msg: "Passed nonce and nonce in id_token should either both exist or not." });
      return res(200, { access_token: "at-" + body.id_token, refresh_token: "rt1", expires_in: 3600, user: { id: "uid-1", email: "me@gmail.com" } });
    }
    if (u.includes("/auth/v1/user")) return res(200, { id: "uid-1", email: "me@gmail.com" });
    if (u.includes("/auth/v1/logout")) return res(204, null);
    if (u.includes("/rest/v1/snapshots")) {
      if (!/^Bearer /.test(opts.headers.Authorization || "")) return res(401, { msg: "no token" });
      if (opts.method === "POST") { st.row = { data: body.data, at: body.at }; return res(201, null); }
      return res(200, st.row ? [st.row] : []);
    }
    return res(404, { msg: "nope" });
  };
  st.posts = () => st.calls.filter((c) => c.method === "POST" && c.url.includes("/rest/v1/snapshots"));
  return st;
}

/* 앱 브리지 흉내: 계정 선택창은 띄웠다고만 하고, 결과는 테스트가 __googleToken 으로 넣는다 */
function app(extra) {
  const st = { google: 0 };
  st.b = boot({ android: Object.assign({
    setBars: () => {}, takePending: () => "[]", hasNotifAccess: () => true,
    googleSignIn: () => { st.google++; return true; },
  }, extra || {}) });
  return st;
}

module.exports = async function () {
  const srv = makeServer();
  const addTx = async (s, amt, memo) => { s.$("add").click(); await wait(30); s.$("fAmt").value = String(amt); s.$("fMemo").value = memo || ""; s.$("fSave").click(); await wait(30); };
  const loginOpen = (s) => s.$("loginScreen").classList.contains("open");

  /* 1) 첫 실행: 로그인 화면이 덮고 있다 → Google 버튼 → 취소 → 다시 → 토큰 → 로그인. 서버가 비었으니 폰 기록을 올린다 */
  const A = app(), a = A.b;
  a.w.fetch = srv.fetch;
  await wait(300);
  assert(loginOpen(a), "앱에서 로그인 전에는 로그인 화면이 열려 있어야 함");
  await addTx(a, 12000, "커피"); // 화면 뒤의 앱은 살아 있다 (테스트에서만 가능)
  await wait(500);
  a.$("loginGoogle").click(); await wait(20);
  assert(A.google === 1 && a.$("loginGoogle").disabled, "버튼 → 네이티브 googleSignIn 호출, 버튼 잠금");
  a.w.__googleFail("cancelled"); await wait(20);
  assert(!a.$("loginGoogle").disabled && /취소/.test(a.$("loginNote").textContent), "취소하면 버튼이 풀리고 안내 — 실제: " + a.$("loginNote").textContent);
  assert(loginOpen(a) && !a.w.localStorage.getItem("gb:cloud/session"), "취소 뒤에도 로그인 화면·세션 없음");
  a.$("loginGoogle").click(); await wait(20);
  await a.w.__googleToken("bad", "nonce-x"); await wait(50);
  assert(/로그인 실패/.test(a.$("loginNote").textContent) && loginOpen(a), "서버가 토큰을 거부하면 실패 안내 — 실제: " + a.$("loginNote").textContent);
  a.$("loginGoogle").click(); await wait(20);
  await a.w.__googleToken("tok1", "nonce-1"); await wait(200);
  assert(!loginOpen(a), "로그인되면 로그인 화면이 닫혀야 함");
  const tokCall = srv.calls.find((c) => c.url.includes("grant_type=id_token") && c.body.id_token === "tok1");
  assert(tokCall && tokCall.body.provider === "google" && tokCall.body.nonce === "nonce-1", "id_token + nonce 원문을 Supabase 에 보내야 함");
  const sess = JSON.parse(a.w.localStorage.getItem("gb:cloud/session"));
  assert(sess.uid === "uid-1" && sess.email === "me@gmail.com" && sess.access_token === "at-tok1", "세션 저장 — 실제: " + JSON.stringify(sess));
  const post = srv.posts()[0];
  assert(post, "서버가 비어 있으면 폰 기록을 올려야 함");
  assert(post.headers.Authorization === "Bearer at-tok1" && /merge-duplicates/.test(post.headers.Prefer), "토큰 헤더 + upsert");
  assert(post.body.user_id === "uid-1" && post.body.data.app === "ledger" && post.body.at === post.body.data.at, "본인 user_id 로 미러 JSON 한 벌");
  const keys = Object.keys(post.body.data.data);
  assert(keys.some((k) => k.startsWith("gb:months/")) && !keys.some((k) => k.startsWith("gb:cloud/")), "기록은 포함, 세션(gb:cloud/*)은 제외 — " + keys.join(","));
  assert(a.w.localStorage.getItem("gb:cloud/at") === post.body.at, "올린 시각을 기억");
  a.$("themeBtn").click(); await wait(30);
  assert(a.$("clLogout") && a.$("clSync") && a.$("cloudCard").textContent.includes("me@gmail.com"), "메뉴에 계정·동기화·로그아웃 — 실제: " + a.$("cloudCard").textContent);
  assert(!a.$("clEmail"), "이메일·비밀번호 입력은 없어야 함");
  a.$("tDone").click(); await wait(20);

  /* 저장하면 몇 초 뒤 자동으로 다시 올라간다 (미러와 같은 타이밍) */
  const n0 = srv.posts().length;
  await addTx(a, 3000, "버스");
  await wait(4800);
  assert(srv.posts().length === n0 + 1, "저장 뒤 자동으로 한 번 더 올려야 함 — " + n0 + " → " + srv.posts().length);
  assert(JSON.stringify(srv.posts()[srv.posts().length - 1].body.data.data).includes("버스"), "새 기록이 포함돼야 함");
  assert(a.errors.length === 0, "스크립트 오류: " + a.errors.join(" / "));

  /* 2) 새 폰(기록 없음)에서 로그인 → 서버 기록을 받는다 */
  const b = app().b;
  b.w.fetch = srv.fetch;
  await wait(300);
  assert(loginOpen(b), "새 폰도 로그인 화면부터");
  b.$("loginGoogle").click(); await b.w.__googleToken("tok2", "nonce-2"); await wait(200);
  assert(!/받았|로그인했/.test(b.$("toast").textContent), "폰이 비어 있으면 서버 기록을 조용히 받음 — 실제: " + b.$("toast").textContent);
  const bm = Object.keys(b.w.localStorage).filter((k) => k.startsWith("gb:months/"));
  assert(bm.length === 1 && b.w.localStorage.getItem(bm[0]).includes("버스"), "서버의 기록이 localStorage 에 들어와야 함");
  assert(b.w.localStorage.getItem("gb:cloud/session"), "받은 뒤에도 세션은 남아야 함 (restoreAll 이 gb:cloud/* 는 안 지움)");
  assert(b.w.localStorage.getItem("gb:cloud/at") === srv.row.at, "받은 시각 기억");
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));

  /* 3) 폰에도 서버에도 기록이 있으면 묻는다 → "서버 기록 받기" */
  const c = app().b;
  c.w.fetch = srv.fetch;
  await wait(300);
  await addTx(c, 99000, "다른폰");
  await wait(500);
  c.$("loginGoogle").click(); await c.w.__googleToken("tok3", "nonce-3"); await wait(200);
  assert(c.$("cloudAlert").classList.contains("open"), "둘 다 있으면 어느 쪽을 쓸지 물어야 함");
  assert(/서버에 .*기록이 있습니다/.test(c.$("cloudAlertMsg").textContent), "안내 문구 — 실제: " + c.$("cloudAlertMsg").textContent);
  const before = srv.posts().length;
  c.$("cloudPullBtn").click(); await wait(100);
  assert(!c.$("cloudAlert").classList.contains("open"), "고르면 닫힘");
  const cm = Object.keys(c.w.localStorage).filter((k) => k.startsWith("gb:months/"));
  assert(cm.every((k) => !c.w.localStorage.getItem(k).includes("다른폰")) && cm.some((k) => c.w.localStorage.getItem(k).includes("버스")), "서버 기록으로 덮어써야 함");
  assert(srv.posts().length === before, "받기를 골랐으면 올리지 않음");

  /* 4) 옛 APK(googleSignIn 없음)·클라이언트 ID 없음(false): 브라우저 방식 → 딥링크 __oauth 로 돌아온다. 오류 딥링크는 안내만 */
  const g = app({ googleSignIn: () => false }).b;
  g.w.fetch = srv.fetch;
  await wait(300);
  g.$("loginGoogle").click(); await wait(20);
  assert(/브라우저/.test(g.$("loginNote").textContent) && !g.$("loginGoogle").disabled, "계정 선택창을 못 띄우면 브라우저 안내 — 실제: " + g.$("loginNote").textContent);
  g.$("loginBrowser").click(); await wait(20);
  assert(/브라우저에서 로그인한 뒤/.test(g.$("loginNote").textContent), "로그인 화면의 '브라우저로 로그인' 버튼 — 실제: " + g.$("loginNote").textContent);
  await g.w.__oauth("gamingbudget://login#error=access_denied&error_description=cancelled"); await wait(50);
  assert(/로그인 실패/.test(g.$("toast").textContent) && loginOpen(g), "오류 딥링크는 안내만, 로그인 화면 유지");
  await g.w.__oauth("gamingbudget://login#access_token=at2&expires_in=3600&refresh_token=rt2&token_type=bearer&type=signup"); await wait(200);
  const gs = JSON.parse(g.w.localStorage.getItem("gb:cloud/session"));
  assert(gs.access_token === "at2" && gs.refresh_token === "rt2" && gs.uid === "uid-1" && gs.email === "me@gmail.com", "딥링크 토큰 → 세션 + /user 로 이메일 — 실제: " + JSON.stringify(gs));
  assert(!loginOpen(g), "딥링크로 로그인돼도 로그인 화면이 닫혀야 함");

  /* 로그아웃: 서버에 알리고 세션만 지운다. 기록은 남고, 앱에서는 다시 로그인 화면 */
  g.$("themeBtn").click(); await wait(30);
  const gm = Object.keys(g.w.localStorage).filter((k) => k.startsWith("gb:months/")).length;
  g.$("clLogout").click(); await wait(100);
  assert(!g.w.localStorage.getItem("gb:cloud/session") && loginOpen(g), "로그아웃 → 세션 삭제, 로그인 화면 다시");
  assert(srv.calls.some((x) => x.url.includes("/auth/v1/logout") && x.headers.Authorization === "Bearer at2"), "서버 logout 호출");
  assert(Object.keys(g.w.localStorage).filter((k) => k.startsWith("gb:months/")).length === gm, "기록은 그대로");
  assert(g.errors.length === 0, "스크립트 오류: " + g.errors.join(" / "));

  /* 5) 브라우저 미리보기(브리지 없음): 로그인 화면 없이 쓰고, 메뉴에 Google 행만 */
  const p = boot();
  await wait(300);
  assert(!loginOpen(p), "브리지가 없으면 로그인 화면을 띄우지 않음");
  p.$("themeBtn").click(); await wait(30);
  assert(p.$("clGoogle") && !p.$("clEmail"), "메뉴에는 Google 로그인 행만");
  assert(p.errors.length === 0, "스크립트 오류: " + p.errors.join(" / "));

  /* 백업 파일 내보내기에도 세션은 안 들어간다 */
  let saved = null;
  const e = app({ saveFile: (n, content) => { saved = content; } }).b;
  e.w.fetch = srv.fetch;
  await wait(300);
  e.$("loginGoogle").click(); await e.w.__googleToken("tok5", "nonce-5"); await wait(200);
  e.$("themeBtn").click(); await wait(30);
  e.$("bkExport").click(); await wait(50);
  assert(saved && !saved.includes("gb:cloud/") && !saved.includes("at-tok5"), "백업 파일에 세션·토큰이 없어야 함");
};
