# tofu-kataribe ドキュメント

このディレクトリには、`tofu-kataribe` の現在の構成と運用手順をまとめます。

## ドキュメント一覧

- [architecture.md](./architecture.md): システム概要、ファイル構成、リクエスト処理の流れ、API、状態管理
- [setup.md](./setup.md): 必要なツール、環境変数、LLM・音声設定、ローカル起動、動作確認
- [integration.md](./integration.md): 別サービスからの接続方法、Node.js クライアント、ブラウザー・Bot・Webhook 連携
- [deployment-vercel.md](./deployment-vercel.md): Vercel 対応状況、必要な変更、環境変数、デプロイ・確認・ロールバック手順

## 現在の前提

- Node.js 24、TypeScript、Hono で実装されたヘッドレス API サーバーです。
- Web UI、Discord Bot、YouTube 連携などのクライアントはこのリポジトリに含みません。
- LLM は OpenAI 互換の Streaming Chat Completions API を利用します。
- レスポンスは NDJSON でストリーミングします。
- ローカルでは `@hono/node-server` による常駐 Node.js プロセスとして動作します。
- Vercel へのデプロイを目標にしていますが、現在の実装をそのまま本番デプロイできる状態ではありません。必要な対応は [deployment-vercel.md](./deployment-vercel.md) にまとめています。

## 最初に読む順番

1. ローカルで kataribe 自体を起動する場合は [setup.md](./setup.md) を読む
2. Web、Discord、YouTube、別バックエンドなどから利用する場合は [integration.md](./integration.md) を読む
3. 内部実装を変更する場合は [architecture.md](./architecture.md) を読む
4. Vercel へ公開する場合は [deployment-vercel.md](./deployment-vercel.md) を読む

## 最小のローカル起動

```sh
proto install
pnpm install
cp .env.example .env
pnpm dev
```

PowerShell では `cp` の代わりに `Copy-Item .env.example .env` を使用します。`.env` の設定方法は [setup.md](./setup.md) を参照してください。

一括確認は次のコマンドで実行します。

```sh
pnpm check
```

`pnpm check` は型検査、Lint、フォーマット検査、テスト、ビルドを順番に実行します。
