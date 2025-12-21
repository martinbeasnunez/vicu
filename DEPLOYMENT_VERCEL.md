# Despliegue de Vicu en Vercel

Guía paso a paso para poner Vicu en línea usando Vercel.

---

## 1. Preparar el repo

Antes de subir a Vercel, confirma que todo funciona en local:

```bash
npm install
npm run build
npm run start
```

Si el build pasa sin errores, estás listo.

---

## 2. Subir el código a GitHub (recomendado)

1. Crea un repositorio nuevo en [github.com](https://github.com)
2. Conecta tu repo local:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/vicu.git
git push -u origin main
```

> **Nota:** Si prefieres no usar GitHub, puedes subir el proyecto manualmente a Vercel arrastrando la carpeta.

---

## 3. Crear proyecto en Vercel

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta o inicia sesión
2. Haz clic en **"Add New Project"**
3. Selecciona **"Import Git Repository"**
4. Conecta tu cuenta de GitHub y selecciona el repositorio de Vicu
5. Vercel detectará automáticamente que es un proyecto Next.js

---

## 4. Configurar el build

Vercel debería detectar la configuración automáticamente, pero verifica:

| Campo | Valor |
|-------|-------|
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |

---

## 5. Configurar variables de entorno

Antes de hacer deploy, **debes configurar las variables de entorno**.

1. En la página del proyecto en Vercel, ve a **Settings > Environment Variables**
2. Añade cada variable de `.env.example` con sus valores reales:

### Variables requeridas:

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de Supabase |
| `OPENAI_API_KEY` | Clave API de OpenAI |

### Variables opcionales (para notificaciones push):

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID (mismo valor) |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID |
| `VAPID_SUBJECT` | Email de contacto (mailto:...) |

### Variable de URL de producción:

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | URL de tu app (ej: `https://vicu.vercel.app`) |

> **Importante:** Marca las variables para los entornos **Production**, **Preview** y **Development** según necesites.

---

## 6. Primer deploy

1. Haz clic en **Deploy**
2. Espera a que termine el build (2-3 minutos)
3. Si todo sale bien, Vercel te dará una URL como `https://vicu-xxxx.vercel.app`

---

## 7. Actualizar la URL de la app

Una vez que tengas la URL final:

1. Ve a **Settings > Environment Variables** en Vercel
2. Actualiza `NEXT_PUBLIC_APP_URL` con tu URL de producción
3. Haz un nuevo deploy para aplicar el cambio

---

## 8. Configurar dominio personalizado (opcional)

Si tienes un dominio propio:

1. Ve a **Settings > Domains**
2. Añade tu dominio (ej: `vicu.tudominio.com`)
3. Sigue las instrucciones de Vercel para configurar los DNS

---

## 9. Despliegues posteriores

### Deploy automático
Cada vez que hagas `git push` a la rama `main`, Vercel hará deploy automáticamente.

### Deploy manual
Puedes forzar un redeploy desde el dashboard de Vercel haciendo clic en **Redeploy**.

### Rollback
Si algo sale mal:
1. Ve a la pestaña **Deployments**
2. Encuentra un deploy anterior que funcionaba
3. Haz clic en los tres puntos (...) y selecciona **Promote to Production**

---

## Troubleshooting

### El build falla
- Revisa los logs de build en Vercel
- Ejecuta `npm run build` en local para ver el error
- Verifica que todas las variables de entorno estén configuradas

### Las APIs no funcionan
- Confirma que `SUPABASE_SERVICE_ROLE_KEY` está configurada
- Verifica que `OPENAI_API_KEY` es válida

### Las notificaciones push no funcionan
- Asegúrate de que las VAPID keys están configuradas
- Genera nuevas keys con: `npx web-push generate-vapid-keys`

---

## Recursos útiles

- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Next.js](https://nextjs.org/docs)
- [Panel de Supabase](https://supabase.com/dashboard)
