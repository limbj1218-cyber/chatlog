// 입퇴장·닉변·삭제 감지 시험 (KakaoDB 플러그인 이벤트를 흉내 낸다)
// 사용 (저장소 맨 위에서): node bot/starlight/test/kakaodb.test.mjs [루나|토마토|레몬|하늘|사건]
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const KIND = process.argv[2] || "루나";
const KEY = { "루나": "luna", "토마토": "tomato", "레몬": "lemon", "하늘": "sky", "사건": "sageon" }[KIND];
const SRC = path.resolve("bot/starlight/" + KIND + "봇.js");
let ok = 0, bad = 0;
function t(n, c, i) { if (c) ok++; else { bad++; console.log("FAIL", n, i === undefined ? "" : JSON.stringify(i)); } }

const files = {};
const PLAT = {
    read: (n) => (n in files ? files[n] : null),
    write: (n, d) => { files[n] = String(d); return true; },
    send: (r, m) => { sent.push("[PLAT " + r + "] " + m); return true; },
    fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
    setTimeout: () => 0, setInterval: () => 0
};
globalThis.KakaoDB = { isConnected: true };
let sent = [];
const mod = await import(pathToFileURL(SRC).href);
let body = mod.default([KIND], ["후파"], PLAT);
t("감지가 본체에 있음", body.kakao && typeof body.kakao.joined === "function");

// 가짜 자바 리스트 (size/get 만 있음)
const jlist = (arr) => ({ size: () => arr.length, get: (i) => arr[i] });
const U = (id, name, extra) => Object.assign({ id: String(id), name, isMe: false }, extra || {});
let members = [U(1, "철수"), U(2, "영희"), U(99, "봇", { isMe: true })];
function kroom(name, custom) {
    return { name, customName: custom || null, send: (m) => { sent.push(m); return true; }, getMembers: () => jlist(members) };
}
const R = kroom(KIND);
function ev(fn, e) { sent = []; body.kakao[fn](Object.assign({ room: R }, e)); return sent.join("\n"); }
function say(sender, msg) {
    sent = [];
    body.response(KIND, msg, sender, true, { reply: (m) => sent.push(m) }, { name: sender, hash: null });
    return sent.join("\n");
}

// ── 입장 ──
members.push(U(3, "민수"));
let r = ev("joined", { members: jlist([U(3, "민수")]), isOpenLinkJoin: true });
t("처음 온 사람", r === "민수님 어서오세요", r);
r = ev("joined", { members: jlist([U(4, "지수"), U(5, "현우")]) });
t("여럿이 한 번에", r === "지수님 어서오세요\n현우님 어서오세요", r);
t("봇 자신은 환영 안 함", ev("joined", { members: jlist([U(99, "봇", { isMe: true })]) }) === "");

// ── 퇴장·재입장 (원래 있던 사람은 처음 이벤트 때 멤버 목록에서 미리 적힘) ──
r = ev("left", { member: U(2, "영희"), isKicked: false });
t("나감", r === "영희님이 나가셨어요", r);
r = ev("joined", { members: jlist([U(2, "영희")]) });
t("원래 있던 사람이 돌아옴", r === "영희님 돌아오신걸 환영해요", r);
ev("left", { member: U(2, "영희"), isKicked: false });
r = ev("joined", { members: jlist([U(2, "영희짱")]) });
t("대화명 바꿔 돌아옴", r === "영희짱님(구 영희님) 돌아오신걸 환영해요", r);
r = ev("left", { member: U(1, "철수"), isKicked: true });
t("내보내짐", r === "철수님이 내보내졌어요", r);
r = ev("joined", { members: jlist([U(3, "민수")]) });
t("새로 온 사람도 두 번째엔 돌아옴", r === "민수님 돌아오신걸 환영해요", r);

// ── 닉변 (말할 때) ──
const M = (id, name, text, extra) => Object.assign({ senderId: String(id), sender: U(id, name), text, type: "TEXT", isMine: false }, extra || {});
t("이름 그대로면 조용", ev("message", { message: M(4, "지수", "안녕") }) === "");
r = ev("message", { message: M(4, "지수2", "안녕") });
t("닉변 알림", r === "🔄 대화명 변경: 지수 → 지수2", r);
t("봇 메시지 무시", ev("message", { message: M(99, "봇2", "x", { isMine: true }) }) === "");
t("모르던 사람이 말하면 조용히 적음", ev("message", { message: M(50, "새얼굴", "ㅎㅇ") }) === "");
ev("message", { message: M(5, "현우", "a") });
ev("message", { message: M(5, "현우2", "b") });
r = ev("message", { message: M(5, "현우3", "c") });
t("닉변 알림 — 쓴 이름 누적", r === "🔄 대화명 변경: 현우 → 현우2 → 현우3", r);
t("이름 그대로면 다시 안 알림", ev("message", { message: M(5, "현우3", "d") }) === "");

// ── 오픈채팅: 친구 이름이 섞여 와도 닉변으로 안 친다 (2026-11-16 "[조교]후파 → 횡횡 → [조교]후파") ──
{
    const OR = Object.assign(kroom("오픈방"), { isOpenChat: true });
    body = mod.default([KIND, "오픈방"], ["후파"], PLAT);
    const om = (id, name, kind, text) => ({ senderId: String(id), sender: U(id, name, { kind }), text, type: "TEXT", isMine: false });
    const oev = (m) => { sent = []; body.kakao.message({ room: OR, message: m }); return sent.join("\n"); };
    oev(om(60, "[조교]후파", "open_member", "안녕"));
    t("오픈채팅 — 친구 이름은 무시", oev(om(60, "횡횡", "friend", "/닉변감지")) === "");
    t("오픈채팅 — 다시 프로필 이름이어도 조용", oev(om(60, "[조교]후파", "open_member", "x")) === "");
    t("오픈채팅 — 진짜 닉변은 알림", oev(om(60, "후파짱", "open_member", "y")) === "🔄 대화명 변경: [조교]후파 → 후파짱");
    body = mod.default([KIND], ["후파"], PLAT);
}
r = say("아무개", "/닉변감지");
t("/닉변감지 — 카톡 DB 기록", r.indexOf("지수 → 지수2") !== -1 && r.indexOf("영희 → 영희짱") !== -1 && r.indexOf("50") === -1, r);

// ── 삭제 ──
r = ev("deleted", { messageId: "777", message: M(4, "지수2", "비밀 얘기") });
t("삭제 알림 + 내용", r === "🗑️ 지수2님이 메시지를 지웠어요\n비밀 얘기", r);
r = ev("deleted", { messageId: "778", message: M(4, "지수2", "", { type: "PHOTO" }) });
t("사진 삭제", r === "🗑️ 지수2님이 메시지를 지웠어요\n(사진)", r);
t("내용 모르면 조용", ev("deleted", { messageId: "779", message: null }) === "");
t("봇이 지운 건 조용", ev("deleted", { messageId: "780", message: M(99, "봇", "x", { isMine: true }) }) === "");

// ── 다른 방·폰에서 바꾼 방 이름 ──
sent = [];
body.kakao.joined({ room: kroom("다른방"), members: jlist([U(70, "남")]) });
t("다른 방 무시", sent.length === 0);
sent = [];
body.kakao.joined({ room: kroom("ROX " + KIND + " 수다방", KIND), members: jlist([U(71, "손님")]) });
t("폰에서 바꾼 방 이름(customName)으로 찾음", sent.join() === "손님님 어서오세요", sent);

// ── /감지 켜고 끄기 ──
r = say("아무개", "/감지");
t("/감지 — 다른 방 이름은 안 보임", r.indexOf("다른방") === -1 && r.indexOf("넘긴 방") === -1 && r.indexOf("입장 ") !== -1, r);
r = say("아무개", "/감지");
t("/감지 상태", r.indexOf("카톡 DB: 연결됨 ✅") !== -1 && r.indexOf("입장 켜짐") !== -1, r);
t("관리자 아니면 못 끔", say("아무개", "/감지 입장 끄기") === "");
r = say("멱살잡힌(후파)", "/감지 입장 끄기");
t("관리자가 끔", r.indexOf("입장 감지를 껐어요") !== -1 && r.indexOf("입장 꺼짐") !== -1, r);
t("꺼지면 환영 안 함", ev("joined", { members: jlist([U(80, "조용")]) }) === "");
say("멱살잡힌(후파)", "/감지 입장 켜기");
r = ev("joined", { members: jlist([U(80, "조용")]) });
t("꺼진 동안 들어온 사람도 기억", r === "조용님 돌아오신걸 환영해요", r);
r = say("멱살잡힌(후파)", "/감지 전부 끄기");
t("전부 끄기", r.indexOf("입장 꺼짐 · 퇴장 꺼짐 · 닉변 꺼짐 · 삭제 꺼짐") !== -1, r);
t("전부 꺼지면 삭제도 조용", ev("deleted", { message: M(4, "지수2", "x") }) === "");
say("멱살잡힌(후파)", "/감지 전부 켜기");

// ── 다른 명령은 원래대로 ──
Math.random = () => 0;
r = say("철수", "재련가즈아");
t("재련은 그대로", r.indexOf("철수님, 1 → 2") !== -1, r);
r = say("철수", "/메뉴얼");
t("메뉴얼에 감지 안내", r.indexOf("/감지") !== -1, r);

// ── 다시 불러와도 기억 ──
body = mod.default([KIND], ["후파"], PLAT);
ev("left", { member: U(4, "지수2") });
r = ev("joined", { members: jlist([U(4, "지수3")]) });
t("다시 불러와도 기억", r === "지수3님(구 지수2님) 돌아오신걸 환영해요", r);
t("파일 이름", KEY + "_kakao.json" in files);
const saved = JSON.parse(files[KEY + "_kakao.json"]);
t("ID 는 문자열로 저장", Object.keys(saved.rooms[KIND].users).indexOf("4") !== -1);

// ── 오류가 나도 밖으로 안 나감 (로더가 잡지만 본체도 터지지 않는지) ──
let threw = false;
try { body.kakao.joined({ room: { name: KIND, getMembers: () => { throw new Error("db"); }, send: () => { throw new Error("x"); } }, members: jlist([U(90, "x")]) }); } catch (e) { threw = true; }
t("멤버 목록·보내기 실패해도 안 터짐", !threw);

// ── 옛 기록(v 없음)의 가짜 닉변은 한 번 지우고, 다음에 보이는 이름으로 조용히 맞춘다 ──
files[KEY + "_kakao.json"] = JSON.stringify({ rooms: { [KIND]: { seeded: true, users: {
    "77": { name: "[조교]후파", last: "횡횡", hist: ["[조교]후파", "횡횡", "[조교]후파", "횡횡"] } } } }, off: {} });
body = mod.default([KIND], ["후파"], PLAT);
r = say("아무개", "/닉변감지");
t("정리: 가짜 닉변 기록이 사라짐", r.indexOf("횡횡") === -1, r);
t("정리: 첫 말은 조용히 맞춤", ev("message", { message: M(77, "[조교]후파", "x") }) === "");
r = ev("message", { message: M(77, "후파2", "y") });
t("정리 뒤 진짜 닉변은 알림", r === "🔄 대화명 변경: [조교]후파 → 후파2", r);
t("정리 표시(v2) 저장", JSON.parse(files[KEY + "_kakao.json"]).v === 2);

console.log(ok + " 통과, " + bad + " 실패");
