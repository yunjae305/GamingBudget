const tests = {
  "결제 대기열": require("./queue.test"),
  "결제 알림 파서": require("./parser.test"),
  "게임 결제 기록": require("./game.test"),
  "백업·복원": require("./backup.test"),
  "AI 지출 도우미": require("./ai.test"),
  "알림 감지 진단": require("./diag.test"),
};
(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log("✓ " + name); }
    catch (e) { failed++; console.log("✗ " + name + "\n   " + e.message); }
  }
  process.exit(failed ? 1 : 0);
})();
