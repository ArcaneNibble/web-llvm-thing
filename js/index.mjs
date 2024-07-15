import { WASI, File, OpenFile, ConsoleStdout, Directory, PreopenDirectory, wasi } from "@bjorn3/browser_wasi_shim";
import { parse_tarball } from "./tarball.mjs";

const sysroot_tarball = await fetch("sysroot.tar");
if (!sysroot_tarball.ok) {
    throw new Error("failed to get sysroot tarball");
}
const tarball_bytes = new Uint8Array(await sysroot_tarball.arrayBuffer());
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

let wasm = await WebAssembly.compileStreaming(fetch("llvm.wasm"));

document.getElementById("downloading").innerText = "Done downloading!";

const COMPILE_FLAGS = {
    "wasi": ["--target=wasm32-wasip1"],

    "cm01": ["--target=armv6m-unknown-none-eabi"],
    "cm3": ["--target=armv7m-unknown-none-eabi"],
    "cm4": ["--target=armv7em-unknown-none-eabi", "-mfpu=none"],
    "cm4f": ["--target=armv7em-unknown-none-eabihf"],

    'qk-v2a': ["--target=riscv32-unknown-none-elf", "-march=rv32ec_xwchc"],
    'qk-v34a': ["--target=riscv32-unknown-none-elf", "-march=rv32imac"],
    'qk-v4bc': ["--target=riscv32-unknown-none-elf", "-march=rv32imac_xwchc"],
    'qk-v4f': ["--target=riscv32-unknown-none-elf", "-march=rv32imafc_xwchc"],
}

async function invoke_into_wasm(wasi_fs, args) {
    let output = [];
    let fds = [
        new OpenFile(new File([])),
        ConsoleStdout.lineBuffered(msg => output.push(msg)),
        ConsoleStdout.lineBuffered(msg => output.push(msg)),
        wasi_fs,
    ];
    let wasi_obj = new WASI(args, [], fds);

    let inst = await WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi_obj.wasiImport,
    });
    const ret = wasi_obj.start(inst);
    if (ret !== 0) {
        console.log(output);
        alert("Something went wrong!");
    }

    return output;
}

async function do_compile(e) {
    const source_code = document.getElementById("sourcecode").value;
    const linkscript = document.getElementById("linkscript").value;
    const compilerflags = document.getElementById("compileflags").value;
    const target = document.getElementById("target").value;
    const is_cpp = document.getElementById("cpp").checked;

    let final_compile_flags = [is_cpp ? "clang++" : "clang"];
    if (target === "wasi") {
        final_compile_flags = final_compile_flags.concat([
            "--sysroot=sysroot/wasm32-wasip1",
            "-resource-dir=sysroot/wasm32-wasip1",
        ])
    } else {
        final_compile_flags = final_compile_flags.concat([
            "--sysroot=sysroot",
            "-resource-dir=sysroot",
        ])
    }
    final_compile_flags = final_compile_flags.concat(COMPILE_FLAGS[target]);
    final_compile_flags = final_compile_flags.concat(compilerflags.split(" "));
    if (is_cpp) {
        final_compile_flags.push("test.cpp");
    } else {
        final_compile_flags.push("test.c");
    }
    if (target !== "wasi") {
        final_compile_flags.push("-Wl,-Ttest.ld");
    }
    final_compile_flags.push("-###");
    console.log(final_compile_flags);

    const wasi_fs = fs_to_wasi_fs(tarball_fs, [
        ['tmp', new DirWithIno(new Map(), _xxx_assigned_ino_nums++)],
        [is_cpp ? 'test.cpp' : 'test.c', new FileWithIno(new TextEncoder("utf-8").encode(source_code), { ino: _xxx_assigned_ino_nums++ })],
        ['test.ld', new FileWithIno(new TextEncoder("utf-8").encode(linkscript), { ino: _xxx_assigned_ino_nums++ })],
    ]);
    console.log(wasi_fs);

    // RUN THE -### phase

    const driver_xxx_result = await invoke_into_wasm(wasi_fs, final_compile_flags);
    console.log(driver_xxx_result);

    // Port of whitequark's driver driver

    let state = 0;
    let commands = [];
    for (const line of driver_xxx_result) {
        if (state === 0) {
            if (![
                "clang",
                "Target:",
                "Thread model:",
                "InstalledDir:",
                "Build config:"
            ].some(x => line.startsWith(x))) {
                state = 1;
            }
        }
        if (state === 1) {
            if (line.startsWith(" \"")) {
                // XXX this is much less robust splitting
                commands.push(line.split(" ").slice(1).map(x => {
                    if (x.startsWith('"') && x.endsWith('"')) {
                        return x.slice(1, x.length - 1);
                    }
                    return x;
                }));
            } else {
                state = 2;
            }
        }
    }
    if (state === 1) {
        for (let command of commands) {
            if (command[0] === "") {
                command = command.slice(1);
            }

            // XXX I have no idea why this is failing
            for (let i = 0; i < command.length; i++) {
                if (command[i].startsWith("/tmp")) {
                    command[i] = "tmp/asdf.o";
                }
            }

            console.log(command);
            const step_result = await invoke_into_wasm(wasi_fs, command);
            document.getElementById("output").innerText = step_result.join("\n");
        }
    } else {
        document.getElementById("output").innerText = driver_xxx_result.join("\n");
        alert("Something went wrong!");
    }

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
}

document.getElementById("compile").onclick = do_compile;
