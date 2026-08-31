import { getAllCategories } from "../controllers/product/category.js";
import { getProductsByCategoryId, getAllProducts } from "../controllers/product/product.js";
import { submitProductReview, getProductReviews } from "../controllers/product/review.js";
import { verifyToken } from "../middleware/auth.js";

export const categoryRoutes = async (fastify, options) => {
  fastify.get("/categories", getAllCategories);
};

export const productRoutes = async (fastify, options) => {
  fastify.get("/products/:categoryId", getProductsByCategoryId);
  fastify.get("/products", getAllProducts);

  // Reviews
  fastify.get("/products/:id/reviews", getProductReviews);
  fastify.post("/products/:id/reviews", {
    preHandler: async (request, reply) => {
      const isAuthenticated = await verifyToken(request, reply);
      if (!isAuthenticated) return reply.code(401).send({ message: "Unauthorized" });
    }
  }, submitProductReview);
};
