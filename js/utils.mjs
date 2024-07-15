const text_decoder = new TextDecoder();

export function get_c_str(arr, offs, max_len) {
    let len = 0;
    while (arr[offs + len] != 0 && len < max_len)
        len++;
    return text_decoder.decode(arr.slice(offs, offs + len));
}
