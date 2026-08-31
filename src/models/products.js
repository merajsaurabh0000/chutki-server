import mongoose from "mongoose";

const productScehma = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: String, default: "" },
  description: { type: String, default: "" },
  subCategory: { type: String, default: "" },
  breadcrumbs: { type: String, default: "" },
  source: { type: String, default: "" },
  sourceId: { type: String, default: "" },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    index: true,
  },
  image: { type: String, default: "" },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  quantity: { type: String, required: true },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    index: true,
  }],
  ratingsCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
});

const Product = mongoose.model("Product", productScehma);

export default Product;
