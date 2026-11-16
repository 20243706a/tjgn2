# 태블릿 라이브

## 실행
    npm install
    npm start          # http://localhost:3000

## 주소로 역할 구분
- 관리자 : https://내도메인/?role=admin
- 태블릿 : https://내도메인/?role=client   (role 생략해도 태블릿)

## 관리자 보호 (선택)
환경변수 ADMIN_KEY=비밀값 을 설정하면
관리자는 https://내도메인/?role=admin&key=비밀값 으로만 접속됩니다.

## 배포
Render / Railway / Fly.io 등 Node 서버를 돌릴 수 있는 곳에 올리세요.
Build: npm install   Start: npm start
카메라(getUserMedia)는 HTTPS에서만 동작합니다. 위 서비스들은 기본 HTTPS 제공.
