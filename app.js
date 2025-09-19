const express = require('express');
const { initializeApp } = require('firebase-admin/app'); // ADDED
const { getFirestore } = require('firebase-admin/firestore'); // ADDED

// ADDED: Initialize Firebase Admin SDK
// When running on Google Cloud (like Cloud Run), the SDK automatically
// finds the project's service credentials. No extra configuration is needed.
initializeApp();
const db = getFirestore();

const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";

// REMOVED: In-memory storage is no longer needed
// const messages = [];

// Webhook verification (no changes needed here)
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
app.post('/', async (req, res) => { // CHANGED: Added 'async'
  try {
    const body = req.body;
    const timestamp = new Date().toISOString();
    
    console.log(`\nWebhook received at ${timestamp}`);
    console.log('Raw webhook data:', JSON.stringify(body, null, 2));

    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const message = change && change.value && change.value.messages && change.value.messages[0];

    // ADDED: Create a reference to the Firestore collection
    const eventsCollection = db.collection('whatsapp_events');

    if (message) {
      // CHANGED: Store message data in Firestore instead of memory
      const messageData = {
        id: message.id || `msg_${Date.now()}`,
        from: message.from,
        type: message.type,
        timestamp: timestamp,
        body: message.text ? message.text.body : 'Non-text message',
        rawData: body
      };
      
      // Use the WhatsApp message ID as the document ID if available
      await eventsCollection.doc(message.id).set(messageData);
      
      console.log(`Message stored in Firestore with ID: ${message.id}`);
      console.log('From:', message.from, 'Type:', message.type);
      
      if (message.text) {
        console.log('Text content:', message.text.body);
      }
    } else {
      // CHANGED: Store other webhook events in Firestore
      await eventsCollection.add({
        id: `webhook_${Date.now()}`,
        timestamp: timestamp,
        rawData: body,
        note: 'No message content found'
      });
      console.log('Non-message event stored in Firestore');
    }

    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end(); // Respond with 200 to prevent webhook retries
  }
});

// View stored messages from Firestore
app.get('/messages', async (req, res) => { // CHANGED: Added 'async'
  try {
    const eventsCollection = db.collection('whatsapp_events');
    // Fetch the last 50 messages, ordered by timestamp
    const snapshot = await eventsCollection.orderBy('timestamp', 'desc').limit(50).get();

    if (snapshot.empty) {
      return res.status(200).json({ count: 0, messages: [] });
    }

    const storedMessages = [];
    snapshot.forEach(doc => {
      storedMessages.push({ docId: doc.id, ...doc.data() });
    });
    
    res.status(200).json({
      count: storedMessages.length,
      messages: storedMessages
    });
  } catch (error) {
    console.error('Error fetching messages from Firestore:', error);
    res.status(500).send('Could not fetch messages');
  }
});

// Health check endpoint (updated)
app.get('/health', (req, res) => {
  // CHANGED: Removed message_count to keep the health check fast and simple.
  // A health check should confirm the service is running, not query the database.
  res.status(200).json({  
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Webhook (Firestore Integration)'
  });
});

// Start server (no changes needed here)
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook listening on port ${port}`);
  console.log(`Health check: https://whatsapp-webhook-774887765344.us-central1.run.app/health`);
  console.log(`View messages: https://whatsapp-webhook-774887765344.us-central1.run.app/messages`);
});

