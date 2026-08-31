import 'dotenv/config.js';
import mongoose from 'mongoose';
import Branch from './src/models/branch.js';

const branchId = '69da37a662a6d3f32db64a10';

async function seedBranch() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Branch.findByIdAndUpdate(
      branchId,
      {
        name: 'VillageFresh Main Branch',
        location: {
          latitude: 28.6139,
          longitude: 77.209,
        },
        address: 'VillageFresh Main Branch, New Delhi',
      },
      {upsert: true, new: true, setDefaultsOnInsert: true},
    );
    console.log('BRANCH SEEDED SUCCESSFULLY ✅');
  } catch (error) {
    console.error('Error seeding branch:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedBranch();
