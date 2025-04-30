// Bind the KV namespace in your wrangler.toml or Cloudflare dashboard
// Example wrangler.toml:
// [[kv_namespaces]]
// binding = "SUBS_KV"
// id = "YOUR_KV_NAMESPACE_ID"

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean); // e.g., ['api', 'subscriptions', 'some-id']

        // Check if the request is for our API endpoint
        if (pathSegments[0] === 'api' && pathSegments[1] === 'subscriptions') {
            const subscriptionId = pathSegments[2]; // Might be undefined if path is just /api/subscriptions

            try {
                // Handle GET /api/subscriptions (List all)
                if (request.method === 'GET' && !subscriptionId) {
                    return await handleListSubscriptions(env);
                }

                // Handle POST /api/subscriptions (Add new)
                if (request.method === 'POST' && !subscriptionId) {
                    return await handleAddSubscription(request, env);
                }

                // Handle DELETE /api/subscriptions/{id} (Delete one)
                if (request.method === 'DELETE' && subscriptionId) {
                    return await handleDeleteSubscription(subscriptionId, env);
                }

                 // If method/path combination doesn't match above, return 405 or 404
                 return new Response('Method Not Allowed or Not Found', { status: subscriptionId ? 405 : 404 });


            } catch (error) {
                console.error(`Worker Error: ${error.message}`, error.stack);
                return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
            }
        }

        // If the path doesn't start with /api/subscriptions, return 404
        return new Response('Not Found', { status: 404 });
    },
};

// --- Handler Functions ---

async function handleListSubscriptions(env) {
    if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500 });
    }
    try {
        const listResult = await env.SUBS_KV.list();
        const subscriptions = [];
        for (const key of listResult.keys) {
             // Assuming the key's 'name' is the ID and the value is the URL
             const url = await env.SUBS_KV.get(key.name);
             if (url) { // Ensure we got a URL
                 subscriptions.push({ id: key.name, url: url });
             }
        }
        // IMPORTANT: Stringify the array and set Content-Type header
        return new Response(JSON.stringify(subscriptions), {
            headers: { 'Content-Type': 'application/json' },
            status: 200, // OK
        });
    } catch (error) {
         console.error("Error listing subscriptions from KV:", error);
         return new Response('Failed to list subscriptions', { status: 500 });
    }
}

async function handleAddSubscription(request, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500 });
    }
    try {
        const body = await request.json(); // Expecting { "url": "..." }
        const urlToAdd = body?.url;

        if (!urlToAdd || typeof urlToAdd !== 'string' || !urlToAdd.startsWith('http')) {
            return new Response(JSON.stringify({ error: 'Invalid or missing URL in request body.' }), {
                 status: 400, // Bad Request
                 headers: { 'Content-Type': 'application/json' }
             });
        }

        // Generate a unique ID for the subscription
        const id = crypto.randomUUID();

        // Store the URL in KV with the ID as the key
        await env.SUBS_KV.put(id, urlToAdd);

        // Return the newly created subscription details
        return new Response(JSON.stringify({ id: id, url: urlToAdd }), {
            status: 201, // Created
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
         // Handle potential JSON parsing errors from request.json() or KV errors
         console.error("Error adding subscription:", error);
         if (error instanceof SyntaxError) {
              return new Response(JSON.stringify({ error: 'Invalid JSON format in request body.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
         }
         return new Response('Failed to add subscription', { status: 500 });
    }
}

async function handleDeleteSubscription(id, env) {
     if (!env.SUBS_KV) {
         return new Response('KV Namespace not bound.', { status: 500 });
    }
    try {
        // Check if the key exists before deleting (optional, delete is idempotent)
        const exists = await env.SUBS_KV.get(id);
        if (exists === null) {
             return new Response('Subscription not found', { status: 404 });
        }

        await env.SUBS_KV.delete(id);
        // Standard practice for DELETE is to return 204 No Content
        return new Response(null, { status: 204 });
    } catch (error) {
         console.error(`Error deleting subscription ${id}:`, error);
         return new Response('Failed to delete subscription', { status: 500 });
    }
}
