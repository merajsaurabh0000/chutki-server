import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["super_admin", "vendor_owner", "vendor_staff"],
      required: true,
      default: "vendor_owner",
      index: true,
    },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

adminUserSchema.pre("save", async function () {
  const alreadyHashed = /^\$2[aby]\$\d{2}\$/.test(this.password || "");

  if (this.isModified("password") && !alreadyHashed) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

adminUserSchema.methods.verifyPassword = function (password) {
  return bcrypt.compare(password, this.password);
};

adminUserSchema.set("toJSON", {
  transform: (_doc, value) => {
    delete value.password;
    return value;
  },
});

export default mongoose.model("AdminUser", adminUserSchema);
