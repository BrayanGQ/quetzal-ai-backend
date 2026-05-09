/**
 * Quetzal AI — Servidor Backend
 *
 * Backend independiente. Se despliega en Render.com (gratis).
 * El frontend hace fetch a este servidor por su URL pública.
 *
 * Endpoints:
 *   GET  /api/health                → estado del servidor
 *   POST /api/generate              → genera contenido con IA (Llama 3.3 vía Groq)
 *   POST /api/chat                  → chatbot con IA, recibe info del negocio
 *   POST /api/analizar-ventas       → análisis automático de ventas con IA
 *
 * Variables de entorno requeridas (.env):
 *   GROQ_API_KEY     - Conseguir gratis en https://console.groq.com/keys
 *   GROQ_MODEL       - Modelo (default: llama-3.3-70b-versatile)
 *   PORT             - Puerto (default: 3000)
 *   ALLOWED_ORIGINS  - URLs del frontend separadas por coma (CORS)
 *
 * @author Brayan Alexander Gómez Quex
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Validación al arranque
if (!GROQ_API_KEY) {
  console.error('\n❌ ERROR: Falta GROQ_API_KEY en el archivo .env');
  console.error('   1. Copiá .env.example a .env');
  console.error('   2. Conseguí tu key gratis en https://console.groq.com/keys');
  console.error('   3. Pegala en .env\n');
  process.exit(1);
}

// ============ CORS — solo permitir el frontend ============
// En producción, configurar ALLOWED_ORIGINS con la URL real de Vercel
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*'];  // En desarrollo permite cualquier origen

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: false
}));

app.use(express.json({ limit: '500kb' }));


// ============ HELPER: llamada a Groq ============

/**
 * Llama a la API de Groq con un system prompt y mensajes
 * @param {string} systemPrompt - Instrucciones de contexto
 * @param {string|Array} userInput - Mensaje del usuario o array de mensajes
 * @param {number} maxTokens - Tokens máximos en la respuesta
 * @param {number} temperature - Creatividad (0-1)
 */
async function callGroq(systemPrompt, userInput, maxTokens = 500, temperature = 0.8) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // userInput puede ser string (un mensaje) o array (historial)
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


// ============ ENDPOINT: Health check ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Quetzal AI Backend',
    model: GROQ_MODEL,
    timestamp: new Date().toISOString()
  });
});

// Ruta raíz para que Render no marque error
app.get('/', (req, res) => {
  res.json({
    service: 'Quetzal AI Backend',
    status: 'running',
    docs: 'POST /api/generate, POST /api/chat, POST /api/analizar-ventas'
  });
});


// ============ ENDPOINT 1: Generador de contenido ============

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

    res.json({
      success: true,
      content: aiResponse,
      model: GROQ_MODEL
    });

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

    // Información del negocio por defecto (si no llega del frontend)
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

    // Convertir productos a string si llegan como array
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

    // Si hay historial, mandarlo. Si no, solo el mensaje actual
    const userInput = (history && Array.isArray(history) && history.length > 0)
      ? [...history, { role: 'user', content: message }]
      : message;

    const aiResponse = await callGroq(systemPrompt, userInput, 300, 0.7);

    res.json({
      success: true,
      response: aiResponse,
      model: GROQ_MODEL
    });

  } catch (error) {
    console.error('[ERROR /api/chat]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo procesar el mensaje. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ENDPOINT 3: Análisis automático de ventas ============

app.post('/api/analizar-ventas', async (req, res) => {
  try {
    const { sales, summary } = req.body;

    if (!sales || !Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de ventas' });
    }

    if (sales.length < 3) {
      return res.status(400).json({
        error: 'Se requieren al menos 3 ventas para hacer un análisis útil',
        success: false
      });
    }

    // Construir un resumen estructurado de las ventas para la IA
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
- Sé específico con números y datos del análisis (no genérico).
- Da insights ACCIONABLES, no solo observaciones (ej: "considerá hacer X" o "podrías Y").

FORMATO DE RESPUESTA (JSON estricto):
{
  "insights": [
    "💡 Texto del insight 1...",
    "📈 Texto del insight 2...",
    "🎯 Texto del insight 3..."
  ]
}

Responde SOLO el JSON, sin texto adicional, sin markdown, sin \`\`\`.`;

    const aiResponse = await callGroq(systemPrompt, dataString, 500, 0.6);

    // Intentar parsear el JSON
    let parsed;
    try {
      // Limpiar posibles backticks o markdown
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Si falla el JSON, devolver el texto crudo dividido en líneas
      console.warn('[WARN] No se pudo parsear JSON, usando fallback');
      parsed = {
        insights: aiResponse.split('\n').filter(l => l.trim().length > 10).slice(0, 3)
      };
    }

    res.json({
      success: true,
      insights: parsed.insights || [],
      model: GROQ_MODEL
    });

  } catch (error) {
    console.error('[ERROR /api/analizar-ventas]', error.message);
    res.status(500).json({
      success: false,
      error: 'No se pudo analizar las ventas. Intenta de nuevo.',
      details: error.message
    });
  }
});


// ============ ARRANQUE ============

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║         🦜  QUETZAL AI — Backend Iniciado              ║
║                                                        ║
║    Puerto:    ${String(PORT).padEnd(43)}║
║    Modelo:    ${GROQ_MODEL.padEnd(43)}║
║    CORS:      ${allowedOrigins.join(', ').substring(0, 41).padEnd(43)}║
║                                                        ║
║    Endpoints:                                          ║
║      GET  /api/health                                  ║
║      POST /api/generate                                ║
║      POST /api/chat                                    ║
║      POST /api/analizar-ventas                         ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});
