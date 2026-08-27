/**
 * ═══════════════════════════════════════════════════════════
 *  최소 테스트 스크립트 — 봇 앱이 스크립트에 메시지를 넘겨주는지 확인용
 *
 *  사용법: 새 봇을 하나 만들어 이 코드만 붙여넣고 컴파일 → 전원 ON
 *          방에서 (다른 계정으로) "핑" 이라고 보내면 "퐁" 이 와야 정상.
 *
 *  ※ 여기서도 무반응이면 우리 봇 코드 문제가 아니라
 *    앱 설정(알림 접근 권한 / 방 알림 / 배터리 / 전원 토글) 문제입니다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "테스트";

function handle(room, msg, sender, replier) {
    var text = String(msg).trim();
    if (text === "핑") {
        replier.reply("퐁 ✅\n방: [" + room + "]\n보낸이: [" + sender + "]");
    }
}

// ① 구버전 API (메신저봇R API1 / 다크토네이도 챗봇 등)
function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    handle(room, msg, sender, replier);
}

// ② 신버전 API (메신저봇R API2)
(function () {
    try {
        var b = null;
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            b = BotManager.getCurrentBot();
        } else if (typeof bot !== "undefined" && bot) {
            b = bot;
        }
        if (!b || typeof b.addListener !== "function") return;
        var ev = (typeof Event !== "undefined" && Event && Event.MESSAGE) ? Event.MESSAGE : "message";
        b.addListener(ev, function (msg) {
            handle(
                String(msg.room),
                String(msg.content),
                String(msg.author ? msg.author.name : ""),
                { reply: function (t) { msg.reply(t); } }
            );
        });
    } catch (e) {}
})();
