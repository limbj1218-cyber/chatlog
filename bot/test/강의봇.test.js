// 강의봇 PC 검증 — 폰 환경(FileStream·jsoup·Thread·java.net·Base64)과 깃헙 API 를 흉내내서 본체를 돌려 본다
// 실행: node bot/test/강의봇.test.js
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "강의봇.js"), "utf8");
const BASE = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/";
const API = "https://api.github.com/repos/limbj1218-cyber/chatlog/contents/";

let files = {};          // 폰 파일 흉내
let remote = {};         // raw url(쿼리 제외) → { code, body }
let threads = [];        // 백그라운드 스레드 — 테스트에서는 즉시 실행
let gh = {};             // 가짜 깃헙 저장소: 경로 → { sha, content }
let ghLog = [];          // 깃헙 API 호출 기록 [method, path, code]
let ghDown = false;      // 깃헙 API 장애 흉내
let shaSeq = 0;
const newSha = () => "sha" + (++shaSeq);

function remoteUrl(name, sub) {
    return BASE + (sub ? encodeURIComponent(sub) + "/" : "") + encodeURIComponent(name);
}
function setRemote(name, sub, obj) {
    remote[remoteUrl(name, sub)] = obj === null ? { code: 404, body: "404: Not Found" }
        : { code: 200, body: JSON.stringify(obj) };
}
function ghSet(p, obj) { gh[p] = { sha: newSha(), content: JSON.stringify(obj, null, 2) }; }
function ghGet(p) { return gh[p] ? JSON.parse(gh[p].content) : null; }

// 가짜 깃헙 Contents API
function ghApi(method, url, bodyStr) {
    if (ghDown) throw new Error("깃헙 장애");
    const u = url.replace(API, "").split("?")[0];
    const p = u.split("/").map(decodeURIComponent).join("/");
    let code, body;
    if (method === "GET") {
        if (gh[p]) { code = 200; body = { sha: gh[p].sha, content: Buffer.from(gh[p].content, "utf8").toString("base64").replace(/(.{60})/g, "$1\n"), encoding: "base64" }; }
        else { code = 404; body = { message: "Not Found" }; }
    } else if (method === "PUT") {
        const b = JSON.parse(bodyStr);
        if (gh[p] && b.sha !== gh[p].sha) { code = 409; body = { message: "sha mismatch" }; }
        else if (!gh[p] && b.sha) { code = 422; body = { message: "sha given for new file" }; }
        else {
            code = gh[p] ? 200 : 201;
            gh[p] = { sha: newSha(), content: Buffer.from(b.content, "base64").toString("utf8") };
            body = { content: { sha: gh[p].sha } };
        }
    }
    ghLog.push([method, p, code]);
    return { code, body: JSON.stringify(body) };
}

function makeContext() {
    function JString(a, cs) {
        const s = Buffer.isBuffer(a) ? a.toString("utf8") : String(a);
        this.toString = () => s;
        this.getBytes = () => Buffer.from(s, "utf8");
    }
    const ctx = {
        console,
        FileStream: {
            read: p => (p in files ? files[p] : null),
            write: (p, d) => { files[p] = d; }
        },
        org: { jsoup: { Jsoup: { connect: url => {
            const key = url.split("?")[0];
            const chain = {};
            ["ignoreContentType", "ignoreHttpErrors", "userAgent", "timeout", "maxBodySize"].forEach(m => chain[m] = () => chain);
            chain.execute = () => {
                const r = remote[key];
                if (!r) throw new Error("네트워크 끊김: " + key);
                return { statusCode: () => r.code, body: () => r.body };
            };
            return chain;
        } } } },
        java: {
            lang: {
                Thread: function (fn) { this.setDaemon = () => {}; this.start = () => { threads.push(1); fn(); }; },
                String: JString
            },
            util: { Base64: {
                getEncoder: () => ({ encodeToString: b => Buffer.from(b).toString("base64") }),
                getMimeDecoder: () => ({ decode: s => Buffer.from(String(s), "base64") })
            } },
            net: { URL: function (url) {
                this.openConnection = () => {
                    const c = { method: "GET", body: null };
                    let res = null;
                    const run = () => { if (!res) res = ghApi(c.method, url, c.body); return res; };
                    return {
                        setRequestMethod: m => { c.method = m; },
                        setRequestProperty: () => {}, setConnectTimeout: () => {}, setReadTimeout: () => {},
                        setDoOutput: () => {},
                        getOutputStream: () => ({ write: b => { c.body = Buffer.from(b).toString("utf8"); }, close: () => {} }),
                        getResponseCode: () => run().code,
                        getInputStream: () => ({ lines: [run().body] }),
                        getErrorStream: () => ({ lines: [run().body] }),
                        disconnect: () => {}
                    };
                };
            } },
            io: {
                InputStreamReader: function (is) { this.lines = is.lines.slice(); },
                BufferedReader: function (r) { this.readLine = () => (r.lines.length ? r.lines.shift() : null); this.close = () => {}; }
            }
        }
    };
    return vm.createContext(ctx);
}

function boot(opts) {
    opts = opts || {};
    const ctx = makeContext();
    const wrapped = "(function (__ADMINS__, __TOKEN__, __REPO__) {\n" + SRC +
        "\nreturn { response: response, loadAll: loadAll };\n})";
    const factory = vm.runInContext(wrapped, ctx, { filename: "강의봇.js" });
    return factory(opts.admins || ["후파"], opts.token === undefined ? "ghp_test" : opts.token, opts.repo || "");
}

let bot;
function say(room, msg, sender) {
    const out = [];
    bot.response(room, msg, sender || "학생", true, { reply: m => out.push(String(m)) });
    return out;
}

let pass = 0, fail = 0;
function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else { fail++; console.log("❌ " + name + "\n   got:  " + JSON.stringify(got) + "\n   want: " + JSON.stringify(want)); }
}
function has(name, got, needle) {
    const s = Array.isArray(got) ? got.join("\n") : String(got);
    if (s.indexOf(needle) !== -1) pass++; else { fail++; console.log("❌ " + name + "\n   got: " + JSON.stringify(got) + "\n   needs: " + needle); }
}
function not(name, got, needle) {
    const s = Array.isArray(got) ? got.join("\n") : String(got);
    if (s.indexOf(needle) === -1) pass++; else { fail++; console.log("❌ " + name + "\n   got: " + JSON.stringify(got) + "\n   must not have: " + needle); }
}

// ── 원격 데이터 준비: 강의 둘 (B는 고정 데이터 파일 없음)
setRemote("강의목록.json", null, {
    "_설명": "x",
    "강의": [
        { "이름": "강의A", "조교방": "A조교", "사담방": "A사담", "프리미엄방": "A프리", "표시": { "사담방": "A사담방", "프리미엄방": "A프반" } },
        { "이름": "강의B", "조교방": "B조교", "사담방": "B사담", "프리미엄방": "B프리" }
    ]
});
setRemote("강의A.json", "강의데이터", {
    "_공통": { "봇테스트": "A 정상", "*질문": "질문은 리스트 먼저" },
    "사담방": { "안내": "사담 안내" },
    "프리미엄방": { "프반자료": ["자료1", "자료2"] }
});
setRemote("강의B.json", "강의데이터", null);   // 404

bot = boot();

// 1. 진단
has("A사담 진단", say("A사담", "/강의"), "강의A · 사담방 ✅");
has("A사담 진단 명령어수", say("A사담", "/강의"), "명령어 3개");       // 봇테스트, *질문, 안내
has("A사담 진단 깃헙 등록 없음", say("A사담", "/강의"), "깃헙 등록 없음");
has("B사담 진단 404 경고", say("B사담", "/강의"), "고정 데이터 파일 없음");
has("모르는 방 진단", say("딴방", "/강의"), "어느 강의에도 없음");
eq("모르는 방 일반 메시지 무시", say("딴방", "봇테스트"), []);
eq("시작 시 깃헙에 올린 것 없음 (등록 없음)", ghLog.filter(l => l[0] === "PUT").length, 0);

// 2. 고정 응답
eq("공통 → 사담", say("A사담", "봇테스트"), ["A 정상"]);
eq("공통 → 프리", say("A프리", "봇테스트"), ["A 정상"]);
eq("공통 → 조교", say("A조교", "봇테스트"), ["A 정상"]);
eq("사담 전용 → 사담", say("A사담", "안내"), ["사담 안내"]);
eq("사담 전용 → 프리 X", say("A프리", "안내"), []);
eq("프리 전용 목록 → 2개 메시지", say("A프리", "프반자료"), ["자료1", "자료2"]);
eq("프리 전용 → 사담 X", say("A사담", "프반자료"), []);
eq("앞뒤 공백 제거 일치", say("A사담", "  봇테스트 "), ["A 정상"]);
eq("B는 고정 없음", say("B사담", "봇테스트"), []);

// 3. 포함 트리거 + 쿨다운
eq("포함 트리거 첫 번째", say("A사담", "이거 질문 있어요"), ["질문은 리스트 먼저"]);
eq("포함 트리거 쿨다운", say("A사담", "또 질문이요"), []);
eq("포함 트리거 다른 방은 별도", say("A프리", "질문!"), ["질문은 리스트 먼저"]);

// 4. 등록 (조교방에서만) + 깃헙 저장
eq("사담방에서 등록 X", say("A사담", "/등록_안녕_반가워"), []);
ghLog = [];
has("조교방 등록", say("A조교", "/등록_안녕_반가워"), "✅ 등록했어요 (A사담방·A프반·A조교");
eq("등록 → 깃헙 PUT 1회", ghLog.filter(l => l[0] === "PUT").map(l => l[2]), [201]);
eq("깃헙 파일 내용 = 폰", ghGet("bot/강의등록/강의A.json"), { "등록": { "안녕": "반가워" }, "프반": {} });
has("진단 깃헙 반영", say("A조교", "/강의"), "깃헙 반영 ·");
eq("등록 → 사담", say("A사담", "안녕"), ["반가워"]);
eq("등록 → 프리", say("A프리", "안녕"), ["반가워"]);
eq("등록 → 조교도", say("A조교", "안녕"), ["반가워"]);
eq("등록 → B 강의엔 없음", say("B사담", "안녕"), []);
has("프반 등록", say("A조교", "/프반_비밀_프반만"), "✅ 등록했어요 (A프반 /");
eq("깃헙 파일에 프반도", ghGet("bot/강의등록/강의A.json"), { "등록": { "안녕": "반가워" }, "프반": { "비밀": "프반만" } });
eq("프반 → 프리", say("A프리", "비밀"), ["프반만"]);
eq("프반 → 사담 X", say("A사담", "비밀"), []);
has("고정과 겹침 거절", say("A조교", "/등록_봇테스트_x"), "고정 명령어예요");
has("포함 고정과 겹침 거절", say("A조교", "/등록_질문_x"), "고정 명령어예요");
has("다른 갈래와 겹침 거절", say("A조교", "/등록_비밀_y"), "이미 /프반 으로 등록돼");
has("사용법", say("A조교", "/등록"), "이렇게 써 주세요");
has("할말 안 밑줄 보존", say("A조교", "/등록_링크_a_b_c"), "a_b_c");
eq("할말 밑줄 응답", say("A사담", "링크"), ["a_b_c"]);
has("B 강의 같은 이름 따로 등록", say("B조교", "/등록_안녕_B반가워"), "✅ 등록했어요");
eq("B 등록 → B사담", say("B사담", "안녕"), ["B반가워"]);
eq("A는 그대로", say("A사담", "안녕"), ["반가워"]);
eq("B 깃헙 파일 따로", ghGet("bot/강의등록/강의B.json"), { "등록": { "안녕": "B반가워" }, "프반": {} });
eq("A 깃헙 파일 영향 없음", ghGet("bot/강의등록/강의A.json")["등록"]["안녕"], "반가워");

// 5. 삭제
has("삭제", say("A조교", "/삭제_비밀"), "🗑️ 지웠어요 (/프반");
eq("삭제 후 X", say("A프리", "비밀"), []);
eq("삭제 → 깃헙 반영", ghGet("bot/강의등록/강의A.json")["프반"], {});
has("없는 것 삭제", say("A조교", "/삭제_없음"), "등록된 게 없어요");
has("고정 삭제 거절", say("A조교", "/삭제_봇테스트"), "못 지워요");
eq("사담방 삭제 X", say("A사담", "/삭제_안녕"), []);

// 6. 리스트
const lst = say("A조교", "/리스트");
has("조교 리스트 머리", lst, "📋 강의A 명령어 목록");
has("조교 리스트 사담 구간", lst, "───── A사담방 (");
has("조교 리스트 프반 구간 +", lst, "───── A프반 (+");
has("조교 리스트 포함 표기", lst, "질문  (말 속에 있어도)");
has("사담 리스트", say("A사담", "/리스트"), "📋 이 방의 자동응답 (");
has("B 리스트 라벨 없음 → 실제 방 이름", say("B조교", "/리스트"), "───── B사담 (");

// 7. 관리자
eq("강의전체 비관리자 X", say("A사담", "/강의전체", "학생"), []);
has("강의전체 관리자", say("A사담", "/강의전체", "후파"), "🎓 강의 2개");
has("강의전체 B 경고", say("딴방", "/강의전체", "후파"), "고정 데이터 파일 없음");
has("강의전체 깃헙 줄", say("딴방", "/강의전체", "후파"), "깃헙 반영 ·");

// 8. 깃헙 장애 → 등록은 그대로 되고 미반영 표시, 복구 후 갱신 때 올라감
ghDown = true;
has("장애 중 등록 OK", say("A조교", "/등록_장애중_그래도됨"), "✅ 등록했어요");
eq("장애 중에도 방 반응", say("A사담", "장애중"), ["그래도됨"]);
has("장애 → 미반영 표시", say("A조교", "/강의"), "⚠️ 깃헙 미반영");
eq("깃헙엔 아직 없음", ghGet("bot/강의등록/강의A.json")["등록"]["장애중"], undefined);
ghDown = false;
bot.loadAll();   // 30분 갱신 흉내
eq("복구 후 갱신 → 올라감", ghGet("bot/강의등록/강의A.json")["등록"]["장애중"], "그래도됨");
has("복구 후 진단 정상", say("A조교", "/강의"), "깃헙 반영 ·");

// 9. 깃헙에서 직접 고침 → 갱신 때 폰에 적용
const edited = ghGet("bot/강의등록/강의A.json");
edited["등록"]["깃헙편집"] = "웹에서 넣음";
delete edited["등록"]["링크"];
ghSet("bot/강의등록/강의A.json", edited);   // sha 바뀜
eq("갱신 전엔 모름", say("A사담", "깃헙편집"), []);
bot.loadAll();
eq("갱신 후 깃헙 편집 반영", say("A사담", "깃헙편집"), ["웹에서 넣음"]);
eq("갱신 후 깃헙에서 지운 것 사라짐", say("A사담", "링크"), []);
eq("폰 쪽 다른 등록은 유지", say("A사담", "안녕"), ["반가워"]);

// 10. 깃헙 편집과 폰 등록이 겹침(sha 어긋남) → 409 → 재시도 성공, 폰이 우선
const edited2 = ghGet("bot/강의등록/강의A.json");
edited2["등록"]["몰래"] = "웹";
ghSet("bot/강의등록/강의A.json", edited2);   // 봇은 모르는 새 sha
ghLog = [];
has("sha 어긋난 상태에서 등록", say("A조교", "/등록_충돌_폰우선"), "✅ 등록했어요");
eq("409 뒤 재시도 성공", ghLog.map(l => l[0] + l[2]).join(","), "PUT409,GET200,PUT200");
eq("깃헙 = 폰 (웹에서 끼운 건 덮임)", ghGet("bot/강의등록/강의A.json")["등록"]["몰래"], undefined);
eq("깃헙에 새 등록 있음", ghGet("bot/강의등록/강의A.json")["등록"]["충돌"], "폰우선");
has("충돌 뒤 진단 정상", say("A조교", "/강의"), "깃헙 반영 ·");

// 11. 재시작 + 네트워크 끊김 → 캐시와 등록 파일로 동작
const savedRemote = remote;
remote = {}; ghDown = true; threads = [];
bot = boot();
has("캐시로 시작", say("A사담", "/강의"), "데이터 캐시");
eq("캐시 고정 응답", say("A사담", "봇테스트"), ["A 정상"]);
eq("등록 파일 유지", say("A사담", "안녕"), ["반가워"]);
eq("B 등록 파일 유지", say("B사담", "안녕"), ["B반가워"]);
eq("삭제된 건 안 살아남", say("A프리", "비밀"), []);
remote = savedRemote; ghDown = false;

// 12. 폰을 새로 깐 경우(폰 파일 없음) → 깃헙에서 복원
const savedFiles = files;
files = {}; threads = []; ghLog = [];
bot = boot();
eq("복원: A 등록", say("A사담", "안녕"), ["반가워"]);
eq("복원: A 충돌 등록", say("A사담", "충돌"), ["폰우선"]);
eq("복원: B 등록", say("B사담", "안녕"), ["B반가워"]);
has("복원 뒤 진단", say("A조교", "/강의"), "깃헙 동기화됨");
eq("복원은 깃헙에 쓰지 않음", ghLog.filter(l => l[0] === "PUT").length, 0);
files = savedFiles;

// 13. 재시작 뒤 깃헙이 그대로면 아무것도 안 함, 깃헙만 바뀌었으면 받아옴 (폰에 적어 둔 sha 덕분)
ghLog = []; threads = [];
bot = boot();
eq("재시작: 깃헙 변화 없음 → PUT 없음", ghLog.filter(l => l[0] === "PUT").length, 0);
const edited3 = ghGet("bot/강의등록/강의B.json");
edited3["등록"]["재시작후"] = "받아옴";
ghSet("bot/강의등록/강의B.json", edited3);
bot = boot();
eq("재시작: 깃헙만 바뀜 → 적용", say("B사담", "재시작후"), ["받아옴"]);

// 14. 토큰 없음 → 깃헙 저장 꺼짐, 폰에만. 폰이 비어 있으면 공개 raw 에서 복원만
ghLog = [];
bot = boot({ token: "" });
has("토큰 없음 진단", say("A사담", "/강의"), "깃헙 저장 꺼짐");
has("토큰 없이 등록 OK", say("A조교", "/등록_토큰없음_폰만"), "✅ 등록했어요");
eq("토큰 없음 → 깃헙 호출 없음", ghLog.length, 0);
files = {};
remote[remoteUrl("강의A.json", "강의등록")] = { code: 200, body: gh["bot/강의등록/강의A.json"].content };
bot = boot({ token: "" });
eq("토큰 없음 + 폰 비어 있음 → raw 복원", say("A사담", "안녕"), ["반가워"]);
eq("토큰 없음 + raw 없는 강의는 빈 채로", say("B사담", "안녕"), []);
files = savedFiles;

// 15. 캐시도 없고 네트워크도 없음 → 조용히, 스레드 1회만
files = {}; remote = {}; ghDown = true; threads = [];
bot = boot();
eq("아무것도 없음 → 무응답", say("A사담", "봇테스트"), []);
eq("아무것도 없음 → 무응답 2", say("A사담", "봇테스트"), []);
eq("백그라운드 시도 1분 1회", threads.length, 1);
has("진단은 됨", say("A사담", "/강의"), "강의목록을 아직 못 받았어요");
remote = savedRemote; ghDown = false;

// 16. 네트워크 복구 후 강의목록만 바뀌어도(방 이름 변경) 반영
setRemote("강의목록.json", null, { "강의": [ { "이름": "강의A", "조교방": "A조교", "사담방": "새사담", "프리미엄방": "A프리" } ] });
setRemote("강의A.json", "강의데이터", { "_공통": { "봇테스트": "A 정상" } });
bot = boot();
eq("바뀐 방 이름 반응", say("새사담", "봇테스트"), ["A 정상"]);
eq("옛 방 이름 무반응", say("A사담", "봇테스트"), []);

// 17. 다른 저장소 지정
ghLog = [];
bot = boot({ repo: "someone/private-regs" });
say("A조교", "/등록_딴저장소_확인");
has("저장소 바꾸기", ghLog.length ? "ok" : "none", "ok");

console.log(fail === 0 ? `\n✅ 전부 통과 (${pass}개)` : `\n❌ 실패 ${fail}개 / 통과 ${pass}개`);
process.exit(fail ? 1 : 0);
