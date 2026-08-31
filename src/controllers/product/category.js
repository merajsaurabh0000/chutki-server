import Category from "../../models/category.js";
import { getNearbyCatalog, getQueryLocation, isDemoRequest } from "./product.js";

export const getAllCategories = async (req, reply) => {
  try {
    const location = getQueryLocation(req.query);
    if (location) {
      const isDemo = await isDemoRequest(req);
      const { products } = await getNearbyCatalog({ location, isDemo });
      const categoryIds = [
        ...new Set(products.flatMap(product => {
          const ids = Array.isArray(product.categories) ? product.categories : [];
          if (product.category) ids.push(product.category);
          return ids.map(category => String(category?._id || category)).filter(Boolean);
        })),
      ];
      if (!categoryIds.length) return reply.send([]);
      const categories = await Category.find({ _id: { $in: categoryIds } }).sort({ name: 1 });
      return reply.send(categories);
    }

    const categories = await Category.find();
    return reply.send(categories);
  } catch (error) {
    return reply.status(500).send({ message: "An error occurred", error });
  }
};
