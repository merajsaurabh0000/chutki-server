import "dotenv/config";
import { connectDB } from "../src/config/connect.js";
import Product from "../src/models/products.js";

await connectDB(process.env.MONGO_URI);

const result = await Product.updateMany(
  {
    category: { $exists: true, $ne: null },
    $or: [
      { categories: { $exists: false } },
      { categories: { $size: 0 } },
    ],
  },
  [
    {
      $set: {
        categories: ["$category"],
      },
    },
  ],
);

console.log({
  matched: result.matchedCount,
  modified: result.modifiedCount,
});

process.exit(0);
