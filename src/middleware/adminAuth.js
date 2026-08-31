import jwt from "jsonwebtoken";
import { Admin, AdminUser } from "../models/index.js";

export const issueAdminToken = admin => {
  const payload = {
    userId: admin._id.toString(),
    role: admin.role === "Admin" ? "super_admin" : admin.role,
    accountType: admin.role === "Admin" ? "legacy_admin" : "admin_user",
    vendorId: admin.vendor ? admin.vendor.toString() : undefined,
    scope: "custom-admin",
  };

  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "8h" });
};

export const safeAdmin = admin => ({
  id: admin._id.toString(),
  name: admin.name,
  email: admin.email,
  role: admin.role === "Admin" ? "super_admin" : admin.role,
  vendorId: admin.vendor ? admin.vendor.toString() : undefined,
});

export const requireSuperAdmin = async (request, reply) => {
  if (request.admin?.role !== "super_admin") {
    return reply.code(403).send({ message: "Super admin access required" });
  }
};

export const requireAdminToken = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ message: "Admin token required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.scope !== "custom-admin") {
      return reply.code(403).send({ message: "Admin access required" });
    }

    const isLegacyAdmin = decoded.accountType === "legacy_admin";
    const admin = isLegacyAdmin
      ? await Admin.findById(decoded.userId).select("name email role isActivated")
      : await AdminUser.findById(decoded.userId).select("name email role vendor isActive");

    const active = isLegacyAdmin ? admin?.isActivated : admin?.isActive;

    if (!active) {
      return reply.code(401).send({ message: "Admin account unavailable" });
    }

    request.admin = safeAdmin(admin);
  } catch {
    return reply.code(403).send({ message: "Invalid or expired admin token" });
  }
};
