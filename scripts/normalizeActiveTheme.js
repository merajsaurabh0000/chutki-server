import "dotenv/config";
import { connectDB } from "../src/config/connect.js";
import Theme from "../src/models/theme.js";

await connectDB(process.env.MONGO_URI);

const activeThemes = await Theme.find({ isActive: true })
  .sort({ priority: -1, updatedAt: -1 })
  .lean();

if (activeThemes.length <= 1) {
  console.log(`Active theme count is already ${activeThemes.length}`);
  process.exit(0);
}

const keepActiveTheme = activeThemes[0];
await Theme.updateMany(
  {
    isActive: true,
    _id: { $ne: keepActiveTheme._id },
  },
  { $set: { isActive: false } },
);

console.log(
  `Kept "${keepActiveTheme.name}" active and disabled ${activeThemes.length - 1} other active theme(s)`,
);
process.exit(0);
