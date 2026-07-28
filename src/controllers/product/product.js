import mongoose from "mongoose";
import Branch from "../../models/branch.js";
import Product from "../../models/products.js";
import VendorProduct from "../../models/vendorProduct.js";

const distanceKm = (a, b) => {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const getQueryLocation = query => {
  const latitude = Number(query?.latitude ?? query?.lat);
  const longitude = Number(query?.longitude ?? query?.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const toAppProduct = (vendorProduct, branch) => {
  const product = vendorProduct.product;
  const price = vendorProduct.price ?? product.price;
  const discountPrice = vendorProduct.discountPrice ?? product.discountPrice;

  return {
    ...product,
    _id: String(product._id),
    price,
    discountPrice,
    vendorPrice: price,
    vendorDiscountPrice: discountPrice ?? null,
    stock: vendorProduct.stock,
    isAvailable: vendorProduct.isAvailable,
    vendorId: String(vendorProduct.vendor),
    branchId: String(vendorProduct.branch),
    branchName: branch.name,
  };
};

export const getNearbyCatalog = async ({ location, categoryId }) => {
  const branches = await Branch.find({
    isActive: true,
    "location.latitude": { $ne: null },
    "location.longitude": { $ne: null },
  }).lean();

  const eligibleBranches = branches
    .map(branch => ({ branch, distance: distanceKm(branch.location, location) }))
    .filter(row => row.distance <= row.branch.deliveryRadiusKm)
    .sort((a, b) => a.distance - b.distance);

  if (!eligibleBranches.length) {
    return { products: [], branch: null };
  }

  let productIdsForCategory = null;
  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) return { products: [], branch: null };
    const categoryProducts = await Product.find({
      $or: [
        { category: categoryId },
        { categories: categoryId },
      ],
    }).select("_id").lean();
    productIdsForCategory = categoryProducts.map(product => product._id);
    if (!productIdsForCategory.length) return { products: [], branch: null };
  }

  for (const { branch } of eligibleBranches) {
    const filter = {
      branch: branch._id,
      isAvailable: true,
      stock: { $gt: 0 },
    };
    if (productIdsForCategory) filter.product = { $in: productIdsForCategory };

    const vendorProducts = await VendorProduct.find(filter)
      .populate("product")
      .sort({ updatedAt: -1 })
      .lean();

    const products = vendorProducts
      .filter(row => row.product)
      .map(row => toAppProduct(row, branch));

    if (products.length) {
      return { products, branch };
    }
  }

  return { products: [], branch: eligibleBranches[0]?.branch || null };
};

export const getProductsByCategoryId = async (req, reply) => {
  const { categoryId } = req.params;
  const location = getQueryLocation(req.query);

  try {
    if (location) {
      const { products } = await getNearbyCatalog({ location, categoryId });
      return reply.send(products);
    }

    const products = await Product.find({
      $or: [
        { category: categoryId },
        { categories: categoryId },
      ],
    })
      .select("-category")
      .exec();

    return reply.send(products);
  } catch (error) {
    return reply.status(500).send({ message: "An error occurred", error });
  }
};

export const getAllProducts = async (req, reply) => {
  try {
    const location = getQueryLocation(req.query);
    if (location) {
      const { products } = await getNearbyCatalog({ location });
      return reply.send(products);
    }

    const products = await Product.find().exec();
    return reply.send(products);
  } catch (error) {
    return reply.status(500).send({ message: "An error occurred", error });
  }
};
