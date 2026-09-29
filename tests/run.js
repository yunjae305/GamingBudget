const tests = {
  /* 네이티브 자동 업데이트(MainActivity)는 받은 index.html 의 앞 400바이트에 <title>가계부</title> 이 있어야 받아들인다.
     2026-09-29 에 CSP 메타를 title 앞에 넣었다가 폰이 모든 업데이트를 버린 적이 있다. */
  "원격 업데이트 유효성": async () => {
    const fs = require("fs"), path = require("path");
    const buf = fs.readFileSync(path.join(__dirname, "../app/src/main/assets/index.html"));
    const head = buf.subarray(0, 400).toString("utf8");
    if (!head.includes("<title>가계부</title>")) throw new Error("index.html 앞 400바이트에 <title>가계부</title> 이 없음 — 폰이 업데이트를 거부한다. title 을 <head> 맨 앞으로.");
    if (buf.length < 2048) throw new Error("index.html 이 2KB 미만");
  },
  "결제 대기열": require("./queue.test"),
  "결제 알림 파서": require("./parser.test"),
  "게임 결제 기록": require("./game.test"),
  "백업·복원": require("./backup.test"),
  "AI 지출 도우미": require("./ai.test"),
  "알림 감지 진단": require("./diag.test"),
  "하루 예산·통계·영수증": require("./budget.test"),
  "클라우드 동기화": require("./cloud.test"),
};
(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log("✓ " + name); }
    catch (e) { failed++; console.log("✗ " + name + "\n   " + e.message); }
  }
  process.exit(failed ? 1 : 0);
})();
