import 'dotenv/config';
import mongoose from 'mongoose';
import Application from '../models/Application.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';

const run = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI is not set in .env');
      process.exit(1);
    }

    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${mongoUri}`;
    }

    console.log('🔄 Connecting to MongoDB database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully.');

    // 1. Update Settings to set baseApplicationFee = 1499
    const settingResult = await Setting.findOneAndUpdate(
      { key: 'referral_settings' },
      { $set: { baseApplicationFee: 1499 } },
      { upsert: true, new: true }
    );
    console.log('✅ Updated referral settings: baseApplicationFee set to ₹' + settingResult.baseApplicationFee);

    // 2. Count existing applications
    const appCount = await Application.countDocuments();
    console.log(`ℹ️ Found ${appCount} application(s) in the database.`);

    // 3. Remove all applications
    const deleteAppResult = await Application.deleteMany({});
    console.log(`🗑️ Successfully deleted ${deleteAppResult.deletedCount} application(s).`);

    // 4. Clean up candidate user accounts (preserving admins)
    const candidateUserCount = await User.countDocuments({ role: 'USER' });
    if (candidateUserCount > 0) {
      const deleteUserResult = await User.deleteMany({ role: 'USER' });
      console.log(`🗑️ Successfully deleted ${deleteUserResult.deletedCount} candidate user account(s).`);
    }

    // Check remaining admins
    const remainingAdmins = await User.find({ role: 'ADMIN' }).select('name email role');
    console.log(`🛡️ Preserved ${remainingAdmins.length} Admin account(s):`, remainingAdmins.map(a => a.email));

    console.log('\n🎉 Database cleanup complete and application fee updated to ₹1499!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error executing cleanup:', error);
    process.exit(1);
  }
};

run();
