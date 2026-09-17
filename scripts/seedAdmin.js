require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI is not set in .env');
      process.exit(1);
    }

    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${mongoUri}`;
    }

    console.log('🔄 Connecting to MongoDB for Admin seeding...');
    await mongoose.connect(mongoUri);

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kr1.in').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@kr1_2026!';
    const adminName = process.env.ADMIN_NAME || 'Super Admin';
    const adminPhone = process.env.ADMIN_PHONE || '+919666193543';

    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      console.log(`ℹ️ Admin user (${adminEmail}) already exists. Updating credentials...`);
      admin.name = adminName;
      admin.phone = adminPhone;
      admin.password = adminPassword; // Will be hashed by pre-save hook
      admin.role = 'ADMIN';
      admin.isActive = true;
      await admin.save();
      console.log(`✅ Admin account updated successfully!`);
    } else {
      console.log(`ℹ️ Creating new Admin user (${adminEmail})...`);
      admin = new User({
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        password: adminPassword,
        role: 'ADMIN',
        isActive: true,
      });
      await admin.save();
      console.log(`✅ Admin account created successfully!`);
    }

    console.log('\n=======================================');
    console.log('🔐 KR MATERIAL & MANPOWER ADMIN CREDENTIALS:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role:     ADMIN`);
    console.log('=======================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin Seeding Error:', error);
    process.exit(1);
  }
};

seedAdmin();
