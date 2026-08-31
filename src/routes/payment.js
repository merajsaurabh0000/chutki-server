import { checkoutQuote, createPayment, refund, verifyPayment, webhook } from "../controllers/payment/payment.js";
import { verifyToken } from "../middleware/auth.js";
import { verifyAdmin } from "../middleware/admin.js";

export const paymentRoutes = async fastify => {
  fastify.post("/checkout/quote", {preHandler: [verifyToken]}, checkoutQuote);
  fastify.post("/payments/razorpay/order", {preHandler: [verifyToken]}, createPayment);
  fastify.post("/payments/razorpay/verify", {preHandler: [verifyToken]}, verifyPayment);
  fastify.post("/payments/razorpay/webhook", {config: {rawBody: true}}, webhook);
  fastify.post("/admin/payments/:reference/refund", {preHandler: [verifyAdmin]}, refund);
};
