import mongoose from "mongoose";

const uploadedImageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { timestamps: true }
);

const UploadedImage = mongoose.model("UploadedImage", uploadedImageSchema);
export default UploadedImage;
