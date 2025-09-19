const express = require('express');
const { initializeApp } = require('firebase-admin/app'); // ADDED
const { getFirestore } = require('firebase-admin/firestore'); // ADDED
const axios = require('axios');

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



// Add this near the top with other constants
const authorizationToken = process.env.AUTHORIZATION_TOKEN;

// Update the sendWhatsAppMessage function
async function sendWhatsAppMessage(to, text) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/100272552881881/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${authorizationToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Response sent successfully');
  } catch (error) {
    console.error('Error sending response:', error.response?.data);
  }
}










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
app.post('/', async (req, res) => {  
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

  // ADD AUTOMATED RESPONSE HERE
      if (message.text && message.text.body) {
        const userMessage = message.text.body.toLowerCase();
        let responseText = "Thank you for your message!";
        
        if (userMessage.includes('hello') || userMessage.includes('hi')) {
          responseText = "Hello! How can I help you today?";
        } else if (userMessage.includes('help')) {
          responseText = "I'm here to help! What do you need assistance with?";
        } else if (userMessage.includes('price') || userMessage.includes('cost')) {
          responseText = "Please contact us for pricing information.";
        }
        
        // Send automated response
        await sendWhatsAppMessage(message.from, responseText);
      }
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end();
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

// Add user management functions
async function updateUserProfile(userId, userName) {
  try {
    await db.collection('users').doc(userId).set({
      name: userName,
      lastMessage: new Date(),
      messageCount: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
}

// Use it in your message processing:
if (message && message.from) {
  const userName = body.entry[0].changes[0].value.contacts[0].profile.name;
  await updateUserProfile(message.from, userName);
}

// Add analytics endpoint
app.get('/stats', async (req, res) => {
  try {
    const messagesCount = await db.collection('whatsapp_messages').count().get();
    const usersCount = await db.collection('users').count().get();
    
    res.status(200).json({
      total_messages: messagesCount.data().count,
      total_users: usersCount.data().count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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


