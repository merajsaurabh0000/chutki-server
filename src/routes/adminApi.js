import * as Models from "../models/index.js";
import crypto from "node:crypto";
import {
  issueAdminToken,
  requireAdminToken,
  requireSuperAdmin,
  safeAdmin,
} from "../middleware/adminAuth.js";
import { toThemeDto } from "../utils/themeDto.js";
import { CLOUDINARY_CLOUD_NAME } from "../config/config.js";
import cloudinary from "../config/cloudinary.js";
import { refund } from "../controllers/payment/payment.js";
import AdmZip from "adm-zip";

const encodeCloudinaryKey = imageKey => encodeURI(imageKey);
const withoutFileExtension = key => key.replace(/\.[^./]+$/, "");
const allowedImageMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/x-webp"]);
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

const isAllowedImageFile = file => {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = String(file?.filename || "").split(".").pop()?.toLowerCase() || "";

  return allowedImageMimeTypes.has(mimeType) || allowedImageExtensions.has(extension);
};

const toBannerDto = banner => ({
  id: String(banner._id),
  title: banner.title,
  isActive: banner.isActive,
  sortOrder: banner.sortOrder,
  imageKey: banner.imageKey,
  image: banner.imageKey
    ? `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encodeCloudinaryKey(banner.imageKey)}`
    : null,
  createdAt: banner.createdAt,
  updatedAt: banner.updatedAt,
});

const toVendorDto = vendor => ({
  id: String(vendor._id),
  name: vendor.name,
  ownerName: vendor.ownerName || "",
  email: vendor.email || "",
  phone: vendor.phone || "",
  address: vendor.address || "",
  location: {
    latitude: vendor.location?.latitude ?? null,
    longitude: vendor.location?.longitude ?? null,
  },
  serviceRadiusKm: vendor.serviceRadiusKm ?? 10,
  isActive: vendor.isActive,
  createdAt: vendor.createdAt,
  updatedAt: vendor.updatedAt,
});

const toAdminUserDto = user => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  vendorId: user.vendor ? String(user.vendor) : undefined,
  isActive: user.isActive,
});

const toCategoryDto = category => ({
  id: String(category._id),
  name: category.name,
  image: category.image,
});

const toProductDto = product => ({
  id: String(product._id),
  name: product.name,
  brand: product.brand || "",
  description: product.description || "",
  subCategory: product.subCategory || "",
  breadcrumbs: product.breadcrumbs || "",
  source: product.source || "",
  image: product.image,
  price: product.price,
  discountPrice: product.discountPrice ?? null,
  quantity: product.quantity,
  categoryId: product.category?._id ? String(product.category._id) : String(product.category || ""),
  categoryName: product.category?.name || "",
  categoryIds: Array.isArray(product.categories)
    ? product.categories.map(category => category?._id ? String(category._id) : String(category)).filter(Boolean)
    : product.category ? [String(product.category?._id || product.category)] : [],
  categoryNames: Array.isArray(product.categories)
    ? product.categories.map(category => category?.name).filter(Boolean)
    : product.category?.name ? [product.category.name] : [],
  vendorId: product.vendor ? String(product.vendor) : undefined,
});

const normalizeImportKey = key => String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const getImportValue = (row, keys) => {
  const normalizedRow = Object.entries(row || {}).reduce((record, [key, value]) => {
    record[normalizeImportKey(key)] = value;
    return record;
  }, {});

  for (const key of keys) {
    const value = normalizedRow[normalizeImportKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
};

const parseMoney = value => {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : NaN;
};

const normalizeProductImportRow = row => ({
  name: getImportValue(row, ["name", "productName", "product"]),
  brand: getImportValue(row, ["brand", "manufacturer", "company"]),
  image: getImportValue(row, ["image", "imageUrl", "image_url", "img", "photo", "picture", "thumbnail"]),
  price: parseMoney(getImportValue(row, ["price", "mrp", "defaultPrice"])),
  discountPrice: (() => {
    const value = getImportValue(row, ["discountPrice", "discountedPrice", "salePrice", "sellingPrice"]);
    return value ? parseMoney(value) : undefined;
  })(),
  quantity: getImportValue(row, ["quantity", "weight", "size", "packSize", "unit"]),
  categoryId: getImportValue(row, ["categoryId"]),
  categoryName: getImportValue(row, ["category", "categoryName"]),
  subCategory: getImportValue(row, ["subCategory", "subcategory"]),
  description: getImportValue(row, ["description", "details"]),
  breadcrumbs: getImportValue(row, ["breadcrumbs", "breadCrumbs", "breadcrumb"]),
  sourceId: getImportValue(row, ["id", "productId", "sku", "barcode"]),
});

const normalizeDuplicateKey = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const escapeRegex = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isObjectIdLike = value => /^[a-f\d]{24}$/i.test(String(value || ""));

const normalizeProductListQuery = query => {
  const page = Math.max(Number.parseInt(query?.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query?.limit, 10) || 6, 5), 100);
  const search = String(query?.search || "").trim().slice(0, 80);
  const categoryId = String(query?.categoryId || "").trim();
  const availability = String(query?.availability || "all").trim();

  return {
    page,
    limit,
    search,
    categoryId: isObjectIdLike(categoryId) ? categoryId : "",
    availability: ["all", "available", "unavailable"].includes(availability) ? availability : "all",
  };
};

const toVendorCatalogProductDto = (product, vendorProduct) => ({
  ...toProductDto(product),
  vendorProductId: vendorProduct?._id ? String(vendorProduct._id) : null,
  vendorPrice: vendorProduct?.price ?? product.price,
  vendorDiscountPrice: vendorProduct?.discountPrice ?? product.discountPrice ?? null,
  stock: vendorProduct?.stock ?? 0,
  isAvailable: vendorProduct?.isAvailable ?? false,
  branchId: vendorProduct?.branch ? String(vendorProduct.branch) : "",
});

const toDeliveryPartnerDto = partner => ({
  id: String(partner._id),
  name: partner.name || "",
  email: partner.email,
  phone: partner.phone,
  address: partner.address || "",
  isActivated: partner.isActivated,
  branchId: partner.branch?._id ? String(partner.branch._id) : partner.branch ? String(partner.branch) : "",
  branchName: partner.branch?.name || "",
  vendorId: partner.vendor ? String(partner.vendor) : undefined,
});

const toOrderDto = order => ({
  id: String(order._id),
  orderId: order.orderId,
  status: order.status,
  totalPrice: order.totalPrice,
  itemTotal: order.itemTotal,
  deliveryCharge: order.deliveryCharge,
  handlingCharge: order.handlingCharge,
  surgeCharge: order.surgeCharge,
  customerName: order.customer?.name || "",
  customerPhone: order.customer?.phone || "",
  branchName: order.branch?.name || "",
  deliveryPartnerName: order.deliveryPartner?.name || "",
  vendorId: order.vendor ? String(order.vendor) : undefined,
  items: (order.items || []).map(item => ({
    id: String(item.id || item.item?._id || item.item),
    name: item.name || item.item?.name || "",
    count: item.count,
    quantity: item.quantity || item.item?.quantity || "",
    unitPrice: item.unitPrice,
  })),
  createdAt: order.createdAt,
});

const toBranchDto = branch => ({
  id: String(branch._id),
  name: branch.name,
  vendorId: branch.vendor?._id ? String(branch.vendor._id) : branch.vendor ? String(branch.vendor) : "",
  vendorName: branch.vendor?.name || "",
  address: branch.address || "",
  location: {
    latitude: branch.location?.latitude ?? null,
    longitude: branch.location?.longitude ?? null,
  },
  deliveryRadiusKm: branch.deliveryRadiusKm,
  isActive: branch.isActive,
  deliveryCharge: branch.deliveryCharge,
  handlingCharge: branch.handlingCharge,
  surgeCharge: branch.surgeCharge,
  surgeEnabled: branch.surgeEnabled,
  freeDeliveryThreshold: branch.freeDeliveryThreshold,
});

const toCustomerDto = customer => ({
  id: String(customer._id),
  name: customer.name || "",
  phone: customer.phone || "",
  email: customer.email || "",
  address: customer.address || "",
  isActivated: customer.isActivated,
  picture: customer.picture || "",
  location: {
    latitude: customer.liveLocation?.latitude ?? null,
    longitude: customer.liveLocation?.longitude ?? null,
  },
});

const toPaymentAttemptDto = attempt => ({
  id: String(attempt._id),
  razorpayOrderId: attempt.razorpayOrderId,
  razorpayPaymentId: attempt.razorpayPaymentId || "",
  status: attempt.status,
  totalPrice: attempt.totalPrice,
  currency: attempt.currency,
  customerName: attempt.customer?.name || "",
  customerPhone: attempt.customer?.phone || "",
  branchName: attempt.branch?.name || "",
  orderId: attempt.order?.orderId || "",
  orderMongoId: attempt.order?._id ? String(attempt.order._id) : attempt.order ? String(attempt.order) : "",
  refundId: attempt.refundId || "",
  refundedAt: attempt.refundedAt,
  expiresAt: attempt.expiresAt,
  createdAt: attempt.createdAt,
});

const normalizeBranchPayload = body => {
  const latitude = Number(body?.latitude ?? body?.location?.latitude);
  const longitude = Number(body?.longitude ?? body?.location?.longitude);

  return {
    name: String(body?.name || "").trim(),
    vendor: String(body?.vendorId || body?.vendor || "").trim(),
    address: String(body?.address || "").trim(),
    location: {
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
    },
    deliveryRadiusKm: Number(body?.deliveryRadiusKm || 10),
    isActive: body?.isActive === false ? false : true,
    deliveryCharge: Number(body?.deliveryCharge ?? 29),
    handlingCharge: Number(body?.handlingCharge ?? 2),
    surgeCharge: Number(body?.surgeCharge ?? 3),
    surgeEnabled: Boolean(body?.surgeEnabled),
    freeDeliveryThreshold: Number(body?.freeDeliveryThreshold ?? 499),
  };
};

const normalizeCategoryPayload = body => ({
  name: String(body?.name || "").trim(),
  image: String(body?.image || "").trim(),
});

const getKaggleAuthHeader = () => {
  const username = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY || process.env.KAGGLE_API_TOKEN;

  if (!username || !key) return null;

  return `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}`;
};

const parseCsvPreview = (csvText, limit = 20) => {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;
  const rowLimit = Math.min(Math.max(Number(limit) || 20, 1), 500);

  for (let index = 0; index < csvText.length && rows.length < rowLimit + 1; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;

  return {
    headers: headers.map(header => header.trim()),
    limit: rowLimit,
    rows: dataRows.slice(0, rowLimit).map(values =>
      headers.reduce((record, header, index) => {
        record[header.trim() || `column_${index + 1}`] = values[index] || "";
        return record;
      }, {}),
    ),
  };
};

const getVendorFilter = request => (
  request.admin.role === "super_admin" ? {} : { vendor: request.admin.vendorId }
);

const getRequiredVendorId = (request, reply) => {
  if (request.admin.role === "super_admin") {
    const vendorId = String(request.body?.vendorId || request.query?.vendorId || "");
    return vendorId || null;
  }

  if (!request.admin.vendorId) {
    reply.code(403).send({ message: "Vendor account is not linked to a vendor" });
    return undefined;
  }

  return request.admin.vendorId;
};

const ensureVendorScopedBranch = async (branchId, vendorId) => {
  if (!branchId) return null;
  return Models.Branch.findOne({ _id: branchId, vendor: vendorId });
};

const normalizeVendorPayload = body => {
  const latitude = Number(body?.latitude ?? body?.location?.latitude);
  const longitude = Number(body?.longitude ?? body?.location?.longitude);
  const serviceRadiusKm = Number(body?.serviceRadiusKm);

  return {
    name: String(body?.name || "").trim(),
    ownerName: String(body?.ownerName || "").trim(),
    email: String(body?.email || "").trim().toLowerCase(),
    phone: String(body?.phone || "").trim(),
    address: String(body?.address || "").trim(),
    password: String(body?.password || ""),
    isActive: body?.isActive === false ? false : true,
    location: {
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
    },
    serviceRadiusKm: Number.isFinite(serviceRadiusKm) && serviceRadiusKm > 0 ? serviceRadiusKm : 10,
  };
};

const getDashboardData = async request => {
  if (request.admin.role !== "super_admin") {
    const vendor = request.admin.vendorId
      ? await Models.Vendor.findById(request.admin.vendorId).lean()
      : null;

    if (!vendor) {
      return {
        stats: {
          orders: 0,
          customers: 0,
          products: 0,
          vendors: 0,
          activeBanners: 0,
          deliveryPartners: 0,
          branches: 0,
          revenue: 0,
        },
        activeTheme: null,
        vendor: null,
      };
    }

    const [orders, products, deliveryPartners, branches, primaryBranch, revenue] = await Promise.all([
      Models.Order.countDocuments({ vendor: vendor._id }),
      Models.VendorProduct.countDocuments({ vendor: vendor._id, isAvailable: true }),
      Models.DeliveryPartner.countDocuments({ vendor: vendor._id }),
      Models.Branch.countDocuments({ vendor: vendor._id }),
      Models.Branch.findOne({ vendor: vendor._id, isActive: true }).sort({ createdAt: 1 }).lean(),
      Models.Order.aggregate([
        { $match: { vendor: vendor._id, status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$totalPrice", 0] } } } },
      ]),
    ]);

    return {
      stats: {
        orders,
        customers: 0,
        products,
        vendors: 0,
        activeBanners: 0,
        deliveryPartners,
        branches,
        revenue: revenue[0]?.total ?? 0,
      },
      activeTheme: null,
      vendor: toVendorDto(vendor),
      primaryBranch: primaryBranch ? toBranchDto(primaryBranch) : null,
    };
  }

  const [orders, customers, products, vendors, banners, activeTheme, revenue] =
    await Promise.all([
      Models.Order.countDocuments(),
      Models.Customer.countDocuments(),
      Models.Product.countDocuments(),
      Models.Vendor.countDocuments(),
      Models.Banner.countDocuments({ isActive: true }),
      Models.Theme.findOne({ isActive: true }).sort({ priority: -1, updatedAt: -1 }).lean(),
      Models.Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$totalPrice", 0] } } } },
      ]),
    ]);

  return {
    stats: {
      orders,
      customers,
      products,
      vendors,
      activeBanners: banners,
      deliveryPartners: 0,
      branches: 0,
      revenue: revenue[0]?.total ?? 0,
    },
    activeTheme: activeTheme ? toThemeDto(activeTheme) : null,
  };
};

const uploadBannerFile = async (file, bannerId) => {
  const extension = file.filename?.includes(".")
    ? `.${file.filename.split(".").pop().toLowerCase()}`
    : "";
  const publicId = `banners/${bannerId}/banner${extension}`;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: withoutFileExtension(publicId),
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    file.file.on("error", reject);
    file.file.pipe(upload);
  });
};

const uploadProductFile = async file => {
  const extension = file.filename?.includes(".")
    ? `.${file.filename.split(".").pop().toLowerCase()}`
    : "";
  const publicId = `products/${crypto.randomUUID()}${extension}`;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: withoutFileExtension(publicId),
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    file.file.on("error", reject);
    file.file.pipe(upload);
  });
};

const uploadCategoryFile = async file => {
  const extension = file.filename?.includes(".")
    ? `.${file.filename.split(".").pop().toLowerCase()}`
    : "";
  const publicId = `categories/${crypto.randomUUID()}${extension}`;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: withoutFileExtension(publicId),
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    file.file.on("error", reject);
    file.file.pipe(upload);
  });
};

const uploadCategoryBuffer = async ({ buffer, filename }) => {
  const extension = filename?.includes(".")
    ? `.${filename.split(".").pop().toLowerCase()}`
    : "";
  const publicId = `categories/${crypto.randomUUID()}${extension}`;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: withoutFileExtension(publicId),
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    upload.end(buffer);
  });
};

const deleteBannerFile = async imageKey => {
  if (!imageKey) return;
  await cloudinary.uploader.destroy(withoutFileExtension(imageKey), {
    resource_type: "image",
  });
};

const themeFields = [
  "name",
  "slug",
  "isActive",
  "priority",
  "startDate",
  "endDate",
  "primaryColor",
  "headerGradientStart",
  "headerGradientEnd",
  "backgroundColor",
  "stickySearchBackground",
  "sectionTitleColor",
  "categoryTileBackground",
  "productCardBackground",
  "productCardBorder",
  "productBadgeBackground",
];

const normalizeThemePayload = body => {
  const payload = {};

  for (const field of themeFields) {
    if (body?.[field] !== undefined) {
      payload[field] = body[field];
    }
  }

  for (const field of ["name", "slug"]) {
    if (typeof payload[field] === "string") {
      payload[field] = payload[field].trim();
    }
  }

  for (const field of ["priority"]) {
    if (payload[field] !== undefined) {
      payload[field] = Number(payload[field] || 0);
    }
  }

  for (const field of ["startDate", "endDate"]) {
    if (payload[field] === "") {
      payload[field] = null;
    }
  }

  return payload;
};

export const adminApiRoutes = async fastify => {
  fastify.post("/admin/auth/login", async (request, reply) => {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    const adminUser = await Models.AdminUser.findOne({ email }).select("+password");

    if (adminUser) {
      if (!adminUser.isActive || !(await adminUser.verifyPassword(password))) {
        return reply.code(401).send({ message: "Invalid credentials" });
      }

      return {
        token: issueAdminToken(adminUser),
        admin: safeAdmin(adminUser),
      };
    }

    const admin = await Models.Admin.findOne({ email }).select("+password");

    if (!admin || !admin.isActivated || !(await admin.verifyPassword(password))) {
      return reply.code(401).send({ message: "Invalid credentials" });
    }

    return {
      token: issueAdminToken(admin),
      admin: safeAdmin(admin),
    };
  });

  fastify.get("/admin/me", { preHandler: [requireAdminToken] }, async request => ({
    admin: request.admin,
  }));

  fastify.get("/admin/dashboard", { preHandler: [requireAdminToken] }, async request => {
    return getDashboardData(request);
  });

  fastify.get(
    "/admin/vendors",
    { preHandler: [requireAdminToken, requireSuperAdmin] },
    async () => {
      const vendors = await Models.Vendor.find().sort({ createdAt: -1 }).lean();
      const owners = await Models.AdminUser.find({
        role: "vendor_owner",
        vendor: { $in: vendors.map(vendor => vendor._id) },
      }).lean();
      const ownerByVendor = new Map(
        owners.map(owner => [String(owner.vendor), toAdminUserDto(owner)]),
      );

      return {
        vendors: vendors.map(vendor => ({
          ...toVendorDto(vendor),
          ownerUser: ownerByVendor.get(String(vendor._id)) || null,
        })),
      };
    },
  );

  fastify.post(
    "/admin/vendors",
    { preHandler: [requireAdminToken, requireSuperAdmin] },
    async (request, reply) => {
      const payload = normalizeVendorPayload(request.body);
      const { name, ownerName, email, phone, address, password } = payload;

      if (!name) {
        return reply.code(400).send({ message: "Vendor name is required" });
      }

      if (payload.location.latitude == null || payload.location.longitude == null) {
        return reply.code(400).send({ message: "Vendor latitude and longitude are required" });
      }

      if (password && password.length < 8) {
        return reply.code(400).send({ message: "Owner password must be at least 8 characters" });
      }

      const vendor = await Models.Vendor.create({
        name,
        ownerName,
        email,
        phone,
        address,
        location: payload.location,
        serviceRadiusKm: payload.serviceRadiusKm,
        isActive: payload.isActive,
      });

      let ownerUser = null;

      let defaultBranch = null;

      try {
        defaultBranch = await Models.Branch.create({
          name: `${name} Main Branch`,
          vendor: vendor._id,
          location: payload.location,
          address,
          deliveryRadiusKm: payload.serviceRadiusKm,
          isActive: vendor.isActive,
        });

        if (email && password) {
          ownerUser = await Models.AdminUser.create({
            name: ownerName || name,
            email,
            password,
            role: "vendor_owner",
            vendor: vendor._id,
            isActive: vendor.isActive,
          });
        }

        return {
          vendor: {
            ...toVendorDto(vendor),
            ownerUser: ownerUser ? toAdminUserDto(ownerUser) : null,
          },
        };
      } catch (error) {
        if (defaultBranch) await defaultBranch.deleteOne();
        await vendor.deleteOne();

        if (error.code === 11000) {
          return reply.code(409).send({ message: "Owner email already exists" });
        }

        throw error;
      }
    },
  );

  fastify.put(
    "/admin/vendors/:vendorId",
    { preHandler: [requireAdminToken, requireSuperAdmin] },
    async (request, reply) => {
      const { vendorId } = request.params;
      const vendor = await Models.Vendor.findById(vendorId);

      if (!vendor) {
        return reply.code(404).send({ message: "Vendor not found" });
      }

      const payload = normalizeVendorPayload(request.body);

      for (const field of ["name", "ownerName", "email", "phone", "address"]) {
        if (request.body?.[field] !== undefined) {
          vendor[field] = payload[field];
        }
      }

      if (request.body?.latitude !== undefined || request.body?.location?.latitude !== undefined) {
        vendor.location ??= {};
        vendor.location.latitude = payload.location.latitude;
      }

      if (request.body?.longitude !== undefined || request.body?.location?.longitude !== undefined) {
        vendor.location ??= {};
        vendor.location.longitude = payload.location.longitude;
      }

      if (request.body?.serviceRadiusKm !== undefined) {
        vendor.serviceRadiusKm = payload.serviceRadiusKm;
      }

      if (typeof request.body?.isActive === "boolean") {
        vendor.isActive = request.body.isActive;
        await Models.AdminUser.updateMany(
          { vendor: vendor._id },
          { $set: { isActive: request.body.isActive } },
        );
      }

      await vendor.save();

      const ownerUser = await Models.AdminUser.findOne({
        role: "vendor_owner",
        vendor: vendor._id,
      }).lean();

      return {
        vendor: {
          ...toVendorDto(vendor),
          ownerUser: ownerUser ? toAdminUserDto(ownerUser) : null,
        },
      };
    },
  );

  fastify.delete(
    "/admin/vendors/:vendorId",
    { preHandler: [requireAdminToken, requireSuperAdmin] },
    async (request, reply) => {
      const { vendorId } = request.params;
      const vendor = await Models.Vendor.findById(vendorId);

      if (!vendor) {
        return reply.code(404).send({ message: "Vendor not found" });
      }

      await Models.AdminUser.updateMany(
        { vendor: vendor._id },
        { $set: { isActive: false } },
      );
      await vendor.deleteOne();
      return reply.code(204).send();
    },
  );

  fastify.get("/admin/categories", { preHandler: [requireAdminToken] }, async () => {
    const categories = await Models.Category.find().sort({ name: 1 }).lean();
    return { categories: categories.map(toCategoryDto) };
  });

  fastify.post("/admin/categories/upload-image", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const filename = String(request.body?.filename || "").trim();
    const mimeType = String(request.body?.mimeType || "").trim();
    const imageData = String(request.body?.imageData || "").trim();

    if (!imageData) return reply.code(400).send({ message: "Category image is required" });
    if (!isAllowedImageFile({ filename, mimetype: mimeType })) {
      return reply.code(400).send({ message: "Only JPEG, PNG and WebP images are allowed" });
    }

    const base64 = imageData.includes(",") ? imageData.split(",").pop() : imageData;
    const buffer = Buffer.from(base64, "base64");

    if (!buffer.length) return reply.code(400).send({ message: "Invalid category image" });

    const result = await uploadCategoryBuffer({ buffer, filename });
    const imageKey = `${result.public_id}.${result.format}`;
    return {
      imageKey,
      image: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encodeCloudinaryKey(imageKey)}`,
    };
  });

  fastify.post("/admin/categories", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const payload = normalizeCategoryPayload(request.body);
    if (!payload.name) {
      return reply.code(400).send({ message: "Category name is required" });
    }
    const category = await Models.Category.create(payload);
    return { category: toCategoryDto(category) };
  });

  fastify.put("/admin/categories/:categoryId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const payload = normalizeCategoryPayload(request.body);
    if (!payload.name) {
      return reply.code(400).send({ message: "Category name is required" });
    }
    const category = await Models.Category.findByIdAndUpdate(
      request.params.categoryId,
      { $set: payload },
      { new: true, runValidators: true },
    );
    if (!category) return reply.code(404).send({ message: "Category not found" });
    return { category: toCategoryDto(category) };
  });

  fastify.delete("/admin/categories/:categoryId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const inUse = await Models.Product.exists({
      $or: [
        { category: request.params.categoryId },
        { categories: request.params.categoryId },
      ],
    });
    if (inUse) {
      return reply.code(409).send({
        message: "Category is used by products. Remove or move those products before deleting it.",
      });
    }
    const category = await Models.Category.findById(request.params.categoryId);
    if (!category) return reply.code(404).send({ message: "Category not found" });
    await category.deleteOne();
    return reply.code(204).send();
  });

  fastify.get("/admin/categories/:categoryId/products", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { categoryId } = request.params;
    if (!isObjectIdLike(categoryId)) return reply.code(400).send({ message: "Invalid category id" });

    const search = String(request.query?.search || "").trim().slice(0, 80);
    const assigned = String(request.query?.assigned || "all");
    const filter = {};

    if (search) {
      const safeSearch = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { name: safeSearch },
        { brand: safeSearch },
        { subCategory: safeSearch },
        { description: safeSearch },
      ];
    }

    const categoryFilter = {
      $or: [
        { category: categoryId },
        { categories: categoryId },
      ],
    };

    if (assigned === "yes") {
      filter.$and = [categoryFilter];
    } else if (assigned === "no") {
      filter.$and = [
        {
          $nor: [
            { category: categoryId },
            { categories: categoryId },
          ],
        },
      ];
    }

    const products = await Models.Product.find(filter)
      .sort({ name: 1 })
      .limit(80)
      .populate(["category", "categories"])
      .lean();

    return {
      products: products.map(product => ({
        ...toProductDto(product),
        isAssignedToCategory:
          String(product.category?._id || product.category) === categoryId
          || (Array.isArray(product.categories) && product.categories.some(category => String(category?._id || category) === categoryId)),
      })),
    };
  });

  fastify.patch("/admin/categories/:categoryId/products", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { categoryId } = request.params;
    if (!isObjectIdLike(categoryId)) return reply.code(400).send({ message: "Invalid category id" });

    const productIds = [...new Set(
      (Array.isArray(request.body?.productIds) ? request.body.productIds : [])
        .map(value => String(value || "").trim())
        .filter(isObjectIdLike),
    )];
    const action = request.body?.action === "remove" ? "remove" : "add";

    if (!productIds.length) return reply.code(400).send({ message: "Select at least one product" });

    if (action === "add") {
      await Models.Product.updateMany(
        { _id: { $in: productIds } },
        { $addToSet: { categories: categoryId } },
      );
    } else {
      await Models.Product.updateMany(
        { _id: { $in: productIds }, category: { $ne: categoryId } },
        { $pull: { categories: categoryId } },
      );
    }

    return { count: productIds.length, action };
  });

  fastify.get("/admin/products", { preHandler: [requireAdminToken] }, async request => {
    const { page, limit, search, categoryId, availability } = normalizeProductListQuery(request.query);
    const filter = {};

    if (search) {
      const safeSearch = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { name: safeSearch },
        { brand: safeSearch },
        { subCategory: safeSearch },
        { description: safeSearch },
      ];
    }

    if (categoryId) {
      filter.$or = [
        { category: categoryId },
        { categories: categoryId },
      ];
    }

    if (request.admin.role !== "super_admin" && availability !== "all") {
      const vendorProducts = await Models.VendorProduct.find({
        vendor: request.admin.vendorId,
        isAvailable: availability === "available",
      }).select("product").lean();
      filter._id = { $in: vendorProducts.map(vendorProduct => vendorProduct.product) };
    }

    const total = await Models.Product.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);
    const products = await Models.Product.find(filter)
      .sort({ createdAt: -1, name: 1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .populate(["category", "categories"])
      .lean();

    if (request.admin.role !== "super_admin") {
      const vendorProducts = await Models.VendorProduct.find({
        vendor: request.admin.vendorId,
        product: { $in: products.map(product => product._id) },
      }).lean();
      const vendorProductByProduct = new Map(
        vendorProducts.map(vendorProduct => [String(vendorProduct.product), vendorProduct]),
      );

      return {
        products: products.map(product =>
          toVendorCatalogProductDto(product, vendorProductByProduct.get(String(product._id))),
        ),
        pagination: { page: safePage, limit, total, totalPages },
      };
    }

    return { products: products.map(toProductDto), pagination: { page: safePage, limit, total, totalPages } };
  });

  fastify.post("/admin/products", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const payload = {
      name: String(request.body?.name || "").trim(),
      brand: String(request.body?.brand || "").trim(),
      description: String(request.body?.description || "").trim(),
      subCategory: String(request.body?.subCategory || "").trim(),
      breadcrumbs: String(request.body?.breadcrumbs || "").trim(),
      image: String(request.body?.image || "").trim(),
      price: Number(request.body?.price),
      discountPrice: request.body?.discountPrice === "" || request.body?.discountPrice == null
        ? undefined
        : Number(request.body.discountPrice),
      quantity: String(request.body?.quantity || "").trim(),
      category: String(request.body?.categoryId || "").trim(),
    };
    const categoryIds = [
      ...new Set(
        (Array.isArray(request.body?.categoryIds) ? request.body.categoryIds : [request.body?.categoryId])
          .map(value => String(value || "").trim())
          .filter(isObjectIdLike),
      ),
    ];
    if (!payload.category && categoryIds.length) payload.category = categoryIds[0];
    payload.categories = categoryIds.length ? categoryIds : [payload.category].filter(Boolean);

    if (!payload.name || !payload.quantity || !payload.category) {
      return reply.code(400).send({ message: "Name, quantity and category are required" });
    }

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return reply.code(400).send({ message: "Valid price is required" });
    }

    const product = await Models.Product.create(payload);
    await product.populate(["category", "categories"]);
    return { product: toProductDto(product) };
  });

  fastify.post("/admin/products/upload-image", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const parts = request.parts();
    let productFile = null;

    for await (const part of parts) {
      if (part.type === "file") productFile = part;
    }

    if (!productFile) return reply.code(400).send({ message: "Product image is required" });
    if (!isAllowedImageFile(productFile)) {
      return reply.code(400).send({ message: "Only JPEG, PNG and WebP images are allowed" });
    }

    const result = await uploadProductFile(productFile);
    const imageKey = `${result.public_id}.${result.format}`;
    return {
      imageKey,
      image: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encodeCloudinaryKey(imageKey)}`,
    };
  });

  fastify.post("/admin/products/bulk", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const rows = Array.isArray(request.body?.products) ? request.body.products : [];
    if (!rows.length || rows.length > 500) {
      return reply.code(400).send({ message: "Provide 1 to 500 products" });
    }

    const normalizedRows = rows.map(normalizeProductImportRow);
    const categoryNames = [
      ...new Set(normalizedRows.map(row => row.categoryName).filter(Boolean)),
    ];

    const existingCategories = await Models.Category.find({
      name: { $in: categoryNames.map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) },
    });
    const categoriesByName = new Map(
      existingCategories.map(category => [normalizeDuplicateKey(category.name), category]),
    );

    for (const categoryName of categoryNames) {
      const key = normalizeDuplicateKey(categoryName);
      if (!categoriesByName.has(key)) {
        const category = await Models.Category.create({ name: categoryName, image: "" });
        categoriesByName.set(key, category);
      }
    }

    const docs = normalizedRows.map(row => ({
      name: row.name,
      brand: row.brand,
      description: row.description,
      subCategory: row.subCategory,
      breadcrumbs: row.breadcrumbs,
      source: request.body?.source ? String(request.body.source) : "bulk_import",
      sourceId: row.sourceId,
      image: row.image,
      price: row.price,
      discountPrice: Number.isFinite(row.discountPrice) ? row.discountPrice : undefined,
      quantity: row.quantity,
      category: row.categoryId || categoriesByName.get(normalizeDuplicateKey(row.categoryName))?._id,
    }));
    for (const doc of docs) {
      doc.categories = [doc.category].filter(Boolean);
    }

    if (docs.some(doc => !doc.name || !doc.quantity || !doc.category || !Number.isFinite(doc.price))) {
      return reply.code(400).send({ message: "Every row needs name, price, quantity and category/categoryId" });
    }

    const existingProducts = await Models.Product.find({
      name: { $in: docs.map(doc => doc.name) },
    }).select("name brand quantity");
    const existingKeys = new Set(existingProducts.map(product =>
      [
        normalizeDuplicateKey(product.name),
        normalizeDuplicateKey(product.brand),
        normalizeDuplicateKey(product.quantity),
      ].join("|"),
    ));

    const seenKeys = new Set();
    const uniqueDocs = docs.filter(doc => {
      const key = [
        normalizeDuplicateKey(doc.name),
        normalizeDuplicateKey(doc.brand),
        normalizeDuplicateKey(doc.quantity),
      ].join("|");
      if (existingKeys.has(key) || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    const products = uniqueDocs.length
      ? await Models.Product.insertMany(uniqueDocs, { ordered: false })
      : [];
    return { count: products.length, skipped: docs.length - products.length };
  });

  fastify.get("/admin/kaggle/search", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const auth = getKaggleAuthHeader();
    if (!auth) return reply.code(400).send({ message: "Kaggle credentials are not configured" });

    const search = String(request.query?.q || "").trim();
    if (!search) return reply.code(400).send({ message: "Search query is required" });

    const response = await fetch(`https://www.kaggle.com/api/v1/datasets/list?search=${encodeURIComponent(search)}&page=1`, {
      headers: { Authorization: auth },
    });

    if (!response.ok) {
      return reply.code(response.status).send({ message: "Kaggle search failed" });
    }

    const datasets = await response.json();

    return {
      datasets: datasets.slice(0, 10).map(dataset => ({
        ref: dataset.ref,
        title: dataset.title,
        subtitle: dataset.subtitle,
        size: dataset.size,
        lastUpdated: dataset.lastUpdated,
        downloadCount: dataset.downloadCount,
      })),
    };
  });

  fastify.get("/admin/kaggle/files", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const auth = getKaggleAuthHeader();
    if (!auth) return reply.code(400).send({ message: "Kaggle credentials are not configured" });

    const dataset = String(request.query?.dataset || "").trim();
    if (!/^[^/]+\/[^/]+$/.test(dataset)) {
      return reply.code(400).send({ message: "Dataset must look like owner/dataset-slug" });
    }

    const response = await fetch(`https://www.kaggle.com/api/v1/datasets/list/${dataset}`, {
      headers: { Authorization: auth },
    });

    if (!response.ok) {
      return reply.code(response.status).send({ message: "Kaggle file list failed" });
    }

    const details = await response.json();
    const files = (details.datasetFiles || [])
      .map(file => file.nameNullable || file.name)
      .filter(Boolean);

    return { files };
  });

  fastify.get("/admin/kaggle/preview", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const auth = getKaggleAuthHeader();
    if (!auth) return reply.code(400).send({ message: "Kaggle credentials are not configured" });

    const dataset = String(request.query?.dataset || "").trim();
    const file = String(request.query?.file || "").trim();
    const limit = Number(request.query?.limit || 20);

    if (!/^[^/]+\/[^/]+$/.test(dataset)) {
      return reply.code(400).send({ message: "Dataset must look like owner/dataset-slug" });
    }

    if (!file || !file.toLowerCase().endsWith(".csv")) {
      return reply.code(400).send({ message: "CSV file name is required, for example products.csv" });
    }

    const [owner, slug] = dataset.split("/");
    const response = await fetch(
      `https://www.kaggle.com/api/v1/datasets/download/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,
      { headers: { Authorization: auth } },
    );

    if (!response.ok) {
      return reply.code(response.status).send({ message: "Kaggle dataset download failed. Check dataset slug." });
    }

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const csvEntry = entries.find(entry => entry.entryName === file)
      || entries.find(entry => entry.entryName.toLowerCase() === file.toLowerCase())
      || entries.find(entry => entry.entryName.toLowerCase().endsWith(`/${file.toLowerCase()}`));

    if (!csvEntry) {
      const csvFiles = entries
        .map(entry => entry.entryName)
        .filter(name => name.toLowerCase().endsWith(".csv"));
      return reply.code(404).send({
        message: "CSV file not found in Kaggle dataset ZIP",
        files: csvFiles,
      });
    }

    const csvText = csvEntry.getData().toString("utf8");
    const preview = parseCsvPreview(csvText, limit);

    return {
      dataset,
      file: csvEntry.entryName,
      ...preview,
    };
  });

  fastify.put("/admin/products/:productId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const product = await Models.Product.findById(request.params.productId);

    if (!product) {
      return reply.code(404).send({ message: "Product not found" });
    }

    for (const field of ["name", "brand", "description", "subCategory", "breadcrumbs", "image", "quantity"]) {
      if (request.body?.[field] !== undefined) product[field] = String(request.body[field] || "").trim();
    }
    if (request.body?.categoryIds !== undefined || request.body?.categoryId !== undefined) {
      const categoryIds = [
        ...new Set(
          (Array.isArray(request.body?.categoryIds) ? request.body.categoryIds : [request.body?.categoryId])
            .map(value => String(value || "").trim())
            .filter(isObjectIdLike),
        ),
      ];
      if (!categoryIds.length) {
        return reply.code(400).send({ message: "Select at least one category" });
      }
      product.category = categoryIds[0];
      product.categories = categoryIds;
    }
    if (request.body?.price !== undefined) product.price = Number(request.body.price);
    if (request.body?.discountPrice !== undefined) {
      product.discountPrice = request.body.discountPrice === "" || request.body.discountPrice == null
        ? undefined
        : Number(request.body.discountPrice);
    }

    await product.save();
    await product.populate(["category", "categories"]);
    return { product: toProductDto(product) };
  });

  fastify.delete("/admin/products/:productId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const product = await Models.Product.findById(request.params.productId);
    if (!product) return reply.code(404).send({ message: "Product not found" });
    await Models.VendorProduct.deleteMany({ product: product._id });
    await product.deleteOne();
    return reply.code(204).send();
  });

  fastify.patch("/admin/vendor-products/:productId", { preHandler: [requireAdminToken] }, async (request, reply) => {
    if (request.admin.role === "super_admin") {
      return reply.code(403).send({ message: "Vendor product settings are managed by vendor accounts" });
    }

    const product = await Models.Product.findById(request.params.productId).populate("category");
    if (!product) return reply.code(404).send({ message: "Master product not found" });

    let branchId = String(request.body?.branchId || "");
    if (!branchId) {
      const branch = await Models.Branch.findOne({ vendor: request.admin.vendorId, isActive: true }).sort({ createdAt: 1 });
      branchId = branch?._id ? String(branch._id) : "";
    }

    const branch = await ensureVendorScopedBranch(branchId, request.admin.vendorId);
    if (!branch) return reply.code(400).send({ message: "Valid vendor branch is required" });

    const update = {
      price: request.body?.price === "" || request.body?.price == null
        ? product.price
        : Number(request.body.price),
      discountPrice: request.body?.discountPrice === "" || request.body?.discountPrice == null
        ? undefined
        : Number(request.body.discountPrice),
      stock: Number(request.body?.stock ?? 0),
      isAvailable: Boolean(request.body?.isAvailable),
      branch: branch._id,
    };

    if (!Number.isFinite(update.price) || update.price < 0) {
      return reply.code(400).send({ message: "Valid price is required" });
    }

    if (!Number.isInteger(update.stock) || update.stock < 0) {
      return reply.code(400).send({ message: "Valid stock is required" });
    }

    const vendorProduct = await Models.VendorProduct.findOneAndUpdate(
      { vendor: request.admin.vendorId, product: product._id, branch: branch._id },
      { $set: update },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    return { product: toVendorCatalogProductDto(product, vendorProduct) };
  });

  fastify.get("/admin/branches", { preHandler: [requireAdminToken] }, async request => {
    const branches = await Models.Branch.find(getVendorFilter(request))
      .sort({ name: 1 })
      .populate("vendor")
      .lean();
    return { branches: branches.map(toBranchDto) };
  });

  fastify.post("/admin/branches", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const payload = normalizeBranchPayload(request.body);
    const vendorId = request.admin.role === "super_admin" ? payload.vendor : request.admin.vendorId;

    if (!payload.name) return reply.code(400).send({ message: "Branch name is required" });
    if (!vendorId) return reply.code(400).send({ message: "Vendor is required" });
    if (payload.location.latitude == null || payload.location.longitude == null) {
      return reply.code(400).send({ message: "Branch latitude and longitude are required" });
    }

    const branch = await Models.Branch.create({ ...payload, vendor: vendorId });
    await branch.populate("vendor");
    return { branch: toBranchDto(branch) };
  });

  fastify.put("/admin/branches/:branchId", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const branch = await Models.Branch.findOne({ _id: request.params.branchId, ...getVendorFilter(request) });
    if (!branch) return reply.code(404).send({ message: "Branch not found" });
    const payload = normalizeBranchPayload(request.body);

    branch.name = payload.name || branch.name;
    branch.address = payload.address;
    branch.location = payload.location;
    branch.deliveryRadiusKm = payload.deliveryRadiusKm;
    branch.isActive = payload.isActive;
    branch.deliveryCharge = payload.deliveryCharge;
    branch.handlingCharge = payload.handlingCharge;
    branch.surgeCharge = payload.surgeCharge;
    branch.surgeEnabled = payload.surgeEnabled;
    branch.freeDeliveryThreshold = payload.freeDeliveryThreshold;
    if (request.admin.role === "super_admin" && payload.vendor) branch.vendor = payload.vendor;

    await branch.save();
    await branch.populate("vendor");
    return { branch: toBranchDto(branch) };
  });

  fastify.delete("/admin/branches/:branchId", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const branch = await Models.Branch.findOne({ _id: request.params.branchId, ...getVendorFilter(request) });
    if (!branch) return reply.code(404).send({ message: "Branch not found" });
    const hasOrders = await Models.Order.exists({ branch: branch._id });
    if (hasOrders) return reply.code(400).send({ message: "Branch has orders; deactivate it instead" });
    await Models.DeliveryPartner.updateMany({ branch: branch._id }, { $unset: { branch: "" } });
    await branch.deleteOne();
    return reply.code(204).send();
  });

  fastify.get("/admin/delivery-partners", { preHandler: [requireAdminToken] }, async request => {
    const partners = await Models.DeliveryPartner.find(getVendorFilter(request))
      .sort({ createdAt: -1, name: 1 })
      .populate("branch")
      .lean();
    return { deliveryPartners: partners.map(toDeliveryPartnerDto) };
  });

  fastify.post("/admin/delivery-partners", { preHandler: [requireAdminToken] }, async (request, reply) => {
    let vendorId = getRequiredVendorId(request, reply);
    if (vendorId === undefined) return;

    let branch = null;
    if (request.admin.role === "super_admin" && !vendorId) {
      branch = await Models.Branch.findById(request.body?.branchId);
      vendorId = branch?.vendor ? String(branch.vendor) : null;
    } else {
      branch = await ensureVendorScopedBranch(request.body?.branchId, vendorId);
    }

    if (!vendorId) return reply.code(400).send({ message: "Vendor is required" });
    if (!branch) return reply.code(400).send({ message: "Valid vendor branch is required" });

    const password = String(request.body?.password || "");
    if (password.length < 8) {
      return reply.code(400).send({ message: "Password must be at least 8 characters" });
    }

    try {
      const partner = await Models.DeliveryPartner.create({
        name: String(request.body?.name || "").trim(),
        email: String(request.body?.email || "").trim().toLowerCase(),
        phone: Number(request.body?.phone),
        password,
        address: String(request.body?.address || "").trim(),
        branch: branch._id,
        vendor: vendorId,
        isActivated: request.body?.isActivated === false ? false : true,
      });
      await partner.populate("branch");
      return { deliveryPartner: toDeliveryPartnerDto(partner) };
    } catch (error) {
      if (error.code === 11000) return reply.code(409).send({ message: "Delivery email already exists" });
      throw error;
    }
  });

  fastify.put("/admin/delivery-partners/:partnerId", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const partner = await Models.DeliveryPartner.findOne({ _id: request.params.partnerId, ...getVendorFilter(request) }).select("+password");
    if (!partner) return reply.code(404).send({ message: "Delivery partner not found" });

    const vendorId = request.admin.role === "super_admin" ? String(partner.vendor || request.body?.vendorId || "") : request.admin.vendorId;
    if (request.body?.branchId !== undefined) {
      const branch = await ensureVendorScopedBranch(request.body.branchId, vendorId);
      if (!branch) return reply.code(400).send({ message: "Valid vendor branch is required" });
      partner.branch = branch._id;
    }

    for (const field of ["name", "email", "address"]) {
      if (request.body?.[field] !== undefined) partner[field] = String(request.body[field] || "").trim();
    }
    if (request.body?.phone !== undefined) partner.phone = Number(request.body.phone);
    if (typeof request.body?.isActivated === "boolean") partner.isActivated = request.body.isActivated;
    if (request.body?.password) partner.password = String(request.body.password);

    await partner.save();
    await partner.populate("branch");
    return { deliveryPartner: toDeliveryPartnerDto(partner) };
  });

  fastify.delete("/admin/delivery-partners/:partnerId", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const partner = await Models.DeliveryPartner.findOne({ _id: request.params.partnerId, ...getVendorFilter(request) });
    if (!partner) return reply.code(404).send({ message: "Delivery partner not found" });
    await partner.deleteOne();
    return reply.code(204).send();
  });

  fastify.get("/admin/orders", { preHandler: [requireAdminToken] }, async request => {
    const query = { ...getVendorFilter(request) };
    if (request.query?.status) query.status = request.query.status;
    const orders = await Models.Order.find(query)
      .sort({ createdAt: -1 })
      .populate("customer branch items.item deliveryPartner")
      .limit(200)
      .lean();
    return { orders: orders.map(toOrderDto) };
  });

  fastify.patch("/admin/orders/:orderId/status", { preHandler: [requireAdminToken] }, async (request, reply) => {
    const allowed = ["available", "confirmed", "arriving", "delivered", "cancelled"];
    const status = String(request.body?.status || "");
    if (!allowed.includes(status)) return reply.code(400).send({ message: "Invalid status" });

    const order = await Models.Order.findOne({ _id: request.params.orderId, ...getVendorFilter(request) });
    if (!order) return reply.code(404).send({ message: "Order not found" });

    order.status = status;
    order.updatedAt = new Date();
    await order.save();
    await order.populate("customer branch items.item deliveryPartner");
    return { order: toOrderDto(order) };
  });

  fastify.get("/admin/customers", { preHandler: [requireAdminToken, requireSuperAdmin] }, async request => {
    const search = String(request.query?.search || "").trim();
    const query = search
      ? {
          $or: [
            { name: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
            ...(Number.isFinite(Number(search)) ? [{ phone: Number(search) }] : []),
          ],
        }
      : {};
    const customers = await Models.Customer.find(query).sort({ createdAt: -1, name: 1 }).limit(300).lean();
    return { customers: customers.map(toCustomerDto) };
  });

  fastify.patch("/admin/customers/:customerId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const update = {};
    for (const field of ["name", "email", "address"]) {
      if (request.body?.[field] !== undefined) update[field] = String(request.body[field] || "").trim();
    }
    if (request.body?.phone !== undefined) update.phone = Number(request.body.phone);
    if (typeof request.body?.isActivated === "boolean") update.isActivated = request.body.isActivated;

    const customer = await Models.Customer.findByIdAndUpdate(
      request.params.customerId,
      { $set: update },
      { new: true, runValidators: true },
    ).lean();
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    return { customer: toCustomerDto(customer) };
  });

  fastify.get("/admin/payment-attempts", { preHandler: [requireAdminToken, requireSuperAdmin] }, async request => {
    const query = {};
    if (request.query?.status) query.status = request.query.status;
    const attempts = await Models.PaymentAttempt.find(query)
      .sort({ createdAt: -1 })
      .populate("customer branch order")
      .limit(300)
      .lean();
    return { paymentAttempts: attempts.map(toPaymentAttemptDto) };
  });

  fastify.post(
    "/admin/payment-attempts/:reference/refund",
    { preHandler: [requireAdminToken, requireSuperAdmin] },
    async (request, reply) => {
      return refund(request, reply);
    },
  );

  fastify.get("/admin/admin-users", { preHandler: [requireAdminToken, requireSuperAdmin] }, async () => {
    const users = await Models.AdminUser.find().sort({ createdAt: -1 }).populate("vendor branch").lean();
    return {
      adminUsers: users.map(user => ({
        ...toAdminUserDto(user),
        vendorName: user.vendor?.name || "",
        branchName: user.branch?.name || "",
        branchId: user.branch?._id ? String(user.branch._id) : "",
      })),
    };
  });

  fastify.post("/admin/admin-users", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const password = String(request.body?.password || "");
    if (password.length < 8) return reply.code(400).send({ message: "Password must be at least 8 characters" });
    try {
      const user = await Models.AdminUser.create({
        name: String(request.body?.name || "").trim(),
        email: String(request.body?.email || "").trim().toLowerCase(),
        password,
        role: request.body?.role || "vendor_staff",
        vendor: request.body?.vendorId || undefined,
        branch: request.body?.branchId || undefined,
        isActive: request.body?.isActive === false ? false : true,
      });
      return { adminUser: toAdminUserDto(user) };
    } catch (error) {
      if (error.code === 11000) return reply.code(409).send({ message: "Admin user email already exists" });
      throw error;
    }
  });

  fastify.put("/admin/admin-users/:adminUserId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const user = await Models.AdminUser.findById(request.params.adminUserId).select("+password");
    if (!user) return reply.code(404).send({ message: "Admin user not found" });
    for (const field of ["name", "email", "role"]) {
      if (request.body?.[field] !== undefined) user[field] = String(request.body[field] || "").trim();
    }
    if (request.body?.vendorId !== undefined) user.vendor = request.body.vendorId || undefined;
    if (request.body?.branchId !== undefined) user.branch = request.body.branchId || undefined;
    if (typeof request.body?.isActive === "boolean") user.isActive = request.body.isActive;
    if (request.body?.password) user.password = String(request.body.password);
    await user.save();
    return { adminUser: toAdminUserDto(user) };
  });

  fastify.delete("/admin/admin-users/:adminUserId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const user = await Models.AdminUser.findById(request.params.adminUserId);
    if (!user) return reply.code(404).send({ message: "Admin user not found" });
    await user.deleteOne();
    return reply.code(204).send();
  });

  fastify.get("/admin/themes", { preHandler: [requireAdminToken, requireSuperAdmin] }, async () => {
    const themes = await Models.Theme.find().sort({ isActive: -1, priority: -1, name: 1 }).lean();
    return { themes: themes.map(toThemeDto) };
  });

  fastify.post("/admin/themes", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const payload = normalizeThemePayload(request.body);

    if (!payload.name || !payload.slug) {
      return reply.code(400).send({ message: "Theme name and slug are required" });
    }

    try {
      const theme = await Models.Theme.create(payload);
      return { theme: toThemeDto(theme) };
    } catch (error) {
      if (error.code === 11000) {
        return reply.code(409).send({ message: "Theme slug already exists" });
      }
      throw error;
    }
  });

  fastify.put("/admin/themes/:themeId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { themeId } = request.params;
    const payload = normalizeThemePayload(request.body);

    if (payload.name === "" || payload.slug === "") {
      return reply.code(400).send({ message: "Theme name and slug are required" });
    }

    try {
      const theme = await Models.Theme.findByIdAndUpdate(
        themeId,
        { $set: payload },
        { new: true, runValidators: true },
      );

      if (!theme) {
        return reply.code(404).send({ message: "Theme not found" });
      }

      return { theme: toThemeDto(theme) };
    } catch (error) {
      if (error.code === 11000) {
        return reply.code(409).send({ message: "Theme slug already exists" });
      }
      throw error;
    }
  });

  fastify.post("/admin/themes/:themeId/activate", { preHandler: [requireAdminToken, requireSuperAdmin] }, async request => {
    const { themeId } = request.params;
    const theme = await Models.Theme.findById(themeId);

    if (!theme) {
      return { theme: null };
    }

    await Models.Theme.updateMany(
      { _id: { $ne: theme._id }, isActive: true },
      { $set: { isActive: false } },
    );

    theme.isActive = true;
    await theme.save();

    return { theme: toThemeDto(theme) };
  });

  fastify.delete("/admin/themes/:themeId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { themeId } = request.params;
    const theme = await Models.Theme.findById(themeId);

    if (!theme) {
      return reply.code(404).send({ message: "Theme not found" });
    }

    if (theme.isActive) {
      return reply.code(400).send({ message: "Active theme cannot be deleted" });
    }

    await theme.deleteOne();
    return reply.code(204).send();
  });


  fastify.get("/admin/banners", { preHandler: [requireAdminToken, requireSuperAdmin] }, async () => {
    const banners = await Models.Banner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    return { banners: banners.map(toBannerDto) };
  });

  fastify.post("/admin/banners", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const parts = request.parts();
    const payload = {};
    let bannerFile = null;

    for await (const part of parts) {
      if (part.type === "file") {
        bannerFile = part;
      } else {
        payload[part.fieldname] = part.value;
      }
    }

    const title = String(payload.title || "").trim();

    if (!title) {
      return reply.code(400).send({ message: "Banner title is required" });
    }

    if (!bannerFile) {
      return reply.code(400).send({ message: "Banner image is required" });
    }

    if (!isAllowedImageFile(bannerFile)) {
      return reply.code(400).send({ message: "Only JPEG, PNG and WebP images are allowed" });
    }

    const banner = await Models.Banner.create({
      title,
      sortOrder: Number(payload.sortOrder || 0),
      isActive: payload.isActive === "false" ? false : true,
      imageFilename: bannerFile.filename,
      imageMimeType: bannerFile.mimetype,
    });

    try {
      const result = await uploadBannerFile(bannerFile, banner._id);
      banner.imageKey = `${result.public_id}.${result.format}`;
      banner.imageSize = result.bytes;
      await banner.save();
      return { banner: toBannerDto(banner) };
    } catch (error) {
      await Models.Banner.deleteOne({ _id: banner._id });
      throw error;
    }
  });

  fastify.patch("/admin/banners/:bannerId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { bannerId } = request.params;
    const update = {};

    if (typeof request.body?.isActive === "boolean") {
      update.isActive = request.body.isActive;
    }

    if (Number.isFinite(Number(request.body?.sortOrder))) {
      update.sortOrder = Number(request.body.sortOrder);
    }

    if (typeof request.body?.title === "string" && request.body.title.trim()) {
      update.title = request.body.title.trim();
    }

    const banner = await Models.Banner.findByIdAndUpdate(bannerId, { $set: update }, { new: true }).lean();

    if (!banner) {
      return reply.code(404).send({ message: "Banner not found" });
    }

    return { banner: toBannerDto(banner) };
  });

  fastify.put("/admin/banners/:bannerId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { bannerId } = request.params;
    const banner = await Models.Banner.findById(bannerId);

    if (!banner) {
      return reply.code(404).send({ message: "Banner not found" });
    }

    const parts = request.parts();
    const payload = {};
    let bannerFile = null;

    for await (const part of parts) {
      if (part.type === "file") {
        bannerFile = part;
      } else {
        payload[part.fieldname] = part.value;
      }
    }

    if (typeof payload.title === "string" && payload.title.trim()) {
      banner.title = payload.title.trim();
    }

    if (Number.isFinite(Number(payload.sortOrder))) {
      banner.sortOrder = Number(payload.sortOrder);
    }

    if (typeof payload.isActive === "string") {
      banner.isActive = payload.isActive === "true";
    }

    if (bannerFile) {
      if (!isAllowedImageFile(bannerFile)) {
        return reply.code(400).send({ message: "Only JPEG, PNG and WebP images are allowed" });
      }

      await deleteBannerFile(banner.imageKey);
      const result = await uploadBannerFile(bannerFile, banner._id);
      banner.imageKey = `${result.public_id}.${result.format}`;
      banner.imageSize = result.bytes;
      banner.imageFilename = bannerFile.filename;
      banner.imageMimeType = bannerFile.mimetype;
    }

    await banner.save();
    return { banner: toBannerDto(banner) };
  });

  fastify.delete("/admin/banners/:bannerId", { preHandler: [requireAdminToken, requireSuperAdmin] }, async (request, reply) => {
    const { bannerId } = request.params;
    const banner = await Models.Banner.findById(bannerId);

    if (!banner) {
      return reply.code(404).send({ message: "Banner not found" });
    }

    await deleteBannerFile(banner.imageKey);
    await banner.deleteOne();
    return reply.code(204).send();
  });
};
