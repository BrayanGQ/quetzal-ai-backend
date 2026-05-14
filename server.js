/**
 * Quetzal AI — Servidor Backend
 *
 * Endpoints:
 *   GET  /api/health              → estado del servidor
 *   POST /api/generate            → genera contenido con IA (Llama 3.3 vía Groq)
 *   POST /api/chat                → chatbot con IA, recibe info del negocio
 *   POST /api/analizar-ventas     → análisis automático de ventas con IA
 *   POST /api/predecir-ventas     → predicción de ventas próximos 7 días
 *   POST /api/consejos-negocio    → plan de acción personalizado con IA
 *   POST /api/generar-imagen      → genera imagen con Flux (Cloudflare Workers AI)
 *
 * @author Brayan Alexander Gómez Quex
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Groq (texto)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Cloudflare Workers AI (imágenes con Flux)
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_IMAGE_MODEL = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';

if (!GROQ_API_KEY) {
  console.error('\n❌ ERROR: Falta GROQ_API_KEY en el archivo .env\n');
  process.exit(1);
}

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.warn('\n⚠️  Aviso: Falta CF_ACCOUNT_ID o CF_API_TOKEN — la generación de imágenes no funcionará\n');
}

// ============ CORS ============
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: false
}));

app.use(express.json({ limit: '500kb' }));


// ============ HELPER: Groq (texto) ============
async function callGroq(systemPrompt, userInput, maxTokens = 500, temperature = 0.8) {
  const messages = [{ role: 'system', content: systemPrompt }];

  if (typeof userInput === 'string') {
    messages.push({ role: 'user', content: userInput });
  } else if (Array.isArray(userInput)) {
    messages.push(...userInput);
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}


// ============ HELPER: Cloudflare Workers AI (imágenes) ============
async function generateImageCloudflare(prompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare no configurado en el servidor');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_IMAGE_MODEL}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CF_API_TOKEN}`
    },
    body: JSON.stringify({
      prompt: prompt,
      num_steps: 4,
      width: 1024,
      height: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare AI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  if (data.success && data.result && data.result.image) {
    return `data:image/png;base64,${data.result.image}`;
  }

  throw new Error('Respuesta inesperada de Cloudflare AI');
}


// ============ Health check ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Quetzal AI Backend',
    text_model: GROQ_MODEL,
    image_model: CF_IMAGE_MODEL,
    image_enabled: !!(CF_ACCOUNT_ID && CF_API_TOKEN),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Quetzal AI Backend',
    status: 'running',
    docs: 'POST /api/generate, POST /api/chat, POST /api/analizar-ventas, POST /api/predecir-ventas, POST /api/consejos-negocio, POST /api/generar-imagen'
  });
});


// ============ ENDPOINT 1: Generador de contenido (texto) ============
app.post('/api/generate', async (req, res) => {
  try {
    const { type, tone, prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'El campo prompt es obligatorio' });
    }

    const typeDescriptions = {
      post:      'una publicación para Facebook o Instagram',
      promo:     'un mensaje de promoción para redes sociales',
      response:  'una respuesta formal para un cliente',
      whatsapp:  'un mensaje de WhatsApp para enviar a clientes'
    };

    const toneDescriptions = {
      amigable:    'amigable, cercano y con calidez humana',
      profesional: 'profesional, formal y claro',
      divertido:   'divertido, creativo y con mucha personalidad',
      urgente:     'urgente y persuasivo, que genere sensación de oportunidad limitada'
    };

    const typeDesc = typeDescriptions[type] || 'una publicación para redes sociales';
    const toneDesc = toneDescriptions[tone] || 'amigable';

    const systemPrompt = `Eres un experto en marketing digital para pequeñas y medianas empresas de Guatemala. Escribes contenido en español de Guatemala (usando "vos" cuando aplique, modismos chapines naturales, y expresiones locales cuando queden bien).

Tu tarea es redactar ${typeDesc} con un tono ${toneDesc}.

Reglas:
- Incluye emojis relevantes (2-5 máximo, no exageres)
- Si es para redes sociales, incluye 2-3 hashtags al final
- Máximo 120 palabras
- Listo para copiar y publicar, sin explicaciones adicionales
- No incluyas placeholders como [nombre del negocio] o [fecha] — sé concreto con la información dada`;

    const aiResponse = await callGroq(systemPrompt, prompt, 400);

    res.json({ success: true, content: aiResponse, model: GROQ_MODEL });

  } catch (error) {
    console.error('[ERROR /api/generate]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo generar el contenido. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 2: Chatbot ============
app.post('/api/chat', async (req, res) => {
  try {
    const { message, businessInfo, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'El campo message es obligatorio' });
    }

    const defaultBusinessInfo = {
      name: 'Tienda Don José',
      type: 'tienda de abarrotes',
      location: 'Zona 11, Ciudad de Guatemala',
      hours: 'Lunes a sábado: 7:00 AM - 8:00 PM | Domingo: 8:00 AM - 2:00 PM',
      delivery: 'Hacemos entregas en zonas 11, 12 y 13. Envío gratis en pedidos mayores a Q100. En pedidos menores, Q15 de envío. Tiempo: 30-45 min.',
      payment: 'Aceptamos efectivo, tarjeta de débito y crédito (Visa/Mastercard), transferencias (Banco Industrial, BAM), Pago Fácil y Tigo Money.',
      products: [
        'Azúcar blanca: libra Q8, arroba Q180, quintal Q695',
        'Frijol negro (libra) Q15, frijol rojo (libra) Q16',
        'Tortillas hechas a mano: docena Q15, media docena Q8',
        'Pan francés: unidad Q5, docena Q50. Horneado 3 veces al día (6 AM, 11 AM, 4 PM)',
        'Refresco natural de piña (1L) Q15'
      ]
    };

    const info = businessInfo || defaultBusinessInfo;

    const productsList = Array.isArray(info.products)
      ? info.products.map(p => `  · ${p}`).join('\n')
      : (info.products || '').split('\n').map(p => `  · ${p.trim()}`).join('\n');

    const systemPrompt = `Eres el asistente virtual de ${info.name}, ${info.type ? `una ${info.type}` : 'un negocio'} ${info.location ? `ubicado en ${info.location}, Guatemala` : 'en Guatemala'}.

Información del negocio:
${info.hours ? `- Horario: ${info.hours}` : ''}
${info.delivery ? `- Entregas: ${info.delivery}` : ''}
${info.payment ? `- Formas de pago: ${info.payment}` : ''}
${productsList ? `- Productos y precios:\n${productsList}` : ''}

Instrucciones para responder:
- Responde SIEMPRE en español de Guatemala (usando "vos", "qué tal", "fijate que", modismos chapines naturales).
- Sé breve, amigable y directo. Máximo 4-5 líneas.
- Usa emojis con moderación (1-3 por respuesta) para hacer la conversación más cálida.
- Si el cliente pregunta por un producto que NO está en la lista, responde amablemente que no lo manejas y sugerí algo similar que sí tengas.
- Si la pregunta no tiene que ver con el negocio, redirigí amablemente al tema del negocio.
- No inventes información que no esté en el contexto (precios, horarios, productos que no existan).
- Terminá ofreciéndote para ayudar en algo más cuando sea natural hacerlo.`;

    const userInput = (history && Array.isArray(history) && history.length > 0)
      ? [...history, { role: 'user', content: message }]
      : message;

    const aiResponse = await callGroq(systemPrompt, userInput, 300, 0.7);

    res.json({ success: true, response: aiResponse, model: GROQ_MODEL });

  } catch (error) {
    console.error('[ERROR /api/chat]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo procesar el mensaje. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 3: Análisis de ventas ============
app.post('/api/analizar-ventas', async (req, res) => {
  try {
    const { sales } = req.body;

    if (!sales || !Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de ventas' });
    }

    if (sales.length < 3) {
      return res.status(400).json({
        error: 'Se requieren al menos 3 ventas para hacer un análisis útil',
        success: false
      });
    }

    const totalRevenue = sales.reduce((sum, s) => sum + (s.qty * s.price), 0);
    const productCount = {};
    const dayCount = {};
    const hourCount = {};

    sales.forEach(s => {
      const date = new Date(s.date);
      const day = date.toLocaleDateString('es-GT', { weekday: 'long' });
      const hour = date.getHours();
      productCount[s.product] = (productCount[s.product] || 0) + s.qty;
      dayCount[day] = (dayCount[day] || 0) + (s.qty * s.price);
      hourCount[hour] = (hourCount[hour] || 0) + (s.qty * s.price);
    });

    const topProducts = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name}: ${qty} unidades`);

    const dayBreakdown = Object.entries(dayCount)
      .map(([day, total]) => `${day}: Q${total.toFixed(2)}`);

    const hourBreakdown = Object.entries(hourCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h, total]) => `${h}:00 - Q${total.toFixed(2)}`);

    const dataString = `RESUMEN DE VENTAS
=================
Total de ventas registradas: ${sales.length}
Ingresos totales: Q ${totalRevenue.toFixed(2)}
Ticket promedio: Q ${(totalRevenue / sales.length).toFixed(2)}

PRODUCTOS MÁS VENDIDOS:
${topProducts.join('\n')}

VENTAS POR DÍA DE LA SEMANA:
${dayBreakdown.join('\n')}

HORAS PICO (top 3):
${hourBreakdown.join('\n')}

VENTAS DETALLADAS (últimas 10):
${sales.slice(-10).map(s => `${new Date(s.date).toLocaleString('es-GT')} - ${s.product} x${s.qty} = Q${(s.qty*s.price).toFixed(2)}`).join('\n')}`;

    const systemPrompt = `Eres un analista de negocios experto en pequeñas y medianas empresas de Guatemala. Tu tarea es analizar los datos de ventas de un negocio y dar 3 insights útiles, accionables y específicos.

REGLAS DE FORMATO:
- Responde EXACTAMENTE 3 insights, ni más ni menos.
- Cada insight debe ser 1-2 oraciones, máximo 30 palabras.
- Cada insight debe empezar con un emoji relevante (💡 📈 🎯 ⏰ 🔥 ⚠️ 💰 etc.)
- Habla en español de Guatemala, segunda persona ("tu negocio", "podés").
- Sé específico con números y datos del análisis.
- Da insights ACCIONABLES, no solo observaciones.

FORMATO DE RESPUESTA (JSON estricto):
{
  "insights": ["💡 ...", "📈 ...", "🎯 ..."]
}

Responde SOLO el JSON, sin texto adicional, sin markdown.`;

    const aiResponse = await callGroq(systemPrompt, dataString, 500, 0.6);

    let parsed;
    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = {
        insights: aiResponse.split('\n').filter(l => l.trim().length > 10).slice(0, 3)
      };
    }

    res.json({ success: true, insights: parsed.insights || [], model: GROQ_MODEL });

  } catch (error) {
    console.error('[ERROR /api/analizar-ventas]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo analizar las ventas. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 4: Predicción de ventas (NUEVO) ============
app.post('/api/predecir-ventas', async (req, res) => {
  try {
    const { sales } = req.body;

    if (!sales || !Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de ventas' });
    }

    if (sales.length < 5) {
      return res.status(400).json({
        error: 'Se requieren al menos 5 ventas para hacer una predicción confiable',
        success: false
      });
    }

    const totalRevenue = sales.reduce((sum, s) => sum + (s.qty * s.price), 0);
    const avgTicket = totalRevenue / sales.length;
    const productCount = {};
    const dayCount = {};
    const hourCount = {};

    sales.forEach(s => {
      const date = new Date(s.date);
      const day = date.toLocaleDateString('es-GT', { weekday: 'long' });
      const hour = date.getHours();
      productCount[s.product] = (productCount[s.product] || 0) + s.qty;
      dayCount[day] = (dayCount[day] || 0) + (s.qty * s.price);
      hourCount[hour] = (hourCount[hour] || 0) + (s.qty * s.price);
    });

    const topProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
    const topDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
    const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];
    const avgPerDay = totalRevenue / 7;

    const summary = `DATOS HISTÓRICOS DEL NEGOCIO:
- Total de ventas analizadas: ${sales.length}
- Ingresos totales (últimos 7 días): Q ${totalRevenue.toFixed(2)}
- Promedio diario actual: Q ${avgPerDay.toFixed(2)}
- Ticket promedio: Q ${avgTicket.toFixed(2)}
- Producto más vendido: ${topProduct[0]} (${topProduct[1]} unidades)
- Día con más ingresos: ${topDay[0]} (Q ${topDay[1].toFixed(2)})
- Hora pico: ${topHour[0]}:00 (Q ${topHour[1].toFixed(2)})`;

    const systemPrompt = `Eres un analista experto en proyección de ventas para PYMES de Guatemala. Basándote en el histórico que se te proporciona, genera una predicción para los PRÓXIMOS 7 DÍAS.

REGLAS:
- Sé realista con los números. Si el histórico tiene poca data, tu rango debe ser amplio.
- Habla en español de Guatemala, segunda persona ("tu negocio", "vas a", "podés").
- Sé específico con números, productos y días del histórico.

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin backticks):
{
  "ingresos_min": 580,
  "ingresos_max": 720,
  "dia_mas_fuerte": "Viernes",
  "producto_estrella": "Refresco natural piña",
  "hora_pico": "16:00 - 18:00",
  "recomendacion": "Una recomendación accionable de 1-2 oraciones que ayude al dueño a maximizar ese pronóstico."
}

Responde SOLO el JSON.`;

    const aiResponse = await callGroq(systemPrompt, summary, 500, 0.5);

    let parsed;
    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = {
        ingresos_min: Math.round(totalRevenue * 0.85),
        ingresos_max: Math.round(totalRevenue * 1.15),
        dia_mas_fuerte: topDay[0],
        producto_estrella: topProduct[0],
        hora_pico: `${topHour[0]}:00`,
        recomendacion: aiResponse.slice(0, 200)
      };
    }

    res.json({ success: true, prediction: parsed, model: GROQ_MODEL });

  } catch (error) {
    console.error('[ERROR /api/predecir-ventas]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo generar la predicción. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 5: Consejos personalizados (NUEVO) ============
app.post('/api/consejos-negocio', async (req, res) => {
  try {
    const { sales, businessInfo } = req.body;

    if (!sales || !Array.isArray(sales) || sales.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren al menos 3 ventas para dar consejos personalizados'
      });
    }

    const totalRevenue = sales.reduce((sum, s) => sum + (s.qty * s.price), 0);
    const productCount = {};
    const dayCount = {};

    sales.forEach(s => {
      const date = new Date(s.date);
      const day = date.toLocaleDateString('es-GT', { weekday: 'long' });
      productCount[s.product] = (productCount[s.product] || 0) + s.qty;
      dayCount[day] = (dayCount[day] || 0) + (s.qty * s.price);
    });

    const sortedDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]);
    const weakestDay = sortedDays[sortedDays.length - 1];
    const strongestDay = sortedDays[0];
    const topProducts = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, q]) => `${n} (${q} u)`);

    const businessName = businessInfo?.name || 'el negocio';
    const businessType = businessInfo?.type || 'PYME';

    const dataSummary = `Negocio: ${businessName} (${businessType})
Total ventas: ${sales.length}
Ingresos: Q ${totalRevenue.toFixed(2)}
Día más fuerte: ${strongestDay[0]} (Q ${strongestDay[1].toFixed(2)})
Día más débil: ${weakestDay[0]} (Q ${weakestDay[1].toFixed(2)})
Productos top: ${topProducts.join(', ')}`;

    const systemPrompt = `Eres un consultor de negocios experto en PYMES de Guatemala. Tu cliente te pide un PLAN DE ACCIÓN concreto para mejorar su negocio. Basado en sus datos reales, da 3 consejos ACCIONABLES y específicos.

REGLAS:
- Cada consejo debe ser una ACCIÓN concreta, no una observación.
- Cada consejo debe mencionar números o datos específicos del negocio.
- Hablá en español de Guatemala, segunda persona ("tu negocio", "podés", "intentá").

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin backticks):
{
  "consejos": [
    { "emoji": "🎯", "titulo": "Promoción de Lunes", "accion": "Texto detallado de la acción..." },
    { "emoji": "📦", "titulo": "...", "accion": "..." },
    { "emoji": "💰", "titulo": "...", "accion": "..." }
  ]
}

Responde SOLO el JSON.`;

    const aiResponse = await callGroq(systemPrompt, dataSummary, 700, 0.6);

    let parsed;
    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = { consejos: [] };
    }

    res.json({ success: true, consejos: parsed.consejos || [], model: GROQ_MODEL });

  } catch (error) {
    console.error('[ERROR /api/consejos-negocio]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo generar los consejos. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 6: Generar imagen con Flux ============
app.post('/api/generar-imagen', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'El campo prompt es obligatorio' });
    }

    const enhancedPrompt = `${prompt}, professional food photography, instagram style, natural lighting, mouth-watering, high quality, sharp details, vibrant colors, appetizing, soft bokeh background`;

    const imageDataUrl = await generateImageCloudflare(enhancedPrompt);

    res.json({ success: true, image: imageDataUrl, model: CF_IMAGE_MODEL });

  } catch (error) {
    console.error('[ERROR /api/generar-imagen]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo generar la imagen. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ARRANQUE ============
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║         🦜  QUETZAL AI — Backend Iniciado              ║
║                                                        ║
║    Puerto:  ${String(PORT).padEnd(45)}║
║    Texto:   ${GROQ_MODEL.padEnd(45)}║
║    Imagen:  ${(CF_IMAGE_MODEL).padEnd(45)}║
║                                                        ║
║    Endpoints disponibles:                              ║
║      GET  /api/health                                  ║
║      POST /api/generate                                ║
║      POST /api/chat                                    ║
║      POST /api/analizar-ventas                         ║
║      POST /api/predecir-ventas                         ║
║      POST /api/consejos-negocio                        ║
║      POST /api/generar-imagen                          ║
╚════════════════════════════════════════════════════════╝
  `);
});