# Quetzal AI — Backend

Backend independiente para Quetzal AI. Se despliega en **Render** y se conecta a la API de **Groq** (Llama 3.3 70B) para generación de contenido, chatbot y análisis de ventas.

---

## Endpoints disponibles

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| POST | `/api/generate` | Genera texto para publicaciones |
| POST | `/api/chat` | Chatbot con contexto del negocio |
| POST | `/api/analizar-ventas` | Análisis automático de ventas |

---

## Correr local

```bash
# 1. Copiar template del .env
cp .env.example .env

# 2. Editar .env y poner tu API key de Groq
nano .env

# 3. Instalar dependencias
npm install

# 4. Iniciar
npm start
```

El servidor queda en `http://localhost:3000`.

---

## Desplegar en Render (gratis)

### Paso 1: Subir a GitHub

```bash
cd QuetzalAI-backend
git init
git add .
git commit -m "Initial backend"
git branch -M main
# Crear un repo nuevo en GitHub.com, luego:
git remote add origin https://github.com/TU-USUARIO/quetzal-ai-backend.git
git push -u origin main
```

### Paso 2: Conectar a Render

1. Entrá a https://render.com y registrate (con GitHub para más fácil)
2. Click en **"New +"** → **"Web Service"**
3. Conectá tu repo de GitHub `quetzal-ai-backend`
4. Configurá:
   - **Name:** `quetzal-ai-backend` (o el que quieras)
   - **Region:** Oregon (US West) — más cercano a Guatemala
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### Paso 3: Configurar variables de entorno en Render

En la sección **"Environment"** de Render, agregá:

| Key | Value |
|---|---|
| `GROQ_API_KEY` | `gsk_tu_api_key_aqui` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `ALLOWED_ORIGINS` | `https://tu-frontend.vercel.app` |

### Paso 4: Deploy

Render detecta los cambios automáticamente y despliega. Tu URL queda como:

```
https://quetzal-ai-backend.onrender.com
```

### Paso 5: Conectar el frontend

En el frontend, abrí `js/config.js` y cambiá:

```javascript
const API_URL = 'https://quetzal-ai-backend.onrender.com';
```

---

## ⚠️ Notas importantes

- **Plan free de Render:** el servidor se "duerme" después de 15 min de inactividad. La primera petición tras dormirse tarda ~30 seg en despertar. No es problema para una demo.
- **CORS:** acordate de poner la URL real del frontend en `ALLOWED_ORIGINS` cuando lo despliegues.
- **API key segura:** nunca subas el archivo `.env` a GitHub. Está en `.gitignore`.

---

*Brayan Alexander Gómez Quex · UMG · 2026*
