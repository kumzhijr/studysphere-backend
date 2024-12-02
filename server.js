var express = require("express");
let app = express();
let PropertiesReader = require("properties-reader");

const cors = require("cors");
const path = require('path');
const fs = require('fs');

app.set('json spaces', 3);
app.use(cors());
app.use(express.json());
app.use('images', express.static('images'));

// previously unpresent
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'index,html'));
})

let propertiesPath = path.resolve(__dirname, "db.properties");
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

// Logger middleware
app.use((req, res, next) => {
  const { method, url, headers, body } = req;
  const logMessage = `
    [${new Date().toISOString()}] ${method} ${url}
    Headers: ${JSON.stringify(headers)}
    Body: ${JSON.stringify(body)}
  `;
  console.log(logMessage);

  next();
});

// Get all lessons
app.get('/api/lessons', async (req, res) => {
  try {
    const collection = db1.collection('lessons');
    const data = await collection.find({}).toArray();

    console.log('Retrieved data', data);
    res.json(data);
  } catch (err) {
    console.error('Error fetching docs:', err.message);
    res.status(500).send('Error fetching data');
  }
});

// Get lessons by id - testing
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

// Search Route
app.get('/search', async (req, res) => {
  const query = req.query.q?.toLowerCase() || ''; // Get the query parameter or default to an empty string
  try {
    const collection = db1.collection('lessons'); // Ensure 'lessons' is the correct collection name
    const results = await collection
      .find({ subject: { $regex: query, $options: 'i' } }) // Case-insensitive search by subject
      .toArray();

    res.json(results); // Return filtered lessons
  } catch (err) {
    console.error('Error fetching search results:', err.message);
    res.status(500).send('Error fetching search results');
  }
});

// Create orders - POST Route
app.post('/api/orders', async (req, res) => {
  const { customerName, customerPhone, cart, totalPrice } = req.body;

  // Validate fields
  if (
    !customerName ||
    !customerPhone ||
    !cart ||
    !Array.isArray(cart) ||
    cart.length === 0 ||
    !totalPrice ||
    isNaN(totalPrice)
  ) {
    return res.status(400).json({ message: 'Missing required fields or invalid data' });
  }

  try {
    const order = {
      customerName,
      customerPhone,
      cart,
      totalPrice,
      createdAt: new Date(),
    };

    // Insert the new order into the "orders" collection
    const result = await db1.collection('orders').insertOne(order);

    // Update lesson availability
    const bulkOps = cart.map((item) => ({
      updateOne: {
        filter: { id: item.lessonId },
        update: { $inc: { availableInventory: -item.quantity } },
      },
    }));

    await db1.collection('lessons').bulkWrite(bulkOps);

    res.status(201).json({
      message: 'Order successfully placed',
      orderId: result.insertedId,
      order,
    });
  } catch (err) {
    console.error('Error saving order:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db1.collection('orders').find().toArray();
    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Edit availability in lessons collection
app.put('/api/lessons/:id', async (req, res) => {
  const lessonId = parseInt(req.params.id, 10); // Parse the id parameter as an integer
  const updates = req.body; 

  const allowedFields = ['subject', 'location', 'price', 'availableInventory'];
  const isUpdateValid = Object.keys(updates).every((key) =>
    allowedFields.includes(key)
  );

  if (!isUpdateValid) {
    return res.status(400).json({ message: 'Invalid updates provided.' });
  }

  try {
    // Find and update the lesson by ID
    const result = await db1.collection('lessons').updateOne(
      { id: lessonId }, 
      { $set: updates } 
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }

    res.status(200).json({ message: 'Lesson updated successfully.' });
  } catch (error) {
    console.error('Error updating lesson:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Static File Middleware - Check if image exists
app.use("/images", (req, res, next) => {
  const { filename } = req.params;
  const imagePath = path.join(__dirname, "images", req.path);

  // Check if the file exists using fs.access
  fs.access(imagePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log(`[${new Date().toISOString()}] Image not found: ${req.path}`);
      return res.status(404).json({
        message: "Image not Found",
        requestedPath: filename,
      });
    }
    next(); 
  });
});

// Serve static files from my directory
app.use("/images", express.static(path.join(__dirname, "images")));

// Test route for images
app.get('/images/:fileName', (req, res) => {
  const filePath = path.join(__dirname, "images", req.params.fileName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ message: "Image not Found" });
    }
    res.sendFile(filePath);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ error: 'An error occurred' });
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });