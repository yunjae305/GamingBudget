const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "../app/src/main/assets/index.html"), "utf8");

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
