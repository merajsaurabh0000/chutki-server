import mongoose from "mongoose";

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  address: { type: String },
  deliveryRadiusKm: { type: Number, default: 10, min: 1 },
  isActive: { type: Boolean, default: true },
  deliveryCharge: { type: Number, default: 29, min: 0 },
  handlingCharge: { type: Number, default: 2, min: 0 },
  surgeCharge: { type: Number, default: 3, min: 0 },
  surgeEnabled: { type: Boolean, default: false },
  freeDeliveryThreshold: { type: Number, default: 499, min: 0 },
  deliveryPartners: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryPartner",
    },
  ],
  inventory: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    stock: { type: Number, min: 0, default: 0 },
  }],
});

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
