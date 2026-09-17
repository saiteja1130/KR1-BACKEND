import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI is not defined in environment variables.');
      process.exit(1);
    }

    // Automatically prepend mongodb+srv:// if missing from URI
    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${mongoUri}`;
    }

    console.log('🔄 Connecting to MongoDB Atlas...');
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host} / ${conn.connection.name}`);
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Connection Error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB Disconnected. Attempting reconnection...');
    });

    return conn;
  } catch (error) {
    console.error('❌ MongoDB Atlas Connection Failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // In development, keep running so other services can still respond with informative errors
  }
};

export default connectDB;
