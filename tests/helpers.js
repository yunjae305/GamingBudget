const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "../app/src/main/assets/index.html"), "utf8");

/* LEDGER_TEST_NOW=2026-10-31 처럼 주면 "오늘"을 그 날 정오로 고정한다 (노드·페이지 둘 다).
   월급날 기간처럼 날짜에 따라 갈리는 계산을 여러 날짜로 돌려 볼 때 쓴다: LEDGER_TEST_NOW=2026-02-01 npm test */
const FIXED = process.env.LEDGER_TEST_NOW ? new Date(process.env.LEDGER_TEST_NOW + "T12:00:00").getTime() : 0;
function fakeDate(Real, fixed) {
  class D extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  return D;
}
if (FIXED) global.Date = fakeDate(Date, FIXED);

/** 앱을 띄운다. pending 을 주면 window.Android 브리지를 흉내 낸다.
 *  android 에 함수를 더 주면 브리지에 얹는다 (mirror, saveFile, readMirror …). */
function boot({ pending = null, notifAccess = true, android = null } = {}) {
  let given = false;
  const vc = new VirtualConsole();
  vc.sendTo(console, { omitJSDOMErrors: true });
  vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) console.error(e); });
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: "https://appassets.androidplatform.net/live/index.html",
    beforeParse(w) {
      w.scrollTo = () => {};
      if (FIXED) w.Date = fakeDate(w.Date, FIXED);
      if (pending || android) {
        w.Android = Object.assign({
          takePending: () => { if (given || !pending) return "[]"; given = true; return JSON.stringify(pending); },
          hasNotifAccess: () => notifAccess,
          openNotifAccess: () => {},
        }, android || {});
      }
    },
  });
  const w = dom.window, d = w.document;
  const errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));
  return { w, d, $: (id) => d.getElementById(id), errors };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error("실패: " + msg);
}

module.exports = { boot, wait, assert };
