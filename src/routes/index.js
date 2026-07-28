import { authRoutes } from "./auth.js";
import { orderRoutes } from "./order.js";
import { categoryRoutes, productRoutes } from "./products.js";
import { bannerRoutes } from "./banner.js";
import { paymentRoutes } from "./payment.js";
import { themeRoutes } from "./theme.js";
import { adminApiRoutes } from "./adminApi.js";

const prefix = "/api";

export const registerRoutes = async (fastify) => {
  fastify.register(authRoutes, { prefix: prefix });
  fastify.register(productRoutes, { prefix: prefix });
  fastify.register(categoryRoutes, { prefix: prefix });
  fastify.register(orderRoutes, { prefix: prefix });
  fastify.register(bannerRoutes, { prefix: prefix });
  fastify.register(paymentRoutes, { prefix: prefix });
  fastify.register(themeRoutes, { prefix: prefix });
  fastify.register(adminApiRoutes, { prefix: prefix });
};
