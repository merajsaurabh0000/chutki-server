import Review from "../../models/review.js";
import Product from "../../models/products.js";
import mongoose from "mongoose";

const updateProductAverageRating = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { product: productId, isApproved: true } },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        ratingsCount: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      averageRating: parseFloat(stats[0].averageRating.toFixed(1)),
      ratingsCount: stats[0].ratingsCount
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      averageRating: 0,
      ratingsCount: 0
    });
  }
};

export const submitProductReview = async (req, reply) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return reply.status(400).send({ message: "Rating must be between 1 and 5" });
  }

  try {
    const product = await Product.findById(id);
    if (!product) {
      return reply.status(404).send({ message: "Product not found" });
    }

    const customerId = req.user.userId;

    // Optional: check if customer has already reviewed this product, update it
    let review = await Review.findOne({ product: id, customer: customerId });
    if (review) {
      review.rating = rating;
      review.comment = comment || "";
      await review.save();
    } else {
      review = await Review.create({
        product: id,
        customer: customerId,
        rating,
        comment: comment || "",
        isApproved: true,
      });
    }

    // Recalculate average rating
    await updateProductAverageRating(product._id);

    return reply.send({ success: true, review });
  } catch (error) {
    return reply.status(500).send({ message: "An error occurred", error });
  }
};

export const getProductReviews = async (req, reply) => {
  const { id } = req.params;

  try {
    const reviews = await Review.find({ product: id, isApproved: true })
      .populate("customer", "name phone")
      .sort({ createdAt: -1 })
      .lean();

    return reply.send({
      reviews: reviews.map(r => ({
        id: String(r._id),
        customerName: r.customer?.name || "Customer",
        rating: r.rating,
        comment: r.comment || "",
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return reply.status(500).send({ message: "An error occurred", error });
  }
};
