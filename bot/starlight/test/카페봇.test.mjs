// StarLight 판 카페봇 본체를 가짜 PLAT 으로 돌려 본다.
//   node bot/starlight/test/카페봇.test.mjs   (저장소 맨 위에서)
import cafeBody from "../카페봇.js";

let pass = 0, fail = 0;
function ok(label, cond, extra) {
    if (cond) { pass++; console.log("  ✓ " + label); }
    else { fail++; console.log("  ✗ " + label + (extra === undefined ? "" : "  → " + JSON.stringify(extra))); }
}

const disk = {};
let http = [];            // 봇이 부른 주소
let feed = { updatedAt: "2026-11-16T00:00:00Z", articles: [] };
let kickCode = 204;
let sentRooms = [];       // 먼저 말 걸기로 나간 것
let timers = [];

function art(id, subject) {
    return { id: id, subject: subject, writer: "글쓴이", menu: "자유", menuId: 1 };
}

const PLAT = {
    read: (n) => (Object.prototype.hasOwnProperty.call(disk, n) ? disk[n] : null),
    write: (n, t) => { disk[n] = String(t); return true; },
    send: (room, text) => { sentRooms.push(room + "|" + text); return true; },
    setTimeout: (fn) => setTimeout(fn, 0),
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    fetch: async (url, opt) => {
        opt = opt || {};
        http.push((opt.method || "GET") + " " + url.split("?")[0]);
        const R = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
        if (url.indexOf("/dispatches") !== -1) return R(kickCode, "");
        if (url.indexOf("api.github.com") !== -1) return R(200, JSON.stringify(feed));
        if (url.indexOf("ipify") !== -1) return R(200, "1.2.3.4\n");
        return R(404, "");
    }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bot = cafeBody(["오토2", "오토2프프"], "TOKEN-123", ["후파"], PLAT);

function say(room, text, sender = "후파") {
    const out = [];
    bot.response(room, text, sender, true, { reply: (t) => out.push(String(t)) });
    return out;
}

console.log("═══ 시작 ═══");
ok("시계 켜짐", bot.status().timer === "setInterval", bot.status());
ok("토큰 주입됨", bot.status().hasToken);
ok("타이머 하나만", timers.length === 1, timers.length);

console.log("\n═══ /카페 (누구나, 기다리지 않음) ═══");
const st = say("오토2", "/카페", "아무개");
ok("상태 바로 나옴", st.length === 1 && st[0].indexOf("카페 새글 알림") !== -1, st);
ok("목록에 없는 방 무시", say("아무방", "/카페", "아무개").length === 0);

console.log("\n═══ 첫 확인은 기준만 잡고 알리지 않는다 ═══");
feed = { updatedAt: "t1", articles: [art(100, "첫 글"), art(101, "둘째 글")] };
await bot.checkNow();
ok("첫 확인은 조용히", sentRooms.length === 0, sentRooms);
ok("기준 글번호 잡힘", bot.status().lastId === 101, bot.status());
ok("상태 파일 저장", !!disk["카페봇상태.json"]);

console.log("\n═══ 새 글이 오면 알린다 ═══");
http = [];
feed = { updatedAt: "t2", articles: [art(102, "새 글이다"), art(101, "둘째 글")] };
await bot.checkNow();
ok("두 방에 보냄", sentRooms.length === 2, sentRooms.map((x) => x.split("|")[0]));
ok("새 글만 담김", sentRooms[0].indexOf("새 글이다") !== -1 && sentRooms[0].indexOf("둘째 글") === -1, sentRooms[0]);
ok("기준 올라감", bot.status().lastId === 102);
ok("워크플로우 깨움", http.some((h) => h.indexOf("POST") === 0 && h.indexOf("/dispatches") !== -1), http);

console.log("\n═══ 같은 글은 두 번 안 보낸다 ═══");
sentRooms = [];
await bot.checkNow();
ok("다시 안 보냄", sentRooms.length === 0, sentRooms);

console.log("\n═══ 발송 실패하면 기준을 올리지 않는다 ═══");
const disk2 = {};
const bot2 = cafeBody(["오토2"], "T", ["후파"], Object.assign({}, PLAT, {
    read: (n) => (Object.prototype.hasOwnProperty.call(disk2, n) ? disk2[n] : null),
    write: (n, t) => { disk2[n] = String(t); return true; },
    send: () => false
}));
feed = { updatedAt: "s1", articles: [art(200, "기준")] };
await bot2.checkNow();
feed = { updatedAt: "s2", articles: [art(201, "보내야 할 글"), art(200, "기준")] };
await bot2.checkNow();
ok("기준 그대로", bot2.status().lastId === 200, bot2.status());
ok("오류 남김", String(bot2.status().err).indexOf("발송 실패") !== -1, bot2.status().err);

console.log("\n═══ 기다리는 명령은 나중에 답한다 ═══");
feed = { updatedAt: "t3", articles: [art(103, "최근 글")] };
const later = [];
bot.response("오토2", "/새글테스트", "후파", true, { reply: (t) => later.push(String(t)) });
ok("바로는 답이 없다", later.length === 0);
await wait(20);
ok("곧 답이 온다", later.length === 1 && later[0].indexOf("최근 글") !== -1, later);

const dbg = [];
bot.response("오토2", "/카페확인", "후파", true, { reply: (t) => dbg.push(String(t)) });
await wait(20);
ok("/카페확인 진단", dbg.length === 1 && dbg[0].indexOf("봇 공인 IP: 1.2.3.4") !== -1, dbg);
ok("관리자 아니면 조용히", say("오토2", "/카페확인", "아무개").length === 0);

console.log("\n═══ 토큰 ═══");
const tk = [];
bot.response("오토2", "/깃토큰 ghp_NEWTOKEN123", "후파", true, { reply: (t) => tk.push(String(t)) });
await wait(20);
ok("토큰 등록 안내", tk.length === 1 && tk[0].indexOf("등록했어요") !== -1, tk);
ok("토큰 파일 저장", disk["gh_token.txt"] === "ghp_NEWTOKEN123");
ok("단톡방 경고", tk[0].indexOf("꼭 삭제하세요") !== -1);

console.log("\n═══ 깃헙이 안 될 때 ═══");
const disk3 = {};
const bad = cafeBody(["오토2"], "T", ["후파"], Object.assign({}, PLAT, {
    read: (n) => (Object.prototype.hasOwnProperty.call(disk3, n) ? disk3[n] : null),
    write: (n, t) => { disk3[n] = String(t); return true; },
    fetch: async () => { throw new Error("네트워크 없음"); }
}));
await bad.checkNow();
ok("죽지 않고 오류만", String(bad.status().err).indexOf("네트워크 없음") !== -1, bad.status().err);
ok("상태 명령은 그대로", (() => {
    const o = [];
    bad.response("오토2", "/카페", "아무개", true, { reply: (t) => o.push(t) });
    return o.length === 1;
})());

console.log("\n" + (fail ? "✗ " + fail + "개 실패 / " : "") + pass + "개 통과");
process.exit(fail ? 1 : 0);
