import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Customer, DeliveryPartner } from "../../models/user.js";
import RefreshSession from "../../models/refreshSession.js";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const safeUser = user => {
  const value = user.toObject ? user.toObject() : { ...user };
  delete value.password;
  return value;
};
const getUser = async decoded => {
  const Model = decoded.role === "Customer" ? Customer : decoded.role === "DeliveryPartner" ? DeliveryPartner : null;
  return Model ? Model.findById(decoded.userId) : null;
};
const issueTokens = async user => {
  const payload = { userId: user._id.toString(), role: user.role };
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d", jwtid: crypto.randomUUID() });
  await RefreshSession.create({ userId: user._id, role: user.role, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + 7 * 86400000) });
  return { accessToken, refreshToken };
};

const otpCache = new Map();

export const sendOtp = async (req, reply) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(phone)) return reply.code(400).send({ message: "Valid Indian mobile number required" });

  // Generate random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Cache the OTP for 5 minutes
  otpCache.set(phone, { otp, expires: Date.now() + 5 * 60000 });

  try {
    const response = await fetch("https://api.zavu.dev/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.ZAVU_AUTH_TOKEN || "zv_live_9815951622c6611ba8236a4506d75c1000741bb208f7f160"}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: `+91${phone}`,
        channel: "whatsapp",
        text: `Your Haritgraam OTP is ${otp}. Valid for 5 minutes.`
      })
    });

    const data = await response.json();
    console.log(`Zavu Send OTP API response:`, data);

    if (!response.ok) {
      console.log(`Zavu Send OTP failed. Falling back to console OTP: ${otp}`);
    }
    return reply.send({ message: "OTP sent" });
  } catch (error) {
    console.log(`Zavu Send OTP connection error: ${error.message}. OTP is: ${otp}`);
    return reply.send({ message: "OTP sent" });
  }
};

export const loginCustomer = async (req, reply) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  const otp = String(req.body?.otp || "");
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(otp)) return reply.code(400).send({ message: "Invalid credentials" });

  // Developer Bypass
  if (otp === "123456") {
    const fcmToken = req.body?.fcmToken || null;
    try {
      let customer = await Customer.findOne({ phone: Number(phone) });
      if (!customer) {
        customer = await Customer.create({ phone: Number(phone), role: "Customer", isActivated: true, fcmToken });
      } else if (fcmToken) {
        customer.fcmToken = fcmToken;
        await customer.save();
      }
      if (!customer.isActivated) return reply.code(403).send({ message: "Account unavailable" });
      return reply.send({ message: "Login successful", ...(await issueTokens(customer)), customer: safeUser(customer) });
    } catch (err) {
      return reply.code(500).send({ message: "Login failed" });
    }
  }

  // Zavu OTP Verification from Local Memory Cache
  const cachedOtpRecord = otpCache.get(phone);
  if (!cachedOtpRecord) {
    return reply.code(401).send({ message: "OTP expired or not sent" });
  }

  if (cachedOtpRecord.expires < Date.now()) {
    otpCache.delete(phone);
    return reply.code(401).send({ message: "OTP expired" });
  }

  if (cachedOtpRecord.otp !== otp) {
    return reply.code(401).send({ message: "Invalid OTP" });
  }

  // Clear OTP from memory cache after successful verification
  otpCache.delete(phone);

  try {
    const fcmToken = req.body?.fcmToken || null;
    let customer = await Customer.findOne({ phone: Number(phone) });
    if (!customer) {
      customer = await Customer.create({ phone: Number(phone), role: "Customer", isActivated: true, fcmToken });
    } else if (fcmToken) {
      customer.fcmToken = fcmToken;
      await customer.save();
    }
    if (!customer.isActivated) return reply.code(403).send({ message: "Account unavailable" });
    return reply.send({ message: "Login successful", ...(await issueTokens(customer)), customer: safeUser(customer) });
  } catch {
    return reply.code(500).send({ message: "Login failed" });
  }
};

export const loginDeliveryPartner = async (req, reply) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const fcmToken = req.body?.fcmToken || null;
  const user = await DeliveryPartner.findOne({ email }).select("+password");
  if (!user || !user.isActivated || !(await user.verifyPassword(password))) return reply.code(401).send({ message: "Invalid credentials" });

  if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save();
  }
  return reply.send({ message: "Login successful", ...(await issueTokens(user)), deliveryPartner: safeUser(user) });
};

export const refreshToken = async (req, reply) => {
  const oldToken = req.body?.refreshToken;
  if (!oldToken) return reply.code(401).send({ message: "Refresh token required" });
  try {
    const decoded = jwt.verify(oldToken, process.env.REFRESH_TOKEN_SECRET);
    const session = await RefreshSession.findOne({ tokenHash: hash(oldToken), revokedAt: null });
    const user = await getUser(decoded);
    if (!session || !user?.isActivated) return reply.code(401).send({ message: "Invalid refresh token" });
    session.revokedAt = new Date(); await session.save();
    return reply.send(await issueTokens(user));
  } catch { return reply.code(401).send({ message: "Invalid refresh token" }); }
};

export const logout = async (req, reply) => {
  if (req.body?.refreshToken) await RefreshSession.updateOne({ tokenHash: hash(req.body.refreshToken) }, { $set: { revokedAt: new Date() } });
  return reply.code(204).send();
};

export const fetchUser = async (req, reply) => {
  const user = await getUser(req.user);
  if (!user?.isActivated) return reply.code(404).send({ message: "User unavailable" });
  return reply.send({ message: "User fetched", user: safeUser(user) });
};

export const googleLogin = async (req, reply) => {
  if (!req.body?.id_token) return reply.code(400).send({ message: "ID token required" });
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(req.body.id_token)}`);
    const data = await response.json();
    if (!response.ok || !data.email_verified || data.aud !== process.env.GOOGLE_WEB_CLIENT_ID) return reply.code(401).send({ message: "Invalid credentials" });
    let customer = await Customer.findOne({ $or: [{ email: data.email.toLowerCase() }, { socialId: data.sub }] });
    if (!customer) customer = new Customer({ email: data.email.toLowerCase(), name: data.name, picture: data.picture, socialId: data.sub, isActivated: true });
    if (!customer.isActivated) return reply.code(403).send({ message: "Account unavailable" });
    Object.assign(customer, { email: data.email.toLowerCase(), name: data.name || customer.name, picture: data.picture || customer.picture, socialId: data.sub });
    await customer.save();
    return reply.send({ message: "Login successful", ...(await issueTokens(customer)), customer: safeUser(customer) });
  } catch { return reply.code(500).send({ message: "Login failed" }); }
};
