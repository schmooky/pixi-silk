// WebAssembly build of kb_text_shape for @pixi-silk/shaper-kb. Freestanding: no C runtime.
// Build: see build.sh. The header itself is fetched into packages/compiler/.cache/kb (kb_text_shape v2.32, zlib License).
typedef __SIZE_TYPE__ size_t;

void *memset(void *d, int c, size_t n) {
    unsigned char *p = d;
    while (n--) *p++ = (unsigned char)c;
    return d;
}

void *memcpy(void *d, const void *s, size_t n) {
    unsigned char *p = d;
    const unsigned char *q = s;
    while (n--) *p++ = *q++;
    return d;
}

void *memmove(void *d, const void *s, size_t n) {
    unsigned char *p = d;
    const unsigned char *q = s;
    if (p < q) while (n--) *p++ = *q++;
    else { p += n; q += n; while (n--) *--p = *--q; }
    return d;
}

// A small first-fit allocator with a free list, so repeated shaping does not leak.
extern unsigned char __heap_base;
typedef struct Block { size_t size; struct Block *next; } Block;
static size_t top = 0;
static Block *freelist = 0;

static void *grow(size_t size) {
    if (!top) top = ((size_t)&__heap_base + 15) & ~(size_t)15;
    size_t p = top;
    top += size;
    size_t have = __builtin_wasm_memory_size(0) * 65536;
    if (top > have) __builtin_wasm_memory_grow(0, (top - have + 65535) / 65536);
    return (void *)p;
}

static void *alloc(size_t size) {
    size = (size + sizeof(Block) + 15) & ~(size_t)15;
    for (Block **b = &freelist; *b; b = &(*b)->next) {
        if ((*b)->size >= size) {
            Block *found = *b;
            *b = found->next;
            return found + 1;
        }
    }
    Block *block = grow(size);
    block->size = size;
    return block + 1;
}

static void release(void *ptr) {
    if (!ptr) return;
    Block *block = (Block *)ptr - 1;
    block->next = freelist;
    freelist = block;
}

#define KB_TEXT_SHAPE_IMPLEMENTATION
#define KB_TEXT_SHAPE_NO_CRT
#define KBTS_MEMSET memset
#define KBTS_MEMCPY memcpy
#define KBTS_MALLOC(Data, Size) alloc(Size)
#define KBTS_FREE(Data, Pointer) release(Pointer)
#include "kb_text_shape.h"

static kbts_shape_context *context;

__attribute__((export_name("kb_alloc"))) void *kb_alloc(int size) { return alloc((size_t)size); }
__attribute__((export_name("kb_free"))) void kb_free(void *ptr) { release(ptr); }

// Loads the font (the bytes must stay allocated). Returns 1 on success.
__attribute__((export_name("kb_init"))) int kb_init(void *font, int size) {
    context = kbts_CreateShapeContext(0, 0);
    return context && kbts_ShapePushFontFromMemory(context, font, size, 0) ? 1 : 0;
}

// Shapes UTF-32 code points as one paragraph (direction 0 auto, 1 ltr, 2 rtl). Writes 6 ints per
// glyph to out, in visual order: glyph id, code point index, advance x, offset x, offset y, run rtl.
// Returns the glyph count, at most max.
__attribute__((export_name("kb_shape"))) int kb_shape(int *codepoints, int count, int direction, int *out, int max) {
    kbts_direction dir = direction == 1 ? KBTS_DIRECTION_LTR : direction == 2 ? KBTS_DIRECTION_RTL : KBTS_DIRECTION_DONT_KNOW;
    kbts_ShapeBegin(context, dir, KBTS_LANGUAGE_DONT_KNOW);
    kbts_ShapeUtf32(context, codepoints, count);
    kbts_ShapeEnd(context);
    int n = 0;
    kbts_run run;
    while (kbts_ShapeRun(context, &run)) {
        kbts_glyph *glyph;
        while (kbts_GlyphIteratorNext(&run.Glyphs, &glyph)) {
            if (n < max) {
                int *o = out + n * 6;
                o[0] = glyph->Id;
                o[1] = glyph->UserIdOrCodepointIndex;
                o[2] = glyph->AdvanceX;
                o[3] = glyph->OffsetX;
                o[4] = glyph->OffsetY;
                o[5] = run.Direction == KBTS_DIRECTION_RTL;
            }
            n++;
        }
    }
    return n < max ? n : max;
}
