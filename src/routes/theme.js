import Theme from "../models/theme.js";
import { toThemeDto } from "../utils/themeDto.js";

export const themeRoutes = async fastify => {
  fastify.get("/theme/active", async () => {
    const now = new Date();
    const theme = await Theme.findOne({
      isActive: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ priority: -1, updatedAt: -1 })
      .lean();

    return { theme: theme ? toThemeDto(theme) : null };
  });
};
