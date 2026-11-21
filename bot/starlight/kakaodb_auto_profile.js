// ═══════════════ 오픈프로필 입장 안내 (오토봇만, 2026-11-16) ═══════════════
// make_neon_auto.py 가 kakaodb_watch.js 다음에 넣는다. 들어온 사람이 오픈프로필이면
// 안내 글과 폰에 저장된 안내 사진을 그 방에 보낸다 (오토봇 방 전부 — 사용자 요청).
//
//  - 프로필 종류는 카톡 DB 오픈채팅 멤버의 profile_type. 뜻은 공식 문서가 없고, 알려진 값은
//    1 = 카카오톡 기본 프로필, 2 = 닉네임 프로필, 16 = 오픈프로필 → 오픈프로필(KW_OPEN_PROFILE)일 때만 안내한다
//    (2026-11-21 사용자: 닉네임 프로필(2)은 괜찮다 — 예전엔 1 이 아니면 다 안내했다).
//    값을 모를 때(DB 에 아직 없음)는 아무 말도 안 한다. /내프로필 로 실제 값을 확인할 수 있다
//  - 사진은 StarLight 의 room.sendMedia(폰 경로) — 카톡 공유 화면을 거쳐 보낸다("다른 앱 위에 표시" 필요).
//    경로는 /프로필사진 경로 (관리자)로 바꾸고, 사진을 못 보내도 안내 글은 간다
//  - /감지 프로필 끄기·켜기 (관리자)로 방마다 끈다

KW_KINDS["프로필"] = "profile";
var KW_OPEN_PROFILE = [16];
var KW_PROFILE_TEXT = "님, 오픈프로필로 들어오셨어요. 사진을 참고 하셔서 카카오톡 기본 프로필로 바꿔 주세요 🙏";
var KW_PHOTO_DEFAULT = "/sdcard/Download/오픈프로필안내.jpg";
var kwPhotoLast = "";      // 마지막 사진 보내기 결과 (/감지 에 보인다)

function kwPhotoPath() {
    var p = kwLoad().profilePhoto;
    return p ? String(p) : KW_PHOTO_DEFAULT;
}

/** 카톡 DB 사용자 → 프로필 종류 숫자 (모르면 null) */
function kwProfileType(user) {
    if (!user) return null;
    try {
        var j = JSON.parse(String(user.toJson()));
        if (j && j.profileType !== undefined && j.profileType !== null) return Number(j.profileType);
    } catch (e) {}
    try { if (user.profileType !== undefined && user.profileType !== null) return Number(user.profileType); } catch (e2) {}
    return null;
}

function kwProfileName(t) {
    if (t === null) return "모름";
    if (t === 1) return "카카오톡 기본 프로필";
    if (t === 2) return "닉네임 프로필";
    if (t === 16) return "오픈프로필";
    return "알 수 없는 종류";
}

function kwNeedsMainProfile(t) {
    return t !== null && !isNaN(t) && KW_OPEN_PROFILE.indexOf(t) !== -1;
}

/** 방의 카톡 DB 멤버 목록에서 이 사람(id) 찾기 */
function kwFindMember(kroom, id, name) {
    var members = [];
    try { members = kwList(kroom.getMembers()); } catch (e) { return null; }
    for (var i = 0; i < members.length; i++) {
        var m = members[i];
        if (id && kwStr(m.id) === id) return m;
        if (!id && name && kwStr(m.name) === name && kwNameOk(kroom, m)) return m;
    }
    return null;
}

function kwSendPhoto(kroom, room) {
    var path = kwPhotoPath();
    try {
        var p = kroom.sendMedia(path);
        kwPhotoLast = "보내는 중";
        if (p && typeof p.then === "function") {
            p.then(function (r) {
                var err = r && r.error ? String(r.error) : "";
                kwPhotoLast = err ? "실패 — " + err : "보냄 ✅";
            }, function (e) { kwPhotoLast = "실패 — " + e; });
        }
    } catch (e) {
        kwPhotoLast = "실패 — " + e;
        try { if (PLAT.sendMedia) PLAT.sendMedia(room, path); } catch (e2) {}
    }
}

function kwProfileNotice(kroom, room, member) {
    var t = kwProfileType(member);
    if (t === null) {
        // 들어온 직후엔 멤버 정보가 아직 DB 에 없을 수 있다 → 몇 초 뒤 한 번 더 본다
        var later = PLAT.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
        if (!later) return;
        var id = kwStr(member.id), name = kwStr(member.name);
        later(function () {
            try {
                var m2 = kwFindMember(kroom, id, null);
                var t2 = kwProfileType(m2);
                if (kwNeedsMainProfile(t2)) {
                    kwSend(kroom, room, (kwStr(m2 && m2.name) || name) + KW_PROFILE_TEXT);
                    kwSendPhoto(kroom, room);
                }
            } catch (e) { kwLastErr = "프로필 다시 보기: " + e; }
        }, 3000);
        return;
    }
    if (!kwNeedsMainProfile(t)) return;
    kwSend(kroom, room, kwStr(member.name) + KW_PROFILE_TEXT);
    kwSendPhoto(kroom, room);
}

function kwAfterJoin(event, room, members) {
    if (!kwOn(room, "profile")) return;
    for (var i = 0; i < members.length; i++) kwProfileNotice(event.room, room, members[i]);
}

function kwExtraCommand(room, t, sender, replier) {
    if (t === "/내프로필") {
        var kroom = kwRooms[room];
        if (!kroom) { replier.reply("아직 이 방의 카톡 DB 정보를 못 받았어요. 방에서 몇 마디 오간 뒤 다시 쳐 주세요."); return true; }
        var m = kwFindMember(kroom, null, String(sender));
        if (!m) { replier.reply("카톡 DB 멤버 목록에서 '" + sender + "' 님을 못 찾았어요."); return true; }
        var pt = kwProfileType(m);
        replier.reply("🪪 " + sender + "님 프로필\n종류 값: " + (pt === null ? "모름" : pt) + " (" + kwProfileName(pt) + ")\n" +
            (kwNeedsMainProfile(pt) ? "→ 들어올 때 기본 프로필 안내를 받는 종류예요" : "→ 안내 안 받는 종류예요"));
        return true;
    }
    if (t === "/프로필사진" || t.indexOf("/프로필사진 ") === 0) {
        if (!isAdmin(sender)) return true;
        var path = t.substring("/프로필사진".length).trim();
        if (path) {
            if (path.charAt(0) !== "/") { replier.reply("경로는 / 로 시작해야 해요. 예) /프로필사진 /sdcard/Download/안내.jpg"); return true; }
            kwLoad().profilePhoto = path;
            kwSave();
        }
        replier.reply("🖼️ 안내 사진: " + kwPhotoPath() + (path ? " 으로 바꿨어요" : "") + "\n(마지막 보내기: " + (kwPhotoLast || "아직 없음") + ")");
        return true;
    }
    return false;
}

function kwStatusExtra(room) {
    return "프로필 안내 사진: " + kwPhotoPath() + " (마지막 보내기: " + (kwPhotoLast || "아직 없음") + ")";
}
