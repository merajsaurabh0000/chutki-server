import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  count: { type: Number, required: true, min: 1 },
  name: String, image: String, quantity: String, unitPrice: Number,
}, { _id: false });

const schema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
  items: { type: [itemSchema], required: true },
  itemTotal: Number, deliveryCharge: Number, handlingCharge: Number, surgeCharge: Number,
  totalPrice: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  razorpayOrderId: { type: String, required: true, unique: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  status: { type: String, enum: ["created", "paid", "failed", "refund_pending", "refunded"], default: "created", index: true },
  expiresAt: { type: Date, required: true, index: true },
  refundId: String,
  refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  refundedAt: Date,
}, { timestamps: true });

export default mongoose.model("PaymentAttempt", schema);
