# 가계부 개인정보처리방침

최종 수정: 2026-09-21

## 요약

- 이 앱은 **서버가 없습니다.** 입력한 기록, 읽은 알림, 설정은 전부 사용자의 기기 안에만 저장됩니다.
- 개발자를 포함해 누구에게도 데이터를 보내지 않습니다. 계정 가입도 없습니다.
- 광고·분석 SDK를 쓰지 않습니다.

## 어떤 데이터를 다루나

| 데이터 | 어디에 저장 | 왜 |
|---|---|---|
| 직접 입력한 수입·지출·저축·게임 결제 기록, 예산·배분·자산 설정 | 기기 내부 저장소 (앱 전용 영역) | 가계부 기능 자체 |
| 결제 알림에서 읽은 금액·가맹점·날짜 | 기기 내부 저장소 (결제 대기열) | 결제를 자동으로 기록하기 위해 |
| 전체 기록의 복사본 (`mirror.json`) | 기기 내부 저장소 | 폰을 바꾸거나 앱을 다시 설치할 때 되살리기 위해 |
| 백업 파일 (`가계부-백업-날짜.json`) | 사용자가 직접 고른 위치 | 사용자가 "백업 파일 내보내기"를 눌렀을 때만 만들어짐 |

## 알림 접근 권한

결제를 자동으로 모으려고 안드로이드의 **알림 접근** 권한을 씁니다. 이 권한은 사용자가 설정에서 직접 켜야 하며, 언제든 끌 수 있습니다.

- 앱은 알림 중에서 **금액(○○원)과 결제 관련 단어(승인·결제·출금·입금 등)가 함께 있는 것**만 골라 원문을 기기 안에 잠시 보관합니다.
- 그 밖의 알림(메신저 대화, 광고 등)은 읽자마자 버리며 어디에도 저장하지 않습니다.
- 보관한 원문은 앱을 열어 대기열에 넣는 순간 지워집니다. 대기열에서 저장하거나 삭제한 뒤에는 금액·가맹점·날짜만 가계부 기록으로 남습니다.
- 알림 내용은 기기 밖으로 전송되지 않습니다.

## 통계 탭의 AI 조언 (선택 기능)

통계 탭에는 이번 달 지출을 짧게 논평하고 다음 달 조언을 주는 캐릭터 카드가 있습니다. 이 기능은 **기본적으로 꺼져 있고**, 사용자가 설정에서 자신의 Gemini API 키를 직접 넣어야 동작합니다.

- 키를 넣으면 앱은 **이번 달 총수입·지출·저축, 예산 대비 사용률, 카테고리별 지출 합계 숫자, 전달 대비 증감**만 사용자의 키로 Google 의 Gemini API 에 직접 보냅니다. 서버를 거치지 않고 기기에서 곧장 나갑니다.
- 가게 이름, 메모, 개별 결제 내역은 **절대 보내지 않습니다.** 카테고리별 합계 숫자만 갑니다.
- 입력한 API 키는 이 기기에만 저장되며, 백업 파일과 자동 백업 미러 어디에도 포함되지 않습니다. 폰을 바꾸면 키는 새로 입력해야 합니다.
- 생성된 조언 문구는 한 달에 한 번만 만들어 기기에 저장해 두고, 사용자가 "다시 생성"을 누르기 전에는 다시 보내지 않습니다.
- 이 기능을 쓰지 않으면(키를 넣지 않으면) 어떤 데이터도 Google 로 가지 않습니다.
- Gemini API 로 보낸 데이터가 Google 쪽에서 어떻게 쓰이는지는 Google 의 자체 정책을 따르며, 이 앱의 개발자가 관여하지 않습니다.

## 인터넷 사용

`INTERNET` 권한은 다음 두 가지에만 씁니다.

1. 화면 글꼴(Google Fonts)을 온라인일 때 내려받기. 이 요청에는 사용자 데이터가 담기지 않습니다.
2. 개발자가 직접 설치해 쓰는 개인용 빌드에서 화면 파일을 갱신하기. **스토어에 배포되는 빌드에는 이 기능이 없습니다.**

## 안드로이드 자동 백업

안드로이드의 자동 백업(Google 계정 백업, 기기 이전)이 켜져 있으면 전체 기록의 복사본이 사용자의 Google 계정 백업에 포함될 수 있습니다. 이는 안드로이드 시스템 기능이며, 사용자가 기기 설정에서 끌 수 있습니다. 개발자는 이 백업에 접근할 수 없습니다.

## 데이터 삭제

- 앱 안의 기록은 각 항목에서 삭제할 수 있습니다.
- 앱을 삭제하면 기기 안의 모든 데이터가 함께 지워집니다.
- 사용자가 내보낸 백업 파일은 사용자가 직접 지워야 합니다.

## 문의

이 방침에 대한 질문은 앱 스토어 페이지에 적힌 개발자 이메일로 보내 주세요.

---

# Privacy Policy (English summary)

This app has **no server**. Everything you enter, every payment notification it reads, and all settings stay on your device. Nothing is sent to the developer or any third party. There are no accounts, no ads, and no analytics.

**Optional AI spending advice** (Stats tab): off by default. If you enter your own Gemini API key in Settings, the app sends only aggregate numbers (totals, per-category sums, budget usage) directly from your device to Google's Gemini API using your key — never merchant names or individual transaction memos. The key stays on-device and is excluded from backups.

**Notification access** is used only to collect payment notifications (those containing an amount and a payment keyword). Other notifications are discarded immediately and never stored. Collected text stays on the device, is removed once you review it, and is never transmitted.

**Internet** is used only to download UI fonts. Store builds contain no remote-update mechanism.

If Android's system backup is enabled, a copy of your records may be included in your own Google account backup; the developer has no access to it. Uninstalling the app deletes all data on the device.
