import mongoose from "mongoose";

const notificationSettingSchema = new mongoose.Schema(
  {
    enableSMS: {
      type: Boolean,
      default: true,
    },
    enableWhatsApp: {
      type: Boolean,
      default: true,
    },
    enableEmail: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// We only need one global setting document, but we'll export the model
export default mongoose.model("NotificationSetting", notificationSettingSchema);
