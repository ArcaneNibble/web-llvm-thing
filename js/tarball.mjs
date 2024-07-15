import { get_c_str } from "./utils.mjs";

const text_decoder = new TextDecoder();

export function parse_tarball(tarball_bytes) {
    let virtual_filesystem = {};

    let tar_offs = 0;
    while (tar_offs <= tarball_bytes.length) {
        if (tar_offs == tarball_bytes.length - 1024) {
            // XXX check if these are indeed zeros?
            break;
        }

        let filename = get_c_str(tarball_bytes, tar_offs + 0, 100);
        const filetype = tarball_bytes[tar_offs + 156];
        const prefix = get_c_str(tarball_bytes, tar_offs + 345, 155);
        if (prefix.length != 0)
            filename = prefix + "/" + filename;
        if (filetype == 0x35) {
            console.log("Directory: " + filename);
            const path = filename.split("/");
            let dir = virtual_filesystem;
            for (let i = 0; i < path.length - 2; i++)
                dir = dir[path[i]];
            dir[path[path.length - 2]] = {};
            tar_offs += 512;
        } else if (filetype == 0x30) {
            console.log("File: " + filename);
            const filesize_str = get_c_str(tarball_bytes, tar_offs + 124, 11);
            const filesize = parseInt(filesize_str, 8);
            const filesize_round_up = (((filesize + 511) / 512) | 0) * 512;
            const file_data = tarball_bytes.slice(tar_offs + 512, tar_offs + 512 + filesize);

            const path = filename.split("/");
            let dir = virtual_filesystem;
            for (let i = 0; i < path.length - 1; i++)
                dir = dir[path[i]];
            dir[path[path.length - 1]] = file_data;

            tar_offs += 512 + filesize_round_up;
        } else if (filetype == 0x31) {
            const target_filename = get_c_str(tarball_bytes, tar_offs + 157, 100);
            console.log("Hard link: " + filename + " -> " + target_filename);

            const tgt_path = target_filename.split("/");
            let tgt = virtual_filesystem;
            for (const pathelem of tgt_path)
                tgt = tgt[pathelem];

            const path = filename.split("/");
            let dir = virtual_filesystem;
            for (let i = 0; i < path.length - 1; i++)
                dir = dir[path[i]];
            dir[path[path.length - 1]] = tgt;

            tar_offs += 512;
        } else {
            throw new Error("unimplemented!");
        }
    }

    return virtual_filesystem;
}
