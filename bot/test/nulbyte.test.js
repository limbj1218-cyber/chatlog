// 봇 소스에 진짜 NUL 바이트(0x00)가 들어가 있지 않은지 본다.
//   node bot/test/nul.test.js   (저장소 맨 위에서)
//
// 2026-11-16 에 bot/오토봇.js 의 replyKey 에서 실제로 겪었다 — "\u0000" 이라고 써야 할 자리에
// heredoc 이 글자 그대로의 NUL 을 박아 넣어서, grep·git diff 가 그 파일을 바이너리로 다뤘다.
// 동작은 되지만 코드를 읽고 고치기가 어려워진다. 구분자가 필요하면 반드시 이스케이프로 쓸 것.
const fs = require("fs");
const path = require("path");

const DIRS = ["bot", "bot/starlight", "bot/test", "bot/starlight/test", ".github"];
const EXT = [".js", ".mjs", ".json", ".md", ".py", ".yml", ".html"];

let checked = 0;
const bad = [];

for (const dir of DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (!fs.statSync(p).isFile()) continue;
        if (!EXT.includes(path.extname(name))) continue;
        checked++;
        const buf = fs.readFileSync(p);
        const n = buf.filter((b) => b === 0).length;
        if (n === 0) continue;
        const at = buf.indexOf(0);
        const line = buf.slice(0, at).toString("utf8").split("\n").length;
        bad.push(p + " — NUL " + n + "개 (처음은 " + line + "번째 줄)");
    }
}

console.log("검사한 파일 " + checked + "개");
if (bad.length) {
    console.log("\n✗ 진짜 NUL 바이트가 들어 있습니다 — \\u0000 이스케이프로 바꾸세요:");
    bad.forEach((b) => console.log("  " + b));
    process.exit(1);
}
console.log("✓ NUL 없음");
