import mongoose from "mongoose";

const vendorProductSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
    price: { type: Number, min: 0 },
    discountPrice: { type: Number, min: 0 },
    stock: { type: Number, min: 0, default: 0 },
    isAvailable: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

vendorProductSchema.index({ vendor: 1, product: 1, branch: 1 }, { unique: true });

export default mongoose.model("VendorProduct", vendorProductSchema);
