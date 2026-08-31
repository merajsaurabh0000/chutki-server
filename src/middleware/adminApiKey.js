export const requireAdminApiKey = async (request, reply) => {
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey && process.env.NODE_ENV !== "production") {
    return;
  }

  const providedKey = request.headers["x-admin-api-key"];

  if (!configuredKey || providedKey !== configuredKey) {
    return reply.code(401).send({ message: "Unauthorized" });
  }
};
