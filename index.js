const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Ruta de prueba para verificar que el servicio esté activo
app.get('/', (req, res) => {
  res.status(200).send('Servicio Autopublicador FB activo. ¡Listo para la batalla!');
});

// *Aquí es donde irá el flujo de Google OAuth y Facebook Login*
app.get('/oauth/callback', (req, res) => {
  // Esta ruta manejará la redirección de Google con el código de autorización
  const code = req.query.code;
  if (code) {
    res.status(200).send(`Código de autorización recibido: ${code}. Iniciando intercambio de token...`);
    // Lógica futura: Intercambiar 'code' por el Token de acceso de Google.
  } else {
    res.status(400).send('Error: No se recibió código de autorización.');
  }
});

app.listen(port, () => {
  console.log(`Servicio escuchando en el puerto ${port}`);
});
