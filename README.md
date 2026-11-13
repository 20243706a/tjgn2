# 권한 제어 시스템 (Node.js + Socket.IO)

## 경로
- `/`            안내
- `/main`        메인 기기 (방 생성·권한 관리)
- `/sub`         보조 기기 (코드 입력)
- `/sub/1234`    보조 기기 (코드 자동 입력)

## 실행
    npm install
    npm start          # PORT 환경변수 사용 (기본 3000)

## 배포 (Render 등)
Build: `npm install` / Start: `npm start`. WebSocket을 지원하는 호스팅이어야 해요.
