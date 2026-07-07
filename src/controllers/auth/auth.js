import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Customer, DeliveryPartner } from "../../models/user.js";
import RefreshSession from "../../models/refreshSession.js";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const safeUser = user => {
  const value = user.toObject ? user.toObject() : {...user};
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

export const sendOtp = async (req, reply) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!/^[6-9]\d{9}$/.test(phone)) return reply.code(400).send({message: "Valid Indian mobile number required"});
  try {
    const response = await fetch(`https://control.msg91.com/api/v5/otp?mobile=91${phone}&template_id=${encodeURIComponent(process.env.MSG91_TEMPLATE_ID)}`, { headers: { authkey: process.env.MSG91_AUTH_KEY } });
    const data = await response.json();
    if (!response.ok || data.type === "error") return reply.code(502).send({message: "Unable to send OTP"});
    return reply.send({message: "OTP sent"});
  } catch { return reply.code(502).send({message: "Unable to send OTP"}); }
};

export const loginCustomer = async (req, reply) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  const otp = String(req.body?.otp || "");
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(otp)) return reply.code(400).send({message: "Invalid credentials"});
  try {
    const response = await fetch(`https://control.msg91.com/api/v5/otp/verify?otp=${otp}&mobile=91${phone}`, { headers: { authkey: process.env.MSG91_AUTH_KEY } });
    const data = await response.json();
    if (!response.ok || data.type === "error") return reply.code(401).send({message: "Invalid credentials"});
    let customer = await Customer.findOne({phone: Number(phone)});
    if (!customer) customer = await Customer.create({phone: Number(phone), role: "Customer", isActivated: true});
    if (!customer.isActivated) return reply.code(403).send({message: "Account unavailable"});
    return reply.send({message: "Login successful", ...(await issueTokens(customer)), customer: safeUser(customer)});
  } catch { return reply.code(500).send({message: "Login failed"}); }
};

export const loginDeliveryPartner = async (req, reply) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = await DeliveryPartner.findOne({email}).select("+password");
  if (!user || !user.isActivated || !(await user.verifyPassword(password))) return reply.code(401).send({message: "Invalid credentials"});
  return reply.send({message: "Login successful", ...(await issueTokens(user)), deliveryPartner: safeUser(user)});
};

export const refreshToken = async (req, reply) => {
  const oldToken = req.body?.refreshToken;
  if (!oldToken) return reply.code(401).send({message: "Refresh token required"});
  try {
    const decoded = jwt.verify(oldToken, process.env.REFRESH_TOKEN_SECRET);
    const session = await RefreshSession.findOne({tokenHash: hash(oldToken), revokedAt: null});
    const user = await getUser(decoded);
    if (!session || !user?.isActivated) return reply.code(401).send({message: "Invalid refresh token"});
    session.revokedAt = new Date(); await session.save();
    return reply.send(await issueTokens(user));
  } catch { return reply.code(401).send({message: "Invalid refresh token"}); }
};

export const logout = async (req, reply) => {
  if (req.body?.refreshToken) await RefreshSession.updateOne({tokenHash: hash(req.body.refreshToken)}, {$set: {revokedAt: new Date()}});
  return reply.code(204).send();
};

export const fetchUser = async (req, reply) => {
  const user = await getUser(req.user);
  if (!user?.isActivated) return reply.code(404).send({message: "User unavailable"});
  return reply.send({message: "User fetched", user: safeUser(user)});
};

export const googleLogin = async (req, reply) => {
  if (!req.body?.id_token) return reply.code(400).send({message: "ID token required"});
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(req.body.id_token)}`);
    const data = await response.json();
    if (!response.ok || !data.email_verified || data.aud !== process.env.GOOGLE_WEB_CLIENT_ID) return reply.code(401).send({message: "Invalid credentials"});
    let customer = await Customer.findOne({$or: [{email: data.email.toLowerCase()}, {socialId: data.sub}]});
    if (!customer) customer = new Customer({email: data.email.toLowerCase(), name: data.name, picture: data.picture, socialId: data.sub, isActivated: true});
    if (!customer.isActivated) return reply.code(403).send({message: "Account unavailable"});
    Object.assign(customer, {email: data.email.toLowerCase(), name: data.name || customer.name, picture: data.picture || customer.picture, socialId: data.sub});
    await customer.save();
    return reply.send({message: "Login successful", ...(await issueTokens(customer)), customer: safeUser(customer)});
  } catch { return reply.code(500).send({message: "Login failed"}); }
};
