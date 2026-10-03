// 강의봇 PC 검증 — 폰 환경(FileStream·jsoup·Thread)을 흉내내서 본체를 돌려 본다
// 실행: node bot/test/강의봇.test.js
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "강의봇.js"), "utf8");
const BASE = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/";

let files = {};          // 폰 파일 흉내
let remote = {};         // url(쿼리 제외) → { code, body }
let threads = [];        // 백그라운드 스레드 — 테스트에서는 즉시 실행

function remoteUrl(name, sub) {
    return BASE + (sub ? encodeURIComponent(sub) + "/" : "") + encodeURIComponent(name);
}
function setRemote(name, sub, obj) {
    remote[remoteUrl(name, sub)] = obj === null ? { code: 404, body: "404: Not Found" }
        : { code: 200, body: JSON.stringify(obj) };
}

function makeContext() {
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
        java: { lang: { Thread: function (fn) {
            this.setDaemon = () => {};
            this.start = () => { threads.push(1); fn(); };
        } } }
    };
    return vm.createContext(ctx);
}

function boot(adminsOverride) {
    const ctx = makeContext();
    const wrapped = "(function (__ADMINS__) {\n" + SRC +
        "\nif (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;" +
        "\nreturn { response: response, _c: function(){ return COURSES; }, _d: function(){ return DATA; } };\n})";
    const factory = vm.runInContext(wrapped, ctx, { filename: "강의봇.js" });
    return factory(adminsOverride || ["후파"]);
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
    const s = got.join("\n");
    if (s.indexOf(needle) !== -1) pass++; else { fail++; console.log("❌ " + name + "\n   got: " + JSON.stringify(got) + "\n   needs: " + needle); }
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
has("B사담 진단 404 경고", say("B사담", "/강의"), "고정 데이터 파일 없음");
has("모르는 방 진단", say("딴방", "/강의"), "어느 강의에도 없음");
eq("모르는 방 일반 메시지 무시", say("딴방", "봇테스트"), []);

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

// 4. 등록 (조교방에서만)
eq("사담방에서 등록 X", say("A사담", "/등록_안녕_반가워"), []);
has("조교방 등록", say("A조교", "/등록_안녕_반가워"), "✅ 등록했어요 (A사담방·A프반·A조교");
eq("등록 → 사담", say("A사담", "안녕"), ["반가워"]);
eq("등록 → 프리", say("A프리", "안녕"), ["반가워"]);
eq("등록 → 조교도", say("A조교", "안녕"), ["반가워"]);
eq("등록 → B 강의엔 없음", say("B사담", "안녕"), []);
has("프반 등록", say("A조교", "/프반_비밀_프반만"), "✅ 등록했어요 (A프반 /");
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

// 5. 삭제
has("삭제", say("A조교", "/삭제_비밀"), "🗑️ 지웠어요 (/프반");
eq("삭제 후 X", say("A프리", "비밀"), []);
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

// 8. 재시작 + 네트워크 끊김 → 캐시와 등록 파일로 동작
remote = {};
threads = [];
bot = boot();
has("캐시로 시작", say("A사담", "/강의"), "데이터 캐시");
eq("캐시 고정 응답", say("A사담", "봇테스트"), ["A 정상"]);
eq("등록 파일 유지", say("A사담", "안녕"), ["반가워"]);
eq("B 등록 파일 유지", say("B사담", "안녕"), ["B반가워"]);
eq("삭제된 건 안 살아남", say("A프리", "비밀"), []);

// 9. 캐시도 없고 네트워크도 없음 → 조용히, 스레드 1회만
files = {}; remote = {}; threads = [];
bot = boot();
eq("아무것도 없음 → 무응답", say("A사담", "봇테스트"), []);
eq("아무것도 없음 → 무응답 2", say("A사담", "봇테스트"), []);
eq("백그라운드 시도 1분 1회", threads.length, 1);
has("진단은 됨", say("A사담", "/강의"), "강의목록을 아직 못 받았어요");

// 10. 네트워크 복구 후 강의목록만 바뀌어도(방 이름 변경) 반영
setRemote("강의목록.json", null, { "강의": [ { "이름": "강의A", "조교방": "A조교", "사담방": "새사담", "프리미엄방": "A프리" } ] });
setRemote("강의A.json", "강의데이터", { "_공통": { "봇테스트": "A 정상" } });
bot = boot();
eq("바뀐 방 이름 반응", say("새사담", "봇테스트"), ["A 정상"]);
eq("옛 방 이름 무반응", say("A사담", "봇테스트"), []);

console.log(fail === 0 ? `\n✅ 전부 통과 (${pass}개)` : `\n❌ 실패 ${fail}개 / 통과 ${pass}개`);
process.exit(fail ? 1 : 0);
