import 'dotenv/config.js';
import mongoose from 'mongoose';
import {Admin} from './src/models/user.js';

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    let admin = await Admin.findOne({email: 'ritik@gmail.com'});
    if (!admin) {
      admin = new Admin({
        name: 'Ritik',
        email: 'ritik@gmail.com',
        password: '12345678',
        role: 'Admin',
        isActivated: true,
      });
    } else {
      admin.name = 'Ritik';
      admin.password = '12345678';
      admin.role = 'Admin';
      admin.isActivated = true;
    }
    await admin.save();

    console.log(`ADMIN READY ✅ ${admin.email}`);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedAdmin();
