import mongoose from 'mongoose';
import { Branch, VendorProduct, Order, DeliveryPartner } from './src/models/index.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const supermarketId = "6a57307783c2b62eb3eace7e";
  const neemeraVendorId = "6a966cfe223d1c800e5bf815";
  const neemeraBranchId = "6a966c57223d1c800e5bf7df";

  console.log("Migrating Neemera Branch...");
  const branchResult = await Branch.updateOne(
    { _id: neemeraBranchId },
    { $set: { vendor: neemeraVendorId } }
  );
  console.log("Branch updated:", branchResult);

  console.log("Migrating VendorProducts...");
  const vpResult = await VendorProduct.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: neemeraVendorId } }
  );
  console.log("Products updated:", vpResult);

  console.log("Migrating Orders...");
  const orderResult = await Order.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: neemeraVendorId } }
  );
  console.log("Orders updated:", orderResult);

  console.log("Migrating Delivery Partners...");
  const dpResult = await DeliveryPartner.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: neemeraVendorId } }
  );
  console.log("Delivery Partners updated:", dpResult);

  process.exit(0);
}
run();
