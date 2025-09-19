const express = require('express');
const admin = require('firebase-admin'); // Import Firebase Admin SDK
const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";

// Initialize Firebase Admin SDK
try {
  // When running on Google Cloud (like Cloud Run or App Engine),
  // the SDK automatically finds the necessary service account credentials.
  admin.initializeApp();
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error);
  // Exit if Firebase fails to initialize, as it's critical for the app.
  process.exit(1); 
}

// Get a reference to the Firestore database
const db = admin.firestore();

// Webhook verification (This part remains the same)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Receive and store messages in Firestore
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    console.log(`\nWebhook received at ${new Date().toISOString()}`);

    // Save the incoming data to the 'messages' collection in Firestore
    if (db) {
      // The .add() method automatically generates a unique document ID
      const docRef = await db.collection('messages').add({
        data: body,
        processed: false,
        // Use the server's timestamp for accurate and consistent time tracking
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Message saved to Firestore with ID: ${docRef.id}`);
    }

    res.status(200).end(); // Always respond with 200 OK to WhatsApp
  } catch (error) {
    console.error('Error processing message:', error);
    // It's crucial to still send a 200 OK, otherwise the webhook provider
    // may continuously retry sending the same failed message.
    res.status(200).end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    // A simple check to confirm the Firestore instance object is available
    database: db ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook listening on port ${port}`);
  // No separate database connection call is needed here.
  // Firebase Admin SDK is initialized once when the application starts.
});
