import crypto from "node:crypto";

export const verifyAdmin = async (req, reply) => {
  const supplied = Buffer.from(String(req.headers["x-admin-api-key"] || ""));
  const expected = Buffer.from(String(process.env.ADMIN_API_KEY || ""));
  if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return reply.code(401).send({message: "Unauthorized"});
  req.adminId = "system";
};
