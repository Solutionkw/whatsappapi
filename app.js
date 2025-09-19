const express = require('express');
const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";

// In-memory storage for testing
const messages = [];

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

// Receive and store messages
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    const timestamp = new Date().toISOString();
    
    console.log(`\nWebhook received at ${timestamp}`);
    console.log('Raw webhook data:', JSON.stringify(body, null, 2));

    // Extract message data
    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const message = change && change.value && change.value.messages && change.value.messages[0];

    if (message) {
      // Store in memory
      messages.push({
        id: message.id || `msg_${Date.now()}`,
        from: message.from,
        type: message.type,
        timestamp: timestamp,
        body: message.text ? message.text.body : 'Non-text message',
        rawData: body
      });
      
      console.log(`Message stored in memory. Total messages: ${messages.length}`);
      console.log('From:', message.from, 'Type:', message.type);
      
      if (message.text) {
        console.log('Text content:', message.text.body);
      }
    } else {
      console.log('No message data found in webhook');
      messages.push({
        id: `webhook_${Date.now()}`,
        timestamp: timestamp,
        rawData: body,
        note: 'No message content found'
      });
    }

    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end();
  }
});

// View stored messages
app.get('/messages', (req, res) => {
  res.status(200).json({
    count: messages.length,
    messages: messages
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message_count: messages.length,
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Webhook (In-Memory Storage)'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook listening on port ${port}`);
  console.log(`Health check: https://whatsapp-webhook-774887765344.us-central1.run.app/health`);
  console.log(`View messages: https://whatsapp-webhook-774887765344.us-central1.run.app/messages`);
});
