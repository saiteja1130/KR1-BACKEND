import 'dotenv/config';
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import User from '../models/User.js';

const updateAdminCredentials = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI is not set in .env');
      process.exit(1);
    }

    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${mongoUri}`;
    }

    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB.');

    const targetEmail = (process.env.ADMIN_EMAIL || 'info@kr1.in').toLowerCase().trim();
    const targetPassword = process.env.ADMIN_PASSWORD || '123456';

    // Check existing admins
    const existingAdmins = await User.find({ role: 'ADMIN' });
    console.log(`Found ${existingAdmins.length} admin user(s):`, existingAdmins.map(a => ({ id: a._id, email: a.email, name: a.name })));

    let targetUser = await User.findOne({ email: targetEmail });

    if (targetUser) {
      console.log(`Updating existing user ${targetEmail}...`);
      targetUser.password = targetPassword; // pre('save') hook will hash it
      targetUser.role = 'ADMIN';
      targetUser.isActive = true;
      await targetUser.save();
      console.log(`✅ Admin credentials for ${targetEmail} successfully updated!`);
    } else if (existingAdmins.length > 0) {
      // Update the first admin user
      const admin = existingAdmins[0];
      console.log(`Updating admin ${admin.email} to ${targetEmail}...`);
      admin.email = targetEmail;
      admin.password = targetPassword; // pre('save') hook will hash it
      admin.role = 'ADMIN';
      admin.isActive = true;
      await admin.save();
      console.log(`✅ Existing admin updated to ${targetEmail}!`);
    } else {
      console.log(`Creating new admin ${targetEmail}...`);
      const newAdmin = new User({
        name: 'Super Admin',
        email: targetEmail,
        phone: '9666193543',
        password: targetPassword,
        role: 'ADMIN',
        isActive: true,
      });
      await newAdmin.save();
      console.log(`✅ New admin created with ${targetEmail}!`);
    }

    // Verify password check
    const verifyUser = await User.findOne({ email: targetEmail }).select('+password');
    const isMatch = await verifyUser.comparePassword(targetPassword);
    console.log(`🔐 Verification: Password match for ${targetEmail} = ${isMatch}`);

    // Update global referral settings in DB
    console.log('🔄 Updating database referral settings to 10% discount...');
    const updatedSetting = await Setting.findOneAndUpdate(
      { key: 'referral_settings' },
      {
        $set: {
          referralDiscountPercent: 10,
          referralDiscount: 150,
          baseApplicationFee: 1499,
          isReferralEnabled: true,
          requireVerifiedReferrer: false,
        },
      },
      { upsert: true, new: true }
    );
    console.log('✅ Setting updated in MongoDB:', {
      referralDiscountPercent: updatedSetting.referralDiscountPercent,
      referralDiscount: updatedSetting.referralDiscount,
      baseApplicationFee: updatedSetting.baseApplicationFee,
      isReferralEnabled: updatedSetting.isReferralEnabled,
      requireVerifiedReferrer: updatedSetting.requireVerifiedReferrer,
    });

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin credentials:', error);
    process.exit(1);
  }
};

updateAdminCredentials();
