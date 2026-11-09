#!/usr/bin/env node
/**
 * Diagnostic: writes copies of hlsl/fragment-fxc.hlsl with one polyTexel call site replaced by a
 * constant, so FXC can show which call site it fails on. Temporary, for the Direct3D 11 bug.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('hlsl/fragment-fxc.hlsl', 'utf8');
const lines = src.split('\n');
const sites = lines.flatMap((l, i) => (/f_polyTexel_int\(/.test(l) && !/^float4 f_polyTexel_int/.test(l) ? [i] : []));

/** Replaces every polyTexel call on a line with a constant, matching its parentheses. */
function constant(line) {
    let out = line;
    let at = out.indexOf('f_polyTexel_int(');

    while (at >= 0) {
        let depth = 0;
        let end = at + 'f_polyTexel_int'.length;

        for (; end < out.length; end++) {
            if (out[end] === '(') depth++;
            else if (out[end] === ')' && --depth === 0) break;
        }
        out = `${out.slice(0, at)}float4(0.5, 0.5, 0.5, 0.5)${out.slice(end + 1)}`;
        at = out.indexOf('f_polyTexel_int(');
    }

    return out;
}

mkdirSync('hlsl/variants', { recursive: true });
for (const i of sites) {
    const copy = [...lines];

    copy[i] = constant(copy[i]);
    writeFileSync(`hlsl/variants/site-${i + 1}.hlsl`, copy.join('\n'));
}
// no discard inside pathSD's loop
writeFileSync('hlsl/variants/no-discard.hlsl', src.replace(/discard;/g, '{}'));
console.log(`fxc-variants: ${sites.length} call sites: ${sites.map((i) => i + 1).join(', ')}`);
