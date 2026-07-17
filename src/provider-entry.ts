const provider = process.argv[2];
const supportedProviders = new Set(["none", "voicevox-local", "voicevox-ttsquest"]);

if (!provider || !supportedProviders.has(provider)) {
  throw new Error(`Unsupported speech provider: ${provider ?? "(missing)"}`);
}

process.env.SPEECH_PROVIDER = provider;
await import("./index.js");
