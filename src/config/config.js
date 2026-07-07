import fastifySession from "@fastify/session";
import ConnectMongoDBSession from "connect-mongodb-session";
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Admin } from "../models/index.js";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV !== "production") {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  dotenv.config({path: path.join(serverRoot, ".env.payment.local"), override: true});
}
export const PORT = process.env.PORT || 3000;
export const COOKIE_PASSWORD = process.env.COOKIE_PASSWORD;
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (process.env.NODE_ENV !== "production" && !process.env.GOOGLE_WEB_CLIENT_ID) {
  process.env.GOOGLE_WEB_CLIENT_ID = "932412605246-ujvolulp146rbhkes93h9u9j9lk1a11f.apps.googleusercontent.com";
}

export const validateEnvironment = () => {
  const required = ["MONGO_URI", "COOKIE_PASSWORD", "ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET", "MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "GOOGLE_WEB_CLIENT_ID"];
  if (process.env.NODE_ENV === "production") required.push("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "ADMIN_API_KEY");
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (process.env.NODE_ENV === "production" && [process.env.COOKIE_PASSWORD, process.env.ACCESS_TOKEN_SECRET, process.env.REFRESH_TOKEN_SECRET, process.env.ADMIN_API_KEY].some(value => value.length < 32)) throw new Error("Production secrets must contain at least 32 characters");
};

const MongoDBStore = ConnectMongoDBSession(fastifySession);

export const sessionStore = new MongoDBStore({
  uri: process.env.MONGO_URI,
  collection: "sessions",
});

sessionStore.on("error", (error) => {
  console.log("Session store error", error);
});

export const authenticate = async (email, password) => {
  try {
    // UNCOMMENT THIS WHEN CREATING ADMIN  FIRST TIME

    //   if (email && password) {
    //     if (email == "ritik@gmail.com" && password === "12345678") {
    //       return Promise.resolve({ email: email, password: password });
    //     } else {
    //       return null;
    //     }
    //   }

    // UNCOMMENT THIS WHEN ALREADY CREATED ADMIN ON DATABASE

    if (email && password) {
      const user = await Admin.findOne({ email: email.trim().toLowerCase(), isActivated: true }).select("+password");
      if (!user) {
        return null;
      }
      if (await bcrypt.compare(password, user.password)) {
        return Promise.resolve({ email: user.email });
      } else {
        return null;
      }
    }

    return null;
  } catch { return null; }
};
