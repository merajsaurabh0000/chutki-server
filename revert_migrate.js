import mongoose from 'mongoose';
import { Branch, VendorProduct, Order, DeliveryPartner } from './src/models/index.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const supermarketId = "6a57307783c2b62eb3eace7e";
  const neemeraVendorId = "6a966cfe223d1c800e5bf815";
  const neemeraBranchId = "6a966c57223d1c800e5bf7df";

  console.log("Reverting Neemera Branch...");
  const branchResult = await Branch.updateOne(
    { _id: neemeraBranchId },
    { $set: { vendor: supermarketId } }
  );
  console.log("Branch reverted:", branchResult);

  console.log("Reverting VendorProducts...");
  const vpResult = await VendorProduct.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: supermarketId } }
  );
  console.log("Products reverted:", vpResult);

  console.log("Reverting Orders...");
  const orderResult = await Order.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: supermarketId } }
  );
  console.log("Orders reverted:", orderResult);

  console.log("Reverting Delivery Partners...");
  const dpResult = await DeliveryPartner.updateMany(
    { branch: neemeraBranchId },
    { $set: { vendor: supermarketId } }
  );
  console.log("Delivery Partners reverted:", dpResult);

  process.exit(0);
}
run();
