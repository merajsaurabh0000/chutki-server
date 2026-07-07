import AdminJS, { ComponentLoader } from "adminjs";
import uploadFeature from '@adminjs/upload';
import AdminJSFastify from "@adminjs/fastify";
import * as AdminJSMongoose from "@adminjs/mongoose";
import * as Models from "../models/index.js";
import { authenticate, COOKIE_PASSWORD, sessionStore } from "./config.js";
import { dark, light, noSidebar } from "@adminjs/themes";
import CloudinaryUploadProvider from './cloudinaryUploadProvider.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

AdminJS.registerAdapter(AdminJSMongoose)

const componentLoader = new ComponentLoader();
const bannerUploadProvider = new CloudinaryUploadProvider();
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dashboardComponent = componentLoader.add(
  'VillageFressDashboard',
  path.join(currentDirectory, '../components/dashboard.jsx'),
);

export const admin = new AdminJS({
    resources:[
        {
            resource: Models.Customer,
            options: {
              listProperties: ["name", "email", "phone", "role", "isActivated"],
              filterProperties: ["name", "email", "phone", "role", "isActivated"],
              showProperties: ["name", "email", "phone", "picture", "address", "role", "isActivated"],
              editProperties: ["name", "email", "phone", "address", "isActivated"],
            },
          },
          {
            resource: Models.DeliveryPartner,
            options: {
              listProperties: ["email", "role", "isActivated"],
              filterProperties: ["email", "role"],
              editProperties: ["email", "phone", "name", "password", "branch", "isActivated"],
              actions: {
                edit: {
                  before: async request => {
                    if (!request.payload?.password) {
                      if (request.payload) delete request.payload.password;
                    } else {
                      request.payload.password = await bcrypt.hash(request.payload.password, 12);
                    }
                    return request;
                  },
                },
              },
            },
          },
          {
            resource: Models.Admin,
            options: {
              listProperties: ["email", "role", "isActivated"],
              filterProperties: ["email", "role"],
              editProperties: ["email", "name", "isActivated"],
            },
          },
        { resource: Models.Branch },
        { resource: Models.Product },
        { resource: Models.Category },
        {
          resource: Models.PaymentAttempt,
          options: {
            navigation: { name: 'Payments', icon: 'CreditCard' },
            listProperties: ['razorpayOrderId', 'customer', 'branch', 'totalPrice', 'status', 'order', 'createdAt'],
            filterProperties: ['razorpayOrderId', 'razorpayPaymentId', 'customer', 'branch', 'status', 'createdAt'],
            showProperties: ['razorpayOrderId', 'razorpayPaymentId', 'customer', 'branch', 'items', 'itemTotal', 'deliveryCharge', 'handlingCharge', 'surgeCharge', 'totalPrice', 'currency', 'status', 'order', 'expiresAt', 'refundId', 'refundedAt', 'createdAt', 'updatedAt'],
            actions: {
              new: { isAccessible: false },
              edit: { isAccessible: false },
              delete: { isAccessible: false },
              bulkDelete: { isAccessible: false },
            },
          },
        },
        { resource: Models.Order },
        { resource: Models.Counter },
        {
          resource: Models.Banner,
          options: {
            navigation: { name: 'Store Content', icon: 'Image' },
            listProperties: ['title', 'imageKey', 'isActive', 'sortOrder'],
            editProperties: ['title', 'bannerFile', 'isActive', 'sortOrder'],
          },
          features: [uploadFeature({
            componentLoader,
            provider: bannerUploadProvider,
            properties: {
              key: 'imageKey',
              file: 'bannerFile',
              filePath: 'bannerFilePath',
              mimeType: 'imageMimeType',
              size: 'imageSize',
              filename: 'imageFilename',
            },
            uploadPath: (record, filename) =>
              `banners/${record.id()}/banner${path.extname(filename).toLowerCase()}`,
            validation: {
              mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
              maxSize: 5 * 1024 * 1024,
            },
          })],
        },
    ],
    componentLoader,
    dashboard: {
      component: dashboardComponent,
      handler: async () => {
        const [orders, customers, products, banners, revenue] = await Promise.all([
          Models.Order.countDocuments(),
          Models.Customer.countDocuments(),
          Models.Product.countDocuments(),
          Models.Banner.countDocuments({ isActive: true }),
          Models.Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPrice', 0] } } } },
          ]),
        ]);

        return {
          orders,
          customers,
          products,
          banners,
          revenue: revenue[0]?.total ?? 0,
        };
      },
    },
    branding: {
        companyName: " Chutki — Groceries in a Snap",
        withMadeWithLove: false,
    },
    defaultTheme:dark.id,
    availableThemes: [dark,light,noSidebar],
    rootPath:'/admin'
})

export const buildAdminRouter = async(app)=>{
    app.addHook('preHandler', async (request) => {
      if (!request.body || typeof request.body !== 'object') return;

      for (const field of Object.values(request.body)) {
        if (field?.type === 'file' && field.file && field._buf) {
          field.file.uploadBuffer = field._buf;
        }
      }
    });

    if (process.env.NODE_ENV === 'production') {
      await admin.initialize();
    } else {
      await admin.watch();
    }

    await AdminJSFastify.buildAuthenticatedRouter(
        admin,
        {
            authenticate,
            cookiePassword:COOKIE_PASSWORD,
            cookieName:'adminjs'
        },
        app,
        {
            store:sessionStore,
            saveUnintialized: true,
            secret: COOKIE_PASSWORD,
            cookie: {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 8 * 60 * 60 * 1000,
            },
        }
    )
}
