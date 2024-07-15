console.log("wat");

import { parse_tarball } from "./tarball.mjs";

const sysroot_tarball = await fetch("sysroot.tar");
console.log(sysroot_tarball);
if (!sysroot_tarball.ok) {
    throw new Error("failed to get sysroot tarball");
}
const tarball_bytes = await sysroot_tarball.bytes();
const tarball_fs = parse_tarball(tarball_bytes);
console.log(tarball_fs);

// import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from "@bjorn3/browser_wasi_shim";

// let args = [];
// let env = [];
// let fds = [
//     new OpenFile(new File([])),
//     ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
//     ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
//     new PreopenDirectory(".", [
//     ]),
// ];
// let wasi = new WASI(args, env, fds);
// console.log(wasi);

// let wasm = await WebAssembly.compileStreaming(fetch("llvm.wasm"));
// let inst = await WebAssembly.instantiate(wasm, {
//     "wasi_snapshot_preview1": wasi.wasiImport,
// });
// console.log(inst);
// wasi.start(inst);
