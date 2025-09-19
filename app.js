const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";

// Initialize Firebase Admin SDK with service account
try {
  // For Google Cloud Run, we can use automatic authentication
  // But for local testing or explicit setup, use service account
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Use explicit credentials if environment variable is set
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
   // Use this initialization for Cloud Run
   admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
  } else {
    // Automatic authentication on Google Cloud Platform
    admin.initializeApp();
  }
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Firebase Admin SDK initialization error:', error);
  process.exit(1);
}

// Get a reference to the Firestore database
const db = admin.firestore();

// Utility function to extract message data
function extractMessageData(body) {
  try {
    const entry = body.entry && body.entry[0];
    if (!entry) return null;

    const change = entry.changes && entry.changes[0];
    if (!change || change.field !== 'messages') return null;

    const value = change.value;
    const message = value.messages && value.messages[0];
    
    if (!message) return null;

    return {
      messaging_product: value.messaging_product,
      metadata: value.metadata,
      contacts: value.contacts,
      message: message,
      timestamp: new Date().toISOString(),
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

// Webhook verification
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.log('VERIFICATION FAILED - Expected:', verifyToken, 'Got:', token);
    res.status(403).end();
  }
});

// Receive and store messages in Firestore
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    const timestamp = new Date().toISOString();
    
    console.log(`\nWebhook received at ${timestamp}`);
    console.log('Full webhook body:', JSON.stringify(body, null, 2));

    // Extract and save message data
    const messageData = extractMessageData(body);
    
    if (messageData) {
      try {
        // Create a document reference with a custom ID (using message ID if available)
        const docId = messageData.message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const docRef = db.collection('whatsapp_messages').doc(docId);
        
        await docRef.set(messageData);
        console.log(`Message saved to Firestore with ID: ${docId}`);
        
        // Also save to a subcollection for organized tracking
        if (messageData.message.from) {
          const userDocRef = db.collection('users')
            .doc(messageData.message.from)
            .collection('messages')
            .doc(docId);
          
          await userDocRef.set(messageData);
          console.log(`Message also saved to user subcollection for: ${messageData.message.from}`);
        }
      } catch (dbError) {
        console.error('Firestore save error:', dbError);
      }
    } else {
      console.log('No message data found in webhook, saving raw data');
      
      // Save the entire webhook body for debugging
      const docRef = db.collection('webhook_logs').doc();
      await docRef.set({
        rawData: body,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false
      });
    }

    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end(); // Always respond with 200 OK to WhatsApp
  }
});

// Endpoint to retrieve messages (for testing)
app.get('/messages', async (req, res) => {
  try {
    const snapshot = await db.collection('whatsapp_messages')
      .orderBy('receivedAt', 'desc')
      .limit(10)
      .get();
    
    const messages = [];
    snapshot.forEach(doc => {
      messages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.status(200).json({
      count: messages.length,
      messages: messages
    });
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// Health check endpoint with Firestore connectivity test
app.get('/health', async (req, res) => {
  try {
    // Test Firestore connection
    await db.collection('health_checks').doc('ping').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'checked'
    });
    
    res.status(200).json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      service: 'WhatsApp Webhook with Firestore'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook with Firestore listening on port ${port}`);
  console.log(`Health check available at: http://localhost:${port}/health`);
  console.log(`Messages endpoint: http://localhost:${port}/messages`);
});
