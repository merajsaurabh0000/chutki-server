import mongoose from "mongoose";
import Counter from "./counter.js";

const orderSchema= new mongoose.Schema({
    orderId:{
        type:String,
        unique:true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref :"Customer",
        required:true
    },
    deliveryPartner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DeliveryPartner",
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
    },
    items: [
        {
          id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          count: { type: Number, required: true },
          name: { type: String },
          image: { type: String },
          quantity: { type: String },
          unitPrice: { type: Number },
        },
      ],
      deliveryLocation: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: { type: String },
      },
      pickupLocation: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        address: { type: String },
      },
      deliveryPersonLocation: {
        latitude: { type: Number },
        longitude: { type: Number },
        address: { type: String },
      },
      status: {
        type: String,
        enum: ["available", "confirmed", "arriving", "delivered", "cancelled"],
        default: "available",
      },
      totalPrice: { type: Number, required: true },
      itemTotal: { type: Number, required: true, default: 0 },
      deliveryCharge: { type: Number, default: 0 },
      handlingCharge: { type: Number, default: 0 },
      surgeCharge: { type: Number, default: 0 },
      payment: {
        provider: { type: String, enum: ["razorpay"], default: "razorpay" },
        status: { type: String, enum: ["paid", "refund_pending", "refunded"], required: true },
        attempt: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentAttempt", required: true },
        paymentId: { type: String, required: true },
        refundId: String,
        refundedAt: Date,
      },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
});

async function getNextSequenceValue(sequenceName) {
    const sequenceDocument = await Counter.findOneAndUpdate(
        { name: sequenceName },
        { $inc: { sequence_value: 1 } },
        { new: true, upsert: true }
      );
      return sequenceDocument.sequence_value;
}

orderSchema.pre('validate', function (next) {
    if (this.itemTotal == null || (this.itemTotal === 0 && this.totalPrice > 0)) {
      this.itemTotal = this.totalPrice || 0;
    }
    this.deliveryCharge ??= 0;
    this.handlingCharge ??= 0;
    this.surgeCharge ??= 0;
    next();
});

orderSchema.pre('save',async function (next){
    if(this.isNew){
        const sequenceValue = await getNextSequenceValue("orderId");
        this.orderId=`ORDR${sequenceValue.toString().padStart(5,'0')}`
    }
    next();
});

const Order = mongoose.model('Order',orderSchema)

export default Order
