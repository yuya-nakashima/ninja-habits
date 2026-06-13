# API

v1 Web 版の API と DB migration を置く場所です。

## Local PostgreSQL

```sh
docker compose -f api/docker-compose.yml up -d
npm run api:migrate
```

接続情報:

```txt
postgresql://ninja:ninja@127.0.0.1:15432/ninja_habits
```

## Local API

```sh
API_DEV_AUTH=true npm run api:dev
```

ローカル開発時だけ、Cognito の代わりに dev header を使えます。

```sh
curl -H 'x-dev-cognito-sub: local-user' \
  -H 'x-dev-email: local@example.com' \
  http://127.0.0.1:8080/v1/today
```

本番では `API_DEV_AUTH` を有効にせず、`COGNITO_ISSUER` または `AWS_REGION` + `COGNITO_USER_POOL_ID` を設定します。
