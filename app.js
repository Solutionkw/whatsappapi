const express = require('express');
const app = express();
app.use(express.json());

// Get port from environment variable (Cloud Run sets PORT=8080)
const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN;

// Webhook verification
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Receive messages
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).end();
});

// Health check endpoint (important for Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start the server on the correct port
app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Webhook listening on port ${port}`);
});
