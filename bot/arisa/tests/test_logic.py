"""단말기 없이 돌려보는 로직 시험 — python -m pytest, 또는 이 파일을 직접 실행."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from autoworker import chatlog, config, matching  # noqa: E402

DATA = {
    "_공통": {
        "봇테스트": "정상 동작 중",
        "이지워커": "https://example.com/ez",
    },
    "오토2": {
        "질문": "FAQ 안내",
        "궁금": "FAQ 안내",
        "*질문": "FAQ 안내",
        "*궁금": "FAQ 안내",
    },
    "오토2프프": {"피드백": "피드백 안내"},
}


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, minutes: float) -> None:
        self.now += minutes * 60


# ─────────────── 방 이름 별칭 ───────────────


def test_카톡_방이름이_짧은_이름으로_바뀐다():
    assert config.canonical_room("(사담방) 오토워커 2기 [개발남노씨]") == "오토2"
    assert config.canonical_room("(프리미엄반) 오토워커 2기 [개발남노씨]") == "오토2프프"


def test_모르는_방이름은_그대로():
    assert config.canonical_room("공백기 근무표") == "공백기 근무표"
    assert config.canonical_room("아무방") == "아무방"


def test_별칭을_거치면_활성화된_방이_된다():
    for real in config.ROOM_ALIASES:
        assert config.in_rooms(config.canonical_room(real)), real
    assert not config.in_rooms("(사담방) 오토워커 2기 [개발남노씨]")


def test_channel_id_로_찾는다():
    assert config.resolve_room(18490098569406776, "이름이 뭐든") == "오토2"
    assert config.resolve_room(18490098487826738, "") == "오토2프프"


def test_id_를_모르면_이름으로():
    assert config.resolve_room(999, "(사담방) 오토워커 2기 [개발남노씨]") == "오토2"
    assert config.resolve_room(999, "공백기 근무표") == "공백기 근무표"
    assert config.resolve_room(999, "처음보는방") == "처음보는방"


def test_등록된_id_는_전부_활성화된_방이다():
    for cid, short in config.ROOM_IDS.items():
        assert config.in_rooms(short), (cid, short)


def test_별칭이_데이터_키와_이어진다():
    """카톡 이름으로 들어와도 오토봇데이터.json 의 방별 트리거를 찾아야 한다."""
    room = config.canonical_room("(사담방) 오토워커 2기 [개발남노씨]")
    table = matching.table_for(DATA, room)
    assert "질문" in table


# ─────────────── 트리거표 ───────────────


def test_방별이_공통을_덮어쓴다():
    data = {"_공통": {"인사": "공통"}, "오토2": {"인사": "방별"}}
    assert matching.table_for(data, "오토2")["인사"] == "방별"
    assert matching.table_for(data, "오토2프프")["인사"] == "공통"


def test_모르는_방은_공통만():
    table = matching.table_for(DATA, "없는방")
    assert set(table) == {"봇테스트", "이지워커"}


# ─────────────── 전체 일치 ───────────────


def test_전체_일치는_쿨다운이_없다():
    table = matching.table_for(DATA, "오토2")
    cd = matching.Cooldown(clock=FakeClock())
    for _ in range(5):
        assert matching.match(table, "질문", "오토2", cd) == "FAQ 안내"


def test_전체_일치가_포함보다_우선():
    table = {"질문": "정확", "*질문": "포함"}
    cd = matching.Cooldown(clock=FakeClock())
    assert matching.match(table, "질문", "오토2", cd) == "정확"


def test_뒤에_글자가_붙으면_전체_일치가_아니다():
    table = matching.table_for(DATA, "오토2프프")
    cd = matching.Cooldown(clock=FakeClock())
    assert matching.match(table, "이지워커", "오토2프프", cd) == "https://example.com/ez"
    assert matching.match(table, "이지워커 주소", "오토2프프", cd) is None


# ─────────────── 포함 매칭 ───────────────


def test_포함_매칭과_쿨다운():
    table = matching.table_for(DATA, "오토2")
    clock = FakeClock()
    cd = matching.Cooldown(clock=clock)

    assert matching.match(table, "질문 있습니다", "오토2", cd) == "FAQ 안내"
    assert matching.match(table, "또 질문이요", "오토2", cd) is None

    clock.advance(21)
    assert matching.match(table, "또 질문이요", "오토2", cd) == "FAQ 안내"


def test_질문과_궁금은_쿨다운을_공유한다():
    """같은 안내를 가리키므로 20분에 한 번만 나가야 한다."""
    table = matching.table_for(DATA, "오토2")
    cd = matching.Cooldown(clock=FakeClock())
    assert matching.match(table, "이거 궁금해요", "오토2", cd) == "FAQ 안내"
    assert matching.match(table, "질문 있습니다", "오토2", cd) is None


def test_쿨다운은_방마다_따로():
    table2 = matching.table_for(DATA, "오토2")
    cd = matching.Cooldown(clock=FakeClock())
    assert matching.match(table2, "질문 있어요", "오토2", cd) == "FAQ 안내"
    assert matching.match(table2, "질문 있어요", "오토2프프", cd) == "FAQ 안내"


def test_무관한_대화는_무응답():
    table = matching.table_for(DATA, "오토2")
    cd = matching.Cooldown(clock=FakeClock())
    assert matching.match(table, "오늘 날씨 좋네요", "오토2", cd) is None


# ─────────────── /리스트 ───────────────


def test_리스트는_포함_트리거를_표시한다():
    out = matching.list_text(matching.table_for(DATA, "오토2"))
    assert "질문  (말 속에 있어도)" in out
    assert "*질문" not in out
    assert "(6개)" in out


# ─────────────── 시각 읽기 ───────────────


def test_시각_읽기():
    assert chatlog.time_to_min("오후 3:24") == 15 * 60 + 24
    assert chatlog.time_to_min("오전 9:05") == 9 * 60 + 5
    assert chatlog.time_to_min("3:24") == 3 * 60 + 24
    assert chatlog.time_to_min("1530") == 15 * 60 + 30
    assert chatlog.time_to_min("오전 12:10") == 10
    assert chatlog.time_to_min("오후 12:10") == 12 * 60 + 10
    assert chatlog.time_to_min("아무말") == -1
    assert chatlog.time_to_min("99:99") == -1


def test_기록_시각_표기():
    assert chatlog.log_time(datetime(2026, 9, 13, 9, 5)) == "오전 9:05"
    assert chatlog.log_time(datetime(2026, 9, 13, 15, 24)) == "오후 3:24"
    assert chatlog.log_time(datetime(2026, 9, 13, 0, 7)) == "오전 12:07"
    assert chatlog.log_time(datetime(2026, 9, 13, 12, 0)) == "오후 12:00"


# ─────────────── 대화 기록 ───────────────


def _log_with(times: list[str]) -> list[chatlog.Entry]:
    return [chatlog.Entry(t=t, s="홍길동", m=f"메시지 {t}") for t in times]


def test_시각으로_찾기():
    entries = _log_with(["오후 3:20", "오후 3:24", "오후 3:40", "오전 3:24"])
    out = chatlog.log_text(entries, "오토2", "오후 3:24")
    assert "오후 3:20" in out and "오후 3:24" in out
    assert "오후 3:40" not in out
    assert "오전 3:24" not in out


def test_오전오후_안쓰면_양쪽_다_본다():
    entries = _log_with(["오전 3:24", "오후 3:24"])
    out = chatlog.log_text(entries, "오토2", "3:24")
    assert "오전 3:24" in out and "오후 3:24" in out


def test_기록이_없으면_안내():
    assert "기록이 아직 없어요" in chatlog.log_text([], "오토2")


def test_못읽는_시각():
    out = chatlog.log_text(_log_with(["오후 3:24"]), "오토2", "어제쯤")
    assert "시각을 못 읽었어요" in out


def test_보관_개수_제한():
    cl = chatlog.ChatLog(rooms=["오토2"])
    for i in range(3100):
        cl.add("오토2", "홍길동", f"m{i}")
    assert cl.count("오토2") == 3000
    assert cl.data["오토2"][-1].m == "m3099"


def test_등록되지_않은_방은_기록하지_않는다():
    cl = chatlog.ChatLog(rooms=["오토2"])
    assert cl.add("오토2", "a", "x") is True
    assert cl.add("다른방", "a", "x") is False
    assert cl.count("다른방") == 0


def test_저장_복원():
    cl = chatlog.ChatLog(rooms=["오토2"])
    cl.add("오토2", "홍길동", "안녕")
    other = chatlog.ChatLog(rooms=["오토2"])
    other.load_dict(cl.to_dict())
    assert other.count("오토2") == 1
    assert other.data["오토2"][0].m == "안녕"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"  ok   {name}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {name}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERR  {name}: {type(e).__name__}: {e}")
    print("─" * 50)
    print("모두 통과" if not failed else f"{failed}건 실패")
    sys.exit(1 if failed else 0)
