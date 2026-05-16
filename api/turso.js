// Proxy serverless: el navegador habla con esta funcion, y esta funcion
// habla con Turso usando el token guardado como variable de entorno.
// El token NUNCA se envia al navegador.
//
// Configurar en Vercel (Settings -> Environment Variables):
//   TURSO_URL    = https://fpcuenta-jerryblack.aws-us-west-2.turso.io/v2/pipeline
//   TURSO_TOKEN  = (el token de Turso)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo no permitido' });
    }

    // Prioridad: variable de entorno de Vercel (lo ideal). Si no existe,
    // usa el valor de respaldo de abajo. ESTE ARCHIVO CORRE EN EL SERVIDOR:
    // Vercel NUNCA lo envia al navegador, asi que el token NO queda expuesto
    // al visitante del sitio (a diferencia de tenerlo en js/turso-client.js).
    const TURSO_URL = process.env.TURSO_URL || 'https://fpcuenta-jerryblack.aws-us-west-2.turso.io/v2/pipeline';
    const TURSO_TOKEN = process.env.TURSO_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3Nzc1NTA3OTEsImlkIjoiMDE5ZGRiZTYtZjYwMS03ZTRmLWJiNzMtYzQ5YjAyZWY2ZWFjIiwicmlkIjoiZWY3OWQ5ODQtMGI4My00ZDhlLTgxZjMtNTNhNzUzYTZkMjhlIn0.XvG1r97iqCWUNECnOkU3E3lm9hTur8Qjpailkplyi_Ai94oTOgkyIjBbad64chLa2nZVQwP7H1NXoxPyBLKcCA';

    if (!TURSO_URL || !TURSO_TOKEN) {
        return res.status(500).json({ error: 'Falta configurar TURSO_URL / TURSO_TOKEN' });
    }

    try {
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const tursoRes = await fetch(TURSO_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TURSO_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body
        });
        const data = await tursoRes.json();
        return res.status(tursoRes.status).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'Error contactando a Turso: ' + (err && err.message ? err.message : String(err)) });
    }
}
