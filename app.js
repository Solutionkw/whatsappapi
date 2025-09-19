const express = require('express');
const admin = require('firebase-admin'); // FIXED: Use the correct import
const axios = require('axios');

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";
const authorizationToken = process.env.AUTHORIZATION_TOKEN;

// WhatsApp message sending function
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
    return response.data;
  } catch (error) {
    console.error('Error sending response:', error.response?.data || error.message);
    throw error;
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

// User profile management
async function updateUserProfile(userId, userName) {
  try {
    await db.collection('users').doc(userId).set({
      name: userName,
      lastMessage: new Date(),
      messageCount: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    console.log('User profile updated for:', userId);
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
}

// Receive and process messages
app.post('/', async (req, res) => {  
  try {
    const body = req.body;
    const timestamp = new Date().toISOString();
    
    console.log(`\nWebhook received at ${timestamp}`);

    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const message = change && change.value && change.value.messages && change.value.messages[0];

    if (message) {
      // Save message to Firestore
      const messageData = {
        id: message.id,
        from: message.from,
        type: message.type,
        timestamp: timestamp,
        body: message.text ? message.text.body : 'Non-text message',
        rawData: body,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('whatsapp_messages').doc(message.id).set(messageData);
      console.log(`Message stored in Firestore with ID: ${message.id}`);
      
      // Update user profile
      const contacts = change.value.contacts || [];
      if (contacts.length > 0) {
        const userName = contacts[0].profile?.name || 'Unknown';
        await updateUserProfile(message.from, userName);
      }
      
      // Send automated response for text messages
      if (message.text && message.text.body) {
        const userMessage = message.text.body.toLowerCase();
        let responseText = "Thank you for your message! How can I help you today?";
        
        if (userMessage.includes('hello') || userMessage.includes('hi') || userMessage.includes('مرحبا')) {
          responseText = "Hello! Welcome to our service. How can we assist you today?";
        } else if (userMessage.includes('help') || userMessage.includes('مساعدة')) {
          responseText = "I'm here to help! Please tell me what you need assistance with.";
        } else if (userMessage.includes('price') || userMessage.includes('cost') || userMessage.includes('سعر')) {
          responseText = "For pricing information, please visit our website or contact our sales team.";
        } else if (userMessage.includes('thank') || userMessage.includes('شكر')) {
          responseText = "You're welcome! Is there anything else I can help you with?";
        }
        
        console.log('Sending automated response:', responseText);
        await sendWhatsAppMessage(message.from, responseText);
      }
    } else {
      // Save non-message events
      await db.collection('webhook_events').add({
        timestamp: timestamp,
        rawData: body,
        note: 'No message content found',
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('Non-message event stored in Firestore');
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end();
  }
});

// View stored messages
app.get('/messages', async (req, res) => {
  try {
    const snapshot = await db.collection('whatsapp_messages')
      .orderBy('receivedAt', 'desc')
      .limit(50)
      .get();

    const storedMessages = [];
    snapshot.forEach(doc => {
      storedMessages.push({ id: doc.id, ...doc.data() });
    });
    
    res.status(200).json({
      count: storedMessages.length,
      messages: storedMessages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

// Analytics endpoint
app.get('/stats', async (req, res) => {
  try {
    const messagesSnapshot = await db.collection('whatsapp_messages').count().get();
    const usersSnapshot = await db.collection('users').count().get();
    
    res.status(200).json({
      total_messages: messagesSnapshot.data().count,
      total_users: usersSnapshot.data().count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({  
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Webhook with Auto-Responses'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook with Auto-Responses listening on port ${port}`);
});
