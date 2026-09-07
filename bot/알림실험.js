/**
 * ═══════════════════════════════════════════════════════════
 *  알림실험 — 카톡이 "메시지 삭제" 때 무슨 알림 이벤트를 주는지 조사한다
 *
 *  오토봇·카페봇과 완전히 별개인 임시 스크립트다. 조사만 하고 아무것도 발송하지 않는다.
 *  결과를 보고 삭제 감지가 가능한지 판단한 뒤, 이 스크립트는 지워도 된다.
 *
 *  ◆ 쓰는 법
 *    1) 봇 앱에 이 파일을 그대로 붙여넣고 컴파일 (로더 없음, 이름 아무거나)
 *    2) 감시할 방에서 메시지를 하나 보내고 → 그 메시지를 삭제
 *    3) 아무 방에서 /알림기록  → 그 사이에 들어온 알림 이벤트를 보여준다
 *       /알림기록삭제 로 비우기
 *
 *  ◆ 왜 필요한가
 *    카톡은 메시지 삭제를 봇에게 알려주지 않는다고 알려져 있다. 다만 이 앱에
 *    NOTIFICATION_POSTED / NOTIFICATION_REMOVED 이벤트가 있어서, 삭제할 때
 *    알림이 취소되거나 갱신된다면 그걸 신호로 쓸 수 있다. 그걸 확인하는 게 목적이다.
 *
 *  ※ ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "알림실험";
var VER = "0907-1";

var KEEP = 60;          // 보관할 이벤트 개수
var SHOW = 15;          // 한 번에 보여줄 개수
var ONLY_KAKAO = true;  // 카카오톡 알림만 기록 (false 면 전부)

var EVENTS = [];        // { t, kind, pkg, info }

function nowText() {
    var d = new Date(), h = d.getHours(), ap = h < 12 ? "오전" : "오후";
    var hh = h % 12; if (hh === 0) hh = 12;
    var mm = d.getMinutes(); if (mm < 10) mm = "0" + mm;
    var ss = d.getSeconds(); if (ss < 10) ss = "0" + ss;
    return ap + " " + hh + ":" + mm + ":" + ss;
}

/** 알림 객체에서 읽을 수 있는 것을 최대한 긁어온다 (앱마다 모양이 다르다) */
function describe(n) {
    var parts = [], k, v;

    var tryGet = function (name, fn) {
        try {
            v = fn();
            if (v !== null && v !== undefined && String(v) !== "") {
                parts.push(name + "=" + String(v));
            }
        } catch (e) {}
    };

    tryGet("pkg", function () { return n.packageName; });
    tryGet("pkg2", function () { return n.getPackageName(); });
    tryGet("title", function () { return n.title; });
    tryGet("text", function () { return n.text; });
    tryGet("content", function () { return n.content; });
    tryGet("room", function () { return n.room; });
    tryGet("id", function () { return n.id; });
    tryGet("key", function () { return n.key; });
    tryGet("tag", function () { return n.tag; });
    tryGet("when", function () { return n.when; });

    // 위에서 못 건진 게 있으면 이름만이라도 남긴다
    if (parts.length === 0) {
        try {
            var names = [], c = 0;
            for (k in n) { names.push(k); if (++c >= 25) break; }
            parts.push("필드: " + names.join(","));
        } catch (e) {}
        try { parts.push("toString=" + String(n).substring(0, 120)); } catch (e) {}
    }
    return parts.join(" | ");
}

function pkgOf(n) {
    try { if (n.packageName) return String(n.packageName); } catch (e) {}
    try { if (n.getPackageName) return String(n.getPackageName()); } catch (e) {}
    return "";
}

function record(kind, n) {
    try {
        var pkg = pkgOf(n);
        if (ONLY_KAKAO && pkg && pkg.indexOf("kakao") === -1) return;
        EVENTS.push({ t: nowText(), kind: kind, pkg: pkg, info: describe(n) });
        while (EVENTS.length > KEEP) EVENTS.shift();
    } catch (e) {
        EVENTS.push({ t: nowText(), kind: kind, pkg: "?", info: "기록 오류: " + e });
    }
}

function dump() {
    if (EVENTS.length === 0) {
        return "📭 기록된 알림 이벤트가 없어요.\n" +
            "감시할 방에서 메시지를 보내고 삭제한 뒤 다시 쳐보세요.\n" +
            "(카카오톡만 기록: " + (ONLY_KAKAO ? "예" : "아니오") + ")";
    }
    var start = EVENTS.length > SHOW ? EVENTS.length - SHOW : 0;
    var out = "🔔 알림 이벤트 " + (EVENTS.length - start) + "개 (보관 " + EVENTS.length + ")\n─────────────";
    for (var i = start; i < EVENTS.length; i++) {
        var e = EVENTS[i];
        out += "\n[" + e.t + "] " + e.kind + "\n  " + e.info;
    }
    return out;
}

// ─── 알림 이벤트 등록 ───

var STATUS = "등록 못 함";

(function registerNotificationEvents() {
    try {
        var b = null;
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            b = BotManager.getCurrentBot();
        } else if (typeof bot !== "undefined" && bot) {
            b = bot;
        }
        if (!b || typeof b.addListener !== "function") return;

        var ok = [];

        try {
            var evPost = (typeof Event !== "undefined" && Event && Event.NOTIFICATION_POSTED)
                ? Event.NOTIFICATION_POSTED : "notificationPosted";
            b.addListener(evPost, function (n) { record("POSTED", n); });
            ok.push("POSTED");
        } catch (e) {}

        try {
            var evRem = (typeof Event !== "undefined" && Event && Event.NOTIFICATION_REMOVED)
                ? Event.NOTIFICATION_REMOVED : "notificationRemoved";
            b.addListener(evRem, function (n) { record("REMOVED", n); });
            ok.push("REMOVED");
        } catch (e) {}

        // 명령을 받기 위한 메시지 리스너
        try {
            var evMsg = (typeof Event !== "undefined" && Event && Event.MESSAGE)
                ? Event.MESSAGE : "message";
            b.addListener(evMsg, function (m) {
                try {
                    var text = String(m.content).trim();
                    if (text === "/알림기록") m.reply(dump());
                    else if (text === "/알림기록삭제") { EVENTS = []; m.reply("🗑️ 비웠어요."); }
                    else if (text === "/알림실험") {
                        m.reply("🧪 알림실험 v" + VER + "\n등록된 이벤트: " + STATUS +
                            "\n보관: " + EVENTS.length + "/" + KEEP +
                            "\n카카오톡만: " + (ONLY_KAKAO ? "예" : "아니오"));
                    }
                } catch (e) {}
            });
            ok.push("MESSAGE");
        } catch (e) {}

        STATUS = ok.length ? ok.join(", ") : "등록 못 함";
    } catch (e) {
        STATUS = "오류: " + e;
    }
})();

// 구버전 API(다크토네이도 등)에서도 명령만은 받도록
function response(room, msg, sender, isGroupChat, replier) {
    try {
        var text = String(msg).trim();
        if (text === "/알림기록") replier.reply(dump());
        else if (text === "/알림기록삭제") { EVENTS = []; replier.reply("🗑️ 비웠어요."); }
        else if (text === "/알림실험") {
            replier.reply("🧪 알림실험 v" + VER + "\n등록된 이벤트: " + STATUS +
                "\n보관: " + EVENTS.length + "/" + KEEP);
        }
    } catch (e) {}
}
