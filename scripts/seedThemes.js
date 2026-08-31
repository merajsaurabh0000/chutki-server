import "dotenv/config";
import { connectDB } from "../src/config/connect.js";
import Theme from "../src/models/theme.js";

const themes = [
  {
    name: "Haritgraam Default",
    slug: "default",
    isActive: true,
    priority: 1,
    primaryColor: "#27baba",
    headerGradientStart: "#074c5d",
    headerGradientEnd: "#27baba",
    backgroundColor: "#f4fafb",
    stickySearchBackground: "#074c5d",
    sectionTitleColor: "#074c5d",
    categoryTileBackground: "#e3f6f7",
    productCardBackground: "#ffffff",
    productCardBorder: "#bcebec",
    productBadgeBackground: "#e6f8f5",
  },
  {
    name: "Green Fresh",
    slug: "green-fresh",
    isActive: false,
    priority: 5,
    primaryColor: "#10b981",
    headerGradientStart: "#0f9f5f",
    headerGradientEnd: "#10b981",
    backgroundColor: "#ffffff",
    stickySearchBackground: "#0f9f5f",
    sectionTitleColor: "#111827",
    categoryTileBackground: "#dcfce7",
    productCardBackground: "#ffffff",
    productCardBorder: "#e5e7eb",
    productBadgeBackground: "#f9fafb",
  },
  {
    name: "Monsoon",
    slug: "monsoon",
    isActive: false,
    priority: 10,
    primaryColor: "#0ea5e9",
    headerGradientStart: "#075985",
    headerGradientEnd: "#0ea5e9",
    backgroundColor: "#f0f9ff",
    stickySearchBackground: "#075985",
    sectionTitleColor: "#082f49",
    categoryTileBackground: "#dbeafe",
    productCardBackground: "#ffffff",
    productCardBorder: "#bae6fd",
    productBadgeBackground: "#e0f2fe",
  },
  {
    name: "Diwali",
    slug: "diwali",
    isActive: false,
    priority: 20,
    primaryColor: "#f97316",
    headerGradientStart: "#c2410c",
    headerGradientEnd: "#f59e0b",
    backgroundColor: "#fff7ed",
    stickySearchBackground: "#c2410c",
    sectionTitleColor: "#7c2d12",
    categoryTileBackground: "#ffedd5",
    productCardBackground: "#fffaf0",
    productCardBorder: "#fed7aa",
    productBadgeBackground: "#ffedd5",
  },
];

await connectDB(process.env.MONGO_URI);

for (const theme of themes) {
  await Theme.findOneAndUpdate(
    { slug: theme.slug },
    { $set: theme },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

console.log(`Seeded ${themes.length} themes`);
process.exit(0);
