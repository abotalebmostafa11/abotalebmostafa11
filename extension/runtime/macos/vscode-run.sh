#!/bin/bash
# C++ Start for Apple silicon. Invoked by the local VS Code extension.
set -eu
umask 077

fail() { printf 'C++ Start: %s\n' "$1" >&2; exit 1; }
source_file=''
snapshot=''
action=Run
output=''
while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] || fail "Missing value for $1"
    case "$1" in
        --source) source_file=$2 ;;
        --snapshot) snapshot=$2 ;;
        --action) action=$2 ;;
        --output) output=$2 ;;
        *) fail "Unknown argument: $1" ;;
    esac
    shift 2
done
case "$action" in Build|Run) ;; *) fail 'Expected Build or Run.' ;; esac
case "$source_file" in /*) ;; *) fail 'Open a local C++ file first.' ;; esac
[ -f "$source_file" ] || fail "Cannot open $source_file"
if [ -n "$snapshot" ]; then
    case "$snapshot" in /*) ;; *) fail 'The editor snapshot must use an absolute path.' ;; esac
    [ -f "$snapshot" ] || fail 'The open editor text is no longer available. Run again.'
fi
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
    /usr/bin/xcode-select --install >/dev/null 2>&1 || true
    fail "Finish Apple's Command Line Tools installation, then run this file again."
fi
compiler=$(/usr/bin/xcrun --sdk macosx --find clang++) || fail 'Apple clang++ is unavailable.'
sdk=$(/usr/bin/xcrun --sdk macosx --show-sdk-path) || fail 'The macOS SDK is unavailable.'

work=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/cppstart-run.XXXXXXXX")
build_dir=''
cleanup() {
    /bin/rm -rf "$work"
    if [ -n "$build_dir" ]; then /bin/rm -rf "$build_dir"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Quote a POSIX filename as a UTF-8 JSON string for Clang's VFS overlay.
# Control bytes, quotes and backslashes are escaped. Unicode bytes pass through.
json_path() {
    local LC_ALL=C text=$1 i ch
    printf '"'
    for ((i=0; i<${#text}; i++)); do
        ch=${text:i:1}
        case "$ch" in
            '"') printf '\\"' ;;
            \\) printf '\\\\' ;;
            [[:cntrl:]]) printf '\\u%04x' "'$ch" ;;
            *) printf '%s' "$ch" ;;
        esac
    done
    printf '"'
}

compile_args=(-std=c++20 -O0 -Wall -Wextra -finput-charset=UTF-8
    -fexec-charset=UTF-8 -fno-color-diagnostics -isysroot "$sdk" -x c++)
if [ -n "$snapshot" ]; then
    overlay="$work/overlay.json"
    {
        printf '{"version":0,"use-external-names":false,"roots":[{"type":"file","name":'
        json_path "$source_file"
        printf ',"external-contents":'
        json_path "$snapshot"
        printf '}]}\n'
    } > "$overlay"
    compile_args+=(-ivfsoverlay "$overlay")
fi

program="$work/program"
if [ "$action" = Build ]; then
    if [ -z "$output" ]; then
        digest=$(printf '%s' "$source_file" | /usr/bin/shasum -a 256)
        output="$HOME/Library/Application Support/CppStart/builds/${digest%% *}/program"
    fi
    case "$output" in /*) ;; *) fail 'The build destination must use an absolute path.' ;; esac
    [ "$output" != "$source_file" ] || fail 'Choose a build destination separate from the source file.'
    [ ! -d "$output" ] || fail 'Choose a file as the build destination.'
    [ ! -e "$output" ] || [ ! "$source_file" -ef "$output" ] || fail 'The destination is the source file.'
    dest_dir=${output%/*}
    /bin/mkdir -p "${dest_dir:-/}"
    build_dir=$(/usr/bin/mktemp -d "${dest_dir:-/}/.cppstart-build.XXXXXXXX")
    program="$build_dir/program"
fi
cd -- "${source_file%/*}/"
"$compiler" "${compile_args[@]}" "$source_file" -o "$program"
if [ "$action" = Build ]; then
    /bin/mv -f "$program" "$output"
else
    "$program"
fi
