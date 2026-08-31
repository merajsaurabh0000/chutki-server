import "dotenv/config.js";
import mongoose from "mongoose";
import { categories, products } from "./seedData.js";
import { Category, Product } from "./src/models/index.js";

import cloudinary from "./src/config/cloudinary.js";

async function uploadImage(imageUrl, folder) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: folder,
    });
    return result.secure_url;
  } catch (error) {
    console.error(`Error uploading image ${imageUrl}:`, error);
    return imageUrl; // Fallback to original URL if upload fails
  }
}

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Product.deleteMany({});
    await Category.deleteMany({});

    console.log("Uploading categories to Cloudinary...");
    const processedCategories = await Promise.all(
      categories.map(async (cat) => ({
        ...cat,
        image: await uploadImage(cat.image, "categories"),
      }))
    );

    const categoryDocs = await Category.insertMany(processedCategories);

    const categoryMap = categoryDocs.reduce((map, category) => {
      map[category.name] = category._id;
      return map;
    }, {});

    console.log("Uploading products to Cloudinary...");
    const productWithCategoryIds = await Promise.all(
      products.map(async (product) => ({
        ...product,
        category: categoryMap[product.category],
        image: await uploadImage(product.image, "products"),
      }))
    );

    await Product.insertMany(productWithCategoryIds);

    console.log("DATABASE SEEDED SUCCESSFULLY ✅");
  } catch (error) {
    console.error("Error Seeding database:", error);
  } finally {
    mongoose.connection.close();
  }
}

seedDatabase();
