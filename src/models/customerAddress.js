import mongoose from "mongoose";

const customerAddressSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    receiverName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 10 },
    label: {
      type: String,
      enum: ["home", "office", "other"],
      default: "home",
      index: true,
    },
    house: { type: String, required: true, trim: true, maxlength: 160 },
    area: { type: String, required: true, trim: true, maxlength: 160 },
    landmark: { type: String, trim: true, maxlength: 160 },
    formattedAddress: { type: String, trim: true, maxlength: 500 },
    location: {
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    isSelected: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

customerAddressSchema.index({ customer: 1, createdAt: -1 });

customerAddressSchema.pre("save", async function (next) {
  if (this.isSelected) {
    await this.constructor.updateMany(
      { customer: this.customer, _id: { $ne: this._id }, isSelected: true },
      { $set: { isSelected: false } },
    );
  }
  next();
});

customerAddressSchema.post("findOneAndUpdate", async function (doc) {
  if (doc?.isSelected) {
    await doc.constructor.updateMany(
      { customer: doc.customer, _id: { $ne: doc._id }, isSelected: true },
      { $set: { isSelected: false } },
    );
  }
});

export default mongoose.model("CustomerAddress", customerAddressSchema);
