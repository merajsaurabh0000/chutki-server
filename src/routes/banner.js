import Banner from '../models/banner.js';
import { CLOUDINARY_CLOUD_NAME } from '../config/config.js';

// encodeURI escapes spaces while preserving Cloudinary public-ID separators
// and safe punctuation such as commas.
const encodeCloudinaryKey = (imageKey) => encodeURI(imageKey);

export const bannerRoutes = async (fastify) => {
  fastify.get('/banners', async (_request, reply) => {
    const banners = await Banner.find({
      isActive: true,
      imageKey: { $nin: [null, ''] },
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return reply.send({
      banners: banners.map((banner) => ({
        _id: banner._id,
        title: banner.title,
        image: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encodeCloudinaryKey(banner.imageKey)}`,
      })),
    });
  });
};
