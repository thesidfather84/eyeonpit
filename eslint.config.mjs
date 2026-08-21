import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, unmodified third-party sherpa-onnx WASM build (gitignored,
    // never committed — see sherpaOnnxProvider.ts's ASSET DEPLOYMENT doc
    // comment). Not our code; nothing here is ever edited.
    "public/sherpa-onnx-lab/**",
    // Same treatment for the vendored, unmodified whisper.cpp command.wasm
    // build (gitignored, never committed — see whisperCppProvider.ts's
    // ASSET DEPLOYMENT doc comment). Not our code; nothing here is ever
    // edited.
    "public/whisper-cpp-lab/**",
    // Same treatment for the vendored, unmodified vosk-browser WASM build +
    // Vosk small-English model (gitignored elsewhere is NOT applied here —
    // see voskProvider.ts's ASSET DEPLOYMENT doc comment; committed like
    // whisper-cpp-lab, not sherpa-onnx-lab). Not our code; nothing here is
    // ever edited.
    "public/vosk-lab/**",
  ]),
]);

export default eslintConfig;
