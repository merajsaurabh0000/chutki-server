import mongoose from "mongoose";

const themeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: false, index: true },
    priority: { type: Number, default: 0, index: true },
    startDate: { type: Date },
    endDate: { type: Date },

    primaryColor: { type: String, default: "#ff6f00" },
    headerGradientStart: { type: String, default: "#061827" },
    headerGradientEnd: { type: String, default: "#ff6f00" },
    backgroundColor: { type: String, default: "#fffaf5" },
    stickySearchBackground: { type: String, default: "#061827" },
    sectionTitleColor: { type: String, default: "#061827" },
    categoryTileBackground: { type: String, default: "#fff1df" },
    productCardBackground: { type: String, default: "#ffffff" },
    productCardBorder: { type: String, default: "#f2d9c9" },
    productBadgeBackground: { type: String, default: "#eaf5e8" },
  },
  { timestamps: true },
);

themeSchema.index({ isActive: 1, priority: -1, startDate: 1, endDate: 1 });

themeSchema.pre("save", async function (next) {
  if (this.isActive) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { $set: { isActive: false } },
    );
  }
  next();
});

themeSchema.post("findOneAndUpdate", async function (doc) {
  if (doc?.isActive) {
    await doc.constructor.updateMany(
      { _id: { $ne: doc._id }, isActive: true },
      { $set: { isActive: false } },
    );
  }
});

const Theme = mongoose.model("Theme", themeSchema);

export default Theme;
