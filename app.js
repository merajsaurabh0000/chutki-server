import "dotenv/config";
import mongoose from "mongoose";
import fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifySocketIO from "fastify-socket.io";
import rawBody from "fastify-raw-body";
import jwt from "jsonwebtoken";
import Order from "./src/models/order.js";
import { connectDB } from "./src/config/connect.js";
import { PORT, validateEnvironment } from "./src/config/config.js";
import { registerRoutes } from "./src/routes/index.js";
import { admin, buildAdminRouter } from "./src/config/setup.js";

validateEnvironment();
await connectDB(process.env.MONGO_URI);
const app = fastify({bodyLimit: 1024 * 1024, logger: {redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"]}});
const origins = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
await app.register(cors, {origin: process.env.NODE_ENV === "production" ? origins : true, credentials: true});
await app.register(rateLimit, {max: 120, timeWindow: "1 minute"});
await app.register(rawBody, {global: false, encoding: "utf8", runFirst: true});
await app.register(fastifySocketIO, {cors: {origin: process.env.NODE_ENV === "production" ? origins : true}, transports: ["websocket"]});
await registerRoutes(app);
await buildAdminRouter(app);
app.get("/health", async () => ({status: "ok"}));
app.get("/ready", async (_req, reply) => mongoose.connection.readyState === 1 ? {status: "ready"} : reply.code(503).send({status: "not_ready"}));

app.ready().then(() => {
  app.io.use((socket, next) => {
    try { socket.user = jwt.verify(socket.handshake.auth?.token, process.env.ACCESS_TOKEN_SECRET); next(); }
    catch { next(new Error("Unauthorized")); }
  });
  app.io.on("connection", socket => socket.on("joinRoom", async orderId => {
    const order = await Order.findById(orderId).lean();
    const allowed = order && (String(order.customer) === socket.user.userId || String(order.deliveryPartner) === socket.user.userId);
    if (allowed) socket.join(String(orderId));
  }));
});

const shutdown = async signal => { app.log.info({signal}, "shutting down"); await app.close(); await mongoose.disconnect(); process.exit(0); };
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

try { await app.listen({port: Number(PORT), host: "0.0.0.0"}); app.log.info(`Admin available at ${admin.options.rootPath}`); }
catch (error) { app.log.error(error); process.exit(1); }
