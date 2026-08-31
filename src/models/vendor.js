import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    serviceRadiusKm: { type: Number, default: 10, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    logoKey: { type: String },
  },
  { timestamps: true },
);

vendorSchema.index({ name: 1 });
vendorSchema.index({ email: 1 }, { sparse: true });

export default mongoose.model("Vendor", vendorSchema);
