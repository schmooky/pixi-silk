#!/bin/sh
# Builds kb.wasm with LLVM (clang and wasm-ld), no Emscripten:
#   CLANG=/opt/homebrew/opt/llvm@20/bin/clang sh build.sh
set -e
cd "$(dirname "$0")"
CLANG="${CLANG:-clang}"
"$CLANG" --target=wasm32 -Oz -nostdlib -ffreestanding -fno-builtin -I ../../compiler/.cache/kb \
    -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all -Wl,--gc-sections -Wl,--growable-table \
    -Wl,--initial-memory=1048576 -o kb.wasm kb_wasm.c
ls -l kb.wasm
