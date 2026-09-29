/* 클라우드 동기화 (Supabase REST 흉내): 로그인 → 올리기/받기/묻기, 저장 뒤 자동 올리기, Google 딥링크, 로그아웃 */
const { boot, wait, assert } = require("./helpers");

/* Supabase 흉내. server 는 사용자 한 명의 snapshots 행. */
function makeServer() {
  const st = { row: null, calls: [] };
  st.fetch = async (url, opts) => {
    opts = opts || {};
    const u = String(url), body = opts.body ? JSON.parse(opts.body) : null;
    st.calls.push({ url: u, method: opts.method || "GET", body, headers: opts.headers || {} });
    const res = (status, obj) => ({ ok: status < 300, status, text: async () => (obj == null ? "" : JSON.stringify(obj)) });
    if (!u.startsWith("https://jxjmrxusumcbfgwzqdrd.supabase.co/")) return res(404, { msg: "wrong host" });
    if (!opts.headers || opts.headers.apikey !== "sb_publishable_OuQjHw8KcM-KeEqY_Gmq6w_qrhA7XBY") return res(401, { msg: "no apikey" });
    if (u.includes("/auth/v1/token?grant_type=password")) {
      if (body.password !== "secret1") return res(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return res(200, { access_token: "at1", refresh_token: "rt1", expires_in: 3600, user: { id: "uid-1", email: body.email } });
    }
    if (u.includes("/auth/v1/user")) return res(200, { id: "uid-1", email: "google@example.com" });
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

module.exports = async function () {
  const srv = makeServer();
  const addTx = async (s, amt, memo) => { s.$("add").click(); await wait(30); s.$("fAmt").value = String(amt); s.$("fMemo").value = memo || ""; s.$("fSave").click(); await wait(30); };

  /* 1) 폰에 기록이 있고 서버는 비어 있음 → 로그인하면 폰 기록을 올린다 */
  const a = boot({ android: { setBars: () => {} } });
  a.w.fetch = srv.fetch;
  await wait(300);
  await addTx(a, 12000, "커피");
  await wait(500);
  a.$("themeBtn").click(); await wait(30);
  assert(a.$("clEmail") && a.$("clPw") && a.$("clGoogle"), "로그아웃 상태: 이메일·비밀번호 입력과 Google 버튼");
  a.$("clLogin").click(); await wait(30);
  assert(/이메일과 비밀번호/.test(a.$("toast").textContent), "빈 칸이면 안내");
  a.$("clEmail").value = "me@example.com"; a.$("clPw").value = "wrong"; a.$("clLogin").click(); await wait(100);
  assert(/틀립니다/.test(a.$("toast").textContent), "틀린 비밀번호 → 한국어 안내 — 실제: " + a.$("toast").textContent);
  assert(!a.w.localStorage.getItem("gb:cloud/session"), "실패하면 세션 없음");
  a.$("clPw").value = "secret1"; a.$("clLogin").click(); await wait(200);
  assert(a.$("clLogout") && a.$("clSync"), "로그인되면 동기화·로그아웃 행");
  assert(a.$("cloudCard").textContent.includes("me@example.com"), "계정 이메일 표시 — 실제: " + a.$("cloudCard").textContent);
  assert(/올렸습니다/.test(a.$("toast").textContent), "서버가 비어 있으면 폰 기록을 올리고 알림 — 실제: " + a.$("toast").textContent);
  const post = srv.posts()[0];
  assert(post, "snapshots 에 POST 해야 함");
  assert(post.headers.Authorization === "Bearer at1" && /merge-duplicates/.test(post.headers.Prefer), "토큰 헤더 + upsert");
  assert(post.body.user_id === "uid-1" && post.body.data.app === "ledger" && post.body.at === post.body.data.at, "본인 user_id 로 미러 JSON 한 벌");
  const keys = Object.keys(post.body.data.data);
  assert(keys.some((k) => k.startsWith("gb:months/")) && !keys.some((k) => k.startsWith("gb:cloud/")), "기록은 포함, 세션(gb:cloud/*)은 제외 — " + keys.join(","));
  const sess = JSON.parse(a.w.localStorage.getItem("gb:cloud/session"));
  assert(sess.uid === "uid-1" && sess.refresh_token === "rt1", "세션 저장");
  assert(a.w.localStorage.getItem("gb:cloud/at") === post.body.at, "올린 시각을 기억");

  /* 저장하면 몇 초 뒤 자동으로 다시 올라간다 (미러와 같은 타이밍) */
  a.$("tDone").click(); await wait(20);
  const n0 = srv.posts().length;
  await addTx(a, 3000, "버스");
  await wait(4800);
  assert(srv.posts().length === n0 + 1, "저장 뒤 자동으로 한 번 더 올려야 함 — " + n0 + " → " + srv.posts().length);
  const last = srv.posts()[srv.posts().length - 1];
  assert(JSON.stringify(last.body.data.data).includes("버스"), "새 기록이 포함돼야 함");
  assert(a.errors.length === 0, "스크립트 오류: " + a.errors.join(" / "));

  /* 2) 새 폰(기록 없음)에서 로그인 → 서버 기록을 받는다 */
  const b = boot({ android: { setBars: () => {} } });
  b.w.fetch = srv.fetch;
  await wait(300);
  b.$("themeBtn").click(); await wait(30);
  b.$("clEmail").value = "me@example.com"; b.$("clPw").value = "secret1"; b.$("clLogin").click(); await wait(200);
  assert(/받았습니다/.test(b.$("toast").textContent), "폰이 비어 있으면 서버 기록을 받음 — 실제: " + b.$("toast").textContent);
  const bm = Object.keys(b.w.localStorage).filter((k) => k.startsWith("gb:months/"));
  assert(bm.length === 1 && b.w.localStorage.getItem(bm[0]).includes("버스"), "서버의 기록이 localStorage 에 들어와야 함");
  assert(b.w.localStorage.getItem("gb:cloud/session"), "받은 뒤에도 세션은 남아야 함 (restoreAll 이 gb:cloud/* 는 안 지움)");
  assert(b.w.localStorage.getItem("gb:cloud/at") === srv.row.at, "받은 시각 기억");
  assert(b.errors.length === 0, "스크립트 오류: " + b.errors.join(" / "));

  /* 3) 폰에도 서버에도 기록이 있으면 묻는다 → "서버 기록 받기" */
  const c = boot({ android: { setBars: () => {} } });
  c.w.fetch = srv.fetch;
  await wait(300);
  await addTx(c, 99000, "다른폰");
  await wait(500);
  c.$("themeBtn").click(); await wait(30);
  c.$("clEmail").value = "me@example.com"; c.$("clPw").value = "secret1"; c.$("clLogin").click(); await wait(200);
  assert(c.$("cloudAlert").classList.contains("open"), "둘 다 있으면 어느 쪽을 쓸지 물어야 함");
  assert(/서버에 .*기록이 있습니다/.test(c.$("cloudAlertMsg").textContent), "안내 문구 — 실제: " + c.$("cloudAlertMsg").textContent);
  const before = srv.posts().length;
  c.$("cloudPullBtn").click(); await wait(100);
  assert(!c.$("cloudAlert").classList.contains("open"), "고르면 닫힘");
  const cm = Object.keys(c.w.localStorage).filter((k) => k.startsWith("gb:months/"));
  assert(cm.every((k) => !c.w.localStorage.getItem(k).includes("다른폰")) && cm.some((k) => c.w.localStorage.getItem(k).includes("버스")), "서버 기록으로 덮어써야 함");
  assert(srv.posts().length === before, "받기를 골랐으면 올리지 않음");

  /* 4) Google 로그인: 네이티브가 딥링크 URL 을 __oauth 로 넘기면 토큰을 세션으로 쓰고 /user 로 이메일을 채운다 */
  const g = boot({ android: { setBars: () => {}, takePending: () => "[]", hasNotifAccess: () => false } });
  g.w.fetch = srv.fetch;
  await wait(300);
  g.$("themeBtn").click(); await wait(30);
  await g.w.__oauth("net.nn33.ledger://login#access_token=at2&expires_in=3600&refresh_token=rt2&token_type=bearer&type=signup");
  await wait(200);
  const gs = JSON.parse(g.w.localStorage.getItem("gb:cloud/session"));
  assert(gs.access_token === "at2" && gs.refresh_token === "rt2" && gs.uid === "uid-1" && gs.email === "google@example.com", "딥링크 토큰 → 세션 + /user 로 이메일 — 실제: " + JSON.stringify(gs));
  assert(g.$("cloudCard").textContent.includes("google@example.com"), "Google 계정 이메일 표시");
  await g.w.__oauth("net.nn33.ledger://login#error=access_denied&error_description=cancelled");
  await wait(50);
  assert(/로그인 실패/.test(g.$("toast").textContent), "오류 딥링크는 안내만");
  assert(JSON.parse(g.w.localStorage.getItem("gb:cloud/session")).access_token === "at2", "오류 딥링크가 기존 세션을 지우면 안 됨");

  /* 로그아웃: 서버에 알리고 세션만 지운다. 기록은 남는다 */
  const gm = Object.keys(g.w.localStorage).filter((k) => k.startsWith("gb:months/")).length;
  g.$("clLogout").click(); await wait(100);
  assert(!g.w.localStorage.getItem("gb:cloud/session") && g.$("clEmail"), "로그아웃 → 세션 삭제, 로그인 폼");
  assert(srv.calls.some((x) => x.url.includes("/auth/v1/logout") && x.headers.Authorization === "Bearer at2"), "서버 logout 호출");
  assert(Object.keys(g.w.localStorage).filter((k) => k.startsWith("gb:months/")).length === gm, "기록은 그대로");
  assert(g.errors.length === 0, "스크립트 오류: " + g.errors.join(" / "));

  /* 백업 파일 내보내기에도 세션은 안 들어간다 */
  let saved = null;
  const e = boot({ android: { setBars: () => {}, saveFile: (n, content) => { saved = content; } } });
  e.w.fetch = srv.fetch;
  await wait(300);
  e.$("themeBtn").click(); await wait(30);
  e.$("clEmail").value = "me@example.com"; e.$("clPw").value = "secret1"; e.$("clLogin").click(); await wait(200);
  e.$("bkExport").click(); await wait(50);
  assert(saved && !saved.includes("gb:cloud/") && !saved.includes("at1"), "백업 파일에 세션·토큰이 없어야 함");
};
