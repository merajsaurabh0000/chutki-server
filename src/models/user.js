import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Base User Schema

const userSchema = new mongoose.Schema({
  name: { type: String },
  role: {
    type: String,
    enum: ["Customer", "Admin", "DeliveryPartner"],
    required: true,
  },
  isActivated: { type: Boolean, default: false },
});

// Customer Schema

const customerSchema = new mongoose.Schema({
  ...userSchema.obj,
  phone: { type: Number, unique: true, sparse: true },
  role: { type: String, enum: ["Customer"], default: "Customer" },
  liveLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  address: { type: String },
  email: { type: String },
  picture: { type: String },
  socialId: { type: String },
});

// Delivery Partner Schema
const deliveryPartnerSchema = new mongoose.Schema({
  ...userSchema.obj,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  phone: { type: Number, required: true },
  role: { type: String, enum: ["DeliveryPartner"], default: "DeliveryPartner" },
  liveLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  address: { type: String },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
  },
});

// Admin Schema

const adminSchema = new mongoose.Schema({
  ...userSchema.obj,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["Admin"], default: "Admin" },
});

const securePassword = schema => {
  schema.pre("save", async function () {
    const alreadyHashed = /^\$2[aby]\$\d{2}\$/.test(this.password || "");
    if (this.isModified("password") && !alreadyHashed) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  });
  schema.methods.verifyPassword = function (password) {
    return bcrypt.compare(password, this.password);
  };
  schema.set("toJSON", {
    transform: (_doc, value) => {
      delete value.password;
      return value;
    },
  });
};

securePassword(deliveryPartnerSchema);
securePassword(adminSchema);

export const Customer = mongoose.model("Customer", customerSchema);
export const DeliveryPartner = mongoose.model(
  "DeliveryPartner",
  deliveryPartnerSchema,
);
export const Admin = mongoose.model("Admin", adminSchema);
