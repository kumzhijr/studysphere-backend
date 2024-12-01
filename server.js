var express = require("express");
let app = express();
let PropertiesReader = require("properties-reader");

const cors = require("cors");
const path = require('path');
const fs = require('fs');

app.set('json spaces', 3);
app.use(cors());
app.use(express.json());

let propertiesPath = path.resolve(__dirname, "./db.properties");
let properties = PropertiesReader(propertiesPath);

const dbPrefix = properties.get('db.prefix');
const dbHost = properties.get('db.host');
const dbName = properties.get('db.name');
const dbUser = properties.get('db.user');
const dbPassword = properties.get('db.password');
const dbParams = properties.get('db.params');

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `${dbPrefix}${dbUser}:${dbPassword}${dbHost}${dbParams}`;

const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

let db1;

async function connectDB() {
  try {
    client.connect();
    console.log('Connected to MongoDB');
    db1 = client.db('StudySphere');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectDB();

app.param('collectionName', async function(req, res, next, collectionName) {
  try {
    // Set the dynamic collection to the request object
    req.collection = db1.collection(collectionName);
    console.log('Middleware set collection:', req.collection.collectionName); // Debugging line
    next();
  } catch (error) {
    console.error('Error setting collection:', error.message);
    res.status(500).json({ error: 'Failed to set collection' });
  }
});


app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Get all lessons
app.get('/api/lessons/:id', async (req, res) => {
  const lessonId = parseInt(req.params.id, 10); // Ensure the ID is treated as a number
  try {
    const lesson = await db1.collection('lessons').findOne({ id: lessonId });
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    res.json(lesson);
  } catch (err) {
    console.error('Error fetching lesson by ID:', err.message);
    res.status(500).send('Error fetching lesson');
  }
});


// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
