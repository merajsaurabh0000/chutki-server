import mongoose from 'mongoose';
import { VendorProduct, Vendor } from './src/models/index.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const supermarket = await Vendor.findById("6a57307783c2b62eb3eace7e");
  const neemeraVendor = await Vendor.findById("6a966cfe223d1c800e5bf815");
  
  const superCount = await VendorProduct.countDocuments({ vendor: supermarket._id });
  const neemeraCount = await VendorProduct.countDocuments({ vendor: neemeraVendor._id });

  console.log(`Products in Supermarket Vendor: ${superCount}`);
  console.log(`Products in new Neemera Vendor: ${neemeraCount}`);

  process.exit(0);
}
run();
