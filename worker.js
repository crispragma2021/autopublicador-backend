import { GoogleGenAI } from "@google/genai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  // --- API HANDLER ---
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Endpoint: Generar Imagen (Lógica Híbrida)
    if (path === "/api/generate" && request.method === "POST") {
      return await handleGenerate(request, env);
    }

    // 2. Endpoint: Guardar BYOK Key
    if (path === "/api/save-byok" && request.method === "POST") {
      return await handleSaveBYOK(request, env);
    }

    // 3. Endpoint: Stripe Webhook
    if (path === "/api/stripe-webhook" && request.method === "POST") {
      return await handleStripeWebhook(request, env);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },

  // --- CRON TRIGGER (Automatización) ---
  async scheduled(event, env, ctx) {
    await processScheduledPosts(env);
  },
};

// --- LÓGICA DE NEGOCIO ---

async function handleGenerate(request, env) {
  try {
    const body = await request.json();
    const { userId, prompt, type = "image" } = body;
    const COST = 1; // Costo por generación en créditos

    // 1. Verificar Usuario en D1
    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first();
    
    if (!user) {
      // Crear usuario si no existe (primer uso)
      await env.DB.prepare("INSERT INTO users (user_id) VALUES (?)").bind(userId).run();
      user = { user_id: userId, credits: 0, trial_uses_left: 5, byok_key: null };
    }

    let selectedApiKey = env.SYSTEM_GEMINI_KEY; // Default system key
    let modeUsed = "";

    // 2. Lógica de Costo (Prioridad: Trial -> Credits -> BYOK)
    if (user.trial_uses_left > 0) {
      modeUsed = "TRIAL";
      // Se usará la System Key
    } else if (user.credits >= COST) {
      modeUsed = "CREDIT";
      // Se usará la System Key
    } else if (user.byok_key) {
      modeUsed = "BYOK";
      selectedApiKey = user.byok_key; // Usar la clave del usuario
    } else {
      return new Response(JSON.stringify({ error: "Payment Required. Buy credits or add BYOK." }), {
        status: 402,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. Generar con IA
    const imageUrl = await generateAndUploadImage(prompt, selectedApiKey, env);

    // 4. Actualizar D1 (Transacción atómica)
    const batch = [];
    
    if (modeUsed === "TRIAL") {
      batch.push(env.DB.prepare("UPDATE users SET trial_uses_left = trial_uses_left - 1 WHERE user_id = ?").bind(userId));
    } else if (modeUsed === "CREDIT") {
      batch.push(env.DB.prepare("UPDATE users SET credits = credits - ? WHERE user_id = ?").bind(COST, userId));
    }
    // Si es BYOK, no tocamos saldos

    // Registrar Log
    batch.push(env.DB.prepare(
      "INSERT INTO consumption_log (user_id, action_type, cost, mode_used) VALUES (?, ?, ?, ?)"
    ).bind(userId, "GEN_IMG", modeUsed === "CREDIT" ? COST : 0, modeUsed));

    await env.DB.batch(batch);

    return new Response(JSON.stringify({ url: imageUrl, mode: modeUsed }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
}

// Helper: Generar y subir a R2
async function generateAndUploadImage(prompt, apiKey, env) {
  // 1. Llamada a Gemini/Pollinations (Ejemplo simplificado usando Pollinations para demo rápida sin key, adaptar a Gemini Imagen 3 si se tiene acceso)
  // Nota: Para arquitectura real con apiKey, aquí iría la llamada a ai.models.generateImage con la apiKey inyectada.
  
  const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const imgResp = await fetch(externalUrl);
  const blob = await imgResp.arrayBuffer();

  // 2. Guardar en R2
  const filename = `gen-${Date.now()}.jpg`;
  await env.BUCKET.put(filename, blob, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  // 3. Devolver URL pública (Configurar Custom Domain en R2 o usar worker proxy)
  return `https://pub-r2.tudominio.com/${filename}`; 
}

async function handleSaveBYOK(request, env) {
  const { userId, apiKey } = await request.json();
  await env.DB.prepare("UPDATE users SET byok_key = ? WHERE user_id = ?").bind(apiKey, userId).run();
  return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
}

async function handleStripeWebhook(request, env) {
  // Simplificado: En producción, verificar firma de Stripe
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  
  // Asumimos que parseamos el evento (necesitas la librería stripe-js o parseo manual)
  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata.userId; // UserId pasado al crear sesión
    const creditsBought = parseInt(session.metadata.credits || "100");

    // Actualizar créditos
    await env.DB.prepare("UPDATE users SET credits = credits + ? WHERE user_id = ?")
      .bind(creditsBought, userId)
      .run();
      
    // Loguear transacción
    await env.DB.prepare("INSERT INTO consumption_log (user_id, action_type, cost, mode_used) VALUES (?, 'DEPOSIT', ?, 'STRIPE')")
        .bind(userId, creditsBought, 'STRIPE').run();
  }

  return new Response("Received", { status: 200 });
}

// --- CRON JOB LOGIC ---
async function processScheduledPosts(env) {
  const now = Math.floor(Date.now() / 1000);
  
  // 1. Buscar posts pendientes
  const { results } = await env.DB.prepare(
    "SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_time <= ?"
  ).bind(now).all();

  for (const post of results) {
    try {
      // 2. Publicar en Facebook
      const fbUrl = `https://graph.facebook.com/${post.facebook_page_id}/photos`;
      const params = new URLSearchParams({
        url: post.media_url,
        caption: post.content,
        access_token: post.facebook_token,
        published: 'true'
      });

      const fbResp = await fetch(fbUrl, { method: "POST", body: params });
      const fbData = await fbResp.json();

      if (fbData.id) {
        // 3. Éxito
        await env.DB.prepare("UPDATE scheduled_posts SET status = 'published' WHERE id = ?").bind(post.id).run();
      } else {
        throw new Error(JSON.stringify(fbData));
      }
    } catch (err) {
      // 4. Fallo
      await env.DB.prepare("UPDATE scheduled_posts SET status = 'failed', error_log = ? WHERE id = ?")
        .bind(err.message, post.id).run();
    }
  }
}
