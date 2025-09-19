const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
app.use(express.json());

const port = parseInt(process.env.PORT) || 8080;
const verifyToken = process.env.VERIFY_TOKEN || "default_token";
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://drmdnaji5501_db_user:czO9aeNcm4j6TXrk@cluster0.slmif7y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB connection
let db;
async function connectDB() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db('whatsapp');
  console.log('Connected to MongoDB');
}

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

// Receive and store messages
app.post('/', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const body = req.body;
    
    console.log(`\nWebhook received ${timestamp}`);
    
    // Save to database
    if (db) {
      await db.collection('messages').insertOne({
        timestamp: timestamp,
        data: body,
        processed: false
      });
      console.log('Message saved to database');
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(200).end();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    database: db ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString() 
  });
});

// Start server
app.listen(port, '0.0.0.0', async () => {
  console.log(`WhatsApp Webhook listening on port ${port}`);
  try {
    await connectDB();
  } catch (error) {
    console.log('Database connection failed, running without DB');
  }
});
