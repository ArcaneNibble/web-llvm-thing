import { WASI, File, OpenFile, ConsoleStdout, Directory, PreopenDirectory } from "@bjorn3/browser_wasi_shim";
import { parse_tarball } from "./tarball.mjs";

const sysroot_tarball = await fetch("sysroot.tar");
if (!sysroot_tarball.ok) {
    throw new Error("failed to get sysroot tarball");
}
const tarball_bytes = await sysroot_tarball.bytes();
const tarball_fs = parse_tarball(tarball_bytes);
console.log(tarball_fs);

function fs_to_wasi_fs(fs, extra_things = undefined) {
    let things = extra_things;
    if (extra_things === undefined)
        things = [];
    for (const filename in fs) {
        const obj = fs[filename];
        if (obj instanceof Uint8Array) {
            const file = new File(obj, { readonly: true });
            things.push([filename, file]);
        } else {
            const subdir = fs_to_wasi_fs(obj);
            things.push([filename, subdir]);
        }
    }
    // XXX kinda a hack
    if (extra_things === undefined)
        return new Directory(things);
    else
        return new PreopenDirectory('.', things);
}
const wasi_fs = fs_to_wasi_fs(tarball_fs, [
    ['tmp', new Directory(new Map())],
    ['test.c', new File(new TextEncoder("utf-8").encode(`#include<stdio.h>\nint main() {printf("Hewwo world? %d\\n", 12345);return 0;}`))],
]);
console.log(wasi_fs);

let args = [
    "clang",
    "-cc1",
    "-triple",
    "thumbv6m-unknown-none-eabi",
    "-emit-obj",
    "-dumpdir",
    "a-",
    "-disable-free",
    "-clear-ast-before-backend",
    "-main-file-name",
    "test.c",
    "-mrelocation-model",
    "static",
    "-mframe-pointer=all",
    "-fmath-errno",
    "-ffp-contract=on",
    "-fno-rounding-math",
    "-mconstructor-aliases",
    "-nostdsysteminc",
    "-target-cpu",
    "cortex-m0",
    "-target-feature",
    "+soft-float-abi",
    "-target-feature",
    "-vfp2",
    "-target-feature",
    "-vfp2sp",
    "-target-feature",
    "-vfp3",
    "-target-feature",
    "-vfp3d16",
    "-target-feature",
    "-vfp3d16sp",
    "-target-feature",
    "-vfp3sp",
    "-target-feature",
    "-fp16",
    "-target-feature",
    "-vfp4",
    "-target-feature",
    "-vfp4d16",
    "-target-feature",
    "-vfp4d16sp",
    "-target-feature",
    "-vfp4sp",
    "-target-feature",
    "-fp-armv8",
    "-target-feature",
    "-fp-armv8d16",
    "-target-feature",
    "-fp-armv8d16sp",
    "-target-feature",
    "-fp-armv8sp",
    "-target-feature",
    "-fullfp16",
    "-target-feature",
    "-fp64",
    "-target-feature",
    "-d32",
    "-target-feature",
    "-neon",
    "-target-feature",
    "-sha2",
    "-target-feature",
    "-aes",
    "-target-feature",
    "-dotprod",
    "-target-feature",
    "-fp16fml",
    "-target-feature",
    "-bf16",
    "-target-feature",
    "-mve.fp",
    "-target-feature",
    "-fpregs",
    "-target-feature",
    "+strict-align",
    "-target-abi",
    "aapcs",
    "-mfloat-abi",
    "soft",
    "-Wunaligned-access",
    "-debugger-tuning=gdb",
    "-fdebug-compilation-dir=/",
    "-fcoverage-compilation-dir=/",
    "-resource-dir",
    "sysroot",
    "-isysroot",
    "sysroot",
    "-internal-isystem",
    "sysroot/include",
    "-internal-isystem",
    "sysroot/cm01-exc-rtti/include",
    "-internal-isystem",
    "sysroot/cm01/include",
    "-O2",
    "-ferror-limit",
    "19",
    "-fno-signed-char",
    "-fgnuc-version=4.2.1",
    "-fskip-odr-check-in-gmf",
    "-vectorize-loops",
    "-vectorize-slp",
    "-faddrsig",
    "-o",
    "tmp/asdf.o",
    "-x",
    "c",
    "test.c"
];
let fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
    ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
    wasi_fs,
];
let wasi = new WASI(args, [], fds);
console.log(wasi);

let wasm = await WebAssembly.compileStreaming(fetch("llvm.wasm"));
let inst = await WebAssembly.instantiate(wasm, {
    "wasi_snapshot_preview1": wasi.wasiImport,
});
console.log(inst);
wasi.start(inst);
