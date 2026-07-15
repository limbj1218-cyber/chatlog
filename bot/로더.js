/**
 * ═══════════════════════════════════════════════════════════
 *  단톡봇 로더 — 이 파일만 메신저봇R에 붙여넣으면 됩니다.
 *
 *  동작: GitHub에 있는 본체 코드(bot/단톡봇.js)를 읽어와 실행합니다.
 *  - 토큰과 방 목록은 이 로더(폰)에만 존재 → 공개 저장소에 노출 안 됨
 *  - 본체 코드가 갱신되면 방에서 /업데이트 (최고 관리자만) 또는 재컴파일
 *
 *  ★ 아래 두 값만 채우세요 ★
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "단톡봇";

// ── 폰에만 두는 설정 (여기만 수정) ──────────────────────────
var TOKEN = "";                     // ← GitHub Personal Access Token
var MY_ROOMS = [                    // ← 봇이 동작할 방 이름 (카톡과 정확히 일치)
    "임병진",
    // "우리 오픈채팅방",
];
// ────────────────────────────────────────────────────────────

var SUPER_ADMINS = ["후파", "임병진"];   // /업데이트 를 쓸 수 있는 사람 (대화명에 포함되면 허용)
var SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("단톡봇.js");

var remoteResponse = null;   // 깃헙에서 불러온 본체의 response 함수
var loadedAt = null;

function isLoaderAdmin(sender) {
    for (var i = 0; i < SUPER_ADMINS.length; i++) {
        if (String(sender).indexOf(SUPER_ADMINS[i]) !== -1) return true;
    }
    return false;
}

/** 깃헙에서 본체 코드를 내려받아 컴파일하고, 토큰/방목록을 주입 */
function loadRemote() {
    var code = String(org.jsoup.Jsoup.connect(SRC_URL)
        .ignoreContentType(true)
        .userAgent("dantalk-loader")
        .timeout(15000)
        .maxBodySize(0)
        .execute().body());
    if (code.indexOf("function response") === -1) {
        throw "받아온 코드가 올바르지 않아요 (URL 확인 필요)";
    }
    var factory = new Function("__TOKEN__", "__ROOMS__",
        code +
        "\nGITHUB.TOKEN = __TOKEN__;" +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nreturn response;");
    remoteResponse = factory(TOKEN, MY_ROOMS);
    loadedAt = new Date();
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        var text = String(msg).trim();

        // 로더 자체 명령: 본체 코드 새로고침 (최고 관리자만)
        if (text === "/업데이트") {
            if (!isLoaderAdmin(sender)) return;
            loadRemote();
            replier.reply("🔄 깃헙에서 최신 봇 코드를 불러왔어요!");
            return;
        }
        if (text === "/로더") {
            replier.reply("🧩 로더 상태\n본체 로드: " + (remoteResponse ? "정상 ✅" : "아직 안 됨 ❌") +
                (loadedAt ? "\n마지막 로드: " + loadedAt.toLocaleString() : ""));
            return;
        }

        // 본체가 아직 없으면 지금 불러오기 (컴파일 직후 네트워크 실패 대비)
        if (remoteResponse === null) loadRemote();

        remoteResponse(room, msg, sender, isGroupChat, replier, imageDB, packageName);
    } catch (e) {
        try { replier.reply("⚠️ 로더 오류: " + e); } catch (e2) {}
    }
}

// 컴파일 시 미리 로드 (실패해도 첫 메시지 때 다시 시도)
try { loadRemote(); } catch (e) {}
