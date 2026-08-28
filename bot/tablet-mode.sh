#!/system/bin/sh
# ══════════════════════════════════════════════════════════════
#  태블릿 모드 전환 — Android-x86
#  실행:  su  →  sh /sdcard/Download/tablet-mode.sh
#
#  카카오톡은 아래 조건들로 태블릿을 판별합니다. 하나만 빠져도 폰으로 인식됩니다.
#   ① 화면 최소 너비 600dp 이상 (sw600dp)
#   ② ro.build.characteristics 에 tablet 포함
#   ③ 전화(telephony) 기능 없음
# ══════════════════════════════════════════════════════════════
BP=/system/build.prop
say() { echo ""; echo "▶ $*"; }

say "[1/5] 현재 상태"
echo "  characteristics : $(getprop ro.build.characteristics)"
echo "  lcd_density     : $(getprop ro.sf.lcd_density)"
echo "  wm size         : $(wm size 2>/dev/null | tr '\n' ' ')"
echo "  wm density      : $(wm density 2>/dev/null | tr '\n' ' ')"
echo "  telephony       : $(pm list features 2>/dev/null | grep -c telephony) 건"

say "[2/5] root / 쓰기 권한"
[ "$(id -u)" = "0" ] || { echo "✖ su 를 먼저 실행하세요"; exit 1; }
mount -o rw,remount / 2>/dev/null
mount -o rw,remount /system 2>/dev/null
if touch /system/.t 2>/dev/null; then rm -f /system/.t; echo "  쓰기 OK"
else echo "✖ /system 읽기 전용 — build.prop 수정 불가"; exit 1; fi

say "[3/5] build.prop 수정"
setprop_line() {   # setprop_line <키> <값>
  if grep -q "^$1=" "$BP" 2>/dev/null; then
    sed -i "s|^$1=.*|$1=$2|" "$BP"
    echo "  수정: $1=$2"
  else
    echo "$1=$2" >> "$BP"
    echo "  추가: $1=$2"
  fi
}
setprop_line ro.build.characteristics tablet
setprop_line ro.sf.lcd_density 160
# 일부 앱은 아래 값도 참고합니다
setprop_line qemu.hw.mainkeys 0

say "[4/5] 화면 크기 (1280x800 @160dpi → 최소너비 800dp)"
wm size 1280x800 2>&1 | head -2
wm density 160 2>&1 | head -2
echo "  적용됨: $(wm size 2>/dev/null | tail -1) / $(wm density 2>/dev/null | tail -1)"

say "[5/5] 확인"
echo "  build.prop 내용:"
grep -E "^ro.build.characteristics|^ro.sf.lcd_density" "$BP" 2>/dev/null | sed 's/^/    /'

echo ""
echo "═════════════════════════════════"
echo " 재부팅 후 아래를 확인하세요:"
echo "   getprop ro.build.characteristics   → tablet"
echo "   wm size                            → 1280x800"
echo ""
echo " 그다음 Play 스토어에서 '카카오톡' 재설치 →"
echo " 로그인 화면에 QR 코드가 뜨면 성공입니다."
echo "═════════════════════════════════"
echo ""
echo "※ 화면이 잘리면 GRUB 커널 줄에 video=1280x800 을 추가하세요."
