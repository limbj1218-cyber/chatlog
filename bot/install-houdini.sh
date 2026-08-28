#!/system/bin/sh
# ─────────────────────────────────────────────────────────────
#  Houdini (ARM 변환기) 설치 스크립트 — Android-x86 9.0-r2
#
#  VM 터미널에서:
#    su
#    curl -o /data/h.sh https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/install-houdini.sh
#    sh /data/h.sh
# ─────────────────────────────────────────────────────────────
SFS=/data/arm/houdini9_y.sfs
URL=http://dl.android-x86.org/houdini/9_y/houdini.sfs
MNT=/mnt/houdini_tmp

say() { echo ""; echo "▶ $*"; }
die() { echo ""; echo "✖ $*"; exit 1; }

say "[1/7] root 권한 확인"
[ "$(id -u)" = "0" ] || die "root 가 아닙니다. 먼저 'su' 를 실행하세요."
echo "  OK"

say "[2/7] /system 쓰기 가능하게"
mount -o rw,remount / 2>/dev/null
mount -o rw,remount /system 2>/dev/null
if touch /system/.rwtest 2>/dev/null; then
  rm -f /system/.rwtest
  echo "  OK (쓰기 가능)"
else
  echo "  실패. 마운트 상태:"
  mount | grep -E " / |/system"
  die "/system 이 읽기 전용입니다. 설치 시 '/system read-write = Yes' 로 재설치해야 합니다."
fi

say "[3/7] houdini 파일 확인"
mkdir -p /data/arm
SIZE=$(ls -l "$SFS" 2>/dev/null | awk '{print $5}')
if [ -z "$SIZE" ] || [ "$SIZE" -lt 40000000 ]; then
  echo "  파일이 없거나 손상됨 → 다운로드 시작 (약 41MB)"
  (curl -L -o "$SFS" "$URL" || wget -O "$SFS" "$URL") || die "다운로드 실패. 인터넷 연결을 확인하세요."
  SIZE=$(ls -l "$SFS" 2>/dev/null | awk '{print $5}')
fi
echo "  크기: $SIZE 바이트"
[ "$SIZE" -gt 40000000 ] || die "파일이 손상되었습니다. /data/arm/houdini9_y.sfs 를 지우고 다시 실행하세요."

say "[4/7] 이미지 마운트"
mkdir -p "$MNT"
umount "$MNT" 2>/dev/null
MOUNTED=0
# 방법 A: mount -o loop
if mount -t squashfs -o loop,ro "$SFS" "$MNT" 2>/dev/null && [ -n "$(ls -A "$MNT" 2>/dev/null)" ]; then
  MOUNTED=1
  echo "  OK (loop 옵션)"
else
  # 방법 B: losetup 으로 직접 연결
  for n in 0 1 2 3 4 5 6 7 8 9 10 11; do
    DEV="/dev/block/loop$n"
    [ -e "$DEV" ] || continue
    losetup -d "$DEV" 2>/dev/null
    if losetup "$DEV" "$SFS" 2>/dev/null; then
      if mount -t squashfs -o ro "$DEV" "$MNT" 2>/dev/null && [ -n "$(ls -A "$MNT" 2>/dev/null)" ]; then
        MOUNTED=1
        echo "  OK ($DEV)"
        break
      fi
      losetup -d "$DEV" 2>/dev/null
    fi
  done
fi
[ "$MOUNTED" = "1" ] || die "이미지 마운트 실패 (루프 장치 없음). ls /dev/block/loop* 결과를 확인하세요."

say "[5/7] 파일 복사"
mkdir -p /system/lib/arm /system/bin
cp -a "$MNT"/* /system/lib/arm/ || die "복사 실패"
[ -f /system/lib/arm/houdini ] && mv -f /system/lib/arm/houdini /system/bin/houdini
[ -f /system/lib/arm/libhoudini.so ] && mv -f /system/lib/arm/libhoudini.so /system/lib/libhoudini.so
chmod 755 /system/bin/houdini 2>/dev/null
chmod 644 /system/lib/libhoudini.so 2>/dev/null
chmod -R 755 /system/lib/arm 2>/dev/null
echo "  라이브러리 $(ls /system/lib/arm/ 2>/dev/null | wc -l) 개"

say "[6/7] 속성 설정 (재부팅 후에도 유지)"
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

say "[7/7] binfmt_misc 등록"
mount -t binfmt_misc none /proc/sys/fs/binfmt_misc 2>/dev/null
if [ -e /proc/sys/fs/binfmt_misc/register ]; then
  printf ':arm_exe:M::\x7f\x45\x4c\x46\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x28::/system/bin/houdini:P\n' > /proc/sys/fs/binfmt_misc/register 2>/dev/null
  printf ':arm_dyn:M::\x7f\x45\x4c\x46\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00\x28::/system/bin/houdini:P\n' > /proc/sys/fs/binfmt_misc/register 2>/dev/null
  echo "  등록: $(ls /proc/sys/fs/binfmt_misc/ 2>/dev/null | tr '\n' ' ')"
else
  echo "  건너뜀 (부팅 시 자동 등록됨)"
fi

umount "$MNT" 2>/dev/null

echo ""
echo "═══════════ 결과 ═══════════"
echo "houdini 실행파일 : $([ -f /system/bin/houdini ] && echo '있음 ✅' || echo '없음 ❌')"
echo "libhoudini.so    : $([ -f /system/lib/libhoudini.so ] && echo '있음 ✅' || echo '없음 ❌')"
echo "ARM 라이브러리   : $(ls /system/lib/arm/ 2>/dev/null | wc -l) 개"
echo "native.bridge    : $(getprop ro.dalvik.vm.native.bridge)"
echo "nativebridge     : $(getprop persist.sys.nativebridge)"
echo "═══════════════════════════"
echo ""
echo ">> 이제 재부팅한 뒤 카카오톡을 (재)설치하세요."
