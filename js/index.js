console.log("wat");

import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from "@bjorn3/browser_wasi_shim";

let args = [];
let env = [];
let fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
    ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
    new PreopenDirectory(".", [
    ]),
];
let wasi = new WASI(args, env, fds);
console.log(wasi);

let wasm = await WebAssembly.compileStreaming(fetch("llvm.wasm"));
let inst = await WebAssembly.instantiate(wasm, {
    "wasi_snapshot_preview1": wasi.wasiImport,
});
console.log(inst);
wasi.start(inst);
