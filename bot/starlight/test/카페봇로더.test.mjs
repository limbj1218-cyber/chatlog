// StarLight(NeonJS) 카페봇 로더 시험 — Projects·FileStream·BotManager·Chat·fetch 를 흉내 낸다.
// 사용 (저장소 맨 위에서): node bot/starlight/test/카페봇로더.test.mjs
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const SRC = "bot/starlight";
const KEY = "cafe";
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-cafe-"));
const PROJ = path.join(HERE, "proj");
fs.mkdirSync(path.join(PROJ, "data"), { recursive: true });
fs.writeFileSync(path.join(PROJ, "package.json"), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, "카페봇로더.js"), path.join(PROJ, "main.js"));
const BODY = fs.readFileSync(path.join(SRC, "카페봇.js"), "utf8");

let ok = 0, bad = 0;
function t(n, c, i) { if (c) ok++; else { bad++; console.log("FAIL", n, i === undefined ? "" : JSON.stringify(i)); } }

globalThis.FileStream = {
    exists: (p) => fs.existsSync(p),
    read: (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null),
    write: (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(d)); return String(d); },
    remove: (p) => { try { fs.unlinkSync(p); return true; } catch (e) { return false; } },
    createDir: (p) => { fs.mkdirSync(p, { recursive: true }); return true; }
};
const dirObj = (p) => ({ absolutePath: p });
globalThis.Projects = { getSelf: () => ({
    directory: dirObj(PROJ.replace(/\\/g, "/")),
    getDataDirectory: () => dirObj(path.join(PROJ, "data").replace(/\\/g, "/"))
}) };
let sent = [], pushed = [], compiled = 0;
globalThis.BotManager = { getCurrentBot: () => ({
    send: (r, m) => { pushed.push(r + "|" + m); return true; },   // 먼저 말 걸기
    compile: () => { compiled++; return true; }
}) };
globalThis.Chat = { findRoom: () => null };
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
globalThis.setInterval = () => 0;   // 시계는 시험에서 직접 돌리지 않는다

let remoteBody = BODY, feed = { updatedAt: "t0", articles: [] }, kickCode = 204;
globalThis.fetch = async (url, opt) => {
    opt = opt || {};
    const R = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
    if (url.indexOf("raw.githubusercontent.com") !== -1) return remoteBody === null ? R(404, "") : R(200, remoteBody);
    if (url.indexOf("/dispatches") !== -1) return R(kickCode, "");
    if (url.indexOf("api.github.com") !== -1) return R(200, JSON.stringify(feed));
    if (url.indexOf("ipify") !== -1) return R(200, "1.2.3.4");
    return R(404, "");
};
const art = (id, subject) => ({ id, subject, writer: "글쓴이", menu: "자유", menuId: 1 });

function room(name) {
    return { name, isGroupChat: () => true, send: (m) => { sent.push(name + "|" + m); return true; } };
}
function say(sender, msg, rname) {
    sent = [];
    main.onMessage({ room: room(rname || "오토2"), message: msg, sender: { name: sender, id: null } });
    return sent.join("\n");
}
const flush = () => new Promise((r) => realSetTimeout(r, 30));

// ── 1. 처음 설치 ──
let main = await import(pathToFileURL(path.join(PROJ, "main.js")).href);
t("처음: 깃헙에서 본체 받음", fs.existsSync(path.join(PROJ, KEY + "_body.js")));
let info = say("x", "/카페로더");
t("로더 상태", /본체: \d{4}-\d+ ✅/.test(info) && info.indexOf("깃헙 토큰: 없음") !== -1, info);

// ── 2. 토큰 등록 → data 폴더 ──
let r = say("후파", "/깃토큰 ghp_TESTTOKEN");
await flush();
t("토큰 등록 안내", sent.join().indexOf("등록했어요") !== -1, sent);
t("토큰이 data 폴더에", fs.readFileSync(path.join(PROJ, "data", "gh_token.txt"), "utf8") === "ghp_TESTTOKEN");
t("관리자 아니면 조용히", say("아무개", "/깃토큰 ghp_X") === "");

// ── 3. 상태 ──
t("/카페 는 누구나", say("아무개", "/카페").indexOf("카페 새글 알림") !== -1);
t("목록에 없는 방 무시", say("아무개", "/카페", "아무방") === "");

// ── 4. 강제 확인 → 먼저 말 걸기로 알림 ──
feed = { updatedAt: "t1", articles: [art(100, "첫 글")] };
say("후파", "/카페강제확인");
await flush();
t("첫 확인은 기준만", pushed.length === 0, pushed);

pushed = [];
feed = { updatedAt: "t2", articles: [art(101, "새 글이 떴다"), art(100, "첫 글")] };
say("후파", "/카페강제확인");
await flush();
t("새 글을 먼저 말 걸어 보냄", pushed.length === 2, pushed.map((x) => x.split("|")[0]));
t("새 글 제목 담김", pushed[0].indexOf("새 글이 떴다") !== -1, pushed[0]);
t("상태 파일 저장", fs.existsSync(path.join(PROJ, "data", "카페봇상태.json")));
t("강제확인은 관리자만", say("아무개", "/카페강제확인") === "");

info = say("x", "/카페로더");
t("로더 상태에 글번호·토큰", info.indexOf("마지막 글번호 101") !== -1 && info.indexOf("토큰: 있음") !== -1, info);

// ── 5. 업데이트 ──
t("관리자 아니면 무시", say("아무개", "/카페업데이트") === "");
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9999-1";');
say("후파", "/카페업데이트");
await flush(); await flush();
t("업데이트 안내", sent.join().indexOf("본체 9999-1") !== -1, sent);
t("본체 바뀌고 옛 본체 남김",
    fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8").indexOf('"9999-1"') !== -1 &&
    fs.existsSync(path.join(PROJ, KEY + "_body_prev.js")));
t("다시 컴파일 부름", compiled === 1, compiled);

const before = fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8");
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9998-1";')
    .replace("function inRooms(", "function inRooms((");
say("후파", "/카페업데이트");
await flush(); await flush();
t("깨진 본체는 안 바꿈", fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8") === before);
t("깨진 본체: 실패 알림", sent.join().indexOf("업데이트 실패") !== -1, sent);

// ── 6. 옛 데이터 가져오기 ──
const old = path.join(HERE, "old");
fs.mkdirSync(old, { recursive: true });
fs.writeFileSync(path.join(old, "카페봇상태.json"), '{"cafeLastId":777}');
r = say("후파", "/카페가져오기 " + old.replace(/\\/g, "/"));
t("가져오기 복사", r.indexOf("카페봇상태.json: 가져옴 ✅") !== -1, r);
t("원래 것 백업", fs.existsSync(path.join(PROJ, "data", "카페봇상태.json.bak")));
await flush();
t("가져오기 뒤 다시 컴파일", compiled === 2, compiled);

console.log((bad ? "✗ " + bad + "개 실패 / " : "") + ok + "개 통과");
fs.rmSync(HERE, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
