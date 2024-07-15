import { WASI, File, OpenFile, ConsoleStdout, Directory, PreopenDirectory, wasi } from "@bjorn3/browser_wasi_shim";
import { parse_tarball } from "./tarball.mjs";

const sysroot_tarball = await fetch("sysroot.tar");
if (!sysroot_tarball.ok) {
    throw new Error("failed to get sysroot tarball");
}
const tarball_bytes = await sysroot_tarball.bytes();
const tarball_fs = parse_tarball(tarball_bytes);
// console.log(tarball_fs);

let _xxx_assigned_ino_nums = 100;

class FileWithIno extends File {
    constructor(data, options) {
        super(data, options);
        this.ino = BigInt(options.ino);
    }

    stat() {
        let ret = new wasi.Filestat(wasi.FILETYPE_REGULAR_FILE, this.size);
        ret.ino = this.ino;
        return ret;
    }
}

class DirWithIno extends Directory {
    constructor(contents, ino) {
        super(contents);
        this.ino = BigInt(ino);
    }

    stat() {
        let ret = new wasi.Filestat(wasi.FILETYPE_DIRECTORY, 0n);
        ret.ino = this.ino;
        return ret;
    }
}

function fs_to_wasi_fs(fs, extra_things = undefined) {
    let things = extra_things;
    if (extra_things === undefined)
        things = [];
    for (const filename in fs) {
        const obj = fs[filename];
        if (obj instanceof Uint8Array) {
            const file = new FileWithIno(obj, { readonly: true, ino: _xxx_assigned_ino_nums++ });
            things.push([filename, file]);
        } else {
            const subdir = fs_to_wasi_fs(obj);
            things.push([filename, subdir]);
        }
    }
    // XXX kinda a hack
    if (extra_things === undefined) {
        return new DirWithIno(things, _xxx_assigned_ino_nums++);
    }
    else
        return new PreopenDirectory('.', things);
}
const wasi_fs = fs_to_wasi_fs(tarball_fs, [
    ['tmp', new DirWithIno(new Map(), _xxx_assigned_ino_nums++)],
    ['test.c', new FileWithIno(new TextEncoder("utf-8").encode(`#include<stdio.h>\nint main() {printf("Hewwo world? %d\\n", 12345);return 0;}\n`), { ino: _xxx_assigned_ino_nums++ })],
    ['test.ld', new FileWithIno(new TextEncoder("utf-8").encode(`__flash = 0x08000000;\n__flash_size = 1M;\n__ram = 0x20000000;\n__ram_size = 16k;\n__stack_size = 512;\nINCLUDE picolibcpp.ld\n`), { ino: _xxx_assigned_ino_nums++ })],
]);
// console.log(wasi_fs);

let wasm = await WebAssembly.compileStreaming(fetch("llvm.wasm"));

async function compile() {
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
    let wasi_obj = new WASI(args, [], fds);
    // console.log(wasi_obj);

    let inst = await WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi_obj.wasiImport,
    });
    // console.log(inst);
    wasi_obj.start(inst);
    console.log("COMPILE OKAY!");
    // console.log(wasi_fs);
}
await compile();

async function link() {
    let args = [
        "ld.lld",
        "tmp/asdf.o",
        "--gc-sections",
        "-Ttest.ld",
        "-lcrt0",
        "-ldummyhost",
        "-Bstatic",
        "-EL",
        "-Lsysroot/cm01-exc-rtti/lib",
        "-Lsysroot/cm01/lib",
        "-Lsysroot/lib/armv6m-unknown-none-eabi",
        "-Lsysroot/cm01-exc-rtti/lib",
        "-Lsysroot/cm01/lib",
        "-lc",
        "-lm",
        "sysroot/cm01/lib/libclang_rt.builtins.a",
        "--target2=rel",
        "-o",
        "a.out"
    ];
    let fds = [
        new OpenFile(new File([])),
        ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
        ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
        wasi_fs,
    ];
    let wasi_obj = new WASI(args, [], fds);
    // console.log(wasi_obj);

    let inst = await WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi_obj.wasiImport,
    });
    // console.log(inst);
    wasi_obj.start(inst);
    console.log("LINK OKAY!");
    // console.log(wasi_fs);
}
await link();

const elf_output = wasi_fs.dir.contents.get('a.out').data;
const blob = new Blob([elf_output], { type: "application/x-elf" });
const url = URL.createObjectURL(blob);
let atag = document.createElement("a");
atag.href = url;
atag.download = "a.out";
atag.style = "display: none";
document.body.appendChild(atag);
atag.click();
atag.remove();
URL.revokeObjectURL(url);
