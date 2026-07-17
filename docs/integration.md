# 外部サービスから kataribe を利用する

## kataribe の位置づけ

kataribe は Web UI や Discord Bot そのものではなく、発話生成を担当する HTTP API です。利用側のサービスは、ユーザー入力を kataribe に送り、返ってくるイベントを自分の画面、チャット、音声再生へ反映します。

```text
ユーザー
  -> Web / Discord Bot / YouTube Bot / 別バックエンド
  -> POST /v1/turns/stream
  -> kataribe
  -> LLM・音声サービス
  -> NDJSON イベント
  -> 利用側サービスが表示・送信・再生
```

接続に必要なのは次の 2 つです。

- kataribe の Base URL。ローカルでは `http://localhost:3001`
- `API_AUTH_TOKEN` を設定している場合は、その Bearer トークン

## 推奨する接続方法

### Bot・バックエンド・バッチ

利用側のサーバーから kataribe を直接呼びます。`API_AUTH_TOKEN` は利用側サービスの Secret / 環境変数に保存します。

```text
Discord Bot server -> kataribe
YouTube Bot server -> kataribe
Application API    -> kataribe
```

### ブラウザーアプリ

本番では、ブラウザーから kataribe の共通 `API_AUTH_TOKEN` を直接使わないでください。JavaScript に入れたトークンは利用者に見えます。

```text
Browser -> 自分のバックエンド -> kataribe
```

自分のバックエンドでユーザー認証を行い、バックエンドだけが kataribe のトークンを保持する構成を推奨します。ブラウザーから直接呼ぶ場合の `CORS_ORIGINS` は通信を許可する設定であり、秘密トークンを隠す仕組みではありません。

## API の呼び出し

### ターンを開始する

```http
POST /v1/turns/stream
Content-Type: application/json
Authorization: Bearer <API_AUTH_TOKEN>
```

```json
{
  "sessionId": "discord:123456789:987654321",
  "input": "今日の配信の挨拶を考えて"
}
```

`Authorization` は kataribe 側で `API_AUTH_TOKEN` を設定している場合だけ必要です。

入力制約:

| 項目        | 制約                                    |
| ----------- | --------------------------------------- |
| `sessionId` | 1〜128 文字。英数字、`:`, `_`, `-` のみ |
| `input`     | 前後空白を除いて 1〜4000 文字           |

### curl で試す

```sh
curl -N -X POST http://localhost:3001/v1/turns/stream \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer local-development-token' \
  -d '{"sessionId":"integration:demo","input":"こんにちは"}'
```

`-N` は受信データをバッファーせず、ストリームを順次表示するために付けます。

## Node.js / TypeScript の接続コード

NDJSON は「1 行 1 JSON」ですが、ネットワークの 1 chunk と 1 行は一致するとは限りません。行の途中で chunk が分割されても動くよう、文字列バッファーを保持します。

```ts
type KataribeEvent =
  | { type: "turn.started"; turnId: string; sessionId: string }
  | { type: "text.delta"; turnId: string; delta: string }
  | {
      type: "sentence.ready";
      turnId: string;
      sentenceIndex: number;
      text: string;
      reaction: string;
    }
  | {
      type: "audio.ready";
      turnId: string;
      sentenceIndex: number;
      text: string;
      reaction: string;
      audio: {
        id: string;
        url: string;
        contentType: "audio/wav";
        expiresAt: string;
      };
    }
  | { type: "turn.completed"; turnId: string; text: string; sentenceCount: number }
  | {
      type: "turn.error";
      turnId: string;
      error: { code: string; message: string; retryable: boolean };
    };

export async function* streamKataribeTurn(options: {
  baseUrl: string;
  token?: string;
  sessionId: string;
  input: string;
  signal?: AbortSignal;
}): AsyncGenerator<KataribeEvent> {
  const response = await fetch(new URL("/v1/turns/stream", options.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ sessionId: options.sessionId, input: options.input }),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kataribe HTTP ${response.status}: ${body}`);
  }
  if (!response.body) throw new Error("Kataribe response has no body");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as KataribeEvent;
    }
  }

  const tail = buffer.trim();
  if (tail) yield JSON.parse(tail) as KataribeEvent;
}
```

利用例:

```ts
const baseUrl = process.env.KATARIBE_BASE_URL ?? "http://localhost:3001";

for await (const event of streamKataribeTurn({
  baseUrl,
  token: process.env.KATARIBE_API_TOKEN,
  sessionId: "web:user-123",
  input: "こんにちは",
})) {
  switch (event.type) {
    case "text.delta":
      process.stdout.write(event.delta);
      break;
    case "sentence.ready":
      console.log("sentence", event.text, event.reaction);
      break;
    case "audio.ready": {
      const audioUrl = new URL(event.audio.url, baseUrl).href;
      console.log("audio", audioUrl, event.audio.expiresAt);
      break;
    }
    case "turn.completed":
      console.log("completed", event.text);
      break;
    case "turn.error":
      throw new Error(`${event.error.code}: ${event.error.message}`);
  }
}
```

利用側サービスでは、次の環境変数名にすると kataribe 側の設定と混同しにくくなります。

```dotenv
KATARIBE_BASE_URL=http://localhost:3001
KATARIBE_API_TOKEN=local-development-token
```

## イベントの扱い

| イベント         | 利用側で行うこと                             |
| ---------------- | -------------------------------------------- |
| `turn.started`   | ローディング表示、ターン ID の記録           |
| `text.delta`     | 生成中テキストへ `delta` を追記              |
| `sentence.ready` | 文単位の字幕・チャット表示、リアクション反映 |
| `audio.ready`    | 音声 URL を解決し、期限内に取得・再生        |
| `turn.completed` | 最終テキストを確定し、ローディングを終了     |
| `turn.error`     | ストリーム途中の失敗として表示・再試行判断   |

リアクションは現在次のいずれかです。

```text
neutral, happy, angry, sad, thinking, surprised, confused, embarrassed
```

## セッション ID の決め方

同じ `sessionId` を使うと、そのセッションの会話履歴が次のターンに渡されます。利用者や会話チャンネルごとに安定した ID を作ります。

例:

```text
web:user-123
discord:123456789:987654321
youtube:channel-123:live-456
obs:scene-main
```

個人情報やアクセストークンをそのまま `sessionId` に入れないでください。メールアドレス、URL、空白、日本語は許可文字にも含まれません。

会話をリセットする場合:

```http
DELETE /v1/sessions/<sessionId>
Authorization: Bearer <API_AUTH_TOKEN>
```

```ts
await fetch(new URL(`/v1/sessions/${sessionId}`, baseUrl), {
  method: "DELETE",
  headers: { authorization: `Bearer ${token}` },
});
```

現在の会話履歴は kataribe プロセス内のメモリにあり、再起動で消れます。

## Discord Bot などでの使い方

Bot のイベントハンドラーでユーザー入力を受け、チャンネルを表すセッション ID を作って kataribe を呼びます。

```ts
const sessionId = `discord:${guildId ?? "dm"}:${channelId}`;
let completedText = "";

for await (const event of streamKataribeTurn({
  baseUrl: process.env.KATARIBE_BASE_URL!,
  token: process.env.KATARIBE_API_TOKEN,
  sessionId,
  input: message.content,
})) {
  if (event.type === "turn.completed") completedText = event.text;
  if (event.type === "turn.error") throw new Error(event.error.code);
}

await message.reply(completedText);
```

生成途中を編集表示したい場合は `text.delta` を蓄積し、Discord などの更新頻度制限に合わせて一定間隔でメッセージを更新します。`text.delta` ごとに API 更新するとレート制限を受けやすいため避けます。

## Webhook・非ストリーミング処理での使い方

利用側がストリームを扱えない場合も、kataribe との間では最後までイベントを読み、`turn.completed.text` を通常レスポンスとして返せます。

```ts
async function askKataribe(input: string, sessionId: string): Promise<string> {
  let completed: string | undefined;

  for await (const event of streamKataribeTurn({
    baseUrl: process.env.KATARIBE_BASE_URL!,
    token: process.env.KATARIBE_API_TOKEN,
    sessionId,
    input,
  })) {
    if (event.type === "turn.completed") completed = event.text;
    if (event.type === "turn.error") throw new Error(event.error.code);
  }

  if (completed === undefined) throw new Error("Kataribe stream ended before completion");
  return completed;
}
```

この方式では利用側の応答が LLM と音声生成の完了まで返らないため、Webhook 側のタイムアウトも確認してください。

## ブラウザーへストリームを中継する

利用側バックエンドで kataribe を呼び、レスポンスボディをそのままブラウザーへ返せば NDJSON ストリームを中継できます。

```ts
const upstream = await fetch(new URL("/v1/turns/stream", process.env.KATARIBE_BASE_URL), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.KATARIBE_API_TOKEN}`,
  },
  body: JSON.stringify({ sessionId, input }),
  signal: request.signal,
});

return new Response(upstream.body, {
  status: upstream.status,
  headers: {
    "content-type": upstream.headers.get("content-type") ?? "application/x-ndjson",
  },
});
```

この処理の前に、利用側バックエンドでログイン状態、入力できるユーザー、文字数、利用回数を検証してください。

## 音声の取得

`audio.ready` の `audio.url` は現在 `/v1/audio/<id>` という相対 URL です。kataribe の Base URL を基準に絶対 URL へ変換します。

```ts
const audioUrl = new URL(event.audio.url, process.env.KATARIBE_BASE_URL).href;
const wav = await fetch(audioUrl);
```

`expiresAt` より前に取得してください。現在のローカル保存実装では既定の有効期限は 10 分です。音声なしの構成では `audio.ready` は返りません。

## エラー処理

ストリーム開始前のエラーは HTTP ステータスで返ります。

| HTTP  | code              | 主な原因                            |
| ----- | ----------------- | ----------------------------------- |
| `400` | `INVALID_REQUEST` | JSON、`sessionId`、`input` が不正   |
| `401` | `UNAUTHORIZED`    | Bearer トークンがない、または不一致 |
| `429` | `RATE_LIMITED`    | IP 単位の時間枠上限                 |
| `429` | `TOO_MANY_TURNS`  | 同時ターン上限                      |

429 の場合は `Retry-After` ヘッダーを確認します。

ストリーム開始後の LLM・音声・保存エラーは、HTTP 200 の途中で `turn.error` イベントとして返る場合があります。そのため、HTTP が成功していても `turn.completed` または `turn.error` まで読み取ってください。

クライアント側で `AbortController` を使って通信を中止すると、そのシグナルは kataribe から LLM・音声リクエストへ伝播します。

## 接続チェックリスト

- [ ] kataribe の `/v1/health` に利用側サーバーから到達できる
- [ ] Base URL をフロントエンド用 URL と混同していない
- [ ] `API_AUTH_TOKEN` と利用側の `KATARIBE_API_TOKEN` が一致している
- [ ] トークンをブラウザーやログへ露出していない
- [ ] `sessionId` が許可文字内で、会話単位に安定している
- [ ] NDJSON を chunk 単位ではなく改行単位で解析している
- [ ] `turn.error` と HTTP 429 の両方を処理している
- [ ] 音声 URL を kataribe の Base URL 基準で解決している
- [ ] 利用側サービスのタイムアウトが生成時間より短すぎない
- [ ] Vercel で利用する場合は状態・音声保存の移行要件を確認した
