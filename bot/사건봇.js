/**
 * ═══════════════════════════════════════════════════════════
 *  사건봇 — "사건" 방 전용 재련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 재련 시도 (하루 2회)
 *    /랭킹                    → 이 방 참여자들의 재련 랭킹
 *    /등록_명령어_할말        → 명령어 등록 (누구나)
 *    /삭제_명령어             → 등록한 명령어 삭제 (누구나)
 *    /리스트                  → 등록된 명령어 목록
 *    /탐지 할말               → 거짓말 탐지기 (참·거짓·중립 무작위, 누구나)
 *    /경험치 레벨             → ROX 사냥터 추천 (그 레벨~+3 몬스터 중 Base·Job 경험치 1등, 누구나)
 *    /초기화 /삭제            → 관리자 전용
 *
 *  ◆ 제련봇(bot/제련봇.js)과는 완전히 별개다.
 *    - 방이 다르고(사건), 데이터 파일도 따로 쓰며, 파괴/수리 개념이 없다.
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream(readJson/saveJson)이 없는 앱에서는 java.io + JSON 으로 자동 대체
 *    - 저장 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *    - 옛 경로(/sdcard/사건/Database.json)에 데이터가 있으면 자동으로 이어받음
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "사건봇";
var BOT_VER = "1112-5";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = ["사건"];
var ADMINS = ["사업처임병진", "가이아✡", "가이어트"];   // 정확히 일치해야 관리자
// 추가 관리자 — 대화명에 이 낱말이 "들어 있기만" 하면 관리자 (2026-11-12 후파 추가).
// ※ 로더의 MY_ADMINS 가 ADMINS 를 덮어쓰므로, 로더를 다시 붙여넣지 않아도 되게 따로 둔다
var EXTRA_ADMIN_PARTS = ["후파"];
var MAX_ATTEMPTS = 2;                                    // 하루 재련 횟수
// ────────────────────────────────────────────────────────

// ═══════════════ 앱 호환 계층 ═══════════════

function fileRead(path) {
    try {
        if (typeof FileStream !== "undefined" && FileStream && FileStream.read) {
            var r = FileStream.read(path);
            if (r !== null && r !== undefined && String(r) !== "") return String(r);
        }
    } catch (e) {}
    try {
        var f = new java.io.File(path);
        if (!f.exists()) return null;
        var br = new java.io.BufferedReader(
            new java.io.InputStreamReader(new java.io.FileInputStream(f), "UTF-8"));
        var sb = new java.lang.StringBuilder(), line;
        while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
        br.close();
        return String(sb.toString());
    } catch (e) {}
    return null;
}

function fileWrite(path, text) {
    try {
        if (typeof FileStream !== "undefined" && FileStream && FileStream.write) {
            FileStream.write(path, text);
            return true;
        }
    } catch (e) {}
    try {
        var f = new java.io.File(path);
        var parent = f.getParentFile();
        if (parent && !parent.exists()) parent.mkdirs();
        var w = new java.io.OutputStreamWriter(new java.io.FileOutputStream(f, false), "UTF-8");
        w.write(text);
        w.close();
        return true;
    } catch (e) {}
    return false;
}

/** 쓰기 가능한 저장 폴더 자동 선택 (권한 없어도 앱 전용 폴더는 쓸 수 있다) */
function pickBaseDir() {
    var cands = [];
    try {
        var app = android.app.ActivityThread.currentApplication();
        var ext = app.getExternalFilesDir(null);
        if (ext) cands.push(String(ext.getAbsolutePath()));
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/sageon");
    } catch (e) {}
    cands.push("/sdcard/사건");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return "/sdcard/사건";
}

var BASE_DIR = pickBaseDir();
var DATA_FILE = BASE_DIR + "/Database.json";
var LEGACY_FILE = "/sdcard/사건/Database.json";   // 예전 경로 (데이터 이어받기용)

// ═══════════════ 데이터 ═══════════════
// roomUsers 는 원본에서 Set 이었지만, Rhino 호환을 위해 { 이름: true } 객체로 다룬다.
// 파일에는 원본과 같은 배열 형태로 저장하므로 기존 데이터와 호환된다.

if (typeof __SAGEON_DATA__ === "undefined") __SAGEON_DATA__ = null;

function loadData() {
    var raw = fileRead(DATA_FILE);
    if (!raw) raw = fileRead(LEGACY_FILE);

    var parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) {}
    }
    if (!parsed && __SAGEON_DATA__) parsed = __SAGEON_DATA__;
    if (!parsed) parsed = {};

    var rooms = {};
    var src = parsed.roomUsers || {};
    for (var room in src) {
        if (!src.hasOwnProperty(room)) continue;
        rooms[room] = {};
        var list = src[room];
        if (list && list.length) {                    // 저장된 배열 → 객체
            for (var i = 0; i < list.length; i++) rooms[room][list[i]] = true;
        } else if (list) {                            // 이미 객체 형태면 그대로
            for (var n in list) if (list.hasOwnProperty(n)) rooms[room][n] = true;
        }
    }

    return {
        userData: parsed.userData || {},
        dailyLimit: parsed.dailyLimit || {},
        custom: parsed.custom || {},              // { 방: { 명령어: 할말 } } 등록 명령어
        roomUsers: rooms
    };
}

var store = loadData();
var userData = store.userData;
var dailyLimit = store.dailyLimit;
var roomUsers = store.roomUsers;
var custom = store.custom;

function saveData() {
    var out = { userData: userData, dailyLimit: dailyLimit, roomUsers: {} };
    for (var room in roomUsers) {
        if (!roomUsers.hasOwnProperty(room)) continue;
        var arr = [];
        for (var name in roomUsers[room]) {
            if (roomUsers[room].hasOwnProperty(name)) arr.push(name);
        }
        out.roomUsers[room] = arr;                    // 원본과 같은 배열 형태로 저장
    }
    out.custom = custom;
    try { __SAGEON_DATA__ = out; } catch (e) {}       // 파일 저장이 막혀도 메모리에는 유지
    fileWrite(DATA_FILE, JSON.stringify(out));
}

// ═══════════════ 게임 규칙 ═══════════════

var chances = {
    1: [50, 50, 0],
    2: [33, 67, 0],
    3: [25, 75, 0],
    4: [25, 40, 25],
    5: [25, 40, 25],
    6: [20, 40, 25],
    7: [20, 40, 25],
    8: [20, 35, 30],
    9: [20, 35, 30],
    10: [20, 30, 30],
    11: [20, 30, 30],
    12: [20, 25, 30],
    13: [15, 20, 35],
    14: [15, 15, 35],
    15: [0, 0, 0]
};

function refine(level) {
    var row = chances[level] || [0, 0, 0];
    var success = row[0], keep = row[1];
    var rand = Math.random() * 100;
    if (rand < success) return "성공";
    if (rand < success + keep) return "유지";
    return "하락";
}

function isAdmin(sender) {
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i] === sender) return true;
    }
    for (var j = 0; j < EXTRA_ADMIN_PARTS.length; j++) {
        if (EXTRA_ADMIN_PARTS[j] && String(sender).indexOf(EXTRA_ADMIN_PARTS[j]) !== -1) return true;
    }
    return false;
}

// ═══════════════ 명령어 등록 (2026-11-12) ═══════════════
// /등록_명령어_할말 → 그 방에서 "명령어"를 그대로 치면 "할말"을 보낸다.
// /삭제_명령어 로 지우고, /리스트 로 본다. 누구나 넣고 뺄 수 있다 (관리자 아님). 방별로 따로 저장.
// 명령어 쪽엔 "_" 를 못 쓰지만(첫 "_" 에서 끊는다) 할말 쪽 "_"·줄바꿈은 그대로 남는다.
// ※ "/삭제"(관리자 재련값 초기화)와 헷갈리지 않게 지우기는 꼭 "/삭제_" 로 받는다.
// ※ 봇이 이미 쓰는 말(재련가즈아·/랭킹 등)은 등록을 거절한다 — 등록해도 절대 응답할 수 없어서.
var RESERVED = ["재련가즈아", "제련가즈아", "/랭킹", "/확률", "/초기화", "/삭제", "/리스트"];

function isReserved(trigger) {
    var t = trigger.toLowerCase();
    if (RESERVED.indexOf(t) !== -1) return true;
    if (t.indexOf("/등록") === 0 || t.indexOf("/삭제") === 0 || t.indexOf("/탐지") === 0 || t.indexOf("/경험치") === 0) return true;
    if (typeof REPAIR_KEYWORDS !== "undefined") {
        for (var i = 0; i < REPAIR_KEYWORDS.length; i++) {
            if (REPAIR_KEYWORDS[i].toLowerCase() === t) return true;
        }
    }
    return false;
}

/** 등록 관련 명령이면 답장 문구, 아니면 null */
function handleRegister(room, raw) {
    var list = custom[room] || {};

    if (raw.indexOf("/등록_") === 0) {
        var rest = raw.substring(4);
        var cut = rest.indexOf("_");
        var trigger = cut === -1 ? "" : rest.substring(0, cut).trim();
        var text = cut === -1 ? "" : rest.substring(cut + 1);
        if (!trigger || !text.trim()) {
            return "형식: /등록_명령어_할말\n예) /등록_공지_오늘 8시에 모여요";
        }
        if (isReserved(trigger)) {
            return "\"" + trigger + "\" 은(는) 봇이 이미 쓰는 말이라 등록할 수 없습니다.";
        }
        if (list.hasOwnProperty(trigger)) {
            return "\"" + trigger + "\" 은(는) 이미 등록되어 있습니다.\n바꾸려면 /삭제_" + trigger + " 후 다시 등록해 주세요.";
        }
        list[trigger] = text;
        custom[room] = list;
        saveData();
        return "✅ \"" + trigger + "\" 등록 완료! 이제 " + trigger + " 라고 치면 답합니다.";
    }

    if (raw.indexOf("/삭제_") === 0) {
        var name = raw.substring(4).trim();
        if (!name) return "형식: /삭제_명령어";
        if (!list.hasOwnProperty(name)) {
            return "\"" + name + "\" 은(는) 등록된 명령어가 아닙니다. /리스트 로 확인해 주세요.";
        }
        delete list[name];
        saveData();
        return "🗑️ \"" + name + "\" 삭제 완료!";
    }

    if (raw === "/리스트") {
        var names = [];
        for (var k in list) if (list.hasOwnProperty(k)) names.push(k);
        if (!names.length) return "등록된 명령어가 없습니다.\n/등록_명령어_할말 로 누구나 넣을 수 있어요.";
        names.sort();
        return "📋 등록된 명령어 (" + names.length + "개)\n" + names.join("\n");
    }

    return null;
}

// ═══════════════ 거짓말 탐지기 (2026-11-12) ═══════════════
// /탐지 할말 → 참·거짓·중립 중 하나를 무작위로 답한다 (재미용 — 실제로 판별하지 않는다).
// 같은 말이라도 칠 때마다 다르게 나온다 (사용자 요청). 횟수 제한·저장 없음.
var DETECT_RESULTS = [
    { word: "참", icon: "🟢", lines: ["진실 반응입니다. 바늘이 꿈쩍도 안 하네요.", "거짓말 탐지기가 고개를 끄덕입니다.", "맥박·호흡 모두 안정적. 사실로 보입니다."] },
    { word: "거짓", icon: "🔴", lines: ["삐빅! 바늘이 크게 흔들렸습니다.", "동공이 흔들리는 게 포착됐습니다.", "식은땀이 감지됐습니다. 수상하네요."] },
    { word: "중립", icon: "🟡", lines: ["애매합니다. 반은 맞고 반은 틀린 듯해요.", "탐지기도 판단을 보류했습니다.", "진실과 거짓 사이 어딘가에 있습니다."] }
];

/** /탐지 명령이면 답장 문구, 아니면 null */
function handleDetect(raw) {
    if (raw.indexOf("/탐지") !== 0) return null;
    var rest = raw.substring(3);
    if (rest && !/^\s/.test(rest)) return null;   // "/탐지기" 같은 다른 말은 건드리지 않는다
    var claim = rest.trim();
    if (!claim) return "형식: /탐지 할말\n예) /탐지 나는 어제 일찍 잤다";
    var r = DETECT_RESULTS[Math.floor(Math.random() * DETECT_RESULTS.length)];
    var line = r.lines[Math.floor(Math.random() * r.lines.length)];
    if (claim.length > 60) claim = claim.substring(0, 60) + "…";
    return "🔍 거짓말 탐지기\n「" + claim + "」\n\n" + r.icon + " 결과: " + r.word + "\n" + line;
}

// ═══════════════ ROX 경험치 추천 (2026-11-12) ═══════════════
// /경험치 110 → 몬스터 레벨 110~113 중에서 Job 경험치·Base 경험치가 가장 큰 몬스터를 하나씩 알려준다.
// 효율 기준은 "경험치" 하나뿐이다 — HP 는 보지 않는다 (사용자 요청: 어차피 다 한 대에 잡는다).
// 레벨 차이 0~3 이라 경험치 배율은 모두 100%. 경험치가 같으면 표에서 먼저 나온(레벨 낮은) 몬스터.
// 데이터는 "ROX 몬스터 경험치표" 아티팩트(https://claude.ai/artifact/UDrTj3djzfp9sSe95D4x8p)의 282종을 그대로 옮긴 것.
//   (원 출처: GamingPH, 글로벌 서버 2026.11.11 수정본) 표를 고치면 여기도 다시 옮겨야 한다.
// 형식: [레벨, 이름, Base, Job]
var EXP_MONSTERS = [
[1,"포링",32,32],
[2,"파브르",17,17],
[3,"푸파",18,18],
[4,"루나틱",19,19],
[5,"페코페코 알",20,20],
[6,"픽키",21,21],
[7,"드롭프스",33,55],
[8,"콘도르",46,46],
[9,"분노의 픽키",24,24],
[10,"윌로우",50,50],
[11,"로커",78,26],
[12,"촌촌",41,14],
[13,"도둑벌레 알",28,28],
[14,"만드라고라",44,73],
[15,"도둑벌레",23,38],
[16,"세비지 베베",31,31],
[17,"퍼밀리어",32,32],
[18,"데저트 울프 새끼",33,33],
[19,"암컷 도둑벌레",68,68],
[20,"포포링",70,70],
[21,"플랑크톤",45,27],
[22,"호넷",37,37],
[23,"타로우",29,48],
[24,"앰버나이트",176,59],
[25,"수컷 도둑벌레",60,100],
[26,"스포아",62,103],
[27,"크리미",63,21],
[28,"포이즌 스포아",43,129],
[29,"스틸 촌촌",55,33],
[30,"드레인리어",34,56],
[31,"코코",46,46],
[31,"스타이너",46,46],
[32,"더스티네스",35,59],
[32,"스모키",71,24],
[33,"로다 프로그",48,144],
[33,"보컬",144,48],
[34,"카라멜",25,74],
[34,"디노피시스",49,49],
[35,"쿠크레",50,50],
[35,"좀비",125,75],
[36,"히드라",64,38],
[36,"호른",128,77],
[37,"마르틴",26,78],
[37,"요요",78,26],
[38,"가이어스",53,53],
[38,"그리슬",106,106],
[39,"파이어럿 스켈",108,108],
[39,"티비아",162,54],
[40,"헌터 플라이",69,41],
[40,"스켈워커",110,110],
[41,"위스퍼",43,71],
[41,"미스트",214,128],
[42,"아르고스",133,221],
[42,"무카",221,133],
[43,"맨티스",122,122],
[43,"페코페코",275,92],
[44,"메틀러",158,95],
[44,"세비지",142,236],
[45,"아나콘다크",65,195],
[45,"플로라",195,195],
[46,"스콜피온",67,67],
[46,"사스콰치",201,201],
[47,"사이드 와인더",138,138],
[47,"고렘",259,155],
[48,"개미 알",71,71],
[48,"백련옥",89,53],
[49,"마타",146,146],
[49,"호드",146,146],
[50,"앙드레",75,75],
[50,"데저트 울프",113,188],
[51,"피에르",77,77],
[51,"솔져 스켈레톤",193,116],
[52,"바돈",59,99],
[52,"아르지오프",237,237],
[53,"마리나",61,101],
[53,"아쳐 스켈레톤",122,203],
[54,"데니로",83,83],
[54,"프릴도라",166,166],
[55,"비타타",43,128],
[55,"커너투스",64,106],
[56,"휀",131,218],
[56,"미이라",261,87],
[57,"베릿트",178,178],
[57,"마르두크",200,334],
[58,"마린 스피어",91,91],
[58,"이시스",341,205],
[59,"소드피쉬",140,419],
[59,"마이너 우로스",349,209],
[60,"마르스",95,95],
[60,"제롬",238,143],
[61,"아크라우스",123,74],
[61,"오본느",147,245],
[62,"웜테일",202,202],
[62,"레퀴엠",253,152],
[63,"스네이크(보아)",104,312],
[63,"빅풋",234,390],
[64,"울프",268,161],
[64,"파사나",321,321],
[65,"스켈레톤",220,220],
[65,"아누비스",495,165],
[66,"무낙",226,226],
[66,"엘더 윌로우",339,339],
[67,"마르크",116,116],
[67,"본건",232,232],
[68,"도깨비",149,89],
[68,"천하대장군",446,268],
[69,"데비어스",61,184],
[69,"소희",244,244],
[70,"구미호",125,125],
[70,"에기라",125,375],
[71,"호롱",128,128],
[71,"고블린(플레일)",320,192],
[72,"오크 베이비",131,131],
[72,"오크 좀비",295,491],
[73,"고블린(모닝스타)",268,268],
[73,"코볼트(모닝스타)",335,201],
[74,"잭",206,69],
[74,"스켈레톤 제네럴",274,274],
[75,"고블린(해머)",350,210],
[75,"오크 워리어",210,630],
[76,"코볼트(해머)",286,286],
[76,"오크 스켈레톤",429,429],
[77,"고블린(도끼)",292,292],
[77,"구울",292,292],
[78,"거대 위스퍼",335,559],
[78,"마리오네트",149,149],
[79,"고블린(단검)",304,304],
[79,"쁘띠",304,304],
[80,"바포메트 주니어",78,233],
[80,"공중 쁘띠",349,581],
[81,"고블린 아쳐",119,198],
[81,"캐럿",158,158],
[82,"코볼트 아쳐",161,161],
[82,"레이드릭",242,403],
[83,"데비루치",246,82],
[83,"오크 레이디",328,328],
[84,"제노크",334,334],
[84,"피빛의 기사",376,626],
[85,"고블린 스팀라이더",170,510],
[85,"코볼트(도끼)",340,340],
[86,"하이오크",649,389],
[86,"메이저 우로스",519,519],
[87,"나이트 메어",660,396],
[87,"세이지 웜",220,132],
[88,"오크 아쳐",358,358],
[88,"로터자이로",671,403],
[89,"윈드고스트",546,182],
[89,"좀비 프리즈너",182,546],
[90,"레이쓰",833,278],
[90,"리비오",555,555],
[91,"브릴라이트",94,282],
[91,"스팅",141,235],
[92,"크램프",287,96],
[92,"인저스티스",478,287],
[93,"스켈 프리즈너",388,388],
[93,"바소리",485,291],
[94,"알람",296,493],
[94,"심연의 기사",739,443],
[95,"레이드릭 아처",400,400],
[95,"펑크",150,250],
[96,"페노메나",254,152],
[96,"조커",761,457],
[97,"다크 프레임",206,206],
[97,"이블 드루이드",927,309],
[98,"칼리츠버그",470,784],
[98,"배회하는 자",209,627],
[99,"클락",636,212],
[99,"지르타스",424,424],
[100,"펜다르크",323,968],
[100,"시계탑 관리자",645,645],
[101,"트라이 조인트",327,109],
[101,"레글러",164,273],
[102,"조개",166,276],
[102,"타라 프로그",221,663],
[103,"메갈로돈",504,840],
[103,"해달",448,448],
[104,"네레이드",170,284],
[104,"스템웜",341,568],
[105,"에스터",345,115],
[105,"메갈리스",690,690],
[106,"퍼씰",350,583],
[106,"엘리게이터",1049,350],
[107,"갈라파고",354,590],
[107,"페스트",295,177],
[108,"폭력배",478,478],
[108,"아놀리안",478,478],
[109,"게",242,242],
[109,"가고일",484,484],
[110,"스터랙틱 고렘",368,1103],
[110,"머맨",613,368],
[111,"비틀 킹",248,248],
[111,"쵸코",310,186],
[112,"우든 골렘",377,1130],
[112,"헬 푸들",251,251],
[113,"래기드 좀비",635,381],
[113,"듀라한",508,508],
[114,"드래곤 테일",386,643],
[114,"우탄 파이터",1157,386],
[115,"드라이어드",650,390],
[115,"메두사",260,260],
[116,"기벳",395,1184],
[116,"밴시",658,395],
[117,"패러사이트",532,532],
[117,"스톤 슈터",599,998],
[118,"드릴러",404,135],
[118,"우탄 슈터",538,538],
[119,"플레임 스컬",408,136],
[119,"로리 루리",816,816],
[120,"좀비 슬로터",550,550],
[120,"블러디 머더러",825,825],
[121,"브리즈",419,698],
[121,"데몬 펑거스",279,279],
[122,"멘블라트",566,566],
[122,"마린",566,566],
[123,"지오그래퍼",287,861],
[123,"브라운 베나투",574,574],
[124,"슬리퍼",728,437],
[124,"라플레시아",291,291],
[125,"템페스트 디미크",738,443],
[125,"그랜드 페코",885,885],
[126,"블루 베나투",897,299],
[126,"고트",598,598],
[126,"저주받은 묘지기",449,1346],
[127,"오렌지 베나투",455,758],
[127,"선더링 디미크",606,606],
[128,"하피",614,614],
[128,"파이어리 디미크",307,921],
[129,"그린 베나투",622,622],
[129,"프로스트 디미크",622,622],
[130,"아포칼립스",945,945],
[130,"나이트메어 이블 드루이드",473,1418],
[130,"아크담",1418,473],
[131,"메탈링",239,399],
[131,"녹셔스",479,798],
[132,"포르셀리오",162,485],
[132,"블레이저",485,808],
[133,"베노무스",818,491],
[133,"익스플로전",164,491],
[134,"몰",497,166],
[134,"옵시디언",248,414],
[135,"운고리안트",1256,754],
[135,"디아볼릭",419,251],
[136,"어스 딜리터",339,1017],
[136,"미네랄",339,339],
[137,"지그",515,172],
[137,"그리즐리",1029,1029],
[138,"핏맨",521,1562],
[138,"웨이스트 스토브",1301,781],
[139,"스카이 딜리터",702,702],
[139,"라바 골렘",527,1580],
[140,"테디 베어",533,178],
[140,"나이트메어 테러",1598,533],
[141,"아노펠레스",269,449],
[141,"물의 정령",1346,808],
[142,"그렘린",817,1361],
[142,"로윈",908,545],
[143,"시로마",459,275],
[143,"필라",551,918],
[144,"힐 윈드",928,557],
[144,"이스라",557,928],
[145,"비홀더",563,188],
[145,"아이스 울프",375,1125],
[146,"가제티",1137,379],
[146,"반베르크",379,1137],
[147,"아이시클",383,383],
[147,"드로세라",766,766],
[148,"시커",194,581],
[148,"스노이어",1742,581],
[149,"에키오",1173,391],
[149,"호드렘린",391,1173],
[150,"아가브",790,790],
[150,"아이스 타이탄",1185,1185],
[151,"세실 디몬",798,798],
[152,"마가레타 소린",806,806],
[153,"하워드 알트아이젠",814,814],
[154,"에레메스 가일",822,822],
[155,"랜들",830,830],
[156,"셀리아",838,838],
[157,"트렌티니",846,846],
[158,"첸",854,854],
[159,"플라멜",862,862],
[160,"거티",870,870]
];

function expBest(list, col) {
    var best = list[0];
    for (var i = 1; i < list.length; i++) if (list[i][col] > best[col]) best = list[i];
    return best;
}

/** /경험치 명령이면 답장 문구, 아니면 null */
function handleExp(raw) {
    if (raw.indexOf("/경험치") !== 0) return null;
    var rest = raw.substring(4);
    if (rest && !/^[\s\d]/.test(rest)) return null;   // "/경험치표" 같은 다른 말은 건드리지 않는다
    var mm = /^\s*(\d{1,3})\s*$/.exec(rest);
    if (!mm) return "형식: /경험치 레벨\n예) /경험치 110";
    var lv = parseInt(mm[1], 10);
    var list = [];
    for (var i = 0; i < EXP_MONSTERS.length; i++) {
        var d = EXP_MONSTERS[i][0] - lv;
        if (d >= 0 && d <= 3) list.push(EXP_MONSTERS[i]);
    }
    if (!list.length) return lv + "레벨~" + (lv + 3) + "레벨 몬스터가 표에 없습니다.\n(몬스터는 Lv.1~160 까지 있어요)";
    var job = expBest(list, 3), base = expBest(list, 2);
    return "[" + lv + "레벨 기준 추천몬스터]\n잡: " + job[1] + "(exp " + job[3] + ")"
        + "\n베이스 : " + base[1] + "(exp " + base[2] + ")";
}

// ═══════════════ 메시지 처리 ═══════════════

function response(room, msg, sender, isGroupChat, replier) {
    try {
        if (ROOMS.indexOf(room) === -1) return;

        var raw = String(msg).trim();         // 원문 (등록 명령어·할말은 이걸로)
        msg = raw.toLowerCase();
        var today = new Date().toDateString();
        var user;

        // 이 방에서 말한 사람 기록 (랭킹 집계용)
        if (!roomUsers[room]) roomUsers[room] = {};
        roomUsers[room][sender] = true;

        // ── 명령어 등록·삭제·목록 (누구나) ──
        var regReply = handleRegister(room, raw);
        if (regReply !== null) return replier.reply(regReply);

        // ── 거짓말 탐지기 (누구나) ──
        var detectReply = handleDetect(raw);
        if (detectReply !== null) return replier.reply(detectReply);

        // ── ROX 경험치 추천 (누구나) ──
        var expReply = handleExp(raw);
        if (expReply !== null) return replier.reply(expReply);

        // ── 재련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            if (!dailyLimit[sender] || dailyLimit[sender].date !== today) {
                dailyLimit[sender] = { count: 0, date: today };
            }

            if (dailyLimit[sender].count >= MAX_ATTEMPTS) {
                return replier.reply("오늘 할 수 있는 재련 기회를 모두 사용하셨습니다.");
            }

            if (!userData[sender]) userData[sender] = 1;

            var level = userData[sender];
            var prevLevel = level;
            var result = refine(level);
            var message = sender + "님, ";

            if (result === "성공") {
                level++;
                message += prevLevel + " → " + level + " 재련에 성공하셨습니다!";
            } else if (result === "유지") {
                message += prevLevel + " → " + level + " 재련에 실패하셨네요ㅜㅜ";
            } else {
                level = Math.max(1, level - 1);
                message += "재련에 실패하여 " + prevLevel + " → " + level + "로 하락되었습니다ㅠㅠ";
            }

            userData[sender] = level;
            dailyLimit[sender].count++;

            saveData();
            return replier.reply(message);
        }

        // ── 랭킹 ──
        if (msg === "/랭킹") {
            var inRoom = roomUsers[room] || {};
            var arr = [];
            for (user in userData) {
                if (userData.hasOwnProperty(user) && inRoom[user]) arr.push([user, userData[user]]);
            }
            arr.sort(function (a, b) { return b[1] - a[1]; });

            var lines = [];
            for (var i = 0; i < arr.length; i++) {
                lines.push((i + 1) + ". " + arr[i][0] + ": " + arr[i][1] + "재련");
            }
            return replier.reply(lines.length
                ? "[재련 랭킹]\n" + lines.join("\n")
                : "현재 재련 기록이 없습니다.");
        }

        // ── 오늘 횟수 초기화 (관리자) ──
        if (msg === "/초기화") {
            if (!isAdmin(sender)) return replier.reply("해당 명령어를 사용할 수 있는 권한이 없습니다.");
            for (user in dailyLimit) {
                if (!dailyLimit.hasOwnProperty(user)) continue;
                dailyLimit[user].count = 0;
                dailyLimit[user].date = today;
            }
            saveData();
            return replier.reply("모든 사람의 재련 횟수가 초기화되었습니다!");
        }

        // ── 재련값 초기화 (관리자) ──
        if (msg === "/삭제") {
            if (!isAdmin(sender)) return replier.reply("해당 명령어를 사용할 수 있는 권한이 없습니다.");
            for (user in userData) {
                if (userData.hasOwnProperty(user)) userData[user] = 1;
            }
            saveData();
            return replier.reply("모든 유저의 재련값이 1으로 초기화되었습니다.");
        }

        // ── 등록된 명령어 응답 (메시지 전체가 일치할 때) ──
        var rc = custom[room];
        if (rc && rc.hasOwnProperty(raw)) return replier.reply(rc[raw]);

    } catch (e) {
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만 알림)
        try {
            if (String(msg).indexOf("/") === 0) replier.reply("⚠️ 사건봇 오류: " + e);
        } catch (e2) {}
    }
}

// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════
//
// 이 파일을 봇 앱에 "직접" 붙여넣었을 때 메신저봇R 신버전(API2)에서도 동작하도록 등록한다.
// ※ 로더를 통해 불러온 경우엔 로더가 이미 등록했으므로 건너뛴다.
(function registerApi2Direct() {
    if (typeof __ROOMS__ !== "undefined") return;   // 로더 경유 → 중복 등록 방지
    try {
        var b = null;
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            b = BotManager.getCurrentBot();
        } else if (typeof bot !== "undefined" && bot) {
            b = bot;
        }
        if (!b || typeof b.addListener !== "function") return;

        var ev = (typeof Event !== "undefined" && Event && Event.MESSAGE) ? Event.MESSAGE : "message";
        b.addListener(ev, function (m) {
            response(
                String(m.room),
                String(m.content),
                String(m.author ? m.author.name : ""),
                !!m.isGroupChat,
                { reply: function (t) { m.reply(t); } }
            );
        });
    } catch (e) {}
})();
