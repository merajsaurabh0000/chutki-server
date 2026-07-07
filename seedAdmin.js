import 'dotenv/config.js';
import mongoose from 'mongoose';
import {Admin} from './src/models/user.js';

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const admin = await Admin.findOneAndUpdate(
      {email: 'ritik@gmail.com'},
      {
        name: 'Ritik',
        email: 'ritik@gmail.com',
        password: '12345678',
        role: 'Admin',
        isActivated: true,
      },
      {upsert: true, new: true, setDefaultsOnInsert: true},
    );

    console.log(`ADMIN READY ✅ ${admin.email}`);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedAdmin();
