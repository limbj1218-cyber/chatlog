#!/system/bin/sh
# ══════════════════════════════════════════════════════════════
#  Houdini (ARM 변환기) 설치 — Android-x86 9.0-r2 / 32비트 + 64비트
#
#  VM 터미널에서:
#    su
#    sh /sdcard/Download/install-houdini.sh
#
#  동작 원리 (원본 enable_nativebridge 와 동일):
#   - sfs 를 "복사"하지 않고 /system/lib/arm 에 "마운트" 한다
#   - 그래서 /system 쓰기 권한은 폴더를 만들 때만 필요
#   - 파일명은 반드시 houdini.sfs (32비트) / houdini64.sfs (64비트)
# ══════════════════════════════════════════════════════════════
ARM_DIR=/data/arm
D32=/system/lib/arm
D64=/system/lib64/arm64
BF=/proc/sys/fs/binfmt_misc
U32=http://dl.android-x86.org/houdini/9_y/houdini.sfs
U64=http://dl.android-x86.org/houdini/7_z/houdini.sfs

say()  { echo ""; echo "▶ $*"; }
die()  { echo ""; echo "✖ $*"; exit 1; }

say "[1/7] root 확인"
[ "$(id -u)" = "0" ] || die "root 가 아닙니다. 먼저 su 를 실행하세요."
echo "  OK"

say "[2/7] /system 쓰기 모드"
mount -o rw,remount / 2>/dev/null
mount -o rw,remount /system 2>/dev/null
if touch /system/.rwtest 2>/dev/null; then
  rm -f /system/.rwtest; echo "  OK"
else
  echo "  현재 마운트:"; mount | grep -E " / |/system"
  die "/system 이 읽기 전용입니다. '/system read-write = Yes' 로 재설치가 필요합니다."
fi

say "[3/7] 마운트 지점 준비"
# 이미 마운트돼 있으면 먼저 해제 (재실행 대비)
for d in "$D32" "$D64"; do
  if mount | grep -q " $d "; then umount -f "$d" 2>/dev/null; fi
done
mkdir -p "$D32" "$D64" "$ARM_DIR" || die "폴더 생성 실패"
echo "  $D32 / $D64 준비됨"

say "[4/7] houdini 파일 준비"
cd "$ARM_DIR" || die "$ARM_DIR 접근 불가"
# 예전에 받아둔 파일이 있으면 재사용
[ -f houdini.sfs   ] || { [ -f houdini9_y.sfs ] && cp -f houdini9_y.sfs houdini.sfs; }
[ -f houdini64.sfs ] || { [ -f houdini7_z.sfs ] && cp -f houdini7_z.sfs houdini64.sfs; }

get() {   # get <파일> <URL> <최소크기>
  sz=$(ls -l "$1" 2>/dev/null | awk '{print $5}')
  if [ -n "$sz" ] && [ "$sz" -gt "$3" ]; then echo "  $1 : 이미 있음 ($sz)"; return 0; fi
  echo "  $1 다운로드 중..."
  rm -f "$1"
  (busybox wget -O "$1" "$2" || wget -O "$1" "$2" || curl -L -o "$1" "$2") >/dev/null 2>&1
  sz=$(ls -l "$1" 2>/dev/null | awk '{print $5}')
  [ -n "$sz" ] && [ "$sz" -gt "$3" ] || { echo "  !! $1 받기 실패"; return 1; }
  echo "  $1 : 받음 ($sz)"
}
get houdini.sfs   "$U32" 40000000 || die "32비트 houdini 준비 실패 (인터넷 확인)"
get houdini64.sfs "$U64" 35000000 && HAS64=1 || { HAS64=0; echo "  (64비트는 건너뜁니다)"; }

say "[5/7] 마운트"
do_mount() {   # do_mount <sfs> <대상>
  busybox mount -o loop,ro "$1" "$2" 2>/dev/null && return 0
  mount -t squashfs -o loop,ro "$1" "$2" 2>/dev/null && return 0
  for n in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    dev="/dev/block/loop$n"; [ -e "$dev" ] || continue
    losetup -d "$dev" 2>/dev/null
    if losetup "$dev" "$1" 2>/dev/null; then
      mount -t squashfs -o ro "$dev" "$2" 2>/dev/null && return 0
      losetup -d "$dev" 2>/dev/null
    fi
  done
  return 1
}
if do_mount "$ARM_DIR/houdini.sfs" "$D32"; then
  echo "  32비트 OK ($(ls "$D32" | wc -l) 개)"
else
  die "32비트 마운트 실패. ls /dev/block/loop* 결과를 확인하세요."
fi
if [ "$HAS64" = "1" ]; then
  if do_mount "$ARM_DIR/houdini64.sfs" "$D64"; then
    echo "  64비트 OK ($(ls "$D64" | wc -l) 개)"
  else
    echo "  !! 64비트 마운트 실패 (32비트만 사용)"; HAS64=0
  fi
fi

say "[6/7] binfmt_misc 등록"
[ -e "$BF/register" ] || mount -t binfmt_misc none "$BF" 2>/dev/null
if [ -e "$BF/register" ]; then
  for n in arm_exe arm_dyn arm64_exe arm64_dyn; do
    [ -e "$BF/$n" ] && echo -1 > "$BF/$n" 2>/dev/null
  done
  echo ':arm_exe:M::\x7f\x45\x4c\x46\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x28::'"$D32/houdini:P" > "$BF/register" 2>/dev/null
  echo ':arm_dyn:M::\x7f\x45\x4c\x46\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00\x28::'"$D32/houdini:P" > "$BF/register" 2>/dev/null
  if [ "$HAS64" = "1" ]; then
    echo ':arm64_exe:M::\x7f\x45\x4c\x46\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\xb7::'"$D64/houdini64:P" > "$BF/register" 2>/dev/null
    echo ':arm64_dyn:M::\x7f\x45\x4c\x46\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00\xb7::'"$D64/houdini64:P" > "$BF/register" 2>/dev/null
  fi
  echo "  등록됨: $(ls "$BF" | grep arm | tr '\n' ' ')"
else
  echo "  !! binfmt_misc 사용 불가 (커널 미지원)"
fi

say "[7/7] 속성 설정 (재부팅 후 자동 적용)"
setprop ro.dalvik.vm.native.bridge libhoudini.so
setprop persist.sys.nativebridge 1
if grep -q "^ro.dalvik.vm.native.bridge" /system/build.prop 2>/dev/null; then
  sed -i 's|^ro.dalvik.vm.native.bridge=.*|ro.dalvik.vm.native.bridge=libhoudini.so|' /system/build.prop
else
  echo "ro.dalvik.vm.native.bridge=libhoudini.so" >> /system/build.prop
fi
grep -q "^persist.sys.nativebridge" /system/build.prop 2>/dev/null \
  || echo "persist.sys.nativebridge=1" >> /system/build.prop
echo "  OK"

echo ""
echo "═════════════ 결과 ═════════════"
echo "32비트 houdini : $([ -f "$D32/houdini" ]   && echo '있음 ✅' || echo '없음 ❌')"
echo "64비트 houdini : $([ -f "$D64/houdini64" ] && echo '있음 ✅' || echo '없음 ❌  (카톡 arm64 불가)')"
echo "arm  라이브러리: $(ls "$D32" 2>/dev/null | wc -l) 개"
echo "arm64 라이브러리: $(ls "$D64" 2>/dev/null | wc -l) 개"
echo "binfmt 등록    : $(ls "$BF" 2>/dev/null | grep arm | tr '\n' ' ')"
echo "native.bridge  : $(getprop ro.dalvik.vm.native.bridge)"
echo "nativebridge   : $(getprop persist.sys.nativebridge)"
echo "════════════════════════════════"
echo ""
echo ">> 재부팅한 뒤 카카오톡을 (재)설치하세요."
echo ">> 재부팅 후 이 스크립트를 다시 실행할 필요는 없습니다 (부팅 시 자동 마운트)."
