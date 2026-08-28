# 🖥️ 시놀로지 DS718+ 에 안드로이드 올려서 카톡봇 돌리기

폰 없이 NAS만으로 카톡봇을 돌리기 위한 가이드입니다.
**DS718+ 기준**으로 작성했으며, 다른 모델은 CPU/RAM 조건만 다릅니다.

---

## ⚠️ 시작 전에 꼭 읽어주세요

이 방법은 **성공이 보장되지 않습니다.** DS718+ 의 구조적 한계 때문입니다.

| 항목 | 상태 |
|---|---|
| ARM 앱 변환 (카톡 APK) | ✅ Houdini 변환기로 해결 가능 |
| CPU 호환 (SSE4.2 필요) | ✅ Celeron J3455 충족 |
| RAM | ⚠️ **6GB 증설 필수** (기본 2GB로는 불가) |
| **GPU 가속** | ❌ **VMM은 GPU 패스스루 미지원** → 소프트웨어 렌더링, 매우 느림 |
| CPU 성능 | ❌ 저전력 셀러론이 NAS 본업과 함께 부담 |
| 알림(FCM) 수신 | ⚠️ 여기서 막히면 봇이 동작 불가 |

**아래 3개 "관문"에서 막히면 즉시 중단하는 것을 권합니다.**

- 🚧 **관문 A** (7단계) — 구글 로그인 / Play 스토어
- 🚧 **관문 B** (10단계) — 카카오톡 태블릿 설치·QR 로그인
- 🚧 **관문 C** (11단계) — **알림이 실제로 뜨는지** ← 가장 중요

---

## 0. 준비물

### 하드웨어
- **4GB DDR3L SODIMM 1866MHz** 1개 (2만 원 내외) — DS718+ 는 최대 6GB
- 여유 시간 2~3시간

> 💡 **별도 카톡 계정·전화번호가 필요 없습니다.** 9단계에서 이 VM 을 **태블릿으로 인식**시키면
> 카카오톡의 "스마트폰 1대 + 태블릿 1대" 동시 로그인 정책에 따라 **본인 계정을 그대로** 쓸 수 있습니다.

### OS 이미지 — Android-x86 9.0-r2 (권장)

**64비트 ISO 직접 다운로드** (약 921MB):
```
https://sourceforge.net/projects/android-x86/files/Release%209.0/android-x86_64-9.0-r2.iso/download
```

- 릴리스 폴더(다른 파일 필요 시): https://sourceforge.net/projects/android-x86/files/Release%209.0/
- 미러(아카이브): https://archive.org/details/android-x86_64-9.0-r2_202406
- 공식 사이트: https://www.android-x86.org/download

> ⚠️ **`android-x86_64-9.0-r2.iso`** (64비트) 를 받으세요. `android-x86-9.0-r2.iso` (32비트) 는 ARM64 앱 변환이 안 됩니다.

### BlissOS 는 왜 안 쓰나?

원래 BlissOS 를 권했으나, **2026년 8월 기준 공식 배포가 중단**되었습니다.
(차세대 코드베이스 작업 중 — https://blissos.org/status.html)

2023년 아카이브 빌드는 남아 있지만 업데이트·지원이 없습니다:
https://sourceforge.net/projects/blissos-dev/files/

그래서 **현재 확실히 받을 수 있고 문서화도 잘 된 Android-x86 9.0-r2** 를 기준으로 안내합니다.

---

## 1단계 — RAM 증설 (필수)

기본 2GB 상태로는 VM 을 띄울 수 없습니다.

1. NAS 전원 끄고 전원선 분리
2. 드라이브 베이 안쪽 메모리 슬롯에 4GB DDR3L 장착 (총 6GB)
3. 부팅 후 **DSM → 제어판 → 정보 센터** 에서 6GB 인식 확인
4. **DSM → 지원 센터 → 메모리 테스트** 로 정상 동작 확인 권장

---

## 2단계 — ISO 업로드

1. PC 에서 위 링크로 `android-x86_64-9.0-r2.iso` 다운로드
2. **File Station** 으로 NAS 에 업로드 (예: `/homes/admin/iso/`)

---

## 3단계 — VMM 설치 & VM 생성

**패키지 센터 → Virtual Machine Manager** 설치 (Btrfs 볼륨 필요)

**가상 컴퓨터 → 생성 → Linux** 선택 후:

| 설정 | 값 | 비고 |
|---|---|---|
| CPU 코어 | **3** | 4개 다 주면 NAS 본업이 느려짐 |
| 메모리 | **3072 MB** | DSM 에 최소 2GB 는 남겨둘 것 |
| 가상 디스크 | **32 GB** 이상 | |
| 네트워크 | 기본값 (VirtIO) | 안 되면 e1000 으로 변경 |
| **부팅 방식** | **UEFI** | ⚠️ 중요 |
| 비디오 카드 | 기본값 | 선택지가 있으면 `vmvga` 또는 `std` |
| ISO 파일 | 업로드한 ISO | **부팅 순서 1번** |
| 자동 시작 | 켜기 | NAS 재부팅 시 봇 자동 복귀 |

생성 후 **전원 켜기 → 연결** 로 콘솔을 엽니다.

---

## 4단계 — 설치

부팅 메뉴에서 **Installation - Install Android-x86 to harddisk** 선택
→ **Create/Modify partitions** → `Do you want to use GPT?` **`Yes`**

그러면 **cgdisk** 파티션 편집기가 뜹니다.
위/아래 화살표로 **줄(파티션)** 을, 좌우 화살표로 **아래쪽 메뉴**를 고르고 Enter 로 실행합니다.

### ① EFI System 파티션 (512MB)

`free space` 줄을 선택한 뒤 **`[ New ]`** → Enter

| 질문 | 입력 |
|---|---|
| `First sector` | 그냥 **Enter** |
| `Size in sectors or {KMGTP}` | **`512M`** |
| `Hex code or GUID` | **`EF00`** ← ⚠️ EFI System |
| `Enter name` | `EFI` (비워도 됨) |

> `L` 을 누르면 전체 코드 목록을 볼 수 있습니다.
> `EF02`(BIOS boot) 나 `8300` 으로 만들면 **UEFI 부팅이 안 됩니다.**

### ② 안드로이드 파티션 (나머지 전부)

남은 `free space` 줄 선택 → **`[ New ]`** → Enter

| 질문 | 입력 |
|---|---|
| `First sector` | 그냥 **Enter** |
| `Size in sectors` | 그냥 **Enter** (남은 공간 전부) |
| `Hex code or GUID` | 그냥 **Enter** (기본 `8300`) |
| `Enter name` | `Android` |

### ③ 저장 후 종료

1. **`[ Write ]`** → Enter
2. 확인 문구에 **`yes`** 를 전부 타이핑 (y 만 치면 안 됨) → Enter
3. **`[ Quit ]`** → Enter

### ④ 설치 진행

1. 파티션 목록에서 **`sda2`** (Android, 8300) 선택
2. 파일시스템 **`ext4`** → `Yes` (포맷)
3. `Do you want to install EFI GRUB2?` → **`Yes`**
4. `Do you want to install /system directory as read-write?` → **⚠️ 반드시 `Yes`**
   (`No` 로 하면 8단계 ARM 변환기 설치가 불가능합니다)
5. 설치 완료 후 **`Reboot` 누르지 말고 전원 끄기**

**전원 끈 뒤 VM 설정에서 ISO 마운트 해제** 후 다시 켭니다.
(ISO 가 붙어 있으면 계속 설치 화면으로 부팅됩니다)

---

## 5단계 — 첫 부팅

GRUB 메뉴에서 화면이 안 나오면, `e` 를 눌러 커널 줄 끝에 아래를 추가하고 `F10`:

```
nomodeset video=1024x768
```

부팅 후 초기 설정 화면까지 **수 분 걸립니다** — GPU 가속이 없어서 정상입니다.

### 🚧 검은 화면에서 안 넘어가면
- 위 `nomodeset` 을 넣었는지 확인
- `vga=788` 도 추가해보기
- 그래도 안 되면 → **중단하고 대안으로** (맨 아래 참고)

---

## 6단계 — 네트워크 확인

설정 → 네트워크에서 인터넷 연결을 확인합니다. 안 되면 VM 네트워크 어댑터를 e1000 으로 바꿔보세요.

---

## 7단계 — 🚧 관문 A: 구글 로그인

초기 설정에서 **Google 계정 로그인** 진행

- ✅ 로그인 성공 + Play 스토어 열림 → 다음 단계
- ❌ Play 스토어가 없거나 인증 실패 →
  1. `https://opengapps.org` 에서 **x86_64 / 9.0 / pico** 받아 사이드로드, 또는
  2. Google 기기 등록 페이지에서 GSF ID 등록
  3. 그래도 안 되면 **중단** (관문 C 에서 어차피 막힙니다)

---

## 8단계 — ARM 변환기(Houdini) 활성화

카카오톡은 ARM 전용 앱이라 이 과정이 **반드시** 필요합니다.

1. Play 스토어에서 **Terminal Emulator** 설치 (또는 Android-x86 내장 터미널)
2. 터미널에서 실행:

```
su
enable_nativebridge
```

3. 자동으로 `houdini9_y.sfs` 를 내려받아 설치합니다 (인터넷 필요)
4. 완료 후 **재부팅**

### 자주 나는 오류와 해결

**`mount: 'system' not in /proc/mounts`**
Android 9 는 `/system` 이 루트에 포함된 구조(system-as-root)라 정상입니다.
먼저 이미 쓰기 가능한지 확인하세요:
```
touch /system/rwtest && echo "쓰기 OK" && rm /system/rwtest
```
"쓰기 OK" 가 나오면 remount 없이 바로 `enable_nativebridge` 를 실행하면 됩니다.
`Read-only` 라면 루트를 remount:
```
mount -o rw,remount /
```

**`'houdini9_y.sfs' -> '/system/lib/arm': no such file or directory`**
복사 대상 폴더가 없어서 나는 오류입니다. 폴더를 만들고 재실행:
```
su
mkdir -p /system/lib/arm /system/lib64/arm64
chmod 755 /system/lib/arm /system/lib64/arm64
enable_nativebridge
```

> ⚠️ **`/system/bin/arm` 은 만들지 마세요.** 그 자리는 디렉터리가 아니라 실행 파일이 들어갈 곳이라,
> 폴더를 만들면 `can't execute: is a directory` 오류가 납니다.
> 실수로 만들었다면 `rm -rf /system/bin/arm` 으로 지우고 `enable_nativebridge` 를 다시 실행하세요.

**`su` 를 쳐도 `#` 로 안 바뀜**
설정 → **Android-x86 options → Enable root access** 를 켜고 재부팅

### 설치 확인 (재부팅 후)

```
su
getprop ro.dalvik.vm.native.bridge     → libhoudini.so
getprop persist.sys.nativebridge       → 1
ls /system/lib/arm/ | head             → .so 파일들이 보여야 함
ls /system/lib64/arm64/ | head         → .so 파일들이 보여야 함
ls -l /system/bin/houdini              → 실행 파일이 있어야 함
```

> 다운로드가 실패하면 수동 설치: houdini 파일을 `/data/arm/` 에 넣고 `enable_nativebridge` 재실행
> 아카이브: https://archive.org/details/androidx86-houdini

---

## 9단계 — 태블릿으로 인식시키기 ⭐

**이걸 하면 별도 카톡 계정·전화번호가 필요 없습니다.**
카카오톡은 **스마트폰 1대 + 태블릿(또는 PC) 1대** 동시 로그인을 공식 지원하므로,
이 VM 을 태블릿으로 인식시키면 **평소 쓰는 본인 계정을 그대로** 봇에 쓸 수 있습니다.

안드로이드는 두 가지로 태블릿을 판별합니다. **둘 다** 적용하세요.

### ① 화면 크기 (sw600dp 이상)

터미널에서:

```
su
wm size 1280x800
wm density 160
```

> 1280x800 을 160dpi 로 쓰면 최소 너비가 800dp 가 되어 태블릿으로 분류됩니다.
> VM 해상도도 맞추려면 GRUB 커널 줄에 `video=1280x800` 을 넣으세요.

### ② 빌드 속성

```
su
mount -o rw,remount /system
grep -q "^ro.build.characteristics" /system/build.prop   && sed -i 's/^ro.build.characteristics=.*/ro.build.characteristics=tablet/' /system/build.prop   || echo "ro.build.characteristics=tablet" >> /system/build.prop
```

해상도까지 고정하려면 아래도 추가:

```
echo "ro.sf.lcd_density=160" >> /system/build.prop
```

### ③ 재부팅 후 확인

```
getprop ro.build.characteristics     → tablet
wm size                              → Physical size: 1280x800
wm density                           → Physical density: 160
```

---

## 10단계 — 🚧 관문 B: 카카오톡 설치 & QR 로그인

1. Play 스토어에서 **"카카오톡 for Tablet"** 검색 → 설치
   - 검색 결과에 안 나오면 태블릿 인식이 안 된 것 → 9단계 다시 확인
2. 실행하면 **QR 코드**가 화면에 뜹니다
3. **평소 쓰는 폰의 카카오톡** → 더보기 → 설정 → 개인/보안 → **QR 코드 스캔**
4. VM 콘솔 화면의 QR 을 폰으로 촬영해 로그인

- ✅ 로그인 성공 → 다음 단계
- ❌ QR 이 안 뜨거나 로그인 거부 → **중단**

> 💡 **서브기기는 QR 로그인만 가능**합니다 (아이디/비번 로그인 불가).
> 그래서 VM 콘솔을 모니터에 띄워놓고 폰으로 찍으면 됩니다.
>
> ⚠️ 서브기기에서 **로그아웃하면 그 기기의 대화 내역이 사라집니다.** 로그인을 유지하세요.

---

## 11단계 — 🚧 관문 C: 알림 확인 (가장 중요)

**메신저봇R 은 카톡 "알림"을 읽어 동작합니다. 알림이 안 오면 전부 무의미합니다.**

1. VM 카톡에서 테스트할 채팅방의 **알림을 켭니다**
2. 카톡 앱을 **백그라운드로** 보냅니다 (⚠️ 앱을 열어두면 의미 없는 테스트)
3. **다른 사람**이 그 방으로 메시지 전송
4. VM 화면 상단에 **알림이 뜨는지** 확인

- ✅ 알림 뜸 → 성공! 12단계로
- ❌ 알림 안 뜸 → FCM 푸시 미동작. **여기서 중단** (해결 난이도 매우 높음)

> ⚠️ **본인이 폰에서 보낸 메시지는 알림이 안 뜹니다** (같은 계정). 반드시 다른 사람이 보내야 합니다.

---

## 12단계 — 메신저봇R 설치

여기까지 왔다면 일반 안드로이드 태블릿과 동일합니다.

1. **메신저봇R** 설치
2. **알림 접근 권한 / 저장소 권한** 허용
3. 새 봇 생성 → 필요한 로더 붙여넣기:
   - 단톡봇: `bot/로더.js`
   - 제련봇: `bot/제련봇로더.js`
   - 사건봇: `bot/사건봇로더.js`
4. 컴파일 → 전원 ON
5. **다른 사람에게** `/로더` 또는 `핑` 을 쳐달라고 해서 테스트

> ⚠️ **봇 응답이 본인 이름으로 나갑니다.** 태블릿이 본인 계정으로 로그인돼 있기 때문입니다.
> 봇 전용 이름으로 답하게 하려면 별도 계정 + 별도 번호가 필요합니다.

---

## 🔧 문제 해결

| 증상 | 조치 |
|---|---|
| 부팅 시 검은 화면 | GRUB 에서 `nomodeset video=1024x768` 추가 |
| 설치 화면만 반복 | VM 설정에서 **ISO 마운트 해제** 안 함 |
| UEFI 부팅 실패 / GRUB 안 뜸 | EFI 파티션을 `EF00` 이 아닌 코드로 만든 것. 재설치 필요 |
| cgdisk 에서 Write 가 안 됨 | 확인 문구에 `y` 가 아니라 **`yes`** 를 전부 입력해야 함 |
| `enable_nativebridge` 실패 | 8단계의 "자주 나는 오류와 해결" 참고 |
| 카카오톡이 계속 중단됨 | ARM 변환기 미설치가 대부분. 8단계 확인 명령으로 점검 후 카톡 재설치 |
| `can't execute: is a directory` | `/system/bin/arm` 을 폴더로 만든 것. `rm -rf /system/bin/arm` 후 재실행 |
| 마우스가 어긋남 | 해상도를 `1024x768` 로 낮춰 부팅 |
| 극도로 느림 | 정상 (GPU 가속 없음). 코어/메모리 조정하되 NAS 부하 주의 |
| 네트워크 안 됨 | VM 네트워크를 e1000 으로 변경 |
| Play 스토어에 "카카오톡 for Tablet" 이 안 보임 | 태블릿 인식 실패. `getprop ro.build.characteristics` 와 `wm size` 확인 (9단계) |
| QR 코드가 안 뜸 | 태블릿용이 아닌 일반 카카오톡을 설치한 것. 앱 삭제 후 태블릿 버전 재설치 |
| NAS 전체가 느려짐 | VM 메모리·코어를 줄이세요 |

---

## 🛟 막혔을 때의 대안

관문 A/B/C 중 하나라도 실패했다면 아래가 훨씬 빠릅니다.

1. **안 쓰는 미니PC / 구형 노트북에 Android-x86 설치**
   → GPU 가속이 되므로 VM 보다 훨씬 잘 돌아갑니다. 4~11단계를 그대로 사용.

2. **구형 안드로이드 폰 (3~5만 원)**
   → 지금 코드 그대로 즉시 동작. 전력 2W. 가장 확실합니다.

3. **폰 중계 + NAS 두뇌 구성**
   → 폰은 카톡 창구로만 두고, 봇 로직·데이터를 DS718+ Docker 로 이전.
     데이터가 NAS 에 안전하게 남고 개발도 훨씬 편해집니다.
