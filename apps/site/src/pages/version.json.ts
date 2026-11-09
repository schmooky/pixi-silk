import type { APIRoute } from 'astro';
import { BUILD_ID } from '@/lib/build-id.mjs';

/* The id of the build that is live. Base.astro compares it with the id in the page it loaded. */
export const GET: APIRoute = () =>
    new Response(JSON.stringify({ build: BUILD_ID }), { headers: { 'Content-Type': 'application/json' } });
