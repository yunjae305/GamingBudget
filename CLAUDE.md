# CLAUDE.md — 가계부 앱 인수인계

본인용 안드로이드 가계부 앱. 화면과 기능은 전부 `app/src/main/assets/index.html` 한 파일(바닐라 JS)에 있고, 안드로이드 쪽은 이 파일을 띄우는 WebView 껍데기 + 결제 알림 감지 서비스다.

작업 언어는 한국어. UI 문구도 한국어로 쓴다.

---

## 1. 구조

```
ledger/
├─ app/src/main/assets/index.html   ← 앱 전체 (HTML+CSS+JS 단일 파일, 약 2천 줄)
├─ app/src/main/java/net/nn33/ledger/
│   ├─ MainActivity.java   WebView 호스트, 자동 업데이트, 파일 선택, JS 브리지, 뒤로가기
│   ├─ PayListener.java    NotificationListenerService — 결제 알림 원문 수집
│   ├─ PendingStore.java   수집한 알림을 SharedPreferences에 보관
│   ├─ Reminders.java      하루 예산 알림 — mirror.json 에서 예산·지출을 읽어 아침·저녁 알림, AlarmManager
│   └─ ReminderReceiver / BootReceiver   알람 수신, 재부팅 후 재등록
├─ app/src/main/res/values/strings.xml   update_url (개인 빌드 자동 업데이트 주소)
├─ app/src/main/res/xml/    backup_rules / data_extraction_rules — 자동 백업에 files/ 포함, live/ 제외
├─ tests/                  jsdom 테스트 (npm test): 대기열, 파서 문구 모음, 게임 기록, 백업, 알림 감지 진단, 하루 예산·검색·통계·영수증·알림 설정
├─ tools/                  개발용 — artifact-preview.html(미리보기 무대), setup-android.sh(클라우드 빌드 환경), character-full.png(원본 일러스트)
├─ PRIVACY.md              개인정보처리방침 (스토어 제출용, 알림 접근 권한 설명)
├─ keystore.properties.example   릴리스 서명 설정 본보기 (실제 파일·jks 는 gitignore)
└─ .github/workflows/build-apk.yml   push하면 테스트 → 디버그 APK, 시크릿 있으면 릴리스 APK/AAB
```

빌드: AGP 8.9.1 / Gradle 8.11.1 / JDK 17 / compileSdk 36 / targetSdk 36 / minSdk 24. Gradle 래퍼 jar는 없다(CI는 `gradle/actions/setup-gradle`). 로컬(윈도우 PC): JDK 17 은 `C:\Users\winz\.dal-bbam-android\jdk17\jdk-17.0.20.1+1`, Gradle 8.11.1 은 `~/.gradle/wrapper/dists` 에 캐시돼 있고, Android SDK 는 `C:\Users\winz\AppData\Local\Android\Sdk`. 안드로이드 스튜디오 번들 JBR(25)로는 Gradle 이 안 돈다. **클라우드 세션(리눅스)** 에서는 `tools/setup-android.sh` 가 이 셋을 홈 밑에 깐다(§8).

**빌드 타입이 두 가지다.** `debug` = 개인용(원격 업데이트 켬), `release` = 스토어용(원격 업데이트 끔, `BuildConfig.REMOTE_UPDATE`). release 서명은 `keystore.properties` 또는 `LEDGER_*` 환경 변수에서 읽고, 없으면 서명 없이 빌드된다.

**debug 서명 키도 고정한다** (2026-09-22). 기본 debug 키는 빌드하는 컴퓨터(PC·CI 실행·클라우드 세션)마다 새로 생겨서, 다른 곳에서 만든 APK 는 폰에 덮어쓰기 설치가 거부된다. `app/build.gradle` 이 `app/debug.keystore`(gitignore) → `LEDGER_DEBUG_KEYSTORE_B64` 환경 변수(base64) 순으로 키를 찾고, 둘 다 없으면 자동 키다. 기준 키는 사용자 PC 의 `~/.android/debug.keystore` 이고, 비밀번호·별칭은 기본값(`android`/`androiddebugkey`). CI 는 같은 이름의 시크릿을, 클라우드는 환경 변수를 쓴다(README §5). **키 파일을 저장소에 넣지 않는다** — 공개 저장소라 누구나 사용자 앱 위에 덮어씌워지는 APK 를 만들 수 있게 된다.

## 2. 배포·업데이트 방식 (중요)

- **개인(debug) 빌드만** 원격 업데이트를 한다. 앱이 켜질 때 `update_url`에서 최신 `index.html`을 받아 `files/live/index.html`을 교체한다. **스토어(release) 빌드는 안 한다** — 원격에서 받은 코드가 JS 브리지를 만지는 길을 막기 위해서. 스토어용 갱신은 스토어 배포로.
- APK 의 versionCode 가 바뀌면(설치·업데이트) 항상 APK 안의 원본을 `live/` 에 다시 복사한다. 자동 백업이 옛 `live/` 를 되살리지 못하도록 백업 규칙에서 `live/` 는 제외.
- 켠 뒤 12초 안에 받아지면 즉시 reload, 아니면 다음 실행 때 적용.
- 2KB 미만이거나 앞 400바이트에 `<title>가계부</title>` 이 없으면 무시. 임시 파일에 받은 뒤 rename.
- WebView 는 `appassets.androidplatform.net` 밖으로는 절대 이동하지 않는다(`shouldOverrideUrlLoading` 이 외부 링크를 브라우저로 넘김). 파일·content 접근도 꺼 둠.
- 내부 저장소와 assets 모두 `https://appassets.androidplatform.net` 오리진으로 서빙(WebViewAssetLoader). **오리진이 고정이라 localStorage 데이터가 업데이트 후에도 유지된다.** 이 오리진을 바꾸면 사용자 데이터가 사라지니 절대 바꾸지 말 것.
- `update_url` 은 `https://raw.githubusercontent.com/yunjae305/GamingBudget/main/app/src/main/assets/index.html` (공개 저장소, 2026-09-21 설정). `OWNER/REPO` 가 들어 있으면 업데이트 확인을 건너뛴다.

**APK 재빌드가 필요한 변경**: Java 코드, 매니페스트, 리소스(이름·아이콘). 그 외 화면/기능 변경은 `index.html`만 push하면 된다.

## 3. 네이티브 ↔ 화면 연결

`MainActivity`가 `window.Android`로 노출:
- `takePending()` → 쌓인 알림 JSON 배열 `[{pkg,text,time}]`을 꺼내고 비움
- `hasNotifAccess()` → 알림 접근 허용 여부. `notifConnected()` → 감지 서비스가 실제로 붙어 있는지(삼성 절전으로 끊길 수 있음)
- `openNotifAccess()` / `openBatterySettings()` → 시스템 설정 화면 열기
- `setBars(dark)` → 상태 바·내비 바 아이콘 색과 창 배경. 화면의 `applyTheme` 이 부른다
- `mirror(json)` / `readMirror()` → 전체 기록 미러 `files/mirror.json` 쓰기/읽기 (§4 백업)
- `builtinAiKey()` → 빌드 때 `.env` 에서 박은 AI 키(없으면 ""). 화면의 `aiKey()` 는 설정 키 → 내장 키 순
- `saveFile(name, content)` → 시스템 저장 창(SAF)으로 파일 내보내기. 결과는 `window.__savedFile(ok)` 로 돌아옴
- `rescanNotifs()` → 지금 상태 바에 떠 있는 알림을 다시 훑는다(§3 재스캔). `notifLog()` / `notifStats()` / `clearNotifLog()` / `noteDropped(pkg,text,time,why)` → 알림 감지 진단용 (§4 진단 화면)
- `reminders()` → 하루 예산 알림 상태 `{on,morning,evening,granted,needsPermission}`. `setReminders(on,"HH:MM","HH:MM")` → 저장하고 알람 재등록. `askNotifPermission()` → 안드로이드 13+ 알림 권한 요청(결과 `__notifPerm(granted)`). `testReminder(evening)` → 지금 알림 하나 띄워 보기

네이티브 → 화면: `__pullPending()`(onResume), `__back()`(뒤로가기), `__savedFile(ok)`, `__notifPerm(granted)`, 그리고 창 인셋을 `--sat`/`--sab` CSS 변수로 밀어 넣는다.

**하루 예산 알림** — `Reminders` 가 `AlarmManager.setAndAllowWhileIdle` 로 아침·저녁 다음 회차를 걸고, 울리면 알림을 띄운 뒤 다음 날 것을 다시 건다(정확한 알람 권한 불필요, 절전 중엔 몇 분 늦을 수 있음). 숫자는 화면이 못 보는 시간에도 계산해야 해서 `files/mirror.json` 에서 읽는다 — 화면의 `dailyBudget()` 과 같은 규칙. 총 예산이 없으면 그날은 알림을 띄우지 않는다. 앱 시작(`onCreate`)과 재부팅(`BootReceiver`) 때 `schedule()` 로 재정비. 설정은 SharedPreferences `reminders`(localStorage·백업 밖).

**엣지투엣지**: targetSdk 35+ 는 시스템 바 뒤까지 그리는 게 강제라 `EdgeToEdge.enable` 을 쓰고, 인셋을 재서 페이지의 `--sat`/`--sab` 에 넣는다(index.html 은 `env(safe-area-inset-*)` 대신 이 변수를 쓴다). 키보드가 올라오면 루트 뷰에 그만큼 패딩을 줘서 입력칸이 가려지지 않게 한다.

`onResume`마다 `window.__pullPending()` 호출 → 화면 쪽 `parseOne()`으로 해석해 결제 대기열(`inbox`)에 넣는다. 같은 때 `requestRebind` 로 감지 서비스를 다시 붙인다.

뒤로가기: `MainActivity.BACK_JS`의 `[오버레이 id, 닫기 버튼 id]` 목록을 위에서부터 검사해 열린 것을 닫는다. **새 시트/전체화면을 추가하면 이 목록에도 넣어야 한다.** 다만 페이지가 `window.__back` 을 `Object.defineProperty` setter 로 가로채 두어(달 선택 휠 근처), 네이티브가 덮어쓴 함수를 `nativeBack` 에 받아 두고 자기 오버레이를 먼저 닫는다 — APK 를 못 바꿀 때 임시로 쓰는 길이고, 정식은 BACK_JS 목록이다.

`WebChromeClient.onShowFileChooser`(파일 선택)는 백업 파일 가져오기·영수증 앨범 선택에 쓰고, `<input capture>` 면 카메라 앱을 띄운다(`launchCamera`).

`PayListener` 필터: 금액(`○○원` 또는 `₩○○` — 삼성 월렛은 ₩ 앞머리, 2026-09-26 실기기 확인) + 결제 단어(승인/결제/사용/출금/입금/이체/체크카드/신용카드)가 같이 있어야 하고, 광고/수신거부/쿠폰/이벤트와 결제 예정·청구·명세서 안내는 버린다. 상주 알림(`isOngoing`, 잔액 표시 같은 것)과 그룹 요약도 뺀다. 화면 쪽 `parseOne` 이 더 엄격하게 한 번 더 거른다 — `SKIPWORD`(취소·실패·거절·거부·미승인·결제/출금/납부 예정·청구·광고 — "적립예정" 같은 각주는 안 걸리게 예정은 결제 쪽만)가 있으면 통째로 버리고, 금액은 `payAmount()` 가 고른다: 앞뒤에 잔액·누적·캐시백·적립·포인트가 붙은 "○○원" 은 건너뛰고, 캐시백·페이백·리워드 안내 문장(`CASHBACKLINE`)에서는 바로 뒤에 "결제/승인" 이 붙은 금액만 인정한다(적립·포인트 각주가 붙은 카드 문자는 살린다). 결제 금액이 하나도 안 남으면 버린다(**수치를 정확히 못 읽는 알림은 대기열에 넣지 않는다** — 사용자 결정, 2026-09-23, §6). 버린 이유는 `dropReason()` 이 진단 화면에 남긴다. SMS 권한은 쓰지 않는다 — 문자도 메시지 앱 알림으로 읽는다.

**알림에서 글자를 긁는 범위가 넓다** — `collectText()` 가 title/bigText/text/subText/infoText/summaryText/textLines 에 더해 MessagingStyle 의 `EXTRA_MESSAGES`·`EXTRA_HISTORIC_MESSAGES` 까지 모은다. bigText·text 만 보면 문자(SMS) 결제 알림을 통째로 놓친다 — 삼성·구글 메시지는 MessagingStyle 이라 본문이 `EXTRA_MESSAGES` 에 들어가고, 안 읽은 문자가 여러 건이면 `EXTRA_TEXT` 는 "새 메시지 2개" 같은 요약으로 바뀐다.

**재스캔** — 절전으로 서비스가 끊겨 있던 동안 온 알림은 콜백으로 오지 않는다. 그래서 서비스가 붙을 때(`onListenerConnected`)와 앱이 앞으로 올라올 때(`MainActivity.onResume` → `PayListener.rescan()`) `getActiveNotifications()` 로 상태 바에 남아 있는 알림을 다시 훑는다. 화면의 `pullNow()` 도 `rescanNotifs()` 를 먼저 부른다.

중복 방지는 `PendingStore` 의 `seen` 키 목록이 한다(앱·게시시각·문구 해시, 3일치 300건). 대기열을 비워도 남아 있어서 재스캔이 같은 알림을 두 번 넣지 않는다. 1분 안의 완전히 같은 문구도 1건만(알림 갱신 재게시 대응). **그 외 중복 제거는 하지 않는다(사용자 결정, §6 참고)** — 금액이 같은 별개의 결제는 게시 시각이 달라서 그대로 통과한다.

## 4. index.html 내부

### 저장
`load(path)` / `save(path,obj)` — localStorage(`gb:` 접두어). 저장 400ms 디바운스 뒤 `scheduleMirror()` 가 2.5초 디바운스로 전체 기록을 `Android.mirror()` 에 넘긴다.

### 백업 (두 겹)
1. **미러** — `dumpAll()` 이 `gb:` 키 전부를 `{app:"ledger",ver:1,at,data:{키:값}}` 로 묶어 네이티브 `files/mirror.json` 에 둔다. 안드로이드 자동 백업·기기 이전이 이 파일을 옮기고, `init` 에서 기록이 하나도 없는데(`hasRecords()`) 미러가 있으면 `restoreAll()` 로 되살린 뒤 reload.
2. **파일** — 설정 시트(`themeSheet`, 제목은 "설정")의 백업 내보내기/가져오기. 같은 JSON 형식. 앱에선 `Android.saveFile` (SAF), 브라우저에선 `<a download>`. 가져오기는 `#bkAlert` 로 확인 뒤 전부 덮어쓰고 reload. 마지막 백업 시각은 `gb:meta/backup`.

| 키 | 내용 |
|---|---|
| `config/main` | `cfg` 전체 (아래) |
| `months/YYYY-MM` | `{txs:[...]}` 가계부 내역 |
| `index/summary` | `{months:{YYYY-MM:{i,e,s}}}` 월별 수입/지출/저축 합계 |
| `game/YYYY-MM` | `{items:[...]}` 게임 결제 기록 |
| `index/gsummary` | `{months:{YYYY-MM:합계}}` |
| `inbox/pending` | `{items:[...]}` 결제 대기열 |
| `gb:theme` | 화면 모드 (localStorage 직접) |
| `gb:fontScale` | 글씨 크기 0.9/1.1/1.2 (기본 1 이면 키 없음). 루트 `zoom` 으로 적용. 네이티브 인셋(`--sat`/`--sab`)은 zoom 과 무관한 px 라 CSS 에서 `calc(var(--sat) / var(--zoom, 1))` 로 나눠 쓴다 |
| `gb:meta/backup` | 마지막 백업 파일 내보내기 시각 (ISO) |
| `gb:ai/key` | (옛 키. 2026-09-24 부터 안 읽는다 — 키는 빌드에 내장. `dumpAll` 의 제외 규칙만 남겨 둠) |
| `gb:ai/model` `gb:ai/name` `gb:ai/persona` | AI 모델명·캐릭터 이름·말투 설정. 백업에 포함 |
| `gb:ai/note/YYYY-MM` | 그 달 생성한 `{comment,advice,at}`. 한 달에 한 번 캐시, 백업에 포함 |
| `gb:ai/gchat` | 게임 과금 상담 대화 `[{role,text}]` 최근 30개. 백업 포함 |

`cfg` = `{budget:{total,cat:{}}, plan:{income,envelopes[{id,name,pct,mode:"pct"|"amt",amt,saving,color}],goal,budgetEnv}, assets[], gameNames[], gameGuard:{month,daily,perGame{}}, gameGrps:{게임:[카테고리]}, gameProducts:{게임:[{id,name,desc,price,grp}]}}`

### 하루 예산 ("오늘쓸돈" 참고, 2026-09-23)
- `dailyBudget()` = (월 예산 − 오늘 전까지 지출) ÷ 오늘 포함 남은 날 → `{allow(하루 기준), spent(오늘 쓴 돈), rest(오늘 남은 돈), monthRest, left}`. 적게 쓴 날의 여유는 자동으로 다음 날로 넘어간다. 이달 화면이 아니거나 총 예산이 없으면 null.
- 상단 카드 첫 줄(`#todayRow`)에 "오늘 쓸 수 있는 돈" 이 가장 먼저 보이고(누르면 예산 탭), 예산 탭 맨 위 `#todayCard`(`paintToday()`)에 큰 숫자로. 초과면 빨강, 남으면 초록. **이 줄은 내역 탭에서만 보인다.** 통계 탭은 수입/지출/저축 카드만, 예산·자산·배분·게임 탭은 상단 카드 자체가 없다 — 사용자 결정, 2026-09-24.
- **총 예산 = 배분 탭 생활비 봉투 금액**(사용자 결정, 2026-09-24: "예산과 생활비는 같은 것"). `syncBudgetFromPlan()` 이 렌더 때마다 `cfg.budget.total` 에 써서 알림(mirror.json)도 같은 숫자를 본다. 봉투가 없거나 실수령액이 없으면 예산 탭에서 직접 적는 입력칸이 보인다. 봉투가 있으면 총 예산 줄은 읽기 전용이고 누르면 배분 탭으로.

### 내역 목록 검색·필터
목록 보기(`listMode==="list"`)에만 `.searchbar`(검색 + 카테고리 select). 상태는 `txQ`/`txCat`, `txFiltered()`. 입력 중엔 `#txList` 만 갈아 끼워 커서를 유지한다. 걸러진 상태면 건수·합계 한 줄이 위에 뜬다.

### 통계 탭 추가 항목
카테고리 도넛·주별·6개월 외에 **일별 지출**(막대 `.bars.dense`, 가장 많이 쓴 날·하루 평균), **지출 히트맵**(`.heatgrid`, `rgba` 로 진하기 — 옛 WebView 에 `color-mix` 가 없어서, 오늘은 파란 테두리), **요일별 평균 지출**(지난 날들의 요일별 평균, 가장 많이 쓰는 요일).

### 영수증 스캔 (`#ibScan`, 결제 대기열 화면)
버튼을 누르면 `#rcAlert` 팝업에서 **카메라로 찍기**(`#rcCam`, `capture="environment"`) 또는 **앨범에서 고르기**(`#rcFile`, 여러 장)를 고른다(2026-09-25). 카메라는 네이티브 `onShowFileChooser` 가 `isCaptureEnabled()` 를 보고 `TakePicture` 로 카메라 앱을 띄우고, 사진은 `cache/receipts/` 에 FileProvider(`${applicationId}.files`, `res/xml/file_paths.xml`)로 쓴다. CAMERA 권한은 선언하지 않는다(선언하면 런타임 권한이 필요해진다). 임시 파일은 앱 시작 때 하루 지난 것을 지운다. 이후 `scanFiles()` → `scanReceipt()` 가 Gemini `generateContent` 에 `inlineData` 로 보내 `{amount,merchant,date}` JSON 을 받고 대기열에 `src:"receipt"` 로 넣는다. 캔버스로 1280px 로 줄여 JPEG 로 보내고, 캔버스를 못 쓰면 원본. 키는 통계 탭 AI 와 같은 `aiKey()`. 키가 없는 빌드면 토스트만. **개별 거래 이미지가 Google 로 나가는 유일한 기능** — 설정 안내문과 PRIVACY.md 에 적혀 있다.

### 데이터 모양
- 가계부 내역 `tx`: `{id,d:"YYYY-MM-DD",type:"income"|"expense"|"saving",amount,cat,memo}`
- 게임 결제 기록: `{id,d,game,name,desc,grp,list(정가),price(실결제),qty}` — 합계는 `gAmt(g)=price*qty`. 새 기록은 qty 1, 할인 여부는 `price<list`.
- 대기열 항목: `{id,amount,d,merchant,type,cat,sel,src}`

### 게임 탭 구조 (최근 개편)
- 게임 목록 → 게임 상세(= **결제 기록 목록** + 한도/이름 설정)
- "결제 기록 추가" → 제품 선택 화면(`pickScreen`): 고정 카탈로그(`CATALOG`) + 사용자 제품(`cfg.gameProducts`) → 제품 누르면 결제 금액 시트(정가로 채워짐, 할인 시 금액만 수정)
- "목록에 없는 결제 직접 입력", "새 제품"
- `CATALOG`의 명조·젠레스 존 제로 구성은 사용자가 스크린샷으로 확정한 것. 그룹 순서 월정액 → 패스 → 패키지 → 충전. 게임 내 재화로 사는 상품은 넣지 않는다.
- 게임 기록은 가계부 수입·지출에 **합산하지 않는다.**
- **과금 상담 채팅**(2026-09-26 사용자 요청): 게임 탭 위 캐릭터 카드 "○○에게 물어보기" → `#gameChatScreen`(말풍선 + 입력칸). `sendChat()` 이 `gameContext()`(이번 달 게임 지출·한도·게임별·결제 기록 30건·지난 5개월·상품 가격표·가계부 요약)를 시스템 프롬프트에 붙이고, 최근 20개 대화를 `contents` 로 보낸다. 답은 텍스트(JSON 강제 없음), 700 토큰 제한. **사진 첨부**(입력칸 왼쪽 카메라 버튼 → `#chatPicAlert` 카메라/앨범): `imageToB64` 로 줄여 그 질문에만 `inlineData` 로 붙인다. base64 는 저장하지 않고 기록엔 `img:true` 만 남겨 다음 질문부터는 "[사진 첨부했었음]" 텍스트로만. 대화는 `gb:ai/gchat` 에 30개까지(백업 포함). "지우기" 로 비운다. 키 없는 빌드는 토스트만.

### 통계 탭 AI 카드
- `renderStat()` 맨 위에 캐릭터 카드(`.aiCard`, `aiCardHtml()`)가 항상 뜬다. 초상화는 `/assets/img/character.png`(절대경로, WebViewAssetLoader 의 `/assets/` 핸들러) — 320×320 얼굴 크롭, 투명 배경. 원본 전신 일러스트(1086×1448)는 `tools/character-full.png` 에 두고 APK 에는 넣지 않는다. 파일이 없어도 `onerror` 로 그라데이션 원만 남고 안 깨진다. 미리보기(`tools/artifact-preview.html`)는 절대경로를 못 쓰니 `character.png` 상대경로로 바꿔치기해서 같이 publish 한다.
- 키는 빌드에 내장된 것(`Android.builtinAiKey()`)만 쓴다. 없는 빌드면 카드에 "이 앱 빌드에는 AI 키가 없습니다" 만 뜨고, 영수증 스캔도 같은 토스트만. `aiGenerate()` 가 Gemini `generateContent` 를 직접 fetch 로 부른다 — 서버를 안 거치고 폰에서 곧장 나간다.
- 보내는 내용은 `aiPrompt(ym)`: 이번 달 총수입/지출/저축, 예산 대비 사용률, **카테고리별 합계 숫자**, 전달 대비 증감뿐이다. 가게 이름·메모 등 개별 거래 내용은 절대 보내지 않는다.
- 응답은 `generationConfig.responseMimeType:"application/json"` 로 강제해 `{comment,advice}` 만 파싱한다. 한 달에 한 번 `gb:ai/note/YYYY-MM` 에 캐시하고, "다시 생성"을 눌러야 다시 부른다(비용·트래픽 아끼려고 자동 재호출 안 함).
- 모델 기본값은 `gemini-flash-lite-latest`(무료 사용량이 있는 가장 가벼운 모델의 최신 별칭), 캐릭터 이름 기본값 "루나", 말투(persona)도 설정에서 바꿀 수 있다.

### 알림 감지 진단 (`diagScreen`)

설정 › 감지 기록 보기. "결제 알림이 왜 안 들어오지"를 폰에서 직접 확인하는 유일한 수단이다.
- 위: 알림 접근 / 감지 서비스 연결 / 실시간으로 본 알림 수 / 마지막 알림 시각. 그 아래 상태에 맞는 다음 할 일 한 줄.
- 아래: 최근 40건의 감지 기록(앱·시각·결과·원문). 결과가 `대기열`·`대기열(재스캔)` 이면 초록, 아니면 주황(`금액 없음` 은 관계없는 알림이 대부분이라 아예 안 남긴다).
- "지금 다시 확인" = `pullNow()` (재스캔 → `__pullPending`). "지우기" 는 기록만 비운다.
- `takePending()` 이 저장소를 비운 뒤 `parseOne()` 이 실패하면 그 알림은 흔적 없이 사라진다. 그래서 화면 쪽도 버릴 때 `Android.noteDropped()` 로 이유를 남긴다.
- 기록은 네이티브 SharedPreferences(`pay_pending`)에만 있다. localStorage·백업·미러에는 안 들어가고 폰 밖으로도 안 나간다.

### 공통 유틸
- 금액 입력은 반드시 `bindMoney(el, onChange)` 사용 → 입력 중 `1,234원` 서식, 커서는 "원" 앞. 값 표시는 `moneyStr(v)`.
- `parseN`, `fmt`, `esc`, `uid`, `todayISO`, `pad`
- 오버레이: 하단 시트 `.sheet`(+`scrim`), 전체화면 `.screen`, 가운데 팝업 `.alertwrap`. 열 때 `lockScroll(true)`.
- 메뉴 시트(`themeSheet`, 제목 "메뉴", 왼쪽 위 바 3개 아이콘 `#themeBtn`): 화면 모드 세그먼트 + 글씨 크기 세그먼트(`applyScale`, 루트 zoom) + 결제 알림 감지 상태(`renderSettings()`: 앱 밖/꺼짐/켜짐/끊김, 배터리 최적화 링크, 감지 기록 보기) + 백업. 알림 접근을 켜는 모든 경로는 `askNotifAccess()` → `#notifAlert` 설명 팝업을 먼저 거친다(스토어 정책의 "눈에 띄는 고지").
- 안전 영역은 `calc(var(--sat) / var(--zoom, 1))` 꼴로 쓴다(글씨 크기 zoom 보정). 기본값은 `env(safe-area-inset-*)`, 앱에서는 네이티브가 실측값으로 덮어쓴다.
- 시트를 닫은 뒤 돌아갈 화면은 `closeSheet()`의 `backToInbox / backToPick / backToDetail` 플래그로 처리.

## 5. 디자인 규칙

애플 HIG 스타일을 안드로이드에서 흉내 낸다.
- iOS 시스템 컬러(`--blue #007AFF` 등)를 CSS 변수로, 라이트/다크/시스템 3단 전환(`data-theme`)
- Inset grouped 리스트: 좌우 16px, 모서리 10px, 행 최소 44px, 구분선은 왼쪽 들여쓰기
- 세그먼트, iOS 스위치, 그래버 달린 시트, 반투명 블러 내비·탭 바
- 수입 파랑 `+`, 지출 빨강 `−`, 저축 초록 — 달력 셀에도 부호 표시
- Material 요소(FAB 등)는 피하되, 내역 탭의 보라색 대기열 버튼(`#qfab`)은 사용자 요청으로 둔 예외
- 이름이 길면 말줄임 대신 줄바꿈(`.ibrow.wrap`)
- 금액 입력칸에 키보드가 필요 없는 항목(카테고리 등)은 `<select>` + "새로 만들기" 팝업

## 6. 사용자가 확정한 결정 (바꾸기 전에 물어볼 것)

- 결제 대기열: **중복 제거 안 함.** 전부 대기열에 올리고 사용자가 확인 후 일괄 저장.
- 결제 대기열: **결제 실패·거절은 절대 넣지 않는다. 캐시백·적립처럼 결제 금액을 정확히 못 읽는 알림은 아예 뺀다** (2026-09-23, 실기기 토스 알림 확인 후). 애매하면 넣지 말고 버리는 쪽. 버린 건 진단 화면에서 볼 수 있다.
- 봉투(배분 탭): **슬라이더 없이 기입식**(2026-09-24). 실수령액(비우면 **오늘이 속한 달**의 수입 합계 — 보는 달에 따라 총 예산이 흔들리지 않게)을 적고 봉투마다 "%" 또는 "원" 을 골라 숫자만 넣으면 막대·남은 돈이 바로 뜬다(`envPct`/`envAmt`, `mode`). 합계 100% 이내로 제한 — 넘치는 입력은 남은 몫까지만 받고 토스트. 예산 봉투는 `plan.budgetEnv` 또는 이름에 "생활" 이 들어간 봉투(`budgetEnv()`), 그 금액이 자동으로 총 예산. 보내기 버튼은 없다.
- **탭마다 역할이 겹치지 않게** 한다(2026-09-24 사용자 원칙): 내역=기록·달력·대기열, 예산=오늘 쓸 수 있는 돈·총 예산·카테고리 예산, 통계=그래프·AI, 게임=게임 결제, 자산=구성 원그래프·항목·저축 목표, 배분=실수령액 봉투 나누기. 저축 목표는 배분에서 자산으로 옮겼다.
- 최근 6개월 통계는 **지출만** 표시.
- 주별 지출은 그 달 1~7, 8~14… 날짜 기준(요일 기준 아님).
- 제품 정의에는 날짜·수량이 없다(정가·이름·상품 목록·카테고리만).
- 달력(내역 탭)은 **보기 전용**이다. 날짜를 누르면 그날 기록이 아래에 펼쳐지고(다시 누르면 접힘), 기록을 누르면 수정은 된다. 날짜 눌러서 새로 추가하는 동작은 없다 — 추가는 `+` 버튼으로. `calCard`/`dayCard`.
- 위쪽 "2026년 9월" 버튼은 **달 선택 휠**(`#ymSheet`, 년·월 두 휠을 스크롤해 고르고 완료)을 연다. 예전의 전체 화면 달력은 **없앴다**(2026-09-24 사용자 결정). 키보드 입력이 아니라 iOS 피커처럼 스크롤로 고른다. 뒤로가기는 페이지가 `window.__back` 을 setter 로 가로채 네이티브 목록보다 먼저 닫는다(§3).
- 상단 수입/지출/저축 카드는 **내역·통계 탭에만** 있다. 게임·배분은 없고, 예산은 자기 오늘 카드, 자산은 항목별 비율 원그래프(`donutHtml`, 통계 탭 도넛과 공용)가 대신한다(2026-09-24). 자산 원그래프의 가운데는 순자산(대출 제외 합계), 비율은 대출을 뺀 항목끼리.
- 탭 위의 큰 제목(h1 "가계부/예산/통계…")은 **없앴다**(2026-09-24). 상단은 달 이동 바 → 카드 순서. "오늘 쓸 수 있는 돈" 줄은 내역 탭에서만.
- 결제 대기열 화면에는 **목록과 아래 버튼 두 개(영수증 스캔·일괄 저장)만** 둔다. 각 건을 개별로 켜고 끄고, 날짜 머리글로 그날 전체를 한 번에 켜고 끈다. 문자 붙여넣기 입력은 없앴다 — 알림이 감지돼서 대기열에 들어오는 게 기본이고, 손으로 넣을 일은 `+` 버튼으로 한다. 영수증 스캔은 2026-09-23 사용자 요청으로 추가.
- **"오늘쓸돈"(moteystudio.com) 참고 기능** (2026-09-23 사용자 선택): 하루 예산·상단 오늘 카드·예산 계산기, 내역 검색·필터, 통계(일별·히트맵·요일별), 영수증 스캔, 아침·저녁 예산 알림은 **넣었다.** Excel 내보내기와 달력 셀을 예산 초과 여부로 색칠하는 것은 **넣지 않는다**(사용자가 뺌). 달력 색은 그대로 수입 파랑·지출 빨강·저축 초록.
- 하루 예산 규칙은 오늘쓸돈과 같다: (월 예산 − 오늘 전까지 지출) ÷ 남은 날. 덜 쓴 날의 여유가 다음 날로 넘어간다.
- 대기열 위에 안내가 뜨는 건 **기본이 성립하지 않을 때뿐이다.** 알림 접근이 꺼졌거나(→ 켜기 링크), 앱 밖(브라우저)일 때. 정상 동작 중에는 아무것도 띄우지 않는다.
- 게임 제품을 사진으로 읽어 오는 기능(Gemini)은 **제거했다.** AI는 통계 탭 캐릭터 카드로 옮겼다(위 "통계 탭 AI 카드" 참고).
- **AI API 키는 코드나 저장소에 절대 넣지 않고, 사용자에게 입력받지도 않는다.** 빌드 때 박아 넣는 한 경로만 있다(사용자 결정, 2026-09-24 — 설정 입력칸은 뺐다): PC 는 프로젝트 루트 `.env`(gitignore) 의 `GEMINI_API_KEY`, CI 는 같은 이름의 GitHub 시크릿, 클라우드는 같은 이름의 환경 변수 → `BuildConfig.AI_KEY`. 기본 **debug 빌드에만** 들어가고 release 는 `AI_KEY_IN_RELEASE=true` 를 적어야 들어간다(APK 에서 꺼낼 수 있으니). 백업·미러에는 담지 않는다. Claude 는 키 값을 파일에 적지 않는다 — 사용자가 시크릿·환경 변수에 직접 넣는다.
- 통계 탭 AI 에 보내는 데이터는 카테고리별 지출 합계 숫자뿐이다. 가게 이름·메모 등 개별 거래 내용은 보내지 않는다. **예외는 둘** — ① 영수증 스캔: 사용자가 고른 영수증 사진(2026-09-23), ② 게임 과금 상담: 게임 결제 기록(게임·상품명·금액·날짜)·한도·상품 가격표(2026-09-26). 둘 다 사용자 결정. 그 외 경로로 개별 거래를 내보내지 않는다.
- AI 조언은 한 달에 한 번 생성해 캐시한다. 화면을 열 때마다 자동으로 다시 부르지 않는다 — 사용자가 "다시 생성"을 눌러야 한다.
- 스토어 빌드에는 원격 업데이트를 넣지 않는다. 개인 빌드(debug)만 한다.
- 백업은 자동 미러 + 수동 파일, 두 겹. 자동 복원은 **기록이 하나도 없을 때만**(기존 기록을 덮지 않는다).
- 알림 접근 권한은 설명 팝업을 먼저 보여 준 뒤에 설정으로 보낸다.

## 7. 알려진 할 일 / 주의

- 알림 감지 실기기 확인 상황(2026-09-26): 삼성 월렛(`₩151,600 결제 완료\n가게`)·토스뱅크 카드(`454원 캐시백 🎉\n151,600원 결제 | 가게\n잔액 0원(...)`) 원문을 `parser.test.js` 에 넣었다. **같은 결제를 삼성 월렛과 토스가 각각 알려서 대기열에 두 번 들어온다** — 중복 제거는 §6 사용자 결정이라 손대지 않았고, 사용자에게 물어 둔 상태. **막히면 설정 › 감지 기록 보기(§4 진단 화면)를 먼저 볼 것.** 파서는 `tests/parser.test.js` 의 문구 모음으로 검증한 것이고, 실제 카드사 문구가 다르면 그 원문을 테스트에 추가하고 파서를 고친다.
- 릴리스 서명은 `keystore.properties` 를 만들어야 켜진다(§1). 스토어 제출은 README "스토어에 올리기" 순서대로.
- 엣지투엣지·키보드 인셋 처리는 실기기(특히 API 35+)에서 확인 필요.
- 웹폰트(Inter, Noto Sans KR)는 온라인일 때만 로드. 오프라인이면 시스템 폰트.
- `JavascriptInterface`는 원격에서 받은 index.html에도 열려 있다. `update_url` 저장소 권한을 본인만 갖도록 유지할 것.

## 8. 검증

```bash
npm install        # jsdom
npm test           # tests/*.test.js 실행
node --check <(sed -n '/<script>/,/<\/script>/p' app/src/main/assets/index.html | sed '1d;$d')   # 대략적 문법 확인
```
테스트는 `window.Android`를 흉내 내서 알림 → 대기열 → 저장 흐름, 카드사·은행·페이별 알림 문구 파싱(`parser.test.js`, 새 형식은 여기에 추가), 게임 결제 기록(할인 포함) 흐름, 저장 → 미러 → 새 설치 자동 복원 → 파일 내보내기, 버린 알림이 진단 기록에 남는지(`diag.test.js`), 하루 예산 계산·예산 계산기·검색·통계 섹션·영수증 스캔(fetch 흉내)·알림 설정 브리지(`budget.test.js`)를 클릭으로 따라간다. `index.html`을 고친 뒤 꼭 돌릴 것.

APK 빌드 확인(로컬, Git Bash):
```bash
JAVA_HOME="C:/Users/winz/.dal-bbam-android/jdk17/jdk-17.0.20.1+1" ANDROID_HOME="C:/Users/winz/AppData/Local/Android/Sdk" ~/.gradle/wrapper/dists/gradle-8.11.1-bin/*/gradle-8.11.1/bin/gradle assembleDebug assembleRelease --no-daemon -q
```

### 클라우드 세션에서 APK 빌드

클라우드 샌드박스에는 JDK·Gradle·Android SDK 가 없다. 세션을 시작할 때:
```bash
bash tools/setup-android.sh && source ~/.ledger-tools/env.sh
```
JDK 17(Temurin)·Gradle 8.11.1·명령줄 도구·platform-tools·android-36·build-tools 35.0.0 을 `~/.ledger-tools` 에 받고(약 900MB) `local.properties`(gitignore) 를 쓴다. 이미 있으면 건너뛴다. 이후 빌드는 로컬과 같다: `gradle assembleDebug assembleRelease --no-daemon -q` → `app/build/outputs/apk/{debug,release}/`. 새 셸마다 `source ~/.ledger-tools/env.sh` 를 다시 해야 한다. 2026-09-22 클라우드(리눅스 x64)에서 설치·테스트·debug/release 빌드 모두 확인함.
- 컨테이너는 세션이 끝나면 사라진다. `~/.ledger-tools` 도 같이 사라지니 **새 클라우드 세션마다 다시 받는다**(몇 분 걸림).
- 네트워크가 막혀 있으면 실패한다 — `api.adoptium.net`, `services.gradle.org`, `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`, `plugins.gradle.org` 가 열려 있어야 한다.
- 출력에 `Picked up JAVA_TOOL_OPTIONS: ...` 줄이 반복돼 찍히는 건 샌드박스 프록시 설정이지 오류가 아니다.
- `.env` 는 저장소에 없으니 클라우드 환경 변수 `GEMINI_API_KEY` 가 없으면 debug APK 에 AI 키가 안 들어가 AI 조언·영수증 스캔이 안 된다. 빌드 전에 `echo ${GEMINI_API_KEY:+있음}` 으로 확인.
- 클라우드 환경 변수에 `LEDGER_DEBUG_KEYSTORE_B64` 가 없으면 debug APK 가 세션마다 다른 자동 키로 서명돼 **폰의 기존 앱 위에 설치되지 않는다**(§1). 빌드 전에 `echo ${LEDGER_DEBUG_KEYSTORE_B64:+있음}` 으로 확인하고, 없으면 사용자에게 알린다. 서명 확인: `$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs <apk>`.
- 클라우드 세션은 별도 브랜치 + PR 로 일한다. 폰 자동 업데이트는 `main` 을 읽으니 **merge 해야 화면이 반영**되고, 네이티브 변경은 어차피 APK 재설치다.

### 아티팩트 미리보기

`tools/artifact-preview.html` 은 폰 크기 화면에 `index.html` 을 그대로 띄우는 개발용 무대다.
Claude Code에서 이 파일을 아티팩트로 publish하면서 `index.html` 을 `app.html` 로 같이 올리면,
브라우저에서 실시간으로 보면서 고칠 수 있다. `index.html` 을 고친 뒤 다시 publish하면 갱신된다.

미리보기에는 `window.Android`(알림 감지)와 자동 업데이트가 없다. 화면·기능 확인용이다.
