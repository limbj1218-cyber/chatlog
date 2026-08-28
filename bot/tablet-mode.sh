#!/system/bin/sh
# ══════════════════════════════════════════════════════════════
#  태블릿 모드 + 갤럭시탭 위장 — Android-x86
#  실행:  su  →  sh /sdcard/Download/tablet-mode.sh
#
#  왜 위장이 필요한가:
#   카카오톡의 "다른 기기와 함께 사용"은 삼성 갤럭시탭 모델만 허용하는
#   화이트리스트 방식입니다. 화면 크기·characteristics 를 맞춰도
#   모델명이 목록에 없으면 옵션 자체가 나타나지 않습니다.
#
#  위장 대상: 갤럭시탭 S7 Wi-Fi (SM-T870) — 공식 지원 목록에 포함
#
#  되돌리려면:  cp /system/build.prop.bak /system/build.prop  후 재부팅
# ══════════════════════════════════════════════════════════════
BP=/system/build.prop
say() { echo ""; echo "▶ $*"; }

say "[1/6] 현재 상태"
echo "  모델        : $(getprop ro.product.model)"
echo "  제조사      : $(getprop ro.product.manufacturer)"
echo "  브랜드      : $(getprop ro.product.brand)"
echo "  기기        : $(getprop ro.product.device)"
echo "  characteristics: $(getprop ro.build.characteristics)"
echo "  화면        : $(wm size 2>/dev/null | tail -1)"
echo "  밀도        : $(wm density 2>/dev/null | tail -1)"
echo "  telephony   : $(pm list features 2>/dev/null | grep -c telephony) 건"

say "[2/6] root / 쓰기 권한"
[ "$(id -u)" = "0" ] || { echo "✖ su 를 먼저 실행하세요"; exit 1; }
mount -o rw,remount / 2>/dev/null
mount -o rw,remount /system 2>/dev/null
if touch /system/.t 2>/dev/null; then rm -f /system/.t; echo "  쓰기 OK"
else echo "✖ /system 읽기 전용 — 수정 불가"; exit 1; fi

say "[3/6] build.prop 백업"
[ -f "$BP.bak" ] || cp -f "$BP" "$BP.bak"
echo "  $BP.bak (되돌릴 때 사용)"

say "[4/6] 갤럭시탭 S7 (SM-T870) 으로 위장"
put() {   # put <키> <값>
  if grep -q "^$1=" "$BP" 2>/dev/null; then sed -i "s|^$1=.*|$1=$2|" "$BP"
  else echo "$1=$2" >> "$BP"; fi
  echo "    $1=$2"
}
put ro.product.model         SM-T870
put ro.product.name          gts7lwifixx
put ro.product.device        gts7lwifi
put ro.product.brand         samsung
put ro.product.manufacturer  samsung
put ro.build.product         gts7lwifi
put ro.build.characteristics tablet
put ro.sf.lcd_density        160

say "[5/6] 화면 크기 (1280x800 @160dpi = 최소너비 800dp)"
wm size 1280x800 >/dev/null 2>&1
wm density 160 >/dev/null 2>&1
echo "  $(wm size 2>/dev/null | tail -1) / $(wm density 2>/dev/null | tail -1)"

say "[6/6] 전화 기능 비활성화 (폰으로 오인 방지)"
n=0
for f in /system/etc/permissions/android.hardware.telephony*.xml; do
  [ -e "$f" ] || continue
  mv "$f" "$f.bak" 2>/dev/null && { echo "    비활성화: $(basename $f)"; n=$((n+1)); }
done
[ "$n" = "0" ] && echo "    (telephony 권한 파일 없음 — 정상)"

echo ""
echo "═════════════════════════════════════"
echo " 적용된 값 (재부팅 후 반영):"
grep -E "^ro.product.model|^ro.product.manufacturer|^ro.build.characteristics" "$BP" | sed 's/^/   /'
echo ""
echo " 다음 순서로 진행하세요:"
echo "  1) reboot"
echo "  2) getprop ro.product.model      → SM-T870 확인"
echo "  3) 카카오톡 삭제 후 재설치"
echo "  4) 로그인 화면에 '다른 기기와 함께 사용' 또는 QR 코드가 뜨는지 확인"
echo "═════════════════════════════════════"
echo ""
echo "※ 되돌리려면: cp /system/build.prop.bak /system/build.prop && reboot"
