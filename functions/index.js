/**
 * Lógica principal del servidor para Cloud Functions.
 * Aquí manejaremos la autenticación, base de datos, Stripe, Facebook y Gemini.
 */

// Importaciones de Firebase
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Inicializa Firebase Admin y la base de datos
admin.initializeApp();
const db = admin.firestore(); // eslint-disable-line no-unused-vars

// --- VARIABLES DE ENTORNO Y LIBRERÍAS DE TERCEROS ---

// 1. Stripe (Pagos)
const stripeSecret = functions.config().stripe.secret;
const stripe = require("stripe")(stripeSecret); // eslint-disable-line no-unused-vars

// 2. Gemini (Inteligencia Artificial)
const {GoogleGenAI} = require("@google/genai");
const geminiApiKey = functions.config().gemini.apikey;
const ai = new GoogleGenAI({apiKey: geminiApiKey});

// 3. Facebook/Meta (Publicación)
const Facebook = require("facebook-nodejs-business-sdk"); // eslint-disable-line no-unused-vars


// --- FUNCIONES HTTP DE EJEMPLO ---

// Función HTTP simple para verificar el estado del servidor
exports.statusCheck = functions.https.onRequest((request, response) => {
  functions.logger.info("El servidor de Cloud Functions está activo!",
      {structured: true});
  response.send("Cloud Functions: OK");
});


// Función invocable para crear una suscripción en Stripe
exports.createSubscription = functions.https.onCall(async (data, context) => {
  // Aquí iría la lógica para crear una suscripción en Stripe
  functions.logger.info("Intentando crear suscripción en Stripe...",
      {userId: context.auth.uid});
  return {status: "pending_implementation", service: "Stripe"};
});

// Función invocable para optimizar texto usando Gemini
exports.optimizeAdText = functions.https.onCall(async (data, context) => {
  const prompt = `Optimiza este texto para una publicación de Instagram: ${data.text}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: prompt,
    });

    return {optimizedText: response.text};
  } catch (error) {
    functions.logger.error("Error al llamar a Gemini:", error);
    return {error: "Fallo en la IA"};
  }
});


