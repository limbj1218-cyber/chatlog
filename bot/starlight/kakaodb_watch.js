// ═══════════════ 입퇴장·닉변·삭제 감지 (StarLight + KakaoDB 플러그인, 2026-11-16) ═══════════════
// 이 조각은 make_neon.py 가 StarLight 판 본체(bot/starlight/○○봇.js) 안에 넣는다. 메신저봇R 판에는 없다
// (메신저봇R 는 카톡 알림만 받아서 입퇴장·삭제를 알 수 없다).
//
// KakaoDB 플러그인(github.com/mooner1022/starlight-kakaodb)이 카톡 DB 를 읽어 주는 이벤트를 로더가 넘겨 준다:
//   onKakaoMemberJoined → kwJoined, onKakaoMemberLeft → kwLeft, onKakaoMessage → kwMessage, onKakaoMessageDeleted → kwDeleted
// 사람은 카톡 회원 ID(문자열 — 숫자로 바꾸면 자릿수가 깨진다)로 구분한다. StarLight 알림의 sender.id 와 달리 정확하다.
//
//  - 입장: 처음 보는 사람 → "OO님 어서오세요"
//          전에 있던 사람 → "OO님 돌아오신걸 환영해요", 대화명이 바뀌었으면 "OO님(구 XX님) 돌아오신걸 환영해요"
//  - 퇴장: "OO님이 나가셨어요" / 내보내졌으면 "OO님이 내보내졌어요"
//  - 닉변: 말할 때 대화명이 바뀌어 있으면 "🔄 대화명 변경: XX → OO". /닉변감지 는 이 기록으로 보여준다
//  - 삭제: "🗑️ OO님이 메시지를 지웠어요" + 지운 내용
//  - 기록은 data 폴더의 ○○_kakao.json (방마다 사람 ID → 처음 이름·지금 이름·바뀐 이름들)
//  - 처음 쓰는 방은 첫 이벤트 때 카톡 DB 의 멤버 목록으로 지금 있는 사람을 미리 적어 둔다
//    (그래야 원래 있던 사람이 나갔다 오면 "돌아오신걸" 로 맞이한다)
//  - 관리자(후파)가 /감지 입장 끄기 처럼 하나씩 끄고 켠다. /감지 로 상태를 본다

var KW_FILE = "__KW_FILE__";   // make_neon.py 가 봇마다 넣는다 (예: luna_kakao.json)
var KW_KINDS = { "입장": "join", "퇴장": "leave", "닉변": "nick", "삭제": "del" };
var KW_HIST_MAX = 10;
var KW_DEL_MAX = 200;      // 지운 내용은 이만큼만 보여준다
var kwStore = null;
var kwLastEventAt = 0;
var kwLastErr = "";
var kwCounts = {};          // 받은 DB 이벤트 수 (종류별, 다시 컴파일하면 0)
var kwOtherRooms = [];      // 이 봇 방이 아니라서 넘긴 방 이름 (최근 5개) — 방 이름이 안 맞는지 보려고

function kwSaw(kind) {
    kwLastEventAt = new Date().getTime();
    kwCounts[kind] = (kwCounts[kind] || 0) + 1;
}

function kwLoad() {
    if (kwStore) return kwStore;
    var raw = fileRead(KW_FILE);
    try { kwStore = raw ? JSON.parse(raw) : null; } catch (e) { kwStore = null; }
    if (!kwStore || typeof kwStore !== "object") kwStore = {};
    if (!kwStore.rooms) kwStore.rooms = {};
    if (!kwStore.off) kwStore.off = {};
    return kwStore;
}

function kwSave() { fileWrite(KW_FILE, JSON.stringify(kwStore)); }

function kwRoomData(room) {
    var s = kwLoad();
    if (!s.rooms[room]) s.rooms[room] = { seeded: false, users: {} };
    return s.rooms[room];
}

function kwOn(room, kind) {
    var off = kwLoad().off[room];
    return !(off && off[kind]);
}

function kwStr(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

// 자바 리스트 → 배열 (Array.from 이 안 되면 번호로)
function kwList(list) {
    var out = [];
    if (!list) return out;
    try {
        if (typeof list.size === "function" && typeof list.get === "function") {
            var n = list.size();
            for (var i = 0; i < n; i++) out.push(list.get(i));
            return out;
        }
    } catch (e) { out = []; }
    try { out = Array.from(list); } catch (e2) { out = []; }
    if (!out.length && list.length > 0) {
        for (var j = 0; j < list.length; j++) out.push(list[j]);
    }
    return out;
}

/** KakaoDB 방 → 이 봇의 방 이름 (ROOMS 에 없으면 null). 폰에서 방 이름을 바꿔 둔 경우(customName)도 본다 */
function kwRoomName(kroom) {
    if (!kroom) return null;
    var names = [];
    try { names.push(kwStr(kroom.customName)); } catch (e) {}
    try { names.push(kwStr(kroom.name)); } catch (e) {}
    for (var i = 0; i < names.length; i++) {
        if (names[i] && ROOMS.indexOf(names[i]) !== -1) return names[i];
    }
    var label = names[0] && names[1] && names[0] !== names[1] ? names[0] + " / " + names[1] : (names[0] || names[1] || "?");
    var at = kwOtherRooms.indexOf(label);
    if (at !== -1) kwOtherRooms.splice(at, 1);
    kwOtherRooms.unshift(label);
    if (kwOtherRooms.length > 5) kwOtherRooms.length = 5;
    return null;
}

function kwSend(kroom, room, text) {
    var ok = false;
    try { ok = !!kroom.send(String(text)); } catch (e) { ok = false; }
    if (!ok) {
        try { ok = !!(PLAT.send && PLAT.send(room, String(text))); } catch (e2) { ok = false; }
    }
    return ok;
}

/** 처음 쓰는 방: 지금 멤버를 미리 적어 둔다 (방금 들어온 사람 skipIds 는 빼고) */
function kwSeed(kroom, room, skipIds) {
    var rd = kwRoomData(room);
    if (rd.seeded) return;
    rd.seeded = true;
    var now = new Date().getTime();
    try {
        var members = kwList(kroom.getMembers());
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            var id = kwStr(m.id), name = kwStr(m.name);
            if (!id || !name || m.isMe || (skipIds && skipIds[id]) || rd.users[id]) continue;
            rd.users[id] = { name: name, last: name, at: now, seed: true };
        }
    } catch (e) { kwLastErr = "멤버 목록: " + e; }
}

function kwAddHist(rec, name) {
    if (!rec.hist || !rec.hist.length) rec.hist = [rec.name];
    if (rec.hist[rec.hist.length - 1] !== name) rec.hist.push(name);
    while (rec.hist.length > KW_HIST_MAX) rec.hist.splice(1, 1);
}

/** 이 사람의 지금 대화명을 적는다. 바뀌었으면 예전 이름을 돌려준다 (안 바뀌었으면 null) */
function kwSeeName(rd, id, name, now) {
    var rec = rd.users[id];
    if (!rec) { rd.users[id] = { name: name, last: name, at: now }; return null; }
    if (rec.last === name) return null;
    var old = rec.last;
    kwAddHist(rec, name);
    rec.last = name;
    rec.at = now;
    return old;
}

function kwJoined(event) {
    kwSaw("입장");
    var room = kwRoomName(event.room);
    if (!room) return;
    var members = kwList(event.members);
    var skip = {};
    for (var i = 0; i < members.length; i++) skip[kwStr(members[i].id)] = true;
    kwSeed(event.room, room, skip);
    var rd = kwRoomData(room), now = new Date().getTime(), lines = [];
    for (var j = 0; j < members.length; j++) {
        var m = members[j];
        var id = kwStr(m.id), name = kwStr(m.name);
        if (!id || m.isMe) continue;
        if (!name) name = "새 멤버";
        var rec = rd.users[id];
        if (!rec) {
            rd.users[id] = { name: name, last: name, at: now, joins: 1 };
            lines.push(name + "님 어서오세요");
        } else {
            var old = rec.last && rec.last !== name ? rec.last : null;
            if (old) kwAddHist(rec, name);
            rec.last = name;
            rec.at = now;
            rec.left = false;
            rec.joins = (rec.joins || 1) + 1;
            lines.push(old ? name + "님(구 " + old + "님) 돌아오신걸 환영해요" : name + "님 돌아오신걸 환영해요");
        }
    }
    kwSave();
    if (lines.length && kwOn(room, "join")) kwSend(event.room, room, lines.join("\n"));
}

function kwLeft(event) {
    kwSaw("퇴장");
    var room = kwRoomName(event.room);
    if (!room) return;
    var m = event.member;
    if (!m || m.isMe) return;
    var id = kwStr(m.id), name = kwStr(m.name);
    kwSeed(event.room, room, null);
    var rd = kwRoomData(room), now = new Date().getTime();
    if (id) {
        if (name) kwSeeName(rd, id, name, now);
        else if (!rd.users[id]) rd.users[id] = { name: "?", last: "?", at: now };
        rd.users[id].left = true;
        rd.users[id].leftAt = now;
        if (!name) name = rd.users[id].last;
    }
    kwSave();
    if (name && kwOn(room, "leave")) {
        kwSend(event.room, room, event.isKicked ? name + "님이 내보내졌어요" : name + "님이 나가셨어요");
    }
}

function kwMessage(event) {
    kwSaw("메시지");
    var room = kwRoomName(event.room);
    if (!room) return;
    var msg = event.message;
    if (!msg || msg.isMine) return;
    var s = msg.sender;
    var id = kwStr(msg.senderId || (s && s.id)), name = kwStr(s && s.name);
    if (!id || !name || (s && s.isMe)) return;
    var rd = kwRoomData(room);
    if (!rd.seeded) kwSeed(event.room, room, null);
    var old = kwSeeName(rd, id, name, new Date().getTime());
    if (rd.users[id].left) rd.users[id].left = false;
    if (old !== null || !rd.users[id].seenMsg) { rd.users[id].seenMsg = true; kwSave(); }
    if (old !== null && kwOn(room, "nick")) kwSend(event.room, room, "🔄 대화명 변경: " + old + " → " + name);
}

var KW_TYPE_LABEL = { PHOTO: "사진", MULTIPHOTO: "사진 여러 장", VIDEO: "동영상", AUDIO: "음성", FILE: "파일",
    EMOTICON: "이모티콘", STICKER: "이모티콘", ANIMATED_EMOTICON: "이모티콘", LINK: "링크", CONTACT: "연락처",
    LOCATION: "위치", SEARCH: "샵검색" };

function kwDeleted(event) {
    kwSaw("삭제");
    var room = kwRoomName(event.room);
    if (!room || !kwOn(room, "del")) return;
    var msg = event.message;
    if (!msg || msg.isMine) return;           // 지운 메시지가 DB 에 남아 있지 않으면 누가 무엇을 지웠는지 모른다
    var name = kwStr(msg.sender && msg.sender.name) || "누군가";
    var type = kwStr(msg.type), text = kwStr(msg.text);
    var body;
    if (text && (type === "TEXT" || type === "REPLY" || type === "UNKNOWN" || type === "")) {
        body = text.length > KW_DEL_MAX ? text.substring(0, KW_DEL_MAX) + "…" : text;
    } else {
        body = "(" + (KW_TYPE_LABEL[type] || "메시지") + ")";
    }
    kwSend(event.room, room, "🗑️ " + name + "님이 메시지를 지웠어요\n" + body);
}

function kwNickText(room) {
    var rd = kwLoad().rooms[room];
    if (!rd) return null;
    var rows = [];
    for (var id in rd.users) {
        if (!rd.users.hasOwnProperty(id)) continue;
        var r = rd.users[id];
        if (r.hist && r.hist.length >= 2) rows.push({ at: Number(r.at || 0), text: "• " + r.hist.join(" → ") });
    }
    if (!rows.length) return "🕵️ 닉변 감지\n아직 대화명을 바꾼 사람이 없어요.";
    rows.sort(function (a, b) { return b.at - a.at; });
    var lines = [];
    for (var i = 0; i < rows.length && i < 30; i++) lines.push(rows[i].text);
    return "🕵️ 닉변 감지 (" + rows.length + "명)\n" + lines.join("\n") + (rows.length > 30 ? "\n… 외 " + (rows.length - 30) + "명" : "");
}

function kwStatusText(room) {
    var connected = "모름";
    try { if (typeof KakaoDB !== "undefined") connected = KakaoDB.isConnected ? "연결됨 ✅" : "끊김 ❌"; else connected = "플러그인 없음 ❌"; } catch (e) {}
    var rd = kwLoad().rooms[room], n = 0;
    if (rd) for (var k in rd.users) if (rd.users.hasOwnProperty(k)) n++;
    var parts = [];
    for (var ko in KW_KINDS) if (KW_KINDS.hasOwnProperty(ko)) parts.push(ko + " " + (kwOn(room, KW_KINDS[ko]) ? "켜짐" : "꺼짐"));
    var ago = kwLastEventAt ? Math.round((new Date().getTime() - kwLastEventAt) / 1000) + "초 전" : "아직 없음";
    var cnt = [];
    for (var c in kwCounts) if (kwCounts.hasOwnProperty(c)) cnt.push(c + " " + kwCounts[c]);
    var lines = ["👀 감지 상태", "카톡 DB: " + connected, parts.join(" · "), "기억하는 사람: " + n + "명",
        "마지막 DB 이벤트: " + ago + (cnt.length ? " (" + cnt.join(" · ") + ")" : "")];
    if (kwOtherRooms.length) lines.push("이 방이 아니라서 넘긴 방: " + kwOtherRooms.join(", "));
    if (!kwLastEventAt) {
        lines.push("", "DB 이벤트가 하나도 안 왔어요. 확인할 것:",
            "① /루나로더 의 로더가 sl-1116-3 인지 (아니면 로더를 다시 붙여넣기)",
            "② 프로젝트 받을 이벤트에 kakaodb.member.join · leave · message.create · delete",
            "③ 방에서 아무 말이나 하고 몇 초 뒤 /감지 다시");
    }
    if (kwLastErr) lines.push("최근 문제: " + kwLastErr);
    return lines.join("\n");
}

/** 방 명령 — 처리했으면 true. /감지, /감지 입장 끄기, /닉변감지(카톡 DB 기록이 있을 때) */
function kwCommand(room, msg, sender, replier) {
    if (ROOMS.indexOf(room) === -1) return false;
    var t = kwStr(msg).trim();
    if (t === "/감지") { replier.reply(kwStatusText(room)); return true; }
    var m = /^\/감지\s+(입장|퇴장|닉변|삭제|전부)\s+(켜기|끄기)$/.exec(t);
    if (m) {
        if (!isAdmin(sender)) return true;
        var s = kwLoad();
        if (!s.off[room]) s.off[room] = {};
        var kinds = m[1] === "전부" ? ["join", "leave", "nick", "del"] : [KW_KINDS[m[1]]];
        for (var i = 0; i < kinds.length; i++) s.off[room][kinds[i]] = m[2] === "끄기";
        kwSave();
        replier.reply("👀 " + m[1] + " 감지를 " + (m[2] === "끄기" ? "껐어요" : "켰어요") + "\n" + kwStatusText(room));
        return true;
    }
    if (t === "/닉변감지") {
        var txt = kwNickText(room);
        if (txt) { replier.reply(txt); return true; }
    }
    return false;
}
