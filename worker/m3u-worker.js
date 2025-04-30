// worker/m3u-worker.js

// CORS 预设头部 (根据需要调整)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // 或者更严格: 'https://YOUR_FRONTEND_DOMAIN.pages.dev'
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range', // 添加 Range for potential video seeking
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range', // Expose necessary headers
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // --- OPTIONS Preflight Handling ---
        if (request.method === 'OPTIONS') {
            // Allow OPTIONS for subscriptions and proxy endpoints
            if (pathSegments[0] === 'api' &&
               (pathSegments[1] === 'subscriptions' || pathSegments[1] === 'proxy')) {
                return new Response(null, { headers: corsHeaders, status: 204 });
            } else {
                // For other paths, return 404 or handle differently if needed
                return new Response('Not Found', { status: 404 });
            }
        }

        // --- API Routing ---
        if (pathSegments[0] === 'api') {
            try {
                // Handle /api/subscriptions/...
                if (pathSegments[1] === 'subscriptions') {
                    const subscriptionId = pathSegments[2];
                    if (request.method === 'GET' && !subscriptionId) {
                        return await handleListSubscriptions(env);
                    }
                    if (request.method === 'POST' && !subscriptionId) {
                        return await handleAddSubscription(request, env);
                    }
                    if (request.method === 'DELETE' && subscriptionId) {
                        return await handleDeleteSubscription(subscriptionId, env);
                    }
                    // Method/path mismatch for subscriptions
                    const status = subscriptionId ? 405 : 404;
                     return new Response(status === 405 ? 'Method Not Allowed' : 'Not Found', { status: status, headers: corsHeaders });
                }

                // Handle /api/proxy?url=...
                if (pathSegments[1] === 'proxy' && request.method === 'GET') {
                    return await handleProxyRequest(request, env);
                }

                // Fallback for other /api paths
                return new Response('API Endpoint Not Found', { status: 404, headers: corsHeaders });

            } catch (error) {
                console.error(`Worker Error: ${error.message}\n${error.stack}`);
                 return new Response(`Internal Server Error: ${error.message}`, { status: 500, headers: corsHeaders });
            }
        }

        // --- Non-API Requests (e.g., serving static assets if Worker was standalone) ---
        // If deployed alongside Pages, Pages usually handles static assets.
        return new Response('Not Found', { status: 404 }); // Default fallback
    },
};


// --- New Proxy Handler ---
async function handleProxyRequest(request, env) {
    const requestUrl = new URL(request.url);
    const targetUrlEncoded = requestUrl.searchParams.get('url');

    if (!targetUrlEncoded) {
        return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders });
    }

    let targetUrl;
    try {
        targetUrl = decodeURIComponent(targetUrlEncoded);
        // Basic validation
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            throw new Error('Invalid protocol');
        }
    } catch (e) {
        return new Response('Invalid or malformed "url" query parameter', { status: 400, headers: corsHeaders });
    }

    try {
        console.log(`Worker proxying request for: ${targetUrl}`);

        // Important: Create a new Request object to avoid passing Cloudflare-specific headers
        // to the target server. Only pass essential headers if needed (like Range).
        const proxyRequestHeaders = new Headers();
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
            proxyRequestHeaders.set('Range', rangeHeader);
            console.log(`Passing Range header: ${rangeHeader}`);
        }
        // Add User-Agent if needed, some servers are picky
        // proxyRequestHeaders.set('User-Agent', 'MyM3UPlayerProxy/1.0');

        const originResponse = await fetch(targetUrl, {
             method: request.method, // Usually GET for HLS
             headers: proxyRequestHeaders,
             redirect: 'follow' // Follow redirects from the origin server
        });


        // Check if the fetch was successful
        if (!originResponse.ok) {
            console.error(`Proxy target fetch failed for ${targetUrl} with status: ${originResponse.status}`);
            // Relay the error status, but use our CORS headers
            return new Response(originResponse.body, {
                 status: originResponse.status,
                 statusText: originResponse.statusText,
                 headers: corsHeaders // Return CORS headers even on error
            });
        }

        // --- Response Header Handling ---
        const responseHeaders = new Headers(corsHeaders);

        // Copy relevant headers from the origin response
        const contentType = originResponse.headers.get('Content-Type');
        if (contentType) {
            responseHeaders.set('Content-Type', contentType);
        }
        const contentLength = originResponse.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength);
        }
         const contentRange = originResponse.headers.get('Content-Range');
        if (contentRange) {
            responseHeaders.set('Content-Range', contentRange);
        }
        // Copy caching headers if desired
        // const cacheControl = originResponse.headers.get('Cache-Control');
        // if (cacheControl) responseHeaders.set('Cache-Control', cacheControl);
        // const etag = originResponse.headers.get('ETag');
        // if (etag) responseHeaders.set('ETag', etag);
        // const lastModified = originResponse.headers.get('Last-Modified');
        // if (lastModified) responseHeaders.set('Last-Modified', lastModified);

        // --- M3U8 Manifest Rewriting ---
        // Check if the content type indicates an M3U8 file
        if (contentType && (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || contentType.includes('audio/mpegurl'))) {
             console.log(`Detected M3U8 content type for ${targetUrl}. Rewriting URLs.`);
             const m3uText = await originResponse.text(); // Read the body as text
             const rewrittenM3u = rewriteM3uUrls(m3uText, targetUrl, requestUrl.origin + '/api/proxy'); // Pass base URL and proxy path
             // Return the modified text
             return new Response(rewrittenM3u, {
                 status: originResponse.status,
                 statusText: originResponse.statusText,
                 headers: responseHeaders // Use the headers we constructed (with updated Content-Length if needed, though often omitted for dynamic content)
             });
        } else {
            // --- Direct Proxy for other content (like TS segments) ---
            // Stream the response body directly
            return new Response(originResponse.body, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: responseHeaders
            });
        }

    } catch (error) {
        console.error(`Error during proxy request for ${targetUrl}: ${error.message}\n${error.stack}`);
        return new Response('Proxy internal error', { status: 500, headers: corsHeaders });
    }
}


// --- M3U8 Rewriting Helper Function ---
function rewriteM3uUrls(m3uText, baseUrl, proxyPrefix) {
    const lines = m3uText.split('\n');
    const base = new URL(baseUrl); // Base URL object for resolving relative paths

    const rewrittenLines = lines.map(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) { // This line is likely a URL
            try {
                // Resolve the URL (handles both relative and absolute paths within the manifest)
                const segmentUrl = new URL(trimmedLine, base).toString();
                // Rewrite the URL to go through the proxy
                // Only rewrite http/https URLs - ignore potential data URIs etc.
                 if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
                     const proxiedUrl = `${proxyPrefix}?url=${encodeURIComponent(segmentUrl)}`;
                     console.log(`Rewriting URL: ${trimmedLine} -> ${proxiedUrl}`);
                     return proxiedUrl; // Return the proxied URL
                 } else {
                     console.log(`Skipping rewrite for non-http(s) URL: ${trimmedLine}`);
                     return line; // Keep original line if not http/https
                 }
            } catch (e) {
                 console.warn(`Failed to parse or rewrite URL line: ${trimmedLine}`, e);
                 return line; // Keep original line on error
            }
        } else if (trimmedLine.startsWith('#EXT-X-KEY:')) {
             // Handle encryption key URLs if present
             const uriMatch = trimmedLine.match(/URI="([^"]+)"/);
             if (uriMatch && uriMatch[1]) {
                 const keyUri = uriMatch[1];
                 try {
                     const keyUrl = new URL(keyUri, base).toString();
                      if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
                           const proxiedKeyUrl = `${proxyPrefix}?url=${encodeURIComponent(keyUrl)}`;
                           console.log(`Rewriting Key URI: ${keyUri} -> ${proxiedKeyUrl}`);
                           return trimmedLine.replace(uriMatch[0], `URI="${proxiedKeyUrl}"`);
                      } else {
                          console.log(`Skipping rewrite for non-http(s) Key URI: ${keyUri}`);
                         return line;
                      }
                 } catch (e) {
                      console.warn(`Failed to parse or rewrite Key URI: ${keyUri}`, e);
                      return line;
                 }
             } else {
                  return line; // No URI attribute found
             }
         }
        // Keep comment lines and other directives as they are
        return line;
    });

    return rewrittenLines.join('\n');
}


// --- Existing Handler Functions (handleListSubscriptions, etc.) remain unchanged ---
// --- Handler Functions (添加 CORS 头部) ---

async function handleListSubscriptions(env) {
    if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        // ... (原有逻辑不变) ...
        const listResult = await env.SUBS_KV.list();
        const subscriptions = [];
        for (const key of listResult.keys) {
             const url = await env.SUBS_KV.get(key.name);
             if (url) {
                 subscriptions.push({ id: key.name, url: url });
             }
        }
        // 将 CORS 头和 Content-Type 合并
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        return new Response(JSON.stringify(subscriptions), {
            headers: headers,
            status: 200,
        });
    } catch (error) {
         console.error("Error listing subscriptions from KV:", error);
         return new Response('Failed to list subscriptions', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}

async function handleAddSubscription(request, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        const body = await request.json();
        const urlToAdd = body?.url;
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' }; // 合并头

        if (!urlToAdd || typeof urlToAdd !== 'string' || !urlToAdd.startsWith('http')) {
            return new Response(JSON.stringify({ error: 'Invalid or missing URL in request body.' }), {
                 status: 400,
                 headers: headers
             });
        }

        const id = crypto.randomUUID();
        await env.SUBS_KV.put(id, urlToAdd);

        return new Response(JSON.stringify({ id: id, url: urlToAdd }), {
            status: 201,
            headers: headers,
        });
    } catch (error) {
         console.error("Error adding subscription:", error);
         const headers = { ...corsHeaders, 'Content-Type': 'application/json' }; // 合并头
         if (error instanceof SyntaxError) {
              return new Response(JSON.stringify({ error: 'Invalid JSON format in request body.' }), { status: 400, headers: headers });
         }
         return new Response('Failed to add subscription', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}

async function handleDeleteSubscription(id, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
    try {
        const exists = await env.SUBS_KV.get(id);
        if (exists === null) {
             return new Response('Subscription not found', { status: 404, headers: corsHeaders }); // 添加 CORS 头
        }

        await env.SUBS_KV.delete(id);
        // 对于 204 No Content 响应，通常也需要 CORS 头
        return new Response(null, { status: 204, headers: corsHeaders });
    } catch (error) {
         console.error(`Error deleting subscription ${id}:`, error);
         return new Response('Failed to delete subscription', { status: 500, headers: corsHeaders }); // 添加 CORS 头
    }
}
