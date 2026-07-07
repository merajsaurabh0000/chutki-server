import crypto from "node:crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Branch from "../../models/branch.js";
import Product from "../../models/products.js";
import Order from "../../models/order.js";
import PaymentAttempt from "../../models/paymentAttempt.js";
import { Customer } from "../../models/user.js";

const razorpay = () => new Razorpay({key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET});
class AvailabilityError extends Error {
  constructor(unavailableItemIds) {
    super("Some items are unavailable nearby");
    this.code = "ITEMS_UNAVAILABLE";
    this.unavailableItemIds = unavailableItemIds;
  }
}
export const distanceKm = (a, b) => {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const sign = (value, secret) => crypto.createHmac("sha256", secret).update(value).digest("hex");
export const validSignature = (value, signature, secret) => {
  if (!signature || !secret) return false;
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const priceCart = async (items, branch) => {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error("Cart is empty or too large");
  const normalizedInput = items.map(item => ({product: String(item.item || item.product), count: Number(item.count)}));
  if (normalizedInput.some(item => !mongoose.isValidObjectId(item.product) || !Number.isInteger(item.count) || item.count < 1 || item.count > 99)) throw new Error("Invalid cart item");
  const products = await Product.find({_id: {$in: normalizedInput.map(i => i.product)}}).lean();
  const productMap = new Map(products.map(product => [String(product._id), product]));
  const inventoryMap = new Map((branch.inventory || []).map(row => [String(row.product), row.stock]));
  const unavailableItemIds = normalizedInput
    .filter(input => !productMap.get(input.product) || (inventoryMap.get(input.product) ?? 0) < input.count)
    .map(input => input.product);
  if (unavailableItemIds.length) throw new AvailabilityError(unavailableItemIds);
  const priced = normalizedInput.map(input => {
    const product = productMap.get(input.product);
    return {product: product._id, count: input.count, name: product.name, image: product.image, quantity: product.quantity, unitPrice: product.price};
  });
  const itemTotal = priced.reduce((sum, item) => sum + item.unitPrice * item.count, 0);
  const deliveryCharge = itemTotal >= branch.freeDeliveryThreshold ? 0 : branch.deliveryCharge;
  const handlingCharge = branch.handlingCharge, surgeCharge = branch.surgeEnabled ? branch.surgeCharge : 0;
  return {items: priced, itemTotal, deliveryCharge, handlingCharge, surgeCharge, totalPrice: itemTotal + deliveryCharge + handlingCharge + surgeCharge};
};

const quoteFor = async (customerId, items) => {
  const customer = await Customer.findById(customerId).lean();
  const location = customer?.liveLocation;
  if (location?.latitude == null || location?.longitude == null) throw new Error("Set a valid delivery location first");
  const branches = await Branch.find({isActive: true}).lean();
  const eligible = branches.map(branch => ({branch, distance: distanceKm(branch.location, location)})).filter(row => row.distance <= row.branch.deliveryRadiusKm).sort((a, b) => a.distance - b.distance);
  if (!eligible.length) throw new Error("Delivery is unavailable at this location");
  let bestAvailabilityError;
  for (const row of eligible) {
    try { return {branch: row.branch, customer, ...(await priceCart(items, row.branch))}; }
    catch (error) {
      if (error instanceof AvailabilityError && (!bestAvailabilityError || error.unavailableItemIds.length < bestAvailabilityError.unavailableItemIds.length)) bestAvailabilityError = error;
      else if (!(error instanceof AvailabilityError)) throw error;
    }
  }
  throw bestAvailabilityError || new Error("Items are currently unavailable nearby");
};

export const checkoutQuote = async (req, reply) => {
  try {
    const value = await quoteFor(req.user.userId, req.body?.items);
    return reply.send({...value, branch: {id: value.branch._id, name: value.branch.name, address: value.branch.address}, items: undefined, customer: undefined});
  } catch (error) { return reply.code(400).send({message: error.message, code: error.code, unavailableItemIds: error.unavailableItemIds || []}); }
};

export const createPayment = async (req, reply) => {
  try {
    const quote = await quoteFor(req.user.userId, req.body?.items);
    const gatewayOrder = await razorpay().orders.create({amount: Math.round(quote.totalPrice * 100), currency: "INR", receipt: `pay_${crypto.randomUUID()}`, notes: {customerId: req.user.userId}});
    const attempt = await PaymentAttempt.create({customer: req.user.userId, branch: quote.branch._id, items: quote.items, itemTotal: quote.itemTotal, deliveryCharge: quote.deliveryCharge, handlingCharge: quote.handlingCharge, surgeCharge: quote.surgeCharge, totalPrice: quote.totalPrice, razorpayOrderId: gatewayOrder.id, expiresAt: new Date(Date.now() + 15 * 60000)});
    return reply.code(201).send({attemptId: attempt._id, razorpayOrderId: gatewayOrder.id, amount: gatewayOrder.amount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID});
  } catch (error) {
    const message = error.error?.description || error.message || "Unable to begin payment";
    req.log.warn({code: error.code, statusCode: error.statusCode, message}, "payment order creation rejected");
    return reply.code(400).send({message, code: error.code, unavailableItemIds: error.unavailableItemIds || []});
  }
};

export const verifyPayment = async (req, reply) => {
  const {attemptId, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature} = req.body || {};
  if (!validSignature(`${gatewayOrderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET)) return reply.code(400).send({message: "Payment verification failed"});
  const paidAttempt = await PaymentAttempt.findOneAndUpdate(
    {_id: attemptId, customer: req.user.userId, razorpayOrderId: gatewayOrderId, status: {$in: ["created", "paid"]}},
    {$set: {status: "paid", razorpayPaymentId: paymentId}},
    {new: true},
  );
  if (!paidAttempt) return reply.code(404).send({message: "Payment attempt not found"});
  const session = await mongoose.startSession();
  try {
    let createdOrder;
    await session.withTransaction(async () => {
      const attempt = await PaymentAttempt.findOne({_id: attemptId, customer: req.user.userId}).session(session);
      if (!attempt || attempt.razorpayOrderId !== gatewayOrderId) throw new Error("Payment attempt not found");
      if (attempt.order) { createdOrder = await Order.findById(attempt.order).session(session); return; }
      if (attempt.status !== "paid") throw new Error("Payment attempt unavailable");
      for (const item of attempt.items) {
        const result = await Branch.updateOne({_id: attempt.branch, inventory: {$elemMatch: {product: item.product, stock: {$gte: item.count}}}}, {$inc: {"inventory.$[row].stock": -item.count}}, {arrayFilters: [{"row.product": item.product}], session});
        if (!result.modifiedCount) throw new Error("An item is no longer available; contact support for refund");
      }
      const customer = await Customer.findById(req.user.userId).session(session);
      [createdOrder] = await Order.create([{customer: customer._id, branch: attempt.branch, items: attempt.items.map(item => ({id: item.product, item: item.product, count: item.count, name: item.name, image: item.image, quantity: item.quantity, unitPrice: item.unitPrice})), itemTotal: attempt.itemTotal, deliveryCharge: attempt.deliveryCharge, handlingCharge: attempt.handlingCharge, surgeCharge: attempt.surgeCharge, totalPrice: attempt.totalPrice, deliveryLocation: {...customer.liveLocation, address: customer.address || ""}, pickupLocation: {latitude: 0, longitude: 0, address: ""}, payment: {status: "paid", attempt: attempt._id, paymentId}}], {session});
      const branch = await Branch.findById(attempt.branch).session(session);
      createdOrder.pickupLocation = {...branch.location, address: branch.address || ""}; await createdOrder.save({session});
      attempt.order = createdOrder._id; await attempt.save({session});
    });
    return reply.send(createdOrder);
  } catch (error) { return reply.code(409).send({message: error.message || "Could not create order"}); }
  finally { await session.endSession(); }
};

export const webhook = async (req, reply) => {
  if (!validSignature(req.rawBody, req.headers["x-razorpay-signature"], process.env.RAZORPAY_WEBHOOK_SECRET)) return reply.code(401).send({message: "Invalid signature"});
  const event = req.body;
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  if (event.event === "payment.failed" && payment?.order_id) await PaymentAttempt.updateOne({razorpayOrderId: payment.order_id, status: "created"}, {$set: {status: "failed"}});
  if (event.event === "refund.processed" && refund?.payment_id) {
    const attempt = await PaymentAttempt.findOneAndUpdate({razorpayPaymentId: refund.payment_id}, {$set: {status: "refunded", refundId: refund.id, refundedAt: new Date()}}, {new: true});
    if (attempt?.order) await Order.updateOne({_id: attempt.order}, {$set: {"payment.status": "refunded", "payment.refundId": refund.id, "payment.refundedAt": new Date()}});
  }
  return reply.code(204).send();
};

export const refund = async (req, reply) => {
  const reference = req.params.reference;
  const attempt = await PaymentAttempt.findOne({$or: [{order: mongoose.isValidObjectId(reference) ? reference : null}, {_id: mongoose.isValidObjectId(reference) ? reference : null}], status: "paid"});
  if (!attempt) return reply.code(409).send({message: "Order is not eligible for refund"});
  try {
    attempt.status = "refund_pending"; await attempt.save();
    const result = await razorpay().payments.refund(attempt.razorpayPaymentId, {amount: Math.round(attempt.totalPrice * 100), notes: {reference}});
    attempt.refundId = result.id; await attempt.save();
    if (attempt.order) await Order.updateOne({_id: attempt.order}, {$set: {"payment.status": "refund_pending", "payment.refundId": result.id}});
    return reply.send({refundId: result.id, status: result.status});
  } catch { attempt.status = "paid"; await attempt.save(); return reply.code(502).send({message: "Refund request failed"}); }
};
