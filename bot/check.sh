#!/system/bin/sh
# Houdini 상태 진단 — sh /sdcard/Download/check.sh
echo "===== 1. 경로 구조 ====="
for p in /system /system/lib /system/lib64 /system/lib/arm /system/lib64/arm64; do
  printf "%-24s " "$p"
  if [ -L "$p" ]; then echo "심볼릭링크 → $(readlink "$p")"
  elif [ -d "$p" ]; then echo "디렉터리 ($(ls "$p" 2>/dev/null | wc -l) 항목)"
  elif [ -e "$p" ]; then echo "파일"
  else echo "없음"; fi
done
echo ""
echo "===== 2. 실제 경로 ====="
echo "lib   : $(readlink -f /system/lib 2>/dev/null)"
echo "lib64 : $(readlink -f /system/lib64 2>/dev/null)"
echo "zygote: $(getprop ro.zygote)"
echo "arch  : $(uname -m)"
echo ""
echo "===== 3. 마운트 (arm 관련) ====="
mount | grep -iE "arm|squash|binfmt" || echo "(없음)"
echo ""
echo "===== 4. houdini 파일 ====="
ls -l /data/arm/ 2>/dev/null || echo "(/data/arm 없음)"
echo "32비트 실행파일: $(ls -l /system/lib/arm/houdini 2>/dev/null || echo 없음)"
echo "64비트 실행파일: $(ls -l /system/lib64/arm64/houdini64 2>/dev/null || echo 없음)"
echo ""
echo "===== 5. binfmt_misc ====="
if [ -d /proc/sys/fs/binfmt_misc ]; then
  echo "폴더 있음. 내용:"; ls /proc/sys/fs/binfmt_misc 2>&1 | head -10
  echo "register 파일: $([ -e /proc/sys/fs/binfmt_misc/register ] && echo 있음 || echo 없음)"
else
  echo "폴더 없음 (커널 미지원 가능성)"
fi
echo "커널 binfmt 지원: $(grep -c binfmt /proc/filesystems 2>/dev/null) 건"
echo ""
echo "===== 6. 속성 ====="
echo "native.bridge : $(getprop ro.dalvik.vm.native.bridge)"
echo "nativebridge  : $(getprop persist.sys.nativebridge)"
echo ""
echo "===== 7. 루프 장치 ====="
ls /dev/block/loop* 2>/dev/null | head -5
echo "사용중: $(losetup -a 2>/dev/null | wc -l) 개"
