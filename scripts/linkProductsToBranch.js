import 'dotenv/config.js';
import mongoose from 'mongoose';
import Product from '../src/models/products.js';
import Branch from '../src/models/branch.js';
import VendorProduct from '../src/models/vendorProduct.js';

async function linkProducts() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing!');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB Atlas ✅');

    // 1. Get all branches
    const branches = await Branch.find({});
    if (!branches.length) {
      console.error('No branches found in database! Please run branch seeding first.');
      return;
    }

    console.log(`Found ${branches.length} branches.`);

    // 2. Get all products
    const products = await Product.find({});
    if (!products.length) {
      console.error('No products found in database! Run product scraping/seeding first.');
      return;
    }

    console.log(`Found ${products.length} products to link.`);

    // 3. For each branch, link all products
    let linkedCount = 0;
    for (const branch of branches) {
      if (!branch.vendor) {
        console.warn(`Branch ${branch.name} has no vendor assigned! Skipping.`);
        continue;
      }

      console.log(`Linking products for branch: ${branch.name} (Vendor ID: ${branch.vendor})`);

      for (const product of products) {
        // Upsert in VendorProduct
        await VendorProduct.findOneAndUpdate(
          {
            vendor: branch.vendor,
            product: product._id,
            branch: branch._id,
          },
          {
            $set: {
              price: product.price,
              discountPrice: product.discountPrice,
              stock: 150, // default stock
              isAvailable: true,
            },
          },
          { upsert: true, new: true }
        );
        linkedCount++;
      }
    }

    console.log(`LINKING COMPLETE: Linked ${linkedCount} products to branch inventory successfully! 🎉`);
  } catch (error) {
    console.error('Error linking products:', error);
  } finally {
    await mongoose.connection.close();
  }
}

linkProducts();
