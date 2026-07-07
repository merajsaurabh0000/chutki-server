import 'dotenv/config.js';
import mongoose from 'mongoose';
import Branch from './src/models/branch.js';
import {Customer} from './src/models/user.js';

const branchId = '69da37a662a6d3f32db64a10';

async function seedNearbyArea() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const customer = await Customer.findOne({
      'liveLocation.latitude': {$ne: null},
      'liveLocation.longitude': {$ne: null},
    });

    if (!customer) {
      throw new Error('No customer with a saved GPS location was found. Open the app and allow location first.');
    }

    await Branch.findByIdAndUpdate(
      branchId,
      {
        name: 'VillageFresh Nearby Test Branch',
        location: {
          latitude: customer.liveLocation.latitude,
          longitude: customer.liveLocation.longitude,
        },
        address: customer.address || 'Nearby test service area',
        deliveryRadiusKm: 10,
        isActive: true,
        deliveryCharge: 29,
        handlingCharge: 2,
        surgeCharge: 3,
        surgeEnabled: false,
        freeDeliveryThreshold: 499,
      },
      {upsert: true, new: true, setDefaultsOnInsert: true},
    );

    console.log('NEARBY TEST AREA SEEDED ✅');
    console.log('Delivery radius: 10 km');
  } catch (error) {
    console.error('Error seeding nearby area:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedNearbyArea();
